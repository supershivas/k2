// Moteur du jeu : la face du K2 vue de face, le héros minuscule qui grimpe.
// Simulation (altitude, ressources, météo, temps) en unités « logiques » (x de 0 à 100, altitude en mètres),
// rendu pixel art en palette Game Boy à K fois cette définition : 1 m = K pixels.
// Deux points de vue : de face sur la paroi, de profil sous un dévers.
import { PALETTE as P, spriteCanvas } from './sprites.js';
import { drawText } from './pixfont.js';
import { pickEvent } from './events.js';

export const K = 2;
export const W = 100 * K;
export const H = 160 * K;
export const SUMMIT = 8611;
const HERO_Y = 116 * K; // pieds du héros à l'écran
const TILE_H = 256 * K;
const OXYGEN_ALT = 6500;
const BOTTLE_SECONDS = 90;
const MAX = { food: 12, gas: 8, o2: 4 };
const ITEM_STEP = 110;
const BLOCK_STEP = 36;
const CAVE_STEP = 650;
const TRANSITION = 0.7;

// Dévers : toits de roche à franchir en traversée, de profil. len = nombre de prises à enchaîner.
export const OVERHANGS = [1200, 2300, 3400, 4500, 5600, 6700, 7700].map((a, id) => ({ id, a, len: 14 + 2 * id }));

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

