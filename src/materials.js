import * as THREE from 'three';

// Textures PBR réelles (CC0, ambientCG) — albedo + normal + roughness.
// Les surfaces sont des plans/teintes neutres : on tinte l'albedo clair via
// `color` pour obtenir la palette backrooms (moutarde) sans repeindre les maps.
// Voir CREDITS.md pour les sources.

const BASE = '/assets/textures';
const loader = new THREE.TextureLoader();

/**
 * Charge une map et la configure pour le tiling.
 * @param {boolean} srgb true pour l'albedo (couleur), false pour les données (normal/roughness).
 */
function loadMap(url, repeatX, repeatY, srgb = false) {
  const tex = loader.load(url);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 8;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return tex;
}

/** Construit un MeshStandardMaterial PBR à partir d'un set ambientCG. */
function pbrMaterial(id, { repeatX, repeatY, color = 0xffffff, roughness = 1, normalScale = 1 }) {
  const p = `${BASE}/${id}/${id}_1K-JPG`;
  const mat = new THREE.MeshStandardMaterial({
    map: loadMap(`${p}_Color.jpg`, repeatX, repeatY, true),
    normalMap: loadMap(`${p}_NormalGL.jpg`, repeatX, repeatY),
    roughnessMap: loadMap(`${p}_Roughness.jpg`, repeatX, repeatY),
    color: new THREE.Color(color),
    roughness,
  });
  mat.normalScale.set(normalScale, normalScale);
  return mat;
}

/** Construit les matériaux texturés en fonction des dimensions de la pièce. */
export function buildMaterials(ROOM) {
  const { width: w, depth: d, height: h } = ROOM;

  // Échelles physiques (mètres par répétition de la texture)
  const WALL_TILE = 2.5;
  const CARPET_TILE = 2.0;
  const CEIL_TILE = 1.2; // le set contient une grille 2×2 → ~0,6 m par dalle

  // Mur : plâtre peint clair tinté en jaune backrooms maladif.
  const wallMat = (sw) =>
    pbrMaterial('PaintedPlaster017', {
      repeatX: sw / WALL_TILE,
      repeatY: h / WALL_TILE,
      color: 0xe6d27a,
      roughness: 0.96,
      normalScale: 0.6,
    });

  // Sol : moquette beige laineuse tintée en moutarde sale et moite.
  const floorMat = pbrMaterial('Carpet016', {
    repeatX: w / CARPET_TILE,
    repeatY: d / CARPET_TILE,
    color: 0xb4a468,
    roughness: 0.9,
    normalScale: 1.0,
  });

  // Plafond : dalles acoustiques mouchetées, légèrement crème.
  const ceilingMat = pbrMaterial('OfficeCeiling001', {
    repeatX: w / CEIL_TILE,
    repeatY: d / CEIL_TILE,
    color: 0xece7d6,
    roughness: 1.0,
    normalScale: 0.8,
  });

  return {
    floor: floorMat,
    ceiling: ceilingMat,
    // mur fond/avant (largeur w) et murs latéraux (largeur d) → échelle horizontale différente
    wallWide: wallMat(w),
    wallNarrow: wallMat(d),
  };
}
