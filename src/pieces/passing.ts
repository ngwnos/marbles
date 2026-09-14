import {connectorNormals} from './connector-normals';
import type {ManifoldToplevel,Vec2} from 'manifold-3d';
import {Shape} from 'three/webgpu';
import {buildProfiledTrack} from './profiled-track';
import {CONNECTOR,PART_UNITS,TRACK} from './marbleworks-spec';
import {connectorLandingFloor} from './track-connector';
import {heightSurfaceNormals,angleWeightedNormals} from '../geometry/mesh-normals';
import {solidToGeometry} from './solid-geometry';
import {receivingFloorSurface} from './receiving-floor';
export const PASSING={span:PART_UNITS.portSpan};
export const passingFloor=(x:number)=>connectorLandingFloor(TRACK.runDrop/PASSING.span)-TRACK.runDrop*(x/PASSING.span+.5);
export const passingRunningFloor=receivingFloorSurface({x:-PASSING.span/2,z:0,dx:1,dz:0,floor:passingFloor});
export function buildPassingSolid(k:ManifoldToplevel){
 const garbage:{delete():void}[]=[],keep=<T extends {delete():void}>(s:T):T=>{garbage.push(s);return s;};
 const {CrossSection:C}=k;
 // The design's three islands: a long first divider, a small triangular island
 // in its bypass, and a larger triangular island in the opposite second bypass.
 const shape=new Shape();
 shape.moveTo(-PASSING.span/2,-10);
 shape.bezierCurveTo(-61,-10,-60,-24,-48,-24);
 shape.lineTo(-10,-24);
 shape.bezierCurveTo(-4,-24,-1,-35,10,-43);
 shape.bezierCurveTo(35,-62,56,-39,54,-17);
 shape.bezierCurveTo(54,-10,63,-10,PASSING.span/2,-10);
 shape.absarc(PASSING.span/2,0,10,-Math.PI/2,Math.PI/2,false);
 shape.lineTo(16,10);
 shape.bezierCurveTo(7,10,8,29,-7,40);
 shape.bezierCurveTo(-34,61,-54,39,-54,21);
 shape.bezierCurveTo(-54,13,-61,10,-PASSING.span/2,10);
 shape.absarc(-PASSING.span/2,0,10,Math.PI/2,3*Math.PI/2,false);
 const outline=keep(new C(shape.getPoints(40).map(p=>[p.x,p.y] as Vec2)));
 const rounded=(points:Vec2[],r:number)=>keep(keep(keep(new C(points)).offset(-r,'Round',2,48)).offset(r,'Round',2,48));
 const islands=[rounded([[-43,1],[-17,1],[-17,10],[-43,10]],3),
  rounded([[-27,30],[-18,30],[-22,36]],1.8),rounded([[9,-13],[27,-32],[39,-13]],3)];
 const footprint=keep(outline.subtract(keep(C.union(islands))));
 const result=buildProfiledTrack(k,{footprint,floor:passingFloor,ports:[-1,1].map(sign=>({x:sign*PASSING.span/2,z:0,direction:sign<0?0:Math.PI,outlet:sign>0}))});
 garbage.reverse().forEach(s=>s.delete());return result;
}
export function passingGeometry(s:import('manifold-3d').Manifold){return applyPassingGeometryNormals(solidToGeometry(s));}
export function applyPassingGeometryNormals(geometry:import('three/webgpu').BufferGeometry){
 return angleWeightedNormals(geometry,[
  heightSurfaceNormals(passingRunningFloor),heightSurfaceNormals(passingFloor,-1.5,-1),
  ...[-1,1].flatMap(sign=>connectorNormals(sign*PASSING.span/2)) ]);
}
