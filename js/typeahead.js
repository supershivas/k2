// Empêche Firefox de lancer sa recherche « dès qu'on tape » (et la recherche rapide ' et /).
// Plus complet que stopTypeahead() de js/lib/keys.js : écoute en phase de capture (aucun autre gestionnaire ne passe
// avant), bloque aussi `keypress` (où Firefox déclenche la recherche) et les touches mortes. Hors des champs de saisie,
// toute touche imprimable est retenue ; Ctrl / Cmd restent libres (Ctrl+F, Ctrl+L), AltGr aussi pour les champs.
const isTyping = t => !!t?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]');

export function lockTypeahead(doc = document) {
  const block = e => {
    if (e.metaKey || (e.ctrlKey && !e.altKey)) return; // raccourcis du navigateur
    if (isTyping(e.target)) return;
    const printable = e.type === 'keypress' || e.key === 'Dead' || (e.key && e.key.length === 1);
    if (!printable) return;
    if ((e.key === ' ' || e.charCode === 32) && e.target?.closest?.('button, a, summary')) return; // Espace active un bouton
    e.preventDefault();
  };
  doc.addEventListener('keydown', block, true);
  doc.addEventListener('keypress', block, true);
  return () => { doc.removeEventListener('keydown', block, true); doc.removeEventListener('keypress', block, true); };
}
