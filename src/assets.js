import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LEVEL } from './room.js';

const loader = new GLTFLoader();

function loadGLB(url) {
  return new Promise((resolve, reject) => {
    loader.load(url, (gltf) => resolve(gltf.scene), undefined, reject);
  });
}

/**
 * Charge le plafonnier Sketchfab et en place une copie centrée dans chaque
 * pièce (hors couloirs). Retourne la liste des modèles placés.
 */
export async function loadCeilingLamps(scene) {
  let template;
  try {
    template = await loadGLB('/assets/ceiling_lamp.glb');
  } catch (err) {
    console.error('[assets] Échec du chargement du plafonnier:', err);
    return [];
  }

  // Normalisation d'échelle sur le modèle source.
  const box0 = new THREE.Box3().setFromObject(template);
  const size0 = new THREE.Vector3();
  box0.getSize(size0);
  const horiz = Math.max(size0.x, size0.z) || 1;
  const s = 1.3 / horiz;
  template.scale.setScalar(s);

  const box1 = new THREE.Box3().setFromObject(template);
  const center1 = new THREE.Vector3();
  box1.getCenter(center1);
  template.position.set(-center1.x, 0, -center1.z); // recentrage horizontal
  template.userData.topY = box1.max.y;

  const models = [];
  for (const room of LEVEL.rooms) {
    const model = template.clone(true);
    model.position.x = room.cx;
    model.position.z = room.cz;
    model.position.y = LEVEL.height - template.userData.topY;
    model.name = 'ceiling_lamp';
    scene.add(model);
    models.push(model);
  }
  return models;
}

/** Recolle les plafonniers au plafond courant après régénération. */
export function repositionCeilingLamps(models) {
  for (const m of models || []) {
    const topY = m.userData?.topY ?? 0;
    m.position.y = LEVEL.height - topY;
  }
}

/** Retire et libère les plafonniers. */
export function disposeCeilingLamps(scene, models) {
  for (const m of models || []) {
    scene.remove(m);
    m.traverse((o) => { o.geometry?.dispose?.(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((mat) => mat.dispose()); });
  }
}
