import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { LEVEL } from './room.js';

const EYE_HEIGHT = 1.6;
const WALL_MARGIN = 0.4;  // distance minimale joueur-mur (m)
const WALK_SPEED = 3.0;
const RUN_SPEED = 6.0;

// Rayon du cylindre joueur pour la collision par segments.
const PLAYER_R = WALL_MARGIN;

/**
 * Contrôles FPS : PointerLock pour la souris (regard), clavier ZQSD/WASD pour
 * le déplacement au sol, Shift pour courir.
 *
 * La collision est gérée par repousse du joueur (cercle) contre chaque segment
 * de mur de LEVEL.walls. Pas de AABB global — le joueur peut traverser les
 * ouvertures entre pièces librement.
 *
 * Retourne { controls, update }.
 */
export function setupFpsControls(camera, canvas) {
  const controls = new PointerLockControls(camera, canvas);

  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'display:flex',
    'align-items:center', 'justify-content:center',
    'background:rgba(0,0,0,0.55)', 'color:#e6d27a',
    'font:600 18px/1.4 system-ui,sans-serif', 'letter-spacing:0.04em',
    'cursor:pointer', 'z-index:10', 'user-select:none', 'text-align:center',
  ].join(';');
  overlay.innerHTML = 'Cliquer pour explorer<br><span style="font-size:13px;opacity:0.7">ZQSD / WASD · Shift pour courir · M pour le plan · R pour régénérer</span>';
  document.body.appendChild(overlay);

  overlay.addEventListener('click', () => controls.lock());
  controls.addEventListener('lock', () => { overlay.style.display = 'none'; });
  controls.addEventListener('unlock', () => { overlay.style.display = 'flex'; });

  const keys = { forward: false, back: false, left: false, right: false, run: false };
  const onKey = (e, down) => {
    switch (e.code) {
      case 'KeyW': case 'KeyZ': case 'ArrowUp':    keys.forward = down; break;
      case 'KeyS': case 'ArrowDown':               keys.back = down; break;
      case 'KeyA': case 'KeyQ': case 'ArrowLeft':  keys.left = down; break;
      case 'KeyD': case 'ArrowRight':              keys.right = down; break;
      case 'ShiftLeft': case 'ShiftRight':         keys.run = down; break;
    }
  };
  const onKeyDown = (e) => onKey(e, true);
  const onKeyUp = (e) => onKey(e, false);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  const dir = new THREE.Vector3();
  const tmp2 = new THREE.Vector2();

  /**
   * Repousse le point (px, pz) hors des murs de LEVEL.walls (collision segment/cercle).
   * On traite chaque segment indépendamment (les pièces ont peu de murs → O(n) OK).
   */
  function resolveWalls(px, pz) {
    let x = px, z = pz;
    for (const w of LEVEL.walls) {
      const dx = w.x2 - w.x1, dz = w.z2 - w.z1;
      const lenSq = dx * dx + dz * dz;
      if (lenSq < 1e-9) continue;
      // Projection du joueur sur le segment, bornée à [0,1].
      const t = Math.max(0, Math.min(1, ((x - w.x1) * dx + (z - w.z1) * dz) / lenSq));
      const cx = w.x1 + t * dx, cz = w.z1 + t * dz;
      const ex = x - cx, ez = z - cz;
      const dist = Math.hypot(ex, ez);
      if (dist < PLAYER_R && dist > 1e-9) {
        const push = (PLAYER_R - dist) / dist;
        x += ex * push;
        z += ez * push;
      }
    }
    return { x, z };
  }

  function update(dt) {
    if (!controls.isLocked) return;
    const speed = (keys.run ? RUN_SPEED : WALK_SPEED) * dt;
    const fwd = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0);
    const strafe = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (fwd !== 0 || strafe !== 0) {
      dir.set(strafe, 0, fwd).normalize().multiplyScalar(speed);
      controls.moveRight(dir.x);
      controls.moveForward(dir.z);
    }

    const p = camera.position;
    const resolved = resolveWalls(p.x, p.z);
    p.x = resolved.x;
    p.z = resolved.z;
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
