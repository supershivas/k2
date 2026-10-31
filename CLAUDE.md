@.claude/conventions.md

# K2

## Description

Jeu de pixel art où l'on escalade le K2 (8 611 m). La montagne est vue de face, le héros minuscule grimpe en alternant Gauche / Droite (deux fois le même côté : traversée latérale). Épique plutôt que réaliste : seul face aux éléments et à la falaise. Pas de sous-titre ni de baseline sous le nom du jeu.

- Catégorie : **secondaire** (socle seulement ; les fonctionnalités avancées ne se développent que sur demande).
- Cible : **mobile et bureau** (tactile et clavier).
- Production : https://supershivas.github.io/k2/

Gameplay : cycle jour/nuit, vent (rafales qui déportent, à encaisser en maintenant « Prise »), neige, froid, oxygène au-dessus de 6 500 m, ressources à ramasser sur la paroi (vivres, gaz, O₂, pitons, corde, une tous les ~110 m, visibles en rose fluo), blocs, verglas et chutes de pierres à esquiver, camps d'altitude, grottes et pitons reliés par la corde qui servent de points de retour après une chute, pitons (stock limité, bouton « Piton » : ancre contre les rafales) et corde de longueur limitée simulée par Verlet (pend, ondule au vent), sac (inventaire, météo avec la ligne de l'heure, carte, écrans Game Boy), pentes douces de profil à marcher en maintenant Gauche/Droite (tirées au hasard par ascension, `s.seed`), dévers à franchir de profil (alterner les mains sous un toit de roche), grottes refuges (abri sans gaz, point de retour), 30 événements aléatoires, 5 mini-puzzles par ascension (lire la paroi, équilibre, réchaud ; `js/puzzles.js`), 10 reliques de l'histoire de l'escalade (`js/relics.js`), XP / niveaux 1 à 10 et arbre de 12 talents en 3 branches (`js/progress.js`), conservés entre les ascensions. « Atelier » = l'éditeur de sprites intégré (taille libre jusqu'à 32×32, trames).

## Stack

Vanilla JS statique (modules ES, aucune dépendance, aucun build), canvas 200×320 en pixel art (simulation en unités logiques 100×160, K = 2 pixels par mètre). Hébergement GitHub Pages depuis `main` (racine). Icônes Tabler (webfont, CDN). Données locales (`localStorage`, préfixe `k2:`), exportables en JSON dans les réglages. Aucun Supabase.

## Structure

- `index.html`, `style.css` : page unique, dialogues natifs `<dialog>`.
- `js/game.js` : simulation (altitude, énergie, chaleur, météo, temps), vue de face et vue de profil (dévers), grottes, rendu canvas. `js/events.js` : les 30 événements aléatoires. `js/bag.js` : le sac (inventaire, météo, carte, talents, reliques).
- `js/sprites.js` : palette de 5 couleurs (4 verts Game Boy + rose fluo), sprites `{w, h, px}` de taille libre, sprites par défaut, chargement (local > `sprites.json` du dépôt > défauts), publication GitHub.
- `js/pixfont.js` : police pixel 3×5 (décor et écran radio). `js/editor.js` : éditeur de sprites (agrandir/réduire par côté, trames). `js/main.js` : HUD, commandes, réglages, export/import.
- `version.json`, `CHANGELOG.md` : versions. `app-update.js`, `mobile.css`, `design-tokens.json` : synchronisés depuis le design system.
- `sprites.json` : créé par le bouton « Publier les sprites » des réglages (absent tant que rien n'est publié, d'où un 404 inoffensif).

## Conventions jeux

Règles propres aux jeux (à porter dans CONVENTIONS.md, voir proposition ci-dessous) :

- Jamais de sous-titre ni de baseline sous le nom d'un jeu ou d'une app : ni en en-tête, ni sur l'écran d'accueil.
- Palette du jeu limitée et déclarée dans le `CLAUDE.md`, identique entre canvas, HUD et commandes. En-têtes, réglages et modales gardent les tokens.
- Commandes jouables au pouce (zones de 44 px minimum) et au clavier.
- Le jeu se met en pause quand une modale est ouverte et se sauvegarde tout seul (pas de perte à la mise à jour automatique).

## Exceptions aux conventions

- La palette du jeu (4 verts Game Boy + rose fluo `#FF3CAC`) est volontairement hors tokens : canvas, HUD, boutons de commande et accueil. Les en-têtes, réglages et modales utilisent les tokens. `PALETTE` (js/sprites.js) et les variables `--gb0..3`, `--fluo` (style.css) doivent rester identiques.
- Le jeton GitHub (réglages) est saisi par l'utilisateur et stocké uniquement dans son navigateur (`localStorage`), jamais commité. Il sert à écrire `sprites.json` via l'API contents.
- Thème sombre unique (le jeu est nocturne) : pas de bascule clair/sombre.

## Pièges connus

- La progression (`k2:progress` : XP, talents, reliques) est séparée de la partie en cours (`k2:save`) : « Nouvelle ascension » la conserve. Une nouvelle ascension démarre avec `game.freshState()` (bonus de talents), jamais `newState()`.
- Le puzzle est une `<dialog data-sticky>` (ni Échap ni clic hors fenêtre) ; fermée par l'accueil, elle reste en attente (`s.puzzle`) et se rouvre au retour dans le jeu.

- Gauche/Droite sont aussi « maintenus » (`game.hold`) : réinitialiser `hold` à l'ouverture d'une modale, sinon le héros continue de marcher.
- La corde n'est pas sauvegardée : seuls `s.pitons`, `s.rope` et `s.live` le sont ; `syncRopes()` la reconstruit au chargement.

- Les sprites sont ancrés en bas au centre. L'ancien format de `sprites.json` / export (tableau de 64 valeurs, 8×8) est accepté et doublé en 16×16.
- Les dévers (`OVERHANGS`) sont à altitude fixe ; `s.ov` / `s.ovDone` sont sauvegardés. Un événement ne peut pas faire sauter un dévers (`climb`).

- Les modales sont des `<dialog>` : `app-update.js` les considère comme une saisie en cours et diffère le rechargement. La progression est sauvegardée toutes les 2 s et à `pagehide`.
- Le toast est un `popover` pour passer au-dessus des `<dialog>` ouverts.
- Les icônes Tabler viennent d'un CDN : sans réseau, elles n'apparaissent pas (le jeu reste jouable).
