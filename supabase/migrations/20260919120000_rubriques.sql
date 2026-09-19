-- =============================================================================
--  Rubriques complémentaires — agenda, documents, sondages, contact
-- =============================================================================
--
--  Application : coller ce fichier dans l'éditeur SQL du tableau de bord, après
--  `20260916120000_init.sql`. Le fichier est rejouable : le coller deux fois ne
--  produit ni erreur, ni doublon.
--
-- -----------------------------------------------------------------------------
--  RÈGLE DIRECTRICE
-- -----------------------------------------------------------------------------
--  Ce fichier ajoute quatre rubriques à l'application : l'agenda, les documents,
--  les sondages et le contact. Il suit **exactement** les règles du premier :
--
--    - la sécurité repose sur les politiques RLS, jamais sur le code ;
--    - chaque table est fermée par défaut — sans politique, une opération est
--      refusée ;
--    - le contenu se lit par tout porteur d'un jeton de session, et s'écrit par
--      le bureau seul ;
--    - ce qui appartient à un adhérent ne se lit que par lui, ou par le bureau.
--
--  TROIS NIVEAUX D'ACCÈS, ET RIEN D'AUTRE
--  --------------------------------------
--    anon          aucun privilège. Ce fichier répète les `revoke` de la
--                  première migration pour les nouvelles tables, plutôt que de
--                  compter sur un réglage de la plateforme.
--    authenticated l'adhérent connecté. Lit le contenu, écrit ce qui lui
--                  appartient — un vote, un message.
--    admin         le bureau, désigné par `public.is_admin()`. Publie, modère,
--                  marque un message comme traité.
--
-- -----------------------------------------------------------------------------
--  CE QUI N'EST PAS ICI, ET POURQUOI
-- -----------------------------------------------------------------------------
--  Le bucket de stockage des documents n'est pas créé par ce fichier. Un bucket
--  appartient au schéma `storage`, que la doublure PostgreSQL des tests ne
--  reproduit pas — un `insert into storage.buckets` ferait donc tomber le banc
--  qui **exécute** cette migration, et ce banc est la seule chose qui prouve
--  qu'elle s'applique. Le bucket se crée depuis le tableau de bord, et l'étape
--  est décrite dans `MISE-EN-SERVICE.md`, comme les réglages SMTP.
--
--  Ce choix a un coût, et il est nommé : rien, dans le dépôt, ne vérifie que le
--  bucket existe, ni qu'il est **privé**, ni que sa politique laisse lire un
--  utilisateur connecté. C'est la même famille de réglages que `README.md` §4 —
--  un réglage de tableau de bord qu'aucun test ne tient.
-- =============================================================================


-- =============================================================================
--  1. Types énumérés
-- =============================================================================
--  Déclarés en base plutôt que contraints par des chaînes libres : une valeur
--  erronée est refusée à l'écriture, et non découverte à l'affichage — sur le
--  téléphone d'un adhérent, après coup.

do $$
begin
  create type public.document_category as enum ('administratif', 'scolarite', 'cantine', 'activites', 'autre');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.message_category as enum ('cantine', 'transport', 'vie_scolaire', 'activites', 'autre');
exception
  when duplicate_object then null;
end
$$;

--  La catégorie d'une actualité, qui porte le badge affiché sur sa carte.
--
--  POURQUOI UNE COLONNE, ET NON UNE DÉDUCTION DU TITRE
--  --------------------------------------------------
--  La maquette affiche « Important », « Cantine », « Événement » sur les cartes
--  d'actualité. Ces mots ne se devinent pas du texte : « Réunion du bureau » est
--  un événement, « Fermeture de la cantine » est important, et les deux se
--  ressemblent. Chercher un mot dans le titre produirait un badge faux au
--  premier titre inattendu, et personne ne saurait pourquoi.
--
--  La valeur par défaut est `information`, ce qui donne un badge correct aux
--  annonces déjà publiées sans avoir à les reprendre une par une.
do $$
begin
  create type public.annonce_category as enum ('information', 'important', 'cantine', 'evenement', 'reunion');
