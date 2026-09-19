# FCPE Frères Lumières — application mobile

Application mobile des adhérents de la FCPE des écoles Frères Lumières
(Montmagny). Expo / React Native, React Navigation, Supabase.

```
Connexion ──┬── Informations      annonces du bureau
            ├── Cantine           menus et réservations
            ├── Mes signalements  déclaration et suivi
            └── Discussion        salon des adhérents
```

La navigation bascule automatiquement entre l'écran de connexion et les onglets
selon l'état de session : aucun écran ne déclenche de navigation après une
connexion, ce qui supprime la classe de bugs où un écran se ferme à peine ouvert.

---

## 1. Prérequis

| Outil           | Version  | Remarque                                        |
| --------------- | -------- | ----------------------------------------------- |
| Node.js         | 22.x     | `.nvmrc` fixe `22.22.2`, comme `eas.json`       |
| npm             | 10.x     | livré avec Node 22                              |
| Expo Go         | dernière | pour tester sur un téléphone sans compilation   |
| Compte Expo     | —        | nécessaire pour EAS Build (`npx eas-cli login`) |
| Projet Supabase | —        | offre gratuite suffisante pour démarrer         |

## 2. Démarrage rapide

```bash
npm install
cp .env.example .env.local     # puis renseigner les deux valeurs Supabase
npm start                      # puis scanner le QR code avec Expo Go
```

Sans configuration, l'application **ne plante pas** : elle affiche un écran
expliquant les variables manquantes. C'est volontaire, et c'est aussi ce qui
permet à l'intégration continue de compiler le bundle sans aucun secret.

> **Mise en service, pas à pas.** [MISE-EN-SERVICE.md](MISE-EN-SERVICE.md) énumère
> dans l'ordre les seules actions qui ne peuvent pas être automatisées — créer le
> projet Supabase, coller les trois fichiers SQL, créer le compte Expo, lancer
> `npx eas-cli login` — et, pour chacune, ce qui s'ensuit côté dépôt. Le partage y est
> explicite : aucun identifiant n'est saisi par un tiers, mais tout ce qui peut
> être fait sans vous l'est déjà.

## 3. Configuration des clés d'API

Toute la configuration passe par **un seul fichier** : `src/config/env.ts`.

```ts
// src/config/env.ts
export const appConfig: AppConfig = Object.freeze({
  appEnv, // development | preview | production
  supabase: { url, anonKey }, // null si absent ou refusé
  configError, // explication en français, affichée à l'écran
});
```

Aucun autre module ne lit `process.env`. Ce point de passage unique permet deux
choses qu'une lecture dispersée rendrait impossibles :

- **refuser une clé dangereuse** — `describeKeyProblem()` rejette une clé
  `sb_secret_…` ou un JWT dont la charge utile porte `"role":"service_role"`.
  Cette clé contourne toutes les politiques RLS ; l'intégrer au bundle
  reviendrait à publier la base en lecture et en écriture ;
- **vérifier la cohérence de l'URL** — une barre oblique finale produit des URL
  à double slash que PostgREST rejette par une 404 déroutante.

Le client lui-même est construit dans `src/config/supabase.ts`, séparément : la
lecture de la configuration est testable sans instancier de client.

**Quand les clés manquent, l'application ne plante pas.** `App.tsx` monte
`ConfigurationScreen` (`src/screens/ConfigurationScreen.tsx`) **à la place de tout
le reste** tant que `isSupabaseConfigured` est faux. Conséquence voulue :
`AuthProvider` n'est jamais monté, aucun écran n'a à gérer le cas « clés
absentes », et `requireSupabase()` ne peut pas être appelé par erreur. C'est aussi
ce qui permet à l'intégration continue de compiler le bundle **sans aucun secret**.

Cet écran a deux publics, et deux messages. En développement il affiche les étapes
de mise en place et un rappel sur la clé `service_role` ; en production il dit à
l'adhérent que le problème ne vient ni de son compte ni de son téléphone, et qu'il
doit le signaler au bureau. Afficher la procédure `.env.local` à un parent
reviendrait à lui confier une marche qu'il ne peut pas exécuter, au moment précis
où il faut lui dire qui contacter — c'est la même règle qu'`appErrorDetail()`.

### En développement

`.env.local`, ignoré par Git (voir `.gitignore`, qui ignore `.env` et `.env.*`
puis ré-autorise `.env.example`).

### Pour EAS Build

Les fichiers `.env.local` ne sont **pas** téléversés : EAS respecte
`.gitignore`. Les valeurs doivent être enregistrées côté Expo, une fois par
environnement — `eas.json` associe chaque profil à un environnement :

```bash
npx --yes eas-cli@latest env:set --environment production \
  --name EXPO_PUBLIC_SUPABASE_URL \
  --value "https://xxxxxxxx.supabase.co" --visibility plaintext

npx --yes eas-cli@latest env:set --environment production \
  --name EXPO_PUBLIC_SUPABASE_ANON_KEY \
  --value "sb_publishable_..." --visibility sensitive
```

À répéter pour `development` et `preview` si ces profils servent aussi.

> **`env:set`, et non `env:create`.** La sous-commande a été relevée sur la CLI
> elle-même — `npx --yes eas-cli@latest env --help`, le 2026-09-18 : elle expose
> `env:delete`, `env:exec`, `env:get`, `env:list`, `env:pull`, `env:push` et
> `env:set`. `env:create` **n'existe pas**, et ce fichier comme `.env.example`
> l'ont écrit pendant des semaines sans qu'aucune porte ne s'en aperçoive : une
> commande citée dans une documentation n'est exécutée par rien. C'est la même
> famille que `npm run doctor` appelant un binaire absent — sauf qu'ici, l'erreur
> aurait été découverte par vous, au moment le plus coûteux.

> **Ce qui est public et ce qui ne l'est pas.** La clé publishable finit en clair
> dans le bundle, c'est normal : elle est conçue pour cela. La sécurité repose
> sur les politiques RLS, pas sur le secret de cette valeur. La clé
> `service_role`, elle, ne doit **jamais** quitter le tableau de bord Supabase.
> Voir [SECURITY.md](SECURITY.md).

### Une lecture d'environnement doit rester littérale

La substitution des variables `EXPO_PUBLIC_*` est une **réécriture statique de
l'arbre syntaxique** : `babel-preset-expo` ne remplace que les nœuds dont le nom
de propriété est écrit en toutes lettres et commence par `EXPO_PUBLIC_`
(`plugins/inline-env-vars.js`), et le sérialiseur Metro s'efface en production au
profit de cette substitution. **Un accès calculé — `process.env[nom]` — n'est
remplacé par rien.**

Conséquence, mesurée sur un bundle de production : la valeur vaut `undefined`, la
clé est lue comme absente, et l'application affiche l'écran de configuration alors
que les clés sont correctement renseignées dans EAS. Elle est alors entièrement
inutilisable, et rien ne le signale :

- `npm run verify` reste vert, puisque l'intégration continue compile **sans
  secret** — c'est volontaire, et c'est même ce qui rend le contrôle utile ;
- les tests de `check-env-guard` restent verts aussi, parce que sous Node un accès
  calculé fonctionne parfaitement. Le défaut n'existe que dans le bundle.

`readEnv` prend donc une **valeur**, et chaque appel écrit
`process.env.EXPO_PUBLIC_…` en toutes lettres. Un test de forme refuse tout
`process.env[` dans `src/`, commentaires retirés.

La mesure, faite sur le bundle Android : avec une variable témoin posée à
l'export, un accès littéral voit sa valeur apparaître dans le paquet, un accès
calculé non.

**La faute de frappe est le second piège de ce même point de passage, et les
types ne l'attrapent pas.** `types/globals.d.ts` déclare les trois variables lues,
mais `ProcessEnv` hérite de `Dict<string>` — `[key: string]: string | undefined`
— donc toute clé est acceptée. Mesuré : une variable écrite avec un « K » de trop,
et une variable entièrement inventée, passent `tsc --noEmit` avec un code de
sortie de 0. La conséquence est celle décrite ci-dessus — clé lue comme vide,
écran de configuration, aucun signal. Ce qui tient la garde est donc un **test de
forme**, et non la déclaration : les variables lues dans `src/config/env.ts`
doivent être exactement celles déclarées. Falsification faite — en ajoutant un
« K » à `EXPO_PUBLIC_SUPABASE_ANON_KEY`, le test tombe et nomme la variable.

L'unicité du lecteur est vérifiée de la même façon, et pour la même raison : un
module qui lirait `process.env` directement contournerait le refus des clés
`service_role`, qui vit dans le lecteur. Un test de forme refuse donc tout
`process.env` en dehors de `src/config/env.ts`.

**Un export mort est le troisième piège de ce fichier, et il a été trouvé par
mesure.** `env.ts` exportait `isSupabaseConfigured` — documenté, et employé
**nulle part** — tandis que le même prédicat était réécrit en clair dans `App.tsx`
et dans `supabase.ts`, avec des polarités opposées. Le lecteur qui cherche « où la
configuration est-elle jugée valide » tombe sur l'export, le croit canonique, et en
ajoute une troisième copie. Un test de forme exige donc que **chaque export de
`env.ts` soit employé** ailleurs que dans sa déclaration — les déclarations
d'import étant retirées du comptage, sans quoi un import orphelin passerait pour un
emploi. Ce dernier point n'est pas théorique : c'est le défaut qu'a révélé la
première version de ce test.

`supabase.ts` garde malgré tout son propre test `appConfig.supabase === null`, et
c'est une contrainte du langage : mesuré sur une sonde, TypeScript **ne rétrécit
pas** `appConfig.supabase` à travers le booléen importé (`TS18047`). Deux réglages
de `tsconfig.json` complètent l'ensemble : `noUnusedLocals` et
`noUnusedParameters`. Ils attrapent l'**import inutilisé**, que le test ci-dessus
ne voit pas puisqu'il compte des emplois et non des déclarations. Vérifié par
sonde — un import ajouté sans usage produit `TS6133` — et l'activer n'a coûté
aucune correction : 0 erreur sur tout le projet avant de l'écrire.

## 4. Base de données

Le schéma et les politiques vivent dans `supabase/`. Détail complet :
[`supabase/README.md`](supabase/README.md).

```bash
npx supabase link --project-ref <référence>
npx supabase db push
```

Quinze tables, toutes protégées par Row Level Security, avec un déclencheur qui
crée le profil à l'inscription :

- **les six de la première migration** — `profiles`, `annonces`, `cantine_menus`,
  `cantine_reservations`, `signalements`, `discussion_messages` ;
- **les six de la seconde**, `20260919120000_rubriques.sql` — `agenda_events`,
  `documents`, `sondages`, `sondage_choices`, `sondage_votes` et `messages` ;
- **les trois de la troisième**, `20260920120000_acces_public.sql` —
  `conversations`, `conversation_messages` et `push_tokens`.

Les trois migrations sont **rejouables** : chacune peut être appliquée en entier
sur une base qui la porte déjà, sans échouer à mi-parcours. C'est ce que vérifie
`scripts/check-migration-rejouable.test.mjs`.

### Le compartiment `documents` se crée à la main

La seconde migration déclare la table `documents`, mais **pas le compartiment de
stockage** qui porte les fichiers. C'est volontaire : le schéma `storage` est géré
par Supabase et absent de l'essai Postgres local, si bien qu'une instruction le
concernant rendrait la migration non rejouable hors du tableau de bord.

Créez donc un compartiment **privé** nommé `documents`, puis collez-y **deux**
politiques de lecture : une pour les documents marqués `familles`, ouverte au rôle
anonyme, une pour tout le reste, réservée aux porteurs d'un jeton. L'application
n'ouvre jamais un fichier directement : elle demande une **adresse signée** valable
une heure, par `documentUrl`.

Le tableau de bord n'est pas lisible depuis le dépôt — mais l'**instruction** qui
le configure, elle, y est : `MISE-EN-SERVICE.md` §1.4 porte les deux politiques, et
`scripts/check-rls-guards.test.mjs` **lit ce guide** pour vérifier que le
compartiment protégé est celui que le code interroge, que rien n'y autorise
l'écriture, et que la politique ouverte au rôle anonyme est bien bornée par la
table `documents`. C'est la même distinction que pour la longueur minimale du mot
de passe : ce qui se règle dans le tableau de bord échappe au test, ce qui
s'installe par une instruction n'y échappe pas.

Après la première inscription, promouvez votre compte :

```sql
begin;
alter table public.profiles disable trigger profiles_prevent_role_change;

update public.profiles
   set role = 'admin'
  from auth.users
 where auth.users.id = public.profiles.id
   and auth.users.email = 'votre.adresse@exemple.fr';

alter table public.profiles enable trigger profiles_prevent_role_change;
commit;
```

Les deux `alter table` ne sont pas décoratifs. Le déclencheur
`prevent_role_change` refuse toute modification de `role` à qui n'est pas déjà
administrateur, et `is_admin()` lit `auth.uid()`, qui vaut `NULL` hors d'une
requête authentifiée : sans eux, la commande échoue dans l'éditeur SQL sur
« Seul un administrateur peut modifier le rôle d'un membre ». La transaction
garantit qu'un échec de la mise à jour ne laisse pas le verrou désactivé.

L'adresse est lue dans `auth.users`, seule source de vérité : `profiles` ne la
stocke pas. Sa politique de lecture est ouverte à tout porteur d'un jeton — y
recopier les adresses les exposerait à l'ensemble des adhérents.

### Réinitialisation de mot de passe

L'adhérent qui a oublié son mot de passe n'a plus besoin de passer par le
bureau. Depuis l'écran de connexion, « Mot de passe oublié ? » envoie un lien ;
le lien rouvre l'application et propose de choisir un nouveau mot de passe.

**Deux réglages sont nécessaires dans le tableau de bord Supabase, et sans eux
le flux ne peut pas fonctionner :**

1. **Authentication > URL Configuration > Redirect URLs** — ajouter exactement
   `fcpefl://reinitialisation`. Supabase refuse toute redirection absente de
   cette liste, et l'adhérent ne reçoit alors aucun lien utilisable. Le chemin
   vient de `RECOVERY_REDIRECT_PATH` dans `src/auth/redirectPaths.ts` ; les deux
   valeurs doivent rester identiques.

2. **Authentication > Email Templates > Reset password** — le lien doit être
   `{{ .ConfirmationURL }}`, ce qui est le cas du modèle par défaut. Un modèle
   qui pointe ailleurs casserait le retour vers l'application.

Ce qui se passe ensuite mérite d'être connu, parce que c'est le point délicat :
**le lien ouvre une vraie session**. L'adhérent est donc connecté avant d'avoir
choisi son mot de passe. `RootNavigator` refuse pourtant de le laisser entrer —
`passwordRecovery` l'emporte sur `status` — sinon le lien connecterait sans rien
changer, et resterait valable indéfiniment. Pour la même raison, « Annuler et se
déconnecter » **ferme la session** : conserver une session ouverte par un lien
encore valable reviendrait à laisser une porte d'entrée qui survit à l'e-mail.

Deux **ordres d'exécution** en découlent, et ils ne sont pas cosmétiques :
`setSession` déclenche lui-même `onAuthStateChange` et fait un aller-retour
réseau, si bien que le drapeau doit être levé **avant** l'appel — sinon
l'application est montée un instant, ses quatre écrans et leurs requêtes compris —
et qu'« Annuler » doit attendre que la session soit posée **avant** de
déconnecter — sinon l'arrivée tardive de la session annule la déconnexion. Les
inverser ne casse ni la compilation, ni le lint, ni un test. Détail dans
`SECURITY.md`.

Un lien expiré — le cas courant, puisqu'on ouvre rarement son courrier dans la
minute — affiche une explication et propose d'en demander un nouveau. Sans ce
message, l'application s'ouvrirait simplement sur l'écran de connexion, et
l'adhérent en conclurait que le lien ne marche pas.

> **Ce que la vérification automatique ne couvre pas.** Le trajet complet
> (envoi de l'e-mail, clic, retour dans l'application) suppose un projet
> Supabase lié, une boîte mail et un appareil : il n'est pas testé par
> `npm run verify`. Ce qui _est_ vérifié sans rien de tout cela, ce sont les
> endroits où le code peut se tromper en silence — la lecture du lien et la
> traduction des messages, éprouvées sur leurs **valeurs**, et l'ordre des
> opérations du flux de récupération, éprouvé sur la **source**
> (`scripts/check-recovery-link.test.mjs`, `scripts/check-user-messages.test.mjs`).
> À éprouver sur un appareil avant de communiquer le lien aux adhérents.

### Exigences sur les mots de passe

Trois des quatre refus possibles d'un mot de passe dépendent de réglages du
tableau de bord — **Authentication > Providers > Email** :

| Réglage                                            | Message du serveur                                          |
| -------------------------------------------------- | ----------------------------------------------------------- |
| _Minimum password length_                          | `Password should be at least N characters.`                 |
| _Password requirements_ (classes de caractères)    | `Password should contain at least one character of each: …` |
| _Prevent use of leaked passwords_ (HaveIBeenPwned) | `Password is known to be weak and easy to guess…`           |

Le quatrième ne dépend d'aucun réglage, et c'est le plus probable en pratique :
**GoTrue refuse tout mot de passe de plus de 72 unités, et les compte en octets**
(`len(password)` en Go, limite héritée de bcrypt). Un mot de passe accentué de 40
caractères dépasse donc la limite, et un gestionnaire de mots de passe en génère
facilement de cette longueur.

Les quatre refus ont une phrase qui dit quoi faire, dans `src/errors/index.ts` :
« réessayez » serait un conseil faux, puisque réessayer à l'identique échouerait
de même. La longueur minimale est la **seule** borne recopiée côté client, et
elle ne sert qu'à éviter un aller-retour réseau **là où le mot de passe est
choisi** — inscription, et choix d'un nouveau mot de passe ; les autres refus ne
sont pas anticipés volontairement, `maxLength` comptant des unités UTF-16 et non
des octets.

