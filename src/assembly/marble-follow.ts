import {MathUtils,Quaternion,Spherical,Vector3} from 'three/webgpu';
import type {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createOrbitSlew} from './orbit-slew';
import {FINISH,finishFloor} from '../pieces/finish';
import {PART_UNITS,TRACK} from '../pieces/marbleworks-spec';

type Finish={id:number;position:Vector3;rotation:Quaternion};
type Spring={value:number;velocity:number};
const distance=2*PART_UNITS.portSpan;
const nearAngle=(angle:number,reference:number)=>reference+Math.atan2(Math.sin(angle-reference),Math.cos(angle-reference));
function advance(s:Spring,goal:number,dt:number,frequency=4){
 const offset=s.value-goal,impulse=(s.velocity+frequency*offset)*dt,decay=Math.exp(-frequency*dt);
 s.value=goal+(offset+impulse)*decay;s.velocity=(s.velocity-frequency*impulse)*decay;
}

// Angular speed and acceleration have physical limits even when the finish
// bearing changes quickly. Integrate in short steps for consistent 30/60 fps.
function advanceHeading(s:Spring,goal:number,dt:number){
 const steps=Math.ceil(dt*120),h=dt/steps;
 for(let i=0;i<steps;i++){
  const acceleration=MathUtils.clamp(4*(goal-s.value)-4*s.velocity,-.35,.35);
  const next=MathUtils.clamp(s.velocity+acceleration*h,-.4,.4);
  s.value+=(s.velocity+next)*.5*h;s.velocity=next;
 }
}

/** Close orbit while travelling; approach the finish from its lane's front.
 * User input releases the automatic framing, while target following continues.
 */
