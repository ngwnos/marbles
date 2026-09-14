import {Vector3} from 'three/webgpu';
import {collapseShortEdges} from '../geometry/collapse-short-edges';
import {regularizeMesh} from './regularize-mesh';
import type {ManifoldToplevel,Vec2} from 'manifold-3d';
import {contourSolid} from '../geometry/contour-solid';
import {angleWeightedNormals,cylinderNormals} from '../geometry/mesh-normals';
import {solidToGeometry} from './solid-geometry';
import {buildTrackConnector,connectorLandingFloor} from './track-connector';
import {CONNECTOR,PART_UNITS,TRACK,troughProfiles,arc} from './marbleworks-spec';
import {slopeReceivingFloor} from './receiving-floor';
export const MAZE={span:PART_UNITS.portSpan,pins:[[-38,0],[-14,-14],[-14,14],[10,-28],[10,0],[10,28],[34,-14],[34,14]] as Vec2[]};
export const mazeFloor=(x:number)=>connectorLandingFloor(TRACK.runDrop/MAZE.span)-TRACK.runDrop*(x/MAZE.span+.5);
export function buildMazeSolid(k:ManifoldToplevel){
 const garbage:{delete():void}[]=[],keep=<T extends {delete():void}>(v:T):T=>{garbage.push(v);return v;};
 const {Manifold:M,CrossSection:C}=k;
 const footprint=keep(C.union([
  ...MAZE.pins.map(([x,z])=>keep(keep(C.circle(20,128)).translate([x,z]))),
  keep(C.square([MAZE.span,20],true)),
  ...[-1,1].map(s=>keep(keep(C.circle(10,128)).translate([s*MAZE.span/2,0]))),
 ]));
 const smooth=keep(keep(footprint.offset(2,'Round',2,32)).offset(-2,'Round',2,32));
 // Parallel contours preserve the shared floor fillet and rolled rail profile.
 // Rays only establish consistent correspondence between these exact offsets.
 const contour=(w:number):Vec2[]=>{
  const offset=keep(smooth.offset(w-10,'Round',2,32));
  const polygons=offset.toPolygons();if(polygons.length!==1)throw new Error('Maze footprint disconnected');
  const p=polygons[0];
  return Array.from({length:960},(_,i)=>{
   const a=i*2*Math.PI/960,dx=Math.cos(a),dz=Math.sin(a);let radius=0;
   for(let j=0;j<p.length;j++){
    const u=p[j],v=p[(j+1)%p.length],ex=v[0]-u[0],ez=v[1]-u[1],den=dx*ez-dz*ex;
    if(Math.abs(den)<1e-9)continue;
    const r=(u[0]*ez-u[1]*ex)/den,t=(u[0]*dz-u[1]*dx)/den;
    if(r>0&&t>=-1e-7&&t<=1+1e-7)radius=Math.max(radius,r);
   }
   if(!radius)throw new Error(`Maze contour ray missed w=${w} angle=${a}`);return [radius*dx,radius*dz];
  });
 };
 const profile=troughProfiles({roundedOpening:true});
 const outer:Vec2[]=profile.outer.filter(([w])=>w>=4).filter((p,i,a)=>!i||p[0]!==a[i-1][0]||p[1]!==a[i-1][1]);
 outer.splice(outer.findIndex(([w,h])=>Math.abs(w-10.75)<1e-6&&h>10.7)+1);
 const inner=profile.inner.filter(([w,h])=>w>=4&&h<100);
 const mold=keep(contourSolid(k,outer,contour,mazeFloor)),core=keep(contourSolid(k,inner,contour,mazeFloor));
 const connectors=[-1,1].map(s=>buildTrackConnector(k,{x:s*MAZE.span/2,z:0,direction:s<0?0:Math.PI,
  outlet:s>0,integratedReceiver:true,floor:mazeFloor}));
 const tray=keep(keep(M.union([mold,...connectors.map(c=>c.body)])).subtract(keep(M.union([core,...connectors.flatMap(c=>c.cores)]))));
 const lower=keep(tray.trimByPlane([0,-1,0],-CONNECTOR.shoulderHeight));
 const lathe=(profile:Vec2[],x:number,z:number)=>keep(keep(keep(keep(new C(profile).revolve(96)).rotate([-90,0,0])).translate([x,mazeFloor(x),z])).warp(v=>{v[1]+=mazeFloor(v[0])-mazeFloor(x);}));
 const pins=MAZE.pins.map(([x,z])=>lathe([[0,-1.5],[3.3,-1.5],[3.3,0],...arc(3.3,1.3,1.3,-Math.PI/2,-Math.PI),[2,7.3],...arc(1.3,7.3,.7,0,Math.PI/2),[0,8]],x,z));
 const holes=MAZE.pins.map(([x,z])=>lathe([[0,-3],[1.1,-3],[1.1,5.8],...arc(.5,5.8,.6,0,Math.PI/2),[0,6.4]],x,z));
 const solid=keep(keep(M.union([lower,...pins,...connectors.flatMap(c=>[c.seat,c.spigot])])).subtract(keep(M.union(holes))));
 const result=slopeReceivingFloor(k,solid,{x:-MAZE.span/2,z:0,dx:1,dz:0,floor:mazeFloor});
 connectors.forEach(c=>c.dispose());garbage.reverse().forEach(v=>v.delete());
 const parts=result.decompose().sort((a,b)=>b.volume()-a.volume());result.delete();
 if(parts.slice(1).some(p=>Math.abs(p.volume())>1e-4))throw new Error('Detached maze geometry');
 parts.slice(1).forEach(p=>p.delete());
 const simplified=parts[0].simplify(.012);parts[0].delete();
 const regular=regularizeMesh(simplified.getMesh());simplified.delete();
 const cleaned=new M(new k.Mesh(collapseShortEdges(regular.mesh,.008)));
 const final=cleaned.decompose().sort((a,b)=>b.volume()-a.volume());cleaned.delete();
 if(final.slice(1).some(p=>Math.abs(p.volume())>1e-4))throw new Error('Cleanup detached maze material');
 final.slice(1).forEach(p=>p.delete());return final[0];
}
export function mazeGeometry(s:import('manifold-3d').Manifold){
 const plane=new Vector3(TRACK.runDrop/MAZE.span,1,0).normalize();
 return angleWeightedNormals(solidToGeometry(s),[
  {boundaryPriority:2,normal:()=>plane.clone(),matches:(points,face)=>face.dot(plane)>.9999&&points.every(p=>Math.abs(p.y-mazeFloor(p.x))<.005)},
  ...[-1,1].flatMap(sign=>[13.5,10.5].map(radius=>cylinderNormals({x:sign*MAZE.span/2,z:0,radius,inward:radius<13.5,tolerance:.005,minY:15.1,maxY:CONNECTOR.postHeight,boundaryPriority:1}))) ]);
}
