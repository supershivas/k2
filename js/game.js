// Moteur du jeu : simulation (altitude, ressources, météo, jour/nuit) et rendu pixel art.
import { PALETTE, spriteCanvas } from './sprites.js';

export const W = 200;
export const H = 320;
export const SUMMIT = 8611;
const HERO_Y = 232; // ligne des pieds du héros à l'écran
const CACHE_ALTS = [700, 1500, 2300, 3100, 3900, 4700, 5500, 6300, 7100, 7900];
const OXYGEN_ALT = 6500;
const BOTTLE_SECONDS = 90;
const MAX = { food: 12, gas: 8, o2: 4 };

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

function hexToRgb(h) { return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); }
function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], t))).join(',')})`;
}
function mixRgb(a, b, t) { return mix(rgbToHex(a), rgbToHex(b), t); }
function rgbToHex(c) {
  if (c.startsWith('#')) return c;
  const [r, g, b] = c.match(/\d+/g).map(Number);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// Petite police 3×5 pour les altitudes dessinées dans le décor.
const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
  '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
function drawNumber(g, n, x, y, color) {
  g.fillStyle = color;
  [...String(n)].forEach((ch, k) => {
    const bits = DIGITS[+ch];
    for (let i = 0; i < 15; i++) if (bits[i] === '1') g.fillRect(x + k * 4 + (i % 3), y + Math.floor(i / 3), 1, 1);
  });
}

export function newState() {
  return {
    alt: 0, energy: 100, warmth: 100,
    food: 10, gas: 6, o2: 2, o2Sec: 0, o2On: false,
    min: 360, // minutes depuis le début, démarre à 6 h
    camps: [], caches: [], falls: 0, steps: 0, summit: false,
  };
}

function makeTile(base, light, dark, seed) {
  const c = document.createElement('canvas');
  c.width = 112; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 112, 256);
  let n = seed;
  const r = () => hash(n++);
  for (let i = 0; i < 160; i++) {
    g.fillStyle = r() < 0.5 ? light : dark;
    g.fillRect(Math.floor(r() * 112), Math.floor(r() * 256), 4 + Math.floor(r() * 30), 1);
  }
  for (let i = 0; i < 160; i++) {
    g.fillStyle = r() < 0.5 ? light : dark;
    g.fillRect(Math.floor(r() * 112), Math.floor(r() * 256), 1 + Math.floor(r() * 2), 1 + Math.floor(r() * 2));
  }
  g.fillStyle = dark;
  for (let i = 0; i < 14; i++) {
    let x = Math.floor(r() * 112), y = Math.floor(r() * 256);
    for (let k = 0; k < 10 + r() * 14; k++) {
      g.fillRect(x, y % 256, 1, 1);
      y++;
      x += Math.floor(r() * 3) - 1;
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
    this.heroX = 96;
    this.frame = 0;
    this.grip = false;
    this.lastSide = null;
    this.lastStep = -9;
    this.clock = 0;
    this.shake = 0;
    this.fall = null;
    this.sleep = null;
    this.gust = { next: 12, warn: 0 };
    this.flakes = Array.from({ length: 150 }, (_, i) => ({ x: hash(i) * W, y: hash(i + 500) * H, v: 0.6 + hash(i + 900) }));
    this.streaks = Array.from({ length: 14 }, (_, i) => ({ x: hash(i + 40) * W, y: hash(i + 80) * H, l: 10 + hash(i + 120) * 18 }));
    this.stars = Array.from({ length: 70 }, (_, i) => ({ x: hash(i + 3) * 120, y: hash(i + 300) * 220, b: hash(i + 700) }));
    this.tiles = [
      makeTile('#AB5236', '#C26B4A', '#7E3A28', 11),
      makeTile('#5F574F', '#83769C', '#3B3730', 77),
      makeTile('#9DB8D6', '#FFF1E8', '#6E8DB3', 151),
    ];
    this.night = document.createElement('canvas');
    this.night.width = W; this.night.height = H;
  }

  load(state) {
    this.s = Object.assign(newState(), state);
    this.view = this.s.alt;
    this.fall = this.sleep = null;
    this.grip = false;
    this.lastSide = null;
    this.hooks.stateChanged?.();
  }

  say(text, tone = 'info') { this.hooks.say?.(text, tone); }

  // ── Environnement ──────────────────────────────────────────────────────
  get daylight() {
    const t = (this.s.min % 1440) / 1440;
    const e = Math.sin((t - 0.25) * Math.PI * 2);
    return smooth(clamp((e + 0.15) / 0.45, 0, 1));
  }
  get weather() {
    const a = this.s.alt / SUMMIT, m = this.s.min;
    const wind = clamp((vnoise(m / 90, 11) - 0.35) * 1.8 * (0.3 + 0.95 * a), 0, 1);
    const snow = clamp((vnoise(m / 140, 29) - 0.45) * 2.2 * (0.45 + 0.8 * a), 0, 1);
    return { wind, snow };
  }
  get temperature() {
    const { wind, snow } = this.weather;
    return 14 - 6.8 * (this.s.alt / 1000) - (1 - this.daylight) * 14 - snow * 6 - wind * 4;
  }
  get needsOxygen() { return this.s.alt > OXYGEN_ALT; }
  get oxygenActive() { return this.s.o2On && (this.s.o2Sec > 0); }
  get busy() { return !!(this.fall || this.sleep || this.s.summit); }

  // ── Actions du joueur ──────────────────────────────────────────────────
  step(side) {
    const s = this.s;
    if (!this.playing || this.busy || this.grip) return;
    if (s.energy < 1) { this.say('Épuisé : reprends ton souffle', 'warn'); return; }
    if (side === this.lastSide) {
      s.energy = Math.max(0, s.energy - 1.5);
      this.shake = 0.15;
      return;
    }
    this.lastSide = side;
    this.frame ^= 1;
    this.lastStep = this.clock;
    const { wind, snow } = this.weather;
    const hypoxia = this.needsOxygen && !this.oxygenActive;
    const slow = (1 - 0.28 * snow - 0.25 * wind) * (1 - 0.2 * (1 - this.daylight)) * (hypoxia ? 0.6 : 1);
    s.alt = Math.min(SUMMIT, s.alt + 4 * slow);
    s.energy = Math.max(0, s.energy - 0.7 * (1 + s.alt / 7000) * (hypoxia ? 2.4 : 1) * (1 + 0.4 * wind));
    s.min += 1.8;
    s.steps++;
    this.afterMove();
  }

  afterMove() {
    const s = this.s;
    CACHE_ALTS.forEach((a, i) => {
      if (s.alt >= a && !s.caches.includes(i)) {
        s.caches.push(i);
        const o2 = a > 4000 ? 1 : 0;
        s.food = Math.min(MAX.food, s.food + 2);
        s.gas = Math.min(MAX.gas, s.gas + 1);
        s.o2 = Math.min(MAX.o2, s.o2 + o2);
        this.say(`Dépôt trouvé : +2 vivres, +1 gaz${o2 ? ', +1 oxygène' : ''}`, 'good');
      }
    });
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
    if (!s.camps.some(c => Math.abs(c - s.alt) < 40)) s.camps.push(Math.round(s.alt));
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
    this.clock += dt;
    this.shake = Math.max(0, this.shake - dt);
    const s = this.s;

    // Le héros reste calé sur la paroi, la vue suit l'altitude en douceur.
    this.view += (s.alt - this.view) * Math.min(1, dt * 10);
    const targetX = this.wallEdge(this.view) - 12;
    this.heroX += (targetX - this.heroX) * Math.min(1, dt * 12);

    if (!this.playing) return;

    if (this.fall) { this.updateFall(dt); return; }
    if (this.sleep) { this.updateSleep(dt); return; }
    if (s.summit) return;

    s.min += dt * 0.6;
    const { wind } = this.weather;
    const T = this.temperature;
    const exerting = this.clock - this.lastStep < 1.5;

    // Froid
    const drain = Math.max(0, -T - 6) * 0.011 * (1 + wind * 0.9) * (exerting ? 0.45 : 1);
    s.warmth = clamp(s.warmth - drain * dt + (T > -4 ? 2 * dt : 0), 0, 100);

    // Oxygène
    if (s.o2On) {
      if (s.o2Sec <= 0) {
        if (s.o2 >= 1) { s.o2--; s.o2Sec = BOTTLE_SECONDS; } else { s.o2On = false; this.say('Bouteille vide', 'warn'); }
      }
      if (s.o2On) s.o2Sec = Math.max(0, s.o2Sec - dt);
    }

    // Souffle : on récupère quand on ne grimpe plus
    if (this.clock - this.lastStep > 0.8 && s.warmth > 15) {
      const hypoxia = this.needsOxygen && !this.oxygenActive;
      const rate = (this.grip ? 6 : 4) * (1 - s.alt / 14000) * (hypoxia ? 0.3 : 1) * (s.food < 1 ? 0.5 : 1);
      s.energy = Math.min(100, s.energy + rate * dt);
    }

    this.updateGusts(dt, wind);

    if (s.warmth <= 0) this.startFall('Hypothermie');
  }

  updateGusts(dt, wind) {
    const gu = this.gust;
    if (wind < 0.45) { gu.warn = 0; gu.next = Math.max(gu.next, 6); return; }
    if (gu.warn > 0) {
      gu.warn -= dt;
      if (gu.warn <= 0) {
        gu.next = lerp(22, 9, wind) + hash(Math.floor(this.clock * 7)) * 6;
        if (this.grip) {
          this.say('Tu tiens bon !', 'good');
          this.shake = 0.3;
        } else {
          const s = this.s;
          s.alt = Math.max(0, s.alt - (15 + hash(Math.floor(this.clock * 13)) * 20));
          s.energy = Math.max(0, s.energy - 22);
          this.shake = 0.5;
          this.say('Rafale ! Tu perds prise', 'bad');
          if (s.energy <= 0) this.startFall('Épuisement');
        }
      }
      return;
    }
    gu.next -= dt;
    if (gu.next <= 0) {
      gu.warn = 1.8;
      this.say('Rafale ! Maintiens la prise', 'bad');
    }
  }

  startFall(reason) {
    const s = this.s;
    if (this.fall) return;
    const below = s.camps.filter(c => c <= s.alt);
    const target = below.length ? Math.max(...below) : 0;
    s.falls++;
    s.o2On = false;
    this.grip = false;
    this.fall = { from: s.alt, to: target, t: 0, reason };
    this.say(`${reason} : tu dévisses !`, 'bad');
  }

  updateFall(dt) {
    const f = this.fall, s = this.s;
    f.t += dt / 1.4;
    s.alt = lerp(f.from, f.to, f.t * f.t);
    if (f.t >= 1) {
      s.alt = f.to;
      s.food = Math.max(f.to === 0 ? 6 : 0, s.food - 2);
      if (f.to === 0) { s.gas = Math.max(s.gas, 4); s.o2 = Math.max(s.o2, 2); }
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
    const gain = sl.fed ? 70 : 28;
    s.energy = Math.min(100, s.energy + gain);
    s.warmth = sl.heated ? 100 : Math.max(s.warmth, 45);
    this.sleep = null;
    const day = Math.floor(s.min / 1440) + 1;
    this.say(sl.heated ? `Camp levé, jour ${day}` : `Nuit glaciale sans gaz, jour ${day}`, sl.heated ? 'good' : 'warn');
  }

  // ── Rendu ──────────────────────────────────────────────────────────────
  wallEdge(a) {
    if (a > SUMMIT) return W + 20;
    let e = 112 + 9 * (vnoise(a / 55, 3) - 0.5) * 2 + 4 * (vnoise(a / 11, 5) - 0.5) * 2 + 3 * Math.sin(a / 230);
    if (a > SUMMIT - 50) e += (a - (SUMMIT - 50)) * 1.6;
    return Math.round(e);
  }
  ys(a) { return HERO_Y + (this.view - a); }

  render() {
    const g = this.g;
    const day = this.daylight;
    const { wind, snow } = this.weather;
    g.save();
    if (this.shake > 0) g.translate(Math.round((hash(Math.floor(this.clock * 60)) - 0.5) * 4), Math.round((hash(Math.floor(this.clock * 60) + 9) - 0.5) * 3));
    this.drawSky(g, day);
    this.drawFar(g, day);
    this.drawCloudSea(g, day);
    this.drawWall(g, snow);
    this.drawProps(g);
    this.drawHero(g, wind);
    this.drawWeather(g, wind, snow);
    g.restore();
    this.drawNight(g, day);
  }

  drawSky(g, day) {
    const t = (this.s.min % 1440) / 1440;
    const e = Math.sin((t - 0.25) * Math.PI * 2);
    const dayW = smooth(clamp((e + 0.1) / 0.5, 0, 1));
    const twiW = clamp(1 - Math.abs(e) / 0.3, 0, 1) * 0.8;
    const deep = clamp(this.s.alt / SUMMIT, 0, 1) * 0.45;
    const top = mixRgb(mixRgb('#05071a', '#29ADFF', dayW), mixRgb('#7E2553', '#7E2553', 0), twiW);
    const bot = mixRgb(mixRgb('#1D2B53', '#B6E4FF', dayW), '#FF9A5C', twiW);
    for (let y = 0; y < H; y += 8) {
      const k = y / H;
      g.fillStyle = mixRgb(mixRgb(top, bot, k * k), '#0a1030', deep * (1 - k) * 0.8);
      g.fillRect(0, y, W, 8);
    }
    // Étoiles
    const starA = (1 - dayW) * 0.95;
    if (starA > 0.02) {
      g.globalAlpha = starA;
      for (const st of this.stars) {
        const tw = 0.5 + 0.5 * Math.sin(this.clock * 2 + st.b * 20);
        g.fillStyle = PALETTE[7];
        g.globalAlpha = starA * (0.4 + 0.6 * tw);
        g.fillRect(Math.floor(st.x), Math.floor(st.y), st.b > 0.9 ? 2 : 1, st.b > 0.9 ? 2 : 1);
      }
      g.globalAlpha = 1;
    }
    // Soleil et lune
    const sunPhase = (t - 0.25) * 2; // 0 à 1 pendant le jour
    if (sunPhase > 0 && sunPhase < 1) this.drawBody(g, sunPhase, '#FFEC27', '#FFA300', 7);
    const moonPhase = ((t - 0.75 + 1) % 1) * 2;
    if (moonPhase > 0 && moonPhase < 1) this.drawBody(g, moonPhase, '#FFF1E8', '#C2C3C7', 6);
  }

  drawBody(g, p, color, rim, r) {
    const x = 6 + p * 64, y = 190 - Math.sin(p * Math.PI) * 150;
    g.fillStyle = rim;
    for (let dy = -r; dy <= r; dy++) {
      const w = Math.floor(Math.sqrt(r * r - dy * dy));
      g.fillRect(Math.round(x - w), Math.round(y + dy), w * 2 + 1, 1);
    }
    g.fillStyle = color;
    for (let dy = -r + 2; dy <= r - 2; dy++) {
      const w = Math.floor(Math.sqrt((r - 1.5) ** 2 - dy * dy));
      g.fillRect(Math.round(x - w), Math.round(y + dy), w * 2 + 1, 1);
    }
  }

  drawFar(g, day) {
    const base = HERO_Y + 80 + this.view * 0.04;
    const tone = (c, d) => mix(c, '#05071a', (1 - day) * 0.65 + d);
    [[0.0, '#83769C', 52, 21, 0.6], [0.0, '#5F574F', 34, 14, 1.6]].forEach(([, col, amp, wl, sp], idx) => {
      g.fillStyle = tone(col, 0);
      const by = base + idx * 22;
      for (let x = 0; x < W; x++) {
        const hgt = amp * (0.35 + 0.65 * vnoise(x / wl + idx * 9, 41 + idx)) * (0.6 + 0.4 * vnoise(x / 6, 7));
        const y = Math.round(by - hgt);
        g.fillRect(x, y, 1, H - y);
        if (hgt > amp * 0.72) { g.fillStyle = tone('#FFF1E8', 0.12); g.fillRect(x, y, 1, 2); g.fillStyle = tone(col, 0); }
      }
    });
  }

  drawCloudSea(g, day) {
    const top = this.ys(3300), bottom = this.ys(2600);
    if (bottom < 0 || top > H) return;
    g.fillStyle = mix('#FFF1E8', '#1D2B53', (1 - day) * 0.7);
    for (let x = 0; x < W; x += 3) {
      const y = Math.round(top + (vnoise(x / 14 + this.clock * 0.05, 61) - 0.5) * 22);
      g.globalAlpha = 0.9;
      g.fillRect(x, y, 3, Math.max(0, bottom - y));
    }
    g.globalAlpha = 1;
  }

  drawWall(g, snow) {
    const view = Math.round(this.view);
    const snowCover = clamp(0.15 + (this.s.alt / SUMMIT) * 0.55 + snow * 0.4, 0, 1);
    const groundY = HERO_Y + view;
    for (let y = 0; y < H; y++) {
      const a = view + HERO_Y - y;
      if (a < 0 || a > SUMMIT + 60) continue;
      const edge = this.wallEdge(a);
      if (edge >= W) continue;
      let zone = a < 2400 ? 0 : a < 5800 ? 1 : 2;
      if (a > 2250 && a < 2550) zone = hash(a * 3) < (a - 2250) / 300 ? 1 : 0;
      if (a > 5650 && a < 5950) zone = hash(a * 5) < (a - 5650) / 300 ? 2 : 1;
      g.drawImage(this.tiles[zone], 0, ((a % 256) + 256) % 256, W - edge, 1, edge, y, W - edge, 1);
      g.fillStyle = PALETTE[7];
      g.fillRect(edge, y, 1, 1);
      const depth = Math.floor(snowCover * (1 + 4 * hash(a * 7 + 1)));
      if (depth > 0) g.fillRect(edge + 1, y, depth, 1);
    }
    // Sol du camp de base
    if (groundY < H) {
      g.fillStyle = '#DDE6F0'; g.fillRect(0, groundY, W, H - groundY);
      g.fillStyle = '#9DB8D6'; g.fillRect(0, groundY, W, 2);
      g.fillStyle = '#6E8DB3'; g.fillRect(0, groundY + 6, W, H);
    }
    // Repères d'altitude tous les 500 m
    const lo = Math.max(500, Math.ceil((view - 100) / 500) * 500);
    for (let a = lo; a <= view + HERO_Y + 8; a += 500) {
      const y = Math.round(this.ys(a));
      const x = this.wallEdge(a) - 10;
      g.fillStyle = PALETTE[7];
      g.fillRect(x, y, 10, 1);
      drawNumber(g, a, x - 4 * String(a).length, y - 2, PALETTE[7]);
    }
  }

  drawProps(g) {
    const s = this.s;
    for (const a of s.camps) {
      if (this.sleep && Math.abs(a - s.alt) < 40) continue;
      const y = this.ys(a);
      if (y < -20 || y > H + 20) continue;
      g.drawImage(spriteCanvas('tent'), this.wallEdge(a) - 16, Math.round(y) - 15);
    }
    CACHE_ALTS.forEach((a, i) => {
      if (s.caches.includes(i)) return;
      const y = Math.round(this.ys(a));
      if (y < -10 || y > H + 10) return;
      const x = this.wallEdge(a) - 7;
      g.fillStyle = PALETTE[9]; g.fillRect(x, y - 6, 6, 6);
      g.fillStyle = PALETTE[4]; g.fillRect(x, y - 6, 6, 1); g.fillRect(x + 2, y - 4, 2, 2);
    });
    const fy = this.ys(SUMMIT);
    if (fy > -20 && fy < H + 20) g.drawImage(spriteCanvas('flag'), this.wallEdge(SUMMIT) - 12, Math.round(fy) - 14);
  }

  drawHero(g, wind) {
    const s = this.s;
    const x = Math.round(this.heroX - wind * 2 * Math.sin(this.clock * 6));
    const y = HERO_Y - 16;
    if (this.sleep) {
      g.drawImage(spriteCanvas('tent'), x - 4, y + 1);
      g.fillStyle = PALETTE[7];
      const z = Math.floor(this.clock * 2) % 3;
      g.fillRect(x + 6 + z * 3, y - 6 - z * 3, 3, 1); g.fillRect(x + 7 + z * 3, y - 5 - z * 3, 1, 1); g.fillRect(x + 6 + z * 3, y - 4 - z * 3, 3, 1);
      return;
    }
    if (this.fall) {
      const t = this.fall.t;
      g.save();
      g.translate(x + 8 - t * 22, y + 8);
      g.rotate(t * 9);
      g.drawImage(spriteCanvas('heroA'), -8, -8);
      g.restore();
      return;
    }
    const bob = this.clock - this.lastStep < 0.12 ? -1 : 0;
    g.drawImage(spriteCanvas(this.grip ? 'heroA' : this.frame ? 'heroB' : 'heroA'), x, y + bob);
    if (this.gust.warn > 0) {
      g.fillStyle = PALETTE[8];
      if (Math.floor(this.clock * 8) % 2) { g.fillRect(x + 6, y - 14, 3, 8); g.fillRect(x + 6, y - 4, 3, 3); }
    }
    if (s.warmth < 25 && Math.floor(this.clock * 6) % 2) {
      g.fillStyle = PALETTE[12]; g.fillRect(x + 2, y + 1, 1, 2); g.fillRect(x + 10, y + 4, 1, 2);
    }
  }

  drawWeather(g, wind, snow) {
    const dt = 1 / 60;
    const n = snow > 0.02 ? Math.floor(8 + 142 * snow) : 0;
    g.fillStyle = PALETTE[7];
    for (let i = 0; i < n; i++) {
      const f = this.flakes[i];
      f.y += (30 + 70 * snow) * f.v * dt;
      f.x -= (8 + 150 * wind) * f.v * dt;
      if (f.y > H) { f.y = -2; f.x = Math.random() * (W + 60); }
      if (f.x < -2) { f.x = W + 2; f.y = Math.random() * H; }
      g.fillRect(Math.round(f.x), Math.round(f.y), f.v > 1.2 ? 2 : 1, f.v > 1.2 ? 2 : 1);
    }
    if (wind > 0.3) {
      g.globalAlpha = 0.35 + wind * 0.3;
      for (const st of this.streaks) {
        st.x -= (150 + 250 * wind) * dt;
        if (st.x < -st.l) { st.x = W + 10; st.y = Math.random() * H; }
        g.fillRect(Math.round(st.x), Math.round(st.y), Math.round(st.l * (0.5 + wind)), 1);
      }
      g.globalAlpha = 1;
    }
    const fog = snow * wind * 0.4;
    if (fog > 0.02) { g.fillStyle = `rgba(240,245,255,${fog.toFixed(3)})`; g.fillRect(0, 0, W, H); }
  }

  drawNight(g, day) {
    const dark = 1 - day;
    const sleeping = !!this.sleep;
    if (dark > 0.02) {
      const n = this.night.getContext('2d');
      n.globalCompositeOperation = 'source-over';
      n.clearRect(0, 0, W, H);
      n.fillStyle = `rgba(4,6,28,${(dark * 0.68).toFixed(3)})`;
      n.fillRect(0, 0, W, H);
      n.globalCompositeOperation = 'destination-out';
      const cx = this.heroX + 8, cy = HERO_Y - 10;
      const r = sleeping ? 70 : 55;
      const grad = n.createRadialGradient(cx, cy, 4, cx, cy, r);
      grad.addColorStop(0, 'rgba(0,0,0,0.95)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      n.fillStyle = grad;
      n.fillRect(0, 0, W, H);
      g.drawImage(this.night, 0, 0);
    }
    const cold = clamp(1 - this.s.warmth / 35, 0, 1);
    if (cold > 0.02) {
      const grad = g.createRadialGradient(W / 2, H / 2, 70, W / 2, H / 2, 210);
      grad.addColorStop(0, 'rgba(120,200,255,0)');
      grad.addColorStop(1, `rgba(120,200,255,${(cold * 0.55).toFixed(3)})`);
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
    }
  }
}
