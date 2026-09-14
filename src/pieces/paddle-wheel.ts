import {roundedExtrusion} from '../geometry/rounded-extrusion';
import {regularizeMesh} from './regularize-mesh';
import {collapseShortEdges} from '../geometry/collapse-short-edges';
import * as THREE from 'three/webgpu';
import type { ManifoldToplevel, Vec2 } from 'manifold-3d';
import { buildRampSolid, STANDARD_RAMP } from './standard-ramp';
import { PART_UNITS, CONNECTOR, TRACK } from './marbleworks-spec';
import { angleWeightedNormals, cylinderNormals } from '../geometry/mesh-normals';
import { solidToGeometry } from './solid-geometry';

// Ratios from the orthographic views of USD290145, checked against the
// photographed molded part: axle at 48% of the connector span, above the
// broad transition from the steep chute to the shallow lower run.
export const PADDLE = { x: -3, z: -24, radius: 31, width: 18, pockets: 12, spokes: 6, axleRadius: 1.6 };
export function paddleLift(x:number) {
  if(x<=-55.5)return PART_UNITS.stackRise;
  if(x>=-3)return 0;
  // The bed and underside follow this curve; wall depth is specified separately.
  // The horizontal endpoint tangents preserve both connector and lower run.
  let lo=0,hi=1;
  for(let i=0;i<28;i++){
    const t=(lo+hi)/2,u=1-t;
    const px=-55.5*u*u*u-47*3*u*u*t-42*3*u*t*t-3*t*t*t;
    if(px<x)lo=t;else hi=t;
  }
  const t=(lo+hi)/2;
  return PART_UNITS.stackRise*(1-t)*(1-t)*(1+2*t);
}
export function paddleFloor(x:number) {
  const d=STANDARD_RAMP;
  return THREE.MathUtils.lerp(d.straightStartHeight,d.straightEndHeight,
    THREE.MathUtils.clamp((x+d.centersAlongTrack/2-7)/(d.centersAlongTrack-7),0,1))+paddleLift(x);
}
/** Fixed section in the normal frame of the descending spline. */
export function paddleSection(x:number,height:number) {
  const slope=(paddleLift(x+.001)-paddleLift(x-.001))/.002;
  const length=Math.hypot(1,slope);
  return {x:x-height*slope/length,y:paddleFloor(x)+height/length};
}
const paddleReferenceFloor=paddleFloor;
export const paddleAxleY=88.5-TRACK.channelDepth;

export function buildPaddleBody(kernel:ManifoldToplevel) {
  const garbage:{delete():void}[]=[],keep=<T extends {delete():void}>(v:T):T=>{garbage.push(v);return v;};
  const {Manifold:M,CrossSection:C}=kernel;
  const body=keep(buildRampSolid(kernel,{channelPath:{inletRise:PART_UNITS.stackRise,start:-55.5,end:-3,map:paddleSection}}));
  const center=PADDLE.x, height=paddleAxleY;
  // The molded cheeks grow out of each rail. Their lower boundary follows
  // the chute; rounded shoulder corners and the axle cap are a single outline.
  const outline:Vec2[]=[];
  for(let i=0;i<=50;i++){const x=center-10+32*i/50;outline.push([x,paddleFloor(x)+5]);}
  outline.push([center+22,paddleReferenceFloor(center+22)+10], [center+17,paddleReferenceFloor(center+17)+12],
    [center+4,height+2.4]);
  for(let i=0;i<=20;i++){const a=i*Math.PI/20;outline.push([center+4*Math.cos(a),height+2.4+2*Math.sin(a)]);}
  outline.push([center-6,height-5],[center-7,paddleReferenceFloor(center-7)+12],[center-10,paddleReferenceFloor(center-10)+10]);
  const section=keep(new C(outline));
  const rounded=keep(keep(section.offset(-.7,'Round',2,24)).offset(.7,'Round',2,24));
  const cheeks=[-1,1].map(side=>keep(keep(rounded.extrude(2.5)).translate([0,0,PADDLE.z+side*11.25-1.25])));
  const ribs=[];
  for(const side of [-1,1])for(const offset of [-2.2,2.2]) {
    const x=center+offset;
    const rib=keep(new C([[center+offset*2-.55,paddleFloor(center+offset*2)+2],[center+offset*2+.55,paddleFloor(center+offset*2)+2],[x+.55,height+2.5],[x-.55,height+2.5]]));
    ribs.push(keep(keep(rib.extrude(.8)).translate([0,0,PADDLE.z+(side<0?-13.3:12.5)])));
  }
  const bore=keep(keep(M.cylinder(32,2,2,64)).translate([center,height,PADDLE.z-16]));
  const result=keep(M.union([body,...cheeks,...ribs])).subtract(bore);
  const unified=keep(result.asOriginal());result.delete();
  const clean=keep(unified.simplify(.0025));
  const regular=regularizeMesh(clean.getMesh());
  const final=new M(new kernel.Mesh(collapseShortEdges(regular.mesh,.0025)));
  garbage.reverse().forEach(v=>v.delete());return final;
}

