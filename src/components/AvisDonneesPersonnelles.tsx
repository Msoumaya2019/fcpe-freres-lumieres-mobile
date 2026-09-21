import { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { INFORMATION_DONNEES_URL } from '@/config/liens';
import { INFORMATION_DONNEES, ecrirePreference, lirePreference } from '@/config/preferences';
import { accents, spacing } from '@/theme';

/**
 * L'avis sur les données personnelles, posé une fois, sur l'accueil.
 *
 * POURQUOI UNE CARTE, ET NON UNE FENÊTRE QUI SE FERME
 * ---------------------------------------------------
 * La demande d'origine était une porte : « j'accepte » ou « je refuse », et
 * l'application se ferme tant qu'on n'a pas accepté. Elle a été écartée pour
 * trois raisons, et aucune n'est un détail d'implémentation.
 *
 * D'abord, l'article 13 du RGPD demande d'**informer**, pas de recueillir un
 * accord. Les bases de traitement de l'application sont l'intérêt légitime et
 * l'exécution du service ; le consentement ne porte que sur **deux** choses —
 * publier un message dans la discussion, et déposer le jeton de l'appareil — et
 * ni l'une ni l'autre ne se recueille ici : publier est le geste lui-même, et le
 * jeton n'est déposé qu'après la demande du système. Une porte « acceptez ou
 * partez » devant une information qui n'est pas un consentement rendrait
 * l'accord **non libre** — refuser fermerait l'application —, ce qui affaiblit
 * la position au lieu de la renforcer.
 *
 * Ces bases ne sont pas recopiées de mémoire : elles sont relues dans
 * `SECURITY.md` (« Données personnelles et RGPD ») et dans la page publiée, qui
 * écrit « Consentement (vous publiez) » en face des messages. Une première
 * version de ce commentaire affirmait qu'**aucun** traitement ne reposait sur le
 * consentement — c'était faux, et c'est la comparaison des deux documents qui
 * l'a montré.
 *
 * Ensuite, elle serait impossible à écrire : `BackHandler.exitApp` est une
 * **fonction vide** sur iPhone (lu dans le paquet installé,
 * `react-native/Libraries/Utilities/BackHandler.ios.js`). Le geste ne peut pas
 * être le même sur les deux téléphones, et fermer l'application sur un refus
 * n'est pas ce qu'on veut obtenir d'un parent.
 *
 * Enfin, et c'est le plus important : les menus, les actualités et l'écran
 * Réglages s'ouvrent **sans compte**, volontairement. Une porte à la première
 * ouverture mettrait un mur devant du contenu public, pour des gens dont on ne
 * collecte **rien** — l'inverse exact du but.
 *
 * D'où une carte : elle se lit, elle ne bloque rien, et la liste continue
 * derrière elle.
 *
 * POURQUOI ELLE NE SE REPOSE PAS
 * ------------------------------
 * Une marque locale (`donnees.information`) est écrite dès que le parent a
 * répondu, par l'un ou l'autre bouton. Sans elle, l'avis reviendrait à chaque
 * ouverture — et un avis qu'on ne peut pas écarter cesse d'être un avis.
 *
 * CE QU'ELLE NE DEMANDE PAS
 * -------------------------
 * Ni accord, ni case à cocher, ni nom : seulement d'avoir vu. Un parent qui
 * n'ouvre pas la page et appuie sur « J'ai compris » n'a rien refusé — c'est la
 * différence entre informer et consentir, et elle est visible dans l'interface.
 */
export function AvisDonneesPersonnelles() {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let vivant = true;

    void (async () => {
      try {
        const marque = await lirePreference(INFORMATION_DONNEES);

        if (vivant && marque === null) {
          setVisible(true);
        }
      } catch {
        //  Un magasin de préférences illisible ne doit pas empêcher l'accueil
        //  de s'afficher. L'avis ne se pose pas, et l'information reste
        //  joignable depuis l'écran d'inscription et depuis la page publiée.
      }
    })();

    return () => {
      vivant = false;
    };
  }, []);

  const repondre = useCallback(async (ouvrirLaPage: boolean) => {
    setMessage(null);

    if (ouvrirLaPage) {
      try {
        await Linking.openURL(INFORMATION_DONNEES_URL);
      } catch {
        //  Un échec **garde la carte ouverte**, et c'est le seul endroit où
        //  l'adresse sera lue. La fermer sur un message que personne n'a vu
        //  reviendrait à le taire — et le parent n'aurait aucun moyen de
        //  retrouver la page. L'adresse est donc affichée, sélectionnable.
        setMessage(INFORMATION_DONNEES_URL);
        return;
      }
    }

    try {
      await ecrirePreference(INFORMATION_DONNEES, 'vue');
    } catch {
      //  La marque est un confort : ne pas l'écrire repose l'avis une fois de
      //  plus, ce qui n'empêche rien. Elle ne doit pas retenir la carte à
      //  l'écran alors que le parent vient de la lire.
    }

    setVisible(false);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <Card elevated style={styles.carte}>
      <AppText variant="heading">Vos données personnelles</AppText>

      <AppText variant="caption">
        Pour vous rendre ce service, l’association conserve votre adresse e-mail, un nom affiché et
        votre rôle. Rien d’autre. Ce qui est conservé, pendant combien de temps, qui y a accès et
        comment demander leur effacement est expliqué en détail.
      </AppText>

      {message === null ? null : (
        <AppText variant="caption" color={accents.bleu.ink} selectable>
          La page n’a pas pu s’ouvrir. Vous pouvez la retrouver à cette adresse : {message}
        </AppText>
      )}

      <View style={styles.actions}>
        <Button
          label="Lire l’information"
          variant={message === null ? 'primary' : 'secondary'}
          onPress={() => {
            void repondre(true);
          }}
        />
        <Button
          label="J’ai compris"
          variant="secondary"
          onPress={() => {
            void repondre(false);
          }}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  //  Pas de marge : l'accueil espace ses éléments par un `gap` sur la liste,
  //  et une marge en plus donnerait un écart double à cet endroit seulement.
  carte: {
    gap: spacing.sm,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
