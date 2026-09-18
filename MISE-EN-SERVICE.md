# Mise en service — le guide, étape par étape

> **En résumé.** Deux étapes bloquent, et elles vous prendront **15 minutes**. Tout
> le reste peut attendre le premier essai sur téléphone, et je m'occupe de tout ce
> qui suit ce que vous me donnez.

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
| 4   | Les identifiants SMTP                                             | ~10 min | le texte des e-mails, et la vérification qu'ils arrivent        |
| 5   | Installer l'APK sur le téléphone                                  | ~2 min  | les vérifications sur appareil réel                             |
| 6   | Les quatre réglages du tableau de bord                            | ~5 min  | le contrôle des quatre valeurs                                  |

**Seules les étapes 1 et 2 bloquent.** Les autres attendent le premier essai.

---

## Étape 1 — Supabase (~10 min)

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

## Étape 2 — Expo (~5 min)

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
> Developer **payant** (99 $/an), qui enregistre l'appareil. Sans lui, la voie
> gratuite est l'IPA non signé produit par GitHub Actions, à installer avec un outil
> de sideloading. **Android est donc le chemin court pour le premier essai** — dites-moi
> si vous voulez l'iPhone tout de suite, je prépare l'autre chaîne.

---

## Étape 3 — Le jeton Expo pour GitHub _(facultatif, ~2 min)_

Le dépôt contient déjà une compilation automatique
(`.github/workflows/eas-build.yml`), déclenchée sur un tag `v*` ou à la main. Elle
attend un secret `EXPO_TOKEN`, qui n'existe pas encore — c'est la raison pour
laquelle elle n'a jamais tourné.

Si vous me donnez un jeton créé sur <https://expo.dev/settings/access-tokens>, je le
pose moi-même en secret du dépôt et je vérifie que la compilation démarre. Sinon, on
s'en passe très bien : je compile depuis votre machine à l'étape 2, ce qui donne le
même APK.

---

## Étape 4 — L'envoi des e-mails _(~10 min, peut attendre)_

Sans configuration, Supabase envoie les e-mails de confirmation depuis son propre
service : **deux messages par heure**, et souvent classés en indésirable. Cela suffit
pour essayer, pas pour ouvrir aux adhérents.

Pour envoyer depuis votre domaine, il me faut quatre valeurs :

| Ce qu'il me faut          | Où le prendre                                            |
| ------------------------- | -------------------------------------------------------- |
| Hôte et port SMTP         | chez le fournisseur — `smtp.resend.com`, port 465 ou 587 |
| Identifiant               | souvent `resend`, `apikey`, ou l'adresse complète        |
| Mot de passe ou clé d'API | la clé fournie par le service                            |
| Adresse d'expédition      | une adresse de votre domaine, ex. `noreply@…`            |

**Ce réglage se fait dans le tableau de bord Supabase, et je ne peux pas cliquer à
votre place** : je n'y ai pas accès. Je vous donnerai les quatre valeurs à recopier et
l'écran exact, puis je vérifierai qu'un e-mail de confirmation arrive réellement.

---

## Étape 5 — Installer l'application _(~2 min)_

C'est le seul geste qui ne s'automatise pas : installer un APK demande votre
téléphone.

1. Ouvrez le lien de téléchargement que je vous envoie, **depuis le téléphone**.
2. Android affiche un avertissement : « Pour votre sécurité, votre téléphone n'est
   pas autorisé à installer des applications inconnues provenant de cette source ».
   Touchez **Paramètres**, puis activez **Autoriser depuis cette source**.
3. Revenez en arrière et touchez **Installer**.
4. À la première ouverture, l'application vous demandera de créer un compte.

Je vous donnerai le chemin exact dans les réglages Android selon votre téléphone —
c'est un écran qui change d'un constructeur à l'autre.

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

- [ ] Compte Supabase créé
- [ ] Projet `fcpe-freres-lumieres` créé, région européenne
- [ ] Mot de passe de la base noté
- [ ] `20260916120000_init.sql` collé et exécuté → `Success`
- [ ] `seed.sql` collé et exécuté → `Success`
- [ ] Table Editor : les 6 tables sont visibles, `annonces` a 2 lignes
- [ ] Project URL et publishable key envoyées dans la conversation
- [ ] Compte Expo créé, nom d'utilisateur noté
- [ ] `npx --yes eas-cli@latest login` lancé (ou jeton d'accès envoyé)

**Plus tard, après le premier essai :**

- [ ] Les quatre réglages du tableau de bord
- [ ] Le SMTP
- [ ] Le jeton Expo pour GitHub _(facultatif)_

---

## Ce qui est déjà fait

Pour que vous sachiez ce que vous n'avez pas à faire : les cinq écrans et leur
navigation, l'authentification et la réinitialisation de mot de passe, les six tables
et leurs politiques de sécurité, les contrôles de schéma et de politiques, la chaîne
de vérification complète (`npm run verify`, **25 fichiers de test**, 224 tests), les
deux flux GitHub Actions, le dépôt public sans aucun secret, et la documentation.

## Une seule chose à retenir

**Rien ne bloque à part l'étape 1 et l'étape 2.** Les étapes 3 à 6 peuvent attendre,
et je m'occupe de tout le reste dès que j'ai les deux premières.
