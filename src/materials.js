import * as THREE from 'three';

// Textures PBR réelles (CC0, ambientCG) — albedo + normal + roughness.
// Les UV portent désormais le tiling (repeat calculé par quad dans room.js) ;
// les textures sont configurées à repeat=1×1 et partagées sur tout le niveau.

const BASE = '/assets/textures';
const loader = new THREE.TextureLoader();

function loadMap(url, srgb = false) {
  const tex = loader.load(url);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.anisotropy = 8;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return tex;
}

function pbrMaterial(id, { color = 0xffffff, roughness = 1, normalScale = 1 } = {}) {
  const p = `${BASE}/${id}/${id}_1K-JPG`;
  const mat = new THREE.MeshStandardMaterial({
    map: loadMap(`${p}_Color.jpg`, true),
    normalMap: loadMap(`${p}_NormalGL.jpg`),
    roughnessMap: loadMap(`${p}_Roughness.jpg`),
    color: new THREE.Color(color),
    roughness,
    side: THREE.FrontSide,
  });
  mat.normalScale.set(normalScale, normalScale);
  return mat;
}

/**
 * Construit les trois matériaux PBR du niveau (partagés sur toutes les cellules).
 * Le tiling vient des UV de chaque quad — plus de dépendance aux dimensions ROOM.
 */
export function buildSurfaceMaterials() {
  const floor = pbrMaterial('Carpet016', { color: 0xb4a468, roughness: 0.9, normalScale: 1.0 });
  const ceiling = pbrMaterial('OfficeCeiling001', { color: 0xf5f2e8, roughness: 1.0, normalScale: 0.6 });
  const wall = pbrMaterial('PaintedPlaster017', { color: 0xe6d27a, roughness: 0.96, normalScale: 0.6 });
  wall.side = THREE.DoubleSide; // murs intérieurs vus des deux côtés
  return { floor, ceiling, wall };
}