exception
  when duplicate_object then null;
end
$$;

--  `add column if not exists` plutôt qu'une réécriture de la première
--  migration : celle-ci est **déjà appliquée** sur la base de production, et la
--  modifier obligerait à la recoller entièrement. Ce fichier-ci s'ajoute.
alter table public.annonces
  add column if not exists category public.annonce_category not null default 'information';


-- =============================================================================
--  2. Tables
-- =============================================================================

--  ---------------------------------------------------------------------------
--  agenda_events — les dates importantes de l'école et de l'association
--  ---------------------------------------------------------------------------
--  `start_at` et `end_at` sont des horodatages, contrairement à la date de
--  service d'un menu : une réunion commence à 18 h 30, et cette heure doit être
--  affichée telle quelle. `end_at` est facultatif — beaucoup d'événements n'ont
--  pas d'heure de fin connue, et l'obliger ferait saisir une valeur inventée.
--
--  `all_day` existe parce qu'une journée portes ouvertes n'a pas d'heure, et
--  qu'afficher « 00:00 » pour la dire serait faux. C'est un drapeau, pas une
--  convention sur les heures : une convention se perd au premier calcul.
create table if not exists public.agenda_events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  start_at    timestamptz not null,
  end_at      timestamptz,
  location    text,
  all_day     boolean not null default false,
  author_id   uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint agenda_events_title_length check (char_length(btrim(title)) between 1 and 160),
  --  Une fin antérieure au début produirait un événement de durée négative, que
  --  l'écran afficherait comme terminé avant d'avoir commencé.
  constraint agenda_events_order check (end_at is null or end_at >= start_at)
);

comment on table public.agenda_events is
  'Événements de l''agenda. Lecture par tous les adhérents, écriture par le bureau.';


--  ---------------------------------------------------------------------------
--  documents — les documents utiles aux familles
--  ---------------------------------------------------------------------------
--  Le fichier lui-même vit dans le bucket Storage « documents » ; cette table
--  ne porte que ses métadonnées et son chemin. `size_bytes` est renseignée à la
--  publication, ce qui permet d'avertir un adhérent avant qu'il ne télécharge
--  12 Mo sur son forfait mobile.
--
--  Aucune politique de lecture anonyme, et c'est délibéré : ces documents sont
--  réservés aux familles, et l'application demande une connexion. Un bucket
--  public laisserait le fichier accessible à qui possède son adresse, ce qui
--  rendrait la politique de cette table décorative.
create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  category     public.document_category not null default 'autre',
  storage_path text not null,
  size_bytes   bigint,
  published_at timestamptz not null default now(),
  author_id    uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint documents_title_length check (char_length(btrim(title)) between 1 and 160),
  constraint documents_path_length check (char_length(btrim(storage_path)) between 1 and 400),
  constraint documents_size_positive check (size_bytes is null or size_bytes >= 0)
);

comment on table public.documents is
  'Métadonnées des documents déposés dans le bucket Storage « documents ». Lecture par tous les adhérents.';


--  ---------------------------------------------------------------------------
--  sondages — questions posées aux adhérents
--  ---------------------------------------------------------------------------
--  `closed_at` est facultatif : un sondage sans date de clôture reste ouvert
--  jusqu'à ce que le bureau le ferme. `is_open` permet de fermer un sondage
--  immédiatement sans effacer la date prévue, et donc sans réécrire
--  l'historique.
create table if not exists public.sondages (
  id         uuid primary key default gen_random_uuid(),
  question   text not null,
  details    text,
  is_open    boolean not null default true,
  closed_at  timestamptz,
  author_id  uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sondages_question_length check (char_length(btrim(question)) between 1 and 300)
);

comment on table public.sondages is
  'Sondages. Un sondage accepte plusieurs choix, et un seul vote par adhérent et par sondage.';


