// Génération procédurale d'un NIVEAU — plusieurs pièces connectées.
//
// Deux modes de connexion entre pièces :
//   - « porte »   : deux pièces collées partageant un mur, percé d'une ouverture.
//   - « couloir » : une pièce de type Couloir (archétype) est intercalée entre deux
//                   pièces espacées. Le couloir EST une pièce à part entière (visible
//                   dans le HUD et sur la minimap), tiré depuis le catalogue ARCHETYPES.
//
// Le résultat est un objet « level » décrivant :
//   - cells   : toutes les cellules rectangulaires (pièces + couloirs), coords monde
//   - walls   : segments de murs PLEINS (union des bords - ouvertures) prêts à bâtir
//   - openings: ouvertures (portes / bouches de couloir) — pour info/debug
//   - rooms   : toutes les cellules (pièces ET couloirs sont des pièces au sens large)
//   - bounds, spawn, height, seed, roomCount, corridorCount
//
// Choix assumés :
//   - hauteur UNIFORME sur tout le niveau (évite les marches de plafond aux
//     jonctions et les fuites de lumière au-dessus d'une pièce plus basse) ;
//   - plus de déformation « warp » (incompatible avec le partage précis de murs).

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

// Catalogue des archétypes (footprint + hauteur). Cf. étape précédente.
//   short  : [min,max] longueur du PETIT côté (m)
//   ratio  : [min,max] allongement (grand côté / petit côté) — 1 = carré
//   height : [min,max] hauteur sous plafond (m)
//   weight : poids relatif de tirage (probabilité ∝ weight)
//   round  : 'half' (0,5 m) ou 'one' (1 m) — granularité des dimensions finales
const ARCHETYPES = [
  { id: 'closet', label: 'Cagibi', weight: 1.2, short: [2, 3], ratio: [1, 1.4], height: [2.3, 2.7], round: 'half', desc: 'Réduit exigu, plafond bas, sans issue apparente.' },
  { id: 'corridor', label: 'Couloir', weight: 2.0, short: [1.8, 3], ratio: [4.5, 9], height: [2.5, 3.1], round: 'one', desc: 'Long couloir étroit qui semble ne jamais finir.' },
  { id: 'gallery', label: 'Galerie', weight: 1.4, short: [5, 8], ratio: [2.2, 3.4], height: [3.2, 4], round: 'one', desc: 'Espace allongé et large, comme une galerie marchande.' },
  { id: 'small', label: 'Petite salle', weight: 1.8, short: [4, 6], ratio: [1, 1.4], height: [2.7, 3], round: 'half', desc: 'Pièce modeste, presque carrée.' },
  { id: 'medium', label: 'Salle moyenne', weight: 2.2, short: [6, 9], ratio: [1.1, 1.8], height: [2.9, 3.4], round: 'half', desc: 'Salle de bureau ordinaire, ni grande ni petite.' },
  { id: 'hall', label: 'Grande salle', weight: 1.6, short: [11, 16], ratio: [1, 1.6], height: [3.6, 4.6], round: 'one', desc: 'Vaste salle ouverte, plafond haut.' },
  { id: 'vast', label: 'Salle immense', weight: 1, short: [17, 24], ratio: [1, 1.5], height: [4.2, 6], round: 'one', desc: 'Étendue immense où les murs se perdent dans le brouillard.' },
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

/** Tire un footprint (largeur × profondeur + hauteur + type) sans le placer. */
function drawFootprint(rng) {
  const arch = pickArchetype(rng);
  const roundFn = arch.round === 'one' ? ONE : HALF;
  const short = clamp(lerpIn(rng, arch.short), 1.5, 26);
  const ratio = lerpIn(rng, arch.ratio);
  const shortSide = Math.max(1.5, roundFn(short));
  const longSide = Math.max(shortSide, roundFn(short * ratio));
  const height = HALF(lerpIn(rng, arch.height));
  const longOnX = rng() < 0.5;
  return {
    width: longOnX ? longSide : shortSide,
    depth: longOnX ? shortSide : longSide,
    height,
    type: arch.label,
    typeId: arch.id,
    desc: arch.desc,
  };
}

/** Tire un footprint depuis un archétype précis (sans tirage aléatoire de l'archétype). */
function drawFootprintForced(rng, archetypeId) {
  const arch = ARCHETYPES.find((a) => a.id === archetypeId) ?? ARCHETYPES[ARCHETYPES.length - 1];
  const roundFn = arch.round === 'one' ? ONE : HALF;
  const short = clamp(lerpIn(rng, arch.short), 1.5, 26);
  const ratio = lerpIn(rng, arch.ratio);
  const shortSide = Math.max(1.5, roundFn(short));
  const longSide = Math.max(shortSide, roundFn(short * ratio));
  return { shortSide, longSide, type: arch.label, typeId: arch.id, desc: arch.desc };
}

// --- Géométrie de placement -------------------------------------------------

const DOOR_W = 2.0;      // largeur d'une ouverture « porte » (m)
const MIN_MOUTH = 1.2;   // ouverture minimale praticable (m)

const rectOf = (c) => ({
  minX: c.cx - c.width / 2, maxX: c.cx + c.width / 2,
  minZ: c.cz - c.depth / 2, maxZ: c.cz + c.depth / 2,
});

/** Recouvrement d'aire strict (le partage d'un bord ne compte pas comme collision). */
function overlaps(a, b, eps = 0.05) {
  return a.minX < b.maxX - eps && a.maxX > b.minX + eps &&
         a.minZ < b.maxZ - eps && a.maxZ > b.minZ + eps;
}
function collidesAny(rect, cells, exceptIds = []) {
  return cells.some((c) => !exceptIds.includes(c.id) && overlaps(rect, rectOf(c)));
}

const makeOpening = (horiz, line, a, b) =>
  horiz ? { axis: 'x', line, a, b } : { axis: 'z', line, a, b };

/**
 * Tente de rattacher une nouvelle pièce à `base` sur un côté donné, selon le mode.
 * Retourne { room, corridor?, openings } ou null si le placement est invalide
 * (chevauchement avec une cellule existante, ou ouverture trop étroite).
 *
 * Abstraction d'axes : `v` = axe d'éloignement (perpendiculaire au mur partagé),
 * `u` = axe le long du mur partagé (la bouche/porte court le long de `u`).
 */
function tryAttach(base, side, mode, f, cells, idx, rng) {
  const horiz = side === 'E' || side === 'W';   // mur partagé vertical (x constant)
  const sign = (side === 'E' || side === 'S') ? 1 : -1;
  const b = rectOf(base);

  const rv = horiz ? f.width : f.depth;   // taille de la pièce le long de v
  const ru = horiz ? f.depth : f.width;   // taille de la pièce le long de u
  const baseU = horiz ? base.depth : base.width;

  // Pour un couloir, on tire un footprint 'corridor' depuis le catalogue.
  const corridorFp = mode === 'corridor' ? drawFootprintForced(rng, 'corridor') : null;

  // Largeur de la bouche/porte, bornée pour tenir dans les deux pièces.
  const rawMouth = mode === 'corridor' ? corridorFp.shortSide : DOOR_W;
  const mouthW = Math.min(rawMouth, baseU - 0.6, ru - 0.6);
  if (mouthW < MIN_MOUTH) return null;

  const cc = horiz ? base.cz : base.cx;                          // centre bouche (axe u)
  const lineV = horiz ? (side === 'E' ? b.maxX : b.minX)
                      : (side === 'S' ? b.maxZ : b.minZ);        // position mur base (axe v)
  const gap = mode === 'corridor' ? corridorFp.longSide : 0;
  const newCenterV = lineV + sign * (gap + rv / 2);

  const room = horiz
    ? { id: 'R' + idx, kind: 'room', cx: newCenterV, cz: cc, width: rv, depth: ru, type: f.type, typeId: f.typeId, desc: f.desc }
    : { id: 'R' + idx, kind: 'room', cx: cc, cz: newCenterV, width: ru, depth: rv, type: f.type, typeId: f.typeId, desc: f.desc };

  if (collidesAny(rectOf(room), cells, [base.id])) return null;

  const a0 = cc - mouthW / 2, a1 = cc + mouthW / 2;
  const openings = [];
  let corridor = null;

  if (mode === 'corridor') {
    const roomLineV = newCenterV - sign * rv / 2;   // bord de la nouvelle pièce côté base
    const cCenterV = (lineV + roomLineV) / 2;
    const cLen = Math.abs(roomLineV - lineV);
    corridor = horiz
      ? { id: 'R' + idx + '_C', kind: 'room', cx: cCenterV, cz: cc, width: cLen, depth: mouthW, type: corridorFp.type, typeId: corridorFp.typeId, desc: corridorFp.desc }
      : { id: 'R' + idx + '_C', kind: 'room', cx: cc, cz: cCenterV, width: mouthW, depth: cLen, type: corridorFp.type, typeId: corridorFp.typeId, desc: corridorFp.desc };
    if (collidesAny(rectOf(corridor), cells, [base.id, room.id])) return null;
    openings.push(makeOpening(horiz, lineV, a0, a1));      // bouche côté base
    openings.push(makeOpening(horiz, roomLineV, a0, a1));  // bouche côté nouvelle pièce
  } else {
    openings.push(makeOpening(horiz, lineV, a0, a1));      // porte dans le mur partagé
  }

  return { room, corridor, openings };
}

// --- Construction des murs (union des bords - ouvertures) --------------------

const pushMap = (map, key, val) => {
  const arr = map.get(key);
  if (arr) arr.push(val); else map.set(key, [val]);
};

/** Fusionne une liste d'intervalles [lo,hi] en intervalles disjoints triés. */
function unionIntervals(list, eps = 1e-4) {
  if (!list.length) return [];
  const s = list.map((i) => [Math.min(i[0], i[1]), Math.max(i[0], i[1])]).sort((a, b) => a[0] - b[0]);
  const out = [s[0].slice()];
  for (let k = 1; k < s.length; k++) {
    const cur = s[k], last = out[out.length - 1];
    if (cur[0] <= last[1] + eps) last[1] = Math.max(last[1], cur[1]);
    else out.push(cur.slice());
  }
  return out;
}

/** Soustrait des trous (intervalles) à une liste de segments (intervalles). */
function subtractIntervals(segs, holes, eps = 1e-4) {
  let res = segs.map((s) => s.slice());
  for (const h of holes) {
    const next = [];
    for (const s of res) {
      if (h[1] <= s[0] + eps || h[0] >= s[1] - eps) { next.push(s); continue; } // pas de recouvrement
      if (h[0] > s[0] + eps) next.push([s[0], h[0]]);
      if (h[1] < s[1] - eps) next.push([h[1], s[1]]);
    }
    res = next;
  }
  return res.filter((s) => s[1] - s[0] > 0.05);
}

/**
 * Produit la liste des segments de murs PLEINS du niveau.
 * Pour chaque droite (x donné = murs verticaux, z donné = murs horizontaux), on
 * prend l'UNION des bords de cellules présents, puis on retire les ouvertures.
 * Conséquences : les murs intérieurs partagés ne sont bâtis qu'une fois, et les
 * bouches de couloir / portes deviennent de vrais trous traversables.
 */
function buildWalls(cells, openings) {
  const key = (v) => Math.round(v * 100) / 100;
  const vx = new Map(), hz = new Map();           // bords groupés par ligne
  const vHoles = new Map(), hHoles = new Map();   // ouvertures groupées par ligne

  for (const c of cells) {
    const r = rectOf(c);
    pushMap(vx, key(r.minX), [r.minZ, r.maxZ]);
    pushMap(vx, key(r.maxX), [r.minZ, r.maxZ]);
    pushMap(hz, key(r.minZ), [r.minX, r.maxX]);
    pushMap(hz, key(r.maxZ), [r.minX, r.maxX]);
  }
  for (const o of openings) {
    if (o.axis === 'x') pushMap(vHoles, key(o.line), [o.a, o.b]);
    else pushMap(hHoles, key(o.line), [o.a, o.b]);
  }

  const walls = [];
  for (const [x, ivs] of vx) {
    const cover = unionIntervals(ivs);
    for (const s of subtractIntervals(cover, vHoles.get(x) || []))
      walls.push({ x1: x, z1: s[0], x2: x, z2: s[1] });
  }
  for (const [z, ivs] of hz) {
    const cover = unionIntervals(ivs);
    for (const s of subtractIntervals(cover, hHoles.get(z) || []))
      walls.push({ x1: s[0], z1: z, x2: s[1], z2: z });
  }
  return walls;
}

function computeBounds(cells) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const c of cells) {
    const r = rectOf(c);
    minX = Math.min(minX, r.minX); maxX = Math.max(maxX, r.maxX);
    minZ = Math.min(minZ, r.minZ); maxZ = Math.max(maxZ, r.maxZ);
  }
  return { minX, maxX, minZ, maxZ };
}

