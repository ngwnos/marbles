import type { Manifold } from 'manifold-3d';
import type { BufferGeometry } from 'three/webgpu';

/** Audit the Float32 mesh actually handed to the renderer, not just the CSG solid. */
export function auditRenderMesh(solid: Manifold, geometry?: BufferGeometry) {
  const mesh = solid.getMesh();
  const p = mesh.vertProperties, indices = mesh.triVerts, stride = mesh.numProp;
  let collapsedTriangles = 0, sliverTriangles = 0;
  const collapsedExamples: number[][][] = [];
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * stride, b = indices[i + 1] * stride, c = indices[i + 2] * stride;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const area2 = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    const longest = Math.max(Math.hypot(ux, uy, uz), Math.hypot(vx, vy, vz), Math.hypot(vx - ux, vy - uy, vz - uz));
    if (!Number.isFinite(area2) || area2 < 1e-8) {
      collapsedTriangles++;
      if (collapsedExamples.length < 3) collapsedExamples.push([a, b, c].map(v => Array.from(p.subarray(v, v + 3))));
    }
    if (area2 / longest < 1e-4) sliverTriangles++;
  }
  if (collapsedTriangles) throw new Error(`${collapsedTriangles} collapsed or invalid render triangles: ${JSON.stringify(collapsedExamples)}`);
  // A few thin CSG trim triangles are legitimate; dense clusters indicate
  // coincident skins. The original defective mesh had 2,210, including zero-area faces.
  if (sliverTriangles > 100) throw new Error(`${sliverTriangles} sliver triangles: inspect coincident joins`);
  if (geometry) {
    const normals = geometry.getAttribute('normal');
    for (let i = 0; i < normals.count; i++) {
      const length = Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i));
      if (!Number.isFinite(length) || Math.abs(length - 1) > 0.001)
        throw new Error(`Invalid render normal at vertex ${i}`);
    }
  } else {
    const withNormals = solid.calculateNormals(0, 40);
    try {
      const m = withNormals.getMesh();
      for (let i = 0; i < m.vertProperties.length; i += m.numProp) {
        const length = Math.hypot(...m.vertProperties.subarray(i + 3, i + 6));
        if (!Number.isFinite(length) || Math.abs(length - 1) > 0.001)
          throw new Error(`Invalid render normal at vertex ${i / m.numProp}`);
      }
    } finally { withNormals.delete(); }
  }
  return { collapsedTriangles, sliverTriangles };
}

/** Detect sheets at cylindrical joins which remain manifold but have no useful
 * wall thickness. A run of adjacent rays rejects a sheet, while an isolated
 * grazing ray on a rounded edge is allowed. Distances are in model units. */
export function auditCylindricalJoinSheets(solid:Manifold, options:{
 x:number;z:number;minY:number;maxY:number;innerRadius:number;outerRadius:number;
}) {
 const {x,z,minY,maxY,innerRadius,outerRadius}=options;
 let maxRun=0;
 for(let row=0;row<=Math.ceil((maxY-minY)/.2);row++) {
  const y=minY+row*.2;let run=0;
  for(let degree=0;degree<363;degree++) {
   const a=degree*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
   const hits=solid.rayCast([x+innerRadius*c,y,z+innerRadius*s],[x+outerRadius*c,y,z+outerRadius*s]);
   // A ray through a shared triangle edge can report the same boundary twice.
   // Count distinct crossings; coincident hits are not a second skin.
   const distances=hits.map(h=>h.distance*(outerRadius-innerRadius)).sort((a,b)=>a-b)
    .filter((d,i,a)=>!i||d-a[i-1]>1e-6);
   const thin=distances.length>=2&&distances[1]-distances[0]<.02;
   run=thin?run+1:0;maxRun=Math.max(maxRun,run);
  }
 }
 if(maxRun>=3)throw new Error(`Paper-thin join surface: ${maxRun} adjacent rays at connector (${x}, ${z})`);
 return {maxThinRun:maxRun};
}