--  ---------------------------------------------------------------------------
--  sondage_choices — les réponses proposées
--  ---------------------------------------------------------------------------
--  `position` fixe l'ordre d'affichage. Sans elle, PostgreSQL ne garantit aucun
--  ordre de lecture : les réponses pourraient changer de place entre deux
--  ouvertures de l'écran, ce qui donne l'impression que l'application bugue.
create table if not exists public.sondage_choices (
  id         uuid primary key default gen_random_uuid(),
  sondage_id uuid not null references public.sondages (id) on delete cascade,
  label      text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now(),

  constraint sondage_choices_label_length check (char_length(btrim(label)) between 1 and 200)
);

comment on table public.sondage_choices is
  'Réponses possibles d''un sondage. Supprimer un sondage supprime ses choix.';


--  ---------------------------------------------------------------------------
--  sondage_votes — les votes
--  ---------------------------------------------------------------------------
--  POURQUOI `voter_id` EST UNE CLÉ ÉTRANGÈRE VERS `auth.users`
--  -----------------------------------------------------------
--  L'application demande une connexion : un votant est un adhérent identifié,
--  et non un appareil. Le vote se rattache donc au compte, et la contrainte
--  d'unicité `(sondage_id, voter_id)` suffit à garantir **un vote par personne
--  et par sondage**.
--
--  C'est plus fort qu'un identifiant d'appareil, et c'est aussi plus simple à
--  déclarer : rien n'est pseudonyme ici, l'identifiant est celui du compte, et
--  la suppression du compte efface les votes en cascade — c'est le mécanisme
--  d'effacement RGPD, exactement comme ailleurs dans ce schéma.
--
--  CE QUI N'EST PAS DANS CETTE TABLE
--  ---------------------------------
--  Aucun horodatage de lecture, aucune adresse, rien qui relie un vote à autre
--  chose que le sondage et le compte. Le bureau voit des compteurs, et la
--  politique de lecture ci-dessous ne laisse un adhérent voir que son propre
--  vote.
create table if not exists public.sondage_votes (
  id         uuid primary key default gen_random_uuid(),
  sondage_id uuid not null references public.sondages (id) on delete cascade,
  choice_id  uuid not null references public.sondage_choices (id) on delete cascade,
  voter_id   uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint sondage_votes_unique unique (sondage_id, voter_id)
);

comment on table public.sondage_votes is
  'Votes. Un vote par adhérent et par sondage. Chacun ne lit que le sien ; le bureau les compte.';


--  ---------------------------------------------------------------------------
--  messages — ce que les adhérents écrivent au bureau
--  ---------------------------------------------------------------------------
--  `reply_to` est facultatif et n'est jamais obligatoire : exiger une adresse
--  pour signaler un problème de cantine ferait renoncer une partie des
--  adhérents, ce qui va contre l'objet même de cet écran.
--
--  L'adresse est saisie ici plutôt que lue dans `auth.users`, et c'est une
--  décision : elle permet à un adhérent de demander une réponse ailleurs, et
--  elle évite qu'un écran du bureau n'ait à lire la table des comptes pour
--  répondre. Elle reste donc soumise à la règle 7 — un nom et un rôle se
--  lisent, une adresse ne se lit pas.
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  subject    text not null,
  body       text not null,
  category   public.message_category not null default 'autre',
  reply_to   text,
  author_id  uuid not null references auth.users (id) on delete cascade,
  handled    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint messages_subject_length check (char_length(btrim(subject)) between 1 and 160),
  constraint messages_body_length check (char_length(btrim(body)) between 1 and 4000),
  --  Un format d'adresse plausible, pas une validation complète : la seule
  --  validation qui compte est l'envoi d'un message à cette adresse, et le
  --  bureau la fera depuis sa propre boîte. Une expression trop stricte
  --  refuserait des adresses valides, ce qui est pire que d'en accepter une
  --  fausse — l'adresse fausse se voit tout de suite, le refus non.
  constraint messages_reply_format check (
    reply_to is null
    or reply_to ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  constraint messages_reply_length check (reply_to is null or char_length(reply_to) <= 254)
);

