# Supabase — schéma et politiques

Ce dossier contient **tout ce qui protège les données**. L'application mobile
embarque une clé publique, extractible d'un APK par n'importe qui : le code
client ne peut donc pas être une barrière de sécurité. La seule barrière, ce
sont les politiques Row Level Security écrites ici.

```
supabase/
├── migrations/
│   ├── 20260916120000_init.sql       Schéma, déclencheurs, RLS
│   └── 20260919120000_rubriques.sql  Agenda, documents, sondages, messages
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

Coller le contenu de chaque fichier de `migrations/` dans l'éditeur SQL du tableau
de bord Supabase, **dans l'ordre des noms**, puis exécuter. Une seule fois chacun.

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

### Réglages du tableau de bord pour les liens envoyés par e-mail

Le schéma et les politiques ne suffisent pas : la réinitialisation de mot de passe
et la confirmation d'inscription demandent aussi que Supabase accepte de renvoyer
l'adhérent vers l'application.

- **Authentication > URL Configuration > Redirect URLs** : ajouter
  `fcpefl://reinitialisation` **et** `fcpefl://confirmation`. Une entrée
  manquante ne produit aucune erreur visible : l'adhérent reçoit l'e-mail, le
  lien s'ouvre, mais hors de l'application.
- **Authentication > SMTP Settings** : un serveur d'envoi. Le service fourni par
  défaut est limité à deux e-mails par heure, et rien ne le signale.
- **Authentication > Providers > Email > Confirm email** : activé.
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
| `agenda_events` | tout membre connecté | administrateurs |
| `documents` | tout membre connecté | administrateurs |
| `sondages` | tout membre connecté | administrateurs |
| `sondage_choices` | tout membre connecté | administrateurs |
| `sondage_votes` | le sien, ou tous si administrateur | le sien uniquement |
| `messages` | les siens, ou tous si administrateur | les siens ; seul un administrateur peut les modifier |

Le **compartiment de stockage** `documents` n'apparaît pas dans ce tableau : ses
politiques se règlent dans le tableau de bord (Storage > Policies), pas en SQL ici.
La marche à suivre est au [`README.md`](../README.md) principal, §4.

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

Les fichiers SQL sont analysés par le véritable analyseur PostgreSQL, sans
instance locale :

```bash
npm run sql:check
```

`scripts/check-sql.mjs` passe **chaque** fichier `.sql` du dossier des migrations,
dans l'ordre des noms, puis `seed.sql`. Cet analyseur vérifie la syntaxe, pas la
sémantique : il ne dira pas si une colonne référencée existe. C'est ce que font
`scripts/check-schema-refs.test.mjs`, qui lit l'arbre des instructions, et
`scripts/check-migration-applicable.test.mjs`, qui exécute la migration contre un
vrai PostgreSQL. `npx supabase db reset` reste la vérification de bout en bout,
et elle exige Docker.

## RGPD

L'effacement en cascade est le mécanisme RGPD du projet : supprimer un compte
efface les données personnelles de l'adhérent, sans intervention manuelle table
par table. **La liste exacte des tables concernées, et celle des quatre tables de
contenu collectif qui y échappent, sont énoncées dans
[`SECURITY.md`](../SECURITY.md)** — à un seul endroit, parce que c'est une
promesse faite aux adhérents et qu'un banc la vérifie mot pour mot contre le
schéma. La recopier ici en ferait une seconde copie que rien ne relirait.

Les signalements peuvent contenir des éléments concernant un enfant nommément :
ils ne sont lisibles que par leur auteur et par le bureau, jamais par l'ensemble
des adhérents.
