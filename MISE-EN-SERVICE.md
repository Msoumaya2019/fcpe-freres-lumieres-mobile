# Mise en service — le guide, étape par étape

> **En résumé.** Les étapes 1 à 4 sont faites : Supabase répond, le projet Expo est
> créé, le jeton est posé, et **les e-mails partent** — vérifié jusqu'au clic sur le
> lien reçu. **Les deux binaires se recompilent** — l'APK Android et l'IPA non signé.
> **Les dix fichiers SQL sont appliqués** — mesuré le 21 septembre 2026 : les tables,
> les fonctions et les colonnes que chacun crée seul répondent à la clé publique, et
> un témoin inventé répond `42703`. Ce qui reste tient en trois gestes : les quatre
> réglages du tableau de bord (§6), installer l'application sur un téléphone, et vos
> propres gestes — votre compte, la promotion, l'adhésion.
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

| #   | Vous                                                                                        | Durée   | Moi, dès réception                                              |
| --- | ------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------- |
| 1   | Un projet Supabase, les **sept** fichiers SQL collés, le compartiment créé, l'URL et la clé | ~15 min | `.env.local`, variables EAS                                     |
| 2   | Un compte Expo, et la connexion faite une fois                                              | ~5 min  | `eas init`, variables EAS, compilation de l'APK                 |
| 3   | Un jeton Expo pour GitHub _(facultatif)_                                                    | ~2 min  | le secret `EXPO_TOKEN`, qui réveille la compilation automatique |
| 4   | Recopier les quatre identifiants SMTP                                                       | ~5 min  | ✅ les e-mails partent, jusqu'au clic sur le lien               |
| 5   | Installer l'APK, ou signer l'IPA puis l'installer                                           | ~2 min  | les vérifications sur appareil réel                             |
| 6   | Les réglages du tableau de bord (§6)                                                        | ~5 min  | **deux mesurés en place** ; deux écrans à regarder              |
| 7   | Une clef Firebase pour les notifications Android                                            | ~15 min | `google-services.json` placé, l'APK recompilé et redéposé       |

**Où en est la mise en service : la « liste à cocher », plus bas, fait foi.** Les  
étapes 2, 3 et 4 sont faites — les e-mails fonctionnent jusqu'au clic sur le lien  
reçu. De l'**étape 1**, il ne reste rien de mesurable : **les dix fichiers SQL  
sont appliqués**, et le compartiment des documents porte ses cinq politiques. Seul  
le cinquième (§1.3, le vote des membres connectés) reste **non mesurable** de  
l'extérieur : la clé publiable ne distingue pas sa politique avant et après, et le  
sonder demanderait d'**écrire** une ligne. **Mesuré le 21 septembre 2026** : les  
tables, les fonctions et les colonnes que chaque fichier crée seul répondent à la  
clé publique, et la photographie de l'école se signe **sans compte**. Viennent ensuite, dans cet ordre : installer l'application  
(§5), créer votre compte, **vous promouvoir administrateur** (§1.8 — une commande  
à coller, qui ne peut pas être la mienne), **accepter votre propre adhésion** (§1.9 —  
sans elle, la discussion vous répond une liste vide), puis les réglages du  
tableau de bord (§6) — dont **deux sont déjà mesurés en place**.

Les deux binaires, eux, sont à jour du code actuel : la page des versions nomme, pour  
chacun, le commit dont il est né. Un binaire antérieur à la refonte vous montrerait  
l'ancienne application — c'est pourquoi cette page porte cette ligne.

---

## Étape 1 — Supabase _(~15 min)_ — **faite, et vérifiée le 21 septembre 2026**

> **Faite, et vérifiée de l'extérieur le 18 septembre 2026** — pour les six tables de  
> la première migration. Le projet que vous avez créé répond, et ces six tables  
> **existent et refusent la clé publique** (`permission denied`). C'est exactement ce  
> que la migration doit produire : une table qui existe et qui est fermée.
>
> **Le compartiment des documents porte ses cinq politiques** — mesuré le  
> 21 septembre 2026 : la photographie de l'école se signe avec la seule clé  
> publique (`200`), là où elle rendait `NoSuchKey` la veille. **Les dix fichiers  
> SQL sont appliqués.** Rien ici n'attend plus votre mot de passe.

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

### 1.3 Créer les dix-sept tables

Dans le menu de gauche, cliquez **SQL Editor**, puis **New query**.

Vous allez coller **huit fichiers**, l'un après l'autre, dans cet ordre.

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

**Quatrième collage** — l'administration : le brouillon d'actualité, le
changement de rôle, la clôture d'une conversation :

```
supabase/migrations/20260921090000_administration.sql
```

Même geste, même message attendu. Ce fichier ne crée **aucune table** : il ajoute
une colonne à `annonces` et deux fonctions au bureau. Il n'est nécessaire que
pour le **tableau de bord** (dépôt `fcpe-freres-lumieres-admin`, fichier
`ADMINISTRATION.md`). L'application mobile
fonctionne sans lui, sauf que le bureau ne peut alors ni promouvoir un
administrateur, ni clore une conversation depuis le tableau de bord. Il s'applique
en dernier, et se recolle sans doublon. **Il est appliqué** — mesuré depuis
l'extérieur le 20 septembre 2026 : la colonne `is_draft` existe, et les deux
fonctions répondent.

**Cinquième collage** — le vote des membres connectés :

```
supabase/migrations/20260921120000_vote_connecte.sql
```

Même geste, même message attendu. Ce fichier ne crée rien non plus : il
**remplace** la politique d'insertion des votes, qui était déclarée pour le
seul rôle anonyme, et l'ouvre au membre connecté. **Sans lui**, un adhérent
qui a un compte ne peut pas répondre à un sondage : le refus dit « vous n'avez
pas les droits nécessaires », et il ne vient ni du sondage ni de la réponse
choisie. Il s'applique après le troisième fichier, qui déclare cette
politique, et se recolle sans doublon.

**Sixième collage** — le super administrateur, les commentaires validés et les
photos d'actualité :

```
supabase/migrations/20260921150000_super_admin.sql
```

Même geste, même message attendu. C'est le fichier le plus long des trois
derniers, et il porte quatre choses d'un coup :

- une colonne `est_super_admin` sur `profiles`, et les **deux verrous** qui vont
  avec — sans quoi n'importe quel compte créé aurait pu s'insérer lui-même super
  administrateur, et la hiérarchie tombait par la porte d'entrée ;
