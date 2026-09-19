# Mise en service — le guide, étape par étape

> **En résumé.** Les étapes 1 à 4 sont faites : Supabase répond, le projet Expo est
> créé, le jeton est posé, et **les e-mails partent** — vérifié jusqu'au clic sur le
> lien reçu. **Les deux binaires se recompilent** — l'APK Android et l'IPA non signé.
> Ce qui reste tient en deux gestes : les quatre réglages du tableau de bord, et
> installer l'application sur un téléphone.
>
> **Un binaire ne vaut que pour le commit dont il est né.** Ceux que je vous avais
> envoyés dataient d'**avant la refonte visuelle** : 58 fichiers et 7 851 lignes les
> séparaient de l'application actuelle, et vous auriez installé l'ancienne. Rien ne
> le signalait — la phrase « les deux binaires sont livrés » était vraie le jour où
> je l'ai écrite, et elle a cessé de l'être au premier commit suivant. Les deux sont
> donc en cours de recompilation, et je vous donnerai les liens quand ils seront
> prêts. **La règle, pour la suite : toute modification dans `src/` périme les deux
> binaires.** Vérifiez toujours que la compilation est **postérieure** au dernier
> changement du code avant d'installer.

---

## La règle de partage

Je n'entre **jamais** un identifiant, un mot de passe ou une clé à votre place, et  
je ne crée pas de compte en votre nom. Ce n'est pas une limite technique : c'est  
que ces gestes engagent votre responsabilité. Le compte Supabase et le compte Expo  
doivent être les vôtres — sinon, le jour où il faut récupérer un accès ou fermer un  
service, c'est à moi qu'il faudrait demander, et je ne serai pas là.

**Vous créez les comptes. Je fais tout le reste.**

---

## Ce que vous faites, et ce que je fais ensuite

| #   | Vous                                                                                         | Durée   | Moi, dès réception                                              |
| --- | -------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------- |
| 1   | Un projet Supabase, les **trois** fichiers SQL collés, le compartiment créé, l'URL et la clé | ~15 min | `.env.local`, variables EAS                                     |
| 2   | Un compte Expo, et la connexion faite une fois                                               | ~5 min  | `eas init`, variables EAS, compilation de l'APK                 |
| 3   | Un jeton Expo pour GitHub _(facultatif)_                                                     | ~2 min  | le secret `EXPO_TOKEN`, qui réveille la compilation automatique |
| 4   | Recopier les quatre identifiants SMTP                                                        | ~5 min  | ✅ les e-mails partent, jusqu'au clic sur le lien               |
| 5   | Installer l'APK, ou signer l'IPA puis l'installer                                            | ~2 min  | les vérifications sur appareil réel                             |
| 6   | Les quatre réglages du tableau de bord                                                       | ~5 min  | le contrôle des quatre valeurs                                  |

**Où en est la mise en service : la « liste à cocher », plus bas, fait foi.** À ce  
jour, les étapes 2, 3 et 4 sont faites — les e-mails fonctionnent jusqu'au clic sur le  
lien reçu. De l'**étape 1**, il reste **trois gestes** : les deux fichiers SQL qui  
suivent le premier (§1.3) et le compartiment des documents avec ses deux politiques  
(§1.4). Viennent ensuite, dans cet ordre : installer l'application (§5), créer votre  
compte, **vous promouvoir administrateur** (§1.8 — une commande à coller, qui ne peut  
pas être la mienne), **accepter votre propre adhésion** (§1.9 — sans elle, la  
discussion vous répond une liste vide), puis les quatre réglages du tableau de bord  
(§6).

Les deux binaires, eux, sont à jour du code actuel : la page des versions nomme, pour  
chacun, le commit dont il est né. Un binaire antérieur à la refonte vous montrerait  
l'ancienne application — c'est pourquoi cette page porte cette ligne.

---

## Étape 1 — Supabase _(~15 min)_ — **presque faite : trois gestes restent** (§1.3, §1.4)

> **Faite, et vérifiée de l'extérieur le 18 septembre 2026** — pour les six tables de  
> la première migration. Le projet que vous avez créé répond, et ces six tables  
> **existent et refusent la clé publique** (`permission denied`). C'est exactement ce  
> que la migration doit produire : une table qui existe et qui est fermée.
>
> **Restent à faire depuis ce guide : les deux fichiers SQL suivants (§1.3) et le  
> compartiment des documents avec ses deux politiques de lecture (§1.4).** Les étapes  
> 2 et suivantes n'en dépendent pas : vous pouvez continuer sans attendre.

Supabase, c'est la base de données et le service d'authentification. Le forfait  
gratuit suffit.

> **Les libellés ci-dessous sont ceux du tableau de bord au 18 septembre 2026.** Ils  
> changent de temps en temps. Si vous ne trouvez pas un bouton, dites-le moi avec  
> ce que vous voyez à l'écran : je vous réoriente.

### 1.1 Créer le compte

1. Allez sur <https://supabase.com>
2. Cliquez **Start your project** (en haut à droite).
3. Inscrivez-vous avec GitHub, ou avec une adresse e-mail et un mot de passe.
   - Si vous choisissez l'e-mail : Supabase vous envoie un lien de confirmation.  
     Cliquez-le avant de continuer.

### 1.2 Créer le projet

1. Sur le tableau de bord, cliquez **New project**.
2. Si l'on vous demande de créer une **organisation** d'abord : donnez-lui un nom  
   quelconque, par exemple `FCPE Frères Lumières`. Le forfait gratuit suffit.
