import { MathUtils, Vector3 } from 'three/webgpu';
import type { Surface } from './surfaces';

export type Continuity = 'G0' | 'G1' | 'G2';
export type Boundary = { surface: Surface; edge: 'u0' | 'u1' | 'v0' | 'v1'; reverse?: boolean; normalSign?: number };
export type Join = { name: string; a: Boundary; b: Boundary; expected: Continuity; positionTolerance?: number; angleTolerance?: number; curvatureTolerance?: number };

function stencil(t: number) {
  const e = 1e-4;
  if (t < e) return { ts: [t, t + e, t + 2 * e], d: [-1.5 / e, 2 / e, -0.5 / e], dd: [1 / e ** 2, -2 / e ** 2, 1 / e ** 2] };
  if (t > 1 - e) return { ts: [t - 2 * e, t - e, t], d: [0.5 / e, -2 / e, 1.5 / e], dd: [1 / e ** 2, -2 / e ** 2, 1 / e ** 2] };
  return { ts: [t - e, t, t + e], d: [-0.5 / e, 0, 0.5 / e], dd: [1 / e ** 2, -2 / e ** 2, 1 / e ** 2] };
}

/** Evaluate geometric derivatives; rendering normals never enter this check. */
export function surfaceJet(surface: Surface, u: number, v: number) {
  const su = stencil(u), sv = stencil(v), point = surface(u, v);
  const du = new Vector3(), dv = new Vector3(), duu = new Vector3(), dvv = new Vector3(), duv = new Vector3();
  for (let i = 0; i < 3; i++) {
    const pu = surface(su.ts[i], v).sub(point), pv = surface(u, sv.ts[i]).sub(point);
    du.addScaledVector(pu, su.d[i]); duu.addScaledVector(pu, su.dd[i]);
    dv.addScaledVector(pv, sv.d[i]); dvv.addScaledVector(pv, sv.dd[i]);
    for (let j = 0; j < 3; j++) duv.addScaledVector(surface(su.ts[i], sv.ts[j]).sub(point), su.d[i] * sv.d[j]);
  }
  const normal = du.clone().cross(dv);
  const regularity = normal.length() / Math.max(du.length() * dv.length(), 1e-20);
  normal.normalize();
  return { point, du, dv, duu, dvv, duv, normal, regularity };
}

export function sampleBoundary(boundary: Boundary, t: number) {
  const s = boundary.reverse ? 1 - t : t, fixedU = boundary.edge.startsWith('u');
  const atEnd = boundary.edge.endsWith('1') ? 1 : 0;
  const j = surfaceJet(boundary.surface, fixedU ? atEnd : s, fixedU ? s : atEnd);
  j.normal.multiplyScalar(boundary.normalSign ?? 1);
  // Curvature transverse to the seam, correcting for skew parameter lines.
  const a = fixedU ? 1 : -j.dv.dot(j.du) / Math.max(j.du.lengthSq(), 1e-20);
  const b = fixedU ? -j.du.dot(j.dv) / Math.max(j.dv.lengthSq(), 1e-20) : 1;
  const tangent = j.du.clone().multiplyScalar(a).addScaledVector(j.dv, b);
  const second = j.duu.clone().multiplyScalar(a * a).addScaledVector(j.duv, 2 * a * b).addScaledVector(j.dvv, b * b);
  return { ...j, curvature: second.dot(j.normal) / Math.max(tangent.lengthSq(), 1e-20) };
}

function normalCurvature(j: ReturnType<typeof surfaceJet>, direction: Vector3) {
  const E = j.du.lengthSq(), F = j.du.dot(j.dv), G = j.dv.lengthSq();
  const determinant = E * G - F * F;
  const x = direction.dot(j.du), y = direction.dot(j.dv);
  const a = (G * x - F * y) / determinant, b = (E * y - F * x) / determinant;
  return j.duu.clone().multiplyScalar(a * a).addScaledVector(j.duv, 2 * a * b)
    .addScaledVector(j.dvv, b * b).dot(j.normal);
}

export function inspectJoin(join: Join, samples = 65) {
  const positionTolerance = join.positionTolerance ?? 1e-5;
  const angleTolerance = join.angleTolerance ?? 0.1; // degrees
  const curvatureTolerance = join.curvatureTolerance ?? 0.02; // 1/mm
  const points = Array.from({ length: samples }, (_, i) => {
    const t = i / (samples - 1), a = sampleBoundary(join.a, t), b = sampleBoundary(join.b, t);
    const gap = a.point.distanceTo(b.point);
    const angle = MathUtils.radToDeg(Math.acos(MathUtils.clamp(a.normal.dot(b.normal), -1, 1)));
    // Compare the full symmetric curvature form in one physical tangent frame.
    // A transverse-only check misses a twist mismatch at an isolated sample.
    const tangent = (join.a.edge.startsWith('u') ? a.dv : a.du).clone().normalize();
    const across = a.normal.clone().cross(tangent).normalize();
    const directions = [tangent, across, tangent.clone().add(across).normalize()];
    const curvature = Math.max(...directions.map(direction => Math.abs(normalCurvature(a, direction) - normalCurvature(b, direction))));
    const regular = a.regularity > 1e-5 && b.regularity > 1e-5;
    const passed = regular && Number.isFinite(gap + angle + curvature) && gap <= positionTolerance
      && (join.expected === 'G0' || angle <= angleTolerance)
      && (join.expected !== 'G2' || curvature <= curvatureTolerance);
    return { t, position: a.point, gap, angle, curvature, regular, passed };
  });
  return { name: join.name, expected: join.expected, passed: points.every(p => p.passed),
    maxGap: Math.max(...points.map(p => p.gap)), maxAngle: Math.max(...points.map(p => p.angle)),
    maxCurvatureDifference: Math.max(...points.map(p => p.curvature)), points };
}

export function assertJoins(joins: Join[]) {
  const results = joins.map(join => inspectJoin(join));
  const failures = results.filter(result => !result.passed);
  if (failures.length) throw new Error(failures.map(r => `${r.name}: gap ${r.maxGap.toExponential(2)} mm, angle ${r.maxAngle.toFixed(3)}°, curvature Δ ${r.maxCurvatureDifference.toFixed(3)}/mm`).join('\n'));
  return results;
}
