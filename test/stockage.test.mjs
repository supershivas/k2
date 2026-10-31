// Sauvegarde : relecture d'une ancienne donnée sans enveloppe, export sans jeton, hasard à graine.
import { createStore, memoryBackend } from '../js/lib/save.js';
import { createRng } from '../js/lib/rng.js';
import { Game } from '../js/game.js';

group('stockage');

const entries = { save: { version: 1 }, records: { version: 1, defaults: { maxAlt: 0 } } };

test('une donnée d’avant la v1.5 (sans enveloppe) se relit', () => {
  const backend = memoryBackend({ 'k2:save': JSON.stringify({ alt: 1234, energy: 80 }) });
  const store = createStore({ game: 'k2', entries, backend });
  assert.equal(store.load('save').alt, 1234);
});

test('l’export ne contient jamais le jeton', () => {
  const backend = memoryBackend();
  const store = createStore({ game: 'k2', entries, backend, secret: ['github-token'] });
  store.setSecret('github-token', 'secret');
  store.save('save', { alt: 1 });
  const dump = store.exportAll();
  assert.ok(dump.entries.save);
  assert.equal(JSON.stringify(dump).includes('secret'), false);
});

test('en debug, la vraie partie n’est pas touchée', () => {
  const backend = memoryBackend();
  const vrai = createStore({ game: 'k2', entries, backend });
  const debug = createStore({ game: 'k2', entries, backend, debug: true });
  vrai.save('save', { alt: 10 });
  debug.save('save', { alt: 99 });
  assert.equal(vrai.load('save').alt, 10);
});

test('les pentes d’une ascension dépendent de la graine, pas du hasard', () => {
  const a = Game.prototype.makeWalks.call({}, 42);
  const b = Game.prototype.makeWalks.call({}, 42);
  const c = Game.prototype.makeWalks.call({}, 43);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('le hasard à graine rejoue la même suite, et reprend après un état sauvegardé', () => {
  const r = createRng(7);
  r(); r();
  const state = r.state;
  const suite = [r(), r(), r()];
  const r2 = createRng(7);
  r2.setState(state);
  assert.deepEqual([r2(), r2(), r2()], suite);
});
