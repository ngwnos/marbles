import assert from 'node:assert/strict';
import {CONTACT_HERTZ,PHYSICS_SUBSTEPS} from '../src/physics-settings';
import init from '../src/vendor/box3d/box3d.mjs';
const b3=await init(),s=1/16,r=7.95,throat=10.5,slope=3;
const vertices:number[]=[],indices:number[]=[];
for(const [radius,y] of [[throat,0],[50,(50-throat)*slope]])for(let i=0;i<128;i++){const a=i*Math.PI*2/128;vertices.push(radius*Math.cos(a)*s,y*s,radius*Math.sin(a)*s);}
for(let i=0;i<128;i++){const j=(i+1)%128;indices.push(i,j,128+j,i,128+j,128+i);}
for(const count of [1,2]){
 const world=new b3.World({gravity:{x:0,y:-9810*s,z:0},contactHertz:CONTACT_HERTZ,enableSleep:true,enableContinuous:true});
 const data=new b3.MeshGeometry({vertices:Float32Array.from(vertices),indices:Uint32Array.from(indices)});
 const cone=world.createBody({type:'static',position:{x:0,y:0,z:0}});
 cone.createMesh(data,{friction:.22,restitution:0}).delete();
 const y=slope*(r-throat)+r*Math.sqrt(1+slope*slope);
 const balls=Array.from({length:count},(_,i)=>{
  const b=world.createBody({type:'dynamic',position:{x:(count===1?0:(2*i-1)*r)*s,y:(count===1?30:y)*s,z:0}});
  b.createSphere({radius:r*s,density:2.5,friction:.22,rollingResistance:0,restitution:0}).delete();return b;
 });
 for(let i=0;i<1200;i++)world.step(1/240,PHYSICS_SUBSTEPS);
 const positions=balls.map(b=>{const p=b.getPosition();return [p.x/s,p.y/s,p.z/s];});
 assert(positions.every(p=>count===1?p[1]<0:p[1]>0),'Cone control did not reproduce the expected passage/bridge');
 console.log(count===1?'Single marble drains through plain cone':'Two marbles bridge in plain cone, without any connector geometry',positions);
 for(const b of balls){b.destroy();b.delete();}cone.destroy();cone.delete();world.destroy();world.delete();data.delete();
}
