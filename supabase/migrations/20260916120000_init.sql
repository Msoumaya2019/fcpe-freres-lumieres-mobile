-- =============================================================================
--  Schéma initial — FCPE Frères Lumières
-- =============================================================================
--
--  Application :
--      npx supabase link --project-ref <référence-du-projet>
--      npx supabase db push
--  ou, à défaut de CLI, en collant ce fichier dans l'éditeur SQL du tableau de
--  bord Supabase. La CLI applique chaque migration dans une transaction.
--
-- -----------------------------------------------------------------------------
--  RÈGLE DIRECTRICE
-- -----------------------------------------------------------------------------
--  L'application mobile embarque une clé publique, extractible d'un APK par
--  n'importe qui. La sécurité ne peut donc pas reposer sur le code client :
--  elle repose ENTIÈREMENT sur ce fichier.
--
--  Conséquence pratique : chaque table reçoit `enable row level security` et son
--  `revoke all ... from anon`, regroupés en sections 6 et 7 pour qu'on puisse
--  les vérifier d'un coup d'œil — et **non « dans la foulée » de chaque table**,
--  comme ce commentaire l'a affirmé un temps : les activations vivent cent
--  lignes plus bas, et un contributeur qui aurait cru la première version
--  aurait ajouté une table sans son activation.
--
--  Une table sans RLS est lisible et modifiable par tout porteur de la clé
--  publique — le défaut le plus courant, et le plus coûteux, d'un projet
--  Supabase. `scripts/check-rls-guards.test.mjs` croise désormais les tables
--  déclarées avec ces deux listes.
--
--  `authenticated` ne signifie pas « adhérent vérifié » : c'est simplement
--  « porteur d'un jeton de session valide ».
-- =============================================================================


-- =============================================================================
--  1. Types énumérés
-- =============================================================================
--  Déclarés en base plutôt que contraints par des chaînes libres : une valeur
--  erronée est refusée à l'écriture, et non découverte à l'affichage.

create type public.member_role as enum ('membre', 'admin');

create type public.signalement_category as enum ('cantine', 'transport', 'vie_scolaire', 'autre');

create type public.signalement_status as enum ('nouveau', 'en_cours', 'traite');


-- =============================================================================
--  2. Fonctions utilitaires
-- =============================================================================

--  ---------------------------------------------------------------------------
--  `is_admin()` — test de rôle, utilisable dans les politiques RLS
--  ---------------------------------------------------------------------------
--  `security definer` est indispensable : la fonction lit `profiles`, et une
--  politique de `profiles` qui interrogerait `profiles` par les droits de
--  l'appelant se rappellerait elle-même — PostgreSQL renvoie alors
--  « infinite recursion detected in policy ». En s'exécutant avec les droits du
--  propriétaire, la lecture contourne les politiques et la récursion disparaît.
--
--  `set search_path = ''` ferme l'autre piège classique de `security definer` :
--  sans lui, un schéma placé plus haut dans le `search_path` de l'appelant
--  pourrait redéfinir `profiles` et faire exécuter la fonction sur une fausse
--  table. Tous les noms sont donc qualifiés explicitement.
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
      and role = 'admin'
  );
$$;

--  `auth.uid()` est enveloppé dans un sous-`select` partout dans ce fichier :
--  PostgreSQL l'évalue alors une seule fois par requête au lieu d'une fois par
--  ligne, ce qui change tout sur une table de quelques milliers de messages.
comment on function public.is_admin() is
  'Vrai si l''appelant est un administrateur. Utilisée par les politiques RLS.';

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;


--  ---------------------------------------------------------------------------
--  `set_updated_at()` — horodatage automatique des modifications
--  ---------------------------------------------------------------------------
--  Sans ce déclencheur, `updated_at` reste à sa valeur d'insertion et devient
--  trompeur : il faut alors le renseigner depuis chaque appelant, ce qui finit
--  par être oublié à un endroit.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

