# Mise en service — ce que j'attends de vous, dans l'ordre

Ce fichier est la **seule** liste de ce que je ne peux pas faire à votre place. Tout
le reste est fait, et tout ce qui suit ce que vous me donnez, je m'en charge.

## La règle de partage

Je n'entre **jamais** un identifiant, un mot de passe ou une clé à votre place, et je
ne crée pas de compte en votre nom. Ce n'est pas une limite technique : c'est que ces
gestes engagent votre responsabilité. Le compte Supabase et le compte Expo doivent
être les vôtres, pas les miens — sinon, le jour où il faut récupérer un accès ou
fermer un service, c'est à moi qu'il faudrait demander, et je ne serai pas là.

Vous créez les comptes. Je fais tout le reste.

## Ce que vous me donnez, et ce que je fais ensuite

| #   | Vous                                                              | Durée   | Moi, dès réception                                              |
| --- | ----------------------------------------------------------------- | ------- | --------------------------------------------------------------- |
| 1   | Un projet Supabase, les deux fichiers SQL collés, l'URL et la clé | ~5 min  | `.env.local`, promotion admin, variables EAS                    |
| 2   | Un compte Expo, et `npx eas-cli login` lancé une fois             | ~5 min  | `eas init`, `eas env:create`, compilation de l'APK              |
| 3   | Un jeton Expo pour GitHub (facultatif)                            | ~2 min  | le secret `EXPO_TOKEN`, qui réveille la compilation automatique |
| 4   | Les identifiants SMTP                                             | ~10 min | texte des e-mails, vérification qu'ils arrivent                 |
| 5   | Installer l'APK sur le téléphone                                  | ~2 min  | les vérifications sur appareil réel                             |
| 6   | Les quatre réglages du tableau de bord                            | ~5 min  | contrôle des quatre valeurs                                     |

Aucune autre action n'est attendue de vous. Le détail suit.

---

## Étape 1 — Supabase (~5 min)

### 1.1 Créer le compte et le projet

1. <https://supabase.com> → _Start your project_ → inscription (GitHub ou e-mail).
2. _New project_ :
   - **Name** : `fcpe-freres-lumieres`
   - **Database Password** : laissez Supabase le générer, **notez-le** quelque part.
     Il ne servira pas dans la suite, mais il est irrécupérable.
   - **Region** : une région **européenne** — `West EU (Ireland)` ou
     `Central EU (Frankfurt)`. Le règlement européen n'interdit pas un serveur
     américain, mais il en demande la justification, et la latence double.
3. Attendre environ deux minutes que le projet soit prêt.

### 1.2 Créer les tables

Menu de gauche → **SQL Editor** → _New query_. Deux copier-coller, dans cet ordre :

| Ordre | Fichier à coller                              | Ce qu'il fait                                      |
| ----- | --------------------------------------------- | -------------------------------------------------- |
| 1     | `supabase/migrations/20260916120000_init.sql` | les 6 tables, les politiques RLS, les déclencheurs |
| 2     | `supabase/seed.sql`                           | des annonces et des menus fictifs, pour essayer    |

Après chaque collage, bouton **Run** (ou `Ctrl`+`Entrée`). Attendu : `Success. No rows
returned` pour le premier ; un nombre de lignes insérées pour le second.

Les deux fichiers sont **rejouables** : si un message d'erreur apparaît en cours de
route, corrigez ce qu'il signale et relancez **le même fichier** — il ne créera pas de
doublon, et il n'y a pas besoin de repartir de zéro.

> L'étape 2 est **facultative**. C'est un jeu d'essai : sans elle, vous verrez
> l'application telle que la verront les adhérents, avec des écrans vides. Ne
> l'appliquez pas en production — les menus fictifs seraient pris pour de vrais menus.

### 1.3 Récupérer les deux valeurs

Menu de gauche → **Project Settings** (roue crantée) → **API Keys**. Copiez :

- **Project URL** — de la forme `https://abcdefgh.supabase.co`
- **Publishable key** — commence par `sb_publishable_…`. Sur un projet plus ancien,
  elle s'appelle `anon public` : c'est la même clé.

Et **pas** la clé `service_role` / `sb_secret_…`, qui se trouve juste à côté. Celle-là
contourne toutes les politiques de sécurité ; `src/config/env.ts` la refuse de toute
façon, mais autant ne pas la copier.

### 1.4 Me les transmettre

Collez les deux valeurs dans la conversation. Ensuite, sans vous :

