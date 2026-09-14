import assert from 'node:assert/strict';
import {Quaternion,Vector3} from 'three';
import {decodePreviewMesh} from '../src/geometry/preview-mesh';
import {START} from '../src/pieces/start';
import {PRESETS} from '../src/assembly/presets';
import {PART_BY_ID} from '../src/assembly/catalog';
import {worldPort} from '../src/assembly/snapping';
import {inputColumns} from '../src/assembly/drop';
import {createAssemblyPhysics} from '../src/assembly/physics';
import {marbleRoutes} from './preset-routes';
const selected=process.argv.find(a=>a.startsWith('--preset='))?.slice(9);
assert(!selected||PRESETS.some(p=>p.id===selected),'Unknown preset');
for(const preset of PRESETS.filter(p=>!selected||p.id===selected)){
 console.log('Checking',preset.name);
 const occupied=new Set<string>();
 for(const c of preset.connections)for(const [id,port] of [[c.a,c.ap],[c.b,c.bp]] as const){
  const key=id+':'+port;assert(!occupied.has(key),'Socket occupied twice');occupied.add(key);
 }
 for(const p of preset.pieces){
  for(const port of PART_BY_ID[p.kind].ports){
   if(port.gender==='female'&&worldPort(port,p.pose)[1]>.1)assert(occupied.has(p.id+':'+port.id),p.kind+' unsupported socket '+port.id);
  }
  for(const inlet of inputColumns(p.kind))assert(occupied.has(p.id+':'+inlet.port.id),p.kind+' exposed extra inlet');
 }
 const routes=marbleRoutes(preset),active=new Set(routes.flat());
 for(const piece of preset.pieces)if(!['start','spacer','base'].includes(piece.kind))assert(active.has(piece.id),`${piece.kind} ${piece.id} is unreachable from the starting gate`);
 if(preset.id==='tangled-garden'){
  assert(routes.length>=8,'Branching routes must rejoin the finish');
  for(const piece of preset.pieces.filter(p=>p.kind==='spacer')){
   let length=1,current=piece;
   while(true){const link=preset.connections.find(c=>c.a===current.id&&c.ap==='0-above'||c.b===current.id&&c.bp==='0-above');if(!link)break;
    const next=preset.pieces.find(p=>p.id===(link.a===current.id?link.b:link.a))!;if(next.kind!=='spacer')break;length++;current=next;}
   assert(length<=3,'More than three consecutive spacers');
  }
 }
 // Uniform plastic volume gives a useful static balance check; it is not
 // a joint-strength simulation. Use conservative patches inside each foot.
 let mass=0;const center=new Vector3(),ground:Vector3[]=[];
 for(const p of preset.pieces){
  const q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),p.pose.yaw),at=new Vector3(...p.pose.position);
  if(p.kind==='base')for(const x of [-20,20])for(const z of [-20,20])ground.push(new Vector3(x,0,z).applyQuaternion(q).add(at));
  if(p.kind==='finish')for(const x of [30,125])for(const z of [-18,18])ground.push(new Vector3(x,0,z).applyQuaternion(q).add(at));
  for(const file of p.kind==='start'?['start-body','start-rotor']:p.kind==='paddle'?['paddle-body','paddle-wheel']:[p.kind]){
   const g=decodePreviewMesh(await Bun.file('src/generated/'+file+'.bin').arrayBuffer()),pos=g.getAttribute('position'),index=g.index!;
   let volume=0;const moment=new Vector3();
   for(let t=0;t<index.count;t+=3){
    const a=new Vector3().fromBufferAttribute(pos,index.getX(t)),b=new Vector3().fromBufferAttribute(pos,index.getX(t+1)),c=new Vector3().fromBufferAttribute(pos,index.getX(t+2));
    const v=a.dot(b.clone().cross(c))/6;volume+=v;moment.add(a.add(b).add(c).multiplyScalar(v/4));
   }
   assert(Math.abs(volume)>0);
   moment.divideScalar(volume);if(file==='start-rotor')moment.add(new Vector3(START.pivotX,START.pivotY,0));
   moment.applyQuaternion(q).add(at);center.addScaledVector(moment,Math.abs(volume));mass+=Math.abs(volume);g.dispose();
  }
 }
 center.divideScalar(mass);
 const cross=(a:Vector3,b:Vector3,c:Vector3)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
 ground.sort((a,b)=>a.x-b.x||a.z-b.z);
 const half=(points:Vector3[])=>{const hull:Vector3[]=[];for(const p of points){while(hull.length>1&&cross(hull[hull.length-2],hull[hull.length-1],p)<=0)hull.pop();hull.push(p);}hull.pop();return hull;};
 const hull=[...half(ground),...half(ground.slice().reverse())];
 const margin=Math.min(...hull.map((a,i)=>{const b=hull[(i+1)%hull.length];return cross(a,b,center)/a.distanceTo(b);}));
 assert(margin>15,'Center of mass too close to support boundary');
 console.log('Static balance margin:',margin.toFixed(1),'mm; all elevated sockets supported');
 const sim=await createAssemblyPhysics();
 for(const kind of new Set(preset.pieces.map(p=>p.kind))){
  const data=await Bun.file('src/generated/'+(kind==='paddle'?'paddle-body':kind)+'-collision.json').json();
  sim.registerSurface(kind,data.parts??[data]);
 }
 for(const p of preset.pieces)sim.add(p.id,p.kind,p.pose.position,new Quaternion().setFromAxisAngle(new Vector3(0,1,0),p.pose.yaw),true);
 const gate=preset.pieces.find(p=>p.kind==='start')!,finish=preset.pieces.find(p=>p.kind==='finish')!;
 const allVisits=new Set<number>(),inverseFinish=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),-finish.pose.yaw);
 const atFinish=(p:Vector3)=>{const local=p.clone().sub(new Vector3(...finish.pose.position)).applyQuaternion(inverseFinish);return local.x>20&&local.x<155&&Math.abs(local.z)<27&&local.y<40&&local.y>5;};
 for(let run=0;run<(process.argv.includes('--stress')?6:preset.id==='tangled-garden'?3:1);run++){
 sim.clearMarbles();
 assert.equal(sim.fillGate(gate.id),6);
 for(let i=0;i<240;i++)sim.step();
 sim.releaseGate(gate.id);
 const visits=Array.from({length:6},()=>new Set<number>());
 const checkpoints=preset.pieces.filter(p=>active.has(p.id)).flatMap(piece=>inputColumns(piece.kind).map(c=>({id:piece.id,at:worldPort(c.port,piece.pose)})));
 for(let i=0;i<(preset.id==='grand-tour'?6600:5400);i++){sim.step();sim.marblePositions().forEach((p,ball)=>{for(const checkpoint of checkpoints)if(Math.hypot(p.x-checkpoint.at[0],p.z-checkpoint.at[2])<22&&p.y>checkpoint.at[1]-25&&p.y<checkpoint.at[1]+5){visits[ball].add(checkpoint.id);allVisits.add(checkpoint.id);}});}
 console.log(preset.name,'release',run+1,':',sim.marblePositions().filter(atFinish).length,'/ 6 at finish');
 assert.equal(sim.marblePositions().length,6);
 assert(sim.marblePositions().every(atFinish),'Every marble must reach the finish: '+JSON.stringify(sim.marblePositions().filter(p=>!atFinish(p))));
 for(const [ball,visited] of visits.entries())assert(routes.some(route=>route.every(id=>visited.has(id))),`Marble ${ball} bypassed or stopped on its route: ${[...visited]}`);
 }
 assert([...active].every(id=>allVisits.has(id)),'A branch was never exercised: '+[...active].filter(id=>!allVisits.has(id)));
 console.log(routes.length,'routes; every active track exercised');
 sim.dispose();
}
