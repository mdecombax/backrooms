import * as THREE from 'three';
import { buildSurfaceMaterials } from './materials.js';

// État MUTABLE partagé décrivant le NIVEAU courant (plusieurs pièces connectées).
// Les autres modules importent cette référence et lisent LEVEL.* au moment de
// l'appel. On la met à jour via applyLevel() sans jamais remplacer l'objet (les
// imports restent valides).
//
//   cells   : toutes les cellules rectangulaires, coords monde (pièces et couloirs)
//   walls   : segments de murs pleins {x1,z1,x2,z2} (déjà privés des ouvertures)
//   rooms   : toutes les pièces du niveau, couloirs inclus (typeId='corridor')
//   height  : hauteur sous plafond UNIFORME du niveau (m)
//   bounds  : {minX,maxX,minZ,maxZ} emprise totale
//   spawn   : {x,z} point d'apparition du joueur
export const LEVEL = {
  cells: [],
  walls: [],
  openings: [],
  rooms: [],
  pillars: [],
  height: 3,
  roomCount: 1,
  corridorCount: 0,
  bounds: { minX: -5, maxX: 5, minZ: -3.5, maxZ: 3.5 },
  spawn: { x: 0, z: 0 },
  seed: 0,
};

/** Met à jour le niveau en place (préserve la référence LEVEL). */
export function applyLevel(info) {
  LEVEL.cells = info.cells;
  LEVEL.walls = info.walls;
  LEVEL.openings = info.openings;
  LEVEL.rooms = info.rooms;
  LEVEL.pillars = info.pillars ?? [];
  LEVEL.height = info.height;
  LEVEL.roomCount = info.roomCount;
  LEVEL.corridorCount = info.corridorCount;
  LEVEL.bounds = info.bounds;
  LEVEL.spawn = info.spawn;
  LEVEL.seed = info.seed;
  return LEVEL;
}

/** Hauteur du plafond (uniforme sur le niveau). */
export function ceilingHeight() {
  return LEVEL.height;
}

/**
 * Construit un quad (4 sommets, 2 triangles). Les UV vont de 0 à (uRep, vRep) →
 * le tiling de la texture suit la taille réelle de la surface, avec un seul
 * matériau partagé (wrap RepeatWrapping, repeat 1×1).
 * @param {?THREE.Vector3} interior si fourni, on oriente la normale vers ce point
 *        (sol/plafond, FrontSide). Si null, winding fixe (murs DoubleSide).
 */
