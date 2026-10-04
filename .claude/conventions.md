# Conventions communes — apps Supershivas

Ce fichier vit dans `supershivas/design-system` et il est la source de vérité.
Chaque app en reçoit une copie dans `.claude/conventions.md` via
`scripts/sync-design-system.sh`, lancé automatiquement au début de chaque session.

**Ne modifie jamais `.claude/conventions.md` dans une app.** Il est écrasé à chaque sync.
Si une règle doit changer, propose-la-moi (voir « Évolution de ces règles »).

**Priorité** : le `CLAUDE.md` de l'app prévaut sur ce fichier. En cas de conflit,
applique la règle de l'app et signale-moi le conflit.

## Catégorie : app primaire ou secondaire

Chaque app est **primaire** ou **secondaire**, et son `CLAUDE.md` l'indique dans
sa section Description. Si ce n'est pas indiqué, demande-le-moi avant de
développer une fonctionnalité listée ci-dessous.

- **Primaire** : app que j'utilise tous les jours. Elle a toutes les
  fonctionnalités des deux listes.
- **Secondaire** : app d'usage ponctuel. Le socle est obligatoire ; les
  fonctionnalités avancées sont facultatives et ne se développent que sur ma
  demande.

**Socle — toutes les apps**

- Interface en français, cible respectée (voir section 8), zones tactiles de 44 px.
- `version.json` et `CHANGELOG.md` (section 2).
- En-tête : nom cliquable à gauche, roue crantée à droite (section 3).
- Réglages : version, 5 dernières versions, export des données en JSON (section 3).
- Mise à jour automatique avec toast (section 4).
- Tokens et `mobile.css` du design system (section 5).
- `favicon.svg`, `favicon.ico` et `apple-touch-icon.png` (section 6).
- Aucun secret commité (section 7).

**Avancé — obligatoire pour une app primaire, facultatif pour une secondaire**

- Données synchronisées entre appareils (Supabase) et authentification (section 7).
- Mode sombre (section 8).
- PWA installable : `manifest.json`, icônes 192 et 512, service worker (section 6).
- Import des données, pour restaurer un export JSON.
- Mise à jour en temps réel entre onglets et appareils.
- Corbeille ou annulation d'une suppression.
- Parité visuelle stricte avec les autres apps primaires (même sidebar,
  mêmes composants).

---

## 1. Git et déploiement

- Pousse toujours directement sur `main`, sauf si je demande explicitement une branche.
- Ne crée pas de branche `claude/...` ni de pull request par défaut.
- Un push sur `main` déploie en production (Vercel ou GitHub Pages). Vérifie que
  l'app se charge sans erreur avant de pousser.
- Messages de commit en français, courts, à l'impératif : « Ajoute l'export JSON ».
- Après chaque nouvelle version poussée, donne-moi l'URL de production cliquable,
  pour que je l'ouvre directement sur ordinateur comme sur téléphone.

## 2. Versioning

- La version suit le format `MAJEUR.MINEUR.CORRECTIF` (ex. `1.4.2`). Chaque push
  qui change ce que voit ou vit l'utilisateur incrémente un des trois niveaux :
  - **correctif** (`1.4.2` → `1.4.3`) : correction de bug, ajustement visuel, texte ;
  - **mineur** (`1.4.3` → `1.5.0`) : nouvelle fonctionnalité visible ; le correctif
    repart à 0 ;
  - **majeur** (`1.5.0` → `2.0.0`) : uniquement sur ma demande.
- En cas de doute entre correctif et mineur, choisis correctif.
- Un push sans effet pour l'utilisateur (documentation, `CLAUDE.md`, configuration,
  scripts de développement) ne change pas la version.
- Une nouvelle app démarre en `1.0.0`.
- La source unique de la version est `version.json`, placé dans `public/` pour les
  apps avec build (Next.js, Vite) et à la racine pour les apps statiques :
  ```json
  {
    "version": "1.4.2",
    "date": "2026-09-24",
    "changes": ["Ajoute l'export JSON", "Corrige le toast sur iOS"]
  }
  ```
