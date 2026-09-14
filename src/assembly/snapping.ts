import {PART_BY_ID,type Port,type V3} from './catalog';
export type Pose={position:V3;yaw:number};
export type Placed={id:number;kind:string;pose:Pose};
export type Connection={a:number;ap:string;b:number;bp:string};
export type Target={piece:number;port:Port;position:V3};
export const rotate=(p:V3,a:number):V3=>[Math.cos(a)*p[0]+Math.sin(a)*p[2],p[1],-Math.sin(a)*p[0]+Math.cos(a)*p[2]];
export const worldPort=(port:Port,pose:Pose):V3=>rotate(port.position,pose.yaw).map((v,i)=>v+pose.position[i]) as V3;
// Below the standard socket's 0.1 mm radial clearance. Share settlement
// error between both ends instead of requiring numerically identical spans.
export const SNAP_FIT_TOLERANCE=.075;
const distance=(a:V3,b:V3)=>Math.hypot(...a.map((v,i)=>v-b[i]));
export const compatible=(a:Port,b:Port)=>a.gender!==b.gender&&a.axis===-b.axis;
export function availableTargets(parts:Placed[],connections:Connection[],exclude:number):Target[]{
 const occupied=new Set(connections.filter(c=>c.a!==exclude&&c.b!==exclude).flatMap(c=>[`${c.a}/${c.ap}`,`${c.b}/${c.bp}`]));
 return parts.filter(p=>p.id!==exclude).flatMap(p=>PART_BY_ID[p.kind].ports.filter(port=>!occupied.has(`${p.id}/${port.id}`)).map(port=>({piece:p.id,port,position:worldPort(port,p.pose)})));
}
export function solveSnap(kind:string,desired:Pose,targets:Target[],proximity:(pose:Pose)=>number,maxDistance=28){
 const ports=PART_BY_ID[kind].ports;
 let best:{pose:Pose;matches:{port:Port;target:Target}[];distance:number}|undefined;
 const consider=(source:Port,target:Target,yaw:number,correction:V3=[0,0,0])=>{
  const offset=rotate(source.position,yaw),pose={yaw,position:target.position.map((v,i)=>v-offset[i]+correction[i]) as V3};
  const d=proximity(pose);if(d>maxDistance)return;
  const used=new Set<string>();
  const matches=ports.flatMap(port=>{
   const found=targets.find(t=>compatible(port,t.port)&&!used.has(`${t.piece}/${t.port.id}`)&&distance(worldPort(port,pose),t.position)<SNAP_FIT_TOLERANCE);
   if(!found)return [];used.add(`${found.piece}/${found.port.id}`);return [{port,target:found}];
  });
  if(!best||matches.length>best.matches.length||matches.length===best.matches.length&&d<best.distance)best={pose,matches,distance:d};
 };
 for(const p of ports)for(const t of targets){
  if(!compatible(p,t.port))continue;
  consider(p,t,desired.yaw);
  // Derive exact yaw from two connector pairs, rather than rounding to a
  // guessed angle/grid. This also handles the diagonal standard ramp span.
  for(const q of ports){if(q===p)continue;
   const a=q.position.map((v,i)=>v-p.position[i]) as V3;if(Math.hypot(a[0],a[2])<1)continue;
   for(const u of targets){if(t===u||!compatible(q,u.port))continue;
    const b=u.position.map((v,i)=>v-t.position[i]) as V3;
    if(Math.abs(a[1]-b[1])>SNAP_FIT_TOLERANCE*2||Math.abs(Math.hypot(a[0],a[2])-Math.hypot(b[0],b[2]))>SNAP_FIT_TOLERANCE*2)continue;
    const yaw=Math.atan2(a[2],a[0])-Math.atan2(b[2],b[0]);
    const turn=Math.abs(Math.atan2(Math.sin(yaw-desired.yaw),Math.cos(yaw-desired.yaw)));
    if(turn<=Math.PI/3+.001){const turned=rotate(a,yaw);consider(p,t,yaw,b.map((v,i)=>(v-turned[i])/2) as V3);}
   }
  }
 }
 return best;
}
