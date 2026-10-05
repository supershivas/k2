// Moteur du jeu : la face du K2 vue de face, le héros minuscule qui grimpe.
// Simulation (altitude, ressources, météo, temps) et rendu pixel art en palette Game Boy.
import { PALETTE as P, spriteCanvas } from './sprites.js';
import { drawText } from './pixfont.js';

export const W = 100;
export const H = 160;
export const SUMMIT = 8611;
const HERO_Y = 116; // pieds du héros à l'écran ; 1 px = 1 m
const OXYGEN_ALT = 6500;
const BOTTLE_SECONDS = 90;
const MAX = { food: 12, gas: 8, o2: 4 };
const ITEM_STEP = 110;
const BLOCK_STEP = 36;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);

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

export function newState() {
  return {
    alt: 0, x: 50, energy: 100, warmth: 100,
    food: 6, gas: 3, o2: 1, o2Sec: 0, o2On: false,
    min: 360, // minutes depuis le début, démarre à 6 h
    camps: [], items: [], falls: 0, steps: 0, summit: false,
  };
}

// Textures de la paroi : roche, roche claire, glace (4 verts seulement).
function makeTile(zone, seed) {
  const c = document.createElement('canvas');
  c.width = W; c.height = 256;
  const g = c.getContext('2d');
  const base = zone === 2 ? P[2] : P[1];
  const mark = zone === 2 ? P[3] : P[2];
  const dark = zone === 2 ? P[1] : P[0];
  g.fillStyle = base; g.fillRect(0, 0, W, 256);
  let n = seed;
  const r = () => hash(n++);
  const dots = zone === 0 ? 60 : zone === 1 ? 70 : 120;
  for (let i = 0; i < dots; i++) {
    g.fillStyle = r() < (zone === 2 ? 0.55 : 0.12) ? mark : dark;
    const w = zone === 2 ? 2 + Math.floor(r() * 7) : 2 + Math.floor(r() * 4);
    g.fillRect(Math.floor(r() * W), Math.floor(r() * 256), w, 1 + Math.floor(r() * 2));
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = dark;
    g.fillRect(Math.floor(r() * W), Math.floor(r() * 256), 6 + Math.floor(r() * 24), 1);
  }
  // Couloirs et arêtes : longues traces verticales
  for (let i = 0; i < 9; i++) {
    let x = Math.floor(r() * W), y = Math.floor(r() * 256);
    const len = 40 + r() * 110;
    for (let k = 0; k < len; k++) {
      g.fillStyle = dark; g.fillRect(x, y % 256, 1, 1);
      g.fillStyle = mark; g.fillRect(x + 1, y % 256, 1, 1);
      y++;
      if (r() < 0.28) x += r() < 0.5 ? -1 : 1;
    }
  }
  return c;
}

// Bande de nuages (entre 2 600 et 3 300 m) : pixels clairs répartis au hasard.
function makeCloudStrip() {
  const c = document.createElement('canvas');
  c.width = W; c.height = 700;
  const g = c.getContext('2d');
  for (let y = 0; y < 700; y++) {
    const cover = Math.max(0, 1 - Math.abs(y - 350) / 350) ** 0.7;
    for (let x = 0; x < W; x++) {
      const v = hash(Math.floor(x / 4) * 977 + Math.floor(y / 2) * 31 + 5);
      if (v < cover * 0.17) { g.fillStyle = v < cover * 0.06 ? P[3] : P[2]; g.fillRect(x, y, 1, 1); }
    }
  }
  return c;
}

