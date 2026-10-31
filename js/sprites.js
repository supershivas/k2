// Sprites en pixel art de taille libre (1 à 32 px par côté). Palette : 4 verts Game Boy + 1 rose fluo
// (index 0 à 4), -1 = transparent. Un sprite = { w, h, px }.
// Priorité de chargement : édition locale > sprites.json du dépôt > défauts.

import { store } from './store.js?v=1.5.0';

export const PALETTE = ['#0F380F', '#306230', '#8BAC0F', '#9BBC0F', '#FF3CAC'];

export const MAX_SIZE = 32;
export const REPO = 'supershivas/k2';

export const SPRITE_DEFS = [
  { id: 'heroA', label: 'Héros 1' },
  { id: 'heroB', label: 'Héros 2' },
  { id: 'heroP1', label: 'Dévers 1' },
  { id: 'heroP2', label: 'Dévers 2' },
  { id: 'heroW1', label: 'Marche 1' },
  { id: 'heroW2', label: 'Marche 2' },
  { id: 'tent', label: 'Tente' },
  { id: 'flag', label: 'Drapeau' },
  { id: 'grotte', label: 'Grotte' },
  { id: 'ration', label: 'Vivres' },
  { id: 'gaz', label: 'Gaz' },
  { id: 'piton', label: 'Pitons' },
  { id: 'corde', label: 'Corde' },
  { id: 'o2', label: 'Oxygène' },
  { id: 'relic', label: 'Relique' },
];

// Un caractère = un index de palette, « . » = transparent.
const ART = {
  heroA: [
    '..33............', '..4....0000.....', '..4...011110....', '..44..013310....',
    '...4..011110....', '...44.0044400...', '....444444444.4.', '...4441221444.4.',
    '...44411114434.2', '....441111441.2.', '....444444444.1.', '....004444400.1.',
    '.....444.444....', '.....44...44....', '.....11...111...', '....111...1111..',
  ],
  heroB: [
    '............33..', '.....0000....4..', '....011110...4..', '....013310..44..',
    '....011110..4...', '...0044400.44...', '.4.444444444....', '.4.4441221444...',
    '2.4344411114....', '.2.144111144....', '.1.444444444....', '.1.004444400....',
    '....444.444.....', '....44...44.....', '...111...11.....', '..1111...111....',
  ],
  // Vue de profil : suspendu sous un toit de roche, le visage tourné vers la droite.
  heroP1: [
    '....33......33..', '....44......44..', '.....44....44...', '.....44444.0110.',
    '....1.4444.1331.', '...11.44444.00..', '...11.44444.....', '...1..4444......',
    '.......444......', '.......444......', '......4.44......', '......4..44.....',
    '.....44...44....', '.....1.....1....', '.....11....11...', '................',
  ],
  heroP2: [
    '.....33....33...', '.....44....44...', '......44..44....', '......44444.0110',
    '.....1.4444.1331', '....11.44444.00.', '....11.44444....', '....1..4444.....',
    '........444.....', '........444.....', '.......44.4.....', '......44..4.....',
    '.....44....4....', '....11.....1....', '...11......11...', '................',
  ],
  // Vue de profil, tourné vers la droite, sac sur le dos, piolet en main.
  heroW1: [
    '................', '......0000......', '.....011110.....', '.....013310.....',
    '.....011110.....', '.....0044400....', '..11.4444444.2..', '.1111444444..2..',
    '.1111444444..2..', '..11.4444444.1..', '......44.44.....', '......44.44.....',
    '.....44...44....', '.....44...44....', '.....11...111...', '....111..1111...',
  ],
  heroW2: [
    '................', '......0000......', '.....011110.....', '.....013310.....',
    '.....011110.....', '.....0044400....', '..11.4444444.2..', '.1111444444..2..',
    '.1111444444..2..', '..11.4444444.1..', '.......4444.....', '.......444......',
    '......444.......', '.....44.44......', '....11...11.....', '...111...111....',
  ],
};

