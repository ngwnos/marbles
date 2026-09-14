import { Vector3 } from 'three/webgpu';
import type { Manifold } from 'manifold-3d';
import { profileEnvelope } from '../src/geometry/surfaces';
import { troughProfiles, TRACK, PART_UNITS } from '../src/pieces/marbleworks-spec';
import { sampleSnake, snakeCupRadius, snakeFloor } from '../src/pieces/snake-solid';

/** Check the shared interior boundary, not just the outside collar or rim. */
export function auditCupTrack(solid: Manifold) {
  const width = profileEnvelope(troughProfiles({ roundedOpening: true }).inner);
  const path = sampleSnake(0), slope = TRACK.runDrop / PART_UNITS.portSpan;
  let probes = 0, maxGap = 0, maxNormalAngle = 0;
  for (const side of [-1, 1]) for (const h of [1, 2, 3, 4, 5, 6, 7, 8, 9, 9.8, 10.2, 10.4]) {
    const w = width(h);
    if (Math.abs(snakeCupRadius(h) - w) > 0.001) throw new Error(`Cup and track use different sections at ${h}`);
    const dw = (width(h + 0.0001) - width(h - 0.0001)) / 0.0002;
    const nx = side * path.dz, nz = -side * path.dx;
    const point = new Vector3(path.x + nx * w, 0, path.z + nz * w);
    point.y = snakeFloor(point.x) + h;
    const normal = new Vector3(-nx - dw * slope, dw, -nz).normalize();
    const hits = solid.rayCast(point.clone().addScaledVector(normal, 0.15).toArray(), point.clone().addScaledVector(normal, -0.15).toArray());
    if (hits.length !== 1) throw new Error(`Interior cup/track seam has ${hits.length} skins at ${side}, ${h}`);
    const gap = point.distanceTo(new Vector3(...hits[0].position));
    const angle = normal.angleTo(new Vector3(...hits[0].normal)) * 180 / Math.PI;
    probes++; maxGap = Math.max(maxGap, gap); maxNormalAngle = Math.max(maxNormalAngle, angle);
    if (gap > 0.015 || angle > 10) throw new Error(`Interior cup/track seam at ${side}, ${h}: ${gap} mm, ${angle} degrees`);
  }
  return { probes, maxGap, maxNormalAngle };
}
