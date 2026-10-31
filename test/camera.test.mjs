// Caméra libre : on peut revoir le chemin parcouru, pas regarder plus loin que le point le plus haut atteint.
import { Game } from '../js/game.js';

group('caméra');

const joueur = (alt, top) => ({ camOffset: 0, s: { alt, top } });

test('on peut descendre le regard jusqu\'au sol, pas plus bas', () => {
  const g = joueur(100, 150);
  Game.prototype.scrollBy.call(g, -500);
  assert.equal(g.camOffset, -100);
});

test('on ne regarde pas au-delà du point le plus haut atteint (plus une marge)', () => {
  const g = joueur(100, 150);
  Game.prototype.scrollBy.call(g, 500);
  assert.equal(g.camOffset, 50 + 15);
});

test('« scrolled » s\'allume dès 6 m d\'écart et revenir au joueur remet à zéro', () => {
  const g = joueur(100, 150);
  Object.defineProperty(g, 'scrolled', Object.getOwnPropertyDescriptor(Game.prototype, 'scrolled'));
  Game.prototype.scrollBy.call(g, -5); assert.equal(g.scrolled, false);
  Game.prototype.scrollBy.call(g, -10); assert.equal(g.scrolled, true);
  Game.prototype.recenter.call(g); assert.equal(g.camOffset, 0);
});
