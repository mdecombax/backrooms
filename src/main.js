import * as THREE from 'three';
import { setupFpsControls } from './fpsControls.js';
import { setupDebug } from './debug.js';
import { buildLevel, disposeLevel, applyLevel, LEVEL } from './room.js';
import { setupBaseLighting, addFluorescents, updateFluorescents, disposeFluorescents } from './lights.js';
import { setupMinimap } from './minimap.js';
import { generateLevel } from './procgen.js';
import { setupRoomHud } from './roomHud.js';
import { setupAmbiance } from './sound.js';
import { spawnChairs, disposeProps, spawnCables, disposeCables, spawnAnomalies, disposeAnomalies } from './props.js';
import { createSilhouetteSystem, disposeSilhouetteMat } from './silhouettes.js';

// --- Renderer ---------------------------------------------------------------
const canvas = document.createElement('canvas');
document.getElementById('app').appendChild(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.0));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;

// --- Scène & caméra ---------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x161208);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 400);

const { controls, update: updateControls } = setupFpsControls(camera, canvas);

// --- Son d'ambiance ---------------------------------------------------------
const ambiance = setupAmbiance();
controls.addEventListener('lock', () => ambiance.start());

// --- Génération procédurale du niveau ---------------------------------------
let levelInfo = generateLevel();
applyLevel(levelInfo);

// --- Construction initiale --------------------------------------------------
let built = buildLevel(scene);

// --- Éclairage de base ------------------------------------------------------
const baseLights = setupBaseLighting(scene);

// --- Néons fluorescents -----------------------------------------------------
let troffers = addFluorescents(scene);

// --- Props (chaises de bureau) ----------------------------------------------
let propsGroup = null;
spawnChairs(scene, levelInfo).then((g) => { propsGroup = g; });

// --- Câbles électriques -----------------------------------------------------
let cablesGroup = spawnCables(scene, levelInfo);

// --- Anomalies (objets incongruents) ----------------------------------------
let anomalyGroup = null;
spawnAnomalies(scene, levelInfo).then((g) => { anomalyGroup = g; });

// --- Silhouettes ------------------------------------------------------------
let silhouettes = createSilhouetteSystem(scene, levelInfo);


// --- Plan 2D (touche M) -----------------------------------------------------
const minimap = setupMinimap(camera, troffers);

// --- Brouillard accordé au niveau -------------------------------------------
function tuneFog() {
  if (!scene.fog) return;
  const b = LEVEL.bounds;
  const reach = Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ);
  scene.fog.near = Math.max(4, reach * 0.08);
  scene.fog.far  = Math.min(camera.far * 0.9, Math.max(20, reach * 0.9));
}

// --- Spawn du joueur --------------------------------------------------------
function placePlayer() {
  camera.position.set(LEVEL.spawn.x, 1.6, LEVEL.spawn.z);
}
placePlayer();
tuneFog();
minimap.refresh(troffers, `${levelInfo.roomCount} pièce${levelInfo.roomCount > 1 ? 's' : ''}`);

// --- Régénération (bouton + touche R) ---------------------------------------
function regenerate() {
  disposeLevel(scene, built);
  disposeFluorescents(scene, troffers);
  disposeProps(scene, propsGroup);
  disposeCables(scene, cablesGroup);
  disposeAnomalies(scene, anomalyGroup);
  silhouettes.dispose();
  propsGroup = null;
  anomalyGroup = null;

  levelInfo = generateLevel();
  applyLevel(levelInfo);

  built = buildLevel(scene);
  troffers = addFluorescents(scene);
  spawnChairs(scene, levelInfo).then((g) => { propsGroup = g; });
  cablesGroup = spawnCables(scene, levelInfo);
  spawnAnomalies(scene, levelInfo).then((g) => { anomalyGroup = g; });
  silhouettes = createSilhouetteSystem(scene, levelInfo);

  placePlayer();
  tuneFog();
  minimap.refresh(troffers, `${levelInfo.roomCount} pièce${levelInfo.roomCount > 1 ? 's' : ''}`);
  hud.update(levelInfo);
}

const hud = setupRoomHud(levelInfo, regenerate);

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR') { e.preventDefault(); regenerate(); }
});

// --- Compteur FPS -----------------------------------------------------------
const fpsEl = document.createElement('div');
fpsEl.style.cssText = [
  'position:fixed', 'top:16px', 'left:16px', 'z-index:30',
  'font:700 13px/1 monospace', 'color:#e6d27a',
  'background:rgba(10,9,4,0.75)', 'border:1px solid rgba(230,210,122,0.3)',
  'border-radius:6px', 'padding:6px 10px', 'user-select:none',
  'pointer-events:none', 'white-space:pre',
].join(';');
document.body.appendChild(fpsEl);

// --- Boucle de rendu --------------------------------------------------------
const clock = new THREE.Clock();
let fpsFrames = 0;
let fpsLastTime = performance.now();

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = clock.getDelta();
  const t = clock.elapsedTime;
  updateControls(dt);
  updateFluorescents(troffers, t);
  silhouettes.update(camera, dt);
  minimap.update();
  renderer.render(scene, camera);

  fpsFrames++;
  const elapsed = now - fpsLastTime;
  if (elapsed >= 500) {
    const fps = Math.round(fpsFrames * 1000 / elapsed);
    const mem = performance.memory
      ? `\n${(performance.memory.usedJSHeapSize / 1048576).toFixed(1)} MB`
      : '';
    fpsEl.textContent = `${fps} FPS${mem}`;
    fpsFrames = 0;
    fpsLastTime = now;
  }
}
animate();

// --- Resize -----------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Debug ------------------------------------------------------------------
setupDebug({
  THREE, scene, camera, renderer, controls, LEVEL,
  get built() { return built; },
  get troffers() { return troffers; },
  levelInfo: () => levelInfo,
  regenerate,
});
