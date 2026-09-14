import type {Manifold,ManifoldToplevel} from 'manifold-3d';
import {CONNECTOR,TRACK} from './marbleworks-spec';
import {deformVertical} from '../geometry/vertical-deformation';
const smooth=(x:number,a:number,b:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*t*(10-15*t+6*t*t);};
export type ReceivingPort={x:number;z:number;dx:number;dz:number;floor:(x:number,z:number)=>number};
/** C2 turn into the channel. The map is monotone in height (its minimum
 * vertical derivative is 1 - .25 * 1.875), so it cannot fold the skin.
 * It is the identity at the exterior cylinder, upper bore and runout end. */
export function receivingFloorLift(x:number,y:number,z:number,port:ReceivingPort){
 const u=x-port.x,v=z-port.z,q=u*port.dx+v*port.dz,r=Math.hypot(u,v);
 const h=y-port.floor(x,z),bore=CONNECTOR.boreDiameter/2;
 const lift=TRACK.channelDepth/4;
 return lift*(1-smooth(q,-bore,bore))*(1-smooth(r,bore-.1,CONNECTOR.postDiameter/2))
  *smooth(h,-CONNECTOR.wall,0)*(1-smooth(h,0,TRACK.channelDepth));
}
/** Height field for analytic shading of the raised floor and its flat runout. */
export const receivingFloorSurface=(port:ReceivingPort)=>(x:number,z:number)=>
 port.floor(x,z)+receivingFloorLift(x,port.floor(x,z),z,port);
export function slopeReceivingFloor(_k:ManifoldToplevel,solid:Manifold,port:ReceivingPort){
 // One bijective deformation of the existing shell. No overlapping caps,
 // internal sheets, Boolean fillets or extra collider geometry.
 const shaped=deformVertical(solid,(x,y,z)=>receivingFloorLift(x,y,z,port),1);
 const unified=shaped.asOriginal();shaped.delete();
 const result=unified.simplify(.003);unified.delete();
 if(result.status()!=='NoError')throw new Error(`Receiving floor: ${result.status()}`);
 return result;
}
