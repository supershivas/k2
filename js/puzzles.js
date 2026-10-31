// Mini-puzzles de l'ascension, dans une fenêtre à écran Game Boy :
//  - « read »   : lire la paroi et choisir l'itinéraire le plus sûr ;
//  - « timing » : poser le pied au bon moment sur une vire étroite ;
//  - « repair » : remettre le tuyau du réchaud dans le bon sens.
// runPuzzle() rend { ok, quality } ou null si la fenêtre a été suspendue (retour à l'accueil).
import { PALETTE as P } from './sprites.js?v=1.7.0';
import { drawText } from './pixfont.js?v=1.7.0';

const $ = id => document.getElementById(id);
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

function rng(seed) {
  let n = seed >>> 0 || 1;
  return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; };
}

export const PUZZLE_INFO = {
  read: { title: 'Lire la paroi', text: 'Trois itinéraires. Les fissures donnent de bonnes prises ; la glace, la neige soufflée et les cailloux sont dangereux. Choisis le plus sûr.' },
  timing: { title: 'Équilibre', text: 'Une vire étroite. Appuie quand le curseur est dans la zone claire pour poser le pied. Deux réussites sur trois suffisent.' },
  repair: { title: 'Réchaud bouché', text: 'Touche les tuyaux pour les faire pivoter : relie la cartouche (à gauche) au brûleur (à droite).' },
};

export function runPuzzle(spec, env) {
  const dlg = $('puzzle');
  const info = PUZZLE_INFO[spec.type];
  $('pz-title').textContent = info.title;
  $('pz-text').textContent = info.text;
  const actions = $('pz-actions');
  actions.replaceChildren();
  const cv = $('pz-canvas');
  const g = cv.getContext('2d');
  g.fillStyle = P[3]; g.fillRect(0, 0, 160, 144);
  const cleanups = [];
  return new Promise(resolve => {
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      cleanups.forEach(fn => fn());
      if (dlg.open) dlg.close();
      resolve(result);
    };
    dlg.addEventListener('cancel', e => e.preventDefault(), { once: false });
    dlg.addEventListener('close', () => {
      if (!settled) { settled = true; cleanups.forEach(fn => fn()); resolve(null); } // fermé sans réponse (retour à l'accueil) : le puzzle reste en attente
    }, { once: true });
    const button = (label, fn, primary = false) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = `btn${primary ? ' btn-primary' : ''}`; b.textContent = label;
      b.addEventListener('click', fn);
      actions.append(b);
      return b;
    };
    const giveUp = () => button('Renoncer', () => finish({ ok: false, quality: 0 }));
    const done = (ok, quality, delay = 900) => setTimeout(() => finish({ ok, quality }), delay);
    if (spec.type === 'read') setupRead(spec, env, g, button, done);
    else if (spec.type === 'timing') setupTiming(spec, env, g, cv, button, done, cleanups);
    else setupRepair(spec, env, g, cv, button, done, cleanups);
    if (spec.type !== 'timing') giveUp();
    dlg.showModal();
  });
}

// ── Lecture de la paroi ──────────────────────────────────────────────────
function setupRead(spec, env, g, button, done) {
  const r = rng(spec.seed);
  const good = Math.floor(r() * 3);
  const hazards = ['ice', 'slab', 'rock'].sort(() => r() - 0.5);
  const routes = [0, 1, 2].map(i => (i === good ? { hazard: null, cracks: true } : { hazard: hazards.pop(), cracks: r() < 0.5 }));
  if (routes.every((rt, i) => i === good || !rt.cracks)) routes[(good + 1) % 3].cracks = true; // la bonne réponse n'est pas « la seule avec fissures »
  const hint = env.easy ? [0, 1, 2].filter(i => i !== good)[Math.floor(r() * 2)] : -1;
  let answered = false;

  g.fillStyle = P[1]; g.fillRect(0, 0, 160, 144);
  for (let i = 0; i < 260; i++) { g.fillStyle = r() < 0.3 ? P[2] : P[0]; g.fillRect(Math.floor(r() * 160), Math.floor(r() * 110), 2 + Math.floor(r() * 5), 1); }
  routes.forEach((rt, i) => {
    const x0 = 8 + i * 50, w = 44, y0 = 8, h = 100;
    g.fillStyle = P[0]; g.fillRect(x0 - 1, y0 - 1, w + 2, h + 2);
    g.fillStyle = P[1]; g.fillRect(x0, y0, w, h);
    if (rt.hazard === 'ice') {
      g.fillStyle = P[3]; g.fillRect(x0 + 6, y0 + 20, w - 12, 44);
      g.fillStyle = P[2];
      for (let k = 0; k < 5; k++) for (let j = 0; j < 8; j++) g.fillRect(x0 + 10 + k * 6 + j, y0 + 26 + k * 8 - j, 1, 1);
    } else if (rt.hazard === 'slab') {
      g.fillStyle = P[3];
      for (let y = 0; y < 50; y++) for (let x = 0; x < w - 8; x++) if ((x + y) % 2 === 0) g.fillRect(x0 + 4 + x, y0 + 16 + y, 1, 1);
      g.fillStyle = P[0]; g.fillRect(x0 + 4, y0 + 14, w - 8, 2);
    } else if (rt.hazard === 'rock') {
      for (let k = 0; k < 16; k++) {
        g.fillStyle = k % 2 ? P[0] : P[2];
        g.fillRect(x0 + 4 + Math.floor(r() * (w - 10)), y0 + 10 + Math.floor(r() * 80), 3, 3);
      }
    }
    if (rt.cracks) {
      let x = x0 + w / 2 + Math.floor(r() * 8 - 4);
      for (let y = y0 + 4; y < y0 + h - 4; y++) {
        g.fillStyle = P[0]; g.fillRect(x, y, 2, 1);
        g.fillStyle = P[3]; g.fillRect(x + 2, y, 1, 1);
        if (r() < 0.3) x = Math.max(x0 + 4, Math.min(x0 + w - 6, x + (r() < 0.5 ? -1 : 1)));
      }
    }
    if (i === hint) {
      g.fillStyle = P[4];
      for (let k = 0; k < 24; k++) { g.fillRect(x0 + 10 + k, y0 + 30 + k, 2, 2); g.fillRect(x0 + 34 - k, y0 + 30 + k, 2, 2); }
    }
    g.fillStyle = P[0]; g.fillRect(x0 + w / 2 - 5, 116, 11, 11);
    drawText(g, 'ABC'[i], x0 + w / 2 - 1, 119, P[3]);
  });
  ['A', 'B', 'C'].forEach((l, i) => button(`Itinéraire ${l}`, () => {
    if (answered) return;
    answered = true;
    const ok = i === good;
    g.fillStyle = ok ? P[2] : P[4];
    g.fillRect(8 + i * 50, 126, 44, 12);
    drawText(g, ok ? 'BON CHOIX' : 'DANGER', 12 + i * 50, 130, P[0]);
    done(ok, ok ? 1 : 0);
  }, true));
}

