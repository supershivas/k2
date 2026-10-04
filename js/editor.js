// Éditeur de sprites 16×16 : crayon, gomme, pot de peinture, pipette, annuler/rétablir, miroir.
import { PALETTE, SIZE, SPRITE_DEFS, getSprite, setSprite, resetSprite, paintSprite } from './sprites.js';

const $ = id => document.getElementById(id);

let current = SPRITE_DEFS[0].id;
let pixels = [];
let undoStack = [];
let redoStack = [];
let tool = 'pencil';
let color = 8;
let drawing = false;
let last = null;
let confirmFn = async () => true;

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

  $('ed-tools').addEventListener('click', e => {
    const b = e.target.closest('.tool');
    if (b) { tool = b.dataset.tool; refreshUi(); }
  });
  $('ed-undo').addEventListener('click', () => travel(undoStack, redoStack));
  $('ed-redo').addEventListener('click', () => travel(redoStack, undoStack));
  $('ed-flip').addEventListener('click', () => {
    snapshot();
    pixels = pixels.map((_, i) => pixels[Math.floor(i / SIZE) * SIZE + (SIZE - 1 - (i % SIZE))]);
    commit();
  });
  $('ed-clear').addEventListener('click', () => { snapshot(); pixels = pixels.map(() => -1); commit(); });
  $('ed-reset').addEventListener('click', async () => {
    if (!await confirmFn('Revenir au sprite d’origine ?', 'Ton dessin pour ce sprite sera remplacé.', 'Remplacer')) return;
    resetSprite(current);
    load();
  });

  const cv = $('ed-canvas');
  cv.addEventListener('pointerdown', e => {
    e.preventDefault();
    cv.setPointerCapture(e.pointerId);
    const p = cell(e);
    if (tool === 'picker') { color = pixels[p.y * SIZE + p.x]; tool = color < 0 ? 'eraser' : 'pencil'; refreshUi(); return; }
    snapshot();
    if (tool === 'fill') { flood(p.x, p.y, color); commit(); return; }
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
  select(id || current);
  $('editor').showModal();
}

function select(id) {
  current = id;
  load();
}

function load() {
  pixels = getSprite(current).slice();
  undoStack = []; redoStack = [];
  refreshUi();
  render();
}

function refreshUi() {
  document.querySelectorAll('#ed-tabs .tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.id === current)));
  document.querySelectorAll('#ed-tools .tool').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
  document.querySelectorAll('#ed-palette .swatch').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.color === color && tool !== 'eraser')));
  $('ed-undo').disabled = !undoStack.length;
  $('ed-redo').disabled = !redoStack.length;
}

function render() {
  paintSprite($('ed-canvas').getContext('2d'), pixels);
  paintSprite($('ed-prev1').getContext('2d'), pixels);
  const other = SPRITE_DEFS.find(d => d.id === (current === 'heroA' ? 'heroB' : current === 'heroB' ? 'heroA' : current));
  paintSprite($('ed-prev2').getContext('2d'), other.id === current ? pixels : getSprite(other.id));
}

function cell(e) {
  const r = e.currentTarget.getBoundingClientRect();
  return {
    x: Math.min(SIZE - 1, Math.max(0, Math.floor((e.clientX - r.left) / r.width * SIZE))),
    y: Math.min(SIZE - 1, Math.max(0, Math.floor((e.clientY - r.top) / r.height * SIZE))),
  };
}

function plot(x, y) { pixels[y * SIZE + x] = tool === 'eraser' ? -1 : color; }

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

function flood(x, y, c) {
  const target = pixels[y * SIZE + x];
  const fill = tool === 'eraser' ? -1 : c;
  if (target === fill) return;
  const todo = [[x, y]];
  while (todo.length) {
    const [cx, cy] = todo.pop();
    if (cx < 0 || cy < 0 || cx >= SIZE || cy >= SIZE || pixels[cy * SIZE + cx] !== target) continue;
    pixels[cy * SIZE + cx] = fill;
    todo.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
}

function snapshot() {
  undoStack.push(pixels.slice());
  if (undoStack.length > 50) undoStack.shift();
  redoStack = [];
}

function travel(from, to) {
  if (!from.length) return;
  to.push(pixels.slice());
  pixels = from.pop();
  commit();
}

function commit() {
  setSprite(current, pixels);
  refreshUi();
  render();
}
