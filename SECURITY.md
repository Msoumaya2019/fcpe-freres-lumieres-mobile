# Politique de sécurité

Cette application traite des données d'adhérents d'une association de parents
d'élèves — noms, adresses e-mail, signalements pouvant concerner des enfants
nommément. Elle est publiée sur des magasins d'applications, où son code est
extractible par n'importe qui. Les règles ci-dessous en découlent.

## Signaler une vulnérabilité

Ouvrez une **issue privée** via l'onglet _Security_ du dépôt
(« Report a vulnerability »), ou écrivez directement au responsable du projet.

Merci de ne pas ouvrir d'issue publique : une faille rendue publique avant
correction est exploitable immédiatement, y compris par des personnes qui
n'auraient pas trouvé le problème seules.

Précisez, si possible : la version concernée, la marche à suivre pour
reproduire, et l'impact que vous estimez. Une réponse vous sera apportée sous
quelques jours ; ce projet est maintenu par des bénévoles.

## Le modèle de sécurité en une phrase

**L'application mobile n'est pas une barrière.** Elle embarque une clé publique,
extractible d'un APK, et son code peut être modifié par son utilisateur. La
seule barrière est constituée par les politiques Row Level Security de
`supabase/migrations/`. Toute la conception part de là.

Conséquence pratique : une protection écrite uniquement dans le code de
l'application — masquer un bouton, filtrer une liste, vérifier un rôle avant un
appel — n'est **pas** une protection. Elle améliore l'expérience, elle n'empêche
rien.

## Règles absolues

**La clé `service_role` ne quitte jamais le tableau de bord Supabase.** Elle
contourne toutes les politiques RLS. Placée dans une variable `EXPO_PUBLIC_`,
elle publierait la base entière en lecture et en écriture, y compris les
signalements et les adresses e-mail. `src/config/env.ts` refuse de démarrer si
elle est détectée — un comportement couvert par `npm run test`, car une garde non
testée est une garde dont on ignore si elle fonctionne — mais ce contrôle reste
un filet, pas une autorisation.

**Aucun secret dans un fichier versionné.** Ni jeton Expo, ni mot de passe de
base, ni certificat de signature (`.p12`, `.jks`, `.mobileprovision`), ni fichier
de compte de service. `.gitignore` les exclut, et les valeurs destinées aux
builds distants vivent dans les variables d'environnement EAS.

**Toute nouvelle table reçoit `enable row level security` dans le même
commit.** Une table sans RLS est lisible et modifiable par tout porteur de la
clé publique. C'est le défaut le plus fréquent des projets Supabase, et il ne
produit aucune erreur : les données sont simplement accessibles.

**`security definer` s'accompagne toujours de `set search_path = ''`.** Sans
cela, un schéma placé plus haut dans le chemin de recherche de l'appelant peut
redéfinir une table et détourner la fonction. Toutes les fonctions concernées
sont dans la migration initiale ; gardez ce réflexe pour les suivantes.

**Toute modification de politique RLS est vérifiée contre une base réelle.**
`npm run sql:check` valide la syntaxe, pas le comportement : une politique peut
être syntaxiquement correcte et laisser passer ce qu'elle devrait bloquer.

**Un lien de réinitialisation est une session, pas un formulaire.** Le clic ouvre
une session Supabase complète : l'adhérent est authentifié **avant** d'avoir
choisi son mot de passe. Quatre conséquences, toutes appliquées dans le code et à
ne pas défaire :

- `RootNavigator` refuse de le laisser entrer tant que `passwordRecovery` est
  vrai. Sinon le lien connecterait sans rien changer, et resterait valable
  indéfiniment — quiconque a accès à la boîte mail pourrait se connecter à tout
  moment ;
- « Annuler » **déconnecte** au lieu de simplement revenir en arrière, pour la
  même raison : une session ouverte par un lien encore valable est une porte
  d'entrée qui survit à l'e-mail qui l'a ouverte ;
- le drapeau est levé **dès la lecture du lien**, avant `setSession`, et non dans
  la continuité de celui-ci. `setSession` déclenche lui-même `onAuthStateChange`
  — dans `@supabase/auth-js` 2.116.0, `_setSession` appelle `_notifyAllSubscribers`
  et l'attend **avant** de rendre la main. Le lever après laissait passer un
  rendu où `status` valait déjà « connecté » alors que le drapeau valait encore
  « faux » : `RootNavigator` montait alors l'application, dont les quatre écrans
  lançaient leurs requêtes, avant d'être remplacés par l'écran de choix du mot de
  passe ;
