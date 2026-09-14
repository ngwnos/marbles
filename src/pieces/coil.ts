import {connectorNormals} from './connector-normals';
import type {ManifoldToplevel,Vec2} from 'manifold-3d';
import {sweepSection} from '../geometry/sweep-section';
import {finishSolid} from '../geometry/finish-solid';
import {buildTrackConnector,connectorLandingFloor} from './track-connector';
import {CONNECTOR,PART_UNITS,connectorLevels,troughProfiles} from './marbleworks-spec';
import {angleWeightedNormals,cylinderNormals} from '../geometry/mesh-normals';
import {solidToGeometry} from './solid-geometry';
import {slopeReceivingFloor} from './receiving-floor';
export const COIL={radius:PART_UNITS.portSpan/2,turns:2.5,inletUnits:2,drop:2*PART_UNITS.stackRise};
const length=COIL.radius*COIL.turns*2*Math.PI,slope=COIL.drop/length;
export const coilTop=connectorLevels(COIL.inletUnits).bottom+connectorLandingFloor(slope);
export const coilBottom=coilTop-COIL.drop;
export function buildCoilSolid(k:ManifoldToplevel){
 const garbage:{delete():void}[]=[],keep=<T extends {delete():void}>(s:T):T=>{garbage.push(s);return s;};
 const p=troughProfiles({roundedOpening:true});
 const sweep=(profile:Vec2[])=>keep(sweepSection(k,profile,1,1800,v=>{
  const [w,h,t]=v,a=Math.PI-COIL.turns*2*Math.PI*t;
  v[0]=(COIL.radius-w)*Math.cos(a);v[1]=coilTop-COIL.drop*t+h;v[2]=(COIL.radius-w)*Math.sin(a);
 }));
 const mold=sweep(p.outer),core=sweep(p.inner.map(([w,h])=>[w,Math.min(h,24)]));
 const inlet=buildTrackConnector(k,{x:-COIL.radius,z:0,direction:Math.PI/2,outlet:false,conformSocketRoof:true,floor:(_x,z)=>coilTop-connectorLevels(COIL.inletUnits).bottom-slope*z});
 const outlet=buildTrackConnector(k,{x:COIL.radius,z:0,direction:Math.PI/2,outlet:true,floor:(_x,z)=>coilBottom+slope*z});
 const rise=connectorLevels(COIL.inletUnits).bottom;
 // Closed receiving cup: there is no lower socket under the reference inlet.
 // Removing that unused socket also reserves clearance above the next turn.
 const inletBody=keep(keep(inlet.body.translate([0,rise,0])).trimByPlane([0,1,slope],(coilTop-1.5)/Math.hypot(1,slope)));
 const inletCores=inlet.cores.map(c=>keep(c.translate([0,rise,0])));
 const supports:import('manifold-3d').Manifold[]=[];
 for(const sign of [-1,1]){
  const ys=Array.from({length:3},(_,i)=>coilTop-COIL.drop*(i+(sign>0?.5:0))/COIL.turns+9.5);
  const x=sign*(COIL.radius+13.5),rod=keep(keep(k.Manifold.cylinder(ys[0]-ys[2],1.6,1.6,48)).rotate([-90,0,0]));
  supports.push(keep(rod.translate([x,ys[2],0])));
  for(const y of ys){
   // Rounded tabs lie outside the running channel and merge into its wall.
   const tab=keep(keep(keep(k.Manifold.cylinder(2,3.2,3.2,64)).rotate([-90,0,0])).translate([x,y-1,0]));supports.push(tab);
  }
 }
 // The two section joints use short external straps and rounded rivet heads.
 // They follow the same helix and stay outside the channel core.
 for(const t of [1/3,2/3]){
  const a=Math.PI-COIL.turns*2*Math.PI*t,half=3/length;
  const strap=keep(sweepSection(k,[[-11,5.5],[-12.25,5.5],[-12.75,10.4],[-11.4,10.4]],1,24,v=>{
   const [w,h,u]=v,q=t+(u-.5)*2*half,angle=Math.PI-COIL.turns*2*Math.PI*q;
   v[0]=(COIL.radius-w)*Math.cos(angle);v[1]=coilTop-COIL.drop*q+h;v[2]=(COIL.radius-w)*Math.sin(angle);
  }));supports.push(strap);
  const pin=keep(keep(keep(k.Manifold.sphere(1.2,32)).scale([1,1,.5])).rotate([0,90-a*180/Math.PI,0]));
  supports.push(keep(pin.translate([(COIL.radius+12.5)*Math.cos(a),coilTop-COIL.drop*t+8,(COIL.radius+12.5)*Math.sin(a)])));
 }
 const joined=keep(k.Manifold.union([mold,inletBody,outlet.body,...supports]));
 const carved=keep(joined.subtract(keep(k.Manifold.union([core,...inletCores,...outlet.cores]))));
 const lower=keep(carved.trimByPlane([0,-1,0],-connectorLevels(COIL.inletUnits).shoulder));
 const result=k.Manifold.union([lower,...[inlet.spigot,inlet.seat].map(s=>keep(s.translate([0,rise,0])))]);
 const shaped=slopeReceivingFloor(k,result,{x:-COIL.radius,z:0,dx:0,dz:1,floor:(_x,z)=>coilTop-slope*z});result.delete();
 inlet.dispose();outlet.dispose();garbage.reverse().forEach(s=>s.delete());return finishSolid(k,shaped);
}
export function coilGeometry(s:import('manifold-3d').Manifold){return applyCoilGeometryNormals(solidToGeometry(s));}
export function applyCoilGeometryNormals(geometry:import('three/webgpu').BufferGeometry){return angleWeightedNormals(geometry,[...connectorNormals(-COIL.radius,0,2),...connectorNormals(COIL.radius),...
 [{x:-COIL.radius,base:coilTop-1.5,top:connectorLevels(2).top},{x:COIL.radius,base:15.4,top:CONNECTOR.postHeight}].flatMap(p=>[13.5,10.5].map(radius=>cylinderNormals({x:p.x,z:0,radius,inward:radius<13.5,tolerance:.005,minY:p.base,maxY:p.top,boundaryPriority:1})))]);}
