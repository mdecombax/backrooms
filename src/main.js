import * as THREE from 'three';
import { setupFpsControls } from './fpsControls.js';
import { setupDebug } from './debug.js';
import { buildRoom, disposeRoom, applyRoomDims, ROOM } from './room.js';
import { setupBaseLighting, addFluorescents, updateFluorescents, disposeFluorescents } from './lights.js';
import { loadCeilingLamp, repositionCeilingLamp } from './assets.js';
import { setupMinimap } from './minimap.js';
import { generateRoom } from './procgen.js';
import { setupRoomHud } from './roomHud.js';

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

// --- Génération procédurale des dimensions ----------------------------------
// On tire une pièce différente à chaque chargement (surface + ratio bornés).
let roomInfo = generateRoom();
applyRoomDims(roomInfo);

// --- Pièce ------------------------------------------------------------------
// room et troffers sont mutables : la régénération les détruit puis les recrée.
let room = buildRoom(scene);

// --- Éclairage de base (étape 3) -------------------------------------------
const baseLights = setupBaseLighting(scene);

// --- Néons fluorescents (étape 4) ------------------------------------------
let troffers = addFluorescents(scene);

// --- Prop Sketchfab (étape 7) ----------------------------------------------
// Plafonnier centré au plafond. Chargé une fois ; repositionné à chaque
// régénération car la hauteur de pièce varie désormais selon l'archétype.
let ceilingLamp = null;
loadCeilingLamp(scene).then((m) => { ceilingLamp = m; });

// --- Plan 2D (touche M) -----------------------------------------------------
// Vue de dessus de la salle avec position/orientation du joueur.
const minimap = setupMinimap(camera, ROOM, troffers);
minimap.refresh(troffers, roomInfo.type);

// Adapte la portée du brouillard à la taille de la pièce : une salle immense doit
// se révéler comme telle (sinon le voile à 22 m masque le fond et tout se ressemble).
function tuneFog() {
  if (!scene.fog) return;
  const reach = Math.hypot(ROOM.width, ROOM.depth); // diagonale
  scene.fog.near = Math.max(3, reach * 0.18);
  scene.fog.far = Math.max(14, reach * 1.15);
}
tuneFog();

// --- Régénération (bouton + touche R) ---------------------------------------
function regenerate(forceType) {
  // 1) Destruction de la pièce et des néons courants (libère la mémoire GPU).
  disposeRoom(scene, room);
  disposeFluorescents(scene, troffers);

  // 2) Nouveau tirage de dimensions + application sur la référence ROOM partagée.
  //    forceType (optionnel) permet d'imposer un archétype depuis window.debug.
  roomInfo = generateRoom(undefined, typeof forceType === 'string' ? forceType : undefined);
  applyRoomDims(roomInfo);

  // 3) Reconstruction.
  room = buildRoom(scene);
  troffers = addFluorescents(scene);
  repositionCeilingLamp(ceilingLamp); // recolle la lampe au nouveau plafond

  // 4) Replace le joueur au centre de la nouvelle pièce (jamais coincé dans un mur).
  camera.position.set(0, 1.6, 0);

  // 5) Brouillard accordé à la nouvelle taille, plan 2D et HUD rafraîchis.
  tuneFog();
  minimap.refresh(troffers, roomInfo.type);
  hud.update(roomInfo);
}

const hud = setupRoomHud(roomInfo, regenerate);

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR') { e.preventDefault(); regenerate(); }
});

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
  THREE, scene, camera, renderer, controls, ROOM,
  get room() { return room; },
  get troffers() { return troffers; },
  roomInfo: () => roomInfo,
  regenerate,
  setFpsCap: (n) => { fpsCap = Math.max(1, n | 0); return fpsCap; },
});
