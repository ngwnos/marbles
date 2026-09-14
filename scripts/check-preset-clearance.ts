import assert from 'node:assert/strict';
import Module,{type Manifold} from 'manifold-3d';
import {Box3,Vector3} from 'three';
import {PRESETS} from '../src/assembly/presets';

// Test actual solid intersections, including connected neighbors: successful
// socket snapping alone does not detect a track cutting through another part.
const k=await Module();k.setup();
const selected=process.argv.find(a=>a.startsWith('--preset='))?.slice(9);
assert(!selected||PRESETS.some(p=>p.id===selected),'Unknown preset');
const sources=new Map<string,Manifold>();
for(const preset of PRESETS.filter(p=>!selected||p.id===selected)){
 for(const kind of new Set(preset.pieces.map(p=>p.kind)))if(!sources.has(kind)){
  const data=await Bun.file('src/generated/'+(kind==='paddle'?'paddle-body':kind)+'-collision.json').json();
  const parts=(data.parts??[data]).map((p:{vertices:number[];indices:number[]})=>{
   const mesh=new k.Mesh({numProp:3,vertProperties:new Float32Array(p.vertices),triVerts:new Uint32Array(p.indices)});mesh.merge();
   const solid=new k.Manifold(mesh);assert.equal(solid.status(),'NoError',kind+' invalid solid');return solid;
  });
  sources.set(kind,k.Manifold.union(parts));parts.forEach((p:Manifold)=>p.delete());
 }
 const shapes=preset.pieces.map(p=>{
  const rotated=sources.get(p.kind)!.rotate([0,p.pose.yaw*180/Math.PI,0]),solid=rotated.translate(p.pose.position);rotated.delete();
  const b=solid.boundingBox();return {p,solid,bounds:new Box3(new Vector3(...b.min),new Vector3(...b.max))};
 });
 let checked=0,maximum=0;
 for(let i=0;i<shapes.length;i++)for(let j=i+1;j<shapes.length;j++){
  const a=shapes[i],b=shapes[j];if(!a.bounds.intersectsBox(b.bounds))continue;
  const overlap=a.solid.intersect(b.solid),volume=overlap.volume();overlap.delete();checked++;maximum=Math.max(maximum,volume);
  assert(volume<1,`${preset.name}: ${a.p.kind} ${a.p.id} intersects ${b.p.kind} ${b.p.id} by ${volume.toFixed(2)} mm³`);
 }
 shapes.forEach(p=>p.solid.delete());
 console.log(preset.name+':',checked,'nearby pairs tested; maximum intersection',maximum.toFixed(4),'mm³');
}
sources.forEach(s=>s.delete());
