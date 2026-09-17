# Supabase — schéma et politiques

Ce dossier contient **tout ce qui protège les données**. L'application mobile
embarque une clé publique, extractible d'un APK par n'importe qui : le code
client ne peut donc pas être une barrière de sécurité. La seule barrière, ce
sont les politiques Row Level Security écrites ici.

```
supabase/
├── migrations/
│   └── 20260916120000_init.sql   Schéma, déclencheurs, RLS
├── seed.sql                      Jeu d'essai — développement uniquement
└── README.md
```

## Appliquer les migrations

### Avec la CLI Supabase

```bash
npx supabase login
npx supabase link --project-ref <référence-du-projet>
npx supabase db push
```

`db push` applique les migrations absentes du projet distant, dans l'ordre des
noms de fichiers, chacune dans une transaction. Le préfixe `AAAAMMJJHHMMSS` des
noms de fichiers **est** l'ordre d'application : une migration ajoutée plus tard
doit porter un horodatage plus grand.

### Sans CLI

Coller le contenu de `migrations/20260916120000_init.sql` dans l'éditeur SQL du
tableau de bord Supabase, puis exécuter. Une seule fois.

## Après l'installation

Créez votre compte depuis l'application (onglet « Créer un compte »), puis
promouvez-le administrateur :

```sql
begin;

--  Le déclencheur refuse toute modification de `role` à qui n'est pas déjà
--  administrateur, et `is_admin()` lit `auth.uid()` — NULL hors d'une requête
--  authentifiée. Sans cette parenthèse, la commande échoue dans l'éditeur SQL
--  sur « Seul un administrateur peut modifier le rôle d'un membre ».
alter table public.profiles disable trigger profiles_prevent_role_change;

update public.profiles
   set role = 'admin'
  from auth.users
 where auth.users.id = public.profiles.id
   and auth.users.email = 'votre.adresse@exemple.fr';

--  À ne pas oublier : sans cette ligne, le verrou reste ouvert.
alter table public.profiles enable trigger profiles_prevent_role_change;

commit;
```

L'adresse est lue dans `auth.users`, qui en est la seule source : `profiles` ne
la stocke pas, pour ne pas exposer l'ensemble des adresses des adhérents à tous
les membres — sa politique de lecture est ouverte à tout porteur d'un jeton.

Cette promotion ne peut pas se faire depuis l'application : le déclencheur
`prevent_role_change` l'interdit précisément pour qu'un membre ne puisse pas
s'octroyer des droits. Il l'interdit aussi à cette commande, tant qu'elle n'est
pas prise entre les deux `alter table` — et la transaction garantit qu'un échec
de la mise à jour ne laisse pas le verrou désactivé.

### Réglage du tableau de bord pour la réinitialisation de mot de passe

Le schéma et les politiques ne suffisent pas : la réinitialisation demande aussi
que Supabase accepte de renvoyer l'adhérent vers l'application.

- **Authentication > URL Configuration > Redirect URLs** : ajouter
  `fcpefl://reinitialisation`.
- **Authentication > Email Templates > Reset password** : le lien doit rester
  `{{ .ConfirmationURL }}`.

La marche à suivre complète, et ce qui se passe ensuite côté application, sont
décrits dans le [`README.md`](../README.md) principal (§4) — pas ici, pour que
cette liste de réglages n'existe qu'à un seul endroit.

## Ce que font les politiques

| Table | Lire | Écrire |
| --- | --- | --- |
| `profiles` | tout membre connecté | sa propre ligne ; `role` réservé aux administrateurs |
| `annonces` | tout membre connecté | administrateurs |
| `cantine_menus` | tout membre connecté | administrateurs |
| `cantine_reservations` | la sienne, ou toutes si administrateur | la sienne uniquement |
| `signalements` | les siens, ou tous si administrateur | les siens ; le `status` est réservé aux administrateurs |
| `discussion_messages` | tout membre connecté | publier en son nom ; supprimer le sien, ou n'importe lequel si administrateur |

Trois points méritent d'être connus avant de modifier ce fichier :

**`authenticated` ne veut pas dire « adhérent vérifié ».** C'est « porteur d'un
jeton de session valide ». Une politique `to authenticated` ouvre donc la table à
quiconque a créé un compte — ce qui est le cas de toute personne disposant de
l'application, l'inscription étant libre. Pour restreindre aux membres validés
par le bureau, il faudrait ajouter une colonne `validated_at` et la tester dans
chaque politique.

**`security definer` doit toujours venir avec `set search_path = ''`.** Les
fonctions `is_admin`, `handle_new_user` et les deux verrous de cohérence
s'exécutent avec les droits du propriétaire. Sans `search_path` figé, un schéma
placé plus haut dans le chemin de recherche de l'appelant pourrait redéfinir
`profiles` et détourner la fonction.

**Un oubli de politique ferme, il n'ouvre pas.** RLS est activée sur toutes les
tables et il n'existe aucune politique permissive par défaut : une table sans
politique est inaccessible, pas ouverte. C'est le sens de l'erreur souhaitable —
la fonctionnalité casse visiblement, au lieu de fuir silencieusement.

## Vérifier la syntaxe sans base de données

Le fichier SQL peut être analysé par le véritable analyseur PostgreSQL, sans
instance locale :

```bash
npm install --no-save libpg-query
node -e "
  const { parse } = require('libpg-query');
  const sql = require('node:fs').readFileSync('supabase/migrations/20260916120000_init.sql', 'utf8');
  parse(sql).then((t) => console.log('OK —', t.stmts.length, 'instructions'));
"
```

Cet analyseur vérifie la syntaxe, pas la sémantique : il ne dira pas si une
colonne référencée existe. La vérification complète passe par
`npx supabase db reset`, qui exige Docker.

## RGPD

`profiles.id` référence `auth.users` avec `on delete cascade` : supprimer un
compte supprime son profil, ses réservations, ses signalements et ses messages.
C'est le comportement attendu pour une demande d'effacement — et il est
volontairement automatique, pour qu'aucune suppression manuelle ne soit
nécessaire.

Les signalements peuvent contenir des éléments concernant un enfant nommément :
ils ne sont lisibles que par leur auteur et par le bureau, jamais par l'ensemble
des adhérents.
