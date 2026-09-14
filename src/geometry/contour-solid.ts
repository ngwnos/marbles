import { ShapeUtils, Vector2 } from 'three/webgpu';
import type { ManifoldToplevel, Vec2 } from 'manifold-3d';

/** Loft corresponding closed contours. All rings share sampling and winding. */
export function contourSolid(kernel: ManifoldToplevel, levels: Vec2[],
  contour: (offset: number, height: number) => Vec2[], elevation: (x: number, z: number) => number) {
  const rings = levels.map(([offset, height]) => contour(offset, height));
  const count = rings[0].length, positions: number[] = [], triangles: number[] = [];
  rings.forEach((ring, level) => {
    if (ring.length !== count) throw new Error('Contour correspondence changed');
    ring.forEach(([x, z]) => positions.push(x, elevation(x, z) + levels[level][1], z));
  });
  for (let level = 0; level < rings.length - 1; level++) for (let i = 0; i < count; i++) {
    const a = level * count + i, b = level * count + (i + 1) % count;
    triangles.push(a, a + count, b + count, a, b + count, b);
  }
  for (const level of [0, rings.length - 1]) {
    for (const [a,b,c] of ShapeUtils.triangulateShape(rings[level].map(p => new Vector2(...p)), [])) {
      const n = level * count;
      triangles.push(...(level === 0 ? [a+n,b+n,c+n] : [c+n,b+n,a+n]));
    }
  }
  return new kernel.Manifold(new kernel.Mesh({ numProp: 3,
    vertProperties: new Float32Array(positions), triVerts: new Uint32Array(triangles) }));
}