function quad(p0, p1, p2, p3, material, uRep, vRep, interior) {
  const pts = [p0, p1, p2, p3];
  let index = [0, 1, 2, 0, 2, 3];
  if (interior) {
    const e1 = new THREE.Vector3().subVectors(p1, p0);
    const e2 = new THREE.Vector3().subVectors(p2, p0);
    const n = new THREE.Vector3().crossVectors(e1, e2);
    const toIn = new THREE.Vector3().subVectors(interior, p0);
    if (n.dot(toIn) < 0) index = [0, 2, 1, 0, 3, 2];
  }
  const positions = new Float32Array(12);
  pts.forEach((p, i) => { positions[i * 3] = p.x; positions[i * 3 + 1] = p.y; positions[i * 3 + 2] = p.z; });
  const uv = new Float32Array([0, 0, uRep, 0, uRep, vRep, 0, vRep]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

// Échelles physiques (mètres par répétition de texture).
const CARPET_TILE = 2.0;
const CEIL_TILE = 1.2;
const WALL_TILE = 2.5;
const WALL_T = 0.60;  // épaisseur des murs (m)

/**
 * Construit toute la géométrie du niveau : pour chaque cellule un sol + un
 * plafond ; pour chaque segment de mur plein un quad vertical (DoubleSide, car
 * un mur intérieur partagé est vu des deux pièces).
 * Retourne { group, materials } — materials est libéré par disposeLevel.
 */
export function buildLevel(scene) {
  const group = new THREE.Group();
  group.name = 'level';

  const mats = buildSurfaceMaterials();
  const h = LEVEL.height;

  for (const c of LEVEL.cells) {
    const xL = c.cx - c.width / 2, xR = c.cx + c.width / 2;
    const zT = c.cz - c.depth / 2, zB = c.cz + c.depth / 2;
    const interior = new THREE.Vector3(c.cx, h / 2, c.cz);

    // Sol (y = 0)
    group.add(quad(
      new THREE.Vector3(xL, 0, zT), new THREE.Vector3(xR, 0, zT),
      new THREE.Vector3(xR, 0, zB), new THREE.Vector3(xL, 0, zB),
      mats.floor, c.width / CARPET_TILE, c.depth / CARPET_TILE, interior,
    ));
    // Plafond (y = h)
    group.add(quad(
      new THREE.Vector3(xL, h, zT), new THREE.Vector3(xR, h, zT),
      new THREE.Vector3(xR, h, zB), new THREE.Vector3(xL, h, zB),
      mats.ceiling, c.width / CEIL_TILE, c.depth / CEIL_TILE, interior,
    ));
  }

  for (const w of LEVEL.walls) {
    const dx = w.x2 - w.x1, dz = w.z2 - w.z1;
    const len = Math.hypot(dx, dz);
    if (len < 0.01) continue;
    // Normale perpendiculaire au mur (dans le plan XZ).
    const nx = -dz / len, nz = dx / len;
    const hT = WALL_T / 2;
    const p = (x, y, z) => new THREE.Vector3(x, y, z);
    // Coins décalés de ±T/2 le long de la normale.
    const x1m = w.x1 - nx * hT, z1m = w.z1 - nz * hT;
    const x1p = w.x1 + nx * hT, z1p = w.z1 + nz * hT;
    const x2m = w.x2 - nx * hT, z2m = w.z2 - nz * hT;
    const x2p = w.x2 + nx * hT, z2p = w.z2 + nz * hT;
    // Face A et face B (les deux grandes faces du mur).
    group.add(quad(p(x1m,0,z1m), p(x2m,0,z2m), p(x2m,h,z2m), p(x1m,h,z1m), mats.wall, len/WALL_TILE, h/WALL_TILE, null));
    group.add(quad(p(x1p,0,z1p), p(x2p,0,z2p), p(x2p,h,z2p), p(x1p,h,z1p), mats.wall, len/WALL_TILE, h/WALL_TILE, null));
    // Bouchons aux extrémités.
    group.add(quad(p(x1m,0,z1m), p(x1p,0,z1p), p(x1p,h,z1p), p(x1m,h,z1m), mats.wall, WALL_T/WALL_TILE, h/WALL_TILE, null));
    group.add(quad(p(x2m,0,z2m), p(x2p,0,z2p), p(x2p,h,z2p), p(x2m,h,z2m), mats.wall, WALL_T/WALL_TILE, h/WALL_TILE, null));
  }

  // Colonnes portantes (section carrée, sol → plafond).
  for (const pl of LEVEL.pillars) {
    const hs = pl.size / 2;
    const p = (x, y, z) => new THREE.Vector3(x, y, z);
    const uv = pl.size / WALL_TILE;
    // Face N (z minimal)
    group.add(quad(p(pl.cx-hs,0,pl.cz-hs), p(pl.cx+hs,0,pl.cz-hs), p(pl.cx+hs,h,pl.cz-hs), p(pl.cx-hs,h,pl.cz-hs), mats.wall, uv, h/WALL_TILE, null));
    // Face S (z maximal)
    group.add(quad(p(pl.cx-hs,0,pl.cz+hs), p(pl.cx+hs,0,pl.cz+hs), p(pl.cx+hs,h,pl.cz+hs), p(pl.cx-hs,h,pl.cz+hs), mats.wall, uv, h/WALL_TILE, null));
    // Face W (x minimal)
    group.add(quad(p(pl.cx-hs,0,pl.cz-hs), p(pl.cx-hs,0,pl.cz+hs), p(pl.cx-hs,h,pl.cz+hs), p(pl.cx-hs,h,pl.cz-hs), mats.wall, uv, h/WALL_TILE, null));
    // Face E (x maximal)
    group.add(quad(p(pl.cx+hs,0,pl.cz-hs), p(pl.cx+hs,0,pl.cz+hs), p(pl.cx+hs,h,pl.cz+hs), p(pl.cx+hs,h,pl.cz-hs), mats.wall, uv, h/WALL_TILE, null));
  }

  scene.add(group);
  return { group, materials: mats };
}

/** Détruit la géométrie d'un niveau : retire le groupe et libère le GPU. */
export function disposeLevel(scene, built) {
  if (!built?.group) return;
  scene.remove(built.group);
  built.group.traverse((o) => { o.geometry?.dispose?.(); });
  const m = built.materials;
  for (const mat of [m?.floor, m?.ceiling, m?.wall]) {
    if (!mat) continue;
    for (const k of ['map', 'normalMap', 'roughnessMap']) mat[k]?.dispose?.();
    mat.dispose();
  }
}
