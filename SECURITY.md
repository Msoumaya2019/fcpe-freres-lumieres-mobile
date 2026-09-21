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

Cette exigence n'est plus une intention : `scripts/check-rls-comportement.test.mjs`
**joue les rôles** contre un vrai PostgreSQL, dans `npm run test`. Il se place
dans le rôle `authenticated`, pose la revendication de session que `auth.uid()`
lit, exécute la requête, et annule tout — le rôle, la revendication et
l'écriture sont locaux à une transaction qui se termine toujours par `rollback`.
**Ajouter une politique demande donc d'ajouter l'assertion correspondante dans ce
fichier**, et d'éprouver qu'elle tombe quand la garde disparaît : six mutations
ont été mesurées, une par affirmation ci-dessous, et chacune fait tomber le
contrôle qui la porte.

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
que le lien est cassé. Le remède est désormais **dans l'application** :
`AuthProvider.resendConfirmation` demande un nouvel e-mail, avec la même adresse
de retour que l'inscription.

**Le renvoi ne dit rien de l'adresse, et le serveur non plus.** `auth.resend` est
un point d'entrée **non authentifié**, comme la réinitialisation : la seule
protection contre l'énumération des adresses est que la réponse soit identique
dans tous les cas, et elle l'est — vérifié dans GoTrue
(`internal/api/resend.go`) : adresse inconnue, adresse **déjà** confirmée — dont
le renvoi est simplement sauté — et envoi effectif répondent tous `200` avec un
corps vide. C'est ce qui autorise l'écran à écrire « **si** une confirmation est
en attente », et c'est aussi ce qui lui interdit d'en écrire davantage. Le seul
garde-fou contre l'abus — faire envoyer des e-mails à une adresse connue — est la
limite d'envoi du tableau de bord, pas le code.

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
aussi : **filtrer l'inscription**. C'est ce que fait la troisième migration — un
`status` sur `profiles`, la fonction `is_member()` qui exige `accepte`, et
`decider_adhesion()`, par laquelle le bureau accepte, refuse ou suspend. Un compte
créé naît `en_attente` : il peut lire ce qui est public — annonces, menus, agenda,
sondages, documents destinés aux familles —, mais **pas publier dans le salon**.
L'usurpateur reste donc dehors tant que le bureau ne l'a pas accepté, et c'est ce
que `check-acces-public` mesure : un compte en attente reçoit une liste **vide**,
pas une erreur. Ce qui reste ouvert à tout porteur d'un jeton est la liste des
noms affichés et des rôles, jamais les adresses e-mail.

## Le super administrateur, et les deux portes qu'il a fallu fermer

Le bureau a demandé une marche au-dessus de l'administrateur : **seul** un super
administrateur valide les adhésions, lit les messages des familles, traite un
signalement, publie un commentaire, et modère la discussion. La sixième migration
l'ajoute, et la partie qui compte n'est pas la colonne — c'est ce qui l'entoure.

**Première porte : la modification.** `profiles` n'a **aucune** politique de
modification, et c'est ce qui protège `role` depuis le premier jour. Le
déclencheur `prevent_role_change` a été étendu : une colonne dont on ne peut pas
écrire n'a pas besoin de politique, mais elle a besoin que le déclencheur la
nomme, sinon le seul chemin d'écriture restant — l'éditeur SQL — serait aussi le
seul à la connaître.

**Seconde porte : l'insertion, et c'est celle qu'on oublie.** Un verrou
`before update` **ne couvre pas l'insertion** : il ne voit pas les lignes qui
naissent avec la valeur interdite. Or `profiles` a une politique d'insertion —
`profiles_insert_own`, le filet de sécurité si `handle_new_user` n'a pas pu
s'exécuter — qui autorisait un porteur de jeton à insérer **sa propre** ligne.
Sans la condition `and not est_super_admin`, n'importe quel compte aurait pu
s'insérer super administrateur, et la hiérarchie entière tombait par la porte
d'entrée, sans qu'aucun écran ne montre rien.

**Et un garde-fou de dernier recours** : le déclencheur refuse de retirer
`est_super_admin` au **dernier** super administrateur. Sans lui, un appui
malheureux sur un écran laisserait l'association sans personne capable de valider
une adhésion — un état dont on ne sort que par l'éditeur SQL, c'est-à-dire par
vous, et sans que rien ne l'ait annoncé.

