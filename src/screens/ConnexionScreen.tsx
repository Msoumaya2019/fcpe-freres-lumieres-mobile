import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { AppText, Button, Card, ErrorNotice, Screen, TextField } from '@/components';
import { userMessage } from '@/errors';
import { spacing } from '@/theme';

/**
 * Les quatre visages du même écran.
 *
 * Les cinq écrans demandés à la conception sont respectés : la récupération de
 * mot de passe n'ajoute pas d'écran, elle ajoute des **modes** à celui-ci. Ce
 * n'est pas un raccourci — c'est le même endroit dans l'application, « tout ce
 * qui se passe avant d'être entré », et les quatre modes s'excluent.
 */
type Mode = 'connexion' | 'inscription' | 'mot-de-passe-oublie' | 'nouveau-mot-de-passe';

/**
 * Longueur minimale, recopiée d'un réglage qui ne vit **pas** dans ce dépôt :
 * `Authentication > Providers > Email > Minimum password length`, dans le tableau
 * de bord Supabase. Aucun `config.toml` ne le porte, donc **aucun test ne peut
 * tenir cet accord** — même situation que l'adresse de retour du lien de
 * réinitialisation, consignée dans le `README.md` principal (§4).
 *
 * ELLE NE S'APPLIQUE QU'À LÀ OÙ LE MOT DE PASSE EST **CHOISI** — inscription, et
 * choix d'un nouveau mot de passe. Jamais à la connexion, et c'est une règle, pas
 * une préférence : GoTrue **ne refuse pas** une connexion pour la longueur du mot
 * de passe. Vérifié dans sa source (`internal/api/token.go`,
 * `ResourceOwnerPasswordGrant`) : la robustesse est contrôlée **après** que le mot
 * de passe a été reconnu correct, et le constat n'est pas renvoyé en erreur — il
 * voyage dans la réponse (`token.WeakPassword`), que `signInWithPassword` expose
 * en `data.weakPassword`. Le serveur vérifie donc un mot de passe, il n'en juge
 * pas la forme.
 *
 * Conséquence, et c'est la raison de cette règle : appliquée à la connexion, cette
 * borne ne peut produire qu'un refus que le serveur n'aurait pas prononcé. Un
 * compte dont le mot de passe est plus court que ce réglage — créé avant son
 * durcissement, ou sous un réglage plus permissif — serait **empêché d'entrer**,
 * avec une phrase affirmant quelque chose de faux sur son propre mot de passe.
 * Le chiffre d'ici ne sert donc qu'à éviter un aller-retour à l'inscription ; à la
 * connexion, c'est le serveur qui tranche.
 *
 * Les trois autres refus possibles du serveur — classes de caractères, mot de
 * passe divulgué, longueur maximale de bcrypt — sont traduits par leurs propres
 * règles, et ne sont **pas** anticipés ici.
 */
const MIN_PASSWORD_LENGTH = 6;

/**
 * Longueur maximale du nom affiché, alignée sur la contrainte
 * `profiles_display_name_length` de la migration (`char_length(display_name)
 * <= 80`).
 *
 * Sans cette borne, un nom de 81 caractères faisait échouer l'insertion du
 * profil **à l'intérieur du déclencheur** `handle_new_user()` — donc la création
 * du compte entier, dans la même transaction. GoTrue renvoyait « Database error
 * saving new user », que l'adhérent lisait sous forme de message générique
 * invitant à réessayer : un conseil qui ne peut pas aboutir, le nom étant la
 * cause. `scripts/check-input-limits.test.mjs` tient l'accord avec la migration.
 */
const MAX_DISPLAY_NAME_LENGTH = 80;

/**
 * Demande d'envoi du lien de réinitialisation.
 *
 * L'état « envoyé » est un état à part entière, et non un bandeau posé sur le
 * formulaire : une fois la demande faite, il n'y a plus rien à saisir ici. Le
 * laisser affiché inviterait à appuyer une seconde fois, ce qui déclencherait
 * la limitation de débit de Supabase (« Trop d'e-mails ont été envoyés »).
 */
