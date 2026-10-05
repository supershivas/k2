import { Game, SUMMIT, newState } from './game.js';
import { PALETTE as P, loadSprites, getUserEdits, importSprites, getToken, setToken, publishSprites, resetAllSprites } from './sprites.js';
import { drawText } from './pixfont.js';
import { initEditor, openEditor } from './editor.js';
import { startUpdateCheck, loadChangelog, loadVersion, downloadJSON } from '../app-update.js';

const $ = id => document.getElementById(id);
const KEYS = { save: 'k2:save', records: 'k2:records' };

// ── Stockage local (préférences et progression, exportables en JSON) ──────
function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible */ }
}

let records = Object.assign({ maxAlt: 0, summits: 0, bestDays: 0 }, read(KEYS.records, {}));

// ── Tokens du design system ──────────────────────────────────────────────
async function applyTokens() {
  try {
    const t = await (await fetch('design-tokens.json')).json();
    const r = document.documentElement.style;
    const c = t.colors;
    r.setProperty('--accent', c.accentFixed); r.setProperty('--accent-hover', c.accentFixedHover); r.setProperty('--accent-fg', c.accentFixedFg);
    r.setProperty('--bg', c.sidebarBg); r.setProperty('--fg', c.sidebarFg); r.setProperty('--muted', c.sidebarMuted);
    r.setProperty('--icon', c.sidebarIcon); r.setProperty('--hover', c.sidebarHover); r.setProperty('--selected', c.sidebarSelected);
    r.setProperty('--selected-fg', c.sidebarSelectedFg); r.setProperty('--border', c.sidebarBorder);
    r.setProperty('--radius-sm', t.radii.sm); r.setProperty('--radius-md', t.radii.md); r.setProperty('--radius-lg', t.radii.lg);
    r.setProperty('--font-sans', t.fonts.sans); r.setProperty('--font-title', t.fonts.title); r.setProperty('--font-mono', t.fonts.mono);
    r.setProperty('--overlay', t.modal.overlayBackground);
  } catch { /* les valeurs par défaut du CSS suffisent */ }
}

// ── Toast et messages ────────────────────────────────────────────────────
let toastTimer;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  try { if (!el.matches(':popover-open')) el.showPopover(); } catch { /* popover non supporté */ }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { try { el.hidePopover(); } catch { /* idem */ } }, 3200);
}

