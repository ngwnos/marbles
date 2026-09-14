import assert from 'node:assert/strict';
import {BufferGeometry,Float32BufferAttribute,Mesh,MeshBasicMaterial,DoubleSide,Raycaster,Vector3,Quaternion,Euler} from 'three/webgpu';
import {decodePreviewMesh} from '../src/geometry/preview-mesh';
import {createAssemblyPhysics} from '../src/assembly/physics';
import {STORAGE_TUB as D,aboveStorageTub} from '../src/assembly/storage-tub-spec';
import collision from '../src/generated/storage-tub-collision.json';

const render=decodePreviewMesh(await Bun.file('src/generated/storage-tub.bin').arrayBuffer());
const collider=new BufferGeometry();collider.setAttribute('position',new Float32BufferAttribute(collision.vertices,3));collider.setIndex(collision.indices);
const material=new MeshBasicMaterial({side:DoubleSide});
for(const [name,geometry] of [['render',render],['collision',collider]] as const){
 const tolerance=name==='render'?.02:.16; // Collider is simplified to 0.15 mm.
 const mesh=new Mesh(geometry,material),ray=new Raycaster();
 const cast=(origin:Vector3,direction:Vector3)=>{ray.set(origin,direction);return ray.intersectObject(mesh).filter((h,i,a)=>!i||Math.abs(h.distance-a[i-1].distance)>.01);};
 let probes=0;
 // The cavity has one floor, open access above it, and no accidental lid.
 for(let x=-180;x<=180;x+=30)for(let z=-100;z<=100;z+=25){
  const hits=cast(new Vector3(x,500,z),new Vector3(0,-1,0));
  assert.equal(hits.length,2,`${name} floor coverage at ${x},${z}`);
  assert(Math.abs(hits[0].point.y-D.wall)<tolerance&&Math.abs(hits[1].point.y)<tolerance,`${name} floor thickness: ${hits.map(h=>h.point.y)}`);probes++;
 }
 for(const sign of [-1,1]){
  // The handhold is outside the unbroken end wall, open vertically.
  for(const z of [-40,0,40]){
   const gap=cast(new Vector3(sign*290,500,z),new Vector3(0,-1,0));
   assert.equal(gap.length,0,`${name} grip finger space is blocked`);probes++;
   for(const y of [390,400,407]){
    const hits=cast(new Vector3(sign*260,y,z),new Vector3(sign,0,0)).filter(h=>h.distance<25);
    assert.equal(hits.length,2,`${name} has a hole in the end wall behind its handle`);
    assert(hits[1].distance-hits[0].distance>3,`${name} end wall too thin`);probes++;
   }
  }
  const bar=cast(new Vector3(sign*300,430,0),new Vector3(0,-1,0));
  assert.equal(bar.length,2);assert(bar[0].point.y<D.height-8,'Grip must sit below the lid seat');probes++;
 }
 console.log(name,probes,'floor, intact wall and external grip probes passed');
}
// Normals must agree with the actual triangle winding on both skins and grips.
const p=render.getAttribute('position'),n=render.getAttribute('normal'),ix=render.index!;
let minDot=1;
for(let i=0;i<ix.count;i+=3){
 const ids=[ix.getX(i),ix.getX(i+1),ix.getX(i+2)];
 const [a,b,c]=ids.map(j=>new Vector3().fromBufferAttribute(p,j));
 const face=b.sub(a).cross(c.sub(a)).normalize();
 const normal=ids.reduce((s,j)=>s.add(new Vector3().fromBufferAttribute(n,j)),new Vector3()).normalize();
 minDot=Math.min(minDot,face.dot(normal));
}
assert(minDot>.6,`Reversed or severely incorrect tub normals: dot ${minDot}`);console.log('Minimum face/shading normal agreement',minDot);

const sim=await createAssemblyPhysics(),q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),D.yaw),origin=new Vector3(...D.position);
const at=(x:number,y:number,z:number)=>new Vector3(x,y,z).applyQuaternion(q).add(origin);
// A real builder marble falls to the bottom; it must not rest on a filled hull.
assert(sim.dropMarble(at(0,470,0).toArray()));for(let i=0;i<180;i++)sim.step();
const marble=sim.marblePositions()[0];assert(marble&&marble.y>D.position[1]+10&&marble.y<D.position[1]+14,'Marble did not reach the open tub floor');sim.clearMarbles();
const kinds=['spacer','ramp','snake','bumper','funnel','coupler'];
for(let i=0;i<24;i++){
 const x=(i%3-1)*95,z=(Math.floor(i/3)%2-.5)*90;
 sim.add(i,kinds[i%kinds.length],at(x,470,z).toArray(),new Quaternion().setFromEuler(new Euler(.09*(i%3),D.yaw+.13*(i%4),.1)),false);
 for(let j=0;j<80;j++)sim.step();
}
for(let j=0;j<600;j++)sim.step();
let maxHeight=0;
for(let i=0;i<24;i++){
 const pose=sim.pose(i)!;assert(aboveStorageTub(pose.position.x,pose.position.z),`${kinds[i%kinds.length]} escaped the tub`);
 assert(pose.position.y>D.position[1]-5&&pose.position.y<D.position[1]+D.height-35,`Piece ${i} did not settle inside: ${pose.position.y}`);
 maxHeight=Math.max(maxHeight,pose.position.y);
}
console.log('24 mixed loose pieces retained; maximum body origin height',maxHeight);sim.dispose();render.dispose();collider.dispose();material.dispose();
