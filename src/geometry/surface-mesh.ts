import { Vector3 } from 'three/webgpu';
import type { ManifoldToplevel } from 'manifold-3d';
import type { Surface } from './surfaces';

/** Indexed patches share seam vertices; each quad has a consistent diagonal. */
export class ShellMesh {
  private positions: number[] = [];
  private normals: (Vector3 | undefined)[] = [];
  private triangles: number[] = [];
  private vertices = new Map<string, number>();
  /** Allocate an edge once. Every adjoining patch consumes these exact indices. */
  seam(curve: (t: number) => Vector3, segments: number) {
    return Array.from({ length: segments + 1 }, (_, i) => this.vertex(curve(i / segments)));
  }
  vertex(p: Vector3, normal?: Vector3) {
    const key = [p.x, p.y, p.z].map(x => Math.round(x * 100000)).join(',');
    const old = this.vertices.get(key);
    if (old !== undefined) {
      if (normal && !this.normals[old]) this.normals[old] = normal;
      return old;
    }
    const id = this.positions.length / 3;
    this.positions.push(p.x, p.y, p.z); this.normals.push(normal); this.vertices.set(key, id);
    return id;
  }
  patch(surface: Surface, nu: number, nv: number, flip = false, normal?: Surface,
    seams: Partial<Record<'u0' | 'u1' | 'v0' | 'v1', number[]>> = {}) {
    for (const [edge, ids] of Object.entries(seams)) {
      if (ids.length !== (edge.startsWith('u') ? nv : nu) + 1) throw new Error('Seam sampling mismatch');
    }
    const grid: number[][] = [];
    for (let i = 0; i <= nu; i++) {
      grid[i] = [];
      for (let j = 0; j <= nv; j++) {
        const p = surface(i / nu, j / nv);
        const edges = [i === 0 ? seams.u0?.[j] : undefined, i === nu ? seams.u1?.[j] : undefined,
          j === 0 ? seams.v0?.[i] : undefined, j === nv ? seams.v1?.[i] : undefined].filter(id => id !== undefined);
        if (edges.some(id => id !== edges[0])) throw new Error('Conflicting seam corners');
        const id = edges[0];
        if (id !== undefined && p.distanceTo(new Vector3().fromArray(this.positions, 3 * id)) > 1e-5)
          throw new Error('Patch disagrees with its shared seam');
        grid[i][j] = id ?? this.vertex(p, normal?.(i / nu, j / nv));
        if (id !== undefined && !this.normals[id]) this.normals[id] = normal?.(i / nu, j / nv);
      }
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = grid[i][j], b = grid[i + 1][j], c = grid[i + 1][j + 1], d = grid[i][j + 1];
      for (const tri of [[a, b, c], [a, c, d]]) {
        if (new Set(tri).size < 3) continue;
        this.triangles.push(...(flip ? tri.reverse() : tri));
      }
    }
  }
  solid(kernel: ManifoldToplevel) {
    const edges = new Map<string, number[]>();
    for (let i = 0; i < this.triangles.length; i += 3) for (let j = 0; j < 3; j++) {
      const a = this.triangles[i + j], b = this.triangles[i + (j + 1) % 3];
      const key = `${Math.min(a, b)},${Math.max(a, b)}`;
      const values = edges.get(key) ?? [];
      values.push(a < b ? 1 : -1); edges.set(key, values);
    }
    const bad = [...edges.entries()].filter(([, x]) => x.length !== 2 || x[0] === x[1]);
    if (bad.length) throw new Error(JSON.stringify({ badEdges: bad.length,
      examples: bad.slice(0, 12).map(([key, counts]) => ({ counts, points: key.split(',').map(id => this.positions.slice(+id * 3, +id * 3 + 3)) })) }));
    const fallback = this.normals.map(() => new Vector3());
    for (let i = 0; i < this.triangles.length; i += 3) {
      const ids = this.triangles.slice(i, i + 3);
      const [a, b, c] = ids.map(id => new Vector3().fromArray(this.positions, id * 3));
      const n = b.sub(a).cross(c.sub(a));
      ids.forEach(id => fallback[id].add(n));
    }
    const properties = new Float32Array(this.normals.length * 6);
    this.normals.forEach((normal, i) => {
      properties.set(this.positions.slice(i * 3, i * 3 + 3), i * 6);
      properties.set((normal ?? fallback[i].normalize()).toArray(), i * 6 + 3);
    });
    return new kernel.Manifold(new kernel.Mesh({ numProp: 6,
      vertProperties: properties, triVerts: new Uint32Array(this.triangles) }));
  }
}