--  Révoqué comme les autres fonctions du fichier, pour que la règle soit
--  uniforme et vérifiable d'un coup d'œil. Ce n'est pas une faille corrigée :
--  une fonction qui rend `trigger` ne peut pas être appelée directement, et les
--  déclencheurs de ce fichier s'exécutent sans que l'appelant ait besoin du
--  droit `execute` — `handle_new_user` et `prevent_role_change` en sont la
--  preuve, révoquées elles aussi et parfaitement fonctionnelles.
revoke all on function public.set_updated_at() from public;


--  ---------------------------------------------------------------------------
--  `handle_new_user()` — création du profil à l'inscription
--  ---------------------------------------------------------------------------
--  Le profil est créé par la base, au moment de l'insertion dans `auth.users`,
--  et non par l'application après l'inscription. Sinon, une application fermée
--  entre les deux laisserait un compte sans profil, donc sans nom affichable
--  dans la discussion — un état dont on ne sort qu'à la main.
--
--  Le nom vient des métadonnées transmises par `signUp()`. À défaut, la partie
--  locale de l'adresse e-mail fait un libellé acceptable — l'adresse est lue
--  sur `auth.users`, pas recopiée dans `profiles`.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();


-- =============================================================================
--  3. Tables
-- =============================================================================

--  ---------------------------------------------------------------------------
--  profiles — un adhérent
--  ---------------------------------------------------------------------------
--  La clé primaire EST l'identifiant d'authentification : il n'y a pas de
--  colonne `id` distincte à maintenir en correspondance, donc pas de risque de
--  désynchronisation. `on delete cascade` fait disparaître le profil avec le
--  compte, ce qui satisfait le droit à l'effacement du RGPD pour cette table.
--
--  POURQUOI IL N'Y A PAS DE COLONNE `email`
--  ----------------------------------------
--  La politique de lecture de cette table est ouverte à tout porteur d'un jeton
--  de session, parce qu'afficher l'auteur d'un message suppose de résoudre son
--  nom. Une colonne d'adresse e-mail y serait donc lisible par n'importe quel
--  adhérent — et l'inscription étant libre, par n'importe qui.
--
--  Elle existait, en « copie de commodité pour l'affichage ». Vérification
--  faite : l'application ne l'a jamais lue. L'écran d'informations affiche
--  `session.user.email`, qui vient de `auth.users`. La colonne n'était donc
--  qu'une copie de données personnelles dans la table la plus largement
--  lisible du schéma.
--
--  Règle à retenir : **une colonne ajoutée ici est lisible par tous les
--  adhérents**. Le nom affiché est un choix assumé, le prix d'un salon de
--  discussion lisible. Toute donnée qui n'est pas de ce niveau doit vivre
--  ailleurs, ou la politique de lecture doit être restreinte dans le même
--  commit que l'ajout.
--
--  `display_name` EST UNE ÉTIQUETTE, PAS UNE IDENTITÉ VÉRIFIÉE
--  ------------------------------------------------------------
--  Aucune contrainte d'unicité, et la seule écriture est celle de
--  `handle_new_user`, alimentée par les métadonnées de `signUp()`. L'application
--  affiche ensuite ce nom comme l'auteur d'un message. N'importe qui peut donc
--  s'inscrire sous le nom d'un adhérent existant et publier sous cette étiquette
--  — avec l'application publiée, sans client modifié.
--
--  Le défaut n'est pas dans cette table : il vient de l'inscription ouverte, qui
--  rend `authenticated` équivalent à « quiconque a installé l'application ». Une
--  contrainte d'unicité ne le corrigerait pas (deux homonymes existent) ; filtrer
--  l'inscription, si. Voir SECURITY.md.
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null default '',
  role          public.member_role not null default 'membre',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint profiles_display_name_length check (char_length(display_name) <= 80)
);

comment on table public.profiles is
  'Adhérents. Ne contient que ce qui est lisible par tous : un nom affiché et un rôle. L''adresse e-mail vit dans auth.users.';


