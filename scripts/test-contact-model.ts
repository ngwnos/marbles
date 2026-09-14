import assert from 'node:assert/strict';
import init from '../src/vendor/box3d/box3d.mjs';
import {CONTACT_HERTZ,PHYSICS_SUBSTEPS} from '../src/physics-settings';
const b3=await init(),scale=1/16,radius=7.95*scale;
async function stack(contactHertz:number,substeps:number,tube:boolean){
 const world=new b3.World({gravity:{x:0,y:-9810*scale,z:0},contactHertz,enableSleep:true,enableContinuous:true});
 const bodies=[];
 const floor=world.createBody({type:'static',position:{x:0,y:-scale,z:0}});bodies.push(floor);
 floor.createBox({halfExtents:{x:100*scale,y:scale,z:100*scale},friction:.22,rollingResistance:0}).delete();
 let mesh;
 if(tube){
  const raw=await Bun.file('src/generated/spacer-collision.json').json();
  mesh=new b3.MeshGeometry({vertices:Float32Array.from(raw.vertices,(v:number)=>v*scale),indices:Uint32Array.from(raw.indices)});
  for(let i=0;i<3;i++){const b=world.createBody({type:'static',position:{x:0,y:i*47*scale,z:0}});b.createMesh(mesh,{friction:.22,restitution:.18}).delete();bodies.push(b);}
 }
 const balls=Array.from({length:6},(_,i)=>{
  const b=world.createBody({type:'dynamic',position:{x:0,y:radius+(2*radius+.001)*i,z:0}});
  b.createSphere({radius,density:2.5,friction:.22,rollingResistance:0,restitution:.18}).delete();bodies.push(b);return b;
 });
 let deepest=0;
 for(let i=0;i<2400;i++){
  world.step(1/240,substeps);
  if(i<1200)continue;
  const p=balls.map(b=>b.getPosition());
  for(let j=1;j<p.length;j++)deepest=Math.max(deepest,15.9-Math.hypot(p[j].x-p[j-1].x,p[j].y-p[j-1].y,p[j].z-p[j-1].z)/scale);
 }
 for(const b of bodies){b.destroy();b.delete();}world.destroy();world.delete();mesh?.delete();
 return deepest;
}
const baseline=await stack(30,2,false);
assert(baseline>2,'Baseline no longer reproduces soft-contact compression; revisit calibration');
for(const tube of [false,true]){
 const error=await stack(CONTACT_HERTZ,PHYSICS_SUBSTEPS,tube);
 assert(error<.05,`Rigid contact tolerance exceeded: ${error} mm`);
 console.log(tube?'Straight tube':'Flat stack',': overlap',error.toFixed(4),'mm; old default',baseline.toFixed(4),'mm');
}
