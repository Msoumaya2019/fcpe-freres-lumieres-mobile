import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import {
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  View,
  type ListRenderItemInfo,
} from 'react-native';

import {
  AppText,
  AsyncErrorBanner,
  AsyncFallback,
  Badge,
  Button,
  Card,
  ErrorNotice,
  LoadingView,
  Screen,
  SectionHeader,
  TextField,
} from '@/components';
import { userMessage } from '@/errors';
import { useAsyncData } from '@/hooks/useAsyncData';
import type { PlusStackParamList } from '@/navigation/types';
import { fetchAnnonce } from '@/services/annonces';
import { fetchCommentaires, publierCommentaire } from '@/services/commentaires';
import { documentUrl } from '@/services/documents';
import { colors, radius, spacing } from '@/theme';
import { annonceCategoryStyle } from '@/theme/categories';
import { ANNONCE_CATEGORY_LABELS, type AnnonceWithAuthor, type Commentaire } from '@/types/models';
import { formatRelativeDay } from '@/utils/date';

const VIDE: readonly Commentaire[] = [];

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
 */
const MAX_AUTEUR_NOM_LENGTH = 60;
const MAX_COMMENTAIRE_LENGTH = 1000;

/**
 * Ce que l'écran charge en un seul aller-retour.
 *
 * POURQUOI UN SEUL CHARGEUR, ET NON TROIS
 * ---------------------------------------
 * L'article, sa photo et ses commentaires s'affichent ensemble : trois
 * `useAsyncData` donneraient trois indicateurs de chargement, trois états
 * d'erreur, et trois boutons « Réessayer » pour une seule page. Le contrat du
 * hook — un état, une relecture, un rafraîchissement — vaut pour la page
 * entière.
 *
 * `photoIndisponible` existe pour une raison précise : l'adresse d'une photo est
 * **signée**, et la signature peut être refusée — politique de compartiment
 * absente, fichier retiré. Un échec à cet endroit ne doit pas emporter
 * l'article : le texte reste lisible, et l'écran **le dit** au lieu de laisser
 * un cadre vide que personne ne saurait expliquer.
 */
interface Article {
  readonly annonce: AnnonceWithAuthor;
  readonly photoUrl: string | null;
  readonly photoIndisponible: boolean;
  readonly commentaires: readonly Commentaire[];
}

/**
 * L'adresse signée d'une photo, ou `null` — sans jamais faire échouer la page.
 *
 * Le compartiment `documents` est privé : l'adresse est signée pour une heure,
 * et jamais écrite en base. Une adresse signée posée en base expirerait au bout
 * d'une heure, et les photos se casseraient toutes seules.
 */
async function adresseDeLaPhoto(chemin: string | null): Promise<string | null> {
  if (chemin === null) {
    return null;
  }

  try {
    return await documentUrl(chemin);
  } catch {
    return null;
  }
}

/**
 * Une actualité, entière — l'écran qu'ouvre « Lire la suite ».
 *
 * POURQUOI CET ÉCRAN EXISTE, ALORS QUE LA RUBRIQUE MONTRE DÉJÀ LE TEXTE ENTIER
 * ---------------------------------------------------------------------------
 * L'accueil coupe ses cartes à trois lignes, et c'est voulu : une carte donne
 * envie d'ouvrir, elle ne remplace pas la lecture. Mais la seule façon d'aller
 * plus loin était le lien « Voir tout », qui mène à la **liste** — on y perdait
 * l'article qu'on venait de commencer, et il fallait le retrouver.
 *
 * « Lire la suite » mène donc à l'article lui-même, et non à une liste où il
 * faut le chercher.
 *
 * L'ARTICLE EST L'EN-TÊTE, LES COMMENTAIRES SONT LA LISTE
 * -------------------------------------------------------
 * C'est la structure qui donne à la fois le tirer-pour-rafraîchir, la garde de
 * vacuité qu'exige le contrôle des câblages, et un état vide qui veut dire
 * quelque chose : « aucun commentaire » est l'état vide de **cette** liste, et
 * l'absence d'article est celui de la page.
 *
 * L'IDENTIFIANT VIENT DE LA ROUTE, PAS DE LA LISTE
 * ------------------------------------------------
 * L'écran relit l'actualité par son identifiant au lieu de recevoir son texte
 * en paramètre. Un paramètre de route est sérialisé et recopié dans l'état de
 * navigation : y faire passer un texte de plusieurs paragraphes le figerait au
 * moment de l'appui, et une correction publiée entre-temps ne se verrait pas.
 * C'est aussi ce qui rend le rafraîchissement utile.
 *
 * L'ABSENCE N'EST PAS UNE PANNE
 * -----------------------------
 * `fetchAnnonce` rend `null` quand l'actualité n'existe plus — retirée entre
 * l'affichage de la liste et l'appui. L'écran le dit alors simplement, au lieu
 * d'annoncer une erreur de lecture : le bandeau rouge est réservé à ce qui a
 * échoué.
 */