- `changes` résume le push en cours, en 1 à 3 lignes lisibles par un non-développeur.
  Garde un historique dans `CHANGELOG.md`, à côté de `version.json` pour que
  l'app puisse le lire (les plus récents en haut, une section `## 1.4.2 — 2026-09-24`
  par version, suivie de ses lignes `- …`).
- Ne code jamais la version en dur ailleurs : l'app lit `version.json`.

## 3. En-tête et réglages

- **À gauche** : le nom de l'app, toujours présent et toujours cliquable. Un clic
  ramène à l'écran d'accueil, depuis n'importe quelle vue, et referme les modales
  ou panneaux ouverts. C'est un vrai lien (`<a>` ou lien du routeur), pas un simple
  texte avec un gestionnaire de clic.
- **À droite** : les réglages s'ouvrent uniquement via une icône roue crantée,
  sans libellé texte, avec `aria-label="Réglages"`.
- Le panneau réglages contient au minimum, dans cet ordre en bas :
  - le numéro de version (`v1.4.2`) ;
  - le changelog récent (5 dernières versions, lu depuis `CHANGELOG.md` ou `version.json`) ;
  - l'export des données (fichier JSON téléchargeable).

## 4. Mise à jour automatique

- L'app vérifie `version.json` (avec `cache: 'no-store'`) au retour au premier plan
  (`visibilitychange`) et toutes les 5 minutes.
- Si la version a changé :
  - si aucune saisie n'est en cours (formulaire modifié, éditeur non sauvegardé,
    modal ouverte), elle recharge la page ;
  - sinon, elle attend la fin de la saisie et ne force jamais un rechargement
    qui ferait perdre du contenu.
- Après rechargement, un toast confirme : « Mis à jour en v1.4.3 ». Utilise un drapeau
  `sessionStorage` pour savoir qu'il faut l'afficher.
- Si l'app a un service worker, déclenche aussi `registration.update()` et
  `skipWaiting()` pour ne pas recharger l'ancienne version depuis le cache.
- `app-update.js` du design system fait tout cela (et lit `CHANGELOG.md`) : utilise-le
  plutôt que de le réécrire. Les apps Next.js (Idée, Source) ont leur équivalent,
  basé sur l'identifiant de build.

## 5. Design system

- Les tokens viennent de `design-tokens.json` (synchronisé depuis ce repo).
  Utilise les variables CSS qui en découlent, jamais des valeurs en dur pour
  couleurs, radii, polices et dimensions partagées.
- Styles mobiles : `mobile.css` du design system. Cadre téléphone sur ordinateur
  (apps uniquement mobiles) : `phone-frame.js` du design system.
- Si tu as besoin d'une valeur qui n'existe pas dans les tokens et qui pourrait
  servir à d'autres apps, propose-la-moi pour le design system au lieu de
  l'inventer localement.
- Les toasts, modales, boutons et l'icône réglages ont le même aspect dans toutes
  les apps.
- Icônes d'interface : uniquement des icônes au trait (*stroke*), jamais
  d'icône pleine (*filled*), d'emoji ou de caractère typographique (●, ☑, ⊞,
  🔗, 🗑…) en guise d'icône. Jeu de référence : Tabler Icons, variante outline
  (webfont `ti ti-*`). Seule exception : les choix de couleur (pastilles,
  roue de couleurs), qui montrent la couleur elle-même.

## 6. Favicon et icônes

Chaque app a, dès sa création :

- `favicon.svg` (qui fonctionne en clair et en sombre) ;
- `favicon.ico` (16, 32 et 48 px, tiré du SVG) : c'est l'adresse que les navigateurs
  demandent par défaut, et celle des liens « Autres apps » des autres apps ;
