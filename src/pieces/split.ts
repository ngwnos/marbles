import {connectorNormals} from './connector-normals';
import type {ManifoldToplevel} from 'manifold-3d';
import {buildProfiledTrack} from './profiled-track';
import {INTERSECTION,intersectionPorts,intersectionContour} from './intersection';
import {connectorLandingFloor} from './track-connector';
import {TRACK} from './marbleworks-spec';
import {solidToGeometry} from './solid-geometry';
import {heightSurfaceNormals,angleWeightedNormals} from '../geometry/mesh-normals';
import {receivingFloorSurface} from './receiving-floor';
export const splitPorts=intersectionPorts.map((p,i)=>({...p,outlet:i!==0}));
const slope=TRACK.runDrop/(1.5*INTERSECTION.armLength);
export const splitFloor=(x:number)=>connectorLandingFloor(slope)-slope*(INTERSECTION.armLength-x);
const inlet=splitPorts.find(p=>!p.outlet)!;
export const splitRunningFloor=receivingFloorSurface({...inlet,dx:Math.cos(inlet.direction),dz:Math.sin(inlet.direction),floor:splitFloor});
export function buildSplitSolid(k:ManifoldToplevel){
 return buildProfiledTrack(k,{contour:intersectionContour,floor:splitFloor,ports:splitPorts,
  wallRise:(x,z)=>{const t=Math.max(0,Math.min(1,(30-Math.hypot(x,z))/12));return 6*t*t*(3-2*t);}});
}
export function splitGeometry(s:import('manifold-3d').Manifold){return applySplitGeometryNormals(solidToGeometry(s));}
export function applySplitGeometryNormals(geometry:import('three/webgpu').BufferGeometry){
 return angleWeightedNormals(geometry,[
  heightSurfaceNormals(splitRunningFloor),heightSurfaceNormals(splitFloor,-1.5,-1),
  ...splitPorts.flatMap(p=>connectorNormals(p.x,p.z))
 ]);
}
