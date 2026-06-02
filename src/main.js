import * as THREE from 'three';
import { setupFpsControls } from './fpsControls.js';
import { setupDebug } from './debug.js';
import { buildLevel, disposeLevel, applyLevel, LEVEL } from './room.js';
import { setupBaseLighting, addFluorescents, updateFluorescents, disposeFluorescents } from './lights.js';
import { setupMinimap } from './minimap.js';
import { generateLevel } from './procgen.js';
import { setupRoomHud } from './roomHud.js';
import { setupAmbiance } from './sound.js';

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

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);

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


// --- Plan 2D (touche M) -----------------------------------------------------
const minimap = setupMinimap(camera, troffers);

// --- Brouillard accordé au niveau -------------------------------------------
function tuneFog() {
  if (!scene.fog) return;
  const b = LEVEL.bounds;
  const reach = Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ);
  scene.fog.near = Math.max(3, reach * 0.1);
  scene.fog.far = Math.max(18, reach * 1.2);
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

  levelInfo = generateLevel();
  applyLevel(levelInfo);

  built = buildLevel(scene);
  troffers = addFluorescents(scene);

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