function hash(n) {
  n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  n ^= n >>> 13;
  n = Math.imul(n, 0xc2b2ae35);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
function vnoise(x, seed = 0) {
  const i = Math.floor(x);
  const u = smooth(x - i);
  return lerp(hash(i * 131 + seed), hash((i + 1) * 131 + seed), u);
}

const hexToRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const RGB = P.map(hexToRgb);

export function newState() {
  return {
    alt: 0, x: 50, energy: 100, warmth: 100,
    food: 6, gas: 3, o2: 1, o2Sec: 0, o2On: false,
    min: 360, // minutes depuis le début, démarre à 6 h
    camps: [], items: [], falls: 0, steps: 0, summit: false,
    ov: null, ovDone: [], // dévers en cours { id, p } et dévers franchis
  };
}

// Motif tramé réutilisable : `level` cases sur 16 de la matrice de Bayer 4×4 sont peintes.
const patterns = {};
function bayerPattern(g, colorIdx, level) {
  const key = `${colorIdx}:${level}`;
  if (!patterns[key]) {
    const c = document.createElement('canvas');
    c.width = c.height = 4;
    const t = c.getContext('2d');
    t.fillStyle = P[colorIdx];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (BAYER[y][x] < level) t.fillRect(x, y, 1, 1);
    patterns[key] = g.createPattern(c, 'repeat');
  }
  return patterns[key];
}

// Textures de la paroi : roche sombre, roche claire, glace. Tramées et ombrées côté gauche (lumière à droite).
function makeTile(zone, seed) {
  const c = document.createElement('canvas');
  c.width = W; c.height = TILE_H;
  const g = c.getContext('2d');
  const base = zone === 2 ? P[2] : P[1];
  const mark = zone === 2 ? P[3] : P[2];
  const dark = zone === 2 ? P[1] : P[0];
  g.fillStyle = base; g.fillRect(0, 0, W, TILE_H);
  let n = seed;
  const r = () => hash(n++);
  // Strates : bandes horizontales irrégulières, avec un liseré clair dessous
  const strata = zone === 2 ? 14 : 26;
  for (let i = 0; i < strata; i++) {
    let x = Math.floor(r() * W), y = Math.floor(r() * TILE_H);
    const len = 20 + Math.floor(r() * 70);
    for (let k = 0; k < len; k++) {
      g.fillStyle = dark; g.fillRect(x % W, y % TILE_H, 1, 1);
      g.fillStyle = mark; g.fillRect(x % W, (y + 1) % TILE_H, 1, 1);
      x++;
      if (r() < 0.2) y += r() < 0.5 ? -1 : 1;
    }
  }
  // Éclats de roche ou de glace
  const dots = zone === 0 ? 260 : zone === 1 ? 300 : 460;
  for (let i = 0; i < dots; i++) {
    g.fillStyle = r() < (zone === 2 ? 0.55 : 0.18) ? mark : dark;
    const w = zone === 2 ? 2 + Math.floor(r() * 12) : 2 + Math.floor(r() * 7);
    g.fillRect(Math.floor(r() * W), Math.floor(r() * TILE_H), w, 1 + Math.floor(r() * 2));
  }
  // Couloirs et arêtes : longues traces verticales
  for (let i = 0; i < 16; i++) {
    let x = Math.floor(r() * W), y = Math.floor(r() * TILE_H);
    const len = 80 + r() * 220;
    for (let k = 0; k < len; k++) {
      g.fillStyle = dark; g.fillRect(x, y % TILE_H, 1, 1);
      g.fillStyle = mark; g.fillRect(x + 1, y % TILE_H, 1, 1);
      y++;
      if (r() < 0.3) x += r() < 0.5 ? -1 : 1;
    }
  }
  // Ombre tramée à gauche, lumière tramée à droite
  const img = g.getImageData(0, 0, W, TILE_H);
  const d = img.data;
  const idxOf = (R, G, B) => RGB.findIndex(([r2, g2, b2]) => r2 === R && g2 === G && b2 === B);
  for (let y = 0; y < TILE_H; y++) {
    for (let x = 0; x < W; x++) {
      const t = (x - W / 2) / (W / 2);
      const shade = clamp((-t - 0.05) * 0.95, 0, 0.7);
      const light = clamp((t - 0.25) * 0.6, 0, 0.4);
      const b = BAYER[y % 4][x % 4] / 16;
      const o = (y * W + x) * 4;
      const ci = idxOf(d[o], d[o + 1], d[o + 2]);
      if (ci < 0) continue;
      let ni = ci;
      if (b < shade) ni = Math.max(0, ci - 1);
      else if (b > 1 - light) ni = Math.min(3, ci + 1);
      if (ni !== ci) { d[o] = RGB[ni][0]; d[o + 1] = RGB[ni][1]; d[o + 2] = RGB[ni][2]; }
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// Bande de nuages (entre 2 600 et 3 300 m) : pixels clairs répartis au hasard.
function makeCloudStrip() {
  const c = document.createElement('canvas');
  const h = 700 * K;
  c.width = W; c.height = h;
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) {
    const cover = Math.max(0, 1 - Math.abs(y - h / 2) / (h / 2)) ** 0.7;
    for (let x = 0; x < W; x++) {
      const v = hash(Math.floor(x / 6) * 977 + Math.floor(y / 3) * 31 + 5);
      if (v < cover * 0.17) { g.fillStyle = v < cover * 0.06 ? P[3] : P[2]; g.fillRect(x, y, 1, 1); }
    }
  }
  return c;
}

// Bloc de roche (28×18) et plaque de verglas (34×8), prédessinés.
function makeBlock() {
  const c = document.createElement('canvas');
  c.width = 28; c.height = 18;
  const g = c.getContext('2d');
  const hw = [6, 8, 10, 11, 12, 13, 13, 13, 13, 13, 13, 13, 13, 14, 14, 14, 14, 14];
  hw.forEach((half, row) => {
    for (let x = 14 - half; x < 14 + half; x++) {
      const edge = x < 14 - half + 2 || x >= 14 + half - 2 || row < 2 || row > 15;
      const lit = (x - 14) / half - (row / 18) * 0.9;
      let col = P[2];
      if (edge) col = P[0];
      else if (lit < -0.55) col = P[3];
      else if (lit > 0.1) col = P[1];
      else if (BAYER[row % 4][x % 4] < 6) col = P[3];
      g.fillStyle = col; g.fillRect(x, row, 1, 1);
    }
  });
  g.fillStyle = P[0]; g.fillRect(8, 9, 6, 1); g.fillRect(13, 10, 1, 4); g.fillRect(18, 6, 4, 1);
  return c;
}
function makeIce() {
  const c = document.createElement('canvas');
  c.width = 34; c.height = 8;
  const g = c.getContext('2d');
  for (let y = 0; y < 8; y++) {
    const inset = y < 2 ? 4 - y * 2 : y > 5 ? (y - 5) * 2 : 0;
    for (let x = inset; x < 34 - inset; x++) {
      g.fillStyle = (x + y) % 5 === 0 ? P[2] : P[3];
      if (y === 7 || x === inset) g.fillStyle = P[2];
      g.fillRect(x, y, 1, 1);
    }
  }
  g.fillStyle = P[0];
  for (let x = 4; x < 30; x += 7) g.fillRect(x, 3 + (x % 3), 3, 1);
  return c;
}

export class Game {
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    canvas.width = W; canvas.height = H;
    this.g = canvas.getContext('2d');
    this.hooks = hooks; // say(text, tone), event(ev), summit(), stateChanged()
    this.s = newState();
    this.playing = false;
    this.view = 0;
    this.hx = 50;
    this.frame = 0;
    this.grip = false;
    this.lastSide = null;
    this.lastStep = -9;
    this.clock = 0;
    this.dt = 0.016;
    this.shake = 0;
    this.fall = null;
    this.sleep = null;
    this.tr = null; // transition entre vue de face et vue de profil
    this.drawnMode = 'face';
    this.lastMode = 'face';
    this.evt = { next: 40, last: -1 };
    this.gust = { next: 12, warn: 0, dir: 1 };
    this.rock = { next: 14, warn: 0, fall: 0, x: 50, hit: false };
    this.floats = [];
    this.flakes = Array.from({ length: 170 }, (_, i) => ({ x: hash(i) * W, y: hash(i + 500) * H, v: 0.6 + hash(i + 900) }));
    this.streaks = Array.from({ length: 14 }, (_, i) => ({ x: hash(i + 40) * W, y: hash(i + 80) * H, l: (8 + hash(i + 120) * 14) * K }));
    this.tiles = [makeTile(0, 11), makeTile(1, 77), makeTile(2, 151)];
    this.clouds = makeCloudStrip();
    this.blockImg = makeBlock();
    this.iceImg = makeIce();
    this.backdrops = {};
    this.night = document.createElement('canvas');
    this.night.width = W; this.night.height = H;
  }

  load(state) {
    const s = Object.assign(newState(), state);
    s.camps = (s.camps || []).map(c => (typeof c === 'number' ? { a: c, x: 50 } : c));
    s.items = Array.isArray(s.items) ? s.items : [];
    s.ovDone = Array.isArray(s.ovDone) ? s.ovDone : [];
    if (s.ov && !OVERHANGS[s.ov.id]) s.ov = null;
    this.s = s;
    this.view = s.alt;
    this.hx = s.x;
    this.fall = this.sleep = this.tr = null;
    this.grip = false;
    this.lastSide = null;
    this.floats = [];
    this.lastMode = this.drawnMode = this.mode;
    this.hooks.stateChanged?.();
  }

  say(text, tone = 'info') { this.hooks.say?.(text, tone); }

  // ── Environnement ──────────────────────────────────────────────────────
  daylightAt(min) {
    const t = (min % 1440) / 1440;
    const e = Math.sin((t - 0.25) * Math.PI * 2);
    return smooth(clamp((e + 0.15) / 0.45, 0, 1));
  }
  weatherAt(min, alt) {
    const a = alt / SUMMIT;
    const wind = clamp((vnoise(min / 90, 11) - 0.35) * 1.8 * (0.3 + 0.95 * a), 0, 1);
    const snow = clamp((vnoise(min / 140, 29) - 0.45) * 2.2 * (0.45 + 0.8 * a), 0, 1);
    return { wind, snow };
  }
  tempAt(min, alt) {
    const { wind, snow } = this.weatherAt(min, alt);
    return 14 - 6.8 * (alt / 1000) - (1 - this.daylightAt(min)) * 14 - snow * 6 - wind * 4;
  }
  get daylight() { return this.daylightAt(this.s.min); }
  get weather() { return this.weatherAt(this.s.min, this.s.alt); }
  get temperature() { return this.tempAt(this.s.min, this.s.alt); }
  get needsOxygen() { return this.s.alt > OXYGEN_ALT; }
  get oxygenActive() { return this.s.o2On && this.s.o2Sec > 0; }
  get busy() { return !!(this.fall || this.sleep || this.s.summit); }
  get mode() { return this.s.ov ? 'profile' : 'face'; }

  // Prévision du lendemain à l'altitude actuelle, par tranches de 3 h.
  forecast() {
    const d0 = Math.floor(this.s.min / 1440);
    const alt = this.s.alt;
    const slots = [];
    for (let h = 0; h < 24; h += 3) {
      const m = (d0 + 1) * 1440 + h * 60 + 90;
      slots.push({ h, ...this.weatherAt(m, alt), T: this.tempAt(m, alt), dark: this.daylightAt(m) < 0.5 });
    }
    return { day: d0 + 2, alt: Math.round(alt), slots };
  }

  // ── Géométrie de la face ───────────────────────────────────────────────
  faceHalf(a) { return 8 + 72 * Math.pow(1 - clamp(a / SUMMIT, 0, 1), 0.75); }
  edgeL(a) { a = Math.max(0, a); return Math.round(50 - this.faceHalf(a) + 3 * (vnoise(a / 30, 3) - 0.5) * 2 + 1.5 * (vnoise(a / 7, 5) - 0.5) * 2); }
  edgeR(a) { a = Math.max(0, a); return Math.round(50 + this.faceHalf(a) + 3 * (vnoise(a / 30, 13) - 0.5) * 2 + 1.5 * (vnoise(a / 7, 15) - 0.5) * 2); }
  // Bords de la face visibles à l'écran (en bas, la montagne déborde du cadre).
  leftBound(a) { return Math.max(this.edgeL(a), 0); }
  rightBound(a) { return Math.min(this.edgeR(a), 100); }
  clampX(x, a) { return clamp(x, this.leftBound(a) + 6, this.rightBound(a) - 6); }
  ys(a) { return HERO_Y + (this.view - a) * K; }

  // Blocs de roche et plaques de verglas, générés par tranche de 36 m.
  obstacle(i) {
    if (i < 1 || i * BLOCK_STEP > SUMMIT - 60 || hash(i * 17 + 3) > 0.3 + 0.35 * (i * BLOCK_STEP / SUMMIT)) return null;
    const a = i * BLOCK_STEP + 8 + hash(i * 17 + 5) * 20;
    if (OVERHANGS.some(o => Math.abs(o.a - a) < 24)) return null; // rien au pied ni au-dessus d'un dévers
    const L = this.leftBound(a) + 9, R = this.rightBound(a) - 9;
    const type = hash(i * 17 + 9) < 0.55 ? 'block' : 'ice';
    return { a, x: L + hash(i * 17 + 7) * Math.max(1, R - L), type, w: type === 'block' ? 10 : 16 };
  }
  blockBetween(a0, a1, x) {
    for (let i = Math.floor(a0 / BLOCK_STEP); i <= Math.floor((a1 + 4) / BLOCK_STEP); i++) {
      const ob = this.obstacle(i);
      if (ob && ob.type === 'block' && ob.a > a0 && ob.a <= a1 + 3 && Math.abs(ob.x - x) < ob.w / 2 + 2) return ob;
    }
    return null;
  }
  iceAt(a, x) {
    for (let i = Math.floor(a / BLOCK_STEP) - 1; i <= Math.floor(a / BLOCK_STEP) + 1; i++) {
      const ob = this.obstacle(i);
      if (ob && ob.type === 'ice' && Math.abs(ob.a - a) < 6 && Math.abs(ob.x - x) < ob.w / 2) return ob;
    }
    return null;
  }

  // Ressources posées sur la paroi : une tous les ~110 m, à aller chercher.
  item(i) {
    if (i < 0 || i * ITEM_STEP + 90 > SUMMIT || hash(i * 29 + 1) > 0.85) return null;
    const a = i * ITEM_STEP + 30 + hash(i * 29 + 3) * 60;
    const L = this.leftBound(a) + 9, R = this.rightBound(a) - 9;
    const r = hash(i * 29 + 5);
    let type = r < 0.5 ? 'ration' : r < 0.75 ? 'gaz' : 'o2';
    if (type === 'o2' && a < 2000) type = 'ration';
    return { id: i, a, x: L + hash(i * 29 + 7) * Math.max(1, R - L), type };
  }

  // Grottes refuges : une tous les ~650 m, à l'abri du vent et du froid.
  cave(i) {
    if (i < 1 || hash(i * 41 + 2) > 0.88) return null;
    let a = i * CAVE_STEP + 120 + hash(i * 41 + 4) * 400;
    if (a > SUMMIT - 200) return null;
    if (OVERHANGS.some(o => Math.abs(o.a - a) < 40)) a += 60;
    const L = this.leftBound(a) + 16, R = this.rightBound(a) - 16;
    return { id: i, a, x: L + hash(i * 41 + 6) * Math.max(1, R - L) };
  }
  cavesIn(a0, a1) {
    const out = [];
    for (let i = Math.max(1, Math.floor((a0 - 400) / CAVE_STEP)); i <= Math.floor(a1 / CAVE_STEP); i++) {
      const c = this.cave(i);
      if (c && c.a >= a0 && c.a <= a1) out.push(c);
    }
    return out;
  }
  nearCave() {
    const s = this.s;
    if (s.ov) return null;
    return this.cavesIn(s.alt - 10, s.alt + 10).find(c => Math.abs(c.x - s.x) < 14) || null;
  }

  // Prochain dévers non franchi que ce pas fait atteindre.
  overhangBetween(a0, a1) {
    return OVERHANGS.find(o => !this.s.ovDone.includes(o.id) && o.a >= a0 - 0.001 && o.a <= a1) || null;
  }

  // ── Actions du joueur ──────────────────────────────────────────────────
  step(side) {
    const s = this.s;
    if (!this.playing || this.busy || this.grip) return;
    if (s.energy < 1) { this.say('Épuisé : reprends ton souffle', 'warn'); return; }
    this.frame ^= 1;
    this.lastStep = this.clock;
    if (s.ov) { this.stepProfile(side); return; }
    if (side === this.lastSide) { // même côté : traversée latérale
      s.x = this.clampX(s.x + (side === 'L' ? -5 : 5), s.alt);
      s.energy = Math.max(0, s.energy - 0.5);
      return;
    }
    this.lastSide = side;
    const { wind, snow } = this.weather;
    const hypoxia = this.needsOxygen && !this.oxygenActive;
    const ice = this.iceAt(s.alt, s.x);
    const slow = (1 - 0.28 * snow - 0.25 * wind) * (1 - 0.2 * (1 - this.daylight)) * (hypoxia ? 0.6 : 1) * (ice ? 0.5 : 1);
    let next = Math.min(SUMMIT, s.alt + 4 * slow);
    const hit = this.blockBetween(s.alt, next, s.x);
    if (hit) {
      next = Math.max(s.alt, hit.a - 4);
      s.energy = Math.max(0, s.energy - 8);
      this.shake = 0.25;
      this.say('Bloc ! Traverse : même bouton deux fois', 'warn');
    }
    const roof = this.overhangBetween(s.alt, next);
    if (roof) next = roof.a;
    s.alt = next;
    s.energy = Math.max(0, s.energy - 0.7 * (1 + s.alt / 7000) * (hypoxia ? 2.4 : 1) * (1 + 0.4 * wind) * (ice ? 1.8 : 1));
    s.min += 1.8;
    s.steps++;
    s.x = this.clampX(s.x, s.alt);
    if (roof) {
      s.ov = { id: roof.id, p: 0 };
      this.lastSide = null;
      this.say('Dévers ! Alterne les mains pour traverser', 'warn');
      return;
    }
    if (s.alt >= SUMMIT && !s.summit) {
      s.summit = true;
      this.hooks.summit?.();
    }
  }

  // Sous un dévers : une main après l'autre. Alterner Gauche / Droite fait avancer ; la même main deux fois ne sert à rien.
  stepProfile(side) {
    const s = this.s, ov = s.ov;
    const roof = OVERHANGS[ov.id];
    const { wind } = this.weather;
    const hypoxia = this.needsOxygen && !this.oxygenActive;
    if (side === this.lastSide) {
      s.energy = Math.max(0, s.energy - 0.6);
      this.say('Alterne les mains : Gauche, Droite…', 'info');
      return;
    }
    this.lastSide = side;
    ov.p++;
    s.energy = Math.max(0, s.energy - 1.2 * (1 + s.alt / 9000) * (hypoxia ? 2.2 : 1) * (1 + 0.5 * wind));
    s.min += 1.8;
    s.steps++;
    if (ov.p >= roof.len) {
      s.ovDone.push(roof.id);
      s.ov = null;
      s.alt = roof.a + 8;
      this.lastSide = null;
      this.say('Dévers franchi !', 'good');
    }
  }

  setGrip(on) { this.grip = on && this.playing && !this.busy; }

  eat() {
    const s = this.s;
    if (this.busy) return;
    if (s.food < 1) { this.say('Plus de vivres', 'warn'); return; }
    if (s.energy > 94) { this.say('Tu n’as pas faim', 'info'); return; }
    s.food--;
    s.energy = Math.min(100, s.energy + 32);
    s.warmth = Math.min(100, s.warmth + 6);
    this.say('Ration avalée : +32 énergie', 'good');
  }

  toggleOxygen() {
    const s = this.s;
    if (this.busy) return;
    if (s.o2On) { s.o2On = false; this.say('Oxygène coupé', 'info'); return; }
    if (s.o2Sec <= 0 && s.o2 < 1) { this.say('Plus de bouteille d’oxygène', 'warn'); return; }
    s.o2On = true;
    this.say('Oxygène ouvert', 'good');
  }

  camp() {
    const s = this.s;
    if (!this.playing || this.busy) return;
    if (s.ov) { this.say('Impossible de camper sous un dévers', 'warn'); return; }
    const cave = this.nearCave();
    if (cave) {
      if (!s.camps.some(c => c.cave === cave.id)) s.camps.push({ a: Math.round(cave.a), x: Math.round(cave.x), cave: cave.id });
      s.alt = cave.a;
      s.x = cave.x;
    } else if (!s.camps.some(c => Math.abs(c.a - s.alt) < 40)) {
      s.camps.push({ a: Math.round(s.alt), x: Math.round(s.x) });
    }
    s.o2On = false;
    this.grip = false;
    const hour = (s.min % 1440) / 60;
    const night = this.daylight < 0.5;
    const toMorning = ((6 - hour + 24) % 24) * 60 || 1440;
    const fed = s.food > 0;
    const heated = !!cave || s.gas > 0; // la grotte protège du froid sans gaz
    if (fed) s.food--;
    if (s.gas > 0 && !cave) s.gas--;
    this.sleep = { left: night ? toMorning : 300, total: night ? toMorning : 300, dur: 2.8, fed, heated, cave: !!cave };
    this.say(cave ? 'Tu t’abrites dans la grotte…' : night ? 'Tu montes le camp pour la nuit…' : 'Tu fais une pause au camp…', 'info');
  }

  // Aides pour les événements.
  gain(stat, n) {
    const s = this.s;
    const max = stat === 'energy' || stat === 'warmth' ? 100 : MAX[stat];
    s[stat] = clamp(s[stat] + n, 0, max);
  }
  climb(m) {
    const s = this.s;
    const roof = m > 0 ? OVERHANGS.find(o => !s.ovDone.includes(o.id) && o.a > s.alt) : null; // un dévers ne se saute pas
    s.alt = clamp(s.alt + m, 0, Math.min(SUMMIT - 30, roof ? roof.a - 1 : SUMMIT));
    s.x = this.clampX(s.x, s.alt);
  }
  dropRock() {
    const r = this.rock;
    r.x = this.clampX(this.s.x + (Math.random() - 0.5) * 24, this.s.alt);
    r.warn = 1.5;
  }

  // ── Simulation ─────────────────────────────────────────────────────────
  update(dt) {
    dt = Math.min(dt, 0.1);
    this.dt = dt;
    this.clock += dt;
    this.shake = Math.max(0, this.shake - dt);
    const s = this.s;

    this.view += (s.alt - this.view) * Math.min(1, dt * 10);
    this.hx += (s.x - this.hx) * Math.min(1, dt * 14);
    this.floats = this.floats.filter(f => (f.t += dt) < 1.6);

    const mode = this.mode;
    if (mode !== this.lastMode) {
      this.tr = { t: 0, from: this.lastMode };
      this.lastMode = mode;
    }
    if (this.tr) {
      this.tr.t += dt / TRANSITION;
      this.drawnMode = this.tr.t < 0.5 ? this.tr.from : mode;
      if (this.tr.t >= 1) this.tr = null;
    } else this.drawnMode = mode;

    if (!this.playing) return;
    if (this.fall) { this.updateFall(dt); return; }
    if (this.sleep) { this.updateSleep(dt); return; }
    if (s.summit) return;

    s.min += dt * 0.6;
    const { wind } = this.weather;
    const T = this.temperature;
    const exerting = this.clock - this.lastStep < 1.5;

    const drain = Math.max(0, -T - 6) * 0.011 * (1 + wind * 0.9) * (exerting ? 0.45 : 1);
    s.warmth = clamp(s.warmth - drain * dt + (T > -4 ? 2 * dt : 0), 0, 100);

    if (s.o2On) {
      if (s.o2Sec <= 0) {
        if (s.o2 >= 1) { s.o2--; s.o2Sec = BOTTLE_SECONDS; } else { s.o2On = false; this.say('Bouteille vide', 'warn'); }
      }
      if (s.o2On) s.o2Sec = Math.max(0, s.o2Sec - dt);
    }

    if (this.clock - this.lastStep > 0.8 && s.warmth > 15) {
      const hypoxia = this.needsOxygen && !this.oxygenActive;
      const rate = (this.grip ? 6 : 4) * (1 - s.alt / 14000) * (hypoxia ? 0.3 : 1) * (s.food < 1 ? 0.5 : 1);
      if (s.ov) {
        // Suspendu : se reposer sur une prise (Prise) récupère un peu, rester pendu aux bras épuise.
        s.energy = this.grip ? Math.min(100, s.energy + rate * 0.5 * dt) : Math.max(0, s.energy - (0.9 + wind) * dt);
        if (s.energy <= 0) this.startFall('Épuisement');
      } else s.energy = Math.min(100, s.energy + rate * dt);
    }

    this.pickupItems();
    this.updateGusts(dt, wind);
    this.updateRock(dt);
    this.updateEvents(dt);
    if (s.warmth <= 0) this.startFall('Hypothermie');
  }

  updateEvents(dt) {
    const e = this.evt;
    if (this.s.ov || this.fall || this.sleep) return;
    e.next -= dt;
    if (e.next > 0) return;
    e.next = 55 + Math.random() * 70;
    const pick = pickEvent(this, e.last);
    if (!pick) return;
    e.last = pick.index;
    pick.event.run(this);
    this.hooks.event?.(pick.event);
  }

  pickupItems() {
    const s = this.s;
    if (s.ov) return;
    for (let i = Math.max(0, Math.floor((s.alt - 70) / ITEM_STEP)); i <= Math.floor((s.alt + 10) / ITEM_STEP); i++) {
      const it = this.item(i);
      if (!it || s.items.includes(i)) continue;
      if (Math.abs(it.a - s.alt) < 6 && Math.abs(it.x - s.x) < 11) {
        s.items.push(i);
        let text;
        if (it.type === 'ration') { s.food = Math.min(MAX.food, s.food + 2); text = '+2 vivres'; }
        else if (it.type === 'gaz') { s.gas = Math.min(MAX.gas, s.gas + 1); text = '+1 gaz'; }
        else { s.o2 = Math.min(MAX.o2, s.o2 + 1); text = '+1 oxygène'; }
        this.floats.push({ text, x: Math.round(s.x * K) - 16, t: 0 });
        this.say(`Trouvé : ${text.slice(1)}`, 'good');
      }
    }
  }

  updateGusts(dt, wind) {
    const gu = this.gust;
    const s = this.s;
    if (wind < 0.45) { gu.warn = 0; gu.next = Math.max(gu.next, 6); return; }
    if (gu.warn > 0) {
      gu.warn -= dt;
      if (gu.warn <= 0) {
        gu.next = lerp(22, 9, wind) + Math.random() * 6;
        if (this.grip) {
          s.energy = Math.max(0, s.energy - 2);
          this.say('Tu tiens bon !', 'good');
        } else if (s.ov) {
          s.energy = Math.max(0, s.energy - 12);
          s.ov.p = Math.max(0, s.ov.p - 2);
          this.say('Rafale ! Tu balances sous le toit', 'bad');
          if (s.energy <= 0) this.startFall('Épuisement');
        } else {
          s.x = this.clampX(s.x + gu.dir * 22, s.alt);
          s.energy = Math.max(0, s.energy - 12);
          s.alt = Math.max(0, s.alt - 10);
          this.say('Rafale ! Tu es déporté', 'bad');
          if (s.energy <= 0) this.startFall('Épuisement');
        }
        this.shake = 0.4;
      }
      return;
    }
    gu.next -= dt;
    if (gu.next <= 0) {
      gu.warn = 1.8;
      gu.dir = Math.random() < 0.5 ? -1 : 1;
      this.say('Rafale ! Maintiens la prise', 'bad');
    }
  }

  // Chute de pierres : annoncée par une ligne pointillée, à esquiver en traversant.
  updateRock(dt) {
    const r = this.rock, s = this.s;
    if (s.ov) { r.warn = 0; r.fall = 0; return; } // à l'abri sous le toit
    if (r.warn > 0) {
      r.warn -= dt;
      if (r.warn <= 0) { r.fall = 0.0001; r.hit = false; }
      return;
    }
    if (r.fall > 0) {
      r.fall += dt / 0.7;
      const y = lerp(-12, HERO_Y + 12, r.fall);
      if (!r.hit && y >= HERO_Y - 16) {
        r.hit = true;
        if (Math.abs(r.x - s.x) <= 6) {
          s.energy = Math.max(0, s.energy - (this.grip ? 6 : 22));
          if (!this.grip) s.alt = Math.max(0, s.alt - 12);
          this.shake = 0.5;
          this.say('Touché par une pierre !', 'bad');
          if (s.energy <= 0) this.startFall('Épuisement');
        }
      }
      if (r.fall >= 1) r.fall = 0;
      return;
    }
    if (s.alt < 150) return;
    r.next -= dt;
    if (r.next <= 0) {
      this.dropRock();
      r.next = lerp(26, 12, s.alt / SUMMIT) + Math.random() * 8;
      this.say('Pierres ! Écarte-toi', 'bad');
    }
  }

  startFall(reason) {
    const s = this.s;
    if (this.fall) return;
    const below = s.camps.filter(c => c.a <= s.alt);
    const target = below.length ? below.reduce((m, c) => (c.a > m.a ? c : m)) : { a: 0, x: 50 };
    s.falls++;
    s.o2On = false;
    s.ov = null;
    this.lastSide = null;
    this.grip = false;
    this.fall = { from: s.alt, to: target.a, x: target.x, t: 0 };
    this.say(`${reason} : tu dévisses !`, 'bad');
  }

  updateFall(dt) {
    const f = this.fall, s = this.s;
    f.t += dt / 1.4;
    s.alt = lerp(f.from, f.to, f.t * f.t);
    if (f.t >= 1) {
      s.alt = f.to;
      s.x = f.x;
      s.food = Math.max(f.to === 0 ? 5 : 0, s.food - 2);
      if (f.to === 0) { s.gas = Math.max(s.gas, 3); s.o2 = Math.max(s.o2, 1); }
      s.energy = 40;
      s.warmth = Math.max(s.warmth, 40);
      this.fall = null;
      this.view = s.alt;
      this.say(f.to === 0 ? 'De retour au camp de base' : `De retour au camp à ${Math.round(f.to)} m`, 'warn');
    }
  }

  updateSleep(dt) {
    const sl = this.sleep, s = this.s;
    const chunk = Math.min(sl.left, sl.total * dt / sl.dur);
    sl.left -= chunk;
    s.min += chunk;
    if (sl.left > 0.01) return;
    s.energy = Math.min(100, s.energy + (sl.fed ? 70 : 28));
    s.warmth = sl.heated ? 100 : Math.max(s.warmth, 45);
    this.sleep = null;
    const day = Math.floor(s.min / 1440) + 1;
    if (sl.cave) this.say(`Nuit à l’abri dans la grotte, jour ${day}`, 'good');
    else this.say(sl.heated ? `Camp levé, jour ${day}` : `Nuit glaciale sans gaz, jour ${day}`, sl.heated ? 'good' : 'warn');
  }

  // ── Rendu ──────────────────────────────────────────────────────────────
  render() {
    const g = this.g;
    const { wind, snow } = this.weather;
    g.save();
    if (this.shake > 0) g.translate(Math.round((Math.random() - 0.5) * 3 * K), Math.round((Math.random() - 0.5) * 2 * K));
    if (this.drawnMode === 'profile' && this.s.ov) {
      this.drawProfile(g, wind);
      this.drawWeather(g, wind, snow);
    } else {
      this.drawSky(g);
      this.drawFace(g, snow);
      this.drawClouds(g);
      this.drawObjects(g);
      this.drawHero(g, wind);
      this.drawRock(g);
      this.drawWeather(g, wind, snow);
      this.drawFloats(g);
    }
    g.restore();
    this.drawNight(g);
    this.drawTransition(g);
  }

  drawSky(g) {
    g.fillStyle = P[3]; g.fillRect(0, 0, W, H);
    // Le ciel fonce avec l'altitude : trame de plus en plus dense
    const level = Math.round(clamp(this.view / SUMMIT, 0, 1) * 9);
    if (level > 0) { g.fillStyle = bayerPattern(g, 2, level); g.fillRect(0, 0, W, H); }
    g.fillStyle = P[2];
    for (let k = 0; k < 10; k++) {
      const a = 700 * k + hash(k + 60) * 400;
      const y = Math.round(HERO_Y + (this.view - a) * 0.6 * K);
      if (y < -8 || y > H) continue;
      const x = Math.round(((hash(k) * 140 + this.clock * (1.5 + (k % 3))) % 140) * K - 20 * K);
      g.fillRect(x, y, 28, 4); g.fillRect(x + 6, y - 4, 16, 4); g.fillRect(x + 2, y + 4, 22, 2);
    }
  }

  drawFace(g, snow) {
    const cover = clamp(0.1 + (this.s.alt / SUMMIT) * 0.5 + snow * 0.4, 0, 1);
    const groundY = this.ys(0);
    for (let y = 0; y < H; y++) {
      const a = this.view + (HERO_Y - y) / K;
      if (a < 0 || a > SUMMIT) continue;
      const L = Math.max(0, this.edgeL(a) * K), R = Math.min(W - 1, this.edgeR(a) * K);
      const am = Math.floor(a);
      let zone = a < 2400 ? 0 : a < 5800 ? 1 : 2;
      if (a > 2250 && a < 2550) zone = hash(am * 3) < (a - 2250) / 300 ? 1 : 0;
      if (a > 5650 && a < 5950) zone = hash(am * 5) < (a - 5650) / 300 ? 2 : 1;
      const row = ((Math.floor(a * K) % TILE_H) + TILE_H) % TILE_H;
      g.drawImage(this.tiles[zone], L, row, R - L + 1, 1, L, y, R - L + 1, 1);
      g.fillStyle = P[0]; g.fillRect(L, y, 2, 1); g.fillRect(R - 1, y, 2, 1);
      g.fillStyle = P[3];
      g.fillRect(L + 2, y, Math.floor(cover * (2 + 6 * hash(Math.floor(a * 2) * 7 + 1))), 1);
      g.fillRect(R - 1 - Math.floor(cover * 3 * hash(Math.floor(a * 2) * 11 + 2)), y, 1, 1);
    }
    if (groundY < H) {
      g.fillStyle = P[3]; g.fillRect(0, groundY, W, H - groundY);
      g.fillStyle = P[0]; g.fillRect(0, groundY, W, 2);
      g.fillStyle = bayerPattern(g, 2, 6); g.fillRect(0, groundY + 2, W, Math.min(24, H - groundY));
      g.fillStyle = P[2];
      for (let x = 6; x < W; x += 18) g.fillRect(x, groundY + 8 + (x * 7) % 22, 6, 2);
    }
    // Repères d'altitude tous les 500 m
    for (let a = Math.max(500, Math.ceil((this.view - 60) / 500) * 500); a <= this.view + HERO_Y / K + 8; a += 500) {
      const y = Math.round(this.ys(a));
      const L = this.edgeL(a) * K;
      const label = String(a);
      g.fillStyle = P[0]; g.fillRect(L + 4, y - 13, label.length * 8 + 3, 13);
      drawText(g, label, L + 6, y - 11, P[3], 2);
      g.fillStyle = P[3];
      for (let x = L + 4; x < this.edgeR(a) * K - 2; x += 6) g.fillRect(x, y, 2, 1);
    }
  }

  drawClouds(g) {
    const top = Math.round(this.ys(3300));
    const h = 700 * K;
    if (top > H || top + h < 0) return;
    const off = Math.floor(this.clock * 3 * K) % W;
    g.drawImage(this.clouds, off, 0, W - off, h, 0, top, W - off, h);
    if (off) g.drawImage(this.clouds, 0, 0, off, h, W - off, top, off, h);
  }

  drawObjects(g) {
    const s = this.s;
    const lo = this.view - (H - HERO_Y) / K - 20, hi = this.view + HERO_Y / K + 20;
    // Dévers vus de face : un toit sombre qui avance au-dessus de la paroi
    for (const o of OVERHANGS) {
      if (o.a < lo || o.a > hi) continue;
      const y = Math.round(this.ys(o.a)), L = this.edgeL(o.a) * K + 2, R = this.edgeR(o.a) * K - 2;
      g.fillStyle = P[0]; g.fillRect(L, y - 22, R - L, 22);
      g.fillStyle = bayerPattern(g, 1, 8); g.fillRect(L, y - 22, R - L, 8);
      g.fillStyle = P[3];
      for (let x = L + 3; x < R - 3; x += 7 + Math.floor(hash(x + o.id * 31) * 6)) g.fillRect(x, y, 2, 2 + Math.floor(hash(x * 3 + o.id) * 6));
      g.fillStyle = P[0];
      for (let x = L + 1; x < R - 3; x += 5) g.fillRect(x, y - 1, 3, 1 + Math.floor(hash(x * 7 + o.id) * 4));
      if (this.s.ovDone.includes(o.id)) { g.fillStyle = P[4]; g.fillRect(Math.round((L + R) / 2) - 1, y - 20, 2, 20); } // corde fixe
      else drawText(g, 'DEVERS', Math.round((L + R) / 2) - 12, y - 17, P[3]);
    }
    for (let i = Math.max(1, Math.floor(lo / BLOCK_STEP)); i <= Math.floor(hi / BLOCK_STEP); i++) {
      const ob = this.obstacle(i);
      if (!ob) continue;
      const y = Math.round(this.ys(ob.a)), x = Math.round(ob.x * K);
      if (ob.type === 'block') g.drawImage(this.blockImg, x - 14, y - 18);
      else g.drawImage(this.iceImg, x - 17, y - 8);
    }
    for (const c of this.cavesIn(lo, hi)) {
      const y = Math.round(this.ys(c.a));
      const cv = spriteCanvas('grotte');
      g.drawImage(cv, Math.round(c.x * K) - (cv.width >> 1), y - cv.height);
    }
    for (const c of s.camps) {
      if (c.cave !== undefined || (this.sleep && Math.abs(c.a - s.alt) < 40)) continue;
      const y = this.ys(c.a);
      if (y > -20 && y < H + 20) {
        const t = spriteCanvas('tent');
        g.drawImage(t, c.x * K - (t.width >> 1), Math.round(y) - t.height);
      }
    }
    const blink = Math.floor(this.clock * 2) % 2;
    for (let i = Math.max(0, Math.floor(lo / ITEM_STEP)); i <= Math.floor(hi / ITEM_STEP); i++) {
      const it = this.item(i);
      if (!it || s.items.includes(i)) continue;
      const y = Math.round(this.ys(it.a)), x = Math.round(it.x * K);
      const sp = spriteCanvas(it.type);
      g.fillStyle = blink ? P[3] : P[0];
      g.fillRect(x - (sp.width >> 1) - 2, y - sp.height - 2, sp.width + 4, sp.height + 4);
      g.drawImage(sp, x - (sp.width >> 1), y - sp.height);
    }
    const fy = this.ys(SUMMIT);
    if (fy > -20 && fy < H + 20) {
      const f = spriteCanvas('flag');
      g.drawImage(f, W / 2 - (f.width >> 1), Math.round(fy) - f.height);
    }
  }

  drawHero(g, wind) {
    const x = Math.round(this.hx * K - wind * K * Math.sin(this.clock * 6));
    if (this.sleep) {
      if (!this.sleep.cave) {
        const t = spriteCanvas('tent');
        g.drawImage(t, x - (t.width >> 1), HERO_Y - t.height);
      }
      const z = Math.floor(this.clock * 2) % 3;
      drawText(g, 'Z', x + 6 + z * 6, HERO_Y - 28 - z * 6, P[4], 2);
      return;
    }
    const grabbed = this.grip ? 'heroA' : this.frame ? 'heroB' : 'heroA';
    const sp = spriteCanvas(grabbed);
    const top = HERO_Y - sp.height;
    if (this.fall) {
      const t = this.fall.t;
      g.save();
      g.translate(x, top + sp.height / 2 + t * 60);
      g.rotate(t * 9);
      g.drawImage(sp, -(sp.width >> 1), -(sp.height >> 1));
      g.restore();
      return;
    }
    const bob = this.clock - this.lastStep < 0.12 ? -K : 0;
    g.fillStyle = P[0]; g.fillRect(x - (sp.width >> 1) - 2, top - 2 + bob, sp.width + 4, sp.height + 4); // fond sombre pour garder le héros lisible
    g.drawImage(sp, x - (sp.width >> 1), top + bob);
    if (this.gust.warn > 0 && Math.floor(this.clock * 8) % 2) {
      const dir = this.gust.dir;
      g.fillStyle = P[4];
      for (let k = 0; k < 6; k++) g.fillRect(x + dir * (14 + k * 2), top + 6 + (k % 2) * 2, 2, 2);
      g.fillRect(x + dir * 28, top + 4, 2, 8);
    }
  }

  drawRock(g) {
    const r = this.rock;
    const x = Math.round(r.x * K);
    if (r.warn > 0) {
      g.fillStyle = Math.floor(this.clock * 8) % 2 ? P[4] : P[0];
      for (let y = 0; y < H; y += 8) g.fillRect(x, y, 2, 4);
    } else if (r.fall > 0) {
      const y = Math.round(lerp(-12, HERO_Y + 12, r.fall));
      g.fillStyle = P[0]; g.fillRect(x - 4, y, 8, 8);
      g.fillStyle = P[4]; g.fillRect(x - 2, y + 2, 4, 4);
      g.fillStyle = P[1]; g.fillRect(x, y - 12, 2, 12);
    }
  }

  // ── Vue de profil : sous un dévers ─────────────────────────────────────
  // Géométrie du toit : face inférieure en y, bord (lèvre) en x.
  roofUnder(x) { return 112 + Math.round(7 * vnoise(x / 11, 21)); }

  profileBackdrop(roof) {
    if (this.backdrops[roof.id]) return this.backdrops[roof.id];
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const LIP = 164, WALL = 30;
    const alt = roof.a / SUMMIT;
    // Ciel : trame de plus en plus sombre vers le haut, et d'autant plus que l'altitude est grande
    g.fillStyle = P[3]; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y++) {
      const dens = clamp((1 - y / 220) * 12 * (0.4 + 0.6 * alt), 0, 12);
      for (let x = 0; x < W; x++) if (BAYER[y % 4][x % 4] < dens) { g.fillStyle = P[2]; g.fillRect(x, y, 1, 1); }
    }
    // Chaînes lointaines : deux plans de crêtes, calottes de neige
    for (const [seed, base, amp, col] of [[5, 238, 70, 2], [9, 268, 56, 1]]) {
      for (let x = 0; x < W; x++) {
        const top = Math.round(base - amp * Math.pow(vnoise(x / 24, seed), 1.4) - 8);
        g.fillStyle = P[col]; g.fillRect(x, top, 1, H - top);
        if (col === 2) {
          g.fillStyle = P[3]; g.fillRect(x, top, 1, 2 + (x % 3 === 0 ? 2 : 0));
          g.fillStyle = P[1]; if (BAYER[top % 4][x % 4] < 5) g.fillRect(x, top + 4, 1, 3);
        }
      }
    }
    // Mer de nuages au fond
    for (let y = 270; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = hash(Math.floor(x / 5) * 211 + Math.floor(y / 3) * 17 + roof.id);
        g.fillStyle = v < 0.5 ? P[3] : P[2];
        if (y > 282 || v < 0.7) g.fillRect(x, y, 1, 1);
      }
    }
    // Masse rocheuse au-dessus : on la voit en coupe, jusqu'à la lèvre du toit
    const zone = roof.a < 2400 ? 0 : roof.a < 5800 ? 1 : 2;
    for (let x = 0; x < LIP; x++) {
      const under = this.roofUnder(x) + (x > LIP - 14 ? Math.round((x - (LIP - 14)) * 0.7) : 0);
      g.drawImage(this.tiles[zone], x, (x * 3) % 200, 1, under, x, 0, 1, under);
    }
    // Ombre tramée sous le toit
    for (let x = 0; x < LIP; x++) {
      const under = this.roofUnder(x) + (x > LIP - 14 ? Math.round((x - (LIP - 14)) * 0.7) : 0);
      for (let y = under - 26; y < under; y++) {
        const d = (y - (under - 26)) / 26;
        if (BAYER[y % 4][x % 4] / 16 < d * 0.85) { g.fillStyle = P[0]; g.fillRect(x, y, 1, 1); }
      }
      g.fillStyle = P[0]; g.fillRect(x, under, 1, 2);
    }
    // Lèvre du toit enneigée
    g.fillStyle = P[0]; g.fillRect(LIP - 2, 0, 3, this.roofUnder(LIP) + 8);
    for (let y = 0; y < 8; y++) { g.fillStyle = P[3]; g.fillRect(LIP - 10 - y, 8 + y * 4, 8 + y, 3); }
    // Stalactites de glace sous le toit
    for (let x = 6; x < LIP - 4; x += 5 + Math.floor(hash(x + roof.id * 13) * 7)) {
      const under = this.roofUnder(x), len = 3 + Math.floor(hash(x * 3 + roof.id) * 12);
      for (let k = 0; k < len; k++) {
        g.fillStyle = k > len - 3 ? P[2] : P[3];
        g.fillRect(x, under + 2 + k, k < len / 2 ? 2 : 1, 1);
      }
    }
    // Paroi sous le toit, à gauche : le mur qu'on vient de gravir
    for (let y = this.roofUnder(0); y < H; y++) {
      const w = WALL + Math.round(8 * vnoise(y / 17, 31)) - Math.min(14, Math.floor((y - 110) / 14));
      g.drawImage(this.tiles[zone], 0, (y * 2) % 400, Math.max(4, w), 1, 0, y, Math.max(4, w), 1);
      g.fillStyle = P[0]; g.fillRect(Math.max(4, w), y, 2, 1);
    }
    // Pitons le long du toit : le cheminement
    for (let x = 48; x < LIP - 12; x += 22) {
      const y = this.roofUnder(x) + 2;
      g.fillStyle = P[0]; g.fillRect(x - 2, y - 1, 5, 5);
      g.fillStyle = P[4]; g.fillRect(x - 1, y, 3, 3);
      g.fillStyle = P[0]; g.fillRect(x, y + 1, 1, 1);
    }
    this.backdrops[roof.id] = c;
    return c;
  }

  drawProfile(g, wind) {
    const s = this.s, ov = s.ov;
    const roof = OVERHANGS[ov.id];
    const LIP = 164;
    g.drawImage(this.profileBackdrop(roof), 0, 0);
    const frac = ov.p / roof.len;
    const hx = Math.round(46 + (LIP - 46 - 26) * frac - wind * K * Math.sin(this.clock * 6));
    this.profileHeroX = hx;
    const swing = this.clock - this.lastStep < 0.4 ? 1 : 0;
    const sp = spriteCanvas(this.grip ? 'heroP1' : this.frame ? 'heroP2' : 'heroP1');
    const hy = this.roofUnder(hx) + 1 + Math.round(Math.sin(this.clock * 2.4) * 1.2) + swing;
    g.drawImage(sp, hx - (sp.width >> 1), hy);
    // Titre et barre de progression
    drawText(g, 'DEVERS', 66, 176, P[0], 2);
    g.fillStyle = P[0]; g.fillRect(66, 192, 68, 12);
    g.fillStyle = P[3]; g.fillRect(68, 194, 64, 8);
    g.fillStyle = P[4]; g.fillRect(68, 194, Math.round(64 * frac), 8);
    if (this.gust.warn > 0 && Math.floor(this.clock * 8) % 2) {
      g.fillStyle = P[4];
      for (let k = 0; k < 6; k++) g.fillRect(hx + this.gust.dir * (14 + k * 2), hy + 12 + (k % 2) * 2, 2, 2);
    }
    this.drawFloats(g);
  }

  drawTransition(g) {
    if (!this.tr) return;
    const t = this.tr.t;
    const cover = t < 0.5 ? t / 0.5 : (1 - t) / 0.5; // des persiennes qui se ferment puis s'ouvrent
    const slat = 16, h = Math.ceil(slat * clamp(cover, 0, 1));
    g.fillStyle = P[0];
    for (let y = 0; y < H; y += slat) g.fillRect(0, y + Math.floor((slat - h) / 2), W, h);
  }

  drawWeather(g, wind, snow) {
    const dt = this.dt;
    const n = snow > 0.02 ? Math.floor(10 + 160 * snow) : 0;
    for (let i = 0; i < n; i++) {
      const f = this.flakes[i];
      f.y += (20 + 45 * snow) * K * f.v * dt;
      f.x -= (5 + 90 * wind) * K * f.v * dt;
      if (f.y > H) { f.y = -2; f.x = Math.random() * (W + 80); }
      if (f.x < -2) { f.x = W + 2; f.y = Math.random() * H; }
      const x = Math.round(f.x), y = Math.round(f.y);
      g.fillStyle = P[0]; g.fillRect(x + 1, y + 1, f.v > 1.1 ? 2 : 1, f.v > 1.1 ? 2 : 1);
      g.fillStyle = P[3]; g.fillRect(x, y, f.v > 1.1 ? 2 : 1, f.v > 1.1 ? 2 : 1);
    }
    if (wind > 0.3) {
      g.fillStyle = P[3];
      for (const st of this.streaks) {
        st.x -= (90 + 160 * wind) * K * dt;
        if (st.x < -st.l) { st.x = W + 6; st.y = Math.random() * H; }
        g.fillRect(Math.round(st.x), Math.round(st.y), Math.round(st.l * (0.5 + wind)), 1);
      }
    }
    if (snow * wind > 0.25) { // tempête : voile tramé
      g.fillStyle = bayerPattern(g, 3, Math.round(3 + 5 * snow * wind));
      g.fillRect(0, 0, W, H);
    }
  }

  drawFloats(g) {
    for (const f of this.floats) {
      const y = HERO_Y - 40 - Math.round(f.t * 28);
      drawText(g, f.text, f.x, y + 2, P[0], 2);
      drawText(g, f.text, f.x, y, P[4], 2);
    }
  }

  drawNight(g) {
    const dark = 1 - this.daylight;
    if (dark > 0.05) {
      const level = dark < 0.4 ? 0.3 : dark < 0.7 ? 0.55 : 0.82;
      const n = this.night.getContext('2d');
      n.globalCompositeOperation = 'source-over';
      n.clearRect(0, 0, W, H);
      n.fillStyle = `rgba(15,56,15,${level})`;
      n.fillRect(0, 0, W, H);
      n.globalCompositeOperation = 'destination-out';
      n.fillStyle = 'rgba(0,0,0,0.4)';
      const r0 = (this.sleep ? 40 : 30) * K;
      const cx = this.s.ov && this.drawnMode === 'profile' ? (this.profileHeroX ?? W / 2) : this.hx * K;
      const cy = this.s.ov && this.drawnMode === 'profile' ? 140 : HERO_Y - 8;
      for (const r of [r0, r0 * 0.7, r0 * 0.4]) {
        n.beginPath(); n.arc(cx, cy, r, 0, Math.PI * 2); n.fill();
      }
      g.drawImage(this.night, 0, 0);
    }
    const cold = clamp(1 - this.s.warmth / 35, 0, 1);
    if (cold > 0.05) {
      g.fillStyle = P[3];
      const w = Math.ceil(cold * 5) * K;
      g.fillRect(0, 0, w, H); g.fillRect(W - w, 0, w, H); g.fillRect(0, 0, W, w); g.fillRect(0, H - w, W, w);
    }
  }
}
