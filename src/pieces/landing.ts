import {connectorNormals} from './connector-normals';
import type {ManifoldToplevel,Vec2} from 'manifold-3d';
import {contourSolid} from '../geometry/contour-solid';
import {heightSurfaceNormals,angleWeightedNormals,cylinderNormals,torusNormals} from '../geometry/mesh-normals';
import {solidToGeometry} from './solid-geometry';
import {buildTrackConnector} from './track-connector';
import {CONNECTOR,troughProfiles} from './marbleworks-spec';
import {finishSolid} from '../geometry/finish-solid';
import {sweepPlan} from '../geometry/sweep-plan';

// USD305046, all seven views: semicircular landing, open straight front,
// terminal drop at the left end of the backstop. Dimensions are photo ratios.
export const LANDING={radius:55,postX:-55,postZ:0,rim:CONNECTOR.shoulderHeight-.6};
export const landingFloor=(x:number,_z=0)=>26+6*(x+55)/110;
export function buildLandingSolid(k:ManifoldToplevel){
 const garbage:{delete():void}[]=[],keep=<T extends {delete():void}>(v:T):T=>{garbage.push(v);return v;};
 const {Manifold:M}=k;
 const p=troughProfiles({roundedOpening:true});
 const outer=p.outer.filter(([w])=>w>=4).filter((p,i,a)=>!i||p[0]!==a[i-1][0]||p[1]!==a[i-1][1]);
 outer.splice(outer.findIndex(([w,h])=>Math.abs(w-10.75)<1e-6&&h>10.7)+1);
 const inner:Vec2[]=p.inner.filter(([w,h])=>w>=4&&h<100);inner.push([10.75,100]);
 const contour=(w:number):Vec2[]=>Array.from({length:512},(_,i)=>{
  const a=i*2*Math.PI/512,r=LANDING.radius+w-10;return [r*Math.cos(a),r*Math.sin(a)];
 });
 // Extend the straight backstop above its floor fillet; the round rim retains
 // its radius instead of scaling the entire U section to the varying height.
 const raise=(levels:Vec2[])=>levels.flatMap(([w,h]):Vec2[]=>h===10?[[w,10],[w,20]]:[[w,h>10?h+10:h]]);
 const mold=keep(contourSolid(k,raise(outer),contour,landingFloor));
 const core=keep(contourSolid(k,raise(inner),contour,landingFloor));
 const bowl=keep(mold.subtract(core));
 const leveled=keep(bowl.warp(v=>{
  const h=v[1]-landingFloor(v[0],v[2]);
  if(h>5.5)v[1]+=Math.min(1,(h-5.5)/14.5)*(LANDING.rim-.75-landingFloor(v[0],v[2])-20);
 }));
 const half=keep(leveled.trimByPlane([0,0,1],0));
 const c=buildTrackConnector(k,{x:LANDING.postX,z:0,direction:Math.PI/4,
  outlet:true,floor:landingFloor});
 const channel=keep(sweepPlan(k,p.inner,32,40,u=>({x:LANDING.postX+u*Math.SQRT1_2,z:u*Math.SQRT1_2,dx:1,dz:1}),landingFloor));
 const joined=keep(keep(M.union([half,c.body])).subtract(keep(M.union([...c.cores,channel]))));
 const lower=keep(joined.trimByPlane([0,-1,0],-CONNECTOR.shoulderHeight));
 const result=M.union([lower,c.seat,c.spigot]);
 c.dispose();garbage.reverse().forEach(v=>v.delete());return finishSolid(k,result);
}
export function landingGeometry(s:import('manifold-3d').Manifold){return applyLandingGeometryNormals(solidToGeometry(s));}
export function applyLandingGeometryNormals(geometry:import('three/webgpu').BufferGeometry){
 return angleWeightedNormals(geometry,[
  torusNormals({y:LANDING.rim-.75,major:LANDING.radius+.75,minor:.75,tolerance:.015}),
  heightSurfaceNormals((x,z)=>landingFloor(x,z)),heightSurfaceNormals((x,z)=>landingFloor(x,z),-1.5,-1),
  ...[LANDING.radius,LANDING.radius+CONNECTOR.wall].map(radius=>cylinderNormals({x:0,z:0,radius,inward:radius===LANDING.radius,tolerance:.004,minY:32,maxY:LANDING.rim,boundaryPriority:2})),
  ...connectorNormals(LANDING.postX)]);
}
