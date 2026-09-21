/**
 * Les adresses qui sortent de l'application, écrites **une fois**.
 *
 * POURQUOI CE FICHIER
 * -------------------
 * L'information des familles sur leurs données personnelles est publiée sur le
 * domaine du tableau de bord, et **deux** endroits de l'application y renvoient :
 * l'avis posé à la première ouverture, et l'écran d'inscription — c'est-à-dire
 * le moment où la collecte commence réellement. Deux copies d'une même adresse
 * finissent toujours par diverger, et celle qui reste fausse est celle qu'on n'a
 * pas relue : elle ne casse rien, elle ouvre sur une page qui n'existe plus.
 *
 * L'ADRESSE EST PUBLIQUE, ET C'EST MESURÉ
 * ---------------------------------------
 * La page s'ouvre **sans compte** — `200` sans aucun cookie, mesuré depuis
 * l'extérieur le 21 septembre 2026, alors que `/cantine` répond encore `307`
 * vers la connexion. C'est ce qui autorise à la montrer à quelqu'un qui n'est
 * pas encore adhérent, et donc à la mettre dans un écran d'inscription.
 *
 * POURQUOI ELLE N'EST PAS DANS `env.ts`
 * -------------------------------------
 * `env.ts` lit `process.env` et n'accepte que les clés d'API — c'est la règle
 * qui rend l'application démarrable sans aucune configuration. Une adresse fixe,
 * connue du code et identique sur toutes les machines, n'a rien à y faire : elle
 * n'est pas un secret, et la mettre dans l'environnement ferait croire qu'elle
 * change d'un environnement à l'autre.
 */

/** L'information des familles sur leurs données personnelles. Publique. */
export const INFORMATION_DONNEES_URL =
  'https://fcpe-freres-lumieres-admin.vercel.app/donnees-personnelles';