- « Annuler » **attend que la session du lien soit posée** avant de déconnecter.
  `setSession` fait un aller-retour réseau : déconnecter plus tôt ferait arriver
  la session **après** la déconnexion, et l'annulation rouvrirait ce qu'elle
  vient de fermer — l'adhérent entrerait dans l'application par un lien qu'il a
  pourtant explicitement refusé.

Ces trois points sont des **ordres d'exécution**, pas des préférences : les
inverser ne casse ni la compilation, ni le lint. Ils se manifestent par un écran
qui apparaît une fraction de seconde, ou par une déconnexion qui ne déconnecte
pas — deux symptômes qu'aucun test de valeur ne voit passer.

Les trois sont donc surveillés par des **tests de forme** dans
`scripts/check-recovery-link.test.mjs` : ils lisent la source et comparent des
positions, seule façon d'observer un ordre sans monter le fournisseur
d'authentification. Chacun a été **falsifié** — la clause inversée fait tomber
exactement son test, avec son propre message — parce qu'un test d'ordre qui n'a
jamais échoué ne prouve rien.

**Un lien de confirmation d'inscription n'ouvre aucune session, et c'est
délibéré.** Son retour porte lui aussi un jeton (`type=signup`), que
`detectSessionInUrl: false` empêche déjà d'être utilisé — mais le convertir en
session serait une **régression**, pas une commodité : l'adhérent entrerait sans
jamais retaper le mot de passe qu'il vient de choisir, et le lien deviendrait une
seconde porte d'entrée, valable jusqu'à son expiration. L'application annonce donc
que l'adresse est confirmée, et renvoie vers la connexion.
`isEmailConfirmationLink` exige un jeton d'accès **et** l'absence de toute erreur :
un lien expiré porte `type=signup` lui aussi, et annoncer une confirmation serait
alors l'inverse exact de la vérité.

Le lien expire, et c'est le cas courant — on ouvre rarement son courrier dans la
minute. Le code doit donc dire « ce lien a expiré, demandez-en un nouveau »
plutôt que de ne rien afficher : un écran de connexion inchangé laisserait croire
que le lien est cassé.

## Ce que `authenticated` signifie, et ne signifie pas

Les politiques écrites `to authenticated` s'appliquent à **tout porteur d'un
jeton de session valide**. L'inscription étant libre dans l'application, cela
équivaut à « quiconque a installé l'application ». Ce n'est pas un défaut en
soi — les données concernées sont visibles par tous les adhérents — mais cela
doit rester vrai.

Avant d'ajouter une colonne, posez-vous la question : cette information peut-elle
être lue par n'importe quel parent de l'école ? Si non, la politique de lecture
doit être restreinte en même temps que la colonne est créée.

## Le nom affiché est une étiquette, pas une identité vérifiée

`profiles.display_name` n'a **aucune contrainte d'unicité** — seulement une
limite de 80 caractères — et il n'est écrit qu'une fois : par `handle_new_user`,
qui le lit dans les métadonnées transmises à `signUp()`. Ce n'est pas seulement
l'application qui ne le modifie pas : **`profiles` n'a aucune politique de
modification**, si bien que l'API ne le permet pas davantage. Or c'est ce nom que
l'application affiche comme l'auteur d'un message (`message.authorName`) ou d'une
annonce.

Conséquence, atteignable avec l'application **telle qu'elle est publiée** :
n'importe qui peut s'inscrire sous le nom affiché d'un adhérent existant, ou sous
« Bureau FCPE », puis publier dans le salon sous cette étiquette. Aucun client
modifié n'est nécessaire — le nom est un paramètre de l'inscription.

Ce n'est pas une fuite de données : c'est un défaut d'**intégrité**, dans un
salon où les adhérents lisent un nom comme une identité. Il n'est pas corrigé par
une contrainte d'unicité, qui refuserait deux homonymes bien réels — et il ne
peut pas être corrigé par le code de l'application, qui n'est pas une barrière.

La cause est la même que celle de l'inscription ouverte, et le remède l'est
aussi : **filtrer l'inscription**. Tant qu'un compte est actif dès sa création,
l'application ne peut pas distinguer un adhérent d'un inconnu qui a choisi le
même nom. Voir la limite correspondante au README, §9, et `validated_at` pour la
marche à suivre.

## Ce que la relecture des politiques a établi

Les onze requêtes de `src/services/` ont été croisées une par une avec les
politiques de la migration initiale. Sept lectures, quatre écritures — et
**aucune modification** : le relevé ci-dessous est celui de
`grep -rn "\.update(\|\.upsert(\|\.insert(\|\.delete(" src/`.

