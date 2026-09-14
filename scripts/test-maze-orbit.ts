import assert from 'node:assert/strict';
import {Box3,PerspectiveCamera,Spherical,Vector3} from 'three/webgpu';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createMazeOrbit} from '../src/assembly/maze-orbit';

const snapshots=new Map<number,Vector3>();
for(const aspect of [16/9,1,9/16])for(const sign of [-1,1])for(const fps of [30,60,120]){
 const camera=new PerspectiveCamera(42,aspect,1,30000),controls=new OrbitControls(camera);
 controls.minDistance=100;controls.maxDistance=3000;controls.maxPolarAngle=Math.PI*.49;
 const bounds=new Box3(new Vector3(-950,0,100),new Vector3(-350,650,800));
 controls.target.set(-500,29,200);
 const initial=new Spherical(350,.68,1.6),previous=new Spherical(350-2/60,.68-.002/60,1.6-sign*.015/60);
 camera.position.copy(controls.target).add(new Vector3().setFromSpherical(initial));
 const previousTarget=controls.target.clone().sub(new Vector3(10,-1,4).divideScalar(60));
 const initialCamera=camera.position.clone(),initialTarget=controls.target.clone();
 const orbit=createMazeOrbit(camera,controls,bounds,{position:previousTarget.clone().add(new Vector3().setFromSpherical(previous)),target:previousTarget,dt:1/60});
 assert(camera.position.equals(initialCamera)&&controls.target.equals(initialTarget),'Overview acquisition snapped');
 let lastAngle=initial.theta,lastRadius=initial.radius;
 for(let frame=1;frame<=20*fps;frame++){
  const t=frame/fps;orbit.update(1/fps);controls.update();camera.updateMatrixWorld();
  const pose=new Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  if(frame===1){
   assert(camera.position.distanceTo(initialCamera)<1,'First overview frame jumps');
   assert(controls.target.clone().sub(initialTarget).multiplyScalar(fps).distanceTo(new Vector3(10,-1,4))<1,'Handoff loses incoming target velocity');
  }
  const delta=Math.atan2(Math.sin(pose.theta-lastAngle),Math.cos(pose.theta-lastAngle));
  assert(delta*sign>0,'Overview reversed its incoming orbit');
  assert(Math.abs(delta)*fps<=.501,'Overview exceeds its planned orbit speed');
  assert(pose.radius>=lastRadius-1e-7,'Pullback pumps the zoom');
  if(t>3.3){
   assert(controls.target.distanceTo(bounds.getCenter(new Vector3()))<1e-7,'Orbit is not centered on the whole maze');
   assert(Math.abs(pose.radius-orbit.radius)<1e-7,'Zoom changes during the wide orbit');
   assert(Math.abs(Math.abs(delta)*fps-.5)<1e-6,'Wide orbit is not faster and steady');
   for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
    const p=new Vector3(x,y,z).project(camera);
    assert(Math.abs(p.x)<.84&&Math.abs(p.y)<.74&&p.z<1,`Whole-maze orbit clips the structure: aspect ${aspect}, time ${t}, NDC ${p.toArray()}`);
   }
  }
  if(aspect===16/9&&sign===1&&frame%fps===0){
   if(fps===30)snapshots.set(t,camera.position.clone());
   else assert(camera.position.distanceTo(snapshots.get(t)!)<1e-7,'Overview path depends on frame rate');
  }
  lastRadius=pose.radius;lastAngle=pose.theta;
 }
 assert(orbit.radius>initial.radius*3,'Overview did not pull back enough to reveal the maze');
 controls.dispatchEvent({type:'start'});
 controls.target.set(20,30,40);camera.position.set(100,200,300);
 orbit.update(1);assert(!orbit.automatic&&camera.position.equals(new Vector3(100,200,300))&&controls.target.equals(new Vector3(20,30,40)),'Overview fights manual control');
 orbit.dispose();
}
console.log('Maze overview: continuous handoff, fixed full-maze framing, faster steady orbit, manual control, and 30/60/120 fps agreement passed');