// Anciens dessins 8×8, doublés en 16×16 pour la résolution du jeu.
const ART8 = {
  tent: ['........', '...44...', '..4444..', '.444444.', '44411444', '44411444', '44411444', '11111111'],
  flag: ['14444...', '14444...', '1.......', '1.......', '1.......', '1.......', '1.......', '11111111'],
  ration: ['........', '.444444.', '.400004.', '.422224.', '.422224.', '.400004.', '.444444.', '........'],
  gaz: ['...4....', '..44....', '.444.4..', '.44444..', '.44344..', '.44444..', '..444...', '........'],
  piton: ['...44...', '...44...', '..4444..', '...44...', '...44...', '...44...', '...22...', '...11...'],
  corde: ['..4444..', '.4....4.', '4..44..4', '4.4..4.4', '4..44..4', '.4....4.', '..4444..', '........'],
  o2: ['...44...', '...44...', '..4444..', '..4334..', '..4334..', '..4334..', '..4444..', '........'],
};

function parse(rows) {
  return { w: rows[0].length, h: rows.length, px: rows.flatMap(row => [...row].map(c => (c === '.' ? -1 : +c))) };
}

export function upscale(sp, k = 2) {
  const w = sp.w * k, h = sp.h * k, px = new Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = sp.px[Math.floor(y / k) * sp.w + Math.floor(x / k)];
  return { w, h, px };
}

// Bouche de grotte (32×24) : arche sombre, liseré clair puis contour sombre pour rester lisible sur toute roche.
function makeCave() {
  const w = 32, h = 24, px = new Array(w * h).fill(-1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x - 15.5) / 16, ny = (y - 23) / 23.5;
      const d = nx * nx + ny * ny;
      let c = -1;
      if (d <= 0.4) c = y >= 20 ? 1 : 0;
      else if (d <= 0.52) c = 1;
      else if (d <= 0.82) c = y < 9 || (x + y) % 2 === 0 ? 3 : 2;
      else if (d <= 1) c = 0;
      px[y * w + x] = c;
    }
  }
  for (const [x, y] of [[15, 19], [16, 19], [15, 18]]) px[y * w + x] = 4; // réchaud allumé
  return { w, h, px };
}

// Relique : étoile à quatre branches, rose fluo, cœur clair.
function makeRelic() {
  const w = 16, h = 16, px = new Array(w * h).fill(-1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = Math.abs(x - 7.5) / 7.5, dy = Math.abs(y - 7.5) / 7.5;
      const d = Math.pow(dx, 0.66) + Math.pow(dy, 0.66);
      if (d <= 1) px[y * w + x] = d < 0.45 ? 3 : 4;
      else if (d <= 1.22 && d > 1) px[y * w + x] = 0;
    }
  }
  return { w, h, px };
}

export const DEFAULTS = {
  relic: makeRelic(),
  ...Object.fromEntries(Object.entries(ART).map(([id, rows]) => [id, parse(rows)])),
  ...Object.fromEntries(Object.entries(ART8).map(([id, rows]) => [id, upscale(parse(rows))])),
  grotte: makeCave(),
};

let sprites = clone(DEFAULTS);
let userEdits = {}; // sprites modifiés localement (seuls ceux-là sont exportés / publiés en priorité)
const cache = {};
const listeners = new Set();

function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

function isValidSprite(sp) {
  return !!sp && Number.isInteger(sp.w) && Number.isInteger(sp.h)
    && sp.w >= 1 && sp.h >= 1 && sp.w <= MAX_SIZE && sp.h <= MAX_SIZE
    && Array.isArray(sp.px) && sp.px.length === sp.w * sp.h
    && sp.px.every(v => Number.isInteger(v) && v >= -1 && v < PALETTE.length);
}

