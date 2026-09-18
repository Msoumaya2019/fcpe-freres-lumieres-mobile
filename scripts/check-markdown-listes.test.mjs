/**
 * Vérifie qu'aucune liste numérotée des documents n'est interrompue par un bloc
 * de premier niveau — le piège qui a fait mentir le guide.
 *
 * POURQUOI CE FICHIER
 * -------------------
 * `MISE-EN-SERVICE.md` est réécrit par un outil extérieur — deux fois dans la
 * même soirée. Cet outil ne touche pas au fond : il transforme la forme. Mesuré
 * sur la dernière passe : **107 coupures dures** ajoutées là où il n'y en avait
 * aucune, 10 doubles lignes vides, 99 lignes ne différant que par les espaces
 * finaux — et **les listes renumérotées**.
 *
 * Cette renumérotation n'est pas cosmétique, et c'est ce que ce banc retient.
 * En CommonMark, un tableau de premier niveau **interrompt** la liste qui le
 * précède : la suite du texte forme une liste **neuve**, et CommonMark y affiche
 * le numéro qu'on a écrit. Le guide portait :
 *
 *     3. Remplissez le formulaire :
 *
 *     | Champ | Valeur |
 *     | ----- | ------ |
 *
 *     4. Pour la région, …
 *     5. Cliquez Create new project, …
 *
 * Le `4.` ouvre une seconde liste, et s'affiche donc « 4 » : le rendu était
 * juste. Mais l'outil extérieur a réécrit la suite en `1.` et `2.` — et le
 * lecteur voyait alors « 1. Pour la région » là où il s'agit de l'**étape 4**.
 *
 * Mesuré, pas raisonné : le même document rendu par `markdown-it` donne
 * `<ol start="4">` avant la réécriture et `<ol start="1">` après.
 *
 * CE QUE CE CONTRÔLE MESURE
 * -------------------------
 * La cause, pas la conséquence. Une liste interrompue par un bloc n'est correcte
 * que **par chance** : elle ne le reste que tant que la suite garde ses vrais
 * numéros. L'invariant posé est donc celui-ci — *entre deux points numérotés, un
 * bloc de premier niveau ne peut se trouver que si un titre les sépare*. Un
 * titre termine franchement la liste ; un tableau la casse en silence.
 *
 * Le remède appliqué au guide est **structurel** : le tableau est indenté dans
 * le point 3, la liste redevient d'un seul tenant, et plus aucun renuméroteur ne
 * peut la faire mentir. Ce banc tient ce remède, parce que l'outil extérieur
 * repassera.
 *
 * CE QU'IL NE PEUT PAS VOIR
 * -------------------------
 * Il ne lit pas le **rendu** : il n'embarque aucun moteur Markdown, et n'en veut
 * pas — une dépendance ajoutée au dépôt pour surveiller un document coûterait
 * plus cher que le défaut. Il ne voit donc pas un numéro faux écrit à la main
 * dans une liste d'un seul tenant (`1.` `2.` `7.` : CommonMark affiche 1, 2, 3,
 * et le banc se tait). Il ne regarde que la **racine** du dépôt, pas les
 * sous-dossiers. Et il ne juge pas le contenu : un point faux passe, seul
 * l'agencement est tenu.
 *
 * Le second test n'est pas décoratif : il exerce le détecteur sur un piège connu
 * et sur sa forme corrigée. Sans lui, une expression régulière cassée rendrait
 * une liste vide — et une liste vide se lit comme un succès.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('../', import.meta.url));

const POINT = /^(\d+)\.\s/;
const TITRE = /^#{1,6}\s/;
const REGLE = /^-{3,}\s*$/;

/**
 * Les blocs de premier niveau d'un document, dans l'ordre, étiquetés.
 *
 * Une ligne vide, ou une ligne qui commence par une espace, **continue** le bloc
 * précédent : c'est ainsi qu'un tableau indenté reste dans son point. Tout le
 * reste part de la colonne 0 et ouvre donc un bloc.
 */
