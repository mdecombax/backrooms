import * as THREE from 'three';

// --- Config -----------------------------------------------------------------
export const TEST_MODE   = true;   // ← false en prod
const SPAWN_INTERVAL = TEST_MODE ? 3.0 : 30;
const MAX_COUNT      = TEST_MODE ? 4  : 2;
const SPAWN_MIN_DIST = 28;
const SPAWN_MAX_DIST = 90;
const DESPAWN_NEAR   = 16;
const SPEED_CROSS    = 2.8;  // m/s traversée mur→mur
const SPEED_PEEK     = 2.0;  // m/s entrée + recul
const PEEK_IN_DIST   = 1.8;  // m d'entrée avant de s'arrêter
const PEEK_PAUSE     = 0.28; // s de pause (regard vers le joueur)
const BOB_AMP        = 0.022;
const STRIDE_AMP     = 0.38;

const CROSS = 'cross'; // traverse mur→mur opposé
const PEEK  = 'peek';  // entre, pivote, repart par le même mur

const GOING     = 'going';
const PAUSING   = 'pausing';
const RETURNING = 'returning';

// --- Matériau partagé -------------------------------------------------------
let _mat = null;
function getSharedMat() {
  if (!_mat) _mat = new THREE.MeshStandardMaterial({ color: 0x050403, roughness: 1.0, metalness: 0 });
  return _mat;
}

// --- Fabrique une silhouette articulée --------------------------------------
function makeFigure() {
  const mat = getSharedMat();
  const root = new THREE.Group();
  root.name = 'silhouette_figure';

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 6), mat);
  head.position.y = 1.73;
  root.add(head);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.54, 0.18), mat);
  torso.position.y = 1.25;
  root.add(torso);

  function makeArm(xSign) {
    const pivot = new THREE.Group();
    pivot.position.set(xSign * 0.23, 1.47, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.44, 0.12), mat);
    mesh.position.y = -0.22;
    pivot.add(mesh);
    return pivot;
  }
  const armL = makeArm(-1), armR = makeArm(1);
  root.add(armL, armR);

  function makeLeg(xSign) {
    const pivot = new THREE.Group();
    pivot.position.set(xSign * 0.10, 0.98, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.60, 0.16), mat);
    mesh.position.y = -0.30;
    pivot.add(mesh);
    return pivot;
  }
  const legL = makeLeg(-1), legR = makeLeg(1);
  root.add(legL, legR);

  return { root, armL, armR, legL, legR };
}

// --- Helpers géométriques ---------------------------------------------------

// Retourne un point sur le bord d'une cellule, côté du mur choisi.
// xOff/zOff : décalage aléatoire le long du mur.
function wallPos(cell, wall, offset) {
  const hw = cell.width  / 2;
  const hd = cell.depth  / 2;
  switch (wall) {
    case 'N': return new THREE.Vector3(cell.cx + offset * (cell.width  - 0.4), 0, cell.cz - hd + 0.05);
    case 'S': return new THREE.Vector3(cell.cx + offset * (cell.width  - 0.4), 0, cell.cz + hd - 0.05);
    case 'W': return new THREE.Vector3(cell.cx - hw + 0.05, 0, cell.cz + offset * (cell.depth - 0.4));
    case 'E': return new THREE.Vector3(cell.cx + hw - 0.05, 0, cell.cz + offset * (cell.depth - 0.4));
  }
}

// Direction inward depuis le mur (vers le centre de la cellule).
const INWARD = { N: [0, 1], S: [0, -1], W: [1, 0], E: [-1, 0] };
const OPPOSITE = { N: 'S', S: 'N', W: 'E', E: 'W' };