- la table `commentaires` — la **seizième** —, où les familles déposent un
  commentaire sous une actualité, publié seulement après votre validation ;
- la lecture des signalements et des messages des familles, désormais réservée
  au super administrateur ;
- une colonne `image_path` sur `annonces`, pour la photo d'un article.

Il s'applique après les cinq autres, et se recolle sans doublon. **Il est
nécessaire pour les deux dépôts** : l'application mobile affiche les
commentaires, et le tableau de bord les valide.

**Septième collage** — les trois cibles d'un commentaire :

```
supabase/migrations/20260921180000_commentaires_trois_cibles.sql
```

Même geste, même message attendu. Il **complète** le sixième : il modifie la
table `commentaires`, que le sixième crée. Collé seul, il est refusé sur
`relation "public.commentaires" does not exist`.

Ce qu'il apporte : un commentaire ne se dépose plus seulement sous une
**actualité**, mais aussi sous un **sondage** et sous un **jour de cantine**.
Une ligne de `cantine_menus` est un jour — c'est ce qu'un parent veut
distinguer, et « le jeudi, mon enfant est allergique » ne se dit pas d'une
semaine entière. Une contrainte garantit qu'un commentaire a **exactement une**
cible, et chacune des trois clés étrangères efface le fil avec sa cible.

> **À coller après le sixième collage**, jamais avant. C'est l'un des **deux** qui
> dépendent d'un collage antérieur par une **modification** de table, et non par
> une simple lecture — l'autre est le neuvième, qui ajoute une colonne à
> `annonces` et dépend donc du premier.

**Huitième collage** — le titre du bandeau d'accueil, et le retrait d'un message
de conversation :

```
supabase/migrations/20260921210000_reglages_et_moderation.sql
```

Même geste, même message attendu. Il apporte deux choses, réunies dans un seul
fichier pour qu'un seul collage suffise :

- la table `reglages` — la **dix-septième** —, où le tableau de bord écrit le
  **titre** et la **devise** qui s'affichent sous la photographie de l'école.
  Elle est lisible par tout le monde, y compris les familles sans compte, et
  modifiable par le **bureau** — le même droit que la photographie, à côté de
  laquelle ce titre s'affiche ;
- la fonction `supprimer_message_conversation()`, qui permet au tableau de bord
  de retirer un message écrit par une famille dans une conversation privée. Les
  deux tables de conversation n'ont **aucune politique** — c'est délibéré —, donc
  ce retrait ne peut pas être un `delete` ordinaire : il passe par une fonction
  qui vérifie le droit elle-même, comme la réponse et le rangement.

> **À coller après le sixième collage**, pour la même raison que le septième : la
> fonction s'appuie sur `is_super_admin()`, que le sixième crée.

**Neuvième collage** — l'actualité épinglée :

```
supabase/migrations/20260922090000_annonce_epinglee.sql
```

Même geste, même message attendu. C'est le fichier le plus court du dépôt : une
**colonne**, et rien d'autre. Aucune table, aucune politique, aucun droit —
`annonces_update_admin` autorise déjà le bureau à écrire cette table, et un
`grant` de table couvre la colonne nouvelle.

Ce qu'il apporte : `annonces.epinglee_at`. Le tableau de bord peut alors
**épingler** une actualité, qui reste en tête de l'accueil **et** de la rubrique
« Actualités », quel que soit son âge. Détacher l'actualité écrit `null` dans la
même colonne : il n'y a pas de second chemin à tenir, donc pas de second chemin
à oublier.

Pourquoi une colonne, alors qu'une clef dans `reglages` aurait évité ce collage :
parce que le tri doit être fait par le **serveur**. L'application ne lit que les
trente actualités les plus récentes ; une actualité plus ancienne n'est pas dans
cette page, et aucun réordonnancement fait ensuite dans l'application ne pourrait
l'y remettre. L'épinglage d'une annonce que les familles ne voient plus — le cas
où il sert vraiment — ne ferait **rien**, et le dirait d'autant moins.

> **À coller après le premier collage** : il modifie la table `annonces`, que le
> premier crée. Collé seul, il s'arrête sur
> `relation "public.annonces" does not exist`.

**Ce que l'application fait tant qu'il n'est pas collé** — et c'est la raison
d'un repli qui a sa propre histoire : rien de cassé, et une fonctionnalité en
moins. PostgreSQL refuse **en bloc** une requête qui nomme une colonne absente
(`42703`) : un `order` sur `epinglee_at` ferait donc tomber l'accueil **entier**
— photographie et bandeau compris — pour toutes les familles. `fetchAnnonces`
reconnaît cette erreur-là, et **elle seule**, puis relit la liste comme avant,
du plus récent au plus ancien. Une base en retard ne doit pas priver les familles
de ce qu'elles lisaient la veille ; ce repli ne masque aucun autre refus, et
`check-async-wiring` tient les deux moitiés — la colonne gardée, et l'ordre des
deux lectures.

**Dixième collage** — le jeu d'essai, et il est facultatif :

```
supabase/seed.sql
```

**Attendu : `Success. No rows returned`** — un `insert` ne renvoie pas de lignes,  
donc le message est le même. C'est normal.

> **Les neuf fichiers sont rejouables.** Si un message d'erreur apparaît, corrigez  
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

1. Menu de gauche → **Storage**. **Si le compartiment `documents` existe déjà, ne
   le recréez pas** — c'est le cas le plus fréquent, et c'est le bon : le tableau
   de bord refuse deux compartiments du même nom, et il n'y a rien à réparer.
   Passez directement à l'étape 3, qui est la seule qui compte.
2. Sinon, **New bucket**. Nom : `documents` — exactement, en minuscules.
3. **Public bucket : laissez décoché** — et vérifiez-le **même** sur un
   compartiment qui existe déjà, car c'est le seul réglage qui ne se lit pas dans
   le SQL. L'application ne sert jamais un fichier directement : elle demande une
   **adresse signée**, valable une heure. Un compartiment public rendrait tous les
   documents lisibles par quiconque possède l'adresse.
