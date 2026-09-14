import type { MeshOptions } from 'manifold-3d';
export const MESH_FLIP_TOLERANCE = 0.005;

/** Improve trim diagonals without welding vertices or moving the surface points. */
export function regularizeMesh(mesh: MeshOptions, surfaceRegion?: (points: number[][]) => string | undefined) {
  const p = mesh.vertProperties, stride = mesh.numProp;
  const triangles = new Uint32Array(mesh.triVerts);
  const point = (i: number) => [p[i * stride], p[i * stride + 1], p[i * stride + 2]];
  const normal = (a: number, b: number, c: number) => {
    const u = point(b).map((v, i) => v - p[a * stride + i]);
    const v = point(c).map((v, i) => v - p[a * stride + i]);
    return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  };
  const dot = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + v * b[i], 0);
  const length2 = (a: number, b: number) => point(a).reduce((sum, v, i) => sum + (v - p[b * stride + i]) ** 2, 0);
  const quality = (a: number, b: number, c: number) =>
    Math.hypot(...normal(a, b, c)) / (length2(a, b) + length2(b, c) + length2(c, a));
  const key = (a: number, b: number) => a < b ? `${a},${b}` : `${b},${a}`;
  let flips = 0;
  for (let pass = 0; pass < 5; pass++) {
    const edges = new Map<string, { a: number; b: number; c: number; t: number }[]>();
    for (let t = 0; t < triangles.length; t += 3) for (let i = 0; i < 3; i++) {
      const a = triangles[t + i], b = triangles[t + (i + 1) % 3], c = triangles[t + (i + 2) % 3];
      const k = key(a, b);
      if (!edges.has(k)) edges.set(k, []);
      edges.get(k)!.push({ a, b, c, t });
    }
    const touched = new Set<number>();
    for (const pair of edges.values()) {
      if (pair.length !== 2) continue;
      const [left, right] = pair;
      const { a, b, c } = left, d = right.c;
      // A nearly coplanar fillet is still a different surface. Flipping across
      // that boundary can stretch its normal influence along a whole cylinder.
      if (surfaceRegion && surfaceRegion([point(a), point(b), point(c)]) !== surfaceRegion([point(b), point(a), point(d)])) continue;
      if (left.a !== right.b || left.b !== right.a || touched.has(left.t) || touched.has(right.t) || edges.has(key(c, d))) continue;
      const before = Math.min(quality(a, b, c), quality(b, a, d));
      if (before > 0.12 || Math.min(quality(c, a, d), quality(c, d, b)) < before * 1.2) continue;
      const n = normal(a, b, c), m = normal(b, a, d);
      if (dot(n, m) < 0.999 * Math.hypot(...n) * Math.hypot(...m)) continue;
      // Bound the deviation from the original pair of planes to 0.005 mm.
      const delta = point(d).map((v, i) => v - p[a * stride + i]);
      if (Math.abs(dot(delta, n)) > MESH_FLIP_TOLERANCE * Math.hypot(...n)) continue;
      if (dot(normal(c, a, d), n) <= 0 || dot(normal(c, d, b), n) <= 0) continue;
      triangles.set([c, a, d], left.t);
      triangles.set([c, d, b], right.t);
      touched.add(left.t); touched.add(right.t);
      flips++;
    }
    if (!touched.size) break;
  }
  return { mesh: { ...mesh, triVerts: triangles }, flips };
}
