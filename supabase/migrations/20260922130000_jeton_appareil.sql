-- =============================================================================
--  Le jeton d'un appareil : ce que la modification ne pouvait pas faire
-- =============================================================================
--
--  CE QUI ÉTAIT ÉCRIT, ET CE QUI N'ARRIVAIT PAS
--  --------------------------------------------
--  `enregistrerAppareil` — dans l'application mobile — modifie d'abord la ligne
--  de l'appareil, puis insère, et le **doublon** de l'insertion devait prouver
--  que la modification avait suffi. Elle ne suffisait pas.
--
--  `push_tokens_update_device` autorisait bien la modification (`using (true)`),
--  mais une clause `WHERE` qui lit une colonne exige, **en plus**, que la ligne
--  soit lisible : PostgreSQL applique alors les politiques de `select` en plus
--  de celles de `update`. `push_tokens` n'a aucune politique de lecture pour
--  `anon` — et ne doit pas en avoir. L'écriture touchait donc **zéro ligne,
--  sans erreur** : le client lisait `error = null` et croyait avoir rafraîchi.
--
--  Mesuré sur une base d'essai, le 21 septembre 2026, sous le rôle `anon` :
--
--    update … set platform = 'android'                    -> 1 ligne
--    update … set platform = 'android' where token = '…'  -> 0 ligne, sans erreur
--    update … set platform = 'android' where true         -> 1 ligne
--    la même, avec une politique de lecture ouverte       -> 1 ligne
--
--  La troisième ligne explique la deuxième : une clause qui ne lit **aucune**
--  colonne ne déclenche pas la lecture. La quatrième nomme le remède — et il est
--  refusé, car ouvrir la lecture de `push_tokens` rendrait publics les jetons de
--  tous les appareils.
--
--  La conséquence était celle que la politique prétendait éviter : `last_seen_at`
--  restait figé à la première installation, et l'écran du bureau — qui trie
--  dessus — annonçait comme « plus récent » un appareil vu des mois plus tôt.
--
--  CE QUE CETTE MIGRATION CHANGE
--  -----------------------------
--  1. elle **retire** `push_tokens_update_device`. Inerte pour une modification
--     filtrée — le seul usage que l'application en ait jamais fait —, elle
--     ouvrait en revanche `update` **sans filtre** : un `PATCH` sans condition
--     modifiait toutes les lignes. Aucun appel légitime ne fait cela.
--  2. elle ajoute `enregistrer_jeton`, une fonction `security definer` qui
--     enregistre **et** rafraîchit en une seule opération, avec les droits du
--     propriétaire — donc sans jamais dépendre d'une politique de lecture.
--
--  C'est l'idiome déjà employé pour les conversations : la table reste fermée,
--  et c'est la fonction qui porte le geste.
--
--  CE QU'ELLE NE RETIRE PAS, ET POURQUOI
--  -------------------------------------
--  Les privilèges `insert, update` restent accordés à `anon` et
--  `authenticated`. Une version **déjà installée** de l'application lit le refus
--  d'une modification comme une erreur (`if (erreurDeMaj !== null) throw`), et le
--  geste « Activer les notifications » afficherait un échec à un parent dont
--  l'appareil est pourtant enregistré. Sans politique de modification, le
--  privilège ne laisse rien passer : il pourra être retiré le jour où plus aucun
--  appareil ne portera l'ancien client.
--
--  Elle se rejoue sans dommage : `drop policy if exists` et
--  `create or replace function`.

drop policy if exists push_tokens_update_device on public.push_tokens;

--  Aucune borne n'est recopiée ici : la longueur du jeton et la liste des
--  plateformes sont tenues par les contraintes de la table, qui s'appliquent
--  aussi à une fonction `security definer`. Les réécrire serait une seconde
--  copie de la même vérité, et c'est exactement ce que ce dépôt refuse.
create or replace function public.enregistrer_jeton(p_token text, p_platform text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.push_tokens (token, platform, last_seen_at)
  values (p_token, p_platform, now())
  on conflict (token) do update
    set platform = excluded.platform,
        last_seen_at = now();
$$;

revoke all on function public.enregistrer_jeton(text, text) from public;
grant execute on function public.enregistrer_jeton(text, text) to anon, authenticated;
