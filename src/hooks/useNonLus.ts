import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { abonnerAuCompte, compteNonLus, rafraichirNonLus } from '@/services/unread';

/**
 * Le nombre de messages de discussion non lus, partagé par ses trois afficheurs.
 *
 * POURQUOI UN CROCHET, ET NON TROIS CALCULS
 * -----------------------------------------
 * La pastille de l'onglet « Plus », la cloche de l'accueil et la ligne
 * « Discussion » affichent le **même** nombre. Ils le calculaient chacun pour
 * leur compte, à leur propre moment : au montage pour deux d'entre eux, au retour
 * sur l'écran pour le troisième. Après une lecture de la discussion, deux des
 * trois annonçaient donc encore des messages déjà lus, pendant que le troisième
 * affichait zéro — trois chiffres à l'écran pour une seule vérité.
 *
 * Le nombre vit maintenant dans `src/services/unread.ts`, qui le publie quand il
 * change. Ce crochet est le pont entre ce magasin et React : il s'y abonne, et il
 * demande la première relecture.
 *
 * POURQUOI `useSyncExternalStore`
 * -------------------------------
 * C'est l'outil prévu pour lire une valeur qui vit **hors** de React : il garantit
 * que la valeur lue est la même pendant tout un rendu, et que tous les abonnés
 * voient la même. Un `useState` alimenté par un abonnement manuel laisserait
 * passer un rendu avec deux valeurs différentes si une relecture aboutissait au
 * milieu — exactement le défaut que ce crochet corrige.
 *
 * Les trois afficheurs montant ensemble, les trois demandent la relecture au même
 * instant. Le regroupement est fait dans le service, pas ici : un crochet qui
 * dédupliquerait sa propre demande ne verrait pas celle de ses voisins.
 */
export function useNonLus(userId: string): number {
  const nonLus = useSyncExternalStore(
    abonnerAuCompte,
    () => compteNonLus(userId),
    () => 0,
  );

  useEffect(() => {
    if (userId === '') {
      return;
    }

    void rafraichirNonLus(userId);

    // Revenir sur l'application est le seul moment où le compte a pu changer
    // sans que rien ne l'ait dit : un message a pu arriver pendant que le
    // téléphone était en poche.
    const abonnement = AppState.addEventListener('change', (etat) => {
      if (etat === 'active') {
        void rafraichirNonLus(userId);
      }
    });

    return () => {
      abonnement.remove();
    };
  }, [userId]);

  return nonLus;
}
