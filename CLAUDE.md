@.claude/conventions-jeu.md

# K2

<!-- Ne décrit QUE le jeu actuel (section 15 des conventions). Détail des règles : .claude/conventions-detail.md. -->

## Description

Jeu de pixel art où l'on escalade le K2 (8 611 m). La montagne est vue de face, le héros minuscule grimpe en alternant Gauche / Droite (deux fois le même côté : traversée latérale). Épique plutôt que réaliste : seul face aux éléments. Intention et piliers : `DESIGN.md`.

- **Production** : https://supershivas.github.io/k2/ — **Aperçu** : https://supershivas.github.io/k2/apercu.html
- **Genre** : survie / escalade, partie longue qui se reprend (une ascension = plusieurs jours de jeu), progression permanente (XP, talents, reliques).
- **Vue et rendu** : de face sur la paroi, de profil sous un dévers et sur les pentes douces ; canvas 2D pixel art.
- **Cible** : téléphone en portrait (principale), bureau ; plein écran partout (sans en-tête ni bandes), installable (manifest, `display: standalone`).
- **Session** : une ascension se sauvegarde toute seule et se reprend.
- **Steam** : navigateur seulement.
- Pas de sous-titre sous le nom (section 3).

### Palette (source : `PALETTE`, `js/sprites.js` ; variables `--gb0..3`, `--fluo` dans `style.css`)

| Index | Valeur | Rôle |
|---|---|---|
| 0 `--gb0` | `#0F380F` | le plus sombre : contours, fonds de HUD |
| 1 `--gb1` | `#306230` | roche, ombres |
| 2 `--gb2` | `#8BAC0F` | roche claire, jauges |
| 3 `--gb3` | `#9BBC0F` | neige, ciel, texte |
| 4 `--fluo` | `#FF3CAC` | ce avec quoi on interagit : héros, ressources, commandes |

Identique entre canvas, HUD, commandes, écran titre ; l'interface (réglages, fenêtres, atelier) reprend la même palette.

### Échelle

- Canvas à l'**échelle entière** qui couvre tout l'écran : la face fait toujours 200 px de large (100 m, `K = 2` px par mètre), centrée ; le reste de la largeur et de la hauteur prolonge le ciel et la roche (`Game.resize`). Taille logique visée ≈ 200 × 320, jusqu'à 720 de large.
- Héros : 16 × 16 px (≈ 8 m). Un bloc ≈ 28 × 18, une tente 16 × 16, une grotte 32 × 24.

### Commandes

| Action | Clavier | Doigt / souris |
|---|---|---|
| Pas gauche / droite (maintenir : marcher sur une pente) | flèches, A/D (touche physique : Q/D en AZERTY) | boutons Gauche / Droite |
| Piton | Espace, ↓, P | bouton Piton |
| Manger / O₂ / Camper (ou grotte) | E / O / C | boutons |
| Sac (inventaire, météo, carte, talents, reliques) | I, M (météo), K (carte) | bouton Sac |
| Réglages | — | roue crantée en haut à droite |

## Stack

