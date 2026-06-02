import * as THREE from 'three';

/**
 * Plan 2D (vue de dessus) de la salle, affiché en overlay sur appui de la touche M.
 * Dessine la coque de la pièce, les néons du plafond et la position/orientation
 * courante du joueur (caméra). Style backrooms : fond sombre, traits jaunes.
 *
 * @param {THREE.Camera} camera   caméra du joueur (source de position + regard)
 * @param {{width:number, depth:number, height:number}} ROOM dimensions de la pièce (m)
 * @param {Array<{light:THREE.Object3D}>} troffers néons, pour les pointer sur le plan (optionnel)
 *
 * Retourne { update, toggle, isVisible } — appeler update() dans la boucle quand visible.
 */
export function setupMinimap(camera, ROOM, troffers = []) {
  const SCALE = 46;       // pixels par mètre
  const PAD = 28;         // marge autour de la pièce (px)
  const W = ROOM.width * SCALE + PAD * 2;
  const H = ROOM.depth * SCALE + PAD * 2;

  // --- Canvas overlay -------------------------------------------------------
  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.cssText = [
    'position:fixed', 'top:50%', 'left:50%',
    'transform:translate(-50%,-50%)',
    `width:${W}px`, `height:${H}px`,
    'background:rgba(10,9,4,0.92)',
    'border:1px solid #e6d27a',
    'border-radius:6px',
    'box-shadow:0 8px 40px rgba(0,0,0,0.6)',
    'z-index:20', 'display:none', 'pointer-events:none',
  ].join(';');
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // Centre du plan = centre du sol (origine monde). X → droite, Z → bas.
  const cx = W / 2;
  const cz = H / 2;
  const toPx = (x, z) => [cx + x * SCALE, cz + z * SCALE];

  let visible = false;
  const dir = new THREE.Vector3();

  function draw() {
    ctx.clearRect(0, 0, W, H);

    const w2 = ROOM.width / 2;
    const d2 = ROOM.depth / 2;

    // Coque de la pièce (murs)
    const [x0, z0] = toPx(-w2, -d2);
    ctx.strokeStyle = '#e6d27a';
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, z0, ROOM.width * SCALE, ROOM.depth * SCALE);

    // Néons (petits rectangles jaunes translucides)
    ctx.fillStyle = 'rgba(255,246,216,0.5)';
    for (const tr of troffers) {
      const p = tr.light?.position;
      if (!p) continue;
      const [px, pz] = toPx(p.x, p.z);
      ctx.fillRect(px - 7, pz - 4, 14, 8);
    }

    // Joueur : position + cône d'orientation
    const pos = camera.position;
    const [ux, uz] = toPx(pos.x, pos.z);

    camera.getWorldDirection(dir);
    const ang = Math.atan2(dir.x, dir.z); // angle dans le plan XZ

    // Cône de regard
    const reach = 26;
    const spread = 0.5;
    ctx.fillStyle = 'rgba(230,210,122,0.25)';
    ctx.beginPath();
    ctx.moveTo(ux, uz);
    ctx.lineTo(ux + Math.sin(ang - spread) * reach, uz + Math.cos(ang - spread) * reach);
    ctx.lineTo(ux + Math.sin(ang + spread) * reach, uz + Math.cos(ang + spread) * reach);
    ctx.closePath();
    ctx.fill();

    // Point joueur
    ctx.fillStyle = '#ffd84a';
    ctx.beginPath();
    ctx.arc(ux, uz, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0a0904';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Légende
    ctx.fillStyle = '#e6d27a';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText('PLAN — vue de dessus', PAD, 18);
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(230,210,122,0.7)';
    ctx.fillText(
      `x ${pos.x.toFixed(1)}  z ${pos.z.toFixed(1)}   ·   M pour fermer`,
      PAD, H - 12
    );
  }

  function update() {
    if (visible) draw();
  }

  function toggle() {
    visible = !visible;
    canvas.style.display = visible ? 'block' : 'none';
    if (visible) draw();
  }

  // Touche M : bascule l'affichage du plan.
  function onKey(e) {
    if (e.code === 'KeyM') { e.preventDefault(); toggle(); }
  }
  document.addEventListener('keydown', onKey);

  return {
    update,
    toggle,
    get isVisible() { return visible; },
    dispose() { document.removeEventListener('keydown', onKey); canvas.remove(); },
  };
}
