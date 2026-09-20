-- =============================================================================
--  8. Le titre du bandeau se règle, et un message de famille se retire
-- =============================================================================
--  POURQUOI CETTE MIGRATION
--  ------------------------
--  Deux demandes du bureau, réunies dans un seul fichier parce qu'elles se
--  collent ensemble : deux gestes coûteraient deux collages, et le second serait
--  oublié.
--
--  1. **Le titre du bandeau d'accueil.** L'écran d'accueil porte, en tête, une
--     photographie de l'école surmontée de son nom et de sa devise. Ces deux
--     lignes étaient écrites **dans le code** de l'application, et c'était un
--     choix documenté : elles faisaient partie des phrases de l'application, pas
--     des informations publiées par le bureau. Le bureau demande à pouvoir les
--     changer — ce qui les fait changer de catégorie. Elles deviennent des
--     informations publiées, donc des **données**, donc une table.
--
--     POURQUOI PAS UN FICHIER À CÔTÉ DE LA PHOTOGRAPHIE
--     -------------------------------------------------
--     La photographie, elle, vit à un chemin convenu dans le compartiment
--     (`accueil/bandeau.jpg`), et c'est ce qui la rend remplaçable sans toucher
--     au code. Ranger le **titre** au même endroit aurait été plus court d'un
--     collage — mais un titre n'est pas un fichier. Cela aurait aussi demandé une
--     seconde branche dans la politique du compartiment, c'est-à-dire une
--     réécriture de la seule politique qui ouvre les documents aux familles
--     **sans compte** : une faute d'une ligne y aurait vidé l'accueil, la
--     cantine et les actualités de tous les visiteurs. Un `create table` ne peut
--     rien casser de ce qui existe.
--
--  2. **Le retrait d'un message de famille.** Les deux tables de conversation
--     n'ont **aucune politique** : c'est délibéré, et c'est écrit dans
--     `SECURITY.md` — le seul accès passe par des fonctions `security definer`
--     qui vérifient `is_super_admin()`. Un `delete` direct depuis le tableau de
--     bord n'aurait donc **aucune politique à qui s'adresser** : il ne serait pas
--     refusé, il ne trouverait rien. Le retrait passe donc par une fonction, comme
--     la réponse et le rangement.
--
--  CE QU'ELLE NE FAIT PAS
--  ----------------------
--  Elle ne touche à aucune politique existante, à aucune table existante, et à
--  aucune donnée existante. Elle ajoute une table, deux lignes, une fonction et
--  quatre politiques — et rien d'autre. Elle se rejoue sans dommage.
--
--  Le décompte a été **mesuré**, pas compté de mémoire : il disait « cinq
--  politiques », et le fichier en crée quatre. Une phrase en toutes lettres
--  affirme une exhaustivité ; celle-ci était fausse, et rien ne le disait.
--
--  L'ORDRE
--  -------
--  Elle ne dépend que de `public.is_super_admin()`, qui vient de la **sixième**
--  migration. Elle se colle donc après `20260921150000_super_admin.sql`, en
--  dernier.

-- =============================================================================
--  1. Les réglages : ce que le bureau écrit et que tout le monde lit
-- =============================================================================
--  UNE TABLE CLÉ/VALEUR, ET POURQUOI PAS UNE COLONNE PAR RÉGLAGE
--  -------------------------------------------------------------
--  Un réglage de plus aurait demandé une migration de plus. La table est
--  générique parce que la **liste** des réglages bougera, pas leur forme : ce
--  sont des textes courts, publiés par le bureau, lus par tous.
--
--  Ce qu'elle n'est pas : un endroit où ranger de la configuration technique. Un
--  chemin de compartiment, une clé d'envoi, un seuil n'ont rien à y faire — ils
--  se lisent dans le code, et une valeur qui décide du comportement d'un programme
--  ne doit pas pouvoir être changée depuis une page web.

create table if not exists public.reglages (
  cle        text primary key,
  valeur     text not null,
  updated_at timestamptz not null default now(),

  --  La clé est un identifiant de programme : minuscules, chiffres, souligné.
  --  Une clé accentuée ou espacée serait écrite une fois avec une espace et
  --  relue avec un souligné, et le réglage disparaîtrait sans rien dire — le
  --  repli de l'application prendrait sa place, ce qui est exactement le genre de
  --  panne qu'on ne voit pas.
  constraint reglages_cle_forme check (cle ~ '^[a-z][a-z0-9_]{2,40}$'),

  --  Une borne franche : ce sont des titres, pas des paragraphes. Cent soixante
  --  caractères tiennent sur trois lignes d'un écran de téléphone ; au-delà, le
  --  bandeau déborderait de sa hauteur fixe et le texte passerait sous la
  --  photographie.
  constraint reglages_valeur_longueur check (char_length(valeur) between 1 and 160)
);

comment on table public.reglages is
  'Textes publiés par le bureau et affichés par l''application — le titre et la devise du bandeau d''accueil. Lisibles par tous, écrits par le super administrateur.';

comment on column public.reglages.cle is
  'Identifiant du réglage, lu par l''application : minuscules, chiffres et soulignés.';

comment on column public.reglages.valeur is
  'Le texte affiché, tel quel. Une clé absente fait retomber l''application sur son texte par défaut.';

