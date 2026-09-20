-- =============================================================================
--  Le super administrateur, et ce qu'il garde
-- =============================================================================
--
--  POURQUOI CE FICHIER
--  -------------------
--  Jusqu'ici, un administrateur pouvait tout : valider une adhésion, lire les
--  messages des familles, décider d'un rôle. Le bureau a demandé une marche
--  au-dessus — **un super administrateur seul** valide les adhérents, seul il
--  lit les messages reçus et les signalements, seul il modère la discussion, et
--  seul il valide les commentaires déposés sous une actualité.
--
--  CE QUE CE FICHIER AJOUTE
--  ------------------------
--    1. la colonne `profiles.est_super_admin`, **et ses deux verrous** ;
--    2. `is_super_admin()`, et `is_admin()` qui l'inclut ;
--    3. les fonctions du bureau réservées au super administrateur ;
--    4. les signalements, lus et traités par lui seul ;
--    5. la table `commentaires`, avec validation avant publication ;
--    6. la colonne `annonces.image_path`, pour une photo jointe à une actualité.
--
--  CE QUE CE FICHIER N'A **PAS** EU À AJOUTER, ET C'EST MESURÉ
--  ----------------------------------------------------------
--  La modération de la discussion — « supprimer un message » — avait été
--  demandée comme une capacité nouvelle. Elle existe **depuis la première
--  migration** : `discussion_messages_delete_own_or_admin` autorise l'auteur à
--  retirer son message et le bureau à retirer n'importe lequel, bornée par
--  `is_admin()`. Comme `is_admin()` inclut désormais le super administrateur,
--  la demande est satisfaite **sans une ligne de plus**.
--
--  Une seconde politique de suppression aurait été pire qu'inutile : deux
--  politiques de même opération pour un même rôle **se cumulent**, et la plus
--  large l'emporte. Le fichier n'ajoute donc rien ici, et le dit — plutôt que de
--  laisser croire, par une politique redondante, que la capacité est neuve.
--
--  POURQUOI UNE COLONNE, ET NON UNE VALEUR D'ÉNUMÉRATION
--  -----------------------------------------------------
--  `public.member_role` est une énumération, et lui ajouter `'super_admin'`
--  aurait été le geste évident. Il est écarté pour deux raisons mesurées :
--
--    - **l'ordre d'exécution.** `alter type … add value` interdit d'**employer**
--      la valeur dans la même transaction. Le banc `check-migration-applicable`
--      joue ce fichier d'un seul bloc, comme le fait l'éditeur SQL : la
--      migration échouerait sur « unsafe use of new value ».
--    - **le retour en arrière.** Une valeur d'énumération ne se retire pas.
--      Une colonne booléenne, si.
--
--  Une colonne, donc, et elle est **lue par tout porteur d'un jeton** — comme
--  `role` : la politique de `profiles` est `using (true)`. Savoir qui est super
--  administrateur n'est pas un secret ; c'est déjà vrai du rôle.
--
--  LE VERROU QUI COMPTE LE PLUS
--  ----------------------------
--  `profiles` n'a **aucune politique de modification**, et c'est ce qui protège
--  `role` aujourd'hui. Mais elle a une politique d'**insertion** de sa propre
--  ligne — et un verrou de modification ne couvre pas l'insertion. Sans la
--  condition ajoutée à `profiles_insert_own`, chacun aurait pu s'insérer
--  super administrateur, et la hiérarchie entière tombait par la porte
--  d'entrée. C'est la première chose que ce fichier ferme.
--
--  REJOUABLE
--  ---------
--  Chaque objet est précédé de sa garde : `if not exists`, `create or replace`,
--  ou `drop policy if exists` avant `create policy`. Recoller ce fichier ne
--  crée aucun doublon et ne laisse aucune politique concurrente.

-- =============================================================================
--  1. La colonne, et ses deux verrous
-- =============================================================================

alter table public.profiles
  add column if not exists est_super_admin boolean not null default false;

comment on column public.profiles.est_super_admin is
  'Vrai pour le super administrateur. Lisible par tout porteur d''un jeton, comme `role`. Ne s''écrit que par l''éditeur SQL, déclencheur désactivé.';

--  Le verrou d'insertion. `role` y était déjà figé à « membre » ; `est_super_admin`
--  l'est aussi. Sans cette condition, s'insérer soi-même suffisait à se nommer.
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles for insert
  to authenticated
  with check (
    id = (select auth.uid())
    and role = 'membre'
    and not est_super_admin
  );