**Elle ne s'applique pas à la connexion, et c'est une règle mesurée.** GoTrue
**ne refuse pas** une connexion pour la longueur du mot de passe : dans
`internal/api/token.go` (`ResourceOwnerPasswordGrant`), la robustesse est
contrôlée **après** que le mot de passe a été reconnu correct, et le constat n'est
pas renvoyé en erreur — il voyage dans la réponse (`token.WeakPassword`), que
`signInWithPassword` expose en `data.weakPassword`. Le serveur vérifie donc un mot
de passe, il n'en juge pas la forme. Appliquée à la connexion, la borne ne pouvait
donc produire qu'un refus que le serveur n'aurait pas prononcé : un compte dont le
mot de passe est plus court que ce réglage — créé avant son durcissement, ou sous
un réglage plus permissif — était empêché d'entrer, avec une phrase affirmant
quelque chose de faux sur son propre mot de passe. `check-password-policy` tient
désormais la portée de la borne, et l'accord entre la garde et l'indication
affichée sous le champ — les deux se contredisaient.

> **Ce que la vérification automatique ne couvre pas.** Ce projet n'a pas de
> `supabase/config.toml` : ces réglages n'existent que dans le tableau de bord,
> donc **aucun test ne peut tenir l'accord** avec `MIN_PASSWORD_LENGTH`
> (`src/screens/ConnexionScreen.tsx`). La divergence dégrade proprement **là où la
> borne s'applique** — la règle de longueur substitue le nombre **du serveur**, et
> l'adhérent lit le bon chiffre — mais la borne locale ne vaut que ce que vaut ce
> réglage. À vérifier dans le tableau de bord avant de communiquer l'application
> aux adhérents.

> **Ce que le serveur dit sur un mot de passe qu'il vient d'accepter.** Une
> connexion réussie avec un mot de passe faible rend `data.weakPassword`, dont les
> raisons sont `length`, `characters` ou `pwned` — c'est ainsi que « Prevent use of
> leaked passwords » se manifeste. `signIn` les range dans l'état, et un bandeau
> les affiche **sous l'en-tête des onglets**, jusqu'à ce que l'adhérent le
> referme : la phrase ne peut pas se lire sur l'écran de connexion, qui est
> démonté dès la connexion réussie. La phrase française est composée dans
> `src/errors/index.ts` à partir des **raisons**, jamais du message anglais du
> serveur — et elle ne nomme aucun chiffre, le minimum exigé étant un réglage du
> tableau de bord que ce dépôt ne peut pas lire. Elle envoie vers le seul chemin
> de changement de mot de passe : « Mot de passe oublié ? », sur l'écran de
> connexion, après déconnexion — il n'existe pas d'écran « mon compte ».
> `check-weak-password` tient cet accord entre deux fichiers que rien ne relie.

### Confirmation d'inscription

**Réglages attendus : « Confirm email » activé** (`Authentication > Providers >
Email`), **et un SMTP personnalisé** renseigné dans `Authentication > SMTP
Settings`.

Les deux vont ensemble, et c'est le SMTP qui décide. La confirmation n'est utile
que si l'e-mail arrive : le service d'envoi fourni par défaut avec Supabase est
**limité à deux e-mails par heure** et destiné aux essais. Activée sans SMTP, elle
produit exactement le défaut qu'on cherchait à éviter — l'adhérent lit « un e-mail
de confirmation a été envoyé », attend un message qui ne viendra pas, et son
compte reste inutilisable. Personne n'est prévenu, ni lui ni le bureau. Le prix
est donc un compte SMTP, gratuit chez la plupart des fournisseurs.

L'application gère **les deux états**, ce qui rend le réglage réversible sans
toucher au code :

| État du réglage  | Ce que `signUp` rend | Ce que fait l'écran                            |
| ---------------- | -------------------- | ---------------------------------------------- |
| désactivé        | une **session**      | rien : le paquet a déjà notifié `SIGNED_IN`    |
| activé (attendu) | aucune session       | un message d'attente, et retour à la connexion |

**Trois réglages du tableau de bord, et sans eux le flux ne peut pas
fonctionner :**

1. **Authentication > SMTP Settings** — un serveur d'envoi. Sans lui, deux
   e-mails par heure, et rien d'autre ne le signale.
2. **Authentication > Providers > Email > Confirm email** — activé.
3. **Authentication > URL Configuration > Redirect URLs** — ajouter exactement
   `fcpefl://confirmation`, **en plus** de `fcpefl://reinitialisation`. Le chemin
   vient de `SIGNUP_REDIRECT_PATH` dans `src/auth/redirectPaths.ts`.

> **Ce que la vérification automatique ne couvre pas.** Ces trois réglages ne
> vivent que dans le tableau de bord — comme les exigences de mot de passe
> ci-dessus, aucun test ne peut tenir leur accord avec le code. Il n'existe pas
> de `supabase/config.toml` dans ce dépôt. À vérifier avant de communiquer
> l'application aux adhérents.

**L'adresse de retour est ce qui ramène l'adhérent dans l'application.** Sans
`emailRedirectTo`, `signUp` n'envoie aucun `redirect_to` et GoTrue retombe sur le
« Site URL » du tableau de bord : l'adhérent confirmerait son adresse dans un
navigateur, puis resterait devant une page web sans lien de retour.
`AuthProvider` passe donc `Linking.createURL(SIGNUP_REDIRECT_PATH)` à l'appel —
`check-recovery-link` tient les trois : la valeur de l'adresse, son accord avec
les deux documents qui la font enregistrer, et le fait que `signUp` la reçoive.

**Le clic confirme l'adresse, il ne connecte pas.** `detectSessionInUrl` vaut
`false` dans `src/config/supabase.ts` : la session arrive par le stockage, jamais
par un fragment d'URL. Le lien `fcpefl://confirmation#…&type=signup` n'ouvre donc
aucune session, et la confirmation a lieu côté serveur, au moment du clic. Le
message d'attente le dit déjà — « Ouvrez-le pour activer votre compte, puis
connectez-vous » — et un adhérent qui essaie avant de confirmer reçoit « Cette
adresse e-mail n'a pas encore été confirmée… ».

**Le retour dans l'application est annoncé, et c'est un correctif.** Rien ne
reconnaissait `type=signup` : l'adhérent qui cliquait voyait l'écran de connexion
s'ouvrir **sans aucune indication** que son clic avait fonctionné. `handleUrl`
reconnaît maintenant les deux issues, et elles occupent le **même** bandeau —
`linkMessage` — parce que deux champs distincts se seraient recouverts, et que
l'ordre d'affichage serait devenu une règle implicite que rien ne tiendrait :

| Ce que porte le lien     | Ce que l'adhérent lit                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| confirmation aboutie     | « Votre adresse est confirmée. Vous pouvez maintenant vous connecter. »                     |
| confirmation expirée     | « … Votre adresse n'est pas encore confirmée : demandez un nouvel e-mail de confirmation… » |
| réinitialisation expirée | « Demandez-en un nouveau depuis l'écran de connexion. »                                     |

`isEmailConfirmationLink` exige **trois** conditions, et chacune écarte un cas
réel : le `type`, un jeton d'accès — que GoTrue ne joint qu'après validation du
lien côté serveur, c'est la **preuve** de la confirmation — et **l'absence de
toute erreur**. Sans la troisième, un lien expiré annoncerait « votre adresse est
confirmée », soit l'inverse exact de la vérité. Le contrôle est donc plus strict
que nécessaire, et c'est voulu : un lien dont on ne saurait pas dire s'il a abouti
ne doit rien annoncer.

Le message est effacé **inconditionnellement** par une connexion réussie, comme
`weakPasswordReasons` et pour la même raison : le laisser ferait réapparaître
« Votre adresse est confirmée » à la connexion suivante, sur un écran qui n'a plus
rien à confirmer.

**Un lien de confirmation échoué a maintenant un remède dans l'application.** La
phrase dit d'en demander un nouveau, et l'écran de connexion porte le bouton qui
le fait : `AuthProvider.resendConfirmation` appelle `auth.resend({ type: 'signup',
email })` — vérifié dans la copie installée, `GoTrueClient.resend` et
`ResendParams`, qui n'admettent que `signup` ou `email_change` pour une adresse —
avec **la même** adresse de retour que l'inscription. Sans elle, le second e-mail
ramènerait l'adhérent dans un navigateur au lieu de l'application, et la
réparation du premier lien reproduirait son défaut.

> **Le serveur ne dit rien, et c'est ce qui rend la phrase de l'écran possible.**
> Dans la source de GoTrue (`supabase/auth`, `internal/api/resend.go`), les trois
> cas que l'écran ne peut pas distinguer répondent tous `200` avec un corps vide :
> adresse **inconnue**, adresse **déjà confirmée** — le renvoi est alors
> simplement sauté, « we don't need to send a confirmation email again » — et
> envoi effectif. Aucun ne porte d'erreur, aucun ne porte de session. L'écran peut
> donc écrire « **Si** une confirmation est en attente pour … », vrai dans les
> trois cas, au lieu d'affirmer un envoi qu'il n'a pas constaté. Un échec réel
> d'acheminement, lui, revient en erreur et s'affiche comme tel — ce n'est pas une
> fuite, c'est une panne.

Le bouton n'apparaît qu'en mode « connexion » : à l'inscription, le formulaire
vient d'envoyer l'e-mail, et un second bouton inviterait à le renvoyer aussitôt.
Le formulaire de renvoi vit dans `ConnexionScreen`, comme les quatre autres
visages de cet écran : c'est un mode de plus, pas un sixième écran.

**Un renvoi consomme le même quota que l'inscription.** Avec le service d'envoi
par défaut, c'est deux e-mails par heure pour tout le projet — la limite mesurée
du réglage, et non une conséquence du bouton. Une raison de plus de renseigner un
SMTP avant de communiquer l'application : un renvoi refusé pour cette raison
s'affiche comme une erreur, parce que c'en est une.

**Un des deux états ne se lit pas dans l'écran, et c'est ce qui le rend fragile.**
Dans l'état sans confirmation, `ConnexionScreen` n'appelle rien après une
inscription réussie : la connexion vient de `signUp`, qui prévient ses abonnés —
vérifié dans `@supabase/auth-js` 2.116.0 (`GoTrueClient.signUp`) :

```js
if (data.session) {
  await this._saveSession(data.session);
  await this._notifyAllSubscribers('SIGNED_IN', session);
}
```

`AuthProvider` écoute cet événement, `status` passe à `signedIn`, et
`RootNavigator` monte les onglets. La chaîne fonctionne, mais elle traverse trois
fichiers que rien ne relie — et le « correctif » qu'un lecteur appliquerait,
ajouter `await signIn(…)` dans la branche d'inscription, serait une **seconde**
authentification pour rien, qui enverrait en plus un `email not confirmed` à
l'adhérent venant de s'inscrire. `check-password-policy` tient donc les deux
bouts : la propriété du paquet est relue dans la copie **installée**, et aucun
appel de connexion ne doit se trouver dans la branche d'inscription.

## 5. Structure du projet

```
.
├── App.tsx                        SafeAreaProvider > AuthProvider > Navigation
├── index.ts                       point d'entrée Expo
├── types/globals.d.ts             typage des variables EXPO_PUBLIC_*
├── src/
│   ├── config/
│   │   ├── env.ts                 ★ lecture et validation des clés d'API
│   │   ├── supabase.ts            ★ construction du client
│   │   ├── storage.ts             session dans le Keychain / Keystore
│   │   └── preferences.ts         ce que l'application garde sur l'appareil
│   ├── auth/
│   │   ├── AuthProvider.tsx       état de session, connexion, inscription,
│   │   │                          réinitialisation, écoute des liens entrants
│   │   ├── redirectPaths.ts       ★ les adresses de retour vers l'application
│   │   └── recoveryLink.ts        ★ lecture des liens reçus par e-mail
│   ├── navigation/
│   │   ├── types.ts               paramètres de routes typés
│   │   ├── RootNavigator.tsx      connexion ⇄ application
│   │   ├── MainTabs.tsx           les cinq onglets, et la barre écrite à la main
│   │   └── PlusStack.tsx          les neuf routes rangées sous « Plus »
│   ├── screens/                   les quatorze écrans, et celui des clés absentes
│   ├── services/                  accès aux données, une fonction par requête
│   ├── components/                bibliothèque d'interface
│   ├── hooks/useAsyncData.ts      chargement avec états explicites
│   ├── errors/                    traduction des erreurs en français
│   ├── theme/                     jetons visuels, et styles par catégorie
│   ├── types/                     types de la base et du domaine
│   ├── utils/date.ts              formatage des dates
│   └── utils/pendingAction.ts     quand une action est encore en cours
├── supabase/                      migrations, seed, politiques RLS
├── scripts/
│   ├── check-sql.mjs              analyse syntaxique du SQL
│   ├── check-install-integrity.mjs  paquets installés à moitié extraits
│   ├── check-workflows.mjs        les flux GitHub : forme du YAML, épinglage, `bash -n`
│   ├── check-paquet.mjs           le contenu d'un paquet compilé : clefs, URL, fuites
│   ├── provenance-release.mjs     le texte d'une version : le commit de chaque binaire déposé
│   ├── alias-loader.mjs           résolution de « @/ » pour node:test
│   ├── register-alias.mjs         branchement du chargeur, avant les tests
│   ├── essai-postgres.mjs         la doublure de Supabase, partagée par les bancs qui exécutent
│   ├── stubs/                     doublures des paquets natifs, pour les tests
│   ├── check-env-guard.test.mjs   la garde sur les clés d'API
│   ├── check-recovery-link.test.mjs  les liens reçus, les ordres du flux, les adresses
│   ├── check-user-messages.test.mjs  les messages de l'adhérent, et l'ordre des règles
│   ├── check-dates.test.mjs       les dates civiles, les jours impossibles, les fuseaux
│   ├── check-rls-guards.test.mjs  les colonnes sous verrou, insertion comprise
│   ├── check-storage.test.mjs     le découpage des jetons, coupure par coupure
│   ├── check-effacement.test.mjs  ce qu'un effacement emporte, et ce qu'il épargne
│   ├── check-build-config.test.mjs  l'accord des versions, des permissions et des fins de ligne
│   ├── check-input-limits.test.mjs  les limites de saisie, alignées sur la base
│   ├── check-schema-types.test.mjs  le schéma SQL et son miroir TypeScript
│   ├── check-async-wiring.test.mjs  le câblage des écrans, la porte de l'état vide, les écrans orphelins
│   ├── check-contrast.test.mjs    les contrastes de la palette, et les jetons morts
│   ├── check-pending-action.test.mjs  l'indicateur d'action, jusqu'à la relecture
│   ├── check-password-policy.test.mjs  où s'applique la borne, et le chemin normal de l'inscription
│   ├── check-weak-password.test.mjs  le signalement d'un mot de passe faible, et sa place
│   ├── check-screen-modes.test.mjs  les cinq visages de l'écran de connexion, et leurs branches
│   ├── check-inventory.test.mjs   ce que le lanceur exécute, et ce que les deux documents en disent
│   ├── check-markdown-listes.test.mjs  les listes numérotées, et le bloc qui les casse en silence
│   ├── check-read-bounds.test.mjs  les lectures de liste, et la borne de chacune
│   ├── check-schema-refs.test.mjs  les renvois du schéma : clés, types, portées, seed.sql, new/old
│   ├── check-workflows.test.mjs   la fermeture de la liste des flux attendus
│   ├── check-paquet.test.mjs      un paquet sain passe, une clef en trop le fait tomber
│   ├── check-eas-vocabulary.test.mjs  les clefs de eas.json, contre le schéma d'EAS
│   ├── check-provenance-release.test.mjs  le texte d'une version : la phrase figée disparaît, un dépôt le remplace
│   ├── check-migration-rejouable.test.mjs  la migration, rejouable sans historique
│   ├── check-migration-applicable.test.mjs  la migration, exécutée contre un vrai PostgreSQL
│   ├── check-rls-comportement.test.mjs  les politiques RLS, jouées sous chaque rôle
│   ├── check-sdk-pins.test.mjs    les paquets installés, contre les épinglages du SDK
│   ├── check-scripts-executables.test.mjs  les commandes que `package.json` lance, et leur existence
│   ├── check-audit-scope.test.mjs  ce qui est livré, et ce qui est seulement construit
│   ├── check-parser-surface.test.mjs  les types de nœud que l'analyseur produit, et ce que les bancs en lisent
│   ├── check-non-lus.test.mjs     un chiffre affiché trois fois, et sa seule source
│   ├── check-safe-area.test.mjs   l'encoche, selon que l'écran a un en-tête ou non
│   └── check-acces-public.test.mjs  la surface publiée, jouée sous le rôle anonyme
└── .github/workflows/             CI, build EAS, IPA non signé
```

Les fichiers marqués ★ sont ceux à ouvrir en premier pour comprendre la
configuration.

### Quelques partis pris

**Un état de chargement dérivé, jamais poussé.** `useAsyncData` part de l'état
`loading` au premier rendu et ne le modifie que dans les retombées asynchrones.
Appeler `setLoading(true)` depuis un effet provoquerait un rendu intermédiaire
faux, et ESLint le refuse (`react-hooks/set-state-in-effect`) — la règle attrape
ici une vraie boucle de rendu.

**`exhaustive-deps` est élevé en erreur, alors qu'il est un avertissement.**
Mesuré : avec l'avertissement, retirer `resendConfirmation` des dépendances du
`useMemo` d'`AuthProvider` laissait `npm run lint` **sortir en succès**. Un
`useMemo` qui sert une fonction capturée ne se plaint jamais — il sert l'ancienne
—, et aucun banc de ce dépôt ne lit les dépendances d'un `useMemo` : la règle est
donc le seul endroit où cet accord se tient. Le reste de la configuration
recommandée est conservé tel quel, y compris `set-state-in-effect` et `purity`,
qui attrapent des défauts qu'aucun test ne verrait.

**`reload()` repasse par « chargement » — mais seulement s'il n'y a rien à
l'écran.** Les quatre écrans de liste passent `reload` au bouton « Réessayer »
de `AsyncFallback`, et l'appellent aussi après une écriture réussie (message
envoyé, signalement créé, réservation posée). Les deux usages veulent le
contraire : après une erreur il faut montrer que la tentative part, après une
écriture il ne faut pas faire disparaître ce qui vient d'être envoyé. D'où la
condition sur `data` : `null` signifie qu'il n'y a rien à préserver.

**La session dans le Keychain, pas dans AsyncStorage.** `expo-secure-store`
chiffre les jetons par le matériel. La documentation d'Expo annonce une limite
de 2048 octets sur Android et une session Supabase la dépasse, donc `storage.ts`
la découpe en fragments et écrit l'index **en dernier** : un enregistrement
interrompu laisse une session illisible, ce qui se répare en se reconnectant,
plutôt qu'une session tronquée, qui produit des erreurs incompréhensibles.