- Vanilla JS, modules ES, sans build ni dépendance ; GitHub Pages depuis `main` (racine, avec `.nojekyll` pour servir `CHANGELOG.md`).
- Modules de game-system dans `js/lib/` (suivis par `scripts/sync-game-system.sh` à chaque session) : `app-update`, `keys`, `pointer`, `loop`, `rng`, `save`, `debug`, `game.css`. Outils dans `outils/`.
- Polices et icônes **auto-hébergées** : `fonts/` (DM Mono, licence OFL), `css/icons.css` (Tabler outline, masques SVG). Rien n'est chargé depuis un CDN.
- Données : entrées `k2:save`, `k2:records`, `k2:progress`, `k2:sprites` (versionnées, `js/store.js`), `k2:github-token` (jamais exporté) ; en `?debug=1` : préfixe `k2:debug:`. Export / import JSON dans les réglages (les anciens exports `app: 'k2'` s'importent encore).

## Structure

- `index.html`, `style.css` — canvas plein écran, écran titre, HUD, commandes, fenêtres natives `<dialog>` rattachées au body.
- `js/main.js` — cycle de vie (titre → partie → réglages), plein écran (`fit`), boucle, commandes, sauvegarde, debug.
- `js/game.js` — simulation et rendu (altitude, énergie, chaleur, météo, vues de face / de profil / de marche, cordes). `js/events.js` (30 événements), `js/relics.js` (10 reliques), `js/progress.js` (XP, talents).
- `js/puzzles.js` (3 mini-puzzles), `js/bag.js` (sac), `js/store.js` (stockage), `js/sprites.js` + `js/editor.js` (sprites et atelier), `js/pixfont.js` (police pixel 3×5).
- `test/` — `node outils/test-run.mjs`. `apercu.html` — le jeu dans un cadre de téléphone.

## Vérifier et livrer

```bash
node outils/test-run.mjs        # progression, stockage, hasard à graine
node outils/captures.mjs --clic "#btn-play"   # téléphone + bureau, sans erreur console
node outils/audit-ecran.mjs     # débordement, cibles
node outils/stamp-version.mjs   # après chaque changement de version.json
```

Debug : `?debug=1[&seed=42]` → `window.__jeu` (`state()`, `teleport('dever1' | 'pente1' | 'puzzle1' | 'base')`, `timeScale(n)`, `game`).

## Exceptions aux conventions

- **Écran de l'atelier et du sac** : l'atelier est une fenêtre du jeu, pas une page `atelier.html` (section 17), et n'utilise pas `modules/pixel-editor.js` ; coque grise de Game Boy (`.gb-body`) et damier de transparence hors palette. Coût : voir `ROADMAP.md`.
- **`Game` mêle règles et dessin** (section 12) : la simulation et le rendu vivent dans `js/game.js`. Coût : les règles ne se testent pas sans canvas. Voir `ROADMAP.md`.
- Constantes d'équilibrage dans le code, pas dans `data/` (section 12). Même coût, même renvoi.
- Pas de labo (facultatif, voir `ROADMAP.md`), pas de son, pas de manette, pas de workflow Pages avec tests avant publication (le dépôt publie directement depuis `main`).

## Ce qui a été retiré

| Quoi | Version | Pourquoi |
|---|---|---|
| En-tête (nom cliquable + roue) et cadre du jeu | 1.5.0 | un jeu plein écran n'a ni en-tête ni bandes ; la roue est sur l'écran titre et dans le HUD |
| Prise (bouton maintenu) | 1.3.0 | remplacée par les pitons, en stock limité |
| Radio météo | 1.3.0 | remplacée par le sac (inventaire, météo, carte) |
| design-system des apps (`design-tokens.json`, `mobile.css`, Google Fonts, Tabler CDN) | 1.5.0 | un jeu suit game-system ; une police ou une icône chargée par CDN fait perdre l'identité hors ligne |

## Pièges connus

- Gauche / Droite sont aussi « maintenus » (`game.hold`) : `releaseHolds()` à l'ouverture d'une modale, sinon le héros continue de marcher.
- Le canvas est dimensionné d'après `#screen` en pixels physiques (`fit`), avec une échelle entière ; `Game.resize` reconstruit les décors de profil (ils font la taille du canvas). Le héros est placé au-dessus des commandes (`--ctrl-h`).
- Les sprites sont ancrés en bas au centre, sur fond transparent (le héros n'a plus de boîte sombre). L'ancien format 8×8 (tableau de 64) est accepté et doublé en 16×16.
- Les dévers (`OVERHANGS`) sont à altitude fixe ; les pentes à marcher et les puzzles se tirent de `s.seed`. `s.ov`, `s.walk`, `s.puzzle` sont sauvegardés. Un événement ne peut pas faire sauter un dévers (`climb`).
- Tout le hasard des règles passe par `game.rng` (état dans `s.rngState`) ; le décor (flocons, tremblement) par `game.fx`, non sauvegardé. Jamais `Math.random`.
- La corde n'est pas sauvegardée : `s.pitons`, `s.rope`, `s.live` le sont ; `syncRopes()` la reconstruit.
- La progression (`k2:progress`) est séparée de la partie : « Nouvelle ascension » la conserve. Une ascension démarre avec `game.freshState(seed)` (bonus de talents).
- Le puzzle est une `<dialog data-sticky>` : ni Échap ni clic dehors ; fermée par l'accueil, elle reste en attente (`s.puzzle`).
- Le toast est un `popover` pour passer au-dessus des `<dialog>` ouverts. Les `<dialog>` ouverts diffèrent la mise à jour automatique.
- `sprites.json` (`{}` tant que rien n'est publié) est servi pour éviter un 404 ; « Publier les sprites » le remplace.