function ForgotPasswordForm({ onBack }: { readonly onBack: () => void }) {
  const { requestPasswordReset } = useAuth();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(() => {
    const trimmedEmail = email.trim();
    if (trimmedEmail === '') {
      setError(userMessage('Indiquez votre adresse e-mail.'));
      return;
    }

    setError(null);
    setSubmitting(true);

    void (async () => {
      try {
        await requestPasswordReset(trimmedEmail);
        setSentTo(trimmedEmail);
      } catch (caught) {
        setError(caught);
      } finally {
        setSubmitting(false);
      }
    })();
  }, [email, requestPasswordReset]);

  if (sentTo !== null) {
    return (
      <>
        <AppText variant="heading">Vérifiez vos e-mails</AppText>
        <ErrorNotice
          tone="info"
          error={userMessage(
            `Si un compte existe pour ${sentTo}, un lien vient d'être envoyé. ` +
              'Ouvrez-le pour choisir un nouveau mot de passe.',
          )}
        />
        <Button label="Retour à la connexion" variant="ghost" onPress={onBack} />
      </>
    );
  }

  return (
    <>
      <AppText variant="heading">Mot de passe oublié</AppText>
      <AppText variant="caption">
        Indiquez l’adresse de votre compte : vous recevrez un lien pour choisir un nouveau mot de
        passe.
      </AppText>

      <TextField
        label="Adresse e-mail"
        value={email}
        onChangeText={setEmail}
        placeholder="prenom.nom@exemple.fr"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        editable={!submitting}
        onSubmitEditing={handleSubmit}
        returnKeyType="send"
      />

      {error === null ? null : <ErrorNotice error={error} />}

      <Button label="Envoyer le lien" onPress={handleSubmit} loading={submitting} />
      <Button
        label="Retour à la connexion"
        variant="ghost"
        onPress={onBack}
        disabled={submitting}
      />
    </>
  );
}

/**
 * Choix du nouveau mot de passe, après le clic sur le lien reçu.
 *
 * `passwordRecovery` retient la navigation pour que l'adhérent ne puisse pas
 * entrer dans l'application sans avoir changé son mot de passe. Sans cette
 * retenue, le lien connecterait sans rien changer, et resterait valable.
 *
 * Le formulaire peut apparaître quelques centaines de millisecondes **avant**
 * que la session du lien soit posée : `setSession` fait un aller-retour réseau,
 * et le drapeau est levé dès la lecture du lien pour que l'application ne soit
 * jamais montée entre-temps. Le champ n'est pas désactivé pour autant — la
 * fenêtre est plus courte qu'une saisie de mot de passe, et bloquer l'écran
 * donnerait l'impression d'une application figée.
 *
 * Le champ de confirmation n'est pas une redondance de confort : ce mot de passe
 * est **choisi**, pas saisi de mémoire, et une faute de frappe invisible
 * laisserait l'adhérent dehors avec un mot de passe qu'il ignore — sans autre
 * recours qu'une nouvelle demande de lien.
 */
