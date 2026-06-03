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
  lintels: [],
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
  LEVEL.lintels = info.lintels ?? [];
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
 * Accumule un quad dans un batch { pos, uv, idx }.
 * flipWinding=true → normale +Y (sols FrontSide).
 * Pour les matériaux DoubleSide (murs, plafonds) le winding est indifférent.
 */
function pushQuad(batch, p0, p1, p2, p3, uRep, vRep, flipWinding) {
  const base = batch.pos.length / 3;
  batch.pos.push(
    p0.x, p0.y, p0.z,
    p1.x, p1.y, p1.z,
    p2.x, p2.y, p2.z,
    p3.x, p3.y, p3.z,
  );
  batch.uv.push(0, 0, uRep, 0, uRep, vRep, 0, vRep);
  if (flipWinding) {
    batch.idx.push(base, base+2, base+1, base, base+3, base+2);
  } else {
    batch.idx.push(base, base+1, base+2, base, base+2, base+3);
  }
}

function batchToMesh(batch, material) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(batch.pos), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(batch.uv), 2));
  geo.setIndex(batch.idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

// Échelles physiques (mètres par répétition de texture).
const CARPET_TILE = 2.0;
const CEIL_TILE = 1.2;
const WALL_TILE = 2.5;
const WALL_T = 0.60;  // épaisseur des murs (m)

/**
 * Construit toute la géométrie du niveau en 3 meshes fusionnés (floor / ceiling / wall),
 * soit 3 draw calls au lieu de plusieurs centaines. Chaque type de surface accumule
 * toute sa géométrie dans un seul BufferGeometry partagé.
 */
export function buildLevel(scene) {
  const group = new THREE.Group();
  group.name = 'level';
  const mats = buildSurfaceMaterials();

  const bFloor   = { pos: [], uv: [], idx: [] };
  const bCeil    = { pos: [], uv: [], idx: [] };
  const bWall    = { pos: [], uv: [], idx: [] };
  const v = (x, y, z) => new THREE.Vector3(x, y, z);

  // Sols et plafonds
  for (const c of LEVEL.cells) {
    const h = c.height ?? LEVEL.height;
    const xL = c.cx - c.width / 2, xR = c.cx + c.width / 2;
    const zT = c.cz - c.depth / 2, zB = c.cz + c.depth / 2;
    // Sol : normale +Y requiert winding inversé (FrontSide).
    pushQuad(bFloor, v(xL,0,zT), v(xR,0,zT), v(xR,0,zB), v(xL,0,zB), c.width/CARPET_TILE, c.depth/CARPET_TILE, true);
    pushQuad(bCeil,  v(xL,h,zT), v(xR,h,zT), v(xR,h,zB), v(xL,h,zB), c.width/CEIL_TILE,   c.depth/CEIL_TILE,   false);
  }

  // Pré-calcul pour les coins : endpoints des murs par axe.
  // Permet de distinguer les extrémités «coin» (mur perpendiculaire contigu)
  // des extrémités «ouverture» (bord de porte/couloir).
  const ek = (x, z) => `${Math.round(x * 100)},${Math.round(z * 100)}`;
  const vEndpts = new Set(); // endpoints des murs verticaux (x = cst)
  const hEndpts = new Set(); // endpoints des murs horizontaux (z = cst)
  for (const w of LEVEL.walls) {
    if (Math.abs(w.x2 - w.x1) < 0.01) {
      vEndpts.add(ek(w.x1, w.z1)); vEndpts.add(ek(w.x1, w.z2));
    } else {
      hEndpts.add(ek(w.x1, w.z1)); hEndpts.add(ek(w.x2, w.z1));
    }
  }

  // Murs (DoubleSide → winding indifférent).
  // Aux coins, le mur est prolongé de WALL_T/2 pour remplir le volume d'angle ;
  // l'embout est supprimé côté coin et conservé uniquement côté ouverture.
  for (const w of LEVEL.walls) {
    const h = LEVEL.height;
    const isVert = Math.abs(w.x2 - w.x1) < 0.01;
    let wx1 = w.x1, wz1 = w.z1, wx2 = w.x2, wz2 = w.z2;
    let capStart = true, capEnd = true;
    if (!isVert) {
      if (vEndpts.has(ek(w.x1, w.z1))) { wx1 -= WALL_T / 2; capStart = false; }
      if (vEndpts.has(ek(w.x2, w.z1))) { wx2 += WALL_T / 2; capEnd   = false; }
    } else {
      if (hEndpts.has(ek(w.x1, w.z1))) { wz1 -= WALL_T / 2; capStart = false; }
      if (hEndpts.has(ek(w.x1, w.z2))) { wz2 += WALL_T / 2; capEnd   = false; }
    }
    const wdx = wx2 - wx1, wdz = wz2 - wz1;
    const wlen = Math.hypot(wdx, wdz);
    if (wlen < 0.01) continue;
    const nx = -wdz / wlen, nz = wdx / wlen;
    const hT = WALL_T / 2;
    const x1m = wx1 - nx*hT, z1m = wz1 - nz*hT;
    const x1p = wx1 + nx*hT, z1p = wz1 + nz*hT;
    const x2m = wx2 - nx*hT, z2m = wz2 - nz*hT;
    const x2p = wx2 + nx*hT, z2p = wz2 + nz*hT;
    pushQuad(bWall, v(x1m,0,z1m), v(x2m,0,z2m), v(x2m,h,z2m), v(x1m,h,z1m), wlen/WALL_TILE, h/WALL_TILE, false);
    pushQuad(bWall, v(x1p,0,z1p), v(x2p,0,z2p), v(x2p,h,z2p), v(x1p,h,z1p), wlen/WALL_TILE, h/WALL_TILE, false);
    if (capStart) pushQuad(bWall, v(x1m,0,z1m), v(x1p,0,z1p), v(x1p,h,z1p), v(x1m,h,z1m), WALL_T/WALL_TILE, h/WALL_TILE, false);
    if (capEnd)   pushQuad(bWall, v(x2m,0,z2m), v(x2p,0,z2p), v(x2p,h,z2p), v(x2m,h,z2m), WALL_T/WALL_TILE, h/WALL_TILE, false);
  }

  // Colonnes portantes
  for (const pl of LEVEL.pillars) {
    const h = LEVEL.height;
    const hs = pl.size / 2;
    const uv = pl.size / WALL_TILE;
    pushQuad(bWall, v(pl.cx-hs,0,pl.cz-hs), v(pl.cx+hs,0,pl.cz-hs), v(pl.cx+hs,h,pl.cz-hs), v(pl.cx-hs,h,pl.cz-hs), uv, h/WALL_TILE, false);
    pushQuad(bWall, v(pl.cx-hs,0,pl.cz+hs), v(pl.cx+hs,0,pl.cz+hs), v(pl.cx+hs,h,pl.cz+hs), v(pl.cx-hs,h,pl.cz+hs), uv, h/WALL_TILE, false);
    pushQuad(bWall, v(pl.cx-hs,0,pl.cz-hs), v(pl.cx-hs,0,pl.cz+hs), v(pl.cx-hs,h,pl.cz+hs), v(pl.cx-hs,h,pl.cz-hs), uv, h/WALL_TILE, false);
    pushQuad(bWall, v(pl.cx+hs,0,pl.cz-hs), v(pl.cx+hs,0,pl.cz+hs), v(pl.cx+hs,h,pl.cz+hs), v(pl.cx+hs,h,pl.cz-hs), uv, h/WALL_TILE, false);
  }

  // Linteaux
  for (const l of LEVEL.lintels) {
    const hLow = l.height, hHigh = LEVEL.height;
    if (hHigh - hLow < 0.05) continue;
    const hT = WALL_T / 2;
    const bandH = hHigh - hLow;
    if (l.axis === 'x') {
      const span = l.b - l.a;
      pushQuad(bWall, v(l.line-hT,hLow,l.a), v(l.line-hT,hLow,l.b), v(l.line-hT,hHigh,l.b), v(l.line-hT,hHigh,l.a), span/WALL_TILE, bandH/WALL_TILE, false);
      pushQuad(bWall, v(l.line+hT,hLow,l.a), v(l.line+hT,hLow,l.b), v(l.line+hT,hHigh,l.b), v(l.line+hT,hHigh,l.a), span/WALL_TILE, bandH/WALL_TILE, false);
      pushQuad(bCeil,  v(l.line-hT,hLow,l.a), v(l.line+hT,hLow,l.a), v(l.line+hT,hLow,l.b), v(l.line-hT,hLow,l.b), WALL_T/CEIL_TILE, span/CEIL_TILE, false);
    } else {
      const span = l.b - l.a;
      pushQuad(bWall, v(l.a,hLow,l.line-hT), v(l.b,hLow,l.line-hT), v(l.b,hHigh,l.line-hT), v(l.a,hHigh,l.line-hT), span/WALL_TILE, bandH/WALL_TILE, false);
      pushQuad(bWall, v(l.a,hLow,l.line+hT), v(l.b,hLow,l.line+hT), v(l.b,hHigh,l.line+hT), v(l.a,hHigh,l.line+hT), span/WALL_TILE, bandH/WALL_TILE, false);
      pushQuad(bCeil,  v(l.a,hLow,l.line-hT), v(l.b,hLow,l.line-hT), v(l.b,hLow,l.line+hT), v(l.a,hLow,l.line+hT), span/CEIL_TILE, WALL_T/CEIL_TILE, false);
    }
  }

  // Construire 3 meshes fusionnés (1 par matériau = 3 draw calls au total).
  for (const [batch, mat] of [[bFloor, mats.floor], [bCeil, mats.ceiling], [bWall, mats.wall]]) {
    if (!batch.idx.length) continue;
    group.add(batchToMesh(batch, mat));
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
