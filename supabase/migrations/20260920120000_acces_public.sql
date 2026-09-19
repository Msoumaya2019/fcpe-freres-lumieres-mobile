-- =============================================================================
--  Accès public, espace membre, conversations avec les familles
-- =============================================================================
--  Application : coller ce fichier dans l'éditeur SQL du tableau de bord, après
--  `20260916120000_init.sql` puis `20260919120000_rubriques.sql`. Le fichier est
--  rejouable : le coller deux fois ne produit ni erreur, ni doublon.
--
-- -----------------------------------------------------------------------------
--  CE QUE CE FICHIER CHANGE, ET POURQUOI
-- -----------------------------------------------------------------------------
--  Les deux premiers fichiers ont été écrits pour une application qui demandait
--  une connexion avant d'afficher quoi que ce soit. Un parent devait donc créer
--  un compte pour lire un menu de cantine. Ce fichier renverse ce point de
--  départ :
--
--    - les informations destinées aux familles se lisent **sans compte**, avec
--      le rôle `anon` ;
--    - l'espace membre reste fermé, et une inscription n'y donne accès qu'une
--      fois **acceptée par le bureau** ;
--    - un parent peut écrire au bureau et poursuivre la conversation sans
--      compte, au moyen d'un secret que seul son téléphone détient ;
--    - un parent peut voter à un sondage sans compte.
--
--  TROIS NIVEAUX D'ACCÈS, ET RIEN D'AUTRE
--  --------------------------------------
--    anon          ce qui est publié pour les familles, en lecture seule ;
--                  l'écriture passe par des fonctions dédiées.
--    authenticated le compte existe. Il ne donne accès à rien de privé tant que
--                  `profiles.status` ne vaut pas `accepte` — la règle est dans
--                  les politiques, pas dans l'interface.
--    admin         le bureau, désigné par `public.is_admin()`.
--
--  POURQUOI UNE COLONNE DE STATUT, ET NON UNE SECONDE TABLE
--  --------------------------------------------------------
--  Une table `members` séparée aurait obligé chaque politique à joindre deux
--  tables, et surtout elle aurait pu **manquer une ligne** : un compte sans
--  entrée dans `members` n'aurait été ni membre ni refusé, mais invisible. Une
--  colonne `not null` avec valeur par défaut rend cet état impossible.
-- =============================================================================


-- =============================================================================
--  1. Types énumérés
-- =============================================================================

do $$
begin
  create type public.member_status as enum ('en_attente', 'accepte', 'refuse', 'suspendu');
exception
  when duplicate_object then null;
end
$$;

--  La visibilité d'un document, qui décide de ce qu'un parent non connecté peut
--  lire. Le défaut est `familles` : un document publié sans y penser reste
--  utile aux familles, et le bureau qui veut le réserver le dit explicitement.
do $$
begin
  create type public.document_visibility as enum ('familles', 'bureau');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.conversation_status as enum ('nouveau', 'en_cours', 'clos');
exception
  when duplicate_object then null;
end
$$;


-- =============================================================================
--  2. Colonnes ajoutées aux tables existantes
-- =============================================================================

--  ---------------------------------------------------------------------------
--  profiles.status — l'inscription est une demande, pas un droit
--  ---------------------------------------------------------------------------
--  La colonne est ajoutée **sans** valeur par défaut, les lignes existantes sont
--  acceptées, puis le défaut est posé. Cet ordre est ce qui rend le fichier
--  rejouable : au second passage, `add column if not exists` ne fait rien et le
--  `update` ne trouve plus aucune ligne à `null`.
--
--  POURQUOI LES COMPTES EXISTANTS SONT ACCEPTÉS
--  --------------------------------------------
--  Ils ont été créés du temps où l'application exigeait une connexion : chacun
--  l'a été par le bureau, ou pour lui. Les mettre en attente fermerait l'accès
--  privé au bureau lui-même, qui n'aurait plus les moyens de rouvrir quoi que
--  ce soit depuis l'application.
alter table public.profiles
  add column if not exists status public.member_status;

update public.profiles
   set status = 'accepte'
 where status is null;

alter table public.profiles
  alter column status set default 'en_attente';

alter table public.profiles
  alter column status set not null;

