import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ROOM } from './room.js';

// Chargement des props 3D externes (pipeline Sketchfab).
// Les .glb sont servis depuis /public/assets par Vite.

const loader = new GLTFLoader();

function loadGLB(url) {
  return new Promise((resolve, reject) => {
    loader.load(url, (gltf) => resolve(gltf.scene), undefined, reject);
  });
}

/**
 * Charge le plafonnier Sketchfab et le pose au centre du plafond, normalisé
 * à une largeur cible (les modèles externes ont une échelle/orientation variable).
 * Retourne le mesh (ou null en cas d'échec, pour ne jamais bloquer la scène).
 */
export async function loadCeilingLamp(scene) {
  try {
    const model = await loadGLB('/assets/ceiling_lamp.glb');

    // Normalisation d'échelle : on ramène la plus grande dimension horizontale à ~1.3 m
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const targetW = 1.3;
    const horiz = Math.max(size.x, size.z) || 1;
    const s = targetW / horiz;
    model.scale.setScalar(s);

    // Recentrage + pose au plafond (centre libre entre les deux rangées de troffers)
    const box2 = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    box2.getCenter(center);
    model.position.x += -center.x;
    model.position.z += -center.z;
    // colle le haut du modèle au plafond
    model.position.y += ROOM.height - box2.max.y;

    model.name = 'ceiling_lamp_sketchfab';
    scene.add(model);
    return model;
  } catch (err) {
    console.error('[assets] Échec du chargement du plafonnier:', err);
    return null;
  }
}
