import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { AsyncFallback } from '@/components/AsyncFallback';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ErrorNotice } from '@/components/ErrorNotice';
import { SectionHeader } from '@/components/SectionHeader';
import { TextField } from '@/components/TextField';
import { userMessage } from '@/errors';
import { useAsyncData } from '@/hooks/useAsyncData';
import {
  fetchCommentaires,
  publierCommentaire,
  type CibleCommentaire,
} from '@/services/commentaires';
import { colors, radius, spacing } from '@/theme';
import type { Commentaire } from '@/types/models';
import { formatRelativeDay } from '@/utils/date';

/**
 * Bornes de saisie, alignées sur les contraintes de la sixième migration.
 *
 * La borne basse — deux caractères — est tenue par la validation du formulaire.
 * La haute ne peut pas l'être autrement : un nom de 61 caractères est refusé par
 * `commentaires_auteur_nom_longueur`, et l'adhérent lirait « La valeur envoyée
 * n'est pas acceptée par le serveur », sans savoir quel champ ni quelle
 * longueur. Ces deux constantes sont vérifiées contre le SQL par
 * `scripts/check-input-limits.test.mjs` : les recopier ici ne suffit pas, il faut
 * qu'elles soient **posées sur les champs**.
 *
 * POURQUOI ELLES VIVENT ICI, ET PLUS DANS UN ÉCRAN
 * ------------------------------------------------
 * Un commentaire se dépose sous une actualité, un sondage ou un jour de cantine.
 * Tant que le formulaire vivait dans l'écran d'une actualité, les deux autres
 * cibles auraient eu le leur — et une seconde copie de ces bornes, que le banc
 * n'aurait pas vue, parce qu'il lit une constante **là où il l'attend**. Un
 * formulaire, un jeu de bornes.
 */
export const MAX_AUTEUR_NOM_LENGTH = 60;
export const MAX_COMMENTAIRE_LENGTH = 1000;

/**
 * Un commentaire publié, tel qu'il s'affiche dans un fil.
 *
 * `voter_key` n'est jamais montrée : c'est une clé d'appareil, elle ne désigne
 * personne, et l'exposer à l'écran la ferait passer pour un identifiant de
 * personne.
 */
export function CarteCommentaire({ commentaire }: { readonly commentaire: Commentaire }) {
  return (
    <Card>
      <View style={styles.tete}>
        <AppText variant="caption" bold style={styles.auteur}>
          {commentaire.auteur_nom}
        </AppText>
        <AppText variant="caption">{formatRelativeDay(commentaire.created_at)}</AppText>
      </View>
      <AppText>{commentaire.corps}</AppText>
    </Card>
  );
}

export interface FormulaireCommentaireProps {
  readonly cible: CibleCommentaire;
  /**
   * Appelée **après** un dépôt réussi.
   *
   * Elle existe parce que le dépôt ne se voit pas tout seul : un commentaire
   * part en validation, donc la relecture ne le fait pas apparaître. C'est la
   * confirmation affichée par ce formulaire qui répond au parent, et cette
   * relecture qui tient la liste à jour pour les commentaires déjà publiés.
   */
  readonly onDepose: () => void;
}

/**
 * Le formulaire de dépôt, avec sa confirmation.
 *
 * Il ne **charge** rien : la liste appartient à l'écran ou au fil qui l'affiche.
 * Un formulaire qui chargerait sa propre liste ferait deux requêtes là où il n'y
 * a qu'une vérité.
 */
