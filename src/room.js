import * as THREE from 'three';
import { buildMaterials } from './materials.js';

// Dimensions de la pièce (mètres). Origine = centre du sol.
// Objet MUTABLE partagé : les autres modules importent cette référence et lisent
// ROOM.width/depth/height au moment de l'appel. On la met à jour via applyRoomDims()
// lors d'une régénération, sans jamais remplacer l'objet (les imports restent valides).
export const ROOM = {
  width: 10, // axe X
  depth: 7, // axe Z
  height: 3, // axe Y
};

/** Met à jour les dimensions de la pièce en place (préserve la référence ROOM). */
export function applyRoomDims({ width, depth, height }) {
  if (width != null) ROOM.width = width;
  if (depth != null) ROOM.depth = depth;
  if (height != null) ROOM.height = height;
  return ROOM;
}

/** Détruit une pièce construite par buildRoom : retire le groupe et libère GPU. */
export function disposeRoom(scene, room) {
  if (!room?.group) return;
  scene.remove(room.group);
  room.group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const k of ['map', 'normalMap', 'roughnessMap']) m[k]?.dispose?.();
      m.dispose();
    }
  });
}

/**
 * Construit la coque fermée de la pièce (sol, plafond, 4 murs) + plinthes.
 * Retourne le groupe et conserve des références pour l'échange de matériaux ultérieur.
 */
export function buildRoom(scene) {
  const { width: w, depth: d, height: h } = ROOM;
  const group = new THREE.Group();
  group.name = 'room';

  const surfaces = {};

  const addSurface = (key, geo, mat, pos, rot) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...pos);
    if (rot) mesh.rotation.set(...rot);
    mesh.name = key;
    group.add(mesh);
    surfaces[key] = mesh;
    return mesh;
  };

  const mats = buildMaterials(ROOM);

  // Sol (normale vers le haut)
  addSurface('floor', new THREE.PlaneGeometry(w, d), mats.floor, [0, 0, 0], [-Math.PI / 2, 0, 0]);
  // Plafond (normale vers le bas)
  addSurface('ceiling', new THREE.PlaneGeometry(w, d), mats.ceiling, [0, h, 0], [Math.PI / 2, 0, 0]);
  // Mur fond -Z (normale +Z, orientation par défaut)
  addSurface('wall_back', new THREE.PlaneGeometry(w, h), mats.wallWide, [0, h / 2, -d / 2], null);
  // Mur avant +Z (retourné, normale -Z)
  addSurface('wall_front', new THREE.PlaneGeometry(w, h), mats.wallWide, [0, h / 2, d / 2], [0, Math.PI, 0]);
  // Mur gauche -X (normale +X)
  addSurface('wall_left', new THREE.PlaneGeometry(d, h), mats.wallNarrow, [-w / 2, h / 2, 0], [0, Math.PI / 2, 0]);
  // Mur droit +X (normale -X)
  addSurface('wall_right', new THREE.PlaneGeometry(d, h), mats.wallNarrow, [w / 2, h / 2, 0], [0, -Math.PI / 2, 0]);

  // Pas de plinthes : dans l'esthétique backrooms le papier peint descend
  // directement jusqu'à la moquette. Des plinthes sombres créaient une bande
  // noire indésirable à la jonction mur/sol.

  scene.add(group);
  return { group, surfaces };
}