4. Ouvrez **Policies** sur ce compartiment, et collez-y **cinq** politiques dans
   l'éditeur SQL, comme les fichiers ci-dessus — le tableau de bord les crée à
   l'identique, mais par des cases à cocher qu'on peut mal remplir. Les deux
   premières font **lire**, les trois suivantes font **déposer** :

   > **À coller après `20260921150000_super_admin.sql`** — la sixième migration,
   > qui est le **sixième collage** de §1.3. La première politique ci-dessous
   > interroge `annonces.image_path`, une colonne que **seule cette migration
   > crée**. Collée avant elle, la politique échoue sur
   > `column a.image_path does not exist` — et l'échec serait discret : une
   > politique manquante rend une **liste vide**, pas un message.

   ```sql
   --  Ce que les familles peuvent lire : les documents qui leur sont destinés,
   --  les photos des actualités publiées, et la photographie de l'école.
   drop policy if exists storage_documents_select_familles on storage.objects;
   create policy storage_documents_select_familles
   on storage.objects for select to anon
   using (
     bucket_id = 'documents'
     and (
       --  La photographie de l'école : un chemin **convenu**, pas une colonne.
       --  C'est ce qui permet au bureau de la changer depuis le tableau de bord
       --  sans qu'aucune table ne soit écrite ni lue — et c'est le seul objet du
       --  compartiment que le rôle anonyme atteint sans qu'une ligne de la base
       --  le désigne. Le chemin est donc écrit ici, et dans les deux dépôts :
       --  une faute d'une lettre laisse le bandeau dessiné, sans autre signal.
       storage.objects.name = 'accueil/bandeau.jpg'
       or exists (
         select 1 from public.documents d
         where d.storage_path = storage.objects.name
           and d.visibility = 'familles'
       )
       or exists (
         select 1 from public.annonces a
         where a.image_path = storage.objects.name
           and not a.is_draft
       )
     )
   );

   --  Tout le reste : réservé aux porteurs d'un jeton.
   drop policy if exists storage_documents_select_bureau on storage.objects;
   create policy storage_documents_select_bureau
   on storage.objects for select to authenticated
   using (bucket_id = 'documents');

   --  Déposer un document : réservé au bureau.
   drop policy if exists storage_documents_insert_bureau on storage.objects;
   create policy storage_documents_insert_bureau
   on storage.objects for insert to authenticated
   with check (bucket_id = 'documents' and public.is_admin());

   --  Le remplacer : même réserve, sur les deux chemins.
   drop policy if exists storage_documents_update_bureau on storage.objects;
   create policy storage_documents_update_bureau
   on storage.objects for update to authenticated
   using (bucket_id = 'documents' and public.is_admin())
   with check (bucket_id = 'documents' and public.is_admin());

   --  Le retirer : même réserve.
   drop policy if exists storage_documents_delete_bureau on storage.objects;
   create policy storage_documents_delete_bureau
   on storage.objects for delete to authenticated
   using (bucket_id = 'documents' and public.is_admin());
   ```

   Les cinq `drop policy if exists` ne sont pas décoratifs : **sans eux, coller ce
   bloc une seconde fois échoue** sur « policy … already exists ». Avec eux, le
   bloc se rejoue, comme les fichiers de migration — et si vous ne savez plus si
   vous les avez déjà collées, collez-le : le résultat est le même.

   **Pour vérifier ce qui est réellement en place**, collez ceci dans l'éditeur
   SQL — il liste **toutes** les politiques du compartiment, pas seulement les
   nôtres :

   ```sql
   select policyname, cmd, roles
     from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
    order by policyname;
   ```

   Vous devez y lire **nos cinq lignes** : `storage_documents_select_familles`
   pour `{anon}`, puis `storage_documents_select_bureau`,
   `storage_documents_insert_bureau`, `storage_documents_update_bureau` et
   `storage_documents_delete_bureau` pour `{authenticated}`.
   **Toute autre ligne sur ce compartiment est à supprimer** : les cases à cocher
   du tableau de bord en créent d'autres, plus larges — une « public read » rend
   le compartiment public sans que son réglage change, et tous les documents du
   bureau deviennent lisibles par quiconque a l'adresse. Le cas échéant :

   ```sql
   drop policy if exists "nom exact lu ci-dessus" on storage.objects;
   ```

   **Les cinq sont nécessaires.** Sans la première, un parent sans compte voit la
   liste des documents et l'ouverture échoue ; sans la seconde, l'adhérent
   connecté ne verrait plus les documents du bureau ; sans les trois dernières,
   le tableau d'administration ne pourrait **rien déposer** — et l'échec serait un
   refus de Storage, donc visible, mais seulement à la première tentative.

   Le refus à reconnaître s'écrit **« new row violates row-level security
   policy »**. Mesuré avec la clé publiable — donc sans session —, il est rendu
   **au mot près** : c'est le refus par défaut du compartiment, et il ne dit pas
   _quelle_ politique manque. Le tableau de bord le complète donc en nommant la
   cause : **« Votre session a bien été envoyée : le refus vient donc des
   politiques du compartiment, qui n'ont pas été installées »** veut dire
   exactement « revenez ici et collez le bloc ci-dessus ». Si le message dit au
   contraire que **le navigateur n'a envoyé aucune session**, le bloc est en
   place et c'est la connexion qu'il faut refaire.

   Les trois d'écriture sont réservées au **bureau**, et la borne est
   `public.is_admin()`, pas `authenticated` : ce dernier est **tout compte créé**,
   y compris une adhésion encore en attente, refusée ou suspendue. Sans cette
   borne, n'importe qui s'inscrivant déposerait un fichier dans le compartiment
   des documents de l'école. `is_admin()` est celle du schéma : elle est vraie
   pour un profil dont le rôle est `admin` **ou** qui est super administrateur,
   et c'est elle qui borne à la fois l'écriture dans le compartiment et l'accès
   au tableau de bord. Le **statut** de l'adhésion n'y entre pas — il commande
   `is_member()`, donc la lecture des rubriques réservées aux adhérents, et il
   est affiché dans la coque ; il ne décide d'aucun droit d'écriture.

   Le `update` porte **deux** conditions, et ce n'est pas une redondance : `using`
   désigne la ligne qu'on remplace, `with check` la ligne qui en résulte. Une
   seule des deux laisserait remplacer un fichier du compartiment par un autre, ou
   déplacer un fichier hors du compartiment.

   Et la première **n'ouvre pas le compartiment** : elle exige que le fichier
   demandé ait, dans la table `documents`, une ligne marquée `familles` — **ou**
   qu'il soit la photo d'une actualité publiée. Un document du bureau, ou un
   fichier déposé sans ligne correspondante, reste refusé. C'est le même critère
   que celui de la table : `visibility`, une seule fois écrit, lu aux deux
   endroits.

   **Les deux `exists` sont nécessaires, et la seconde branche n'est pas un
   confort.** Le même compartiment sert aux documents et aux photos d'actualité,
   et une photo n'a **aucune** ligne dans `documents` : sans la seconde branche,
   elle serait refusée à un parent sans compte, et l'illustration d'une annonce
   ne s'afficherait que pour les adhérents connectés — un défaut qui ne se voit
   que sur un téléphone, et seulement sur les articles qui ont une photo.

   Les photos sont déposées sous le préfixe `annonces/`, les documents sous
   n'importe quel autre chemin. Ce préfixe n'est **pas** ce qui borne la lecture
   — la borne est la seconde sous-requête —, il range le compartiment : sans lui,
   un document et une photo se retrouveraient mêlés dans la même liste.

   Un mot sur `storage.objects.name` : c'est le chemin du fichier **dans** le
   compartiment, et c'est exactement ce que porte la colonne `storage_path` — et
   ce que porte `annonces.image_path` pour une photo. C'est cette égalité qui fait
   le lien entre le fichier et sa fiche.

   Ces politiques ne figurent pas dans nos migrations : le schéma `storage`
   n'existe pas dans la doublure des tests, et une instruction le concernant
   empêcherait les fichiers ci-dessus d'être rejouables. C'est pourquoi le banc
   `check-rls-guards` lit **ce guide** : il vérifie que le compartiment protégé
   est celui que le code interroge, qu'aucune écriture n'y est ouverte au rôle
   anonyme ni à un simple porteur de jeton, et que la politique ouverte au rôle
   anonyme est bien bornée par la table `documents`.