3. Remplissez le formulaire :

   | Champ                 | Valeur à mettre                                                  |
   | --------------------- | ---------------------------------------------------------------- |
   | **Name**              | `fcpe-freres-lumieres`                                           |
   | **Database Password** | cliquez **Generate a password**, puis **copiez-le quelque part** |
   | **Region**            | une région **européenne** (voir ci-dessous)                      |
   | **Plan**              | Free                                                             |

4. Pour la **région**, choisissez `West EU (Ireland)` ou `Central EU (Frankfurt)`.  
   Le règlement européen n'interdit pas un serveur américain, mais il en demande la  
   justification, et la latence double.
5. Cliquez **Create new project**, puis attendez **environ deux minutes** que le  
   projet soit prêt.

> **Le mot de passe de la base ne servira pas dans la suite.** Notez-le quand même :  
> il est **irrécupérable**, et c'est le seul moyen de secours si un jour il faut  
> accéder à la base directement.

### 1.3 Créer les quinze tables

Dans le menu de gauche, cliquez **SQL Editor**, puis **New query**.

Vous allez coller **quatre fichiers**, l'un après l'autre, dans cet ordre.

**Premier collage** — ouvrez ce fichier du projet et copiez tout son contenu :

```
supabase/migrations/20260916120000_init.sql
```

Collez-le dans l'éditeur, puis cliquez **Run** (ou `Ctrl`+`Entrée`).  
**Attendu : `Success. No rows returned`.**

**Deuxième collage** — les six tables des rubriques (agenda, documents,
sondages, messages au bureau) :

```
supabase/migrations/20260919120000_rubriques.sql
```

Même geste, même message attendu. Ce fichier **s'ajoute** au premier, il ne le
réécrit pas — mais il le **complète**, et c'est pourquoi l'ordre compte : il
ajoute une colonne à la table `annonces`, que le premier fichier crée. Collé
avant lui, il s'arrêterait sur `relation "public.annonces" does not exist`.

Ce qu'il ne fait pas : il ne réécrit pas la première migration, qui est **déjà
appliquée** sur votre base. C'est pour cela qu'il ajoute la colonne au lieu de
modifier le fichier d'origine. Et le recoller ne crée pas de doublon.

**Troisième collage** — l'ouverture aux familles : les conversations avec le
bureau, les sondages sans compte, les documents destinés aux familles :

```
supabase/migrations/20260920120000_acces_public.sql
```

Même geste, même message attendu. C'est le fichier qui fait fonctionner
l'application pour un parent **qui n'a pas de compte**. Il ajoute trois tables
(`conversations`, `conversation_messages`, `push_tokens`), une colonne à
`documents` et une à `profiles`, puis il **remplace** plusieurs politiques de
lecture. Il s'applique après les deux autres : collé en premier, il s'arrêterait
sur une table inexistante.

**Quatrième collage** — même chose avec :

```
supabase/seed.sql
```

**Attendu : `Success. No rows returned`** — un `insert` ne renvoie pas de lignes,  
donc le message est le même. C'est normal.

> **Les quatre fichiers sont rejouables.** Si un message d'erreur apparaît, corrigez  
> ce qu'il signale et relancez **le même fichier** : il ne créera pas de doublon, et  
> il n'y a pas besoin de repartir de zéro.

> **Le dernier est facultatif.** C'est un jeu d'essai : des annonces, des menus  
> et des messages fictifs, pour que l'application ne s'ouvre pas sur des écrans  
> vides. Ne l'appliquez pas en production — les menus fictifs seraient pris pour  
> de vrais menus. Il ne remplit que les tables des deux premiers fichiers.

### 1.4 Créer le compartiment des documents

C'est la **seule pièce de la base** que le SQL ne peut pas créer à votre place —
ce qui se règle à la main en dehors de la base est à l'étape 6 —, et elle est
nécessaire pour que l'écran « Documents importants » fonctionne.

Le schéma `storage` est géré par Supabase et n'existe pas dans nos migrations :
une instruction le concernant empêcherait les fichiers ci-dessus d'être rejouables.
Le compartiment se crée donc à la main, une fois.

1. Menu de gauche → **Storage** → **New bucket**.
2. Nom : `documents` — exactement, en minuscules.
3. **Public bucket : laissez décoché.** L'application ne sert jamais un fichier
   directement : elle demande une **adresse signée**, valable une heure. Un
   compartiment public rendrait tous les documents lisibles par quiconque
   possède l'adresse.
