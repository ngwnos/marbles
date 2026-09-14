import {Vector3} from 'three/webgpu';
import {TRACK} from '../src/pieces/marbleworks-spec';
import {loadSolidKernel} from '../src/pieces/solid-kernel';
import {buildMazeSolid,mazeGeometry,MAZE,mazeFloor} from '../src/pieces/maze';
import {encodePreviewMesh} from '../src/geometry/preview-mesh';
import {auditRenderMesh} from '../tests/mesh-quality';
const k=await loadSolidKernel(),solid=buildMazeSolid(k);
if(solid.status()!=='NoError')throw new Error(solid.status());
const parts=solid.decompose();if(parts.length!==1)throw new Error(`Maze has ${parts.length} components`);parts.forEach(p=>p.delete());
for(const [x,z] of MAZE.pins){
 const hit=solid.rayCast([x,mazeFloor(x)-3,z],[x,mazeFloor(x)+10,z]);
 if(hit.length!==2)throw new Error('Pin must be hollow with a closed cap');
}
const geometry=mazeGeometry(solid);console.log(auditRenderMesh(solid,geometry));
const positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal');
const normal=new Vector3(TRACK.runDrop/MAZE.span,1,0).normalize();
let planeProbes=0;
for(let i=0;i<geometry.index!.count;i+=3){
 const ids=[0,1,2].map(j=>geometry.index!.getX(i+j));
 const p=ids.map(id=>new Vector3().fromBufferAttribute(positions,id));
 if(p.every(v=>Math.abs(v.y-mazeFloor(v.x))<.002)&&p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0])).normalize().dot(normal)>.9999){
  for(const id of ids)if(new Vector3().fromBufferAttribute(normals,id).dot(normal)<.9999)throw new Error('Flat maze floor shading changed');
  planeProbes++;
 }
}
if(planeProbes<20)throw new Error('Insufficient floor normal probes');
console.log({planeProbes});
await Bun.write('src/generated/maze.bin' ,encodePreviewMesh(geometry));
const simple=solid.simplify(.04),m=simple.getMesh();
await Bun.write('src/generated/maze-collision.json',JSON.stringify({vertices:Array.from(m.vertProperties),indices:Array.from(m.triVerts)}));
console.log({triangles:solid.numTri(),colliderTriangles:simple.numTri()});simple.delete();geometry.dispose();solid.delete();
