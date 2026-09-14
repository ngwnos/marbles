import * as THREE from 'three/webgpu';
import {createPreviewPhysics,FIXED_STEP} from '../src/preview-physics';
import {START} from '../src/pieces/start';
const results=[];
for(const lanes of [...Array.from({length:6},(_,i)=>[i]),[0,1,2,3,4,5]]){
 const root=new THREE.Group(),gate=new THREE.Mesh(new THREE.BufferGeometry());gate.name='start gate';gate.position.set(START.pivotX,START.pivotY,0);root.add(gate);
 const sim=await createPreviewPhysics(root,'start');lanes.forEach(i=>sim.drop(i));
 for(let i=0;i<3/FIXED_STEP;i++)sim.step();
 const held=sim.marbles.every(m=>m.mesh.position.y>START.pivotY&&m.mesh.position.x<START.pivotX+15);
 sim.release();const exited=new Set<number>();
 for(let i=0;i<15/FIXED_STEP;i++){sim.step();sim.marbles.forEach((m,j)=>{const p=m.mesh.position;if(p.y<0&&Math.hypot(p.x,p.z)<10.5)exited.add(j);});}
 const result={lanes,held,passed:held&&exited.size===lanes.length,angle:sim.joint?.getAngle(),positions:sim.marbles.map(m=>m.mesh.position.toArray())};results.push(result);console.log(result);
 sim.reset();if(Math.abs(sim.joint!.getAngle())>.01)throw new Error('Reset failed');sim.dispose();gate.geometry.dispose();
}
await Bun.write('tmp/checks/start-drop-results.json',JSON.stringify(results,null,2));if(results.some(r=>!r.passed))throw new Error('Start gate did not hold and release every lane');