export function FormulaireCommentaire({ cible, onDepose }: FormulaireCommentaireProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [auteurNom, setAuteurNom] = useState('');
  const [corps, setCorps] = useState('');
  const [formError, setFormError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const [depose, setDepose] = useState(false);

  const closeForm = useCallback(() => {
    setFormOpen(false);
    setFormError(null);
    setAuteurNom('');
    setCorps('');
  }, []);

  const handleSubmit = useCallback(() => {
    if (auteurNom.trim().length < 2) {
      // `userMessage` marque la phrase comme déjà rédigée pour l'adhérent :
      // sans elle, `appErrorMessage` la prendrait pour un message technique non
      // reconnu et afficherait « Une erreur inattendue est survenue » — en
      // invitant à réessayer, ce qui ne peut pas marcher.
      setFormError(userMessage('Indiquez votre nom, même un prénom.'));
      return;
    }
    if (corps.trim().length < 2) {
      setFormError(userMessage('Écrivez votre commentaire.'));
      return;
    }

    setFormError(null);
    setSubmitting(true);
    setDepose(false);

    void (async () => {
      try {
        await publierCommentaire({ cible, auteurNom, corps });
        closeForm();
        // Le commentaire part en validation : la relecture ne le fera donc pas
        // apparaître, et c'est la confirmation ci-dessous qui répond à la
        // question du parent. Sans elle, l'écran serait **identique** à
        // l'avant-appui, et il conclurait que rien n'a été envoyé.
        setDepose(true);
        // `closeForm()` referme le formulaire : l'action ne peut pas être
        // rejouée pendant la relecture, et `submitting` peut donc être relâché
        // avant son arrivée. C'est la même exception que le formulaire de
        // signalement, et elle tient à la même condition : le bouton disparaît.
        onDepose();
      } catch (caught) {
        setFormError(caught);
      } finally {
        setSubmitting(false);
      }
    })();
  }, [auteurNom, cible, closeForm, corps, onDepose]);

  return (
    <>
      {depose ? (
        <Card muted>
          <View style={styles.confirmation}>
            <Ionicons name="time-outline" size={18} color={colors.success} />
            <AppText variant="caption" style={styles.confirmationTexte}>
              Merci ! Votre commentaire sera publié après validation par le bureau.
            </AppText>
          </View>
        </Card>
      ) : null}

      <Card muted>
        {formOpen ? (
          <>
            <AppText variant="heading">Écrire un commentaire</AppText>
            <AppText variant="caption">
              Votre nom apparaîtra sous votre commentaire. Il sera publié après validation par le
              bureau.
            </AppText>

            <TextField
              label="Votre nom"
              value={auteurNom}
              onChangeText={setAuteurNom}
              placeholder="Prénom, ou nom de famille"
              maxLength={MAX_AUTEUR_NOM_LENGTH}
              editable={!submitting}
            />
            <TextField
              label="Votre commentaire"
              value={corps}
              onChangeText={setCorps}
              placeholder="Partagez votre avis ou une information utile aux familles."
              multiline
              numberOfLines={5}
              maxLength={MAX_COMMENTAIRE_LENGTH}
              editable={!submitting}
              inputStyle={styles.multiligne}
            />

            {formError === null ? null : <ErrorNotice error={formError} />}

            <Button label="Envoyer" onPress={handleSubmit} loading={submitting} />
            <Button label="Annuler" variant="ghost" onPress={closeForm} disabled={submitting} />
          </>
        ) : (
          <>
            <AppText variant="caption">
              Une question, un avis, une précision ? Écrivez-le ici : le bureau le lira avant
              publication.
            </AppText>
            <Button
              label="Écrire un commentaire"
              onPress={() => {
                setDepose(false);
                setFormOpen(true);
              }}
            />
          </>
        )}
      </Card>
    </>
  );
}

/**
 * Un fil de commentaires complet : la liste publiée, puis le formulaire.
 *
 * POURQUOI CE COMPOSANT CHARGE LUI-MÊME, ALORS QU'UN ÉCRAN LE FAIT DÉJÀ
 * --------------------------------------------------------------------
 * L'écran d'une actualité charge l'article **et** ses commentaires en un seul
 * aller-retour, et c'est justifié : la page n'existe pas sans son article. Un
 * jour de cantine et un sondage, eux, sont des **éléments de liste** : ils n'ont
 * pas de page à eux. Le fil se déplie sous la carte qu'on a touchée, et il est
 * alors le seul à charger — une requête, pour la cible qu'on regarde. Charger
 * les commentaires de tous les jours à l'ouverture de la cantine ferait dix
 * requêtes pour une information que personne ne demande.
 *
 * LA CIBLE EST DÉCOUPÉE EN DEUX CHAÎNES, ET C'EST NÉCESSAIRE
 * ---------------------------------------------------------
 * `useAsyncData` relance sa requête dès que son chargeur change d'identité. Un
 * appelant qui écrirait `cible={{ type: 'menu', id: item.id }}` recréerait cet
 * objet à chaque rendu, et le fil chargerait **en boucle**. Le chargeur dépend
 * donc de `type` et de `id`, qui sont des chaînes stables — et non de l'objet.
 */
export function FilCommentaires({ cible }: { readonly cible: CibleCommentaire }) {
  const { type, id } = cible;

  const loader = useCallback(() => fetchCommentaires({ type, id }), [id, type]);

  const { status, data, errorMessage, reload } = useAsyncData(loader);

  const commentaires = data ?? [];

  return (
    <View style={styles.fil}>
      <SectionHeader title="Commentaires" />

      {data === null || commentaires.length === 0 ? (
        <AsyncFallback
          status={status}
          hasData={false}
          errorMessage={errorMessage}
          onRetry={reload}
          emptyTitle="Aucun commentaire"
          emptyDescription="Les commentaires publiés apparaîtront ici."
          emptyIcon="chatbubble-outline"
          loadingMessage="Chargement des commentaires…"
        />
      ) : (
        commentaires.map((commentaire) => (
          <CarteCommentaire key={commentaire.id} commentaire={commentaire} />
        ))
      )}

      <FormulaireCommentaire cible={cible} onDepose={reload} />
    </View>
  );
}

const styles = StyleSheet.create({
  fil: {
    gap: spacing.md,
  },
  tete: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  auteur: {
    flexShrink: 1,
  },
  confirmation: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  confirmationTexte: {
    flexShrink: 1,
  },
  multiligne: {
    minHeight: 110,
    textAlignVertical: 'top',
    borderRadius: radius.md,
  },
});
