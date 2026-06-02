import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { ROOM } from './room.js';

RectAreaLightUniformsLib.init();

// Teinte fluorescente blanc-jaune légèrement maladive, signature des backrooms.
const FLUO_COLOR = 0xfff6d8;

/**
 * Éclairage de base (étape 3) : look plat, régulier, liminal.
 * - AmbientLight : remplissage uniforme (pas d'ombres, rendu plat).
 * - HemisphereLight : très léger gradient haut/bas pour ne pas être totalement plat.
 * - Fog : voile jaunâtre qui ajoute profondeur et angoisse.
 */
export function setupBaseLighting(scene) {
  const ambient = new THREE.AmbientLight(FLUO_COLOR, 0.55);
  ambient.name = 'ambient';
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(FLUO_COLOR, 0x6b5a3e, 0.35);
  hemi.name = 'hemi';
  hemi.position.set(0, ROOM.height, 0);
  scene.add(hemi);

  // Brouillard discret teinté pour la profondeur (la pièce est petite : far modéré)
  scene.fog = new THREE.Fog(0x161208, 4, 22);

  return { ambient, hemi };
}

// Dimensions d'un panneau néon (troffer) standard
const PANEL_W = 1.2; // axe X
const PANEL_D = 0.6; // axe Z

// Espacement cible entre centres de panneaux (m). La grille s'adapte aux dimensions.
const TARGET_SPACING = 3.2;

/**
 * Répartit n panneaux uniformément le long d'un axe de longueur L, centré sur 0.
 * Chaque panneau est au milieu de sa « cellule » → marges égales aux bords.
 */
function spread(n, L) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(((i + 0.5) / n) * L - L / 2);
  return out;
}

/**
 * Panneaux fluorescents disposés en grille au plafond, dimensionnée d'après la pièce.
 * Chaque troffer = un plan émissif (la surface qui brille) + une RectAreaLight
 * (lumière douce, plate, venue d'en haut → signature backrooms).
 * Retourne la liste des troffers pour animer le scintillement.
 */
export function addFluorescents(scene) {
  const y = ROOM.height - 0.02; // juste sous le plafond
  const baseIntensity = 4.5;

  // Nombre de panneaux par axe : ~1 tous les TARGET_SPACING m, borné pour que
  // l'espacement reste ≥ ~1,8 m (les panneaux de 1,2 m ne se chevauchent pas).
  const cols = Math.max(1, Math.min(Math.round(ROOM.width / TARGET_SPACING), Math.floor(ROOM.width / 1.8)));
  const rows = Math.max(1, Math.min(Math.round(ROOM.depth / TARGET_SPACING), Math.floor(ROOM.depth / 1.8)));
  const xs = spread(cols, ROOM.width);
  const zs = spread(rows, ROOM.depth);

  const panelMat = () =>
    new THREE.MeshBasicMaterial({ color: FLUO_COLOR, fog: false });

  // Cadre sombre autour des panneaux (lisière du troffer)
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xdedacb, roughness: 0.7 });

  const troffers = [];

  for (const x of xs) {
    for (const z of zs) {
      const group = new THREE.Group();
      group.name = 'troffer';

      // Cadre légèrement plus grand, collé au plafond
      const frame = new THREE.Mesh(
        new THREE.PlaneGeometry(PANEL_W + 0.12, PANEL_D + 0.12),
        frameMat
      );
      frame.rotation.x = Math.PI / 2; // face vers le bas
      frame.position.set(x, ROOM.height - 0.005, z);
      group.add(frame);

      // Surface émissive (le tube qui brille)
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W, PANEL_D), panelMat());
      panel.rotation.x = Math.PI / 2;
      panel.position.set(x, y, z);
      panel.name = 'panel';
      group.add(panel);

      // Lumière surfacique douce dirigée vers le sol
      const light = new THREE.RectAreaLight(FLUO_COLOR, baseIntensity, PANEL_W, PANEL_D);
      light.position.set(x, y - 0.01, z);
      light.lookAt(x, 0, z); // pointe vers le sol
      light.name = 'fluo';
      group.add(light);

      scene.add(group);
      troffers.push({
        group,
        panel,
        light,
        baseIntensity,
        baseColor: new THREE.Color(FLUO_COLOR),
        faulty: false,
        seed: troffers.length * 13.7,
      });
    }
  }

  // ~20 % des panneaux défaillent (scintillement), au moins 1 dès qu'il y en a ≥ 3.
  const faultyCount = troffers.length >= 3 ? Math.max(1, Math.round(troffers.length * 0.2)) : 0;
  const pool = troffers.map((_, i) => i);
  for (let n = 0; n < faultyCount && pool.length; n++) {
    const idx = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    troffers[idx].faulty = true;
  }

  return troffers;
}

/** Détruit une grille de néons : retire les groupes de la scène et libère le GPU. */
export function disposeFluorescents(scene, troffers) {
  for (const tr of troffers || []) {
    scene.remove(tr.group);
    tr.group.traverse((o) => {
      o.geometry?.dispose?.();
      o.material?.dispose?.();
    });
  }
}

/**
 * Animation de scintillement (étape 6). Appelée à chaque frame.
 * Les panneaux sains gardent un léger bourdonnement ; les défaillants
 * subissent des coupures brèves façon néon en fin de vie.
 */
export function updateFluorescents(troffers, t) {
  for (const tr of troffers) {
    let factor;
    if (tr.faulty) {
      // Bourdonnement rapide + coupures aléatoires brèves
      const buzz = 0.92 + 0.08 * Math.sin(t * 50 + tr.seed);
      const stutter = Math.sin(t * 6.1 + tr.seed) * Math.sin(t * 17.3 + tr.seed * 2);
      factor = stutter > 0.93 ? 0.12 : buzz;
    } else {
      // Très léger frémissement, à peine perceptible
      factor = 0.985 + 0.015 * Math.sin(t * 40 + tr.seed);
    }
    tr.light.intensity = tr.baseIntensity * factor;
    // La surface émissive (MeshBasic) suit la luminosité
    tr.panel.material.color.copy(tr.baseColor).multiplyScalar(0.25 + 0.75 * factor);
  }
}