function blocsDePremierNiveau(texte) {
  const blocs = [];

  for (const [rang, ligne] of texte.split('\n').entries()) {
    if (ligne.trim() === '' || ligne.startsWith(' ') || ligne.startsWith('\t')) {
      continue;
    }
    if (POINT.test(ligne)) {
      blocs.push({ genre: 'point', ligne: rang + 1 });
    } else if (TITRE.test(ligne)) {
      blocs.push({ genre: 'titre', ligne: rang + 1 });
    } else if (REGLE.test(ligne)) {
      blocs.push({ genre: 'regle', ligne: rang + 1 });
    } else {
      blocs.push({ genre: 'autre', ligne: rang + 1, texte: ligne.trim().slice(0, 60) });
    }
  }

  return blocs;
}

/**
 * Les couples de points numérotés qu'un bloc de premier niveau sépare sans titre.
 *
 * Deux états suffisent, et ils sont distincts — c'est la distinction qui compte :
 * `blocDepuis` retient qu'un bloc de contenu est passé depuis le dernier point,
 * `separateur` retient qu'un titre ou un filet est passé depuis. Un piège demande
 * les deux conditions : un bloc de contenu **et** aucun séparateur.
 *
 * Les confondre produit des faux positifs silencieux — mesuré : une première
 * version ne retenait que le dernier bloc, et signalait chaque titre du guide
 * comme une coupure de liste, parce qu'un paragraphe le suivait.
 */
function pointsSepares(texte) {
  const trouves = [];
  let dernierPoint = null;
  let blocDepuis = null;
  let separateur = false;

  for (const bloc of blocsDePremierNiveau(texte)) {
    if (bloc.genre === 'point') {
      if (dernierPoint !== null && blocDepuis !== null && !separateur) {
        trouves.push({ avant: dernierPoint.ligne, apres: bloc.ligne, bloc: blocDepuis });
      }
      dernierPoint = bloc;
      blocDepuis = null;
      separateur = false;
    } else if (bloc.genre === 'titre' || bloc.genre === 'regle') {
      // Un titre ou un filet sépare franchement : la liste est finie, et celle
      // qui suivra repart légitimement de son propre numéro.
      separateur = true;
    } else if (bloc.genre === 'autre') {
      blocDepuis = bloc;
    }
  }

  return trouves;
}

/** Les documents Markdown de la racine. */
function documents() {
  return readdirSync(RACINE).filter((nom) => nom.endsWith('.md'));
}

test('le détecteur reconnaît un piège connu, et laisse passer sa forme corrigée', () => {
  const casse = [
    '3. Remplissez le formulaire :',
    '',
    '| Champ | Valeur |',
    '| ----- | ------ |',
    '',
    '4. Pour la région',
  ].join('\n');
  const tenant = [
    '3. Remplissez le formulaire :',
    '',
    '   | Champ | Valeur |',
    '   | ----- | ------ |',
    '',
    '4. Pour la région',
  ].join('\n');

  assert.equal(pointsSepares(casse).length, 1, 'un tableau de premier niveau doit être vu');
  assert.equal(pointsSepares(tenant).length, 0, 'un tableau indenté ne casse pas la liste');
});

test('aucune liste numérotée n’est interrompue par un bloc de premier niveau', () => {
  const fautifs = [];

  for (const nom of documents()) {
    for (const trouve of pointsSepares(readFileSync(join(RACINE, nom), 'utf8'))) {
      fautifs.push(
        `${nom} : « ${trouve.bloc.texte} » sépare les points des lignes ${trouve.avant} et ${trouve.apres}`,
      );
    }
  }

  assert.deepEqual(
    fautifs,
    [],
    `un bloc de premier niveau casse une liste numérotée — indentez-le dans son point, ` +
      `ou terminez la liste par un titre :\n  ${fautifs.join('\n  ')}`,
  );
});
