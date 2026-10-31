# Conventions communes — jeux Supershivas

Ce fichier vit dans `supershivas/game-system` et il est la source de vérité.
Chaque jeu en reçoit une copie dans `.claude/conventions-jeu.md` via
`scripts/sync-game-system.sh`, lancé automatiquement au début de chaque session.

**Ne modifie jamais `.claude/conventions-jeu.md` dans un jeu.** Il est écrasé à
chaque synchronisation. Si une règle doit changer, propose-la-moi (voir
« Évolution de ces règles »).

**Priorité** : le `CLAUDE.md` du jeu prévaut sur ce fichier. En cas de conflit,
applique la règle du jeu et signale-moi le conflit.

**Cadre** : des jeux faits seul, joués dans le navigateur (GitHub Pages), et
qui doivent pouvoir partir un jour sur Steam sans être réécrits (section 22).

**Questions** : toute question qui m'est destinée (une décision à trancher, un
choix, une confirmation, une précision) passe par l'outil `AskUserQuestion`, en
questions à choix avec une option recommandée en premier, jamais en texte libre
au milieu d'une réponse. Une question qui n'attend pas de réponse n'est pas une
question : tranche avec une valeur par défaut raisonnable et dis-le.

**Socle — tous les jeux**

- Toute question pour moi passe par `AskUserQuestion` (en tête de ce fichier).
- Version, changelog, mise à jour automatique sans perte de partie (2, 4).
- Écran titre sans sous-titre, réglages derrière une roue crantée (3).
- Palette restreinte déclarée, échelle entière pour le pixel art (5, 7).
- Cible d'affichage déclarée, et deux URL à chaque livraison (7, 20).
- Clavier et pointeur au minimum, toutes les actions possibles des deux (8).
- Boucle à pas fixe, pause sur modale ou perte de focus (9).
- Sauvegarde automatique, versionnée, exportable (11).
- Contenu en données, règles en code (12).
- Bible `DESIGN.md` et `CLAUDE.md` qui ne décrivent que le jeu actuel, court (≤ 20 ko), détail dans `docs/domaines/` (15).
- Mode debug par l'adresse (`?debug=1`) (18).
- Aucune ressource chargée depuis un CDN au lancement du jeu (21, 22).

**Dans ce fichier** : le socle et les sections de tous les jours (1, 2, 4, 9 à 12, 15, 18 à 21, 24).
**À lire seulement quand la tâche les touche** : `.claude/conventions-detail.md`
(source : `CONVENTIONS-DETAIL.md`), qui garde les numéros de section ci-dessous. Absent ?
Lance `sh scripts/sync-game-system.sh`. Pour lire une section : Grep `^## 16\.` puis Read
par plages, sans charger tout le fichier.