--  ---------------------------------------------------------------------------
--  annonces — informations publiées par le bureau
--  ---------------------------------------------------------------------------
--  `author_id` est nullable avec `on delete set null` : une annonce publiée
--  reste utile même si son auteur quitte l'association. La supprimer en cascade
--  effacerait de l'information collective au motif qu'un compte a été fermé.
create table public.annonces (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  body          text not null,
  author_id     uuid references public.profiles (id) on delete set null,
  published_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint annonces_title_not_blank check (char_length(btrim(title)) between 1 and 160),
  constraint annonces_body_not_blank  check (char_length(btrim(body)) >= 1)
);


--  ---------------------------------------------------------------------------
--  cantine_menus — un menu par jour de service
--  ---------------------------------------------------------------------------
--  `service_date` est une DATE, pas un horodatage : un menu concerne une journée
--  civile. Stocker un instant obligerait chaque lecteur à choisir un fuseau, et
--  ferait basculer l'affichage d'un jour à l'autre selon l'appareil.
create table public.cantine_menus (
  id            uuid primary key default gen_random_uuid(),
  service_date  date not null,
  starter       text,
  main_course   text,
  dessert       text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint cantine_menus_service_date_unique unique (service_date)
);


--  ---------------------------------------------------------------------------
--  cantine_reservations — réservation d'un repas par un adhérent
--  ---------------------------------------------------------------------------
--  La contrainte d'unicité `(menu_id, user_id)` est une garantie de fond, pas
--  un détail : sans elle, deux appuis rapprochés créent deux lignes, et le
--  décompte des repas à préparer devient faux sans que personne ne s'en aperçoive.
create table public.cantine_reservations (
  id          uuid primary key default gen_random_uuid(),
  menu_id     uuid not null references public.cantine_menus (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),

  constraint cantine_reservations_unique unique (menu_id, user_id)
);


--  ---------------------------------------------------------------------------
--  signalements — remontée d'un problème au bureau
--  ---------------------------------------------------------------------------
create table public.signalements (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references public.profiles (id) on delete cascade,
  category    public.signalement_category not null default 'autre',
  subject     text not null,
  body        text not null,
  status      public.signalement_status not null default 'nouveau',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint signalements_subject_not_blank check (char_length(btrim(subject)) between 1 and 160),
  constraint signalements_body_not_blank    check (char_length(btrim(body)) >= 1)
);