| Requête                        | Table                  | Opération | Politique                                  |
| ------------------------------ | ---------------------- | --------- | ------------------------------------------ |
| `fetchAnnonces`                | `annonces`             | select    | `annonces_select_authenticated`            |
| `fetchUpcomingMenus`           | `cantine_menus`        | select    | `cantine_menus_select_authenticated`       |
| `fetchReservedMenuIds`         | `cantine_reservations` | select    | `cantine_reservations_select_own_or_admin` |
| `fetchDiscussionMessages`      | `discussion_messages`  | select    | `discussion_messages_select_authenticated` |
| `fetchMySignalements`          | `signalements`         | select    | `signalements_select_own_or_admin`         |
| `fetchProfile`                 | `profiles`             | select    | `profiles_select_authenticated`            |
| `fetchAuthorNames`             | `profiles`             | select    | `profiles_select_authenticated`            |
| `postDiscussionMessage`        | `discussion_messages`  | insert    | `discussion_messages_insert_own`           |
| `createSignalement`            | `signalements`         | insert    | `signalements_insert_own`                  |
| `setReservation` (réservation) | `cantine_reservations` | insert    | `cantine_reservations_insert_own`          |
| `setReservation` (retrait)     | `cantine_reservations` | delete    | `cantine_reservations_delete_own_or_admin` |

**Chacune est couverte par une politique qui l'autorise.** Le contrôle porte
aussi sur l'inverse — une politique plus large que ce que l'application demande
— et c'est là que deux absences doivent être distinguées d'un oubli :

- **`cantine_reservations` et `discussion_messages` n'ont pas de politique de
  modification, volontairement.** Une réservation se pose ou se retire, un
  message publié se retire : aucun `update` n'est écrit dans `src/services/`, et
  la migration le dit à l'endroit où la politique manque, pour qu'un futur
  contributeur ne l'ajoute pas « pour compléter ».
- **`signalements` a bien une politique de modification ouverte à son auteur**,
  et c'est également volontaire : l'auteur peut corriger son texte, mais le
  passage à « traité » est une décision du bureau. La politique seule ne saurait
  pas faire cette distinction — une politique qui lit `signalements` depuis
  `signalements` se récurserait — d'où le déclencheur
  `prevent_status_change_by_member`, qui refuse tout changement de `status` à un
  non-administrateur. Le verrou est donc bien là, mais **hors de la politique** :
  relire les seules politiques ne suffit pas à conclure.
- **`profiles` n'a plus de politique de modification**, et cette absence n'est
  pas de la même famille que les deux précédentes : la politique a **existé**.
  Elle autorisait un membre à réécrire sa propre ligne — `using (id = (select
auth.uid()))`, avec un `with check` qui reprenait la condition pour qu'on ne
  puisse pas changer son `id` et prendre la place d'un autre adhérent. Le
  raisonnement était juste, mais la capacité n'était **exercée par aucun écran**,
  et elle portait sur la seule colonne que l'application affiche comme une
  identité. Un membre pouvait donc se renommer à volonté — et renommer par la
  même occasion **tous ses messages passés**, puisque `authorName` est résolu à
  la lecture et qu'aucun message ne conserve le nom de son auteur. Aucun
  déclencheur ne gardait `display_name` : seul `role` l'est. La politique a été
  retirée, ce qui rend vraie pour l'API la phrase du §« Le nom affiché est une
  étiquette » ; le bureau garde de quoi corriger un libellé depuis le tableau de
  bord, où la clé `service_role` ne passe par aucune politique.

**Le détecteur, pour la troisième fois de la même famille.** Les trois constats
ci-dessus sont sortis de la même question — _cette politique autorise-t-elle
quelque chose que le code n'exerce pas ?_ — et le troisième ne se voyait qu'en
confrontant la liste des politiques à celle des requêtes. Un test de forme le fait
désormais à chaque exécution : il relève les appels de `src/services/`, exige que
chacun ait une politique, exige que l'application ne fasse **aucune**
modification, et **nomme une par une** les politiques qu'aucun écran n'exerce.
Toute politique non exercée doit donc être un chemin d'administration
(`is_admin()`), ou figurer dans une liste d'exceptions écrites à la main — dont
`profiles.insert`, le filet de sécurité de `handle_new_user`. Ajouter une
politique que rien n'utilise demande désormais de l'écrire.

**Un verrou `before update` ne couvre pas l'insertion. Défaut trouvé, puis
corrigé.** Le déclencheur ne se déclenche qu'à la modification : la condition
d'insertion de `signalements` ne contraignait que `author_id`, si bien qu'un
client modifié — ou un appel direct à l'API avec son propre jeton — créait un
signalement déjà « traité », que le bureau, qui filtre sur les nouveaux, ne voyait
jamais passer. La règle était donc contournable par la porte d'entrée. La
condition contraint désormais `status`, avec la même branche `is_admin()` que la
politique de modification.

