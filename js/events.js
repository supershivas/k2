// 30 événements aléatoires qui ponctuent l'ascension. Chacun a une condition d'apparition (`when`),
// un effet (`run`) et le résumé de cet effet (`fx`) affiché dans le bandeau.
// g = le jeu : g.s (état), g.weather, g.daylight, g.temperature, g.gain(), g.shake…
import { SUMMIT } from './game.js?v=1.7.0';

const hourOf = g => (g.s.min % 1440) / 60;

export const EVENTS = [
  // ── Bonnes surprises ────────────────────────────────────────────────────
  { icon: 'ti-sun', title: 'Éclaircie', text: 'Un rayon de soleil réchauffe la paroi.', fx: '+12 chaleur',
    when: g => g.daylight > 0.6, run: g => g.gain('warmth', 12) },
  { icon: 'ti-link', title: 'Corde fixe oubliée', text: 'Une vieille corde pend le long de la paroi. Tu t’y hisses.', fx: '+25 m',
    when: g => g.s.alt > 300 && g.s.alt < SUMMIT - 80, run: g => g.climb(25) },
  { icon: 'ti-box', title: 'Cache d’alpiniste', text: 'Un sac étanche coincé dans une fissure : des vivres.', fx: '+2 vivres',
    when: g => g.s.alt > 800, run: g => g.gain('food', 2) },
  { icon: 'ti-bottle', title: 'Bouteille égarée', text: 'Une bouteille d’oxygène à moitié pleine, laissée là par une expédition.', fx: '+1 oxygène',
    when: g => g.s.alt > 2500, run: g => g.gain('o2', 1) },
  { icon: 'ti-flame', title: 'Cartouche abandonnée', text: 'Une cartouche de gaz neuve dans la neige.', fx: '+1 gaz',
    when: g => g.s.alt > 800, run: g => g.gain('gas', 1) },
  { icon: 'ti-hand-grab', title: 'Prise idéale', text: 'Une vraie prise, large et sèche. Tu souffles enfin.', fx: '+15 énergie',
    when: () => true, run: g => g.gain('energy', 15) },
  { icon: 'ti-cup', title: 'Thé de la cordée voisine', text: 'Une cordée te tend une tasse fumante.', fx: '+8 énergie, +15 chaleur',
    when: g => g.s.alt > 1000, run: g => { g.gain('energy', 8); g.gain('warmth', 15); } },
  { icon: 'ti-stars', title: 'Ciel étoilé', text: 'La nuit est limpide. Tu n’as jamais vu autant d’étoiles.', fx: '+8 énergie',
    when: g => g.daylight < 0.3, run: g => g.gain('energy', 8) },
  { icon: 'ti-wind', title: 'Vent dans le dos', text: 'Une brise porteuse te pousse vers le haut.', fx: '+14 m',
    when: g => g.weather.wind > 0.25 && g.s.alt < SUMMIT - 60, run: g => g.climb(14) },
  { icon: 'ti-paw', title: 'Marmotte curieuse', text: 'Une marmotte te regarde passer. Tu souris.', fx: '+6 énergie',
    when: g => g.s.alt < 2600 && g.daylight > 0.5, run: g => g.gain('energy', 6) },
  { icon: 'ti-cookie', title: 'Chocolat oublié', text: 'Une barre fondue au fond de ta poche.', fx: '+20 énergie',
    when: () => true, run: g => g.gain('energy', 20) },
  { icon: 'ti-heart', title: 'Souvenir d’en bas', text: 'Tu penses à ceux qui t’attendent. Ça pèse moins lourd.', fx: '+5 énergie, +5 chaleur',
    when: g => g.s.alt > 1500, run: g => { g.gain('energy', 5); g.gain('warmth', 5); } },
  { icon: 'ti-users', title: 'Cordée amicale', text: 'Des grimpeurs t’encouragent depuis un replat.', fx: '+10 énergie, +6 chaleur',
    when: g => g.s.alt > 1500 && g.s.alt < 6500, run: g => { g.gain('energy', 10); g.gain('warmth', 6); } },
  { icon: 'ti-sunrise', title: 'Lever de soleil', text: 'Les cimes s’embrasent. Tout devient possible.', fx: '+6 énergie, +8 chaleur',
    when: g => hourOf(g) > 5.5 && hourOf(g) < 8, run: g => { g.gain('energy', 6); g.gain('warmth', 8); } },
  { icon: 'ti-compass', title: 'Pierres qui roulent', text: 'Un bruit sec au-dessus de toi : ça descend !', fx: 'chute de pierres',
    when: g => g.s.alt > 150 && g.rock.warn <= 0 && g.rock.fall <= 0, run: g => g.dropRock(), bad: true },

  // ── Mauvaises surprises ─────────────────────────────────────────────────
  { icon: 'ti-snowflake', title: 'Glaçon dans le col', text: 'Un bloc de glace glisse dans ta veste.', fx: '−10 chaleur',
    when: g => g.s.alt > 500, run: g => g.gain('warmth', -10), bad: true },
  { icon: 'ti-alert-triangle', title: 'Craquement de séracs', text: 'La glace gronde sous tes pieds. Tu retiens ton souffle.', fx: '−8 énergie',
    when: g => g.s.alt > 3500, run: g => { g.gain('energy', -8); g.shake = 0.5; }, bad: true },
  { icon: 'ti-mountain', title: 'Corniche effondrée', text: 'La neige cède sous tes pieds : tu glisses de quelques mètres.', fx: '−20 m',
    when: g => g.s.alt > 1500, run: g => { g.climb(-20); g.shake = 0.4; }, bad: true },
  { icon: 'ti-tool', title: 'Crampon qui lâche', text: 'Une sangle a cédé. Il faut tout resserrer à la main.', fx: '−10 énergie',
    when: () => true, run: g => g.gain('energy', -10), bad: true },
  { icon: 'ti-eye-off', title: 'Lunettes embuées', text: 'Impossible de voir. Tu perds du temps à dégivrer.', fx: '+20 min',
    when: g => g.s.alt > 1000, run: g => { g.s.min += 20; }, bad: true },
  { icon: 'ti-droplet-off', title: 'Gourde gelée', text: 'L’eau est devenue un bloc. Tu sacrifies une ration pour t’hydrater.', fx: '−1 vivre',
    when: g => g.s.alt > 2500 && g.temperature < -8 && g.s.food >= 1, run: g => g.gain('food', -1), bad: true },
  { icon: 'ti-feather', title: 'Choucas voleur', text: 'Un oiseau noir t’arrache une ration et s’enfuit.', fx: '−1 vivre',
    when: g => g.s.alt < 5000 && g.daylight > 0.5 && g.s.food >= 1, run: g => g.gain('food', -1), bad: true },
  { icon: 'ti-mood-sad', title: 'Maux de tête', text: 'L’altitude tape. Chaque geste est une corvée.', fx: '−12 énergie',
    when: g => g.s.alt > 5000, run: g => g.gain('energy', -12), bad: true },
  { icon: 'ti-cloud-snow', title: 'Avalanche au loin', text: 'Un grondement sourd roule sur la vallée. Pas pour toi, cette fois.', fx: '−4 énergie',
    when: g => g.s.alt > 2000, run: g => { g.gain('energy', -4); g.shake = 0.6; }, bad: true },
  { icon: 'ti-cloud-fog', title: 'Brouillard soudain', text: 'Le blanc t’avale. Tu avances à tâtons.', fx: '+30 min',
    when: g => g.s.alt > 1000, run: g => { g.s.min += 30; }, bad: true },
  { icon: 'ti-flame', title: 'Réchaud capricieux', text: 'Le brûleur crache et s’éteint. Du gaz perdu.', fx: '−1 gaz',
    when: g => g.s.gas >= 1, run: g => g.gain('gas', -1), bad: true },
  { icon: 'ti-temperature-minus', title: 'Gelures aux doigts', text: 'Tes gants ne suffisent plus. Tes doigts ne répondent plus.', fx: '−14 chaleur',
    when: g => g.temperature < -12, run: g => g.gain('warmth', -14), bad: true },
  { icon: 'ti-battery-1', title: 'Le mur', text: 'Plus rien ne vient. Les jambes sont en plomb.', fx: '−15 énergie',
    when: g => g.s.alt > 2000, run: g => g.gain('energy', -15), bad: true },
  { icon: 'ti-ghost', title: 'Hallucination', text: 'Une silhouette grimpe à côté de toi. Il n’y a personne : tu perds une prise.', fx: '−6 énergie, −8 m',
    when: g => g.s.alt > 7000, run: g => { g.gain('energy', -6); g.climb(-8); }, bad: true },
  { icon: 'ti-alert-circle', title: 'Fuite d’oxygène', text: 'Un joint siffle : la bouteille se vide plus vite.', fx: '−35 s d’oxygène',
    when: g => g.s.o2On && g.s.o2Sec > 40, run: g => { g.s.o2Sec -= 35; }, bad: true },
];

// Tire un événement parmi ceux dont la condition est remplie (jamais deux fois de suite le même).
export function pickEvent(g, lastIndex = -1, rng = g.rng) {
  const ok = EVENTS.map((e, i) => (i !== lastIndex && e.when(g) ? i : -1)).filter(i => i >= 0);
  if (!ok.length) return null;
  const index = ok[Math.floor(rng() * ok.length)];
  return { index, event: EVENTS[index] };
}
