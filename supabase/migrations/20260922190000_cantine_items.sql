-- =============================================================================
--  Les aliments d'un jour de cantine
-- =============================================================================
--
--  POURQUOI UNE SECONDE TABLE
--  --------------------------
--  `cantine_menus` portait **un jour sur une ligne**, avec quatre colonnes
--  fixes : une entrée, un plat, un dessert, des informations. Ce modèle ne sait
--  pas dire ce que l'école publie réellement — une journée porte deux plats, un
--  accompagnement, deux laitages, quatre éléments « au menu » —, et il ne sait
--  pas distinguer un plat de viande d'un plat de poisson, ce qu'un parent
--  cherche d'un coup d'œil.
--
--  Les aliments deviennent donc des **lignes**, rattachées au jour, chacune
--  portant sa catégorie et, facultativement, son type. `cantine_menus` reste la
--  journée : c'est elle qui porte la date, la note et le fil de commentaires,
--  et c'est elle qui est référencée par `cantine_reservations` et par
--  `commentaires`. Rien de tout cela ne bouge.
--
--  POURQUOI LES ANCIENNES COLONNES RESTENT
--  ---------------------------------------
--  Elles ne sont pas supprimées, et la section 5 recopie leur contenu en
--  aliments. Supprimer une colonne est un geste irréversible ; rien ici ne
--  l'exige, et une relecture par l'éditeur de tables de Supabase doit continuer
--  de montrer ce qui avait été saisi.
--
--  L'ORDRE DES SECTIONS EST SIGNIFIANT
--  -----------------------------------
--  Les deux énumérations sont déclarées **avant** la table qui les emploie, et
--  la table avant les politiques qui la visent. L'ordre n'est pas cosmétique :
--  une politique qui cite une table absente ne se crée pas, et l'échec de
--  `20260916120000_init.sql` — un corps `language sql` analysé avant sa table —
--  a coûté une mise en service à ce projet.
--
--  REJOUABLE
--  ---------
--  Chaque instruction porte sa garde : `if not exists`, `drop … if exists`
--  avant chaque `create policy` et chaque `create trigger`, et un bloc
--  `exception when duplicate_object` pour les deux types. Le fichier peut donc
--  être collé deux fois de suite dans l'éditeur SQL sans échouer.


-- =============================================================================
--  1. Les deux énumérations
-- =============================================================================
--  L'ORDRE DES VALEURS EST CELUI DE L'AFFICHAGE
--  --------------------------------------------
--  Une énumération PostgreSQL porte un rang, et c'est ce rang qui ordonne la
--  carte d'un jour dans l'application. Les six catégories sont donc écrites
--  dans l'ordre où un parent les lit sur le menu de l'école — le plat d'abord,
--  les « autres » en dernier —, et `check-migration-applicable` relit cet ordre
--  dans le catalogue pour qu'un ajout en fin de liste ne le décale pas en
--  silence.

do $$
begin
  create type public.cantine_item_category as enum (
    'plat',
    'accompagnement',
    'laitage',
    'dessert',
    'menu',
    'autres'
  );
exception
  when duplicate_object then null;
end
$$;

--  Le type de plat est **facultatif** : un accompagnement, un laitage ou un
--  dessert n'en porte pas. Il sert à la pastille colorée, et à rien d'autre.
--  `vegetarien` est une valeur à part entière plutôt qu'une absence : « ce plat
--  ne contient pas de viande » est une information, et un parent qui la cherche
--  ne peut pas la déduire d'un champ vide — vide veut dire « on ne sait pas ».
do $$
begin
  create type public.cantine_dish_type as enum ('viande', 'poisson', 'vegetarien');
exception
  when duplicate_object then null;
end
$$;

comment on type public.cantine_item_category is
  'Catégorie d''un aliment de cantine, dans l''ordre où l''application les affiche.';
comment on type public.cantine_dish_type is
  'Type de plat, facultatif : viande, poisson ou végétarien. Alimente la pastille colorée.';


