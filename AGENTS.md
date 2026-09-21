# Consignes pour un agent de code

Ce fichier est lu **automatiquement** par les agents qui connaissent la convention
`AGENTS.md` — Codex, Cursor, Copilot, et Claude Code par le renvoi de `CLAUDE.md`.
Il dit ce qui n'est pas négociable ici. Le **détail** vit dans les documents du
dépôt : lisez-les avant d'écrire du code, et ne les recopiez pas.

## Les trois documents qui font foi

| Document             | Ce qu'il porte                                                                 |
| -------------------- | ------------------------------------------------------------------------------ |
| `README.md`          | l'installation, la configuration, la base, l'arborescence, les limites connues |
| `SECURITY.md`        | les données personnelles, les traitements, l'effacement — document public      |
| `MISE-EN-SERVICE.md` | les gestes qui ne s'automatisent pas, dans l'ordre                             |

## Avant de pousser : `npm run verify`

```bash
npm run verify
```

Une seule commande, et elle est **obligatoire**. Elle enchaîne le formatage,
ESLint, `tsc`, les bancs, l'intégrité de l'installation, les flux GitHub,
l'analyse du SQL et l'export Android. La CI exécute exactement la même chose.
**Un code qui compile n'est pas un code juste.**

## Ce qui ne se négocie pas

1. **Aucun secret dans le dépôt** — il est **public**. Une variable
   `EXPO_PUBLIC_*` finit **en clair** dans le bundle : elle ne doit jamais porter
   une clé `service_role`, un jeton, un mot de passe ou un certificat.
2. **La sécurité est dans les politiques RLS**, jamais dans le code client.
   `supabase/migrations/` fait foi. Un refus se manifeste par une **liste vide**,
   pas par une erreur : un écran muet peut être un refus.
3. **Un seul lecteur de `process.env`** : `src/config/env.ts`. L'application
   démarre sans clés, et affiche un écran qui les explique.
4. **Les dates civiles passent par `toIsoDate` / `parseCivilDate`**, jamais par
   `toISOString()` : un décalage de fuseau change le jour d'une cantine.
5. **Toute phrase montrée à un adhérent passe par `userMessage()`** — à
   l'affichage comme dans les erreurs.
6. **Ne renommez pas les identifiants techniques** — `fcpe-freres-lumieres`,
   `fcpefl`, `fr.fcpe.frereslumieres`, le préfixe `fcpe.`. Ils sont liés au projet
   Expo, aux liens de confirmation des e-mails et à la clef Firebase : les changer
   casse ces trois choses **en silence**.
7. **Le français est la langue du produit, des commentaires et des messages de
   commit.**

## Les pièges qui coûtent une heure

- **`npm run verify` échoue à sa dernière étape si `dist/` existe déjà** : le
  garde-fou de suppression compte les suppressions **du tour courant**. Déplacez
  `dist` avant de relancer, sans quoi l'échec ne dit rien du code.
- **`npm audit fix --force` est interdit** : il casse la matrice de versions
  d'Expo.
- **Il n'y a pas de `supabase/config.toml`** : les réglages vivent dans le tableau
  de bord Supabase, et ils sont consignés dans `README.md` §4.
- **La compilation Android passe par EAS** et consomme un quota mensuel. Le refus
  arrive **après** l'envoi du projet : lisez le journal en entier avant
  d'incriminer la configuration.
- **Le numéro de version est un geste** : aucun outil ne bouge `expo.version`. Il
  s'écrit dans `app.json`, et les documents qui nomment les binaires doivent
  suivre — un contrôle le tient.

## Ce qu'il ne faut pas faire

- **Ne recréez pas le projet**, et ne repartez pas de zéro : le dépôt est **en
  service**, et une reconstruction perdrait les migrations et l'historique.
- **Ne modifiez pas un document pour faire passer un contrôle.** Si un banc tombe,
  il nomme ce qui manque : corrigez la cause, jamais l'assertion.
