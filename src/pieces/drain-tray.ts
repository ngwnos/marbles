import {Shape,MathUtils} from 'three/webgpu';
import type {ManifoldToplevel,Vec2} from 'manifold-3d';
import {troughProfiles,CONNECTOR,PART_UNITS} from './marbleworks-spec';
import {finishSolid} from '../geometry/finish-solid';
export type DrainTrayOptions={radius:number;back:number;bumps?:boolean};
export function drainFloor(x:number,z:number,o:DrainTrayOptions){
 // Continue the formula just across the bore boundary so its derivative at
 // the lip is the bowl tangent, not half the slope of a clamped function.
 const r=Math.max(1e-6,Math.hypot(x,z)),join=24.68,a=2735;
 const radial=(r:number)=>25+(r<join?a*(1/10.5**2-1/r**2):a*(1/10.5**2-1/join**2)+(r-join)*Math.tan(Math.PI/9));
 const t=MathUtils.clamp((-x-35)/35,0,1),blend=t*t*t*(10-15*t+6*t*t);
 let h=radial(r)*(1-blend)+(radial(o.radius)+.16*(-x))*blend;
 if(o.back===0)h=radial(r);
 if(o.bumps)for(const zc of [-25,0,25])h+=3.5*Math.exp(-(((x+65+(zc===0?4:0))/5)**2+((z-zc)/5)**2));
 return h;
}
/** One closed shell from the female socket through the bowl and around the rim.
 * Shared ring vertices join the running surface, wall roll and underside. */
export function buildDrainTray(k:ManifoldToplevel,o:DrainTrayOptions){
 const shape=new Shape(),R=o.radius,B=Math.max(o.back,R);
 shape.moveTo(0,-R);shape.absarc(0,0,R,-Math.PI/2,Math.PI/2,false);
 shape.lineTo(-B+5,R);shape.quadraticCurveTo(-B,R,-B,R-5);shape.lineTo(-B,-R+5);shape.quadraticCurveTo(-B,-R,-B+5,-R);shape.closePath();
 const polygon=shape.getPoints(96);
 const boundary=(a:number)=>{
  if(o.back===0)return R;
  const dx=Math.cos(a),dz=Math.sin(a);let closest=Infinity;
  for(let i=0;i<polygon.length;i++){const p=polygon[i],q=polygon[(i+1)%polygon.length],ex=q.x-p.x,ez=q.y-p.y,den=dx*ez-dz*ex;
   if(Math.abs(den)<1e-9)continue;const r=(p.x*ez-p.y*ex)/den,u=(p.x*dz-p.y*dx)/den;
   if(r>0&&u>=-1e-8&&u<=1+1e-8)closest=Math.min(closest,r);
  }if(!Number.isFinite(closest))throw new Error(`Unclosed tray boundary at ${a}`);return closest;
 };
 const p=troughProfiles({roundedOpening:true});
 const inside=p.inner.filter(([w,h])=>w>=4&&h<=10.75),outside=p.outer.filter(([w])=>w>=4);
 outside.splice(outside.findIndex(([w,h])=>Math.abs(w-10.75)<1e-6&&h>10.7)+1);
 const n=384,vertices:number[]=[],indices:number[]=[];
 for(let i=0;i<n;i++){
  const a=i/n*2*Math.PI,c=Math.cos(a),s=Math.sin(a),end=boundary(a)-6;
  const row:Vec2[]=[[12.35,0],[12.1,.4],[12.1,PART_UNITS.insertionDepth],[10.5,PART_UNITS.insertionDepth+.4],[10.5,25]];
  for(let j=1;j<=100;j++){const r=10.5+(end-10.5)*j/100;row.push([r,drainFloor(r*c,r*s,o)]);}
  for(const [w,h] of inside.slice(1)) {const r=end+w-4;row.push([r,drainFloor(r*c,r*s,o)+h]);}
  for(const [w,h] of outside.slice().reverse()){const r=end+w-4;row.push([r,drainFloor(r*c,r*s,o)+h]);}
  for(let j=99;j>=0;j--){const r=13.5+(end-13.5)*j/100;row.push([r,drainFloor(r*c,r*s,o)-CONNECTOR.wall]);}
  row.push([13.5,.3],[13.2,0]);
  for(const [r,y] of row)vertices.push(r*c,y,r*s);
 }
 const count=vertices.length/3/n;
 for(let i=0;i<n;i++)for(let j=0;j<count;j++){
  const a=i*count+j,b=((i+1)%n)*count+j,c=((i+1)%n)*count+(j+1)%count,d=i*count+(j+1)%count;
  indices.push(a,b,c,a,c,d);
 }
 const mesh=new k.Mesh({numProp:3,vertProperties:Float32Array.from(vertices),triVerts:Uint32Array.from(indices)});mesh.merge();
 const solid=new k.Manifold(mesh);if(solid.volume()<0){solid.delete();throw new Error('Inverted drain shell');}
 return finishSolid(k,solid);
}
