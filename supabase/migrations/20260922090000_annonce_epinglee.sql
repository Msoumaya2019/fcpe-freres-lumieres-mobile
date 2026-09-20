--  ===========================================================================
--  Neuvième migration — une actualité épinglée reste en tête
--  ===========================================================================
--
--  CE QU'ELLE AJOUTE, ET RIEN D'AUTRE
--  ----------------------------------
--  Une colonne, sur une table qui existe déjà. Aucune table, aucune politique,
--  aucun droit : `annonces_update_admin` autorise déjà le bureau à écrire cette
--  table, et un `grant` de table couvre la colonne nouvelle. C'est la migration
--  la plus courte du dépôt, et c'est délibéré — ce qu'elle ne fait pas est ce
--  qui la rend sûre.
--
--  POURQUOI UNE COLONNE, ET NON UNE CLEF DANS `reglages`
--  ----------------------------------------------------
--  C'est la question qui a décidé de cette migration, et la réponse est un
--  défaut mesuré, pas un goût.
--
--  `fetchAnnonces` lit les trente actualités les plus récentes. Si l'épinglage
--  vivait dans `reglages`, l'application lirait l'identifiant épinglé **puis**
--  réordonnerait ce qu'elle a reçu — et une actualité plus ancienne que les
--  trente dernières ne serait pas dans la liste. L'épinglage n'aurait alors
--  **rien fait**, en silence, précisément dans le cas où il sert : remettre en
--  tête une annonce que les familles ne voient plus. Le tri doit être fait par
--  le serveur, donc l'information doit être dans la table triée.
--
--  POURQUOI UN HORODATAGE, ET NON UN BOOLÉEN
--  -----------------------------------------
--  `true` / `false` répondrait à « épinglée ou non », et laisserait sans réponse
--  « laquelle d'abord » dès qu'il y en a deux. `epinglee_at` porte les deux : une
--  valeur non nulle veut dire épinglée, et cette valeur dit depuis quand — donc
--  l'ordre. Le bureau peut en épingler deux ; la plus récemment épinglée passe
--  devant, et c'est le geste le plus récent qui gagne.
--
--  `null` est l'état normal, et il n'a pas besoin d'être écrit : la colonne est
--  nulle par défaut, donc les lignes existantes restent exactement ce qu'elles
--  étaient. C'est ce que `check-migration-applicable` relit dans le catalogue,
--  colonne par colonne, défaut compris.
--
--  PAS D'INDEX, ET C'EST UN CHOIX
--  ------------------------------
--  Un index sur une colonne nulle partout, dans une table de quelques dizaines
--  de lignes, ne serait lu par personne. Le tri porte sur trente lignes ; le
--  coût d'un index dépasserait ici le coût du tri qu'il éviterait.
--
--  UNE SEULE COLONNE POUR LES DEUX SENS
--  ------------------------------------
--  Épingler écrit un horodatage, détacher écrit `null`. Les deux passent par la
--  même politique et la même colonne : il n'y a pas de second chemin à tenir, et
--  donc pas de second chemin à oublier. Le tableau de bord n'a pas besoin d'un
--  droit de suppression sur `annonces` pour retirer une épingle.

alter table public.annonces
  add column if not exists epinglee_at timestamptz;

comment on column public.annonces.epinglee_at is
  'Horodatage de l''épinglage. Nulle quand l''actualité n''est pas épinglée. Les actualités épinglées passent en tête, la plus récemment épinglée d''abord.';