Tant que le compartiment n'existe pas, l'écran Documents affiche une erreur de
chargement — les autres écrans ne sont pas affectés.

### 1.5 Vérifier que les seize tables sont là

C'est la vraie vérification : le message `Success` ne dit pas que les tables  
existent, il dit que le SQL n'a pas échoué.

**Les quinze premières ont été vérifiées pour vous**, depuis l'extérieur, avec la
clé que vous m'avez envoyée : les quinze **existent**. C'est la vraie
vérification, et elle est faite. Les deux moitiés comptent — une table absente
répondrait `404`, une table ouverte aurait laissé passer la lecture.

**La seizième, `commentaires`, arrive avec le sixième fichier** — celui du super
administrateur —, qui n'est pas encore appliqué. Tant qu'il ne l'est pas, elle
n'existe pas : c'est normal, et c'est la seule des seize dans ce cas.

Elle ne dit pas la même chose de toutes, et c'est ce qui la rend utile :

- **Huit refusent la clé publique** (`401`, `permission denied`) : `profiles`,
  `signalements`, `discussion_messages`, `messages`, `conversations`,
  `conversation_messages`, `cantine_reservations`, `sondage_votes`. Un `401`
  prouve l'existence **et** la fermeture — c'est le meilleur des deux signes.
- **Deux répondent avec des lignes** : `annonces` et `cantine_menus` (10). Le
  jeu d'essai pose **deux** annonces ; le compte a grandi depuis, parce que le
  bureau en a publié — c'est le signe que la chaîne complète fonctionne.
- **Quatre répondent avec zéro ligne** : `agenda_events`, `documents`,
  `sondages`, `sondage_choices`. Elles sont **vides**, pas fermées — l'écran qui
  les lit affichera « aucune donnée », ce qui est le comportement attendu avant
  votre première publication.
- **`push_tokens` répond aussi avec zéro ligne, et pour une autre raison** : elle
  accepte l'écriture d'un appareil sans compte, mais sa lecture est réservée au
  bureau. Le rôle anonyme n'y voit rien, exactement comme la politique le décrit.

**Les quatre premières migrations sont appliquées**, et c'est mesuré — le
20 septembre 2026, depuis l'extérieur : la colonne `is_draft` répond `200`, et les
sept fonctions qu'appelle le tableau de bord existent. Chacune refuse la clé
publiable (`401`, `permission denied`), sauf `resultats_sondage`, qui l'accepte
(`200`) — ouverte à `anon` par décision écrite, parce qu'elle rend des compteurs
par réponse et jamais une ligne de votant.

**La cinquième, elle, n'est pas encore appliquée** — et c'est mesuré aussi : en
rôle anonyme, un vote franchit le privilège et la politique, et c'est le
déclencheur qui refuse une réponse étrangère au sondage (`23514`, « Le choix ne
fait pas partie de ce sondage »). Le chemin anonyme fonctionne donc, et c'est le
rôle `authenticated` qui n'avait aucune politique d'insertion : le seul compte
existant — celui du bureau — ne pouvait pas voter.

**La sixième, celle du super administrateur, n'est pas appliquée non plus** — et
c'est mesuré de la même façon : la colonne `est_super_admin` n'existe pas encore,
et une requête qui la nomme échoue (`42703`) au lieu de répondre. C'est le signe
qu'il faut coller le sixième fichier, et non que quelque chose est cassé. C'est
aussi pour cela que la seizième table n'apparaît pas encore dans la liste
ci-dessous.

1. Dans le menu de gauche, cliquez **Table Editor**.
2. Vous devez voir les seize tables : `agenda_events`, `annonces`,
   `cantine_menus`, `cantine_reservations`, `commentaires`,
   `conversation_messages`, `conversations`, `discussion_messages`, `documents`,
   `messages`, `profiles`, `push_tokens`, `signalements`, `sondage_choices`,
   `sondage_votes`, `sondages`.
   Les trois arrivées avec le **troisième** fichier sont `conversations`,
   `conversation_messages` et `push_tokens` ; la seizième, `commentaires`, arrive
   avec le **sixième**. Si l'une des trois premières manque, c'est le troisième
   fichier qui n'a pas été collé ; si c'est la dernière, c'est le sixième.
3. Cliquez sur **annonces** : le jeu d'essai en pose **2 lignes**, et ce nombre ne
   bouge plus si vous relancez `seed.sql`. Il **grandit** en revanche à chaque
   actualité que vous publiez : c'est normal, et c'est même souhaitable.
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

