// Capture le jeu sur ses deux cibles, toujours ensemble, et vérifie qu'il se
// charge sans erreur dans la console.
//
//   node outils/captures.mjs                         → index.html, téléphone + bureau
//   node outils/captures.mjs --page labo.html --page atelier.html
//   node outils/captures.mjs --cibles telephone,paysage,bureau --attendre 3000
//   node outils/captures.mjs --base https://supershivas.github.io/mon-jeu/   (version publiée)
//   node outils/captures.mjs --sortie captures/v1.2.0 --debug   (ajoute ?debug=1)
//   node outils/captures.mjs --clic "#jouer"          (clique avant la capture)
//
// Source de vérité : supershivas/game-system/outils/captures.mjs
// Sections 19 et 20 de CONVENTIONS.md : jamais une cible sans l'autre.
// Code de sortie 1 si une page a une erreur (console, exception, requête
// locale en échec).

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { servir, lancerChromium, CIBLES, options } from './navigateur.mjs';

const o = options(process.argv.slice(2), { sortie: 'captures', attendre: '1500', cibles: 'telephone,bureau' });
const pages = [].concat(o.page || 'index.html');
const cibles = String(o.cibles).split(',');
const clics = [].concat(o.clic || []);

const serveur = o.base ? null : await servir('.');
const base = o.base || serveur.base;
const navigateur = await lancerChromium();
await mkdir(o.sortie, { recursive: true });

let erreurs = 0;
for (const page of pages) {
  for (const nom of cibles) {
    const cible = CIBLES[nom];
    if (!cible) { console.error(`Cible inconnue : ${nom} (${Object.keys(CIBLES).join(', ')})`); process.exit(2); }
    const ctx = await navigateur.newContext(cible);
    const p = await ctx.newPage();
    const problemes = [];
    p.on('console', m => { if (m.type() === 'error') problemes.push(`console : ${m.text()}`); });
    p.on('pageerror', e => problemes.push(`exception : ${e.message}`));
    p.on('requestfailed', r => { if (r.url().startsWith(base)) problemes.push(`requête : ${r.url()} (${r.failure()?.errorText})`); });
    p.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400) problemes.push(`requête : ${r.url()} (${r.status()})`); });
    const url = new URL(page, base);
    if (o.debug) url.searchParams.set('debug', '1');
    await p.goto(url.href, { waitUntil: 'load' });
    for (const sel of clics) await p.click(sel).catch(e => problemes.push(`clic ${sel} : ${e.message.split('\n')[0]}`));
    await p.waitForTimeout(Number(o.attendre));
    const fichier = join(o.sortie, `${page.replace(/[^\w.-]+/g, '_').replace(/\.html$/, '')}-${nom}.png`);
    await p.screenshot({ path: fichier });
    const etat = problemes.length ? `✗ ${problemes.length} problème(s)` : '✓';
    console.log(`${etat}  ${page} — ${nom} (${cible.viewport.width}×${cible.viewport.height}) → ${fichier}`);
    for (const pb of problemes) console.log(`    ${pb}`);
    erreurs += problemes.length;
    await ctx.close();
  }
}

await navigateur.close();
await serveur?.close();
process.exit(erreurs ? 1 : 0);
