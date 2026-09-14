import type {ManifoldToplevel,Vec2} from 'manifold-3d';
import {CONNECTOR,PART_UNITS} from './marbleworks-spec';
import {angleWeightedNormals,cylinderNormals} from '../geometry/mesh-normals';
import {solidToGeometry} from './solid-geometry';
export const EXTENSION={units:6,height:6*PART_UNITS.stackRise};
/** The reference extension is a plain female-ended tube, not a stretched post. */
export function buildExtensionSolid(k:ManifoldToplevel){
 const h=EXTENSION.height,r=CONNECTOR.postDiameter/2,b=CONNECTOR.socketDiameter/2;
 const profile:Vec2[]=[[b+.2,0],[r-.25,0],[r,.25],[r,h-.25],[r-.25,h],[b+.2,h],[b,h-.25],[b,.25]];
 const section=new k.CrossSection(profile),raw=section.revolve(256),solid=raw.rotate([-90,0,0]);section.delete();raw.delete();return solid;
}
export function extensionGeometry(s:import('manifold-3d').Manifold){return angleWeightedNormals(solidToGeometry(s),[13.5,12.1].map(radius=>cylinderNormals({x:0,z:0,radius,inward:radius<13.5,tolerance:.005,minY:.26,maxY:EXTENSION.height-.26})));}