**Elle pose deux colonnes, et la seconde est la plus importante.** Depuis le
sixième fichier, la commande écrit aussi `est_super_admin = true`. Valider une
adhésion, lire les messages des familles, traiter un signalement, publier un
commentaire : ces quatre gestes sont désormais réservés au **super
administrateur**. Un compte promu administrateur sans cette colonne verrait tous
les écrans du bureau, et se verrait refuser chacune de ces actions — avec la
phrase « Réservé au super administrateur. », qui dit la cause sans dire le
remède.

> **Si vous êtes déjà administrateur, recollez la commande après le sixième
> fichier.** Elle ne fait pas de mal : elle remet les deux colonnes à la même
> valeur. C'est même le seul moyen de devenir super administrateur, puisque
> l'application ne peut pas l'écrire — un déclencheur l'interdit, exactement
> comme pour `role`.

### 1.9 Accepter votre propre adhésion, puis celles des familles

**Le piège, et il est silencieux.** Depuis la troisième migration, une inscription
est une **demande** : un compte neuf naît `en_attente`. Vous promouvoir
administrateur vous donne le droit de **décider** — pas d'être accepté. Votre
propre compte reste donc `en_attente`, et l'écran de discussion vous répondra une
**liste vide** : un refus, ici, ne dit jamais pourquoi.

**Et depuis le sixième fichier, ce droit appartient au seul super
administrateur.** Un second compte promu simple administrateur ne peut plus ni
valider une adhésion, ni lire les messages des familles, ni traiter un
signalement, ni publier un commentaire : c'est exactement ce qui a été demandé.
Si l'écran des adhésions vous répond « Réservé au super administrateur. », c'est
que votre compte n'a pas `est_super_admin` — recollez la commande de §1.8, elle
pose les deux colonnes.

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

Ces **cinq** réglages vivent dans le tableau de bord Supabase et **pas** dans un  
fichier du dépôt : aucun test ne les protège, donc ils sont consignés dans le  
`README.md` (§4) plutôt que laissés à la mémoire.

**Quatre restaient à faire, et deux ne le sont plus** — mesurés le 21 septembre 2026
par `npm run verifier:redirection`, qui interroge GoTrue et dit, pour chaque adresse,
si elle est retenue ou remplacée par le repli. Le cinquième, le SMTP, était déjà fait.

Pour que vous sachiez de quoi il s'agit :