4. Créez, puis ouvrez **Policies** sur ce compartiment, et collez-y **deux**
   politiques de lecture dans l'éditeur SQL, comme les fichiers ci-dessus — le
   tableau de bord les crée à l'identique, mais par des cases à cocher qu'on peut
   mal remplir :

   ```sql
   --  Les documents destinés aux familles : lisibles par un parent sans compte.
   create policy storage_documents_select_familles
   on storage.objects for select to anon
   using (
     bucket_id = 'documents'
     and exists (
       select 1 from public.documents d
       where d.storage_path = storage.objects.name
         and d.visibility = 'familles'
     )
   );

   --  Tout le reste : réservé aux porteurs d'un jeton.
   create policy storage_documents_select_bureau
   on storage.objects for select to authenticated
   using (bucket_id = 'documents');
   ```

   **Les deux sont nécessaires, et pour deux raisons opposées.** Sans la
   première, un parent sans compte voit la liste des documents et l'ouverture
   échoue ; sans la seconde, l'adhérent connecté ne verrait plus les documents du
   bureau.

   Et la première **n'ouvre pas le compartiment** : elle exige que le fichier
   demandé ait, dans la table `documents`, une ligne marquée `familles`. Un
   document du bureau, ou un fichier déposé sans ligne correspondante, reste
   refusé. C'est le même critère que celui de la table : `visibility`, une seule
   fois écrit, lu aux deux endroits.

   Un mot sur `storage.objects.name` : c'est le chemin du fichier **dans** le
   compartiment, et c'est exactement ce que porte la colonne `storage_path`. C'est
   cette égalité qui fait le lien entre le fichier et sa fiche.

   Ces politiques ne figurent pas dans nos migrations : le schéma `storage`
   n'existe pas dans la doublure des tests, et une instruction le concernant
   empêcherait les fichiers ci-dessus d'être rejouables. C'est pourquoi le banc
   `check-rls-guards` lit **ce guide** : il vérifie que le compartiment protégé
   est celui que le code interroge, que rien n'y autorise l'écriture, et que la
   politique ouverte au rôle anonyme est bien bornée par la table `documents`.

Tant que le compartiment n'existe pas, l'écran Documents affiche une erreur de
chargement — les autres écrans ne sont pas affectés.

### 1.5 Vérifier que les quinze tables sont là

C'est la vraie vérification : le message `Success` ne dit pas que les tables  
existent, il dit que le SQL n'a pas échoué.

**Les six premières ont déjà été vérifiées pour vous**, depuis l'extérieur, avec
la clé que vous m'avez envoyée : elles répondent, et chacune refuse la lecture
avec `permission denied for table …`. Les deux moitiés comptent — une table
absente répondrait `404`, une table ouverte aurait laissé passer la lecture.

**Les neuf autres, non** : elles n'existent pas encore tant que les trois
fichiers de migration n'ont pas été collés. Après les avoir collés, la même
vérification s'applique, et je la referai si vous me le demandez.

1. Dans le menu de gauche, cliquez **Table Editor**.
2. Vous devez voir les quinze tables : `agenda_events`, `annonces`,
   `cantine_menus`, `cantine_reservations`, `conversation_messages`,
   `conversations`, `discussion_messages`, `documents`, `messages`, `profiles`,
   `push_tokens`, `signalements`, `sondage_choices`, `sondage_votes`, `sondages`.
   Les trois dernières arrivées — `conversations`, `conversation_messages`,
   `push_tokens` — sont celles du **troisième** fichier : si vous ne les voyez
   pas, c'est qu'il n'a pas été collé.
3. Cliquez sur **annonces** : vous devez voir **2 lignes**. Ce nombre ne bouge
   plus, même si vous relancez `seed.sql`.
4. Cliquez sur **cantine_menus** : vous devez voir **8 lignes** la première fois.
   Les menus sont datés à partir du jour où vous appliquez le fichier : si vous
   le relancez un autre jour, huit menus **de plus** s'ajoutent pour les jours
   suivants. C'est le seul nombre de cette page qui puisse grandir — un compte
   supérieur à 8 n'est donc pas une erreur.

Si les tables sont là mais vides, c'est que `seed.sql` n'a pas été exécuté — ce  
n'est pas grave, relancez-le.

### 1.6 Récupérer les deux valeurs

Il vous faut **deux** valeurs, et surtout pas une troisième.

**Chemin rapide :** en haut du tableau de bord, le bouton **Connect** affiche  
l'URL du projet et la clé publishable, prêtes à copier.

**Chemin complet :** menu de gauche → **Settings** (la roue crantée) → **API Keys**.  
C'est là que vivent toutes les clés. _(Il n'y a pas de page « Settings > API » : tout  
est dans « API Keys ».)_

| Ce qu'il me faut    | À quoi ça ressemble                |
| ------------------- | ---------------------------------- |
| **Project URL**     | `https://abcdefghijkl.supabase.co` |
| **Publishable key** | `sb_publishable_…`                 |

Sur un projet plus ancien, la clé publishable s'appelle **`anon public`** — c'est  
exactement la même chose, prenez-la.

> **⚠️ Ne prenez PAS la clé `sb_secret_…` / `service_role`**, qui se trouve juste à  
> côté. Celle-là contourne **toutes** les politiques de sécurité : elle donnerait un  
> accès complet à la base. `src/config/env.ts` la refuse de toute façon, mais autant  
> ne pas la copier.

### 1.7 Me les transmettre

**Collez simplement les deux valeurs dans la conversation.** Elles ressemblent à ceci :

```
https://abcdefghijkl.supabase.co
sb_publishable_AbCdEf123456...
```

C'est sans danger, et c'est même prévu ainsi : la clé publishable est **publique par  
conception**. Elle finit de toute façon en clair dans l'APK que recevront les  
adhérents, et n'importe qui peut l'en extraire. Ce qui protège réellement les  
données, ce sont les politiques de sécurité écrites dans la base — pas le secret de  
cette valeur.

La règle à retenir : **la clé `sb_secret_…`, jamais. La clé `sb_publishable_…`, oui.**

### 1.8 Ce qui reste, et à qui

