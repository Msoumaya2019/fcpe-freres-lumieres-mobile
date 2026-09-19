/**
 * Messages adressés au bureau — lus et écrits par leur seul auteur.
 *
 * NE PAS CONFONDRE AVEC LA DISCUSSION
 * -----------------------------------
 * La discussion est un fil **entre adhérents**, ouvert à tous les membres : ce
 * qu'on y écrit est lu par les autres. Le contact est un message **au bureau**,
 * dont personne d'autre que son auteur et le bureau ne connaît l'existence.
 *
 * Les deux fonctionnalités se ressemblent à l'écran — un champ, un bouton — et
 * leurs politiques sont opposées : `discussion_messages` se lit par tout porteur
 * d'un jeton, `messages` se lit par son auteur seul. Les fusionner reviendrait à
 * publier au vu de tous ce qu'un parent croyait confier.
 */

import { requireSupabase } from '@/config/supabase';
import { toAppError } from '@/errors';
import type { MemberMessage, MessageCategory } from '@/types/models';

const MAX_MESSAGES = 100;

export interface NewMessage {
  readonly authorId: string;
  readonly category: MessageCategory;
  readonly subject: string;
  readonly body: string;
  /** Facultatif : la réponse peut être demandée à une autre adresse. */
  readonly replyTo: string | null;
}

/** Messages de l'adhérent, du plus récent au plus ancien. */
export async function fetchMyMessages(
  authorId: string,
  limit: number = MAX_MESSAGES,
): Promise<MemberMessage[]> {
  const { data, error } = await requireSupabase()
    .from('messages')
    .select('*')
    .eq('author_id', authorId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error !== null) {
    throw toAppError(error);
  }

  return data;
}

/**
 * Déposer un message pour le bureau.
 *
 * `reply_to` est normalisé ici, et pas seulement en base : une chaîne vide est
 * convertie en `null` avant l'envoi. Sans cela, un champ laissé vide
 * transmettrait `''`, que la contrainte de format refuserait — et l'adhérent
 * verrait un refus pour un champ qu'il n'a pas rempli.
 */
export async function createMessage(input: NewMessage): Promise<void> {
  const replyTo = input.replyTo === null ? '' : input.replyTo.trim();

  const { error } = await requireSupabase()
    .from('messages')
    .insert({
      author_id: input.authorId,
      category: input.category,
      subject: input.subject.trim(),
      body: input.body.trim(),
      reply_to: replyTo === '' ? null : replyTo,
    });

  if (error !== null) {
    throw toAppError(error);
  }
}