let msgTimer;
function say(text, tone) {
  const el = $('msg');
  el.textContent = text;
  el.className = `msg show ${tone || ''}`;
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ── Confirmation (jamais window.confirm) ─────────────────────────────────
function confirmDialog(title, text, okLabel = 'Confirmer', cancelLabel = 'Annuler') {
  return new Promise(resolve => {
    const dlg = $('confirm');
    $('cf-title').textContent = title;
    $('cf-text').textContent = text;
    $('cf-yes').textContent = okLabel;
    $('cf-no').textContent = cancelLabel;
    let result = false;
    const done = v => { result = v; dlg.close(); };
    const yes = () => done(true), no = () => done(false);
    $('cf-yes').addEventListener('click', yes, { once: true });
    $('cf-no').addEventListener('click', no, { once: true });
    dlg.addEventListener('close', () => {
      $('cf-yes').removeEventListener('click', yes);
      $('cf-no').removeEventListener('click', no);
      resolve(result);
    }, { once: true });
    dlg.showModal();
  });
}

// ── Jeu ──────────────────────────────────────────────────────────────────
const game = new Game($('game'), {
  say,
  summit: onSummit,
});

function save() { write(KEYS.save, game.s); }
function saveRecords() { write(KEYS.records, records); }

function fmt(n) { return Math.round(n).toLocaleString('fr-FR'); }

function updateRecords() {
  records.maxAlt = Math.max(records.maxAlt, Math.round(game.s.alt));
}

function onSummit() {
  records.summits++;
  const days = Math.floor(game.s.min / 1440) + 1;
  records.bestDays = records.bestDays ? Math.min(records.bestDays, days) : days;
  updateRecords();
  saveRecords();
  save();
  confirmDialog(`Sommet du K2 : ${fmt(SUMMIT)} m`, `Tu y es arrivé en ${days} jour${days > 1 ? 's' : ''}, avec ${game.s.falls} chute${game.s.falls > 1 ? 's' : ''}. Seul face aux éléments, tu as gagné.`, 'Nouvelle ascension', 'Rester au sommet')
    .then(again => { if (again) newClimb(); else showHome(); });
}

function newClimb() {
  game.load(newState());
  save();
  showHome();
}

function renderHome() {
  const s = game.s;
  $('btn-play-label').textContent = s.steps > 0 && !s.summit ? `Continuer · ${fmt(s.alt)} m` : 'Grimper';
  const bits = [];
  if (records.maxAlt) bits.push(`Record ${fmt(records.maxAlt)} m`);
  if (records.summits) bits.push(`${records.summits} sommet${records.summits > 1 ? 's' : ''}`);
  $('records').textContent = bits.join(' · ');
}

function showHome() {
  closeAllDialogs();
  game.playing = false;
  game.grip = false;
  $('home').hidden = false;
  document.body.classList.add('paused');
  renderHome();
}

function play() {
  $('home').hidden = true;
  document.body.classList.remove('paused');
  game.playing = true;
  if (game.s.steps === 0) say('Alterne Gauche / Droite. Deux fois pareil : traverser', 'info');
}

function closeAllDialogs() {
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
}

// ── HUD ──────────────────────────────────────────────────────────────────
function updateHud() {
  const s = game.s;
  $('h-alt').textContent = fmt(s.alt);
  const hour = (s.min % 1440) / 60;
  const hh = String(Math.floor(hour)).padStart(2, '0'), mm = String(Math.floor((hour % 1) * 60)).padStart(2, '0');
  const day = Math.floor(s.min / 1440) + 1;
  $('h-time').textContent = `J${day} ${hh}:${mm}`;
  $('h-temp').textContent = `${Math.round(game.temperature)}°`;
  $('h-sun').className = `ti ${game.daylight > 0.5 ? 'ti-sun' : 'ti-moon'}`;
  $('g-energy').style.width = `${s.energy}%`;
  $('g-warmth').style.width = `${s.warmth}%`;
  $('g-energy').parentElement.classList.toggle('low', s.energy < 20);
  $('g-warmth').parentElement.classList.toggle('low', s.warmth < 25);
  $('c-food').textContent = s.food;
  $('c-gas').textContent = s.gas;
  $('c-o2').textContent = s.o2 + (s.o2Sec > 0 ? '+' : '');
  $('chip-o2').classList.toggle('on', game.oxygenActive);
  const { wind, snow } = game.weather;
  $('chip-wind').hidden = wind < 0.3;
  $('chip-snow').hidden = snow < 0.15;
  $('b-o2').classList.toggle('on', s.o2On);
  $('b-grip').classList.toggle('on', game.grip);
}

// ── Radio météo (écran Game Boy) ─────────────────────────────────────────
function openRadio() {
  if (!game.playing || game.busy) return;
  game.setGrip(false);
  $('radio').showModal();
  drawRadio(game.forecast());
}

function drawRadio(fc) {
  const g = $('radio-screen').getContext('2d');
  g.fillStyle = P[3]; g.fillRect(0, 0, 160, 144);
  drawText(g, 'METEO', 6, 6, P[0], 2);
  drawText(g, `JOUR ${fc.day}`, 100, 8, P[1]);
  drawText(g, `A ${fc.alt} M`, 100, 15, P[1]);
  g.fillStyle = P[0]; g.fillRect(6, 24, 148, 1);
  const x0 = 12, colW = 17, base = 88, maxH = 48;
  fc.slots.forEach((sl, i) => {
    const x = x0 + i * colW;
    if (sl.dark) { g.fillStyle = P[2]; g.fillRect(x - 1, 30, colW - 1, base - 30); }
    const wh = Math.round(sl.wind * maxH), sh = Math.round(sl.snow * maxH);
    g.fillStyle = sl.wind > 0.6 ? P[4] : P[0]; g.fillRect(x + 1, base - wh, 6, wh);
    g.fillStyle = P[1]; g.fillRect(x + 8, base - sh, 6, sh);
    drawText(g, String(sl.h).padStart(2, '0'), x + 3, base + 4, P[0]);
  });
  g.fillStyle = P[0]; g.fillRect(6, base, 148, 1);
  g.fillRect(8, 105, 5, 5); g.fillStyle = P[1]; g.fillRect(50, 105, 5, 5);
  drawText(g, 'VENT', 16, 105, P[0]); drawText(g, 'NEIGE', 58, 105, P[0]);
  g.fillStyle = P[2]; g.fillRect(100, 105, 5, 5);
  drawText(g, 'NUIT', 108, 105, P[0]);
  const temps = fc.slots.map(sl => sl.T);
  drawText(g, `MIN ${Math.round(Math.min(...temps))}  MAX ${Math.round(Math.max(...temps))}`, 8, 116, P[0]);
  const w = Math.max(...fc.slots.map(sl => sl.wind)), n = Math.max(...fc.slots.map(sl => sl.snow));
  const verdict = w > 0.7 ? 'TEMPETE: RESTE AU CAMP' : w > 0.45 ? 'RAFALES: GARDE LA PRISE' : n > 0.5 ? 'NEIGE: PROGRESSION LENTE' : 'CALME: BON JOUR POUR GRIMPER';
  g.fillStyle = P[0]; g.fillRect(4, 128, 152, 12);
  drawText(g, verdict, 8, 132, P[3]);
}

// ── Boucle ───────────────────────────────────────────────────────────────
let prev = performance.now(), hudAt = 0, saveAt = 0;
function loop(now) {
  const dt = (now - prev) / 1000;
  prev = now;
  if (!document.querySelector('dialog[open]')) game.update(dt);
  game.render();
  if (now - hudAt > 100) { hudAt = now; updateHud(); }
  if (game.playing && now - saveAt > 2000) { saveAt = now; updateRecords(); save(); saveRecords(); }
  requestAnimationFrame(loop);
}

// ── Commandes ────────────────────────────────────────────────────────────
function press(el, fn) {
  el.addEventListener('pointerdown', e => { e.preventDefault(); fn(); });
  el.addEventListener('contextmenu', e => e.preventDefault());
}
press($('b-left'), () => game.step('L'));
press($('b-right'), () => game.step('R'));
press($('b-eat'), () => game.eat());
press($('b-o2'), () => game.toggleOxygen());
press($('b-camp'), () => game.camp());
$('b-radio').addEventListener('click', openRadio);
const gripBtn = $('b-grip');
gripBtn.addEventListener('pointerdown', e => { e.preventDefault(); gripBtn.setPointerCapture(e.pointerId); game.setGrip(true); });
['pointerup', 'pointercancel'].forEach(t => gripBtn.addEventListener(t, () => game.setGrip(false)));
gripBtn.addEventListener('contextmenu', e => e.preventDefault());

const keys = { ArrowLeft: 'L', q: 'L', a: 'L', ArrowRight: 'R', d: 'R' };
window.addEventListener('keydown', e => {
  if (e.target.closest?.('input, textarea') || document.querySelector('dialog[open]')) return;
  if (e.repeat && keys[e.key]) return;
  if (keys[e.key]) { game.step(keys[e.key]); e.preventDefault(); }
  else if (e.key === ' ' || e.key === 'ArrowDown') { game.setGrip(true); e.preventDefault(); }
  else if (e.key === 'e') game.eat();
  else if (e.key === 'o') game.toggleOxygen();
  else if (e.key === 'c') game.camp();
  else if (e.key === 'm') openRadio();
});
window.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'ArrowDown') game.setGrip(false); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { updateRecords(); save(); saveRecords(); game.setGrip(false); } });
window.addEventListener('pagehide', () => { updateRecords(); save(); saveRecords(); });

