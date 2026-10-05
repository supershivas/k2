@.claude/conventions.md

# K2

## Description

Jeu de pixel art où l'on escalade le K2 (8 611 m). La montagne est vue de face, le héros minuscule grimpe en alternant Gauche / Droite (deux fois le même côté : traversée latérale). Épique plutôt que réaliste : seul face aux éléments et à la falaise. Pas de sous-titre ni de baseline sous le nom du jeu.

- Catégorie : **secondaire** (socle seulement ; les fonctionnalités avancées ne se développent que sur demande).
- Cible : **mobile et bureau** (tactile et clavier).
- Production : https://supershivas.github.io/k2/

Gameplay : cycle jour/nuit, vent (rafales qui déportent, à encaisser en maintenant « Prise »), neige, froid, oxygène au-dessus de 6 500 m, ressources à ramasser sur la paroi (vivres, gaz, O₂, une tous les ~110 m, visibles en rose fluo), blocs, verglas et chutes de pierres à esquiver, camps d'altitude qui servent de points de retour après une chute, radio météo (écran Game Boy) pour les prévisions du lendemain. Éditeur de sprites 8×8 intégré.

## Stack

Vanilla JS statique (modules ES, aucune dépendance, aucun build), canvas 100×160 en pixel art. Hébergement GitHub Pages depuis `main` (racine). Icônes Tabler (webfont, CDN). Données locales (`localStorage`, préfixe `k2:`), exportables en JSON dans les réglages. Aucun Supabase.

## Structure

- `index.html`, `style.css` : page unique, dialogues natifs `<dialog>`.
- `js/game.js` : simulation (altitude, énergie, chaleur, météo, temps) et rendu canvas.
- `js/sprites.js` : palette de 5 couleurs (4 verts Game Boy + rose fluo), sprites par défaut, chargement (local > `sprites.json` du dépôt > défauts), publication GitHub.
- `js/pixfont.js` : police pixel 3×5 (décor et écran radio). `js/editor.js` : éditeur de sprites. `js/main.js` : HUD, commandes, réglages, export/import.
- `version.json`, `CHANGELOG.md` : versions. `app-update.js`, `mobile.css`, `design-tokens.json` : synchronisés depuis le design system.
- `sprites.json` : créé par le bouton « Publier les sprites » des réglages (absent tant que rien n'est publié, d'où un 404 inoffensif).

## Exceptions aux conventions

- La palette du jeu (4 verts Game Boy + rose fluo `#FF3CAC`) est volontairement hors tokens : canvas, HUD, boutons de commande et accueil. Les en-têtes, réglages et modales utilisent les tokens. `PALETTE` (js/sprites.js) et les variables `--gb0..3`, `--fluo` (style.css) doivent rester identiques.
- Le jeton GitHub (réglages) est saisi par l'utilisateur et stocké uniquement dans son navigateur (`localStorage`), jamais commité. Il sert à écrire `sprites.json` via l'API contents.
- Thème sombre unique (le jeu est nocturne) : pas de bascule clair/sombre.

## Pièges connus

- Les modales sont des `<dialog>` : `app-update.js` les considère comme une saisie en cours et diffère le rechargement. La progression est sauvegardée toutes les 2 s et à `pagehide`.
- Le toast est un `popover` pour passer au-dessus des `<dialog>` ouverts.
- Les icônes Tabler viennent d'un CDN : sans réseau, elles n'apparaissent pas (le jeu reste jouable).
