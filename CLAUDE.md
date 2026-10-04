@.claude/conventions.md

# K2

## Description

Jeu de pixel art où l'on escalade le K2 (8 611 m). Vue de profil : la montagne à droite, le héros à gauche qui grimpe en alternant Gauche / Droite. Épique plutôt que réaliste : seul face aux éléments et à la falaise.

- Catégorie : **secondaire** (socle seulement ; les fonctionnalités avancées ne se développent que sur demande).
- Cible : **mobile et bureau** (tactile et clavier).
- Production : https://supershivas.github.io/k2/

Gameplay : cycle jour/nuit, vent (rafales à encaisser en maintenant « Prise »), neige, froid, oxygène au-dessus de 6 500 m, ressources (vivres, gaz, bouteilles d'O₂), dépôts sur la paroi, camps d'altitude qui servent de points de retour après une chute. Éditeur de sprites 16×16 intégré.

## Stack

Vanilla JS statique (modules ES, aucune dépendance, aucun build), canvas 200×320 en pixel art. Hébergement GitHub Pages depuis `main` (racine). Icônes Tabler (webfont, CDN). Données locales (`localStorage`, préfixe `k2:`), exportables en JSON dans les réglages. Aucun Supabase.

## Structure

- `index.html`, `style.css` : page unique, dialogues natifs `<dialog>`.
- `js/game.js` : simulation (altitude, énergie, chaleur, météo, temps) et rendu canvas.
- `js/sprites.js` : palette rétro de 16 couleurs, sprites par défaut, chargement (local > `sprites.json` du dépôt > défauts), publication GitHub.
- `js/editor.js` : éditeur de sprites. `js/main.js` : HUD, commandes, réglages, export/import.
- `version.json`, `CHANGELOG.md` : versions. `app-update.js`, `mobile.css`, `design-tokens.json` : synchronisés depuis le design system.
- `sprites.json` : créé par le bouton « Publier les sprites » des réglages (absent tant que rien n'est publié, d'où un 404 inoffensif).

## Exceptions aux conventions

- La palette du canvas (16 couleurs rétro) est volontairement hors tokens ; l'interface autour utilise les tokens.
- Le jeton GitHub (réglages) est saisi par l'utilisateur et stocké uniquement dans son navigateur (`localStorage`), jamais commité. Il sert à écrire `sprites.json` via l'API contents.
- Thème sombre unique (le jeu est nocturne) : pas de bascule clair/sombre.

## Pièges connus

- Les modales sont des `<dialog>` : `app-update.js` les considère comme une saisie en cours et diffère le rechargement. La progression est sauvegardée toutes les 2 s et à `pagehide`.
- Le toast est un `popover` pour passer au-dessus des `<dialog>` ouverts.
- Les icônes Tabler viennent d'un CDN : sans réseau, elles n'apparaissent pas (le jeu reste jouable).
