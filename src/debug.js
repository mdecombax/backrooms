import { LEVEL } from './room.js';

// Outils d'inspection accessibles depuis la console : window.debug.*
export function setupDebug(ctx) {
  const debug = {
    ...ctx,
    // Résumé du niveau courant (cellules, murs, ouvertures, spawn).
    level() {
      return {
        seed: LEVEL.seed,
        roomCount: LEVEL.roomCount,
        corridorCount: LEVEL.corridorCount,
        height: LEVEL.height,
        rooms: LEVEL.rooms.map((r) => ({
          id: r.id, type: r.type, typeId: r.typeId,
          cx: +r.cx.toFixed(2), cz: +r.cz.toFixed(2),
          width: r.width, depth: r.depth,
          area: +(r.width * r.depth).toFixed(1),
        })),
        wallCount: LEVEL.walls.length,
        openingCount: LEVEL.openings.length,
        bounds: LEVEL.bounds,
        spawn: LEVEL.spawn,
      };
    },
    // Position/orientation caméra.
    cam() {
      const p = ctx.camera.position;
      const t = ctx.controls?.target;
      return {
        pos: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)],
        target: t ? [+t.x.toFixed(2), +t.y.toFixed(2), +t.z.toFixed(2)] : null,
      };
    },
    // Liste des lumières de la scène avec leur intensité.
    lights() {
      const out = [];
      ctx.scene.traverse((o) => {
        if (o.isLight) out.push({ type: o.type, name: o.name, intensity: o.intensity });
      });
      return out;
    },
    // Nombre d'objets / appels de rendu.
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
