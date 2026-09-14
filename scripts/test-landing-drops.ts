import * as THREE from 'three/webgpu';
import {createPreviewPhysics,DROP_PORTS,FIXED_STEP} from '../src/preview-physics';
const results=[];
for(const [x,z] of [[35,15],[20,25],[0,35],[-20,20],[35,25]]){
 const root=new THREE.Mesh(new THREE.BufferGeometry()),sim=await createPreviewPhysics(root,'landing');
 DROP_PORTS.landing[0]=[x,65,z];sim.drop();let passed=false;
 for(let i=0;i<15/FIXED_STEP;i++){sim.step();const p=sim.marbles[0].mesh.position;if(p.y<0){passed=Math.hypot(p.x+55,p.z)<10.5;break;}}
 const result={source:[x,z],passed,position:sim.marbles[0].mesh.position.toArray()};results.push(result);console.log(result);sim.dispose();root.geometry.dispose();
}
await Bun.write('tmp/checks/landing-drop-results.json',JSON.stringify(results,null,2));
if(results.some(r=>!r.passed))throw new Error('Landing failed to discharge a marble');
