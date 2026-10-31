/* ─── Mode debug — partagé entre les jeux ──────────────────────────────────
   Source de vérité : supershivas/game-system/modules/debug.js
   Applique la section 18 de CONVENTIONS.md. Chargé SEULEMENT avec
   `?debug=1` dans l'adresse (sans le paramètre, le module n'est même pas
   chargé). Expose `window.__jeu`, l'interface des scripts de test, des
   captures et du harnais de playtest.

   Dans le jeu :
     const params = new URLSearchParams(location.search)
     if (params.has('debug')) {
       const { installDebug } = await import('./lib/debug.js?v=1.7.0')
       installDebug({
         state: () => ({ x: hero.x, y: hero.y, zone, pv }),   // l'état lisible
         places: { plage: { x: 10, y: 40 }, maison: { x: 300, y: 80 } },
         teleport: ({ x, y }) => { hero.x = x; hero.y = y },
         setTimeScale: s => loop.setTimeScale(s),
         setSeed: n => nouvellePartie(n),
         reset: () => nouvellePartie(),
         extra: { donnerTout: () => {...} },    // ce que le jeu ajoute
       })
     }
     // partout dans le jeu, même sans debug (ne coûte rien) :
     window.__jeu?.log('mort', { cause: 'loup' })

   Depuis la console ou un script Playwright :
     __jeu.state()  __jeu.events  __jeu.teleport('maison')  __jeu.timeScale(4)
     __jeu.setSeed(42)  __jeu.reset()  __jeu.fps  __jeu.lieux
   L'adresse accepte aussi `&seed=42` (lu par `seedFromUrl()`).
   Un petit panneau (FPS, état) s'affiche ; F9 le masque.
   ─────────────────────────────────────────────────────────────────────────── */

export function seedFromUrl(search = location.search) {
  const v = new URLSearchParams(search).get('seed');
  return v == null ? null : (Number.isFinite(+v) ? +v : v);
}

export function installDebug({
  name = '__jeu',
  state = () => ({}),
  places = {},
  teleport,
  setTimeScale,
  setSeed,
  reset,
  panel = true,
  extra = {},
} = {}) {
  const t0 = performance.now();
  const events = [];
  let scale = 1;
  let fps = 0, frames = 0, last = performance.now();

  const api = {
    events,
    log(type, data = {}) {
      events.push({ t: Math.round(performance.now() - t0), type, ...data });
      if (events.length > 5000) events.splice(0, events.length - 5000);
    },
    state: () => ({ ...state(), fps }),
    get fps() { return fps; },
    get lieux() { return Object.keys(places); },
    teleport(where) {
      const p = typeof where === 'string' ? places[where] : where;
      if (!p) throw new Error(`Lieu inconnu : ${where} (lieux : ${Object.keys(places).join(', ')})`);
      teleport?.(p, where);
      api.log('teleport', { lieu: typeof where === 'string' ? where : null, ...p });
      return api.state();
    },
    timeScale(s) {
      scale = s;
      setTimeScale?.(s);
      api.log('timeScale', { s });
      return s;
    },
    setSeed(n) { setSeed?.(n); api.log('seed', { seed: n }); },
    reset() { reset?.(); api.log('reset'); },
    ...extra,
  };
  window[name] = api;

  // Les erreurs sont des événements : le harnais et les testeurs les lisent
  window.addEventListener('error', e => api.log('erreur', { message: e.message, source: e.filename, ligne: e.lineno }));
  window.addEventListener('unhandledrejection', e => api.log('erreur', { message: String(e.reason) }));

  // FPS mesurés par le navigateur, indépendamment du jeu
  const count = now => {
    frames++;
    if (now - last >= 500) { fps = Math.round((frames * 1000) / (now - last)); frames = 0; last = now; }
    requestAnimationFrame(count);
  };
  requestAnimationFrame(count);

  if (panel) {
    const el = document.createElement('pre');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:fixed;left:4px;bottom:4px;z-index:9999;margin:0;padding:4px 6px;'
      + 'font:11px/1.3 ui-monospace,monospace;background:rgba(0,0,0,.7);color:#fff;pointer-events:none;'
      + 'max-width:60vw;white-space:pre-wrap';
    document.body.appendChild(el);
    const refresh = () => {
      let s;
      try { s = JSON.stringify(api.state(), (k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)); } catch { s = '?'; }
      el.textContent = `DEBUG ×${scale}  ${s}`;
    };
    setInterval(refresh, 250);
    window.addEventListener('keydown', e => { if (e.code === 'F9') el.hidden = !el.hidden; });
  }
  api.log('debug', { url: location.href });
  return api;
}
