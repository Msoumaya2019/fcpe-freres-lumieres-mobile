# Le courriel d'inscription — le texte à coller

**Où :** tableau de bord Supabase → **Authentication** → **Email Templates** →
**Confirm signup**.

**Pourquoi ce fichier existe.** Ce modèle ne vit **que** dans le tableau de bord : il n'y a pas de
`supabase/config.toml` dans ce dépôt, et aucun test ne peut le lire. Ce fichier en est donc la
**copie de secours** — si le modèle est effacé, ou s'il faut le rétablir sur un autre projet, le
texte est ici, mot pour mot. Il ne se substitue pas au tableau de bord, et rien ne mesure l'accord
entre les deux : c'est une copie, pas une source vérifiée.

**Ce que ce courriel apporte, et pourquoi il compte.** C'est le **seul** message que reçoit
**chaque** futur adhérent, au moment précis où ses données sont collectées. C'est donc l'endroit
naturel pour l'information prévue par l'article 13 du RGPD — et le seul qui ne demande **aucune
recompilation** : le modèle est servi par Supabase, pas par l'application installée. La page vers
laquelle il renvoie est <https://fcpe-freres-lumieres-admin.vercel.app/donnees-personnelles>,
publique et lisible sans compte (mesuré le 21 septembre 2026).

---

## 1. L'objet du message

À coller dans le champ **Subject** :

```
Confirmez votre adresse — Parents d'élèves des Frères Lumières
```

Le tiret est un **tiret cadratin** (`—`), pas un trait d'union. Supabase n'impose aucune longueur,
mais au-delà de 60 caractères environ, les clients de messagerie tronquent l'objet : celui-ci en
fait 57.

## 2. Le corps du message

À coller dans le champ **Message body**. C'est du HTML, et **seul le contenu du bloc** se colle —
les trois accents graves qui l'ouvrent et le ferment n'en font pas partie.

```html
<div style="margin:0;padding:24px 12px;background:#f4f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #dde3f0;border-radius:12px;">
    <tr>
      <td style="padding:28px 28px 8px 28px;">
        <p style="margin:0 0 4px 0;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;color:#5b6478;">Parents d'élèves des Frères Lumières</p>
        <h1 style="margin:0 0 16px 0;font-size:22px;line-height:1.3;color:#1b2130;">Confirmez votre adresse</h1>
        <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#1b2130;">Bonjour,</p>
        <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#1b2130;">Vous venez de demander un compte pour l'application de l'association. Il reste une étape : confirmer que cette adresse est bien la vôtre.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 28px 8px 28px;">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 22px;background:#2554D6;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">Confirmer mon adresse</a>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px 8px 28px;">
        <p style="margin:0 0 16px 0;font-size:13px;line-height:1.6;color:#5b6478;">Si le bouton ne s'ouvre pas, copiez cette adresse dans votre navigateur :<br><a href="{{ .ConfirmationURL }}" style="color:#2554D6;word-break:break-all;">{{ .ConfirmationURL }}</a></p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 28px 8px 28px;">
        <hr style="border:0;border-top:1px solid #dde3f0;margin:0 0 16px 0;">
        <p style="margin:0 0 8px 0;font-size:14px;font-weight:600;color:#1b2130;">Vos données personnelles</p>
        <p style="margin:0 0 12px 0;font-size:13px;line-height:1.6;color:#5b6478;">Pour vous rendre ce service, l'association conserve votre adresse e-mail, un nom affiché et votre rôle. Rien d'autre. Ce que nous conservons, pendant combien de temps, qui y a accès et comment demander leur effacement est expliqué ici :</p>
        <p style="margin:0 0 16px 0;font-size:13px;line-height:1.6;"><a href="https://fcpe-freres-lumieres-admin.vercel.app/donnees-personnelles" style="color:#2554D6;">Vos données personnelles — ce que nous conservons, et pourquoi</a></p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 28px 28px 28px;">
        <hr style="border:0;border-top:1px solid #dde3f0;margin:0 0 16px 0;">
        <p style="margin:0 0 8px 0;font-size:13px;line-height:1.6;color:#5b6478;">Une question, ou vous n'êtes pas à l'origine de cette inscription ? Écrivez au bureau : <a href="mailto:parentsfrereslumieres@gmail.com" style="color:#2554D6;">parentsfrereslumieres@gmail.com</a>. Si vous n'avez rien demandé, ignorez ce message : sans ce clic, aucun compte n'est activé.</p>
      </td>
    </tr>
  </table>
</div>
```

## 3. Ce que ce texte contient, et qu'il ne faut pas retirer

| Élément                                | Pourquoi il est là                                                                                                                                          |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{{ .ConfirmationURL }}`                | **Le lien qui active le compte.** C'est une variable Supabase : recopiée telle quelle, elle est remplacée par l'adresse réelle à l'envoi. La réécrire à la main casse le flux |
| Le lien vers `/donnees-personnelles`    | L'information des familles, au moment où leurs données sont collectées                                                                                       |
| L'adresse du bureau                     | Un destinataire pour toute question, et pour la rectification                                                                                                |
| La phrase « sans ce clic, aucun compte n'est activé » | Elle dit la vérité : tant que le lien n'est pas ouvert, le compte reste `en_attente` — un visiteur ne lit rien |

**Deux pièges d'édition.** Les clients de messagerie ignorent les feuilles de style externes : les
styles doivent rester **en ligne** (`style="…"`), comme ci-dessus. Et un modèle vidé de sa variable
`{{ .ConfirmationURL }}` n'échoue pas à l'envoi — il envoie un lien mort, ce qui est pire : le
compte ne s'active jamais, et personne ne le voit avant qu'un parent se plaigne.

## 4. Le geste

1. Tableau de bord Supabase → **Authentication** → **Email Templates**.
2. Choisir **Confirm signup** dans la liste.
3. Coller l'objet au §1 dans **Subject**, puis le bloc HTML du §2 dans **Message body**.
4. **Save**.
5. S'envoyer le courriel à soi-même : créer un compte avec une adresse que vous lisez, et vérifier
   que le message arrive, que le bouton s'ouvre, et que le lien « Vos données personnelles »
   s'ouvre **sans connexion**.

Ce cinquième point est le seul qui compte vraiment : un modèle qui « a l'air bon » dans le tableau
de bord peut produire un message illisible ou un lien mort.