**Déjà fait, et mesuré** : les deux valeurs sont écrites aux **lignes 40 et 44** de
`.env.local` — un fichier que Git ignore. La compilation, elle, reçoit les siennes de
l'environnement Expo, et le binaire publié a été **relu avant publication** : la clef
qu'il contient est une clef publique, et c'est la même que celle enregistrée dans le
dépôt.

À la première ouverture de l'application, l'écran de configuration ne doit **pas**
apparaître. S'il apparaît, c'est que les valeurs n'ont pas été lues — c'est le seul
symptôme possible, et il ne dit rien d'autre.

**Ce qui reste est un geste qui ne peut pas être le mien : vous promouvoir
administrateur.** Le compte que vous créez dans l'application naît « membre » : la
colonne `role` est verrouillée par un déclencheur, précisément pour qu'un membre ne
puisse pas s'attribuer de droits. La promotion est donc **une commande SQL**, à coller
dans l'éditeur SQL de Supabase.

L'ordre compte : la commande ne peut rien promouvoir avant que votre compte existe, et
votre compte se crée **dans l'application** — donc après l'installation (§5).

Je ne peux pas la lancer à votre place : je ne détiens que la **clé publique** de votre
projet, et c'est voulu — cette clé ne peut rien écrire que les politiques n'autorisent,
et la colonne `role` est justement fermée. Un jeton capable d'écrire sans les politiques
serait un jeton à ne pas faire circuler.

La commande est écrite dans **`supabase/README.md`**, section « Après l'installation ».
Copiez-la telle quelle, **en remplaçant `votre.adresse@exemple.fr` par l'adresse avec
laquelle vous avez créé votre compte**. Si vous laissez l'adresse d'exemple, la
commande ne trouvera aucune ligne — et **elle ne le dira pas** : un `update` qui ne
touche rien n'est pas une erreur.

Elle est encadrée par `disable trigger` / `enable trigger`, et ce n'est pas une
précaution de style : le verrou lit `auth.uid()`, qui vaut `NULL` dans l'éditeur SQL.
Sans cette parenthèse, la commande échoue sur « Seul un administrateur peut modifier le
rôle d'un membre » — le message exact de ce que vous cherchez à faire.

### 1.9 Accepter votre propre adhésion, puis celles des familles

**Le piège, et il est silencieux.** Depuis la troisième migration, une inscription
est une **demande** : un compte neuf naît `en_attente`. Vous promouvoir
administrateur vous donne le droit de **décider** — pas d'être accepté. Votre
propre compte reste donc `en_attente`, et l'écran de discussion vous répondra une
**liste vide** : un refus, ici, ne dit jamais pourquoi.

La promotion et l'acceptation sont deux gestes différents, et l'ordre est celui-ci :

1. **Vous promouvoir** — la commande SQL de `supabase/README.md`, ci-dessus.
2. **Accepter votre demande** — ouvrez l'application, onglet **Plus**, puis
   **Adhésions**. Votre nom doit y figurer avec le statut « En attente ».
   Appuyez sur **Accepter**.
3. **Accepter les familles**, une par une, sur le même écran, à mesure qu'elles
   s'inscrivent. Tant qu'une demande est « En attente », la famille peut lire les
   annonces, les menus et l'agenda — mais pas écrire dans la discussion.

Un mot sur les quatre statuts, parce qu'ils ne se devinent pas :

| Statut         | Ce que la famille peut faire                                        |
| -------------- | ------------------------------------------------------------------- |
| **En attente** | lire le contenu public ; ni discussion, ni conversations            |
| **Accepté**    | tout, comme un adhérent                                             |
| **Refusé**     | comme « En attente » — la demande est tranchée, l'accès reste fermé |
| **Suspendu**   | comme « En attente » — réversible à tout moment                     |

Vous pouvez revenir sur une décision : l'écran propose, pour chaque ligne, les
transitions possibles depuis son statut. Rien n'est définitif, et **aucune donnée
n'est effacée** par un refus ou une suspension — seul l'accès change.

### 1.10 Mettre un document à disposition des familles

Deux gestes, et l'ordre compte, parce que la politique du compartiment **relie les
deux** : elle n'autorise un fichier que si la table `documents` porte une ligne qui le
désigne.

1. **Storage** → compartiment `documents` → **Upload file**. Notez le nom exact du
   fichier : c'est le **chemin dans le compartiment**, par exemple
   `reglement-2026.pdf`. N'ajoutez pas de dossier `documents/` devant — ce préfixe
   ferait partie du nom.
2. **Table Editor** → `documents` → **Insert row**. Renseignez `title`, puis
   `storage_path` **au caractère près**, avec le nom de l'étape 1.
3. `visibility` : laissez `familles` — c'est ce qui rend le document lisible par un
   parent sans compte. Mettez `bureau` pour un document réservé aux adhérents
   connectés.

Une faute de frappe dans `storage_path` ne produit **aucune erreur** : le document
apparaît dans la liste, et l'ouverture échoue. C'est le symptôme à reconnaître — il ne
vient jamais de la politique du compartiment, qui est binaire, mais toujours du lien
entre le fichier et sa fiche.

### 1.11 Publier une annonce, un menu, un sondage

**Pourquoi il n'y a pas d'écran pour cela.** Aucun écran de l'application n'écrit ces
contenus : les politiques de la base réservent l'écriture au bureau, et quatre
formulaires de saisie représenteraient plus de code que tout le reste réuni. Vous
publiez donc depuis le **Table Editor**, et l'application se remplit au prochain
tirer-pour-rafraîchir. Ce n'est pas un pis-aller : du contenu publié une fois par
semaine n'a pas besoin d'un écran dédié.

