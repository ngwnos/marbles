import { Vector3, Mesh, MeshBasicMaterial, Raycaster, DoubleSide, type BufferGeometry } from 'three/webgpu';
import type { Manifold } from 'manifold-3d';
import { collarMouthHeight, collarAngularRoll } from '../src/pieces/connector-mouth';
import { PART_UNITS } from '../src/pieces/marbleworks-spec';
import { sampleSnake, snakeFloor, snakeMouthEnds, SNAKE_LENGTH } from '../src/pieces/snake-solid';

/** Probe exposed runouts in the final solid, on both sides of both ports. */
export function auditCollarMouths(solid: Manifold, geometry?: BufferGeometry) {
  let probes = 0, maxGap = 0, maxNormalAngle = 0, maxShadingAngle = 0;
  const renderMesh = geometry ? new Mesh(geometry, new MeshBasicMaterial({ side: DoubleSide })) : undefined;
  const ray = new Raycaster(); ray.far = 0.6;
  try {
  for (const end of [0, 3]) {
    const path = sampleSnake(end === 0 ? 0 : SNAKE_LENGTH), sign = end === 0 ? 1 : -1;
    const direction = Math.atan2(sign * path.dz, sign * path.dx);
    const px = sign * -PART_UNITS.portSpan / 2, inner = end === 0 ? 10.5 : 12.1;
    for (const side of [-1, 1]) for (const r of [inner + 0.03, inner + 0.1, inner + 0.3, 12.7, 13, 13.3]) for (const t of [0.2, 0.4, 0.6, 0.8]) {
      const d = Math.min(r - inner, 13.5 - r), q = d >= 0.75 ? 0.75 : Math.sqrt(0.75 ** 2 - (0.75 - d) ** 2);
      const middle = (inner + 13.5) / 2;
      const angle = side * ((side < 0 ? -snakeMouthEnds(end)[0] : snakeMouthEnds(end)[1]) - 3 / middle + (3 - collarAngularRoll(r, inner, q)) * Math.sin(t * Math.PI / 2) / middle);
      const originalX = px + r * Math.cos(angle + direction);
      const h = collarMouthHeight(r, angle, snakeFloor(originalX), inner, snakeMouthEnds(end)) - snakeFloor(originalX);
      const mapped = r;
      const x = px + mapped * Math.cos(angle + direction), z = mapped * Math.sin(angle + direction);
      const y = snakeFloor(x) + h;
      if (y > 46.5) continue; // Intentional seating shoulder clips the highest section.
      const surface = (baseRadius: number, a: number) => {
        const h = collarMouthHeight(baseRadius, a, 0, inner, snakeMouthEnds(end));
        const mapped = baseRadius;
        const x = px + mapped * Math.cos(a + direction);
        return new Vector3(x, snakeFloor(x) + h, mapped * Math.sin(a + direction));
      };
      const e = 0.0001;
      const normal = surface(r + e, angle).sub(surface(r - e, angle))
        .cross(surface(r, angle + e).sub(surface(r, angle - e))).normalize();
      if (normal.y < 0) normal.negate();
      const point = new Vector3(x, y, z);
      const hits = solid.rayCast(point.clone().addScaledVector(normal, 0.3).toArray(), point.clone().addScaledVector(normal, -0.3).toArray());
      if (hits.length !== 1) throw new Error(`Collar runout has ${hits.length} skins at ${end}, ${side}, ${r}, ${t}`);
      const gap = new Vector3(...hits[0].position).distanceTo(new Vector3(x, y, z));
      if (renderMesh) {
        ray.set(point.clone().addScaledVector(normal, 0.3), normal.clone().negate());
        const hit = ray.intersectObject(renderMesh, false)[0];
        if (!hit?.normal) throw new Error('Missing rendered mouth surface');
        const angle = normal.angleTo(hit.normal.normalize()) * 180 / Math.PI;
        maxShadingAngle = Math.max(maxShadingAngle, angle);
        if (angle > 10) throw new Error(`Mouth shading differs by ${angle} degrees at ${end}, ${side}, ${r}, ${t}`);
      }
      maxGap = Math.max(maxGap, gap); maxNormalAngle = Math.max(maxNormalAngle, normal.angleTo(new Vector3(...hits[0].normal)) * 180 / Math.PI); probes++;
      if (gap > 0.015) throw new Error(`Collar runout differs by ${gap} mm at ${end}, ${side}, ${r}, ${t}: ${JSON.stringify({ point: point.toArray(), normal: normal.toArray(), hit: hits[0].position, hitNormal: hits[0].normal })}`);
    }
  }
  return { probes, maxGap, maxNormalAngle, ...(geometry ? { maxShadingAngle } : {}) };
  } finally { renderMesh?.material.dispose(); }
}