const SIDES = ['N', 'S', 'E', 'W'];

// --- Génération des poutres / colonnes --------------------------------------

const PILLAR_ARCHETYPES = new Set(['hall', 'vast', 'gallery']);
const PILLAR_PROB = { hall: 0.65, vast: 0.85, gallery: 0.50 };

/**
 * Génère une grille de colonnes portantes pour une pièce éligible.
 * Renvoie un tableau de { cx, cz, size } (section carrée, hauteur = niveau entier).
 */
function generatePillars(room, rng) {
  if (!PILLAR_ARCHETYPES.has(room.typeId)) return [];
  if (rng() > (PILLAR_PROB[room.typeId] ?? 0)) return [];

  const MARGIN = 1.5;
  const shortSide = Math.min(room.width, room.depth);
  // Taille proportionnelle à la pièce, avec variation aléatoire.
  const size = Math.max(0.28, 0.28 + (shortSide / 22) * 0.32 + rng() * 0.10);
  // Espacement qui grandit avec la taille de la pièce.
  const spacing = shortSide * 0.45 + 2.0 + rng() * 1.0;

  const usableW = room.width - MARGIN * 2;
  const usableD = room.depth - MARGIN * 2;
  if (usableW < 0.5 || usableD < 0.5) return [];

  const countX = Math.max(1, Math.round(usableW / spacing));
  const countZ = Math.max(1, Math.round(usableD / spacing));
  const stepX = usableW / countX;
  const stepZ = usableD / countZ;

  const ox = room.cx - room.width / 2 + MARGIN;
  const oz = room.cz - room.depth / 2 + MARGIN;
  const pillars = [];
  for (let ix = 0; ix < countX; ix++) {
    for (let iz = 0; iz < countZ; iz++) {
      pillars.push({
        cx: ox + (ix + 0.5) * stepX,
        cz: oz + (iz + 0.5) * stepZ,
        size,
      });
    }
  }
  return pillars;
}