comment on table public.messages is
  'Messages adressés au bureau. Un adhérent ne lit que les siens ; le bureau lit tout.';


-- =============================================================================
--  3. Index
-- =============================================================================
--  Chaque index correspond à une requête réellement écrite dans `src/services/`.
--  Un index sans requête coûte à l'écriture et ne sert à rien.

--  L'agenda : prochains événements, dans l'ordre chronologique.
create index if not exists agenda_events_start_idx
  on public.agenda_events (start_at);

--  La liste des documents, du plus récent au plus ancien.
create index if not exists documents_published_idx
  on public.documents (published_at desc);

--  Les choix d'un sondage, dans l'ordre voulu.
create index if not exists sondage_choices_sondage_position_idx
  on public.sondage_choices (sondage_id, position);

--  Les messages d'un adhérent, du plus récent au plus ancien. Sert aussi bien à
--  l'écran « Mes messages » qu'à la politique de lecture, qui filtre sur
--  `author_id`.
create index if not exists messages_author_created_idx
  on public.messages (author_id, created_at desc);


-- =============================================================================
--  4. Déclencheurs de cohérence
-- =============================================================================
--  `public.set_updated_at()` est défini par la première migration : il n'est pas
--  redéclaré ici, sans quoi deux définitions de la même fonction coexisteraient
--  et la seconde écraserait la première sans que rien ne le signale.

drop trigger if exists agenda_events_set_updated_at on public.agenda_events;
create trigger agenda_events_set_updated_at
  before update on public.agenda_events
  for each row execute function public.set_updated_at();

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

drop trigger if exists sondages_set_updated_at on public.sondages;
create trigger sondages_set_updated_at
  before update on public.sondages
  for each row execute function public.set_updated_at();

drop trigger if exists messages_set_updated_at on public.messages;
create trigger messages_set_updated_at
  before update on public.messages
  for each row execute function public.set_updated_at();


--  ---------------------------------------------------------------------------
--  Un vote doit viser un choix du sondage auquel il se rattache
--  ---------------------------------------------------------------------------
--  `choice_id` et `sondage_id` sont deux clés étrangères distinctes, et rien ne
--  les relie : sans ce déclencheur, un vote peut désigner le sondage A et le
--  choix n° 4 du sondage B. Le décompte devient alors faux d'une manière
--  difficile à repérer, puisqu'aucune erreur n'est levée — seule une ligne
--  incohérente apparaît dans les résultats.
--
--  Une clé étrangère composite `(choice_id, sondage_id)` aurait été plus
--  élégante, mais elle oblige à déclarer une contrainte d'unicité sur
--  `sondage_choices (id, sondage_id)` uniquement pour la rendre référençable.
--  Le déclencheur dit la même chose sans modifier la table des choix.
--
--  La fonction est en PL/pgSQL, et non en `language sql` : un corps
--  `language sql` est analysé **à sa création**, donc avant que la table qu'il
--  interroge n'existe si l'ordre des sections change. C'est le défaut qui a
--  rendu la première migration inapplicable, et il ne se voit pas à la lecture.
create or replace function public.check_vote_choice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
      from public.sondage_choices
     where id = new.choice_id
       and sondage_id = new.sondage_id
  ) then
    raise exception 'Le choix ne fait pas partie de ce sondage.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.check_vote_choice() is
  'Refuse un vote dont le choix n''appartient pas au sondage visé.';

revoke all on function public.check_vote_choice() from public;

drop trigger if exists sondage_votes_check_choice on public.sondage_votes;
create trigger sondage_votes_check_choice
  before insert or update on public.sondage_votes
  for each row execute function public.check_vote_choice();


-- =============================================================================
--  5. Row Level Security
-- =============================================================================
--  Fermé par défaut : sans politique correspondante, une opération est refusée.
--  C'est le bon sens de l'erreur — un oubli rend une fonctionnalité
--  inaccessible et se voit immédiatement, plutôt que d'ouvrir une table à tout
--  le monde sans que rien ne le signale.