// ── Équilibre ────────────────────────────────────────────────────────────
function setupTiming(spec, env, g, cv, button, done, cleanups) {
  const r = rng(spec.seed);
  let round = 0, hits = 0, t = 0, last = performance.now(), stopped = false, flash = 0;
  const results = [];
  const newRound = () => ({ c: 0.3 + r() * 0.4, w: (env.easy ? 0.27 : 0.2) - round * 0.025, speed: 0.55 + round * 0.25 });
  let zone = newRound();
  const pos = () => (Math.sin(t * zone.speed * Math.PI * 2) + 1) / 2;
  const draw = () => {
    g.fillStyle = P[3]; g.fillRect(0, 0, 160, 144);
    for (let y = 0; y < 144; y++) for (let x = (y % 2) * 2; x < 160; x += 4) if (y > 90) { g.fillStyle = P[2]; g.fillRect(x, y, 1, 1); }
    g.fillStyle = P[0]; g.fillRect(0, 60, 160, 14);
    g.fillStyle = P[1]; g.fillRect(0, 62, 160, 10);
    const zx = 10 + (zone.c - zone.w / 2) * 140, zw = zone.w * 140;
    g.fillStyle = P[2]; g.fillRect(zx, 58, zw, 18);
    g.fillStyle = P[3]; g.fillRect(zx + 2, 60, zw - 4, 14);
    const cx = Math.round(10 + pos() * 140);
    g.fillStyle = P[0]; g.fillRect(cx - 2, 50, 5, 34);
    g.fillStyle = flash > 0 ? P[4] : P[4]; g.fillRect(cx - 1, 52, 3, 30);
    for (let i = 0; i < 3; i++) { // les trois essais
      g.fillStyle = P[0]; g.fillRect(52 + i * 20, 104, 14, 14);
      g.fillStyle = results[i] === true ? P[4] : results[i] === false ? P[1] : P[2];
      g.fillRect(54 + i * 20, 106, 10, 10);
    }
    drawText(g, `ESSAI ${Math.min(round + 1, 3)}/3`, 54, 124, P[0]);
    if (flash > 0) drawText(g, flash === 2 ? 'BIEN' : 'GLISSE', 60, 24, P[0], 2);
  };
  const press = () => {
    if (stopped) return;
    const hit = Math.abs(pos() - zone.c) <= zone.w / 2;
    results.push(hit);
    if (hit) hits++;
    flash = hit ? 2 : 1;
    round++;
    if (round >= 3) { stopped = true; draw(); done(hits >= 2, hits / 3, 1000); return; }
    zone = newRound();
    setTimeout(() => { flash = 0; }, 450);
  };
  button('Poser le pied', press, true);
  button('Renoncer', () => { stopped = true; done(false, 0, 0); });
  const onKey = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); press(); } };
  document.addEventListener('keydown', onKey);
  cv.addEventListener('pointerdown', press);
  cleanups.push(() => { stopped = true; document.removeEventListener('keydown', onKey); cv.removeEventListener('pointerdown', press); });
  const loop = now => {
    if (stopped && round >= 3) return;
    if (!$('puzzle').open) return;
    t += (now - last) / 1000; last = now;
    draw();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// ── Réchaud : tuyaux à faire pivoter ─────────────────────────────────────
// Ouvertures en bits : N = 1, E = 2, S = 4, W = 8.
const rot = m => ((m << 1) | (m >> 3)) & 15;
const SHAPES = { I: 1 | 4, L: 1 | 2, T: 1 | 2 | 4 };

function setupRepair(spec, env, g, cv, button, done, cleanups) {
  const r = rng(spec.seed);
  const grid = Array.from({ length: 9 }, () => ({ m: [SHAPES.I, SHAPES.L, SHAPES.T][Math.floor(r() * 3)] }));
  // Chemin garanti de (0,0) à (2,2) : 2 pas à droite, 2 pas en bas, dans un ordre tiré au hasard.
  const moves = ['R', 'R', 'D', 'D'].sort(() => r() - 0.5);
  let cx = 0, cy = 0, prev = 8; // l'arrivée de la cartouche se fait par l'ouest de la première case
  moves.forEach((mv, i) => {
    const out = mv === 'R' ? 2 : 4;
    grid[cy * 3 + cx].m = prev | out;
    if (mv === 'R') cx++; else cy++;
    prev = mv === 'R' ? 8 : 1;
    if (i === 3) grid[cy * 3 + cx].m = prev | 2; // dernière case : vers le brûleur à l'est
  });
  // Brouillage : chaque case tourne de 1 à 3 quarts de tour (moins en mode facile)
  grid.forEach(c => { const n = 1 + Math.floor(r() * (env.easy ? 2 : 3)); for (let k = 0; k < n; k++) c.m = rot(c.m); });
  let solved = false;
  const reached = () => {
    const seen = new Set();
    if (!(grid[0].m & 8)) return seen;
    const todo = [0];
    while (todo.length) {
      const i = todo.pop();
      if (seen.has(i)) continue;
      seen.add(i);
      const x = i % 3, y = Math.floor(i / 3), m = grid[i].m;
      if (m & 2 && x < 2 && grid[i + 1].m & 8) todo.push(i + 1);
      if (m & 4 && y < 2 && grid[i + 3].m & 1) todo.push(i + 3);
      if (m & 1 && y > 0 && grid[i - 3].m & 4) todo.push(i - 3);
      if (m & 8 && x > 0 && grid[i - 1].m & 2) todo.push(i - 1);
    }
    return seen;
  };
  if (reached().has(8) && grid[8].m & 2) grid[0].m = rot(grid[0].m); // jamais résolu d'emblée
  const draw = () => {
    const on = reached();
    g.fillStyle = P[3]; g.fillRect(0, 0, 160, 144);
    const ox = 26, oy = 18, S = 36;
    for (let i = 0; i < 9; i++) {
      const x = ox + (i % 3) * S, y = oy + Math.floor(i / 3) * S, m = grid[i].m;
      g.fillStyle = P[0]; g.fillRect(x, y, S - 1, S - 1);
      g.fillStyle = P[2]; g.fillRect(x + 1, y + 1, S - 3, S - 3);
      const c = x + S / 2 - 1, d = y + S / 2 - 1, lit = on.has(i);
      const arm = (ax, ay, aw, ah) => {
        g.fillStyle = P[0]; g.fillRect(ax - 1, ay - 1, aw + 2, ah + 2);
        g.fillStyle = lit ? P[4] : P[3]; g.fillRect(ax, ay, aw, ah);
      };
      if (m & 1) arm(c - 3, y, 6, S / 2 - 1);
      if (m & 4) arm(c - 3, d, 6, S / 2 - 1);
      if (m & 8) arm(x, d - 3, S / 2 - 1, 6);
      if (m & 2) arm(c, d - 3, S / 2 - 1, 6);
      g.fillStyle = P[0]; g.fillRect(c - 4, d - 4, 9, 9);
      g.fillStyle = lit ? P[4] : P[3]; g.fillRect(c - 3, d - 3, 7, 7);
    }
    g.fillStyle = P[0]; g.fillRect(2, oy + 12, 22, 10);
    drawText(g, 'GAZ', 5, oy + 15, P[3]);
    g.fillRect(ox + 3 * S + 2, oy + 2 * S + 12, 26, 10);
    drawText(g, 'FEU', ox + 3 * S + 4, oy + 2 * S + 15, on.has(8) && grid[8].m & 2 ? P[4] : P[3]);
    if (on.has(8) && grid[8].m & 2) {
      if (!solved) { solved = true; done(true, 1, 900); }
      drawText(g, 'BRANCHE', 52, 134, P[0]);
    }
  };
  cv.addEventListener('pointerdown', e => {
    if (solved) return;
    const b = cv.getBoundingClientRect();
    const x = Math.floor(((e.clientX - b.left) / b.width * 160 - 26) / 36), y = Math.floor(((e.clientY - b.top) / b.height * 144 - 18) / 36);
    if (x < 0 || y < 0 || x > 2 || y > 2) return;
    grid[y * 3 + x].m = rot(grid[y * 3 + x].m);
    draw();
  });
  draw();
}
