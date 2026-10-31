// Outillage commun aux outils qui ouvrent le jeu dans un navigateur :
// un petit serveur statique et le lancement de Chromium par Playwright.
//
// Source de vérité : supershivas/game-system/outils/navigateur.mjs
//
// Playwright est cherché, dans l'ordre : dans le jeu (node_modules), dans
// outils/node_modules, puis l'installation globale du conteneur Claude Code
// (/opt/node22/lib/node_modules/playwright). Le Chromium préinstallé
// (/opt/pw-browsers) est utilisé tel quel : ne jamais lancer
// `playwright install` dans le conteneur.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json',
};

// Sert `racine` sur un port libre ; rend { base, close }
export async function servir(racine = process.cwd()) {
  const root = resolve(racine);
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = normalize(join(root, path));
      if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
      const s = await stat(file).catch(() => null);
      if (!s || !s.isFile()) { res.writeHead(404).end('404'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(await readFile(file));
    } catch (e) {
      res.writeHead(500).end(String(e));
    }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return { base: `http://127.0.0.1:${port}/`, close: () => new Promise(r => server.close(r)) };
}

export async function playwright() {
  const essais = [
    () => import('playwright'),
    () => import(pathToFileURL(resolve('outils/node_modules/playwright/index.js')).href),
    () => import(pathToFileURL(resolve('node_modules/playwright/index.js')).href),
    () => import('/opt/node22/lib/node_modules/playwright/index.js'),
    () => import('playwright-core'),
  ];
  for (const essai of essais) {
    try { const m = await essai(); return m.default || m; } catch { /* suivant */ }
  }
  throw new Error('Playwright introuvable. Dans un conteneur Claude Code, il est dans /opt/node22/lib/node_modules ; ailleurs : npm i -D playwright (dans outils/).');
}

export async function lancerChromium(opts = {}) {
  const pw = await playwright();
  const options = { headless: true, ...opts };
  const local = ['/opt/pw-browsers/chromium/chrome-linux/chrome', '/opt/pw-browsers/chromium'];
  try {
    return await pw.chromium.launch(options);
  } catch (e) {
    for (const p of local) {
      if (existsSync(p)) {
        try { return await pw.chromium.launch({ ...options, executablePath: p }); } catch { /* suivant */ }
      }
    }
    throw e;
  }
}

// Les deux cibles d'affichage (section 7 et 20 de CONVENTIONS.md)
export const CIBLES = {
  telephone: { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  telephone_grand: { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true },
  paysage: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  bureau: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  bureau_125: { viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 },
};

// Lit les options --nom valeur et les drapeaux --nom
export function options(argv = process.argv.slice(2), defauts = {}) {
  const o = { ...defauts, _: [] };
  const vus = new Set(); // une option répétée (--page a --page b) devient une liste
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) o[k] = true;
      else { o[k] = vus.has(k) ? [].concat(o[k], v) : v; vus.add(k); i++; }
    } else o._.push(a);
  }
  return o;
}
