// Génération procédurale d'une pièce — système d'ARCHÉTYPES.
//
// Ancien système : on tirait surface + ratio dans des bornes serrées → toutes les
// pièces se ressemblaient (rectangles moyens proches du carré). Trop homogène.
//
// Nouveau système : on tire d'abord un TYPE de pièce (couloir, cagibi, grande
// salle, salle immense, galerie…), chacun avec ses propres plages de petit côté,
// d'allongement et de hauteur. Conséquences :
//   - des salles franchement différentes (couloirs très longs, halls immenses…)
//   - chaque pièce est IDENTIFIABLE : on sait dire « c'est un couloir »
//   - les proportions restent plausibles car bornées par archétype
//
// Pour ajouter un type : ajouter une entrée dans ARCHETYPES (voir le format).

const HALF = (v) => Math.round(v * 2) / 2;     // arrondi au 0,5 m
const ONE = (v) => Math.round(v);              // arrondi au mètre (grands côtés)
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// PRNG déterministe (mulberry32) → on peut rejouer une graine au besoin.
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Catalogue des archétypes.
//   short  : [min,max] longueur du PETIT côté (m)
//   ratio  : [min,max] allongement (grand côté / petit côté) — 1 = carré
//   height : [min,max] hauteur sous plafond (m)
//   weight : poids relatif de tirage (probabilité ∝ weight)
//   round  : 'half' (0,5 m) ou 'one' (1 m) — granularité des dimensions finales
//   label  : libellé court affiché à l'écran
//   desc   : phrase d'ambiance décrivant le type
const ARCHETYPES = [
  {
    id: 'closet', label: 'Cagibi', weight: 1.2,
    short: [2, 3], ratio: [1, 1.4], height: [2.3, 2.7], round: 'half',
    desc: 'Réduit exigu, plafond bas, sans issue apparente.',
  },
  {
    id: 'corridor', label: 'Couloir', weight: 2.4,
    short: [1.8, 3], ratio: [4.5, 9], height: [2.5, 3.1], round: 'one',
    desc: 'Long couloir étroit qui semble ne jamais finir.',
  },
  {
    id: 'gallery', label: 'Galerie', weight: 1.4,
    short: [5, 8], ratio: [2.2, 3.4], height: [3.2, 4], round: 'one',
    desc: 'Espace allongé et large, comme une galerie marchande.',
  },
  {
    id: 'small', label: 'Petite salle', weight: 1.8,
    short: [4, 6], ratio: [1, 1.4], height: [2.7, 3], round: 'half',
    desc: 'Pièce modeste, presque carrée.',
  },
  {
    id: 'medium', label: 'Salle moyenne', weight: 2.2,
    short: [6, 9], ratio: [1.1, 1.8], height: [2.9, 3.4], round: 'half',
    desc: 'Salle de bureau ordinaire, ni grande ni petite.',
  },
  {
    id: 'hall', label: 'Grande salle', weight: 1.6,
    short: [11, 16], ratio: [1, 1.6], height: [3.6, 4.6], round: 'one',
    desc: 'Vaste salle ouverte, plafond haut.',
  },
  {
    id: 'vast', label: 'Salle immense', weight: 1,
    short: [17, 24], ratio: [1, 1.5], height: [4.2, 6], round: 'one',
    desc: 'Étendue immense où les murs se perdent dans le brouillard.',
  },
];

const TOTAL_WEIGHT = ARCHETYPES.reduce((s, a) => s + a.weight, 0);

/** Choisit un archétype au hasard, pondéré par `weight`. */
function pickArchetype(rng) {
  let r = rng() * TOTAL_WEIGHT;
  for (const a of ARCHETYPES) {
    r -= a.weight;
    if (r <= 0) return a;
  }
  return ARCHETYPES[ARCHETYPES.length - 1];
}

const lerpIn = (rng, [lo, hi]) => lo + (hi - lo) * rng();

/**
 * Tire une pièce complète (dimensions + type identifié).
 * @param {number} [seed]      graine entière pour un tirage reproductible.
 * @param {string} [forceType] id d'archétype à forcer (debug) — sinon pondéré.
 * @returns {{width:number, depth:number, height:number, area:number, ratio:number,
 *            seed:number, typeId:string, type:string, desc:string}}
 */
export function generateRoom(seed, forceType) {
  const usedSeed = seed == null ? (Math.random() * 0xffffffff) >>> 0 : seed >>> 0;
  const rng = mulberry32(usedSeed);

  const arch = forceType
    ? ARCHETYPES.find((a) => a.id === forceType) || pickArchetype(rng)
    : pickArchetype(rng);

  const roundFn = arch.round === 'one' ? ONE : HALF;

  const short = clamp(lerpIn(rng, arch.short), 1.5, 26);
  const ratio = lerpIn(rng, arch.ratio);
  let shortSide = Math.max(1.5, roundFn(short));
  let longSide = Math.max(shortSide, roundFn(short * ratio));
  const height = HALF(lerpIn(rng, arch.height));

  // Le grand côté tombe aléatoirement sur X ou Z (oriente la pièce).
  const longOnX = rng() < 0.5;
  const width = longOnX ? longSide : shortSide;
  const depth = longOnX ? shortSide : longSide;

  return {
    width,
    depth,
    height,
    area: +(width * depth).toFixed(1),
    ratio: +(longSide / shortSide).toFixed(2),
    seed: usedSeed,
    typeId: arch.id,
    type: arch.label,
    desc: arch.desc,
  };
}

/** Liste des types disponibles (pour debug / forçage depuis la console). */
export const ROOM_TYPES = ARCHETYPES.map((a) => a.id);
