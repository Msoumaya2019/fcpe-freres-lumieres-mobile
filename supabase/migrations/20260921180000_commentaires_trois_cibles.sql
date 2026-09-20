-- =============================================================================
--  7. Un commentaire se rattache à une actualité, un sondage ou un jour de cantine
-- =============================================================================
--  POURQUOI CETTE MIGRATION
--  ------------------------
--  La sixième migration a ouvert les commentaires sous une **actualité**, et
--  sous elle seule : `commentaires.annonce_id` était `not null`, et la politique
--  d'insertion ne connaissait que cette cible.
--
--  Or une question de parent ne se pose pas seulement sous un article. Elle se
--  pose sur le **menu d'un jour** — « le jeudi, mon enfant est allergique » — et
--  sur un **sondage** — « pourquoi ce choix ? ». Le bureau n'avait aucun endroit
--  où les recevoir, et les familles aucun endroit où les écrire.
--
--  LE GRAIN, ET POURQUOI CELUI-LÀ
--  ------------------------------
--  Une **actualité**, un **sondage**, un **jour de cantine**. Pour la cantine,
--  le jour et non la semaine : `cantine_menus` porte une contrainte d'unicité
--  sur `service_date`, donc une ligne **est** un jour. Un fil par semaine aurait
--  mêlé le lundi et le vendredi — c'est-à-dire exactement ce qu'un parent veut
--  distinguer.
--
--  POURQUOI TROIS COLONNES, ET NON UN COUPLE « type + identifiant »
--  ----------------------------------------------------------------
--  Un couple `(cible, cible_id)` est plus court, et il perd la seule chose qui
--  compte ici : une colonne polymorphe **ne peut pas porter de clé étrangère**.
--  Supprimer un sondage laisserait alors ses commentaires **orphelins** en base
--  — invisibles à l'écran, présents dans les sauvegardes, rattachés à un
--  identifiant qui ne désigne plus rien. La cascade est le mécanisme
--  d'effacement du projet ; un couple polymorphe la désarme en silence, et rien
--  ne le signalerait.
--
--  Trois colonnes facultatives, chacune avec sa clé étrangère `on delete
--  cascade`, gardent la promesse : supprimer la cible efface son fil.
--
--  POURQUOI « EXACTEMENT UNE », ET NON « AU MOINS UNE »
--  ----------------------------------------------------
--  `num_nonnulls(annonce_id, sondage_id, menu_id) = 1`. Avec « au moins une »,
--  un commentaire rattaché à une actualité **et** à un sondage apparaîtrait deux
--  fois — dans deux fils, sous deux en-têtes, et le bureau le relirait deux fois
--  pour une seule décision. Une contrainte de forme vaut mieux qu'une intention.
--
--  CE QUE LA POLITIQUE DOIT REDIRE, ET POURQUOI CE N'EST PAS UN DOUBLON
--  -------------------------------------------------------------------
--  La contrainte ci-dessus vit dans la **table** ; la politique décide de ce
--  qu'un **client** peut écrire. Les deux sont nécessaires : la contrainte
--  empêche une ligne absurde d'exister, la politique empêche un client modifié
--  de commenter une actualité **en brouillon**, que personne ne voit. Un
--  commentaire déposé sous un brouillon publierait l'existence de ce brouillon.
--
--  L'ORDRE, ET CE QU'IL COÛTE
--  --------------------------
--  Ce fichier **complète** le sixième : il modifie `public.commentaires`, que le
--  sixième crée. Collé seul, il est refusé sur
--  `relation "public.commentaires" does not exist`. Il se colle donc **après**
--  `20260921150000_super_admin.sql`.
--
--  CE QU'IL NE FAIT PAS
--  --------------------
--  Il ne touche pas aux politiques de **lecture** ni de **modération**. Un
--  commentaire publié reste publié, quelle que soit sa cible : la politique
--  `commentaires_select_publies_anon` filtre sur `statut`, jamais sur la cible,
--  et une politique qui aurait à connaître les trois colonnes pour rendre un
--  commentaire publié serait une occasion de plus de se tromper.
--
--  Il ne remplit pas `annonce_id` des lignes existantes, et n'a pas à le faire :
--  les commentaires déjà déposés le sont sous une actualité, la colonne n'est
--  que rendue facultative, et aucune valeur ne change.

--  Les deux nouvelles cibles. `if not exists` : la migration se rejoue.
alter table public.commentaires
  add column if not exists sondage_id uuid references public.sondages (id) on delete cascade;

alter table public.commentaires
  add column if not exists menu_id uuid references public.cantine_menus (id) on delete cascade;

--  La colonne historique devient facultative : c'est la seule façon d'ouvrir les
--  deux autres, et la contrainte ci-dessous garantit qu'elle n'est jamais
--  perdue — un commentaire a toujours une cible, et une seule.
alter table public.commentaires
  alter column annonce_id drop not null;

--  Le retrait précède la pose : `add constraint` n'a pas de forme « if not
--  exists », et rejouer la migration doit pouvoir repasser ici.
alter table public.commentaires
  drop constraint if exists commentaires_une_seule_cible;

alter table public.commentaires
  add constraint commentaires_une_seule_cible check (
    num_nonnulls(annonce_id, sondage_id, menu_id) = 1
  );

comment on column public.commentaires.annonce_id is
  'L''actualité commentée, ou NULL si le commentaire porte sur un sondage ou un jour de cantine.';

comment on column public.commentaires.sondage_id is
  'Le sondage commenté, ou NULL. Supprimer le sondage efface son fil.';

comment on column public.commentaires.menu_id is
  'Le jour de cantine commenté — une ligne de `cantine_menus` est un jour. Ou NULL.';

comment on table public.commentaires is
  'Commentaires des familles sous une actualité, un sondage ou un jour de cantine. Publiés seulement après validation par le super administrateur.';

--  Un index par cible, sur le même modèle que celui des actualités : la lecture
--  d'un fil est toujours « les commentaires publiés de cette cible-là », et un
--  index partiel ne porte que les lignes que cette lecture peut rendre.
create index if not exists commentaires_publies_sondage_idx
  on public.commentaires (sondage_id, created_at)
  where statut = 'publie';

create index if not exists commentaires_publies_menu_idx
  on public.commentaires (menu_id, created_at)
  where statut = 'publie';

--  Les privilèges ne changent pas : la table garde exactement les mêmes, et les
--  réécrire ici laisserait croire qu'ils ont bougé. Seule la politique
--  d'insertion est reprise, parce qu'elle doit connaître les trois cibles.
drop policy if exists commentaires_insert_public on public.commentaires;
create policy commentaires_insert_public
  on public.commentaires for insert
  to anon, authenticated
  with check (
    statut = 'en_attente'
    and moderated_at is null
    and moderated_by is null
    and (
      --  Une cible nulle rend sa branche fausse : `a.id = null` ne satisfait
      --  aucune ligne, donc `exists` rend `false` sans qu'on ait à l'écrire.
      --  La contrainte `commentaires_une_seule_cible` garantit par ailleurs
      --  qu'une seule des trois branches peut être vraie.
      exists (
        select 1
        from public.annonces a
        where a.id = annonce_id
          and not a.is_draft
      )
      or exists (
        select 1
        from public.sondages s
        where s.id = sondage_id
      )
      or exists (
        select 1
        from public.cantine_menus m
        where m.id = menu_id
      )
    )
  );
