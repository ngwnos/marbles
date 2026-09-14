import assert from 'node:assert/strict';
import {Box3,Quaternion,Vector3} from 'three/webgpu';
import {PRESETS} from '../src/assembly/presets';
import {PART_BY_ID} from '../src/assembly/catalog';
import {createPresetStock} from '../src/assembly/preset-stock';
import {createAssemblyPhysics} from '../src/assembly/physics';
import {planConstruction,constructionIsClear,constructionOrder,createConstructionMotion,createConstructionFocus,placedBounds,type ConstructionSource} from '../src/assembly/construction';
import {createConstructionRun} from '../src/assembly/construction-run';
import {createConstructionTiming} from '../src/assembly/construction-timing';
import type {Connection} from '../src/assembly/snapping';
const buildSpeed=Number(process.argv[2]??1);

// Both fades last real seconds, independently of the slider or frame rate.
for(const speed of [.25,1,10])for(const dt of [1/30,1/120]){
 const clock=createConstructionTiming();let remaining=8*speed,previous=.5,sawCruise=false;
 for(let tick=0;remaining>1e-8&&tick<2000;tick++){
  remaining-=clock.advance(dt,speed,remaining);
  const {elapsed,factor,endingAt}=clock.inspect();
  assert(factor>=.5&&factor<=1,'Build easing stalled or exceeded the selected speed');
  if(endingAt===undefined){assert(factor>=previous,'Pickup speed decreased during ease-in');if(elapsed>=1.5+dt){assert.equal(factor,1);sawCruise=true;}}
  else assert(factor<=previous,'Finish speed increased during ease-out');
  previous=factor;
 }
 const {elapsed,endingAt}=clock.inspect();
 assert(sawCruise&&remaining<=1e-8,'Eased build never finished');
 assert(Math.abs(elapsed-8.75)<dt*3,'Easing added excessive build time');
 assert(endingAt!==undefined&&Math.abs(elapsed-endingAt-1.5)<dt*3,'End easing did not last 1.5 real seconds');
}

for(const preset of PRESETS){
 const order=constructionOrder(preset),ranks=new Map(order.map((p,i)=>[p.id,i]));
 for(const c of preset.connections){const p=preset.pieces.find(p=>p.id===c.a)!,aBelow=PART_BY_ID[p.kind].ports.find(p=>p.id===c.ap)!.axis===1;assert(ranks.get(aBelow?c.a:c.b)!<ranks.get(aBelow?c.b:c.a)!,'A part precedes its support');}
 assert.throws(()=>planConstruction(preset,[]),/Missing loose parts/);
 const focus=createConstructionFocus({...preset,presetId:preset.id,onCarpet:true,pieces:order}),center=focus([]);
 for(let completed=0;completed<=order.length;completed++){
  const p=focus(order.slice(0,completed).map(p=>p.id)),remaining=order.slice(completed);
  const expectedY=remaining.length?Math.min(...remaining.map(p=>p.pose.position[1])):Math.max(...order.map(p=>p.pose.position[1]));
  assert.equal(p.y,expectedY,'Camera advanced before all pieces in a layer were seated');
  assert.equal(p.x,center.x);assert.equal(p.z,center.z);
 }
 // Finishing upper pieces cannot advance the camera past a lower straggler.
 for(const unfinished of order){
  const finished=order.filter(p=>p.id!==unfinished.id).map(p=>p.id);
  assert.equal(focus(finished).y,unfinished.pose.position[1],'Camera skipped an unfinished layer after out-of-order seating');
 }
}

