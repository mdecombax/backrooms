import * as THREE from 'three';
import { LEVEL } from './room.js';

/**
 * Plan 2D (vue de dessus) du niveau, affiché sur appui de la touche M.
 * Dessine toutes les cellules (pièces + couloirs), les segments de murs pleins,
 * les néons et la position/orientation du joueur.
 * Style backrooms : fond sombre, traits jaunes.
 */
export function setupMinimap(camera, troffers = []) {
  const PAD = 28;
  const dpr = Math.min(window.devicePixelRatio, 2);

  let W, H, SCALE, OFFSET_X, OFFSET_Z;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = [
    'position:fixed', 'top:50%', 'left:50%',
    'transform:translate(-50%,-50%)',
    'background:rgba(10,9,4,0.92)',
    'border:1px solid #e6d27a',
    'border-radius:6px',
    'box-shadow:0 8px 40px rgba(0,0,0,0.6)',
    'z-index:20', 'display:none', 'pointer-events:none',
  ].join(';');
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  function resize() {
    const b = LEVEL.bounds;
    const levelW = b.maxX - b.minX;
    const levelD = b.maxZ - b.minZ;
    const availW = window.innerWidth * 0.78 - PAD * 2;
    const availH = window.innerHeight * 0.78 - PAD * 2;
    SCALE = Math.max(6, Math.min(70, availW / (levelW || 1), availH / (levelD || 1)));
    W = levelW * SCALE + PAD * 2;
    H = levelD * SCALE + PAD * 2;
    OFFSET_X = PAD - b.minX * SCALE;
    OFFSET_Z = PAD - b.minZ * SCALE;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();

  const toPx = (x, z) => [OFFSET_X + x * SCALE, OFFSET_Z + z * SCALE];

  let visible = false;
  let levelLabel = '';
  const dir = new THREE.Vector3();

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Cellules (fond semi-transparent pour les couloirs, opaque pour les pièces).
    for (const c of LEVEL.cells) {
      const xL = c.cx - c.width / 2, xR = c.cx + c.width / 2;
      const zT = c.cz - c.depth / 2, zB = c.cz + c.depth / 2;
      const [px0, pz0] = toPx(xL, zT);
      const pw = (xR - xL) * SCALE, ph = (zB - zT) * SCALE;
      ctx.fillStyle = c.typeId === 'corridor' ? 'rgba(200,175,100,0.30)' : 'rgba(230,210,122,0.08)';
      ctx.fillRect(px0, pz0, pw, ph);
    }

    // Segments de murs pleins.
    ctx.strokeStyle = '#e6d27a';
    ctx.lineWidth = 2;
    for (const w of LEVEL.walls) {
      const [ax, az] = toPx(w.x1, w.z1);
      const [bx, bz] = toPx(w.x2, w.z2);
      ctx.beginPath();
      ctx.moveTo(ax, az);
      ctx.lineTo(bx, bz);
      ctx.stroke();
    }

    // Néons (petits rectangles jaunes translucides).
    ctx.fillStyle = 'rgba(255,246,216,0.5)';
    for (const tr of troffers) {
      const p = tr.light?.position;
      if (!p) continue;
      const [px, pz] = toPx(p.x, p.z);
      ctx.fillRect(px - 7, pz - 4, 14, 8);
    }

    // Joueur.
    const pos = camera.position;
    const [ux, uz] = toPx(pos.x, pos.z);
    camera.getWorldDirection(dir);
    const ang = Math.atan2(dir.x, dir.z);
    const reach = 26, spread = 0.5;
    ctx.fillStyle = 'rgba(230,210,122,0.25)';
    ctx.beginPath();
    ctx.moveTo(ux, uz);
    ctx.lineTo(ux + Math.sin(ang - spread) * reach, uz + Math.cos(ang - spread) * reach);
    ctx.lineTo(ux + Math.sin(ang + spread) * reach, uz + Math.cos(ang + spread) * reach);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd84a';
    ctx.beginPath();
    ctx.arc(ux, uz, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0a0904';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Légende.
    ctx.fillStyle = '#e6d27a';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText(levelLabel || 'PLAN — vue de dessus', PAD, 18);
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(230,210,122,0.7)';
    ctx.fillText(`x ${pos.x.toFixed(1)}  z ${pos.z.toFixed(1)}   ·   M pour fermer`, PAD, H - 12);
  }

  function update() { if (visible) draw(); }
  function toggle() {
    visible = !visible;
    canvas.style.display = visible ? 'block' : 'none';
    if (visible) draw();
  }

  const onKey = (e) => { if (e.code === 'KeyM') { e.preventDefault(); toggle(); } };
  document.addEventListener('keydown', onKey);

  return {
    update,
    toggle,
    resize,
    refresh(newTroffers, label) {
      if (newTroffers) troffers = newTroffers;
      if (label != null) levelLabel = label;
      resize();
      if (visible) draw();
    },
    get isVisible() { return visible; },
    dispose() { document.removeEventListener('keydown', onKey); canvas.remove(); },
  };
}
