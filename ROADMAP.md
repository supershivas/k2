# Roadmap — K2

Statuts : **à l'étude** · **validé** · **en cours** · **à mesurer**.

## À mesurer

### Équilibrage de la v1.2 à 1.5
**Statut** : à mesurer
**Constat** : les coûts d'énergie des dévers, la marche, le stock de pitons et de corde, la fréquence des événements et des puzzles sont des premières valeurs, jamais mesurées.
**Mesure** : une ascension complète au clavier (`?debug=1&seed=…`, `timeScale`), durée et nombre de chutes.

## À l'étude (écarts avec game-system, signalés en v1.5.0)

### Séparer règles et dessin
**Constat** : `js/game.js` (≈ 1 500 lignes) simule et dessine ; section 12.
**Proposition** : `game.js` (règles pures, sans canvas) + `render.js` ; données dans `js/data/` (événements, reliques, talents, constantes d'équilibrage).
**Ce que ça coûte** : un gros chantier ; il débloque les tests de règles (section 19) et les simulations d'équilibrage.

### L'atelier devient une page
**Constat** : l'atelier est une fenêtre du jeu (section 17 : `atelier.html`, publication par `modules/gh-publish.js`, brouillon `k2:atelier`).
**Proposition** : `atelier.html` avec `modules/pixel-editor.js`, publication d'un dossier `assets/design/`, lien depuis les réglages.

### Labo
**Constat** : pas de labo (section 16) — facultatif pour le moment.

### Son
**Constat** : le jeu est muet ; `modules/audio.js` existe dans game-system.

### Manette
**Constat** : non demandée ; `modules/gamepad.js` si le jeu vise un jour la manette.