--  ---------------------------------------------------------------------------
--  discussion_messages — salon unique des membres
--  ---------------------------------------------------------------------------
create table public.discussion_messages (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references public.profiles (id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now(),

  constraint discussion_messages_body_not_blank check (char_length(btrim(body)) between 1 and 2000)
);


-- =============================================================================
--  4. Index
-- =============================================================================
--  Chaque index correspond à une requête réellement écrite dans
--  `src/services/`. Un index sans requête coûte à l'écriture et ne sert à rien.

create index annonces_published_at_idx
  on public.annonces (published_at desc);

create index cantine_menus_service_date_idx
  on public.cantine_menus (service_date);

create index cantine_reservations_user_idx
  on public.cantine_reservations (user_id);

create index signalements_author_created_idx
  on public.signalements (author_id, created_at desc);

create index discussion_messages_created_at_idx
  on public.discussion_messages (created_at desc);


-- =============================================================================
--  5. Déclencheurs de cohérence
-- =============================================================================

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger annonces_set_updated_at
  before update on public.annonces
  for each row execute function public.set_updated_at();

create trigger cantine_menus_set_updated_at
  before update on public.cantine_menus
  for each row execute function public.set_updated_at();

create trigger signalements_set_updated_at
  before update on public.signalements
  for each row execute function public.set_updated_at();


--  ---------------------------------------------------------------------------
--  Verrou d'escalade de privilèges sur `profiles`
--  ---------------------------------------------------------------------------
--  La politique d'écriture autorise un membre à modifier sa propre ligne, ce qui
--  est nécessaire pour changer son nom affiché — mais autoriserait aussi à
--  écrire `role = 'admin'`. Interdire `role` dans la politique elle-même est
--  impossible : une politique sur `profiles` qui lit `profiles` se récurserait.
--  D'où ce déclencheur, seul endroit où la distinction est possible.
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
  return new;
end;
$$;

revoke all on function public.prevent_role_change() from public;

create trigger profiles_prevent_role_change
  before update on public.profiles
  for each row execute function public.prevent_role_change();


--  ---------------------------------------------------------------------------
--  Verrou sur le statut d'un signalement
--  ---------------------------------------------------------------------------
--  Même raison : l'auteur doit pouvoir corriger son texte, mais le passage à
--  « traité » est une décision du bureau. Un signalement que son auteur peut
--  clore lui-même ne veut plus rien dire comme suivi.
create or replace function public.prevent_status_change_by_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and not public.is_admin() then
    raise exception 'Seul un administrateur peut modifier le statut d''un signalement.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_status_change_by_member() from public;

create trigger signalements_prevent_status_change
  before update on public.signalements
  for each row execute function public.prevent_status_change_by_member();


-- =============================================================================
--  6. Row Level Security
-- =============================================================================
--  À partir d'ici, chaque table est fermée par défaut : sans politique
--  correspondante, une opération est refusée. C'est le bon sens de l'erreur —
--  un oubli rend une fonctionnalité inaccessible, et se voit tout de suite,
--  plutôt que d'ouvrir une table à tout le monde et de ne rien voir.

alter table public.profiles             enable row level security;
alter table public.annonces             enable row level security;
alter table public.cantine_menus        enable row level security;
alter table public.cantine_reservations enable row level security;
alter table public.signalements         enable row level security;
alter table public.discussion_messages  enable row level security;


--  ---------------------------------------------------------------------------
--  profiles
--  ---------------------------------------------------------------------------
--  Lecture ouverte aux membres connectés : afficher l'auteur d'un message ou
--  d'une annonce suppose de résoudre son nom.
--
--  Cette ouverture n'est tenable que parce que la table ne contient que deux
--  colonnes utiles : `display_name` et `role`. Elle ne contenait pas non plus
--  d'adresse e-mail — la colonne a été retirée, précisément parce que cette
--  politique la rendait lisible par tout le monde (voir le commentaire sur la
--  table).
--
--  C'est l'avertissement à retenir : **toute colonne ajoutée ici devient
--  lisible par l'ensemble des adhérents**, et l'inscription étant libre, par
--  quiconque installe l'application. Ajouter un téléphone, une adresse ou une
--  situation familiale impose de restreindre cette politique dans le même
--  commit — et de vérifier que l'application n'a pas besoin de lire le nom des
--  autres membres, ce qui est le cas aujourd'hui.
create policy profiles_select_authenticated
  on public.profiles for select
  to authenticated
  using (true);

--  Création de sa propre ligne : filet de sécurité si le déclencheur
--  `handle_new_user` n'a pas pu s'exécuter (compte créé hors de l'application,
--  par exemple). Le rôle est figé à « membre » : on ne s'attribue pas des droits
--  en s'insérant soi-même.
create policy profiles_insert_own
  on public.profiles for insert
  to authenticated
  with check (id = (select auth.uid()) and role = 'membre');

--  Aucune politique de modification. Elle a existé — `using (id = auth.uid())`,
--  avec un `with check` qui reprenait la condition, pour qu'on ne puisse pas
--  changer son `id` et prendre la place d'un autre adhérent. Le raisonnement
--  était juste, mais il ouvrait une capacité que **rien n'utilise** : aucun
--  écran ne modifie un profil, et le nom affiché n'est écrit qu'une fois, par
--  `handle_new_user`, à l'inscription.
--
--  La retirer ferme une capacité réelle, et non théorique : `display_name` est
--  ce que l'application affiche comme l'auteur d'un message, et il est résolu à
--  la lecture. Un membre pouvait donc se renommer à volonté — et renommer par
--  la même occasion **tous ses messages passés**, puisque aucun ne conserve le
--  nom de son auteur. Aucun déclencheur ne gardait cette colonne : seul `role`
--  est verrouillé.
--
--  Rien ne casse : l'application n'écrit aucun profil après l'inscription, et
--  le bureau garde de quoi corriger un libellé depuis le tableau de bord, où la
--  clé `service_role` ne passe par aucune politique.
--
--  Aucune politique de suppression non plus : la fermeture d'un compte passe par
--  `auth.users`, et le profil suit en cascade. Laisser l'API supprimer des
--  profils ouvrirait une suppression de compte par un simple appel client.


--  ---------------------------------------------------------------------------
--  annonces — lecture par tous les membres, écriture par le bureau
--  ---------------------------------------------------------------------------
create policy annonces_select_authenticated
  on public.annonces for select
  to authenticated
  using (true);

create policy annonces_insert_admin
  on public.annonces for insert
  to authenticated
  with check (public.is_admin());

create policy annonces_update_admin
  on public.annonces for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy annonces_delete_admin
  on public.annonces for delete
  to authenticated
  using (public.is_admin());


--  ---------------------------------------------------------------------------
--  cantine_menus — lecture par tous les membres, écriture par le bureau
--  ---------------------------------------------------------------------------
create policy cantine_menus_select_authenticated
  on public.cantine_menus for select
  to authenticated
  using (true);

create policy cantine_menus_insert_admin
  on public.cantine_menus for insert
  to authenticated
  with check (public.is_admin());

create policy cantine_menus_update_admin
  on public.cantine_menus for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy cantine_menus_delete_admin
  on public.cantine_menus for delete
  to authenticated
  using (public.is_admin());


--  ---------------------------------------------------------------------------
--  cantine_reservations — chacun ne voit et ne gère que les siennes
--  ---------------------------------------------------------------------------
--  Le bureau doit pouvoir consulter l'ensemble des réservations : c'est la
--  raison d'être de la table, il en a besoin pour commander les repas. D'où la
--  seconde branche de la politique de lecture.
create policy cantine_reservations_select_own_or_admin
  on public.cantine_reservations for select
  to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

--  On ne réserve que pour soi-même : `with check` refuse une ligne au nom d'un
--  autre adhérent.
create policy cantine_reservations_insert_own
  on public.cantine_reservations for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy cantine_reservations_delete_own_or_admin
  on public.cantine_reservations for delete
  to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

--  Pas de politique de modification, et c'est volontaire : une réservation ne
--  se modifie pas, elle se pose ou se retire (`setReservation` insère ou
--  supprime). Le dire évite qu'un `for update` soit ajouté plus tard « pour
--  compléter », ce qui ouvrirait une écriture que l'application n'utilise pas.


--  ---------------------------------------------------------------------------
--  signalements — visibles de leur auteur et du bureau
--  ---------------------------------------------------------------------------
--  Un signalement peut concerner un enfant nommément : il n'a rien à faire sous
--  les yeux de tous les adhérents. Seuls l'auteur et le bureau y accèdent.
create policy signalements_select_own_or_admin
  on public.signalements for select
  to authenticated
  using (author_id = (select auth.uid()) or public.is_admin());

--  `status` est contraint **ici aussi**, et pas seulement par le déclencheur :
--  `prevent_status_change_by_member` ne se déclenche qu'à la modification, alors
--  qu'une insertion peut poser n'importe quelle valeur de l'énumération. Sans
--  cette condition, un client modifié — ou un simple appel à l'API avec son
--  propre jeton — créait un signalement déjà « traité », que le bureau ne voyait
--  jamais passer. La règle « le passage à “traité” est une décision du bureau »
--  était donc contournable par la porte d'entrée.
--
--  La branche `is_admin()` reproduit la politique de modification : pour le
--  bureau, décider du statut dès la création reste sa décision.
create policy signalements_insert_own
  on public.signalements for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and (status = 'nouveau' or public.is_admin())
  );