Cette limite n'est toutefois **plus appliquée** par la version installée
(expo-secure-store 57.0.4) : aucun test de longueur dans le paquet, et le chemin
Android par défaut n'a pas de limite de bloc. Le découpage est conservé parce
qu'il fonctionne et que le retirer ferait dépendre la connexion d'une mesure
faite sur une seule version — pas parce qu'il serait nécessaire.

**Les erreurs traduites à un seul endroit.** `src/errors/` transforme « Invalid
login credentials » ou « new row violates row-level security policy » en
phrases françaises. Le message d'origine est conservé dans `technicalDetail` et
n'apparaît qu'en développement : il décrit la structure de la base.

**Flux d'authentification implicite.** Le flux PKCE, recommandé pour OAuth,
exige `crypto.subtle` que Hermes n'expose pas ; la bibliothèque se rabattrait
silencieusement sur une vérification « plain », moins sûre que le flux
implicite, pour un bénéfice nul tant que l'authentification se limite à
e-mail + mot de passe. Voir le commentaire dans `src/config/supabase.ts` avant
d'ajouter une connexion Google ou Apple.

## 6. Vérification avant de pousser

```bash
npm run verify
```

Enchaîne le formatage, ESLint, les types, les tests, l'analyse du SQL et — le
contrôle qui compte le plus — `expo export --platform android`. **L'export est le
seul qui prouve que tous les modules se résolvent réellement dans le bundle** :
ni `tsc` ni ESLint ne détectent un import vers un fichier absent ou un module
natif mal déclaré. C'est aussi exactement ce que fait la CI.

