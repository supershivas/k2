// Moteur du jeu : la face du K2 vue de face, le héros minuscule qui grimpe.
// Simulation (altitude, ressources, météo, temps) en unités « logiques » (x de 0 à 100, altitude en mètres),
// rendu pixel art en palette Game Boy à K fois cette définition : 1 m = K pixels.
// Deux points de vue : de face sur la paroi, de profil sous un dévers.
import { PALETTE as P, spriteCanvas } from './sprites.js?v=1.7.0';
import { drawText } from './pixfont.js?v=1.7.0';
import { pickEvent } from './events.js?v=1.7.0';
import { createRng } from './lib/rng.js?v=1.7.0';
import { limbSequence, STEP, LIMBS } from './holds.js?v=1.7.0';
import { Progress } from './progress.js?v=1.7.0';
import { RELICS } from './relics.js?v=1.7.0';

export const K = 2;
// Taille LOGIQUE du canvas : elle suit l'écran (plein écran, échelle entière, voir Game.resize).
// La face du K2, elle, mesure toujours 200 px de large (100 m) : OX / OY la centrent.
export let W = 100 * K;
export let H = 160 * K;
const WORLD_W = 100 * K;
let OX = 0, OY = 0;
const TW = 720; // largeur des textures : au moins celle du plus large canvas
export const SUMMIT = 8611;
let HERO_Y = 116 * K; // pieds du héros à l'écran (au-dessus des commandes, voir Game.resize)
const TILE_H = 256 * K;
const OXYGEN_ALT = 6500;
const BOTTLE_SECONDS = 90;
const MAX = { food: 12, gas: 8, o2: 4, piton: 12, rope: 500 };
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
const bay = (x, y) => BAYER[((y % 4) + 4) % 4][((x % 4) + 4) % 4]; // sûr pour les coordonnées négatives
const mod = (a, n) => ((a % n) + n) % n;

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

