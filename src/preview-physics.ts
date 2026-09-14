import {addMarbleShapes,PLASTIC} from './contact-materials';
import {CONTACT_HERTZ,PHYSICS_SUBSTEPS,MM_TO_PHYSICS,GRAVITY_MM,MARBLE_RADIUS_MM,SOLVER_STEP} from './physics-settings';
import {shuffledMarbleColors} from './marble-colors';
import {gateSlotOccupied} from './gate-slots';
import * as THREE from 'three/webgpu';
import initBox3D from './vendor/box3d/box3d.mjs';
import type {Body,MeshGeometry,Joint} from 'box3d-wasm/standard';
import startHulls from './generated/start-hulls.json';
import {START} from './pieces/start';
import wheelHulls from './generated/paddle-colliders.json';

// One simulation unit = 16 mm. Keeps collision tolerances small relative to a marble.
export const PHYSICS_SCALE=MM_TO_PHYSICS, MARBLE_RADIUS=MARBLE_RADIUS_MM, FIXED_STEP=SOLVER_STEP;
const engine=initBox3D();
import {DROP_PORTS,type ComponentKind} from './drop-ports';
export {DROP_PORTS,type ComponentKind} from './drop-ports';
const scaled=(p:THREE.Vector3)=>({x:p.x*PHYSICS_SCALE,y:p.y*PHYSICS_SCALE,z:p.z*PHYSICS_SCALE});
export async function createPreviewPhysics(root:THREE.Object3D,kind:ComponentKind) {
 const b3=await engine,world=new b3.World({gravity:{x:0,y:-GRAVITY_MM*PHYSICS_SCALE,z:0},contactHertz:CONTACT_HERTZ,enableSleep:true,enableContinuous:true});
 const track=world.createBody({type:'static',position:{x:0,y:0,z:0}}),meshData:MeshGeometry[]=[];
 let rotor:Body|undefined,joint:Joint|undefined,wheel:THREE.Mesh|undefined;
 root.updateMatrixWorld(true);
 const collisionLoaders={
 coil:()=>import('./generated/coil-collision.json'),'starter-funnel':()=>import('./generated/starter-funnel-collision.json'),coupler:()=>import('./generated/coupler-collision.json'),extension:()=>import('./generated/extension-collision.json'),start:()=>import('./generated/start-collision.json'),hairpin:()=>import('./generated/hairpin-collision.json'),passing:()=>import('./generated/passing-collision.json'),finish:()=>import('./generated/finish-collision.json'),split:()=>import('./generated/split-collision.json'),'jump-run':()=>import('./generated/jump-run-collision.json'),jump:()=>import('./generated/jump-collision.json'),landing:()=>import('./generated/landing-collision.json'),base:()=>import('./generated/base-collision.json'),bumper:()=>import('./generated/bumper-collision.json'),maze:()=>import('./generated/maze-collision.json'),paddle:()=>import('./generated/paddle-body-collision.json'),ramp:()=>import('./generated/ramp-collision.json'),
 funnel:()=>import('./generated/funnel-collision.json'),snake:()=>import('./generated/snake-collision.json'),
 intersection:()=>import('./generated/intersection-collision.json'),spacer:()=>import('./generated/spacer-collision.json'),
 };
 const collision=(await collisionLoaders[kind]()).default;
 const meshes:THREE.Mesh[]=[];root.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});
 wheel=meshes.find(mesh=>kind==='paddle'?mesh.name.includes('paddle wheel'):kind==='start'&&mesh.name==='start gate');
 const collisionParts='parts' in collision?collision.parts:[collision];
 for(const part of collisionParts){
  // Keep the complete connected surface so internal triangle edges retain
  // adjacency and cannot act like exposed lips under a rolling marble.
  const data=new b3.MeshGeometry({vertices:Float32Array.from(part.vertices,v=>v*PHYSICS_SCALE),indices:Uint32Array.from(part.indices)});meshData.push(data);
  const shape=track.createMesh(data,{...PLASTIC});
  if(!shape.isValid())throw new Error('Invalid track collider');shape.delete();

 }
 const initial=wheel?.position.clone(),initialRotation=wheel?.quaternion.clone();
 if(wheel&&initial){
  rotor=world.createBody({type:'dynamic',position:scaled(initial),rotation:initialRotation,angularDamping:.2,linearDamping:0});
  for(const hull of kind==='start'?startHulls:wheelHulls){const points=[];for(let i=0;i<hull.length;i+=3)points.push({x:hull[i]*PHYSICS_SCALE,y:hull[i+1]*PHYSICS_SCALE,z:hull[i+2]*PHYSICS_SCALE});
   const shape=rotor.createHull({points,maxVertices:points.length,density:1.2,...PLASTIC});
   if(!shape.isValid())throw new Error('Invalid wheel convex collider');shape.delete();
  }
  // A zero-speed, torque-limited motor models dry axle friction: it can
  // resist motion and hold at rest, but cannot drive the wheel.
  const bearingTorque=.04*rotor.getMass()*(GRAVITY_MM*PHYSICS_SCALE)*(1.6*PHYSICS_SCALE);
  joint=world.createRevoluteJoint(track,rotor,{...(kind==='start'?{enableLimit:true,lowerAngle:0,upperAngle:0}:{}),anchorA:scaled(initial),anchorB:{x:0,y:0,z:0},enableMotor:true,motorSpeed:0,maxMotorTorque:kind==='start'?rotor.getMass()*3000:bearingTorque,collideConnected:false});
 }
 const marbles:{body:Body,mesh:THREE.Mesh,age:number}[]=[];
 const group=new THREE.Group();
 const ballGeometry=new THREE.SphereGeometry(MARBLE_RADIUS,32,24);
 const material=new THREE.MeshPhysicalNodeMaterial({color:0xe44d2e,metalness:.05,roughness:.16,clearcoat:1});
 let accumulator=0,lastTime:number|undefined;
 const coloredMaterials=new Map<number,THREE.MeshPhysicalNodeMaterial>();
 function drop(port=0,color?:number){
  const p=new THREE.Vector3(...DROP_PORTS[kind][port]);
  if(marbles.some(m=>m.mesh.position.distanceTo(p)<MARBLE_RADIUS*2.1))return false;
  const body=world.createBody({type:'dynamic',position:scaled(p),angularDamping:0,linearDamping:0});
  addMarbleShapes(body,MARBLE_RADIUS*PHYSICS_SCALE);
  let chosen=material;if(color!==undefined){if(!coloredMaterials.has(color))coloredMaterials.set(color,material.clone());chosen=coloredMaterials.get(color)!;chosen.color.setHex(color);}
  const mesh=new THREE.Mesh(ballGeometry,chosen);mesh.position.copy(p);mesh.castShadow=true;group.add(mesh);marbles.push({body,mesh,age:0});return true;
 }
 function step(){world.step(FIXED_STEP,PHYSICS_SUBSTEPS);
  if(rotor&&wheel){wheel.position.copy(rotor.getPosition()).multiplyScalar(1/PHYSICS_SCALE);wheel.quaternion.copy(rotor.getRotation());}
  for(const m of marbles){m.age+=FIXED_STEP;m.mesh.position.copy(m.body.getPosition()).multiplyScalar(1/PHYSICS_SCALE);m.mesh.quaternion.copy(m.body.getRotation());}
 }
 function fill(){
  if(kind!=='start'||!rotor||!joint)return;
  joint.setLimits(0,0);joint.setMotorSpeed(0);rotor.setTransform(scaled(initial!),initialRotation!);rotor.setAngularVelocity({x:0,y:0,z:0});rotor.setLinearVelocity({x:0,y:0,z:0});rotor.setAwake(true);
  const points=marbles.map(m=>m.mesh.position.clone().sub(initial!).applyQuaternion(initialRotation!.clone().invert()));
  const colors=shuffledMarbleColors();
  for(let lane=0;lane<START.lanes;lane++)if(!gateSlotOccupied(points,lane))drop(lane,colors[lane]);
 }
 function release(){if(kind==='start'&&joint){joint.setLimits(START.releaseAngle,0);joint.setMotorSpeed(-1.2);rotor?.setAwake(true);}}
 function reset(){for(const m of marbles){m.body.destroy();m.body.delete();group.remove(m.mesh);}marbles.length=0;
  if(rotor&&wheel&&initial){rotor.setTransform(scaled(initial),initialRotation!);rotor.setAngularVelocity({x:0,y:0,z:0});rotor.setLinearVelocity({x:0,y:0,z:0});wheel.position.copy(initial);wheel.quaternion.copy(initialRotation!);}
  if(kind==='start'&&joint){joint.setLimits(0,0);joint.setMotorSpeed(0);}
  accumulator=0;lastTime=undefined;
 }
 return {group,drop,fill,release,reset,step,marbles,rotor,joint,
  update(time:number){if(lastTime!==undefined)accumulator+=Math.min((time-lastTime)/1000,.1);lastTime=time;
   while(accumulator>=FIXED_STEP){step();accumulator-=FIXED_STEP;}
   for(let i=marbles.length-1;i>=0;i--)if(marbles[i].mesh.position.y< -150||marbles[i].age>30){const m=marbles[i];m.body.destroy();m.body.delete();group.remove(m.mesh);marbles.splice(i,1);}
  },
  dispose(){reset();joint?.delete();rotor?.delete();track.delete();world.destroy();world.delete();meshData.forEach(d=>d.delete());ballGeometry.dispose();material.dispose();coloredMaterials.forEach(m=>m.dispose());group.removeFromParent();},
 };
}
