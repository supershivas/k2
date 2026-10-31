// Éditeur de sprites de taille libre : crayon, gomme, pot de peinture, pipette, miroir, annuler/rétablir,
// agrandissement ou réduction par chaque côté, et trames (damier, hachures, fusain…).
import { PALETTE, MAX_SIZE, SPRITE_DEFS, getSprite, setSprite, resetSprite, paintSprite } from './sprites.js?v=1.5.0';

const $ = id => document.getElementById(id);
const MIN_SIZE = 2;

let current = SPRITE_DEFS[0].id;
let sp = { w: 8, h: 8, px: [] };
let undoStack = [];
let redoStack = [];
let tool = 'pencil';
let color = 4;
let pattern = 'solid';
let drawing = false;
let last = null;
let confirmFn = async () => true;

// ── Trames ───────────────────────────────────────────────────────────────
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
function noise(x, y) {
  let n = Math.imul(x * 374761393 + y * 668265263, 0x85ebca6b);
  n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
const mod = (a, n) => ((a % n) + n) % n;

const PATTERNS = [
  { id: 'solid', label: 'Plein', on: () => true },
  { id: 'b75', label: 'Trame 75 %', on: (x, y) => BAYER[y % 4][x % 4] < 12 },
  { id: 'b50', label: 'Damier', on: (x, y) => BAYER[y % 4][x % 4] < 8 },
  { id: 'b25', label: 'Trame 25 %', on: (x, y) => BAYER[y % 4][x % 4] < 4 },
  { id: 'dots', label: 'Points', on: (x, y) => x % 3 === 1 && y % 3 === 1 },
  { id: 'lines', label: 'Lignes', on: (x, y) => y % 2 === 0 },
  { id: 'hatch', label: 'Hachures', on: (x, y) => mod(x + y, 3) === 0 },
  { id: 'cross', label: 'Contre-hachures', on: (x, y) => mod(x - y, 3) === 0 },
  { id: 'coal1', label: 'Fusain léger', on: (x, y) => noise(x, y) < 0.28 },
  { id: 'coal2', label: 'Fusain dense', on: (x, y) => noise(x, y) < 0.62 },
  { id: 'streak', label: 'Fusain strié', on: (x, y) => noise(x, Math.floor((y + noise(x, 0) * 9) / 3) + 77) < 0.5 },
];
const maskOf = () => PATTERNS.find(p => p.id === pattern).on;

export function initEditor({ confirm }) {
  confirmFn = confirm;
  const tabs = $('ed-tabs');
  SPRITE_DEFS.forEach(({ id, label }) => {
    const b = document.createElement('button');
    b.className = 'tab'; b.type = 'button'; b.role = 'tab'; b.textContent = label; b.dataset.id = id;
    b.addEventListener('click', () => select(id));
    tabs.append(b);
  });

  const pal = $('ed-palette');
  PALETTE.forEach((hex, i) => {
    const b = document.createElement('button');
    b.className = 'swatch'; b.type = 'button'; b.style.background = hex; b.dataset.color = i; b.setAttribute('aria-label', `Couleur ${i + 1}`);
    pal.append(b);
  });
  const clear = document.createElement('button');
  clear.className = 'swatch clear'; clear.type = 'button'; clear.dataset.color = -1; clear.setAttribute('aria-label', 'Transparent');
  pal.append(clear);
  pal.addEventListener('click', e => {
    const b = e.target.closest('.swatch');
    if (!b) return;
    color = +b.dataset.color;
    if (tool === 'eraser' || tool === 'picker') tool = 'pencil';
    refreshUi();
  });

  const pats = $('ed-patterns');
  PATTERNS.forEach(p => {
    const b = document.createElement('button');
    b.className = 'pattern'; b.type = 'button'; b.dataset.id = p.id; b.title = p.label; b.setAttribute('aria-label', p.label);
    const c = document.createElement('canvas');
    c.width = c.height = 12;
    const g = c.getContext('2d');
    g.fillStyle = PALETTE[3];
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) if (p.on(x, y)) g.fillRect(x, y, 1, 1);
    b.append(c);
    pats.append(b);
  });
  pats.addEventListener('click', e => {
    const b = e.target.closest('.pattern');
    if (b) { pattern = b.dataset.id; refreshUi(); }
  });

  $('ed-tools').addEventListener('click', e => {
    const b = e.target.closest('.tool');
    if (b) { tool = b.dataset.tool; refreshUi(); }
  });
  $('ed-undo').addEventListener('click', () => travel(undoStack, redoStack));
  $('ed-redo').addEventListener('click', () => travel(redoStack, undoStack));
  $('ed-flip').addEventListener('click', () => {
    snapshot();
    const { w } = sp;
    sp.px = sp.px.map((_, i) => sp.px[Math.floor(i / w) * w + (w - 1 - (i % w))]);
    commit();
  });
  $('ed-clear').addEventListener('click', () => { snapshot(); sp.px = sp.px.map(() => -1); commit(); });
  $('ed-reset').addEventListener('click', async () => {
    if (!await confirmFn('Revenir au sprite d’origine ?', 'Ton dessin pour ce sprite sera remplacé.', 'Remplacer')) return;
    resetSprite(current);
    load();
  });
  document.querySelectorAll('#ed-stage [data-side]').forEach(b => {
    b.addEventListener('click', () => resize(b.dataset.side, b.dataset.op === 'add' ? 1 : -1));
  });
  window.addEventListener('resize', () => { if ($('editor').open) fitBoard(); });

  const cv = $('ed-canvas');
  cv.addEventListener('pointerdown', e => {
    e.preventDefault();
    cv.setPointerCapture(e.pointerId);
    const p = cell(e);
    if (tool === 'picker') { color = sp.px[p.y * sp.w + p.x]; tool = color < 0 ? 'eraser' : 'pencil'; refreshUi(); return; }
    snapshot();
    if (tool === 'fill') { flood(p.x, p.y); commit(); return; }
    drawing = true; last = p;
    plot(p.x, p.y);
    render();
  });
  cv.addEventListener('pointermove', e => {
    if (!drawing) return;
    const p = cell(e);
    line(last, p);
    last = p;
    render();
  });
  const stop = () => { if (drawing) { drawing = false; commit(); } };
  cv.addEventListener('pointerup', stop);
  cv.addEventListener('pointercancel', stop);
}

