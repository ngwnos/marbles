import { Vector3 } from 'three/webgpu';
import type { Manifold } from 'manifold-3d';
import { snakeBridgeSurfaces } from '../src/pieces/snake-solid';
import { surfaceNormal } from '../src/geometry/surfaces';
import { assertJoins } from '../src/geometry/continuity';

/** Check both the tangent construction and its exposed surface in the final solid. */
export function auditTrackPostJoins(solid: Manifold) {
  let probes = 0, maxGap = 0, maxFacetAngle = 0;
  for (const end of [0, 3] as const) {
    const recipe = snakeBridgeSurfaces(end, true);
    // Only the forward half belongs to the partial track arc.
    assertJoins(recipe.joins.slice(0, 2));
    const surface = recipe.upper.surface;
    for (const u of [0.1, 0.3, 0.5, 0.7, 0.9]) for (const v of [0.3, 0.5, 0.7, 0.85]) {
      const point = surface(u, v), normal = surfaceNormal(surface, u, v);
      const hits = solid.rayCast(point.clone().addScaledVector(normal, 0.2).toArray(), point.clone().addScaledVector(normal, -0.2).toArray());
      if (hits.length !== 1) throw new Error(`Missing or doubled track/post skin at ${end}, ${u}, ${v}`);
      const gap = new Vector3(...hits[0].position).distanceTo(point);
      const angle = Math.acos(Math.min(1, Math.max(-1, new Vector3(...hits[0].normal).normalize().dot(normal)))) * 180 / Math.PI;
      maxGap = Math.max(maxGap, gap); maxFacetAngle = Math.max(maxFacetAngle, angle); probes++;
      // The solid is simplified to 0.01 mm. Its faceted normals are distinct
      // from the analytic tangent-continuity check above.
      if (gap > 0.015 || angle > 10) throw new Error(`Track/post blend differs from tangent surface: ${gap} mm, ${angle}°`);
    }
  }
  return { probes, maxGap, maxFacetAngle };
}