- `apple-touch-icon.png` en 180 × 180 ;
- si c'est une PWA (obligatoire pour une app primaire), les icônes 192 et 512 du
  `manifest.json`.

Le motif est simple, lisible à 16 px, dans les couleurs des tokens.

## 7. Données et synchronisation

- Je passe du téléphone à deux ordinateurs : les données utilisateur d'une app
  primaire doivent être identiques partout. Jamais de `localStorage` seul pour
  son contenu ; `localStorage` est réservé aux préférences locales (onglet
  ouvert, thème).
- Une app secondaire peut garder ses données en local, à condition que l'export
  JSON des réglages permette de les récupérer.
- Stockage : Supabase. Ne crée pas de nouveau projet Supabase sans me demander.
  Réutilise un projet existant avec des tables préfixées par le nom de l'app.
- Les clés et secrets ne sont jamais commités.

## 8. Interface

- Interface en français.
- Cible : par défaut, une app fonctionne sur téléphone et sur ordinateur. Une app
  peut être déclarée « uniquement mobile » ou « uniquement bureau » : c'est
  indiqué dans la section Description de son `CLAUDE.md`.
- Mobile d'abord : tout doit fonctionner en largeur téléphone (375 px) avant le
  bureau, sauf pour une app uniquement bureau.
- Zones tactiles d'au moins 44 × 44 px.
- Mode sombre selon `prefers-color-scheme`, via les tokens (app primaire ; facultatif
  pour une app secondaire).
- L'app doit s'ouvrir sur ordinateur comme sur téléphone. Si elle est conçue
  uniquement pour le mobile, la version bureau l'affiche dans un cadre de
  téléphone (style iPhone), centré, au lieu de l'étirer sur toute la largeur.
  Utilise pour cela `phone-frame.js` du design system (mode d'emploi en tête
  du fichier), jamais un cadre fait maison.
- Si elle est conçue uniquement pour ordinateur, elle reste accessible sur
  téléphone sans rien casser : un bandeau discret, refermable, indique
  « Cette app est prévue pour un écran d'ordinateur ». Ne l'optimise pas pour
  le mobile sans ma demande.

## 9. Code

- N'ajoute aucune dépendance sans me demander.
- Garde la stack existante de l'app (Next.js ou vanilla JS) ; ne migre pas sans accord.
- Nomme clairement les choses. Des commentaires seulement là où le « pourquoi »
  n'est pas évident.

## 10. Maintenance du CLAUDE.md

- Mets à jour le `CLAUDE.md` de l'app dès qu'une décision durable est prise :
  structure, choix technique, exception à ces conventions, piège rencontré.
- Garde-le court et à jour ; supprime ce qui est devenu faux.
- Si une règle que tu découvres semble valoir pour toutes les apps, ne l'écris pas
  dans ce fichier : propose-la-moi en fin de réponse, sous la forme
  « Proposition pour CONVENTIONS.md : … ».

## 11. Nouvelle app

À la création d'une nouvelle app :

0. Demande-moi si l'app est primaire ou secondaire, et note-le dans son `CLAUDE.md`.
   Pose toujours les décisions à trancher (catégorie, cible, stack, hébergement,
   données…) avec `AskUserQuestion`, en questions à choix multiples.
1. Copie depuis `design-system/templates/` : `sync-design-system.sh` dans `scripts/`,
   `claude-settings.json` en `.claude/settings.json`, `CLAUDE.app.md` en `CLAUDE.md`.
2. Lance le sync.
3. Crée `version.json` (`1.0.0`), les icônes (section 6), l'en-tête (nom cliquable à gauche,
   roue crantée à droite) avec version et changelog dans les réglages,
   et la vérification de mise à jour.
4. Propose-moi d'ajouter l'app au tableau du README de `design-system`.

## Évolution de ces règles

Je modifie ce fichier moi-même, sur GitHub. Les apps récupèrent la nouvelle
version à leur prochaine session.
