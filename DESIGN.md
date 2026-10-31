# K2 — Bible du jeu

L'intention du jeu. La technique est dans `CLAUDE.md`. Les décisions de Jérôme sont datées par version.

## Intention

Être minuscule face à une immense paroi. On grimpe pas à pas, on gère son souffle, sa chaleur, ses vivres ; la montagne, le vent et la nuit décident du reste. On y revient pour aller plus haut, retrouver les objets de ceux qui l'ont gravie avant nous, et se sentir un peu plus alpiniste à chaque ascension.

## Piliers

1. **Épique plutôt que réaliste** : seul face aux éléments, on montre la démesure, pas les statistiques.
2. **Deux boutons suffisent** : Gauche / Droite alternés font monter ; tout le reste est une réponse à la paroi.
3. **Chaque ressource compte** : pitons, corde, gaz, oxygène sont en nombre limité et se choisissent.
4. **La montagne change de point de vue** : de face, de profil sous un dévers, de profil sur une pente.

## La boucle de jeu

- **Seconde** : un pas, un coup de vent à encaisser, une pierre à esquiver.
- **Minute** : planter un piton, manger, passer un dévers ou une pente, résoudre un mini-puzzle.
- **Partie** : une ascension, de 0 à 8 611 m, en plusieurs jours (camps, grottes, nuits).
- **Entre deux parties** : XP, niveaux, talents, reliques de l'histoire de l'escalade.

## Le lot minimal (validé, v1.0.0)

1. Grimper en alternant, ressources, froid, oxygène, chute au dernier camp.
2. Cycle jour / nuit, vent, neige, météo.
3. Éditeur de sprites.

**Critère de validation** : à confirmer par une mesure d'équilibrage (durée d'une ascension, taux de chute) — voir `ROADMAP.md`.

## Les systèmes

- **Pitons et corde** (Jérôme, v1.3.0) : le piton remplace la prise ; la corde, de longueur limitée, relie les pitons avec une vraie physique ; une chute ramène au dernier piton relié.
- **Dévers et pentes douces** (v1.2.0, v1.3.0) : changement de point de vue ; on alterne les mains sous un toit, on maintient un bouton sur une pente.
- **Grottes, événements** (v1.2.0) : refuges ; 30 événements aléatoires.
- **Sac** (v1.3.0) : inventaire, météo avec l'heure exacte, carte.
- **Mini-puzzles, reliques, XP et talents** (v1.4.0) : lire la paroi, équilibre, réchaud ; 10 reliques ; 3 branches de talents.

## Le monde, le récit

Le K2, la « montagne sauvage ». Pas de personnages : des traces (reliques, camps, cordes). Le ton est sobre et un peu solennel.

## Palette, échelle, son

Quatre verts Game Boy et un rose fluo pour tout ce qui répond au joueur. Échelle entière, pixels nets, plein écran. Pas de son pour l'instant.

## Public et accessibilité

Joueur averti à l'aise avec la survie ; textes en français ; commandes au pouce (44 px) et au clavier ; aucune information ne passe par le survol.
