import {PART_UNITS} from '../pieces/marbleworks-spec';
import {PART_BY_ID,type V3} from './catalog';
import {worldPort,rotate,type Placed} from './snapping';
import {connect,type Preset} from './preset-layout';
import {tangledGarden} from './organic-preset';
export type {Preset} from './preset-layout';

const rise=PART_UNITS.stackRise,r=PART_UNITS.portSpan/Math.sqrt(3),s=PART_UNITS.portSpan/2;
const pieces:Placed[]=[];
const add=(kind:string,position:V3,yaw=0)=>pieces.push({id:pieces.length+1,kind,pose:{position,yaw}});
// Three aligned towers carry both branches and their common inlet/outlet column.
add('split',[0,3*rise,0]);
add('intersection',[0,2*rise,0]);
add('ramp',[r+69,rise,24]);
add('finish',[r+138,0,24]);
add('start',[r,4*rise,0],.4);
add('base',[r+12,0,0]);
for(const z of [-s,s]){
 add('spacer',[-r/2,rise,z]);
 add('base',[-r/2-12,0,z],Math.PI);
}
const compact:Preset[]=[{id:'split-rejoin',name:'Split & Rejoin',pieces,connections:connect(pieces)}];


// Route placement uses real connector endpoints, including the two-level
// paddle, hairpin and funnel. No assumed length or translated mesh shortcuts.
function grandTour():Preset {
 const parts:Placed[]=[];
 const put=(kind:string,position:V3,yaw=0)=>{const p={id:parts.length+1,kind,pose:{position,yaw}};parts.push(p);return p;};
 const port=(kind:string,id:string)=>PART_BY_ID[kind].ports.find(p=>p.id===id)!;
 const anchored=(kind:string,id:string,target:V3,yaw:number)=>{
  const local=rotate(port(kind,id).position,yaw);
  return put(kind,target.map((v,i)=>v-local[i]) as V3,yaw);
 };
 const sequence=['snake','maze','bumper','paddle','hairpin','passing','funnel','snake'];
 const drop=sequence.reduce((sum,kind)=>sum+port(kind,'0-above').position[1]-port(kind,'1-below').position[1],0);
 const junction=put('intersection',[0,2*rise,0]);
 const split=put('split',[0,3*rise+drop,0]);
 anchored('start','0-below',worldPort(port('split','0-above'),split.pose),.4);
 for(const side of [-1,1]){
  let at=worldPort(port('split',side===1?'1-below':'2-below'),split.pose);
  // Two broad mirrored loops: outward, across, back, and into the merger.
  const directions:V3[]=[[0,0,side],[0,0,side],[-1,0,0],[-1,0,0],[0,0,-side],[0,0,-side],[1,0,0],[1,0,0]];
  sequence.forEach((kind,i)=>{
   const a=port(kind,'0-above').position,b=port(kind,'1-below').position,d=directions[i];
   const yaw=Math.atan2(b[2]-a[2],b[0]-a[0])-Math.atan2(d[2],d[0]);
   const piece=anchored(kind,'0-above',at,yaw);
   at=worldPort(port(kind,'1-below'),piece.pose);
  });
  const target=worldPort(port('intersection',side===1?'1-above':'2-above'),junction.pose);
  if(at.some((v,i)=>Math.abs(v-target[i])>.001))throw new Error('Branch does not meet merger');
 }
 const ramp=anchored('ramp','0-above',worldPort(port('intersection','0-below'),junction.pose),0);
 anchored('finish','0-above',worldPort(port('ramp','1-below'),ramp.pose),0);
 // Fill every unsupported socket with a real tower, stopping at an existing
 // lower male connector rather than running supports through other pieces.
 const receivers=parts.flatMap(p=>PART_BY_ID[p.kind].ports.filter(a=>a.gender==='female').map(a=>({p,a,at:worldPort(a,p.pose)}))).sort((a,b)=>a.at[1]-b.at[1]);
 for(const receiver of receivers){
  let at=receiver.at;
  while(at[1]>.001){
   const occupied=parts.some(p=>p.id!==receiver.p.id&&PART_BY_ID[p.kind].ports.some(a=>a.gender==='male'&&worldPort(a,p.pose).every((v,i)=>Math.abs(v-at[i])<.001)));
   if(occupied)break;
   if(at[1]<rise-.001)throw new Error('Off-grid support');
   if(Math.abs(at[1]-rise)<.001){anchored('base','0-above',at,at[0]<0?Math.PI:0);break;}
   const spacer=anchored('spacer','0-above',at,0);
   at=worldPort(port('spacer','0-below'),spacer.pose);
  }
 }
 return {id:'grand-tour',name:'Grand Tour — twin tower maze',pieces:parts,connections:connect(parts)};
}
export const PRESETS:Preset[]=[tangledGarden(),grandTour(),...compact];
