import assert from 'node:assert/strict';
import {PerspectiveCamera,Quaternion,Spherical,Vector3} from 'three/webgpu';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createMarbleFollow} from '../src/assembly/marble-follow';
import {createOrbitSlew} from '../src/assembly/orbit-slew';
import {FINISH,finishFloor} from '../src/pieces/finish';
import {PART_UNITS} from '../src/pieces/marbleworks-spec';
import {createAssemblyPhysics} from '../src/assembly/physics';
import recordedRun from '../tests/fixtures/marble-camera-run.json';

function rig(){
 const camera=new PerspectiveCamera(42,1.8,1,30000);camera.position.set(300,450,600);
 const controls=new OrbitControls(camera);controls.target.set(0,50,0);controls.minDistance=100;controls.maxDistance=3000;controls.maxPolarAngle=Math.PI*.49;controls.update();
 const follow=createMarbleFollow(camera,controls);
 return {camera,controls,follow,target:controls.target,step(marbles:{id:number;position:Vector3}[],dt:number){follow.update(marbles,dt);controls.update(dt);}};
}
const angleDifference=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const results:{target:Vector3;camera:Vector3}[]=[];
for(const fps of [30,60,120]){
 const {camera,controls,follow,target,step}=rig(),marble={id:7,position:new Vector3(-500,240,50)};
 const initialTarget=target.clone(),initialCamera=camera.position.clone(),initialDistance=camera.position.distanceTo(target);
 follow.start(marble.id);
 assert(target.equals(initialTarget)&&camera.position.equals(initialCamera),'Acquisition snapped the camera');
 step([marble],1/fps);
 assert(target.distanceTo(initialTarget)<initialTarget.distanceTo(marble.position)*.09,'First follow frame jumps');
 assert(initialDistance-camera.position.distanceTo(target)<initialDistance*.01,'First frame snaps the zoom');
 for(let i=1;i<fps*8;i++)step([marble],1/fps);
 assert(target.distanceTo(marble.position)<.001,'Target never reached marble');
 assert(Math.abs(camera.position.distanceTo(target)-2*PART_UNITS.portSpan)<.01,'Camera did not reach close framing');
 assert(controls.getPolarAngle()<Math.PI*.2,'Travel view is too low to look into the channels');
 results.push({target:target.clone(),camera:camera.position.clone()});
 const firstAngle=controls.getAzimuthalAngle();
 for(let i=0;i<fps*4;i++){
  marble.position.x+=150/fps;
  step([{id:8,position:new Vector3(999,999,999)},marble],1/fps);
 }
 assert.equal(follow.id,7,'Changed marble when array order changed');
 assert(Math.abs(angleDifference(controls.getAzimuthalAngle(),firstAngle))>.5,'Moving marble did not drive an orbit');
 assert(target.distanceTo(marble.position)<24,'Following lags too far behind');
 // Input takes over immediately, even before automatic zoom has completed.
 follow.start(marble.id);controls.dispatchEvent({type:'start'});
 const editedOrbit=new Vector3(-120,200,100);camera.position.copy(target).add(editedOrbit);controls.update();
 for(let i=0;i<fps*2;i++){
  marble.position.x+=1;
  step([marble],1/fps);
  assert(camera.position.clone().sub(target).distanceTo(editedOrbit)<1e-8,'Camera fought manual orbit/zoom');
 }
 assert(!follow.automatic&&follow.id===7,'Manual input stopped target following');
 const beforeRemoval=target.clone(),beforeCamera=camera.position.clone();step([],1/fps);
 assert.equal(follow.id,undefined);assert(target.distanceTo(beforeRemoval)<1e-8&&camera.position.distanceTo(beforeCamera)<1e-8,'Removed marble reset view');
 follow.dispose();
}
assert(results[0].target.distanceTo(results[2].target)<1e-8&&results[0].camera.distanceTo(results[2].camera)<1,'Stationary acquisition depends on frame rate');

