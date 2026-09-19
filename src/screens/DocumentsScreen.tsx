import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import {
  FlatList,
  Linking,
  Pressable,
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
  Card,
  ErrorNotice,
  Screen,
} from '@/components';
import { useAsyncData } from '@/hooks/useAsyncData';
import { documentUrl, fetchDocuments } from '@/services/documents';
import { accents, colors, radius, spacing, type AccentName } from '@/theme';
import { DOCUMENT_CATEGORY_LABELS, type DocumentCategory, type DocumentFile } from '@/types/models';
import { formatShortDate } from '@/utils/date';

const VIDE: readonly DocumentFile[] = [];

const CATEGORY_ACCENTS: Readonly<Record<DocumentCategory, AccentName>> = {
  administratif: 'bleu',
  scolarite: 'violet',
  cantine: 'vert',
  activites: 'ambre',
  autre: 'bleu',
};

const CATEGORY_ICONS: Readonly<Record<DocumentCategory, keyof typeof Ionicons.glyphMap>> = {
  administratif: 'document-text-outline',
  scolarite: 'school-outline',
  cantine: 'restaurant-outline',
  activites: 'color-palette-outline',
  autre: 'document-outline',
};

/** « 1,2 Mo » — lisible, et suffisant pour décider d'un téléchargement. */
function tailleLisible(octets: number | null): string | null {
  if (octets === null || octets <= 0) {
    return null;
  }

  const mega = octets / 1_048_576;
  if (mega >= 1) {
    return `${mega.toFixed(1).replace('.', ',')} Mo`;
  }

  return `${Math.max(1, Math.round(octets / 1024))} Ko`;
}

/**
 * Documents utiles aux familles.
 *
 * POURQUOI LE LIEN EST SIGNÉ, ET NON PUBLIC
 * -----------------------------------------
 * Le fichier vit dans un bucket **privé**. Un bucket public rendrait la
 * politique de la table `documents` décorative : la liste serait réservée aux
 * adhérents, mais l'adresse du fichier, une fois connue, fonctionnerait pour
 * tout le monde — y compris après la fermeture d'un compte.
 *
 * L'adresse est donc signée et valable une heure. Elle se demande au moment de
 * l'ouverture, jamais à l'affichage de la liste : signer cent documents pour en
 * ouvrir un seul ferait cent requêtes inutiles.
 */
export function DocumentsScreen() {
  const loader = useCallback(() => fetchDocuments(), []);
  const { status, data, errorMessage, refreshing, refresh, reload } = useAsyncData(loader);

  const documents = data ?? VIDE;

  const [erreur, setErreur] = useState<unknown>(null);
  const [ouverture, setOuverture] = useState<string | null>(null);

  const ouvrir = useCallback((document: DocumentFile) => {
    setErreur(null);
    setOuverture(document.id);

    void (async () => {
      try {
        const url = await documentUrl(document.storage_path);
        await Linking.openURL(url);
      } catch (caught) {
        setErreur(caught);
      } finally {
        setOuverture(null);
      }
    })();
  }, []);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<DocumentFile>) => {
      const accent = CATEGORY_ACCENTS[item.category] ?? 'bleu';
      const { ink, soft } = accents[accent];
      const taille = tailleLisible(item.size_bytes);

      return (
        <Pressable
          onPress={() => {
            ouvrir(item);
          }}
          disabled={ouverture !== null}
          accessibilityRole="button"
          accessibilityLabel={`Ouvrir ${item.title}`}
          accessibilityState={{ disabled: ouverture !== null }}
          style={({ pressed }) => [pressed && styles.appuye]}
        >
          <Card elevated style={styles.carte}>
            <View style={[styles.pastille, { backgroundColor: soft }]}>
              <Ionicons
                name={CATEGORY_ICONS[item.category] ?? 'document-outline'}
                size={20}
                color={ink}
              />
            </View>

            <View style={styles.texte}>
              <AppText variant="body" bold numberOfLines={2}>
                {item.title}
              </AppText>

              <View style={styles.repere}>
                <Badge label={DOCUMENT_CATEGORY_LABELS[item.category] ?? 'Autre'} accent={accent} />
                <AppText variant="caption">{formatShortDate(item.published_at)}</AppText>
                {taille === null ? null : <AppText variant="caption">· {taille}</AppText>}
              </View>

              {item.description === null ? null : (
                <AppText variant="caption" numberOfLines={2}>
                  {item.description}
                </AppText>
              )}
            </View>

            <Ionicons
              name={ouverture === item.id ? 'hourglass-outline' : 'download-outline'}
              size={18}
              color={colors.textSecondary}
            />
          </Card>
        </Pressable>
      );
    },
    [ouverture, ouvrir],
  );

  return (
    <Screen padded={false} edges={[]}>
      <FlatList
        data={documents}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.liste, documents.length === 0 && styles.listeVide]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <>
            <AsyncErrorBanner
              status={status}
              hasData={documents.length > 0}
              errorMessage={errorMessage}
            />
            {erreur === null ? null : <ErrorNotice error={erreur} />}
          </>
        }
        ListEmptyComponent={
          <AsyncFallback
            status={status}
            hasData={documents.length > 0}
            errorMessage={errorMessage}
            onRetry={reload}
            emptyTitle="Aucun document"
            emptyDescription="Les formulaires, règlements et comptes rendus publiés par le bureau apparaîtront ici."
            emptyIcon="document-text-outline"
            loadingMessage="Chargement des documents…"
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  liste: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  listeVide: {
    flexGrow: 1,
  },
  carte: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  appuye: {
    opacity: 0.7,
  },
  pastille: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texte: {
    flex: 1,
    gap: spacing.xs,
  },
  repere: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
});
