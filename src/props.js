import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const CHAIR_H   = 1.15; // hauteur cible normalisée (m)
const MARGIN    = 1.1;  // marge par rapport aux murs (m)
const SKIP_TYPES = new Set(['corridor', 'closet']);

const loader = new GLTFLoader();
let _templatePromise = null;

function loadTemplate() {
  if (_templatePromise) return _templatePromise;
  _templatePromise = new Promise((resolve, reject) => {
    loader.load('/assets/office_chair.glb', (gltf) => {
      const model = gltf.scene;
      // Normaliser à CHAIR_H
      const box = new THREE.Box3().setFromObject(model);
      const sz  = new THREE.Vector3();
      box.getSize(sz);
      const s = CHAIR_H / Math.max(sz.y, 0.01);
      model.scale.setScalar(s);
      // Stocker l'offset Y pour poser au sol sans modifier position (écrasé par clone)
      const box2 = new THREE.Box3().setFromObject(model);
      model.userData.yOffset = -box2.min.y;
      resolve(model);
    }, undefined, reject);
  });
  return _templatePromise;
}

// PRNG déterministe (LCG) depuis la graine du niveau.
function mkRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Place des chaises de bureau dans le niveau courant.
 * Utilise level.cells (après découpe en L) ; une seule chaise par groupId de pièce
 * en L pour éviter de placer dans le cran vide.
 * Retourne le groupe Three.js ajouté à la scène.
 */
export async function spawnChairs(scene, level) {
  const template = await loadTemplate();
  const group = new THREE.Group();
  group.name = 'props_chairs';

  const rng = mkRng((level.seed ^ 0x9e3779b9) >>> 0);

  const yOffset = template.userData.yOffset ?? 0;
  const seen = new Set();

  for (const cell of level.cells) {
    if (SKIP_TYPES.has(cell.typeId)) continue;

    // Pour les pièces découpées en L, ne traiter que la première partie.
    const gid = cell.groupId ?? cell.id;
    if (seen.has(gid)) continue;
    seen.add(gid);

    // ~35 % de chance qu'une pièce ait une chaise
    if (rng() > 0.35) continue;

    const uw = cell.width  - MARGIN * 2;
    const ud = cell.depth  - MARGIN * 2;
    if (uw < 0.5 || ud < 0.5) continue;

    const chair = template.clone(true);
    chair.position.set(
      cell.cx + (rng() - 0.5) * uw,
      yOffset,
      cell.cz + (rng() - 0.5) * ud,
    );
    chair.rotation.y = rng() * Math.PI * 2;
    group.add(chair);
  }

  scene.add(group);
  return group;
}

/**
 * Retire le groupe de la scène. Géométries et matériaux sont partagés
 * avec le template — on ne les dispose pas ici.
 */
export function disposeProps(scene, group) {
  if (group) scene.remove(group);
}

// ---- Câbles électriques -------------------------------------------------------

const ALL_WALLS = ['N', 'S', 'W', 'E'];

// Retourne un point collé contre le mur demandé d'une cellule, à ras du sol.
function wallPoint(rng, cell, wall) {
  const hw = cell.width / 2, hd = cell.depth / 2;
  const inset = 0.05;
  switch (wall) {
    case 'N': return new THREE.Vector3(cell.cx + (rng() - 0.5) * (cell.width  - inset * 2), 0, cell.cz - hd + inset);
    case 'S': return new THREE.Vector3(cell.cx + (rng() - 0.5) * (cell.width  - inset * 2), 0, cell.cz + hd - inset);
    case 'W': return new THREE.Vector3(cell.cx - hw + inset, 0, cell.cz + (rng() - 0.5) * (cell.depth - inset * 2));
    case 'E': return new THREE.Vector3(cell.cx + hw - inset, 0, cell.cz + (rng() - 0.5) * (cell.depth - inset * 2));
  }
}

// Choisit deux cellules aussi distantes que possible parmi l'ensemble.
function pickDistantCells(rng, cells) {
  if (cells.length < 2) return null;
  let bestA = cells[0], bestB = cells[1], bestDist = 0;
  for (let i = 0; i < 16; i++) {
    const a = cells[Math.floor(rng() * cells.length)];
    const b = cells[Math.floor(rng() * cells.length)];
    if (a === b) continue;
    const d = Math.hypot(a.cx - b.cx, a.cz - b.cz);
    if (d > bestDist) { bestDist = d; bestA = a; bestB = b; }
  }
  return bestDist > 4 ? [bestA, bestB] : null;
}

// Génère la courbe d'un câble long traversant tout le niveau.
function makeLongCablePath(rng, level) {
  const pair = pickDistantCells(rng, level.cells);
  if (!pair) return null;
  const [cellA, cellB] = pair;

  const wallA = ALL_WALLS[Math.floor(rng() * 4)];
  let wallB;
  do { wallB = ALL_WALLS[Math.floor(rng() * 4)]; } while (wallB === wallA);

  const start = wallPoint(rng, cellA, wallA);
  const end   = wallPoint(rng, cellB, wallB);

  const dx = end.x - start.x, dz = end.z - start.z;
  const axisLen = Math.sqrt(dx * dx + dz * dz);
  if (axisLen < 4) return null;

  const ux = dx / axisLen, uz = dz / axisLen;
  const perX = -uz, perZ = ux;

  // Points intermédiaires : 10 à 16 pour un tracé riche
  const nMid = 10 + Math.floor(rng() * 7);
  // Amplitude de serpentement : proportionnelle à la longueur, cap à 2,5 m
  const maxPerp = Math.min(axisLen * 0.10, 2.5);
  const minPerp = Math.max(0.35, maxPerp * 0.5);

  const pts = [];
  pts.push(new THREE.Vector3(start.x, 0.012 + rng() * 0.010, start.z));

  for (let i = 1; i <= nMid; i++) {
    const t = i / (nMid + 1);
    const bx = start.x + t * dx;
    const bz = start.z + t * dz;
    const sign = (i % 2 === 0 ? 1 : -1);
    const amp  = minPerp + rng() * (maxPerp - minPerp);
    pts.push(new THREE.Vector3(
      bx + perX * sign * amp,
      0.012 + rng() * 0.024,
      bz + perZ * sign * amp,
    ));
  }

  pts.push(new THREE.Vector3(end.x, 0.012 + rng() * 0.010, end.z));
  return pts;
}

export function spawnCables(scene, level) {
  const group = new THREE.Group();
  group.name = 'props_cables';
  const rng = mkRng((level.seed ^ 0xdeadbeef) >>> 0);

  const mat = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.90, metalness: 0.04 });
  group.userData.mat = mat;

  const count = 1 + Math.floor(rng() * 3); // 1, 2 ou 3 câbles par niveau

  for (let c = 0; c < count; c++) {
    const pts = makeLongCablePath(rng, level);
    if (!pts) continue;

    const curve = new THREE.CatmullRomCurve3(pts);
    const cableLen = curve.getLength();
    if (cableLen < 2) continue;

    const tubSegs = Math.max(40, Math.round(cableLen * 10));
    const radius  = 0.018 + rng() * 0.010;
    const geo  = new THREE.TubeGeometry(curve, tubSegs, radius, 6, false);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'cable';
    group.add(mesh);
  }

  scene.add(group);
  return group;
}

export function disposeCables(scene, group) {
  if (!group) return;
  scene.remove(group);
  group.children.forEach((o) => o.geometry?.dispose());
  group.userData.mat?.dispose();
}