comment on column public.profiles.status is
  'Demande d''adhésion : en_attente à l''inscription, accepte par le bureau. Seul accepte ouvre l''espace membre.';


--  ---------------------------------------------------------------------------
--  documents.visibility — ce que les familles peuvent lire sans compte
--  ---------------------------------------------------------------------------
alter table public.documents
  add column if not exists visibility public.document_visibility not null default 'familles';


--  ---------------------------------------------------------------------------
--  sondage_votes — voter sans compte
--  ---------------------------------------------------------------------------
--  `voter_id` désignait le compte, et il était `not null` : un parent sans
--  compte ne pouvait pas voter. Il devient facultatif, et un second
--  identifiant — `voter_key`, tiré par l'application — prend le relais.
--
--  CE QUE CELA GARANTIT, ET CE QUE CELA NE GARANTIT PAS
--  ---------------------------------------------------
--  Un compte, c'est une personne : la contrainte d'unicité sur
--  `(sondage_id, voter_id)` interdit vraiment deux votes. Un identifiant
--  d'appareil, non — il se réinstalle, et une application modifiée peut en
--  inventer un autre. La limitation reste **raisonnable** : elle décourage le
--  vote répété depuis un même téléphone, sans prétendre à davantage.
--
--  Les deux colonnes s'excluent : un vote vient d'un compte, ou d'un appareil,
--  jamais des deux. La contrainte le dit en base plutôt que de le supposer.
alter table public.sondage_votes
  alter column voter_id drop not null;

alter table public.sondage_votes
  add column if not exists voter_key text;

alter table public.sondage_votes
  drop constraint if exists sondage_votes_voter_exactly_one;

alter table public.sondage_votes
  add constraint sondage_votes_voter_exactly_one
  check ((voter_id is null) <> (voter_key is null));

alter table public.sondage_votes
  drop constraint if exists sondage_votes_voter_key_format;

alter table public.sondage_votes
  add constraint sondage_votes_voter_key_format
  check (voter_key is null or voter_key ~ '^[0-9a-f]{32}$');

--  L'unicité d'un vote d'appareil. Index partiel : les votes de compte ont
--  `voter_key` à `null`, et un index unique ordinaire les aurait tous acceptés
--  de toute façon — PostgreSQL considère deux `null` comme distincts. L'écrire
--  partiellement dit l'intention au lieu de s'appuyer sur ce détail.
create unique index if not exists sondage_votes_sondage_voter_key_idx
  on public.sondage_votes (sondage_id, voter_key)
  where voter_key is not null;


-- =============================================================================
--  3. Fonctions
-- =============================================================================

--  ---------------------------------------------------------------------------
--  `is_member()` — l'appelant est-il un membre accepté ?
--  ---------------------------------------------------------------------------
--  Même forme que `is_admin()`, et pour la même raison : une politique sur
--  `profiles` qui interroge `profiles` se récurserait. `security definer` la fait
--  lire avec les droits du propriétaire, donc hors politiques.
--
--  Elle est **stable** et non volatile : PostgreSQL peut alors l'évaluer une
--  fois par requête au lieu d'une fois par ligne.
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and status = 'accepte'
  );
$$;

comment on function public.is_member() is
  'Vrai si l''appelant est un membre dont l''inscription a été acceptée.';

revoke all on function public.is_member() from public;
grant execute on function public.is_member() to authenticated;


