import { useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { AppText, Button, Card, ErrorNotice, Screen, TextField } from '@/components';
import { userMessage } from '@/errors';
import { spacing } from '@/theme';

/**
 * Les cinq visages du même écran.
 *
 * Les cinq écrans demandés à la conception sont respectés : la récupération de
 * mot de passe et le renvoi de l'e-mail de confirmation n'ajoutent pas d'écran,
 * ils ajoutent des **modes** à celui-ci. Ce n'est pas un raccourci — c'est le
 * même endroit dans l'application, « tout ce qui se passe avant d'être entré »,
 * et les cinq modes s'excluent.
 */
type Mode =
  | 'connexion'
  | 'inscription'
  | 'mot-de-passe-oublie'
  | 'nouveau-mot-de-passe'
  | 'renvoyer-confirmation';

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
 * Renvoi de l'e-mail de confirmation d'inscription.
 *
 * **Pourquoi ce mode existe.** Un lien de confirmation expire — c'est le cas
 * courant, on ouvre rarement son courrier dans la journée. L'adresse reste alors
 * non confirmée : l'adhérent ne peut pas se connecter, et il n'y avait **aucun
 * recours en ligne**. Le message qu'il lisait lui disait d'en demander un
 * nouveau, sans que l'application sache le faire.
 *
 * **La phrase ne dit jamais si l'adresse existe**, ni si elle est déjà
 * confirmée — même règle que la demande de réinitialisation, et pour la même
 * raison : cet écran est public. Une phrase qui distinguerait les cas dirait à
 * un inconnu quelles adresses sont inscrites. D'où la forme conditionnelle, qui
 * est la garantie et non une politesse.
 *
 * Le champ est un état à part entière, comme pour la réinitialisation : une fois
 * la demande faite, il n'y a plus rien à saisir, et laisser le formulaire
 * affiché inviterait à appuyer une seconde fois — ce qui déclencherait la
 * limitation de débit de Supabase.
 */
function ResendConfirmationForm({ onBack }: { readonly onBack: () => void }) {
  const { resendConfirmation } = useAuth();

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
        await resendConfirmation(trimmedEmail);
        setSentTo(trimmedEmail);
      } catch (caught) {
        setError(caught);
      } finally {
        setSubmitting(false);
      }
    })();
  }, [email, resendConfirmation]);

  if (sentTo !== null) {
    return (
      <>
        <AppText variant="heading">Vérifiez vos e-mails</AppText>
        <ErrorNotice
          tone="info"
          error={userMessage(
            `Si une confirmation est en attente pour ${sentTo}, un nouvel e-mail vient ` +
              "d'être envoyé. Ouvrez-le, puis revenez vous connecter.",
          )}
        />
        <Button label="Retour à la connexion" variant="ghost" onPress={onBack} />
      </>
    );
  }

  return (
    <>
      <AppText variant="heading">Renvoyer la confirmation</AppText>
      <AppText variant="caption">
        Indiquez l’adresse utilisée à l’inscription : un nouvel e-mail de confirmation vous sera
        envoyé.
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

      <Button label="Renvoyer l’e-mail" onPress={handleSubmit} loading={submitting} />
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
    status,
    signIn,
    signUp,
    passwordRecovery,
    linkMessage,
    dismissLinkMessage,
    cancelPasswordRecovery,
  } = useAuth();
  const navigation = useNavigation();

  /**
   * Y a-t-il où revenir ?
   *
   * `canGoBack()` est faux quand cet écran est **racine** — le cas de la
   * récupération, où la pile ne contient que lui. Il est vrai quand la pile
   * « Plus » l'a empilé sous « Espace membres », et c'est là qu'un retour doit
   * être offert : cet écran n'a pas d'en-tête de navigation, donc pas de flèche
   * système.
   *
   * La valeur est lue au rendu, et elle est stable : la pile ne change pas sous
   * l'écran sans qu'il soit remonté.
   */
  const peutRevenir = navigation.canGoBack();

  const revenir = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

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

  /**
   * La connexion réussie referme l'écran.
   *
   * POURQUOI C'EST ICI, ET NON DANS LE FOURNISSEUR
   * ----------------------------------------------
   * `AuthProvider` publie `status` et ne navigue jamais : c'est ce qui évite les
   * doubles navigations, et cette règle n'a pas changé. Mais elle suffisait tant
   * que la connexion **était** la racine de l'application — il n'y avait rien à
   * fermer. Depuis que l'application est publique et que la connexion s'empile
   * par-dessus, quelqu'un doit refermer cette pile, et le seul endroit qui sache
   * qu'on y est entré **par ici** est cet écran.
   *
   * `passwordRecovery` est exclu : dans ce cas l'écran n'est pas empilé mais
   * racine, et `RootNavigator` le remplace en changeant d'ensemble de routes —
   * un `goBack()` n'y aurait nulle part où aller.
   */
  useEffect(() => {
    if (status === 'signedIn' && !passwordRecovery) {
      navigation.goBack();
    }
  }, [status, passwordRecovery, navigation]);

  /**
   * Efface ce que l'écran affichait, et ce que le **fournisseur** y avait mis.
   *
   * Les deux moitiés vont ensemble : `linkMessage` ne vit pas dans l'état local,
   * mais il s'affiche ici. Le laisser en place pendant que l'adhérent passe à un
   * autre formulaire ferait survivre « Votre adresse est confirmée » à un écran
   * qui ne parle plus de cela.
   */
  const clearMessages = useCallback(() => {
    setError(null);
    setNotice(null);
    setPassword('');
    dismissLinkMessage();
  }, [dismissLinkMessage]);

  const goToForgotPassword = useCallback(() => {
    // Le message d'un lien expiré recommande justement de demander un nouveau
    // lien : le laisser affiché pendant que l'adhérent le fait serait redondant.
    // `clearMessages` s'en charge — l'appeler ici en plus serait une seconde
    // écriture de la même règle, et deux écritures peuvent diverger.
    clearMessages();
    setMode('mot-de-passe-oublie');
  }, [clearMessages]);

  const goToResendConfirmation = useCallback(() => {
    // Même raison, autre flux : le message d'un lien de confirmation échoué
    // recommande d'en demander un nouveau, et le formulaire est juste après.
    clearMessages();
    setMode('renvoyer-confirmation');
  }, [clearMessages]);

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
                  'Ouvrez-le pour activer votre compte, puis connectez-vous. ' +
                  'Votre demande d’adhésion sera ensuite examinée par le bureau de ' +
                  'l’association.',
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
    //  PAS DE `edges` ICI, ET C'EST DÉLIBÉRÉ.
    //
    //  Cet écran sert deux fois : plein écran pendant une récupération, et
    //  empilé sous « Espace membres ». Les deux montages sont **sans en-tête de
    //  navigation** — celui de la récupération parce qu'il remplace
    //  l'application, celui de l'espace membre parce que l'écran porte déjà son
    //  propre en-tête de marque. C'est donc à lui de protéger l'encoche, et le
    //  bord par défaut du composant (`['top']`) le fait.
    //
    //  Le lui retirer avait été tenté pour l'afficher sous l'en-tête de la pile
    //  « Plus » : la flèche de retour aurait été gratuite, mais l'encoche
    //  l'aurait été aussi, deux fois. Le retour est donc offert plus bas, en
    //  toutes lettres, et seulement quand il y a où revenir.
    <Screen scrollable>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.brand}>
          <AppText variant="title">Parents d’élèves des Frères Lumières</AppText>
          <AppText variant="caption">Écoles Frères Lumières — Montmagny</AppText>
        </View>

        {/* Ce qu'un lien reçu vient d'apprendre se dit ici, et c'est le **seul**
            endroit où l'application parle d'un lien. Trois cas y arrivent, et
            aucun ne doit rester muet :

              - une confirmation d'inscription aboutie — sans ce bandeau,
                l'adhérent voit l'écran de connexion s'ouvrir sans la moindre
                indication que son clic a fonctionné ;
              - un lien de confirmation expiré — son adresse n'est pas
                confirmée, donc il ne peut pas entrer, et rien ne le lui dit ;
              - un lien de réinitialisation expiré, ou illisible.

            Le message est marqué parce qu'il est **déjà** rédigé pour l'adhérent
            — il vient de `describeLinkError`, ou du fournisseur pour la
            confirmation. Non marqué, il serait pris pour un message technique
            non reconnu et remplacé par « Une erreur inattendue est survenue.
            Réessayez… », c'est-à-dire par un conseil de réessayer alors que le
            lien restera expiré : la raison d'être de ce message disparaîtrait à
            l'affichage. */}
        {linkMessage === null ? null : <ErrorNotice tone="info" error={userMessage(linkMessage)} />}

        <Card>
          {effectiveMode === 'nouveau-mot-de-passe' ? (
            <NewPasswordForm onCancel={cancelRecovery} />
          ) : effectiveMode === 'mot-de-passe-oublie' ? (
            <ForgotPasswordForm onBack={backToSignIn} />
          ) : effectiveMode === 'renvoyer-confirmation' ? (
            <ResendConfirmationForm onBack={backToSignIn} />
          ) : (
            <>
              <AppText variant="heading">{isSignUp ? 'Créer un compte' : 'Connexion'}</AppText>

              {/*  Ce qu'un compte donne, et ce qu'il ne donne pas tout de suite.

                  L'application s'ouvre **sans compte** : ce formulaire ne sert
                  donc pas à lire les menus ou l'agenda, mais à rejoindre
                  l'espace des membres. Et cet espace ne s'ouvre qu'après
                  l'accord du bureau — un compte en attente ne lit pas la
                  discussion, parce que la politique RLS la lui refuse.

                  Le dire ici, avant la saisie, évite la question « pourquoi la
                  discussion est-elle vide ? » posée trois jours plus tard. */}
              {isSignUp ? (
                <AppText variant="caption">
                  Ce compte sert à rejoindre l’espace des membres de l’association. Votre demande
                  sera examinée par le bureau : la discussion s’ouvrira une fois votre inscription
                  acceptée. Pour lire les menus, l’agenda et les actualités, aucun compte n’est
                  nécessaire.
                </AppText>
              ) : null}

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

        {/* Le renvoi de confirmation ne s'affiche **qu'en mode connexion** : à
            l'inscription, c'est le formulaire lui-même qui envoie l'e-mail, et
            proposer d'en renvoyer un pour un compte qui n'existe pas encore
            n'aurait pas de sens. */}
        {effectiveMode === 'connexion' ? (
          <Button
            label="Renvoyer l’e-mail de confirmation"
            variant="ghost"
            onPress={goToResendConfirmation}
            disabled={submitting}
          />
        ) : null}

        {/* Le retour, écrit en toutes lettres, et seulement quand il y a où
            revenir.

            L'écran est monté sans en-tête de navigation : sous « Espace
            membres » il n'y a donc pas de flèche système, et un parent qui
            ouvre cette rubrique doit pouvoir revenir au menu. La barre d'onglets
            et le geste système le permettent, mais les deux se devinent — ce
            bouton, lui, se voit.

            Pendant une récupération, la pile ne contient que cet écran :
            `canGoBack()` est faux, et le bouton disparaît. C'est exactement ce
            qu'on veut — on ne « revient » pas d'un lien de réinitialisation. */}
        {peutRevenir ? (
          <Button label="Retour" variant="ghost" onPress={revenir} disabled={submitting} />
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