| #   | Écran                                              | Valeur                                                                                                                |
| --- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | Authentication > URL Configuration > Redirect URLs | **deux** adresses : `fcpefl://reinitialisation` et `fcpefl://confirmation` — **mesuré en place** le 21 septembre 2026 |
| 2   | Authentication > URL Configuration > Site URL      | `https://fcpe-freres-lumieres-admin.vercel.app/confirmation` — **mesuré en place** le 21 septembre 2026               |
| 3   | Authentication > Email Templates > Reset password  | le lien doit être `{{ .ConfirmationURL }}` (c'est le défaut)                                                          |
| 4   | Authentication > Providers > Email                 | _Minimum password length_ = **6**, et la confirmation d'e-mail activée                                                |
| 5   | Authentication > SMTP Settings                     | les identifiants de l'étape 4 — **fait**, vérifié jusqu'au clic sur le lien                                           |

Le réglage 1 est **le plus important** : Supabase refuse toute redirection absente de  
cette liste, et l'adhérent qui a oublié son mot de passe ne recevrait alors aucun  
lien utilisable. Les deux adresses sont recopiées du fichier  
`src/auth/redirectPaths.ts`, et un test vérifie qu'elles restent d'accord.

Le réglage 2 ne se voit que le jour où il manque : c'est le repli de tout lien dont  
l'adresse n'est pas retenue, et celui de tout lien ouvert sur un ordinateur, où le  
schéma `fcpefl://` n'ouvre rien. Mesuré le 21 septembre 2026 : il valait encore  
`http://localhost:3000`, la valeur par défaut de Supabase, et **les deux adresses  
ci-dessus étaient refusées**. L'adhérent qui confirmait son adresse lisait « ce site  
est inaccessible » alors que son compte était bel et bien confirmé.

Ces deux réglages-là sont aussi les seuls que l'on puisse **éprouver** sans les  
essayer : `npm run verifier:redirection` interroge GoTrue et dit, pour chaque adresse,  
si elle est retenue ou remplacée par le repli.

---

## Étape 7 — Les notifications Android _(~15 min)_ — **en attente de votre geste**

**Ce que cette étape change.** Jusqu'ici, l'application ne prévenait personne : une  
actualité publiée, un message du bureau, et il fallait ouvrir l'application pour  
l'apprendre. Le code des notifications est écrit, vérifié et compilé — il attend  
**une seule chose** : une clef de compte de service Firebase, que seul un compte  
Google peut créer.

**Pourquoi ce n'est pas moi qui la crée.** Créer un projet Firebase demande d'ouvrir  
la console avec votre compte Google, et déposer la clef chez EAS demande une session  
Expo. Or `npx eas-cli whoami` répond **« Not logged in »** sur cette machine : la  
connexion n'a jamais été faite ici, et je ne vous demanderai ni votre mot de passe  
Google, ni votre mot de passe Expo. Les cinq gestes des §7.1 à §7.4 sont donc les  
vôtres. Tout le reste est fait.

**Ce qui est déjà fait, et mesuré :**

- Le paquet `expo-notifications` est installé et épinglé à la version du SDK — il est  
  **déjà dans l'APK** que vous avez installé. Il n'y a aucune dépendance à ajouter.
- La demande d'autorisation vit dans `src/services/push.ts` ; le dépôt du jeton est  
  resté dans `src/services/notifications.ts`, qui ne connaît **aucun** module natif.  
  C'est cette séparation qui rend l'écriture vérifiable sans téléphone.
- L'écran **Réglages** porte la carte « Notifications », et c'est **le seul endroit**  
  qui pose la question. Au démarrage, l'application se tait : un appareil qui a déjà  
  répondu oui rafraîchit son jeton, un appareil qui n'a jamais répondu reste en paix.
- Le canal Android `default` est créé à l'exécution **et** annoncé au manifeste.  
  Vérifié par une précompilation réelle, et non par lecture du code : le manifeste  
  produit porte `com.google.firebase.messaging.default_notification_channel_id = "default"`.
- Les politiques de `push_tokens` autorisent déjà l'insertion et la mise à jour par un  
  appareil **anonyme** : **aucun fichier SQL n'est à coller** pour cette étape.
- Un banc tient les quatre accords — la frontière entre les deux moitiés, l'unicité de  
  l'import natif, le canal identique des deux côtés, et l'appel **réel** depuis le point  
  d'entrée. Il a été éprouvé dans les deux sens : **quatre mutations, quatre chutes.**

**Ce que vous avez à faire tient en cinq gestes**, tous dans un navigateur sauf le  
quatrième, qui demande un terminal.

### 7.1 Créer le projet Firebase _(~5 min)_

1. Ouvrez <https://console.firebase.google.com> et connectez-vous avec votre compte  
   Google.
2. Cliquez sur **Create a project** — parfois écrit **Add project**.
3. Nom du projet : `FCPE Freres Lumieres`. Google Analytics n'est pas nécessaire,  
   vous pouvez le désactiver.
4. Cliquez **Create project**, puis **Continue** quand la création est finie.

### 7.2 Y ajouter l'application Android _(~3 min)_

C'est cette étape qui fait apparaître le fichier `google-services.json` : sans elle,  
Firebase n'a rien à vous proposer au téléchargement.

1. Sur la page du projet, cliquez sur l'icône **Android** — c'est un des boutons  
   « Add app ».
2. **Android package name** : recopiez exactement `fr.fcpe.frereslumieres`.  
   C'est l'identifiant déclaré dans `app.json` (`expo.android.package`) ; une faute de  
   frappe ici donnerait un fichier qui ne s'applique pas à l'application.
3. **App nickname** et **Debug signing certificate SHA-1** : laissez les deux vides.  
   Le SHA-1 ne sert que si vous restreignez la clef d'API — voir §7.5.
4. Cliquez **Register app**.
5. Firebase affiche alors **Download google-services.json** : téléchargez-le. On s'en  
   sert au §7.4.
6. Cliquez **Next** jusqu'au bout, puis **Continue to console**.

### 7.3 Générer la clef de compte de service _(~2 min)_

C'est **le secret** de cette étape. Il ne doit jamais entrer dans le dépôt, et il ne  
doit jamais passer par cette conversation.

1. Dans la console Firebase, cliquez sur la roue dentée **⚙** puis **Project settings**.
2. Ouvrez l'onglet **Service accounts**.
3. Cliquez **Generate new private key**, puis confirmez avec **Generate key**.
4. Un fichier `.json` se télécharge, sous un nom qui ressemble à  
   `fcpe-freres-lumieres-firebase-adminsdk-xxxxx-xxxxxxxxxx.json`. **Ne le renommez  
   pas et ne le déplacez pas dans le projet.** Le dépôt l'ignore déjà — la ligne  
   `*firebase-adminsdk*.json` de `.gitignore` existe pour lui.

### 7.4 Déposer la clef chez EAS _(~5 min)_

**La voie sans terminal, et c'est celle-ci qu'il faut prendre ici.** EAS accepte
le dépôt depuis son site, et la machine n'a **pas** de Node installé : `npx` y
répond « Le terme «npx» n'est pas reconnu comme nom d'applet de commande » —
mesuré le 20 septembre 2026.

1. Ouvrez <https://expo.dev> et connectez-vous.
2. **Projects** → **fcpe-freres-lumieres** → **Project settings** → **Credentials**
   (la page des identifiants est ce qui suit l'adresse du projet).
3. Section **Android**, profil **production**.
4. **Google Service Account** → **Manage your Google Service Account Key for Push
   Notifications (FCM V1)** → **Set up a Google Service Account Key for Push
   Notifications (FCM V1)** → **Upload a new service account key**.
5. Choisissez le fichier téléchargé au §7.3, puis validez.

**L'autre voie, si Node est installé un jour.** Dans un terminal ouvert **dans le
dossier du projet** (`C:\Users\mchik\WorkBuddy AI\2026-09-16-19-22-17`),
connectez-vous une fois avec `npx eas-cli@latest login`, puis lancez
`npx eas-cli@latest credentials` et suivez les **mêmes** six étapes de menu —
**Android** → **production** → **Google Service Account** → **Manage … (FCM V1)**
→ **Set up … (FCM V1)** → **Upload a new service account key**. EAS détecte alors
le fichier téléchargé et vous propose de le choisir : répondez **Y**.

Le profil est **production** dans les deux voies, et c'est ce que dit la
documentation d'Expo. Il ne décide pas de la compilation : la clef de compte de
service sert au **service de notifications d'Expo** pour joindre FCM, pas à la
fabrication de l'APK. Ce que l'APK lit, lui, c'est `google-services.json` — et
cette partie-là est **faite**.

### 7.5 Le piège de l'empreinte — à lire seulement si vous restreignez la clef

Si vous laissez la clef d'API telle que Google l'a créée, cette section ne vous  
concerne pas. Elle existe parce que la panne qu'elle décrit est **muette** :  
l'application s'installe, s'ouvre, demande l'autorisation, l'obtient — et ne reçoit  
jamais de jeton.

Le fichier `google-services.json` contient une clef d'API (le champ  
`client.api_key.current_key`). Si vous la restreignez, deux réglages doivent être  
justes dans la console Google Cloud (<https://console.cloud.google.com/apis/credentials>) :

- **API restrictions** : autorisez **FCM Registration API** et **Firebase  
  Installations API**, ou laissez la clef sans restriction.
- **Application restrictions** : l'empreinte à utiliser est celle du **certificat de  
  signature** de l'application, pas celle d'une clef de dépôt. Une empreinte qui ne  
  correspond pas fait répondre aux installations Firebase  
  `403 PERMISSION_DENIED: Requests from this Android client application are blocked`,  
  et l'application ne reçoit **aucun** jeton.

Le remède le plus simple, et celui que je vous recommande pour la première mise en  
service : **ne restreignez pas la clef.** Elle n'est lisible que dans un fichier qui  
ne circule pas, et l'application n'est pas distribuée par le Google Play Store — les  
deux raisons pour lesquelles la restriction existe ne s'appliquent pas ici.

### 7.6 Ce que je fais dès réception, et ce qu'il me reste à recevoir

Déposez **`google-services.json`** — le fichier du §7.2, pas celui du §7.3 — dans le  
dossier du projet, et dites-le-moi. Il ne contient que des identifiants publics :  
identifiant de projet, numéro de projet, identifiant d'application. La documentation  
d'Expo autorise explicitement à le versionner, et c'est même nécessaire ici : EAS ne  
téléverse que ce que Git ne retient pas, donc l'ignorer priverait la compilation du  
fichier dont elle a besoin. La ligne qui l'ignorait a été retirée le 20 septembre 2026.

**C'est fait, le 20 septembre 2026.** Le fichier est à la racine, `app.json` le
déclare par `expo.android.googleServicesFile`, et la chaîne complète est passée.
La propriété est bien **lue** : `@expo/prebuild-config` place les trois greffons
`GoogleServices` — la classe Gradle, `apply plugin` et la copie du fichier vers
`android/app/google-services.json` — dans sa liste **par défaut**, donc la
déclaration suffit. Le fichier est **versionné**, et c'est délibéré : EAS ne
téléverse que ce que Git retient.

Un contrôle tient désormais l'accord entre les deux, dans le sens qui est
**muet** : présent et non déclaré, le greffon n'est jamais appliqué et
l'application obtient l'autorisation **sans jamais recevoir de jeton**. Le
désaccord inverse — déclaré et absent — est bruyant, `expo prebuild` s'arrête
sur « Cannot copy google-services.json ».

**Il reste à réinstaller l'APK**, et il est **à jour** — mesuré le 21 septembre 2026 à
11 h 55 : le fichier publié est celui que la page des versions annonce comme `compilé
depuis le commit 43c0123`, et EAS a confirmé ce commit lui-même. Sans réinstallation, la
carte « Notifications » des Réglages n'existera pas, et aucune clef ne pourra rien y
changer.

**La version qui était en ligne avant cette date venait de `a7526c9`**, un commit
antérieur au correctif de `src/services/notifications.ts` : elle s'installait et recevait
des notifications, mais la date de dernier contact d'un appareil restait figée à sa
première installation. C'est la raison de la recompilation — et la provenance se lit sur
la page des versions, qui nomme le commit de chaque fichier.

**Le profil de compilation compte** : c'est `preview` qui produit un **APK**, et
`production` qui produit un **AAB**, lequel ne s'installe pas sur un téléphone. Le
déclenchement manuel du flux propose `preview` par défaut ; un tag `v*` pousse, lui, un
build de production, donc un AAB.

---

## La liste à cocher

**Maintenant :**

- [x] Compte Supabase créé
- [x] Projet créé — il répond à l'adresse que vous m'avez envoyée
- [x] La **région** est européenne — **confirmé par le bureau le 21 septembre
      2026**. La note RGPD ne bloque donc plus. Pour la citer nommément dans le
      registre, elle se relit en trente secondes dans **Project Settings >
      General > Region**
- [ ] Mot de passe de la base noté
- [x] `20260916120000_init.sql` collé et exécuté → les six premières tables existent
- [x] `20260919120000_rubriques.sql` collé et exécuté → **mesuré** : les tables des  
      rubriques répondent, et la clé publique ne lit pas les leurs
- [x] `20260920120000_acces_public.sql` collé et exécuté → **mesuré** : les six  
      tables publiques répondent à la clé publique, et les fonctions du bureau  
      (`lister_conversations`, `decider_adhesion`) la refusent
- [x] `20260921090000_administration.sql` collé et exécuté → le tableau de bord  
      peut enregistrer un brouillon, changer un rôle et clore une conversation  
      _(**mesuré présent le 20 septembre 2026** : `is_draft` répond `200`, et les  
      sept fonctions appelées par le tableau de bord existent, refusant toutes la  
      clé publiable sauf `resultats_sondage`)
- [ ] `20260921120000_vote_connecte.sql` collé et exécuté → un adhérent **connecté**
      peut répondre à un sondage _(sans lui, la politique d'insertion des votes ne
      vise que le rôle anonyme, et le refus dit « vous n'avez pas les droits
      nécessaires » — quelle que soit la réponse choisie. **Non mesurable** : la
      clé publiable ne distingue pas cette politique avant et après. Le recoller
      est sans risque — il **remplace** la politique au lieu d'en ajouter une
      seconde)_
- [x] `20260921150000_super_admin.sql` collé et exécuté → le rôle **super
      administrateur**, la table `commentaires` (la seizième), et la colonne
      `image_path` des actualités — **mesuré présent le 20 septembre 2026** :
      `commentaires` répond, `is_super_admin()` existe, et la colonne
      `est_super_admin` refuse la clé publiable (`42501`), ce qui **prouve
      qu'elle est là** — PostgreSQL détecte une colonne inconnue avant de
      vérifier les privilèges
- [x] `20260921180000_commentaires_trois_cibles.sql` collé et exécuté → un
      commentaire peut porter sur une actualité, un **sondage** ou un **jour de
      cantine** _(à coller **après** le précédent, et jamais seul : il modifie la
      table `commentaires`, donc collé seul il est refusé sur
      `relation "public.commentaires" does not exist`. **Mesuré présent le
      20 septembre 2026** : la sonde « colonnes commentaires.sondage_id et
      menu_id » de `scripts/sonder-base.mjs` répond `200`, là où elle rendait
      `42703` avant le collage. La phrase « non mesurable depuis l'extérieur »
      figurait ici, et elle était vraie **avant** que cette sonde existe ; elle
      ne l'est plus. Le cinquième, lui, reste non mesurable — la clé publiable
      ne distingue pas sa politique avant et après. Le recoller est sans risque :
      les deux colonnes sont posées en `if not exists` et la contrainte est
      retirée puis reposée)_
- [x] `20260921210000_reglages_et_moderation.sql` collé et exécuté → le titre du
      **bandeau d'accueil** se règle depuis le tableau de bord, et un message
      écrit par une famille se retire depuis la page « Messagerie »
      _(à coller **après** `20260921150000_super_admin.sql` : la fonction
      `supprimer_message_conversation()` s'appuie sur `is_super_admin()`, que le
      sixième collage crée. **Mesuré présent le 21 septembre 2026** : la sonde
      « lecture publique de `reglages` » de `scripts/sonder-base.mjs` répond
      `200` avec la seule clé publiable, là où elle rend `42P01` avant le
      collage. Sans ce collage, l'accueil garde son titre d'avant — la lecture
      est repliée —, et c'est le tableau de bord qui le dit : la page
      « Accueil » refuse alors d'enregistrer, avec le message qui nomme la
      migration manquante)_
- [x] `20260922090000_annonce_epinglee.sql` collé et exécuté → une actualité
      **épinglée** reste en tête de l'accueil **et** de la rubrique « Actualités »,
      quel que soit son âge
      _(à coller **après** le premier collage : il modifie la table `annonces`, que
      le premier crée, donc collé seul il est refusé sur
      `relation "public.annonces" does not exist`. **Mesuré présent le
      21 septembre 2026** : la sonde « colonne annonces.epinglee_at » de
      `scripts/sonder-base.mjs` répond `200` avec la seule clé publiable, là où
      elle rend `42703` avant le collage. Sans ce collage, le tableau de bord
      refuse d'épingler, avec le message qui nomme la colonne manquante — et
      l'accueil de l'application **reste lisible**, dans l'ordre d'avant : c'est
      le repli de `fetchAnnonces`, tenu par `check-async-wiring`)_
- [x] `20260922130000_jeton_appareil.sql` collé et exécuté → un appareil
      **enregistre et rafraîchit** son jeton en une seule opération, sans dépendre
      d'une politique de lecture
      _(**mesuré présent le 21 septembre 2026** : la fonction `enregistrer_jeton`
      appelée avec une plateforme que la contrainte de la table refuse rend
      `23514` — elle existe donc, et **aucune ligne n'est écrite**. Un appel
      réussi aurait été un sondage qui écrit. Absente, elle rendrait `PGRST202`.
      C'est le seul marqueur de cette migration, qui ne pose aucune colonne : elle
      retire une politique et ajoute une fonction)_
- [x] Compartiment `documents` **privé** dans Storage — **mesuré** : l'adresse  
      publique du compartiment répond `Bucket not found`, et sa liste répond `200`  
      _(il existe donc, et n'est pas public)_
- [x] Ses **cinq** politiques collées — **mesuré le 20 septembre 2026** : la
      liste anonyme du compartiment répond `200` et laisse voir un document
      destiné aux familles (`menu.pdf`), tandis qu'un dépôt anonyme est refusé.
      La première porte la branche des **photos d'actualité** : sans elle, une
      photo ne s'afficherait que pour les adhérents connectés. **Et le dépôt
      lui-même a été mesuré, le 20 septembre 2026 à 21 h 43** : l'annonce
      « Test » porte `annonces/1789933382028-…png`, un nom que **seul** le
      tableau de bord sait fabriquer (il préfixe l'horodatage de l'instant),
      et cette image se relit sans aucun jeton : `200 image/png`,
      4 047 185 octets
- [x] **Première politique du compartiment recollée** — **mesuré le 21 septembre
      2026 à 9 h 58** : la photographie de l'école se signe avec la seule clé
      publique (`200`), là où elle rendait `NoSuchKey` la veille. Les témoins
      signent toujours (`menu.pdf` et une photo d'actualité publiée, `200`), donc
      la lecture n'est pas cassée : c'est bien la branche du chemin convenu qui
      manquait. Un adhérent la voyait parce que sa politique couvre **tout** le
      compartiment — et l'échec, lui, était discret : une politique absente rend
      une **liste vide**, pas un message
- [x] `seed.sql` collé et exécuté → **mesuré** : `cantine_menus` a 10 lignes sur  
      **10 dates distinctes** (du 18 au 28 septembre, sans le 24) — **aucun  
      doublon**, relevé le 20 septembre 2026. `annonces` en compte quatre à cette  
      date : les deux du jeu d'essai, plus deux publiées par le bureau
- [x] Table Editor : `annonces` a les 2 lignes du jeu d'essai — plus, depuis, celles
      que le bureau a publiées
- [x] Table Editor : les quinze tables de l'époque sont là — **mesuré depuis
      l'extérieur** : huit refusent la clé publique, sept l'acceptent _(la
      seizième, `commentaires`, arrive avec le sixième fichier)_
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
- [ ] Les réglages du tableau de bord (§6) — **deux sont mesurés en place** le
      21 septembre 2026 par `npm run verifier:redirection` : les deux adresses de
      retour sont retenues, et le « Site URL » n'est plus `localhost`. Restent deux
      écrans à regarder : les modèles d'e-mail et la longueur minimale du mot de
      passe
- [ ] **Une clef Firebase**, pour que les notifications Android partent (§7) — et
      **tout se fait dans un navigateur** : les gestes de la console Firebase, puis
      le dépôt de la clef chez EAS (§7.4, voie sans terminal — la machine n'a pas
      Node, donc `npx` n'y répond pas). `google-services.json`, lui, est **déjà
      reçu et déclaré** (§7.6). Sans la clef, un téléphone peut **autoriser** les
      notifications et n'en recevoir aucune : c'est exactement ce que la carte des
      Réglages distingue, en disant « autorisé » et « enregistré » séparément
- [ ] **Réinstaller l'APK** (§7.6) — il est **recompilé et à jour** depuis le 21 septembre
      2026 (commit `43c0123`, confirmé par EAS) : il ne reste que le geste d'installation
- [x] Recopier les quatre valeurs SMTP dans Supabase — vérifié jusqu'au clic sur le lien
- [ ] Le jeton Expo pour GitHub _(facultatif)_

---

## Ce qui est déjà fait

Pour que vous sachiez ce que vous n'avez pas à faire : les quatorze écrans et leur  
navigation, l'authentification et la réinitialisation de mot de passe, les seize tables  
et leurs politiques de sécurité, les contrôles de schéma et de politiques, la chaîne  
de vérification complète (`npm run verify`, **38 fichiers de test**), les  
trois flux GitHub Actions, le dépôt public sans aucun secret, les deux binaires  
compilés — l'APK Android et l'IPA non signé —, les e-mails vérifiés jusqu'au clic  
sur le lien reçu, et la documentation.

## Une seule chose à retenir

**Plus rien ne bloque l'ouverture aux adhérents, côté outillage.** Les e-mails partent,
les deux binaires sont livrés, et deux des réglages du tableau de bord sont **mesurés
en place**. Restent l'installation sur un téléphone, deux écrans à regarder dans
Supabase, et la clef Firebase — des gestes qui demandent vos accès.
