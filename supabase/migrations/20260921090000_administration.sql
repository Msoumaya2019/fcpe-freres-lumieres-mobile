-- =============================================================================
--  Administration — ce que le tableau de bord ajoute au schéma
-- =============================================================================
--  Application : coller ce fichier dans l'éditeur SQL du tableau de bord, après
--  `20260916120000_init.sql`, `20260919120000_rubriques.sql` puis
--  `20260920120000_acces_public.sql`. Le fichier est rejouable : le coller deux
--  fois ne produit ni erreur, ni doublon.
--
-- -----------------------------------------------------------------------------
--  POURQUOI CE FICHIER EXISTE
-- -----------------------------------------------------------------------------
--  Le tableau de bord d'administration se branche sur le schéma existant **sans
--  rien recréer**. Ce qui lui fallait était déjà là :
--
--    - les politiques d'écriture du bureau sur les contenus — `annonces`,
--      `cantine_menus`, `agenda_events`, `documents`, `sondages` et
--      `sondage_choices` ont chacune leurs `*_insert_admin`, `*_update_admin` et
--      `*_delete_admin`, toutes bornées par `is_admin()` ;
--    - la lecture du courrier des familles — `lister_conversations()`,
--      `lire_conversation_bureau()` et `repondre_conversation_bureau()` ;
--    - les résultats d'un sondage — `resultats_sondage()` ;
--    - la décision d'une adhésion — `decider_adhesion()`.
--
--  Trois capacités manquaient. Elles sont ici.
--
--  UNE QUATRIÈME NE PEUT PAS ÊTRE ÉCRITE ICI
--  -----------------------------------------
--  L'envoi d'un fichier dans le compartiment `documents` demande une politique
--  d'insertion sur `storage.objects`. Le schéma `storage` n'existe pas dans la
--  doublure des tests, et une instruction le concernant rendrait ce fichier
--  inapplicable par le banc qui l'exécute — c'est la même raison qui a laissé
--  les deux politiques de **lecture** dans le guide. Les trois politiques
--  d'écriture restent donc, elles aussi, dans le guide, section 1.4.
-- =============================================================================


-- =============================================================================
--  1. Le brouillon d'actualité
-- =============================================================================
--  POURQUOI UNE COLONNE, ET PAS `published_at is null`
--  ---------------------------------------------------
--  `published_at` est `not null default now()` : une annonce porte toujours sa
--  date de publication, et la rendre nullable aurait changé le sens d'une
--  colonne que trois écrans lisent déjà. Une colonne dédiée dit ce qu'elle
--  signifie, et son défaut — `false` — laisse **toutes** les annonces existantes
--  publiées, ce qui est exactement leur état.
--
--  CE QUE LA COLONNE CHANGE VRAIMENT
--  ---------------------------------
--  Rien, à elle seule. C'est la politique qui décide : sans les deux
--  remplacements ci-dessous, un brouillon serait lisible par **tout le monde**,
--  y compris par un parent sans compte — les politiques publiques existantes
--  s'écrivent `using (true)`.
alter table public.annonces
  add column if not exists is_draft boolean not null default false;

comment on column public.annonces.is_draft is
  'Vrai pour une annonce écrite mais non publiée : elle n''est visible que du bureau.';

--  Un index partiel, parce que le brouillon est rare et que la lecture publique
--  est fréquente : il ne contient que les lignes à exclure.
create index if not exists annonces_brouillons_idx
  on public.annonces (created_at desc)
  where is_draft;

--  Un brouillon ne sort jamais vers un parent sans compte.
drop policy if exists annonces_select_public on public.annonces;
create policy annonces_select_public
  on public.annonces for select
  to anon
  using (not is_draft);

--  Ni vers un adhérent : il n'y a pas de « brouillon partagé ». Le bureau, lui,
--  voit tout — sans quoi il ne pourrait pas relire ce qu'il écrit.
drop policy if exists annonces_select_authenticated on public.annonces;
create policy annonces_select_authenticated
  on public.annonces for select
  to authenticated
  using (not is_draft or public.is_admin());


-- =============================================================================
--  2. `changer_role()` — attribuer et retirer les droits d'administration
-- =============================================================================
--  POURQUOI UNE FONCTION, ET NON UNE POLITIQUE
--  -------------------------------------------
--  `profiles` n'a **aucune** politique de modification, et c'est délibéré :
--  une politique `for update` porterait sur toutes les colonnes, pour tout
--  administrateur, alors que la capacité voulue est « un rôle, par le bureau ».
--  La fonction est donc `security definer`, comme `decider_adhesion()`, et
--  vérifie `is_admin()` dans son corps.
--
--  LE DÉCLENCHEUR NE GÊNE PAS
--  --------------------------
--  `prevent_role_change` refuse un changement de rôle à qui n'est pas
--  administrateur — et `auth.uid()` continue de désigner **l'appelant** à
--  l'intérieur d'une fonction `security definer`. Un administrateur qui appelle
--  cette fonction passe donc le déclencheur, sans avoir à le désactiver. C'est
--  ce qui distingue cette fonction de la promotion du **premier** administrateur,
--  qui, elle, doit désactiver le déclencheur : au moment où elle s'exécute,
--  personne n'est encore administrateur.
--
--  DEUX GARDES, ET ELLES NE SONT PAS DÉCORATIVES
--  ---------------------------------------------
--    - **on ne change pas son propre rôle.** Sans cette garde, un
--      administrateur pouvait se retirer ses droits d'un clic, et le geste est
--      irréversible sans repasser par l'éditeur SQL ;
--    - **on ne retire pas le dernier administrateur.** C'est la même
--      irréversibilité, atteinte par une autre porte : un bureau de deux
--      administrateurs se retrouve sans aucun droit si les deux se retirent.
create or replace function public.changer_role(p_id uuid, p_role public.member_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé au bureau.' using errcode = '42501';
  end if;

  if p_id = (select auth.uid()) then
    raise exception 'Vous ne pouvez pas modifier votre propre rôle.'
      using errcode = '42501';
  end if;

  if p_role = 'membre'
     and exists (select 1 from public.profiles p where p.id = p_id and p.role = 'admin')
     and (select count(*) from public.profiles p where p.role = 'admin') <= 1
  then
    raise exception 'Il doit rester au moins un administrateur.' using errcode = '42501';
  end if;

  update public.profiles set role = p_role where id = p_id;
end;
$$;

revoke all on function public.changer_role(uuid, public.member_role) from public;
grant execute on function public.changer_role(uuid, public.member_role) to authenticated;


-- =============================================================================
--  3. `marquer_conversation()` — clore un échange avec un parent
-- =============================================================================
--  `repondre_conversation_bureau()` fait passer « nouveau » à « en cours », et
--  c'est tout : aucune fonction ne pose « clos ». Sans celle-ci, le bureau
--  répondrait sans jamais pouvoir ranger ce qui est traité, et la liste des
--  conversations ne se viderait pas.
--
--  Le statut est un **paramètre** : une conversation close se rouvre, et la
--  rouvrir ne demande pas une seconde fonction.
create or replace function public.marquer_conversation(
  p_id uuid,
  p_statut public.conversation_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé au bureau.' using errcode = '42501';
  end if;

  update public.conversations
     set status = p_statut,
         updated_at = now()
   where id = p_id;
end;
$$;

revoke all on function public.marquer_conversation(uuid, public.conversation_status) from public;
grant execute on function public.marquer_conversation(uuid, public.conversation_status) to authenticated;
