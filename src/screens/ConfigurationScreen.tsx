import { AppText, Card, Screen } from '@/components';
import { appConfig } from '@/config/env';
import { colors } from '@/theme';

const SETUP_STEPS: readonly string[] = [
  'Copiez `.env.example` en `.env.local` à la racine du projet.',
  'Renseignez EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY depuis le tableau de bord Supabase (Project Settings > API Keys).',
  "Redémarrez le serveur de développement : Expo n'injecte les variables qu'au démarrage.",
];

/**
 * Écran affiché quand les clés d'API manquent ou sont refusées.
 *
 * Il existe pour une raison précise : sans lui, l'application planterait au
 * démarrage sur un `undefined`, et la cause — deux variables absentes — serait
 * noyée dans une pile d'appels. Il rend aussi possible la vérification en
 * intégration continue, qui compile le bundle sans aucun secret.
 *
 * DEUX PUBLICS, DEUX MESSAGES
 * ---------------------------
 * Les étapes de mise en place ne s'adressent qu'à un développeur : elles parlent
 * de `.env.local` et de redémarrage du serveur, choses qu'un adhérent ne peut pas
 * faire. Les afficher dans un build de production reviendrait à confier à un
 * parent une procédure qu'il ne peut pas exécuter, au moment précis où il faut
 * lui dire qui contacter.
 *
 * C'est la même règle que `appErrorDetail()`, qui masque le détail technique en
 * production : ce qui décrit la base de données ne sort pas du poste de
 * développement.
 */
export function ConfigurationScreen() {
  if (appConfig.appEnv === 'production') {
    return (
      <Screen scrollable>
        <Card>
          <AppText variant="title">Application momentanément indisponible</AppText>
          <AppText>
            L&apos;application n&apos;arrive pas à joindre sa base de données. Ce n&apos;est pas lié
            à votre compte ni à votre téléphone.
          </AppText>
          <AppText variant="caption">
            Signalez le problème au bureau de la FCPE : la correction se fait de leur côté.
          </AppText>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen scrollable>
      <Card>
        <AppText variant="title">Configuration requise</AppText>
        <AppText color={colors.danger}>
          {appConfig.configError ?? "L'application n'est pas configurée."}
        </AppText>
      </Card>

      <Card muted>
        <AppText variant="heading">Mise en place</AppText>
        {SETUP_STEPS.map((step, index) => (
          <AppText key={step} variant="caption">
            {index + 1}. {step}
          </AppText>
        ))}
      </Card>

      <Card muted>
        <AppText variant="caption" bold>
          Rappel de sécurité
        </AppText>
        <AppText variant="caption">
          Seule la clé « publishable » (ex-« anon public ») a sa place dans l&apos;application. La
          clé « service_role » contourne toutes les politiques de sécurité : elle ne doit jamais
          figurer dans un fichier préfixé EXPO_PUBLIC_.
        </AppText>
      </Card>
    </Screen>
  );
}