export function buildPaddleRotor(kernel:ManifoldToplevel) {
  const garbage:{delete():void}[]=[],keep=<T extends {delete():void}>(v:T):T=>{garbage.push(v);return v;};
  const {Manifold:M,CrossSection:C}=kernel;
  const boundary:Vec2[]=Array.from({length:960},(_,i)=>{
    const angle=2*Math.PI*i/960, step=2*Math.PI/PADDLE.pockets;
    const pocketAngle=angle-step/2;
    const delta=pocketAngle-step*Math.round(pocketAngle/step);
    const r=35*Math.cos(delta)-Math.sqrt(9.5**2-(35*Math.sin(delta))**2);
    return [r*Math.cos(angle),r*Math.sin(angle)];
  });
  const outer=keep(new C(boundary));
  const softened=keep(keep(outer.offset(-.7,'Round',2,48)).offset(.7,'Round',2,48));
  const inner=keep(softened.offset(-1.5,'Round',2,24));
  const ringSection=keep(softened.subtract(inner));
  const ring=keep(roundedExtrusion(kernel,ringSection,PADDLE.width,.3));
  // Spokes embed halfway into the rim, following each scallop rather than
  // ending at a fixed radius that can protrude through a pocket's floor.
  const spokeEnvelope=keep(keep(keep(softened.offset(-.75,'Round',2,24)).extrude(3)).translate([0,0,-1.5]));
  const spokes=[];
  for(let i=0;i<PADDLE.spokes;i++) {
    const raw=keep(new C([[2,-2.1],[35,-2.1],[35,2.1],[2,2.1]]));
    const rounded=keep(keep(raw.offset(-.7,'Round',2,20)).offset(.7,'Round',2,20));
    spokes.push(keep(keep(roundedExtrusion(kernel,rounded,2.5,.35)).rotate([0,0,360*i/PADDLE.spokes])));
  }
  const hub=keep(roundedExtrusion(kernel,keep(C.circle(4.6,96)),20,.3));
  const axle=keep(roundedExtrusion(kernel,keep(C.circle(PADDLE.axleRadius,64)),28,.2));
  const trimmedSpokes=keep(keep(M.union(spokes)).intersect(spokeEnvelope));
  const result=keep(M.union([ring,trimmedSpokes,hub,axle])).translate([PADDLE.x,paddleAxleY,PADDLE.z]);
  garbage.reverse().forEach(v=>v.delete());return result;
}

export function paddleBodyGeometry(solid:import('manifold-3d').Manifold) {
  return angleWeightedNormals(solidToGeometry(solid),[-69,69].flatMap(x=>[13.5,12.1,10.5].map(radius=>
    cylinderNormals({x,z:x<0?-24:0,radius,inward:radius<13.5,tolerance:.006,boundaryPriority:1,
      minY:paddleLift(x)+.4,maxY:paddleLift(x)+(radius===10.5?CONNECTOR.postHeight:CONNECTOR.shoulderHeight-.4)}))));
}
