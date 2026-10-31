// Progression : niveaux, talents, reliques (règles pures, sans navigateur).
import { Progress, SKILLS, xpForLevel, MAX_LEVEL } from '../js/progress.js';
import { RELICS } from '../js/relics.js';
import { EVENTS } from '../js/events.js';

group('progression');

test('les niveaux suivent la courbe d’XP et plafonnent à 10', () => {
  const p = new Progress();
  assert.equal(p.level, 1);
  p.xp = xpForLevel(2); assert.equal(p.level, 2);
  p.xp = xpForLevel(2) - 1; assert.equal(p.level, 1);
  p.xp = 1e9; assert.equal(p.level, MAX_LEVEL);
});

test('un point de talent par niveau, dans l’ordre de la branche', () => {
  const p = new Progress();
  p.xp = xpForLevel(3);
  assert.equal(p.points, 2);
  assert.equal(p.canBuy('end2'), false, 'le deuxième talent demande le premier');
  assert.equal(p.buy('end1'), true);
  assert.equal(p.canBuy('end2'), true);
  assert.equal(p.buy('end2'), true);
  assert.equal(p.points, 0);
  assert.equal(p.buy('end3'), false, 'plus de point');
});

test('douze talents, dix reliques, trente événements', () => {
  assert.equal(SKILLS.length, 12);
  assert.equal(RELICS.length, 10);
  assert.equal(EVENTS.length, 30);
  assert.equal(new Set(RELICS.map(r => r.id)).size, 10);
});

test('une relique ne se compte qu’une fois', () => {
  const p = new Progress();
  p.addRelic('mallory'); p.addRelic('mallory');
  assert.equal(p.relics.length, 1);
});
