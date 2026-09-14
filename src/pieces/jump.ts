import {connectorNormals} from './connector-normals';
import * as THREE from 'three/webgpu';
import type {ManifoldToplevel} from 'manifold-3d';
import {sweepSection} from '../geometry/sweep-section';
import {finishSolid} from '../geometry/finish-solid';
import {angleWeightedNormals,cylinderNormals} from '../geometry/mesh-normals';
import {solidToGeometry} from './solid-geometry';
import {slopeReceivingFloor} from './receiving-floor';
import {buildTrackConnector,connectorLandingFloor} from './track-connector';
import {buildSpacerSolid} from './spacer';
import {TRACK,CONNECTOR,connectorLevels,troughProfiles} from './marbleworks-spec';
export const JUMP={inletX:-69,inletUnits:2,supportX:69,supportZ:24,toeX:92};
const rise=connectorLevels(JUMP.inletUnits).bottom,top=rise+connectorLandingFloor(.06);
// Preserve the calibrated launch curve height as the inlet floor deepens.
// The entrance transition absorbs the difference; the airborne target stays fixed.
const launchTop=top+TRACK.channelDepth-10;
const v=(x:number,y:number)=>new THREE.Vector3(x,y,0);
const path=new THREE.CurvePath<THREE.Vector3>();
path.add(new THREE.LineCurve3(v(-69,top+.78),v(-56,top)));
path.add(new THREE.CubicBezierCurve3(v(-56,top),v(-50,top-.36),v(-48,launchTop-8),v(-42,launchTop-14)));
path.add(new THREE.LineCurve3(v(-42,launchTop-14),v(40,launchTop-96)));
const r=32,d=r/Math.sqrt(2),a=launchTop-96,k=4/3*Math.tan(Math.PI/8)*r/Math.sqrt(2);
path.add(new THREE.CubicBezierCurve3(v(40,a),v(40+k,a-k),v(40+2*d-k,a-k),v(40+2*d,a)));
path.add(new THREE.LineCurve3(v(40+2*d,a),v(JUMP.toeX,a+JUMP.toeX-40-2*d)));
const floor=(x:number)=>connectorLandingFloor(.06)-.06*(x+56);
export function buildJumpSolid(k:ManifoldToplevel){
 const garbage:{delete():void}[]=[],keep=<T extends {delete():void}>(s:T):T=>{garbage.push(s);return s;};
 const p=troughProfiles({roundedOpening:true});
 const sweep=(profile:import('manifold-3d').Vec2[])=>keep(sweepSection(k,profile,1,640,point=>{
  const [w,h,t]=point,pos=path.getPointAt(t),tangent=path.getTangentAt(t).normalize();
  point[0]=pos.x-h*tangent.y;point[1]=pos.y+h*tangent.x;point[2]=-w;
 }));
 const mold=sweep(p.outer),core=sweep(p.inner.map(([w,h])=>[w,Math.min(h,TRACK.channelDepth+7)]));
 if(mold.volume()<=0||core.volume()<=0)throw new Error('Inverted jump sweep');
 const inlet=buildTrackConnector(k,{x:JUMP.inletX,z:0,direction:0,outlet:false,floor});
 const inletBody=keep(inlet.body.translate([0,rise,0]));
 const inletCores=inlet.cores.map(c=>keep(c.translate([0,rise,0])));
 const plainSupport=keep(keep(buildSpacerSolid(k)).translate([JUMP.supportX,0,JUMP.supportZ]));
 // Opposed relief slots in the upper support, visible in the design's end view.
 const slotBox=keep(keep(k.Manifold.cube([1.5,21,40])).translate([JUMP.supportX-.75,CONNECTOR.shoulderHeight-3,JUMP.supportZ-20]));
 const slotEnd=keep(keep(k.Manifold.cylinder(40,.75,.75,32)).translate([JUMP.supportX,CONNECTOR.shoulderHeight-3,JUMP.supportZ-20]));
 const support=keep(plainSupport.subtract(keep(k.Manifold.union([slotBox,slotEnd]))));
 const body=keep(keep(k.Manifold.union([mold,inletBody,support])).subtract(keep(k.Manifold.union([core,...inletCores]))));
 // Only the inlet collar occupies the high seating plane; the J-shaped chute
 // and low support retain their independently specified elevations.
 const lower=keep(body.trimByPlane([0,-1,0],-(rise+CONNECTOR.shoulderHeight)));
 const result=k.Manifold.union([lower,...[inlet.spigot,inlet.seat].map(s=>keep(s.translate([0,rise,0])))]);
 const shaped=slopeReceivingFloor(k,result,{x:JUMP.inletX,z:0,dx:1,dz:0,floor:x=>floor(x)+rise});result.delete();
 inlet.dispose();garbage.reverse().forEach(s=>s.delete());return finishSolid(k,shaped);
}
export function jumpGeometry(s:import('manifold-3d').Manifold){return applyJumpGeometryNormals(solidToGeometry(s));}
export function applyJumpGeometryNormals(geometry:import('three/webgpu').BufferGeometry){
 return angleWeightedNormals(geometry,[...connectorNormals(-69,0,2),...connectorNormals(69,24),
  ...[{x:-69,z:0,rise},{x:69,z:24,rise:0}].flatMap(p=>[13.5,12.1,10.5].map(radius=>cylinderNormals({x:p.x,z:p.z,radius,inward:radius<13.5,tolerance:.005,minY:p.rise+.4,maxY:p.rise+CONNECTOR.postHeight,boundaryPriority:1})))
 ]);
}
