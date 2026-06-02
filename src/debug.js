// Outils d'inspection accessibles depuis la console : window.debug.*
export function setupDebug(ctx) {
  const debug = {
    ...ctx,
    // Position/cible caméra
    cam() {
      const p = ctx.camera.position;
      const t = ctx.controls?.target;
      return {
        pos: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)],
        target: t ? [+t.x.toFixed(2), +t.y.toFixed(2), +t.z.toFixed(2)] : null,
      };
    },
    // Liste des lumières de la scène avec leur intensité
    lights() {
      const out = [];
      ctx.scene.traverse((o) => {
        if (o.isLight) out.push({ type: o.type, name: o.name, intensity: o.intensity });
      });
      return out;
    },
    // Nombre d'objets / appels de rendu
    stats() {
      return {
        objects: ctx.scene.children.length,
        calls: ctx.renderer.info.render.calls,
        triangles: ctx.renderer.info.render.triangles,
      };
    },
  };
  if (typeof window !== 'undefined') window.debug = debug;
  return debug;
}
