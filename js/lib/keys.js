/* ─── Clavier — partagé entre les jeux ─────────────────────────────────────
   Source de vérité : supershivas/game-system/modules/keys.js
   Applique la section 8 de CONVENTIONS.md :
   - se déplacer par la touche PHYSIQUE (`e.code`) : ZQSD en AZERTY, WASD en
     QWERTY et les flèches marchent sans réglage ;
   - une commande nommée par une lettre se lit par son CARACTÈRE (`e.key`) :
     la touche écrite M ouvre la carte quel que soit le clavier ; repli sur
     la touche physique quand le caractère n'est pas une lettre latine ;
   - aucun raccourci avec Ctrl, Cmd ou Alt ; pas de répétition (`e.repeat`) ;
   - pas de recherche automatique de Firefox : hors des champs de saisie,
     toute touche imprimable est retenue.

   Module ES sans dépendance :
     import { createKeys, keyIs, stopTypeahead } from './lib/keys.js?v=1.5.0'
     stopTypeahead()
     const keys = createKeys({
       actions: { carte: 'm', inventaire: 'i', action: 'e', pause: 'Escape' },
       onAction: (nom, e) => { ... },     // une fois par appui, jamais répétée
     })
     // dans la boucle : keys.axis() → { x: -1|0|1, y: -1|0|1 }
     //                  keys.held('KeyJ') → la touche physique J est enfoncée
     keys.destroy()
   ─────────────────────────────────────────────────────────────────────────── */

// Une commande par sa lettre (ou par son nom de touche : 'Escape', 'Enter', ' ').
export function keyIs(e, letter) {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return false;
  if (letter.length > 1) return e.key === letter || e.code === letter;
  if (/^[a-z]$/i.test(e.key)) return e.key.toLowerCase() === letter.toLowerCase();
  if (/^[a-z]$/i.test(letter)) return e.code === `Key${letter.toUpperCase()}`;
  return e.key === letter;
}

const isTyping = t => !!t?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]');

// Firefox cherche dans la page dès qu'on tape une lettre (et ' ou /) :
// hors des champs de saisie, une touche imprimable ne va pas au navigateur.
// Espace reste libre sur un bouton ou un lien qui a le focus.
export function stopTypeahead(target = window) {
  const onKey = e => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
    if (isTyping(e.target)) return;
    if (e.key === ' ' && e.target?.closest?.('button, a, summary')) return;
    e.preventDefault();
  };
  target.addEventListener('keydown', onKey);
  return () => target.removeEventListener('keydown', onKey);
}

// Les directions, en touches physiques
export const DIRECTIONS = {
  left: ['ArrowLeft', 'KeyA'],    // Q en AZERTY
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],        // Z en AZERTY
  down: ['ArrowDown', 'KeyS'],
};

export function createKeys({
  target = window,
  actions = {},
  onAction,
  directions = DIRECTIONS,
} = {}) {
  const down = new Set();
  let enabled = true;

  const onKeyDown = e => {
    if (isTyping(e.target)) return;
    if (!e.ctrlKey && !e.metaKey && !e.altKey) down.add(e.code);
    if (!enabled || !onAction) return;
    for (const [name, letter] of Object.entries(actions)) {
      const letters = Array.isArray(letter) ? letter : [letter];
      if (letters.some(l => keyIs(e, l))) {
        e.preventDefault();
        onAction(name, e);
        return;
      }
    }
  };
  const onKeyUp = e => down.delete(e.code);
  // Une touche relâchée hors de la fenêtre ne fait pas de keyup : tout oublier.
  const clear = () => down.clear();

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clear);
  document.addEventListener('visibilitychange', clear);

  const any = codes => codes.some(c => down.has(c));

  return {
    held: code => down.has(code),
    // Direction voulue, -1, 0 ou 1 sur chaque axe (deux touches opposées s'annulent)
    axis() {
      if (!enabled) return { x: 0, y: 0 };
      return {
        x: (any(directions.right) ? 1 : 0) - (any(directions.left) ? 1 : 0),
        y: (any(directions.down) ? 1 : 0) - (any(directions.up) ? 1 : 0),
      };
    },
    setEnabled(v) { enabled = !!v; if (!v) down.clear(); },
    clear,
    destroy() {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', clear);
    },
  };
}
