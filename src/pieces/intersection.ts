import { straightSectionNormals } from '../geometry/section-normals';
import * as THREE from 'three/webgpu';
import type { ManifoldToplevel, Vec2 } from 'manifold-3d';
import { contourSolid } from '../geometry/contour-solid';
import { angleWeightedNormals, cylinderNormals } from '../geometry/mesh-normals';
import { CONNECTOR, PART_UNITS, TRACK, troughProfiles } from './marbleworks-spec';
import { buildTrackConnector, connectorLandingFloor } from './track-connector';
import { regularizeMesh } from './regularize-mesh';
import { collapseShortEdges } from '../geometry/collapse-short-edges';
import { solidToGeometry } from './solid-geometry';
import {slopeReceivingFloor} from './receiving-floor';
import {finishSolid} from '../geometry/finish-solid';

// Photo-fitted equal 120° arms; all connector pairs use the shared port span.
export const INTERSECTION = { armLength: PART_UNITS.portSpan / Math.sqrt(3), junctionOffset: 16 };
export const intersectionPorts = [0, 2*Math.PI/3, 4*Math.PI/3].map((angle, i) => ({
  x: INTERSECTION.armLength * Math.cos(angle), z: INTERSECTION.armLength * Math.sin(angle),
  direction: angle + Math.PI, opening: 2*Math.asin((TRACK.channelInsideWidth+CONNECTOR.wall) / (CONNECTOR.maleDiameter-CONNECTOR.wall)),
  insideTolerance: 0.06, outlet: i === 0,
}));
export function intersectionFloor(x: number) {
  return connectorLandingFloor(TRACK.runDrop/(1.5*INTERSECTION.armLength)) - TRACK.runDrop * (x + INTERSECTION.armLength/2) / (1.5*INTERSECTION.armLength);
}

/** Parallel contours of one Y footprint. Concave arcs have fixed centers, so
 * the bed, fillets, walls and rolled rims remain tangent through the junction. */
export function intersectionContour(width: number): Vec2[] {
  const points: Vec2[] = [], length = INTERSECTION.armLength;
  const capRadius = width, capAngle = Math.PI / 2;
  const radius = INTERSECTION.junctionOffset - width;
  for (let arm = 0; arm < 3; arm++) {
    const angle = arm * Math.PI * 2/3, dx = Math.cos(angle), dz = Math.sin(angle);
    for (let i = 0; i < 80; i++) {
      const a = angle - capAngle + 2*capAngle*i/80;
      points.push([length*dx + capRadius*Math.cos(a), length*dz + capRadius*Math.sin(a)]);
    }
    const centerAngle = angle + Math.PI/3;
    const cx = INTERSECTION.junctionOffset/Math.sin(Math.PI/3)*Math.cos(centerAngle), cz = INTERSECTION.junctionOffset/Math.sin(Math.PI/3)*Math.sin(centerAngle);
    const start: Vec2 = [length*dx + capRadius*Math.cos(angle+capAngle), length*dz + capRadius*Math.sin(angle+capAngle)];
    const end: Vec2 = [cx + radius*Math.cos(angle-Math.PI/2), cz + radius*Math.sin(angle-Math.PI/2)];
    for (let i=0;i<48;i++) points.push([THREE.MathUtils.lerp(start[0],end[0],i/48),THREE.MathUtils.lerp(start[1],end[1],i/48)]);
    for (let i=0;i<40;i++) {
      const a=angle-Math.PI/2-Math.PI/3*i/40;
      points.push([cx+radius*Math.cos(a),cz+radius*Math.sin(a)]);
    }
    const a=angle-Math.PI/2-Math.PI/3;
    const next=angle+2*Math.PI/3;
    const p: Vec2=[cx+radius*Math.cos(a),cz+radius*Math.sin(a)];
    const q: Vec2=[length*Math.cos(next)+capRadius*Math.cos(next-capAngle),length*Math.sin(next)+capRadius*Math.sin(next-capAngle)];
    for(let i=0;i<48;i++) points.push([THREE.MathUtils.lerp(p[0],q[0],i/48),THREE.MathUtils.lerp(p[1],q[1],i/48)]);
  }
  return points;
}

