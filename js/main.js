// Cycle de vie du jeu : écran titre → partie → réglages ; plein écran, boucle à pas fixe, sauvegarde, debug.
import { Game, SUMMIT } from './game.js?v=1.7.0';
import { store, DEBUG } from './store.js?v=1.7.0';
import { createLoop } from './lib/loop.js?v=1.7.0';
import { createKeys, DIRECTIONS } from './lib/keys.js?v=1.7.0';
import { lockTypeahead } from './typeahead.js?v=1.7.0';
import { lockBrowserGestures, createPointer } from './lib/pointer.js?v=1.7.0';
import { autosave } from './lib/save.js?v=1.7.0';
import { startUpdateCheck, loadChangelog, loadVersion, downloadJSON } from './lib/app-update.js?v=1.7.0';
import { loadSprites, getToken, setToken, publishSprites, paintSprite, getSprite } from './sprites.js?v=1.7.0';
import { initBag, openBag } from './bag.js?v=1.7.0';
import { runPuzzle } from './puzzles.js?v=1.7.0';
import { initEditor, openEditor } from './editor.js?v=1.7.0';

const $ = id => document.getElementById(id);

let records = store.load('records');

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
// Relique trouvée : fenêtre avec son histoire
function showRelic(r) {
  const sp = getSprite('relic');
  const c = $('rl-icon');
  c.width = sp.w; c.height = sp.h;
  paintSprite(c.getContext('2d'), sp);
  $('rl-name').textContent = r.name;
  $('rl-text').textContent = `${r.year} · ${r.text}`;
  game.hold.L = game.hold.R = false;
  $('relic').showModal();
}

// Mini-puzzle en attente : s'ouvre dès que le jeu est en cours (et reprend après un retour à l'accueil)
let puzzleOpen = false;
async function openPuzzle() {
  const spec = game.puzzleSpec();
  if (!spec) { game.s.puzzle = null; return; }
  puzzleOpen = true;
  game.hold.L = game.hold.R = false;
  const res = await runPuzzle(spec, { easy: spec.easy });
  puzzleOpen = false;
  if (res) { game.finishPuzzle(res); save(); }
}

// Bandeau d'événement aléatoire (30 possibles, voir events.js)
let eventTimer;
function showEvent(ev) {
  const el = $('event');
  $('ev-icon').className = `ti ${ev.icon}`;
  $('ev-title').textContent = ev.title;
  $('ev-text').textContent = `${ev.text} (${ev.fx})`;
  el.className = `event show ${ev.bad ? 'bad' : ''}`;
  clearTimeout(eventTimer);
  eventTimer = setTimeout(() => el.classList.remove('show'), 5200);
}

// Graine d'une nouvelle ascension : hors de la logique du jeu (la logique n'utilise que le hasard à graine).
function newSeed() {
  if (DEBUG) {
    const v = new URLSearchParams(location.search).get('seed');
    if (v !== null && Number.isFinite(+v)) return +v;
  }
  return crypto.getRandomValues(new Uint32Array(1))[0] % 1e9;
}

const game = new Game($('game'), {
  say,
  event: showEvent,
  relic: showRelic,
  summit: onSummit,
});

function save() { store.save('save', game.snapshot()); }
function saveRecords() { store.save('records', records); }
function saveAll() { updateRecords(); save(); saveRecords(); }

function fmt(n) { return Math.round(n).toLocaleString('fr-FR'); }

function updateRecords() {
  records.maxAlt = Math.max(records.maxAlt, Math.round(game.s.alt));
}

function onSummit() {
  records.summits++;
  const days = Math.floor(game.s.min / 1440) + 1;
  records.bestDays = records.bestDays ? Math.min(records.bestDays, days) : days;
  saveAll();
  confirmDialog(`Sommet du K2 : ${fmt(SUMMIT)} m`, `Tu y es arrivé en ${days} jour${days > 1 ? 's' : ''}, avec ${game.s.falls} chute${game.s.falls > 1 ? 's' : ''}. Seul face aux éléments, tu as gagné.`, 'Nouvelle ascension', 'Rester au sommet')
    .then(again => { if (again) newClimb(); else showHome(); });
}