- je les écris aux **lignes 40 et 44** de `.env.local` — fichier ignoré par Git ;
- je lance `npm start` et je vérifie que l'écran de configuration disparaît ;
- vous créez votre compte dans l'application, puis je vous promeus administrateur
  avec la transaction `disable trigger` / `enable trigger` (sans elle, la commande
  échoue : le déclencheur lit `auth.uid()`, qui vaut `NULL` dans l'éditeur SQL) ;
- j'enregistre les mêmes valeurs sur EAS, pour les trois environnements.

---

## Étape 2 — Expo (~5 min)

Expo est le service qui fabrique l'APK. Le compte est gratuit, et le forfait gratuit
suffit largement pour ce projet.

### 2.1 Créer le compte

<https://expo.dev/signup> — e-mail et mot de passe, ou GitHub. Retenez l'identifiant
que vous choisissez : il apparaîtra dans l'adresse de téléchargement de l'application.

### 2.2 Me donner accès

**Option A — recommandée.** Ouvrez un terminal dans le dossier du projet et lancez :

```bash
npx eas-cli login
```

Vous tapez vos identifiants **vous-même**, dans votre terminal. Je n'y vois rien, et le
jeton reste stocké sur votre machine : je m'en sers ensuite sans jamais connaître votre
mot de passe.

**Option B — si vous ne voulez pas ouvrir de terminal.** Sur
<https://expo.dev/settings/access-tokens> → _Create token_, nommez-le `workbuddy`,
copiez-le et donnez-le moi. Il est **révocable** depuis la même page le jour où vous
n'en voulez plus.

### 2.3 Ce que je fais ensuite, sans vous

- `eas init` — crée le projet côté Expo et écrit son identifiant dans `app.json` ;
- `eas env:create` — enregistre les deux variables Supabase pour `development`,
  `preview` et `production`. Nécessaire : les fichiers `.env.local` ne sont **pas**
  téléversés vers EAS, qui respecte `.gitignore` ;
- `npm run eas:build:preview` — lance la compilation.

Attendu : **10 à 20 minutes** la première fois, puis un lien de téléchargement.

> **Sur iPhone.** Le profil `preview` produit un APK Android installable directement.
> Pour iOS, la distribution interne d'EAS exige un compte Apple Developer payant, qui
> enregistre l'appareil. Sans lui, la voie gratuite est l'IPA non signé produit par
> GitHub Actions, à installer avec un outil de sideloading. Android est donc le chemin
> court pour le premier essai — dites-moi si vous voulez l'iPhone tout de suite, je
> prépare l'autre chaîne.

---

## Étape 3 — Le jeton Expo pour GitHub (facultatif, ~2 min)

Le dépôt contient déjà une compilation automatique (`.github/workflows/eas-build.yml`),
déclenchée sur un tag `v*` ou à la main. Elle attend un secret `EXPO_TOKEN`, qui
n'existe pas encore — c'est la raison pour laquelle elle n'a jamais tourné.

Si vous me donnez un jeton créé sur <https://expo.dev/settings/access-tokens>, je le
pose moi-même en secret du dépôt et je vérifie que la compilation démarre. Sinon, on
s'en passe : je compile depuis votre machine à l'étape 2, ce qui donne le même APK.

---

## Étape 4 — L'envoi des e-mails (~10 min, peut attendre le premier essai)

Sans configuration, Supabase envoie les e-mails de confirmation depuis son propre
service : quelques messages par heure, souvent classés en indésirable. Cela suffit
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

## Étape 5 — Installer l'application (~2 min)

C'est le seul geste qui ne s'automatise pas : installer un APK demande votre
téléphone. Sur Android, il faut autoriser l'installation depuis cette source. Je vous
donnerai le lien et le chemin exact dans les réglages.

---

## Étape 6 — Les quatre réglages du tableau de bord (~5 min)

Quatre réglages vivent dans le tableau de bord Supabase et non dans un fichier du
dépôt : aucun test ne les protège, donc ils sont consignés dans le `README.md` (§4)
plutôt que laissés à la mémoire. Je vous les donnerai un par un, avec l'écran et la
valeur, **après** le premier essai sur téléphone — les changer maintenant n'apporterait
rien, et il vaut mieux les régler quand on peut mesurer leur effet.

---

## Ce qui est déjà fait

Pour que vous sachiez ce que vous n'avez pas à faire : les cinq écrans et leur
navigation, l'authentification et la réinitialisation de mot de passe, les six tables
et leurs politiques de sécurité, les contrôles de schéma et de politiques,
la chaîne de vérification complète (`npm run verify`, 21 fichiers de test), les deux
flux GitHub Actions, le dépôt public sans aucun secret, et la documentation.

## Une seule chose à retenir

**Rien ne bloque à part l'étape 1 et l'étape 2.** Les étapes 3 à 6 peuvent attendre,
et je m'occupe de tout le reste dès que j'ai les deux premières.