Contrôles pris isolément :

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run check:install
npm run sql:check
npm run export:android
```

### Intégrité de l'installation

`npm run check:install` parcourt les paquets installés et vérifie que le point
d'entrée déclaré par chacun existe réellement.

Ce contrôle existe parce qu'une installation interrompue — coupure réseau, arrêt
du processus — laisse des paquets **à moitié extraits** : le dossier existe,
`package.json` annonce une version conforme au lockfile, et `npm install`
considère donc le paquet comme valide alors que `dist/index.js` n'a jamais été
écrit. Ni `npm ls` ni `npm ci` ne le détectent : le premier valide l'arbre des
versions, le second fait confiance à ce qu'il trouve. L'erreur ne se manifeste
qu'au moment du bundle, sous la forme `Cannot find module … dist/index.js`, en
désignant un paquet dont le `package.json` est pourtant correct.

Quand ce contrôle signale quelque chose, la réparation est une réinstallation
complète — `npm ci` après avoir déplacé `node_modules`, et non `npm install`, qui
ne retélécharge pas un paquet dont la version correspond déjà.

Ce contrôle a une limite qu'il faut connaître : il ne voit que les points
d'entrée. Un paquet peut être complet du point de vue de JavaScript et avoir
perdu ses fichiers natifs (`android/`, `ios/`) — invisibles à l'export, mais
fatals à la compilation EAS. Seule une réinstallation depuis le lockfile donne
cette garantie.

### Tests

Sans dépendance : `node:test` est intégré à Node, et le _type stripping_ de
Node 22 permet d'importer directement un fichier `.ts`. Rien à installer, rien à
configurer, et aucun risque qu'un exécuteur de tests prenne du retard sur la
version de Node.

```bash
npm run test          # découvre scripts/**/*.test.mjs
```

Le premier test porte sur `src/config/env.ts`, et il vaut la peine d'expliquer
pourquoi il est écrit ainsi. La garde refuse une clé `service_role` en lisant le
rôle dans la charge utile du JWT — or une charge utile est encodée en
**base64url**, dont l'alphabet remplace `+` par `-` et `/` par `_`. Une version
qui utilisait l'alphabet base64 standard renvoyait `null` sur une charge utile
contenant l'un de ces deux caractères, et la garde **laissait alors passer la
clé sans rien signaler** : une protection qui échoue précisément quand elle sert.

Le test refuse donc de s'exécuter sur une charge utile qui ne contient ni `-` ni
`_`, puisque celle-là ne prouverait rien. C'est ce qui distingue un test qui
vérifie d'un test qui décore.

**Le chargeur d'alias.** `node:test` ne lit pas les `paths` de `tsconfig.json` :
sans `scripts/alias-loader.mjs`, un test ne pouvait importer que les rares
modules sans dépendance interne — `src/config/env.ts`, et c'est tout. Le
chargeur comble l'écart en s'appuyant sur `node:module`, intégré à Node, donc
sans paquet à installer. Il a ouvert au test tout `src/`, ce qui était la
condition pour vérifier la traduction des erreurs.

**`check-user-messages` mérite un mot**, parce que son premier test décrit un
défaut plutôt qu'une protection. `appErrorMessage` part du principe qu'une
chaîne reçue est un message technique anglais à traduire, et qu'à défaut de règle
correspondante il faut afficher un message générique — c'est ce qui empêche un
« duplicate key value violates unique constraint » d'atteindre un adhérent. Le
revers est piégeux, et il s'était produit six fois : une phrase française écrite
dans un écran était prise pour un message technique non reconnu et **remplacée**
par « Une erreur inattendue est survenue. Réessayez dans quelques instants. » —
un conseil faux, puisque réessayer avec le même champ vide échoue identiquement.
Les phrases sont désormais marquées par `userMessage()`, et le test vérifie les
deux côtés : qu'une phrase marquée est préservée, et qu'un message technique reste
traduit.

Le piège s'est reproduit une seconde fois, et **à l'affichage** — donc sans
qu'aucun écran n'ait rien écrit de travers. `useAsyncData` range dans
`errorMessage` le résultat d'un premier `appErrorMessage` ; `AsyncFallback` le
remet à un `ErrorNotice`, qui en applique un second, ne reconnaît aucune règle, et
remplace la phrase. Le message d'un lien expiré, produit par
`describeLinkError`, subissait le même sort : l'adhérent lisait « Une erreur
inattendue est survenue. Réessayez… » au lieu de « demandez un nouveau lien ».
Mesuré sur cinq phrases, toutes perdues. Chaque message déjà rédigé est donc
marqué à la frontière d'affichage, et deux tests couvrent la **composition** des
modules — ce qu'aucun ne faisait : chacun ne vérifiait qu'un module isolé, et le
défaut vivait précisément entre les deux. Un test de forme lit en outre les
composants pour refuser toute phrase déjà traduite remise à `ErrorNotice` sans
marquage : il est nécessaire, puisqu'aucun rendu n'est disponible ici pour
l'établir autrement.

Restait le fichier qui décide de la traduction, et il portait un défaut de la
même famille. Ses règles sont réparties en trois familles, la dernière —
`NETWORK_RULES` — étant la plus générique : son motif contient `timeout` seul.
Un message **PostgreSQL**, « canceling statement due to statement timeout »,
tombait donc sur la règle réseau, et l'adhérent lisait « Vérifiez votre connexion
internet » alors que sa connexion fonctionnait et que la requête avait seulement
été trop longue. Le défaut n'était pas l'ordre : c'était une règle manquante, que
l'ordre rendait invisible. La règle de délai serveur existe désormais, et elle est
placée dans `DATABASE_RULES` — donc évaluée **avant** la famille réseau, ce qui
donne enfin un contenu à cette contrainte d'ordre.

Trois tests tiennent l'ensemble. Le premier lit les règles **dans leur source**
(commentaires retirés, sans quoi le mot `timeout` de la documentation se ferait
compter comme une règle), associe à chacune un message technique représentatif, et
exige que la _première_ règle qui correspond soit bien la sienne : c'est l'ordre
qui est mesuré là, par son effet. Le second vérifie qu'aucun `$n` d'un message ne
dépasse les groupes capturés de son motif, et qu'à l'affichage la valeur capturée
se retrouve bien dans la phrase — sans quoi un remplacement par la chaîne vide
passerait pour un remplissage réussi, la phrase serait propre et trouée. Ajouter
une règle sans lui donner d'exemplaire fait échouer le banc, et un recouvrement
non prévu aussi : un recouvrement est une décision, pas un accident.

**Le troisième va dans l'autre sens, et c'est celui qui manquait.** Les deux
premiers partent des règles et leur cherchent un message : ils ne peuvent donc
pas voir une règle **absente**. Le troisième prend le corpus des refus que GoTrue
peut réellement renvoyer — relevés dans sa source — et exige que **chacun** reçoive
une phrase, c'est-à-dire autre chose que le message générique. Trois refus de mot
de passe manquaient : les classes de caractères, la présence du mot de passe dans
un corpus de fuites (HaveIBeenPwned), et surtout la **limite dure de bcrypt**, la
seule qui ne dépende d'aucune case cochée dans le tableau de bord. Un adhérent dont
le gestionnaire de mots de passe générait une phrase de passe de plus de 72 octets
lisait « Une erreur inattendue est survenue. Réessayez dans quelques instants. » —
un conseil qui ne peut pas aboutir. Mesuré : en remettant le dépôt dans son état
antérieur, **seul ce troisième test tombe**, et il nomme les trois messages ; les
deux autres restent verts, ce qui est la preuve que le défaut leur était invisible.

**`check-input-limits` est né d'un défaut qui n'était pas dans le code, mais entre
deux fichiers.** La base borne la longueur de trois colonnes que l'adhérent
saisit : `profiles.display_name` (80), `signalements.subject` (160) et
`discussion_messages.body` (2000). L'application n'en bornait qu'une. Mesuré : un
nom affiché de 81 caractères faisait échouer l'insertion du profil **à l'intérieur
du déclencheur** `handle_new_user()`, donc la création du compte entier — même
transaction. GoTrue renvoyait « Database error saving new user », que l'adhérent
lisait sous forme de message générique invitant à **réessayer**, alors que le nom
était la cause. Un objet de signalement de 161 caractères, lui, valait « La valeur
envoyée n'est pas acceptée par le serveur » : vrai, et inutilisable.

Le banc lit la borne **dans la migration** et la constante **dans l'écran**, puis
exige qu'elles s'accordent — et que la constante soit réellement posée sur un
champ, car une limite déclarée mais appliquée nulle part ne borne rien. Il tient
aussi la complétude : une colonne bornée qui apparaîtrait dans la migration sans
être déclarée fait échouer le banc. Et la seule colonne bornée que l'application
n'écrit pas — `annonces.title`, publiée par le bureau hors de l'application — est
vérifiée comme telle : le jour où un écran publiera une annonce, il lui faudra
borner son titre.

**`check-async-wiring` est né d'une phrase entre parenthèses.** Le commentaire
d'`AsyncErrorBanner` affirme, pour justifier qu'il ne propose pas de bouton :

> « Pour recharger, l'adhérent tire la liste vers le bas : `refresh` est déjà
> branché sur le `RefreshControl` de **chaque écran**. »

Voilà une affirmation **universelle** — « de chaque écran » — que personne ne
vérifiait. Elle est vraie aujourd'hui ; le banc la tient. Un écran qui oublierait
ce câblage laisserait l'adhérent sans recours : le bandeau d'erreur le renvoie à un
geste qui ne ferait rien, et une erreur survenue alors que du contenu est affiché
deviendrait définitive.

Le fichier tient quatre promesses du même genre, et celle des écritures est la plus
utile : un écran qui écrit doit **relire sa liste**, sans quoi l'adhérent voit son
action réussir et rien apparaître — il recommence, et crée un doublon. Les fonctions
d'écriture n'y sont pas listées : elles sont **déduites des services**, en relevant
celles dont le corps touche à la base. Un nouveau service d'écriture entre donc
dans le champ du test sans qu'on y pense, et l'éprouver est un scénario à part
entière — un lecteur transformé en écrivain fait entrer son écran dans le champ du
banc tout seul.

**Sa quatrième promesse est une porte, et elle était ouverte.** Le commentaire de
`useAsyncData` justifiait la conservation de `data` en cas d'échec par « les écrans
affichent `AsyncErrorBanner` au-dessus de la liste, et `AsyncFallback` laisse la
liste en place puisque `hasData` reste vrai ». Or `hasData` n'est **jamais** vrai
là où `AsyncFallback` est rendu : les quatre écrans le placent dans un
`ListEmptyComponent`, ou derrière un `length === 0 ? … : …`. Ce qui préserve
l'affichage n'est donc pas un état transmis, c'est l'**absence de montage** — et
cette absence n'était tenue par rien. Un `AsyncFallback` déplacé à côté de la
liste remplacerait le contenu affiché par un écran d'erreur dès qu'un
rafraîchissement échoue. Le banc exige désormais que chaque `AsyncFallback` reste
derrière une garde de vacuité, et que rien ne soit **rendu** avant lui dans sa
branche — sans quoi un `ListEmptyComponent` posé ailleurs dans le fichier
blanchirait l'appel.

Ce contrôle a d'abord lu le **texte**, et refusé qu'un élément soit ouvert puis
refermé entre la garde et le repli. C'était un proxy de la propriété, et il a
produit un faux positif dès qu'un envoi en cours a ajouté une seconde branche au
même endroit :

```tsx
messages.length === 0 ? envoiEnCours ? <Attente /> : <AsyncFallback /> : <Liste />;
```

Le repli est bien sous la garde de vacuité, et le motif le déclarait fautif. **Un
banc qui tombe sur du code juste est un défaut du banc** : la propriété est
structurelle, l'outil devait l'être aussi. Le contrôle lit maintenant l'**arbre
syntaxique** produit par le compilateur TypeScript — le même choix que les relevés
de schéma, qui lisent l'AST depuis la passe 49 — et remonte la chaîne des gardes
qui enserrent le repli : ternaires, `&&`, `ListEmptyComponent`. Cette chaîne a été
**mesurée** sur les quatre écrans avant d'être écrite, jamais déduite.

Éprouvé dans les deux sens, sept scénarios : une garde qui cesse de tester la
vacuité, l'emplacement dédié remplacé par un autre, un élément rendu avant le repli,
et la règle de vacuité rendue toujours vraie font tomber un test chacun ; la garde
écrite par sa négation (`!messages.length`), le ternaire sans parenthèses et un
simple commentaire avant le repli le laissent vert. Le couple qui compte est le
dernier : la **même** transformation structurelle fait tomber le banc avec un
élément rendu, et pas avec un commentaire — un commentaire JSX est un nœud de
l'arbre qui ne rend rien.

Deux formulations restent hors de portée, et le banc le dit plutôt que de le
laisser croire : un test de vacuité rangé dans une variable, et un test de véracité
dont le repli occupe la branche fausse. Aucune n'existe dans le projet ; toutes
deux feraient tomber le contrôle sur du code juste, et c'est écrit à l'endroit où
il faudra le corriger.

**Sa cinquième promesse est née d'une fausse alerte, et c'est ce qui la rend
utile.** En cherchant qui montait `ConfigurationScreen`, le relevé ne portait que
sur `src/` : il répondait qu'aucune route ne l'atteignait. Le défaut n'existait
pas — `App.tsx`, à la racine, le monte — mais la conclusion était fausse, et elle
avait l'assurance d'une conclusion vraie. C'est la même famille que le piège des
commentaires : **une recherche dont la portée est trop étroite ne rend pas une
réponse incomplète, elle rend une réponse fausse.** Le banc qui suit a donc la
bonne portée — `src/`, plus `App.tsx` et `index.ts`, les deux fichiers de la racine
qui montent le reste — et il tient une propriété qu'aucun autre ne voyait : **aucun
écran n'est orphelin**. Un écran que rien ne monte passe le typage, le lint, le
contrôle des contrastes et tous les autres bancs, et il reste mort. Le dossier est
la source de vérité, donc un écran ajouté entre dans le contrôle sans qu'on y
pense.

Falsifié en cinq scénarios. Deux retirent le montage (`App.tsx` n'importe plus
l'écran de secours, `MainTabs` ne monte plus la discussion) et font tomber le test
en nommant l'écran. Un troisième est celui qui compte : il retire le montage **et
laisse un commentaire qui nomme l'écran** — le test tombe quand même, ce qui prouve
qu'il ne lit pas la prose. Les deux derniers vérifient qu'un commentaire ajouté à
côté d'un montage réel ne le fait pas tomber.

**Un écran qui exige une session se garde, ou dit pourquoi il ne le fait pas.**
`useCurrentUserId()` **lève** quand il n'y a pas de session, et c'est sa raison
d'être : il évite de parsemer les écrans de `session?.user.id ?? ''`, qui
produirait des requêtes silencieusement vides si la garantie tombait. Mais un écran
qui l'appelle sans regarder la session **plante** dès qu'un chemin d'accès l'atteint
sans être connecté — et le défaut n'était pas théorique : la discussion appelait ce
hook, et la cloche de l'accueil y mène **sans condition** depuis que l'application
s'ouvre aux familles sans compte. Le corriger a demandé de séparer l'aiguillage du
salon ; le banc, lui, exige que chaque appelant se garde, ou figure dans une liste
**fermée** avec la raison qui rend le cas impossible.

Sa première version était fausse, et la falsification l'a dit : elle cherchait la
comparaison n'importe où dans le fichier, et le message affiché lui-même
(`{session === null ? … : …}`) la satisfaisait. Retirer la garde laissait le
contrôle **vert**. Il lit donc l'**arbre** — une garde est une instruction `if` — et
son motif **nomme** `session` sans exiger d'orthographe, pour ne pas tomber sur une
remise en forme juste (`!session`). Éprouvé dans les deux sens.

**`check-pending-action` prolonge la promesse précédente, et il est né d'une mesure.**
« Un écran qui écrit relit sa liste » ne dit pas **combien de temps** l'indicateur
qui annonce l'action doit rester allumé. Or `reload()` ne rend pas la main : il
déclenche une relecture. Le `finally` du gestionnaire relâchait donc le marqueur
dès la fin de l'écriture, **avant** l'arrivée de la liste relue.

Mesure faite en modélisant la machine à états de l'écran Cantine — le libellé du
bouton et l'indicateur, étape par étape :

| étape                                   | libellé                    | indicateur                             |
| --------------------------------------- | -------------------------- | -------------------------------------- |
| avant l'appui                           | « Réserver »               | éteint                                 |
| appui (insertion en vol)                | « Réserver »               | **allumé**                             |
| insertion réussie, relecture **en vol** | « Réserver »               | **éteint** ← identique à l'avant-appui |
| relecture atterrie                      | « Annuler ma réservation » | éteint                                 |

La troisième ligne est le défaut : pendant tout l'aller-retour, l'écran était
**exactement celui d'avant l'appui**. L'adhérent lisait « Réserver » sur un repas
qu'il venait de réserver, appuyait de nouveau, et l'insertion en double était
absorbée par la contrainte d'unicité — donc **aucun effet, et aucun signe** que
son premier appui avait été accepté. Sur une connexion lente, la fenêtre dure
plusieurs secondes.

La règle tient en une idée : l'action est en cours **tant que les données
affichées sont celles qui l'étaient au moment de l'appui**. C'est une comparaison
de **référence**, jamais de valeur — `useAsyncData` produit un objet neuf à chaque
chargement réussi, donc aucune supposition n'est faite sur ce que le serveur va
renvoyer. Deux conséquences voulues : une relecture **en échec** éteint
l'indicateur (sinon il tournerait indéfiniment, `data` conservant sa référence),
et un chargeur qui **mémoïserait** son résultat casserait le signal — la seule
condition de validité du module, écrite dans son en-tête et rendue visible par un
test plutôt que laissée dans un commentaire.

Le banc tient les deux niveaux : les quatre cas de la règle, et un test de
**forme** sur l'écran — le marqueur doit être **dérivé** de l'état chargé, et le
bloc d'écriture qui appelle `reload()` ne doit contenir aucun `finally`. Falsifié
en cinq scénarios : relâcher dans un `finally` fait tomber le test de forme ;
revenir à un second marqueur fait tomber l'autre (les deux sont complémentaires) ;
une règle qui cesse de regarder la référence fait tomber **deux** cas ; la
disparition de la branche d'échec en fait tomber un.

**Le contrôle inverse a d'abord échoué**, et c'est ce qui a corrigé le banc :
extraire l'appel dans une variable intermédiaire — une remise en forme correcte —
le faisait tomber, parce qu'il exigeait la ligne à l'octet près. L'invariant porte
sur l'**origine** du marqueur, pas sur la forme de l'affectation.

Enfin, **un seul écran relâche tôt, et c'est délibéré** : le formulaire de
signalement se referme, donc son bouton « Envoyer » disparaît et l'action ne peut
pas être rejouée pendant la relecture. Ce justificatif est écrit dans le fichier
**et** vérifié par le banc — sans quoi l'exception deviendrait fausse en silence.

La discussion, elle, relâchait tôt **pour la même raison apparente**, et c'était
faux. Audit du parcours, même méthode que la cantine : le brouillon vidé empêche de
rejouer le **même** texte, pas d'en écrire un autre — et l'écran proposait
explicitement de le faire. Modèle d'état, salon vide, quatre instants :

| étape                | zone de liste                                                     | invitation | envoi bloqué |
| -------------------- | ----------------------------------------------------------------- | ---------- | ------------ |
| avant l'appui        | « Aucun message / Ouvrez la discussion en écrivant le premier … » | oui        | non          |
| insertion en vol     | la même invitation                                                | oui        | oui          |
| relecture **en vol** | la même invitation                                                | oui        | **non**      |
| relecture atterrie   | liste : 1 message                                                 | non        | non          |

La troisième ligne est le défaut, et la deuxième en est un second : le serveur
avait accepté le message, le champ était vide, et l'écran proposait d'écrire le
premier. Aucune contrainte d'unicité n'absorbe ce doublon — `discussion_messages`
n'en a pas — et le second message part chez **tous** les membres.

Le correctif ne rend pas l'affichage optimiste pour autant : montrer la bulle avant
la relecture mentirait dès qu'une politique RLS refuse l'insertion, ce que la
cantine a déjà tranché. L'envoi est donc couvert **jusqu'à la relecture**, par deux
mécanismes parce qu'aucun ne suffit seul — `sending` couvre l'aller-retour de
l'insertion, `pendingTarget` prend le relais, et le second est inerte dès l'appui
quand le statut est déjà en erreur, alors que le compositeur reste à l'écran. Et
l'état vide cède la place à une attente tant que l'envoi dure.

**Le banc tenait le défaut en place.** Son assertion
`canSend = draft.trim() !== '' && !sending` épinglait la forme fautive elle-même :
elle a dû être réécrite, et ce changement est un résultat de l'audit, pas une
conséquence. Falsifié en huit scénarios — cinq mutations font tomber un test
chacune, trois remises en forme légitimes (prédicat coupé sur deux lignes, marqueur
extrait dans une variable, libellé de l'attente reformulé) le laissent vert.

**Une limite est nommée, pas cachée** : `pendingTarget` relâche le marqueur sur une
relecture en échec, sans quoi l'indicateur tournerait sans fin. Le compositeur
rouvre donc pendant la relecture quand le statut était **déjà** en erreur au moment
de l'appui avec du contenu affiché. Le cas est mesuré, laissé ouvert — un
indicateur éternel serait pire — et écrit dans l'en-tête du banc.

**`check-password-policy` est né d'une règle écrite deux fois, dans deux portées.**
`MIN_PASSWORD_LENGTH` recopie un réglage qui ne vit pas dans ce dépôt, donc son
accord avec le tableau de bord ne peut être tenu par aucun test. Sa **portée**, en
revanche, est vérifiable — et elle était fausse. L'indication affichée sous le
champ de connexion était déjà conditionnée :

```tsx
hint={isSignUp ? `Au moins ${MIN_PASSWORD_LENGTH} caractères.` : null}
```

tandis que la garde du gestionnaire, qui sert **à la fois** l'inscription et la
connexion, ne l'était pas. Une même règle, deux portées.

Ce que cela coûtait, une fois la sémantique du serveur lue plutôt que supposée :
GoTrue **ne refuse pas** une connexion pour la longueur du mot de passe. Dans
`internal/api/token.go` (`ResourceOwnerPasswordGrant`), la robustesse est contrôlée
**après** que le mot de passe a été reconnu correct, et le constat n'est pas renvoyé
en erreur — il voyage dans la réponse (`token.WeakPassword`), que
`signInWithPassword` expose en `data.weakPassword`. Le serveur **vérifie** un mot de
passe, il n'en juge pas la forme. Mesuré aussi côté client : `auth-js` ne valide
**rien** (`GoTrueClient.js` ne contient aucune comparaison de longueur) — la borne
d'ici était donc la seule, et la seule fautive.

Conséquence : appliquée à la connexion, elle ne pouvait produire qu'un refus que le
serveur n'aurait pas prononcé. Un compte dont le mot de passe est plus court que le
réglage — créé avant son durcissement, ou sous un réglage plus permissif — était
**empêché d'entrer**, avec une phrase affirmant quelque chose de faux sur son propre
mot de passe. C'est la famille déjà rencontrée deux fois : une phrase fausse, qui
invite à réparer ce qui fonctionne.

**Un cinquième contrôle est venu du chemin normal de l'inscription, et il ne
concerne pas la borne.** La confirmation par e-mail étant désactivée (voir §4),
`signUp` rend une session, et l'écran n'appelle alors **rien** : le paquet notifie
`SIGNED_IN`, `AuthProvider` bascule `status`, `RootNavigator` monte les onglets.
Trois fichiers que rien ne relie — et le « correctif » qu'un lecteur appliquerait,
ajouter `await signIn(…)` dans la branche d'inscription, serait une **seconde**
authentification pour rien. Le banc relit donc la propriété du paquet dans la copie
**installée** (`GoTrueClient.signUp` :
`if (data.session) { … _notifyAllSubscribers('SIGNED_IN', session) }`) et exige
qu'aucun appel de connexion ne se trouve dans la branche d'inscription.

Détail d'écriture qui a son importance : l'ancre de fin du bloc est `} else {`, et
**non** l'appel à `signIn`. Une ancre posée sur l'appel prendrait pour fin de bloc
celui-là même qu'on veut attraper, et le contrôle serait aveugle exactement là où
il compte. Falsifié en quatre scénarios, dont deux qui mutent le paquet installé —
sans `SIGNED_IN`, ou sans sa condition de session, le banc tombe. Le quatrième
vérifie qu'un commentaire **mentionnant** `signIn(` ne le fait pas tomber : le banc
ne lit pas la prose.

Le banc tient quatre choses : la borne reste inconditionnelle là où le mot de passe
est **choisi** ; elle n'est pas appliquée là où il est **présenté** ; l'indication
et la garde portent la **même portée** — c'est leur divergence qui a produit le
défaut, et rien ne les relie dans le code ; et l'ensemble des emplois de la borne
est **fermé**, un troisième devant faire échouer le banc plutôt que s'ajouter en
silence.

Falsifié en cinq scénarios : rétablir la garde à la connexion tombe sur le test de
portée ; rendre l'indication inconditionnelle tombe sur celui de l'accord ; ajouter
un troisième emploi tombe sur la fermeture ; retirer la borne du choix d'un nouveau
mot de passe tombe sur **deux** tests (retirer le seul emploi restant fait aussi
baisser le compte — recouvrement justifié). Et le **contrôle inverse** — échanger
l'ordre des opérandes de la condition — reste vert, après que l'assertion a été
rendue tolérante à cette remise en forme : elle exigeait `isSignUp &&` en premier,
ce qui mesurait l'écriture et non l'invariant.

**`check-weak-password` est né d'un signal lu puis jeté.** `signIn` écrivait
`const { error } = await …signInWithPassword(…)` : la réponse était lue pour son
erreur seule, et le reste abandonné. Or GoTrue joint à une connexion **réussie** un
constat sur le mot de passe qu'il vient d'accepter — `data.weakPassword`, dont les
raisons sont `length`, `characters` ou `pwned`. Rien d'autre ne pouvait le
rapporter : pas une erreur, puisqu'il n'y en a pas, et pas un écran, puisqu'il
n'existe pas d'écran « mon compte ». Un adhérent dont le mot de passe ne respecte
plus la politique en vigueur ne l'aurait jamais su.

Le bandeau se place **sous l'en-tête**, et le banc vérifie la propriété du paquet
de navigation sur laquelle ce placement repose au lieu de la supposer : dans
`@react-navigation/bottom-tabs` 7.x (`views/BottomTabView.tsx`), l'en-tête est
passé en **prop** à `<Screen header={…}>` tandis que le contenu — ce que
`screenLayout` enveloppe — est rendu en `children` du même `<Screen>`, et le
`SceneView` du cœur ne rend aucun `<Header>`. Envelopper `MainTabs` de l'extérieur
aurait posé le bandeau **au-dessus** de l'en-tête, et sous l'encoche, que `Screen`
protège déjà. Une mise à jour du paquet qui déplacerait l'en-tête fait donc tomber
le banc, et non l'interface.

La table de traduction est un **ensemble fermé**, comparé à la source du serveur
(`checkPasswordStrength`, `internal/api/password.go`) et non à elle-même : les
trois `append` y sont uniques, chacune apparaît donc au plus une fois. Une
quatrième raison ajoutée ici fait tomber le banc. Et une raison **inconnue** fait
basculer la phrase entière sur la formule générique, plutôt que de garder les
raisons qu'elle connaît et d'annoncer un constat incomplet comme s'il était
complet.

Falsifié en **onze** scénarios — sept défauts, un par test visé : rétablir le
`const { error }` d'origine ; retirer le marquage `userMessage` du bandeau ;
ajouter une quatrième raison à la table ; ignorer une raison inconnue au lieu de
replier la phrase ; renommer le bouton que la phrase nomme ; monter le bandeau
depuis un écran ; rendre la coque conditionnelle. Quatre remises en forme
**légitimes** restent vertes : extraire la valeur dans une variable, retourner le
ternaire de l'écouteur, sortir la phrase dans une constante avant de l'afficher,
extraire le bandeau dans une constante.

**Et le bandeau a été audité comme un chemin neuf — la coque elle-même était
fausse.** Sa première version retournait un **Fragment** quand il n'y avait rien à
signaler, et une **View** sinon. React réconcilie par **type** à une position
donnée : deux types différents, et il **démonte** le sous-arbre au lieu de le mettre
à jour. Deux conséquences, toutes deux invisibles sur une capture d'écran : fermer
le bandeau remontait l'écran **sous** lui — données rechargées, brouillon de la
discussion perdu —, et à la connexion les écrans se montaient **deux fois**, une
fois sans le bandeau puis une fois avec, donc deux chargements pour une seule
arrivée. Le retour est désormais unique et la forme fixe : seule la place du bandeau
varie. Le banc mesure cette forme — aucun moteur de rendu n'est installé, donc c'est
la **structure** qui est l'invariant — et il est volontairement strict : un second
`return` est exactement la forme qui rouvre le défaut.

**`check-contrast` est né d'un vide : rien dans ce dépôt ne mesurait une couleur.**
`src/theme/index.ts` portait un en-tête qui présentait la palette comme un jeu de
teintes choisies à l'œil, et un contraste insuffisant ne produit **aucun signal** —
ni exception, ni avertissement de lint, ni différence visible pour qui n'a pas une
vue normale. C'est un défaut qui ne se manifeste que chez l'adhérent qui n'arrive
pas à lire. Le banc lit donc la palette **dans le thème** — jamais recopiée — et
mesure 26 associations réellement présentes dans l'application, en luminance
relative selon WCAG 2.x. Le seuil n'est pas fixe : il se déduit de la taille et de
la graisse lues elles aussi dans le thème, puisque WCAG demande 4,5:1 pour un texte
ordinaire mais 3:1 au-delà de 24 px, ou 18,66 px en gras.

Mesure faite : **cinq associations échouaient**, dont trois vivantes. Le libellé
d'un bouton primaire occupé tombait à **1,55:1** sur son propre fond — le code
appliquait `opacity: 0.5` aux deux cas par une variable qui valait
`disabled || loading`, si bien qu'au moment précis où l'adhérent attend une
confirmation, le mot « Enregistrement… » devenait illisible ; c'est un défaut
d'autant plus vicieux qu'il n'apparaît que pendant la requête. La bordure d'un
champ de saisie valait **1,26:1** sur une carte blanche, alors qu'elle est la seule
chose qui délimite ce champ. Le statut « Nouveau » d'un signalement tenait 4,24:1,
juste sous le seuil. Les deux autres étaient latentes : un ton `success` qu'aucun
appelant n'utilise, et un libellé cité dans un commentaire qu'aucun écran ne passe.

Les corrections sont allées dans la palette et non dans les écrans : `warning` et
`success` assombris, un jeton `borderInteractive` ajouté pour les bordures qui
doivent se voir, l'apparence grisée réservée au seul cas `disabled`, et **trois
jetons morts retirés** — `primaryPressed`, `warningSoft` et un type `ColorName`
dont plus rien ne dépendait. Le banc tient cette dernière règle dans l'autre sens :
un jeton que plus personne n'emploie fait échouer la suite, sans quoi la palette
grossirait d'entrées que personne ne peut citer. Un cinquième test est un test de
**forme**, et il a dû être réécrit pour prouver quelque chose : il exige que
l'apparence du bouton ne dépende pas de `loading`. Sa première version cherchait le
mot `disabled` dans la garde du style grisé, et `styles.disabled` le lui fournissait
à lui seul — un scénario fautif passait donc sans être vu. La version retenue
localise l'élément grisé par son `opacity: 0.5` et vérifie **sa** condition.

Le piège du dépouillement des commentaires s'est refermé une cinquième fois ici, et
sur un commentaire que je venais d'écrire : le mot `loading` cité dans une phrase
explicative comptait comme une dépendance du style. Le fichier retire donc les
commentaires **avant** toute extraction, comme les autres bancs.

**`check-schema-types` ferme la chaîne, et il ne corrige rien.** `src/types/database.ts`
est écrit **à la main** — le dépôt doit compiler sans la CLI Supabase — et son
en-tête porte un contrat : « Toute modification du SQL doit être répercutée ici
dans le même commit : TypeScript ne voit pas la base, un écart entre les deux ne
se manifesterait qu'à l'exécution, sur l'appareil. » Ce contrat n'était vérifié
par personne. Mesuré : les deux s'accordent aujourd'hui, colonne par colonne,
nullabilité comprise. Le banc ne corrige donc rien — il empêche la dérive, et il
tient les trois écarts qui ne font aucun bruit : une valeur d'énumération ajoutée
en SQL et absente du miroir fait afficher « undefined » par les tables de
libellés, sans qu'aucune erreur ne soit levée ; une colonne ajoutée en SQL et
absente du miroir reste inutilisée en silence ; et une colonne `not null` sans
valeur par défaut marquée **facultative** dans `Insert` laisse un service
l'omettre sans que TypeScript proteste, jusqu'à l'échec à l'exécution.

La chaîne est complète, et c'est le but : `src/types/models.ts` dérive ses alias
de `Database`, et ses tables de libellés sont des `Record<Enum, string>`. Une
valeur ajoutée **dans le miroir** fait donc échouer `tsc` tant que son libellé
manque ; une valeur ajoutée **en SQL** fait échouer ce fichier. Il n'y a plus de
chemin silencieux.

Un mot sur ce que l'écriture de ce banc a appris : la première version signalait
**six faux positifs**, tous sur les colonnes `id`. Les chercher comme `not null`
était l'erreur — une clé primaire l'est implicitement en PostgreSQL, sans
l'écrire. Un test qui tombe sur du code juste est un défaut, pas une découverte,
et c'est la mesure qui l'a dit, pas la relecture.

**`check-dates` mérite un mot pour la même raison**, et son premier test décrit
lui aussi un défaut. `parseCivilDate` contrôlait la _forme_ d'une date
(`AAAA-MM-JJ`) mais jamais ses _bornes_, et le constructeur `Date` ne refuse rien :
mesuré sur ce projet, `'2026-13-45'` s'affichait « Dimanche 14 février » et
`'2026-00-00'` « Dimanche 30 novembre ». Une date impossible devenait une date
plausible, donc invisible à l'œil comme au lint. Le contrôle ajouté compare les
composants obtenus à ceux demandés et rend la valeur brute en cas d'écart — le
comportement que la fonction réservait déjà aux chaînes qui ne ressemblent pas à
une date. La valeur du test a été établie par falsification : en remettant
l'ancienne analyse, ces trois tests échouent, **les neuf autres restent verts**
(mesuré, le fichier en comptant douze).

Le décalage de fuseau, lui, a longtemps été décrit ici comme **inéprouvable** :
« Node ignore `TZ` sur cette machine, donc un test de fuseau passerait partout,
y compris sur un code fautif ». Cette phrase était **fausse**, et sa faute est
instructive — elle généralisait à partir d'**une seule forme** de la variable.
Mesuré depuis, en passant `TZ` à un processus fils :

| Forme passée à `TZ` | Décalage obtenu | Verdict    |
| ------------------- | --------------- | ---------- |
| `UTC`               | `0`             | appliqué   |
| `GMT-5`             | `-5`            | appliqué   |
| `GMT+14`            | `+14`           | appliqué   |
| `America/New_York`  | `+2` (inchangé) | **ignoré** |
| `Asia/Tokyo`        | `+2` (inchangé) | **ignoré** |
| `Europe/London`     | `+2` (inchangé) | **ignoré** |

**Node n'ignore pas `TZ` : il ignore les noms IANA, et honore les décalages
fixes.** Deux tests du fichier lancent donc un processus fils sous `GMT-5` et
sous `GMT+14`, et **mesurent leur propre prémisse** — le décalage réellement
appliqué, et le fait que `new Date('2020-09-16')`, minuit UTC, change bien de
jour dans le premier. Le décalage de fuseau, qui est la raison d'être de
`parseCivilDate`, est désormais éprouvé par exécution et non par lecture.

**`check-recovery-link` a reçu quatre tests pour la même raison**, et son cas est
le plus instructif des trois. La requête était lue avec
`url.slice(queryIndex + 1)`, jusqu'à la **fin de la chaîne** : la dernière paire de
la requête absorbait donc le début du fragment, et dans
`?type=recovery#access_token=…`, `type` valait « recovery#access_token=… ». Deux
conséquences, toutes deux muettes : un lien pourtant valide était refusé sans
message, et `describeLinkError` renvoyait `null` sur un lien expiré — le
silence même que ce fichier existe pour empêcher. Le test antérieur, « le fragment
l'emporte sur la requête », ne pouvait pas le voir : il place `type=recovery` des
**deux** côtés, si bien que le fragment réécrivait la valeur corrompue. La
falsification le confirme : sur l'ancienne lecture, deux des quatre nouveaux tests
échouent et les deux autres restent verts — ce sont des contrôles, pas des
discriminateurs, et c'est écrit comme tel dans le fichier.

**Trois tests de forme gardent les ordres d'exécution du flux de récupération**,
ajoutés parce que `SECURITY.md` disait lui-même qu'aucun outil ne les attrapait.
Ils lisent `src/auth/AuthProvider.tsx` et `src/navigation/RootNavigator.tsx`, et
comparent la position de deux opérations : le drapeau `passwordRecovery` levé
avant `setSession`, l'attente de la session avant la déconnexion, et l'écran de
l'application placé derrière la garde. Un test d'ordre sans garde-fou passe à
vide — un motif **absent** rend `-1`, donc « avant » n'importe quoi, et un motif
présent deux fois compare la mauvaise paire — donc chaque comparaison vérifie
d'abord que les deux motifs existent et sont uniques. Falsifiés un par un :
chaque clause inversée fait tomber exactement son test, avec son propre message.

**Neuf tests de plus couvrent ce qu'un lien apprend à l'écran** — sept dans
`check-recovery-link`, deux dans `check-user-messages` —, et l'un d'eux est né
d'un défaut réel : le lien de confirmation d'inscription était reconnu pour être
**écarté**, jamais pour être annoncé. L'adhérent qui cliquait voyait l'écran de
connexion s'ouvrir sans un mot. Les tests éprouvent la reconnaissance du lien —
trois conditions, dont l'absence d'erreur, sans laquelle un lien expiré
annoncerait une confirmation —, la traduction des **deux** flux, et deux clauses
de forme dans `AuthProvider` : le message est bien posé, et la connexion réussie
l'efface. La seconde est celle qu'on oublie, parce qu'elle ne se voit pas : un
message qui survit à la connexion réapparaît au lancement suivant. Le test refuse
aussi toute **autre** écriture de `linkMessage` dans `signIn`, sans quoi un
message posé là passerait inaperçu et rouvrirait le défaut.

Le dernier est né du **renvoi** de l'e-mail de confirmation : les phrases d'envoi
— « si une confirmation est en attente pour … » — ne doivent pas dire si l'adresse
existe, et le test lit ces phrases **dans l'écran** pour refuser une tournure
affirmative. Il en faut au moins deux : la réinitialisation et le renvoi posent la
même question, et une seule phrase vérifiée laisserait l'autre dériver.

**Cinq tests tiennent les adresses de retour elles-mêmes**, et ils sont nés d'une
mesure. Le schéma est déclaré **une seule fois**, dans `app.json`
(`expo.scheme`), mais les adresses qu'il produit —
`Linking.createURL('reinitialisation')` et `Linking.createURL('confirmation')`,
dont le mécanisme a été vérifié en lisant `expo-linking` 57.0.10 — sont recopiées
à la main dans les deux documents qui font enregistrer une URL de redirection à
l'opérateur, et dans dix-huit littéraux du fichier de test. Changer `expo.scheme`
laissait donc **toute la suite verte** : Supabase refuse une redirection absente
de sa liste, le lien ne revient pas dans l'application, et le test censé couvrir
le flux éprouve une adresse que l'application ne produit plus. Un test compare
donc les adresses **nommées** dans les documents à celles que l'application
produit — et dans les deux sens : la présence de la bonne ne suffit pas, le
scénario de falsification qui ajoute une adresse périmée **à côté** de la bonne
fait bien tomber le test, et celui qui en **retire une** aussi, parce que Supabase
la refuse en silence. Un troisième vérifie que la liste est **close** : toute
constante `*_REDIRECT_PATH` du module doit y figurer. Un quatrième vérifie
qu'aucun fichier de test n'introduit un schéma que l'application ne déclare pas.
Le dernier va jusqu'à **l'appel** : `signUp` et le renvoi doivent tous les deux
passer l'adresse de retour — sans quoi la réparation d'un lien échoué reproduirait
son défaut —, et le renvoi doit demander le type `signup`, que `ResendParams`
n'admet qu'avec `email_change`.

**`check-build-config` remplace une phrase par une mesure**, et son cas est le
plus simple des quatre. `ci.yml` portait ce commentaire, au-dessus de la version
de Node : « Doit rester alignée sur .nvmrc et eas.json. » Une consigne, que rien
ne vérifiait. La version est en effet écrite **quatre fois** — `.nvmrc`, `ci.yml`,
`eas-build.yml` et `eas.json` (`build.base.node`) — parce qu'aucun des quatre ne
peut lire les autres : `.nvmrc` sert au poste de travail, `eas.json` est consommé
par le service EAS, et un workflow ne lit pas `eas.json` sans outil
supplémentaire. Les quatre étaient d'accord, mais parce qu'un humain les avait
tenus d'accord. Le test les lit et les compare ; l'écart serait silencieux par
nature — le poste compile en 22, la CI en 24 — et la falsification confirme
qu'une seule valeur changée fait tomber exactement son test. Trois autres
invariants sont venus avec : aucun flux déclenché par une `pull_request` ne peut
atteindre un secret, aucun flux ne se donne plus que la lecture du dépôt, et
chaque profil de `eas.json` doit tirer ses variables de l'environnement EAS où
l'application croit être — faute de quoi un build de prévisualisation écrirait
dans la base de production.

Ce fichier a trouvé un défaut **dans sa première version**, ce qui est la
meilleure preuve qu'il sert à quelque chose. En comparant les variables de
`.env.example` à celles que `env.ts` lit, il en annonçait quatre au lieu de
trois. La quatrième, `EXPO_PUBLIC_URL`, ne vit que dans le commentaire qui
explique pourquoi l'accès doit rester littéral — le test échouait donc sur sa
propre documentation, exactement comme `check-rls-guards` l'aurait fait sans
retirer les commentaires SQL. Une fois les commentaires retirés, la comparaison
attrape ce que ni `tsc` ni ESLint ne voient : une **faute de frappe** dans un
accès à `process.env`, que les types laissent passer puisque `ProcessEnv` hérite
de `Dict<string>`. Vérifié : `EXPO_PUBLIC_SUPABASE_URLL` dans `env.ts` fait
échouer le test.

**Un cinquième invariant est venu de `git add`, pas d'une relecture.** À
l'initialisation du dépôt, Git a signalé « LF will be replaced by CRLF » sur
**chaque** fichier. `core.autocrlf` vaut `true` par défaut sous Git pour Windows,
et ce réglage vit dans la configuration de la machine — aucun fichier du dépôt ne
pouvait le contredire, faute de `.gitattributes`. Or `.prettierrc.json` impose
`endOfLine: "lf"`, qui juge le dossier de travail **tel qu'il est sur le disque** :
un clone sous Windows recevait donc du CRLF partout, et `format:check` échouait
sur chaque fichier, dès le premier clone, sur la machine du seul mainteneur. Le
même dépôt restait vert sur un exécuteur Linux, où `autocrlf` est faux — un écart
qui ne se voit que d'un côté est le plus coûteux, parce qu'il fait douter du code.

La règle `* text=auto eol=lf` neutralise le réglage local, et les images sont
déclarées binaires. La mesure a été faite **avant et après**, avec le même
instrument : un `git checkout-index` sous `core.autocrlf=true` produit
**22 503 CRLF** sans le fichier, **0** avec (les 10 octets `0d 0a` qui restent
sont à l'intérieur des PNG — la signature PNG elle-même en contient un). Le test
tient la règle dans les deux sens : la valeur `eol` est **lue** dans
`.prettierrc.json` plutôt que recopiée, et chaque extension réellement présente
dans `assets/` doit être déclarée binaire — ensemble fermé, donc une image
ajoutée sans sa déclaration fait tomber le banc. Huit scénarios de falsification
(quatre défauts, quatre remises en forme légitimes, dont un commentaire qui
**mentionne** `eol=crlf` pour vérifier que le banc ne lit pas la prose) se
comportent comme prévu. Ce que le banc ne peut pas voir est écrit dans son
en-tête : il lit la règle, il ne clone pas.

**Les trois autres réglages de la machine, mesurés, n'ont rien trouvé.** La
famille ouverte par `autocrlf` en comptait d'autres, et les mesurer valait mieux
que les supposer :

| réglage           | valeur ici | ce qu'il casserait                         | constat                       |
| ----------------- | ---------- | ------------------------------------------ | ----------------------------- |
| `core.autocrlf`   | `true`     | CRLF partout, `format:check` rouge         | **mordait** — corrigé         |
| `core.ignorecase` | `true`     | deux chemins ne différant que par la casse | 0 collision sur 88 chemins    |
| `core.filemode`   | `false`    | un script perdant son bit exécutable       | aucun mode autre que `100644` |
| `core.symlinks`   | `false`    | un lien devenant un fichier ordinaire      | aucun lien suivi              |

Aucun caractère interdit par Windows (`: * ? " < > |`), aucun nom réservé
(`CON`, `NUL`, `COM1`…), et le plus long chemin suivi fait 43 caractères contre
260 pour la limite historique. Rien à corriger.

**Pourquoi aucun banc ne tient ces trois-là.** Le relevé fiable des fichiers
suivis est `git ls-files`, et ce projet **n'exige pas Git** : `cli.requireCommit`
vaut `false` dans `eas.json`, aucune banque n'appelle Git aujourd'hui, et une
archive ZIP téléchargée depuis GitHub n'a pas de `.git`. Faire dépendre la suite
de Git pour garder des propriétés aujourd'hui vraies serait un mauvais échange.
La commande reste, pour le jour où le dépôt se couvrira de fichiers :

```bash
git ls-files | awk '{print tolower($0)}' | sort | uniq -d   # collisions de casse
```

**`check-screen-modes` est né d'un ajout fait à la main, deux fois.** L'écran de
connexion porte cinq visages dans un type énuméré, et une chaîne de rendu qui les
traite un par un. Rien ne reliait les deux : la cinquième valeur — le renvoi de
l'e-mail de confirmation — a été écrite dans le type _et_ dans la chaîne, et un
oubli n'aurait produit aucune alerte. C'est le pire cas de cette famille, parce
que le dernier `else` de la chaîne est le formulaire de connexion : une valeur non
traitée n'affiche ni erreur ni écran vide, elle affiche un formulaire qui a l'air
juste, sous un titre qui ne répond pas à ce que l'adhérent croyait demander.

Quatre tests tiennent l'ensemble, et les deux directions y sont : aucune valeur
déclarée sans branche, aucune branche visant une valeur absente du type (le cas
d'un renommage fait dans le type seul — le lint ne le voit pas, la comparaison
restant valide). Le troisième mesure une affirmation que le banc doit faire
lui-même : la chaîne ne nomme pas les valeurs que son `else` sert, donc « les deux
visages de base » sont **mesurés ailleurs** — ce sont exactement les valeurs que
les boutons de pied de carte comparent. Le quatrième refuse un visage que rien ne
déclenche, sans quoi un sixième mode ajouté au type et à la carte serait vert
partout alors qu'aucun geste ne l'atteint.

Falsifié en quatorze scénarios. Dix font tomber une commande : huit le banc —
valeur ajoutée au type, branche renommée, pied de carte élargi, transition
retirée, renvoi au mauvais type, adresse de retour perdue, compte rendu devenu
affirmatif, nettoyage des commentaires désactivé —, un le **typage** (membre
retiré de la valeur du contexte) et un le **lint** (membre retiré des dépendances
du `useMemo`). Quatre témoins laissent tout vert : ordre des valeurs changé,
commentaire ajouté dans la carte, et `exhaustive-deps` redescendu en
avertissement. Le nettoyage des commentaires y est éprouvé **dans les deux
sens** : un commentaire glissé dans la carte et citant une comparaison ne fait
rien tomber, et le même commentaire fait tomber le banc dès que ce nettoyage est
désactivé.

**`check-inventory` regarde le dépôt, pas l'application.** `npm run test` lance
`node … --test` **sans chemin** : Node découvre donc les fichiers de test par leur
**nom**, selon une liste de motifs figée. Un fichier qui importe `node:test` mais
dont le nom n'entre dans aucun de ces motifs n'est jamais exécuté — et
`npm run test` sort en succès, avec un test de moins, indéfiniment. C'est la
forme la plus discrète du garde-fou qui n'existe pas : écrit, versionné, lu par le
prochain mainteneur, et ne mesurant rien.

Les motifs ne sont pas recopiés de la documentation, ils ont été **éprouvés** :
un fichier sonde contenant un test qui échoue toujours, déposé dans `scripts/`
sous cinq noms, et le total relevé après chaque dépôt.

| Nom éprouvé         | Total   | Verdict       |
| ------------------- | ------- | ------------- |
| `zz-sonde.mjs`      | 170     | non découvert |
| `zz-sonde-non.mjs`  | 170     | non découvert |
| `zz-sonde.spec.mjs` | 170     | non découvert |
| `zz-sonde-test.mjs` | **171** | découvert     |
| `zz-sonde.test.mjs` | **171** | découvert     |

`.spec.mjs` — le nom qu'un développeur venu de Jest écrit sans y penser — passe
donc inaperçu. Et la sonde a d'abord été nommée `zz-sonde-non-test.mjs`, qui a
été **découverte** : elle finit par `-test.mjs`, ce que son nom semblait
précisément nier. Le contrôle retient une seule forme, `*.test.mjs`, celle du
dépôt — pas la plus large que Node accepterait.

Le second défaut est un document qui décrit un dépôt qui a changé. Le README
nomme ses bancs à deux endroits — l'arborescence du §5 et la liste du §9 — et le
§9 ouvre sur une phrase qui les **compte**, une affirmation d'**exhaustivité** que
rien ne reliait au disque. Un banc ajouté sans ligne dans le README, ou une ligne
restée après un renommage, passait sans bruit. C'était déjà le cas :
`register-alias.mjs`, le fichier sans lequel aucun test ne s'exécute, n'était
décrit nulle part. Ce banc tient désormais le disque, l'arborescence, la liste, et
le mot qui les compte — et il tient aussi le **même décompte recopié dans
`MISE-EN-SERVICE.md`**, où il avait dérivé deux fois sans que rien ne le lise : le
guide annonçait « 25 fichiers de test, 224 tests » quand le disque en portait 27.
Le nombre de tests, lui, a été **retiré** de la phrase du guide plutôt que gardé —
rien, depuis l'intérieur de la suite, ne peut dire combien de tests elle contient,
et un garde-fou qui ne peut pas mesurer ce qu'il annonce n'en est pas un.
Falsifié en seize scénarios — onze font tomber le banc, chacun sur le test
attendu, et cinq témoins le laissent vert : description d'une ligne réécrite, deux
lignes permutées, un script de plus correctement branché et décrit, et le guide
remis en forme à mots identiques.

**`check-markdown-listes` tient l'agencement des listes numérotées.** Le guide de
mise en service est réécrit par un outil extérieur — deux fois dans la même
soirée. Mesuré sur la dernière passe : **107 coupures dures** ajoutées là où il
n'y en avait aucune, dix doubles lignes vides, 99 lignes ne différant que par les
espaces finaux, et **les listes renumérotées**. Cette dernière transformation
n'est pas cosmétique. En CommonMark, un tableau de premier niveau **interrompt**
la liste qui le précède : la suite forme une liste **neuve**, dont CommonMark
affiche le numéro écrit. Le guide portait `3. Remplissez le formulaire :`, le
tableau, puis `4.` et `5.` — et s'affichait donc correctement. L'outil a réécrit
la suite en `1.` et `2.` : le lecteur voyait « 1. Pour la région » là où il s'agit
de l'**étape 4**. Mesuré, pas raisonné : le même document rendu par `markdown-it`
donne `<ol start="4">` avant la réécriture et `<ol start="1">` après. Le remède
est **structurel** — le tableau est indenté dans son point, la liste redevient
d'un seul tenant, et plus aucun renuméroteur ne peut la faire mentir — et le banc
tient ce remède : entre deux points numérotés, un bloc de premier niveau ne peut
se trouver que si un titre ou un filet les sépare. Falsifié dans les deux sens,
sur le vrai fichier : le tableau désindenté fait tomber le banc sur une seule
anomalie, la restauration rend l'empreinte `d572e810…` à l'octet près, et le banc
repasse au vert. Sa portée s'arrête au **texte**, faute de moteur Markdown
embarqué : un numéro faux écrit à la main dans une liste d'un seul tenant lui
échappe — CommonMark affiche alors 1, 2, 3.

**`check-schema-refs` lit le schéma dans son arbre.** C'était le dernier angle mort
du schéma. `npm run sql:check` le fait analyser par le véritable analyseur
PostgreSQL, mais il valide la **syntaxe** — et `author_di = auth.uid()` est une
syntaxe parfaitement valide. `check-rls-guards` lit la structure des politiques
sans se demander si les colonnes qu'elles nomment existent, et
`check-schema-types` part des colonnes **déclarées**, jamais de celles **citées**.
Une faute de frappe dans une politique était donc muette jusqu'au `db push`,
c'est-à-dire au pire moment — celui que `sql:check` a précisément été écrit pour
éviter.

Le contrôle aurait pu être écrit avec des expressions régulières, et il aurait
alors fallu lui fournir la liste des mots à ignorer : `select`, `using`, `auth`,
`uid`, `now`, `char_length`… Cette liste est une source de faux positifs — et un
banc qui tombe sur du schéma juste est un défaut du banc — qui s'allonge à chaque
fonction ajoutée. L'analyseur rend un **arbre** : un `ColumnRef` y est un
`ColumnRef`, jamais un mot qui ressemble à une colonne. La liste disparaît, et
avec elle sa maintenance.

Deux enseignements sont venus de l'épreuve, et non de la lecture. **Le schéma cite
`auth.users`**, qui n'est pas dans nos migrations : sans une liste fermée de
cibles externes, le contrôle tombait sur du schéma juste. Et **dix politiques
portent `(select auth.uid())`** — l'écriture recommandée par Supabase pour
n'évaluer la fonction qu'une fois par requête au lieu d'une fois par ligne —, une
sous-requête sans `from` qui ne change pas la portée.

Le contrôle **résout les portées**, de l'intérieur vers l'extérieur, comme
PostgreSQL : une colonne non qualifiée appartient à la table de la requête qui
l'écrit, sauf si une sous-requête interne la porte déjà. Attribuer toute colonne
non qualifiée à la table de la politique aurait rendu le contrôle faux dès la
première sous-requête portant un `from`. Il lit donc aussi `seed.sql` — dont les
insertions nomment leurs colonnes par **alias** — et le corps de la seule fonction
écrite en `language sql` ; les quatre autres sont en PL/pgSQL, dont le corps est du
texte que l'analyseur ne lit pas, et le test les **nomme** plutôt que de laisser
croire qu'elles sont couvertes. Une fonction `security definer` doit par ailleurs
fixer son `search_path` : rien ne tenait cette propriété, et une sixième fonction
ajoutée sans la clause serait passée sans bruit.

Falsifié en dix-neuf scénarios, chacun tombant sur le test attendu : faute de
frappe dans une colonne de politique, dans le corps de `is_admin`, ou dans une
insertion de `seed.sql` ; clé étrangère vers une table ou une colonne inexistante ;
type énuméré non déclaré ; `alter table drop column`, et une forme d'`alter table`
non suivie ; politique posée sur `auth.users` ; table renommée ; `security definer`
sans `set search_path`. Sept témoins restent verts : une politique remise en forme,
une colonne ajoutée par `alter table` **puis** citée par une politique, un
commentaire qui nomme une colonne inexistante — ce dernier mesurant ce que le
parcours d'arbre apporte, puisqu'un relevé par motif l'aurait pris pour une
citation —, une sous-requête **corrélée**, une jointure dans une sous-requête, une
colonne ajoutée puis nommée par `seed.sql`, et une colonne `boolean`.

**La quatrième famille : ce qu'un corps lit sur la ligne du déclencheur.** Restait
le corps des fonctions PL/pgSQL — quatre des cinq —, que l'analyseur ne lit pas :
`begin`, `if`, `raise exception` ne sont pas du SQL. Mais ces corps ont un point
d'entrée étroit et vérifiable : `new` et `old` y désignent la ligne de la table du
déclencheur, et une colonne absente n'échoue pas à la création de la fonction —
elle échoue au premier `update`, avec `record "new" has no field …`, c'est-à-dire
en production, sur un chemin qu'aucun test de ce dépôt n'exerce. Le contrôle relie
donc chaque déclencheur à la fonction qu'il exécute, extrait du corps les colonnes
lues sur `new` et `old`, et les confronte à la table.

Ce qui rend l'invariant intéressant, c'est qu'un **même** corps peut être rattaché
à plusieurs tables : `set_updated_at` l'est à quatre, et il lit `new.updated_at`.
Un cinquième déclencheur posé sur `cantine_reservations`, qui n'a pas de
`updated_at`, est exactement la faute que ce test attrape — et qu'un simple coup
d'œil sur la fonction ne montrerait pas.

C'est la **seule** lecture du fichier qui parte du texte plutôt que de l'arbre, et
elle est assumée : `libpg-query` analyse du SQL. Le nettoyage des commentaires et
des chaînes littérales n'est donc pas cosmétique — un commentaire qui expliquerait
une ancienne écriture, ou un message d'erreur qui nommerait une colonne, ferait
tomber le contrôle sur du schéma juste. Cette propriété se **mesure**, dans les
deux sens : un test écrit un corps témoin où `new.inexistant` figure dans un
commentaire, dans un bloc et dans une chaîne, et exige qu'il n'en reste qu'une
lecture ; et l'épreuve vérifie qu'en retirant ce nettoyage le test tombe, et qu'en
le remplaçant par un nettoyage qui retirerait **tout** ce sont les planchers qui
tombent. Le tout porte le total à **vingt-neuf scénarios** — dix-huit font tomber
le banc, onze témoins le laissent vert.

Le témoin de la colonne `boolean` a trouvé un défaut réel **dans le banc
lui-même**. L'analyseur
**qualifie** les types du langage, et de façon non uniforme : mesuré, `boolean`
arrive en `pg_catalog.bool`, `character varying` en `pg_catalog.varchar`, `numeric`
en `pg_catalog.numeric`, `double precision` en `pg_catalog.float8` — mais `jsonb`,
`uuid`, `text` et `date` restent d'un seul segment. Compter les segments pour
distinguer un énuméré d'un type du langage faisait donc tomber le contrôle sur du
schéma juste dès la première colonne `boolean` : le schéma n'en a aucune
aujourd'hui, ce qui rendait le défaut invisible. Le test lit maintenant le
**schéma** du type, et seul `public.<nom>` doit être déclaré.

**`check-read-bounds` est né d'une promesse fausse, et non d'un volume.** Le bouton de la cantine
dit « Réserver » ou « Annuler ma réservation » : son libellé **affirme** un état du serveur. Or
`fetchReservedMenuIds` lisait _toutes_ les réservations de l'adhérent, filtrées par `user_id` et
rien d'autre — une lecture qui grandit avec le temps, une ligne par jour de cantine, alors que
l'écran n'utilise que les menus affichés. Une lecture non bornée finit par être tronquée par un
plafond du serveur ; la réservation tombée hors de la page fait alors dire « Réserver » à un repas
déjà réservé, l'appui insère, la contrainte d'unicité absorbe le doublon **en silence**, la
relecture relit la même page, et le libellé ne change pas. Mesuré sur le modèle de l'écran :
libellé identique avant et après l'appui, aucun message, indéfiniment — le cycle que
`check-pending-action` surveille, rentré par une autre porte.

La règle est donc générale, et non locale au cas : **toute lecture de liste porte une borne
explicite** — `.limit()` ou `.range()`, ou bien `.in()` sur une liste fournie par l'appelant. Une
lecture d'une seule ligne (`.maybeSingle()`) est bornée par construction et n'a rien à déclarer. Le
banc relève les sept lectures du projet, refuse celles qui ne portent aucune borne, et **nomme sa
propre limite** : une borne `.in()` n'est bornée que si la liste reçue l'est, et le banc ne remonte
pas jusqu'à l'appelant. La chaîne tient aujourd'hui ; elle ne tient pas par ce banc seul.

Falsifié en huit scénarios : retirer la borne `.in()`, le `.limit()` des menus ou le
`.maybeSingle()` du profil, ajouter une lecture sur une table nouvelle, rendre la règle du banc
toujours vraie — cinq mutations, chacune faisant tomber le test visé — et trois remises en forme
légitimes qui restent vertes : renommer la liste passée à `.in()`, extraire le `map` de l'écran dans
une variable, échanger l'ordre de `.eq()` et `.in()`.

### Diagnostic Expo

```bash
npm run doctor          # npx --yes expo-doctor@latest
```

Ce contrôle valide `app.json` contre le schéma du SDK **réellement installé**, et
vérifie les dépendances natives — modules pairs manquants, versions dupliquées.
C'est le seul qui attrape cette famille de défauts : un fichier de configuration
plausible peut contenir des propriétés que plus rien ne lit, et un module natif
transitif peut manquer au moment du build sans qu'aucun autre contrôle ne le
voie. Il a trouvé trois défauts réels sur ce projet, dont un écran de démarrage
qui n'aurait jamais pris la couleur de marque.

Il n'est pas dans `npm run verify` : `npx` doit télécharger l'outil, ce qui
suppose un accès réseau que la CI n'a pas à exiger. À lancer avant un build EAS.
Mesuré : 21 contrôles sur 21 passent.

## 7. EAS Build

```bash
npx --yes eas-cli@latest login
npx --yes eas-cli@latest init    # renseigne extra.eas.projectId dans app.json
```

**Aucune installation globale n'est nécessaire**, et c'est délibéré : les
scripts `eas:build:*` de `package.json` passent eux aussi par `npx`. Une
installation globale marcherait, mais elle rendrait la version de la CLI
invisible — elle ne serait ni dans `package-lock.json`, ni sur une autre
machine, ni dans l'intégration continue. Le champ `cli.version` d'`eas.json`
garde le minimum exigé.

| Profil        | Usage                                         | Distribution | Format |
| ------------- | --------------------------------------------- | ------------ | ------ |
| `development` | client de développement, rechargement à chaud | interne      | APK    |
| `preview`     | test par le bureau avant publication          | interne      | APK    |
| `production`  | App Store / Play Store                        | magasins     | AAB    |

```bash
npm run eas:build:preview       # APK à installer sur un téléphone
npm run eas:build:production    # version destinée aux magasins
npx --yes eas-cli@latest submit --profile production --platform android
```

`appVersionSource: "remote"` délègue à EAS le numéro de version, et
`autoIncrement` l'incrémente à chaque build de production : plus de numéro de
build à retenir ni à oublier d'incrémenter avant une soumission.

Pour que la compilation reflète exactement un commit, passez
`cli.requireCommit` à `true` dans `eas.json` : un build échouera alors si des
modifications ne sont pas commitées.

### Identifiants de l'application

`fr.fcpe.frereslumieres` (iOS et Android). **Ce couple est unique par
plateforme** : deux applications portant le même identifiant ne peuvent pas
coexister sur un appareil, et la seconde installation remplace la première. Si
cette application doit cohabiter avec une autre version du même projet, changez
`ios.bundleIdentifier` et `android.package` dans `app.json` **avant** le premier
build — après publication, l'identifiant ne peut plus être modifié.

**Le schéma d'URL suit la même logique.** `expo.scheme` (`fcpefl`) décide des
adresses vers lesquelles Supabase renvoie l'adhérent après un clic : le lien de
réinitialisation (`fcpefl://reinitialisation`) et celui de confirmation
d'inscription (`fcpefl://confirmation`). Ces adresses sont **recopiées** dans les
deux documents qui font enregistrer une URL de redirection, et dans les littéraux
des tests du flux — dix-huit occurrences. Les changer à un seul endroit cassait le
lien sans qu'aucun test ne bronche, puisque les tests auraient alors éprouvé un
schéma que l'application ne produit plus. Cinq tests de `check-recovery-link`
tiennent désormais cet accord : l'un porte sur les documents eux-mêmes, un autre
vérifie que la liste des adresses est **close** — une constante ajoutée à
`redirectPaths.ts` sans y figurer fait échouer la suite, car elle serait produite
par l'application sans jamais être réclamée à l'opérateur —, et un troisième
remonte jusqu'aux appels qui les portent : `signUp` et le renvoi de l'e-mail de
confirmation. Changer le schéma demande donc de mettre à jour `app.json`,
`README.md`, `supabase/README.md`, et les entrées « Redirect URLs » du tableau de
bord Supabase.

### Propriétés à ne pas remettre dans `app.json`

Trois propriétés qui figuraient dans le modèle Expo ont été retirées, parce
qu'elles ne sont **plus lues** en SDK 57 — les laisser donne l'illusion d'un
réglage actif :

| Propriété retirée                | Pourquoi                                                                    |
| -------------------------------- | --------------------------------------------------------------------------- |
| `newArchEnabled`                 | L'architecture nouvelle est la seule proposée ; le drapeau n'existe plus.   |
| `android.edgeToEdgeEnabled`      | L'affichage bord à bord est imposé à partir de `targetSdk` 35, sans option. |
| `splash` (clé de premier niveau) | Remplacée par le greffon `expo-splash-screen` — voir ci-dessous.            |

**L'écran de démarrage mérite une attention particulière.** L'ancienne clé
`splash` n'est plus lue par `@expo/prebuild-config` : la couleur de marque
`#2554D6` n'aurait jamais été appliquée, et l'application aurait affiché un écran
blanc par défaut. La configuration passe désormais par le greffon :

```json
["expo-splash-screen", { "image": "./assets/splash-icon.png", "backgroundColor": "#2554D6" }]
```

Le contrôle qui attrape cette famille de défauts est `npx expo-doctor` (script
`npm run doctor`) : il valide `app.json` contre le schéma du SDK réellement
installé, là où une relecture ne voit qu'un fichier plausible.

### Permissions Android demandées

Le modèle Expo déclare par défaut des permissions dont cette application n'a
aucun usage. Trois sont retirées dans `app.json` :

```json
"blockedPermissions": [
  "android.permission.SYSTEM_ALERT_WINDOW",
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.WRITE_EXTERNAL_STORAGE"
]
```

| Permission                     | Pourquoi elle est retirée                                                                                                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SYSTEM_ALERT_WINDOW`          | « Affichage par-dessus les autres applications » — permission **restreinte**, examinée par Google Play. React Native ne s'en sert que pour l'overlay de FPS, option de développeur |
| `READ_/WRITE_EXTERNAL_STORAGE` | L'application ne lit ni n'écrit aucun fichier local. Sur Android ≤ 12, elles apparaissent dans la fiche du magasin                                                                 |

Ce sont des permissions **sensibles** pour une application de parents d'élèves :
elles sont visibles sur la fiche Play Store et sans rapport avec le service rendu.
`INTERNET` et `VIBRATE` sont conservées — la première est indispensable, la
seconde ne se demande jamais à l'utilisateur.

Le mécanisme est `tools:node="remove"` : il retire la permission du manifeste
**fusionné**, y compris si une bibliothèque tierce la déclare de son côté.

### Mode clair imposé

`userInterfaceStyle: "light"` n'a d'effet sur Android qu'avec `expo-system-ui` :
sans lui, le thème généré hérite de `Theme.AppCompat.DayNight` et l'application
suit le mode sombre du système — alors que la palette n'est définie que pour le
clair. C'est exactement le « thème sombre à moitié fait » que ce projet refuse.
Le paquet est donc installé, et le réglage est désormais réellement appliqué.

### Ce que le générateur a écrit, mesuré

`npx expo prebuild` a été lancé **dans le clone**, jamais dans le dossier de
travail : il écrit un dossier `android/` et **modifie `package.json`**. Ce que le
générateur produit est la seule preuve que ces propriétés sont réellement
**lues** — `expo-doctor` valide le déclaré, il ne dit rien de l'effet.

| Déclaré dans `app.json`       | Écrit dans le projet natif                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| `android.package`             | `namespace` et `applicationId` = `fr.fcpe.frereslumieres`                           |
| `version`                     | `versionName "0.1.0"`, `versionCode 1`                                              |
| `scheme: "fcpefl"`            | un `intent-filter` `VIEW` + `BROWSABLE` portant `<data android:scheme="fcpefl"/>`   |
| `blockedPermissions` (trois)  | les trois, marquées `tools:node="remove"` — donc absentes du manifeste **fusionné** |
| `userInterfaceStyle: "light"` | `<string name="expo_system_ui_user_interface_style">light</string>`                 |
| greffon `expo-splash-screen`  | `splashscreen_background` = **`#2554D6`**                                           |

Deux points méritent d'être soulignés :

- **Le filtre `fcpefl` est ce qui rend les liens d'e-mail utilisables.** Sans lui,
  `Linking.createURL('confirmation')` produirait une adresse que le système ne
  saurait pas router vers l'application : le lien s'ouvrirait dans un navigateur,
  et tout le flux de confirmation tomberait **sans erreur visible**. C'est la
  moitié native d'un accord que ce dépôt ne peut pas tenir par un test.
- **`expo-system-ui` n'est pas dans `plugins`, et son greffon s'exécute quand
  même** — mesuré : la chaîne ci-dessus vient de là, pas d'une déclaration
  explicite. Le paquet doit donc rester **installé** : le retirer ne produirait
  aucune erreur, seulement une application qui suit le mode sombre du système.

**Un mot sur la sauvegarde Android.** Le manifeste porte
`android:allowBackup="true"`, et ce n'est pas une fuite : les règles livrées par
`expo-secure-store` **excluent** `SecureStore` des sauvegardes
(`<exclude domain="sharedpref" path="SecureStore"/>`), là où vivent les jetons de
session. Vérifié dans le fichier de règles, pas supposé d'après le nom du paquet.

## 8. Dépôt GitHub

Le dépôt local est **déjà initialisé** : branche `main`, l'historique de la phase 1,
et 90 fichiers suivis (le `.gitignore` en écarte `node_modules/`, `dist/`, `.expo/`,
les dossiers natifs, les `.env` et les clés de signature). Il ne reste que la
destination distante :

```bash
git remote add origin https://github.com/<compte>/<dépôt>.git
git push -u origin main
```

La forme **HTTPS** est celle qui marche sans préparation : elle n'exige aucune clé SSH. La forme
`git@github.com:…` échoue sur `Permission denied (publickey)` tant qu'aucune clé n'a été créée
(`ssh-keygen -t ed25519`) **et** déclarée dans GitHub > Settings > SSH and GPG keys. Mesuré sur la
machine de développement : `~/.ssh` n'existe pas, donc HTTPS est le chemin par défaut. Au premier
`git push`, Git demande un identifiant : utilisez un **jeton d'accès personnel** comme mot de passe
(GitHub n'accepte plus le mot de passe du compte), ou `gh auth login` si la CLI GitHub est installée.

Le dépôt peut être public : `.gitignore` exclut `.env` et `.env.*` (puis
ré-autorise `.env.example`), les clés de signature et les fichiers de compte de
service. Aucun secret n'est nécessaire pour que la CI passe.

### Fins de ligne : une décision du dépôt, pas de la machine

`core.autocrlf` vaut `true` par défaut sous Git pour Windows, et il vit dans la
configuration de la machine. Sans `.gitattributes`, un clone sous Windows reçoit
donc du CRLF partout — alors que `.prettierrc.json` impose `endOfLine: "lf"`, qui
juge le dossier de travail tel qu'il est sur le disque. `format:check` échoue
alors sur chaque fichier, et le même dépôt reste vert sur un exécuteur Linux.
Mesuré avant et après la règle : **22 503 CRLF → 0** (voir §6).

### Ce que le clone a donné, mesuré

Le dépôt n'a pas seulement été relu : il a été **cloné dans un dossier vide**, et
c'est le clone qui a été vérifié. C'est la seule mesure qui réponde à la question
« ce dépôt donnera-t-il le même verdict ailleurs ? » — un dossier de travail vert
ne dit rien de ce que reçoit celui qui clone.

| Mesure                         | Résultat                                                          |
| ------------------------------ | ----------------------------------------------------------------- |
| fichiers suivis                | 90, tous `i/lf w/lf` — 6 binaires en `i/-text w/-text`            |
| CRLF réellement sur le disque  | **10** — les dix octets `0d 0a` de la signature PNG, rien d'autre |
| `format:check` dans le clone   | vert, **avec** `core.autocrlf=true` sur cette machine             |
| `npm ci` depuis le lockfile    | 11 vulnérabilités modérées : celles que `SECURITY.md` documente   |
| `npm run verify` dans le clone | **168/168**, 0 échec, export Android réussi                       |
| empreinte du bundle            | `index-dde9478a…hbc`, **identique** à celle du dossier de travail |

Le dernier point est celui qui vaut le plus : le clone ne produit pas seulement
« un » bundle, il produit **le même**. Le reste du relevé de portabilité n'a rien
trouvé : aucune collision de casse sur 90 chemins, aucun caractère interdit par
Windows (`: * ? " < > |`), aucun nom de périphérique réservé, chemin le plus long
à 43 caractères, et aucun mode autre que `100644`. Les trois réglages de la
machine restés actifs — `core.ignorecase`, `core.filemode`, `core.symlinks` —
n'ont donc rien eu à mordre, et c'est ce qui a décidé de **ne pas** les bancariser
(voir §6) : une famille ouverte se ferme par la mesure, pas par symétrie.

Ce « même » mérite d'être précisé, parce qu'il ne porte **pas** sur les octets. Deux
exports du même source ne sont jamais identiques octet pour octet : mesuré sur deux
exports successifs, le bundle diffère de **41 octets en huit groupes**. Le premier
groupe est un chemin temporaire de la machine de compilation, gravé dans le bundle —
`…\AppData\Local\Temp\expo-bundler-0.35266264999259844-1789684273290\index.js` contre
`…-0.18778068920292768-1789744695461\index.js` : un tirage aléatoire et un horodatage,
différents à chaque compilation. Le second, les **vingt derniers octets**, est le SHA-1
du reste du fichier — vérifié sur les deux exports —, et il suit le premier par
construction.

L'identité reproductible est donc le **nom du fichier** : `index-dde9478a…hbc`, calculé
par Metro à partir du graphe de modules, et non des octets. C'est lui que le relevé
compare, et c'est ce qui rend la comparaison concluante. Comparer deux bundles par leur
SHA-256 montrerait une différence à **chaque** compilation : un tel écart n'est pas une
régression, et il ne doit pas être lu comme telle.

### Ce que le clone ne pouvait pas dire : la première exécution sur Linux

Le clone a été fait sur **la même machine**, donc sous le même système. Il a répondu à « ce
dépôt se rejoue-t-il à l'identique ? » — oui — mais pas à « ce dépôt se rejoue-t-il
**ailleurs** ? ». La question a reçu sa réponse le 18 septembre 2026, au premier `push` :
l'exécuteur Linux a rendu **193 tests sur 195**, avec deux échecs sur le banc des dates.

```
not ok 34 - une date civile ne glisse pas dans un fuseau en retard sur UTC
  le fuseau demandé n'a pas été appliqué au processus fils
  5 !== -5
```

Le banc demandait `TZ=GMT-5` et vérifiait que le décalage appliqué valait bien `-5` — ce
qu'il faisait sous Windows. Sous Linux, la même chaîne vaut `+05:00` : l'une lit « moins
cinq », l'autre applique la convention POSIX, où le décalage est celui qu'on **ajoute** à
l'heure locale pour obtenir UTC. Le banc ne mesurait donc rien sous Linux, et il ne pouvait
pas le dire, n'ayant jamais tourné ailleurs.

La correction ne consiste pas à choisir une forme de `TZ` de plus, mais à **chercher** celle
qui produit le décalage voulu, parmi des noms IANA dont le sens ne dépend pas de la
plateforme. Deux étapes ne s'exécutent qu'ici et n'avaient donc jamais tourné avant ce
premier `push` — `check:install` et `sql:check` ; elles sont vertes, mais c'est un résultat,
pas une prévision.

**Ce que ceci change pour la suite.** `npm run verify` en local est un filtre, pas une preuve
de portabilité : il tourne là où il tourne. La seule mesure qui vaille pour « ailleurs » est
l'exécution sur l'autre plateforme — c'est-à-dire l'intégration continue. Un dépôt sans
destination distante n'a jamais été vérifié de ce point de vue, quel que soit le nombre de
clones qu'on en fait.

### Secrets à déclarer (Settings > Secrets and variables > Actions)

| Nom                 | Type   | Usage                                                         |
| ------------------- | ------ | ------------------------------------------------------------- |
| `EXPO_TOKEN`        | secret | `eas-build.yml` — jeton Expo, à révoquer s'il fuite           |
| `SUPABASE_URL`      | secret | `ios-unsigned.yml` — l'adresse du projet, depuis `.env.local` |
| `SUPABASE_ANON_KEY` | secret | `ios-unsigned.yml` — la clef publique, depuis `.env.local`    |

`EXPO_TOKEN` se crée sur expo.dev (Account > Access tokens).

Les variables Supabase restent **aussi** dans les environnements EAS, où
`eas-build.yml` les lit : le service EAS n'accède pas aux secrets GitHub.
Elles sont donc déclarées deux fois, parce qu'aucun des deux endroits ne peut
lire l'autre — et `scripts/check-workflows.test.mjs` refuse un flux qui
tenterait de joindre un secret depuis une pull request. Seule la clef
**publique** figure ici : la clef `service_role` contourne toutes les
politiques RLS et ne doit jamais quitter le tableau de bord Supabase.

### Protection de branche

Sur `main`, activez « Require status checks to pass before merging » et
sélectionnez le travail `Qualité`. Sans cela, la CI avertit mais ne bloque rien.

### Workflows

- `ci.yml` — à chaque push et à chaque pull request : formatage, ESLint, types,
  analyse SQL, export Expo.
- `eas-build.yml` — sur un tag `v*` ou manuellement : build EAS `preview` ou
  `production`, puis dépôt du binaire dans la **release** de la version.
  Manuel car un build EAS consomme du quota ; le déclencher à chaque push
  serait coûteux et inutile.
- `ios-unsigned.yml` — manuellement seulement : compile un IPA **non signé**
  sur un exécuteur macOS, sans compte Apple Developer, pour signature par
  ESign, puis le dépose dans la même release. Un exécuteur macOS coûte bien
  plus cher qu'un exécuteur Linux, d'où l'absence de tout déclenchement
  automatique.

Les deux déposent dans la release `v<version de app.json>`, et ce n'est pas un
détail de rangement : c'est la **seule** des trois voies qui réponde à un
visiteur sans compte. Mesuré le 2026-09-19, sans jeton : l'artefact d'un flux
répond `401`, l'adresse affichée par EAS en fin de build refuse la lecture du
build (« viewer = AnonymousViewerContext »), et un asset de release répond
`302`. L'adhérent n'a que son téléphone.

Un tag `v*` **poussé à la main** lance un build de production. Un tag créé par
`gh release create` depuis un flux n'en lance aucun : GitHub ne relance pas un
flux pour un événement provoqué par `GITHUB_TOKEN`, afin d'empêcher les
boucles. Mesuré — `v0.1.0`, créé par `eas-build.yml` le 2026-09-19, ne porte
aucune exécution.

**Le texte d'une release est recomposé à chaque dépôt de binaire**, par
`scripts/provenance-release.mjs` — et c'est le seul endroit qui l'écrive. Une
release est un objet à deux durées de vie : ses fichiers sont remplacés à chaque
compilation, son texte ne l'était qu'à sa création. La version `0.1.0` a donc
annoncé « compilés depuis le commit `dd5f872` » alors que les deux binaires
déposés ensuite venaient de `e49297d` — sur la seule page d'où un adhérent peut
télécharger. Le script conserve la ligne de provenance de chaque fichier déjà
décrite, remplace la sienne et écarte le reste ; `check-build-config` tient
l'invariant, et interdit qu'un flux repasse un texte **littéral** à
`gh release`, qui serait figé par construction.

## 9. Limites connues

- **La réinitialisation de mot de passe n'est pas éprouvée de bout en bout.**
  Le code est en place (voir §4), mais le trajet complet demande un projet
  Supabase lié, une boîte mail et un appareil. C'est le premier essai à faire
  avant de communiquer le lien aux adhérents.
- **Les deux ordres d'exécution du flux de réinitialisation ne sont couverts par
  aucun test.** Lever `passwordRecovery` avant `setSession`, et faire attendre
  « Annuler » avant de déconnecter (voir §4 et `SECURITY.md`), ne sont vérifiés
  que par la lecture : les inverser laisse la suite verte. Les éprouver demande
  un rendu de composant et un client Supabase simulé, ce que ce projet n'a pas —
  la mesure à faire sur un appareil est justement celle du premier essai
  ci-dessus : l'écran de choix du mot de passe ne doit **jamais** être précédé de
  l'application, même une fraction de seconde.
- **L'affichage après un échec de relecture n'est couvert par aucun test.** Un
  rafraîchissement raté **conserve** désormais la liste et prévient par un
  bandeau (`AsyncErrorBanner`) au lieu de la remplacer par l'écran d'erreur. Ce
  comportement repose sur trois conditions croisées — statut, présence de
  contenu, message — qu'aucun test ne vérifie : les éprouver demande un rendu de
  composant et un client Supabase simulé, que ce projet n'a pas. À contrôler sur
  un appareil : couper le réseau, tirer une liste déjà remplie vers le bas, et
  vérifier que la liste **reste** avec le bandeau, puis couper le réseau au
  premier chargement et vérifier que l'écran d'erreur et son bouton
  « Réessayer » apparaissent bien.
- **L'inscription reste ouverte, mais elle n'ouvre plus rien.** N'importe qui
  peut créer un compte : la création de compte est le seul chemin d'accès à
  l'espace membre, et le bureau ne peut pas la fermer sans se fermer lui-même.
  Ce qui a changé avec `20260920120000_acces_public.sql`, c'est ce qu'un compte
  **neuf** obtient : son `status` vaut `en_attente`, et `is_member()` — qui exige
  `accepte` — garde le salon, les conversations et les votes. Un compte en
  attente reçoit une **liste vide**, pas une erreur. Ce qui reste ouvert à tout
  porteur d'un jeton est ce qui est public : annonces, menus, agenda, sondages,
  documents destinés aux familles, et la liste des noms affichés et des rôles
  (`profiles`, jamais les adresses e-mail). Un inconnu peut donc encore
  s'inscrire sous le nom affiché d'un adhérent et **demander** son adhésion —
  c'est au bureau de refuser, depuis l'écran « Adhésions ». Pour supprimer ce
  dernier pas, il faudrait fermer l'inscription et créer les comptes depuis le
  tableau de bord. Voir `SECURITY.md`, sections « Ce que `authenticated`
  signifie » et « Le nom affiché est une étiquette, pas une identité vérifiée ».
- **Les notifications push ne partent pas.** La table `push_tokens` et
  `enregistrerAppareil` (le dépôt du jeton, avec sa politique d'insertion et sa
  politique de modification) existent et sont éprouvés, mais **aucun écran ne les
  appelle** : demander l'autorisation pour un envoi qui n'existe pas serait une
  promesse sans destinataire. Deux raisons, et elles tiennent au mode de
  distribution : l'IPA est **non signé**, donc sans compte Apple Developer il n'y
  a pas d'APNs ; et Android passe par FCM, dont la clé doit être déposée dans
  Expo. Il manque par ailleurs l'émetteur — une fonction serveur qui lirait
  `push_tokens` et appellerait le service d'Expo, avec la clé de service côté
  serveur. Rien de tout cela n'est dans l'application, et rien n'y est
  nécessaire : le jour où l'émetteur existe, il n'y a que
  `enregistrerAppareil` à appeler depuis un écran.
  **Mesuré sur une compilation native, et invisible autrement** :
  `expo-notifications` est installé, mais son greffon n'est **pas** déclaré dans
  `app.json` — donc aucune icône, aucune couleur, aucun canal — et **aucun
  fichier de `src/` ne l'importe** : zéro occurrence de la chaîne dans le paquet
  exporté. Le manifeste fusionné, lui, porte quand même `POST_NOTIFICATIONS`,
  `RECEIVE_BOOT_COMPLETED`, un service FCM et un récepteur de démarrage, apportés
  par le manifeste de la **bibliothèque** — donc l'APK livré déclare des
  permissions qu'aucun code n'emploie. `expo export` ne peut pas le voir : il
  n'exerce que du JavaScript. Le jour où un émetteur existera, il faudra les
  trois gestes ensemble : déclarer le greffon, importer la bibliothèque, et
  déposer la clef FCM dans Expo.
- **Un seul salon de discussion.** Passer à des fils thématiques demande une
  colonne `thread_id` et un écran de détail.
- **Pas de mode sombre.** `userInterfaceStyle` est fixé à `light`, avec
  `expo-system-ui` installé pour que le réglage soit réellement appliqué — sans
  lui il est ignoré sur Android, et l'application suivrait le mode sombre du
  système avec une palette prévue pour le clair. Une seule palette est définie.
  Un thème sombre à moitié fait est pire qu'une interface claire cohérente.
- **Trente-quatre fichiers de test, et rien d'autre.** `check-env-guard`,
  `check-recovery-link`, `check-user-messages`, `check-dates`, `check-rls-guards`,
  `check-storage`, `check-effacement`, `check-build-config`, `check-input-limits`,
  `check-schema-types`, `check-async-wiring`, `check-contrast`,
  `check-pending-action`, `check-password-policy`, `check-weak-password`,
  `check-screen-modes`, `check-inventory`, `check-schema-refs`,
  `check-read-bounds`, `check-workflows`, `check-paquet`, `check-eas-vocabulary`,
  `check-provenance-release`,
  `check-migration-rejouable`, `check-migration-applicable`,
  `check-rls-comportement`, `check-sdk-pins`, `check-scripts-executables`,
  `check-markdown-listes`, `check-audit-scope`, `check-parser-surface`,
  `check-non-lus`, `check-safe-area` et `check-acces-public`
  couvrent les
  gardes, les
  traductions, le formatage des dates, la couverture des verrous de colonne, ce qui
  survit à la fermeture d'un compte, la couverture des requêtes par les politiques,
  le stockage des jetons — et, pour lui, **chaque** point de coupure d'une
  sauvegarde de session, énuméré plutôt que raisonné — l'accord des versions
  déclarées dans les quatre fichiers
  de compilation, l'accord des limites de saisie avec les contraintes de la base,
  l'accord du schéma SQL avec son miroir TypeScript, le câblage des issues de
  secours de chaque écran, garde de l'état vide comprise, la lisibilité de la
  palette, la durée d'un indicateur d'action, la **portée** d'une borne de
  mot de passe, le **partage** d'un chiffre entre ses trois afficheurs — un compte
  calculé à un seul endroit, et publié quand il change, faute de quoi deux des trois
  annonçaient des messages déjà lus —, l'endroit où se place un bandeau et la forme
  de sa coque — les
  endroits où une
  erreur ne produit ni exception ni message d'erreur, seulement un comportement
  faux, un texte illisible, un bouton qui semble n'avoir rien fait ou une phrase
  fausse sur les données de l'adhérent. `check-inventory` ne regarde pas
  l'application, mais **ce dépôt-ci** : que chaque banc soit nommé pour être
  exécuté — un `.spec.mjs` ne l'est pas, mesuré —, qu'aucun script de `scripts/`
  ne reste sans exécutant, et que ce fichier décrive exactement ce qui existe, au
  mot près du décompte. `check-markdown-listes` ne regarde pas davantage
  l'application : il tient l'agencement des listes numérotées des documents de la
  racine, parce qu'un tableau de premier niveau **casse une liste en silence** —
  la suite repart alors de son propre numéro — et qu'un renuméroteur peut, à
  partir de là, faire mentir un numéro d'étape sans qu'aucun autre banc ne le
  voie. `check-workflows` ne regarde pas davantage
  l'application : il analyse les deux flux de GitHub Actions — la forme du YAML,
  l'épinglage de chaque action, la déclaration des permissions, et **chaque**
  script `run:` passé à `bash -n` — et il tient la liste des flux attendus
  **fermée** dans les deux sens, parce qu'un contrôle qui découvre ses sujets par
  le contenu du dossier mesure ce qui reste, jamais ce qui manque : écarter
  `eas-build.yml` ne ferait baisser qu'un décompte. Sa portée s'arrête à la
  syntaxe — mesuré, `bash -n` accepte `echo ${{ a }}` alors que le même script
  échoue à l'exécution. `check-eas-vocabulary` tient le même genre de liste pour
  `eas.json` : le fichier qui décide **ce que l'adhérent recevra** — un `apk`
  installable ou un `app-bundle` réservé au magasin — est lu par un service
  distant, jamais par ce dépôt, donc une clef mal orthographiée y est
  silencieuse : EAS l'ignore et applique sa valeur par défaut. Mesuré, le schéma
  officiel n'oppose `additionalProperties: false` à aucun niveau : sur quatorze
  mutations, il en attrape **deux**. Le vocabulaire est donc recopié du schéma,
  avec sa source et sa date, et confronté clef par clef à la position où chacune
  se trouve — les positions elles-mêmes étant une liste fermée dans les deux
  sens. `check-migration-rejouable` tient la même promesse pour le fichier SQL :
  appliquée à la main, une migration n'a **aucun historique**, donc un échec à
  mi-parcours ne dit pas où reprendre. Chaque `create table` porte son
  `if not exists`, chaque `create index` aussi, chaque type énuméré vit dans un
  bloc `do` qui tolère le doublon, et chaque politique comme chaque déclencheur
  est précédé de sa garde — au **même nom** et sur la **même table**, ce qu'un
  simple décompte ne vérifierait pas. `check-migration-applicable` a été écrit
  **après coup**, et il manquait : il **exécute** la migration — et le seed —
  deux fois chacun, contre un vrai PostgreSQL 18.3 compilé en WebAssembly, dans
  le processus de test, sans serveur ni Docker. Motif mesuré : un adhérent a collé
  le fichier dans l'éditeur SQL de Supabase et reçu `42P01: relation
"public.profiles" does not exist (ligne 111)`, alors que **toute la suite était
  verte**. `is_admin()` est la seule fonction du fichier écrite en `language sql`,
  et un corps `language sql` est analysé **à sa création** — la section
  « Fonctions utilitaires » ne pouvait donc pas précéder la section « Tables ».
  Aucun banc lisant le texte ne pouvait le voir : `sql:check` en vérifie la
  syntaxe sans résoudre un seul nom de table, et `check-migration-rejouable`
  comptait les gardes d'un fichier qui ne s'appliquait pas. Sa portée s'arrête où
  elle doit : il prouve que le SQL **s'applique**, pas que les politiques RLS
  **filtrent**. `check-rls-comportement` va plus loin, et c'est le banc qui
  manquait le plus : `SECURITY.md` **exige** que toute politique soit vérifiée
  contre une base réelle, et reconnaissait que son relevé n'était qu'une
  vérification **par lecture**. Celui-ci joue les rôles — `authenticated` avec la
  revendication de session que `auth.uid()` lit, puis `anon` — dans une
  transaction qui se termine toujours par `rollback`. Il mesure donc ce qu'aucun
  banc de lecture ne peut mesurer : qu'un signalement est invisible à un autre
  adhérent et visible au bureau, qu'aucun écran ne peut renommer un profil
  **pas même un administrateur** (la table n'a aucune politique de modification),
  que le passage à « traité » est refusé à un membre par un déclencheur et
  accepté au bureau, qu'une ligne ne s'écrit pas au nom d'un autre, et que
  supprimer un compte efface profil, signalements, messages et réservations tout
  en **détachant** ses annonces. Il mesure aussi une distinction que le code doit
  connaître : un refus **de politique** rend une liste vide, donc un écran muet,
  tandis que le rôle `anon` reçoit `permission denied` — le refus précède la
  politique, puisque la section « Privilèges » lui retire ses droits. Et il exerce
  la procédure d'amorçage du premier administrateur dans ses deux moitiés : le
  refus sans la parenthèse `disable trigger`, le succès avec. Sa portée s'arrête à
  ce qu'un rôle posé à la main peut démontrer : ni GoTrue ni la signature d'un
  jeton ne sont ici. `check-sdk-pins` regarde un accord qui
  n'avait aucun gardien : celui des paquets installés avec les versions que le SDK
  d'Expo contraint. `package.json` et l'API d'Expo ne peuvent pas se lire, et la
  divergence va **dans le sens qui ne fait aucun bruit** — `react-native@0.86.3`
  accepte `react: ^19.2.3`, donc une montée de `react` à `19.3.0` passe `npm ci`,
  passe `tsc`, et rompt l'accord. Mesuré : sur sept pull requests ouvertes par
  Dependabot, **six** proposaient une version que le SDK refuse. Le relevé vient
  des deux points d'entrée que `expo install --check` interroge lui-même
  (`/v2/sdks/…/native-modules` et `/v2/versions/latest`), avec sa source et sa
  date ; **seize** paquets installés y figurent, et la liste est comparée dans les
  deux sens à celle que `dependabot.yml` ignore — cesser d'ignorer un paquet
  contraint produirait une pull request qui rompt l'accord, et ignorer un paquet
  non contraint l'empêcherait silencieusement de se mettre à jour. Les types de
  montée encore admis se **déduisent** de la plage du SDK plutôt que d'être
  recopiés : rien n'est proposé sur un épinglage exact, le correctif seul passe
  sous un « ~ », et la mineure sous un « ^ ». `check-scripts-executables` regarde
  ce que `package.json` promet, et que rien n'exécutait : ses commandes. Une
  commande peut nommer un binaire absent pendant des mois sans qu'aucune porte ne
  s'en aperçoive — mesuré, `npm run doctor` appelait `expo-doctor`, qui n'existe
  pas dans `node_modules/.bin/`, et les trois `npm run eas:build:*` appelaient un
  `eas` qui supposait une installation globale. Le banc exige que chaque commande
  soit un binaire du dépôt ou l'une des trois déclarées hors du dépôt, qu'un `npx`
  nomme le paquet qu'il va chercher **et** porte `--yes` — sans quoi il s'arrête
  sur une invite —, et que la chaîne de `verify` ne télécharge rien : elle tourne
  à chaque poussée, elle ne peut pas dépendre d'un réseau ni d'une version qui
  changent. `check-audit-scope` mesure enfin la distance entre ce que
  `npm audit` signale et ce que l'adhérent reçoit : onze alertes modérées, une
  seule racine — `uuid` < 11.1.1, atteint par `xcode`, que
  `@expo/config-plugins` emploie pendant le prebuild pour manipuler les fichiers
  de projet Xcode. `SECURITY.md` affirmait déjà que cette chaîne n'entre pas dans
  le bundle livré ; c'était une lecture de l'arbre des dépendances, c'est
  désormais un invariant, et il se vérifie en deux temps. **Aucun fichier de
  `src/` n'importe la chaîne** : Metro ne construit que ce que les sources
  atteignent, donc une seule importation de `uuid` ferait entrer l'alerte dans le
  paquet livré **sans qu'aucune alerte ne change** — le silence exact que ce banc
  existe pour rompre. Et le **répertoire du `main`** de la dépendance directe ne
  la référence pas non plus : npm range `@expo/config-plugins` dans
  `dependencies`, il ne sait pas exprimer « outil de construction », donc c'est
  le code que Metro atteint qu'il faut lire, pas le paquet. Le second point est un
  **faisceau**, pas une fermeture transitive calculée, et le banc écrit lui-même
  où il s'arrête : une importation par chemin dynamique lui échapperait. Le
  premier, lui, est exact. Comme les autres, il a été éprouvé dans les deux sens —
  quatre mutations, dont deux témoins verts qu'une remise en forme ne doit pas
  faire tomber. La première version du banc, elle, accusait le dépôt à tort : elle
  lisait le chemin par `URL.pathname`, qui **encode en pourcentage**, donc le
  dossier `WorkBuddy AI` lui arrivait en `WorkBuddy%20AI` et les deux cas
  tombaient en `ENOENT`. Un rouge qui désigne le mauvais coupable se répare à la
  source — ici `fileURLToPath` —, jamais en assouplissant l'assertion.
  `check-parser-surface` ferme une fragilité que ni `check-sql.mjs` ni
  `check-schema-refs` ne peuvent voir, parce qu'ils en sont les victimes : tous
  deux reposent sur `libpg-query`, et **si l'analyseur renomme une clé de nœud,
  ils deviennent aveugles en restant verts**. Un `ColumnRef` qui s'appellerait
  autrement ne serait plus trouvé, donc plus vérifié, et le rapport dirait `ok`.
  La montée 17.7.4 → 18.1.4 a donc été **mesurée avant d'être acceptée** : mêmes
  clés racines, mêmes décomptes d'instructions (91 et 3), **aucune clé perdue à
  aucun niveau de l'arbre**, une seule clé nouvelle — `is_enforced`, un champ de
  PostgreSQL 18, purement additif —, et six entrées d'essai, valides et
  invalides, acceptées ou refusées à l'identique. C'est ce qui a autorisé la
  montée, et le banc empêche la prochaine d'être acceptée sans la même mesure.
  Il tient trois questions séparées : l'analyseur produit-il toujours les mêmes
  types de nœud — l'inventaire est **fermé** dans le sens qui compte, une
  disparition fait tomber et une apparition non, parce qu'une addition est sans
  danger et qu'exiger l'égalité ferait échouer la construction à chaque migration
  introduisant un type nouveau ; les bancs lisent-ils toujours la même chose —
  cette liste-là est fermée dans les **deux** sens, une lecture nouvelle devant
  faire relire le relevé ; et lesquels sont lus sans être produits. Le relevé
  porte **trente-sept** types, et non trente-six : `CreateEnumStmt` n'existe que
  dans l'arbre obtenu en **réanalysant** le corps des blocs `do`, que l'analyseur
  rend comme une chaîne. Un seul type est lu sans être produit — `JoinExpr` : le
  SQL du projet ne contient **aucune jointure**, et `portee()` sait pourtant
  descendre dans un `JoinExpr`. La branche existe donc sans que rien ne l'exerce,
  et la nommer la fait exister ; la liste rétrécira d'elle-même le jour où une
  jointure entrera dans le schéma. Les constantes du dépôt se distinguent des
  types de nœud par leur **forme** — `SCHEMA` et `CIBLES_EXTERNES` sont en
  capitales d'un bout à l'autre, un type de nœud jamais —, ce qui évite la liste
  de mots à tenir à jour. Éprouvé par cinq mutations : trois tombent, chacune sur
  **son** cas et sur lui seul — le `grant` retiré du SQL fait disparaître
  `AccessPriv`, un banc qui se met à lire `IndexStmt` change la liste des
  lectures, une jointure ajoutée rend `JoinExpr` produit — et deux témoins verts
  vérifient qu'un réordonnancement du relevé et un commentaire qui nomme des
  types de nœud ne font rien tomber.
  `check-schema-refs` parcourt l'**arbre syntaxique** du
  schéma, et non son texte : chaque clé étrangère doit viser une table et une
  colonne déclarées, chaque type énuméré cité doit exister, chaque fonction
  `security definer` doit fixer son `search_path`, chaque colonne nommée par
  une politique, un déclencheur, une insertion de `seed.sql` ou le corps d'une
  fonction écrite en SQL doit se résoudre dans sa portée — de l'intérieur vers
  l'extérieur, comme PostgreSQL — et chaque colonne lue sur `new` ou `old` dans un
  corps PL/pgSQL doit appartenir à la table du déclencheur qui l'exécute. Une
  table citée dans un `from` doit être déclarée, et **la condition d'une
  jointure est lue comme le reste**. Ce dernier point a été trouvé par la mesure,
  pas par la lecture : un `on` vit dans le `from`, que le parcours évite pour ne
  pas relire les sous-requêtes, et **rien ne le lisait**. Une jointure sur une
  colonne inexistante et une jointure sur une table inexistante laissaient le banc
  vert — parce que le SQL du projet ne contient aucune jointure, et que la branche
  n'était donc exercée par rien. Une table d'un autre schéma, elle, reste
  acceptée : ses colonnes ne sont pas dans nos migrations, et l'accepter est la
  seule réponse honnête — mais une table `public` non déclarée n'est pas
  « inconnue », elle n'existe pas, et les deux cas rendaient pourtant le même
  `null`. La branche est désormais exercée par six formes légitimes — `left join`,
  jointures imbriquées, schéma écrit des deux côtés, table externe — qui ne
  doivent pas la faire tomber. Une
  faute de frappe y est une syntaxe valide, que
  `sql:check` laisse donc passer.
  Les trois
  paquets natifs dont
  dépend le stockage sont remplacés par des doublures branchées par
  `scripts/alias-loader.mjs`, ce qui n'ajoute aucune dépendance. **Aucun écran
  n'est rendu** : les écrans et les services sont lus — `check-input-limits` y
  relève une constante et son emploi, `check-async-wiring` leur câblage,
  `check-contrast` la taille d'un libellé de bouton et l'unique couleur de la
  palette qui n'apparaît que sur un fond coloré, `check-pending-action` l'absence
  d'un `finally` qui relâcherait trop tôt, `check-password-policy` la condition qui
  entoure une garde, `check-weak-password` la table des raisons et la place du
  bandeau, `check-screen-modes` les littéraux d'un type énuméré et les branches
  qui les traitent, ainsi qu'une propriété du paquet de navigation — ou
  couverts par `tsc`, ESLint et l'export Expo. Le fournisseur d'authentification
  n'est couvert qu'en **forme** — trois tests lisent la source et comparent l'ordre
  de deux opérations, et `check-weak-password` y vérifie que la réponse du serveur
  est lue plutôt que seule son erreur —, sans jamais monter le composant.
- **Le décalage de fuseau est éprouvé — mais pas avec des noms de fuseaux.** Ce
  dépôt a longtemps affirmé l'inverse : « Node ignore `TZ`, donc un test de fuseau
  passerait sans rien prouver, y compris sur un code fautif ». C'était **faux**, et
  la mesure portait sur **une seule forme** de la variable. Mesuré depuis, dans un
  processus fils : les noms **IANA** (`America/New_York`, `Asia/Tokyo`,
  `Europe/London`) sont bien ignorés, mais les décalages **fixes** ne le sont pas —
  `TZ=GMT-5` donne −05:00, `TZ=GMT+14` donne +14:00. Deux tests de `check-dates`
  lancent donc un processus fils sous `GMT-5` et sous `GMT+14`, et **mesurent leur
  propre prémisse** : le décalage appliqué, et le fait que `new Date('2020-09-16')`
  — minuit UTC — change bien de jour dans le premier. Sur une machine qui
  ignorerait `TZ`, ils échouent au lieu de passer à vide. Ce qui reste hors de
  portée : les règles **historiques** d'un fuseau nommé — heure d'été, changements
  de règle — qu'un décalage fixe ne représente pas.
- **`formatDateTime` suppose un horodatage porteur d'un décalage.** Mesuré :
  `'2026-09-16T19:24:31.123456'` (sans décalage) est lu comme une heure locale et
  s'afficherait deux heures trop tôt à Paris. Le cas est inatteignable en
  pratique — les colonnes visées sont des `timestamptz`, et PostgREST les sérialise
  toujours avec un décalage — mais la fonction ne le vérifie pas.
- **Les tests chargent les alias `@/` par un chargeur maison.** `node:test` ne
  lit pas les `paths` de `tsconfig.json` ; `scripts/alias-loader.mjs` comble
  l'écart sans dépendance. Le monter a ouvert au test tout `src/`, ce qui était
  la condition pour vérifier la traduction des erreurs.
- **`check-inventory` ne balaie que `scripts/`.** Un banc écrit en JavaScript
  sous un nom découvert mais rangé ailleurs — `src/`, par exemple — lui échappe,
  puisque le balayage part de ce dossier. Et il tient l'**existence** des lignes
  du README, pas leur justesse : une description fausse passe, seuls un nom
  absent ou un nom en trop le font tomber.
- **`check-schema-refs` ne lit d'un corps PL/pgSQL que les colonnes lues sur
  `new` et `old`.** `CreateFunctionStmt` porte son corps en **texte**, et quatre
  des cinq fonctions
  du schéma sont en PL/pgSQL (`begin`, `if`, `raise exception`) : une fonction de
  ce genre qui citerait une colonne inexistante passe — **sauf** par les colonnes
  qu'elle lit sur `new` et `old`, qui sont extraites par motif et confrontées à la
  table du déclencheur. Une faute de frappe dans un **nom de fonction**, un
  `raise exception` mal formé, un `errcode` inconnu ou une variable mal
  orthographiée passent donc. Le
  contrôle ne voit pas non plus un `alter table` futur qui **renommerait** ou
  **supprimerait** une colonne : il refuse ces formes, il ne les suit pas, ce qui
  fait poser la question au lieu de la trancher à tort. Enfin, il ne lit que les
  migrations et `supabase/seed.sql` : un fichier SQL ajouté ailleurs serait ignoré.
- **La portabilité a été mesurée ici, pas sur une autre machine.** Le clone
  vérifié l'a été sous Windows, avec le même Node et le même `core.autocrlf=true`
  — c'est-à-dire dans les conditions les plus défavorables pour les fins de ligne,
  et c'est bien ce qui était en jeu. Mais **rien n'a été exécuté sous Linux** : la
  CI le fera au premier push, et c'est là qu'un écart propre à la plateforme
  apparaîtrait (casse d'un nom, longueur d'un chemin, script shell, séparateur).
  Le clone prouve que le dépôt se reproduit à l'identique ; il ne prouve pas
  encore qu'il se reproduit **ailleurs**.
- **Le projet natif n'est couvert par aucun test.** `npx expo prebuild` demande
  le réseau, écrit un dossier `android/` et **modifie `package.json`** : il ne
  peut pas entrer dans `npm run verify`. Ce que le générateur écrit a donc été
  **mesuré une fois** et consigné au §7 ; rien ne le tiendra si une montée de
  version d'Expo change un greffon. Le remède est de relancer la commande dans un
  clone et de comparer au tableau du §7 — c'est une mesure, pas un oubli.
- **Le projet iOS n'a jamais été généré.** Mesuré : `npx expo prebuild
--platform ios` **refuse** de s'exécuter sous Windows (« Run npx expo prebuild
  again from macOS or Linux »). L'`Info.plist` n'existe donc pas ici, et le
  schéma `fcpefl` n'est vérifié que dans le manifeste Android. C'est le premier
  build EAS qui produira la version iOS — et c'est là qu'un `CFBundleURLSchemes`
  manquant apparaîtrait, c'est-à-dire au moment où les liens d'e-mail devraient
  ramener l'adhérent dans l'application.
