// Le sac : inventaire, météo (heure exacte matérialisée par une ligne) et carte de la montagne.
// Les écrans sont des canvas Game Boy dans la palette du jeu.
import { PALETTE as P } from './sprites.js';
import { drawText } from './pixfont.js';
import { OVERHANGS, SUMMIT } from './game.js';
import { BRANCHES, SKILLS, MAX_LEVEL, xpForLevel } from './progress.js';
import { RELICS } from './relics.js';

const $ = id => document.getElementById(id);
let game;
let tab = 'inv';
let day = 0;
let onChange;

export function initBag(g, changed) {
  game = g;
  onChange = changed;
  $('bag-tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (b) showTab(b.dataset.tab);
  });
  $('bag-skills').addEventListener('click', e => {
    const b = e.target.closest('[data-skill]');
    if (!b) return;
    const id = b.dataset.skill;
    if (game.progress.buy(id)) {
      game.onSkillBought(id);
      game.say(`Talent acquis : ${SKILLS.find(k => k.id === id).name}`, 'good');
      drawSkills();
      onChange?.();
    }
  });
  $('day-tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-day]');
    if (b) { day = +b.dataset.day; drawMeteo(); }
  });
}

export function openBag(which = tab) {
  if (!game.playing || game.busy) return;
  game.hold.L = game.hold.R = false;
  $('bag').showModal();
  showTab(which);
}

