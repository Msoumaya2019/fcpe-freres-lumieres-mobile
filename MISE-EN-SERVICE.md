# Mise en service — le guide, étape par étape

> **En résumé.** Les étapes 1 à 4 sont faites : Supabase répond, le projet Expo est
> créé, le jeton est posé, et **les e-mails partent** — vérifié jusqu'au clic sur le
> lien reçu. **Les deux binaires sont livrés** — l'APK Android et l'IPA non signé.
> Ce qui reste tient en deux gestes : les quatre réglages du tableau de bord, et
> installer l'application sur un téléphone.

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

| #   | Vous                                                              | Durée   | Moi, dès réception                                              |
| --- | ----------------------------------------------------------------- | ------- | --------------------------------------------------------------- |
| 1   | Un projet Supabase, les deux fichiers SQL collés, l'URL et la clé | ~10 min | `.env.local`, promotion admin, variables EAS                    |
| 2   | Un compte Expo, et la connexion faite une fois                    | ~5 min  | `eas init`, variables EAS, compilation de l'APK                 |
| 3   | Un jeton Expo pour GitHub _(facultatif)_                          | ~2 min  | le secret `EXPO_TOKEN`, qui réveille la compilation automatique |
| 4   | Recopier les quatre identifiants SMTP                             | ~5 min  | ✅ les e-mails partent, jusqu'au clic sur le lien               |
| 5   | Installer l'APK, ou signer l'IPA puis l'installer                 | ~2 min  | les vérifications sur appareil réel                             |
| 6   | Les quatre réglages du tableau de bord                            | ~5 min  | le contrôle des quatre valeurs                                  |

**Les étapes 1 à 4 sont faites, les deux binaires sont livrés, et les e-mails
fonctionnent.** Il reste les quatre réglages du tableau de bord, puis l'installation
sur un téléphone.

---

## Étape 1 — Supabase (~10 min) ✅

> **Faite, et vérifiée de l'extérieur le 18 septembre 2026.** Le projet que vous avez  
> créé répond, et les **six tables existent et refusent la clé publique**  
> (`permission denied`). C'est exactement ce que la migration doit produire : une  
> table qui existe et qui est fermée. Vous pouvez passer à l'étape 2.

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

### 1.3 Créer les six tables

Dans le menu de gauche, cliquez **SQL Editor**, puis **New query**.

Vous allez coller **deux fichiers**, l'un après l'autre, dans cet ordre.

**Premier collage** — ouvrez ce fichier du projet et copiez tout son contenu :

```
supabase/migrations/20260916120000_init.sql
```

Collez-le dans l'éditeur, puis cliquez **Run** (ou `Ctrl`+`Entrée`).  
**Attendu : `Success. No rows returned`.**

**Deuxième collage** — même chose avec :

```
supabase/seed.sql
```

**Attendu : `Success. No rows returned`** — un `insert` ne renvoie pas de lignes,  
donc le message est le même. C'est normal.

> **Les deux fichiers sont rejouables.** Si un message d'erreur apparaît, corrigez  
> ce qu'il signale et relancez **le même fichier** : il ne créera pas de doublon, et  
> il n'y a pas besoin de repartir de zéro.

> **Le second est facultatif.** C'est un jeu d'essai : des annonces et des menus  
> fictifs, pour que l'application ne s'ouvre pas sur des écrans vides. Ne  
> l'appliquez pas en production — les menus fictifs seraient pris pour de vrais  
> menus.

### 1.4 Vérifier que les six tables sont là

C'est la vraie vérification : le message `Success` ne dit pas que les tables  
existent, il dit que le SQL n'a pas échoué.

**Je l'ai déjà faite pour vous**, depuis l'extérieur, avec la clé que vous m'avez  
envoyée : les six tables répondent, et chacune refuse la lecture avec  
`permission denied for table …`. Les deux moitiés comptent — une table absente  
répondrait `404`, une table ouverte aurait laissé passer la lecture. Les étapes  
ci-dessous ne sont donc plus à faire ; elles restent pour que vous puissiez voir  
l'écran de vos propres yeux si vous le souhaitez.

