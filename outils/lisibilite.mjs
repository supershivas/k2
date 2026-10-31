// Vérification de lisibilité, sans navigateur : ce qui se voit à l'œil se mesure ici.
//
//   node outils/lisibilite.mjs                     → lit ./lisibilite.config.mjs
//   node outils/lisibilite.mjs chemin/config.mjs
//
// Source de vérité : supershivas/game-system/outils/lisibilite.mjs
// D'après outils/lisibilite.mjs de Factokid. Sections 5 et 19 de
// CONVENTIONS.md. Trois familles de contrôles, celles qui ont déjà mordu :
//
//   1. CONTRASTE de chaque paire de couleurs posées l'une sur l'autre
//      (rapport WCAG) : 4,5 pour du texte, 3 pour un signe ;
//   2. SILHOUETTES : deux sprites d'un même groupe ne doivent pas se
//      confondre en niveaux de gris (même forme ET mêmes valeurs) ;
//   3. POSE ENTIÈRE : une image de pixel art posée dans une case ne se met
//      à l'échelle que d'un nombre entier de fois.
//
// La configuration, à la racine du jeu (lisibilite.config.mjs) :
//
//   import { PALETTE } from './js/palette.js'
//   import * as S from './js/sprites-data.js'
//   export default {
//     palette: PALETTE,                       // { lettre: '#rrggbb' } ou { nom: '#rrggbb' }
//     paires: [                               // une paire s'ajoute le jour où on la dessine
//       { avant: 'w', fond: 'k', role: 'texte', ou: 'HUD' },
//       { avant: 'r', fond: 'k', role: 'signe', ou: 'sang sur la nuit' },
//     ],
//     groupes: { matieres: { sucre: S.SUCRE, bois: S.BOIS, fraise: S.FRAISE } },
//     poses: [ { ou: 'icône dans un bouton', image: [16, 16], case: [48, 48] } ],
//   }
//
// Code de sortie 1 si un contrôle échoue.

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';

const chemin = resolve(process.argv[2] || 'lisibilite.config.mjs');
if (!existsSync(chemin)) {
  console.log(`Pas de configuration (${chemin}) : voir l'en-tête de outils/lisibilite.mjs.`);
  process.exit(0);
}
const cfg = (await import(pathToFileURL(chemin).href)).default;
const palette = cfg.palette || {};

const rgb = hex => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = hex => { const [r, g, b] = rgb(hex).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contraste = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};
const couleur = k => palette[k] || (/^#/.test(k) ? k : null);

let echecs = 0;
const ko = msg => { echecs++; console.log(`  ✗ ${msg}`); };
const ok = msg => console.log(`  ✓ ${msg}`);

// 1. Contraste
if (cfg.paires?.length) {
  console.log('Contraste');
  for (const p of cfg.paires) {
    const a = couleur(p.avant), b = couleur(p.fond);
    if (!a || !b) { ko(`${p.avant} sur ${p.fond} : couleur hors palette`); continue; }
    const seuil = p.seuil || (p.role === 'texte' ? 4.5 : 3);
    const r = contraste(a, b);
    const msg = `${p.avant} sur ${p.fond} (${p.role || 'signe'}${p.ou ? ', ' + p.ou : ''}) : ${r.toFixed(2)} pour ${seuil}`;
    r >= seuil ? ok(msg) : ko(msg);
  }
}

// 2. Silhouettes
const gris = k => {
  const c = couleur(k);
  return c ? Math.round(luminance(c) * 8) : -1; // 9 niveaux de gris : ce que l'œil sépare en mouvement
};
const empreinte = rows => rows.map(r => r.split('').map(ch => (ch === '.' || ch === ' ' ? '_' : gris(ch))).join(',')).join('/');
const forme = rows => rows.map(r => r.replace(/[^. ]/g, '#')).join('/');
for (const [nomGroupe, sprites] of Object.entries(cfg.groupes || {})) {
  console.log(`Silhouettes — ${nomGroupe}`);
  const noms = Object.keys(sprites);
  let probleme = false;
  for (let i = 0; i < noms.length; i++) {
    for (let j = i + 1; j < noms.length; j++) {
      const a = sprites[noms[i]], b = sprites[noms[j]];
      if (empreinte(a) === empreinte(b)) { ko(`${noms[i]} et ${noms[j]} sont identiques en niveaux de gris`); probleme = true; }
      else if (forme(a) === forme(b)) console.log(`  · ${noms[i]} et ${noms[j]} ont la même forme : seule la couleur les sépare`);
    }
  }
  if (!probleme) ok(`${noms.length} sprites distincts en niveaux de gris`);
}

// 3. Pose entière
if (cfg.poses?.length) {
  console.log('Pose des images');
  for (const p of cfg.poses) {
    const [iw, ih] = p.image, [cw, ch] = p.case;
    const k = Math.min(Math.floor(cw / iw), Math.floor(ch / ih));
    const marge = [(cw - iw * k) / 2, (ch - ih * k) / 2];
    const msg = `${p.ou} : ${iw}×${ih} dans ${cw}×${ch} → ×${k}, marges ${marge.join(' / ')}`;
    k >= 1 && Number.isInteger(marge[0]) && Number.isInteger(marge[1]) ? ok(msg) : ko(`${msg} (facteur ou centrage non entier)`);
  }
}

console.log(echecs ? `\n${echecs} échec(s)` : '\nLisible.');
process.exit(echecs ? 1 : 0);
