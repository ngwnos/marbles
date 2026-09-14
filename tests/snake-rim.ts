import type { Manifold } from 'manifold-3d';
import { Vector3 } from 'three/webgpu';
import { sampleSnake, SNAKE_LENGTH, snakeFloor } from '../src/pieces/snake-solid';
import { CONNECTOR, PART_UNITS, TRACK } from '../src/pieces/marbleworks-spec';

/** Probe the FINISHED inner lip, including where a boolean web adds material.
 * Every section must retain the shared round-over, not just its crest height. */
export function auditSnakeRim(solid: Manifold) {
  let probes = 0, maxError = 0;
  const failures: string[] = [];
  for (let bend = 0; bend < 4; bend++) for (let step = 2; step < 79; step++) {
    const path = sampleSnake(SNAKE_LENGTH * (bend + step / 80) / 4);
    for (const side of [-1, 1]) for (const angle of [Math.PI / 6, Math.PI / 3]) {
      const across = side * (10.75 - 0.75 * Math.cos(angle));
      const x = path.x + path.dz * across, z = path.z - path.dx * across;
      if (Math.min(...[-1, 1].map(sign => Math.hypot(x - sign * PART_UNITS.portSpan / 2, z))) < CONNECTOR.postDiameter / 2 + 1) continue;
      const point = new Vector3(x, snakeFloor(x) + TRACK.channelDepth + 0.75 * Math.sin(angle), z);
      const normal = new Vector3(-side * path.dz * Math.cos(angle) + TRACK.runDrop / PART_UNITS.portSpan * Math.sin(angle),
        Math.sin(angle), side * path.dx * Math.cos(angle)).normalize();
      const hits = solid.rayCast(point.clone().addScaledVector(normal, 0.3).toArray(), point.clone().addScaledVector(normal, -0.3).toArray());
      const error = hits.length ? new Vector3(...hits[0].position).distanceTo(point) : Infinity;
      maxError = Math.max(maxError, error); probes++;
      if (error > 0.035) failures.push(`bend ${bend}, t=${step / 80}, side ${side}: ${error.toFixed(4)} mm at ${point.toArray()}`);
    }
  }
  if (failures.length) throw new Error(`${failures.length} final rim round-over defects:\n${failures.slice(0, 12).join('\n')}`);
  return { probes, maxError };
}
