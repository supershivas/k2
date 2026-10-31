// Découpe un CLAUDE.md trop gros : les blocs choisis partent, sans changement de texte,
// dans docs/domaines/<domaine>.md ; ce qui reste est le CLAUDE.md court. Un dossier peut
// charger tout seul le fichier de son domaine (un CLAUDE.md de dossier qui l'importe).
//
//   node outils/decouper-claude-md.mjs --liste            les blocs : ligne, taille, début
//   node outils/decouper-claude-md.mjs plan.json          à sec : tailles, ce qui reste
//   node outils/decouper-claude-md.mjs plan.json --ecrire écrit les fichiers
//
// plan.json :
//   { "domaines": { "rendu": { "titre": "Rendu", "lignes": [48, 84, 88] } },
//     "dossiers": { "js/rendu": "rendu" } }
// « lignes » : le numéro de la ligne où commence chaque bloc (titre `#`, `##`, `###`
// ou puce `- ` en colonne 0), tel que --liste le donne. Un bloc court jusqu'au suivant.
// Le contrôle final : chaque ligne non vide d'origine se retrouve dans CLAUDE.md ou
// dans un fichier de domaine (rien ne se perd).
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const fichier = 'CLAUDE.md';
const L = fs.readFileSync(fichier, 'utf8').split('\n');
const debuts = L.map((l, i) => (/^(#{1,3} |- )/.test(l) ? i : -1)).filter((i) => i >= 0);
const blocs = new Map();
debuts.forEach((s, k) => blocs.set(s + 1, L.slice(s, debuts[k + 1] ?? L.length)));
const taille = (t) => t.reduce((n, l) => n + l.length + 1, 0);

if (args.includes('--liste')) {
  for (const [n, b] of blocs) console.log(`${n}\t${taille(b)}\t${b[0].slice(0, 90)}`);
  process.exit(0);
}
const planChemin = args.find((a) => a.endsWith('.json'));
if (!planChemin) { console.error('Usage : voir l\'en-tête du script.'); process.exit(1); }
const plan = JSON.parse(fs.readFileSync(planChemin, 'utf8'));

const pris = new Map();
const sortie = {};
for (const [d, def] of Object.entries(plan.domaines)) {
  sortie[d] = [];
  for (const n of def.lignes) {
    if (!blocs.has(n)) throw new Error(`${d} : aucun bloc ne commence à la ligne ${n}`);
    if (pris.has(n)) throw new Error(`ligne ${n} déjà prise par ${pris.get(n)}`);
    pris.set(n, d);
  }
  for (const n of [...def.lignes].sort((a, b) => a - b)) sortie[d].push(...blocs.get(n));
}
const reste = L.slice(0, debuts[0]);
for (const [n, b] of blocs) if (!pris.has(n)) reste.push(...b);

const nouveau = new Set();
for (const t of [reste, ...Object.values(sortie)]) t.forEach((l) => nouveau.add(l));
const perdues = L.filter((l) => l.trim() && !nouveau.has(l));
console.log(`CLAUDE.md : ${taille(L)} -> ${taille(reste)} octets`);
for (const [d, t] of Object.entries(sortie)) console.log(`  docs/domaines/${d}.md : ${taille(t)}`);
console.log(`Lignes perdues : ${perdues.length}${perdues.length ? '\n  ' + perdues.map((l) => l.slice(0, 80)).join('\n  ') : ''}`);
console.log('Restent dans CLAUDE.md :', [...blocs].filter(([n]) => !pris.has(n)).map(([n, b]) => `${n} ${b[0].slice(0, 40)}`).join(' | '));
if (!args.includes('--ecrire')) { console.log('(à sec : --ecrire pour écrire)'); process.exit(0); }

fs.mkdirSync('docs/domaines', { recursive: true });
for (const [d, def] of Object.entries(plan.domaines)) {
  const corps = sortie[d].join('\n').replace(/\n+$/, '');
  fs.writeFileSync(`docs/domaines/${d}.md`,
    `# ${def.titre ?? d}\n\n<!-- Sorti de CLAUDE.md, texte inchangé : décisions datées, mesures et pièges avec leur coût. Un ajout se range ici. -->\n\n${corps}\n`);
}
for (const [dossier, d] of Object.entries(plan.dossiers ?? {})) {
  const vers = path.relative(dossier, `docs/domaines/${d}.md`);
  fs.writeFileSync(path.join(dossier, 'CLAUDE.md'),
    `# ${dossier}\n\nChargé quand on lit un fichier de ce dossier. Règles, mesures et pièges du domaine :\n\n@${vers}\n`);
}
fs.writeFileSync(fichier, reste.join('\n'));
console.log('Écrit. Reste à faire à la main : l\'index « Où lire quoi » dans CLAUDE.md (voir LECONS.md, « Sessions économes »).');
