import type {createBuilder} from '../src/assembly/world';
import {Quaternion,Vector3} from 'three/webgpu';

export async function verifyTubDump(builder:Awaited<ReturnType<typeof createBuilder>>){
 document.documentElement.dataset.tubDumpTest='running';
 const check=(ok:unknown,message:string)=>{if(!ok){document.documentElement.dataset.tubDumpTest='failed: '+message;throw new Error(message);}};
 const frame=()=>new Promise(requestAnimationFrame);
 await frame();builder.loadPreset('tangled-garden','packed');await frame();
 const before=builder.inspect(),view=builder.project([0,0,0]),button=[...document.querySelectorAll<HTMLButtonElement>('.preset-controls button')].find(b=>b.textContent==='Dump tub')!;
 check(button&&!button.disabled,'Dump button missing or disabled');button.click();await frame();
 check(builder.inspect().tub.dumping,'Button did not start the animation');
 check(button.disabled&&button.textContent==='Dumping…','Dump button did not show its active state');
 check(!builder.dumpTub(),'Duplicate dump accepted');
 check(await builder.refillTub()===false,'Refill replaced the contents during a pour');
 builder.loadPreset('split-rejoin');check(builder.inspect().items.length===90,'Preset load interrupted the pour');
 let lifted=false,inverted=false;const deadline=performance.now()+60000;
 while(builder.inspect().tub.dumping&&performance.now()<deadline){
  const state=builder.inspect();lifted ||= state.tub.position[1]>800;
  const rotation=new Quaternion(...state.tub.rotation),up=new Vector3(0,1,0).applyQuaternion(rotation).y;
  inverted ||= up<-.9;
  const projected=builder.project([0,0,0]);check(Math.hypot(projected.clientX-view.clientX,projected.clientY-view.clientY)<.01,'Dump changed the camera');
  check(state.items.length===90&&state.items.every((p,i)=>p.id===before.items[i].id&&p.color===before.items[i].color),'Dump replaced pieces or changed their colors');
  await frame();
 }
 // The final set-down returns to gravity; let its contacts settle.
 while(builder.inspect().tub.awake&&performance.now()<deadline)await frame();
 await frame();const after=builder.inspect();
 check(!after.tub.dumping&&lifted&&inverted,'Lift/pour/return sequence incomplete');
 check(!button.disabled&&button.textContent==='Dump tub','Button did not reset');
 check(after.items.every(p=>p.position[0]>-1100),'Pieces remain behind in the tub');
 check(after.items.filter(p=>Math.abs(p.position[0])<1100&&Math.abs(p.position[2])<800).length>=after.items.length*.95,'Pour threw too many pieces beyond the carpet');
 check(Math.abs(after.tub.angle)<.01,'Tub did not return upright');
 document.querySelector('[role="status"]')!.textContent='TEST PASSED: continuous pour, all 90 pieces emptied, camera unchanged';
 document.documentElement.dataset.tubDumpTest='passed';
 return {result:'PASS',pieces:after.items.length,lifted,inverted};
}
