import type { ManifoldToplevel } from 'manifold-3d';
import { Vector3 } from 'three/webgpu';
import { buildCollarMouth, collarAngularRoll } from '../src/pieces/connector-mouth';
import { PART_UNITS, TRACK } from '../src/pieces/marbleworks-spec';
import { sampleSnake, SNAKE_LENGTH, snakeFloor, snakeMouthEnds } from '../src/pieces/snake-solid';

/** Verify the collar's vertical cut faces retain their cylindrical sections. */
export function auditVerticalMouths(kernel: ManifoldToplevel, build = buildCollarMouth) {
  let probes = 0, maxGap = 0;
  for (const end of [0, 3]) {
    const sign = end === 0 ? 1 : -1, px = -sign * PART_UNITS.portSpan / 2;
    const path = sampleSnake(end === 0 ? 0 : SNAKE_LENGTH);
    const direction = Math.atan2(sign * path.dz, sign * path.dx);
    const inner = end === 0 ? 10.5 : 12.1, ends = snakeMouthEnds(end);
    const solid = build(kernel, px, direction, snakeFloor, inner, ends);
    try {
      for (const side of [-1, 1]) for (const r of [12.9, 13.1, 13.3]) for (const h of [3.4, 4.2, 6, 10].map(offset=>TRACK.channelDepth+offset)) {
        const surface = (r: number, h: number) => {
          const d = Math.min(r - inner, 13.5 - r);
          const q = d >= 0.75 ? 0.75 : Math.sqrt(0.75 ** 2 - (0.75 - d) ** 2);
          const a = side * ((side < 0 ? -ends[0] : ends[1]) - collarAngularRoll(r, inner, q) / ((inner + 13.5) / 2));
          const mapped = r;
          const x = px + mapped * Math.cos(a + direction);
          return new Vector3(x, snakeFloor(x) + h, mapped * Math.sin(a + direction));
        };
        const point = surface(r, h);
        if (point.y > 46.5) continue;
        const e = 0.0001;
        const normal = surface(r + e, h).sub(surface(r - e, h))
          .cross(surface(r, h + e).sub(surface(r, h - e))).normalize();
        const hits = solid.rayCast(point.clone().addScaledVector(normal, 1).toArray(), point.clone().addScaledVector(normal, -1).toArray());
        const gap = Math.min(...hits.map(hit => point.distanceTo(new Vector3(...hit.position))));
        maxGap = Math.max(maxGap, gap); probes++;
      }
    } finally { solid.delete(); }
  }
  if (maxGap > 0.015) throw new Error(`Vertical mouth deviates ${maxGap} mm across ${probes} probes`);
  return { probes, maxGap };
}