--  LES DEUX VALEURS DE DÉPART SONT ÉCRITES ICI, ET CE N'EST PAS UNE VÉRITÉ RECOPIÉE
--  --------------------------------------------------------------------------------
--  L'application porte le même texte en repli, et les deux **peuvent** diverger
--  sans que rien ne soit faux : ce n'est pas une vérité recopiée, c'est une
--  **valeur initiale** d'un côté et un **repli de dépannage** de l'autre. Le
--  bureau qui change le titre fait diverger les deux, et c'est le but.
--
--  `on conflict do nothing` : la migration se rejoue, et **ne rend pas** au
--  bureau le titre qu'il a choisi. Un `insert` qui écrase ferait disparaître un
--  titre dès qu'on recolle le fichier — la panne la plus sournoise, parce qu'elle
--  est provoquée par le geste même qui est censé ne rien changer.
insert into public.reglages (cle, valeur) values
  ('bandeau_titre',  'École Frères Lumières'),
  ('bandeau_devise', 'Grandir · Apprendre · S''épanouir ensemble')
on conflict (cle) do nothing;

alter table public.reglages enable row level security;

--  La lecture est **publique**, et c'est la raison d'être de la table : un
--  visiteur sans compte doit lire le titre du bandeau, comme il lit les
--  actualités. Les deux rôles sont nommés dans une seule politique, et non
--  « anon » seul : une politique `to anon` ne couvre pas le membre connecté, qui
--  se verrait alors refuser la lecture d'un texte qu'il lit aujourd'hui.
drop policy if exists reglages_select_public on public.reglages;
create policy reglages_select_public
  on public.reglages for select
  to anon, authenticated
  using (true);

--  L'écriture est réservée au **bureau**, opération par opération. Trois
--  politiques plutôt qu'un `for all` : un `for all` porte aussi la lecture, et
--  un prochain lecteur croirait que c'est lui qui l'ouvre.
--
--  `is_admin()` et non `is_super_admin()`, et c'est la même règle que partout
--  ailleurs sur cette page : le titre vit à côté de la photographie de l'école,
--  dans la rubrique « Accueil », que le bureau entier gère. Réserver l'un des
--  deux gestes au super administrateur aurait produit une page dont une moitié
--  refuse sans le dire — la forme exacte d'un écran qu'on croit cassé.
drop policy if exists reglages_insert_bureau on public.reglages;
create policy reglages_insert_bureau
  on public.reglages for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists reglages_update_bureau on public.reglages;
create policy reglages_update_bureau
  on public.reglages for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists reglages_delete_bureau on public.reglages;
create policy reglages_delete_bureau
  on public.reglages for delete
  to authenticated
  using (public.is_admin());

--  Le privilège de lecture est accordé explicitement au rôle anonyme : sans lui,
--  la politique ci-dessus ne serait jamais atteinte, et le refus arriverait du
--  `grant` — donc sous forme de `permission denied`, que l'application traduit
--  par « vous n'avez pas les droits nécessaires ». C'est la distinction que le
--  projet tient partout : un refus de privilège se voit, une politique qui filtre
--  rend une **liste vide** et ne se voit pas.
grant select on public.reglages to anon;
grant select on public.reglages to authenticated;


-- =============================================================================
--  2. Retirer un message qu'une famille a écrit dans une conversation
-- =============================================================================
--  POURQUOI UNE FONCTION, ET NON UN `delete`
--  -----------------------------------------
--  `public.conversation_messages` n'a aucune politique : aucun rôle ne peut y
--  écrire directement. Ce n'est pas un oubli, c'est le dispositif — le fil d'un
--  parent n'est atteignable que par des fonctions qui vérifient le droit dans
--  leur corps. Un `delete` écrit dans une action serveur échouerait sur un
--  privilège, ou pire, réussirait sur zéro ligne.
--
--  POURQUOI SEULEMENT LES MESSAGES DES FAMILLES
--  --------------------------------------------
--  Le bureau demande à pouvoir retirer ce qu'une famille a écrit — un message
--  déplacé, une information personnelle déposée là par erreur. Sa **propre**
--  réponse n'est pas visée, et la refuser ici est un choix, pas une lacune : une
--  réponse du bureau est ce que le parent a déjà lu, et la retirer après coup
--  laisserait dans son fil une question sans réponse qu'il ne pourrait pas
--  expliquer. Le bouton n'est donc pas proposé pour ces messages, et la fonction
--  les refuse même si on l'appelle autrement.
--
--  LE MESSAGE EST RELU AVANT D'ÊTRE RETIRÉ
--  ---------------------------------------
--  Un identifiant forgé vers une ligne inexistante produirait sinon un succès :
--  `delete` ne trouve rien, ne se plaint pas, et l'écran annonce un retrait qui
--  n'a pas eu lieu — le défaut le plus coûteux d'un écran de modération, puisque
--  le message problématique est toujours là et que le bureau le croit parti.

create or replace function public.supprimer_message_conversation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from_bureau boolean;
begin
  if not public.is_super_admin() then
    raise exception 'Réservé au super administrateur.' using errcode = '42501';
  end if;

  select m.from_bureau
    into v_from_bureau
    from public.conversation_messages m
   where m.id = p_id;

  if not found then
    raise exception 'Ce message est introuvable.' using errcode = '22023';
  end if;

  if v_from_bureau then
    raise exception 'Une réponse du bureau ne se retire pas.' using errcode = '42501';
  end if;

  delete from public.conversation_messages where id = p_id;

  --  `conversations.updated_at` n'est **pas** touché : la liste des fils est
  --  triée par dernière activité, et un retrait n'est pas une activité. Le
  --  déplacer en tête de liste ferait croire à un message nouveau.
end;
$$;

comment on function public.supprimer_message_conversation(uuid) is
  'Retire un message écrit par une famille dans une conversation. Refuse un message du bureau. Réservée au super administrateur.';

revoke all on function public.supprimer_message_conversation(uuid) from public;
grant execute on function public.supprimer_message_conversation(uuid) to authenticated;
