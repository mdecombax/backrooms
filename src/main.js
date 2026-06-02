import * as THREE from 'three';
import { setupFpsControls } from './fpsControls.js';
import { setupDebug } from './debug.js';
import { buildRoom, ROOM } from './room.js';
import { setupBaseLighting, addFluorescents, updateFluorescents } from './lights.js';
import { loadCeilingLamp } from './assets.js';
import { setupMinimap } from './minimap.js';

// --- Renderer ---------------------------------------------------------------
const canvas = document.createElement('canvas');
document.getElementById('app').appendChild(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
// pixelRatio plafonné à 1.5 : sur Retina (dpr=2) on rendrait 4x les pixels pour un
// gain visuel nul sur une scène floue → on coupe ~44% du fill-rate, donc de la conso.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

// --- Scene & camera ---------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x161208); // accordé à la couleur du brouillard

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 1.6, 2.5); // hauteur d'oeil, à l'intérieur de la pièce

// Contrôles FPS : clic pour verrouiller le pointeur, ZQSD/WASD pour marcher.
const { controls, update: updateControls } = setupFpsControls(camera, canvas);

// --- Pièce ------------------------------------------------------------------
const room = buildRoom(scene);

// --- Éclairage de base (étape 3) -------------------------------------------
const baseLights = setupBaseLighting(scene);

// --- Néons fluorescents (étape 4) ------------------------------------------
const troffers = addFluorescents(scene);

// --- Prop Sketchfab (étape 7) ----------------------------------------------
loadCeilingLamp(scene);

// --- Plan 2D (touche M) -----------------------------------------------------
// Vue de dessus de la salle avec position/orientation du joueur.
const minimap = setupMinimap(camera, ROOM, troffers);

// --- Boucle de rendu --------------------------------------------------------
const clock = new THREE.Clock();

// Cap FPS : une scène liminale quasi-statique n'a aucun besoin de 90-120 fps.
// On vise 30 fps → le GPU travaille ~3x moins (ventilo/batterie), scintillement
// néon toujours fluide. Réglable à chaud via window.debug.setFpsCap(n).
let fpsCap = 30;
let nextFrame = 0;

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  if (now < nextFrame) return; // on saute la frame tant que le budget n'est pas écoulé
  nextFrame = now + 1000 / fpsCap;

  // getDelta() met à jour elapsedTime ; on lit ensuite t pour ne consommer le delta qu'une fois.
  const dt = clock.getDelta();
  const t = clock.elapsedTime;
  updateControls(dt);
  updateFluorescents(troffers, t);
  minimap.update();
  renderer.render(scene, camera);
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
  THREE, scene, camera, renderer, controls, room, ROOM,
  setFpsCap: (n) => { fpsCap = Math.max(1, n | 0); return fpsCap; },
});
