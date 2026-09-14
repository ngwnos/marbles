import type { Manifold } from 'manifold-3d';
import { Vector3, Mesh, MeshBasicMaterial, Raycaster, DoubleSide, type BufferGeometry } from 'three/webgpu';
import { STANDARD_RAMP } from '../src/pieces/standard-ramp';

/** Sample the actual surface on both sides of the straight/coil boundary,
 * across both curved sidewalls and the bed—not just along the marble path. */
export function auditStandardEntry(solid: Manifold, geometry?: BufferGeometry) {
  const d = STANDARD_RAMP, x0 = d.centersAlongTrack / 2;
  const slope = (d.straightEndHeight - d.straightStartHeight) / (d.centersAlongTrack - 7);
  const sections = [-3, 0, 3].map(across => ({ across, h: 0, ny: 1, nz: 0 }));
  for (const side of [-1, 1]) for (let i = 0; i < 20; i++) {
    const a = (side < 0 ? Math.PI : -Math.PI / 2) + (i + 0.5) / 20 * Math.PI / 2;
    sections.push({ across: side * 4 + 5.5 * Math.cos(a), h: 5.5 + 5.5 * Math.sin(a), ny: -Math.sin(a), nz: Math.cos(a) });
  }
  for (const side of [-1, 1]) for (let i = 0; i < 12; i++) {
    const a = (i + 0.5) / 12 * Math.PI;
    sections.push({ across: side * 10.75 + 0.75 * Math.cos(a), h: 10 + 0.75 * Math.sin(a), ny: Math.sin(a), nz: -Math.cos(a) });
  }
  let probes = 0, maxGap = 0, maxNormalJump = 0, maxShadingError = 0;
  const mesh = geometry ? new Mesh(geometry, new MeshBasicMaterial({ side: DoubleSide })) : undefined;
  const ray = new Raycaster(); ray.far = 0.8;
  try {
  for (const section of sections) {
    // The inside half of the divider roll enters the central post. It is
    // internal material there, not an exposed rail surface to ray-test.
    if (Math.hypot(0.2, -24 - section.across) < 13.5) continue;
    const normal = new Vector3(-slope * section.ny, section.ny, section.nz).normalize();
    const normals: Vector3[] = [];
    for (const offset of [-0.2, 0.2]) {
      const point = new Vector3(x0 + offset, d.straightEndHeight + slope * offset + section.h, -24 - section.across);
      const hits = solid.rayCast(point.clone().addScaledVector(normal, 0.4).toArray(), point.clone().addScaledVector(normal, -0.4).toArray());
      if (hits.length !== 1) throw new Error(`Entry has ${hits.length} surfaces at ${section.across}, ${offset}`);
      const gap = point.distanceTo(new Vector3(...hits[0].position));
      maxGap = Math.max(maxGap, gap); normals.push(new Vector3(...hits[0].normal)); probes++;
      if (gap > 0.015) throw new Error(`Straight/coil lip: ${gap} mm at across=${section.across}, offset=${offset}`);
      if (mesh) {
        ray.set(point.clone().addScaledVector(normal, 0.4), normal.clone().negate());
        const hit = ray.intersectObject(mesh)[0];
        if (!hit?.normal) throw new Error('Missing rendered entry surface');
        const error = normal.angleTo(hit.normal) * 180 / Math.PI;
        maxShadingError = Math.max(maxShadingError, error);
        if (error > 5) throw new Error(`Entry shading differs by ${error} degrees at ${section.across}, ${offset}`);
      }
    }
    const jump = normals[0].angleTo(normals[1]) * 180 / Math.PI;
    maxNormalJump = Math.max(maxNormalJump, jump);
    if (jump > 5) throw new Error(`Straight/coil normal discontinuity: ${jump} degrees at ${section.across}`);
  }
  return { probes, maxGap, maxNormalJump, ...(mesh ? { maxShadingError } : {}) };
  } finally { mesh?.material.dispose(); }
}