Le cas de `profiles` était déjà couvert — `profiles_insert_own` fige le rôle à
« membre » — et c'est cette **asymétrie** entre les deux tables qui a rendu le
défaut visible : un verrou présent sur l'une et absent sur l'autre se voit en les
comparant.

L'invariant est désormais tenu par un test de forme
(`scripts/check-rls-guards.test.mjs`) : **si un déclencheur `before update`
protège une colonne, la condition d'insertion de la même table doit contraindre
cette colonne.** Une table sans politique d'insertion est un cas distinct, et
accepté : aucune ligne ne peut y être insérée, donc le verrou de modification est
sans objet.

**Le même verrou bloquait la procédure qui sert à le contourner légitimement.**
`prevent_role_change` refuse toute modification de `role` à qui n'est pas déjà
administrateur, et `is_admin()` lit `auth.uid()` — qui vaut `NULL` hors d'une
requête authentifiée. La promotion du premier administrateur, telle qu'elle était
documentée, échouait donc dans l'éditeur SQL sur « Seul un administrateur peut
modifier le rôle d'un membre » : la toute première étape de la mise en service,
avec un message qui dit l'inverse de ce qu'on cherche à faire.

La commande est désormais encadrée par `disable trigger` / `enable trigger` dans
une transaction. `alter table` étant transactionnel, un échec de la mise à jour
annule la désactivation : le verrou ne peut pas rester ouvert par accident. Elle
est écrite à trois endroits — `README.md`, `supabase/README.md` et la migration —
et un test vérifie les trois, dans l'ordre.

**L'activation de RLS est vérifiée table par table**, ainsi que le retrait des
privilèges à `anon` et la présence d'au moins une politique. Une table sans
`enable row level security` conserve ses politiques mais ne les consulte jamais :
elle est lisible et modifiable par tout porteur de la clé publique. L'en-tête de
la migration affirmait que ces activations suivaient « dans la foulée » chaque
création de table ; elles vivent cent lignes plus bas, dans une section dédiée, et
le commentaire a été corrigé. Le croisement est fait par le même fichier de test.

Ce contrôle méritait d'être fait parce qu'un refus de RLS ne produit **pas**
d'erreur : `select` renvoie une liste vide. Une politique manquante se
manifesterait par un écran qui affiche « aucune donnée » — sans message, sans
exception, et sans que rien n'indique où chercher. C'est la même famille de
défauts que le reste de ce document.

Ce résultat reste une vérification **par lecture**. Il ne remplace pas
l'exigence ci-dessus : toute modification de politique se vérifie contre une base
réelle.

## Données personnelles et RGPD

| Traitement                                         | Base                              | Durée                            |
| -------------------------------------------------- | --------------------------------- | -------------------------------- |
| Compte (`auth.users` — e-mail, mot de passe haché) | Intérêt légitime de l'association | Jusqu'à la suppression du compte |
| Profil (`profiles` — nom affiché, rôle)            | Intérêt légitime de l'association | Jusqu'à la suppression du compte |
| Réservations de cantine                            | Exécution du service              | Jusqu'à la suppression du compte |
| Signalements                                       | Intérêt légitime                  | Jusqu'à la suppression du compte |
| Messages de discussion                             | Consentement (publication)        | Jusqu'à la suppression du compte |

Les deux premières lignes sont séparées à dessein : l'e-mail est une donnée
personnelle qui vit dans `auth.users`, lu par le seul intéressé ; le nom affiché
est une donnée **publiée aux autres adhérents**, ce qui n'est pas la même chose
au regard de l'information des personnes.

`profiles.id` référence `auth.users` avec `on delete cascade` : supprimer un
compte efface en cascade le profil, les réservations, les signalements et les
messages. Une demande d'effacement se traite donc en supprimant le compte, sans
intervention manuelle table par table.

Cette phrase est une promesse faite aux adhérents, pas un commentaire :
`scripts/check-rls-guards.test.mjs` vérifie que les tables qu'elle nomme sont
**exactement** celles que la cascade efface, et qu'aucune autre ne l'est. Une
seule table échappe à la règle, et c'est délibéré : `annonces.author_id` est
nullable et suit `on delete set null`, parce qu'une annonce publiée reste utile
après le départ de son auteur — l'effacer retirerait de l'information collective
au motif qu'un compte a été fermé. Cette colonne doit rester nullable :
`not null` avec `set null` rendrait la suppression du compte impossible, la base
refusant d'écrire `NULL` dans la colonne.

