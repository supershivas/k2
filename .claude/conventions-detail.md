# Conventions communes — sections de détail

Suite de `.claude/conventions-jeu.md` (la source est `CONVENTIONS-DETAIL.md` dans `supershivas/game-system`) : les sections lues à la demande, avec leur numéro d'origine. Ne modifie jamais ce fichier dans un jeu : il est écrasé à chaque synchronisation. Mêmes règles de priorité : le `CLAUDE.md` du jeu prévaut.

## 3. Écran titre, en-tête et réglages

- **Pas de sous-titre.** Jamais de sous-titre ni de baseline sous le nom du
  jeu.
- **L'écran titre** propose, dans cet ordre : *Continuer* (s'il existe une
  partie), *Nouvelle partie* (avec confirmation si elle efface une partie), puis
  la roue crantée. Rien d'autre n'est obligatoire.
- **Réglages** : ils s'ouvrent uniquement par une icône roue crantée, sans
  libellé, avec `aria-label="Réglages"`, depuis l'écran titre et depuis la
  pause. Ils contiennent ce qui s'applique au jeu (volumes musique et effets
  séparés, qualité, langue, commandes…) puis, en bas, dans cet ordre :
  - le numéro de version (`v1.4.2`) ;
  - les 5 dernières versions (lues dans `CHANGELOG.md`) ;
  - l'export de la sauvegarde en JSON, et son import ;
  - les liens discrets vers le Labo et l'Atelier, s'ils existent.
- En jeu, le nom du jeu n'est pas obligatoire à l'écran. S'il y a un en-tête,
  le nom est à gauche, c'est un vrai lien qui ramène à l'écran titre (après
  sauvegarde), et la roue crantée est à droite.
- Les réglages et l'écran titre peuvent être habillés aux couleurs du jeu.

## 5. Identité visuelle

Le design system propre aux jeux **reste à définir** (voir `DESIGN-SYSTEM.md`
dans game-system). En attendant, ces règles valent pour tous :

- **Palette restreinte**, déclarée dans le `CLAUDE.md` du jeu (nom et valeur
  de chaque couleur), dans un seul module de code (`palette.js` ou
  `design.js`), et **identique** entre le canvas, le HUD, les commandes et
  l'écran titre. Aucune couleur hors palette, aucun dégradé ni transparence
  qui fabrique une teinte de plus, sauf exception déclarée dans `CLAUDE.md`.
- **Une police d'identité au plus, auto-hébergée** (`fonts/`), avec une
  police d'interface lisible si besoin. Jamais chargée depuis Google Fonts ou
  un CDN : un chargement raté en silence fait perdre l'identité du jeu (c'est
  arrivé). Vérifier qu'elle a les majuscules accentuées.
- **Valeurs en variables** : tailles de texte, espacements, rayons, durées
  d'animation viennent d'une échelle déclarée une fois (variables CSS et
  constantes JS), jamais inventés au cas par cas.
- **Icônes de l'interface hors du jeu** (réglages, labo, atelier) : au trait,
  d'un seul jeu, auto-hébergé. Dans le jeu, les signes sont dessinés dans le
  style du jeu.
- **La forme porte l'information, la couleur la confirme** : un élément doit
  rester reconnaissable en niveaux de gris (vérifié par
  `outils/lisibilite.mjs`).

## 6. Favicon et icônes

Dès la création :

- `favicon.svg` (lisible à 16 px, dans la palette du jeu), `favicon.ico`
  (16, 32, 48) et `apple-touch-icon.png` (180 × 180) ;
- `icon-192.png` et `icon-512.png` si le jeu est installable (PWA) ;
- `favicon-labo.svg` et `favicon-atelier.svg` s'ils existent (sections 16 et
  17) ;
- une image de partage `og.png` (1200 × 630), qui servira aussi de base à la
  capsule Steam.

## 7. Écran, cibles et échelle

- **La cible est déclarée** dans la section Description du `CLAUDE.md` :
  téléphone en portrait, téléphone en paysage, bureau, ou plusieurs. Un jeu
  qui vise le téléphone tient d'abord en 375 × 667.