export function AnnonceDetailScreen({
  route,
}: NativeStackScreenProps<PlusStackParamList, 'Annonce'>) {
  const { id } = route.params;

  const loader = useCallback(async (): Promise<Article | null> => {
    const annonce = await fetchAnnonce(id);

    if (annonce === null) {
      return null;
    }

    const [commentaires, photoUrl] = await Promise.all([
      fetchCommentaires(id),
      adresseDeLaPhoto(annonce.image_path),
    ]);

    return {
      annonce,
      photoUrl,
      photoIndisponible: annonce.image_path !== null && photoUrl === null,
      commentaires,
    };
  }, [id]);

  const { status, data, errorMessage, refreshing, refresh, reload } = useAsyncData(loader);

  const article = data;
  const commentaires = article?.commentaires ?? VIDE;

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
        await publierCommentaire({ annonceId: id, auteurNom, corps });
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
        reload();
      } catch (caught) {
        setFormError(caught);
      } finally {
        setSubmitting(false);
      }
    })();
  }, [auteurNom, closeForm, corps, id, reload]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Commentaire>) => (
      <Card>
        <View style={styles.commentaireTete}>
          <AppText variant="caption" bold style={styles.commentaireAuteur}>
            {item.auteur_nom}
          </AppText>
          <AppText variant="caption">{formatRelativeDay(item.created_at)}</AppText>
        </View>
        <AppText>{item.corps}</AppText>
      </Card>
    ),
    [],
  );

  return (
    <Screen padded={false} edges={[]}>
      <FlatList
        data={commentaires}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.page, commentaires.length === 0 && styles.pageVide]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <>
            <AsyncErrorBanner
              status={status}
              hasData={article !== null}
              errorMessage={errorMessage}
            />

            {article === null ? null : (
              <>
                <Card>
                  <Badge
                    label={ANNONCE_CATEGORY_LABELS[article.annonce.category] ?? 'Information'}
                    accent={annonceCategoryStyle(article.annonce.category).accent}
                    icon={annonceCategoryStyle(article.annonce.category).icon}
                  />

                  <AppText variant="title">{article.annonce.title}</AppText>

                  <View style={styles.repere}>
                    <AppText variant="caption">
                      {formatRelativeDay(article.annonce.published_at)}
                    </AppText>
                    {article.annonce.authorName === null ? null : (
                      <AppText variant="caption" numberOfLines={1} style={styles.auteur}>
                        · {article.annonce.authorName}
                      </AppText>
                    )}
                  </View>

                  {article.photoUrl === null ? null : (
                    <Image
                      source={{ uri: article.photoUrl }}
                      style={styles.photo}
                      resizeMode="cover"
                      accessibilityLabel={'Photo de l’actualité : ' + article.annonce.title}
                    />
                  )}
                  {/* Une photo qui ne s'affiche pas ne doit pas emporter
                      l'article : le texte reste lisible, et l'écran le dit
                      plutôt que de laisser un cadre vide inexpliqué. */}
                  {article.photoIndisponible ? (
                    <AppText variant="caption" color={colors.danger}>
                      La photo de cette actualité n’a pas pu être chargée.
                    </AppText>
                  ) : null}

                  {/* Le texte entier, sans coupe : c'est la raison d'être de
                      l'écran. */}
                  <AppText variant="body">{article.annonce.body}</AppText>
                </Card>

                <SectionHeader title="Commentaires" />

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
                        Votre nom apparaîtra sous votre commentaire. Il sera publié après validation
                        par le bureau.
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
                        inputStyle={styles.multiline}
                      />

                      {formError === null ? null : <ErrorNotice error={formError} />}

                      <Button label="Envoyer" onPress={handleSubmit} loading={submitting} />
                      <Button
                        label="Annuler"
                        variant="ghost"
                        onPress={closeForm}
                        disabled={submitting}
                      />
                    </>
                  ) : (
                    <>
                      <AppText variant="caption">
                        Une question, un avis, une précision ? Écrivez-le ici : le bureau le lira
                        avant publication.
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
            )}
          </>
        }
        ListEmptyComponent={
          article === null ? (
            <AsyncFallback
              status={status}
              hasData={false}
              errorMessage={errorMessage}
              onRetry={reload}
              emptyTitle="Actualité introuvable"
              emptyDescription="Elle a peut-être été retirée depuis l'affichage de la liste."
              emptyIcon="megaphone-outline"
              loadingMessage="Chargement de l'actualité…"
            />
          ) : submitting ? (
            // Un envoi en cours n'est pas « aucun commentaire » : sans cette
            // branche, l'écran inviterait à écrire le premier pendant tout
            // l'aller-retour, y compris après que le serveur a accepté.
            <LoadingView message="Envoi de votre commentaire…" />
          ) : (
            <AsyncFallback
              status={status}
              hasData={false}
              errorMessage={errorMessage}
              onRetry={reload}
              emptyTitle="Aucun commentaire"
              emptyDescription="Les commentaires publiés apparaîtront ici, sous l'actualité."
              emptyIcon="chatbubble-outline"
              loadingMessage="Chargement des commentaires…"
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  pageVide: {
    flexGrow: 1,
  },
  repere: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  auteur: {
    flexShrink: 1,
  },
  photo: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  commentaireTete: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  commentaireAuteur: {
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
  multiline: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
});