// --- Système -----------------------------------------------------------------
export function createSilhouetteSystem(scene, level) {
  const active = [];
  let spawnTimer = TEST_MODE ? 0 : 12;

  function trySpawn(camera) {
    if (active.length >= MAX_COUNT) return;

    const camPos = camera.position;
    const candidates = level.cells.filter(c => {
      const dx = c.cx - camPos.x, dz = c.cz - camPos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      return d >= SPAWN_MIN_DIST && d <= SPAWN_MAX_DIST;
    });
    if (candidates.length === 0) return;

    const cell = candidates[Math.floor(Math.random() * candidates.length)];

    // Choisir un mur d'entrée et un comportement.
    const walls = ['N', 'S', 'W', 'E'];
    const entryWall = walls[Math.floor(Math.random() * 4)];
    const behavior  = Math.random() < 0.55 ? CROSS : PEEK;
    const offset    = (Math.random() - 0.5); // −0.5..+0.5 le long du mur

    const entry = wallPos(cell, entryWall, offset);
    const [ix, iz] = INWARD[entryWall];
    const inwardDir = new THREE.Vector3(ix, 0, iz);

    // Point intérieur selon le comportement :
    // CROSS → mur opposé ; PEEK → quelques mètres dans la pièce.
    let target;
    if (behavior === CROSS) {
      // Traverser jusqu'au mur opposé (même offset latéral, légèrement variable).
      const exitOffset = offset + (Math.random() - 0.5) * 0.15;
      target = wallPos(cell, OPPOSITE[entryWall], exitOffset);
    } else {
      // Avancer de PEEK_IN_DIST mètres.
      target = entry.clone().addScaledVector(inwardDir, PEEK_IN_DIST);
    }

    const fig = makeFigure();
    fig.root.position.copy(entry);
    scene.add(fig.root);

    active.push({
      figure:     fig,
      pos:        entry.clone(),
      entry:      entry.clone(),
      target:     target.clone(),
      inwardDir,
      behavior,
      state:      GOING,
      speed:      behavior === CROSS ? SPEED_CROSS : SPEED_PEEK,
      phase:      Math.random() * Math.PI * 2,
      pauseLeft:  PEEK_PAUSE * (0.8 + Math.random() * 0.4),
      camRef:     camera,
    });
  }

  // ── Mise à jour ──────────────────────────────────────────────────────────
  function update(camera, dt) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnTimer = SPAWN_INTERVAL;
      trySpawn(camera);
    }

    const camPos = camera.position;

    for (let i = active.length - 1; i >= 0; i--) {
      const s = active[i];
      let despawn = false;

      // ── Machine à états ──────────────────────────────────────────────────
      if (s.state === PAUSING) {
        // PEEK : pause + regard vers le joueur
        s.pauseLeft -= dt;

        // Rotation progressive vers le joueur
        const toPlayer = new THREE.Vector3(camPos.x - s.pos.x, 0, camPos.z - s.pos.z);
        const targetY = Math.atan2(toPlayer.x, toPlayer.z);
        let dy = targetY - s.figure.root.rotation.y;
        // Normaliser l'écart dans [−π, π]
        while (dy >  Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        s.figure.root.rotation.y += dy * Math.min(1, dt * 14);

        if (s.pauseLeft <= 0) {
          s.state  = RETURNING;
          s.target = s.entry.clone();
        }
      } else {
        // GOING ou RETURNING : se déplacer vers la cible
        const toTarget = new THREE.Vector3().subVectors(s.target, s.pos);
        const dist     = toTarget.length();

        if (dist < 0.08) {
          // Cible atteinte
          if (s.behavior === CROSS) {
            despawn = true; // mur opposé → disparaît dans le mur
          } else if (s.state === GOING) {
            s.state     = PAUSING;
            s.pauseLeft = PEEK_PAUSE * (0.8 + Math.random() * 0.4);
          } else {
            despawn = true; // mur d'entrée atteint → disparaît
          }
        } else {
          toTarget.normalize();
          const step = s.speed * dt;
          s.pos.addScaledVector(toTarget, step);
          s.figure.root.position.set(s.pos.x, 0, s.pos.z);
          s.figure.root.rotation.y = Math.atan2(toTarget.x, toTarget.z);

          // Animation des membres (marche)
          s.phase += dt * (s.speed / SPEED_PEEK) * 3.2;
          const stride = Math.sin(s.phase) * STRIDE_AMP;
          s.figure.legL.rotation.x =  stride;
          s.figure.legR.rotation.x = -stride;
          s.figure.armL.rotation.x = -stride * 0.55;
          s.figure.armR.rotation.x =  stride * 0.55;
          s.figure.root.position.y = Math.abs(Math.sin(s.phase)) * BOB_AMP;
        }
      }

      // Sécurité : trop proche du joueur
      if (s.pos.distanceTo(camPos) < DESPAWN_NEAR) despawn = true;

      if (despawn) {
        scene.remove(s.figure.root);
        active.splice(i, 1);
      }
    }
  }

  function dispose() {
    for (const s of active) scene.remove(s.figure.root);
    active.length = 0;
  }

  return { update, dispose };
}

export function disposeSilhouetteMat() {
  _mat?.dispose();
  _mat = null;
}