// ── Navigation et écrans ─────────────────────────────────────────────────
$('brand').addEventListener('click', e => { e.preventDefault(); showHome(); });
$('btn-play').addEventListener('click', play);
$('btn-editor').addEventListener('click', () => openEditor());
$('open-settings').addEventListener('click', openSettings);
document.querySelectorAll('dialog [data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
document.querySelectorAll('dialog.modal').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));
$('s-editor').addEventListener('click', () => { $('settings').close(); openEditor(); });
$('s-new').addEventListener('click', async () => {
  if (!await confirmDialog('Nouvelle ascension ?', 'Ta progression actuelle sera perdue. Tes records et tes sprites sont conservés.', 'Recommencer')) return;
  $('settings').close();
  newClimb();
  toast('Nouvelle ascension');
});

async function openSettings() {
  $('s-token').value = getToken();
  $('settings').showModal();
  const [version, entries] = await Promise.all([loadVersion(), loadChangelog()]);
  $('s-version').textContent = `v${version ?? '?'}`;
  const ul = $('s-changelog');
  ul.replaceChildren(...entries.map(en => {
    const li = document.createElement('li');
    const b = document.createElement('b');
    b.textContent = `v${en.version}`;
    li.append(b, ` · ${en.date}`);
    const inner = document.createElement('ul');
    en.changes.forEach(c => { const l = document.createElement('li'); l.textContent = c; inner.append(l); });
    li.append(inner);
    return li;
  }));
}

$('s-token').addEventListener('change', e => setToken(e.target.value.trim()));
$('s-publish').addEventListener('click', async () => {
  const token = $('s-token').value.trim();
  if (!token) { toast('Colle d’abord ton jeton GitHub'); return; }
  setToken(token);
  const btn = $('s-publish');
  btn.disabled = true;
  try {
    await publishSprites(token);
    toast('Sprites publiés : actifs partout dans environ une minute');
  } catch (err) {
    toast(`Échec de la publication : ${err.message}`);
  } finally {
    btn.disabled = false;
  }
});

$('s-export').addEventListener('click', async () => {
  updateRecords();
  const version = await loadVersion();
  downloadJSON({ app: 'k2', version, exportedAt: new Date().toISOString(), save: game.s, records, sprites: getUserEdits() }, 'k2-export.json');
});
$('s-import').addEventListener('click', () => $('s-file').click());
$('s-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'k2') throw new Error('Ce fichier n’est pas un export K2');
    if (data.save) { game.load(data.save); save(); }
    if (data.records) { records = Object.assign(records, data.records); saveRecords(); }
    if (data.sprites) importSprites(data.sprites);
    renderHome();
    toast('Export importé');
  } catch (err) {
    toast(`Import impossible : ${err.message}`);
  }
});

// ── Démarrage ────────────────────────────────────────────────────────────
initEditor({ confirm: confirmDialog });
applyTokens();
game.load(read(KEYS.save, newState()));
loadSprites();
showHome();
requestAnimationFrame(loop);
startUpdateCheck({ onUpdated: v => toast(`Mis à jour en v${v}`) });