--  Le verrou de modification, étendu à la nouvelle colonne. Il garde aussi le
--  dernier super administrateur : se retirer soi-même ses droits est
--  irréversible sans repasser par l'éditeur SQL, et c'est exactement ce que la
--  garde du dernier administrateur évitait déjà pour `role`.
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

  if new.est_super_admin is distinct from old.est_super_admin then
    if not public.is_super_admin() then
      raise exception 'Seul un super administrateur peut nommer un super administrateur.'
        using errcode = '42501';
    end if;

    if old.est_super_admin
       and not new.est_super_admin
       and (select count(*) from public.profiles where est_super_admin) <= 1
    then
      raise exception 'Il doit rester au moins un super administrateur.'
        using errcode = '42501';
    end if;
  end if;

  if new.status is distinct from old.status and not public.is_admin() then
    raise exception 'Seul un administrateur peut modifier le statut d''une adhésion.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_role_change() from public;


-- =============================================================================
--  2. `is_super_admin()`, et `is_admin()` qui l'inclut
-- =============================================================================
--  L'ORDRE COMPTE, ET IL EST MESURÉ
--  --------------------------------
--  Ces deux fonctions sont écrites en `language sql`, dont le corps est analysé
--  **à sa création** : elles nomment `est_super_admin`, qui doit donc exister
--  au-dessus. Placées avant la colonne, elles échoueraient sur
--  « column est_super_admin does not exist » — le défaut qui a déjà coûté une
--  migration à ce projet.

create or replace function public.is_super_admin()
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
      and est_super_admin
  );
$$;

comment on function public.is_super_admin() is
  'Vrai si l''appelant est le super administrateur. Utilisée par les politiques RLS.';

revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated;

--  `is_admin()` reste vrai pour un administrateur, et le devient pour un super
--  administrateur : celui-ci a **tout** ce qu'un administrateur a, et davantage.
--  Écrire la seconde branche plutôt que d'exiger les deux colonnes évite qu'un
--  super administrateur sans le rôle `admin` perde silencieusement ses droits.
create or replace function public.is_admin()
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
      and (role = 'admin' or est_super_admin)
  );
$$;

comment on function public.is_admin() is
  'Vrai si l''appelant est administrateur ou super administrateur. Utilisée par les politiques RLS.';

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;


-- =============================================================================
--  3. Les fonctions du bureau réservées au super administrateur
-- =============================================================================
--  Chacune est reprise **à l'identique**, sauf sa garde : `is_admin()` devient
--  `is_super_admin()`. Reprendre le corps plutôt que d'ajouter une seconde
--  fonction évite deux définitions concurrentes du même nom, dont la dernière
--  lue l'emporterait sans que personne ne sache laquelle.
--
--  `changer_role()` suit le même chemin, et c'est un choix à dire : nommer un
--  administrateur, c'est décider de la hiérarchie. Laisser ce geste à tout
--  administrateur aurait vidé de sa substance la règle « seul le super
--  administrateur valide les adhérents » — non par la porte qu'elle ferme, mais
--  par celle d'à côté.

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
  if not public.is_super_admin() then
    raise exception 'Réservé au super administrateur.' using errcode = '42501';
  end if;

  update public.profiles
     set status = p_statut
   where id = p_id;

  if not found then
    raise exception 'Cet adhérent est introuvable.' using errcode = '22023';
  end if;
end;
$$;

comment on function public.decider_adhesion(uuid, public.member_status) is
  'Accepte, refuse ou suspend une adhésion. Réservée au super administrateur.';

revoke all on function public.decider_adhesion(uuid, public.member_status) from public;
grant execute on function public.decider_adhesion(uuid, public.member_status) to authenticated;


