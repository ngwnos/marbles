import assert from 'node:assert/strict';
import {Quaternion,Vector3} from 'three/webgpu';
import {createAssemblyPhysics} from '../src/assembly/physics';
import {createTubFill,TUB_FILL_SEEDS} from '../src/assembly/tub-stock';
import {createPresetStock} from '../src/assembly/preset-stock';
import {PRESETS} from '../src/assembly/presets';
import {createTubDumpMotion,TUB_DUMP_DURATION} from '../src/assembly/tub-dump';
import {tubLocalPivot,tubWorldPivot,tubPoseAtAngle} from '../src/assembly/tub-motion';
import {STORAGE_TUB as D,insideTubOpening} from '../src/assembly/storage-tub-spec';
import {RUG} from '../src/assembly/rug-spec';
import {ASSEMBLY_STEP} from '../src/physics-settings';

for(const angle of [0,.8,1.7]){
 const start=tubPoseAtAngle(angle),motion=createTubDumpMotion(start),home=tubPoseAtAngle(0);
 assert(motion(0).position.distanceTo(start.position)<1e-8);
 assert(motion(0).rotation.angleTo(start.rotation)<1e-7);
 assert(motion(TUB_DUMP_DURATION).position.distanceTo(home.position)<1e-8);
 assert(motion(TUB_DUMP_DURATION).rotation.angleTo(home.rotation)<1e-7);
 let previous=motion(0),minUp=1;
 for(let t=ASSEMBLY_STEP;t<TUB_DUMP_DURATION;t+=ASSEMBLY_STEP){
  const p=motion(t);assert(previous.position.distanceTo(p.position)<30,'Tub teleported');
  assert(previous.rotation.angleTo(p.rotation)<.05,'Tub rotation jumped');previous=p;
  const up=new Vector3(0,1,0).applyQuaternion(p.rotation).y;minUp=Math.min(minUp,up);
  const center=new Vector3(0,D.height/2,0).applyQuaternion(p.rotation).add(p.position);
  const previousCenter=new Vector3(0,D.height/2,0).applyQuaternion(motion(t-ASSEMBLY_STEP).rotation).add(motion(t-ASSEMBLY_STEP).position);
  if(t>.2&&t<TUB_DUMP_DURATION-.2)assert(center.distanceTo(previousCenter)>.03,'Gesture paused between movements');
 }
 assert(minUp<-.9,'Tub did not tip far enough to pour');
}

const packs=[...TUB_FILL_SEEDS.map(seed=>({name:String(seed),pieces:createTubFill(undefined,seed).pieces})),{name:'Tangled Garden',pieces:createPresetStock(PRESETS.find(p=>p.id==='tangled-garden')!)}];
for(const {name,pieces} of packs){
 const sim=await createAssemblyPhysics();
 pieces.forEach((p,id)=>sim.add(id,p.kind,p.position,new Quaternion(...p.rotation),false,{awake:false,rotorRotation:p.rotorRotation}));
 assert(sim.dumpTub());assert(!sim.dumpTub(),'Accepted a second dump during the first');
 let high=0,previous=sim.tubPose();
 for(let i=0;i<1800;i++){
  sim.step();const current=sim.tubPose();high=Math.max(high,current.position.y);
  assert(current.position.distanceTo(previous.position)<30,`${name}: tub jumped during its physical motion`);
  assert(current.rotation.angleTo(previous.rotation)<.05,`${name}: tub rotation jumped during its physical motion`);
  previous=current;
 }
 const tub=sim.tubPose(),poses=pieces.map((_,id)=>sim.pose(id)!);
 assert(high>800,'Tub never lifted');assert(!tub.dumping&&!tub.held,'Animation did not finish');
 assert(!tub.awake&&Math.abs(tub.angle)<.01,'Tub did not settle upright');
 assert(tub.position.distanceTo(tubPoseAtAngle(0).position)<.1,'Tub returned to the wrong place');
 const remaining=poses.filter(p=>{const local=p.position.clone().sub(tub.position).applyQuaternion(tub.rotation.clone().invert());return local.y>-10&&local.y<D.height+150&&insideTubOpening(local.x,local.z);});
 assert.equal(remaining.length,0,`${name}: contents left in tub`);
 assert(poses.every(p=>p.position.toArray().every(Number.isFinite)&&p.position.y> -100),'Lost a body through the floor');
 const onCarpet=poses.filter(p=>Math.abs(p.position.x)<RUG.width/2&&Math.abs(p.position.z)<RUG.depth/2).length;
 assert(onCarpet>=pieces.length*.95,`${name}: too many pieces thrown past the carpet`);
 const spread=(axis:'x'|'z')=>Math.max(...poses.map(p=>p.position[axis]))-Math.min(...poses.map(p=>p.position[axis]));
 assert(spread('x')>600&&spread('z')>450,'Contents fell in a narrow pile');
 // Changing to kinematic and back must not break the ordinary drag hinge.
 sim.beginTubTip();sim.setTubTipTarget(.4);for(let i=0;i<240;i++)sim.step();
 assert(Math.abs(sim.tubPose().angle-.4)<.02);
 const pivot=sim.tubPose();assert(tubLocalPivot.clone().applyQuaternion(pivot.rotation).add(pivot.position).distanceTo(tubWorldPivot)<3);
 sim.endTubTip();for(let i=0;i<600;i++)sim.step();
 assert(!sim.tubPose().held&&Math.abs(sim.tubPose().angle)<.01,'Gravity did not resume after manual release');
 sim.dispose();console.log(`${name}: ${pieces.length}/${pieces.length} emptied, ${onCarpet} on carpet; returned upright; drag and gravity preserved`);
}