--  ---------------------------------------------------------------------------
--  `decider_adhesion()` — le bureau accepte, refuse ou suspend
--  ---------------------------------------------------------------------------
--  POURQUOI UNE FONCTION, ET NON UNE POLITIQUE DE MODIFICATION
--  -----------------------------------------------------------
--  `profiles` n'a **aucune politique d'écriture**, et ce n'est pas un oubli :
--  aucun écran ne modifie un profil, et le nom affiché n'est écrit qu'une fois,
--  par `handle_new_user()`. Ouvrir une politique `for update` pour que le bureau
--  décide des adhésions élargirait la capacité bien au-delà du besoin — elle
--  porterait sur **toutes** les colonnes de la ligne, pour tout administrateur,
--  et le verrou de `prevent_role_change()` deviendrait la seule barrière entre
--  un client modifié et un changement de rôle.
--
--  Ici, la capacité est exactement celle qu'on veut : **un statut**, sur une
--  ligne, par un administrateur. Le rôle n'est pas touché : promouvoir un
--  administrateur reste le geste de l'éditeur SQL, avec sa parenthèse
--  documentée dans `MISE-EN-SERVICE.md`. C'est une décision rare, et elle mérite
--  d'être prise à la main.
--
--  `security definer` est nécessaire — l'appelant n'a aucun droit d'écriture sur
--  `profiles`, la fonction écrit avec les droits de son propriétaire. Le
--  contrôle `is_admin()` est donc **dans le corps**, et il est le seul rempart :
--  c'est ce qui rend cette fonction sûre à exposer à `authenticated`.
--
--  CE QU'ELLE NE FAIT PAS, ET QUI COMPTE AUTANT
--  --------------------------------------------
--  Elle ne refuse pas à un administrateur de changer **son propre** statut. La
--  tentation est de l'interdire pour éviter l'enfermement, et elle est fausse :
--  `is_admin()` lit le **rôle**, jamais le statut, donc un administrateur
--  suspendu reste administrateur et peut se rétablir lui-même. Ajouter la règle
--  coûterait une branche et une exception pour un cas qui ne se produit pas.
create or replace function public.decider_adhesion(
  p_id     uuid,
  p_statut public.member_status
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

  update public.profiles
     set status = p_statut
   where id = p_id;

  -- Aucune ligne touchée : l'identifiant ne désigne personne. On le dit, plutôt
  -- que de laisser l'écran annoncer une décision qui n'a rien changé. Le
  -- déclencheur `profiles_set_updated_at` a, lui, rafraîchi la date.
  if not found then
    raise exception 'Cet adhérent est introuvable.' using errcode = '22023';
  end if;
end;
$$;

comment on function public.decider_adhesion(uuid, public.member_status) is
  'Accepte, refuse ou suspend une adhésion. Réservée au bureau, seul habilité à changer un statut.';

revoke all on function public.decider_adhesion(uuid, public.member_status) from public;
grant execute on function public.decider_adhesion(uuid, public.member_status) to authenticated;


--  ---------------------------------------------------------------------------
--  `cle_appareil()` — une clé tirée par la base, pour un appareil sans compte
--  ---------------------------------------------------------------------------
--  LE MÊME PROBLÈME QUE LE SECRET DES CONVERSATIONS, ET LA MÊME RÉPONSE
--  -------------------------------------------------------------------
--  Un appareil sans compte a besoin d'une clé pour que son vote soit unique.
--  React Native n'expose aucun générateur aléatoire cryptographique, et le
--  projet n'embarque pas `expo-crypto` : `Math.random()` serait la seule source
--  côté téléphone, et ce n'en est pas une. La clé est donc tirée **ici**, une
--  fois, et l'application la garde.
--
--  CE QUE CETTE CLÉ PROTÈGE, ET CE QU'ELLE NE PROTÈGE PAS
--  -----------------------------------------------------
--  Elle rend un second vote difficile **sur le même appareil** : la contrainte
--  d'unicité `(sondage_id, voter_key)` le refuse. Elle ne garantit pas « une
--  personne, un vote » — réinstaller l'application en donne un nouveau, et rien
--  dans un identifiant d'appareil ne peut l'empêcher. C'est une limite
--  raisonnable, et elle est écrite ici pour ne pas être prise pour une garantie.
--
--  Elle n'est **pas** un secret : elle ne donne accès à rien. La garder dans les
--  préférences locales suffit, et c'est ce que fait l'application.
create or replace function public.cle_appareil()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select replace(gen_random_uuid()::text, '-', '');
$$;

comment on function public.cle_appareil() is
  'Une clé d''appareil tirée par la base, pour rendre un vote unique sans compte.';

revoke all on function public.cle_appareil() from public;
grant execute on function public.cle_appareil() to anon, authenticated;


--  ---------------------------------------------------------------------------
--  `prevent_role_change()` — le verrou d'escalade protège aussi le statut
--  ---------------------------------------------------------------------------
--  Redéfinie, et non doublée : deux déclencheurs `before update` sur la même
--  table s'exécuteraient dans l'ordre alphabétique de leur nom, et l'ordre
--  deviendrait une règle implicite que rien ne tiendrait. Une seule fonction,
--  deux contrôles.
--
--  CE QUE CE SECOND CONTRÔLE PROTÈGE AUJOURD'HUI, ET DEMAIN
--  -------------------------------------------------------
--  Aujourd'hui, `profiles` n'a **aucune politique de modification** : la
--  première migration le dit et le justifie — aucun écran ne modifie un profil,
--  et le nom affiché n'est écrit qu'une fois, par `handle_new_user()`. Par
--  l'API, un `update` ne touche donc **zéro ligne**, et ce déclencheur n'est
--  jamais atteint.
--
--  Il n'est pas décoratif pour autant, et c'est ce qui l'a fait écrire : un
--  `update` qui **atteint** la ligne — depuis l'éditeur SQL, depuis une
--  fonction `security definer`, ou le jour où une politique d'écriture sera
--  ajoutée pour le nom affiché — passerait sans lui. La phrase qui justifiait
--  ce contrôle affirmait qu'une telle politique existait ; c'était faux, et
--  `check-acces-public` mesure séparément les deux cas. La ligne qui tient
--  l'escalade est celle-ci, et elle est éprouvée dans les deux sens.
create or replace function public.prevent_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Seul un administrateur peut modifier le rôle d''un membre.'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status and not public.is_admin() then
    raise exception 'Seul un administrateur peut modifier le statut d''une adhésion.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_role_change() from public;


--  ---------------------------------------------------------------------------
--  `creer_conversation()` — un parent écrit au bureau, sans compte
--  ---------------------------------------------------------------------------
--  LE SECRET EST TIRÉ ICI, ET NON PAR LE TÉLÉPHONE
--  -----------------------------------------------
--  React Native n'expose pas de générateur aléatoire cryptographique sans
--  ajouter un module, et `Math.random()` n'en est pas un. `gen_random_uuid()`
--  en est un : PostgreSQL le tire de `pg_strong_random`, alimenté par le
--  générateur du système. Le secret naît donc ici et n'est renvoyé qu'une fois,
--  à l'appelant qui vient de créer la conversation.
--
--  SEUL `md5(secret)` EST CONSERVÉ
--  --------------------------------
--  `md5` est utilisé ici comme une **transformation irréversible d'un jeton à
--  forte entropie**, pas comme un hachage de mot de passe : le secret fait
--  122 bits, une attaque par préfixe est hors de portée, et `md5` évite
--  d'ajouter l'extension `pgcrypto` — une dépendance de plus sur une base qui
--  n'en a aucune. Ce qui est protégé, c'est le cas où la table fuit : sans le
--  secret, l'empreinte ne sert à rien.
create or replace function public.creer_conversation(
  p_subject text,
  p_category public.message_category,
  p_body text,
  p_reply_to text
)
returns table (conversation_id uuid, conversation_secret text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_secret text := gen_random_uuid()::text;
begin
  if char_length(btrim(coalesce(p_subject, ''))) = 0 then
    raise exception 'Le sujet est obligatoire.' using errcode = '22023';
  end if;

  if char_length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'Le message est obligatoire.' using errcode = '22023';
  end if;

  insert into public.conversations (id, secret_hash, subject, category, reply_to)
  values (
    v_id,
    md5(v_secret),
    btrim(p_subject),
    coalesce(p_category, 'autre'),
    nullif(btrim(coalesce(p_reply_to, '')), '')
  );

  insert into public.conversation_messages (conversation_id, from_bureau, body)
  values (v_id, false, btrim(p_body));

  return query select v_id, v_secret;
end;
$$;

revoke all on function public.creer_conversation(text, public.message_category, text, text) from public;
grant execute on function public.creer_conversation(text, public.message_category, text, text)
  to anon, authenticated;


--  ---------------------------------------------------------------------------
--  `lire_conversation()` — le parent relit son fil
--  ---------------------------------------------------------------------------
--  Un mauvais secret et un identifiant inconnu rendent **la même chose** : aucune
--  ligne. Distinguer les deux dirait à un inconnu qu'une conversation existe, ce
--  qui est déjà une information — et permettrait d'énumérer les identifiants.
create or replace function public.lire_conversation(p_id uuid, p_secret text)
returns table (message_id uuid, from_bureau boolean, body text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.conversations c
    where c.id = p_id
      and c.secret_hash = md5(coalesce(p_secret, ''))
  ) then
    return;
  end if;

  return query
    select m.id, m.from_bureau, m.body, m.created_at
    from public.conversation_messages m
    where m.conversation_id = p_id
    order by m.created_at asc;
end;
$$;

revoke all on function public.lire_conversation(uuid, text) from public;
grant execute on function public.lire_conversation(uuid, text) to anon, authenticated;


--  ---------------------------------------------------------------------------
--  `repondre_conversation()` — le parent poursuit la conversation
--  ---------------------------------------------------------------------------
--  Elle rend `false` quand le secret ne correspond pas, au lieu de lever : un
--  refus dû à un mauvais secret n'est pas une erreur d'usage, c'est la réponse
--  attendue à un appel non autorisé. L'écran l'affiche comme un message, sans
--  passer par le tableau des erreurs techniques.
create or replace function public.repondre_conversation(p_id uuid, p_secret text, p_body text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ouvert boolean;
begin
  if char_length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'Le message est obligatoire.' using errcode = '22023';
  end if;

  select (c.status <> 'clos')
    into v_ouvert
    from public.conversations c
   where c.id = p_id
     and c.secret_hash = md5(coalesce(p_secret, ''));

  if not found or not v_ouvert then
    return false;
  end if;

  insert into public.conversation_messages (conversation_id, from_bureau, body)
  values (p_id, false, btrim(p_body));

  update public.conversations
     set updated_at = now()
   where id = p_id;

  return true;
end;
$$;

revoke all on function public.repondre_conversation(uuid, text, text) from public;
grant execute on function public.repondre_conversation(uuid, text, text) to anon, authenticated;


--  ---------------------------------------------------------------------------
--  Les trois fonctions du bureau
--  ---------------------------------------------------------------------------
--  Elles vérifient `is_admin()` **dans leur corps**, et non par une politique :
--  les tables de conversation n'ont aucune politique, donc aucun rôle ne peut
--  les lire directement. Toute la lecture passe par ici, ce qui donne un seul
--  endroit à relire.
create or replace function public.lister_conversations()
returns table (
  id uuid,
  subject text,
  category public.message_category,
  status public.conversation_status,
  reply_to text,
  created_at timestamptz,
  updated_at timestamptz,
  message_count integer,
  last_body text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé au bureau.' using errcode = '42501';
  end if;

  return query
    select c.id,
           c.subject,
           c.category,
           c.status,
           c.reply_to,
           c.created_at,
           c.updated_at,
           (select count(*)::integer from public.conversation_messages m
             where m.conversation_id = c.id),
           (select m.body from public.conversation_messages m
             where m.conversation_id = c.id
             order by m.created_at desc limit 1)
      from public.conversations c
     order by c.updated_at desc
     limit 200;
end;
$$;

revoke all on function public.lister_conversations() from public;
grant execute on function public.lister_conversations() to authenticated;


create or replace function public.lire_conversation_bureau(p_id uuid)
returns table (message_id uuid, from_bureau boolean, body text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé au bureau.' using errcode = '42501';
  end if;

  return query
    select m.id, m.from_bureau, m.body, m.created_at
    from public.conversation_messages m
    where m.conversation_id = p_id
    order by m.created_at asc;
end;
$$;

revoke all on function public.lire_conversation_bureau(uuid) from public;
grant execute on function public.lire_conversation_bureau(uuid) to authenticated;


create or replace function public.repondre_conversation_bureau(p_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé au bureau.' using errcode = '42501';
  end if;

  if char_length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'Le message est obligatoire.' using errcode = '22023';
  end if;

  insert into public.conversation_messages (conversation_id, from_bureau, body)
  values (p_id, true, btrim(p_body));

  update public.conversations
     set updated_at = now(),
         status = case when status = 'nouveau' then 'en_cours'::public.conversation_status else status end
   where id = p_id;
end;
$$;

revoke all on function public.repondre_conversation_bureau(uuid, text) from public;
grant execute on function public.repondre_conversation_bureau(uuid, text) to authenticated;


--  ---------------------------------------------------------------------------
--  `resultats_sondage()` — le résultat, sans les votants
--  ---------------------------------------------------------------------------
--  La politique de lecture de `sondage_votes` ne laisse voir que son propre
--  vote, et c'est voulu : un décompte calculé côté client renverrait 0 ou 1,
--  jamais le résultat. Cette fonction rend des **compteurs par réponse**, jamais
--  une ligne de vote — le nom du votant ne sort donc pas de la base.
create or replace function public.resultats_sondage(p_sondage_id uuid)
returns table (choice_id uuid, label text, rang integer, voix bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select ch.id,
         ch.label,
         ch.position,
         (select count(*) from public.sondage_votes v where v.choice_id = ch.id)
    from public.sondage_choices ch
   where ch.sondage_id = p_sondage_id
   order by ch.position asc;
$$;

revoke all on function public.resultats_sondage(uuid) from public;
grant execute on function public.resultats_sondage(uuid) to anon, authenticated;


-- =============================================================================
--  4. Tables nouvelles
-- =============================================================================

--  ---------------------------------------------------------------------------
--  conversations — un fil entre un parent et le bureau
--  ---------------------------------------------------------------------------
--  AUCUNE POLITIQUE N'EST DÉCLARÉE SUR CETTE TABLE, et c'est le cœur du
--  dispositif : sans politique, aucun rôle ne peut la lire ni l'écrire
--  directement. Tout passe par les fonctions ci-dessus, qui seules savent
--  comparer un secret. Une politique « lecture par le bureau » aurait au
--  contraire ouvert la table à toute requête portant un jeton d'administrateur.
create table if not exists public.conversations (
  id          uuid primary key default gen_random_uuid(),
  secret_hash text not null,
  subject     text not null,
  category    public.message_category not null default 'autre',
  reply_to    text,
  status      public.conversation_status not null default 'nouveau',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint conversations_secret_hash_format check (secret_hash ~ '^[0-9a-f]{32}$'),
  constraint conversations_subject_length check (char_length(btrim(subject)) between 1 and 120),
  constraint conversations_reply_to_length check (reply_to is null or char_length(reply_to) <= 254)
);

comment on table public.conversations is
  'Fil entre un parent sans compte et le bureau. Lisible seulement par les fonctions qui comparent le secret.';

create table if not exists public.conversation_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  from_bureau     boolean not null default false,
  body            text not null,
  created_at      timestamptz not null default now(),
  constraint conversation_messages_body_length check (char_length(btrim(body)) between 1 and 4000)
);

comment on table public.conversation_messages is
  'Messages d''une conversation. La cascade est le mécanisme d''effacement RGPD du fil.';

create index if not exists conversation_messages_conversation_idx
  on public.conversation_messages (conversation_id, created_at asc);

create index if not exists conversations_updated_at_idx
  on public.conversations (updated_at desc);


--  ---------------------------------------------------------------------------
--  push_tokens — les appareils à prévenir
--  ---------------------------------------------------------------------------
--  Le jeton Expo d'un appareil. Il n'est pas un identifiant de personne : il
--  change à chaque réinstallation, et il est refusé par le service dès que
--  l'application est désinstallée. C'est précisément ce qu'on veut pour un
--  appareil qui n'a pas de compte.
--
--  PAS DE COLONNE « APPAREIL »
--  --------------------------
--  La première version portait un `device_key` — un identifiant d'appareil tiré
--  au sort, destiné à remplacer un jeton devenu obsolète. Elle a été retirée
--  avant la mise en service, pour une raison qu'il vaut la peine d'écrire :
--  React Native n'expose **aucun** générateur aléatoire cryptographique, et le
--  projet n'embarque pas `expo-crypto`. La colonne n'aurait donc pu être
--  remplie qu'avec `Math.random()`, qui n'est pas un générateur — et une
--  contrainte de format exigeant trente-deux caractères hexadécimaux aurait
--  donné à cette valeur l'apparence d'un secret qu'elle n'est pas.
--
--  Rien n'est perdu : `last_seen_at` suffit à purger les appareils disparus, et
--  un jeton périmé est de toute façon rejeté par le service d'envoi.
create table if not exists public.push_tokens (
  token        text primary key,
  platform     text not null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint push_tokens_token_length check (char_length(token) between 8 and 512),
  constraint push_tokens_platform check (platform in ('ios', 'android'))
);

comment on table public.push_tokens is
  'Jetons de notification des appareils. Écriture ouverte, lecture réservée au bureau.';

create index if not exists push_tokens_last_seen_idx
  on public.push_tokens (last_seen_at desc);


-- =============================================================================
--  5. Déclencheurs
-- =============================================================================

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();


-- =============================================================================
--  6. Row Level Security — ce qui s'ouvre, et ce qui se ferme
-- =============================================================================

alter table public.conversations          enable row level security;
alter table public.conversation_messages  enable row level security;
alter table public.push_tokens            enable row level security;


--  ---------------------------------------------------------------------------
--  Lecture publique — les informations destinées aux familles
--  ---------------------------------------------------------------------------
--  Chaque table publiée reçoit une politique `to anon` et le privilège `select`.
--  Les deux sont nécessaires : la politique dit **quelles lignes**, le privilège
--  dit **si l'opération est permise**. Le second manquerait sans que rien ne le
--  signale — la lecture rendrait une liste vide, pas une erreur.

drop policy if exists annonces_select_public on public.annonces;
create policy annonces_select_public
  on public.annonces for select
  to anon
  using (true);

drop policy if exists cantine_menus_select_public on public.cantine_menus;
create policy cantine_menus_select_public
  on public.cantine_menus for select
  to anon
  using (true);

drop policy if exists agenda_events_select_public on public.agenda_events;
create policy agenda_events_select_public
  on public.agenda_events for select
  to anon
  using (true);

drop policy if exists sondages_select_public on public.sondages;
create policy sondages_select_public
  on public.sondages for select
  to anon
  using (true);

drop policy if exists sondage_choices_select_public on public.sondage_choices;
create policy sondage_choices_select_public
  on public.sondage_choices for select
  to anon
  using (true);

--  Seuls les documents destinés aux familles. Ceux du bureau restent hors de
--  portée du rôle anonyme, y compris si leur adresse est connue : la politique
--  filtre sur la colonne, pas sur la requête.
drop policy if exists documents_select_public on public.documents;
create policy documents_select_public
  on public.documents for select
  to anon
  using (visibility = 'familles');


--  ---------------------------------------------------------------------------
--  Vote anonyme — insertion seule, et seulement sur un sondage ouvert
--  ---------------------------------------------------------------------------
--  `with check` reprend en base les deux règles que l'écran applique : le vote
--  vient d'un appareil, et le sondage accepte encore des réponses. Un client
--  modifié ne peut donc pas voter sur un sondage clos.
--  La politique de lecture du vote par son auteur est **retirée**, et ce n'est
--  pas un oubli : elle comparait `voter_id` à `auth.uid()`, deux valeurs qui
--  sont désormais nulles pour un vote d'appareil. La garder aurait laissé une
--  politique qui n'autorise rien de ce qu'on croit, et qu'aucune requête
--  n'exerce. Le vote de l'appareil se relit localement, et le décompte passe par
--  `resultats_sondage()`.
drop policy if exists sondage_votes_select_own_or_admin on public.sondage_votes;

drop policy if exists sondage_votes_insert_public on public.sondage_votes;
create policy sondage_votes_insert_public
  on public.sondage_votes for insert
  to anon
  with check (
    voter_id is null
    and voter_key is not null
    and exists (
      select 1
      from public.sondages s
      where s.id = sondage_id
        and s.is_open
        and (s.closed_at is null or s.closed_at > now())
    )
  );


--  ---------------------------------------------------------------------------
--  Notifications — un appareil s'enregistre, le bureau les lit
--  ---------------------------------------------------------------------------
drop policy if exists push_tokens_insert_device on public.push_tokens;
create policy push_tokens_insert_device
  on public.push_tokens for insert
  to anon, authenticated
  with check (true);

--  Nécessaire pour l'enregistrement d'un appareil déjà connu : `enregistrerAppareil`
--  modifie d'abord la ligne, puis insère — et c'est le **doublon** de l'insertion
--  qui prouve que la modification a suffi. Sans politique de modification, cette
--  première moitié serait refusée, l'appareil ne rafraîchirait jamais sa date, et
--  il serait purgé au bout de quelques mois alors qu'il est toujours installé.
drop policy if exists push_tokens_update_device on public.push_tokens;
create policy push_tokens_update_device
  on public.push_tokens for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists push_tokens_select_admin on public.push_tokens;
create policy push_tokens_select_admin
  on public.push_tokens for select
  to authenticated
  using (public.is_admin());


--  ---------------------------------------------------------------------------
--  La discussion s'ouvre aux membres acceptés, et se referme aux autres
--  ---------------------------------------------------------------------------
--  C'est ici que « une inscription acceptée » devient une règle de sécurité, et
--  non un affichage. Un compte en attente, refusé ou suspendu reçoit une liste
--  **vide** — l'écran doit donc dire pourquoi, sans quoi il paraîtrait cassé.
drop policy if exists discussion_messages_select_authenticated on public.discussion_messages;
drop policy if exists discussion_messages_select_member on public.discussion_messages;
create policy discussion_messages_select_member
  on public.discussion_messages for select
  to authenticated
  using (public.is_member());

drop policy if exists discussion_messages_insert_own on public.discussion_messages;
drop policy if exists discussion_messages_insert_member on public.discussion_messages;
create policy discussion_messages_insert_member
  on public.discussion_messages for insert
  to authenticated
  with check (author_id = (select auth.uid()) and public.is_member());


--  ---------------------------------------------------------------------------
--  `messages` — la table reste, ses politiques partent
--  ---------------------------------------------------------------------------
--  L'ancien écran de contact écrivait ici. Il exigeait un compte, parce que
--  `author_id` référence `auth.users` : un parent sans compte ne pouvait donc
--  pas écrire au bureau, ce qui est exactement ce que cette migration corrige.
--  Le contact passe désormais par une conversation.
--
--  Les deux politiques sont donc retirées, et **aucune ligne n'est supprimée** :
--  les messages déjà reçus restent en base, lisibles depuis le tableau de bord
--  et effacés en cascade avec le compte de leur auteur, comme `SECURITY.md` le
--  promet. Les laisser en place aurait laissé deux politiques que plus aucune
--  requête n'exerce — et une politique qu'on ne peut pas éprouver est une
--  politique dont on ne sait rien.
drop policy if exists messages_select_own_or_admin on public.messages;
drop policy if exists messages_insert_own on public.messages;


-- =============================================================================
--  7. Privilèges
-- =============================================================================
--  Le rôle anonyme n'avait **aucun** privilège : la clé publique, extraite d'un
--  paquet, ne permettait pas même de lire un menu. On lui accorde la lecture des
--  six tables publiées, et rien d'autre. `sondage_votes` ne reçoit que
--  l'insertion : personne ne lit les votes par cette voie, le résultat passe par
--  `resultats_sondage()`.

grant select on public.annonces        to anon;
grant select on public.cantine_menus   to anon;
grant select on public.agenda_events   to anon;
grant select on public.sondages        to anon;
grant select on public.sondage_choices to anon;
grant select on public.documents       to anon;

grant insert on public.sondage_votes to anon;
grant insert, update on public.push_tokens to anon;
grant insert, update on public.push_tokens to authenticated;

--  Les tables de conversation restent sans privilège pour tout le monde : les
--  fonctions `security definer` s'exécutent avec les droits de leur
--  propriétaire, et n'ont donc besoin d'aucun droit accordé à l'appelant.
revoke all on public.conversations         from anon, authenticated;
revoke all on public.conversation_messages from anon, authenticated;


-- =============================================================================
--  8. Ce qui reste à faire à la main
-- =============================================================================
--  Deux réglages ne vivent pas dans ce fichier, parce qu'ils appartiennent au
--  schéma `storage` que la doublure des tests ne reproduit pas :
--
--    1. le compartiment `documents` reste **privé** ; il lui faut désormais
--       **deux** politiques de lecture — une pour le rôle `anon`, bornée par
--       `public.documents.visibility = 'familles'`, une pour les porteurs d'un
--       jeton. Sans la première, l'écran Documents resterait vide pour un parent
--       sans compte ; sans la seconde, l'adhérent connecté perdrait les documents
--       du bureau ;
--    2. aucune des deux n'autorise l'écriture : le compartiment ne reçoit de
--       fichier que par le tableau de bord.
--
--  Les deux commandes exactes sont dans `MISE-EN-SERVICE.md`, §1.4 — et c'est ce
--  guide que `scripts/check-rls-guards.test.mjs` relit, faute de pouvoir lire le
--  tableau de bord.
