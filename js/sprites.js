// Sprites 8×8 en pixel art. Palette : 4 verts Game Boy + 1 rose fluo (index 0 à 4),
// -1 = transparent. Priorité de chargement : édition locale > sprites.json du dépôt > défauts.

export const PALETTE = ['#0F380F', '#306230', '#8BAC0F', '#9BBC0F', '#FF3CAC'];

export const SIZE = 8;
export const REPO = 'supershivas/k2';

export const SPRITE_DEFS = [
  { id: 'heroA', label: 'Héros 1' },
  { id: 'heroB', label: 'Héros 2' },
  { id: 'tent', label: 'Tente' },
  { id: 'flag', label: 'Drapeau' },
  { id: 'ration', label: 'Vivres' },
  { id: 'gaz', label: 'Gaz' },
  { id: 'o2', label: 'Oxygène' },
];

// Un caractère = un index de palette, « . » = transparent.
const ART = {
  heroA: ['...11..2', '...11.42', '..4444.1', '..4004..', '..4004..', '..4444..', '..11.1..', '..1...1.'],
  heroB: ['2..11...', '24.11...', '1.4444..', '..4004..', '..4004..', '..4444..', '..1.11..', '.1...1..'],
  tent: ['........', '...44...', '..4444..', '.444444.', '44411444', '44411444', '44411444', '11111111'],
  flag: ['14444...', '14444...', '1.......', '1.......', '1.......', '1.......', '1.......', '11111111'],
  ration: ['........', '.444444.', '.400004.', '.422224.', '.422224.', '.400004.', '.444444.', '........'],
  gaz: ['...4....', '..44....', '.444.4..', '.44444..', '.44344..', '.44444..', '..444...', '........'],
  o2: ['...44...', '...44...', '..4444..', '..4334..', '..4334..', '..4334..', '..4444..', '........'],
};

function parse(rows) {
  return rows.flatMap(row => [...row].map(c => (c === '.' ? -1 : +c)));
}

export const DEFAULTS = Object.fromEntries(Object.entries(ART).map(([id, rows]) => [id, parse(rows)]));

const KEYS = { local: 'k2:sprites', token: 'k2:github-token' };

let sprites = clone(DEFAULTS);
let userEdits = {}; // sprites modifiés localement (seuls ceux-là sont exportés / publiés en priorité)
const cache = {};
const listeners = new Set();

function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, value) {
  try {
    if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
  } catch { /* stockage indisponible : l'édition reste en mémoire */ }
}

function isValidSprite(data) {
  return Array.isArray(data) && data.length === SIZE * SIZE
    && data.every(v => Number.isInteger(v) && v >= -1 && v < PALETTE.length);
}

function sanitize(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const { id } of SPRITE_DEFS) if (isValidSprite(obj[id])) out[id] = obj[id].slice();
  return out;
}

export function onSpritesChange(fn) { listeners.add(fn); }
function notify() { listeners.forEach(fn => fn()); }

export function getSprite(id) { return sprites[id]; }
export function getUserEdits() { return clone(userEdits); }
export function getAllSprites() { return clone(sprites); }

export function setSprite(id, data) {
  if (!isValidSprite(data)) return;
  sprites[id] = data.slice();
  userEdits[id] = data.slice();
  delete cache[id];
  storageSet(KEYS.local, JSON.stringify(userEdits));
  notify();
}

export function resetSprite(id) {
  sprites[id] = DEFAULTS[id].slice();
  delete userEdits[id];
  delete cache[id];
  storageSet(KEYS.local, Object.keys(userEdits).length ? JSON.stringify(userEdits) : null);
  notify();
}

export function resetAllSprites() {
  sprites = clone(DEFAULTS);
  userEdits = {};
  for (const k of Object.keys(cache)) delete cache[k];
  storageSet(KEYS.local, null);
  notify();
}

// Canvas 16×16 prêt à être dessiné (mis en cache).
export function spriteCanvas(id) {
  if (cache[id]) return cache[id];
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  paintSprite(c.getContext('2d'), sprites[id]);
  cache[id] = c;
  return c;
}

export function paintSprite(ctx, data) {
  ctx.clearRect(0, 0, SIZE, SIZE);
  data.forEach((v, i) => {
    if (v < 0) return;
    ctx.fillStyle = PALETTE[v];
    ctx.fillRect(i % SIZE, Math.floor(i / SIZE), 1, 1);
  });
}

// Au démarrage : défauts, puis sprites.json du dépôt, puis édition locale.
export async function loadSprites() {
  try {
    const res = await fetch('sprites.json', { cache: 'no-store' });
    if (res.ok) Object.assign(sprites, sanitize(await res.json()));
  } catch { /* pas de sprites.json publié : défauts */ }
  try {
    const local = sanitize(JSON.parse(storageGet(KEYS.local) || '{}'));
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

export function getToken() { return storageGet(KEYS.token) || ''; }
export function setToken(token) { storageSet(KEYS.token, token ? token : null); }

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
    content: btoa(JSON.stringify(getAllSprites(), null, 2)),
    branch: 'main',
    ...(sha ? { sha } : {}),
  };
  const res = await fetch(api, { method: 'PUT', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(res.status === 403 || res.status === 404 ? 'Jeton sans droit d’écriture sur le dépôt' : `GitHub ${res.status}`);
}