export function newState(seed = 1) {
  return {
    alt: 0, x: 50, energy: 100, warmth: 100,
    food: 6, gas: 3, o2: 1, o2Sec: 0, o2On: false,
    min: 360, // minutes depuis le début, démarre à 6 h
    camps: [], items: [], falls: 0, steps: 0, summit: false,
    ov: null, ovDone: [], // dévers en cours { id, p } et dévers franchis
    walk: null, walkDone: [], // pente à marcher en cours { id, p } et pentes franchies
    seed, // graine de l'ascension : pentes, puzzles, événements, rafales
    pitonStock: 5, pitons: [], // pitons dans le sac et pitons plantés { a, x, len, linked, ov?, p? }
    rope: 300, live: 0, // corde totale (m) et longueur déroulée entre le dernier piton et le héros
    top: 0, topXp: 0, // plus haute altitude atteinte (carte du sac) et part déjà payée en XP
    puzzle: null, puzzleDone: [], // mini-puzzle en attente { id, type } et puzzles résolus
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

// Corde : points reliés par des contraintes de distance (intégration de Verlet), pesanteur, vent, amortissement.
// Une corde ne pousse pas : elle ne résiste qu'à l'étirement, donc elle pend et ondule quand elle est lâche.
const SEG = 2.5;
class Rope {
  constructor(a, b, len) {
    this.len = len;
    this.pts = [];
    const n = Math.max(2, Math.ceil(len / SEG) + 1);
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const sag = Math.sqrt(Math.max(0, len * len - d * d)) * 0.4;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = lerp(a.x, b.x, t), y = lerp(a.y, b.y, t) - Math.sin(Math.PI * t) * sag;
      this.pts.push({ x, y, px: x, py: y });
    }
  }
  setLength(len) {
    this.len = len;
    const last = this.pts[this.pts.length - 1];
    while ((this.pts.length - 1) * SEG < len - SEG) this.pts.push({ x: last.x, y: last.y, px: last.x, py: last.y });
  }
  step(dt, a, b, pinB, windAx, t) {
    const pts = this.pts, n = pts.length;
    for (let i = 1; i < n; i++) {
      if (i === n - 1 && pinB) continue;
      const p = pts[i];
      const vx = (p.x - p.px) * 0.993, vy = (p.y - p.py) * 0.993;
      p.px = p.x; p.py = p.y;
      p.x += vx + windAx * (0.6 + 0.4 * Math.sin(t * 1.7 + p.y * 0.3)) * dt * dt;
      p.y += vy - 9.8 * dt * dt;
    }
    const L = this.len / (n - 1);
    for (let it = 0; it < 12; it++) {
      pts[0].x = a.x; pts[0].y = a.y;
      if (pinB) { pts[n - 1].x = b.x; pts[n - 1].y = b.y; }
      for (let i = 0; i < n - 1; i++) {
        const p = pts[i], q = pts[i + 1];
        const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
        if (d <= L || d === 0) continue;
        const wp = i === 0 ? 0 : 1, wq = i + 1 === n - 1 && pinB ? 0 : 1;
        if (wp + wq === 0) continue;
        const k = (d - L) / d / (wp + wq);
        p.x += dx * k * wp; p.y += dy * k * wp;
        q.x -= dx * k * wq; q.y -= dy * k * wq;
      }
    }
    pts[0].x = a.x; pts[0].y = a.y; pts[0].px = a.x; pts[0].py = a.y;
    if (pinB) { pts[n - 1].x = b.x; pts[n - 1].y = b.y; }
  }
}

// Textures de la paroi : roche sombre, roche claire, glace. Tramées et ombrées côté gauche (lumière à droite).
function makeTile(zone, seed) {
  const c = document.createElement('canvas');
  c.width = TW; c.height = TILE_H;
  const g = c.getContext('2d');
  const base = zone === 2 ? P[2] : P[1];
  const mark = zone === 2 ? P[3] : P[2];
  const dark = zone === 2 ? P[1] : P[0];
  g.fillStyle = base; g.fillRect(0, 0, TW, TILE_H);
  let n = seed;
  const r = () => hash(n++);
  // Strates : bandes horizontales irrégulières, avec un liseré clair dessous
  const strata = zone === 2 ? 14 : 26;
  for (let i = 0; i < strata; i++) {
    let x = Math.floor(r() * TW), y = Math.floor(r() * TILE_H);
    const len = 20 + Math.floor(r() * 70);
    for (let k = 0; k < len; k++) {
      g.fillStyle = dark; g.fillRect(x % TW, y % TILE_H, 1, 1);
      g.fillStyle = mark; g.fillRect(x % TW, (y + 1) % TILE_H, 1, 1);
      x++;
      if (r() < 0.2) y += r() < 0.5 ? -1 : 1;
    }
  }
  // Éclats de roche ou de glace
  const dots = zone === 0 ? 260 : zone === 1 ? 300 : 460;
  for (let i = 0; i < dots; i++) {
    g.fillStyle = r() < (zone === 2 ? 0.55 : 0.18) ? mark : dark;
    const w = zone === 2 ? 2 + Math.floor(r() * 12) : 2 + Math.floor(r() * 7);
    g.fillRect(Math.floor(r() * TW), Math.floor(r() * TILE_H), w, 1 + Math.floor(r() * 2));
  }
  // Couloirs et arêtes : longues traces verticales
  for (let i = 0; i < 16; i++) {
    let x = Math.floor(r() * TW), y = Math.floor(r() * TILE_H);
    const len = 80 + r() * 220;
    for (let k = 0; k < len; k++) {
      g.fillStyle = dark; g.fillRect(x, y % TILE_H, 1, 1);
      g.fillStyle = mark; g.fillRect(x + 1, y % TILE_H, 1, 1);
      y++;
      if (r() < 0.3) x += r() < 0.5 ? -1 : 1;
    }
  }
  // Ombre tramée à gauche, lumière tramée à droite
  const img = g.getImageData(0, 0, TW, TILE_H);
  const d = img.data;
  const idxOf = (R, G, B) => RGB.findIndex(([r2, g2, b2]) => r2 === R && g2 === G && b2 === B);
  for (let y = 0; y < TILE_H; y++) {
    for (let x = 0; x < TW; x++) {
      const t = clamp((x - TW / 2) / 100, -1, 1);
      const shade = clamp((-t - 0.05) * 0.95, 0, 0.7);
      const light = clamp((t - 0.25) * 0.6, 0, 0.4);
      const b = BAYER[y % 4][x % 4] / 16;
      const o = (y * TW + x) * 4;
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
  c.width = TW; c.height = h;
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) {
    const cover = Math.max(0, 1 - Math.abs(y - h / 2) / (h / 2)) ** 0.7;
    for (let x = 0; x < TW; x++) {
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
    this.progress = new Progress();
    this.holds = []; // prises de l'ascension (voir holds.js), allongées à la demande
    this.limbPos = {}; // où sont les quatre membres, en mètres : { x, a }
    this.dodge = 0; // écart latéral après une esquive, effacé à la prise suivante
    this.errors = 0; // faux pas d'affilée
    this.camOffset = 0; // caméra libre : mètres au-dessus (+) ou au-dessous (−) du joueur
    this.pxScale = 1; // pixels écran par pixel logique (échelle entière)
    this.hold = { L: false, R: false }; // boutons maintenus (marche)
    this.puzzles = [];
    this.walks = [];
    this.ropes = []; // cordes fixes entre pitons
    this.liveRope = null; // corde entre le dernier piton et le héros
    this.roped = false;
    this.ropeAcc = 0;
    this.walkAnim = 0;
    this.gust = { next: 12, warn: 0, dir: 1 };
    this.rock = { next: 14, warn: 0, fall: 0, x: 50, hit: false };
    this.rng = createRng(1); // le hasard des règles : sauvegardé avec la partie
    this.fx = createRng('k2-fx'); // le hasard du décor (flocons, tremblement) : jamais sauvegardé
    this.frameDt = 1 / 60;
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

  // Plein écran : le canvas couvre tout l'écran, avec une échelle ENTIÈRE (pixels nets, aucune bande).
  // devW / devH en pixels physiques ; ctrlCss = hauteur des commandes (CSS), pour que le héros reste au-dessus.
  resize(devW, devH, dpr, ctrlCss = 0) {
    let sc = Math.max(1, Math.round(Math.min(devW / 200, devH / 320)));
    sc = Math.max(sc, Math.ceil(devW / TW));
    W = Math.max(100, Math.floor(devW / sc));
    H = Math.max(160, Math.floor(devH / sc));
    OX = Math.floor((W - WORLD_W) / 2);
    OY = Math.floor((H - 160 * K) / 2);
    const above = Math.ceil(((ctrlCss + 70) * dpr) / sc) + 36; // commandes + bulle de message + pieds sous le torse
    HERO_Y = Math.max(Math.round(H * 0.45), Math.min(Math.round(H * 0.7), H - above));
    this.canvas.width = W; this.canvas.height = H;
    this.night.width = W; this.night.height = H;
    this.backdrops = {};
    this.pxScale = sc;
    return { scale: sc, cssW: (W * sc) / dpr, cssH: (H * sc) / dpr };
  }

  load(state) {
    const s = Object.assign(newState(), state);
    s.camps = (s.camps || []).map(c => (typeof c === 'number' ? { a: c, x: 50 } : c));
    s.items = Array.isArray(s.items) ? s.items : [];
    s.ovDone = Array.isArray(s.ovDone) ? s.ovDone : [];
    s.walkDone = Array.isArray(s.walkDone) ? s.walkDone : [];
    s.pitons = Array.isArray(s.pitons) ? s.pitons : [];
    if (s.ov && !OVERHANGS[s.ov.id]) s.ov = null;
    this.s = s;
    this.rng = createRng(s.seed);
    if (Number.isFinite(s.rngState)) this.rng.setState(s.rngState);
    this.holds = [];
    this.limbPos = {};
    this.dodge = 0;
    this.errors = 0;
    this.camOffset = 0;
    this.walks = this.makeWalks(s.seed);
    this.puzzles = this.makePuzzles(s.seed);
    s.puzzleDone = Array.isArray(s.puzzleDone) ? s.puzzleDone : [];
    if (s.walk && !this.walks[s.walk.id]) s.walk = null;
    if (s.walk && s.ov) s.walk = null;
    this.syncRopes();
    this.view = s.alt;
    this.hx = s.x;
    this.fall = this.sleep = this.tr = null;
    this.hold.L = this.hold.R = false;
    this.lastSide = null;
    this.floats = [];
    this.backdrops = {};
    this.lastMode = this.drawnMode = this.mode;
    this.hooks.stateChanged?.();
  }

  say(text, tone = 'info') { this.hooks.say?.(text, tone); }

  // ── Progression ────────────────────────────────────────────────────────
  skill(id) { return this.progress.has(id); }
  // Nouvelle ascension : état de départ, avec les bonus de talents.
  // Ce qu'on sauvegarde : l'état, avec l'avancée du hasard.
  snapshot() { this.s.rngState = this.rng.state; return this.s; }
  freshState(seed = 1) {
    const s = newState(seed);
    if (this.skill('tec1')) s.pitonStock += 2;
    if (this.skill('tec2')) s.rope += 100;
    return s;
  }
  onSkillBought(id) {
    if (id === 'tec1') this.s.pitonStock = Math.min(MAX.piton, this.s.pitonStock + 2);
    if (id === 'tec2') this.s.rope = Math.min(this.maxRope, this.s.rope + 100);
  }
  get maxRope() { return MAX.rope + (this.skill('tec2') ? 100 : 0); }
  // Hypoxie : ralentissement du pas, coût en énergie, récupération.
  get hyp() { return this.skill('end3') ? { slow: 0.8, cost: 1.8, regen: 0.5 } : { slow: 0.6, cost: 2.4, regen: 0.3 }; }
  gainXp(n, silent = false) {
    if (n <= 0) return;
    const lv = this.progress.addXp(n);
    if (!silent) this.floats.push({ text: `+${n} XP`, x: Math.round(this.hx * K) - 16, t: 0 });
    if (lv > 0) this.hooks.event?.({ icon: 'ti-trophy', title: `Niveau ${this.progress.level}`, text: 'Un point de talent t’attend dans le sac.', fx: '+1 point' });
  }

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
  get mode() { return this.s.ov ? 'profile' : this.s.walk ? 'walk' : 'face'; }

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

  // Prévision heure par heure d'une journée (0 = aujourd'hui, 1 = demain) à l'altitude actuelle.
  dayForecast(offset) {
    const d0 = Math.floor(this.s.min / 1440) + offset;
    const alt = this.s.alt;
    const slots = [];
    for (let h = 0; h < 24; h++) {
      const m = d0 * 1440 + h * 60 + 30;
      slots.push({ h, ...this.weatherAt(m, alt), T: this.tempAt(m, alt), dark: this.daylightAt(m) < 0.5 });
    }
    return { day: d0 + 1, alt: Math.round(alt), slots };
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

  // Pentes à marcher, vues de profil : tirées au hasard à chaque ascension (graine s.seed).
  makeWalks(seed) {
    const out = [];
    for (let i = 0; i < 7; i++) {
      let a = 600 + i * 1150 + hash(seed + i * 7) * 500;
      if (OVERHANGS.some(o => Math.abs(o.a - a) < 90)) a += 130;
      if (a > SUMMIT - 300) break;
      const slope = 0.12 + 0.33 * hash(seed + i * 13 + 1);
      const len = 50 + 60 * hash(seed + i * 17 + 2);
      out.push({ id: out.length, a: Math.round(a), dir: hash(seed + i * 19 + 3) < 0.5 ? -1 : 1, slope, len, gain: Math.round(len * slope) });
    }
    return out;
  }
  // Mini-puzzles : 5 points de la paroi par ascension, de type tiré au hasard.
  makePuzzles(seed) {
    const types = ['read', 'timing', 'repair'];
    return Array.from({ length: 5 }, (_, i) => {
      let a = 450 + i * 1600 + hash(seed + i * 23 + 9) * 500;
      if (this.nearHazardRaw(a, 60)) a += 90;
      return { id: i, a: Math.round(a), type: types[Math.floor(hash(seed + i * 29 + 5) * 3)], seed: Math.floor(hash(seed + i * 31 + 7) * 1e9) };
    });
  }
  puzzleBetween(a0, a1) {
    return this.puzzles.find(p => !this.s.puzzleDone.includes(p.id) && p.a >= a0 - 0.001 && p.a <= a1) || null;
  }
  // Conditions de l'énigme en cours, pour la fenêtre de puzzle.
  puzzleSpec() {
    const pz = this.s.puzzle && this.puzzles[this.s.puzzle.id];
    return pz ? { type: pz.type, seed: pz.seed, easy: this.skill('tec4') } : null;
  }
  finishPuzzle(res) {
    const s = this.s, pz = s.puzzle;
    if (!pz) return;
    s.puzzle = null;
    s.puzzleDone.push(pz.id);
    const easy = this.skill('tec4');
    if (pz.type === 'read') {
      if (res.ok) { this.climb(18); this.gain('energy', 6); this.say('Bon itinéraire : +18 m', 'good'); }
      else { this.gain('energy', -12); this.gain('warmth', -4); s.min += 25; this.say('Mauvais choix : détour, -12 énergie', 'bad'); }
    } else if (pz.type === 'timing') {
      if (res.ok) { this.gain('energy', 8); this.say('Pied sûr : +8 énergie', 'good'); }
      else { this.gain('energy', -15); this.climb(-8); this.shake = 0.4; this.say('Tu glisses de la vire : -15 énergie', 'bad'); }
    } else if (res.ok) { this.gain('gas', 1); this.gain('warmth', 15); this.say('Réchaud réparé : +1 gaz, +15 chaleur', 'good'); }
    else { this.gain('warmth', -8); s.min += 15; this.say('Réchaud HS : froid, -8 chaleur', 'bad'); }
    this.gainXp(res.ok ? (easy ? 55 : 40) : 10);
  }

  // Reliques : posées à altitude fixe tant qu'elles n'ont pas été trouvées.
  relicSpot(r) {
    let a = r.a;
    if (this.nearHazardRaw(a, 30)) a += 45;
    return { ...r, a, x: this.route(a) + (hash(r.a * 7 + 3) < 0.5 ? -1 : 1) * 9 };
  }
  relicsIn(a0, a1) {
    return RELICS.filter(r => !this.progress.hasRelic(r.id) && r.a >= a0 - 60 && r.a <= a1 + 60).map(r => this.relicSpot(r));
  }

  nearHazardRaw(a, r) { return OVERHANGS.some(o => Math.abs(o.a - a) < r) || (this.walks || []).some(w => Math.abs(w.a - a) < r); }
  nearHazard(a, r) { return this.nearHazardRaw(a, r); }

  // ── Parcours de prises ─────────────────────────────────────────────────
  // Axe du parcours à l'altitude a : il serpente, et s'écarte des blocs et des plaques de glace (il les contourne).
  route(a) {
    const base = 50 + 14 * (vnoise(a / 60, 71) - 0.5) * 2;
    let shift = 0;
    for (let i = Math.max(1, Math.floor((a - 16) / BLOCK_STEP)); i <= Math.floor((a + 16) / BLOCK_STEP) + 1; i++) {
      const ob = this.obstacle(i);
      if (!ob) continue;
      const need = ob.type === 'block' ? 13 : 16;
      const d = base - ob.x;
      if (Math.abs(d) >= need) continue;
      const weight = smooth(clamp(1 - Math.abs(a - ob.a) / 14, 0, 1));
      const push = (need - Math.abs(d)) * weight * (d >= 0 ? 1 : -1);
      if (Math.abs(push) > Math.abs(shift)) shift = push;
    }
    const L = this.leftBound(a), R = this.rightBound(a);
    const m = Math.min(14, (R - L) / 2 - 1);
    return clamp(base + shift, L + m, R - m);
  }

  // La prise j : sa nature (main / pied, gauche / droite), son altitude et sa place sur la paroi.
  holdAt(j) {
    if (this.holds.length <= j) this.holds = limbSequence(this.s.seed, Math.max(j + 40, 64));
    const h = this.holds[Math.max(0, j)];
    const a = Math.max(0, j) * STEP;
    return { j, ...h, a, x: this.route(a) + (h.side === 'L' ? -5 : 5) };
  }
  get holdIndex() { return Math.floor(this.s.alt / STEP + 1e-6); }
  // La prochaine prise à saisir, et le bouton qui y mène (null hors de la paroi de face).
  nextMove() {
    const s = this.s;
    if (s.ov || s.walk || this.fall || this.sleep || s.summit) return null;
    return this.holdAt(this.holdIndex + 1);
  }
  // Où est chaque membre : la dernière prise prise par lui, au plus 16 prises en arrière.
  limbTarget(limb) {
    const k = this.holdIndex;
    for (let j = k; j >= Math.max(0, k - 16); j--) {
      const h = this.holdAt(j);
      if (h.limb === limb) return { x: h.x, a: h.a };
    }
    return { x: this.route(0) + (limb[1] === 'L' ? -5 : 5), a: 0 };
  }
  // Caméra libre (vue de face) : on remonte le regard vers le chemin parcouru, ou un peu au-delà du point le plus haut atteint.
  scrollBy(m) {
    const s = this.s;
    this.camOffset = clamp(this.camOffset + m, -s.alt, Math.max(0, (s.top || 0) - s.alt) + 15);
  }
  recenter() { this.camOffset = 0; }
  get scrolled() { return Math.abs(this.camOffset) > 6; }
  // Où le joueur est à l'écran (la caméra libre l'éloigne du point fixe HERO_Y).
  heroScreenY() { return HERO_Y - this.camOffset * K; }

  // Les membres glissent vers leur prise : on les voit se déplacer un par un.
  moveLimbs(dt) {
    for (const limb of LIMBS) {
      const t = this.limbTarget(limb);
      const p = this.limbPos[limb];
      if (!p || Math.abs(p.a - t.a) > 40 || Math.abs(p.x - t.x) > 30) this.limbPos[limb] = { ...t };
      else { p.x += (t.x - p.x) * Math.min(1, dt * 16); p.a += (t.a - p.a) * Math.min(1, dt * 16); }
    }
  }
  // Le torse : au milieu des quatre membres, un peu au-dessus.
  bodyCenter() {
    let x = 0, a = 0, n = 0;
    for (const limb of LIMBS) { const p = this.limbPos[limb]; if (p) { x += p.x; a += p.a; n++; } }
    return n ? { x: x / n, a: a / n + 3 } : { x: this.hx, a: this.view };
  }

  // Une chute de pierres menace : l'appui du côté opposé esquive.
  get threat() {
    const r = this.rock, s = this.s;
    if (!(r.warn > 0) || s.ov || s.walk) return null;
    const hx = s.x + this.dodge;
    if (Math.abs(r.x - hx) > 9) return null;
    return { away: r.x > hx ? 'L' : 'R' };
  }

  // Blocs de roche et plaques de verglas, générés par tranche de 36 m.
  obstacle(i) {
    if (i < 1 || i * BLOCK_STEP > SUMMIT - 60 || hash(i * 17 + 3) > 0.3 + 0.35 * (i * BLOCK_STEP / SUMMIT)) return null;
    const a = i * BLOCK_STEP + 8 + hash(i * 17 + 5) * 20;
    if (this.nearHazard(a, 24)) return null; // rien au pied ni au-dessus d'un dévers ou d'une pente
    const L = this.leftBound(a) + 9, R = this.rightBound(a) - 9;
    const type = hash(i * 17 + 9) < 0.55 ? 'block' : 'ice';
    return { a, x: L + hash(i * 17 + 7) * Math.max(1, R - L), type, w: type === 'block' ? 10 : 16 };
  }
  // Ressources posées sur la paroi : une tous les ~110 m, à aller chercher.
  item(i) {
    if (i < 0 || i * ITEM_STEP + 90 > SUMMIT || hash(i * 29 + 1) > 0.85) return null;
    const a = i * ITEM_STEP + 30 + hash(i * 29 + 3) * 60;
    const L = this.leftBound(a) + 9, R = this.rightBound(a) - 9;
    const r = hash(i * 29 + 5);
    let type = r < 0.32 ? 'ration' : r < 0.5 ? 'gaz' : r < 0.68 ? 'piton' : r < 0.8 ? 'corde' : 'o2';
    if (type === 'o2' && a < 2000) type = 'ration';
    if (this.nearHazard(a, 12)) return null;
    return { id: i, a, x: this.route(a) + (hash(i * 29 + 7) < 0.5 ? -1 : 1) * (7 + hash(i * 29 + 9) * 4), type };
  }

  // Grottes refuges : une tous les ~650 m, à l'abri du vent et du froid.
  cave(i) {
    if (i < 1 || hash(i * 41 + 2) > 0.88) return null;
    let a = i * CAVE_STEP + 120 + hash(i * 41 + 4) * 400;
    if (a > SUMMIT - 200) return null;
    if (this.nearHazard(a, 40)) a += 70;
    return { id: i, a, x: this.route(a) + (hash(i * 41 + 6) < 0.5 ? -1 : 1) * (10 + hash(i * 41 + 8) * 3) };
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
    if (s.ov || s.walk) return null;
    return this.cavesIn(s.alt - 10, s.alt + 10).find(c => Math.abs(c.x - s.x) < 14) || null;
  }

  // Ancré : un piton planté tout près (en dévers : sous la même prise). Remplace l'ancienne « prise ».
  get anchored() {
    const s = this.s;
    if (s.walk) return false;
    if (s.ov) return s.pitons.some(p => p.ov === s.ov.id && Math.abs(p.p - s.ov.p) <= 1.5);
    return s.pitons.some(p => p.ov === undefined && Math.abs(p.a - s.alt) < 5 && Math.abs(p.x - s.x) < 9);
  }
  topPiton() {
    const chain = this.s.pitons.filter(p => p.linked);
    return chain.length ? chain[chain.length - 1] : null;
  }
  deployed() { return this.s.pitons.reduce((n, p) => n + (p.linked ? p.len : 0), 0); }

  // Prochaine pente à marcher non franchie que ce pas fait atteindre.
  walkBetween(a0, a1) {
    return this.walks.find(w => !this.s.walkDone.includes(w.id) && w.a >= a0 - 0.001 && w.a <= a1) || null;
  }

  // Prochain dévers non franchi que ce pas fait atteindre.
  overhangBetween(a0, a1) {
    return OVERHANGS.find(o => !this.s.ovDone.includes(o.id) && o.a >= a0 - 0.001 && o.a <= a1) || null;
  }

  // ── Actions du joueur ──────────────────────────────────────────────────
  step(side) {
    const s = this.s;
    if (!this.playing || this.busy) return;
    if (s.walk) return; // la marche se joue en maintenant un bouton (voir update)
    if (s.energy < 1) { this.say('Épuisé : reprends ton souffle', 'warn'); return; }
    this.frame ^= 1;
    this.lastStep = this.clock;
    this.camOffset = 0; // agir ramène la caméra sur le joueur
    if (s.ov) { this.stepProfile(side); return; }

    // Une pierre tombe vers toi : l'appui du côté opposé esquive (sans avancer)
    const threat = this.threat;
    if (threat && side === threat.away) {
      this.dodge = side === 'L' ? -9 : 9;
      s.energy = Math.max(0, s.energy - 1.5);
      this.say('Esquive !', 'good');
      return;
    }

    const next = this.holdAt(this.holdIndex + 1);
    if (side !== next.side) { this.wrongStep(next); return; }

    this.errors = 0;
    this.dodge = 0;
    this.lastSide = side;
    const { wind, snow } = this.weather;
    const hypoxia = this.needsOxygen && !this.oxygenActive;
    // Le mauvais temps ne raccourcit plus le pas : il coûte plus d'énergie et plus de temps par prise.
    const slow = Math.max(0.25, (1 - 0.28 * snow - 0.25 * wind) * (1 - 0.2 * (1 - this.daylight)) * (hypoxia ? this.hyp.slow : 1));
    const goal = Math.min(SUMMIT, next.a);
    const roof = this.overhangBetween(s.alt, goal);
    const slope = roof ? null : this.walkBetween(s.alt, goal);
    const quiz = roof || slope || s.puzzle ? null : this.puzzleBetween(s.alt, goal);
    s.alt = roof ? roof.a : slope ? slope.a : goal;
    s.energy = Math.max(0, s.energy - 0.7 / slow * (this.skill('end2') ? 0.88 : 1) * (1 + s.alt / 7000) * (hypoxia ? this.hyp.cost : 1) * (1 + 0.4 * wind));
    s.min += 1.8 / slow;
    s.steps++;
    s.x = this.route(s.alt);
    if (roof) {
      s.ov = { id: roof.id, p: 0 };
      this.lastSide = null;
      this.say('Dévers ! Alterne les mains pour traverser', 'warn');
      return;
    }
    if (slope) {
      s.walk = { id: slope.id, p: 0 };
      this.lastSide = null;
      this.say(`Pente douce : maintiens ${slope.dir > 0 ? 'Droite' : 'Gauche'} pour marcher`, 'warn');
      return;
    }
    if (quiz) { s.puzzle = { id: quiz.id, type: quiz.type }; this.lastSide = null; }
    if (s.alt >= SUMMIT && !s.summit) {
      s.summit = true;
      this.gainXp(400);
      this.hooks.summit?.();
    }
  }

  // Mauvais côté : un faux pas coûte de l'énergie et du temps ; trois d'affilée font glisser.
  wrongStep(next) {
    const s = this.s;
    this.errors++;
    s.energy = Math.max(0, s.energy - 2.5);
    s.min += 0.4;
    this.shake = 0.12;
    const what = next.kind === 'hand' ? 'main' : 'pied';
    if (this.errors < 3) { this.say(`Mauvais côté : la prochaine prise est à ${next.side === 'L' ? 'gauche' : 'droite'} (${what})`, 'warn'); return; }
    this.errors = 0;
    if (this.anchored) { this.say('Tu glisses, mais le piton te retient', 'good'); return; }
    s.alt = Math.max(0, s.alt - 12);
    s.energy = Math.max(0, s.energy - 8);
    this.shake = 0.4;
    this.say('Trois faux pas : tu glisses de 12 m !', 'bad');
    if (s.energy <= 0) this.startFall('Épuisement');
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
    s.energy = Math.max(0, s.energy - 1.2 * (this.skill('tec3') ? 0.75 : 1) * (1 + s.alt / 9000) * (hypoxia ? this.hyp.cost - 0.2 : 1) * (1 + 0.5 * wind));
    s.min += 1.8;
    s.steps++;
    if (ov.p >= roof.len) {
      s.ovDone.push(roof.id);
      s.ov = null;
      s.alt = roof.a + 8;
      this.lastSide = null;
      this.say('Dévers franchi !', 'good');
      this.gainXp(60);
    }
  }

  // Plante un piton à l'endroit où l'on est : il ancre le héros et relie la corde.
  plantPiton() {
    const s = this.s;
    if (!this.playing || this.busy) return;
    if (s.walk) { this.say('Inutile de pitonner : tu marches', 'info'); return; }
    if (s.pitonStock < 1) { this.say('Plus de pitons', 'warn'); return; }
    if (this.anchored) { this.say('Tu es déjà ancré ici', 'info'); return; }
    const top = this.topPiton();
    const roof = s.ov ? OVERHANGS[s.ov.id] : null;
    const a = roof ? roof.a : Math.round(s.alt * 10) / 10;
    // Un piton au-dessus du dernier : il prolonge la corde si elle est tendue jusqu'à lui, sinon il ouvre une nouvelle ligne.
    const linked = !top || a >= top.a - 0.5;
    const piton = { a, x: Math.round(s.x), len: top && this.roped && linked ? Math.round(s.live * 10) / 10 : 0, linked };
    if (roof) { piton.ov = roof.id; piton.p = s.ov.p; }
    s.pitons.push(piton);
    s.pitonStock--;
    if (linked) s.live = 0;
    s.energy = Math.max(0, s.energy - 2.5);
    this.syncRopes();
    this.say(piton.len > 0 || !top ? 'Piton planté, corde amarrée' : linked ? 'Piton planté : nouvelle ligne de corde' : 'Piton planté (sans corde)', 'good');
  }

  // ── Cordes ─────────────────────────────────────────────────────────────
  syncRopes() {
    const chain = this.s.pitons.filter(p => p.linked);
    this.ropes = [];
    for (let i = 1; i < chain.length; i++) {
      const a = chain[i - 1], b = chain[i];
      if (b.len > 0.5 && a.ov === undefined && b.ov === undefined) {
        this.ropes.push({ a, b, rope: new Rope({ x: a.x, y: a.a }, { x: b.x, y: b.a }, b.len) });
      }
    }
    const top = chain[chain.length - 1];
    this.liveRope = top ? new Rope({ x: top.x, y: top.a }, { x: this.s.x, y: this.s.alt + 3 }, Math.max(1, this.s.live)) : null;
  }

  updateRopes(dt) {
    const s = this.s;
    const top = this.topPiton();
    if (!top) { this.roped = false; this.liveRope = null; return; }
    const d = Math.hypot(top.x - s.x, top.a - s.alt);
    const cap = Math.max(0, s.rope - this.deployed());
    const need = d * 1.06 + 1.5; // un peu de mou : la corde pend et ondule
    this.roped = need <= cap;
    if (this.roped) s.live = Math.max(s.live, need);
    if (!this.liveRope) this.syncRopes();
    if (!this.liveRope) return;
    const roofMode = !!s.ov;
    this.liveRope.setLength(Math.max(1, this.roped ? s.live : cap));
    const gust = this.gust.warn > 0 ? 8 : 0;
    const windAx = -(this.weather.wind * 5 + gust);
    this.ropeAcc = Math.min(this.ropeAcc + dt, 0.1);
    const hero = { x: this.hx, y: this.view - this.camOffset + 3 };
    while (this.ropeAcc >= 1 / 60) {
      this.ropeAcc -= 1 / 60;
      for (const r of this.ropes) {
        if (r.a.a > this.view + 130 || r.b.a < this.view - 130) continue;
        r.rope.step(1 / 60, { x: r.a.x, y: r.a.a }, { x: r.b.x, y: r.b.a }, true, windAx, this.clock);
      }
      if (!roofMode) this.liveRope.step(1 / 60, { x: top.x, y: top.a }, hero, this.roped, windAx, this.clock);
    }
  }

  eat() {
    const s = this.s;
    if (this.busy) return;
    if (s.food < 1) { this.say('Plus de vivres', 'warn'); return; }
    if (s.energy > 94) { this.say('Tu n’as pas faim', 'info'); return; }
    s.food--;
    const kcal = this.skill('sur2') ? 40 : 32;
    s.energy = Math.min(100, s.energy + kcal);
    s.warmth = Math.min(100, s.warmth + 6);
    this.say(`Ration avalée : +${kcal} énergie`, 'good');
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
    s.x = this.route(s.alt);
  }
  dropRock() {
    const r = this.rock;
    r.x = this.clampX(this.s.x + (this.rng() - 0.5) * 30, this.s.alt);
    r.warn = this.skill('sur3') ? 2.1 : 1.5;
  }

  // ── Simulation ─────────────────────────────────────────────────────────
  update(dt) {
    dt = Math.min(dt, 0.1);
    this.dt = dt;
    this.clock += dt;
    this.shake = Math.max(0, this.shake - dt);
    const s = this.s;

    if (this.mode !== 'face') this.camOffset = 0;
    this.view += (s.alt + this.camOffset - this.view) * Math.min(1, dt * 10);
    if (!s.ov && !s.walk && !this.fall && !this.sleep) s.x = this.route(s.alt);
    this.hx += (s.x + this.dodge - this.hx) * Math.min(1, dt * 14);
    this.moveLimbs(dt);
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

    s.top = Math.max(s.top || 0, s.alt);
    const mark = Math.floor(s.top / 25);
    if (mark > (s.topXp || 0)) { this.gainXp(mark - (s.topXp || 0), true); s.topXp = mark; }
    this.updateRopes(dt);
    if (s.walk) this.updateWalk(dt);

    s.min += dt * 0.6;
    const { wind } = this.weather;
    const T = this.temperature;
    const exerting = this.clock - this.lastStep < 1.5;

    const drain = Math.max(0, -T - 6) * 0.011 * (this.skill('sur1') ? 0.8 : 1) * (1 + wind * 0.9) * (exerting ? 0.45 : 1);
    s.warmth = clamp(s.warmth - drain * dt + (T > -4 ? 2 * dt : 0), 0, 100);

    if (s.o2On) {
      if (s.o2Sec <= 0) {
        if (s.o2 >= 1) { s.o2--; s.o2Sec = BOTTLE_SECONDS; } else { s.o2On = false; this.say('Bouteille vide', 'warn'); }
      }
      if (s.o2On) s.o2Sec = Math.max(0, s.o2Sec - dt);
    }

    if (this.clock - this.lastStep > 0.8 && s.warmth > 15) {
      const hypoxia = this.needsOxygen && !this.oxygenActive;
      const anchored = this.anchored;
      const rate = (anchored ? 6 : 4) * (this.skill('end1') ? 1.2 : 1) * (1 - s.alt / 14000) * (hypoxia ? this.hyp.regen : 1) * (s.food < 1 ? 0.5 : 1);
      if (s.walk) {
        s.energy = Math.min(100, s.energy + rate * dt); // à l'arrêt sur la pente
      } else if (s.ov) {
        // Suspendu : se reposer sur un piton récupère un peu, rester pendu aux bras épuise.
        s.energy = anchored ? Math.min(100, s.energy + rate * 0.5 * dt) : Math.max(0, s.energy - (0.9 + wind) * dt);
        if (s.energy <= 0) this.startFall('Épuisement');
      } else s.energy = Math.min(100, s.energy + rate * dt);
    }

    this.pickupItems();
    this.updateGusts(dt, wind);
    if (s.walk) { this.rock.warn = 0; this.rock.fall = 0; }
    this.updateRock(dt);
    this.updateEvents(dt);
    if (s.warmth <= 0) this.startFall('Hypothermie');
  }

  // Marche sur une pente douce : maintenir le bouton du sens de la pente fait avancer ; le sens opposé fait reculer.
  updateWalk(dt) {
    const s = this.s, wk = s.walk, sec = this.walks[wk.id];
    const { wind } = this.weather;
    const forward = sec.dir > 0 ? this.hold.R : this.hold.L;
    const back = sec.dir > 0 ? this.hold.L : this.hold.R;
    const hypoxia = this.needsOxygen && !this.oxygenActive;
    this.walkMoving = false;
    if ((forward || back) && s.energy >= 1) {
      const v = 3 * (this.skill('end4') ? 1.2 : 1) * (1 - 0.3 * wind) * (hypoxia ? 0.55 : 1) * (this.daylight < 0.4 ? 0.85 : 1);
      wk.p = clamp(wk.p + (forward ? 1 : -0.6) * v * dt / sec.len, 0, 1);
      s.energy = Math.max(0, s.energy - (0.5 + sec.slope * 2.5) * (this.skill('end4') ? 0.8 : 1) * (forward ? 1 : 0.4) * (hypoxia ? this.hyp.cost - 0.2 : 1) * (1 + 0.4 * wind) * dt);
      this.lastStep = this.clock;
      this.walkAnim += dt;
      this.walkMoving = true;
    } else if ((forward || back) && s.energy < 1) this.say('Épuisé : lâche le bouton et souffle', 'warn');
    s.alt = sec.a + wk.p * sec.gain;
    s.x = 50;
    if (wk.p >= 1) {
      s.walkDone.push(sec.id);
      s.walk = null;
      s.alt = sec.a + sec.gain;
      this.say('Pente franchie : la paroi reprend', 'good');
      this.gainXp(30);
    }
  }

  updateEvents(dt) {
    const e = this.evt;
    if (this.s.ov || this.s.walk || this.fall || this.sleep) return;
    e.next -= dt;
    if (e.next > 0) return;
    e.next = 55 + this.rng() * 70;
    const pick = pickEvent(this, e.last, this.rng);
    if (!pick) return;
    e.last = pick.index;
    pick.event.run(this);
    this.hooks.event?.(pick.event);
  }

  pickupItems() {
    const s = this.s;
    if (s.ov || s.walk) return;
    for (let i = Math.max(0, Math.floor((s.alt - 70) / ITEM_STEP)); i <= Math.floor((s.alt + 10) / ITEM_STEP); i++) {
      const it = this.item(i);
      if (!it || s.items.includes(i)) continue;
      if (Math.abs(it.a - s.alt) < 6 && Math.abs(it.x - s.x) < 11) {
        s.items.push(i);
        let text;
        if (it.type === 'ration') { s.food = Math.min(MAX.food, s.food + 2); text = '+2 vivres'; }
        else if (it.type === 'gaz') { s.gas = Math.min(MAX.gas, s.gas + 1); text = '+1 gaz'; }
        else if (it.type === 'piton') { const n = this.skill('tec1') ? 3 : 2; s.pitonStock = Math.min(MAX.piton, s.pitonStock + n); text = `+${n} pitons`; }
        else if (it.type === 'corde') { s.rope = Math.min(this.maxRope, s.rope + 60); text = '+60 m de corde'; }
        else { s.o2 = Math.min(MAX.o2, s.o2 + 1); text = '+1 oxygène'; }
        this.floats.push({ text, x: Math.round(s.x * K) - 16, t: 0 });
        this.say(`Trouvé : ${text.slice(1)}`, 'good');
      }
    }
    for (const r of this.relicsIn(s.alt, s.alt)) {
      if (Math.abs(r.a - s.alt) < 6 && Math.abs(r.x - s.x) < 11) {
        this.progress.addRelic(r.id);
        this.gainXp(150);
        this.hooks.relic?.(r);
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
        gu.next = lerp(22, 9, wind) + this.rng() * 6;
        if (this.anchored) {
          s.energy = Math.max(0, s.energy - 2);
          this.say('Tu tiens bon, ancré au piton !', 'good');
        } else if (s.walk) {
          s.energy = Math.max(0, s.energy - 6);
          s.walk.p = Math.max(0, s.walk.p - 0.06);
          this.say('Rafale ! Tu es repoussé', 'bad');
        } else if (s.ov) {
          s.energy = Math.max(0, s.energy - 12);
          s.ov.p = Math.max(0, s.ov.p - 2);
          this.say('Rafale ! Tu balances sous le toit', 'bad');
          if (s.energy <= 0) this.startFall('Épuisement');
        } else {
          s.energy = Math.max(0, s.energy - 12);
          s.alt = Math.max(0, s.alt - 12); // la rafale t'arrache des prises
          this.say('Rafale ! Tu es déporté', 'bad');
          if (s.energy <= 0) this.startFall('Épuisement');
        }
        this.shake = 0.4;
      }
      return;
    }
    gu.next -= dt;
    if (gu.next <= 0) {
      gu.warn = this.skill('sur3') ? 2.4 : 1.8;
      gu.dir = this.rng() < 0.5 ? -1 : 1;
      this.say('Rafale ! Plante un piton', 'bad');
    }
  }

  // Chute de pierres : annoncée par une ligne pointillée, à esquiver en traversant.
  updateRock(dt) {
    const r = this.rock, s = this.s;
    if (s.ov || s.walk) { r.warn = 0; r.fall = 0; return; } // à l'abri sous le toit, ou sur une pente douce
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
        if (Math.abs(r.x - (s.x + this.dodge)) <= 6) {
          s.energy = Math.max(0, s.energy - (this.anchored ? 6 : 22));
          if (!this.anchored) s.alt = Math.max(0, s.alt - 12);
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
      r.next = lerp(26, 12, s.alt / SUMMIT) + this.rng() * 8;
      this.say('Pierres ! Écarte-toi', 'bad');
    }
  }

  startFall(reason) {
    const s = this.s;
    if (this.fall) return;
    const below = s.camps.filter(c => c.a <= s.alt);
    // Un piton relié par la corde retient la chute ; sinon on retombe au camp (ou à la grotte) le plus haut en dessous.
    if (this.roped) for (const p of s.pitons) if (p.linked && p.a <= s.alt + 2) below.push({ a: p.a, x: p.x, piton: true });
    const target = below.length ? below.reduce((m, c) => (c.a > m.a ? c : m)) : { a: 0, x: 50 };
    s.falls++;
    this.camOffset = 0;
    s.o2On = false;
    s.ov = null;
    s.walk = null;
    this.camOffset = 0;
    this.lastSide = null;
    this.fall = { from: s.alt, to: target.a, x: target.x, t: 0, piton: !!target.piton };
    this.say(`${reason} : tu dévisses !`, 'bad');
  }

  updateFall(dt) {
    const f = this.fall, s = this.s;
    f.t += dt / 1.4;
    s.alt = lerp(f.from, f.to, f.t * f.t);
    if (f.t >= 1) {
      s.alt = f.to;
      s.x = f.x;
      if (!f.piton && !this.skill('sur4')) s.food = Math.max(f.to === 0 ? 5 : 0, s.food - 2);
      if (f.to === 0) { s.gas = Math.max(s.gas, 3); s.o2 = Math.max(s.o2, 1); s.pitonStock = Math.max(s.pitonStock, 3); }
      s.energy = (f.piton ? 55 : 40) + (this.skill('sur4') ? 20 : 0);
      s.warmth = Math.max(s.warmth, this.skill('sur4') ? 60 : 40);
      this.fall = null;
      this.view = s.alt;
      this.say(f.piton ? `Retenu par le piton à ${Math.round(f.to)} m` : f.to === 0 ? 'De retour au camp de base' : `De retour au camp à ${Math.round(f.to)} m`, 'warn');
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
    this.gainXp(10, true);
    if (sl.cave) this.say(`Nuit à l’abri dans la grotte, jour ${day}`, 'good');
    else this.say(sl.heated ? `Camp levé, jour ${day}` : `Nuit glaciale sans gaz, jour ${day}`, sl.heated ? 'good' : 'warn');
  }

  // ── Rendu ──────────────────────────────────────────────────────────────
  render() {
    const g = this.g;
    const { wind, snow } = this.weather;
    g.save();
    if (this.shake > 0) g.translate(Math.round((this.fx() - 0.5) * 3 * K), Math.round((this.fx() - 0.5) * 2 * K));
    if (this.drawnMode === 'profile' && this.s.ov) {
      this.drawProfile(g, wind);
      this.drawWeather(g, wind, snow);
    } else if (this.drawnMode === 'walk' && this.s.walk) {
      this.drawWalk(g, wind);
      this.drawWeather(g, wind, snow);
    } else {
      this.drawSky(g);
      g.save();
      g.translate(OX, 0); // la face reste centrée, de 200 px de large
      this.drawFace(g, snow);
      this.drawClouds(g);
      this.drawObjects(g);
      this.drawRopes(g);
      this.drawHero(g, wind);
      this.drawRock(g);
      this.drawFloats(g);
      g.restore();
      this.drawWeather(g, wind, snow);
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
      const x = Math.round(((hash(k) * 140 + this.clock * (1.5 + (k % 3))) % (W / K + 20)) * K - 20 * K);
      g.fillRect(x, y, 28, 4); g.fillRect(x + 6, y - 4, 16, 4); g.fillRect(x + 2, y + 4, 22, 2);
    }
  }

  drawFace(g, snow) {
    const cover = clamp(0.1 + (this.s.alt / SUMMIT) * 0.5 + snow * 0.4, 0, 1);
    const groundY = this.ys(0);
    const tx = Math.floor((TW - W) / 2) + OX; // colonne de la texture qui tombe sous x = 0
    for (let y = 0; y < H; y++) {
      const a = this.view + (HERO_Y - y) / K;
      if (a < 0 || a > SUMMIT) continue;
      const L = Math.max(-OX, this.edgeL(a) * K), R = Math.min(WORLD_W + OX - 1, this.edgeR(a) * K);
      const am = Math.floor(a);
      let zone = a < 2400 ? 0 : a < 5800 ? 1 : 2;
      if (a > 2250 && a < 2550) zone = hash(am * 3) < (a - 2250) / 300 ? 1 : 0;
      if (a > 5650 && a < 5950) zone = hash(am * 5) < (a - 5650) / 300 ? 2 : 1;
      const row = ((Math.floor(a * K) % TILE_H) + TILE_H) % TILE_H;
      g.drawImage(this.tiles[zone], L + tx, row, R - L + 1, 1, L, y, R - L + 1, 1);
      g.fillStyle = P[0]; g.fillRect(L, y, 2, 1); g.fillRect(R - 1, y, 2, 1);
      g.fillStyle = P[3];
      g.fillRect(L + 2, y, Math.floor(cover * (2 + 6 * hash(Math.floor(a * 2) * 7 + 1))), 1);
      g.fillRect(R - 1 - Math.floor(cover * 3 * hash(Math.floor(a * 2) * 11 + 2)), y, 1, 1);
    }
    if (groundY < H) {
      g.fillStyle = P[3]; g.fillRect(-OX, groundY, W, H - groundY);
      g.fillStyle = P[0]; g.fillRect(-OX, groundY, W, 2);
      g.fillStyle = bayerPattern(g, 2, 6); g.fillRect(-OX, groundY + 2, W, Math.min(24, H - groundY));
      g.fillStyle = P[2];
      for (let x = 6 - OX; x < W - OX; x += 18) g.fillRect(x, groundY + 8 + (x * 7) % 22, 6, 2);
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

  // Trait d'un pixel (Bresenham) : la corde reste du pixel art.
  plotLine(g, x0, y0, x1, y1) {
    let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let i = 0; i < 400; i++) {
      g.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  drawRopeLine(g, pts) {
    const sc = pts.map(p => [Math.round(p.x * K), Math.round(this.ys(p.y))]);
    if (sc.every(([, y]) => y < -20) || sc.every(([, y]) => y > H + 20)) return;
    g.fillStyle = P[0];
    for (let i = 0; i < sc.length - 1; i++) this.plotLine(g, sc[i][0] + 1, sc[i][1] + 1, sc[i + 1][0] + 1, sc[i + 1][1] + 1);
    g.fillStyle = P[4];
    for (let i = 0; i < sc.length - 1; i++) this.plotLine(g, sc[i][0], sc[i][1], sc[i + 1][0], sc[i + 1][1]);
  }

  drawRopes(g) {
    for (const r of this.ropes) {
      if (r.a.a > this.view + 130 || r.b.a < this.view - 130) continue;
      this.drawRopeLine(g, r.rope.pts);
    }
    if (this.liveRope && !this.s.ov) this.drawRopeLine(g, this.liveRope.pts);
    for (const p of this.s.pitons) {
      if (p.ov !== undefined) continue;
      const y = Math.round(this.ys(p.a)), x = Math.round(p.x * K);
      if (y < -10 || y > H + 10) continue;
      g.fillStyle = P[0]; g.fillRect(x - 3, y - 3, 7, 7);
      g.fillStyle = P[3]; g.fillRect(x - 2, y - 2, 5, 5);
      g.fillStyle = P[4]; g.fillRect(x - 1, y - 1, 3, 3);
    }
  }

  // Les prises visibles : la prochaine clignote en rose, les suivantes se lisent d'avance.
  // Une main est un bec rond, un pied une vire plate.
  drawHolds(g) {
    if (this.s.ov || this.s.walk) return;
    const k = this.holdIndex;
    const blink = Math.floor(this.clock * 3) % 2;
    const lowest = Math.max(1, Math.floor((this.view - (H - HERO_Y) / K - 6) / STEP));
    const highest = Math.min(k + 7, Math.floor((this.view + HERO_Y / K + 6) / STEP));
    for (let j = lowest; j <= highest; j++) {
      const h = this.holdAt(j);
      if (h.a > SUMMIT) break;
      const x = Math.round(h.x * K), y = Math.round(this.ys(h.a));
      if (y < -10 || y > H + 10) continue;
      const ahead = j - k; // 1 = la prochaine
      if (ahead < -3) { // le chemin parcouru : de simples repères
        g.fillStyle = P[0]; g.fillRect(x - 3, y - 2, 7, 4);
        g.fillStyle = P[2]; g.fillRect(x - 2, y - 1, 5, 2);
        continue;
      }
      const col = ahead === 1 ? (blink ? P[4] : P[3]) : ahead > 1 && ahead <= 4 ? P[3] : P[2];
      const grow = ahead === 1 ? 1 : 0;
      g.fillStyle = P[0];
      if (h.kind === 'hand') { // bec rond
        g.fillRect(x - 5 - grow, y - 4 - grow, 11 + 2 * grow, 8 + 2 * grow);
        g.fillStyle = col; g.fillRect(x - 4 - grow, y - 3 - grow, 9 + 2 * grow, 5 + 2 * grow); g.fillRect(x - 2, y - 4 - grow, 5, 1);
      } else { // vire plate
        g.fillRect(x - 8 - grow, y - 3 - grow, 17 + 2 * grow, 6 + 2 * grow);
        g.fillStyle = col; g.fillRect(x - 7 - grow, y - 2 - grow, 15 + 2 * grow, 3 + 2 * grow);
      }
    }
  }

  drawClouds(g) {
    const top = Math.round(this.ys(3300));
    const h = 700 * K;
    if (top > H || top + h < 0) return;
    const off = Math.floor(this.clock * 3 * K) % TW;
    for (let x0 = -OX - off; x0 < W - OX; x0 += TW) g.drawImage(this.clouds, x0, top);
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
    this.drawHolds(g);
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
    for (const r of this.relicsIn(lo, hi)) { // reliques : étoile qui pulse
      const y = Math.round(this.ys(r.a)), x = Math.round(r.x * K);
      const sp = spriteCanvas('relic');
      const pulse = 3 + Math.round(2 * Math.sin(this.clock * 4));
      g.fillStyle = P[0]; g.fillRect(x - (sp.width >> 1) - pulse, y - sp.height - pulse, sp.width + pulse * 2, sp.height + pulse * 2);
      g.fillStyle = blink ? P[3] : P[2]; g.fillRect(x - (sp.width >> 1) - pulse + 1, y - sp.height - pulse + 1, sp.width + pulse * 2 - 2, sp.height + pulse * 2 - 2);
      g.drawImage(sp, x - (sp.width >> 1), y - sp.height);
    }
    const fy = this.ys(SUMMIT);
    if (fy > -20 && fy < H + 20) {
      const f = spriteCanvas('flag');
      g.drawImage(f, WORLD_W / 2 - (f.width >> 1), Math.round(fy) - f.height);
    }
  }

  drawHero(g, wind) {
    const x = Math.round(this.hx * K - wind * K * Math.sin(this.clock * 6));
    const hy = Math.round(this.heroScreenY());
    if (this.sleep) {
      if (!this.sleep.cave) {
        const t = spriteCanvas('tent');
        g.drawImage(t, x - (t.width >> 1), hy - t.height);
      }
      const z = Math.floor(this.clock * 2) % 3;
      drawText(g, 'Z', x + 6 + z * 6, hy - 28 - z * 6, P[4], 2);
      return;
    }
    const sp = spriteCanvas('heroA');
    const top = hy - sp.height;
    if (this.fall) {
      const t = this.fall.t;
      g.save();
      g.translate(x, top + sp.height / 2 + t * 60);
      g.rotate(t * 9);
      g.drawImage(sp, -(sp.width >> 1), -(sp.height >> 1));
      g.restore();
      return;
    }
    // Le torse entre les quatre membres, chacun accroché à sa prise
    const c = this.bodyCenter();
    const bx = Math.round(c.x * K - wind * K * Math.sin(this.clock * 6)), by = Math.round(this.ys(c.a));
    const torso = spriteCanvas('heroT');
    const tw = torso.width, th = torso.height;
    const anchors = { hL: [-4, -th * 0.25], hR: [4, -th * 0.25], fL: [-2, th * 0.3], fR: [2, th * 0.3] };
    for (const limb of LIMBS) {
      const p = this.limbPos[limb];
      if (!p) continue;
      this.drawLimb(g, bx + anchors[limb][0], by + Math.round(anchors[limb][1]), Math.round(p.x * K), Math.round(this.ys(p.a)), limb);
    }
    g.drawImage(torso, bx - (tw >> 1), by - (th >> 1));
    if (this.gust.warn > 0 && Math.floor(this.clock * 8) % 2) {
      const dir = this.gust.dir;
      g.fillStyle = P[4];
      for (let k = 0; k < 6; k++) g.fillRect(bx + dir * (14 + k * 2), by - 4 + (k % 2) * 2, 2, 2);
      g.fillRect(bx + dir * 28, by - 6, 2, 8);
    }
  }

  // Un membre : deux segments de l'épaule (ou de la hanche) jusqu'à la prise, le coude vers l'extérieur.
  drawLimb(g, sx, sy, tx, ty, limb) {
    const reach = 11;
    let dx = tx - sx, dy = ty - sy;
    const d = Math.hypot(dx, dy) || 1;
    const stretch = Math.min(d, reach * 2);
    const ex = sx + (dx / d) * (stretch / 2) + (limb[1] === 'L' ? -1 : 1) * Math.sqrt(Math.max(0, reach * reach - (stretch / 2) ** 2)) * 0.8;
    const ey = sy + (dy / d) * (stretch / 2);
    const hx = Math.round(sx + (dx / d) * stretch), hy = Math.round(sy + (dy / d) * stretch);
    g.fillStyle = P[0];
    this.plotLine(g, sx + 1, sy + 1, Math.round(ex) + 1, Math.round(ey) + 1);
    this.plotLine(g, Math.round(ex) + 1, Math.round(ey) + 1, hx + 1, hy + 1);
    g.fillStyle = P[4];
    this.plotLine(g, sx, sy, Math.round(ex), Math.round(ey));
    this.plotLine(g, Math.round(ex), Math.round(ey), hx, hy);
    this.plotLine(g, sx + 1, sy, Math.round(ex) + 1, Math.round(ey));
    this.plotLine(g, Math.round(ex) + 1, Math.round(ey), hx + 1, hy);
    // la main (ou le pied) : un petit bloc clair cerné de sombre
    g.fillStyle = P[0]; g.fillRect(hx - 2, hy - 2, 5, 5);
    g.fillStyle = limb[0] === 'h' ? P[3] : P[2]; g.fillRect(hx - 1, hy - 1, 3, 3);
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

  // Décor lointain commun aux vues de profil : ciel tramé, deux plans de crêtes, mer de nuages.
  paintVista(g, id, altitude, lift = 0) {
    const alt = altitude / SUMMIT;
    // Ciel : trame de plus en plus sombre vers le haut, et d'autant plus que l'altitude est grande
    g.fillStyle = P[3]; g.fillRect(-OX, -OY, W, H);
    for (let y = -OY; y < H - OY; y++) {
      const dens = clamp((1 - y / 220) * 12 * (0.4 + 0.6 * alt), 0, 12);
      for (let x = -OX; x < W - OX; x++) if (bay(x, y) < dens) { g.fillStyle = P[2]; g.fillRect(x, y, 1, 1); }
    }
    // Chaînes lointaines : deux plans de crêtes, calottes de neige
    for (const [seed, base, amp, col] of [[5, 238 - lift, 70, 2], [9, 268 - lift, 56, 1]]) {
      for (let x = -OX; x < W - OX; x++) {
        const top = Math.round(base - amp * Math.pow(vnoise(x / 24, seed), 1.4) - 8);
        g.fillStyle = P[col]; g.fillRect(x, top, 1, H - OY - top);
        if (col === 2) {
          g.fillStyle = P[3]; g.fillRect(x, top, 1, 2 + (x % 3 === 0 ? 2 : 0));
          g.fillStyle = P[1]; if (bay(x, top) < 5) g.fillRect(x, top + 4, 1, 3);
        }
      }
    }
    // Mer de nuages au fond
    for (let y = 270 - lift; y < H - OY; y++) {
      for (let x = -OX; x < W - OX; x++) {
        const v = hash(Math.floor(x / 5) * 211 + Math.floor(y / 3) * 17 + id);
        g.fillStyle = v < 0.5 ? P[3] : P[2];
        if (y > 282 - lift || v < 0.7) g.fillRect(x, y, 1, 1);
      }
    }
  }

  profileBackdrop(roof) {
    if (this.backdrops[roof.id]) return this.backdrops[roof.id];
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.translate(OX, OY); // la scène fait 200 × 320 ; le reste de l'écran prolonge le ciel et la roche
    const LIP = 164, WALL = 30;
    this.paintVista(g, roof.id, roof.a);
    // Masse rocheuse au-dessus : on la voit en coupe, jusqu'à la lèvre du toit
    const zone = roof.a < 2400 ? 0 : roof.a < 5800 ? 1 : 2;
    for (let x = -OX; x < LIP; x++) {
      const under = this.roofUnder(x) + (x > LIP - 14 ? Math.round((x - (LIP - 14)) * 0.7) : 0);
      g.drawImage(this.tiles[zone], x + OX, mod(x * 3, 200), 1, under + OY, x, -OY, 1, under + OY);
    }
    // Ombre tramée sous le toit
    for (let x = -OX; x < LIP; x++) {
      const under = this.roofUnder(x) + (x > LIP - 14 ? Math.round((x - (LIP - 14)) * 0.7) : 0);
      for (let y = under - 26; y < under; y++) {
        const d = (y - (under - 26)) / 26;
        if (bay(x, y) / 16 < d * 0.85) { g.fillStyle = P[0]; g.fillRect(x, y, 1, 1); }
      }
      g.fillStyle = P[0]; g.fillRect(x, under, 1, 2);
    }
    // Lèvre du toit enneigée
    g.fillStyle = P[0]; g.fillRect(LIP - 2, -OY, 3, this.roofUnder(LIP) + 8 + OY);
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
    for (let y = this.roofUnder(0); y < H - OY; y++) {
      const w = WALL + Math.round(8 * vnoise(y / 17, 31)) - Math.min(14, Math.floor((y - 110) / 14));
      g.drawImage(this.tiles[zone], 0, (y * 2) % 400, Math.max(4, w) + OX, 1, -OX, y, Math.max(4, w) + OX, 1);
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
    g.save();
    g.translate(OX, OY);
    const frac = ov.p / roof.len;
    const hx = Math.round(46 + (LIP - 46 - 26) * frac - wind * K * Math.sin(this.clock * 6));
    this.profileHeroX = hx;
    this.profileHeroY = this.roofUnder(hx) + 40;
    for (const p of this.s.pitons) {
      if (p.ov !== roof.id) continue;
      const px = Math.round(46 + (LIP - 46 - 26) * (p.p / roof.len)), py = this.roofUnder(px) + 2;
      g.fillStyle = P[0]; g.fillRect(px - 3, py - 1, 7, 7);
      g.fillStyle = P[4]; g.fillRect(px - 2, py, 5, 5);
      g.fillStyle = P[0]; g.fillRect(px, py + 2, 1, 1);
    }
    const swing = this.clock - this.lastStep < 0.4 ? 1 : 0;
    const sp = spriteCanvas(this.anchored ? 'heroP1' : this.frame ? 'heroP2' : 'heroP1');
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
    g.restore();
    this.drawFloats(g);
  }

  // ── Vue de profil : pente douce à marcher ──────────────────────────────
  // Sol de la pente : plateau, rampe lissée, plateau. La rampe monte du côté de la direction à suivre.
  walkGround(sec, x) {
    const x0 = 24, x1 = WORLD_W - 24;
    const t = smooth(clamp((x - x0) / (x1 - x0), 0, 1));
    const rise = clamp(sec.slope * 190, 20, 92);
    const up = sec.dir > 0 ? t : 1 - t;
    return Math.round(238 - rise * up + 3 * (vnoise(x / 13, sec.id + 41) - 0.5) * 2);
  }

  walkBackdrop(sec) {
    const key = `w${sec.id}`;
    if (this.backdrops[key]) return this.backdrops[key];
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.translate(OX, OY);
    this.paintVista(g, 100 + sec.id, sec.a, 110);
    const zone = sec.a < 2400 ? 0 : sec.a < 5800 ? 1 : 2;
    for (let x = -OX; x < W - OX; x++) {
      const y = this.walkGround(sec, x);
      const srcY = mod(x * 5 + sec.id * 40, 250), rows = Math.min(H - OY - y, TILE_H - srcY);
      g.fillStyle = P[1]; g.fillRect(x, y, 1, H - OY - y);
      g.drawImage(this.tiles[zone], x + OX, srcY, 1, rows, x, y, 1, rows);
      for (let k = 0; k < 40; k++) { // ombre tramée sous la surface
        const d = k / 40;
        if (bay(x, y + k) / 16 < d * 0.9) { g.fillStyle = P[0]; g.fillRect(x, y + k, 1, 1); }
      }
      g.fillStyle = P[0]; g.fillRect(x, y, 1, 2);
      g.fillStyle = P[3]; g.fillRect(x, y + 2, 1, 3 + Math.floor(hash(x * 3 + sec.id) * 3));
      g.fillStyle = P[2]; if (x % 2) g.fillRect(x, y + 6, 1, 1);
    }
    for (let i = 0; i < 9; i++) { // petits blocs posés sur la pente
      const x = 14 + Math.floor(hash(sec.id * 61 + i) * (WORLD_W - 28)), y = this.walkGround(sec, x);
      g.fillStyle = P[0]; g.fillRect(x - 4, y - 5, 9, 6);
      g.fillStyle = P[1]; g.fillRect(x - 3, y - 4, 7, 4);
      g.fillStyle = P[3]; g.fillRect(x - 3, y - 4, 3, 1);
    }
    this.backdrops[key] = c;
    return c;
  }

  drawWalk(g, wind) {
    const s = this.s, wk = s.walk, sec = this.walks[wk.id];
    g.drawImage(this.walkBackdrop(sec), 0, 0);
    g.save();
    g.translate(OX, OY);
    const x0 = 24, x1 = WORLD_W - 24;
    const hx = Math.round(sec.dir > 0 ? x0 + wk.p * (x1 - x0) : x1 - wk.p * (x1 - x0));
    const hy = this.walkGround(sec, hx) + 2;
    this.profileHeroX = hx;
    this.profileHeroY = hy - 8;
    if (this.sleep) {
      const t = spriteCanvas('tent');
      g.drawImage(t, hx - (t.width >> 1), hy - t.height);
      const z = Math.floor(this.clock * 2) % 3;
      drawText(g, 'Z', hx + 6 + z * 6, hy - 30 - z * 6, P[4], 2);
    } else {
      const walking = this.walkMoving && this.clock - this.lastStep < 0.2;
      const sp = spriteCanvas(walking && Math.floor(this.walkAnim * 5) % 2 ? 'heroW2' : 'heroW1');
      g.save();
      g.translate(hx + wind * Math.sin(this.clock * 6), hy - sp.height + (walking && Math.floor(this.walkAnim * 5) % 2 ? -1 : 0));
      if (sec.dir < 0) g.scale(-1, 1);
      g.drawImage(sp, -(sp.width >> 1), 0);
      g.restore();
      if (Math.floor(this.clock * 3) % 2) { // chevrons pour indiquer le sens de la marche
        g.fillStyle = P[4];
        for (let k = 0; k < 3; k++) {
          const cx = hx + sec.dir * (22 + k * 8), cy = this.walkGround(sec, cx) - 22;
          for (let r = 0; r < 4; r++) g.fillRect(cx - sec.dir * r, cy - 3 + r, 1, 1), g.fillRect(cx - sec.dir * r, cy + 4 - r, 1, 1);
        }
      }
    }
    drawText(g, 'PENTE', 66, 176, P[0], 2);
    g.fillStyle = P[0]; g.fillRect(66, 192, 68, 12);
    g.fillStyle = P[3]; g.fillRect(68, 194, 64, 8);
    g.fillStyle = P[4]; g.fillRect(68, 194, Math.round(64 * wk.p), 8);
    g.restore();
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
    const dt = this.frameDt;
    const n = snow > 0.02 ? Math.floor(10 + 160 * snow) : 0;
    for (let i = 0; i < n; i++) {
      const f = this.flakes[i];
      f.y += (20 + 45 * snow) * K * f.v * dt;
      f.x -= (5 + 90 * wind) * K * f.v * dt;
      if (f.y > H) { f.y = -2; f.x = this.fx() * (W + 80); }
      if (f.x < -2) { f.x = W + 2; f.y = this.fx() * H; }
      const x = Math.round(f.x), y = Math.round(f.y);
      g.fillStyle = P[0]; g.fillRect(x + 1, y + 1, f.v > 1.1 ? 2 : 1, f.v > 1.1 ? 2 : 1);
      g.fillStyle = P[3]; g.fillRect(x, y, f.v > 1.1 ? 2 : 1, f.v > 1.1 ? 2 : 1);
    }
    if (wind > 0.3) {
      g.fillStyle = P[3];
      for (const st of this.streaks) {
        st.x -= (90 + 160 * wind) * K * dt;
        if (st.x < -st.l) { st.x = W + 6; st.y = this.fx() * H; }
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
      const side = this.drawnMode !== 'face' && (this.s.ov || this.s.walk);
      const cx = side ? (this.profileHeroX ?? 100) + OX : this.hx * K + OX;
      const cy = side ? (this.profileHeroY ?? 140) + OY : this.heroScreenY() - 8;
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
