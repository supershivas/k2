// Tout le stockage du jeu passe par ici (section 11 des conventions) : clés préfixées `k2:`,
// entrées versionnées et migrées à la lecture, export / import JSON, jeton jamais exporté.
// En mode debug (?debug=1), les clés changent (`k2:debug:…`) : la vraie partie reste intacte.
import { createStore } from './lib/save.js?v=1.6.0';

export const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');

// Les données écrites avant la v1.5 n'ont pas d'enveloppe : elles se relisent comme la version 1.
export const store = createStore({
  game: 'k2',
  debug: DEBUG,
  entries: {
    save: { version: 1 }, // la partie en cours
    records: { version: 1, defaults: { maxAlt: 0, summits: 0, bestDays: 0 } },
    progress: { version: 1 }, // XP, talents, reliques : permanent
    sprites: { version: 1 }, // retouches de l'atelier
  },
  secret: ['github-token'],
});