export class Game {
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    canvas.width = W; canvas.height = H;
    this.g = canvas.getContext('2d');
    this.hooks = hooks; // say(text, tone), summit(), stateChanged()
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
    this.gust = { next: 12, warn: 0, dir: 1 };
    this.rock = { next: 14, warn: 0, fall: 0, x: 50, hit: false };
    this.floats = [];
    this.flakes = Array.from({ length: 90 }, (_, i) => ({ x: hash(i) * W, y: hash(i + 500) * H, v: 0.6 + hash(i + 900) }));
    this.streaks = Array.from({ length: 10 }, (_, i) => ({ x: hash(i + 40) * W, y: hash(i + 80) * H, l: 8 + hash(i + 120) * 14 }));
    this.tiles = [makeTile(0, 11), makeTile(1, 77), makeTile(2, 151)];
    this.clouds = makeCloudStrip();
    this.night = document.createElement('canvas');
    this.night.width = W; this.night.height = H;
  }

  load(state) {
    const s = Object.assign(newState(), state);
    s.camps = (s.camps || []).map(c => (typeof c === 'number' ? { a: c, x: 50 } : c));
    s.items = Array.isArray(s.items) ? s.items : [];
    this.s = s;
    this.view = s.alt;
    this.hx = s.x;
    this.fall = this.sleep = null;
    this.grip = false;
    this.lastSide = null;
    this.floats = [];
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
  clampX(x, a) { return clamp(x, this.edgeL(a) + 6, this.edgeR(a) - 6); }
  ys(a) { return HERO_Y + (this.view - a); }

  // Blocs de roche et plaques de verglas, générés par tranche de 36 m.
  obstacle(i) {
    if (i < 1 || i * BLOCK_STEP > SUMMIT - 60 || hash(i * 17 + 3) > 0.3 + 0.35 * (i * BLOCK_STEP / SUMMIT)) return null;
    const a = i * BLOCK_STEP + 8 + hash(i * 17 + 5) * 20;
    const L = this.edgeL(a) + 9, R = this.edgeR(a) - 9;
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
    const L = this.edgeL(a) + 9, R = this.edgeR(a) - 9;
    const r = hash(i * 29 + 5);
    let type = r < 0.5 ? 'ration' : r < 0.75 ? 'gaz' : 'o2';
    if (type === 'o2' && a < 2000) type = 'ration';
    return { id: i, a, x: L + hash(i * 29 + 7) * Math.max(1, R - L), type };
  }

  // ── Actions du joueur ──────────────────────────────────────────────────
  step(side) {
    const s = this.s;
    if (!this.playing || this.busy || this.grip) return;
    if (s.energy < 1) { this.say('Épuisé : reprends ton souffle', 'warn'); return; }
    this.frame ^= 1;
    this.lastStep = this.clock;
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
    s.alt = next;
    s.energy = Math.max(0, s.energy - 0.7 * (1 + s.alt / 7000) * (hypoxia ? 2.4 : 1) * (1 + 0.4 * wind) * (ice ? 1.8 : 1));
    s.min += 1.8;
    s.steps++;
    s.x = this.clampX(s.x, s.alt);
    if (s.alt >= SUMMIT && !s.summit) {
      s.summit = true;
      this.hooks.summit?.();
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
    if (!s.camps.some(c => Math.abs(c.a - s.alt) < 40)) s.camps.push({ a: Math.round(s.alt), x: Math.round(s.x) });
    s.o2On = false;
    this.grip = false;
    const hour = (s.min % 1440) / 60;
    const night = this.daylight < 0.5;
    const toMorning = ((6 - hour + 24) % 24) * 60 || 1440;
    const fed = s.food > 0;
    const heated = s.gas > 0;
    if (fed) s.food--;
    if (heated) s.gas--;
    this.sleep = { left: night ? toMorning : 300, total: night ? toMorning : 300, dur: 2.8, fed, heated };
    this.say(night ? 'Tu montes le camp pour la nuit…' : 'Tu fais une pause au camp…', 'info');
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
      s.energy = Math.min(100, s.energy + rate * dt);
    }

    this.pickupItems();
    this.updateGusts(dt, wind);
    this.updateRock(dt);
    if (s.warmth <= 0) this.startFall('Hypothermie');
  }

  pickupItems() {
    const s = this.s;
    for (let i = Math.max(0, Math.floor((s.alt - 70) / ITEM_STEP)); i <= Math.floor((s.alt + 10) / ITEM_STEP); i++) {
      const it = this.item(i);
      if (!it || s.items.includes(i)) continue;
      if (Math.abs(it.a - s.alt) < 6 && Math.abs(it.x - s.x) < 11) {
        s.items.push(i);
        let text;
        if (it.type === 'ration') { s.food = Math.min(MAX.food, s.food + 2); text = '+2 vivres'; }
        else if (it.type === 'gaz') { s.gas = Math.min(MAX.gas, s.gas + 1); text = '+1 gaz'; }
        else { s.o2 = Math.min(MAX.o2, s.o2 + 1); text = '+1 oxygène'; }
        this.floats.push({ text, x: Math.round(s.x) - 8, t: 0 });
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
    if (r.warn > 0) {
      r.warn -= dt;
      if (r.warn <= 0) { r.fall = 0.0001; r.hit = false; }
      return;
    }
    if (r.fall > 0) {
      r.fall += dt / 0.7;
      const y = lerp(-6, HERO_Y + 6, r.fall);
      if (!r.hit && y >= HERO_Y - 8) {
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
      r.x = this.clampX(s.x + (Math.random() - 0.5) * 24, s.alt);
      r.warn = 1.5;
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
    this.say(sl.heated ? `Camp levé, jour ${day}` : `Nuit glaciale sans gaz, jour ${day}`, sl.heated ? 'good' : 'warn');
  }

  // ── Rendu ──────────────────────────────────────────────────────────────
  render() {
    const g = this.g;
    const { wind, snow } = this.weather;
    g.save();
    if (this.shake > 0) g.translate(Math.round((Math.random() - 0.5) * 3), Math.round((Math.random() - 0.5) * 2));
    this.drawSky(g);
    this.drawFace(g, snow);
    this.drawClouds(g);
    this.drawObjects(g);
    this.drawHero(g, wind);
    this.drawRock(g);
    this.drawWeather(g, wind, snow);
    this.drawFloats(g);
    g.restore();
    this.drawNight(g);
  }

  drawSky(g) {
    g.fillStyle = P[3]; g.fillRect(0, 0, W, H);
    g.fillStyle = P[2];
    for (let k = 0; k < 10; k++) {
      const a = 700 * k + hash(k + 60) * 400;
      const y = Math.round(HERO_Y + (this.view - a) * 0.6);
      if (y < -4 || y > H) continue;
      const x = Math.round(((hash(k) * 140 + this.clock * (1.5 + (k % 3))) % 140) - 20);
      g.fillRect(x, y, 14, 2); g.fillRect(x + 3, y - 2, 8, 2);
    }
  }

  drawFace(g, snow) {
    const view = Math.round(this.view);
    const cover = clamp(0.1 + (this.s.alt / SUMMIT) * 0.5 + snow * 0.4, 0, 1);
    const groundY = HERO_Y + view;
    for (let y = 0; y < H; y++) {
      const a = view + HERO_Y - y;
      if (a < 0 || a > SUMMIT) continue;
      const L = Math.max(0, this.edgeL(a)), R = Math.min(W - 1, this.edgeR(a));
      let zone = a < 2400 ? 0 : a < 5800 ? 1 : 2;
      if (a > 2250 && a < 2550) zone = hash(a * 3) < (a - 2250) / 300 ? 1 : 0;
      if (a > 5650 && a < 5950) zone = hash(a * 5) < (a - 5650) / 300 ? 2 : 1;
      g.drawImage(this.tiles[zone], L, ((a % 256) + 256) % 256, R - L + 1, 1, L, y, R - L + 1, 1);
      g.fillStyle = P[0]; g.fillRect(L, y, 1, 1); g.fillRect(R, y, 1, 1);
      g.fillStyle = P[3];
      g.fillRect(L + 1, y, Math.floor(cover * (1 + 3 * hash(a * 7 + 1))), 1);
    }
    if (groundY < H) {
      g.fillStyle = P[3]; g.fillRect(0, groundY, W, H - groundY);
      g.fillStyle = P[0]; g.fillRect(0, groundY, W, 1);
      g.fillStyle = P[2];
      for (let x = 3; x < W; x += 9) g.fillRect(x, groundY + 4 + (x * 7) % 11, 3, 1);
    }
    // Repères d'altitude tous les 500 m
    for (let a = Math.max(500, Math.ceil((view - 60) / 500) * 500); a <= view + HERO_Y + 8; a += 500) {
      const y = Math.round(this.ys(a));
      const L = this.edgeL(a);
      g.fillStyle = P[0]; g.fillRect(L + 2, y - 7, String(a).length * 4 + 1, 7);
      drawText(g, a, L + 3, y - 6, P[3]);
      g.fillStyle = P[3];
      for (let x = L + 2; x < this.edgeR(a) - 1; x += 3) g.fillRect(x, y, 1, 1);
    }
  }

  drawClouds(g) {
    const top = Math.round(this.ys(3300));
    if (top > H || top + 700 < 0) return;
    const off = Math.floor(this.clock * 3) % W;
    g.drawImage(this.clouds, off, 0, W - off, 700, 0, top, W - off, 700);
    if (off) g.drawImage(this.clouds, 0, 0, off, 700, W - off, top, off, 700);
  }

  drawObjects(g) {
    const s = this.s;
    const lo = this.view - (H - HERO_Y) - 20, hi = this.view + HERO_Y + 20;
    for (let i = Math.max(1, Math.floor(lo / BLOCK_STEP)); i <= Math.floor(hi / BLOCK_STEP); i++) {
      const ob = this.obstacle(i);
      if (!ob) continue;
      const y = Math.round(this.ys(ob.a)), x = Math.round(ob.x);
      if (ob.type === 'block') {
        g.fillStyle = P[0]; g.fillRect(x - 6, y - 7, 12, 7); g.fillRect(x - 4, y - 9, 8, 2);
        g.fillStyle = P[3]; g.fillRect(x - 5, y - 6, 10, 5); g.fillRect(x - 3, y - 8, 6, 2);
        g.fillStyle = P[1]; g.fillRect(x - 1, y - 4, 6, 3); g.fillRect(x + 2, y - 6, 3, 2);
      } else {
        g.fillStyle = P[3]; g.fillRect(x - 8, y - 4, 16, 4);
        g.fillStyle = P[2];
        for (let k = 0; k < 16; k += 2) g.fillRect(x - 8 + k + (k % 4 ? 1 : 0), y - 3 + (k % 3 ? 0 : 1), 1, 1);
      }
    }
    for (const c of s.camps) {
      if (this.sleep && Math.abs(c.a - s.alt) < 40) continue;
      const y = this.ys(c.a);
      if (y > -10 && y < H + 10) g.drawImage(spriteCanvas('tent'), c.x - 4, Math.round(y) - 8);
    }
    const blink = Math.floor(this.clock * 2) % 2;
    for (let i = Math.max(0, Math.floor(lo / ITEM_STEP)); i <= Math.floor(hi / ITEM_STEP); i++) {
      const it = this.item(i);
      if (!it || s.items.includes(i)) continue;
      const y = Math.round(this.ys(it.a)), x = Math.round(it.x);
      g.fillStyle = blink ? P[3] : P[0];
      g.fillRect(x - 5, y - 9, 10, 10);
      g.drawImage(spriteCanvas(it.type), x - 4, y - 8);
    }
    const fy = this.ys(SUMMIT);
    if (fy > -10 && fy < H + 10) g.drawImage(spriteCanvas('flag'), 46, Math.round(fy) - 8);
  }

  drawHero(g, wind) {
    const x = Math.round(this.hx - wind * Math.sin(this.clock * 6));
    const y = HERO_Y - 8;
    if (this.sleep) {
      g.drawImage(spriteCanvas('tent'), x - 4, y);
      const z = Math.floor(this.clock * 2) % 3;
      drawText(g, 'Z', x + 3 + z * 3, y - 6 - z * 3, P[4]);
      return;
    }
    if (this.fall) {
      const t = this.fall.t;
      g.save();
      g.translate(x, y + 4 + t * 30);
      g.rotate(t * 9);
      g.drawImage(spriteCanvas('heroA'), -4, -4);
      g.restore();
      return;
    }
    const bob = this.clock - this.lastStep < 0.12 ? -1 : 0;
    g.fillStyle = P[0]; g.fillRect(x - 5, y - 1 + bob, 10, 10); // fond sombre pour garder le héros lisible
    g.drawImage(spriteCanvas(this.grip ? 'heroA' : this.frame ? 'heroB' : 'heroA'), x - 4, y + bob);
    if (this.gust.warn > 0 && Math.floor(this.clock * 8) % 2) {
      const dir = this.gust.dir;
      g.fillStyle = P[4];
      for (let k = 0; k < 5; k++) g.fillRect(x + dir * (8 + k), y + 2 + (k % 2), 1, 1);
      g.fillRect(x + dir * 14, y + 1, 1, 4);
    }
  }

  drawRock(g) {
    const r = this.rock;
    if (r.warn > 0) {
      g.fillStyle = Math.floor(this.clock * 8) % 2 ? P[4] : P[0];
      for (let y = 0; y < H; y += 4) g.fillRect(Math.round(r.x), y, 1, 2);
    } else if (r.fall > 0) {
      const y = Math.round(lerp(-6, HERO_Y + 6, r.fall));
      g.fillStyle = P[0]; g.fillRect(Math.round(r.x) - 2, y, 4, 4);
      g.fillStyle = P[4]; g.fillRect(Math.round(r.x) - 1, y + 1, 2, 2);
      g.fillStyle = P[1]; g.fillRect(Math.round(r.x), y - 6, 1, 6);
    }
  }

  drawWeather(g, wind, snow) {
    const dt = this.dt;
    const n = snow > 0.02 ? Math.floor(6 + 84 * snow) : 0;
    for (let i = 0; i < n; i++) {
      const f = this.flakes[i];
      f.y += (20 + 45 * snow) * f.v * dt;
      f.x -= (5 + 90 * wind) * f.v * dt;
      if (f.y > H) { f.y = -2; f.x = Math.random() * (W + 40); }
      if (f.x < -2) { f.x = W + 2; f.y = Math.random() * H; }
      const x = Math.round(f.x), y = Math.round(f.y);
      g.fillStyle = P[0]; g.fillRect(x + 1, y + 1, 1, 1);
      g.fillStyle = P[3]; g.fillRect(x, y, 1, 1);
    }
    if (wind > 0.3) {
      g.fillStyle = P[3];
      for (const st of this.streaks) {
        st.x -= (90 + 160 * wind) * dt;
        if (st.x < -st.l) { st.x = W + 6; st.y = Math.random() * H; }
        g.fillRect(Math.round(st.x), Math.round(st.y), Math.round(st.l * (0.5 + wind)), 1);
      }
    }
    if (snow * wind > 0.25) {
      g.fillStyle = P[3];
      for (let y = 0; y < H; y += 2) for (let x = (y / 2) % 2; x < W; x += 4) g.fillRect(x, y, 1, 1);
    }
  }

  drawFloats(g) {
    for (const f of this.floats) {
      const y = HERO_Y - 14 - Math.round(f.t * 14);
      drawText(g, f.text, f.x, y + 1, P[0]);
      drawText(g, f.text, f.x, y, P[4]);
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
      const r0 = this.sleep ? 40 : 30;
      for (const r of [r0, r0 * 0.7, r0 * 0.4]) {
        n.beginPath(); n.arc(this.hx, HERO_Y - 4, r, 0, Math.PI * 2); n.fill();
      }
      g.drawImage(this.night, 0, 0);
    }
    const cold = clamp(1 - this.s.warmth / 35, 0, 1);
    if (cold > 0.05) {
      g.fillStyle = P[3];
      const w = Math.ceil(cold * 5);
      g.fillRect(0, 0, w, H); g.fillRect(W - w, 0, w, H); g.fillRect(0, 0, W, w); g.fillRect(0, H - w, W, w);
    }
  }
}
