import assert from 'node:assert/strict';
import {createAssemblyPhysics} from '../src/assembly/physics';
import {Quaternion,Vector3} from 'three';
const data=await Bun.file('src/generated/start-collision.json').json();
// Repeated fills vary gate settling time and world orientation. The bowl is
// isolated so a blockage in the receiving track cannot masquerade as a bowl jam.
for(const yaw of [0,.4,.67,1.2,2.1,Math.PI]){
 const sim=await createAssemblyPhysics();
 sim.registerSurface('start',[data]);
 sim.add(1,'start',[0,200,0],new Quaternion().setFromAxisAngle(new Vector3(0,1,0),yaw),true);
 for(let run=0;run<8;run++){
  sim.clearMarbles();assert.equal(sim.fillGate(1),6);
  for(let i=0;i<[60,120,240,360][run%4];i++)sim.step();
  sim.releaseGate(1);
  const exited=new Set<number>();let previous=new Map(sim.marbleStates().map(m=>[m.id,m.position]));
  for(let i=0;i<3600;i++){
   sim.step();const current=sim.marbleStates();
   for(const {id,position:p} of current){
    const before=previous.get(id);if(!before)continue;
    if(before.y>=200&&p.y<200){
     const at=before.clone().lerp(p,(before.y-200)/(before.y-p.y));
     assert(Math.hypot(at.x,at.z)<12,`Escaped over rim: yaw ${yaw}, batch ${run}, at ${at.toArray()}`);
     exited.add(id);
    }
   }
   previous=new Map(current.map(m=>[m.id,m.position]));
   if(exited.size===6)break;
  }
  if(exited.size!==6)console.log({yaw,run,exited:[...exited],positions:sim.marblePositions().map(p=>p.toArray())});
  assert.equal(exited.size,6,`Yaw ${yaw}, batch ${run}: marbles must drain through the bore, not escape over the rim`);
  assert(sim.marblePositions().every(p=>p.y<200),`Yaw ${yaw}, batch ${run}: bowl remained blocked`);
 }
 sim.dispose();console.log('Funnel drained 8 batches at yaw',yaw);
}
