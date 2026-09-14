import type {createBuilder} from '../src/assembly/world';
import {PRESETS} from '../src/assembly/presets';
import {constructionIsClear,placedBounds,type ConstructionSource} from '../src/assembly/construction';
import {Box3,Quaternion,Vector3} from 'three/webgpu';
import {PART_UNITS} from '../src/pieces/marbleworks-spec';

export async function verifyConstruction(builder:Awaited<ReturnType<typeof createBuilder>>){
 const root=document.documentElement;root.dataset.constructionTest='running';
 const check=(ok:unknown,message:string)=>{if(!ok){root.dataset.constructionTest='failed: '+message;throw new Error(message);}};
 const frame=()=>new Promise(requestAnimationFrame);
 builder.loadPreset('tangled-garden','packed');await frame();builder.dumpTub();
 while(builder.inspect().tub.dumping)await frame();
 await new Promise(r=>setTimeout(r,2000));
 const before=builder.inspect(),orbit=new Vector3(...before.camera.position).sub(new Vector3(...before.camera.target));
 const sources:ConstructionSource[]=before.items.map(p=>({...p,position:new Vector3(...p.position),rotation:new Quaternion(...p.rotation)}));
 const button=[...document.querySelectorAll<HTMLButtonElement>('.preset-controls button')].find(b=>b.textContent==='Construct preset')!;
 check(button&&!button.disabled,'Construct button missing');button.click();
 const initial=builder.inspect().camera;
 check(JSON.stringify(initial.target)===JSON.stringify(before.camera.target),'Starting construction snapped the camera');
 check(JSON.stringify(initial.position)===JSON.stringify(before.camera.position),'Starting construction snapped the zoom');
 check(initial.constructionTarget,'Construction did not acquire the footprint');
 const center=initial.constructionTarget!;let goalY=center[1],lastCompleted=0,sawRise=false;
 await frame();
 check(builder.inspect().construction,'Button did not start construction');
 check(!builder.constructPreset('tangled-garden'),'Duplicate construction accepted');
 check(!builder.dumpTub(),'Dump interrupted construction');
 let previous=0,sawMoving=false,sawOverlap=false,sawCrossLayer=false,sawEaseIn=false,sawEaseOut=false,sawCruise=false,sawZoom=false,sawOrbit=false;const deadline=performance.now()+240000;
 let framedDistance:number|undefined;
 while(builder.inspect().construction&&performance.now()<deadline){
  const state=builder.inspect(),progress=state.construction!;
  check(progress.completed>=previous,'Construction progress went backwards');previous=progress.completed;
  sawMoving ||= progress.active.length>0;sawOverlap ||= progress.active.length>1;
  sawCrossLayer ||= new Set(progress.active.map(p=>p.layer)).size>1;
  const timing=progress.timing;
  sawEaseIn ||= timing.elapsed<1&&timing.factor<.9;
  sawCruise ||= timing.factor===1;
  sawEaseOut ||= timing.endingAt!==undefined&&timing.factor<.65;
  check(new Set(progress.active.map(p=>p.id)).size===progress.active.length,'A moving piece was picked twice');
  check(state.items.length===before.items.length&&state.items.every((p,i)=>p.id===before.items[i].id&&p.kind===before.items[i].kind&&p.color===before.items[i].color),'Construction replaced inventory or changed colors');
  const c=state.camera,goal=c.constructionTarget!;
  const offset=new Vector3(...c.position).sub(new Vector3(...c.target));
  sawZoom ||= offset.length()<orbit.length()*.9;
  sawOrbit ||= Math.abs(Math.atan2(offset.x,offset.z)-Math.atan2(orbit.x,orbit.z))>.1;
  if(timing.elapsed>4){
   framedDistance??=offset.length();
   check(Math.abs(offset.length()-framedDistance)<.5,'Zoom changed after initial footprint framing');
  }
  check(Math.abs(goal[0]-center[0])+Math.abs(goal[2]-center[2])<.001,'Camera wandered away from footprint center');
  if(goal[1]!==goalY){
   check(progress.completed>lastCompleted,'Camera raised before placement finished');
   check(goal[1]>goalY&&Math.abs((goal[1]-goalY)/PART_UNITS.stackRise-Math.round((goal[1]-goalY)/PART_UNITS.stackRise))<.001,'Camera height left the layer grid');
   sawRise=true;goalY=goal[1];
  }
  lastCompleted=progress.completed;
  await frame();
 }
 const after=builder.inspect(),preset=PRESETS[0];
 check(sawMoving&&!after.construction&&after.items.every(p=>p.fixed),'Construction did not complete');
 check(sawOverlap,'Construction did not overlap pickups');
 check(sawCrossLayer,'Flights never overlapped across layers');
 check(sawEaseIn&&sawCruise&&sawEaseOut,'Overall build speed did not ease in, cruise and ease out');
 check(sawZoom&&sawOrbit,'Construction camera did not zoom in and orbit');
 check(after.connections.length===preset.connections.length,'Final connections missing');
 const built={...preset,pieces:after.items.map(p=>({id:p.id,kind:p.kind,pose:{position:p.position,yaw:2*Math.atan2(p.rotation[1],p.rotation[3])}})),onCarpet:true,presetId:preset.id};
 check(constructionIsClear(built,sources),'Built into the original pile');
 check(after.selected===after.items.find(p=>p.kind==='start')?.id,'Starting gate was not selected');
 check(sawRise,'Camera never advanced a layer');
 const bounds=new Box3();for(const p of after.items)bounds.union(placedBounds({...p,position:new Vector3(...p.position),rotation:new Quaternion(...p.rotation)}));
 const actualCenter=bounds.getCenter(new Vector3());
 check(Math.hypot(center[0]-actualCenter.x,center[2]-actualCenter.z)<.001,'Camera centered on the wrong footprint');
 // The last placements can finish together in one rendered frame at 10x.
 // Derive the final layer from the built pieces, not the last sampled frame.
 const finalGoal=new Vector3(center[0],Math.max(...after.items.map(p=>p.position[1])),center[2]);
 const settled=()=>new Vector3(...builder.inspect().camera.target).distanceTo(finalGoal)<1&&!builder.inspect().camera.autoOrbit;
 const settleDeadline=performance.now()+8000;
 while(!settled()&&performance.now()<settleDeadline)await frame();
 check(settled(),`Camera did not settle on the final layer: ${builder.inspect().camera.target} vs ${finalGoal.toArray()}`);
 const finalCamera=builder.inspect().camera;
 const finalDistance=new Vector3(...finalCamera.position).distanceTo(new Vector3(...finalCamera.target));
 check(framedDistance!==undefined&&Math.abs(finalDistance-framedDistance)<.5,'Completion changed the construction zoom');
 root.dataset.constructionTest='passed';
 document.querySelector('[role=status]')!.textContent='TEST PASSED: 90 pieces built with fixed zoom, automatic orbit and complete connections';
}