export function openEditor(id) {
  $('editor').showModal();
  select(id || current);
}

function select(id) {
  current = id;
  load();
}

function load() {
  const s = getSprite(current);
  sp = { w: s.w, h: s.h, px: s.px.slice() };
  undoStack = []; redoStack = [];
  refreshUi();
  fitBoard();
  render();
}

// Taille de la planche : cases entières, dans la place disponible.
function fitBoard() {
  const stage = $('ed-stage');
  const avail = Math.max(120, stage.clientWidth - 2 * 48);
  const maxH = Math.max(160, window.innerHeight * 0.4);
  const cellPx = Math.max(4, Math.floor(Math.min(avail / sp.w, maxH / sp.h)));
  const board = $('ed-board');
  board.style.width = `${cellPx * sp.w}px`;
  board.style.height = `${cellPx * sp.h}px`;
  board.style.setProperty('--gw', sp.w);
  board.style.setProperty('--gh', sp.h);
  const cv = $('ed-canvas');
  cv.width = sp.w; cv.height = sp.h;
}

function refreshUi() {
  document.querySelectorAll('#ed-tabs .tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.id === current)));
  document.querySelectorAll('#ed-tools .tool').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
  document.querySelectorAll('#ed-palette .swatch').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.color === color && tool !== 'eraser')));
  document.querySelectorAll('#ed-patterns .pattern').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === pattern)));
  $('ed-undo').disabled = !undoStack.length;
  $('ed-redo').disabled = !redoStack.length;
  $('ed-size').textContent = `${sp.w} × ${sp.h}`;
  document.querySelectorAll('#ed-stage [data-side]').forEach(b => {
    const horizontal = b.dataset.side === 'left' || b.dataset.side === 'right';
    const n = horizontal ? sp.w : sp.h;
    b.disabled = b.dataset.op === 'add' ? n >= MAX_SIZE : n <= MIN_SIZE;
  });
}

