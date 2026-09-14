import {addMarbleShapes,PLASTIC,WOOD,CARPET} from '../contact-materials';
import {RUG} from './rug-spec';
import {STORAGE_TUB} from './storage-tub-spec';
import {createTubPhysics} from './tub-physics';
import {CONTACT_HERTZ,PHYSICS_SUBSTEPS,MM_TO_PHYSICS,GRAVITY_MM,MARBLE_RADIUS_MM,SOLVER_STEP,ASSEMBLY_STEP} from '../physics-settings';
import initBox3D from '../vendor/box3d/box3d.mjs';
import type {Body,MeshGeometry,Joint} from 'box3d-wasm/standard';
import {START} from '../pieces/start';
import startHulls from '../generated/start-hulls.json';
import {shuffledMarbleColors} from '../marble-colors';
import {gateSlotOccupied} from '../gate-slots';
import wheelHulls from '../generated/paddle-colliders.json';
import {PADDLE,paddleAxleY} from '../pieces/paddle-wheel';
import hullData from '../generated/assembly-hulls.json';
import envelopes from '../generated/piece-envelopes.json';
import {Box3,Matrix4,Quaternion,Vector3} from 'three/webgpu';
import type {V3} from './catalog';
export const ASSEMBLY_MARBLE_RADIUS=MARBLE_RADIUS_MM;
const SCALE=MM_TO_PHYSICS;
export async function createAssemblyPhysics(options:{packing?:boolean;engine?:typeof initBox3D}={}){
 const b3=await (options.engine??initBox3D)(),world=new b3.World({gravity:{x:0,y:-GRAVITY_MM*SCALE,z:0},contactHertz:CONTACT_HERTZ,enableSleep:true,enableContinuous:true});
 const floor=world.createBody({type:'static',position:{x:0,y:-(8+RUG.thickness)*SCALE,z:0}});
 floor.createBox({halfExtents:{x:2500*SCALE,y:8*SCALE,z:2500*SCALE},...WOOD}).delete();
 const rug=world.createBody({type:'static',position:{x:0,y:-RUG.thickness/2*SCALE,z:0}});
 rug.createBox({halfExtents:{x:RUG.width/2*SCALE,y:RUG.thickness/2*SCALE,z:RUG.depth/2*SCALE},...CARPET}).delete();
 const tub=createTubPhysics(world,b3.MeshGeometry,!!options.packing);
 const kinds=new Map<number,{kind:string;fixed:boolean}>(),detailed=new Set<number>();
 const bodies=new Map<number,Body>(),surfaces=new Map<string,MeshGeometry[]>();
 const dirtyPoses=new Set<number>(),movingPoses=new Set<number>();
 const registerSurface=(kind:string,parts:{vertices:number[];indices:number[]}[])=>{
  if(surfaces.has(kind))return;
  surfaces.set(kind,parts.map(p=>new b3.MeshGeometry({vertices:Float32Array.from(p.vertices,v=>v*SCALE),indices:Uint32Array.from(p.indices)})));
 };
 const addEnvelopes=(body:Body,kind:string,density=1)=>{
  const data=envelopes[kind as keyof typeof envelopes],hullVolume=data.hulls.reduce((sum,h)=>sum+h.volume,0);
  for(const h of data.hulls){const points=[];for(let j=0;j<h.vertices.length;j+=3)points.push({x:h.vertices[j]*SCALE,y:h.vertices[j+1]*SCALE,z:h.vertices[j+2]*SCALE});
   const shape=body.createHull({points,maxVertices:points.length,density:density*data.volume/hullVolume,...PLASTIC,filter:{categoryBits:8,maskBits:1|8|16}});
   if(!shape.isValid())throw new Error(`Invalid outer envelope: ${kind}`);shape.delete();
  }
 };
 const balls=new Map<number,{body:Body;age:number;color:number;previous:Vector3;previousRotation:Quaternion}>();let nextBall=1;
 const removeMarble=(id:number)=>{const m=balls.get(id);if(!m)return;m.body.destroy();m.body.delete();balls.delete(id);};
 const clearMarbles=()=>{for(const id of balls.keys())removeMarble(id);};
 const ballPosition=(b:Body)=>{const p=b.getPosition();return new Vector3(p.x/SCALE,p.y/SCALE,p.z/SCALE);};
 const marblePositions=()=>[...balls.values()].map(m=>ballPosition(m.body));
 const marbleStates=(alpha=1)=>[...balls].map(([id,m])=>{const q=m.body.getRotation();return {id,position:m.previous.clone().lerp(ballPosition(m.body),alpha),rotation:m.previousRotation.clone().slerp(new Quaternion(q.x,q.y,q.z,q.w),alpha),color:m.color};});
 const dropMarble=(position:V3,color=0xe44d2e)=>{
  if(marblePositions().some(p=>p.distanceTo(new Vector3(...position))<ASSEMBLY_MARBLE_RADIUS*2.1))return false;
  // Fine track contacts are needed only once marbles are present. A full
  // storage tub otherwise uses the much smaller outer collision envelopes.
  if(!options.packing)for(const [id,b] of bodies){const wasAwake=b.isAwake();ensureDetailed(id);if(!wasAwake)b.setAwake(false);}
  const body=world.createBody({type:'dynamic',position:{x:position[0]*SCALE,y:position[1]*SCALE,z:position[2]*SCALE},angularDamping:0,linearDamping:0});
  addMarbleShapes(body,ASSEMBLY_MARBLE_RADIUS*SCALE);
  balls.set(nextBall++,{body,age:0,color,previous:new Vector3(...position),previousRotation:new Quaternion()});return true;
 };
 const wheels=new Map<number,{body:Body;joint:Joint;kind:string}>();
 const attachWheel=(id:number,parent:Body,position:V3,rotation:Quaternion,kind:string)=>{
  const pivot=kind==='start'?new Vector3(START.pivotX,START.pivotY,0):new Vector3(PADDLE.x,paddleAxleY,PADDLE.z),at=pivot.clone().applyQuaternion(rotation).add(new Vector3(...position)).multiplyScalar(SCALE);
  const rotor=world.createBody({type:'dynamic',position:at,rotation,angularDamping:.2,linearDamping:0,enableContactRecycling:false});
  addEnvelopes(rotor,kind==='start'?'start-rotor':'paddle-wheel',1.2);
  if(!options.packing)for(const hull of kind==='start'?startHulls:wheelHulls){
   const points=[];for(let i=0;i<hull.length;i+=3)points.push({x:hull[i]*SCALE,y:hull[i+1]*SCALE,z:hull[i+2]*SCALE});
   const shape=rotor.createHull({points,maxVertices:points.length,density:0,...PLASTIC,filter:{categoryBits:1,maskBits:4}});if(!shape.isValid())throw new Error('Invalid paddle rotor hull');shape.delete();
  }
  const joint=world.createRevoluteJoint(parent,rotor,{anchorA:pivot.multiplyScalar(SCALE),anchorB:{x:0,y:0,z:0},enableMotor:true,...(kind==='start'?{enableLimit:true,lowerAngle:0,upperAngle:0}:{}),motorSpeed:0,maxMotorTorque:kind==='start'?rotor.getMass()*3000:.04*rotor.getMass()*GRAVITY_MM*SCALE*PADDLE.axleRadius*SCALE,collideConnected:false});
  wheels.set(id,{body:rotor,joint,kind});
 };
 const wheelPose=(id:number)=>{const wheel=wheels.get(id);if(!wheel)return;const q=wheel.body.getRotation();return {position:ballPosition(wheel.body),rotation:new Quaternion(q.x,q.y,q.z,q.w).normalize(),awake:wheel.body.isAwake(),angle:wheel.joint.getAngle()};};
 const bodyBounds=(id:number)=>{
  const bounds=new Box3(),kind=kinds.get(id)!.kind;
  for(const [b,key] of [[bodies.get(id)!,kind],...(wheels.has(id)?[[wheels.get(id)!.body,kind==='start'?'start-rotor':'paddle-wheel'] as const]:[])] as const){
   const d=envelopes[key as keyof typeof envelopes],q=b.getRotation();
   bounds.union(new Box3(new Vector3(...d.min),new Vector3(...d.max)).applyMatrix4(new Matrix4().compose(ballPosition(b),new Quaternion(q.x,q.y,q.z,q.w).normalize(),new Vector3(1,1,1))));
  }return bounds;
 };
 const wakeNeighbors=(id:number)=>{
  // Restored sleeping bodies have no previous contact graph. Explicitly wake
  // nearby loose bodies when their possible support is removed; subsequent
  // contacts propagate wake-up through the rest of the affected pile.
  if(bodies.has(id)){const bounds=bodyBounds(id).expandByScalar(3.2);for(const [other,b] of bodies)if(other!==id&&!kinds.get(other)!.fixed&&bounds.intersectsBox(bodyBounds(other))){b.setAwake(true);wheels.get(other)?.body.setAwake(true);}}
 };
 const remove=(id:number)=>{
  wakeNeighbors(id);
  const wheel=wheels.get(id);if(wheel){wheel.body.destroy();wheel.joint.delete();wheel.body.delete();wheels.delete(id);}const b=bodies.get(id);if(b){b.destroy();b.delete();bodies.delete(id);}kinds.delete(id);detailed.delete(id);dirtyPoses.delete(id);movingPoses.delete(id);
 };
 const ensureDetailed=(id:number)=>{
  if(detailed.has(id))return;const body=bodies.get(id)!,{kind,fixed}=kinds.get(id)!;
  if(fixed&&surfaces.has(kind)){
   for(const data of surfaces.get(kind)!){const shape=body.createMesh(data,{...PLASTIC,filter:{categoryBits:1,maskBits:4}});if(!shape.isValid())throw new Error('Invalid assembly track surface');shape.delete();}
   detailed.add(id);return;
  }
  for(const patch of (hullData as Record<string,number[][]>)[kind==='paddle'?'paddle-body':kind==='start'?'start-body':kind]){
   let points:{x:number;y:number;z:number}[]=[];for(let i=0;i<patch.length;i+=3)points.push({x:patch[i]*SCALE,y:patch[i+1]*SCALE,z:patch[i+2]*SCALE});
   // Tiny surface fragments can stall the convex-hull solver before it
   // returns an invalid shape. Apply the same minimum thickness up front.
   const span=(axis:'x'|'y'|'z')=>Math.max(...points.map(p=>p[axis]))-Math.min(...points.map(p=>p[axis]));
   if(['x','y','z'].some(axis=>span(axis as 'x'|'y'|'z')<.5*SCALE)){
    const bounds=(['x','y','z'] as const).map(axis=>{const lo=Math.min(...points.map(p=>p[axis])),hi=Math.max(...points.map(p=>p[axis]));return [Math.min(lo,(lo+hi)/2-.25*SCALE),Math.max(hi,(lo+hi)/2+.25*SCALE)];});
    points=bounds[0].flatMap(x=>bounds[1].flatMap(y=>bounds[2].map(z=>({x,y,z}))));
   }
   let shape=body.createHull({points,maxVertices:32,density:0,...PLASTIC,filter:{categoryBits:1,maskBits:4}});
   if(!shape.isValid()){
    shape.delete();
    // A nearly planar edge cell can be thinner than the hull solver's
    // tolerance. Give only that local cell a minimum 0.5 mm thickness.
    const axes=['x','y','z'] as const;
    const bounds=axes.map(a=>{const lo=Math.min(...points.map(p=>p[a])),hi=Math.max(...points.map(p=>p[a]));return [Math.min(lo,(lo+hi)/2-.25*SCALE),Math.max(hi,(lo+hi)/2+.25*SCALE)];});
    const box=bounds[0].flatMap(x=>bounds[1].flatMap(y=>bounds[2].map(z=>({x,y,z}))));
    shape=body.createHull({points:box,maxVertices:8,density:0,...PLASTIC,filter:{categoryBits:1,maskBits:4}});
   }
   if(!shape.isValid()){shape.delete();body.destroy();body.delete();throw new Error(`Invalid ${kind} collision patch`);}shape.delete();
  }
  detailed.add(id);
 };
 const add=(id:number,kind:string,position:V3,rotation:Quaternion,fixed:boolean,state:{awake?:boolean;rotorRotation?:number[]}={})=>{
  const awake=state.awake??true;
  remove(id);const body=world.createBody({type:fixed?'static':'dynamic',position:{x:position[0]*SCALE,y:position[1]*SCALE,z:position[2]*SCALE},rotation,angularDamping:.2,linearDamping:.05,isAwake:awake,enableContactRecycling:false});
  addEnvelopes(body,kind);bodies.set(id,body);kinds.set(id,{kind,fixed});dirtyPoses.add(id);
  if(!options.packing&&(fixed||balls.size))ensureDetailed(id);
  if(kind==='paddle'||kind==='start'){
   attachWheel(id,body,position,rotation,kind);const wheel=wheels.get(id)!;
   if(state.rotorRotation)wheel.body.setTransform(wheel.body.getPosition(),rotation.clone().multiply(new Quaternion(...state.rotorRotation)));
   if(!awake)wheel.body.setAwake(false);
  }
  if(!awake&&!fixed)body.setAwake(false);
  return body;
 };
 const beginCarry=(id:number)=>{
  const parent=bodies.get(id);if(!parent)return;
  wakeNeighbors(id);parent.setType('kinematic');
  const wheel=wheels.get(id),q=parent.getRotation();
  const relative=wheel?new Quaternion(q.x,q.y,q.z,q.w).invert().multiply(wheelPose(id)!.rotation):undefined;
  // Like manual dragging, a scripted pickup leaves the contact simulation.
  // Its cleared flight path controls motion; it must not launch the pile with
  // infinite-mass kinematic impacts when the animation is sped up.
  parent.setEnabled(false);
  if(wheel){wheel.body.setType('kinematic');wheel.body.setEnabled(false);}
  return relative;
 };
 const carry=(id:number,position:Vector3,rotation:Quaternion,relative?:Quaternion)=>{
  const parent=bodies.get(id);if(!parent)return;
  parent.setTransform(position.clone().multiplyScalar(SCALE),rotation);dirtyPoses.add(id);
  const wheel=wheels.get(id);
  if(wheel){
   const pivot=wheel.kind==='start'?new Vector3(START.pivotX,START.pivotY,0):new Vector3(PADDLE.x,paddleAxleY,PADDLE.z);
   wheel.body.setTransform(pivot.applyQuaternion(rotation).add(position).multiplyScalar(SCALE),rotation.clone().multiply(relative??new Quaternion()));
  }
 };
 const closeGate=(id:number)=>{
  const gate=wheels.get(id),parent=bodies.get(id);if(gate?.kind!=='start'||!parent)return false;
  const q=parent.getRotation(),rotation=new Quaternion(q.x,q.y,q.z,q.w);
  const p=new Vector3(START.pivotX,START.pivotY,0).applyQuaternion(rotation).add(ballPosition(parent)).multiplyScalar(SCALE);
  gate.joint.setLimits(0,0);gate.joint.setMotorSpeed(0);gate.body.setTransform(p,rotation);gate.body.setLinearVelocity({x:0,y:0,z:0});gate.body.setAngularVelocity({x:0,y:0,z:0});gate.body.setAwake(true);return true;
 };
 const releaseGate=(id:number)=>{
  const gate=wheels.get(id);if(gate?.kind!=='start')return [];
  const pose=wheelPose(id)!,inverse=pose.rotation.clone().invert();
  const released=marbleStates().filter(m=>{
   const p=m.position.clone().sub(pose.position).applyQuaternion(inverse);
   for(let lane=0;lane<START.lanes;lane++)if(gateSlotOccupied([p],lane))return true;
   return false;
  }).map(m=>m.id);
  gate.joint.setLimits(START.releaseAngle,0);gate.joint.setMotorSpeed(-1.2);gate.body.setAwake(true);
  return released;
 };
 const fillGate=(id:number)=>{
  if(!closeGate(id))return 0;
  const gate=wheelPose(id)!,inverse=gate.rotation.clone().invert(),points=marblePositions().map(p=>p.sub(gate.position).applyQuaternion(inverse)),colors=shuffledMarbleColors();let count=0;
  for(let lane=0;lane<START.lanes;lane++)if(!gateSlotOccupied(points,lane)){
   const p=new Vector3(-8,24,(lane-(START.lanes-1)/2)*START.lanePitch).applyQuaternion(gate.rotation).add(gate.position);
   if(dropMarble(p.toArray(),colors[lane]))count++;
  }
  return count;
 };
 const wakeTubContents=()=>{
   const pose=tub.pose(),bounds=new Box3(new Vector3(-320,-1,-210),new Vector3(320,800,210)).applyMatrix4(new Matrix4().compose(pose.position,pose.rotation,new Vector3(1,1,1)));
   for(const [id,b] of bodies)if(!kinds.get(id)!.fixed&&bounds.intersectsBox(bodyBounds(id))){b.setAwake(true);wheels.get(id)?.body.setAwake(true);}
   for(const m of balls.values())if(bounds.containsPoint(ballPosition(m.body)))m.body.setAwake(true);
 };
 const cameraObstructionDistance=(camera:Vector3,subject:Vector3)=>{
  const travel=subject.clone().sub(camera),length=travel.length();
  if(length<ASSEMBLY_MARBLE_RADIUS)return Infinity;
  const rayLength=length-ASSEMBLY_MARBLE_RADIUS*.8;
  travel.multiplyScalar(rayLength/length*SCALE);
  const hit=world.castRayClosest(camera.clone().multiplyScalar(SCALE),travel,{categoryBits:4,maskBits:1});
  const distance=hit.hit?hit.fraction*rayLength:Infinity;hit.shape?.delete();return distance;
 };
 const pose=(id:number)=>{const b=bodies.get(id);if(!b)return;const p=b.getPosition(),q=b.getRotation();return {position:new Vector3(p.x/SCALE,p.y/SCALE,p.z/SCALE),rotation:new Quaternion(q.x,q.y,q.z,q.w).normalize(),awake:b.isAwake(),angularSpeed:Math.hypot(...Object.values(b.getAngularVelocity())),speed:Math.hypot(...Object.values(b.getLinearVelocity()))};};
 // The renderer consumes this once per frame. Read the final sleeping pose,
 // then leave its buffers alone until wake-up, replacement or scripted motion.
 const poseIfChanged=(id:number)=>{
  const b=bodies.get(id);if(!b)return;
  const awake=b.isAwake();
  if(!awake&&!dirtyPoses.has(id)&&!movingPoses.has(id))return;
  dirtyPoses.delete(id);if(awake)movingPoses.add(id);else movingPoses.delete(id);
  return pose(id);
 };
 return {pose,poseIfChanged,tubPose:tub.pose,restoreTub:tub.restore,beginTubTip:()=>{wakeTubContents();tub.begin();},dumpTub:()=>{
   if(tub.pose().dumping)return false;
   // Carry the shell above any assembled tracks already on the carpet.
   let clearance=750;for(const [id,p] of kinds)if(p.fixed)clearance=Math.max(clearance,bodyBounds(id).max.y+450);
   if(!tub.dump(clearance))return false;wakeTubContents();return true;
  },setTubTipTarget:tub.target,endTubTip:tub.release,clearMarbles,removeMarble,add,remove,bodyBounds,beginCarry,carry,wheelPose,fillGate,releaseGate,closeGate,marbleStates,registerSurface,dropMarble,marblePositions,
  // Query detailed track surfaces; ignore marbles and the packing envelopes.
  cameraObstructionDistance,
  profile:()=>(world as typeof world&{getProfile():{step:number;pairs:number;collide:number;solve:number}}).getProfile(),
  clearCameraView:(camera:Vector3,subject:Vector3)=>cameraObstructionDistance(camera,subject)===Infinity,
  tubContains(points:Vector3[]){
   // In the packing world category 1 is just the tub and ground. Radial
   // probes start in the open cavity and detect crossings of its actual mesh,
   // including the rounded floor, tapered walls and inward molding ribs.
   if(!options.packing)throw new Error('Containment audit requires the packing world');
   for(const p of points){const origin=new Vector3(STORAGE_TUB.position[0],Math.max(STORAGE_TUB.position[1]+20,p.y),STORAGE_TUB.position[2]);
    const hit=world.castRayClosest(origin.clone().multiplyScalar(SCALE),p.clone().sub(origin).multiplyScalar(SCALE),{categoryBits:4,maskBits:1});hit.shape?.delete();if(hit.hit)return false;
   }return true;
  },step:()=>{
   tub.step();
   for(const m of balls.values()){m.previous.copy(ballPosition(m.body));const q=m.body.getRotation();m.previousRotation.set(q.x,q.y,q.z,q.w);}
   world.step(SOLVER_STEP,PHYSICS_SUBSTEPS);world.step(SOLVER_STEP,PHYSICS_SUBSTEPS);
   for(const [id,m] of balls){m.age+=ASSEMBLY_STEP;if(m.age>60||m.body.getPosition().y< -100*SCALE)removeMarble(id);}
  },
  dispose(){clearMarbles();for(const id of bodies.keys())remove(id);tub.dispose();rug.destroy();rug.delete();floor.destroy();floor.delete();world.destroy();world.delete();for(const parts of surfaces.values())for(const data of parts)data.delete();}};
}
