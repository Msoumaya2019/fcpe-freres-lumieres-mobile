/**
 * Conversations privées entre un parent et le bureau.
 *
 * POURQUOI CE FICHIER EXISTE, ET CE QU'IL N'EST PAS
 * -------------------------------------------------
 * L'ancien « Contact » écrivait dans `messages`, une table dont l'auteur est une
 * ligne de `auth.users` : il fallait donc un compte, et le parent sans compte ne
 * pouvait pas écrire. Il ne pouvait pas non plus **recevoir de réponse**, faute
 * d'endroit où la lui adresser.
 *
 * Une conversation, elle, n'appartient à aucun compte. Elle est identifiée par
 * un numéro et protégée par un **secret**, tous deux tirés par la base
 * (`creer_conversation()`), et le secret n'est rendu qu'une fois — à la
 * création. Le téléphone le garde, et c'est ce qui rouvre le fil.
 *
 * LE NUMÉRO NE DONNE ACCÈS À RIEN
 * -------------------------------
 * C'est la propriété centrale : `lire_conversation()` compare l'empreinte du
 * secret à celle qui est en base, et un mauvais secret rend **la même chose**
 * qu'un identifiant inconnu — aucune ligne. Connaître le numéro d'une
 * conversation ne permet donc pas d'en lire le contenu, et il n'y a rien à
 * énumérer.
 *
 * CE QUE LE PARENT DOIT SAVOIR
 * ----------------------------
 * Le secret ne vit que sur son téléphone. Le perdre — réinstallation, changement
 * d'appareil —, c'est perdre l'accès au fil. L'écran le dit, et l'application
 * n'a aucun moyen de le lui rendre : c'est le prix d'un accès sans compte.
 */

import { cleConversation, ecrirePreference, lirePreference } from '@/config/preferences';
import { requireSupabase } from '@/config/supabase';
import { toAppError } from '@/errors';
import type { ConversationMessage, ConversationStatus, MessageCategory } from '@/types/models';

/** Un fil tel que l'appareil le retient : de quoi rouvrir et reconnaître. */
export interface FilLocal {
  readonly id: string;
  readonly secret: string;
  readonly subject: string;
  readonly creeLe: string;
}

/**
 * Ce qu'un parent écrit pour ouvrir un fil.
 *
 * POURQUOI IL N'Y A PLUS DE CATÉGORIE
 * -----------------------------------
 * Le formulaire demandait au parent de choisir un **sujet** — cantine,
 * transport, vie scolaire… —, et le bureau a demandé qu'on le lui retire : trois
 * champs suffisent, et un choix de plus est une question de plus. La décision est
 * prise ici aussi, et pas seulement à l'écran : la catégorie n'est plus une
 * donnée que le parent fournit, donc elle n'est plus un paramètre de ce type.
 *
 * Ce que la base reçoit à la place est dit par `CATEGORIE_NON_PRECISEE`.
 */
export interface NouvelleConversation {
  readonly subject: string;
  readonly body: string;
  /** Facultatif : une adresse où le bureau peut répondre hors application. */
  readonly replyTo: string | null;
}

/**
 * Ce que l'application envoie pour une conversation ouverte depuis le contact.
 *
 * POURQUOI `'autre'`, ET POURQUOI IL EST NOMMÉ
 * -------------------------------------------
 * `creer_conversation` **exige** une catégorie : PostgREST résout une fonction
 * par ses arguments, donc l'omettre rendrait `PGRST202` — « aucune fonction de ce
 * nom ». Mais ce que la fonction fait d'un `null` est écrit dans la première
 * migration : `coalesce(p_category, 'autre')`. `'autre'` est donc la valeur que
 * la base donne elle-même à « non précisé », et c'est celle-ci que l'application
 * envoie — nommée, commentée, et vérifiée par le compilateur plutôt qu'écrite au
 * fond d'un appel.
 *
 * Ce que le retrait change pour la lecture : plus aucun écran n'affiche de
 * catégorie sous une conversation. Le libellé qui restait dans les listes aurait
 * dit « Autre » sous chaque message — une catégorie que personne n'a choisie,
 * affichée comme si quelqu'un l'avait fait.
 */
const CATEGORIE_NON_PRECISEE: MessageCategory = 'autre';

/** Ce que le bureau voit d'un fil, dans sa liste. */
export interface ConversationBureau {
  readonly id: string;
  readonly subject: string;
  readonly category: MessageCategory;
  readonly status: ConversationStatus;
  /**
   * L'adresse laissée par le parent, s'il en a laissé une.
   *
   * Le nom est celui de la colonne, et non une traduction : ces lignes viennent
   * d'une fonction SQL, et renommer ici ferait diverger l'interface du contrat
   * que `lister_conversations()` rend. La correspondance est vérifiée par le
   * compilateur, pas par une relecture.
   */
  readonly reply_to: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly message_count: number;
  readonly last_body: string | null;
}

function estFilLocal(valeur: unknown): valeur is FilLocal {
  if (typeof valeur !== 'object' || valeur === null) {
    return false;
  }

  const fil = valeur as Record<string, unknown>;

  return (
    typeof fil.id === 'string' &&
    typeof fil.secret === 'string' &&
    typeof fil.subject === 'string' &&
    typeof fil.creeLe === 'string'
  );
}

