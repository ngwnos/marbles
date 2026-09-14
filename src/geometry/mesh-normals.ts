import { BufferAttribute, type BufferGeometry, Vector3 } from 'three/webgpu';

export type NormalSource = {
  /** Preserve an exact parent surface's tangent at a trimmed blend boundary.
   * Only applies within an existing smoothing group; never bridges a crease. */
  boundaryPriority?: number;
  matches: (triangle: Vector3[], faceNormal: Vector3) => boolean;
  normal: (point: Vector3) => Vector3;
};

/** Correct known parent surfaces without replacing authored loft normals. */
export function applySurfaceNormals(geometry:BufferGeometry,sources:NormalSource[]){
  const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),idx=geometry.index!;
  for(let t=0;t<idx.count;t+=3){
    const ids=[0,1,2].map(j=>idx.getX(t+j)),points=ids.map(i=>new Vector3().fromBufferAttribute(p,i));
    const face=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
    const source=sources.find(s=>s.matches(points,face));if(!source)continue;
    ids.forEach((id,j)=>{const normal=source.normal(points[j]);n.setXYZ(id,normal.x,normal.y,normal.z);});
  }
  n.needsUpdate=true;return geometry;
}

/** Tangent of an authored height surface. Trim triangulation must not change
 * the shading of a floor (including curved floors and their undersides). */
export function heightSurfaceNormals(floor: (x:number,z:number)=>number,
  offset=0, sign=1, tolerance=.006): NormalSource {
  const normal=(p:Vector3)=>{
    const e=.001;
    return new Vector3(-(floor(p.x+e,p.z)-floor(p.x-e,p.z))/(2*e),1,
      -(floor(p.x,p.z+e)-floor(p.x,p.z-e))/(2*e)).normalize().multiplyScalar(sign);
  };
  return {boundaryPriority:2,normal,matches:(points,face)=>points.every(p=>
    Math.abs(p.y-floor(p.x,p.z)-offset)<tolerance && face.dot(normal(p))>.98)};
}

/** Exact parent-surface normals at boolean trims, shared by every connector. */
/** Analytic normals for a circular rolled rim, independent of trim triangles. */
export function torusNormals(options:{x?:number;z?:number;y:number;major:number;minor:number;tolerance:number}) {
 const {x=0,z=0,y,major,minor,tolerance}=options;
 const normal=(p:Vector3)=>{const r=Math.hypot(p.x-x,p.z-z);return new Vector3((p.x-x)*(r-major)/r,p.y-y,(p.z-z)*(r-major)/r).normalize();};
 return {boundaryPriority:3,normal,matches:(points:Vector3[],face:Vector3)=>points.every(p=>Math.abs(Math.hypot(Math.hypot(p.x-x,p.z-z)-major,p.y-y)-minor)<tolerance&&face.dot(normal(p))>.8)};
}

export function cylinderNormals(options: {
  x: number; z?: number; radius: number; inward?: boolean;
  tolerance: number; faceAlignment?: number; minY?: number; maxY?: number;
  boundaryPriority?: number;
}): NormalSource {
  const { x, z = 0, radius, inward = false, tolerance, faceAlignment = 0.98,
    minY = -Infinity, maxY = Infinity, boundaryPriority = 0 } = options;
  const normal = (p: Vector3) => inward
    ? new Vector3(x - p.x, 0, z - p.z).normalize()
    : new Vector3(p.x - x, 0, p.z - z).normalize();
  return { boundaryPriority, normal, matches: (points, face) => points.every(p =>
    p.y >= minY && p.y <= maxY && Math.abs(Math.hypot(p.x - x, p.z - z) - radius) < tolerance
    && face.dot(normal(p)) > faceAlignment) };
}

/** Rebuild smoothing groups from the final geometric faces, not CSG property
 * splits. Angle weighting prevents large trim triangles from dominating a join. */
export function angleWeightedNormals(geometry: BufferGeometry, sources: NormalSource[] = [], creaseDegrees = 40) {
  const positions = geometry.getAttribute('position'), indices = geometry.index!;
  type Corner = { offset: number; normal: Vector3; angle: number; source?: NormalSource };
  const vertices = new Map<string, { point: Vector3; corners: Corner[] }>();
  const cosine = Math.cos(creaseDegrees * Math.PI / 180);
  for (let i = 0; i < indices.count; i += 3) {
    const points = [0, 1, 2].map(j => new Vector3().fromBufferAttribute(positions, indices.getX(i + j)));
    const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
    const source = sources.find(s => s.matches(points, normal));
    for (let j = 0; j < 3; j++) {
      const point = points[j], key = point.toArray().map(x => Math.round(x * 1e5)).join(',');
      let vertex = vertices.get(key);
      if (!vertex) { vertex = { point, corners: [] }; vertices.set(key, vertex); }
      const a = points[(j + 1) % 3].clone().sub(point), b = points[(j + 2) % 3].clone().sub(point);
      vertex.corners.push({ offset: i + j, normal, source, angle: Math.atan2(a.clone().cross(b).length(), a.dot(b)) });
    }
  }
  const outputPositions: number[] = [], normals: number[] = [], outputIndices = new Uint32Array(indices.count);
  for (const { point, corners } of vertices.values()) {
    const parents = corners.map((_, i) => i);
    const root = (i: number): number => parents[i] === i ? i : (parents[i] = root(parents[i]));
    for (let i = 0; i < corners.length; i++) for (let j = 0; j < i; j++)
      if (corners[i].normal.dot(corners[j].normal) >= cosine) parents[root(i)] = root(j);
    const groups = new Map<number, Corner[]>();
    corners.forEach((corner, i) => { const r = root(i); const list = groups.get(r) ?? []; list.push(corner); groups.set(r, list); });
    for (const group of groups.values()) {
      const normal = new Vector3(); group.forEach(c => normal.addScaledVector(c.normal, c.angle)); normal.normalize();
      // An unchanged analytic face owns its boundary normal too. This prevents
      // a trim triangle's width from spreading a fillet normal up a whole tube.
      const priority = Math.max(0, ...group.map(c => c.source?.boundaryPriority ?? 0));
      const exact = group.flatMap(c => c.source && (c.source.boundaryPriority ?? 0) === priority ? [c.source.normal(point)] : []);
      if (exact.length && exact.every(n => n.dot(exact[0]) > 0.99999)) normal.copy(exact[0]);
      const id = outputPositions.length / 3;
      outputPositions.push(...point.toArray()); normals.push(...normal.toArray());
      group.forEach(c => { outputIndices[c.offset] = id; });
    }
  }
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(outputPositions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setIndex(new BufferAttribute(outputIndices, 1));
  return geometry;
}
