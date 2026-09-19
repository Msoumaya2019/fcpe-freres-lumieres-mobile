/** Sondages — les questions posées aux adhérents, et leur vote. */

import { requireSupabase } from '@/config/supabase';
import { toAppError } from '@/errors';
import type { Sondage, SondageChoice, SondageWithChoices } from '@/types/models';

const MAX_SONDAGES = 50;

/** Un vote ne se pose que sur un sondage ouvert, et une seule fois. */
export interface NewVote {
  readonly sondageId: string;
  readonly choiceId: string;
  readonly voterId: string;
}

function estOuvert(sondage: Sondage, maintenant: number): boolean {
  if (!sondage.is_open) {
    return false;
  }

  return sondage.closed_at === null || Date.parse(sondage.closed_at) > maintenant;
}

/**
 * Sondages, leurs réponses, et le vote de l'adhérent.
 *
 * TROIS REQUÊTES, ET POURQUOI PAS UNE
 * -----------------------------------
 * Le typage des relations imbriquées de PostgREST dépend des métadonnées de
 * clés étrangères que la plateforme renvoie ; une erreur à cet endroit ne se
 * voit qu'à l'exécution. Trois requêtes simples restent vérifiables à la
 * compilation, et c'est le choix déjà fait pour les auteurs de messages.
 *
 * La troisième — les votes de l'adhérent — est filtrée sur `voter_id` côté
 * client. La politique RLS le fait déjà ; le filtre évite de transférer pour
 * rien les votes des autres, qui ne franchiraient de toute façon pas la
 * politique. Une requête qui ne dépend que d'une des deux protections casse le
 * jour où l'autre évolue.
 */
export async function fetchSondages(
  voterId: string,
  limit: number = MAX_SONDAGES,
): Promise<SondageWithChoices[]> {
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

  const { data: votes, error: erreurVotes } = await client
    .from('sondage_votes')
    .select('*')
    .eq('voter_id', voterId)
    .in('sondage_id', ids);

  if (erreurVotes !== null) {
    throw toAppError(erreurVotes);
  }

  const choixParSondage = new Map<string, SondageChoice[]>();
  for (const ligne of choix) {
    const liste = choixParSondage.get(ligne.sondage_id) ?? [];
    liste.push(ligne);
    choixParSondage.set(ligne.sondage_id, liste);
  }

  const monVote = new Map<string, string>();
  for (const vote of votes) {
    monVote.set(vote.sondage_id, vote.choice_id);
  }

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
 * appartient à l'appelant **et** que le sondage est ouvert. Ce contrôle-ci ne
 * la remplace pas : il évite un aller-retour voué à l'échec, et il permet à
 * l'écran de dire pourquoi. Un client modifié se heurte de toute façon à la
 * politique.
 *
 * Un second vote sur le même sondage échoue sur la contrainte d'unicité
 * `(sondage_id, voter_id)`, ce qui est le comportement voulu : l'écran ne
 * propose le vote que sur un sondage où `myChoiceId` est nul.
 */
export async function castVote(input: NewVote): Promise<void> {
  const { error } = await requireSupabase().from('sondage_votes').insert({
    sondage_id: input.sondageId,
    choice_id: input.choiceId,
    voter_id: input.voterId,
  });

  if (error !== null) {
    throw toAppError(error);
  }
}
