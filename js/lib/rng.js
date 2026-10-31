/* ─── Hasard à graine — partagé entre les jeux ─────────────────────────────
   Source de vérité : supershivas/game-system/modules/rng.js
   Applique la section 10 de CONVENTIONS.md : tout le hasard du jeu passe
   par un générateur à graine ; `Math.random` est interdit dans la logique.
   Même graine, même suite : une partie, un monde, une simulation
   d'équilibrage ou un bug se rejouent à l'identique.

   Module ES sans dépendance (fonctionne aussi dans Node, pour les tests) :
     import { createRng, hashSeed, dailySeed } from './lib/rng.js?v=1.6.0'
     const rng = createRng(1234)        // ou createRng('nom-du-monde')
     rng()                // [0, 1[
     rng.int(1, 6)        // entier entre 1 et 6 inclus
     rng.range(0.5, 2)    // réel dans [0.5, 2[
     rng.chance(0.25)     // vrai une fois sur quatre
     rng.pick(tableau)    // un élément
     rng.weighted([{ v: 'a', w: 3 }, { v: 'b', w: 1 }])
     rng.shuffle(tableau) // mélange SUR PLACE (Fisher-Yates) et rend le tableau
     rng.fork('loups')    // un générateur indépendant, dérivé de la graine :
                          // ajouter des tirages aux loups ne déplace pas le reste du monde
     rng.state / rng.setState(s)   // pour la sauvegarde
   ─────────────────────────────────────────────────────────────────────────── */

// Une chaîne ou un nombre → graine entière 32 bits (FNV-1a)
export function hashSeed(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value >>> 0;
  const s = String(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// La graine du jour (jeu quotidien) : la même pour tout le monde, à date locale
export function dailySeed(date = new Date(), salt = '') {
  const d = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  return hashSeed(salt + d);
}

// Bruit déterministe d'une position (pas d'état) : décor, variations d'un objet
export function hash2(x, y, seed = 0) {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ (seed | 0)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

export function createRng(seed = 1) {
  const seed0 = hashSeed(seed) || 0x9e3779b9;
  let a = seed0;

  // mulberry32 : rapide, 32 bits d'état, bonne qualité pour un jeu
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  rng.int = (min, max) => min + Math.floor(rng() * (max - min + 1));
  rng.range = (min, max) => min + rng() * (max - min);
  rng.chance = p => rng() < p;
  rng.pick = arr => arr[Math.floor(rng() * arr.length)];
  rng.weighted = items => {
    const total = items.reduce((s, it) => s + it.w, 0);
    let r = rng() * total;
    for (const it of items) { r -= it.w; if (r < 0) return it.v; }
    return items[items.length - 1]?.v;
  };
  rng.shuffle = arr => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  // Dérivé de la graine d'origine : ne dépend pas des tirages déjà faits
  rng.fork = label => createRng(hashSeed(`${seed0}:${label}`));
  rng.seed = seed0;
  Object.defineProperty(rng, 'state', { get: () => a });
  rng.setState = s => { a = s >>> 0; };
  return rng;
}
