import type { Manifold } from 'manifold-3d';
import { sampleSnake, SNAKE_LENGTH, snakeFloor, snakeBendCenter } from '../src/pieces/snake-solid';
import { CONNECTOR, PART_UNITS } from '../src/pieces/marbleworks-spec';

/** The post's back may only connect to the neighboring band, never to a
 * fictitious continuation of its own partial track arc. */
export function auditPostDomains(solid: Manifold) {
  let probes = 0;
  for (const end of [0, 3]) {
    const postX = (end === 0 ? -1 : 1) * PART_UNITS.portSpan / 2;
    const path = sampleSnake(end === 0 ? 0 : SNAKE_LENGTH), sign = end === 0 ? 1 : -1;
    const neighbor = snakeBendCenter(end === 0 ? 1 : 2);
    const neighborAngle = Math.atan2(neighbor.z, neighbor.x - postX);
    for (let i = 0; i < 360; i++) {
      const angle = i * Math.PI / 180, dx = Math.cos(angle), dz = Math.sin(angle);
      if (sign * (dx * path.dx + dz * path.dz) > -0.05) continue;
      if (Math.cos(angle - neighborAngle) > Math.cos(Math.PI / 3)) continue;
      for (const h of [3, 5, 7, 9, 10.5]) {
        const r = CONNECTOR.postDiameter / 2 + 0.006;
        const x = postX + r * dx, z = r * dz, y = snakeFloor(x) + h;
        const hits = solid.rayCast([x, y, z], [postX + (r + 0.5) * dx, y, (r + 0.5) * dz]);
        if (hits.length) throw new Error(`Ramp protrudes behind post ${end}, angle ${i}, height ${h}`);
        const wall = solid.rayCast([postX, y, 0], [postX + 15 * dx, y, 15 * dz]);
        if (wall.length !== 2) throw new Error(`Post ${end} has ${wall.length} internal/external skins at angle ${i}, height ${h}`);
        probes++;
      }
    }
  }
  return { probes };
}
