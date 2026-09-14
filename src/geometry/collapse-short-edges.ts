import type { MeshOptions } from 'manifold-3d';

/** Collapse unresolvable edges only when the manifold link condition holds.
 * Faces incident to the collapsed edge disappear together; no holes are cut.
 */
export function collapseShortEdges(mesh: MeshOptions, tolerance: number): MeshOptions {
  const p = mesh.vertProperties, stride = mesh.numProp;
  let triangles = Array.from(mesh.triVerts);
  const count = p.length / stride;
  for (let pass = 0; pass < 4; pass++) {
    const neighbors = Array.from({ length: count }, () => new Set<number>());
    const incident = Array.from({ length: count }, () => [] as number[]);
    for (let i = 0; i < triangles.length; i += 3) for (let j = 0; j < 3; j++) {
      const a = triangles[i + j]; incident[a].push(i);
      neighbors[a].add(triangles[i + (j + 1) % 3]); neighbors[a].add(triangles[i + (j + 2) % 3]);
    }
    const remap = new Map<number, number>(), touched = new Set<number>();
    const normal = (ids: number[]) => {
      const [a, b, c] = ids.map(i => i * stride);
      const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
      const v = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
      return [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
    };
    for (let a = 0; a < count; a++) for (const b of neighbors[a]) {
      if (a >= b || touched.has(a) || touched.has(b)) continue;
      if (Math.hypot(p[a*stride]-p[b*stride], p[a*stride+1]-p[b*stride+1], p[a*stride+2]-p[b*stride+2]) >= tolerance) continue;
      if ([...neighbors[a]].filter(v => neighbors[b].has(v)).length !== 2) continue;
      const valid = incident[b].every(i => {
        const old = triangles.slice(i, i + 3); if (old.includes(a)) return true;
        const before = normal(old), after = normal(old.map(v => v === b ? a : v));
        // A pre-existing zero-area face has no orientation to preserve. Requiring
        // a positive dot product here made degenerate CSG edges unrepairable.
        if(Math.hypot(...before)<1e-8)return true;
        return before.reduce((sum, v, k) => sum + v * after[k], 0) > 0
          && Math.hypot(...after) >= Math.min(1e-8, Math.hypot(...before));
      });
      if (!valid) continue;
      remap.set(b, a); touched.add(a); touched.add(b);
      neighbors[a].forEach(v => touched.add(v)); neighbors[b].forEach(v => touched.add(v));
    }
    if (!remap.size) break;
    const next: number[] = [];
    for (let i = 0; i < triangles.length; i += 3) {
      const [a, b, c] = triangles.slice(i, i + 3).map(v => remap.get(v) ?? v);
      if (a !== b && b !== c && c !== a) next.push(a, b, c);
    }
    triangles = next;
  }
  // Face/run IDs describe the old triangles and must not survive topology edits.
  return { numProp: stride, vertProperties: p, triVerts: new Uint32Array(triangles) };
}
