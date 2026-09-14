import * as THREE from 'three/webgpu';
import {createPreviewPhysics,DROP_PORTS,FIXED_STEP} from '../src/preview-physics';
const results=[];
for(const [dx,dz] of [[0,0],[1.5,0],[-1.5,0],[0,1.5],[0,-1.5]]){
 const root=new THREE.Mesh(new THREE.BufferGeometry()),sim=await createPreviewPhysics(root,'jump');
 DROP_PORTS.jump[0]=[-69+dx,176,dz];sim.drop();let passed=false;
 for(let i=0;i<10/FIXED_STEP;i++){sim.step();const p=sim.marbles[0].mesh.position;if(p.x>105&&p.y>35){passed=true;break;}}
 const result={offset:[dx,dz],passed,position:sim.marbles[0].mesh.position.toArray()};results.push(result);console.log(result);sim.dispose();root.geometry.dispose();
}
await Bun.write('tmp/checks/jump-drop-results.json',JSON.stringify(results,null,2));
if(results.some(r=>!r.passed))throw new Error('Jump failed to launch a marble');
