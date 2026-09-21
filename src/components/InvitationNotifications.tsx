import { useCallback, useEffect, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { INVITATION_NOTIFICATIONS, ecrirePreference, lirePreference } from '@/config/preferences';
import { demanderNotifications, etatPush } from '@/services/push';
import { accents, radius, spacing } from '@/theme';

/**
 * La question posée une seule fois, à la première ouverture.
 *
 * POURQUOI ELLE EST POSÉE, APRÈS AVOIR ÉTÉ ÉCARTÉE
 * ------------------------------------------------
 * La version précédente ne demandait rien au démarrage, et son raisonnement
 * tenait en deux points : une boîte système avant que le parent ait vu quoi que
 * ce soit, et un refus **définitif** depuis Android 13. Les deux restent vrais.
 *
 * Ce qui a changé, c'est qu'une invitation posée **par l'application** évite les
 * deux. Le parent a vu l'accueil, lit une phrase qui explique à quoi cela sert,
 * et peut répondre « Plus tard » sans rien refuser au système. La boîte
 * d'Android ne s'ouvre que s'il a appuyé sur « Activer » : elle est alors la
 * conséquence d'un geste, et non la première chose qu'on lui montre.
 *
 * Le prix, écrit plutôt que tu : un parent qui appuie sur « Activer » puis
 * refuse dans la boîte système a consommé son unique demande. L'écran Réglages
 * le dit alors, et nomme le chemin dans les réglages d'Android — c'est la
 * conduite à tenir, pas un contournement.
 *
 * POURQUOI ELLE NE REVIENT PAS
 * ----------------------------
 * Une marque locale (`notifications.invitation`) est écrite dès que le parent a
 * répondu, dans un sens ou dans l'autre. Sans elle, « Plus tard » ne changerait
 * pas l'état du système — qui reste `undetermined` —, et la question reviendrait
 * à chaque ouverture. Une question qui se répète finit par obtenir un refus
 * définitif : ce serait obtenir le contraire de ce qu'on cherche.
 *
 * CE QU'ELLE PASSE PAR LE SERVICE, ET NON PAR LE PAQUET NATIF
 * ----------------------------------------------------------
 * Elle appelle `etatPush` et `demanderNotifications`, comme l'écran Réglages.
 * Importer `expo-notifications` ici en ferait un second importateur — deux
 * gestionnaires de notification, dont le dernier posé gagne en silence —, et
 * `check-notifications.test.mjs` tient la liste fermée.
 */
export function InvitationNotifications() {
  const { status } = useAuth();

  const [visible, setVisible] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    //  Tant que la session stockée se lit, la racine affiche « Chargement de
    //  votre session… ». Poser la question par-dessus cet écran serait
    //  exactement ce qu'on cherche à éviter : une demande avant que le parent
    //  ait vu l'application.
    if (status === 'loading') {
      return;
    }

    let vivant = true;

    void (async () => {
      try {
        const [etat, marque] = await Promise.all([
          etatPush(),
          lirePreference(INVITATION_NOTIFICATIONS),
        ]);

        //  Les trois conditions sont nécessaires, et chacune pour une raison
        //  distincte : la marque dit que la question n'a pas déjà été posée,
        //  l'état dit que le système non plus, et `vivant` que le composant est
        //  encore monté — écrire un état après démontage avertirait pour rien.
        if (vivant && marque === null && etat.autorisation === 'jamaisDemandees') {
          setVisible(true);
        }
      } catch {
        //  Un magasin de préférences illisible ne doit pas empêcher
        //  l'application de s'ouvrir. L'invitation ne s'affiche pas, et les
        //  Réglages restent le chemin pour activer les notifications.
      }
    })();

    return () => {
      vivant = false;
    };
  }, [status]);

  const repondre = useCallback(async (activer: boolean) => {
    setOccupe(true);
    setMessage(null);

    let suite: string | null = null;

    if (activer) {
      try {
        const { etat, enregistre } = await demanderNotifications();

        //  « Autorisé » et « enregistré » sont deux faits. Les confondre ferait
        //  croire au parent qu'il sera prévenu alors que rien n'est déposé — et
        //  il ne le découvrirait qu'en ne recevant rien.
        if (etat.autorisation === 'accordees' && !enregistre) {
          suite =
            "L'autorisation est accordée, mais ce téléphone n'a pas pu être " +
            'enregistré. Réessayez depuis Réglages.';
        }
      } catch {
        suite = "La demande n'a pas abouti. Vous pouvez réessayer depuis Réglages.";
      }
    }

    try {
      await ecrirePreference(INVITATION_NOTIFICATIONS, 'vue');
    } catch {
      //  La marque est un confort : ne pas l'écrire repose la question une fois
      //  de plus, ce qui n'empêche rien. Elle ne doit donc pas faire échouer la
      //  réponse du parent, qui vient d'être enregistrée par le système.
    }

    setOccupe(false);

    //  Un échec garde l'invitation ouverte : c'est le seul endroit où la phrase
    //  sera lue. La fermer sur un message que personne n'a vu reviendrait à le
    //  taire.
    if (suite === null) {
      setVisible(false);
    } else {
      setMessage(suite);
    }
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        void repondre(false);
      }}
    >
      <View style={styles.voile}>
        <Card elevated style={styles.carte}>
          <AppText variant="heading">Recevoir les nouvelles du bureau ?</AppText>

          <AppText variant="caption">
            L’application peut afficher une notification quand le bureau publie une actualité ou
            répond à un message. Ce réglage ne transmet au bureau ni votre nom, ni votre adresse :
            il n’enregistre qu’un identifiant de téléphone.
          </AppText>

          <AppText variant="caption">
            Vous pourrez le changer à tout moment dans Réglages, même sans compte.
          </AppText>

          {message === null ? null : (
            <AppText variant="caption" color={accents.bleu.ink}>
              {message}
            </AppText>
          )}

          {message === null ? (
            <View style={styles.actions}>
              <Button
                label="Activer les notifications"
                loading={occupe}
                onPress={() => {
                  void repondre(true);
                }}
              />
              <Button
                label="Plus tard"
                variant="secondary"
                disabled={occupe}
                onPress={() => {
                  void repondre(false);
                }}
              />
            </View>
          ) : (
            <Button
              label="Fermer"
              onPress={() => {
                setVisible(false);
              }}
            />
          )}
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  voile: {
    flex: 1,
    justifyContent: 'flex-end',
    //  Le même voile que l'écran d'accueil : une couleur choisie une fois, et
    //  non une teinte par écran.
    backgroundColor: 'rgba(11, 18, 32, 0.5)',
    padding: spacing.lg,
  },
  carte: {
    gap: spacing.sm,
    borderRadius: radius.lg,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