create or replace function public.changer_role(p_id uuid, p_role public.member_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Réservé au super administrateur.' using errcode = '42501';
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
  if not public.is_super_admin() then
    raise exception 'Réservé au super administrateur.' using errcode = '42501';
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
  if not public.is_super_admin() then
    raise exception 'Réservé au super administrateur.' using errcode = '42501';
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
  if not public.is_super_admin() then
    raise exception 'Réservé au super administrateur.' using errcode = '42501';
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
  if not public.is_super_admin() then
    raise exception 'Réservé au super administrateur.' using errcode = '42501';
  end if;

  update public.conversations
     set status = p_statut,
         updated_at = now()
   where id = p_id;
end;
$$;

revoke all on function public.marquer_conversation(uuid, public.conversation_status) from public;
grant execute on function public.marquer_conversation(uuid, public.conversation_status) to authenticated;


-- =============================================================================
--  4. Les signalements : lus et traités par le super administrateur
-- =============================================================================
--  Un signalement peut concerner un enfant nommément. La politique d'origine
--  ouvrait la lecture à **tout administrateur** ; elle la restreint au super
--  administrateur, et l'auteur garde la sienne — c'est ce que l'écran « Mes
--  signalements » lit, et il ne dépend donc pas de ce changement.
--
--  Les politiques sont **renommées**, et pas seulement modifiées : un nom qui
--  annonce `admin` sous une condition qui interroge `is_super_admin()` est
--  exactement le genre de mensonge qu'un prochain lecteur croira.

drop policy if exists signalements_select_own_or_admin on public.signalements;
drop policy if exists signalements_select_own_or_super on public.signalements;
create policy signalements_select_own_or_super
  on public.signalements for select
  to authenticated
  using (author_id = (select auth.uid()) or public.is_super_admin());

drop policy if exists signalements_update_own_or_admin on public.signalements;
drop policy if exists signalements_update_own_or_super on public.signalements;
create policy signalements_update_own_or_super
  on public.signalements for update
  to authenticated
  using (author_id = (select auth.uid()) or public.is_super_admin())
  with check (author_id = (select auth.uid()) or public.is_super_admin());

--  La politique d'insertion, elle, ne change pas de portée : n'importe quel
--  adhérent dépose un signalement, et le statut initial reste contraint. Elle
--  est reprise seulement pour sa seconde branche — un super administrateur qui
--  décide du statut dès le dépôt est couvert par `is_admin()`, qui l'inclut.
drop policy if exists signalements_insert_own on public.signalements;
create policy signalements_insert_own
  on public.signalements for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and (status = 'nouveau' or public.is_admin())
  );


-- =============================================================================
--  5. Les commentaires, publiés après validation
-- =============================================================================
--  POURQUOI UN STATUT PLUTÔT QU'UNE SUPPRESSION
--  --------------------------------------------
--  Un commentaire refusé n'est pas effacé, il change d'état. Le supprimer
--  aurait effacé la trace de ce qu'on a refusé — et le bureau ne pourrait plus
--  répondre à un parent qui demande pourquoi son message n'apparaît pas. La
--  trace est aussi ce qui permet de reconnaître un envoi répété.

do $$
begin
  create type public.commentaire_statut as enum ('en_attente', 'publie', 'refuse');
exception
  when duplicate_object then null;
end
$$;

comment on type public.commentaire_statut is
  'État d''un commentaire : déposé, publié après validation, ou refusé.';

create table if not exists public.commentaires (
  id            uuid primary key default gen_random_uuid(),
  annonce_id    uuid not null references public.annonces (id) on delete cascade,
  auteur_nom    text not null,
  corps         text not null,
  statut        public.commentaire_statut not null default 'en_attente',
  voter_key     text not null,
  moderated_at  timestamptz,
  moderated_by  uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),

  --  Chaque contrainte s'écrit `constraint … check (` sur **une seule ligne**,
  --  et c'est une contrainte de forme, pas de goût : le relevé de colonnes de
  --  `check-schema-types` retire un bloc `constraint` en comptant les
  --  parenthèses, et n'entre dans le bloc qu'à la ligne qui en ouvre une. Un
  --  `check` rejeté sur la ligne suivante serait lu comme une **colonne** nommée
  --  `check`, et le banc tomberait sur du SQL juste. La forme est celle de
  --  `messages_reply_format`, dans la seconde migration.
  constraint commentaires_auteur_nom_longueur check (
    char_length(btrim(auteur_nom)) between 2 and 60
  ),
  constraint commentaires_corps_longueur check (
    char_length(btrim(corps)) between 2 and 1000
  ),
  constraint commentaires_voter_key_format check (
    voter_key ~ '^[0-9a-f]{32}$'
  ),
  --  Une décision de modération est datée et signée, ou elle n'existe pas : un
  --  commentaire publié sans date de décision serait indistinguable d'un
  --  commentaire publié par erreur.
  constraint commentaires_decision_complete check (
    (statut = 'en_attente') = (moderated_at is null)
  )
);

comment on table public.commentaires is
  'Commentaires des familles sous une actualité. Publiés seulement après validation par le super administrateur.';

