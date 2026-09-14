import {rotate,type Pose} from './snapping';
import type {Port,V3} from './catalog';
export function columnsFor(ports:Port[]){
 const columns:{position:V3;ports:string[]}[]=[];
 for(const p of ports){let c=columns.find(c=>Math.hypot(c.position[0]-p.position[0],c.position[2]-p.position[2])<.001);if(!c){c={position:[...p.position],ports:[]};columns.push(c);}c.ports.push(p.id);c.position[1]=Math.max(c.position[1],p.position[1]);}
 return columns;
}
/** Change yaw while keeping the chosen column's world position invariant. */
export function rotateAroundColumn(pose:Pose,column:V3,yaw:number):Pose{
 const before=rotate(column,pose.yaw),after=rotate(column,yaw);
 return {yaw,position:pose.position.map((p,i)=>p+before[i]-after[i]) as V3};
}