function newClimb(seed = newSeed()) {
  game.load(game.freshState(seed));
  save();
  showHome();
}

function renderHome() {
  const s = game.s;
  const going = s.steps > 0 && !s.summit;
  $('btn-play-label').textContent = going ? `Continuer · ${fmt(s.alt)} m` : 'Grimper';
  $('btn-new').hidden = !going;
  const bits = [];
  if (records.maxAlt) bits.push(`Record ${fmt(records.maxAlt)} m`);
  bits.push(`Niveau ${game.progress.level}`);
  if (records.summits) bits.push(`${records.summits} sommet${records.summits > 1 ? 's' : ''}`);
  $('records').textContent = bits.join(' · ');
}

function showHome() {
  closeAllDialogs();
  saveAll();
  game.playing = false;
  releaseHolds();
  $('event').classList.remove('show');
  $('home').hidden = false;
  document.body.classList.add('paused');
  renderHome();
}

// Plein écran sur navigateur mobile (là où l'API existe) ; une application installée l'est déjà.
function goFullscreen() {
  const standalone = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
  if (standalone || !matchMedia('(pointer: coarse)').matches || document.fullscreenElement) return;
  document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => { /* refusé : le navigateur reste en l'état */ });
}

function play() {
  $('home').hidden = true;
  document.body.classList.remove('paused');
  fit();
  game.playing = true;
  goFullscreen();
  if (game.s.steps === 0) say('Suis les prises roses : appuie du côté de la prochaine (main ou pied)', 'info');
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
  $('c-lvl').textContent = game.progress.level;
  $('chip-lvl').classList.toggle('pts', game.progress.points > 0);
  $('chip-o2').classList.toggle('on', game.oxygenActive);
  const { wind, snow } = game.weather;
  $('chip-wind').hidden = wind < 0.3;
  $('chip-snow').hidden = snow < 0.15;
  $('b-camp-label').textContent = game.nearCave() ? 'Grotte' : 'Camper';
  $('b-o2').classList.toggle('on', s.o2On);
  $('b-piton').classList.toggle('on', game.anchored);
  $('b-piton-label').textContent = `Piton ${s.pitonStock}`;
}

// Les boutons disent quel membre ils vont déplacer : la prochaine prise (main ou pied), ou l'esquive
const hintCache = { L: '', R: '' };
function updateMoveHints() {
  const away = Math.round(Math.abs(game.camOffset));
  $('b-recenter').hidden = !(game.scrolled && game.playing);
  $('rc-label').textContent = `${away} m ${game.camOffset < 0 ? 'plus bas' : 'plus haut'}`;
  const nm = game.playing ? game.nextMove() : null;
  const th = game.playing ? game.threat : null;
  for (const side of ['L', 'R']) {
    const btn = $(side === 'L' ? 'b-left' : 'b-right');
    let html = '', next = false;
    if (th && th.away === side) { html = 'esquive'; next = true; }
    else if (nm && nm.side === side) {
      html = nm.kind === 'hand' ? '<i class="ti ti-hand-grab"></i> main' : '<i class="ti ti-shoe"></i> pied';
      next = true;
    }
    if (hintCache[side] !== html) { hintCache[side] = html; $(side === 'L' ? 'h-left' : 'h-right').innerHTML = html; }
    btn.classList.toggle('next', next);
    btn.classList.toggle('dim', !next && !!(nm || th));
  }
}

// ── Plein écran : le canvas couvre tout l'écran, à l'échelle entière ─────
function fit() {
  const scr = $('screen');
  const dpr = window.devicePixelRatio || 1;
  const ctrl = $('controls').offsetHeight || 150;
  document.documentElement.style.setProperty('--ctrl-h', `${ctrl}px`);
  const r = game.resize(Math.round(scr.clientWidth * dpr), Math.round(scr.clientHeight * dpr), dpr, ctrl);
  const cv = $('game');
  cv.style.width = `${r.cssW}px`;
  cv.style.height = `${r.cssH}px`;
  cssPerMeter = (2 * r.scale) / dpr; // K = 2 px logiques par mètre
}
let cssPerMeter = 4;
window.addEventListener('resize', fit);
window.visualViewport?.addEventListener('resize', fit);
window.addEventListener('orientationchange', fit);