alter table public.agenda_events   enable row level security;
alter table public.documents       enable row level security;
alter table public.sondages        enable row level security;
alter table public.sondage_choices enable row level security;
alter table public.sondage_votes   enable row level security;
alter table public.messages        enable row level security;


--  ---------------------------------------------------------------------------
--  agenda_events — lecture par tous les adhérents, écriture par le bureau
--  ---------------------------------------------------------------------------
drop policy if exists agenda_events_select_authenticated on public.agenda_events;
create policy agenda_events_select_authenticated
  on public.agenda_events for select
  to authenticated
  using (true);

drop policy if exists agenda_events_insert_admin on public.agenda_events;
create policy agenda_events_insert_admin
  on public.agenda_events for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists agenda_events_update_admin on public.agenda_events;
create policy agenda_events_update_admin
  on public.agenda_events for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists agenda_events_delete_admin on public.agenda_events;
create policy agenda_events_delete_admin
  on public.agenda_events for delete
  to authenticated
  using (public.is_admin());


--  ---------------------------------------------------------------------------
--  documents — lecture par tous les adhérents, écriture par le bureau
--  ---------------------------------------------------------------------------
drop policy if exists documents_select_authenticated on public.documents;
create policy documents_select_authenticated
  on public.documents for select
  to authenticated
  using (true);

drop policy if exists documents_insert_admin on public.documents;
create policy documents_insert_admin
  on public.documents for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists documents_update_admin on public.documents;
create policy documents_update_admin
  on public.documents for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists documents_delete_admin on public.documents;
create policy documents_delete_admin
  on public.documents for delete
  to authenticated
  using (public.is_admin());


--  ---------------------------------------------------------------------------
--  sondages et sondage_choices — lecture par tous, écriture par le bureau
--  ---------------------------------------------------------------------------
--  Un sondage fermé reste lisible : un adhérent doit pouvoir consulter le
--  résultat de ce à quoi il a répondu. C'est la politique d'insertion des votes
--  qui refuse d'enregistrer un vote sur un sondage clos, pas la lecture qui le
--  cache.
drop policy if exists sondages_select_authenticated on public.sondages;
create policy sondages_select_authenticated
  on public.sondages for select
  to authenticated
  using (true);

drop policy if exists sondages_insert_admin on public.sondages;
create policy sondages_insert_admin
  on public.sondages for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists sondages_update_admin on public.sondages;
create policy sondages_update_admin
  on public.sondages for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists sondages_delete_admin on public.sondages;
create policy sondages_delete_admin
  on public.sondages for delete
  to authenticated
  using (public.is_admin());

drop policy if exists sondage_choices_select_authenticated on public.sondage_choices;
create policy sondage_choices_select_authenticated
  on public.sondage_choices for select
  to authenticated
  using (true);

drop policy if exists sondage_choices_insert_admin on public.sondage_choices;
create policy sondage_choices_insert_admin
  on public.sondage_choices for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists sondage_choices_update_admin on public.sondage_choices;
create policy sondage_choices_update_admin
  on public.sondage_choices for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists sondage_choices_delete_admin on public.sondage_choices;
create policy sondage_choices_delete_admin
  on public.sondage_choices for delete
  to authenticated
  using (public.is_admin());


--  ---------------------------------------------------------------------------
--  sondage_votes — on vote pour soi, et sur un sondage ouvert
--  ---------------------------------------------------------------------------
--  La condition d'insertion contraint **deux** choses, et la seconde est celle
--  qu'on oublie : le vote appartient à l'appelant, et le sondage est ouvert.
--
--  Le sous-`select` interroge `sondages`, et non `sondage_votes` : une
--  politique qui lirait sa propre table se rappellerait elle-même, et
--  PostgreSQL refuse cette récursion au lieu de la borner. Le piège est
--  classique, et il se manifeste par une erreur d'exécution, pas à la création.
--
--  `auth.uid()` est enveloppé dans un sous-`select` comme partout dans ce
--  schéma : PostgreSQL l'évalue alors une seule fois par requête au lieu d'une
--  fois par ligne.
drop policy if exists sondage_votes_select_own_or_admin on public.sondage_votes;
create policy sondage_votes_select_own_or_admin
  on public.sondage_votes for select
  to authenticated
  using (voter_id = (select auth.uid()) or public.is_admin());

