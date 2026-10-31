// Progression permanente : XP, niveaux, arbre de talents et reliques. Conservée entre les ascensions
// (localStorage `k2:progress`, exportée avec les autres données).

const KEY = 'k2:progress';
export const MAX_LEVEL = 10;

export const BRANCHES = [
  { id: 'end', name: 'Endurance', icon: 'ti-heart-rate-monitor' },
  { id: 'tec', name: 'Technique', icon: 'ti-tool' },
  { id: 'sur', name: 'Survie', icon: 'ti-flame' },
];

// Quatre talents par branche, à débloquer dans l'ordre (un point chacun).
export const SKILLS = [
  { id: 'end1', name: 'Souffle long', text: 'Récupère l’énergie 20 % plus vite.' },
  { id: 'end2', name: 'Cœur solide', text: 'Chaque pas coûte 12 % d’énergie en moins.' },
  { id: 'end3', name: 'Poumons d’altitude', text: 'Moins pénalisé sans oxygène.' },
  { id: 'end4', name: 'Marcheur', text: 'Marche 20 % plus vite, 20 % moins fatigué sur les pentes.' },
  { id: 'tec1', name: 'Quincaillerie', text: '+2 pitons tout de suite, et +3 par lot trouvé.' },
  { id: 'tec2', name: 'Corde longue', text: '+100 m de corde.' },
  { id: 'tec3', name: 'Maître des dévers', text: 'Les dévers coûtent 25 % d’énergie en moins.' },
  { id: 'tec4', name: 'Œil du guide', text: 'Mini-puzzles plus faciles, et plus d’XP.' },
  { id: 'sur1', name: 'Duvet d’oie', text: 'Perd la chaleur 20 % moins vite.' },
  { id: 'sur2', name: 'Bon appétit', text: 'Une ration rend 40 d’énergie au lieu de 32.' },
  { id: 'sur3', name: 'Instinct', text: 'Rafales et chutes de pierres annoncées plus tôt.' },
  { id: 'sur4', name: 'Dur à cuire', text: 'Après une chute : plus d’énergie et de chaleur, aucun vivre perdu.' },
];

// XP cumulée nécessaire pour atteindre le niveau l.
export const xpForLevel = l => 50 * (l - 1) * l;

export class Progress {
  constructor() {
    this.xp = 0;
    this.skills = [];
    this.relics = [];
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (d) this.replace(d, false);
    } catch { /* progression illisible : on repart de zéro */ }
  }

  replace(d, save = true) {
    this.xp = Number.isFinite(d.xp) ? Math.max(0, Math.floor(d.xp)) : 0;
    this.skills = (Array.isArray(d.skills) ? d.skills : []).filter(id => SKILLS.some(s => s.id === id));
    this.relics = Array.isArray(d.relics) ? d.relics.filter(id => typeof id === 'string') : [];
    if (save) this.save();
  }

  toJSON() { return { xp: this.xp, skills: this.skills, relics: this.relics }; }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this)); } catch { /* stockage indisponible */ } }

  get level() {
    let l = 1;
    while (l < MAX_LEVEL && this.xp >= xpForLevel(l + 1)) l++;
    return l;
  }
  get points() { return this.level - 1 - this.skills.length; }
  // Part de la barre d'XP du niveau en cours (0 à 1).
  get ratio() {
    const l = this.level;
    if (l >= MAX_LEVEL) return 1;
    return (this.xp - xpForLevel(l)) / (xpForLevel(l + 1) - xpForLevel(l));
  }

  addXp(n) {
    const before = this.level;
    this.xp += Math.max(0, Math.round(n));
    this.save();
    return this.level - before;
  }

  has(id) { return this.skills.includes(id); }
  // Un talent n'est achetable que si le précédent de sa branche est acquis.
  canBuy(id) {
    const i = SKILLS.findIndex(s => s.id === id);
    if (i < 0 || this.has(id) || this.points < 1) return false;
    return i % 4 === 0 || this.has(SKILLS[i - 1].id);
  }
  buy(id) {
    if (!this.canBuy(id)) return false;
    this.skills.push(id);
    this.save();
    return true;
  }

  hasRelic(id) { return this.relics.includes(id); }
  addRelic(id) { if (!this.hasRelic(id)) { this.relics.push(id); this.save(); } }
}
