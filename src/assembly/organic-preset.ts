import {PART_UNITS} from '../pieces/marbleworks-spec';
import {PART_BY_ID,type V3} from './catalog';
import {rotate,worldPort,type Placed} from './snapping';
import {connect,type Preset} from './preset-layout';

/** Eight live branches spread across sixteen columns. Each lower track
 * supports an upper route while also carrying marbles of its own. */
export function tangledGarden():Preset{
 const span=PART_UNITS.portSpan,rise=PART_UNITS.stackRise,turn=17*Math.PI/180;
 const grid:[number,number][]=[[0,0],[1,0],[0,1],[2,-1],[2,0],[-1,2],[-1,1],[1,-1],[2,-2],[2,1],[1,1],[-2,3],[-2,2],[-2,1],[-1,0],[-3,1]];
 const center=grid.reduce((s,[u,v])=>[s[0]+(u+v/2)/grid.length,s[1]+v/grid.length],[0,0]);
 const at=(node:number,level:number):V3=>{const [u,v]=grid[node];return rotate([(u+v/2-center[0])*span,level*rise,(v-center[1])*span*Math.sqrt(3)/2],turn);};
 const pieces:Placed[]=[];
 const port=(kind:string,id:string)=>PART_BY_ID[kind].ports.find(p=>p.id===id)!;
 const anchor=(kind:string,id:string,target:V3,yaw:number)=>{
  const local=rotate(port(kind,id).position,yaw),piece={id:pieces.length+1,kind,pose:{position:target.map((v,i)=>v-local[i]) as V3,yaw}};
  pieces.push(piece);return piece;
 };
 const track=(kind:string,a:number,b:number,level:number)=>{
  const inlet=port(kind,'0-above'),outlet=port(kind,'1-below'),start=at(a,level+inlet.position[1]/rise),end=at(b,level);
  const yaw=Math.atan2(outlet.position[2]-inlet.position[2],outlet.position[0]-inlet.position[0])-Math.atan2(end[2]-start[2],end[0]-start[0]);
  const piece=anchor(kind,'0-above',start,yaw);
  if(worldPort(outlet,piece.pose).some((v,i)=>Math.abs(v-end[i])>.001))throw new Error('Preset track span does not fit');
 };
 const junction=(kind:'split'|'intersection',single:number,pair:number[],level:number)=>{
  const points=[single,...pair].map(n=>at(n,level)),center=points.reduce((s,p)=>s.map((v,i)=>v+p[i]/3) as V3,[0,0,0] as V3);
  const yaw=-Math.atan2(points[0][2]-center[2],points[0][0]-center[0]);
  anchor(kind,'0-below',points[0],yaw);
 };
 // Three successive forks spread the gate's single stream into eight routes.
 anchor('start','0-below',at(0,11),.4);
 for(let node=0;node<7;node++)junction('split',node,[node*2+1,node*2+2],10-Math.floor(Math.log2(node+1)));

 // Each row covers the columns, with inputs on the preceding row's outputs.
 // No running inlet sits beneath another inlet's closed floor.
 const layers:[number[],number[]][][]=[
  [[[7],[0,1]],[[10],[2]],[[8],[3]],[[9],[4]],[[11,12],[5]],[[14],[6]],[[13],[15]]],
  [[[0,6],[14]],[[1,2],[10]],[[3],[7,8]],[[4],[9]],[[5],[11,12]],[[15],[13]]],
  [[[14],[0]],[[10],[1,2]],[[7,8],[3]],[[9],[4]],[[11],[5]],[[12],[6]],[[13],[15]]],
  [[[0],[14]],[[1],[7]],[[2],[10]],[[3],[8]],[[4],[9]],[[5],[11]],[[6],[12]],[[15],[13]]],
 ];
 const kinds=['snake','ramp','bumper','maze'];let n=0;
 layers.forEach((layer,i)=>layer.forEach(([ins,outs])=>{
  const level=7-i;
  if(ins.length===2)junction('intersection',outs[0],ins,level);
  else if(outs.length===2)junction('split',ins[0],outs,level);
  else track(kinds[n++%kinds.length],ins[0],outs[0],level);
 }));
 // Collect all eight routes through real intersections, then one finish.
 for(let node=6;node>=0;node--)junction('intersection',node,[node*2+1,node*2+2],1+Math.floor(Math.log2(node+1)));
 anchor('finish','0-above',at(0,1),turn+2*Math.PI/3);

 // Only spacers and feet fill gaps. The live routes bound gaps to three units.
 const receivers=pieces.flatMap(p=>PART_BY_ID[p.kind].ports.filter(a=>a.gender==='female').map(a=>({piece:p.id,at:worldPort(a,p.pose)}))).sort((a,b)=>a.at[1]-b.at[1]);
 for(const receiver of receivers){
  let point=receiver.at,spacers=0;
  while(point[1]>.001){
   const supported=pieces.some(p=>p.id!==receiver.piece&&PART_BY_ID[p.kind].ports.some(a=>a.gender==='male'&&worldPort(a,p.pose).every((v,i)=>Math.abs(v-point[i])<.001)));
   if(supported)break;
   if(Math.abs(point[1]-rise)<.001){anchor('base','0-above',point,-Math.atan2(point[2],point[0]));break;}
   if(++spacers>3)throw new Error('Route needs more than three spacers');
   const spacer=anchor('spacer','0-above',point,0);point=worldPort(port('spacer','0-below'),spacer.pose);
  }
 }
 return {id:'tangled-garden',name:'Tangled Garden — eight-way trails',pieces,connections:connect(pieces)};
}