**Ce qui reste ouvert à tout porteur d'un jeton, et c'est délibéré** : savoir
**qui** est super administrateur. La colonne est lue par la politique de lecture
de `profiles`, qui est `using (true)` — comme `role`. Un nom et un rôle ne sont
pas des secrets ; une adresse e-mail en serait un, et c'est pourquoi elle n'est
pas recopiée dans `profiles`.

**Ce que ce rôle coûte, et qui doit être dit** : si aucun compte ne porte
`est_super_admin`, plus personne ne peut valider une adhésion. La promotion est
donc écrite à **trois** endroits — `supabase/migrations/20260916120000_init.sql`,
`supabase/README.md` et `README.md` — et elle pose les **deux** colonnes
ensemble. `scripts/check-rls-guards.test.mjs` vérifie que les trois disent la
même chose et dans le même ordre.

## Ce que la relecture des politiques a établi

Les **vingt et un** appels de `src/services/` ont été croisés un par un avec les
politiques des migrations. Dix-sept clés distinctes — quatre appels s'ajoutent à
une clé déjà comptée : `profiles.select` est écrit trois fois, `annonces.select`
trois (la liste, sa lecture de repli, l'article par son identifiant) —, et
**aucun n'écrit une ligne existante**.

C'est un changement, et il vient d'un défaut mesuré. Le seul geste qui modifiait
une ligne était le rafraîchissement de la date d'un appareil, et il **ne
fonctionnait pas** : une clause `WHERE` qui lit une colonne exige, en plus de la
politique de modification, que la ligne soit lisible par une politique de
**lecture** — or `push_tokens` n'en a aucune pour un visiteur sans compte, et ne
doit pas en avoir, elle rendrait publics les jetons de tous les appareils. La
modification touchait donc zéro ligne, **sans erreur** : le client lisait
`error = null` et croyait avoir rafraîchi.

Le geste est passé dans `public.enregistrer_jeton`, une fonction
`security definer` qui s'exécute avec les droits de son propriétaire : elle
enregistre l'appareil **ou** met sa date à jour, sans jamais dépendre d'une
politique de lecture. La politique `push_tokens_update_device` a été retirée, et
son retrait est déclaré dans `scripts/check-migration-rejouable.test.mjs`. Que la
date bouge réellement est mesuré par `check-acces-public`, qui la recule d'abord,
appelle la fonction sous le rôle anonyme, puis la relit.

Le relevé ci-dessous n'est pas la source : la source est
`scripts/check-rls-guards.test.mjs`, qui tient la liste **close** et tombe dès
qu'un appel apparaît ou disparaît sans être déclaré. Ce tableau le recopie, et
c'est ce banc qu'il faut relire en cas de désaccord.

| Requête                      | Table                  | Opération           | Politique                                                               |
| ---------------------------- | ---------------------- | ------------------- | ----------------------------------------------------------------------- |
| `fetchAgendaEvents`          | `agenda_events`        | select              | `agenda_events_select_public` · `…_select_authenticated`                |
| `fetchAnnonces`              | `annonces`             | select              | `annonces_select_public` · `…_select_authenticated`                     |
| `fetchAnnonce`               | `annonces`             | select              | `annonces_select_public` · `…_select_authenticated`                     |
| `fetchUpcomingMenus`         | `cantine_menus`        | select              | `cantine_menus_select_public` · `…_select_authenticated`                |
| `fetchCommentaires`          | `commentaires`         | select              | `commentaires_select_publies_anon` · `…_select_publies`                 |
| `publierCommentaire`         | `commentaires`         | insert              | `commentaires_insert_public`                                            |
| `fetchDiscussionMessages`    | `discussion_messages`  | select              | `discussion_messages_select_member`                                     |
| `postDiscussionMessage`      | `discussion_messages`  | insert              | `discussion_messages_insert_member`                                     |
| `fetchDocuments`             | `documents`            | select              | `documents_select_public` · `…_select_authenticated`                    |
| `documentUrl`                | _(bucket `documents`)_ | `createSignedUrl`   | `storage_documents_select_familles` · `storage_documents_select_bureau` |
| `documentsUrls`              | _(bucket `documents`)_ | `createSignedUrls`  | `storage_documents_select_familles` · `storage_documents_select_bureau` |
| `enregistrerAppareil` (pose) | `push_tokens`          | insert              | `push_tokens_insert_device`                                             |
| `enregistrerAppareil` (date) | _(aucune)_             | `enregistrer_jeton` | fonction `security definer`, droits du propriétaire                     |
| `fetchProfile`               | `profiles`             | select              | `profiles_select_authenticated`                                         |
| `fetchAuthorNames`           | `profiles`             | select              | `profiles_select_authenticated`                                         |
| `listerAdhesions`            | `profiles`             | select              | `profiles_select_authenticated`                                         |
| `fetchReglagesBandeau`       | `reglages`             | select              | `reglages_select_public`                                                |
| `fetchMySignalements`        | `signalements`         | select              | `signalements_select_own_or_admin`                                      |
| `createSignalement`          | `signalements`         | insert              | `signalements_insert_own`                                               |
| `fetchSondages` (sondages)   | `sondages`             | select              | `sondages_select_public` · `…_select_authenticated`                     |
| `fetchSondages` (choix)      | `sondage_choices`      | select              | `sondage_choices_select_public` · `…_select_authenticated`              |
| `castVote`                   | `sondage_votes`        | insert              | `sondage_votes_insert_public` · `sondage_votes_insert_own`              |

Trois remarques que le tableau seul ne dirait pas. Les **sept** tables publiques
portent **deux** politiques de lecture et non une : `*_select_public` pour le
rôle `anon`, `*_select_authenticated` pour un porteur de jeton. Un parent sans
compte et un adhérent lisent les mêmes lignes par deux chemins distincts, et
retirer l'une des deux ne se verrait pas à l'écriture — d'où les deux noms.
`profiles.select` est écrit **trois fois** (le profil de l'appelant, les noms des
auteurs, la file des adhésions du bureau) et ne réclame qu'une politique : c'est
le même couple table/opération.

`reglages` est la **huitième** table publique, et elle ne suit pas ce modèle :
une seule politique de lecture, `reglages_select_public`, nomme **les deux
rôles** à la fois. C'est ce que le titre du bandeau demande — un visiteur sans
compte et un adhérent lisent le même texte, et deux politiques auraient été deux
occasions d'en oublier une. Le commentaire de la migration dit pourquoi le
raisonnement est le même et la forme différente.

`commentaires` est la septième, et sa politique de lecture anonyme porte un nom
qui dit ce qu'elle fait : `commentaires_select_publies_anon` filtre sur
`statut = 'publie'`. Un commentaire en attente de validation est donc **muet**
pour tout le monde, y compris pour son auteur — celui-ci n'est qu'une clé
d'appareil, qui ne peut pas être comparée à `auth.uid()`. L'écran le dit au
parent au moment du dépôt, plutôt que de lui promettre une relecture qui
n'existe pas. Le dépôt, lui, est ouvert sans compte par
`commentaires_insert_public`, qui impose **en base** trois choses qu'un client
modifié ne peut pas contourner : le commentaire naît `en_attente`, sa décision de
modération est nulle, et l'actualité commentée existe **et n'est pas un
brouillon**.

Les deux lignes de `push_tokens` sont les seules du tableau qu'**aucun écran
n'appelle** : `enregistrerAppareil` est écrit, éprouvé, et branché sur rien — voir
la limite « Les notifications push ne partent pas » au README, §9. Le banc les
déclare quand même, et c'est voulu : elles sont la moitié serveur d'une
fonctionnalité dont la moitié cliente existe, et les déclarer est ce qui empêchera
l'oubli le jour où un écran les appellera.

Les deux politiques de compartiment, elles, vivent **hors du dépôt** — le schéma
`storage` n'existe pas dans la doublure des tests. Ce qui est dans le dépôt, c'est
l'**instruction** qui les crée : `MISE-EN-SERVICE.md` §1.4, que
`scripts/check-rls-guards.test.mjs` lit pour vérifier que le compartiment protégé
est celui que le code interroge, que rien n'y autorise l'écriture, et que la
politique ouverte au rôle anonyme est **bornée** par les tables qui décident de
ce qui est public — sans quoi la seule clé publique, extraite d'un APK, ouvrirait
aussi les documents du bureau.

**Deux tables, et non une**, depuis que les actualités portent une photo. Le
même compartiment sert aux documents, bornés par `documents.visibility`, et aux
photos d'actualité, bornées par `annonces.is_draft`. Une photo n'a **aucune**
ligne dans `documents` : exiger la seule table `documents` aurait refusé les
photos aux familles sans compte — un défaut qui ne se voit que sur un téléphone,
et seulement sur les articles illustrés. La liste des tables citées par cette
politique est donc **close dans les deux sens** dans le banc : en nommer une
quatrième sans la déclarer fait tomber le contrôle.

Une écriture de statut n'apparaît pas dans ce tableau, et c'est normal : elle ne
passe par aucune requête de `src/services/`. Le bureau décide d'une adhésion par
`decider_adhesion()`, une fonction `security definer` qui vérifie `is_admin()`
dans son corps — voir plus bas.

La ligne du bucket est la seule de ce tableau qui ne soit pas une table. Les
documents sont rangés dans un compartiment **privé**, et l'application n'en
obtient qu'une adresse signée, valable une heure. Les politiques d'un compartiment
se règlent dans le tableau de bord et **aucun test du dépôt ne peut les lire** :
c'est pourquoi `scripts/check-rls-guards.test.mjs` exige que tout appel à Storage
soit déclaré nommément, avec sa raison, plutôt que de laisser croire qu'il est
couvert par ce tableau.

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

**Un statut se change par une fonction, jamais par une politique.** C'est la
suite directe du constat précédent. `profiles` n'ayant aucune politique
d'écriture, le bureau ne pouvait accepter une adhésion que depuis l'éditeur SQL,
avec sa parenthèse `disable trigger` — un geste de développeur pour une décision
d'association, et le parent restait en attente sans que rien ne le dise.

Rouvrir une politique `for update` aurait réglé le symptôme en élargissant la
capacité bien au-delà du besoin : elle aurait porté sur **toutes** les colonnes
de la ligne, pour tout administrateur, et le déclencheur `prevent_role_change`
serait devenu la seule barrière entre un client modifié et un changement de rôle.
`decider_adhesion(p_id, p_statut)` fait exactement ce qui est demandé — un
statut, sur une ligne, par un administrateur — et rien de plus : elle est
`security definer`, vérifie `is_admin()` dans son corps, et ne connaît pas la
colonne `role`. Promouvoir un administrateur reste le geste manuel de
`MISE-EN-SERVICE.md`.

Le banc l'éprouve **dans les deux sens** : un membre ordinaire reçoit « Réservé
au bureau. », le bureau obtient le changement, et le changement est relu en base
— l'absence d'erreur ne suffit pas, une fonction qui ne toucherait aucune ligne
serait silencieuse. Le refus d'un identifiant inconnu est mesuré de même.

**Le détecteur, pour la troisième fois de la même famille.** Les trois constats
ci-dessus sont sortis de la même question — _cette politique autorise-t-elle
quelque chose que le code n'exerce pas ?_ — et le troisième ne se voyait qu'en
confrontant la liste des politiques à celle des requêtes. Un test de forme le fait
désormais à chaque exécution : il relève les appels de `src/services/`, exige que
chacun ait une politique, exige que toute modification de ligne soit déclarée
**nommément avec sa raison** — il n'y en a qu'une, `push_tokens.update` —, et
**nomme une par une** les politiques qu'aucun écran n'exerce.
Toute politique non exercée doit donc être un chemin d'administration
(`is_admin()`), ou figurer dans une liste d'exceptions écrites à la main — dont
`profiles.insert`, le filet de sécurité de `handle_new_user`. Ajouter une
politique que rien n'utilise demande désormais de l'écrire.

**Un verrou `before update` ne couvre pas l'insertion. Défaut trouvé, puis
corrigé.** Le déclencheur ne se déclenche qu'à la modification : la condition
d'insertion de `signalements` ne contraignait que `author_id`, si bien qu'un
client modifié — ou un appel direct à l'API avec son propre jeton — créait un
signalement déjà « traité », que le bureau, qui filtre sur les nouveaux **dans le
tableau de bord** — aucun écran de l'application ne les lui montre —, ne voyait
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

Ce résultat a d'abord été une vérification **par lecture**. Ce qui suit, en
revanche, est **mesuré** — `check-rls-comportement` exécute les politiques sous
chaque rôle, et chaque affirmation a été éprouvée par la mutation qui la retire.

**Ce que les politiques font, vérifié en les exécutant.**

- un **signalement** n'est lisible que par son auteur et par le bureau : un
  adhérent qui interroge la table ne reçoit que ses propres lignes ;
- **aucun écran ne peut renommer un profil, pas même un administrateur** :
  `profiles` n'a aucune politique de modification, donc l'API rend zéro ligne
  pour tout le monde. Le bureau corrige un libellé depuis le tableau de bord, où
  la clé `service_role` ne passe par aucune politique ;
- le **statut d'un signalement** ne change que par un administrateur : le
  déclencheur `prevent_status_change_by_member` refuse le membre avec son propre
  message, et accepte le bureau ;
- un signalement ne peut être créé **ni déjà traité, ni au nom d'un autre**, et
  un message comme une réservation ne s'écrivent qu'en son nom ;
- supprimer un compte **efface** profil, signalements, messages et réservations,
  et **détache** ses annonces (`author_id` passe à `NULL`) : la promesse RGPD
  ci-dessous est mesurée, plus seulement écrite.

**Deux formes de refus, et le code doit les distinguer.** Un refus **de
politique** rend une **liste vide**, jamais une erreur : l'écran affiche « aucune
donnée », sans message. C'est le cas de tout ce qui précède. Le rôle `anon`, lui,
reçoit `permission denied` — une erreur — parce que la section « Privilèges » lui
**retire ses droits** : le refus précède la politique. L'application ne s'en sert
jamais, faute de session, mais la distinction est écrite pour que personne ne
l'efface en croyant à une incohérence.

**Les droits d'`authenticated` viennent de la plateforme, pas du fichier.** La
migration ne fait que **révoquer** ceux d'`anon` ; elle n'accorde rien à
`authenticated`, qui tient ses privilèges des **privilèges par défaut** de
Supabase sur les nouvelles tables. Un lecteur du seul fichier SQL en conclurait
le contraire. C'est pourquoi la doublure des bancs les reproduit, et dans
l'ordre : les poser après la migration rendrait à `anon` ce qu'elle lui retire.

**La procédure d'amorçage est exercée dans ses deux moitiés.** Promouvoir le
premier administrateur échoue sans la parenthèse `disable trigger` /
`enable trigger`, et réussit avec. Le détail contre-intuitif, mesuré en écrivant
le banc : par l'API, ce déclencheur est **inatteignable**, puisque `profiles` n'a
aucune politique de modification — l'`update` ne touche zéro ligne sans même
l'atteindre. Le piège ne se reproduit que là où RLS ne s'applique pas, c'est-à-dire
dans l'éditeur SQL, qui agit en propriétaire des tables. C'est exactement la
situation de la mise en service.

## Une conversation privée ne s'ouvre pas avec son numéro

Une conversation entre un parent et le bureau n'appartient à **aucun compte** :
c'est ce qui permet à une famille sans compte d'écrire, et de recevoir une
réponse. Elle est identifiée par un numéro, et protégée par un **secret** tiré par
la base — `gen_random_uuid()`, 122 bits — et **rendu une seule fois**, à l'appelant
qui vient de créer le fil. La table n'en garde que `md5(secret)` : une
transformation irréversible d'un jeton à forte entropie, et non un hachage de mot
de passe. Si la table fuit, l'empreinte ne sert à rien.

La propriété qui en découle est celle-ci : `lire_conversation(id, secret)` compare
l'empreinte, et **un mauvais secret rend exactement ce qu'un numéro inconnu
rend** — aucune ligne. Distinguer les deux dirait à un inconnu qu'une conversation
existe, ce qui est déjà une information, et permettrait d'énumérer les numéros.
Connaître le numéro d'un fil ne permet donc pas d'en lire le contenu, et il n'y a
rien à énumérer.

Deux conséquences, et elles sont assumées.

**Les deux tables de conversation n'ont aucune politique**, ni pour `anon`, ni
pour `authenticated` : la migration leur révoque tout, et seules les fonctions
`security definer` les atteignent. Ce sont les seules tables du schéma dans ce
cas, et ce n'est pas un oubli — une table sous RLS sans politique n'est pas
ouverte, elle est fermée à tout le monde, application comprise. Le banc les nomme
une par une (`SANS_POLITIQUE`) plutôt que de les compter comme ouvertes, et il
tombe si l'une d'elles gagnait une politique : la liste ne survit pas à sa cause.

**Le secret n'existe que sur le téléphone.** Le perdre — réinstallation,
changement d'appareil — c'est perdre l'accès au fil, définitivement : l'application
ne peut pas le rendre, puisque le serveur ne le connaît plus. C'est pourquoi le
bouton des Réglages **n'y touche pas**. Il portait auparavant sur toutes les clés
locales, et détruisait donc en silence l'unique copie du secret, sous un libellé
qui parlait de badges de messages non lus. `scripts/check-effacement.test.mjs`
exerce les quatre familles de clés locales et vérifie que l'effacement épargne
celle-là.

## Données personnelles et RGPD

| Traitement                                         | Base                              | Durée                            |
| -------------------------------------------------- | --------------------------------- | -------------------------------- |
| Compte (`auth.users` — e-mail, mot de passe haché) | Intérêt légitime de l'association | Jusqu'à la suppression du compte |
| Profil (`profiles` — nom affiché, rôle)            | Intérêt légitime de l'association | Jusqu'à la suppression du compte |
| Réservations de cantine                            | Exécution du service              | Jusqu'à la suppression du compte |
| Signalements                                       | Intérêt légitime                  | Jusqu'à la suppression du compte |
| Messages de discussion                             | Consentement (publication)        | Jusqu'à la suppression du compte |
| Notifications (`push_tokens` — jeton d'appareil)   | Consentement                      | Jusqu'au retrait du jeton        |

La dernière ligne est la **seule qui ne suit pas le compte**, et elle est écrite
ici parce que la conséquence se lit mal : `push_tokens` ne porte aucun
identifiant de compte — un jeton, une plateforme, deux dates. Rien ne le relie à
une personne, donc **rien ne l'efface en cascade**, et la table n'accorde ni
`delete` ni politique de suppression : le retrait d'un jeton est un geste
**manuel** du bureau, depuis l'éditeur SQL. Un appareil désinstallé cesse de
renouveler son jeton, et celui-ci est alors refusé par le service d'envoi — il
reste néanmoins dans la table tant que personne ne l'en retire.

Les deux premières lignes sont séparées à dessein : l'e-mail est une donnée
personnelle qui vit dans `auth.users`, lu par le seul intéressé ; le nom affiché
est une donnée **publiée aux autres adhérents**, ce qui n'est pas la même chose
au regard de l'information des personnes.

`profiles.id` référence `auth.users` avec `on delete cascade` : supprimer un
compte efface en cascade le profil, les réservations, les signalements, les
messages de discussion, les messages adressés à l’association et les votes. Une
demande d'effacement se traite donc en supprimant le compte, sans intervention
manuelle table par table.

Cette phrase est une promesse faite aux adhérents, pas un commentaire :
`scripts/check-rls-guards.test.mjs` vérifie que les tables qu'elle nomme sont
**exactement** celles que la cascade efface, et qu'aucune autre ne l'est. Quatre
tables échappent à la règle, et c'est délibéré : `annonces`, `agenda_events`,
`documents` et `sondages` suivent `on delete set null`, parce qu'une annonce, une
date du calendrier, un document partagé et une question posée à tous restent
utiles après le départ de leur auteur — les effacer retirerait de l'information
collective au motif qu'un compte a été fermé. Ces quatre colonnes doivent rester
nullables : `not null` avec `set null` rendrait la suppression du compte
impossible, la base refusant d'écrire `NULL` dans la colonne.

La règle qui distingue les deux listes se dit en une phrase, et c'est elle que le
test interroge plutôt que des noms de tables : **ce qui est adressé à tout le
monde survit à son auteur ; ce qui est adressé par une personne, ou privé, est
effacé.** Un vote est rattaché à son votant, un message au bureau est écrit par
son auteur : tous deux partent avec le compte. L'analyse part de `auth.users` —
la table des comptes, qui est la racine de l'effacement — et non de `profiles`,
et elle suit les arêtes `cascade` jusqu'à fermeture : `cantine_reservations`
n'atteint le compte qu'à travers le profil, et une jointure d'un seul saut l'aurait
manqué.

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
