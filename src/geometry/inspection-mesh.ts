import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu';
import { surfaceJet } from './continuity';
import type { Surface } from './surfaces';

/** Direct surface sampling, without CSG, normal welding or smoothing overrides. */
export function inspectionMesh(surface: Surface, sign = 1, steps = 80) {
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
  for (let i = 0; i <= steps; i++) for (let j = 0; j <= steps; j++) {
    const jet = surfaceJet(surface, i / steps, j / steps);
    positions.push(...jet.point.toArray()); normals.push(...jet.normal.multiplyScalar(sign).toArray());
    // Magnitude of the mean curvature, computed from the fundamental forms.
    const E = jet.du.lengthSq(), F = jet.du.dot(jet.dv), G = jet.dv.lengthSq();
    const e = jet.duu.dot(jet.normal), f = jet.duv.dot(jet.normal), g = jet.dvv.dot(jet.normal);
    const h = Math.abs((e * G - 2 * f * F + g * E) / (2 * (E * G - F * F)));
    const t = Math.min(1, h / 1.5);
    colors.push(t, 0.25 + 0.6 * (1 - t), 1 - t);
  }
  for (let i = 0; i < steps; i++) for (let j = 0; j < steps; j++) {
    const a = i * (steps + 1) + j, b = a + steps + 1;
    indices.push(...(sign === 1 ? [a, b, b + 1, a, b + 1, a + 1] : [a, b + 1, b, a, a + 1, b + 1]));
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  return geometry;
}