// ── Boucle à pas fixe (section 9) : pause sur modale ou perte de focus ────
const modalOpen = () => !!document.querySelector('dialog[open]');
let blurred = false, hudAt = 0, lastFrame = performance.now();
const ptrHold = { L: false, R: false }; // boutons à l'écran
const keys = createKeys({
  actions: { piton: ['p', ' ', 'ArrowDown'], eat: 'e', o2: 'o', camp: 'c', bag: 'i', meteo: 'm', map: 'k', lookUp: 'PageUp', lookDown: 'PageDown', recenter: 'Home' },
  onAction: name => {
    if (modalOpen()) return;
    if (name === 'piton') game.plantPiton();
    else if (name === 'eat') game.eat();
    else if (name === 'o2') game.toggleOxygen();
    else if (name === 'camp') game.camp();
    else if (name === 'bag') openBag('inv');
    else if (name === 'meteo') openBag('meteo');
    else if (name === 'map') openBag('map');
    else if (name === 'lookUp') game.scrollBy(30);
    else if (name === 'lookDown') game.scrollBy(-30);
    else if (name === 'recenter') game.recenter();
  },
});
lockTypeahead();

// Un pas à chaque appui d'une flèche (touche physique : ZQSD en AZERTY, WASD en QWERTY).
window.addEventListener('keydown', e => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || modalOpen()) return;
  if (DIRECTIONS.left.includes(e.code)) game.step('L');
  else if (DIRECTIONS.right.includes(e.code)) game.step('R');
});

function releaseHolds() {
  ptrHold.L = ptrHold.R = false;
  game.hold.L = game.hold.R = false;
  keys.clear();
}

const loop = createLoop({
  step: 1 / 60,
  update: dt => {
    if (modalOpen() || blurred) return;
    const ax = keys.axis().x;
    game.hold.L = ptrHold.L || ax < 0;
    game.hold.R = ptrHold.R || ax > 0;
    game.update(dt);
    if (game.playing && game.s.puzzle && !puzzleOpen) openPuzzle();
  },
  render: () => {
    const now = performance.now();
    game.frameDt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    game.render();
    updateMoveHints();
    if (now - hudAt > 100) { hudAt = now; updateHud(); }
  },
});

window.addEventListener('blur', () => { blurred = true; releaseHolds(); });
window.addEventListener('focus', () => { blurred = false; });
autosave(() => { if (game.playing) saveAll(); }, { everyMs: 2000 });

// ── Commandes à l'écran ──────────────────────────────────────────────────
function press(el, fn) {
  el.addEventListener('pointerdown', e => { e.preventDefault(); fn(); });
  el.addEventListener('contextmenu', e => e.preventDefault());
}
// Gauche / Droite : un pas à chaque appui ; maintenus, ils font marcher sur les pentes douces.
function holdButton(el, side) {
  el.addEventListener('pointerdown', e => { e.preventDefault(); ptrHold[side] = true; game.step(side); });
  el.addEventListener('contextmenu', e => e.preventDefault());
}
['pointerup', 'pointercancel'].forEach(t => window.addEventListener(t, () => { ptrHold.L = ptrHold.R = false; }));
holdButton($('b-left'), 'L');
holdButton($('b-right'), 'R');
press($('b-piton'), () => game.plantPiton());
press($('b-eat'), () => game.eat());
press($('b-o2'), () => game.toggleOxygen());
press($('b-camp'), () => game.camp());
$('b-bag').addEventListener('click', () => { if (game.playing) openBag(); });
lockBrowserGestures($('screen'));

// Caméra libre : glisser le doigt (ou la souris), molette, PageUp / PageDown — pour revoir le chemin parcouru.
const canLook = () => game.playing && game.mode === 'face' && !modalOpen();
let dragY = 0;
createPointer($('game'), {
  threshold: 8,
  onDragStart: p => { dragY = p.y; },
  onDrag: p => { if (canLook()) game.scrollBy((p.y - dragY) / cssPerMeter); dragY = p.y; },
  onWheel: ({ delta }) => { if (canLook()) game.scrollBy(-delta * 20); },
});
$('b-recenter').addEventListener('click', () => game.recenter());