- **Espace logique fixe.** La logique et le rendu travaillent dans une
  résolution logique déclarée (par exemple 320 × 180, 360 × 640). Aucune
  valeur en pixels d'écran dans la logique. La mise à l'échelle se fait en un
  seul endroit, au rendu.
- **Pixel art : échelle entière uniquement** (×1, ×2, ×3), jamais
  fractionnaire, `image-rendering: pixelated`, aucun lissage. Le canvas est
  dimensionné en pixels physiques (`devicePixelRatio`), sinon un écran à 125 %
  brouille tout. `modules/pixel-canvas.js` fait tout cela.
- **Échelle de référence.** Tout se mesure au héros : sa taille en pixels est
  déclarée dans `CLAUDE.md`, et les autres tailles en découlent (une porte
  ≈ le héros, un loup à sa hanche…). Une planche d'échelle (sujet du labo, ou
  `echelle.html`) montre côte à côte le héros et chaque élément.
- **Hauteur d'écran** : `100dvh` et `visualViewport`, jamais `100vh` ni
  `innerHeight` seul (barres d'adresse mobiles).
- **Le navigateur ne prend aucun geste au jeu** : pas de sélection de texte,
  pas de loupe ni de menu contextuel sur appui long, pas de zoom à la pince,
  pas de rechargement en tirant vers le bas, pas de surlignage au toucher
  (`modules/pointer.js` et `modules/game.css`). Ctrl+F et F12 restent libres.
- **Zones tactiles** : 44 × 44 px minimum ; 48 pour un public enfant.
- **Le survol ne porte aucune information** : une information qui n'existe
  qu'au survol n'existe pas au doigt. Les styles `:hover` vont dans
  `@media (hover: hover)`.
- `prefers-reduced-motion` : les animations d'interface longues sont
  raccourcies ou sautées.

## 8. Commandes

- **Toute action se fait au clavier et au pointeur** (souris ou doigt). Un
  geste raccourcit un ordre, il n'est jamais le seul chemin.
- **Déplacements : touche physique** (`event.code`). ZQSD en AZERTY, WASD en
  QWERTY et les flèches marchent sans réglage.
- **Commandes nommées par une lettre** (M la carte, I l'inventaire, E
  l'action) : le caractère (`event.key`), pour que la touche écrite M ouvre la
  carte quel que soit le clavier ; repli sur `event.code` si ce n'est pas une
  lettre latine.
- Aucun raccourci avec Ctrl, Cmd ou Alt. Aucune commande ne se répète quand on
  garde la touche enfoncée (`e.repeat`), sauf un déplacement lu en continu.
- **Pas de recherche automatique** : Firefox cherche dans la page dès qu'on
  tape une lettre. Hors des champs de saisie, toute touche imprimable est
  retenue (`preventDefault`), même sans effet. Espace et Entrée restent libres
  sur un bouton qui a le focus.
- **Souris et doigt produisent les mêmes gestes** (Pointer Events). Ne jamais
  capturer le pointeur avant que l'appui soit devenu un glissement (seuil :
  la taille d'une cible tactile).
- **Manette** (si le jeu vise Steam ou le salon) : `modules/gamepad.js`,
  mêmes actions que le clavier, sans configuration.
- `modules/keys.js` et `modules/pointer.js` appliquent cette section : utilise-les.

## 13. Textes et langues

- Le français est la langue de référence.
- Un jeu bilingue passe **toutes** les chaînes visibles par `modules/i18n.js`,
  avec une entrée dans chaque langue ; jamais de texte en dur dans le HTML ou
  le JS.
- Un texte du jeu a une **clé stable** (pour l'atelier et la traduction).
- Les textes du jeu sont courts. Le jeu montre plutôt qu'il ne dit.

## 14. Son

- Web Audio, déverrouillé au premier geste du joueur.
- Volumes **musique** et **effets** séparés dans les réglages, gardés dans les
  préférences. Le son se coupe quand l'onglet est caché.
- Musique : fichiers `assets/music/` (OGG ou MP3) ou synthèse ; effets : de
  préférence synthétisés (`modules/audio.js`), sinon fichiers courts.
- Le labo a une section Son qui fait entendre chaque son.

## 16. Labo

Le **Labo** est un banc d'essai où je compare des variantes avant d'en adopter
une. Il **montre** ; il ne modifie jamais le contenu du jeu (c'est l'Atelier).

- **Accès** : `labo.html`, lien discret dans les réglages. Jamais dans
  l'écran de jeu.
- **En-tête** : le nom du jeu (lien de retour) suivi de « LABO » en police
  mono, majuscules espacées, dans un cadre fin, sur la couleur d'accent du jeu.
  Onglet : « Labo — Nom du jeu », favicon `favicon-labo.svg` = le favicon du
  jeu avec une pastille sombre (`#1C1C1E`, liseré blanc) portant une fiole
  blanche au trait.
- **Écran à hauteur fixe** (`100dvh`) : seul le contenu de la variante défile.
  **Jamais une longue page à défiler.**
- **Menu** : des groupes (onglets), leurs sujets (marge de gauche ; puces sur
  mobile), et les variantes du sujet ouvert : **A, B, C…, A est toujours
  l'actuelle**. Clic, flèches du clavier, balayage sur mobile.
- **Adresse** : elle garde le sujet et la lettre (`#loups-C`).
- **Chaque variante** a un titre et une phrase qui dit ce qu'elle change ;
  « actuelle », « retenue » (branchée dans le jeu), « ancienne ».
- **Les variantes se tranchent par `AskUserQuestion`** : quand un lot de variantes
  est prêt (statut `a-trancher`), Claude donne le lien de chaque sujet
  (`labo.html#sujet-Lettre`) puis pose **une question par sujet** (une série de
  quatre au plus par appel), avec une option recommandée en premier et « garder
  l'actuelle » parmi les choix ; plusieurs réponses sont permises quand les
  variantes ne s'excluent pas. Il n'adopte rien avant la réponse : la variante
  choisie passe en A (`actuelle`), l'ancienne en `ancienne`, les autres
  restent.
- **Un point d'état devant chaque sujet** (menu, puces mobiles, index de
  l'accueil) et devant chaque groupe (le pire de ses sujets) : **vert** (rond)
  = tranché, une variante est en jeu (« actuelle » ou « retenue ») ; **rouge**
  (carré) = à trancher : une variante porte le statut `a-trancher` (une
  proposition attend, même si une autre est en jeu), ou des statuts existent
  sans variante en jeu ; **orange** (triangle) = indéfini : aucune variante n'a
  de statut. `etatSujet` et `etatGroupe` de `modules/labo-shell.js` le
  calculent : ne pas le recoder dans le jeu.
- **Page d'accueil** : un onglet « Accueil » (`#accueil`, la page d'ouverture)
  pour suivre les modifications : le journal du labo version par version, chaque
  ligne avec un lien vers le bon sujet et la bonne variante (`#sujet-Lettre`),
  ce qui est nouveau depuis la dernière visite de ce navigateur, les sujets à
  trancher et l'index de tous les sujets. Le journal est une donnée du jeu
  (`js/labo-journal.js`), tenue à jour à chaque changement du labo ; une
  maquette que le jeu a dépassée est refaite ou passée en « ancienne », pas
  laissée telle quelle.
- **Le labo utilise les mêmes modules que le jeu** (rendu, sprites, son) : ce
  qu'on y voit est ce que le jeu affichera. Il ne lit ni n'écrit la sauvegarde.
- Sujets utiles : la planche d'échelle, chaque animation, la palette, les
  sons, les écrans, les variantes d'un réglage.
- Modèle : `templates/starter/labo.html` et `js/labo.js` de game-system, sur
  `modules/labo-shell.js` (ajouter un sujet ou une variante = une entrée du
  tableau `GROUPES` ; skill `variante-labo`).

## 17. Atelier

L'**Atelier** modifie le contenu que le jeu lit : dessins, animations,
placement sur la carte, niveaux, textes, réglages chiffrés. C'est une page à
part, jamais un onglet du labo.

- **Accès** : `atelier.html`, lien dans les réglages et icône pinceau dans
  l'en-tête du labo (et une fiole vers le labo dans celui de l'atelier).
- **En-tête** : nom du jeu + « ATELIER », fond sombre `#1C1C1E`, texte blanc.
  Onglet « Atelier — Nom du jeu », favicon `favicon-atelier.svg` (même pastille
  que le labo, avec un pinceau).
- **Outils** : un par sorte de contenu (éditeur de pixels, carte où l'on place
  les objets, éditeur de textes, curseurs de réglages, palette…).
- **Données** : chaque modification est enregistrée tout de suite dans le
  navigateur, puis **publiée** d'un geste dans le dépôt : un seul commit sur
  `main` par l'API de GitHub (`modules/gh-publish.js`), avec un jeton
  personnel fin (droit « Contents » sur ce seul dépôt), gardé dans ce
  navigateur et jamais exporté. Le jeu lit le contenu publié à son lancement ;
  ce qui n'est pas encore publié reste visible dans ce navigateur et signalé
  (« 3 à publier »).
- Le contenu publié vit dans un dossier déclaré (`assets/design/`,
  `data/ville.json`…), sous des **clés stables**. Une retouche locale plus
  ancienne que la version publiée s'efface devant elle.
- Les **boîtes de dialogue** sont rattachées au `body`, jamais rangées dans un
  conteneur caché (elles s'ouvriraient invisibles et bloqueraient la page).
- Pour un gros travail de dessin, on peut passer par Pixel Studio
  (`supershivas/pixel-studio`) : export PNG à la palette, import dans
  l'atelier.
- Modèle : `templates/starter/atelier.html` et `js/atelier.js` de
  game-system (dessins, réglages, publication) ; référence complète :
  `atelier.html` de `supershivas/kingvi`.

## 22. Porte ouverte vers Steam

Tant que je n'ai pas dit « navigateur seulement », le jeu reste portable :

- aucune ressource distante au lancement (polices, bibliothèques, sons, images :
  tout est dans le dépôt) ; chemins relatifs uniquement ;
- plein écran proposé (touche F11 du navigateur ou bouton), et le jeu
  s'adapte à toute taille de fenêtre (16:9, 16:10, ultra-large) ;
- manette prise en charge (section 8) ;
- sauvegarde exportable (section 11), et toutes les clés passent par
  `modules/save.js` : le jour du portage, seul ce module change de stockage ;
- rien d'indispensable ne dépend de l'adresse (`?…`) hors du mode debug ;
- l'empaquetage (Tauri ou Electron, Steamworks pour les succès et la
  sauvegarde dans le nuage) se fait le jour venu, sans réécrire le jeu.

## 23. Agents et playtests

- Les agents (`.claude/agents/`) proposent, mesurent, testent, critiquent :
  **ils n'implémentent jamais rien d'eux-mêmes**. Je tranche.
- Un playtest produit un dossier `playtests/vX.Y.Z/<run-id>/` (carnet,
  captures, journal, retours, synthèse, décisions), avec une case
  « Jérôme tranche » par proposition.
- Les joueurs fictifs ne lisent que le carnet et les captures de la partie,
  jamais le code, la bible ni les retours des autres.
- Un testeur classe en BLOQUANT, MAJEUR, MINEUR ; une régression est toujours
  bloquante.

## 25. Nouveau jeu

Le plus simple : coller `templates/PROMPT-NOUVEAU-JEU.md` de game-system au début
de la première session. À la création d'un jeu :

0. Pose toutes les décisions à trancher avec `AskUserQuestion`, en questions à
   choix multiples (genre, vue, rendu, cible, palette, commandes, sauvegarde,
   labo, atelier, outils, agents, Steam…).
1. Installe avec `templates/installer.sh` de game-system : le jeu de départ,
   les modules (`js/lib/`), les outils (`outils/`), `CLAUDE.md`,
   `DESIGN.md`, `ROADMAP.md`, la synchronisation (`scripts/`,
   `.claude/settings.json`), le workflow, et ce que mes réponses demandent
   (labo, atelier, agents, playtest).
2. Retire les modules et outils non retenus, puis lance la synchronisation.
3. Construis le **lot minimal** : la boucle de jeu au cœur du jeu, jouable aux
   deux cibles, avec son critère de validation mesurable. Rien d'autre tant
   qu'il n'est pas validé.
4. Propose-moi la ligne à ajouter au tableau des jeux du README de game-system.