Ce qui suit donne, pour chaque table, les colonnes **obligatoires**. Les autres ont une
valeur par défaut, ou peuvent rester vides.

**Une annonce** — Table Editor → `annonces` → **Insert row**

| Colonne    | À remplir                                                       |
| ---------- | --------------------------------------------------------------- |
| `title`    | le titre, **160 caractères au plus**                            |
| `body`     | le texte, jamais vide                                           |
| `category` | `information`, `important`, `cantine`, `evenement` ou `reunion` |

`published_at` se remplit seule à l'instant de l'insertion. Laissez `author_id` vide :
elle désigne un compte, et la renseigner à la main est le seul moyen de se tromper ici.

**Un menu de cantine** — `cantine_menus`

| Colonne                                      | À remplir                                 |
| -------------------------------------------- | ----------------------------------------- |
| `service_date`                               | le **jour servi**, au format `2026-09-22` |
| `starter`, `main_course`, `dessert`, `notes` | ce que vous voulez, ou vide               |

`service_date` est **unique** : une seconde ligne pour le même jour est refusée avec
« duplicate key value violates unique constraint ». C'est une protection, pas une
panne — corrigez la ligne existante plutôt que d'en ajouter une. Une date passée ne
s'affiche plus : l'écran ne montre que le jour et les semaines à venir.

**Un événement d'agenda** — `agenda_events`

| Colonne                   | À remplir                                      |
| ------------------------- | ---------------------------------------------- |
| `title`                   | le titre, **160 caractères au plus**           |
| `start_at`                | le début, par exemple `2026-09-22 18:30:00+02` |
| `end_at`                  | la fin, ou vide — **jamais avant** le début    |
| `location`, `description` | ou vide                                        |
| `all_day`                 | `true` pour une journée entière                |

**Un sondage** — deux tables, dans cet ordre.

1. `sondages` : `question` (**300 caractères au plus**), `details` si vous voulez
   préciser, `is_open` laissé à `true`. **Notez l'`id` de la ligne créée** — c'est un
   identifiant long, et il sert à l'étape suivante.
