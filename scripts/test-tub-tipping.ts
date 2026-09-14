import assert from 'node:assert/strict';
import {PerspectiveCamera,Quaternion,Vector3} from 'three/webgpu';
import {createAssemblyPhysics} from '../src/assembly/physics';
import {STORAGE_TUB as D} from '../src/assembly/storage-tub-spec';
import {RUG} from '../src/assembly/rug-spec';
import {tubLocalPivot,tubWorldPivot,tubPoseAtAngle,tubDragAngle} from '../src/assembly/tub-motion';
import {generateTubPack,packedHulls,auditPackedOverlap,type PackedPiece} from '../src/assembly/tub-packing';
import {decodePreviewMesh} from '../src/geometry/preview-mesh';
import {START} from '../src/pieces/start';
import {PADDLE,paddleAxleY} from '../src/pieces/paddle-wheel';

// Measure the visible shell rather than relying on the placement formula.
const geometry=decodePreviewMesh(await Bun.file('src/generated/storage-tub.bin').arrayBuffer()),vertices=geometry.getAttribute('position'),upright=tubPoseAtAngle(0);
let maxX=-Infinity,minY=Infinity;
for(let i=0;i<vertices.count;i++){const p=new Vector3().fromBufferAttribute(vertices,i).applyQuaternion(upright.rotation).add(upright.position);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);}
assert(maxX< -RUG.width/2-29,'Visible tub overlaps the carpet');
assert(Math.abs(minY+RUG.thickness)<.2,'Tub does not stand on the wood floor');geometry.dispose();
for(const angle of [0,.2,.7,1.4]){
 const pose=tubPoseAtAngle(angle);
 assert(tubLocalPivot.clone().applyQuaternion(pose.rotation).add(pose.position).distanceTo(tubWorldPivot)<1e-9);
 const axle=new Vector3(1,0,0).applyQuaternion(pose.rotation);assert(axle.distanceTo(new Vector3(0,0,-1))<1e-9);
}
// Recover mouse angles from several camera directions, including along the hinge.
const grab=new Vector3(0,380,180),width=1600,height=1000;
for(const eye of [[-350,720,1250],[-1300,500,1500],[-2000,1000,-700]]){
 const camera=new PerspectiveCamera(45,width/height,1,10000);camera.position.fromArray(eye);camera.lookAt(-1200,200,60);camera.updateMatrixWorld();
 for(const angle of [.2,.5,.9,1.3]){const pose=tubPoseAtAngle(angle),p=grab.clone().applyQuaternion(pose.rotation).add(pose.position).project(camera);
  const result=tubDragAngle(grab,{x:(p.x+1)*width/2,y:(1-p.y)*height/2},camera,width,height,angle-.05);assert(Math.abs(result-angle)<.001,`Mouse angle ${result} != ${angle}`);
 }
}
console.log('Outside-carpet placement, fixed pivot and screen-space drag passed');

// No drag motor is active in these tests. Gravity must choose both outcomes.
for(const [angle,fallen] of [[.25,false],[1.05,true]] as const){
 const sim=await createAssemblyPhysics();sim.restoreTub({angle,awake:true});let pivotError=0,axisError=0;
 for(let i=0;i<720;i++){sim.step();const p=sim.tubPose();pivotError=Math.max(pivotError,tubLocalPivot.clone().applyQuaternion(p.rotation).add(p.position).distanceTo(tubWorldPivot));axisError=Math.max(axisError,new Vector3(1,0,0).applyQuaternion(p.rotation).distanceTo(new Vector3(0,0,-1)));}
 const p=sim.tubPose();assert(fallen?p.angle>1.3:Math.abs(p.angle)<.01);assert(!p.awake);assert(pivotError<3&&axisError<.002,`Hinge drift: ${pivotError} mm, ${axisError}`);
 const restored=await createAssemblyPhysics();restored.restoreTub({angle:p.angle,awake:false});assert(Math.abs(restored.tubPose().angle-p.angle)<.001);restored.dispose();sim.dispose();
 console.log(JSON.stringify({releasedAt:angle,restingAngle:p.angle,pivotError,axisError}));
}