export function buildIntersectionSolid(kernel: ManifoldToplevel) {
  const garbage: {delete():void}[]=[];
  const keep=<T extends {delete():void}>(v:T):T=>{garbage.push(v);return v;};
  const {Manifold:M}=kernel;
  const profiles=troughProfiles({roundedOpening:true});
  // The positive half of the shared U profile becomes a family of parallel
  // contours. No independent arm meshes, intersecting rails or central caps.
  const outerLevels:Vec2[]=profiles.outer.filter(([w])=>w>=4).filter((p,i,a)=>i===0||p[0]!==a[i-1][0]||p[1]!==a[i-1][1]);
  // Stop at the crest: the inner core supplies the remaining half of the roll.
  const crest=outerLevels.findIndex(([w,h])=>Math.abs(w-10.75)<1e-6&&h>10.7);
  outerLevels.splice(crest+1);
  const innerLevels:Vec2[]=profiles.inner.filter(([w,h])=>w>=4&&h<100);
  const mold=keep(contourSolid(kernel,outerLevels,w=>intersectionContour(w),intersectionFloor));
  const channel=keep(contourSolid(kernel,innerLevels,w=>intersectionContour(w),intersectionFloor));
  const connectors=intersectionPorts.map(p=>buildTrackConnector(kernel,{...p,floor:intersectionFloor,integratedReceiver:true}));
  const carved=keep(keep(M.union([mold,...connectors.map(c=>c.body)]))
    .subtract(keep(M.union([channel,...connectors.flatMap(c=>c.cores)]))));
  const lower=keep(carved.trimByPlane([0,-1,0],-CONNECTOR.shoulderHeight));
  const result=lower.asOriginal();
  garbage.reverse().forEach(v=>v.delete());
  const parts=result.decompose().sort((a,b)=>b.volume()-a.volume());
  result.delete();
  if(parts.slice(1).some(p=>Math.abs(p.volume())>1e-4)) {
    parts.forEach(p=>p.delete());throw new Error('Detached intersection geometry');
  }
  parts.slice(1).forEach(p=>p.delete());
  const unified=parts[0].asOriginal();parts[0].delete();
  const first=unified.simplify(.0025);unified.delete();
  const cleaned=first.simplify(.0025);first.delete();
  const regular=regularizeMesh(cleaned.getMesh(),points=>{
    for(const [i,p] of intersectionPorts.entries())for(const r of [10.5,12,12.1,13.5])
      if(points.every(v=>Math.abs(Math.hypot(v[0]-p.x,v[2]-p.z)-r)<.0025))return `cylinder-${i}-${r}`;
    return undefined;
  });cleaned.delete();
  const mesh=new M(new kernel.Mesh(collapseShortEdges(regular.mesh,.001)));
  const final=mesh.decompose().sort((a,b)=>b.volume()-a.volume());mesh.delete();
  if(final.slice(1).some(p=>Math.abs(p.volume())>1e-4)) throw new Error('Cleanup detached intersection material');
  final.slice(1).forEach(p=>p.delete());
  const complete=M.union([final[0],...connectors.flatMap(c=>[c.seat,c.spigot])]);
  final[0].delete();connectors.forEach(c=>c.dispose());
  const welded=new M(new kernel.Mesh(collapseShortEdges(complete.getMesh(),.0025)));
  complete.delete();
  const connected=welded.decompose().sort((a,b)=>b.volume()-a.volume());welded.delete();
  if(connected.slice(1).some(p=>Math.abs(p.volume())>1e-4))throw new Error('Detached connector material');
  connected.slice(1).forEach(p=>p.delete());let resultWithReceivers=connected[0];
  for(const p of intersectionPorts.filter(p=>!p.outlet)){
    const next=slopeReceivingFloor(kernel,resultWithReceivers,{...p,dx:Math.cos(p.direction),dz:Math.sin(p.direction),floor:intersectionFloor});
    resultWithReceivers.delete();resultWithReceivers=next;
  }
  return finishSolid(kernel,resultWithReceivers);
}

export function intersectionSolidToGeometry(solid: import('manifold-3d').Manifold) {
  const planes=intersectionPorts.flatMap(p=>straightSectionNormals({
    direction:Math.atan2(p.z,p.x),length:INTERSECTION.armLength,floor:intersectionFloor,
    profiles:troughProfiles({roundedOpening:true}),
  }));
  return angleWeightedNormals(solidToGeometry(solid),[...planes,...intersectionPorts.flatMap(p=>[
    cylinderNormals({...p,radius:13.5,tolerance:.005,minY:.4,maxY:46.6,boundaryPriority:1}),
    cylinderNormals({...p,radius:10.5,inward:true,tolerance:.015,minY:15.1,maxY:CONNECTOR.postHeight+.01,boundaryPriority:1}),
  ])]);
}