/**
 * Génère un niveau complet : 2 à 3 pièces connectées (modes porte + couloir mêlés).
 * En mode « couloir », la pièce de liaison est tirée depuis l'archétype Couloir et
 * apparaît dans la liste rooms comme n'importe quelle autre pièce.
 * @param {number} [seed] graine entière pour un tirage reproductible.
 */
export function generateLevel(seed) {
  const usedSeed = seed == null ? (Math.random() * 0xffffffff) >>> 0 : seed >>> 0;
  const rng = mulberry32(usedSeed);

  const targetRooms = rng() < 0.5 ? 2 : 3;

  // Pièce de départ centrée à l'origine (le joueur y apparaît).
  const f0 = drawFootprint(rng);
  const levelHeight = f0.height;
  const r0 = { id: 'R0', kind: 'room', cx: 0, cz: 0, width: f0.width, depth: f0.depth, type: f0.type, typeId: f0.typeId, desc: f0.desc };

  const cells = [r0];
  const rooms = [r0];
  const openings = [];

  let placed = 1;
  let guard = 0;
  while (placed < targetRooms && guard++ < 60) {
    // On choisit la base parmi les pièces non-couloir pour éviter d'enchaîner
    // les couloirs les uns aux autres.
    const nonCorridors = rooms.filter((r) => r.typeId !== 'corridor');
    const base = (nonCorridors.length ? nonCorridors : rooms)[Math.floor(rng() * (nonCorridors.length || rooms.length))];
    const mode = rng() < 0.5 ? 'door' : 'corridor';
    const side = SIDES[Math.floor(rng() * SIDES.length)];
    const f = drawFootprint(rng);
    const res = tryAttach(base, side, mode, f, cells, placed, rng);
    if (!res) continue;
    if (res.corridor) {
      cells.push(res.corridor);
      rooms.push(res.corridor);   // le couloir est une pièce à part entière
    }
    cells.push(res.room);
    openings.push(...res.openings);
    rooms.push(res.room);
    placed++;
  }

  const walls = buildWalls(cells, openings);
  const corridorCount = rooms.filter((r) => r.typeId === 'corridor').length;
  const roomCount = rooms.filter((r) => r.typeId !== 'corridor').length;

  // Poutres/colonnes — générées après placement pour ne pas perturber le RNG du layout.
  const pillars = [];
  for (const room of rooms) pillars.push(...generatePillars(room, rng));

  return {
    seed: usedSeed,
    height: levelHeight,
    cells,
    walls,
    openings,
    rooms,
    roomCount,
    corridorCount,
    pillars,
    bounds: computeBounds(cells),
    spawn: { x: 0, z: 0 },
  };
}

/** Liste des types disponibles (pour debug). */
export const ROOM_TYPES = ARCHETYPES.map((a) => a.id);