function render() {
  const sibling = { heroA: 'heroB', heroB: 'heroA', heroP1: 'heroP2', heroP2: 'heroP1', heroW1: 'heroW2', heroW2: 'heroW1' }[current];
  for (const [id, data] of [['ed-prev1', sp], ['ed-prev2', sibling ? getSprite(sibling) : sp]]) {
    const c = $(id);
    if (c.width !== data.w || c.height !== data.h) { c.width = data.w; c.height = data.h; }
    paintSprite(c.getContext('2d'), data);
  }
  paintSprite($('ed-canvas').getContext('2d'), sp);
}

// Ajoute ou retire une ligne / colonne sur un côté.
function resize(side, delta) {
  const horizontal = side === 'left' || side === 'right';
  const n = horizontal ? sp.w : sp.h;
  if (n + delta < MIN_SIZE || n + delta > MAX_SIZE) return;
  snapshot();
  const { w, h, px } = sp;
  const rows = Array.from({ length: h }, (_, y) => px.slice(y * w, (y + 1) * w));
  if (side === 'top') { if (delta > 0) rows.unshift(new Array(w).fill(-1)); else rows.shift(); }
  else if (side === 'bottom') { if (delta > 0) rows.push(new Array(w).fill(-1)); else rows.pop(); }
  else if (side === 'left') rows.forEach(r => (delta > 0 ? r.unshift(-1) : r.shift()));
  else rows.forEach(r => (delta > 0 ? r.push(-1) : r.pop()));
  sp = { w: rows[0].length, h: rows.length, px: rows.flat() };
  fitBoard();
  commit();
}

function cell(e) {
  const r = e.currentTarget.getBoundingClientRect();
  return {
    x: Math.min(sp.w - 1, Math.max(0, Math.floor((e.clientX - r.left) / r.width * sp.w))),
    y: Math.min(sp.h - 1, Math.max(0, Math.floor((e.clientY - r.top) / r.height * sp.h))),
  };
}

function plot(x, y) {
  if (!maskOf()(x, y)) return;
  sp.px[y * sp.w + x] = tool === 'eraser' ? -1 : color;
}

function line(a, b) {
  let { x, y } = a;
  const dx = Math.abs(b.x - x), dy = -Math.abs(b.y - y);
  const sx = x < b.x ? 1 : -1, sy = y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    plot(x, y);
    if (x === b.x && y === b.y) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

// Remplit la zone de même couleur ; seule la trame choisie est peinte (le reste de la zone ne change pas).
function flood(x, y) {
  const target = sp.px[y * sp.w + x];
  const fill = tool === 'eraser' ? -1 : color;
  const on = maskOf();
  const seen = new Set();
  const todo = [[x, y]];
  while (todo.length) {
    const [cx, cy] = todo.pop();
    const k = cy * sp.w + cx;
    if (cx < 0 || cy < 0 || cx >= sp.w || cy >= sp.h || seen.has(k) || sp.px[k] !== target) continue;
    seen.add(k);
    todo.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  for (const k of seen) if (on(k % sp.w, Math.floor(k / sp.w))) sp.px[k] = fill;
}

const copy = s => ({ w: s.w, h: s.h, px: s.px.slice() });

function snapshot() {
  undoStack.push(copy(sp));
  if (undoStack.length > 50) undoStack.shift();
  redoStack = [];
}

function travel(from, to) {
  if (!from.length) return;
  to.push(copy(sp));
  sp = from.pop();
  fitBoard();
  commit();
}

function commit() {
  setSprite(current, sp);
  refreshUi();
  render();
}