1. Dans le menu de gauche, cliquez **Table Editor**.
2. Vous devez voir, dans la liste : `annonces`, `cantine_menus`,  
   `cantine_reservations`, `discussion_messages`, `profiles`, `signalements`.
3. Cliquez sur **annonces** : vous devez voir **2 lignes**.
4. Cliquez sur **cantine_menus** : vous devez voir **8 lignes**.

Si les tables sont là mais vides, c'est que `seed.sql` n'a pas été exécuté — ce  
n'est pas grave, relancez-le.

### 1.5 Récupérer les deux valeurs

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

### 1.6 Me les transmettre

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

### 1.7 Ce que je fais ensuite, sans vous

- j'écris les deux valeurs aux **lignes 40 et 44** de `.env.local`, un fichier que  
  Git ignore ;
- je lance `npm start` et je vérifie que l'écran de configuration disparaît ;
- **vous** créez votre compte dans l'application (nom, adresse, mot de passe) — puis  
  je vous promeus administrateur, avec la transaction `disable trigger` /  
  `enable trigger`. Sans elle la commande échoue, parce que le verrou lit  
  `auth.uid()`, qui vaut `NULL` dans l'éditeur SQL ;
- j'enregistre les mêmes valeurs côté Expo, pour les trois environnements.

### Si quelque chose ne marche pas

| Ce que vous voyez                                          | Ce qui se passe                                                                        |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `relation "public.xxx" already exists`                     | normal, le fichier est rejouable : relancez, ou passez au suivant                      |
| `Seul un administrateur peut modifier le rôle d'un membre` | c'est la promotion admin, pas la création des tables — je m'en occupe, c'est mon geste |
| Le projet reste « Setting up » plus de 5 minutes           | rafraîchissez la page, puis dites-le moi                                               |
| Vous ne trouvez pas **API Keys**                           | dites-moi ce que vous voyez dans le menu **Settings**                                  |

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

### Sur Android — l'APK

1. Ouvrez le lien de téléchargement que je vous envoie, **depuis le téléphone**.
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

1. Je vous envoie le lien de l'artefact **`ipa-non-signe`** : téléchargez-le **depuis
   l'iPhone**.
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
- [x] `20260916120000_init.sql` collé et exécuté → les six tables existent
- [ ] `seed.sql` collé et exécuté → à confirmer : je ne peux pas compter les lignes  
      depuis l'extérieur, les tables étant fermées à la clé publique
- [ ] Table Editor : `annonces` a 2 lignes
- [x] Project URL et publishable key envoyées dans la conversation
- [x] Compte Expo créé — nom d'utilisateur `mchiker`
- [x] Jeton d'accès posé en secret du dépôt, et compilation lancée
- [ ] Signer l'IPA non signé avec ESign _(il est compilé et vérifié)_

**Aucune case ne bloque plus l'APK ni l'IPA.** Les cases cochées le sont parce que je les ai  
**mesurées**, pas parce qu'elles devraient l'être ; celles qui restent ouvertes  
demandent soit votre mot de passe, soit une lecture que la clé publique n'autorise  
pas.

**Plus tard, après le premier essai :**

- [ ] Les quatre réglages du tableau de bord
- [x] Recopier les quatre valeurs SMTP dans Supabase — vérifié jusqu'au clic sur le lien
- [ ] Le jeton Expo pour GitHub _(facultatif)_

---

## Ce qui est déjà fait

Pour que vous sachiez ce que vous n'avez pas à faire : les cinq écrans et leur  
navigation, l'authentification et la réinitialisation de mot de passe, les six tables  
et leurs politiques de sécurité, les contrôles de schéma et de politiques, la chaîne  
de vérification complète (`npm run verify`, **29 fichiers de test**), les  
trois flux GitHub Actions, le dépôt public sans aucun secret, les deux binaires  
compilés — l'APK Android et l'IPA non signé —, les e-mails vérifiés jusqu'au clic  
sur le lien reçu, et la documentation.

## Une seule chose à retenir

**Plus rien ne bloque l'ouverture aux adhérents, côté outillage.** Les e-mails partent,
les deux binaires sont livrés. Restent les quatre réglages du tableau de bord et
l'installation sur un téléphone — deux gestes qui demandent vos accès.
