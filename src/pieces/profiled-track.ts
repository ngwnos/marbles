import type {ManifoldToplevel,Vec2} from 'manifold-3d';
import {contourSolid} from '../geometry/contour-solid';
import {finishSolid} from '../geometry/finish-solid';
import {buildTrackConnector} from './track-connector';
import {connectorLevels,troughProfiles} from './marbleworks-spec';
import {loftFootprint} from '../geometry/loft-footprint';
import {slopeReceivingFloor} from './receiving-floor';
export type TrackPort={x:number;z:number;direction:number;outlet:boolean;units?:number};
/** One mold and one continuous channel core. No independently capped arms. */
export function buildProfiledTrack(k:ManifoldToplevel,options:{
 contour?:(w:number)=>Vec2[];footprint?:import('manifold-3d').CrossSection;floor:(x:number,z:number)=>number;ports:TrackPort[];
 curvedFloor?:boolean;
 wallRise?:(x:number,z:number)=>number;
}){
 const garbage:{delete():void}[]=[],keep=<T extends {delete():void}>(s:T):T=>{garbage.push(s);return s;};
 const p=troughProfiles({roundedOpening:true}),outer=p.outer.filter(([w])=>w>=4).filter((p,i,a)=>!i||p[0]!==a[i-1][0]||p[1]!==a[i-1][1]);
 outer.splice(outer.findIndex(([w,h])=>Math.abs(w-10.75)<1e-6&&h>10.7)+1);
 const inner:Vec2[]=p.inner.filter(([w,h])=>w>=4&&h<100);inner.push([10.75,100]);
 const loft=(profile:Vec2[])=>{
  const elevation=options.curvedFloor?()=>0:options.floor;
 let raw=keep(options.footprint?loftFootprint(k,options.footprint,profile,elevation):contourSolid(k,profile,options.contour!,elevation));
 if(options.curvedFloor)raw=keep(keep(raw.refineToLength(3)).warp(v=>{v[1]+=options.floor(v[0],v[2]);}));
  if(!options.wallRise)return raw;
  return keep(raw.warp(v=>{const h=v[1]-options.floor(v[0],v[2]);v[1]+=options.wallRise!(v[0],v[2])*Math.min(1,Math.max(0,(h-5.5)/4.5));}));
 };
 const mold=loft(outer),core=loft(inner),connectors=options.ports.map(p=>{
  const rise=connectorLevels(p.units??0).bottom;
  const c=buildTrackConnector(k,{...p,floor:(x,z)=>options.floor(x,z)-rise,integratedReceiver:true,conformSocketRoof:options.curvedFloor});
  if(!rise)return c;
  return {body:keep(c.body.translate([0,rise,0])),cores:c.cores.map(s=>keep(s.translate([0,rise,0]))),
   seat:keep(c.seat.translate([0,rise,0])),spigot:keep(c.spigot.translate([0,rise,0])),dispose:()=>c.dispose()};
 });
 const carved=keep(keep(k.Manifold.union([mold,...connectors.map(c=>c.body)])).subtract(keep(k.Manifold.union([core,...connectors.flatMap(c=>c.cores)]))));
 const lower=keep(carved.trimByPlane([0,-1,0],-Math.max(...options.ports.map(p=>connectorLevels(p.units??0).shoulder))));
 let result=k.Manifold.union([lower,...connectors.flatMap(c=>[c.seat,c.spigot])]);
 for(const p of options.ports.filter(p=>!p.outlet)){
  const shaped=slopeReceivingFloor(k,result,{...p,dx:Math.cos(p.direction),dz:Math.sin(p.direction),floor:options.floor});
  result.delete();result=shaped;
 }
 connectors.forEach(c=>c.dispose());garbage.reverse().forEach(s=>s.delete());return finishSolid(k,result);
}
