// HUD léger : bouton « régénérer » + informations du niveau courant.
// Affiche le nombre de pièces, la liste des archétypes, la seed et les dimensions.

/**
 * @param {object} levelInfo infos initiales retournées par generateLevel()
 * @param {() => void} onRegenerate callback déclenché par le bouton / touche R
 */
export function setupRoomHud(levelInfo, onRegenerate) {
  const panel = document.createElement('div');
  panel.style.cssText = [
    'position:fixed', 'top:16px', 'right:16px',
    'z-index:30', 'user-select:none',
    'font:600 13px/1.4 system-ui,sans-serif', 'color:#e6d27a',
    'background:rgba(10,9,4,0.85)', 'border:1px solid #e6d27a',
    'border-radius:8px', 'padding:12px 14px',
    'box-shadow:0 6px 24px rgba(0,0,0,0.5)',
    'display:flex', 'flex-direction:column', 'gap:10px',
    'min-width:190px',
  ].join(';');

  const dims = document.createElement('div');
  dims.style.cssText = 'font-weight:400;opacity:0.85;line-height:1.6';

  const btn = document.createElement('button');
  btn.textContent = '⟳ Régénérer (R)';
  btn.style.cssText = [
    'cursor:pointer', 'font:600 13px system-ui,sans-serif',
    'color:#161208', 'background:#e6d27a', 'border:none',
    'border-radius:6px', 'padding:8px 10px',
  ].join(';');
  btn.addEventListener('mouseenter', () => { btn.style.background = '#f2e08c'; });
  btn.addEventListener('mouseleave', () => { btn.style.background = '#e6d27a'; });
  btn.addEventListener('click', (e) => { e.stopPropagation(); onRegenerate(); });

  panel.appendChild(dims);
  panel.appendChild(btn);
  document.body.appendChild(panel);

  function update(info) {
    // Ligne « NIVEAU — N pièces ».
    const nbLabel = info.roomCount === 1 ? '1 pièce' : `${info.roomCount} pièces`;
    const corrLabel = info.corridorCount > 0
      ? ` + ${info.corridorCount} couloir${info.corridorCount > 1 ? 's' : ''}`
      : '';

    // Liste des types de pièces.
    const roomLines = (info.rooms || [])
      .map((r, i) => {
        const b = info.bounds;
        const area = (r.width * r.depth).toFixed(0);
        const rh = (r.height ?? 0).toFixed(1);
        return `<span style="opacity:0.8">${i + 1}. ${r.type} — ${r.width.toFixed(1)}×${r.depth.toFixed(1)} m, H ${rh} m</span>`;
      })
      .join('<br>');

    dims.innerHTML =
      `<b style="font-weight:700;color:#f2e08c;font-size:15px">NIVEAU</b><br>` +
      `<span style="color:#f2e08c">${nbLabel}${corrLabel}</span><br>` +
      `H ${info.height?.toFixed(1) ?? '?'} m<br>` +
      roomLines +
      `<br><span style="opacity:0.45;font-size:11px">seed ${info.seed}</span>`;
  }
  update(levelInfo);

  return {
    update,
    dispose() { panel.remove(); },
  };
}