2. `sondage_choices` : une ligne **par réponse** — `sondage_id` (l'`id` noté),
   `label`, et `position` (0, 1, 2… dans l'ordre d'affichage).

Un sondage sans réponse ne s'affiche pas : l'écran n'a rien à proposer. Pour le clore,
mettez `is_open` à `false` — les votes déjà reçus restent comptés, et `closed_at` garde
la date de clôture prévue si vous en aviez fixé une.

**Ce qui ne se publie pas ici.** Les messages de la discussion et les conversations
privées viennent des familles, pas de vous : aucune des deux tables n'a de politique
d'écriture pour le bureau, et c'est voulu. Vous y répondez **depuis l'application**,
écran « Discussion » et écran « Messages des familles ».

**Ce qui se lit ici, et nulle part ailleurs.** Les **signalements** des familles :
l'application ne montre à un parent que les siens. Ouvrez la table `signalements` et
filtrez sur `status = 'nouveau'` pour voir ce qui attend — c'est là que vous décidez
du passage à `en_cours` ou à `traite`. Aucun écran de l'application ne vous les
montre, et c'est le seul cas de ce genre.

### Si quelque chose ne marche pas

| Ce que vous voyez                                          | Ce qui se passe                                                                                                                                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `relation "public.xxx" already exists`                     | normal, le fichier est rejouable : relancez, ou passez au suivant                                                                                                                                             |
| `Seul un administrateur peut modifier le rôle d'un membre` | c'est la promotion admin, et elle doit être encadrée par `disable trigger` / `enable trigger`. La commande complète est dans `supabase/README.md` — collez-la telle quelle, en remplaçant l'adresse d'exemple |
| Le projet reste « Setting up » plus de 5 minutes           | rafraîchissez la page, puis dites-le moi                                                                                                                                                                      |
| Vous ne trouvez pas **API Keys**                           | dites-moi ce que vous voyez dans le menu **Settings**                                                                                                                                                         |

**Dans tous les cas : copiez-moi le message d'erreur entier.** Je préfère un  
aller-retour de plus qu'un diagnostic deviné.

---

## Étape 2 — Expo (~5 min) ✅

> **Faite.** Le compte existe, le projet `@mchiker/fcpe-freres-lumieres` est créé, son
> identifiant est écrit dans `app.json`, et les deux variables Supabase sont
> enregistrées pour `development`, `preview` et `production` — vérifiées une par une.

Expo est le service qui fabrique l'APK. Le compte est gratuit, et le forfait gratuit  
suffit largement.

### 2.1 Créer le compte

1. Allez sur <https://expo.dev/signup>
2. Choisissez un **nom d'utilisateur**, une adresse e-mail et un mot de passe — ou  
   passez par GitHub.
3. **Retenez le nom d'utilisateur** : il apparaîtra dans l'adresse de  
   téléchargement de l'application. Quelque chose comme `fcpe-freres-lumieres` ou  
   `msoumaya2019` fait très bien l'affaire.

### 2.2 Me donner accès — deux options

**Option A — recommandée.** Ouvrez un terminal **dans le dossier du projet** et  
lancez :

```bash
npx --yes eas-cli@latest login
```

> Le `--yes` n'est pas décoratif : `eas-cli` n'est pas une dépendance du projet, donc  
> `npx` doit le télécharger, et **sans `--yes` il s'arrête sur une invite**  
> (« Ok to proceed? ») qui ressemble à un blocage.

Saisissez vos identifiants **vous-même**, dans votre terminal. Je n'y vois rien, et  
le jeton reste stocké sur votre machine : je m'en sers ensuite sans jamais connaître  
votre mot de passe.

Pour vérifier que c'est bien vous qui êtes connecté :

```bash
npx --yes eas-cli@latest whoami
```

**Option B — sans ouvrir de terminal.** Allez sur  
<https://expo.dev/settings/access-tokens>, cliquez **Create token**, nommez-le  
`workbuddy`, copiez la valeur et donnez-la moi. Elle est **révocable** depuis la même  
page le jour où vous n'en voulez plus.

### 2.3 Ce que je fais ensuite, sans vous

- `eas init` — crée le projet côté Expo et écrit son identifiant dans `app.json` ;
- `eas env:set` — enregistre les deux variables Supabase pour `development`,  
  `preview` et `production`. Nécessaire, parce que `.env.local` n'est **pas**  
  téléversé vers EAS, qui respecte `.gitignore` ;
- `npm run eas:build:preview` — lance la compilation.

**Aucune installation globale n'est nécessaire** : la CLI est cherchée à la demande  
par `npx`. Comptez **10 à 20 minutes** la première fois, puis un lien de  
téléchargement.

> **Sur iPhone.** Le profil `preview` produit un APK Android, installable  
> directement. Pour iOS, la distribution interne d'EAS exige un compte Apple  
> Developer **payant** (99 $/an). La voie gratuite est désormais en place : le flux  
> `.github/workflows/ios-unsigned.yml` compile un **IPA non signé** sur un exécuteur  
> macOS, que vous signez ensuite avec ESign — voir l'étape 5.

---

## Étape 3 — Le jeton Expo pour GitHub _(~2 min)_ ✅

> **Faite.** Le jeton est posé en secret du dépôt, et la compilation automatique a
> tourné : elle produit l'APK comme le flux manuel.

Le dépôt contient déjà une compilation automatique  
(`.github/workflows/eas-build.yml`), déclenchée sur un tag `v*` ou à la main. Elle  
attend le secret `EXPO_TOKEN` — désormais posé, et la compilation a tourné.

Si vous me donnez un jeton créé sur <https://expo.dev/settings/access-tokens>, je le  
pose moi-même en secret du dépôt et je vérifie que la compilation démarre. Sinon, on  
s'en passe très bien : je compile depuis votre machine à l'étape 2, ce qui donne le  
même APK.

---

## Étape 4 — L'envoi des e-mails _(~5 min)_ ✅

**Mesuré le 18 septembre 2026 sur votre projet** : la confirmation d'e-mail est  
**exigée** (`mailer_autoconfirm` vaut `false`). Autrement dit, un compte neuf ne peut  
pas se connecter avant d'avoir cliqué le lien reçu — et tant que le SMTP n'est pas  
configuré, Supabase n'envoie ses messages qu'aux **adresses des membres du projet**.  
Vous pourrez donc créer votre propre compte et le confirmer ; un parent, non.

C'est la raison pour laquelle cette étape peut attendre **votre** essai, mais pas  
l'ouverture aux adhérents.

**Le côté Brevo est déjà fait et prouvé** : les quatre valeurs sont mesurées, le relais
accepte les identifiants, et un message d'essai a été **remis**. Il ne reste donc que la
recopie dans le tableau de bord Supabase.

Sans configuration, Supabase envoie les e-mails de confirmation depuis son propre  
service : **deux messages par heure**, et souvent classés en indésirable.

Pour envoyer depuis votre domaine, il faut quatre valeurs. Vous avez ouvert un compte
**Brevo** : les quatre se lisent au même endroit, et **la clef SMTP n'est pas la clef
d'API** — Brevo les distingue, et le relais refuse la seconde.

| Ce qu'il faut        | Valeur mesurée le 19 septembre 2026                                    |
| -------------------- | ---------------------------------------------------------------------- |
| Hôte et port SMTP    | `smtp-relay.brevo.com`, port **587** (ou 2525 ; **465** avec SSL)      |
| Identifiant          | `ba01ac001@smtp-brevo.com` — **celui du relais**, pas l'adresse e-mail |
| Clef SMTP            | la clef du compte, `xsmtpsib-…` — **pas la clef d'API** `xkeysib-…`    |
| Adresse d'expédition | `mohamed.chiker@live.fr`, validée et **active** chez Brevo             |

**Le `535` est résolu, et ce n'était pas le blocage d'IP.** La cause était une **clef
SMTP étrangère au compte**. Quatre essais croisés le montrent, et ils sont tous
mesurés :

| Clef essayée          | Identifiant                | Réponse            |
| --------------------- | -------------------------- | ------------------ |
| celle qui était notée | `ba01ac001@smtp-brevo.com` | **refusée** `535`  |
| celle qui était notée | `mohamed.chiker@live.fr`   | **refusée** `535`  |
| **celle du compte**   | `ba01ac001@smtp-brevo.com` | **acceptée** `235` |
| celle du compte       | `mohamed.chiker@live.fr`   | **refusée** `535`  |

Deux enseignements : la clef doit être celle du compte, et l'identifiant est celui du
relais — jamais l'adresse e-mail. L'hypothèse du blocage d'IP, plausible, était donc
fausse ; elle a été réfutée par la mesure, deux fois plutôt qu'une.

**La remise est prouvée, pas seulement l'acceptation.** Un message d'essai a été
envoyé, le relais a répondu sans erreur, puis l'API du compte a rendu l'événement
`delivered`, horodaté, avec son identifiant de message. Le compteur du forfait est
passé de **300 à 299** envois. Ce que le compte déclare par ailleurs :

| Constat              | Valeur                                                        |
| -------------------- | ------------------------------------------------------------- |
| Compte               | `mohamed.chiker@live.fr` (société `Msoumaya2019`)             |
| Forfait              | gratuit, **300 envois** — 299 restants                        |
| Relais SMTP          | **activé**, et il annonce lui-même `ba01ac001@smtp-brevo.com` |
| Adresse d'expédition | `mohamed.chiker@live.fr`, **validée et active**               |

Une précaution de lecture, pour la prochaine fois : les statistiques de l'API
**retardent de quelques minutes**. Deux interrogations à deux minutes d'intervalle ont
donné **0** puis **2** événements pour le même message. Une liste vide ne prouve donc
pas qu'un envoi a échoué — il faut interroger de nouveau avant de conclure.

**Pourquoi il ne faut pas se contenter d'ajouter une adresse IP.** **Supabase envoie les
e-mails depuis sa propre infrastructure**, dont les adresses ne sont ni connues d'avance
ni stables. Une liste d'IP autorisées ne peut donc pas la couvrir, et un blocage SMTP
laissé actif couperait la confirmation d'inscription **en production**, sans message qui
l'explique. Ce réglage est utile pour une clef d'API appelée depuis un serveur fixe ; il
est inadapté ici.

Mesure à l'appui, et elle est instructive : l'événement Brevo porte un champ `ip`, mais
il vaut **la même adresse** pour l'essai envoyé depuis cette machine et pour l'envoi de
Supabase. Ce champ n'est donc pas l'adresse de l'expéditeur, et il ne peut pas servir à
construire une liste d'autorisation. **Un champ nommé `ip` n'est pas forcément celui
qu'on croit.**

**C'est fait, et vérifié jusqu'au bout.** Les valeurs ont été recopiées dans
**Authentication → Emails → SMTP Settings**, puis un e-mail de réinitialisation a été
demandé depuis l'application. Le compte Brevo a enregistré la demande, puis la
**remise**, puis l'ouverture du message, puis le **clic sur le lien**. La chaîne
complète — Supabase, Brevo, boîte du destinataire — est donc établie par la mesure,
et non par la configuration.

---

## Étape 5 — Installer l'application _(~2 min sur Android, ~10 min sur iPhone)_

C'est le seul geste qui ne s'automatise pas : installer une application demande votre  
téléphone.

### Où se trouvent les deux fichiers

Les deux binaires de la version **0.1.0** sont attachés à une page unique :
`https://github.com/Msoumaya2019/fcpe-freres-lumieres-mobile/releases/latest`.

Vous y trouverez `fcpe-freres-lumieres-0.1.0-android.apk` et
`fcpe-freres-lumieres-0.1.0-non-signe.ipa`. **Le nom du fichier porte la version** :
c'est ce qui permet de savoir ce qu'on installe sans ouvrir le fichier — un binaire
ne vaut que pour le commit dont il est né.

Deux autres adresses circulent, et **aucune des deux ne marchera pour vous**, parce
qu'elles demandent un compte : la page de compilation EAS affichée en fin de build
refuse la lecture à un visiteur non connecté, et l'artefact `ipa-non-signe` du flux
GitHub répond `401` sans jeton — ce qu'un navigateur de téléphone ne sait pas
fournir. La page des versions, elle, se télécharge sans compte : c'est la seule des
trois voies qu'un téléphone puisse suivre seul.

### Sur Android — l'APK

1. Ouvrez la page des versions ci-dessus, **depuis le téléphone**, et téléchargez
   `fcpe-freres-lumieres-0.1.0-android.apk`.
2. Android affiche un avertissement : « Pour votre sécurité, votre téléphone n'est  
   pas autorisé à installer des applications inconnues provenant de cette source ».  
   Touchez **Paramètres**, puis activez **Autoriser depuis cette source**.
3. Revenez en arrière et touchez **Installer**.
4. À la première ouverture, l'application vous demandera de créer un compte.

Je vous donnerai le chemin exact dans les réglages Android selon votre téléphone —  
c'est un écran qui change d'un constructeur à l'autre.

### Sur iPhone — l'IPA non signé, puis ESign

iOS **refuse** d'installer une application non signée : le système vérifie la
signature avant d'exécuter quoi que ce soit, et ne dit pas pourquoi il refuse. L'IPA
que je produis n'est donc pas un produit fini, c'est un **produit intermédiaire** — la
compilation sans la signature — et c'est ESign qui pose la signature, sur le téléphone.

1. Ouvrez la page des versions ci-dessus, **depuis l'iPhone**, et téléchargez
   `fcpe-freres-lumieres-0.1.0-non-signe.ipa`.
2. Ouvrez ESign et importez le fichier.
3. Signez-le avec un certificat obtenu **sur l'appareil** — c'est le geste que je ne
   peux pas faire à votre place, il engage votre identifiant Apple.
4. Installez depuis ESign, puis ouvrez l'application.

**Deux choses à savoir avant de commencer.** Un certificat gratuit **expire au bout de
sept jours** : l'application cesse alors de s'ouvrir, et il faut re-signer. Et cette
voie sert à **essayer** l'application — pour les adhérents, la voie normale reste le
magasin.

Si l'installation échoue, envoyez-moi le message d'ESign tel quel : il dit presque
toujours laquelle des trois choses manque — le certificat, la signature, ou
l'autorisation de l'appareil.

---

## Étape 6 — Les quatre réglages du tableau de bord _(~5 min, plus tard)_

Ces quatre réglages vivent dans le tableau de bord Supabase et **pas** dans un  
fichier du dépôt : aucun test ne les protège, donc ils sont consignés dans le  
`README.md` (§4) plutôt que laissés à la mémoire. Je vous les donnerai un par un,  
avec l'écran et la valeur, **après** le premier essai sur téléphone — les changer  
maintenant n'apporterait rien, et il vaut mieux les régler quand on peut mesurer  
leur effet.

Pour que vous sachiez de quoi il s'agit :

| #   | Écran                                              | Valeur                                                                     |
| --- | -------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | Authentication > URL Configuration > Redirect URLs | **deux** adresses : `fcpefl://reinitialisation` et `fcpefl://confirmation` |
| 2   | Authentication > Email Templates > Reset password  | le lien doit être `{{ .ConfirmationURL }}` (c'est le défaut)               |
| 3   | Authentication > Providers > Email                 | _Minimum password length_ = **6**, et la confirmation d'e-mail activée     |
| 4   | Authentication > SMTP Settings                     | les identifiants de l'étape 4                                              |

Le réglage 1 est **le plus important** : Supabase refuse toute redirection absente de  
cette liste, et l'adhérent qui a oublié son mot de passe ne recevrait alors aucun  
lien utilisable. Les deux adresses sont recopiées du fichier  
`src/auth/redirectPaths.ts`, et un test vérifie qu'elles restent d'accord.

---

## La liste à cocher

**Maintenant :**

- [x] Compte Supabase créé
- [x] Projet créé — il répond à l'adresse que vous m'avez envoyée
- [ ] La **région** est européenne — je ne peux pas la lire sans vos identifiants
- [ ] Mot de passe de la base noté
- [x] `20260916120000_init.sql` collé et exécuté → les six premières tables existent
- [ ] `20260919120000_rubriques.sql` collé et exécuté → les six tables des rubriques
- [ ] `20260920120000_acces_public.sql` collé et exécuté → l'application s'ouvre  
      **sans compte** : conversations avec le bureau, sondages, documents des familles
- [ ] Compartiment `documents` créé dans Storage, **privé**, et ses **deux**  
      politiques de lecture collées _(sans elles, l'écran Documents est vide ou  
      échoue : une politique manquante rend une liste vide, pas une erreur)_
- [ ] `seed.sql` collé et exécuté → à confirmer : je ne peux pas compter les lignes  
      depuis l'extérieur, les tables étant fermées à la clé publique
- [ ] Table Editor : `annonces` a 2 lignes
- [ ] Table Editor : les quinze tables sont là, dont `conversations` et `push_tokens`
- [x] Project URL et publishable key envoyées dans la conversation
- [x] Compte Expo créé — nom d'utilisateur `mchiker`
- [x] Jeton d'accès posé en secret du dépôt, et compilation lancée
- [ ] Signer l'IPA non signé avec ESign _(il est compilé et vérifié)_

**Aucune case ne bloque plus l'APK ni l'IPA.** Les cases cochées le sont parce que je les ai  
**mesurées**, pas parce qu'elles devraient l'être ; celles qui restent ouvertes  
demandent soit votre mot de passe, soit une lecture que la clé publique n'autorise  
pas.

**Plus tard, après le premier essai :**

- [ ] Créer votre compte dans l'application, puis **vous promouvoir administrateur** —
      une commande à coller depuis `supabase/README.md` (section « Après
      l'installation ») : c'est votre geste, je n'ai que la clé publique
- [ ] Puis, **dans l'application**, accepter les demandes d'adhésion — l'écran
      « Adhésions » du bureau
- [ ] **Publier un premier contenu** — une annonce, un menu, un sondage (§1.11). Sans
      eux, l'application s'ouvre sur des listes vides, et rien ne distingue « le
      bureau n'a rien publié » de « l'application ne marche pas »
- [ ] Les quatre réglages du tableau de bord
- [x] Recopier les quatre valeurs SMTP dans Supabase — vérifié jusqu'au clic sur le lien
- [ ] Le jeton Expo pour GitHub _(facultatif)_

---

## Ce qui est déjà fait

Pour que vous sachiez ce que vous n'avez pas à faire : les quatorze écrans et leur  
navigation, l'authentification et la réinitialisation de mot de passe, les quinze tables  
et leurs politiques de sécurité, les contrôles de schéma et de politiques, la chaîne  
de vérification complète (`npm run verify`, **34 fichiers de test**), les  
trois flux GitHub Actions, le dépôt public sans aucun secret, les deux binaires  
compilés — l'APK Android et l'IPA non signé —, les e-mails vérifiés jusqu'au clic  
sur le lien reçu, et la documentation.

## Une seule chose à retenir

**Plus rien ne bloque l'ouverture aux adhérents, côté outillage.** Les e-mails partent,
les deux binaires sont livrés. Restent les quatre réglages du tableau de bord et
l'installation sur un téléphone — deux gestes qui demandent vos accès.
