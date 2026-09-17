-- =============================================================================
--  Jeu de données d'essai — à n'appliquer QU'EN développement
-- =============================================================================
--
--  Application :
--      npx supabase db reset          (rejoue migrations + seed)
--  ou, ponctuellement, en collant ce fichier dans l'éditeur SQL.
--
--  NE PAS APPLIQUER EN PRODUCTION : ces lignes sont visibles par tous les
--  adhérents connectés, et les menus de cantine fictifs seraient pris pour de
--  vrais menus.
--
--  Les insertions sont idempotentes : on peut relancer ce fichier sans créer
--  de doublons.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  Annonces
-- -----------------------------------------------------------------------------
--  `author_id` reste nul : aucune donnée d'essai ne doit dépendre d'un compte
--  réel, et la colonne est précisément nullable pour ce cas.
insert into public.annonces (title, body, published_at)
select v.title, v.body, v.published_at
from (
  values
    (
      'Réunion du bureau — jeudi 24 septembre',
      'La prochaine réunion du bureau se tiendra à 20 h dans la salle polyvalente. '
        || 'Ordre du jour : budget de la cantine, projet de sortie de fin d''année, '
        || 'questions diverses. Les adhérents sont bienvenus.',
      now() - interval '2 days'
    ),
    (
      'Inscriptions à la cantine : nouvelles modalités',
      'Les réservations se font désormais depuis cette application, onglet Cantine, '
        || 'au plus tard le mercredi pour la semaine suivante.',
      now() - interval '9 days'
    )
) as v (title, body, published_at)
where not exists (select 1 from public.annonces);


-- -----------------------------------------------------------------------------
--  Menus de cantine
-- -----------------------------------------------------------------------------
--  Construits à partir de `current_date` : ils restent « à venir » quelle que
--  soit la date à laquelle on rejoue le fichier, ce qui évite une liste
--  d'essai vide parce que les dates codées en dur sont dépassées.
insert into public.cantine_menus (service_date, starter, main_course, dessert, notes)
values
  (current_date,               'Salade de tomates',    'Rôti de dinde, haricots verts', 'Compote de pommes', null),
  (current_date + 1,           'Carottes râpées',      'Poisson pané, riz',             'Yaourt nature',     null),
  (current_date + 2,           'Concombre vinaigrette','Bœuf bourguignon, purée',       'Tarte aux pommes',  null),
  (current_date + 3,           'Betteraves',           'Gratin de courgettes, jambon',  'Fruit de saison',   null),
  (current_date + 4,           'Salade verte',         'Poulet rôti, semoule',          'Flan vanille',      null),
  (current_date + 7,           'Tomates mozzarella',   'Lasagnes végétariennes',        'Mousse au chocolat', 'Plat sans viande'),
  (current_date + 8,           'Radis beurre',         'Filet de colin, ratatouille',   'Compote',           null),
  (current_date + 9,           'Salade de lentilles',  'Escalope de veau, gratin',      'Riz au lait',       null)
on conflict (service_date) do nothing;


-- -----------------------------------------------------------------------------
--  Message de discussion
-- -----------------------------------------------------------------------------
--  Sans auteur, l'insertion est impossible : `author_id` est obligatoire et
--  référence `profiles`. On crée donc le message à partir du premier profil
--  existant, et seulement s'il y en a un — sinon le fichier reste silencieux
--  plutôt que d'échouer, ce qui est le comportement attendu d'un seed joué
--  avant toute inscription.
insert into public.discussion_messages (author_id, body)
select p.id, 'Bienvenue sur la discussion des adhérents.'
from public.profiles p
where not exists (select 1 from public.discussion_messages)
order by p.created_at
limit 1;
