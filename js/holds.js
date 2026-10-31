// Les prises de la paroi : une suite de prises, chacune faite pour un membre (main ou pied, gauche ou droite).
// La suite est tirée de la graine de l'ascension : même graine, même parcours (règles pures, sans canvas).
//
// Principe : on déplace le membre resté le plus longtemps en arrière (le plus « vieux »). Avec quatre membres
// cela donne naturellement G, D, D, G, G, D, D, G… : deux appuis du même côté (pied gauche puis main gauche)
// reviennent régulièrement. De temps en temps, les deux plus vieux s'échangent : le parcours se varie.

export const LIMBS = ['hL', 'fR', 'hR', 'fL']; // main G, pied D, main D, pied G : du plus vieux au plus récent
export const STEP = 4; // mètres entre deux prises

const SWAP_CHANCE = 0.35;

function mix(n) {
  n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  n ^= n >>> 13;
  n = Math.imul(n, 0xc2b2ae35);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

// Génère les prises 0 … n (la prise 0 est le sol). Chaque prise : { limb, side, kind }.
export function limbSequence(seed, n) {
  const order = [...LIMBS];
  const out = [];
  for (let j = 0; j <= n; j++) {
    const idx = mix(seed * 7 + j * 13 + 5) < SWAP_CHANCE ? 1 : 0;
    const limb = order.splice(idx, 1)[0];
    order.push(limb);
    out.push({ limb, side: limb[1], kind: limb[0] === 'h' ? 'hand' : 'foot' });
  }
  return out;
}
