import {DROP_PORTS,type ComponentKind} from '../drop-ports';
import {PART_BY_ID,type V3} from './catalog';
import type {Connection} from './snapping';

/** Preview inlet locations identify flow direction; connector metadata identifies sockets. */
export function inputColumns(kind:string){
 return PART_BY_ID[kind].ports.filter(p=>p.axis===1).flatMap(port=>{
  const inlet=DROP_PORTS[kind as ComponentKind]?.find(p=>Math.hypot(p[0]-port.position[0],p[2]-port.position[2])<.1);
  return inlet?[{port,position:inlet as V3}]:[];
 });
}
export function inputIsConnected(id:number,port:string,connections:Connection[]){
 return connections.some(c=>c.a===id&&c.ap===port||c.b===id&&c.bp===port);
}
