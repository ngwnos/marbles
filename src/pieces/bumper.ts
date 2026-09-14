import {Vector3} from 'three/webgpu';
import {collapseShortEdges} from '../geometry/collapse-short-edges';
import {regularizeMesh} from './regularize-mesh';
import type {ManifoldToplevel,Vec2} from 'manifold-3d';
import {contourSolid} from '../geometry/contour-solid';
import {angleWeightedNormals,cylinderNormals} from '../geometry/mesh-normals';
import {solidToGeometry} from './solid-geometry';
import {buildTrackConnector,connectorLandingFloor} from './track-connector';
import {CONNECTOR,PART_UNITS,TRACK,troughProfiles} from './marbleworks-spec';
import {slopeReceivingFloor} from './receiving-floor';
export const BUMPER={span:PART_UNITS.portSpan};
export const bumperEntryAngle=Math.atan2(-3.1,BUMPER.span/2-52.5);
// Tangent offset rails: corresponding rounded corners at every section level.
export function bumperContour(w:number):Vec2[]{
 const path:Vec2[]=[[-BUMPER.span/2,0],...Array.from({length:8},(_,i)=>[-52.5+i*15,(i%2?1:-1)*3.1] as Vec2),[BUMPER.span/2,0]];
 const side=(sign:number):Vec2[]=>path.map((p,i)=>{
  const a=path[Math.max(0,i-1)],b=path[Math.min(path.length-1,i+1)];
  const d0=i?[p[0]-a[0],p[1]-a[1]]:[b[0]-p[0],b[1]-p[1]];
  const d1=i<path.length-1?[b[0]-p[0],b[1]-p[1]]:d0;
  const l0=Math.hypot(...d0),l1=Math.hypot(...d1),n0=[-d0[1]/l0,d0[0]/l0],n1=[-d1[1]/l1,d1[0]/l1];
  const den=1+n0[0]*n1[0]+n0[1]*n1[1];
  return [p[0]+sign*w*(n0[0]+n1[0])/den,p[1]+sign*w*(n0[1]+n1[1])/den];
 });
 const polygon=[...side(1),...side(-1).reverse()];
 const rounded:Vec2[]=[];
 polygon.forEach((p,i)=>{
  const a=polygon[(i+polygon.length-1)%polygon.length],b=polygon[(i+1)%polygon.length];
  const u=[p[0]-a[0],p[1]-a[1]],v=[b[0]-p[0],b[1]-p[1]],lu=Math.hypot(...u),lv=Math.hypot(...v);
  u[0]/=lu;u[1]/=lu;v[0]/=lv;v[1]/=lv;
  const turn=Math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1]);
  const radius=.65,d=Math.min(radius*Math.tan(Math.abs(turn)/2),lu*.4,lv*.4),r=d/Math.tan(Math.abs(turn)/2);
  if(Math.abs(turn)<1e-6){for(let j=0;j<=8;j++)rounded.push([...p]);return;}
  const start=[p[0]-u[0]*d,p[1]-u[1]*d],sgn=Math.sign(turn),c=[start[0]-u[1]*r*sgn,start[1]+u[0]*r*sgn],angle=Math.atan2(start[1]-c[1],start[0]-c[0]);
  for(let j=0;j<=8;j++)rounded.push([c[0]+r*Math.cos(angle+turn*j/8),c[1]+r*Math.sin(angle+turn*j/8)]);
 });
 return rounded.reverse();
}
export const bumperFloor=(x:number)=>connectorLandingFloor(TRACK.runDrop/BUMPER.span)-TRACK.runDrop*(x/BUMPER.span+.5);
export function buildBumperSolid(k:ManifoldToplevel){
 const garbage:{delete():void}[]=[],keep=<T extends {delete():void}>(v:T):T=>{garbage.push(v);return v;};
 const {Manifold:M}=k;
 const contour=bumperContour;
 const profile=troughProfiles({roundedOpening:true});
 const outer:Vec2[]=profile.outer.filter(([w])=>w>=4).filter((p,i,a)=>!i||p[0]!==a[i-1][0]||p[1]!==a[i-1][1]);
 outer.splice(outer.findIndex(([w,h])=>Math.abs(w-10.75)<1e-6&&h>10.7)+1);
 const inner=profile.inner.filter(([w,h])=>w>=4&&h<100);
 // Carry the open-channel cutter above the crest. Ending it on the mold's
 // cap leaves coplanar paper skins where the collar joins that cap.
 inner.push([inner[inner.length-1][0],100]);
 const mold=keep(contourSolid(k,outer,contour,bumperFloor)),core=keep(contourSolid(k,inner,contour,bumperFloor));
 const connectors=[-1,1].map(s=>buildTrackConnector(k,{x:s*BUMPER.span/2,z:0,direction:bumperEntryAngle+(s<0?0:Math.PI),
  outlet:s>0,integratedReceiver:true,floor:bumperFloor}));
 const tray=keep(keep(M.union([mold,...connectors.map(c=>c.body)])).subtract(keep(M.union([core,...connectors.flatMap(c=>c.cores)]))));
 const lower=keep(tray.trimByPlane([0,-1,0],-CONNECTOR.shoulderHeight));
 const solid=keep(M.union([lower,...connectors.flatMap(c=>[c.seat,c.spigot])]));
 const result=slopeReceivingFloor(k,solid,{x:-BUMPER.span/2,z:0,dx:Math.cos(bumperEntryAngle),dz:Math.sin(bumperEntryAngle),floor:bumperFloor});
 connectors.forEach(c=>c.dispose());garbage.reverse().forEach(v=>v.delete());
 const parts=result.decompose().sort((a,b)=>b.volume()-a.volume());result.delete();
 if(parts.slice(1).some(p=>Math.abs(p.volume())>1e-4))throw new Error('Detached bumper geometry');
 parts.slice(1).forEach(p=>p.delete());
 // A 1-micron grid removes sub-Float32 CSG fragments before topology cleanup.
 const quantized=parts[0].warp(v=>{for(let i=0;i<3;i++)v[i]=Math.round(v[i]*1000)/1000;});parts[0].delete();
 const simplified=quantized.simplify(.012);quantized.delete();
 const regular=regularizeMesh(simplified.getMesh());simplified.delete();
 let mesh:import("manifold-3d").MeshOptions=regular.mesh;
 for(let pass=0;pass<5;pass++)mesh=collapseShortEdges(mesh,.008);
 const cleaned=new M(new k.Mesh({...mesh,tolerance:.001}));
 const final=cleaned.decompose().sort((a,b)=>b.volume()-a.volume());cleaned.delete();
 if(final.slice(1).some(p=>Math.abs(p.volume())>1e-4))throw new Error('Cleanup detached bumper material');
 final.slice(1).forEach(p=>p.delete());return final[0];
}
export function bumperGeometry(s:import('manifold-3d').Manifold){
 const plane=new Vector3(TRACK.runDrop/BUMPER.span,1,0).normalize();
 return angleWeightedNormals(solidToGeometry(s),[
  {boundaryPriority:2,normal:()=>plane.clone(),matches:(points,face)=>face.dot(plane)>.9999&&points.every(p=>Math.abs(p.y-bumperFloor(p.x))<.005)},
  ...[-1,1].flatMap(sign=>[13.5,10.5].map(radius=>cylinderNormals({x:sign*BUMPER.span/2,z:0,radius,inward:radius<13.5,tolerance:.005,minY:15.1,maxY:CONNECTOR.postHeight,boundaryPriority:1}))) ]);
}
