// Audit de l'écran — mesuré sur le rendu réel, jamais déduit des media queries.
//
//   node outils/audit-ecran.mjs                       → index.html sur trois téléphones
//   node outils/audit-ecran.mjs --page index.html --page labo.html
//   node outils/audit-ecran.mjs --clic "#jouer" --cible 48   (public enfant)
//
// Source de vérité : supershivas/game-system/outils/audit-ecran.mjs
// D'après tools/mobile-audit.mjs de Frères de la Côte. Sections 7 et 19 de
// CONVENTIONS.md. Quatre défauts invisibles sur un écran d'ordinateur et
// fatals sur un téléphone :
//
//   1. AMPUTATION : un élément sort de l'écran alors qu'un ancêtre masque le
//      débordement (overflow: hidden) — pas d'ascenseur, pas d'erreur, une
//      partie du jeu simplement absente. Le pire, parce que rien ne le signale.
//   2. DÉBORDEMENT : la page défile horizontalement.
//   3. CIBLES TROP PETITES : sous 44 px (48 pour un enfant), un pouce rate.
//   4. SURVOL SEUL : une règle CSS `:hover` hors de `@media (hover: hover)`.
//
// Échoue (code 1) sur 1 et 2. Signale 3 et 4.
// CE QU'IL NE VOIT PAS : ce qui est dessiné dans un canvas (les boutons du
// HUD peints sur le canvas se vérifient dans le jeu), et un survol construit
// en JavaScript (`mouseenter`). Ne pas s'y fier au-delà.

import { servir, lancerChromium, CIBLES, options } from './navigateur.mjs';

const o = options(process.argv.slice(2), { cible: '44', attendre: '1000', ecrans: 'telephone,telephone_grand,paysage' });
const pages = [].concat(o.page || 'index.html');
const clics = [].concat(o.clic || []);
const MIN = Number(o.cible);

const MESURE = min => {
  const de = document.documentElement;
  const vue = { w: de.clientWidth, h: de.clientHeight };
  const visible = el => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    if (el.closest('dialog:not([open]), [hidden], .jeu-cache')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const nom = el => el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}`;
  const coupePar = el => {
    for (let a = el.parentElement; a; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (['hidden', 'clip'].includes(s.overflowX) || ['hidden', 'clip'].includes(s.overflowY)) return a;
    }
    return null;
  };

  const amputes = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || el.closest('svg') && el.tagName !== 'svg') continue;
    const r = el.getBoundingClientRect();
    const dehors = r.right > vue.w + 1 || r.bottom > vue.h + 1 || r.left < -1 || r.top < -1;
    if (!dehors) continue;
    const a = coupePar(el);
    // Un élément dans un conteneur qui défile n'est pas amputé
    if (a && !['auto', 'scroll'].includes(getComputedStyle(a).overflowY)) {
      const ra = a.getBoundingClientRect();
      if (ra.right > vue.w + 1 || ra.bottom > vue.h + 1 || r.right > ra.right + 1 || r.bottom > ra.bottom + 1) {
        amputes.push(`${nom(el)} (${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)})`);
      }
    }
  }

  const petites = [];
  for (const el of document.querySelectorAll('button, a[href], [role="button"], input, select, summary, [onclick]')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < min - 0.5 || r.height < min - 0.5) petites.push(`${nom(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
  }

  const survols = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    const walk = (list, dansHover) => {
      for (const r of list) {
        if (r.media) walk(r.cssRules, dansHover || /hover:\s*hover/.test(r.media.mediaText));
        else if (r.selectorText && r.selectorText.includes(':hover') && !dansHover) survols.push(r.selectorText);
      }
    };
    walk(rules, false);
  }

  return {
    debordement: de.scrollWidth > vue.w + 1 ? de.scrollWidth - vue.w : 0,
    amputes: amputes.slice(0, 20), petites: petites.slice(0, 30), survols: survols.slice(0, 20),
  };
};

const serveur = await servir('.');
const navigateur = await lancerChromium();
let echec = false;

for (const page of pages) {
  for (const ecran of String(o.ecrans).split(',')) {
    const cible = CIBLES[ecran];
    const ctx = await navigateur.newContext(cible);
    const p = await ctx.newPage();
    await p.goto(new URL(page, serveur.base).href, { waitUntil: 'load' });
    for (const sel of clics) await p.click(sel).catch(() => {});
    await p.waitForTimeout(Number(o.attendre));
    const m = await p.evaluate(MESURE, MIN);
    const grave = m.debordement || m.amputes.length;
    if (grave) echec = true;
    console.log(`${grave ? '✗' : '✓'}  ${page} — ${ecran} (${cible.viewport.width}×${cible.viewport.height})`);
    if (m.debordement) console.log(`    DÉBORDEMENT : la page défile de ${m.debordement} px en largeur`);
    for (const a of m.amputes) console.log(`    AMPUTÉ : ${a}`);
    for (const c of m.petites) console.log(`    cible < ${MIN} px : ${c}`);
    for (const s of m.survols) console.log(`    survol hors @media (hover: hover) : ${s}`);
    await ctx.close();
  }
}

await navigateur.close();
await serveur.close();
process.exit(echec ? 1 : 0);