function NewPasswordForm({ onCancel }: { readonly onCancel: () => void }) {
  const { completePasswordReset } = useAuth();

  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(() => {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(
        userMessage(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`),
      );
      return;
    }
    if (password !== confirmation) {
      setError(userMessage('Les deux mots de passe ne correspondent pas.'));
      return;
    }

    setError(null);
    setSubmitting(true);

    void (async () => {
      try {
        await completePasswordReset(password);
      } catch (caught) {
        setError(caught);
      } finally {
        setSubmitting(false);
      }
    })();
  }, [completePasswordReset, confirmation, password]);

  return (
    <>
      <AppText variant="heading">Nouveau mot de passe</AppText>
      <AppText variant="caption">
        Choisissez le mot de passe qui remplacera l’ancien. Vous serez connecté automatiquement.
      </AppText>

      <TextField
        label="Nouveau mot de passe"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        editable={!submitting}
        hint={`Au moins ${MIN_PASSWORD_LENGTH} caractères.`}
      />

      <TextField
        label="Confirmer le mot de passe"
        value={confirmation}
        onChangeText={setConfirmation}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        editable={!submitting}
        onSubmitEditing={handleSubmit}
        returnKeyType="go"
      />

      {error === null ? null : <ErrorNotice error={error} />}

      <Button label="Choisir ce mot de passe" onPress={handleSubmit} loading={submitting} />
      <Button
        label="Annuler et se déconnecter"
        variant="ghost"
        onPress={onCancel}
        disabled={submitting}
      />
    </>
  );
}

export function ConnexionScreen() {
  const {
    signIn,
    signUp,
    passwordRecovery,
    recoveryError,
    dismissRecoveryError,
    cancelPasswordRecovery,
  } = useAuth();

  const [mode, setMode] = useState<Mode>('connexion');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  // La récupération l'emporte sur le mode choisi par l'utilisateur : tant que le
  // mot de passe n'est pas changé, l'écran ne peut pas proposer autre chose.
  const effectiveMode: Mode = passwordRecovery ? 'nouveau-mot-de-passe' : mode;
  const isSignUp = effectiveMode === 'inscription';

  const clearMessages = useCallback(() => {
    setError(null);
    setNotice(null);
    setPassword('');
  }, []);

  const goToForgotPassword = useCallback(() => {
    // Le message d'un lien expiré recommande justement de demander un nouveau
    // lien : le laisser affiché pendant que l'adhérent le fait serait redondant.
    dismissRecoveryError();
    clearMessages();
    setMode('mot-de-passe-oublie');
  }, [clearMessages, dismissRecoveryError]);

  const backToSignIn = useCallback(() => {
    clearMessages();
    setMode('connexion');
  }, [clearMessages]);

  const toggleMode = useCallback(() => {
    setMode((current) => (current === 'connexion' ? 'inscription' : 'connexion'));
    clearMessages();
  }, [clearMessages]);

  /**
   * Abandonner la récupération déconnecte.
   *
   * C'est volontaire, et c'est le point à ne pas rater : le lien a ouvert une
   * **vraie** session. La conserver sans changer le mot de passe laisserait
   * l'adhérent connecté par un lien resté valable — c'est-à-dire une porte
   * d'entrée qui survit à l'e-mail qui l'a ouverte. Quiconque a accès à la boîte
   * mail pourrait alors se connecter à tout moment.
   */
  const cancelRecovery = useCallback(() => {
    void cancelPasswordRecovery();
  }, [cancelPasswordRecovery]);

  const handleSubmit = useCallback(() => {
    const trimmedEmail = email.trim();

    // Validation locale d'abord : inutile de faire un aller-retour réseau pour
    // apprendre qu'un champ obligatoire est vide, et le message est plus précis
    // que celui du serveur.
    //
    // Chaque phrase passe par `userMessage` : sans ce marquage, elle serait
    // prise pour un message technique non reconnu et remplacée par « Une erreur
    // inattendue est survenue. Réessayez… » — un conseil faux, puisque
    // réessayer avec le même champ vide échouera identiquement.
    if (isSignUp && displayName.trim() === '') {
      setError(userMessage('Indiquez le nom qui apparaîtra auprès des autres membres.'));
      return;
    }
    if (trimmedEmail === '') {
      setError(userMessage('Indiquez votre adresse e-mail.'));
      return;
    }
    // Seulement à l'inscription : à la connexion le mot de passe est **présenté**,
    // pas choisi, et GoTrue ne refuse jamais pour sa longueur — il vérifie le mot
    // de passe, il n'en juge pas la forme. Le refuser ici empêcherait d'entrer un
    // compte dont le mot de passe est plus court que ce réglage, en affirmant
    // quelque chose de faux sur son propre mot de passe. Voir la constante.
    if (isSignUp && password.length < MIN_PASSWORD_LENGTH) {
      setError(
        userMessage(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`),
      );
      return;
    }

    setError(null);
    setNotice(null);
    setSubmitting(true);

    void (async () => {
      try {
        if (isSignUp) {
          const result = await signUp(trimmedEmail, password, displayName);

          if (result.needsEmailConfirmation) {
            setNotice(
              userMessage(
                `Un e-mail de confirmation a été envoyé à ${trimmedEmail}. ` +
                  'Ouvrez-le pour activer votre compte, puis connectez-vous.',
              ),
            );
            setMode('connexion');
            setPassword('');
          }

          // Sinon, **rien à faire ici**, et c'est volontaire : le compte est créé
          // et une session est rendue. `signUp` a alors déjà prévenu ses
          // abonnés — vérifié dans `@supabase/auth-js` 2.116.0
          // (`GoTrueClient.signUp`) :
          //
          //     if (data.session) {
          //       await this._saveSession(data.session);
          //       await this._notifyAllSubscribers('SIGNED_IN', session);
          //     }
          //
          // `AuthProvider` écoute cet événement, `status` passe à `signedIn`, et
          // `RootNavigator` bascule sur les onglets : l'adhérent entre sans
          // qu'aucun appel ne soit nécessaire. Rappeler `signIn` ici serait une
          // **seconde** authentification pour rien, et un message de confirmation
          // ne serait jamais lu — cet écran est démonté à l'instant où la session
          // arrive.
          //
          // C'est le chemin **normal** : la confirmation par e-mail est désactivée
          // dans le tableau de bord (voir `README.md` §4). La branche ci-dessus
          // n'existe que pour le cas où elle serait activée.
          // `check-password-policy` tient les deux : la propriété du paquet est
          // relue dans `node_modules`, et l'absence d'appel à `signIn` ici.
        } else {
          await signIn(trimmedEmail, password);
        }
      } catch (caught) {
        setError(caught);
      } finally {
        setSubmitting(false);
      }
    })();
  }, [displayName, email, isSignUp, password, signIn, signUp]);

  return (
    <Screen scrollable>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.brand}>
          <AppText variant="title">FCPE Frères Lumières</AppText>
          <AppText variant="caption">Écoles Frères Lumières — Montmagny</AppText>
        </View>

        {/* Un lien expiré, ou illisible, se dit ici. Sans ce bandeau, l'adhérent
            qui ouvre son e-mail le lendemain ne verrait rien du tout : il en
            conclurait que le lien ne marche pas, pas qu'il a expiré.

            Le message est marqué parce qu'il est **déjà** rédigé pour l'adhérent
            — il vient de `describeRecoveryError`. Non marqué, il serait pris
            pour un message technique non reconnu et remplacé par « Une erreur
            inattendue est survenue. Réessayez… », c'est-à-dire par un conseil de
            réessayer alors que le lien restera expiré : la raison d'être de ce
            message disparaîtrait à l'affichage. */}
        {recoveryError === null ? null : (
          <ErrorNotice tone="info" error={userMessage(recoveryError)} />
        )}

        <Card>
          {effectiveMode === 'nouveau-mot-de-passe' ? (
            <NewPasswordForm onCancel={cancelRecovery} />
          ) : effectiveMode === 'mot-de-passe-oublie' ? (
            <ForgotPasswordForm onBack={backToSignIn} />
          ) : (
            <>
              <AppText variant="heading">{isSignUp ? 'Créer un compte' : 'Connexion'}</AppText>

              {isSignUp ? (
                <TextField
                  label="Nom affiché"
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Prénom et nom"
                  autoCapitalize="words"
                  autoComplete="name"
                  maxLength={MAX_DISPLAY_NAME_LENGTH}
                  editable={!submitting}
                />
              ) : null}

              <TextField
                label="Adresse e-mail"
                value={email}
                onChangeText={setEmail}
                placeholder="prenom.nom@exemple.fr"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                editable={!submitting}
              />

              <TextField
                label="Mot de passe"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                editable={!submitting}
                hint={isSignUp ? `Au moins ${MIN_PASSWORD_LENGTH} caractères.` : null}
                onSubmitEditing={handleSubmit}
                returnKeyType="go"
              />

              {error === null ? null : <ErrorNotice error={error} />}
              {notice === null ? null : <ErrorNotice tone="info" error={notice} />}

              <Button
                label={isSignUp ? 'Créer mon compte' : 'Se connecter'}
                onPress={handleSubmit}
                loading={submitting}
              />
              <Button
                label={isSignUp ? "J'ai déjà un compte" : 'Créer un compte'}
                variant="ghost"
                onPress={toggleMode}
                disabled={submitting}
              />
            </>
          )}
        </Card>

        {effectiveMode === 'connexion' || effectiveMode === 'inscription' ? (
          <Button
            label="Mot de passe oublié ?"
            variant="ghost"
            onPress={goToForgotPassword}
            disabled={submitting}
          />
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    gap: spacing.lg,
  },
  brand: {
    gap: spacing.xs,
  },
});