/**
 * Les fils retenus par cet appareil.
 *
 * Le contenu est relu en le **validant** plutôt qu'en le supposant conforme :
 * une préférence est un fichier du téléphone, et une valeur tronquée ou écrite
 * par une version antérieure ferait planter l'écran de contact au démarrage, sur
 * un `JSON.parse` ou un accès à `undefined`. Une entrée illisible est ignorée —
 * au pire, un fil devient inaccessible, ce qui est déjà le cas d'un secret
 * perdu.
 */
export async function listerFils(): Promise<FilLocal[]> {
  const brut = await lirePreference(cleConversation());

  if (brut === null) {
    return [];
  }

  try {
    const analyse: unknown = JSON.parse(brut);

    return Array.isArray(analyse) ? analyse.filter(estFilLocal) : [];
  } catch {
    return [];
  }
}

async function retenirFil(fil: FilLocal): Promise<void> {
  const fils = await listerFils();
  const sansDoublon = fils.filter((existant) => existant.id !== fil.id);

  await ecrirePreference(cleConversation(), JSON.stringify([fil, ...sansDoublon]));
}

/**
 * Ouvrir un fil, et retenir son secret.
 *
 * Le secret n'est rendu **qu'ici** : la base n'en garde qu'une empreinte, et
 * aucune fonction ne le redonne. S'il n'est pas retenu maintenant, le fil est
 * perdu — c'est pourquoi l'écriture locale fait partie de la création, et non
 * d'un enregistrement ultérieur.
 */
export async function creerConversation(input: NouvelleConversation): Promise<FilLocal> {
  const { data, error } = await requireSupabase().rpc('creer_conversation', {
    p_subject: input.subject.trim(),
    p_category: CATEGORIE_NON_PRECISEE,
    p_body: input.body.trim(),
    p_reply_to: input.replyTo === null ? '' : input.replyTo.trim(),
  });

  if (error !== null) {
    throw toAppError(error);
  }

  const ligne = data[0];

  if (ligne === undefined) {
    throw new Error('La conversation n’a pas pu être créée.');
  }

  const fil: FilLocal = {
    id: ligne.conversation_id,
    secret: ligne.conversation_secret,
    subject: input.subject.trim(),
    creeLe: new Date().toISOString(),
  };

  await retenirFil(fil);

  return fil;
}

/** Les messages d'un fil. Une liste vide vaut « secret refusé », jamais « erreur ». */
export async function lireConversation(
  fil: Pick<FilLocal, 'id' | 'secret'>,
): Promise<ConversationMessage[]> {
  const { data, error } = await requireSupabase().rpc('lire_conversation', {
    p_id: fil.id,
    p_secret: fil.secret,
  });

  if (error !== null) {
    throw toAppError(error);
  }

  return data.map((ligne) => ({
    id: ligne.message_id,
    conversation_id: fil.id,
    from_bureau: ligne.from_bureau,
    body: ligne.body,
    created_at: ligne.created_at,
  }));
}

/**
 * Poursuivre un fil.
 *
 * Rend `false` quand le secret ne correspond plus, au lieu de lever : c'est la
 * réponse attendue à un fil fermé ou à un secret périmé, et l'écran doit pouvoir
 * le dire en français plutôt que par un message technique.
 */
export async function repondreConversation(
  fil: Pick<FilLocal, 'id' | 'secret'>,
  body: string,
): Promise<boolean> {
  const { data, error } = await requireSupabase().rpc('repondre_conversation', {
    p_id: fil.id,
    p_secret: fil.secret,
    p_body: body.trim(),
  });

  if (error !== null) {
    throw toAppError(error);
  }

  return data;
}

/**
 * Les fils, vus du bureau.
 *
 * Réservée aux administrateurs, et la fonction le vérifie **dans son corps** :
 * les tables de conversation n'ont aucune politique, donc aucun rôle ne peut les
 * lire directement. Un membre ordinaire qui appellerait cette fonction reçoit
 * « Réservé au bureau. » — un refus explicite, et non une liste vide.
 */
export async function listerConversationsBureau(): Promise<ConversationBureau[]> {
  const { data, error } = await requireSupabase().rpc('lister_conversations');

  if (error !== null) {
    throw toAppError(error);
  }

  return data;
}

export async function lireConversationBureau(id: string): Promise<ConversationMessage[]> {
  const { data, error } = await requireSupabase().rpc('lire_conversation_bureau', { p_id: id });

  if (error !== null) {
    throw toAppError(error);
  }

  return data.map((ligne) => ({
    id: ligne.message_id,
    conversation_id: id,
    from_bureau: ligne.from_bureau,
    body: ligne.body,
    created_at: ligne.created_at,
  }));
}

export async function repondreConversationBureau(id: string, body: string): Promise<void> {
  const { error } = await requireSupabase().rpc('repondre_conversation_bureau', {
    p_id: id,
    p_body: body.trim(),
  });

  if (error !== null) {
    throw toAppError(error);
  }
}
