import {cylinderNormals} from '../geometry/mesh-normals';
import {CONNECTOR,connectorLevels,PART_UNITS} from './marbleworks-spec';

/** Every unchanged cylindrical band, including the lower female socket.
 * Keep the socket taper and shoulder bevel outside these normal sources. */
export function connectorNormals(x:number,z=0,units=0) {
 const {bottom,shoulder,top}=connectorLevels(units);
 return [
  {radius:CONNECTOR.postDiameter/2,inward:false,minY:bottom+.399,maxY:shoulder-.399},
  {radius:CONNECTOR.socketDiameter/2,inward:true,minY:bottom+.399,maxY:bottom+PART_UNITS.insertionDepth+.001},
  {radius:CONNECTOR.boreDiameter/2,inward:true,minY:bottom+PART_UNITS.insertionDepth+.399,maxY:top+.001},
  {radius:CONNECTOR.maleDiameter/2,inward:false,minY:shoulder-.401,maxY:top+.001},
 ].map(band=>cylinderNormals({x,z,...band,tolerance:.005,boundaryPriority:1}));
}
