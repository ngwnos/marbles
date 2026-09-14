import {connectorNormals} from './connector-normals';
import type {ManifoldToplevel} from 'manifold-3d';
import {buildDrainTray,drainFloor} from './drain-tray';
import {heightSurfaceNormals,angleWeightedNormals} from '../geometry/mesh-normals';
import {solidToGeometry} from './solid-geometry';
import {FUNNEL} from './funnel';
export const STARTER_FUNNEL={radius:FUNNEL.bowlDiameter/2};
export const buildStarterFunnelSolid=(k:ManifoldToplevel)=>buildDrainTray(k,{radius:STARTER_FUNNEL.radius,back:0});
export function starterFunnelGeometry(s:import('manifold-3d').Manifold){return applyStarterFunnelGeometryNormals(solidToGeometry(s));}
export function applyStarterFunnelGeometryNormals(geometry:import('three/webgpu').BufferGeometry){
 const floor=(x:number,z:number)=>drainFloor(x,z,{radius:STARTER_FUNNEL.radius,back:0});
 return angleWeightedNormals(geometry,[heightSurfaceNormals(floor),heightSurfaceNormals(floor,-1.5,-1),...connectorNormals(0)]);
}
