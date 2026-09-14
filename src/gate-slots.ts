import {START} from './pieces/start';
/** Position in the moving gate's local frame. Includes the drop approach. */
export function gateSlotOccupied(points:{x:number;y:number;z:number}[],lane:number){
 const z=(lane-(START.lanes-1)/2)*START.lanePitch;
 return points.some(p=>p.x>=-36&&p.x<=30&&p.y>=-8&&p.y<=40&&Math.abs(p.z-z)<START.lanePitch/2);
}
