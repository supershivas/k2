/* ─── Boucle à pas fixe — partagé entre les jeux ───────────────────────────
   Source de vérité : supershivas/game-system/modules/loop.js
   Applique la section 9 de CONVENTIONS.md : la simulation avance par pas
   fixes, découplée du rendu ; le jeu va à la même vitesse à 30, 60 ou 144
   images par seconde. Le retard rattrapé en une image est plafonné : sans
   ce plafond, une image longue fait simuler plus, donc dure plus, et la
   boucle s'emballe (Factokid).

   Module ES sans dépendance :
     import { createLoop } from './lib/loop.js?v=1.6.0'
     const loop = createLoop({
       update: dt => {},          // pas fixe, en secondes (1/60 par défaut)
       render: (alpha, fps) => {}, // alpha : fraction du pas suivant (0..1), pour interpoler
       step: 1 / 60,
       hidden: 'pause',           // onglet caché : 'pause' (défaut) ou 'simulate'
       catchUpMax: 5,             // 'simulate' : secondes rattrapées au plus au retour
     })
     loop.start(); loop.pause(); loop.resume(); loop.stop()
     loop.time        // temps de jeu écoulé, en secondes (suit pause et timeScale)
     loop.setTimeScale(4)   // le mode debug accélère le temps
   ─────────────────────────────────────────────────────────────────────────── */

const FRAME_CAP = 0.25; // secondes simulées au plus par image

export function createLoop({
  update,
  render = () => {},
  step = 1 / 60,
  hidden = 'pause',
  catchUpMax = 5,
  hiddenPeriodMs = 250,
} = {}) {
  let running = false;
  let paused = false;
  let last = 0;
  let acc = 0;
  let time = 0;
  let scale = 1;
  let raf = 0;
  let hiddenTimer = null;
  let fps = 0, frames = 0, fpsClock = 0;

  function advance(now, cap) {
    const elapsed = Math.min(Math.max(0, (now - last) / 1000), cap);
    last = now;
    if (paused) return elapsed;
    acc += elapsed * scale;
    // Avec un timeScale élevé, plafonner aussi le nombre de pas par appel
    const maxSteps = Math.ceil((cap * Math.max(1, scale)) / step) + 1;
    let n = 0;
    while (acc >= step && n++ < maxSteps) {
      update(step);
      time += step;
      acc -= step;
    }
    if (n > maxSteps) acc = 0; // plafond atteint : le retard au-delà est abandonné
    return elapsed;
  }

  function frame(now) {
    if (!running) return;
    const elapsed = advance(now, FRAME_CAP);
    frames++; fpsClock += elapsed;
    if (fpsClock >= 0.5) { fps = Math.round(frames / fpsClock); frames = 0; fpsClock = 0; }
    render(paused ? 0 : acc / step, fps);
    raf = requestAnimationFrame(frame);
  }

  function onVisibility() {
    if (!running) return;
    if (document.hidden) {
      cancelAnimationFrame(raf);
      if (hidden === 'simulate' && hiddenTimer === null) {
        hiddenTimer = setInterval(() => advance(performance.now(), catchUpMax), hiddenPeriodMs);
      }
      return;
    }
    clearInterval(hiddenTimer);
    hiddenTimer = null;
    if (hidden === 'simulate') advance(performance.now(), catchUpMax);
    else last = performance.now(); // en pause : le temps caché ne compte pas
    frames = 0; fpsClock = 0;
    raf = requestAnimationFrame(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      document.addEventListener('visibilitychange', onVisibility);
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      clearInterval(hiddenTimer);
      hiddenTimer = null;
      document.removeEventListener('visibilitychange', onVisibility);
    },
    pause() { paused = true; },
    resume() { if (paused) { paused = false; last = performance.now(); acc = 0; } },
    get paused() { return paused; },
    get running() { return running; },
    get time() { return time; },
    get fps() { return fps; },
    setTimeScale(s) { scale = Math.max(0, Number(s) || 0); },
    get timeScale() { return scale; },
    // Avance de n pas tout de suite (tests, debug)
    tick(n = 1) { for (let i = 0; i < n; i++) { update(step); time += step; } },
  };
}
