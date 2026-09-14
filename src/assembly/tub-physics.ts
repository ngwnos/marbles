import {Quaternion,Vector3} from 'three/webgpu';
import type {World,MeshGeometry} from 'box3d-wasm/standard';
import {PLASTIC} from '../contact-materials';
import {MM_TO_PHYSICS as SCALE,ASSEMBLY_STEP} from '../physics-settings';
import collision from '../generated/storage-tub-collision.json';
import envelopes from '../generated/storage-tub-envelopes.json';
import {tubLocalPivot,tubWorldPivot,tubUprightRotation,tubPoseAtAngle,TUB_MAX_TIP} from './tub-motion';
import {createTubDumpMotion,TUB_DUMP_DURATION} from './tub-dump';

export type TubState={angle:number;awake:boolean};
export function createTubPhysics(world:World,Mesh:new(options:{vertices:Float32Array;indices:Uint32Array})=>MeshGeometry,packing=false){
 const start=tubPoseAtAngle(0),body=world.createBody({type:packing?'static':'dynamic',position:start.position.clone().multiplyScalar(SCALE),rotation:start.rotation,isAwake:false,enableContactRecycling:false});
 const mesh=new Mesh({vertices:Float32Array.from(collision.vertices,v=>v*SCALE),indices:Uint32Array.from(collision.indices)});
 const surface=body.createMesh(mesh,{density:0,...PLASTIC,filter:{categoryBits:1,maskBits:4}});if(!surface.isValid())throw new Error('Invalid tub surface');surface.delete();
 let shellVolume=0;const a=new Vector3(),b=new Vector3(),c=new Vector3();
 for(let i=0;i<collision.indices.length;i+=3){a.fromArray(collision.vertices,collision.indices[i]*3);b.fromArray(collision.vertices,collision.indices[i+1]*3);c.fromArray(collision.vertices,collision.indices[i+2]*3);shellVolume+=a.dot(b.cross(c))/6;}
 const density=.95*Math.abs(shellVolume)/envelopes.reduce((v,h)=>v+h.volume,0);
 for(const hull of envelopes){const points=[];for(let i=0;i<hull.vertices.length;i+=3)points.push({x:hull.vertices[i]*SCALE,y:hull.vertices[i+1]*SCALE,z:hull.vertices[i+2]*SCALE});
  const shape=body.createHull({points,maxVertices:points.length,density,...PLASTIC,filter:{categoryBits:16,maskBits:1|8}});if(!shape.isValid())throw new Error('Invalid tub envelope');shape.delete();
 }
 const anchor=packing?undefined:world.createBody({type:'static',position:tubWorldPivot.clone().multiplyScalar(SCALE),rotation:tubUprightRotation});
 // Box3D revolves around each joint frame's Z axis; align it with the tub's
 // local X axis (the long bottom edge). Both frames need the same alignment.
 const frame={rotation:new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI/2)};
 const joint=anchor?world.createRevoluteJoint(anchor,body,{localFrameA:frame,localFrameB:frame,anchorA:{x:0,y:0,z:0},anchorB:tubLocalPivot.clone().multiplyScalar(SCALE),enableMotor:false,enableSpring:false,hertz:12,dampingRatio:1,enableLimit:true,lowerAngle:0,upperAngle:TUB_MAX_TIP,collideConnected:false}):undefined;
 let held=false,target=0,driven=0;
 let dump:{time:number;motion:ReturnType<typeof createTubDumpMotion>;landing?:boolean}|undefined;
 const pose=()=>{const p=body.getPosition(),q=body.getRotation();return {position:new Vector3(p.x/SCALE,p.y/SCALE,p.z/SCALE),rotation:new Quaternion(q.x,q.y,q.z,q.w).normalize(),angle:joint?.getAngle()??0,awake:body.isAwake(),held,dumping:!!dump,angularSpeed:Math.hypot(...Object.values(body.getAngularVelocity()))};};
 const release=()=>{const wasHeld=held;held=false;joint?.enableSpring(false);if(wasHeld)body.setAwake(true);};
 const restore=(state:TubState)=>{release();const p=tubPoseAtAngle(Math.max(0,Math.min(TUB_MAX_TIP,state.angle)));body.setTransform(p.position.multiplyScalar(SCALE),p.rotation);if(dump){dump=undefined;body.setType('dynamic');}body.setLinearVelocity({x:0,y:0,z:0});body.setAngularVelocity({x:0,y:0,z:0});body.setAwake(state.awake);};
 return {pose,restore,begin(){if(!joint||dump)return;target=driven=pose().angle;held=true;body.setAwake(true);joint.setTargetAngle(target);joint.enableSpring(true);},
  dump(clearance?:number){
   if(packing||dump)return false;
   release();dump={time:0,motion:createTubDumpMotion(pose(),clearance)};
   // A static/kinematic joint pair is inactive. The original hinge resumes
   // when the tub lands and becomes dynamic again; no colliders are replaced.
   body.setType('kinematic');body.setAwake(true);return true;
  },
  target(angle:number){target=Math.max(0,Math.min(TUB_MAX_TIP,angle));},release,
  step(){
   if(dump){
    if(dump.time>=TUB_DUMP_DURATION){dump=undefined;return;}
    dump.time=Math.min(TUB_DUMP_DURATION,dump.time+ASSEMBLY_STEP);
    // Land with finite mass so a stray piece can resist or deflect the tub.
    // A kinematic floor pressing onto a piece cannot yield to its contacts.
    if(dump.time>=TUB_DUMP_DURATION-.2){
     if(!dump.landing){dump.landing=true;body.setType('dynamic');body.setLinearVelocity({x:0,y:0,z:0});body.setAngularVelocity({x:0,y:0,z:0});body.setAwake(true);}
     return;
    }
    const next=dump.motion(dump.time);
    // Target velocities move the physical shell through every solver substep,
    // so contacts transfer its motion to the pieces rather than teleporting it.
    body.setTargetTransform({position:next.position.multiplyScalar(SCALE),rotation:next.rotation},ASSEMBLY_STEP,true);
   }else if(held&&joint){driven+=Math.max(-2.5*ASSEMBLY_STEP,Math.min(2.5*ASSEMBLY_STEP,target-driven));joint.setTargetAngle(driven);body.setAwake(true);}
  },
  dispose(){body.destroy();body.delete();joint?.delete();anchor?.destroy();anchor?.delete();mesh.delete();}
 };
}