-- =============================================================================
--  2. La table
-- =============================================================================
--  `label` est le nom de l'aliment tel que l'école l'écrit. Il est `not null` :
--  une ligne sans nom ne serait pas affichable, et l'application réserverait
--  pour elle une puce vide que personne ne comprendrait.
--
--  LA CONTRAINTE D'UNICITÉ N'EST PAS DÉCORATIVE
--  --------------------------------------------
--  C'est la même raison que pour `cantine_reservations` : deux appuis rapprochés
--  sur « Ajouter » créent deux lignes identiques, et le parent lit deux fois le
--  même plat. La contrainte transforme ce doublon en refus, et le refus en
--  message — ce qui vaut mieux qu'un menu qui se répète sans que personne ne
--  sache pourquoi. Deux aliments de même nom dans **deux catégories
--  différentes** restent permis : « Pain » au menu et « Pain » en
--  accompagnement sont deux informations distinctes.
create table if not exists public.cantine_items (
  id          uuid primary key default gen_random_uuid(),
  menu_id     uuid not null references public.cantine_menus (id) on delete cascade,
  category    public.cantine_item_category not null,
  label       text not null,
  dish_type   public.cantine_dish_type,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint cantine_items_unique unique (menu_id, category, label)
);

comment on table public.cantine_items is
  'Un aliment d''un jour de cantine : son nom, sa catégorie, et son type de plat facultatif.';
comment on column public.cantine_items.menu_id is
  'Le jour de cantine auquel cet aliment appartient. La suppression du jour emporte ses aliments.';
comment on column public.cantine_items.dish_type is
  'Viande, poisson ou végétarien. Nul quand l''aliment n''est pas un plat.';


-- =============================================================================
--  3. Index et déclencheur
-- =============================================================================
--  La lecture qui compte est **toujours** « les aliments de ces journées-là » :
--  l'application demande les menus à venir et leurs aliments en une seule
--  requête, et l'index part donc du jour.
create index if not exists cantine_items_menu_idx
  on public.cantine_items (menu_id);

drop trigger if exists cantine_items_set_updated_at on public.cantine_items;
create trigger cantine_items_set_updated_at
  before update on public.cantine_items
  for each row execute function public.set_updated_at();


-- =============================================================================
--  4. Sécurité
-- =============================================================================
--  L'APPLICATION SE LIT SANS COMPTE, ET C'EST DÉLIBÉRÉ
--  ---------------------------------------------------
--  Un parent qui n'a pas encore créé de compte ouvre l'application pour voir le
--  menu de la cantine : c'est la première chose qu'il vient chercher, et la lui
--  refuser serait le premier obstacle. Les aliments sont donc lisibles par le
--  rôle anonyme, **comme le sont déjà les journées** — sans quoi la journée
--  s'afficherait vide, ce qui se lit comme une panne.
--
--  LE RÔLE QUI ARRIVE DÉCIDE
--  -------------------------
--  Deux politiques de lecture, et non une : `to anon` ne couvre pas le membre
--  connecté, qui arrive avec le rôle `authenticated`. Une seule politique
--  laisserait les adhérents devant une carte sans aliments — et la mesure est
--  muette, puisqu'un refus de lecture rend une **liste vide**, jamais une erreur.
--
--  Les deux moitiés sont nécessaires : la politique dit **quelles lignes**, le
--  privilège dit **si l'opération est permise**. Le second manquerait sans que
--  rien ne le signale.
alter table public.cantine_items enable row level security;

drop policy if exists cantine_items_select_public on public.cantine_items;
create policy cantine_items_select_public
  on public.cantine_items for select
  to anon
  using (true);

drop policy if exists cantine_items_select_authenticated on public.cantine_items;
create policy cantine_items_select_authenticated
  on public.cantine_items for select
  to authenticated
  using (true);

drop policy if exists cantine_items_insert_admin on public.cantine_items;
create policy cantine_items_insert_admin
  on public.cantine_items for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists cantine_items_update_admin on public.cantine_items;