// ── Navigation et écrans ─────────────────────────────────────────────────
$('btn-play').addEventListener('click', play);
$('btn-new').addEventListener('click', async () => {
  if (!await confirmDialog('Nouvelle ascension ?', 'Ta progression actuelle sera perdue. Tes records, talents, reliques et sprites sont conservés.', 'Recommencer')) return;
  newClimb();
  toast('Nouvelle ascension');
});
$('btn-editor').addEventListener('click', () => openEditor());
$('open-settings').addEventListener('click', openSettings);
document.querySelectorAll('dialog [data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
document.querySelectorAll('dialog.modal:not([data-sticky])').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));
$('s-editor').addEventListener('click', () => { $('settings').close(); openEditor(); });
$('s-title').addEventListener('click', () => { $('settings').close(); showHome(); });
if (document.fullscreenEnabled) $('s-fullscreen').hidden = false;
$('s-fullscreen').addEventListener('click', () => {
  $('settings').close();
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => toast('Plein écran refusé par le navigateur'));
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

$('s-export').addEventListener('click', () => {
  saveAll();
  downloadJSON(store.exportAll(), 'k2-sauvegarde.json');
});
$('s-import').addEventListener('click', () => $('s-file').click());
$('s-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    let dump = JSON.parse(await file.text());
    if (dump.app === 'k2') { // export d'avant la v1.5 : converti en entrées du stockage
      const wrap = data => ({ v: 1, data });
      dump = { game: 'k2', entries: {
        ...(dump.save && { save: wrap(dump.save) }), ...(dump.records && { records: wrap(dump.records) }),
        ...(dump.progress && { progress: wrap(dump.progress) }), ...(dump.sprites && { sprites: wrap(dump.sprites) }),
      } };
    }
    store.importAll(dump);
    await reloadFromStore();
    toast('Sauvegarde importée');
  } catch (err) {
    toast(`Import impossible : ${err.message}`);
  }
});

// Relit tout depuis le stockage (démarrage, import)
async function reloadFromStore() {
  records = store.load('records');
  game.progress.replace(store.load('progress') || {}, false);
  game.load(store.load('save') || game.freshState(newSeed()));
  await loadSprites();
  showHome();
}

// ── Mode debug : ?debug=1 (section 18) ───────────────────────────────────
async function installDebugMode() {
  const { installDebug } = await import('./lib/debug.js?v=1.7.0');
  const places = { base: { a: 0 } };
  game.walks.forEach(w => { places[`pente${w.id + 1}`] = { a: w.a - 3 }; });
  game.puzzles.forEach(p => { places[`puzzle${p.id + 1}`] = { a: p.a - 3 }; });
  [1200, 2300, 3400, 4500, 5600, 6700, 7700].forEach((a, i) => { places[`dever${i + 1}`] = { a: a - 3 }; });
  installDebug({
    state: () => ({ alt: game.s.alt, x: game.s.x, energy: game.s.energy, warmth: game.s.warmth, mode: game.mode, seed: game.s.seed, niveau: game.progress.level, pitons: game.s.pitonStock }),
    places,
    teleport: p => { game.s.alt = p.a; game.s.x = 50; game.view = p.a; game.hx = 50; game.s.ov = game.s.walk = null; },
    setTimeScale: s => loop.setTimeScale(s),
    setSeed: n => newClimb(n),
    reset: () => newClimb(),
    extra: { game },
  });
}

// ── Démarrage ────────────────────────────────────────────────────────────
initEditor({ confirm: confirmDialog });
initBag(game, updateHud);
game.load(store.load('save') || game.freshState(newSeed()));
fit();
loadSprites();
showHome();
loop.start();
if (DEBUG) installDebugMode();
startUpdateCheck({
  isBusy: () => game.playing && !modalOpen(),
  beforeReload: saveAll,
  onUpdated: v => toast(`Mis à jour en v${v}`),
});