create policy signalements_update_own_or_admin
  on public.signalements for update
  to authenticated
  using (author_id = (select auth.uid()) or public.is_admin())
  with check (author_id = (select auth.uid()) or public.is_admin());

--  Pas de suppression : un signalement est une trace. Le bureau le clôture en
--  changeant son statut, il ne l'efface pas.


--  ---------------------------------------------------------------------------
--  discussion_messages — lecture par tous les membres
--  ---------------------------------------------------------------------------
create policy discussion_messages_select_authenticated
  on public.discussion_messages for select
  to authenticated
  using (true);

create policy discussion_messages_insert_own
  on public.discussion_messages for insert
  to authenticated
  with check (author_id = (select auth.uid()));

--  Chacun peut retirer son propre message ; le bureau peut retirer n'importe
--  lequel, ce qui est nécessaire pour modérer un salon ouvert à tous.
create policy discussion_messages_delete_own_or_admin
  on public.discussion_messages for delete
  to authenticated
  using (author_id = (select auth.uid()) or public.is_admin());

--  Pas de politique de modification, volontairement : un message publié dans un
--  salon se retire, il ne se réécrit pas. Autoriser la réécriture demanderait de
--  conserver l'historique des versions pour que le salon reste compréhensible,
--  ce que cette première version ne fait pas.