Le corollaire vaut d'être dit, parce qu'il a failli être pris à l'envers :
`src/services/discussion.ts` porte un libellé de repli pour un message « sans
auteur ». Ce cas **n'existe pas** avec ce schéma. Le repli est une ceinture de
sécurité, et la correction n'est pas de rendre la colonne nullable « pour
correspondre au code » — ce serait changer ce qui survit à une demande
d'effacement, c'est-à-dire exactement ce que la phrase ci-dessus promet.

Points d'attention :

- **Les signalements peuvent contenir des données concernant un enfant.** Ils ne
  sont lisibles que par leur auteur et par le bureau — jamais par l'ensemble des
  adhérents. Cette restriction est le motif pour lequel la table `signalements` a
  sa propre politique de lecture.
- **Le nom affiché est visible par tous les adhérents connectés.** C'est le prix
  d'un salon de discussion lisible. Ne collectez pas plus que le nécessaire à
  l'inscription.
- **`profiles` ne contient que le nom affiché et le rôle — pas l'adresse
  e-mail.** Sa politique de lecture est ouverte à tout porteur d'un jeton
  (`using (true)`), parce qu'afficher l'auteur d'un message suppose de résoudre
  son nom. Une colonne ajoutée dans cette table est donc lisible par l'ensemble
  des adhérents — et l'inscription étant libre, par quiconque installe
  l'application. Une colonne `email` y a existé, alimentée par le déclencheur
  d'inscription et jamais lue : l'écran d'informations affiche
  `session.user.email`, qui vient de `auth.users`. Elle a été retirée. Avant
  d'ajouter une colonne ici, se demander si un parent accepterait que tous les
  autres la lisent ; si non, restreindre la politique dans le même commit.
- **Aucun outil de mesure d'audience n'est intégré.** En ajouter un — Analytics,
  Sentry, Crashlytics — suppose une information des utilisateurs et une
  déclaration au registre des traitements.
- **Le stockage local des jetons est chiffré** par le Keychain (iOS) et Keystore
  (Android), via `expo-secure-store`. Voir `src/config/storage.ts` pour le
  découpage en fragments, imposé par la limite de 2048 octets d'Android.
- **Les permissions Android sont réduites au strict nécessaire.** Le modèle Expo
  en déclare trois dont l'application n'a aucun usage — `SYSTEM_ALERT_WINDOW`
  (« affichage par-dessus les autres applications », permission restreinte
  examinée par Google Play) et les deux accès au stockage externe. Elles sont
  retirées par `android.blockedPermissions` dans `app.json`. Une permission
  déclarée mais inutilisée reste une capacité accordée à l'application, et une
  question posée lors de la revue du magasin. Voir README, section 7.

## Dépendances

Le projet n'installe pas de paquet sans raison. Chaque dépendance supplémentaire
élargit la surface d'attaque et doit être justifiée.

Dependabot ouvre une pull request hebdomadaire pour les mises à jour. **Une mise
à jour de dépendance se traite comme du code** : la CI doit passer avant la
fusion, et une montée de version majeure mérite une lecture du journal des
changements — Expo et React Native publient des notes de migration qui signalent
les ruptures de compatibilité.

### Alertes connues, laissées en place volontairement

`npm audit` signale 11 vulnérabilités modérées, qui remontent toutes à une seule
alerte racine :

| Alerte                                | Portée    | Pourquoi elle est laissée                                   |
| ------------------------------------- | --------- | ----------------------------------------------------------- |
| `uuid` < 11.1.1 — GHSA-w5hq-g745-h8pq | outillage | Atteinte seulement en appelant `v3`/`v5`/`v6` avec un `buf` |

Elle arrive par `xcode`, un outil que `@expo/config-plugins` utilise pendant le
prebuild pour manipuler les fichiers de projet Xcode. Elle n'est donc **pas
présente dans le bundle livré** aux utilisateurs, et le chemin d'exploitation
demande un appel que ce projet ne fait jamais.

**Ne pas lancer `npm audit fix --force`** : la correction passe par une montée de
version majeure qui casse la chaîne d'outils Expo. Une alerte documentée est
exploitable ; une alerte « corrigée » qui casse la compilation ne l'est pas. La
réévaluer à chaque montée de version d'Expo.

## Journal des versions

Ce projet ne publie pas de version corrigeant des failles de sécurité : il est
déployé en continu. Les correctifs de sécurité sont appliqués sur `main`, et la
version publiée sur les magasins est mise à jour dans la foulée.
