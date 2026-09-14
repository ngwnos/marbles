import {loadSolidKernel} from '../src/pieces/solid-kernel';
import {buildRampSolid,rampSolidToGeometry} from '../src/pieces/standard-ramp';
import {buildFunnelSolid,funnelGeometry} from '../src/pieces/funnel';
import {buildSpacerSolid} from '../src/pieces/spacer';
import {solidToGeometry} from '../src/pieces/solid-geometry';
import {encodePreviewMesh,decodePreviewMesh} from '../src/geometry/preview-mesh';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {Vector3} from 'three/webgpu';
const k=await loadSolidKernel();
for(const [name,build,shade] of [['ramp',buildRampSolid,rampSolidToGeometry],['funnel',buildFunnelSolid,funnelGeometry],['spacer',buildSpacerSolid,solidToGeometry]] as const){
 if(process.argv.includes("--hulls"))continue;
 const s=build(k),g=shade(s);await Bun.write(`src/generated/${name}.bin`,encodePreviewMesh(g));s.delete();g.dispose();console.log(name);
}

const read=async(name:string)=>decodePreviewMesh(await Bun.file(`src/generated/${name}.bin`).arrayBuffer());
const paddleParts=await Promise.all(['paddle-body','paddle-wheel'].map(read));
const paddle=mergeGeometries(paddleParts)!;await Bun.write('src/generated/paddle.bin',encodePreviewMesh(paddle));
paddle.dispose();paddleParts.forEach(g=>g.dispose());
// Spatial convex patches for loose-part collisions. Keep channels/holes open;
// never use one convex envelope for a complete concave track.
const {PARTS}=await import('../src/assembly/catalog');
const directions:Vector3[]=[];for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)if(x||y||z)directions.push(new Vector3(x,y,z));
const all:Record<string,number[][]>={};
for(const part of [...PARTS,{id:'paddle-body'},{id:'start-body'}]){
 const g=await read(part.id),p=g.getAttribute('position'),idx=g.index!,cells=new Map<string,Vector3[]>();
 const add=(v:Vector3,n:Vector3)=>{
  const key=[v.x,v.y,v.z].map(x=>Math.floor(x/14)).join(',');let cell=cells.get(key);if(!cell){cell=[];cells.set(key,cell);}
  cell.push(v.clone().addScaledVector(n,.15),v.clone().addScaledVector(n,-.15));
 };
 const sample=(a:Vector3,b:Vector3,c:Vector3,n:Vector3,depth=0)=>{
  const lengths=[a.distanceToSquared(b),b.distanceToSquared(c),c.distanceToSquared(a)];const longest=Math.max(...lengths);
  if(longest>100&&depth<10){const edge=lengths.indexOf(longest);if(edge===0){const m=a.clone().add(b).multiplyScalar(.5);sample(a,m,c,n,depth+1);sample(m,b,c,n,depth+1);}else if(edge===1){const m=b.clone().add(c).multiplyScalar(.5);sample(a,b,m,n,depth+1);sample(a,m,c,n,depth+1);}else{const m=c.clone().add(a).multiplyScalar(.5);sample(a,b,m,n,depth+1);sample(m,b,c,n,depth+1);}return;}
  add(a,n);add(b,n);add(c,n);
 };
 for(let i=0;i<idx.count;i+=3){const [a,b,c]=[0,1,2].map(j=>new Vector3().fromBufferAttribute(p,idx.getX(i+j)));sample(a,b,c,b.clone().sub(a).cross(c.clone().sub(a)).normalize());}
 all[part.id]=[...cells.values()].map(points=>{
  const extremes=directions.map(d=>points.reduce((a,b)=>a.dot(d)>b.dot(d)?a:b));
  // A tiny local thickness also makes isolated edge samples valid hulls.
  const unique=new Map(extremes.map(v=>[v.toArray().join(','),v]));
  if(unique.size<4){const p=points[0];return [-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].flatMap(z=>[p.x+x*.2,p.y+y*.2,p.z+z*.2])));}
  return [...unique.values()].flatMap(v=>v.toArray());
 });
 console.log(part.id,all[part.id].length,'collision patches');g.dispose();
}
await Bun.write('src/generated/assembly-hulls.json',JSON.stringify(all));
