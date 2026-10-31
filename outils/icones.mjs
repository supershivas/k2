// Fabrique les icônes du jeu à partir de favicon.svg (section 6 de CONVENTIONS.md).
//
//   node outils/icones.mjs                 → favicon.ico (16, 32, 48), apple-touch-icon.png (180),
//                                            icon-192.png, icon-512.png, favicon-labo.png et
//                                            favicon-atelier.png (32) s'ils ont un SVG
//   node outils/icones.mjs --fond "#14182e"   (fond plein pour l'icône iOS, qui ne gère pas la transparence)
//
// Source de vérité : supershivas/game-system/outils/icones.mjs
// Le SVG est rendu par Chromium (Playwright), au plus proche, sans lissage
// pour un favicon en pixels (shape-rendering="crispEdges" dans le SVG).

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { lancerChromium, options } from './navigateur.mjs';

const o = options(process.argv.slice(2));
if (!existsSync('favicon.svg')) { console.error('favicon.svg introuvable'); process.exit(2); }
const navigateur = await lancerChromium();
const page = await navigateur.newPage();

async function rendre(svgFichier, taille, fond) {
  const svg = (await readFile(svgFichier, 'utf8')).replace(/<svg\b/, `<svg width="${taille}" height="${taille}"`);
  await page.setViewportSize({ width: taille, height: taille });
  await page.setContent(`<html><body style="margin:0;background:${fond || 'transparent'}">${svg}</body></html>`);
  return page.screenshot({ omitBackground: !fond, clip: { x: 0, y: 0, width: taille, height: taille } });
}

// Un .ico qui contient des PNG (accepté par tous les navigateurs actuels)
function ico(pngs) {
  const entete = Buffer.alloc(6 + 16 * pngs.length);
  entete.writeUInt16LE(0, 0); entete.writeUInt16LE(1, 2); entete.writeUInt16LE(pngs.length, 4);
  let offset = entete.length;
  pngs.forEach(({ taille, data }, i) => {
    const e = 6 + 16 * i;
    entete.writeUInt8(taille >= 256 ? 0 : taille, e);
    entete.writeUInt8(taille >= 256 ? 0 : taille, e + 1);
    entete.writeUInt16LE(1, e + 4); entete.writeUInt16LE(32, e + 6);
    entete.writeUInt32LE(data.length, e + 8); entete.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([entete, ...pngs.map(p => p.data)]);
}

const tailles = [16, 32, 48];
const pngs = [];
for (const t of tailles) pngs.push({ taille: t, data: await rendre('favicon.svg', t) });
await writeFile('favicon.ico', ico(pngs));
await writeFile('apple-touch-icon.png', await rendre('favicon.svg', 180, o.fond || null));
await writeFile('icon-192.png', await rendre('favicon.svg', 192));
await writeFile('icon-512.png', await rendre('favicon.svg', 512));
const faits = ['favicon.ico', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'];
for (const k of ['labo', 'atelier']) {
  if (existsSync(`favicon-${k}.svg`)) { await writeFile(`favicon-${k}.png`, await rendre(`favicon-${k}.svg`, 32)); faits.push(`favicon-${k}.png`); }
}
await navigateur.close();
console.log(`Icônes : ${faits.join(', ')}`);