// Accepte l'ancien format (tableau de 64 valeurs, 8×8) en le doublant en 16×16.
function normalize(raw) {
  if (Array.isArray(raw) && raw.length === 64) {
    const sp = upscale({ w: 8, h: 8, px: raw });
    return isValidSprite(sp) ? sp : null;
  }
  return isValidSprite(raw) ? { w: raw.w, h: raw.h, px: raw.px.slice() } : null;
}

function sanitize(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const { id } of SPRITE_DEFS) {
    const sp = normalize(obj[id]);
    if (sp) out[id] = sp;
  }
  return out;
}

export function onSpritesChange(fn) { listeners.add(fn); }
function notify() { listeners.forEach(fn => fn()); }

export function getSprite(id) { return sprites[id]; }
export function getUserEdits() { return clone(userEdits); }
export function getAllSprites() { return clone(sprites); }

export function setSprite(id, sp) {
  if (!isValidSprite(sp)) return;
  sprites[id] = { w: sp.w, h: sp.h, px: sp.px.slice() };
  userEdits[id] = clone(sprites[id]);
  delete cache[id];
  store.save('sprites', userEdits);
  notify();
}

export function resetSprite(id) {
  sprites[id] = clone(DEFAULTS[id]);
  delete userEdits[id];
  delete cache[id];
  if (Object.keys(userEdits).length) store.save('sprites', userEdits); else store.clear('sprites');
  notify();
}

export function resetAllSprites() {
  sprites = clone(DEFAULTS);
  userEdits = {};
  for (const k of Object.keys(cache)) delete cache[k];
  store.clear('sprites');
  notify();
}

// Canvas aux dimensions du sprite, prêt à être dessiné (mis en cache).
export function spriteCanvas(id) {
  if (cache[id]) return cache[id];
  const sp = sprites[id];
  const c = document.createElement('canvas');
  c.width = sp.w; c.height = sp.h;
  paintSprite(c.getContext('2d'), sp);
  cache[id] = c;
  return c;
}

export function paintSprite(ctx, sp) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  sp.px.forEach((v, i) => {
    if (v < 0) return;
    ctx.fillStyle = PALETTE[v];
    ctx.fillRect(i % sp.w, Math.floor(i / sp.w), 1, 1);
  });
}

// Au démarrage : défauts, puis sprites.json du dépôt, puis édition locale.
export async function loadSprites() {
  try {
    const res = await fetch('sprites.json', { cache: 'no-store' });
    if (res.ok) Object.assign(sprites, sanitize(await res.json()));
  } catch { /* pas de sprites.json publié : défauts */ }
  try {
    const local = sanitize(store.load('sprites') || {});
    Object.assign(sprites, local);
    userEdits = local;
  } catch { /* édition locale illisible : ignorée */ }
  for (const k of Object.keys(cache)) delete cache[k];
  notify();
}

export function importSprites(obj) {
  const valid = sanitize(obj);
  for (const [id, data] of Object.entries(valid)) setSprite(id, data);
  return Object.keys(valid).length;
}

export function getToken() { return store.getSecret('github-token'); }
export function setToken(token) { store.setSecret('github-token', token); }

// Publie sprites.json dans le dépôt (le jeton reste dans ce navigateur, jamais commité).
export async function publishSprites(token) {
  const api = `https://api.github.com/repos/${REPO}/contents/sprites.json`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
  let sha;
  const current = await fetch(`${api}?ref=main`, { headers, cache: 'no-store' });
  if (current.ok) sha = (await current.json()).sha;
  else if (current.status !== 404) throw new Error(current.status === 401 ? 'Jeton refusé' : `GitHub ${current.status}`);
  const body = {
    message: 'Met à jour les sprites',
    content: btoa(JSON.stringify(getAllSprites())),
    branch: 'main',
    ...(sha ? { sha } : {}),
  };
  const res = await fetch(api, { method: 'PUT', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(res.status === 403 || res.status === 404 ? 'Jeton sans droit d’écriture sur le dépôt' : `GitHub ${res.status}`);
}
