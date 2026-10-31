/* ─── Pointeur : souris et doigt, mêmes gestes — partagé entre les jeux ─────
   Source de vérité : supershivas/game-system/modules/pointer.js
   Applique les sections 7 et 8 de CONVENTIONS.md :
   - la souris produit exactement les mêmes gestes que le doigt (Pointer Events) ;
   - le pointeur n'est capturé qu'au franchissement du seuil de glissement,
     jamais au pointerdown (sinon le `click` suivant part ailleurs) ;
   - le navigateur ne prend aucun geste au jeu : ni sélection, ni loupe, ni
     menu contextuel, ni zoom à la pince, ni rechargement en tirant vers le bas.

   Module ES sans dépendance :
     import { createPointer, lockBrowserGestures } from './lib/pointer.js?v=1.5.0'
     lockBrowserGestures(document.getElementById('jeu'))
     const ptr = createPointer(canvas, {
       toLocal: (x, y) => pixels.toLogical(x, y),  // coordonnées du jeu (facultatif)
       threshold: 44,                     // seuil de glissement, en px CSS
       onTap: p => {},                    // appui bref sans glissement
       onLongPress: p => {},              // appui tenu (500 ms par défaut)
       onDragStart: p => {}, onDrag: p => {}, onDragEnd: p => {},
       onPinch: ({ scale, center }) => {},   // deux doigts (facteur depuis le début)
       onWheel: ({ delta, at }) => {},       // molette : -1 ou 1 par cran
       onHover: p => {},                  // souris seulement, jamais porteur d'information
     })
     // p = { x, y, startX, startY, dx, dy, type: 'mouse' | 'touch' | 'pen', button }
     ptr.destroy()
   ─────────────────────────────────────────────────────────────────────────── */

export function lockBrowserGestures(el = document.body) {
  el.style.touchAction = 'none';
  el.style.userSelect = 'none';
  el.style.webkitUserSelect = 'none';
  el.style.webkitTouchCallout = 'none';
  el.style.webkitTapHighlightColor = 'transparent';
  document.documentElement.style.overscrollBehavior = 'none';
  document.body.style.overscrollBehavior = 'none';
  const prevent = e => e.preventDefault();
  el.addEventListener('contextmenu', prevent);
  // Safari : le geste de pince de la page
  el.addEventListener('gesturestart', prevent);
  el.addEventListener('gesturechange', prevent);
  // Double toucher qui zoome
  let lastTouch = 0;
  const onTouchEnd = e => {
    const now = e.timeStamp;
    if (now - lastTouch < 350) e.preventDefault();
    lastTouch = now;
  };
  el.addEventListener('touchend', onTouchEnd, { passive: false });
  return () => {
    el.removeEventListener('contextmenu', prevent);
    el.removeEventListener('gesturestart', prevent);
    el.removeEventListener('gesturechange', prevent);
    el.removeEventListener('touchend', onTouchEnd);
  };
}

export function createPointer(el, {
  toLocal = (x, y) => ({ x, y }),
  threshold = 44,
  longPressMs = 500,
  onTap, onLongPress, onDragStart, onDrag, onDragEnd, onPinch, onWheel, onHover,
} = {}) {
  const active = new Map(); // pointerId → état
  let pinch = null;

  const local = e => {
    const r = el.getBoundingClientRect();
    return toLocal(e.clientX - r.left, e.clientY - r.top);
  };
  const info = (s, e) => {
    const at = local(e);
    return {
      x: at.x, y: at.y, startX: s.start.x, startY: s.start.y,
      dx: at.x - s.start.x, dy: at.y - s.start.y,
      type: e.pointerType, button: s.button, event: e,
    };
  };
  const distance = () => {
    const [a, b] = [...active.values()];
    return Math.hypot(a.cx - b.cx, a.cy - b.cy);
  };
  const center = () => {
    const [a, b] = [...active.values()];
    const r = el.getBoundingClientRect();
    return toLocal((a.cx + b.cx) / 2 - r.left, (a.cy + b.cy) / 2 - r.top);
  };

  const onDown = e => {
    if (e.pointerType === 'mouse' && e.button > 2) return;
    const s = {
      id: e.pointerId, button: e.button, start: local(e), cx: e.clientX, cy: e.clientY,
      sx: e.clientX, sy: e.clientY, dragging: false, cancelled: false, long: null,
    };
    active.set(e.pointerId, s);
    if (active.size === 2 && onPinch) {
      // Un second doigt : ce n'est plus un appui ni un glissement, c'est une pince.
      for (const o of active.values()) { clearTimeout(o.long); o.cancelled = true; }
      pinch = { d0: distance() || 1 };
      return;
    }
    if (onLongPress) {
      s.long = setTimeout(() => {
        if (!s.dragging && !s.cancelled) { s.cancelled = true; onLongPress(info(s, e)); }
      }, longPressMs);
    }
  };

  const onMove = e => {
    const s = active.get(e.pointerId);
    if (!s) { if (e.pointerType === 'mouse' && onHover) onHover({ ...local(e), type: 'mouse' }); return; }
    s.cx = e.clientX; s.cy = e.clientY;
    if (pinch && active.size >= 2) {
      onPinch?.({ scale: distance() / pinch.d0, center: center() });
      return;
    }
    if (s.cancelled) return;
    if (!s.dragging && Math.hypot(e.clientX - s.sx, e.clientY - s.sy) >= threshold) {
      // Le seuil est franchi : c'est un glissement, et seulement maintenant on capture.
      s.dragging = true;
      clearTimeout(s.long);
      try { el.setPointerCapture(e.pointerId); } catch { /* déjà relâché */ }
      onDragStart?.(info(s, e));
    }
    if (s.dragging) onDrag?.(info(s, e));
  };

  const onUp = e => {
    const s = active.get(e.pointerId);
    if (!s) return;
    active.delete(e.pointerId);
    clearTimeout(s.long);
    if (pinch) { if (active.size < 2) pinch = null; return; }
    if (s.dragging) onDragEnd?.(info(s, e));
    else if (!s.cancelled && e.type === 'pointerup') onTap?.(info(s, e));
  };

  const onWheelEvent = e => {
    if (!onWheel) return;
    e.preventDefault();
    onWheel({ delta: Math.sign(e.deltaY), at: local(e) });
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('wheel', onWheelEvent, { passive: false });

  return {
    get dragging() { return [...active.values()].some(s => s.dragging); },
    cancel() { for (const s of active.values()) { clearTimeout(s.long); s.cancelled = true; } },
    destroy() {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheelEvent);
    },
  };
}