// Finish direction must come from the placed piece, not a hard-coded world
// azimuth. Keep testing the angle wrap on either side of +/- pi, too.
for(const yaw of [0,.8,-1.5,Math.PI-.01,Math.PI+.01]){
 const {camera,controls,follow,target,step}=rig();
 const finish={id:17,position:new Vector3(640,94,-410),rotation:new Quaternion().setFromAxisAngle(new Vector3(0,1,0),yaw)};
 const toWorld=(p:Vector3)=>p.applyQuaternion(finish.rotation).add(finish.position);
 const local=new Vector3(FINISH.laneEnd-10,finishFloor(FINISH.laneEnd-10)+7.95,0);
 const marble={id:3,position:toWorld(local.clone().add(new Vector3(0,300,0)))};
 follow.start(marble.id,[finish]);
 for(let i=0;i<120;i++)step([marble],1/60);
 assert.equal(follow.finishId,undefined,'An upper track above the finish triggered arrival');
 // Descend continuously into the finish; no camera jump at arrival.
 for(let i=1;i<=180;i++){
  marble.position.copy(toWorld(local.clone().add(new Vector3(0,300*(1-i/180),0))));
  const previous=camera.position.clone();step([marble],1/60);
  assert(camera.position.distanceTo(previous)<12,'Finish transition snapped');
 }
 for(let i=0;i<600;i++)step([marble],1/60);
 assert.equal(follow.finishId,finish.id,'Did not recognize the finish lane');
 const front=new Vector3(1,0,0).applyQuaternion(finish.rotation),horizontal=camera.position.clone().sub(target).setY(0).normalize();
 assert(horizontal.dot(front)>.99999,'Final view is not looking from the front of the rotated finish');
 const restingCamera=camera.position.clone();for(let i=0;i<120;i++)step([marble],1/60);
 assert(camera.position.distanceTo(restingCamera)<.05,`Camera keeps orbiting at the finish: ${yaw}, ${camera.position.distanceTo(restingCamera)} mm`);
 // A new release reacquires auto framing; stop leaves the current view intact.
 follow.start(marble.id);assert(follow.automatic&&follow.finishId===undefined);follow.stop();
 const stopped=camera.position.clone();step([marble],1/60);assert(camera.position.distanceTo(stopped)<1e-8);follow.dispose();
}
// The gate approach happens during the last placements and flows into follow
// without restarting the camera springs or reversing its ongoing orbit.
for(const fps of [30,120]){
 const {camera,controls,follow,target,step}=rig();
 controls.autoRotate=true;controls.autoRotateSpeed=.75;
 const gate=new Vector3(80,620,-60),before=camera.position.clone();
 follow.approachGate(gate,new Vector3(0,20,0));controls.autoRotate=false;
 assert(follow.approachingGate&&follow.id===undefined&&camera.position.equals(before));
 for(let i=0;i<fps*3.25;i++)step([],1/fps);
 assert(target.distanceTo(gate)<5&&camera.position.distanceTo(target)<2*PART_UNITS.portSpan+5,'Gate approach did not prepare close framing');
 const angle=controls.getAzimuthalAngle(),distance=camera.position.distanceTo(target),position=camera.position.clone(),focus=target.clone();
 const ball={id:31,position:gate.clone().add(new Vector3(8,-12,0))};
 follow.start(ball.id);
 assert(!follow.approachingGate&&follow.id===31&&camera.position.equals(position)&&target.equals(focus),'Gate release snapped the camera');
 step([ball],1/fps);
 assert(Math.abs(camera.position.distanceTo(target)-distance)<.5,'Release restarted zoom');
 assert(angleDifference(controls.getAzimuthalAngle(),angle)<0,'Release reversed the camera orbit');
 for(let i=0;i<fps;i++){ball.position.x+=100/fps;step([ball],1/fps);}
 assert(angleDifference(controls.getAzimuthalAngle(),angle)<-.03,'Follow lost the approach orbit direction');
 assert(target.distanceTo(ball.position)<20,'Approach handoff did not tighten tracking');follow.dispose();
}
const layerTarget=new Vector3(),camera={position:new Vector3(200,300,400)},slew=createOrbitSlew(camera,layerTarget,4),goal=new Vector3(0,47,0);
slew.update(goal,1/60);assert(layerTarget.y>0&&layerTarget.y<1,'A layer change snapped camera upward');
for(let i=0;i<240;i++)slew.update(goal,1/60);
assert(layerTarget.distanceTo(goal)<.001,'Construction slew did not converge');
assert(camera.position.clone().sub(layerTarget).distanceTo(new Vector3(200,300,400))<1e-8);
console.log('Marble camera: close framing, gate handoff, continuous orbit, manual takeover, rotated finish, stable rest and FPS independence passed');

