import {Box3,MathUtils,PerspectiveCamera,Spherical,Vector3} from 'three/webgpu';
import type {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {constructionFrameDistance} from './construction-camera';

type PreviousPose={position:Vector3;target:Vector3;dt:number};
const transitionSeconds=3.2,orbitSpeed=.5;
const angle=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));

/** One continuous pullback into a faster, fixed-distance orbit of the maze. */
export function createMazeOrbit(camera:PerspectiveCamera,controls:OrbitControls,bounds:Box3,previous?:PreviousPose){
 const startTarget=controls.target.clone(),center=bounds.getCenter(new Vector3());
 const start=new Spherical().setFromVector3(camera.position.clone().sub(startTarget));
 const velocity=new Vector3();let radiusVelocity=0,polarVelocity=0,initialSpeed=0;
 if(previous&&previous.dt>0){
  velocity.copy(startTarget).sub(previous.target).divideScalar(previous.dt);
  const before=new Spherical().setFromVector3(previous.position.clone().sub(previous.target));
  radiusVelocity=(start.radius-before.radius)/previous.dt;
  polarVelocity=(start.phi-before.phi)/previous.dt;
  initialSpeed=angle(start.theta,before.theta)/previous.dt;
 }
 const speed=(Math.abs(initialSpeed)>.001?Math.sign(initialSpeed):1)*orbitSpeed;
 const polar=MathUtils.clamp(Math.PI*.3,controls.minPolarAngle,controls.maxPolarAngle),direction=new Vector3();
 let radius=Math.max(start.radius,controls.minDistance);
 // Fit all bearings up front so rotation never pumps the zoom. Use the same
 // corner/frustum calculation as construction, now including every layer.
 for(let i=0;i<72;i++){
  direction.setFromSpherical(new Spherical(1,polar,i*Math.PI/36));
  radius=Math.max(radius,constructionFrameDistance(camera,bounds,center,direction));
 }
 controls.maxDistance=Math.max(controls.maxDistance,radius);
 const spherical=new Spherical();let elapsed=0,manual=false;
 const interact=()=>{manual=true;};controls.addEventListener('start',interact);
 return {
  get elapsed(){return elapsed;},
  get automatic(){return !manual;},
  get center(){return center.clone();},
  get radius(){return radius;},
  dispose(){controls.removeEventListener('start',interact);},
  update(dt:number){
   if(manual||dt<=0)return;
   elapsed+=dt;
   const u=Math.min(elapsed/transitionSeconds,1),blend=MathUtils.smootherstep(u,0,1);
   // This quintic tail preserves incoming velocity and dies away with zero
   // velocity/acceleration, avoiding a pause when the close shot hands over.
   const tail=elapsed*(1-u)**3*(1+3*u);
   controls.target.copy(startTarget).lerp(center,blend).addScaledVector(velocity,tail);
   const integratedEase=transitionSeconds*(u**6-3*u**5+2.5*u**4)+Math.max(0,elapsed-transitionSeconds);
   spherical.set(start.radius+(radius-start.radius)*blend+radiusVelocity*tail,
    start.phi+(polar-start.phi)*blend+polarVelocity*tail,
    start.theta+initialSpeed*elapsed+(speed-initialSpeed)*integratedEase);
   camera.position.copy(controls.target).add(direction.setFromSpherical(spherical));
  },
 };
}
