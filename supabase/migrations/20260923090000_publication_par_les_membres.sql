--  ===========================================================================
--  Dixième migration — un membre accepté peut publier
--  ===========================================================================
--
--  CE QU'ELLE CHANGE, ET CE QU'ELLE NE CHANGE PAS
--  ----------------------------------------------
--  Le bureau a demandé que les membres du FCPE puissent **ajouter** une
--  actualité, un sondage, un menu de cantine et un événement d'agenda. Ce sont
--  donc cinq politiques d'**insertion** qui s'ouvrent, et rien d'autre : la
--  modification et la suppression restent au bureau. Un membre publie ; il ne
--  corrige ni ne retire, pas même ce qu'il a écrit lui-même.
--
--  POURQUOI CINQ, ALORS QUE LA DEMANDE EN NOMME QUATRE
--  ---------------------------------------------------
--  Parce qu'un sondage n'est pas une ligne : `sondages` porte la question,
--  `sondage_choices` porte les réponses, et un sondage sans réponse ne se vote
--  pas. Ouvrir la première sans la seconde aurait donné un formulaire qui échoue
--  à la moitié de son travail, avec un refus portant sur une table que le
--  demandeur n'a jamais nommée.
--
--  LA CINQUIÈME EST BORNÉE, ET C'EST LA SEULE QUI POUVAIT NE PAS L'ÊTRE
--  --------------------------------------------------------------------
--  `sondage_choices` n'a pas d'auteur : elle n'a qu'un `sondage_id`. Ouvrir son
--  insertion à tout membre aurait laissé n'importe qui ajouter une réponse à un
--  sondage **en cours**, c'est-à-dire déplacer un vote. La politique exige donc
--  que le sondage visé soit celui de l'appelant — `sondages.author_id`, que le
--  tableau de bord écrit quelques millisecondes avant les réponses.
--
--  C'est une **sous-requête**, et elle est légitime ici : `sondages` est lisible
--  par tout porteur de jeton (`sondages_select_authenticated`), donc la lecture
--  intérieure ne butte sur aucune politique et ne rend jamais « zéro ligne » par
--  accident.
--
--  QUI EST « UN MEMBRE DU FCPE »
--  -----------------------------
--  `is_member()` : une adhésion **acceptée**. Un compte simplement inscrit n'est
--  pas un membre — c'est le bureau qui décide des adhésions, par
--  `decider_adhesion()`. La demande disait « un membre du fcpe » : des deux
--  lectures possibles, c'est la plus étroite, et c'est celle qui a été retenue.
--
--  POURQUOI UNE FONCTION NOMMÉE, ET NON `is_admin() or is_member()` RECOPIÉ
--  -----------------------------------------------------------------------
--  Cinq politiques portent la même règle. Recopiée, elle finirait par ne plus
--  dire la même chose à cinq endroits — et l'endroit qui prendrait du retard
--  serait le plus permissif, donc celui dont le retard se voit le moins. C'est
--  la raison qui a déjà fait écrire `is_admin()` dans ce schéma plutôt que de le
--  recopier dans chaque politique.
--
--  Le nom, lui, dit **à quoi sert** le droit. `peut_publier()` répond à la
--  question qu'on se pose en relisant une politique ; `is_admin() or
--  is_member()` répond à une autre — « qui es-tu ? » — et laisse au lecteur le
--  soin de retrouver pourquoi ce couple est là.
--
--  POURQUOI LES CINQ POLITIQUES SONT RENOMMÉES
--  -------------------------------------------
--  Elles s'appelaient `…_insert_admin`, et ce nom devient faux : elles
--  n'autorisent plus les seuls administrateurs. Un nom de politique est lu par
--  celui qui audite le schéma, et c'est exactement le genre de mensonge qui ne
--  se corrige jamais tout seul. Les cinq anciens noms sont donc retirés, et
--  `check-migration-rejouable` les nomme dans sa liste de retraits — un retrait
--  est une décision, pas un oubli.
--
--  `language sql`, DONC L'ORDRE COMPTE
--  -----------------------------------
--  Un corps `language sql` est analysé **à sa création**, pas à son premier
--  appel : `public.is_admin()` et `public.is_member()` doivent donc déjà exister.
--  C'est le cas — la première migration et la quatrième —, et c'est la même
--  contrainte qui a fixé l'ordre des sections de la première migration.
--
--  CE QUE CETTE MIGRATION N'OUVRE PAS
--  ----------------------------------
--  Rien d'autre. Les lectures étaient déjà ouvertes à `authenticated` ; les
--  politiques de modification et de suppression ne bougent pas ; et les
--  rubriques réservées au super administrateur — commentaires, signalements,
--  discussion, messagerie, membres — ne sont pas touchées. Un membre qui publie
--  une actualité ne peut pas la retirer, et c'est le bureau qui le fait.

create or replace function public.peut_publier()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or public.is_member();
$$;

comment on function public.peut_publier() is
  'Vrai si l''appelant peut publier : un administrateur, ou un membre dont l''adhésion est acceptée.';

revoke all on function public.peut_publier() from public;
grant execute on function public.peut_publier() to authenticated;


--  ---------------------------------------------------------------------------
--  annonces — l'insertion passe du bureau à « qui peut publier »
--  ---------------------------------------------------------------------------
drop policy if exists annonces_insert_admin on public.annonces;
drop policy if exists annonces_insert_publication on public.annonces;
create policy annonces_insert_publication
  on public.annonces for insert
  to authenticated
  with check (public.peut_publier());


--  ---------------------------------------------------------------------------
--  cantine_menus — idem
--  ---------------------------------------------------------------------------
drop policy if exists cantine_menus_insert_admin on public.cantine_menus;
drop policy if exists cantine_menus_insert_publication on public.cantine_menus;
create policy cantine_menus_insert_publication
  on public.cantine_menus for insert
  to authenticated
  with check (public.peut_publier());


--  ---------------------------------------------------------------------------
--  agenda_events — idem
--  ---------------------------------------------------------------------------
drop policy if exists agenda_events_insert_admin on public.agenda_events;
drop policy if exists agenda_events_insert_publication on public.agenda_events;
create policy agenda_events_insert_publication
  on public.agenda_events for insert
  to authenticated
  with check (public.peut_publier());


--  ---------------------------------------------------------------------------
--  sondages — la question
--  ---------------------------------------------------------------------------
drop policy if exists sondages_insert_admin on public.sondages;
drop policy if exists sondages_insert_publication on public.sondages;
create policy sondages_insert_publication
  on public.sondages for insert
  to authenticated
  with check (public.peut_publier());


--  ---------------------------------------------------------------------------
--  sondage_choices — les réponses, et seulement celles de son propre sondage
--  ---------------------------------------------------------------------------
drop policy if exists sondage_choices_insert_admin on public.sondage_choices;
drop policy if exists sondage_choices_insert_publication on public.sondage_choices;
create policy sondage_choices_insert_publication
  on public.sondage_choices for insert
  to authenticated
  with check (
    public.is_admin()
    or (
      public.is_member()
      and exists (
        select 1
        from public.sondages
        where sondages.id = sondage_choices.sondage_id
          and sondages.author_id = (select auth.uid())
      )
    )
  );
