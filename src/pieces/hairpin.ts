import {connectorNormals} from './connector-normals';
import type {ManifoldToplevel,Vec2} from 'manifold-3d';
import {buildProfiledTrack} from './profiled-track';
import {PART_UNITS,TRACK} from './marbleworks-spec';
import {solidToGeometry} from './solid-geometry';
import {heightSurfaceNormals,angleWeightedNormals} from '../geometry/mesh-normals';
import {receivingFloorSurface} from './receiving-floor';
export const HAIRPIN={inletX:-PART_UNITS.portSpan/2,outletX:PART_UNITS.portSpan/2,turnX:175};
// The two parallel legs share a continuously curved side elevation.
export const hairpinFloor=(x:number)=>(33-TRACK.channelDepth)+.0025*(x-75)**2;
export const hairpinRunningFloor=receivingFloorSurface({x:HAIRPIN.inletX,z:0,dx:0,dz:1,floor:hairpinFloor});
type P={x:number;z:number;dx:number;dz:number};
const path:P[]=[];
for(let i=0;i<=80;i++){const a=Math.PI-i/80*Math.PI/2;path.push({x:HAIRPIN.inletX+24+24*Math.cos(a),z:24*Math.sin(a),dx:Math.sin(a),dz:-Math.cos(a)});}
for(let i=1;i<=180;i++)path.push({x:HAIRPIN.inletX+24+(175-HAIRPIN.inletX-24)*i/180,z:24,dx:1,dz:0});
for(let i=1;i<=160;i++){const a=Math.PI/2-i/160*Math.PI;path.push({x:175+12*Math.cos(a),z:12+12*Math.sin(a),dx:Math.sin(a),dz:-Math.cos(a)});}
for(let i=1;i<=100;i++)path.push({x:175+(HAIRPIN.outletX-175)*i/100,z:0,dx:-1,dz:0});
export function hairpinContour(w:number):Vec2[]{
 const points:Vec2[]=path.map(p=>[p.x+w*p.dz,p.z-w*p.dx]);
 const end=path.at(-1)!;
 for(let i=1;i<=64;i++){const a=Math.PI/2+i*Math.PI/64;points.push([end.x+w*Math.cos(a),end.z+w*Math.sin(a)]);}
 points.push(...path.slice(0,-1).reverse().map((p):Vec2=>[p.x-w*p.dz,p.z+w*p.dx]));
 const start=path[0];for(let i=1;i<64;i++){const a=Math.PI+i*Math.PI/64;points.push([start.x+w*Math.cos(a),start.z+w*Math.sin(a)]);}
 return points;
}
export function buildHairpinSolid(k:ManifoldToplevel){return buildProfiledTrack(k,{contour:hairpinContour,curvedFloor:true,floor:hairpinFloor,ports:[
 {x:HAIRPIN.inletX,z:0,direction:Math.PI/2,outlet:false,units:1},{x:HAIRPIN.outletX,z:0,direction:0,outlet:true},
]});}
export function hairpinGeometry(s:import('manifold-3d').Manifold){return applyHairpinGeometryNormals(solidToGeometry(s));}
export function applyHairpinGeometryNormals(geometry:import('three/webgpu').BufferGeometry){return angleWeightedNormals(geometry,[
 heightSurfaceNormals(hairpinRunningFloor),heightSurfaceNormals(hairpinFloor,-1.5,-1),
 ...connectorNormals(HAIRPIN.inletX,0,1),...connectorNormals(HAIRPIN.outletX),
]);}
