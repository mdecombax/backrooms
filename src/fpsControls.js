import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { ROOM } from './room.js';

// Hauteur d'oeil fixe (m) — on reste debout, pas de saut/gravité pour l'instant.
const EYE_HEIGHT = 1.6;
// Marge de collision contre les murs : on garde la caméra à WALL_MARGIN du mur
// pour éviter le clipping (near plane à 0.1 + sensation d'épaule).
const WALL_MARGIN = 0.4;
// Vitesses (m/s).
const WALK_SPEED = 3.0;
const RUN_SPEED = 6.0;

/**
 * Contrôles FPS : PointerLock pour la souris (regard), clavier ZQSD/WASD pour
 * le déplacement au sol, Shift pour courir. Clic sur le canvas pour verrouiller
 * le pointeur, Échap pour libérer.
 *
 * Retourne { controls, update } — appeler update(dt) dans la boucle de rendu.
 */
export function setupFpsControls(camera, canvas, domElement) {
  camera.position.set(0, EYE_HEIGHT, 2.5);

  const controls = new PointerLockControls(camera, domElement || canvas);

  // Overlay « cliquer pour entrer » : verrouille le pointeur au clic.
  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'display:flex',
    'align-items:center', 'justify-content:center',
    'background:rgba(0,0,0,0.55)', 'color:#e6d27a',
    'font:600 18px/1.4 system-ui,sans-serif', 'letter-spacing:0.04em',
    'cursor:pointer', 'z-index:10', 'user-select:none', 'text-align:center',
  ].join(';');
  overlay.innerHTML = 'Cliquer pour explorer<br><span style="font-size:13px;opacity:0.7">ZQSD / WASD pour se déplacer · Shift pour courir · M pour le plan · Échap pour sortir</span>';
  document.body.appendChild(overlay);

  overlay.addEventListener('click', () => controls.lock());
  controls.addEventListener('lock', () => { overlay.style.display = 'none'; });
  controls.addEventListener('unlock', () => { overlay.style.display = 'flex'; });

  // --- État clavier ---------------------------------------------------------
  const keys = { forward: false, back: false, left: false, right: false, run: false };

  function onKey(e, down) {
    switch (e.code) {
      case 'KeyW': case 'KeyZ': case 'ArrowUp':    keys.forward = down; break;
      case 'KeyS': case 'ArrowDown':               keys.back = down; break;
      case 'KeyA': case 'KeyQ': case 'ArrowLeft':  keys.left = down; break;
      case 'KeyD': case 'ArrowRight':              keys.right = down; break;
      case 'ShiftLeft': case 'ShiftRight':         keys.run = down; break;
      default: return;
    }
  }
  const onKeyDown = (e) => onKey(e, true);
  const onKeyUp = (e) => onKey(e, false);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  const dir = new THREE.Vector3();

  function update(dt) {
    if (!controls.isLocked) return;

    const speed = (keys.run ? RUN_SPEED : WALK_SPEED) * dt;
    const fwd = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0);
    const strafe = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);

    if (fwd !== 0 || strafe !== 0) {
      // Normalise pour éviter le déplacement diagonal plus rapide.
      dir.set(strafe, 0, fwd).normalize().multiplyScalar(speed);
      controls.moveRight(dir.x);
      controls.moveForward(dir.z);
    }

    // Collision : on confine la caméra dans la pièce et on fige la hauteur.
    // Bornes lues à chaque frame → suivent les redimensionnements (régénération).
    const maxX = ROOM.width / 2 - WALL_MARGIN;
    const maxZ = ROOM.depth / 2 - WALL_MARGIN;
    const p = camera.position;
    p.x = THREE.MathUtils.clamp(p.x, -maxX, maxX);
    p.z = THREE.MathUtils.clamp(p.z, -maxZ, maxZ);
    p.y = EYE_HEIGHT;
  }

  controls.dispose = ((orig) => function () {
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    overlay.remove();
    orig.call(controls);
  })(controls.dispose);

  return { controls, update };
}
