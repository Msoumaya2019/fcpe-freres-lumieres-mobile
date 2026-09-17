/**
 * Formatage des dates en français.
 *
 * Écrit à la main plutôt qu'avec `Intl` : le support d'`Intl` par Hermes dépend
 * de la plateforme et de la version du moteur, et une régression à cet endroit
 * se manifesterait par des dates en anglais dans l'interface — sans erreur, ni
 * à la compilation, ni au lint. Une trentaine de lignes suppriment la question.
 */

const WEEKDAYS: readonly string[] = [
  'dimanche',
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
];

const MONTHS: readonly string[] = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Analyse une date civile `AAAA-MM-JJ` en date **locale**.
 *
 * `new Date('2026-09-16')` interprète la chaîne comme minuit UTC : dans un
 * fuseau en retard sur UTC, la date affichée serait celle de la veille. Une
 * `service_date` désigne un jour de cantine, pas un instant — d'où la
 * construction explicite en composants locaux.
 */
function parseCivilDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match === null) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(year, month - 1, day);

  // L'expression régulière ne contrôle que la forme, pas les bornes, et le
  // constructeur `Date` ne refuse rien : `new Date(2026, 12, 45)` reporte
  // silencieusement sur le 14 février 2027, `new Date(0, 0, 1)` sur le
  // 1er janvier 1900 (les années 0 à 99 sont décalées de 1900). Une date
  // impossible s'afficherait donc comme une date plausible, et fausse. On rend
  // la valeur brute, comme pour une chaîne qui ne ressemble pas à une date.
  const sameDate =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;

  return sameDate ? date : null;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function formatDayAndMonth(date: Date): string {
  const weekday = WEEKDAYS[date.getDay()] ?? '';
  const month = MONTHS[date.getMonth()] ?? '';
  return `${weekday} ${date.getDate()} ${month}`;
}

/**
 * « Aujourd'hui — mercredi 16 septembre », « Demain — … »,
 * ou simplement la date pour les jours suivants.
 *
 * Le repère relatif est ce que l'utilisateur cherche : sur une liste de menus,
 * savoir qu'un jour est « demain » se lit plus vite que de comparer des dates.
 *
 * Au-delà de demain, le rendu est la date longue seule — c'est ce que la liste
 * affiche pour la fin de semaine.
 */
export function formatMenuDate(value: string): string {
  const date = parseCivilDate(value);
  if (date === null) {
    return value;
  }

  const dayDifference = Math.round((startOfDay(date) - startOfDay(new Date())) / 86_400_000);

  if (dayDifference === 0) {
    return `Aujourd'hui — ${formatDayAndMonth(date)}`;
  }
  if (dayDifference === 1) {
    return `Demain — ${formatDayAndMonth(date)}`;
  }

  return capitalize(formatDayAndMonth(date));
}

/** « 16/09/2026 à 19:24 » à partir d'un horodatage ISO. */
export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const day = `${date.getDate()}`.padStart(2, '0');
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');

  return `${day}/${month}/${date.getFullYear()} à ${hours}:${minutes}`;
}
