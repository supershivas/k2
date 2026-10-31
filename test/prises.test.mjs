// Parcours de prises : suite de membres déterministe, jamais deux fois le même membre de suite.
import { limbSequence, LIMBS } from '../js/holds.js';

group('prises');

test('la suite dépend de la graine, pas du hasard', () => {
  assert.deepEqual(limbSequence(42, 200), limbSequence(42, 200));
  assert.notDeepEqual(limbSequence(42, 200), limbSequence(43, 200));
});

test('jamais le même membre deux fois de suite', () => {
  const seq = limbSequence(7, 2000);
  for (let i = 1; i < seq.length; i++) assert.notEqual(seq[i].limb, seq[i - 1].limb);
});

test('les quatre membres reviennent régulièrement (au plus 5 prises sans l’un d’eux)', () => {
  const seq = limbSequence(11, 2000);
  for (const limb of LIMBS) {
    let gap = 0;
    for (const h of seq) { gap = h.limb === limb ? 0 : gap + 1; assert.ok(gap <= 5, `${limb} oublié ${gap} prises`); }
  }
});

test('deux appuis du même côté arrivent (pied puis main du même côté), et l’alternance aussi', () => {
  const seq = limbSequence(5, 500);
  const sameSide = seq.filter((h, i) => i > 0 && h.side === seq[i - 1].side && h.kind !== seq[i - 1].kind).length;
  const alternate = seq.filter((h, i) => i > 0 && h.side !== seq[i - 1].side).length;
  assert.ok(sameSide > 50, `même côté : ${sameSide}`);
  assert.ok(alternate > 50, `alternance : ${alternate}`);
});
