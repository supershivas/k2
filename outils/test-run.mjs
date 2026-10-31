// Lance les tests du jeu, sans navigateur ni installation.
//   node outils/test-run.mjs            → tous les *.test.mjs / *.test.js de test/
//   node outils/test-run.mjs test/regles.test.mjs   → un fichier
//   node outils/test-run.mjs test --filtre sauvegarde
//   node outils/test-run.mjs --court    → seulement les échecs et le bilan (économise le contexte)
//
// Source de vérité : supershivas/game-system/outils/test-run.mjs
// Section 19 de CONVENTIONS.md. Un fichier de test n'importe rien du runner :
// il utilise les globales `test`, `assert` (node:assert/strict) et `group` :
//
//   import { creerPartie, jouer } from '../js/regles.js'
//   group('règles — la volée')
//   test('une triplette vaut +24', () => {
//     assert.equal(jouer(creerPartie(1), [0, 1, 2]).bonus, 24)
//   })
//
// Le code de sortie vaut 1 si un test échoue : le workflow de déploiement
// s'arrête, et un jeu aux règles cassées n'est pas publié.

import assert from 'node:assert/strict';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const ci = args.indexOf('--court');
const court = ci >= 0;
if (court) args.splice(ci, 1);
const fi = args.indexOf('--filtre');
const filtre = fi >= 0 ? args.splice(fi, 2)[1] : null;
const cibles = args.length ? args : ['test'];

const tests = [];
let groupe = '';
globalThis.assert = assert;
globalThis.group = nom => { groupe = nom; };
globalThis.test = (nom, fn) => tests.push({ nom: groupe ? `${groupe} — ${nom}` : nom, fn });

function lister(chemin) {
  if (!existsSync(chemin)) return [];
  if (statSync(chemin).isFile()) return [chemin];
  return readdirSync(chemin).flatMap(f => {
    const p = join(chemin, f);
    if (statSync(p).isDirectory()) return f === 'node_modules' || f.startsWith('.') ? [] : lister(p);
    return /\.test\.m?js$/.test(f) ? [p] : [];
  }).sort();
}

const fichiers = cibles.flatMap(c => lister(resolve(c)));
if (!fichiers.length) {
  console.log(`Aucun test trouvé dans ${cibles.join(', ')}.`);
  process.exit(0);
}

for (const f of fichiers) {
  groupe = '';
  await import(pathToFileURL(f).href);
}

let ok = 0, ko = 0;
const t0 = performance.now();
for (const t of tests) {
  if (filtre && !t.nom.includes(filtre)) continue;
  try {
    await t.fn();
    ok++;
    if (!court) console.log(`  ✓ ${t.nom}`);
  } catch (e) {
    ko++;
    console.log(`  ✗ ${t.nom}\n      ${String(e.message || e).split('\n').join('\n      ')}`);
  }
}
const ms = Math.round(performance.now() - t0);
console.log(`\n${ok} réussi(s), ${ko} échec(s) — ${fichiers.map(f => relative(process.cwd(), f)).length} fichier(s), ${ms} ms`);
process.exit(ko ? 1 : 0);
