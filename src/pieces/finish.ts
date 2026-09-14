import {connectorNormals} from './connector-normals';
import type {ManifoldToplevel,Vec2} from 'manifold-3d';
import {contourSolid} from '../geometry/contour-solid';
import {roundedExtrusion} from '../geometry/rounded-extrusion';
import {finishSolid} from '../geometry/finish-solid';
import {smoothRamp} from '../geometry/surfaces';
import {heightSurfaceNormals,angleWeightedNormals} from '../geometry/mesh-normals';
import {solidToGeometry} from './solid-geometry';
import {slopeReceivingFloor,receivingFloorSurface} from './receiving-floor';
import {buildTrackConnector,connectorLandingFloor} from './track-connector';
import {CONNECTOR,PART_UNITS,TRACK,troughProfiles} from './marbleworks-spec';
export const FINISH={length:PART_UNITS.portSpan+8,laneEnd:PART_UNITS.portSpan-10,width:54,headRadius:36};
export const finishFloor=(x:number)=>connectorLandingFloor(TRACK.runDrop/PART_UNITS.portSpan)-TRACK.runDrop*x/PART_UNITS.portSpan;
export const finishDeck=(x:number)=>finishFloor(smoothRamp(x+CONNECTOR.boreDiameter/2,CONNECTOR.boreDiameter))+TRACK.channelDepth+.75;
// Account for finishSolid's .012 mm cleanup when identifying the broad cap.
export const finishDeckNormals=heightSurfaceNormals(finishDeck,0,1,.02);
const receiver={x:0,z:0,dx:1,dz:0,floor:finishFloor};
export const finishRunningFloor=receivingFloorSurface(receiver);
export function buildFinishSolid(k:ManifoldToplevel){
 const garbage:{delete():void}[]=[],keep=<T extends {delete():void}>(s:T):T=>{garbage.push(s);return s;};
 const {CrossSection:C,Manifold:M}=k;
 const rectangle=keep(keep(C.square([FINISH.length,FINISH.width])).translate([0,-FINISH.width/2]));
 const circle=keep(C.circle(FINISH.headRadius,256));
 const outline=keep(keep(keep(C.union([rectangle,circle])).offset(-1,'Round',2,32)).offset(1,'Round',2,32));
 const roof=finishDeck;
 // Sample the cap before bending it; long triangles spanning the change in
 // grade otherwise become unintended sloping patches across the round head.
 const outer=keep(keep(keep(keep(roundedExtrusion(k,outline,40,.6)).rotate([-90,0,0])).refineToLength(2)).warp(v=>{v[1]=(v[1]+20)/40*roof(v[0]);}));
 const inside=keep(outline.offset(-2,'Round',2,32));
 const underside=keep(keep(keep(keep(inside.extrude(1)).rotate([-90,0,0])).refineToLength(2)).warp(v=>{v[1]=-1+v[1]*(roof(v[0])-1);}));
 const casing=keep(outer.subtract(underside));
 const profile=troughProfiles({roundedOpening:true});
 const outerLevels=profile.outer.filter(([w])=>w>=4).filter((p,i,a)=>!i||p[0]!==a[i-1][0]||p[1]!==a[i-1][1]);
 outerLevels.splice(outerLevels.findIndex(([w,h])=>Math.abs(w-10.75)<1e-6&&h>10.7)+1);
 const innerLevels:Vec2[]=profile.inner.filter(([w,h])=>w>=4&&h<100);innerLevels.push([10.75,100]);
 const contour=(w:number):Vec2[]=>{
  const points:Vec2[]=[];
  for(let i=0;i<96;i++){const a=-Math.PI/2+Math.PI*i/96;points.push([FINISH.laneEnd+w*Math.cos(a),w*Math.sin(a)]);}
  for(let i=0;i<96;i++){const a=Math.PI/2+Math.PI*i/96;points.push([w*Math.cos(a),w*Math.sin(a)]);}
  return points;
 };
 const mold=keep(contourSolid(k,outerLevels,contour,finishFloor)),core=keep(contourSolid(k,innerLevels,contour,finishFloor));
 const inlet=buildTrackConnector(k,{x:0,z:0,direction:0,outlet:false,floor:finishFloor,integratedReceiver:true});
 const carved=keep(keep(M.union([casing,mold,inlet.body])).subtract(keep(M.union([core,...inlet.cores]))));
 const lower=keep(carved.trimByPlane([0,-1,0],-CONNECTOR.shoulderHeight));
 const result=M.union([lower,inlet.seat,inlet.spigot]);
 const shaped=slopeReceivingFloor(k,result,receiver);result.delete();
 inlet.dispose();garbage.reverse().forEach(s=>s.delete());return finishSolid(k,shaped);
}
export function finishGeometry(s:import('manifold-3d').Manifold){return applyFinishGeometryNormals(solidToGeometry(s));}
export function applyFinishGeometryNormals(geometry:import('three/webgpu').BufferGeometry){
 return angleWeightedNormals(geometry,[
  heightSurfaceNormals(finishRunningFloor),heightSurfaceNormals(finishFloor,-1.5,-1),finishDeckNormals,
  ...connectorNormals(0)]);
}