// Start/stop motion must not repeatedly reverse the orbit.
// Measure the final rendered camera, rather than only testing planner goals.
for(const fps of [30,60,120]){
 const {camera,controls,follow,target,step}=rig(),marble={id:8,position:new Vector3(0,50,0)};
 camera.position.copy(target).add(new Vector3().setFromSpherical(new Spherical(2*PART_UNITS.portSpan,Math.PI*.16,0)));controls.update();
 follow.start(marble.id);
 let angle=controls.getAzimuthalAngle(),velocity=0,peakSpeed=0,peakAcceleration=0;
 for(let i=0;i<fps*12;i++){
  const t=(i+1)/fps;marble.position.x=8*Math.sin(t*8);marble.position.z=8*Math.cos(t*7);
  step([marble],1/fps);
  const next=controls.getAzimuthalAngle(),v=angleDifference(next,angle)*fps;
  peakSpeed=Math.max(peakSpeed,Math.abs(v));peakAcceleration=Math.max(peakAcceleration,Math.abs(v-velocity)*fps);
  assert(v>=-1e-6,'Occlusion or marble motion reversed the orbit');angle=next;velocity=v;
 }
 assert(peakSpeed<.2&&peakAcceleration<.36,`Frantic orbit at ${fps} fps: ${peakSpeed} rad/s, ${peakAcceleration} rad/s²`);
 follow.dispose();
}
const sim=await createAssemblyPhysics(),data=await Bun.file('src/generated/spacer-collision.json').json();
sim.registerSurface('spacer',data.parts??[data]);sim.add(1,'spacer',[0,0,0],new Quaternion(),true);
assert(!sim.clearCameraView(new Vector3(-100,20,0),new Vector3(0,20,0)),'Physics view query misses the connector wall');
assert(sim.clearCameraView(new Vector3(-100,100,0),new Vector3(0,100,0)),'Physics view query blocks empty air');
sim.dispose();console.log('Camera visibility query still detects real collider obstructions');

// Replay the recorded Tangled Garden descent and assert framing relative to
// the marble throughout the route. Smooth angular motion alone did not catch
// the camera staying above the maze and becoming vertical during descent.
// Fixture: preset export seed 20260913, sampled at 10 Hz; units are mm.
for(const fps of [30,60,120]){
 const {camera,controls,follow,target,step}=rig();
 camera.position.fromArray(recordedRun.camera);target.fromArray(recordedRun.target);
 controls.autoRotate=true;controls.autoRotateSpeed=.75;
 const finishes=recordedRun.finishes.map(f=>({id:f.id,position:new Vector3().fromArray(f.position),rotation:new Quaternion().fromArray(f.rotation)}));
 follow.start(3,finishes);controls.autoRotate=false;
 const ball={id:3,position:new Vector3()},last=new Spherical().setFromVector3(camera.position.clone().sub(target));
 let segment=0,angularVelocity=0,peakAngularSpeed=0,peakAngularAcceleration=0,peakPolarSpeed=0,peakZoomSpeed=0;
 const samples=recordedRun.samples,duration=samples[samples.length-1][0];
 for(let frame=1;frame<=duration*fps;frame++){
  const t=frame/fps;
  while(segment<samples.length-2&&samples[segment+1][0]<t)segment++;
  const a=samples[segment],b=samples[segment+1];
  ball.position.set(a[1],a[2],a[3]).lerp(new Vector3(b[1],b[2],b[3]),Math.min(1,(t-a[0])/(b[0]-a[0])));
  step([ball],1/fps);
  const pose=new Spherical().setFromVector3(camera.position.clone().sub(target));
  const v=angleDifference(pose.theta,last.theta)*fps;
  // Acquisition inherits the previous shot; measure after its first second.
  if(t>1){
   peakAngularSpeed=Math.max(peakAngularSpeed,Math.abs(v));
   peakAngularAcceleration=Math.max(peakAngularAcceleration,Math.abs(v-angularVelocity)*fps);
   peakPolarSpeed=Math.max(peakPolarSpeed,Math.abs(pose.phi-last.phi)*fps);
   peakZoomSpeed=Math.max(peakZoomSpeed,Math.abs(pose.radius-last.radius)*fps);
   assert(pose.phi>.45&&pose.phi<.72,`View became overhead or too low at ${fps} fps, ${t}s`);
   assert(pose.radius<355,`Camera pulled away from the descending marble at ${t}s`);
   assert(camera.position.y-target.y<300,`Camera hovered above the maze at ${t}s`);
  }
  angularVelocity=v;last.copy(pose);
 }
 assert(peakAngularSpeed<.21&&peakAngularAcceleration<.36,`Orbit became frantic at ${fps} fps`);
 assert(peakPolarSpeed<.11&&peakZoomSpeed<55,`Sudden height/zoom change at ${fps} fps: ${peakPolarSpeed}, ${peakZoomSpeed}`);
 const front=new Vector3(1,0,0).applyQuaternion(finishes[0].rotation);
 assert(camera.position.clone().sub(target).setY(0).normalize().dot(front)>.998,'Recorded run ends on the wrong side of the finish');
 follow.dispose();
}
console.log('Recorded maze run: bounded angular motion, gradual elevation and zoom, consistent height above the marble, and front finish at 30/60/120 fps passed');
