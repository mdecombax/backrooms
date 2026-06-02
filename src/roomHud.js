// HUD léger : bouton « régénérer la salle » + dimensions de la pièce courante.
// Style backrooms (fond sombre, traits jaune moutarde). Hors flux pointer-lock :
// le bouton reste cliquable même quand la souris n'est pas verrouillée.

/**
 * @param {{width:number, depth:number, area:number, ratio:number, seed:number}} info dims initiales
 * @param {() => void} onRegenerate callback déclenché par le bouton / la touche R
 * @returns {{update:(info)=>void, dispose:()=>void}}
 */
export function setupRoomHud(info, onRegenerate) {
  const panel = document.createElement('div');
  panel.style.cssText = [
    'position:fixed', 'top:16px', 'right:16px',
    'z-index:30', 'user-select:none',
    'font:600 13px/1.4 system-ui,sans-serif', 'color:#e6d27a',
    'background:rgba(10,9,4,0.85)', 'border:1px solid #e6d27a',
    'border-radius:8px', 'padding:12px 14px',
    'box-shadow:0 6px 24px rgba(0,0,0,0.5)',
    'display:flex', 'flex-direction:column', 'gap:10px',
    'min-width:170px',
  ].join(';');

  const dims = document.createElement('div');
  dims.style.cssText = 'font-weight:400;opacity:0.85;line-height:1.5';

  const btn = document.createElement('button');
  btn.textContent = '⟳ Régénérer (R)';
  btn.style.cssText = [
    'cursor:pointer', 'font:600 13px system-ui,sans-serif',
    'color:#161208', 'background:#e6d27a', 'border:none',
    'border-radius:6px', 'padding:8px 10px',
  ].join(';');
  btn.addEventListener('mouseenter', () => { btn.style.background = '#f2e08c'; });
  btn.addEventListener('mouseleave', () => { btn.style.background = '#e6d27a'; });
  // Empêche le clic de verrouiller le pointeur (le canvas est juste derrière).
  btn.addEventListener('click', (e) => { e.stopPropagation(); onRegenerate(); });

  panel.appendChild(dims);
  panel.appendChild(btn);
  document.body.appendChild(panel);

  function update(i) {
    dims.innerHTML =
      `<b style="font-weight:700">SALLE PROCÉDURALE</b><br>` +
      `${i.width.toFixed(1)} × ${i.depth.toFixed(1)} m` +
      `<br>${i.area} m² · ratio ${i.ratio}` +
      `<br><span style="opacity:0.55">seed ${i.seed}</span>`;
  }
  update(info);

  return {
    update,
    dispose() { panel.remove(); },
  };
}
