import * as THREE from 'three/webgpu';
import {createPreviewPhysics,DROP_PORTS,FIXED_STEP,PHYSICS_SCALE} from '../src/preview-physics';
import {FINISH} from '../src/pieces/finish';
const results=[],source=DROP_PORTS.finish[0].slice();
for(const [dx,dz] of [[0,0],[1.5,0],[-1.5,0],[0,1.5],[0,-1.5]]){
 const root=new THREE.Mesh(new THREE.BufferGeometry()),sim=await createPreviewPhysics(root,'finish');
 DROP_PORTS.finish[0]=[source[0]+dx,source[1],source[2]+dz];sim.drop();
 for(let i=0;i<15/FIXED_STEP;i++)sim.step();
 const ball=sim.marbles[0],p=ball.mesh.position,v=ball.body.getLinearVelocity(),speed=Math.hypot(v.x,v.y,v.z)/PHYSICS_SCALE;
 const passed=p.x>FINISH.laneEnd-12&&p.x<FINISH.length&&Math.abs(p.z)<5&&p.y>0&&speed<.5;
 const result={offset:[dx,dz],passed,position:p.toArray(),speed};results.push(result);console.log(result);sim.dispose();root.geometry.dispose();
}
DROP_PORTS.finish[0]=source;
const queueRoot=new THREE.Mesh(new THREE.BufferGeometry()),queue=await createPreviewPhysics(queueRoot,'finish');
for(let n=0;n<6;n++){queue.drop();for(let i=0;i<3/FIXED_STEP;i++)queue.step();}
for(let i=0;i<8/FIXED_STEP;i++)queue.step();
const queuePositions=queue.marbles.map(m=>m.mesh.position.toArray());
const queuePassed=queuePositions.length===6&&queuePositions.every(([x,y,z])=>x>25&&x<FINISH.length&&y>0&&Math.abs(z)<5);
queue.dispose();queueRoot.geometry.dispose();
await Bun.write('tmp/checks/finish-drop-results.json',JSON.stringify({drops:results,queuePassed,queuePositions},null,2));
if(!queuePassed)throw new Error('Finish queue escaped');
if(results.some(r=>!r.passed))throw new Error('Finish failed to retain and settle a marble');