function showTab(which) {
  tab = which;
  document.querySelectorAll('#bag-tabs .tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === which)));
  $('bag-inv').hidden = which !== 'inv';
  $('bag-meteo').hidden = which !== 'meteo';
  $('bag-map').hidden = which !== 'map';
  $('bag-skills').hidden = which !== 'skills';
  $('bag-relics').hidden = which !== 'relics';
  if (which === 'inv') drawInventory();
  if (which === 'meteo') drawMeteo();
  if (which === 'map') drawMap();
  if (which === 'skills') drawSkills();
  if (which === 'relics') drawRelics();
}

// ── Inventaire ───────────────────────────────────────────────────────────
function drawInventory() {
  const s = game.s;
  const left = Math.max(0, Math.round(s.rope - game.deployed() - s.live));
  const rows = [
    ['ti-meat', 'Vivres', `${s.food} / 12`, 'Une ration rend 32 d’énergie', s.food < 1],
    ['ti-flame', 'Gaz', `${s.gas} / 8`, 'Pour chauffer le camp', s.gas < 1],
    ['ti-bottle', 'Oxygène', `${s.o2}${s.o2Sec > 0 ? ` + ${Math.ceil(s.o2Sec)} s` : ''}`, 'Utile au-dessus de 6 500 m', false],
    ['ti-anchor', 'Pitons', `${s.pitonStock}`, `${s.pitons.length} planté${s.pitons.length > 1 ? 's' : ''} sur la paroi`, s.pitonStock < 1],
    ['ti-ruler', 'Corde', `${left} m`, `${Math.round(game.deployed() + s.live)} m déroulés sur ${Math.round(s.rope)} m`, left < 20],
  ];
  const day = Math.floor(s.min / 1440) + 1;
  rows.push(['ti-clock', 'Expédition', `J${day}`, `${s.falls} chute${s.falls > 1 ? 's' : ''} · ${s.steps} pas · ${s.camps.length} camp${s.camps.length > 1 ? 's' : ''}`, false]);
  $('inv-list').replaceChildren(...rows.map(([icon, label, value, sub, low]) => {
    const li = document.createElement('li');
    li.className = low ? 'low' : '';
    const i = document.createElement('i'); i.className = `ti ${icon}`;
    const span = document.createElement('span');
    span.textContent = label;
    const small = document.createElement('small'); small.textContent = sub;
    span.append(small);
    const b = document.createElement('b'); b.textContent = value;
    li.append(i, span, b);
    return li;
  }));
}

// ── Météo ────────────────────────────────────────────────────────────────
function drawMeteo() {
  document.querySelectorAll('#day-tabs .tab').forEach(b => b.setAttribute('aria-selected', String(+b.dataset.day === day)));
  const fc = game.dayForecast(day);
  const g = $('radio-screen').getContext('2d');
  g.fillStyle = P[3]; g.fillRect(0, 0, 160, 144);
  drawText(g, 'METEO', 6, 6, P[0], 2);
  drawText(g, `JOUR ${fc.day}`, 100, 8, P[1]);
  drawText(g, `A ${fc.alt} M`, 100, 15, P[1]);
  g.fillStyle = P[0]; g.fillRect(6, 24, 148, 1);
  const x0 = 8, colW = 6, base = 88, maxH = 48;
  fc.slots.forEach((sl, i) => {
    const x = x0 + i * colW;
    if (sl.dark) { g.fillStyle = P[2]; g.fillRect(x, 30, colW, base - 30); }
    const wh = Math.round(sl.wind * maxH), sh = Math.round(sl.snow * maxH);
    g.fillStyle = sl.wind > 0.6 ? P[4] : P[0]; g.fillRect(x, base - wh, 3, wh);
    g.fillStyle = P[1]; g.fillRect(x + 3, base - sh, 3, sh);
  });
  g.fillStyle = P[0]; g.fillRect(6, base, 148, 1);
  for (const h of [0, 6, 12, 18]) {
    g.fillRect(x0 + h * colW, base, 1, 3);
    drawText(g, String(h).padStart(2, '0'), x0 + h * colW + 1, base + 5, P[0]);
  }
  g.fillRect(8, 105, 5, 5); g.fillStyle = P[1]; g.fillRect(50, 105, 5, 5);
  drawText(g, 'VENT', 16, 105, P[0]); drawText(g, 'NEIGE', 58, 105, P[0]);
  g.fillStyle = P[2]; g.fillRect(100, 105, 5, 5);
  drawText(g, 'NUIT', 108, 105, P[0]);
  const temps = fc.slots.map(sl => sl.T);
  drawText(g, `MIN ${Math.round(Math.min(...temps))}  MAX ${Math.round(Math.max(...temps))}`, 8, 116, P[0]);
  const w = Math.max(...fc.slots.map(sl => sl.wind)), n = Math.max(...fc.slots.map(sl => sl.snow));
  const verdict = w > 0.7 ? 'TEMPETE: RESTE AU CAMP' : w > 0.45 ? 'RAFALES: PLANTE UN PITON' : n > 0.5 ? 'NEIGE: PROGRESSION LENTE' : 'CALME: BON JOUR POUR GRIMPER';
  g.fillStyle = P[0]; g.fillRect(4, 128, 152, 12);
  drawText(g, verdict, 8, 132, P[3]);
  if (day === 0) { // la ligne de l'heure exacte
    const minutes = game.s.min % 1440;
    const x = Math.round(x0 + (minutes / 1440) * 24 * colW);
    g.fillStyle = P[4]; g.fillRect(x, 27, 1, base - 27 + 4);
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0'), mm = String(Math.floor(minutes % 60)).padStart(2, '0');
    const lx = Math.min(x - 8, 160 - 24 - 6);
    g.fillStyle = P[0]; g.fillRect(lx - 1, 26 - 0, 23, 0);
    g.fillStyle = P[4]; g.fillRect(lx - 1, 17, 23, 7);
    drawText(g, `${hh}:${mm}`, lx + 1, 18, P[0]);
    $('meteo-label').textContent = `Il est ${hh}:${mm} · ${Math.round(game.temperature)}° à ${Math.round(game.s.alt)} m`;
  } else $('meteo-label').textContent = 'Prévisions du lendemain à ton altitude';
}

// ── Carte ────────────────────────────────────────────────────────────────
function drawMap() {
  const s = game.s;
  const g = $('map-screen').getContext('2d');
  const top = 10, bottom = 188, span = bottom - top;
  const yOf = a => Math.round(bottom - (a / SUMMIT) * span);
  const xOf = x => Math.round(80 + (x - 50) * 0.8);
  g.fillStyle = P[3]; g.fillRect(0, 0, 160, 200);
  // La montagne : silhouette tramée
  for (let y = top; y <= bottom; y++) {
    const a = ((bottom - y) / span) * SUMMIT;
    const half = Math.round((game.faceHalf(a) / 80) * 58 + 3);
    g.fillStyle = P[1]; g.fillRect(80 - half, y, half * 2, 1);
    g.fillStyle = P[2];
    for (let x = 80 - half + (y % 2); x < 80 + half; x += 2) if ((x + y) % 4 === 0) g.fillRect(x, y, 1, 1);
    g.fillStyle = P[0]; g.fillRect(80 - half, y, 1, 1); g.fillRect(80 + half - 1, y, 1, 1);
  }
  g.fillStyle = P[0]; g.fillRect(0, bottom, 160, 1);
  // Repères d'altitude
  for (let a = 1000; a < SUMMIT; a += 1000) {
    const y = yOf(a);
    g.fillStyle = P[2]; for (let x = 18; x < 150; x += 4) g.fillRect(x, y, 2, 1);
    drawText(g, String(a / 1000) + 'K', 2, y - 2, P[0]);
  }
  const known = Math.min(SUMMIT, (s.top || 0) + 700);
  // Dévers, pentes, grottes, camps, pitons
  for (const o of OVERHANGS) {
    if (o.a > known) continue;
    const y = yOf(o.a);
    g.fillStyle = P[0]; g.fillRect(xOf(50) - 11, y - 1, 22, 3);
    g.fillStyle = P[3]; g.fillRect(xOf(50) - 11, y + 2, 22, 1);
  }
  for (const w of game.walks) {
    if (w.a > known) continue;
    const y = yOf(w.a), x = xOf(50);
    g.fillStyle = P[0];
    for (let k = 0; k < 14; k++) g.fillRect(x - 7 + (w.dir > 0 ? k : 13 - k), y - Math.floor(k * 0.4), 1, 2);
  }
  for (const c of game.cavesIn(0, SUMMIT)) {
    if (c.a > known) continue;
    const y = yOf(c.a), x = xOf(c.x);
    g.fillStyle = P[3]; g.fillRect(x - 3, y - 4, 7, 5);
    g.fillStyle = P[0]; g.fillRect(x - 2, y - 3, 5, 4); g.fillRect(x - 1, y - 4, 3, 1);
  }
  for (const c of s.camps) {
    if (c.cave !== undefined) continue;
    const y = yOf(c.a), x = xOf(c.x);
    g.fillStyle = P[0]; g.fillRect(x - 3, y, 7, 1); g.fillRect(x - 2, y - 1, 5, 1); g.fillRect(x - 1, y - 2, 3, 1); g.fillRect(x, y - 3, 1, 1);
    g.fillStyle = P[3]; g.fillRect(x, y - 1, 1, 1);
  }
  g.fillStyle = P[4];
  for (const p of s.pitons) g.fillRect(xOf(p.x), yOf(p.a), 2, 2);
  // Le sommet
  drawText(g, 'K2', 80 - 4, 3, P[0]);
  g.fillStyle = P[0]; g.fillRect(80, top - 1, 1, 5); g.fillRect(81, top - 1, 4, 3);
  // Inconnu au-dessus : brume tramée
  for (let y = top; y < yOf(known); y++) for (let x = 0; x < 160; x++) if ((x + y) % 2 === 0 && (y % 3 !== 0 || x % 4 === 0)) { g.fillStyle = P[3]; g.fillRect(x, y, 1, 1); }
  // Toi
  const hy = yOf(s.alt), hx = xOf(s.x);
  g.fillStyle = P[0]; g.fillRect(hx - 4, hy - 4, 9, 9);
  g.fillStyle = Math.floor(performance.now() / 400) % 2 ? P[4] : P[3]; g.fillRect(hx - 3, hy - 3, 7, 7);
  g.fillStyle = P[0]; g.fillRect(hx - 1, hy - 1, 3, 3);
  drawText(g, `${Math.round(s.alt)} M`, hx + 8 > 130 ? hx - 36 : hx + 8, hy - 2, P[0]);
}

// ── Talents ──────────────────────────────────────────────────────────────
function drawSkills() {
  const pr = game.progress;
  const root = $('bag-skills');
  root.replaceChildren();
  const head = document.createElement('div');
  const lvl = document.createElement('div');
  lvl.className = 'lvl';
  const next = pr.level < MAX_LEVEL ? `${pr.xp - xpForLevel(pr.level)} / ${xpForLevel(pr.level + 1) - xpForLevel(pr.level)} XP` : 'niveau max';
  lvl.innerHTML = '<span></span><span></span>';
  lvl.children[0].textContent = `Niveau ${pr.level}`;
  lvl.children[1].textContent = pr.points > 0 ? `${pr.points} point${pr.points > 1 ? 's' : ''} à dépenser` : next;
  const bar = document.createElement('div');
  bar.className = 'xpbar';
  const fill = document.createElement('div');
  fill.style.width = `${Math.round(pr.ratio * 100)}%`;
  bar.append(fill);
  head.append(lvl, bar);
  const cols = document.createElement('div');
  cols.className = 'branches';
  BRANCHES.forEach((br, bi) => {
    const col = document.createElement('div');
    col.className = 'branch';
    const h = document.createElement('h4');
    const ic = document.createElement('i'); ic.className = `ti ${br.icon}`;
    h.append(ic, br.name);
    col.append(h);
    SKILLS.slice(bi * 4, bi * 4 + 4).forEach(sk => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.skill = sk.id;
      const owned = pr.has(sk.id), can = pr.canBuy(sk.id);
      b.className = `skill${owned ? ' owned' : ''}${can ? ' can' : ''}`;
      b.disabled = !can;
      const t = document.createElement('b'); t.textContent = sk.name;
      b.append(t, sk.text);
      col.append(b);
    });
    cols.append(col);
  });
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.style.marginTop = '10px';
  hint.textContent = 'L’XP vient de la montée, des dévers, des pentes, des puzzles et des reliques. Un point de talent par niveau ; chaque talent demande le précédent de sa branche.';
  root.append(head, cols, hint);
}

// ── Reliques ─────────────────────────────────────────────────────────────
function drawRelics() {
  const pr = game.progress;
  const ul = document.createElement('ul');
  ul.className = 'relics';
  for (const r of RELICS) {
    const li = document.createElement('li');
    const found = pr.hasRelic(r.id);
    li.className = found ? '' : 'locked';
    const b = document.createElement('b');
    b.textContent = found ? `${r.name} (${r.year})` : `??? · vers ${r.a.toLocaleString('fr-FR')} m`;
    li.append(b, found ? r.text : 'Une relique de l’histoire de l’escalade t’attend sur la paroi.');
    ul.append(li);
  }
  const count = document.createElement('p');
  count.className = 'hint';
  count.style.marginBottom = '8px';
  count.textContent = `${pr.relics.length} / ${RELICS.length} reliques trouvées`;
  $('bag-relics').replaceChildren(count, ul);
}
