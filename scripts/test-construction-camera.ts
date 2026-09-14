import assert from 'node:assert/strict';
import {PerspectiveCamera,Spherical,Vector3} from 'three/webgpu';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {constructionFrameDistance,createConstructionCamera} from '../src/assembly/construction-camera';
import {constructionLayers,constructionOrder,constructionPlanBounds,createConstructionFocus} from '../src/assembly/construction';
import {PRESETS} from '../src/assembly/presets';
import {createOrbitSlew} from '../src/assembly/orbit-slew';

const corners=(b:ReturnType<typeof constructionPlanBounds>)=>[b.min.x,b.max.x].flatMap(x=>[b.min.y,b.max.y].flatMap(y=>[b.min.z,b.max.z].map(z=>new Vector3(x,y,z))));
for(const preset of PRESETS){
 const plan={...preset,presetId:preset.id,onCarpet:true,pieces:constructionOrder(preset)},bounds=constructionPlanBounds(plan),focus=createConstructionFocus(plan);
 const {layers}=constructionLayers(plan),firstLayer=Math.min(...layers);
 bounds.max.y=constructionPlanBounds({...plan,pieces:plan.pieces.filter((_,i)=>layers[i]===firstLayer)}).max.y;
 for(const aspect of [.65,1.8])for(let angle=0;angle<Math.PI*2;angle+=Math.PI/8){
  const camera=new PerspectiveCamera(42,aspect,1,30000),target=focus([]);
  const direction=new Vector3().setFromSpherical(new Spherical(1,Math.PI*.3,angle));
  camera.position.copy(target).addScaledVector(direction,constructionFrameDistance(camera,bounds,target,direction));camera.lookAt(target);camera.updateMatrixWorld();
  for(const p of corners(bounds)){const ndc=p.project(camera);assert(Math.abs(ndc.x)<=.82001&&Math.abs(ndc.y)<=.72001&&ndc.z<1,'Initial framing clips the first-floor footprint or its UI margin');}
 }
}
for(const fps of [30,120]){
 const preset=PRESETS[0],plan={...preset,presetId:preset.id,onCarpet:true,pieces:constructionOrder(preset)};
 const camera=new PerspectiveCamera(42,1.8,1,30000);camera.position.set(2200,2300,2500);
 const controls=new OrbitControls(camera);controls.target.set(-700,80,400);controls.update();
 const initial=camera.position.clone(),initialDistance=camera.position.distanceTo(controls.target),initialAngle=controls.getAzimuthalAngle();
 const rig=createConstructionCamera(camera,controls,plan),focus=createConstructionFocus(plan),goal=focus([]),slew=createOrbitSlew(camera,controls.target,4);
 assert(camera.position.equals(initial),'Starting the camera snapped its position');
 for(let tick=0;tick<fps*4;tick++){
  slew.update(goal,1/fps);rig.update(true,1/fps);controls.update(1/fps);
  if(tick===0)assert(camera.position.distanceTo(initial)<initialDistance*.006,'First camera frame jumps');
 }
 assert(camera.position.distanceTo(controls.target)<initialDistance*.8,'Camera never zoomed in on construction');
 assert(Math.abs(controls.getAzimuthalAngle()-initialAngle)>.15,'Camera did not automatically orbit');
 const framedDistance=camera.position.distanceTo(controls.target);
 goal.copy(focus(plan.pieces.map(p=>p.id)));
 for(let tick=0;tick<fps*5;tick++){
  slew.update(goal,1/fps);rig.update(true,1/fps);controls.update(1/fps);
  assert(Math.abs(camera.position.distanceTo(controls.target)-framedDistance)<.01,'Zoom changed as construction rose or orbited');
 }
 let stopped=false;
 for(let tick=0;tick<fps*8&&!stopped;tick++){stopped=rig.update(false,1/fps);controls.update(1/fps);}
 assert(stopped&&!controls.autoRotate,'Automatic orbit did not stop after construction');
 assert(Math.abs(camera.position.distanceTo(controls.target)-framedDistance)<.01,'Completion zoomed out to show the finished maze');
 const rest=camera.position.clone();for(let tick=0;tick<fps;tick++)controls.update(1/fps);
 assert(camera.position.distanceTo(rest)<.001,'Camera kept moving after its orbit finished');
 const manual=createConstructionCamera(camera,controls,plan);controls.dispatchEvent({type:'start'});
 camera.position.copy(controls.target).add(new Vector3(310,420,350));controls.update();
 const distance=camera.position.distanceTo(controls.target),polar=controls.getPolarAngle();
 for(let tick=0;tick<fps;tick++){manual.update(true,1/fps);controls.update(1/fps);}
 assert(Math.abs(camera.position.distanceTo(controls.target)-distance)<.001&&Math.abs(controls.getPolarAngle()-polar)<.0001,'Automatic framing fought manual zoom or orbit');
 manual.dispose();assert(!controls.autoRotate);
}
console.log('Construction camera: first-floor framing, fixed zoom through upper layers and completion, smooth orbit, manual control and stopping passed');
