import {Box3,MathUtils,PerspectiveCamera,Spherical,Vector3} from 'three/webgpu';
import type {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {constructionLayers,constructionPlanBounds,createConstructionFocus,type ConstructionPlan} from './construction';

/** Fit every corner with space for the toolbar and parts tray. */
export function constructionFrameDistance(camera:PerspectiveCamera,bounds:Box3,target:Vector3,direction:Vector3){
 const back=direction.clone().normalize(),right=new Vector3().crossVectors(camera.up,back).normalize(),up=new Vector3().crossVectors(back,right);
 const tanY=Math.tan(MathUtils.degToRad(camera.fov/2))/camera.zoom,tanX=tanY*camera.aspect;
 let distance=100;
 for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
  const p=new Vector3(x,y,z).sub(target),depth=p.dot(back);
  distance=Math.max(distance,depth+Math.abs(p.dot(right))/(tanX*.82),depth+Math.abs(p.dot(up))/(tanY*.72));
 }
 return distance;
}

type Spring={value:number;velocity:number};
function advance(s:Spring,goal:number,dt:number){
 const frequency=4,offset=s.value-goal,impulse=(s.velocity+frequency*offset)*dt,decay=Math.exp(-frequency*dt);
 s.value=goal+(offset+impulse)*decay;s.velocity=(s.velocity-frequency*impulse)*decay;
}

export function createConstructionCamera(camera:PerspectiveCamera,controls:OrbitControls,plan:ConstructionPlan){
 const bounds=constructionPlanBounds(plan),{layers}=constructionLayers(plan),firstLayer=Math.min(...layers);
 bounds.max.y=constructionPlanBounds({...plan,pieces:plan.pieces.filter((_,i)=>layers[i]===firstLayer)}).max.y;
 const spin:Spring={value:0,velocity:0},radius:Spring={value:camera.position.distanceTo(controls.target),velocity:0};
 const spherical=new Spherical().setFromVector3(camera.position.clone().sub(controls.target)),polar:Spring={value:spherical.phi,velocity:0};
 // Choose the zoom once from the first-floor footprint. Following higher
 // layers or orbiting around them must never reframe the whole structure.
 const direction=new Vector3().setFromSpherical(new Spherical(1,Math.PI*.3,spherical.theta));
 const desired=Math.max(controls.minDistance,constructionFrameDistance(camera,bounds,createConstructionFocus(plan)([]),direction));
 controls.maxDistance=Math.max(controls.maxDistance,desired);
 const previousSpeed=controls.autoRotateSpeed;
 let manual=false;
 const interact=()=>{manual=true;radius.velocity=polar.velocity=0;};
 controls.addEventListener('start',interact);
 controls.autoRotate=true;controls.autoRotateSpeed=0;
 const dispose=()=>{controls.removeEventListener('start',interact);controls.autoRotate=false;controls.autoRotateSpeed=previousSpeed;};
 return {
  dispose,
  update(building:boolean,dt:number){
   // OrbitControls pauses automatic rotation during a drag. Manual input also
   // releases the framing so zooming and changing elevation never fight it.
   advance(spin,building?.75:0,dt);controls.autoRotateSpeed=spin.value;
   let framed=manual;
   if(!manual){
    spherical.setFromVector3(camera.position.clone().sub(controls.target));
    advance(polar,Math.PI*.3,dt);spherical.phi=polar.value;
    advance(radius,desired,dt);spherical.radius=radius.value;
    camera.position.copy(controls.target).add(new Vector3().setFromSpherical(spherical));
    framed=Math.abs(radius.value-desired)<.1&&Math.abs(radius.velocity)<.1&&Math.abs(polar.velocity)<.0001;
   }
   if(!building&&spin.value<.0001&&Math.abs(spin.velocity)<.0001&&framed){dispose();return true;}
   return false;
  },
 };
}