const pack=await generateTubPack(42),sim=await createAssemblyPhysics();
pack.pieces.forEach((p,id)=>sim.add(id,p.kind,p.position,new Quaternion(...p.rotation),false,{awake:false,rotorRotation:p.rotorRotation}));
let maxPivotError=0;
const advance=(steps:number)=>{for(let i=0;i<steps;i++){sim.step();const p=sim.tubPose();maxPivotError=Math.max(maxPivotError,tubLocalPivot.clone().applyQuaternion(p.rotation).add(p.position).distanceTo(tubWorldPivot));}};
sim.beginTubTip();sim.setTubTipTarget(1.2);advance(400);assert(Math.abs(sim.tubPose().angle-1.2)<.05,'Filled tub did not follow drag');
sim.endTubTip();const release=sim.tubPose();advance(1800);
const final:PackedPiece[]=pack.pieces.map((p,id)=>{const pose=sim.pose(id)!,w=sim.wheelPose(id);return {...p,position:pose.position.toArray(),rotation:pose.rotation.toArray(),...(w?{rotorRotation:pose.rotation.clone().invert().multiply(w.rotation).toArray()}: {})};});
const resting=sim.tubPose(),spilled=final.filter(p=>new Vector3(...p.position).sub(resting.position).applyQuaternion(resting.rotation.clone().invert()).y>D.height+20).length;
assert(spilled>=5,`Only ${spilled} pieces cleared the tub mouth`);
const onCarpet=final.filter(p=>p.position[0]>-RUG.width/2).length;
assert(!sim.tubPose().held&&sim.tubPose().angle>release.angle+.1,'Release left the drag spring enabled');
assert(onCarpet>pack.pieces.length/2,'Tipped contents did not spill towards the carpet');
// Convex envelopes enclose empty space around curved pieces. If that bound
// flags the floor, check the actual rendered surface before reporting clipping.
let minimumY=Infinity;
const finalHulls=packedHulls(final);
for(const [id,p] of final.entries()){
 let y=Math.min(...finalHulls[id].flatMap(h=>h.vertices.map(v=>v.y)));
 if(y<=-RUG.thickness-1){
  y=Infinity;
  const meshes:{key:string;offset:Vector3;rotation:Quaternion}[]=[{key:p.kind==='paddle'?'paddle-body':p.kind==='start'?'start-body':p.kind,offset:new Vector3(),rotation:new Quaternion()}];
  if(p.kind==='paddle'||p.kind==='start')meshes.push({key:p.kind==='paddle'?'paddle-wheel':'start-rotor',offset:p.kind==='paddle'?new Vector3(PADDLE.x,paddleAxleY,PADDLE.z):new Vector3(START.pivotX,START.pivotY,0),rotation:new Quaternion(...p.rotorRotation!)});
  const rotation=new Quaternion(...p.rotation),position=new Vector3(...p.position);
  for(const part of meshes){
   const mesh=decodePreviewMesh(await Bun.file(`src/generated/${part.key}.bin`).arrayBuffer()),v=mesh.getAttribute('position');
   for(let i=0;i<v.count;i++)y=Math.min(y,new Vector3().fromBufferAttribute(v,i).applyQuaternion(part.rotation).add(part.offset).applyQuaternion(rotation).add(position).y);
   mesh.dispose();
  }
 }
 minimumY=Math.min(minimumY,y);
}
assert(minimumY> -RUG.thickness-1,`A piece passed through the floor: ${minimumY} mm`);
assert(maxPivotError<4,`Loaded hinge drifted ${maxPivotError} mm`);
const overlap=auditPackedOverlap(final);assert(overlap.maxPenetration<.5,`Spilled pile overlaps: ${JSON.stringify(overlap)}`);
// The same gesture must lift a fallen tub back up; no reset/teleport is needed.
sim.beginTubTip();sim.setTubTipTarget(0);advance(400);sim.endTubTip();advance(720);
assert(Math.abs(sim.tubPose().angle)<.01,'Could not drag the tub upright again');
console.log(JSON.stringify({pieces:pack.pieces.length,spilled,onCarpet,minimumY,maxPivotError,overlap:overlap.maxPenetration,righted:true}));sim.dispose();