| Section | Quand la lire |
|---|---|
| 3 | écran titre, en-tête, roue des réglages |
| 5 | palette, polices, variables de design, icônes de l'interface |
| 6 | favicon, icônes, image de partage |
| 7 | cible d'affichage, échelle entière, tailles tactiles, `prefers-reduced-motion` |
| 8 | clavier, pointeur, manette, raccourcis |
| 13 | textes visibles, langues |
| 14 | son |
| 16 | le labo (variantes, point d'état, accueil) |
| 17 | l'atelier (contenu, publication) |
| 22 | Steam, portabilité |
| 23 | agents, playtests |
| 25 | création d'un nouveau jeu |

---

**À la demande** : labo, atelier, langues, manette, équipe d'agents et
playtests, outils de mesure supplémentaires.

---

## 1. Git et déploiement

- Pousse toujours directement sur `main`, même si la session désigne une
  branche `claude/...`. Pas de pull request sauf demande explicite.
- Un push sur `main` déploie en production (GitHub Pages, racine du dépôt,
  avec `.nojekyll` pour que `CHANGELOG.md` et les dossiers commençant par `_`
  soient servis). Vérifie que le jeu se charge sans erreur avant de pousser
  (section 19).
- Messages de commit en français, courts, qui disent **ce que le joueur verra**
  (ou ne verra plus), pas l'opération : « Les loups reculent quand on fuit »,
  pas « fix wolf AI ». Aucun identifiant de modèle dans un commit ni dans le code.
- **Préviens-moi avant de pousser** un changement qui casse les sauvegardes
  existantes (section 11).
- Après chaque version poussée, donne-moi les deux URL de la section 20.

## 2. Version

- Format `MAJEUR.MINEUR.CORRECTIF`. Chaque push qui change ce que voit ou vit
  le joueur incrémente un niveau :
  - **correctif** : bug, ajustement visuel, réglage, texte ;
  - **mineur** : nouvelle mécanique, nouvelle zone, nouvel écran ; le correctif
    repart à 0 ;
  - **majeur** : uniquement sur ma demande (refonte, changement de moteur).
- En cas de doute entre correctif et mineur, choisis correctif. Un push sans
  effet pour le joueur (documentation, outils, `CLAUDE.md`) ne change pas la
  version.
- Un nouveau jeu démarre en `0.1.0` tant que le lot minimal n'est pas validé,
  puis passe en `1.0.0` sur ma décision.
- Source unique : `version.json` à la racine :
  ```json
  { "version": "1.4.2", "date": "2026-10-13", "changes": ["Les loups reculent quand on fuit"] }
  ```
  `changes` : 1 à 3 lignes lisibles par un joueur. Historique dans
  `CHANGELOG.md` à la racine (le plus récent en haut, `## 1.4.2 — 2026-10-13`
  puis des lignes `- …`).
- Ne code jamais la version en dur : le jeu lit `version.json`.
- GitHub Pages sert les fichiers avec dix minutes de cache : après chaque
  changement de version, lance `node outils/stamp-version.mjs`, qui ajoute
  `?v=X.Y.Z` aux imports et aux feuilles de style. Sans cela, un joueur peut
  tourner avec un mélange d'anciens et de nouveaux modules.

## 4. Mise à jour automatique

- Le jeu vérifie `version.json` (`cache: 'no-store'`) au retour au premier plan
  et toutes les 5 minutes : c'est ce que fait `modules/app-update.js`.
- **Une mise à jour ne fait jamais perdre une partie.** Le jeu indique au
  module qu'il est « occupé » tant qu'une partie est en cours hors pause ; la
  mise à jour attend alors l'écran titre, la pause ou le retour au premier
  plan. Juste avant de recharger, la partie est sauvegardée (section 11).
- Après rechargement, un toast confirme : « Mis à jour en v1.4.3 ».
- Si le jeu a un service worker, le module déclenche aussi `update()` et
  `SKIP_WAITING`.

## 9. Boucle et temps

- **Simulation à pas fixe, découplée du rendu** : le jeu va à la même vitesse
  à 30, 60 ou 144 images par seconde. Le retard rattrapé en une image est
  plafonné, sinon la boucle s'emballe (`modules/loop.js`).
- Le comportement **onglet caché** est déclaré dans `CLAUDE.md` : pause (par
  défaut), ou simulation qui continue à pas grossier puis rattrapage borné.
  Jamais de progression quand le jeu est fermé, sauf décision explicite.
- **Pause** automatique quand une modale s'ouvre ou que la fenêtre perd le
  focus.
- Le temps de jeu se lit par la boucle, jamais par `Date.now()` dans la
  logique (le mode debug doit pouvoir l'accélérer).

## 10. Hasard et déterminisme

- Tout le hasard du jeu passe par un générateur à graine (`modules/rng.js`).
  `Math.random` est interdit dans la logique de jeu.
- Les règles (combat, résolution, score) sont des **fonctions pures** : même
  état, même graine, même résultat. C'est ce qui permet les tests, les
  simulations d'équilibrage et le rejeu d'un bug.
- La graine d'une partie est sauvegardée, et peut être imposée par l'adresse
  (`&seed=123`) en mode debug.
- Un monde généré l'est à partir d'une graine fixe déclarée : changer l'ordre
  des tirages change le monde. Le signaler avant de pousser.

## 11. Sauvegarde

- Sauvegarde **automatique** : régulièrement, à chaque événement marquant, et
  à la fermeture (`pagehide` et `visibilitychange` vers caché). Le joueur ne
  perd jamais plus de quelques secondes, ni lors d'une mise à jour.
- **Format versionné** (`{ v: 3, ... }`) avec des migrations : une ancienne
  sauvegarde se relit toujours, ou le jeu me prévient avant de pousser
  (section 1). `modules/save.js` gère versions, migrations et clés.
- **Clés préfixées** par le nom du jeu (`kingvi:save`, `kingvi:prefs`). La
  partie, la progression permanente (méta, roguelite) et les réglages sont des
  entrées distinctes, dès le premier commit.
- **Export et import JSON** dans les réglages (partie, progression, réglages ;
  jamais un jeton).
- En mode debug, la partie se sauvegarde sous une autre clé et les réglages ne
  sont jamais écrits.
- `localStorage` suffit par défaut. Une synchronisation entre appareils se
  décide avec moi.
- Une sauvegarde relue doit être **la même partie** : un test écrit, relit et
  compare (et, idéalement, fait tourner les deux quelques secondes pour
  vérifier qu'elles restent identiques).

## 12. Données et code

- **Le contenu est de la donnée, la règle est du code.** Ajouter un ennemi,
  une carte, une recette, un niveau, un texte ne demande aucune ligne de code :
  c'est une entrée dans `data/` (JS ou JSON). Le code ne connaît pas les noms.
- **Pas de nombre magique** dans la logique : toute constante de gameplay vit
  dans `data/` (ou `tuning`), toute constante visuelle dans le module de
  design.
- **Un module, une responsabilité** : la simulation ne dessine jamais, le rendu
  ne modifie jamais l'état.
- Un ordre impossible se **refuse à voix haute** : la fonction rend la raison du
  refus, et l'écran la montre. Jamais un `return` muet.
- Les sprites et les tuiles sont de **la donnée lisible** : des matrices de
  lettres (une lettre par couleur de la palette, `.` pour le vide), dans le
  code ou en JSON (`modules/sprites.js`). Une image importée (PNG) est
  convertie à la palette.

## 15. Documents du jeu

- **`DESIGN.md` — la bible** : intention, piliers, boucle de jeu, systèmes,
  palette et échelle, « Ce que le jeu refuse ». Elle décrit l'intention ;
  `CLAUDE.md` décrit la technique. Tous les agents la lisent en premier.
- **`CLAUDE.md` ne décrit que le jeu actuel.** Ce qui a été essayé puis retiré
  part dans `docs/archives/`, avec la raison du retrait, et un tableau « Ce qui
  a été retiré » rappelle ce qu'il ne faut pas reconstruire. Rien de ce qui
  n'existe pas n'est décrit au présent.
- Chaque règle de `CLAUDE.md` porte **son coût** : le bug, la mesure ou la
  raison qui l'a fait naître. Sans cela, elle sera défaite dans six semaines.
- **`CLAUDE.md` reste court** (20 ko au plus, ≈ 5 000 tokens relus à chaque tour).
  Au-delà, le détail d'un domaine (décisions datées, mesures, pièges) passe tel
  quel dans `docs/domaines/<domaine>.md`, et `CLAUDE.md` garde une ligne par
  module et un index « Où lire quoi » (fichiers touchés → fichier à lire).
  Un dossier qui a son domaine y met un `CLAUDE.md` d'une ligne
  (`@../../docs/domaines/rendu.md`) : chargé seulement quand on y lit un fichier.
  Un piège nouveau s'écrit dans le fichier de son domaine. Outil :
  `node outils/decouper-claude-md.mjs` ; recette : `LECONS.md`, « Sessions économes ».
- **`ROADMAP.md`** : les grosses évolutions envisagées ou en cours, avec leur
  statut. Une entrée sort de la roadmap une fois livrée.
- Une décision de design que j'ai prise se note avec sa version :
  « (Jérôme, v1.47.0) ».

## 18. Mode debug

- `?debug=1` dans l'adresse charge `modules/debug.js` ; sans le paramètre, le
  module n'est même pas chargé.
- Il expose `window.__jeu` : `state()` (position, zone, PV, drapeaux, FPS…),
  `events` (journal horodaté des événements du jeu), `teleport(lieu)`,
  `timeScale(n)`, `setSeed(n)`, `reset()`, et ce que le jeu y ajoute.
- C'est l'interface des scripts de test, des captures et du harnais de
  playtest : tout ce qu'un test doit voir ou provoquer y passe.

## 19. Vérifier avant de livrer

Une contrainte sans instrument est un vœu. Avant de pousser :

1. La syntaxe de chaque module modifié :
   `node --input-type=module --check < fichier.js` (`node --check fichier.js`
   ne lit pas le fichier comme un module et laisse passer des erreurs).
2. `node outils/test-run.mjs` : les tests des règles, de la sauvegarde, des
   invariants (dans `test/`), sans navigateur.
3. Le jeu se charge **sans erreur dans la console** (Playwright, Chromium de
   `/opt/pw-browsers`) : `node outils/captures.mjs`.
4. Pour toute modification d'écran ou de CSS : `node outils/audit-ecran.mjs`
   (débordement, amputation, cibles trop petites) et, pour toute couleur ou
   tout sprite, `node outils/lisibilite.mjs`.
5. Pour tout chiffre d'équilibrage : une mesure (skill `equilibrage`), pas un
   choix à l'œil.
6. **Les deux captures**, toujours ensemble : la cible principale et l'autre
   (téléphone et bureau). Regarde-les vraiment.

Le conteneur n'a pas de carte graphique : les FPS s'y comparent d'une version à
l'autre, jamais en absolu.

## 20. Livrer

**Toute livraison donne deux URL, sans qu'on ait à le demander** :

- **le jeu** — `https://supershivas.github.io/<repo>/`, à ouvrir sur la cible
  principale (au doigt si c'est un téléphone) ;
- **l'aperçu** — le même jeu dans l'autre format : `apercu.html` (le jeu dans
  un cadre de téléphone, dans une `iframe`, jamais réduit par
  `transform: scale()`), ou la version bureau pour un jeu pensé pour le
  téléphone, et inversement.

Avec une seule URL, on ouvre le jeu en 1 400 px de large, tout y tient, et l'on
ne voit rien. Ajoute les liens du labo ou de l'atelier s'ils ont changé.

## 21. Code

- Vanilla JS en modules ES, sans build, par défaut. Une autre stack se décide
  avec moi au démarrage.
- **N'ajoute aucune dépendance sans me demander.** Une bibliothèque acceptée
  (Phaser, three.js…) est **copiée dans `vendor/`**, à une version fixée, avec
  sa licence : jamais de CDN, jamais de `npm install` pour le jeu lui-même.
  Les outils de développement (Playwright) vivent à part (`outils/`), jamais
  servis au joueur.
- Les modules de game-system sont utilisés tels quels ; un besoin qu'ils ne
  couvrent pas se propose pour game-system plutôt que de les modifier.
- Noms clairs. Des commentaires là où le « pourquoi » n'est pas évident.
- Les performances se mesurent sur un scénario déclaré (« 200 objets à
  60 images/s ») avant d'empiler des fonctionnalités dessus.

## 24. Maintenance du CLAUDE.md

- Mets à jour le `CLAUDE.md` du jeu dès qu'une décision durable est prise :
  structure, choix technique, exception à ces conventions, piège rencontré.
- Garde-le à jour ; supprime ce qui est devenu faux ; archive ce qui a été
  retiré (section 15).
- Si une règle découverte semble valoir pour tous les jeux, ne l'écris pas
  dans ce fichier : propose-la-moi en fin de réponse, sous la forme
  « Proposition pour CONVENTIONS.md : … ». Un piège qui vaut pour tous se
  propose pour `LECONS.md` de game-system.

## Évolution de ces règles

Je modifie ce fichier moi-même, ou je demande à Claude Code de le faire dans
game-system. Les jeux récupèrent la nouvelle version à leur prochaine session.