create policy cantine_items_update_admin
  on public.cantine_items for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists cantine_items_delete_admin on public.cantine_items;
create policy cantine_items_delete_admin
  on public.cantine_items for delete
  to authenticated
  using (public.is_admin());

--  Le rôle anonyme ne reçoit que la lecture. Le retrait est écrit **avant**
--  l'accord, et non l'inverse : Supabase accorde par défaut les privilèges sur
--  une table nouvellement créée, et compter sur ce défaut serait compter sur un
--  réglage qu'on ne relit pas.
revoke all on public.cantine_items from anon;
grant select on public.cantine_items to anon;


-- =============================================================================
--  5. Reprise des journées déjà saisies
-- =============================================================================
--  Les menus saisis avant cette migration ne doivent pas disparaître de
--  l'application. Ils sont donc recopiés en aliments, une fois.
--
--  LA DÉCISION « QUOI CONVERTIR » EST PRISE UNE SEULE FOIS
--  ------------------------------------------------------
--  Le premier jet écrivait trois insertions successives, chacune gardée par
--  « ce jour n'a pas encore d'aliment ». La seconde ne convertissait alors
--  **rien** : la première venait de créer les aliments du jour, et la garde
--  lisait l'état d'après. Un menu aurait perdu son plat ou son dessert selon
--  l'ordre des instructions, sans qu'aucune erreur ne soit levée. La liste des
--  journées à convertir est donc calculée **avant** d'écrire, et les trois
--  branches de l'insertion la partagent.
--
--  OÙ VA L'ENTRÉE, ET POURQUOI LÀ
--  -----------------------------
--  Les six catégories n'ont pas d'« entrée » : le menu de l'école n'en publie
--  pas. L'ancienne colonne `starter` rejoint donc « autres », qui est le seul
--  endroit honnête — l'inventer en « plat » serait faux, et la perdre serait
--  pire. Les **informations** restent dans `cantine_menus.notes` : ce n'est pas
--  un aliment, et elles continuent de s'afficher comme aujourd'hui.
--
--  Un libellé vide ou fait d'espaces ne crée pas d'aliment : `btrim` écarte les
--  deux cas, et la ligne vide ne produit pas de puce muette.
--
--  LA CATÉGORIE EST ÉCRITE EN CLAIR, ET SON TYPE AVEC
--  --------------------------------------------------
--  `union all` réunit les trois branches **avant** de les écrire : le type de la
--  colonne est alors celui de la réunion, et un littéral non typé y reste du
--  `text`. PostgreSQL refuse ensuite l'insertion — « column "category" is of
--  type cantine_item_category but expression is of type text ». Les trois
--  littéraux portent donc leur type, écrit une fois pour toutes. C'est ce que le
--  banc a vu, et rien d'autre ne l'aurait vu : le fichier s'analyse sans faute,
--  et l'erreur n'apparaît qu'en exécutant la reprise sur une base qui a des
--  menus.
with a_convertir as (
  select menu.id as menu_id
  from public.cantine_menus as menu
  where not exists (
    select 1
    from public.cantine_items as item
    where item.menu_id = menu.id
  )
)
insert into public.cantine_items (menu_id, category, label)
select a_convertir.menu_id, 'autres'::public.cantine_item_category, menu.starter
from a_convertir
  join public.cantine_menus as menu on menu.id = a_convertir.menu_id
where menu.starter is not null and btrim(menu.starter) <> ''
union all
select a_convertir.menu_id, 'plat'::public.cantine_item_category, menu.main_course
from a_convertir
  join public.cantine_menus as menu on menu.id = a_convertir.menu_id
where menu.main_course is not null and btrim(menu.main_course) <> ''
union all
select a_convertir.menu_id, 'dessert'::public.cantine_item_category, menu.dessert
from a_convertir
  join public.cantine_menus as menu on menu.id = a_convertir.menu_id
where menu.dessert is not null and btrim(menu.dessert) <> '';