drop policy if exists sondage_votes_insert_own on public.sondage_votes;
create policy sondage_votes_insert_own
  on public.sondage_votes for insert
  to authenticated
  with check (
    voter_id = (select auth.uid())
    and exists (
      select 1
        from public.sondages s
       where s.id = sondage_id
         and s.is_open
         and (s.closed_at is null or s.closed_at > now())
    )
  );

--  Un adhérent peut retirer son vote — pour se raviser, ou parce qu'il a
--  répondu trop vite. Le bureau peut retirer n'importe lequel, ce qui est
--  nécessaire pour écarter un vote manifestement erroné.
--
--  Aucune politique de modification : un vote ne se réécrit pas, il se retire
--  et se repose. Autoriser la réécriture ouvrirait la possibilité de changer un
--  vote passé sans que rien ne le signale, alors que le décompte, lui, aurait
--  déjà été lu.
drop policy if exists sondage_votes_delete_own_or_admin on public.sondage_votes;
create policy sondage_votes_delete_own_or_admin
  on public.sondage_votes for delete
  to authenticated
  using (voter_id = (select auth.uid()) or public.is_admin());


--  ---------------------------------------------------------------------------
--  messages — on écrit au bureau, et on relit les siens
--  ---------------------------------------------------------------------------
--  La lecture est restreinte à l'auteur, et ce n'est pas un détail : un message
--  au bureau peut signaler une situation personnelle. La règle 7 du projet —
--  `profiles` est lisible par tout porteur d'un jeton — ne s'étend donc **pas**
--  ici, et c'est précisément ce que cette politique tient.
drop policy if exists messages_select_own_or_admin on public.messages;
create policy messages_select_own_or_admin
  on public.messages for select
  to authenticated
  using (author_id = (select auth.uid()) or public.is_admin());

--  `author_id` est contraint à l'appelant, exactement comme pour un
--  signalement : on n'écrit pas au nom d'un autre.
drop policy if exists messages_insert_own on public.messages;
create policy messages_insert_own
  on public.messages for insert
  to authenticated
  with check (author_id = (select auth.uid()));

--  Seul le bureau modifie un message, et la seule modification prévue est de le
--  marquer comme traité. La condition d'insertion reprend la même colonne que le
--  verrou de modification : un verrou `before update` ne couvrirait pas
--  l'insertion, et un adhérent pourrait déposer un message déjà marqué traité.
drop policy if exists messages_update_admin on public.messages;
create policy messages_update_admin
  on public.messages for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

--  Un adhérent peut retirer son propre message tant qu'il n'a pas été traité —
--  après, il fait partie d'un échange que le bureau a lu. Le bureau peut
--  supprimer n'importe lequel.
drop policy if exists messages_delete_own_or_admin on public.messages;
create policy messages_delete_own_or_admin
  on public.messages for delete
  to authenticated
  using ((author_id = (select auth.uid()) and not handled) or public.is_admin());


-- =============================================================================
--  6. Privilèges
-- =============================================================================
--  Supabase accorde par défaut les privilèges sur les nouvelles tables aux rôles
--  `anon` et `authenticated`. Les politiques ci-dessus n'en visent aucun pour
--  `anon` : le rôle anonyme n'obtient donc rien, la clé publique seule ne
--  permettant aucune lecture. On le rend explicite plutôt que de compter sur
--  l'absence de politique — une politique sans privilège est un piège à
--  retardement, car un changement de réglage côté plateforme suffirait à ouvrir
--  l'accès.
revoke all on public.agenda_events   from anon;
revoke all on public.documents       from anon;
revoke all on public.sondages        from anon;
revoke all on public.sondage_choices from anon;
revoke all on public.sondage_votes   from anon;
revoke all on public.messages        from anon;