export function createMarbleFollow(camera:{position:Vector3},controls:OrbitControls){
 const target=controls.target;
 let id:number|undefined,finishes:Finish[]=[],arrived:number|undefined,manual=false,orbitGoal=0;
 const local=new Vector3(),direction=new Vector3(),inverse=new Quaternion(),spherical=new Spherical();
 let time=0;
 let gateFocus:Vector3|undefined,orbitSign=1;
 const response:Spring={value:14,velocity:0};
 const finishBlend:Spring={value:0,velocity:0};
 const radius:Spring={value:0,velocity:0},polar:Spring={value:0,velocity:0},azimuth:Spring={value:0,velocity:0},spin:Spring={value:0,velocity:0};
 const slew=createOrbitSlew(camera,target);
 const stop=()=>{id=undefined;finishes=[];arrived=undefined;gateFocus=undefined;time=0;finishBlend.value=finishBlend.velocity=0;slew.reset();};
 const acquire=()=>{
  spherical.setFromVector3(camera.position.clone().sub(target));
  radius.value=spherical.radius;polar.value=spherical.phi;azimuth.value=orbitGoal=spherical.theta;
  spin.value=controls.autoRotate?-controls.autoRotateSpeed*Math.PI/30:0;
  orbitSign=spin.value<0?-1:1;
  radius.velocity=polar.velocity=spin.velocity=0;azimuth.velocity=spin.value;
 };
 const interact=()=>{if(id!==undefined||gateFocus)manual=true;};
 controls.addEventListener('start',interact);
 return {
  get id(){return id;},
  get automatic(){return (id!==undefined||gateFocus!==undefined)&&!manual;},
  get approachingGate(){return gateFocus!==undefined;},
  get gateFramed(){return !!gateFocus&&target.distanceTo(gateFocus)<18&&radius.value<distance*1.3;},
  get finishId(){return arrived;},
  start(marbleId:number,finishPieces:Finish[]=[]){
   // Carry the approach's target velocity, zoom, and angular motion into the
   // marble shot. Starting a normal follow still acquires the existing view.
   if(gateFocus){gateFocus=undefined;time=0;}
   else{stop();acquire();response.value=14;response.velocity=0;}
   id=marbleId;finishes=finishPieces;manual=false;
   // Start the long orbit toward the eventual front view. Waiting until the
   // marble reaches the finish can otherwise demand a half-turn at the end.
   const destination=finishes.reduce<Finish|undefined>((nearest,f)=>!nearest||f.position.distanceToSquared(target)<nearest.position.distanceToSquared(target)?f:nearest,undefined);
   if(destination){
    direction.set(1,0,0).applyQuaternion(destination.rotation);
    const turn=nearAngle(Math.atan2(direction.x,direction.z),azimuth.value)-azimuth.value;
    if(Math.abs(turn)>.2)orbitSign=Math.sign(turn);
   }
  },
  approachGate(point:Vector3,velocity?:Vector3){
   stop();acquire();manual=false;gateFocus=point.clone();slew.reset(velocity);
   response.value=4;response.velocity=0;
  },
  moveGate(point:Vector3){gateFocus?.copy(point);},
  stop,
  dispose(){stop();controls.removeEventListener('start',interact);},
  update(marbles:{id:number;position:Vector3}[],dt:number){
   if((id===undefined&&!gateFocus)||dt<=0)return;
   const marble=marbles.find(m=>m.id===id),goal=gateFocus??marble?.position;
   if(!goal){stop();return;}
   if(!gateFocus)time+=dt;
   advance(response,gateFocus?4:14,dt);
   slew.update(goal,dt,response.value);
   if(manual)return;
   let finish:Finish|undefined,weight=0;
   for(const candidate of finishes){
    local.copy(goal).sub(candidate.position).applyQuaternion(inverse.copy(candidate.rotation).invert());
    // Distance to the running lane, in the piece's own coordinates. This
    // also works when the entire maze is translated, raised, or rotated.
    const x=MathUtils.clamp(local.x,0,FINISH.laneEnd),height=local.y-finishFloor(x);
    const lateral=Math.hypot(local.x-x,local.z);
    const onLane=local.x>=-10&&local.x<=FINISH.laneEnd+10&&Math.abs(local.z)<TRACK.channelInsideWidth/2&&height>0&&height<TRACK.channelDepth;
    if(onLane)arrived=candidate.id;
    const approach=(1-MathUtils.smoothstep(lateral,FINISH.width,2*PART_UNITS.portSpan))*(1-MathUtils.smoothstep(Math.abs(height),TRACK.channelDepth,3*PART_UNITS.stackRise));
    const blend=arrived===candidate.id?1:approach;
    if(blend>weight){weight=blend;finish=candidate;}
   }
   advance(finishBlend,weight,dt,2);weight=finishBlend.value;
   // The orbit has its own steady tempo, independent of bounces, slowdowns,
   // and visibility. Ease from the construction shot's angular velocity.
   advance(spin,orbitSign*(gateFocus ? .08 : .18),dt,2);
   orbitGoal+=spin.value*(1-weight)*dt;
   let heading=orbitGoal;
   if(finish){
    // The finish connector is at local x=0; the lane runs toward +X.
    // Put the camera beyond that end, looking back along the lane.
    direction.set(1,0,0).applyQuaternion(finish.rotation);
    heading+=weight*(nearAngle(Math.atan2(direction.x,direction.z),orbitGoal)-orbitGoal);
   }
   const heightDrift=.035*Math.sin(time*.45)*MathUtils.smoothstep(time,0,2)*(1-weight);
   const preferred={heading,polar:Math.PI*(.16+.06*weight)+heightDrift,radius:distance*(1+.25*weight)};
   advanceHeading(azimuth,nearAngle(heading,azimuth.value),dt);
   advance(radius,MathUtils.clamp(preferred.radius,controls.minDistance,controls.maxDistance),dt,gateFocus?4:2);
   advance(polar,MathUtils.clamp(preferred.polar,controls.minPolarAngle,controls.maxPolarAngle),dt,gateFocus?4:2);
   spherical.set(radius.value,polar.value,azimuth.value).makeSafe();
   // Translate the entire orbit with the slewed marble position, including Y.
   // An independent world-height constraint turns a descent into a top view.
   camera.position.copy(target).add(direction.setFromSpherical(spherical));
  },
 };
}
