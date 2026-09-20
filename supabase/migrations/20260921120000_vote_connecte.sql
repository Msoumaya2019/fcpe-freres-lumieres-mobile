-- =============================================================================
--  Le vote d'un membre connecté
-- =============================================================================
--
--  POURQUOI CE FICHIER
--  -------------------
--  La politique d'insertion des votes était déclarée `to anon` : elle ne
--  s'appliquait qu'aux visiteurs **sans compte**. Or RLS refuse par défaut, et
--  il n'existait aucune autre politique d'insertion sur `sondage_votes` : un
--  membre connecté n'avait donc **aucun** chemin d'écriture, et son vote était
--  refusé quelle que soit la réponse qu'il donnait.
--
--  Mesuré, et signalé : « vous n'avez pas les droits nécessaires pour cette
--  action ». Le refus ne venait pas du sondage, ni de la réponse choisie, ni de
--  l'application — il venait du rôle sous lequel la requête arrivait.
--
--  Le cas n'était pas visible au banc : l'application se lit sans compte, et
--  c'est le rôle `anon` que les essais exerçaient. Le seul compte existant est
--  celui du bureau, et c'est précisément lui qui votait.
--
--  CE QUE CE FICHIER FAIT
--  ----------------------
--  Il élargit la politique existante au rôle `authenticated`, **sans changer sa
--  condition** : la même, mot pour mot. C'est délibéré — l'application n'écrit
--  qu'un vote d'appareil, connectée ou non : elle envoie `voter_key` et jamais
--  `voter_id` (`src/services/sondages.ts`, `castVote`). Écrire ici une seconde
--  branche pour le vote de compte ajouterait une condition que **rien
--  n'exerce** — et un garde-fou que rien n'exerce n'existe pas.
--
--  Il accorde aussi le privilège d'insertion au rôle `authenticated`. Ce n'est
--  pas une précaution : le privilège venait jusqu'ici des droits par défaut du
--  schéma, réglés dans le tableau de bord Supabase et donc **invisibles depuis
--  ce dépôt**. L'écrire ici rend la dépendance vérifiable.
--
--  CE QU'IL NE CHANGE PAS
--  ----------------------
--  Aucune politique de **lecture** n'est ajoutée : personne ne lit les votes par
--  la table. Le décompte passe par `resultats_sondage()`, qui rend des compteurs
--  par réponse et jamais une ligne de votant.
--
--  La limitation reste celle de l'appareil, pas de la personne : `voter_key` se
--  réinstalle, et une application modifiée peut en inventer une autre. Le vote
--  d'appareil décourage le vote répété depuis un même téléphone, sans prétendre
--  à davantage. La contrainte d'unicité `(sondage_id, voter_key)` est partielle,
--  et c'est ce qui laisse les votes de compte — `voter_key` à `null` — hors de
--  son périmètre.
--
--  REJOUABLE
--  ---------
--  Le fichier remplace la politique au lieu d'en ajouter une seconde : le
--  recoller ne crée pas de doublon, et ne laisse pas deux politiques concurrentes
--  sur la même commande — PostgreSQL les aurait combinées avec `or`, et le refus
--  qu'on vient de corriger aurait pu disparaître sans qu'on sache pourquoi.

-- -----------------------------------------------------------------------------
--  1. La politique d'insertion, étendue au membre connecté
-- -----------------------------------------------------------------------------

drop policy if exists sondage_votes_insert_public on public.sondage_votes;
create policy sondage_votes_insert_public
  on public.sondage_votes for insert
  to anon, authenticated
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


-- -----------------------------------------------------------------------------
--  2. Le privilège, écrit plutôt que supposé
-- -----------------------------------------------------------------------------

grant insert on public.sondage_votes to authenticated;
