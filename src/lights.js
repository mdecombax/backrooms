import * as THREE from 'three';
import { LEVEL } from './room.js';

const FLUO_COLOR = 0xfff6d8;

export function setupBaseLighting(scene) {
  const ambient = new THREE.AmbientLight(FLUO_COLOR, 1.1);
  ambient.name = 'ambient';
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(FLUO_COLOR, 0x6b5a3e, 0.65);
  hemi.name = 'hemi';
  hemi.position.set(0, LEVEL.height, 0);
  scene.add(hemi);

  scene.fog = new THREE.Fog(0x161208, 4, 22);

  return { ambient, hemi };
}

const PANEL_W = 1.2;
const PANEL_D = 0.55;
const TARGET_SPACING = 3.2;
const MAX_PER_CELL = 12;   // cap pour les grandes salles
const HALO_W = 4.0;
const HALO_D = 2.5;

function spread(n, L, center) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(center - L / 2 + ((i + 0.5) / n) * L);
  return out;
}

function makeHaloTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2, cy = size / 2, rx = size / 2, ry = size / 2;
  // Dégradé radial centre → bord transparent
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
  grad.addColorStop(0,    'rgba(255,252,235,0.72)');
  grad.addColorStop(0.3,  'rgba(255,250,220,0.38)');
  grad.addColorStop(0.65, 'rgba(255,246,216,0.10)');
  grad.addColorStop(1,    'rgba(255,246,216,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

let _haloTex = null;
function haloTexture() {
  if (!_haloTex) _haloTex = makeHaloTexture();
  return _haloTex;
}

/**
 * Crée des panneaux fluorescents pour chaque cellule du niveau.
 * Retourne la liste complète des troffers (pour animation + minimap).
 */
export function addFluorescents(scene) {
  const baseIntensity = 8;
  const lightDist = Math.max(LEVEL.height * 3.5, 10);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xdedacb, roughness: 0.7 });
  const panelMat = () => new THREE.MeshBasicMaterial({ color: FLUO_COLOR, fog: false });
  const cy = LEVEL.height - 0.02;
  const troffers = [];

  for (const c of LEVEL.cells) {
    const cols = Math.max(1, Math.min(Math.round(c.width / TARGET_SPACING), Math.floor(c.width / 1.8)));
    const rows = Math.max(1, Math.min(Math.round(c.depth / TARGET_SPACING), Math.floor(c.depth / 1.8)));

    // Grille idéale, puis on écrête si trop de lampes dans la cellule.
    const positions = [];
    const xs = spread(cols, c.width, c.cx);
    const zs = spread(rows, c.depth, c.cz);
    for (const x of xs) for (const z of zs) positions.push([x, z]);

    // Sous-échantillonner si on dépasse le cap.
    const step = positions.length > MAX_PER_CELL
      ? Math.ceil(positions.length / MAX_PER_CELL)
      : 1;
    const kept = positions.filter((_, i) => i % step === 0);

    for (const [x, z] of kept) {
      const group = new THREE.Group();
      group.name = 'troffer';

      const frame = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W + 0.12, PANEL_D + 0.12), frameMat);
      frame.rotation.x = Math.PI / 2;
      frame.position.set(x, cy + 0.015, z);
      group.add(frame);

      const panel = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W, PANEL_D), panelMat());
      panel.rotation.x = Math.PI / 2;
      panel.position.set(x, cy, z);
      panel.name = 'panel';
      group.add(panel);

      const light = new THREE.PointLight(FLUO_COLOR, baseIntensity, lightDist, 2);
      light.position.set(x, cy - 0.15, z);
      light.name = 'fluo';
      group.add(light);

      // Halo doux sur le plafond (simulé sans RectAreaLight)
      const haloMat = new THREE.MeshBasicMaterial({
        map: haloTexture(),
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        fog: false,
      });
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(HALO_W, HALO_D), haloMat);
      halo.rotation.x = Math.PI / 2;
      halo.position.set(x, cy - 0.005, z);
      halo.name = 'halo';
      group.add(halo);

      scene.add(group);
      troffers.push({ group, panel, halo, light, baseIntensity, baseColor: new THREE.Color(FLUO_COLOR), faulty: false, seed: troffers.length * 13.7 });
    }
  }

  const faultyCount = troffers.length >= 3 ? Math.max(1, Math.round(troffers.length * 0.2)) : 0;
  const pool = troffers.map((_, i) => i);
  for (let n = 0; n < faultyCount && pool.length; n++) {
    const idx = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    troffers[idx].faulty = true;
  }
  return troffers;
}

export function disposeFluorescents(scene, troffers) {
  for (const tr of troffers || []) {
    scene.remove(tr.group);
    tr.group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
  }
}

export function updateFluorescents(troffers, t) {
  for (const tr of troffers) {
    let factor;
    if (tr.faulty) {
      const buzz = 0.92 + 0.08 * Math.sin(t * 50 + tr.seed);
      const stutter = Math.sin(t * 6.1 + tr.seed) * Math.sin(t * 17.3 + tr.seed * 2);
      factor = stutter > 0.93 ? 0.12 : buzz;
    } else {
      factor = 0.985 + 0.015 * Math.sin(t * 40 + tr.seed);
    }
    tr.light.intensity = tr.baseIntensity * factor;
    tr.panel.material.color.copy(tr.baseColor).multiplyScalar(0.25 + 0.75 * factor);
    tr.halo.material.opacity = 0.2 + 0.8 * factor;
  }
}
