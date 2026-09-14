import {Vector3} from 'three/webgpu';
import type {ManifoldToplevel} from 'manifold-3d';
import {ShellMesh} from '../geometry/surface-mesh';
import {surfaceNormal,type Surface} from '../geometry/surfaces';
import {roundedRectanglePoint} from '../geometry/rounded-rectangle';
import {STORAGE_TUB as D,tubWallDraft} from './storage-tub-spec';

const smooth=(x:number,a:number,b:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*t*(10-15*t+6*t*t);};
const bottomY=D.bottomRoundover,wallTop=D.height-8;
type Ring={x:number;z:number;r:number;y:number};
const floor={x:D.bottomLength/2,z:D.bottomWidth/2,r:D.cornerRadius,y:0};
const draft={x:tubWallDraft.x,z:tubWallDraft.z,r:(45-(floor.r+bottomY-D.wall/2))/(wallTop-bottomY)};
const bodyRing=(y:number,offset:number):Ring=>{
 const collar=D.collarOffset*smooth(y,326,342);
 return {x:floor.x+bottomY-D.wall/2+draft.x*(y-bottomY)+offset+collar,
  z:floor.z+bottomY-D.wall/2+draft.z*(y-bottomY)+offset+collar,
  r:floor.r+bottomY-D.wall/2+draft.r*(y-bottomY)+offset+collar,y};
};
const ringPoint=(u:number,ring:Ring)=>{
 const p=roundedRectanglePoint(u,ring.x,ring.z,ring.r);
 const side=smooth(Math.abs(p.y),ring.z-1,ring.z),along=p.x/(ring.x-ring.r);
 const ribs=-5*Math.exp(-(((Math.abs(along)-.43)/.05)**4))*side*smooth(ring.y,16,30)*(1-smooth(ring.y,322,334));
 return new Vector3(p.x,ring.y,p.y+Math.sign(p.y)*ribs);
};
const bezier=(a:Ring,b:Ring,c:Ring,d:Ring,t:number):Ring=>{
 const s=1-t,w=[s**3,3*s*s*t,3*s*t*t,t**3];
 const out={} as Ring;for(const key of ['x','z','r','y'] as const)out[key]=[a,b,c,d].reduce((sum,p,i)=>sum+p[key]*w[i],0);return out;
};
const alongDraft=(p:Ring,dy:number):Ring=>({x:p.x+draft.x*dy,z:p.z+draft.z*dy,r:p.r+draft.r*dy,y:p.y+dy});
const radial=(p:Ring,offset:number,dy:number):Ring=>({x:p.x+offset,z:p.z+offset,r:p.r+offset,y:p.y+dy});

/** One shell, including the floor, drafted walls, collar and folded lip.
 * The end grips project outside the intact cavity; their openings face up/down. */
export function buildStorageTubSolid(k:ManifoldToplevel){
 const shell=new ShellMesh(),around=512;
 const patch=(surface:Surface,steps:number)=>shell.patch(surface,around,steps,true,(u,v)=>surfaceNormal(surface,u,v).negate());
 const floorPoint=(u:number)=>ringPoint(u,floor);
 shell.patch((u,v)=>floorPoint(u).multiplyScalar(v),around,1,true,()=>new Vector3(0,-1,0));
 const bottom=(inner:boolean,t:number)=>{
  const start={...floor,y:inner?D.wall:0},end=bodyRing(bottomY,(inner?-1:1)*D.wall/2),r=bottomY-start.y;
  return bezier(start,radial(start,r*.55,0),alongDraft(end,-r*.45),end,t);
 };
 patch((u,v)=>ringPoint(u,bottom(false,v)),12);
 const heights=[bottomY,38,312,326,342,374,398,wallTop];
 for(let j=0;j<heights.length-1;j++){
  const a=heights[j],b=heights[j+1];
  patch((u,v)=>ringPoint(u,bodyRing(a+(b-a)*v,D.wall/2)),Math.ceil((b-a)/(b-a>100?16:2)));
 }
 // Fold the lip outward and back into the cavity with matching end tangents.
 const mid=bodyRing(wallTop,0),outer=bodyRing(wallTop,D.wall/2),inner=bodyRing(wallTop,-D.wall/2);
 const rimSide=radial(mid,D.rimOffset,4),rimTop=radial(mid,4,8);
 for(const controls of [
  [outer,alongDraft(outer,3),radial(mid,D.rimOffset,1),rimSide],
  [rimSide,radial(mid,D.rimOffset,6.2),radial(mid,6.2,8),rimTop],
  [rimTop,radial(mid,0,8),alongDraft(inner,3),inner],
 ])patch((u,v)=>ringPoint(u,bezier(controls[0],controls[1],controls[2],controls[3],v)),12);
 for(let j=heights.length-2;j>=0;j--){
  const a=heights[j+1],b=heights[j];
  patch((u,v)=>ringPoint(u,bodyRing(a+(b-a)*v,-D.wall/2)),Math.ceil((a-b)/(a-b>100?16:2)));
 }
 patch((u,v)=>ringPoint(u,bottom(true,1-v)),12);
 shell.patch((u,v)=>{const p=floorPoint(u).multiplyScalar(1-v);p.y=D.wall;return p;},around,1,true,()=>new Vector3(0,1,0));
 const body=shell.solid(k);
 // A U-shaped external grip, with a rounded outer bar and two short returns.
 // The lid's projecting end tab covers this upward-facing finger space.
 const grip=(sign:number)=>{
  const g=new ShellMesh(),height=D.height-20;
  const path=(v:number)=>{
   const section=Math.min(v*5,5-1e-10),i=Math.floor(section),t=section-i;
   let x:number,z:number,tx:number,tz:number;
   if(i===0){x=276.5+(294-276.5)*t;z=-68;tx=1;tz=0;}
   else if(i===1){const a=(-1+t)*Math.PI/2;x=294+6*Math.cos(a);z=-62+6*Math.sin(a);tx=-Math.sin(a);tz=Math.cos(a);}
   else if(i===2){x=300;z=-62+124*t;tx=0;tz=1;}
   else if(i===3){const a=t*Math.PI/2;x=294+6*Math.cos(a);z=62+6*Math.sin(a);tx=-Math.sin(a);tz=Math.cos(a);}
   else{x=294-(294-276.5)*t;z=68;tx=-1;tz=0;}
   return {center:new Vector3(sign*x,height,sign*z),side:new Vector3(-sign*tz,0,sign*tx)};
  };
  const point=(u:number,v:number,scale=1)=>{
   const p=roundedRectanglePoint(u,3,9,1.2),f=path(v);
   return f.center.addScaledVector(f.side,p.x*scale).add(new Vector3(0,p.y*scale,0));
  };
  const surface:Surface=(u,v)=>point(u,v);
  g.patch(surface,64,240,true,(u,v)=>surfaceNormal(surface,u,v).negate());
  g.patch((u,v)=>point(u,0,v),64,1,true,()=>new Vector3(-sign,0,0));
  g.patch((u,v)=>point(u,1,1-v),64,1,true,()=>new Vector3(-sign,0,0));
  return g.solid(k);
 };
 const positive=grip(1),negative=grip(-1),a=body.add(positive),result=a.add(negative);
 body.delete();positive.delete();negative.delete();a.delete();return result;
}
