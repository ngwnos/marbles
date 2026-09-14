import assert from 'node:assert/strict';
import {Quaternion,Vector3} from 'three/webgpu';
import {createAssemblyPhysics} from '../src/assembly/physics';

const sim=await createAssemblyPhysics();
try{
 sim.add(1,'spacer',[0,0,0],new Quaternion(),false,{awake:false});
 assert.deepEqual(sim.poseIfChanged(1),sim.pose(1));
 assert.equal(sim.poseIfChanged(1),undefined,'Sleeping body emitted another update');
 sim.beginCarry(1);
 sim.carry(1,new Vector3(50,80,10),new Quaternion());
 assert.deepEqual(sim.poseIfChanged(1),sim.pose(1),'Disabled carried body missed its transform');
 sim.add(1,'spacer',[50,80,10],new Quaternion(),false);
 let moving=false,sleeping=false;
 for(let i=0;i<1200;i++){
  sim.step();const update=sim.poseIfChanged(1),actual=sim.pose(1)!;
  if(update){assert.deepEqual(update,actual);moving ||= update.awake;sleeping ||= !update.awake;}
  else assert(!actual.awake,'Awake body missed its update');
 }
 assert(moving&&sleeping,'Did not observe both movement and the final sleeping transform');
 assert.equal(sim.poseIfChanged(1),undefined);
 sim.remove(1);assert.equal(sim.poseIfChanged(1),undefined);
 sim.add(1,'spacer',[10,0,20],new Quaternion(),false,{awake:false});
 assert.deepEqual(sim.poseIfChanged(1),sim.pose(1),'Reused ID retained stale update state');
 console.log('Pose updates: sleep, carry, replacement, motion and final sleep passed');
}finally{sim.dispose();}