-- =============================================================================
--  7. Privilèges
-- =============================================================================
--  Supabase accorde par défaut les privilèges sur les nouvelles tables aux rôles
--  `anon` et `authenticated`. Les politiques ci-dessus n'en visent aucun pour
--  `anon` : le rôle anonyme n'obtient donc rien, la clé publique seule ne
--  permettant aucune lecture. On le rend explicite plutôt que de compter sur
--  l'absence de politique.
revoke all on public.profiles             from anon;
revoke all on public.annonces             from anon;
revoke all on public.cantine_menus        from anon;
revoke all on public.cantine_reservations from anon;
revoke all on public.signalements         from anon;
revoke all on public.discussion_messages  from anon;

-- =============================================================================
--  8. Promotion du premier administrateur
-- =============================================================================
--  À exécuter UNE FOIS, après avoir créé votre propre compte depuis
--  l'application, en remplaçant l'adresse ci-dessous. Le rôle ne peut pas être
--  posé depuis l'application : c'est précisément ce que `prevent_role_change`
--  interdit.
--
--  L'adresse est lue dans `auth.users`, seule source de vérité : `profiles`
--  ne la stocke plus, pour ne pas exposer l'ensemble des adresses à tous les
--  adhérents.
--
--  LE DÉCLENCHEUR BLOQUE AUSSI CETTE COMMANDE, et c'est le piège de cette
--  étape. `prevent_role_change` refuse toute modification de `role` à qui n'est
--  pas déjà administrateur, et `is_admin()` lit `auth.uid()` — qui vaut NULL
--  hors d'une requête authentifiée. Exécutée telle quelle dans l'éditeur SQL,
--  la promotion échouait donc sur « Seul un administrateur peut modifier le
--  rôle d'un membre », alors que c'est exactement ce qu'on cherche à faire.
--
--  D'où la parenthèse, et la transaction qui l'entoure : `alter table` étant
--  transactionnel, un échec de la mise à jour annule la désactivation, et le
--  verrou ne peut pas rester ouvert par accident.
--
--    begin;
--    alter table public.profiles disable trigger profiles_prevent_role_change;
--
--    update public.profiles
--       set role = 'admin'
--      from auth.users
--     where auth.users.id = public.profiles.id
--       and auth.users.email = 'votre.adresse@exemple.fr';
--
--    alter table public.profiles enable trigger profiles_prevent_role_change;
--    commit;
--
-- =============================================================================
