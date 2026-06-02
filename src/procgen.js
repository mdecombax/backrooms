// Génération procédurale des dimensions d'une pièce.
//
// « Système intelligent » : on ne tire pas width/depth indépendamment (ça
// produirait des couloirs de 1 m ou des hangars de 1 km²). On contraint
// d'abord la SURFACE puis le RATIO d'allongement, ce qui garantit des pièces
// toujours plausibles :
//   - surface bornée   → ni minuscule ni gigantesque
//   - ratio borné      → ni couloir extrême ni carré pur systématique
//   - dimensions bornées + arrondies au demi-mètre → valeurs « propres »

// Bornes de l'espace de tirage (mètres / mètres²).
const DIM_MIN = 4;     // aucun côté plus court que 4 m
const DIM_MAX = 15;    // aucun côté plus long que 15 m
const AREA_MIN = 28;   // ~5.3 m de côté minimum
const AREA_MAX = 130;  // ~11.4 m de côté maximum
const RATIO_MAX = 2.2; // allongement max (long / court)
const HEIGHT = 3;      // hauteur fixe pour l'instant

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;
const halfStep = (v) => Math.round(v * 2) / 2; // arrondi au 0,5 m

// PRNG déterministe (mulberry32) pour pouvoir rejouer une graine au besoin.
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Tire les dimensions d'une pièce.
 * @param {number} [seed] graine entière pour un tirage reproductible ; sinon aléatoire.
 * @returns {{width:number, depth:number, height:number, area:number, ratio:number, seed:number}}
 */
export function generateRoom(seed) {
  const usedSeed = seed == null ? (Math.random() * 0xffffffff) >>> 0 : seed >>> 0;
  const rng = mulberry32(usedSeed);

  // Surface biaisée vers le bas (rng² ) : on préfère des pièces de taille modeste,
  // les grandes restent possibles mais rares — plus cohérent avec des bureaux.
  const r = rng();
  const area = lerp(AREA_MIN, AREA_MAX, r * r);
  const ratio = lerp(1, RATIO_MAX, rng());

  // Surface = court × long, long = court × ratio  →  court = sqrt(area / ratio)
  let short = Math.sqrt(area / ratio);
  let long = short * ratio;

  short = halfStep(clamp(short, DIM_MIN, DIM_MAX));
  long = halfStep(clamp(long, DIM_MIN, DIM_MAX));

  // On répartit aléatoirement le grand côté sur X ou Z.
  const longOnX = rng() < 0.5;
  const width = longOnX ? long : short;
  const depth = longOnX ? short : long;

  return {
    width,
    depth,
    height: HEIGHT,
    area: +(width * depth).toFixed(1),
    ratio: +(long / short).toFixed(2),
    seed: usedSeed,
  };
}