const preset=PRESETS[0],sim=await createAssemblyPhysics();
for(const kind of new Set(preset.pieces.map(p=>p.kind))){const data=await Bun.file('src/generated/'+(kind==='start'?'start':kind==='paddle'?'paddle-body':kind)+'-collision.json').json();sim.registerSurface(kind,data.parts??[data]);}
const parts:ConstructionSource[]=createPresetStock(preset).map((p,id)=>({id:id+101,kind:p.kind,position:new Vector3(...p.position),rotation:new Quaternion(...p.rotation),fixed:false}));
parts.forEach(p=>sim.add(p.id,p.kind,p.position.toArray(),p.rotation,false,{awake:false}));
sim.dumpTub();for(let i=0;i<1800;i++)sim.step();
for(const p of parts)Object.assign(p,sim.pose(p.id));
const initial=parts.map(p=>({...p,position:p.position.clone(),rotation:p.rotation.clone()}));
const tubBounds=()=>new Box3(new Vector3(-1600,-6,-240),new Vector3(-1100,420,360));
const start=performance.now(),plan=planConstruction(preset,parts,[tubBounds()]);
console.log('Placement:',(performance.now()-start).toFixed(0),'ms;',plan.onCarpet?'on carpet':'on floor');
assert(plan.onCarpet,'Dumped kit should leave room for its preset on the carpet');
assert(constructionIsClear(plan,initial),'Planned footprint overlaps the dumped pile');
assert(plan.pieces.some(p=>Math.abs(p.pose.position[0]-preset.pieces.find(o=>o.id===p.id)!.pose.position[0])>50),'Planner reused the default location');
// Only the short socket insertion is straight down. The carry begins moving
// sideways immediately and is unaffected by tall objects outside its route.
const example:ConstructionSource={id:1,kind:'spacer',position:new Vector3(-450,0,-250),rotation:new Quaternion(),fixed:false};
const exampleTarget={id:2,kind:'spacer',pose:{position:[350,0,100] as [number,number,number],yaw:1}};
const bare=createConstructionMotion(example,exampleTarget),distant=createConstructionMotion(example,exampleTarget,[new Box3(new Vector3(2000,0,2000),new Vector3(2200,2000,2200))]);
assert(bare.sample(bare.duration*.2).position.x>example.position.x+.1,'Pickup still rises vertically before travelling');
// Pickup should visibly gather speed instead of reaching cruising speed
// almost immediately. Compare actual displacement over equal time windows.
const pickupStep=bare.sample(bare.duration*.1).position.distanceTo(bare.sample(bare.duration*.09).position);
const cruiseStep=bare.sample(bare.duration*.6).position.distanceTo(bare.sample(bare.duration*.59).position);
assert(pickupStep<cruiseStep*.05,'Pickup accelerates too abruptly');
let peak=0;
for(let i=0;i<=100;i++){const p=bare.sample(bare.duration*i/100).position;peak=Math.max(peak,p.y);assert(p.distanceTo(distant.sample(distant.duration*i/100).position)<1e-8,'Unrelated geometry raised the carry');}
assert(peak<200,'Unobstructed carry makes an exaggerated high arc');
const blocker=new Box3(new Vector3(-75,0,-100),new Vector3(75,220,80)),detour=createConstructionMotion(example,exampleTarget,[blocker]);
for(let i=0;i<=100;i++){
 const p=detour.sample(detour.duration*i/100);assert(!placedBounds({...example,...p}).intersectsBox(blocker),'Carry clips an intervening obstacle');
}
// Overhangs in the pickup pile need gradual extraction, even when their
// bounding box does not touch the source vertically. Late obstacles must
// lift the approach rather than blow up the front of the curve.
const pickup:ConstructionSource={id:900,kind:'spacer',position:new Vector3(),rotation:new Quaternion(),fixed:false};
const destination={id:901,kind:'spacer',pose:{position:[1000,0,0] as [number,number,number],yaw:0}};
for(const [name,obstacle] of [
 ['pickup overhang',new Box3(new Vector3(-10,90,-30),new Vector3(140,200,30))],
 ['late obstacle',new Box3(new Vector3(780,0,-40),new Vector3(860,200,40))],
] as const){
 const motion=createConstructionMotion(pickup,destination,[obstacle]);let top=0;
 for(let i=0;i<=400;i++){
  const pose=motion.sample(motion.duration*i/400);top=Math.max(top,pose.position.y);
  if(name==='late obstacle')assert(!placedBounds({...pickup,...pose}).intersectsBox(obstacle),'Low approach clips the late obstacle');
 }
 assert(top<400,`${name} sent the piece unnecessarily high: ${top} mm`);
}
for(const source of initial){
 const target=plan.pieces.find(p=>p.kind===source.kind)!,motion=createConstructionMotion(source,target),q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),target.pose.yaw);
 assert(motion.sample(0).position.distanceTo(source.position)<1e-8);
 let sawInsertion=false;
 for(let i=50;i<=1000;i++){
  const pose=motion.sample(i/1000*motion.duration),horizontal=Math.hypot(pose.position.x-target.pose.position[0],pose.position.z-target.pose.position[2]);
  if(horizontal<1e-7){sawInsertion=true;assert(pose.position.y-target.pose.position[1]<=25,'Straight descent began too far above the socket');assert(pose.rotation.angleTo(q)<1e-7);}
 }
 assert(sawInsertion,'No aligned socket insertion');
 assert(motion.sample(motion.duration).position.distanceTo(new Vector3(...target.pose.position))<1e-8);
}
let connections:Connection[]=[],count=0;
const seated=new Set<number>();
const run=createConstructionRun(plan,()=>parts,sim,tubBounds,(id,target,links)=>{
 const p=parts.find(p=>p.id===id)!;assert(!p.fixed,'Reused an installed piece');p.fixed=true;p.position.fromArray(target.pose.position);p.rotation.setFromAxisAngle(new Vector3(0,1,0),target.pose.yaw);connections=links;count++;
 seated.add(target.id);
});
let done=false,previousStarts=0,lastStartTick=-Infinity,maxConcurrent=0,sawCrossLayer=false;
const focus=createConstructionFocus(plan);
for(let tick=0;tick<40000&&!done;tick++){
 done=run.step(buildSpeed);sim.step();
 const progress=run.inspect();
 assert(progress.started-previousStarts<=1,'Started multiple pieces simultaneously');
 if(progress.started>previousStarts){
  assert((tick-lastStartTick)/120*buildSpeed>=.3-1e-8,'Pickups were not staggered');
  const launched=progress.active.find(p=>p.targetId===plan.pieces[progress.started-1].id)!;
  assert(launched,'Started out of plan order');lastStartTick=tick;
 }
 previousStarts=progress.started;maxConcurrent=Math.max(maxConcurrent,progress.active.length);
 assert(new Set(progress.active.map(p=>p.id)).size===progress.active.length,'Picked a moving piece twice');
 sawCrossLayer ||= new Set(progress.active.map(p=>p.layer)).size>1;
 assert.deepEqual(new Set(progress.completedIds),seated);
 const pending=plan.pieces.filter(p=>!seated.has(p.id));
 assert.equal(focus(progress.completedIds).y,pending.length?Math.min(...pending.map(p=>p.pose.position[1])):Math.max(...plan.pieces.map(p=>p.pose.position[1])),'Camera advanced past an unfinished layer');
 for(const carry of progress.active){
  const target=plan.pieces.find(p=>p.id===carry.targetId)!;
  for(const c of plan.connections){const port=c.a===target.id?c.ap:c.b===target.id?c.bp:undefined;if(port&&PART_BY_ID[target.kind].ports.find(p=>p.id===port)!.axis===-1)assert(seated.has(c.a===target.id?c.b:c.a),'Started before a support seated');}
 }
 if(tick%120===0){for(const p of parts)assert(sim.pose(p.id)!.position.y> -100,'Lost a body through the floor');}
}
assert(maxConcurrent>1,'Construction never overlapped');
assert(sawCrossLayer,'Flights never overlapped across layers');
assert(done&&count===preset.pieces.length,'Construction did not finish');
const timing=run.inspect().timing;
assert(timing.endingAt!==undefined&&timing.factor<.6,'Full preset did not ease out');
assert(Math.abs(timing.elapsed-timing.endingAt-1.5)<.6,'Full preset finish ease was too long or too short');
console.log(`Build speed eased out over ${(timing.elapsed-timing.endingAt).toFixed(2)} seconds at ${buildSpeed}x`);
assert(parts.every(p=>p.fixed),'A kit piece was left loose');
assert.equal(parts.find(p=>p.id===run.inspect().startId)?.kind,'start');
assert.equal(connections.length,preset.connections.length);
for(const c of connections){
 const at=(id:number,port:string)=>{const p=parts.find(p=>p.id===id)!;return new Vector3(...PART_BY_ID[p.kind].ports.find(v=>v.id===port)!.position).applyQuaternion(sim.pose(id)!.rotation).add(sim.pose(id)!.position);};
 assert(at(c.a,c.ap).distanceTo(at(c.b,c.bp))<.075,'Connector did not seat exactly');
}
for(const p of plan.pieces){const matching=parts.filter(s=>s.kind===p.kind);assert(matching.some(s=>s.position.distanceTo(new Vector3(...p.pose.position))<.075));}
console.log(`Built ${count} original pieces with ${connections.length} connections; ${maxConcurrent} concurrent carries, cross-layer overlap, staggered starts, supports, camera and seating passed`);
// Stopping a pickup must give the carried collider back to gravity.
const spares:ConstructionSource[]=Array.from({length:3},(_,i)=>({id:9000+i,kind:'base',position:new Vector3(1750+i*270,-6,2000),rotation:new Quaternion(),fixed:false}));
for(const p of spares)sim.add(p.id,p.kind,p.position.toArray(),p.rotation,false);
const cancelPlan={...plan,pieces:spares.map((p,i)=>({id:i+1,kind:'base',pose:{position:[p.position.x,-6,1700] as [number,number,number],yaw:0}})),connections:[]};
const cancelled=createConstructionRun(cancelPlan,()=>spares,sim,tubBounds,()=>assert.fail('Placed a cancelled pickup'));
for(let tick=0;tick<300&&cancelled.inspect().active.length<3;tick++){cancelled.step();sim.step();}
assert.equal(cancelled.inspect().active.length,3,'Cancellation did not exercise multiple flights');
const beforeStop=spares.map(p=>sim.pose(p.id)!.position);cancelled.stop();
assert.equal(cancelled.inspect().active.length,0);
spares.forEach((p,i)=>assert(sim.pose(p.id)!.position.distanceTo(beforeStop[i])<.001,'Stopping teleported a piece'));
for(let tick=0;tick<600;tick++)sim.step();
for(const p of spares)assert(sim.pose(p.id)!.position.y<30&&sim.pose(p.id)!.position.y> -20,'Stopped piece did not settle on the floor');
console.log('Stopping all simultaneous pickups restores gravity');
sim.dispose();