--  LA RLS, ET POURQUOI ELLE EST ÉCRITE ICI PLUTÔT QU'AILLEURS
--  --------------------------------------------------------
--  Une table créée dans l'éditeur SQL de Supabase **n'a pas** la RLS activée :
--  ses politiques existent, mais ne sont jamais consultées, et la table est
--  lisible et modifiable par tout porteur de la clé publique. C'est le défaut le
--  plus coûteux d'un projet Supabase, et il est **silencieux** — tout le reste
--  du fichier serait vert.
--
--  Elle est posée juste après la table, et non dans une section « RLS » en fin
--  de fichier comme la première migration le fait : une section lointaine se
--  sépare de ce qu'elle protège, et c'est exactement l'écart qu'un relecteur ne
--  voit pas. Le banc `check-rls-guards` l'exige, et il l'a exigée ici — la
--  version précédente de ce fichier ne l'avait pas.
alter table public.commentaires enable row level security;

create index if not exists commentaires_a_valider_idx
  on public.commentaires (created_at)
  where statut = 'en_attente';

create index if not exists commentaires_publies_idx
  on public.commentaires (annonce_id, created_at)
  where statut = 'publie';

--  `voter_key` est la clé d'appareil, la même que pour un vote : elle ne
--  désigne pas une personne, et ne sert pas à filtrer la lecture. Elle est là
--  pour reconnaître un envoi répété depuis un même téléphone, et pour que
--  l'application puisse dire « votre commentaire attend d'être validé ».

--  Les privilèges, écrits avant les politiques : le refus de trop précède
--  toujours l'autorisation de faire.
revoke all on public.commentaires from anon, authenticated;
grant select, insert on public.commentaires to anon;
grant select, insert, update, delete on public.commentaires to authenticated;

--  Lecture : les commentaires publiés, pour tout le monde. L'auteur d'un
--  commentaire en attente ne le relit pas — sa clé d'appareil ne peut pas être
--  comparée à `auth.uid()`, et une politique qui prétendrait le faire
--  n'autoriserait rien de ce qu'elle annonce.
drop policy if exists commentaires_select_publies_anon on public.commentaires;
create policy commentaires_select_publies_anon
  on public.commentaires for select
  to anon
  using (statut = 'publie');

drop policy if exists commentaires_select_publies on public.commentaires;
create policy commentaires_select_publies
  on public.commentaires for select
  to authenticated
  using (statut = 'publie' or public.is_super_admin());

--  Dépôt : tout le monde, sans compte. Le commentaire naît « en attente », et
--  la condition le **dit** : sans elle, un client modifié poserait `publie` et
--  la validation ne servirait à rien.
drop policy if exists commentaires_insert_public on public.commentaires;
create policy commentaires_insert_public
  on public.commentaires for insert
  to anon, authenticated
  with check (
    statut = 'en_attente'
    and moderated_at is null
    and moderated_by is null
    and exists (
      select 1
      from public.annonces a
      where a.id = annonce_id
        and not a.is_draft
    )
  );

--  La décision : le super administrateur seul. Le `with check` reprend la même
--  condition que le `using` — sans lui, la ligne modifiée pourrait sortir du
--  périmètre de celui qui l'a modifiée.
drop policy if exists commentaires_update_super on public.commentaires;
create policy commentaires_update_super
  on public.commentaires for update
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists commentaires_delete_super on public.commentaires;
create policy commentaires_delete_super
  on public.commentaires for delete
  to authenticated
  using (public.is_super_admin());


-- =============================================================================
--  6. Une photo jointe à une actualité
-- =============================================================================
--  La colonne ne porte qu'un **chemin** dans le compartiment `documents`, sous
--  le préfixe `annonces/` — jamais une adresse complète : l'adresse d'un
--  compartiment privé se signe, et une adresse signée posée en base
--  expirerait au bout d'une heure, laissant les images cassées sans que rien
--  n'ait changé.
--
--  Le compartiment et ses politiques ne sont pas ici : le schéma `storage`
--  n'existe pas dans le banc qui exécute les migrations, et une instruction
--  qui échoue à l'exécution ne protège personne. Ils sont dans
--  `MISE-EN-SERVICE.md` §1.4, avec ceux des documents.

alter table public.annonces
  add column if not exists image_path text;

comment on column public.annonces.image_path is
  'Chemin de la photo dans le compartiment `documents`, préfixe `annonces/`. Nul quand l''actualité n''en a pas.';
