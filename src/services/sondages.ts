/**
 * Sondages — les questions posées aux familles, et le vote d'un appareil.
 *
 * CE QUI A CHANGÉ, ET POURQUOI
 * ----------------------------
 * Un sondage demandait un compte : le vote se rattachait à `auth.uid()`, et la
 * contrainte d'unicité `(sondage_id, voter_id)` garantissait « un vote par
 * adhérent ». C'était solide, et cela excluait la majorité des familles — celles
 * qui consultent l'application sans jamais créer de compte.
 *
 * Le vote se rattache donc désormais à une **clé d'appareil**, tirée par la base
 * (`cle_appareil()`) à la première demande et gardée dans les préférences
 * locales. La contrainte d'unicité porte sur `(sondage_id, voter_key)`.
 *
 * CE QUE CETTE LIMITE VAUT, ET CE QU'ELLE NE VAUT PAS
 * ---------------------------------------------------
 * Elle rend un second vote difficile **sur le même appareil**. Elle ne garantit
 * pas « une personne, un vote » : réinstaller l'application donne une nouvelle
 * clé, et aucun identifiant d'appareil ne peut empêcher cela. C'est écrit ici
 * pour ne pas être pris pour une garantie, et l'écran le dit en une phrase.
 */

import {
  CLE_APPAREIL,
  cleVoteSondage,
  ecrirePreference,
  lirePreference,
} from '@/config/preferences';
import { requireSupabase } from '@/config/supabase';
import { toAppError } from '@/errors';
import type { Sondage, SondageChoice, SondageResultat, SondageWithChoices } from '@/types/models';

const MAX_SONDAGES = 50;

/** Un vote ne se pose que sur un sondage ouvert, et une seule fois. */
export interface NewVote {
  readonly sondageId: string;
  readonly choiceId: string;
}

function estOuvert(sondage: Sondage, maintenant: number): boolean {
  if (!sondage.is_open) {
    return false;
  }

  return sondage.closed_at === null || Date.parse(sondage.closed_at) > maintenant;
}

/**
 * La clé de cet appareil, tirée par la base la première fois.
 *
 * Le tirage est fait par PostgreSQL, et non par le téléphone : React Native
 * n'expose aucun générateur aléatoire cryptographique, et `Math.random()` n'en
 * est pas un. Le résultat est gardé ici, et n'est **pas** un secret — il ne
 * donne accès à rien.
 */
export async function cleAppareil(): Promise<string> {
  const connue = await lirePreference(CLE_APPAREIL);

  if (connue !== null) {
    return connue;
  }

  const { data, error } = await requireSupabase().rpc('cle_appareil');

  if (error !== null) {
    throw toAppError(error);
  }

  await ecrirePreference(CLE_APPAREIL, data);

  return data;
}

/**
 * Sondages, leurs réponses, et le vote de cet appareil.
 *
 * DEUX REQUÊTES, ET UNE LECTURE LOCALE
 * ------------------------------------
 * Les sondages et leurs réponses se lisent en base — les politiques publiques
 * les ouvrent en lecture. Le vote, lui, ne se relit plus en base : la politique
 * qui l'autorisait comparait `voter_id` à `auth.uid()`, deux valeurs nulles pour
 * un vote d'appareil. Il est donc relu dans les préférences locales, où
 * `castVote` l'a écrit.
 *
 * Ce découpage a un défaut, et il est assumé : une application réinstallée perd
 * la trace et repropose de voter. Le serveur, lui, refusera le doublon **si la
 * clé d'appareil a survécu** — ce qui n'est pas le cas d'une réinstallation. La
 * limite est donc celle de la clé, pas celle de la relecture.
 */
export async function fetchSondages(limit: number = MAX_SONDAGES): Promise<SondageWithChoices[]> {
  const client = requireSupabase();

  const { data: sondages, error: erreurSondages } = await client
    .from('sondages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (erreurSondages !== null) {
    throw toAppError(erreurSondages);
  }

  if (sondages.length === 0) {
    return [];
  }

  const ids = sondages.map((sondage) => sondage.id);

  const { data: choix, error: erreurChoix } = await client
    .from('sondage_choices')
    .select('*')
    .in('sondage_id', ids)
    .order('position', { ascending: true });

  if (erreurChoix !== null) {
    throw toAppError(erreurChoix);
  }

  const choixParSondage = new Map<string, SondageChoice[]>();
  for (const ligne of choix) {
    const liste = choixParSondage.get(ligne.sondage_id) ?? [];
    liste.push(ligne);
    choixParSondage.set(ligne.sondage_id, liste);
  }

  const mesVotes = await Promise.all(
    sondages.map(async (sondage) => [sondage.id, await lirePreference(cleVoteSondage(sondage.id))]),
  );
  const monVote = new Map(mesVotes.map(([id, choixId]) => [id as string, choixId]));

  return sondages.map((sondage) => ({
    ...sondage,
    choices: choixParSondage.get(sondage.id) ?? [],
    myChoiceId: monVote.get(sondage.id) ?? null,
  }));
}

/** Le premier sondage encore ouvert, s'il y en a un. */
export function sondageOuvert(
  sondages: readonly SondageWithChoices[],
  maintenant: number = Date.now(),
): SondageWithChoices | null {
  return sondages.find((sondage) => estOuvert(sondage, maintenant)) ?? null;
}

/**
 * Déposer un vote.
 *
 * La politique d'insertion de `sondage_votes` revérifie, en base, que le vote
 * vient d'un appareil **et** que le sondage est ouvert. Ce contrôle-ci ne la
 * remplace pas : il évite un aller-retour voué à l'échec.
 *
 * La trace locale est écrite **après** le succès du serveur, et jamais avant :
 * l'écrire d'abord afficherait « votre réponse est enregistrée » pour un vote
 * que la base aurait refusé. Et si l'écriture locale échouait à son tour, le
 * pire qui arriverait est que l'écran repropose de voter — le serveur, lui,
 * refuserait le doublon.
 */
export async function castVote(input: NewVote): Promise<void> {
  const voterKey = await cleAppareil();

  const { error } = await requireSupabase().from('sondage_votes').insert({
    sondage_id: input.sondageId,
    choice_id: input.choiceId,
    voter_key: voterKey,
  });

  if (error !== null) {
    throw toAppError(error);
  }

  await ecrirePreference(cleVoteSondage(input.sondageId), input.choiceId);
}

/**
 * Le décompte des voix d'un sondage.
 *
 * Il passe par `resultats_sondage()`, et non par la table : la fonction rend des
 * compteurs par réponse, jamais une ligne de vote. Le nom d'un votant ne sort
 * donc pas de la base — ce qui est la condition pour afficher un résultat.
 */
export async function fetchResultats(sondageId: string): Promise<SondageResultat[]> {
  const { data, error } = await requireSupabase().rpc('resultats_sondage', {
    p_sondage_id: sondageId,
  });

  if (error !== null) {
    throw toAppError(error);
  }

  return data;
}
