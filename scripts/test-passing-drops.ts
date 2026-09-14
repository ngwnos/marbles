import * as THREE from 'three/webgpu';
import {createPreviewPhysics,DROP_PORTS,FIXED_STEP} from '../src/preview-physics';
import {PASSING} from '../src/pieces/passing';
const source=DROP_PORTS.passing[0].slice();
const results=[];
for(const [dx,dz] of [[0,0],[1.5,0],[-1.5,0],[0,1.5],[0,-1.5]]){
 const root=new THREE.Mesh(new THREE.BufferGeometry()),sim=await createPreviewPhysics(root,'passing');
 DROP_PORTS.passing[0]=[source[0]+dx,source[1],source[2]+dz];sim.drop();let passed=false;
 for(let i=0;i<10/FIXED_STEP;i++){sim.step();const p=sim.marbles[0].mesh.position;if(p.y<0){passed=Math.hypot(p.x-PASSING.span/2,p.z)<10.5;break;}}
 const result={offset:[dx,dz],passed,position:sim.marbles[0].mesh.position.toArray()};results.push(result);console.log(result);sim.dispose();root.geometry.dispose();
}
await Bun.write('tmp/checks/passing-drop-results.json',JSON.stringify(results,null,2));
if(results.some(r=>!r.passed))throw new Error('Passing lane failed to discharge a marble');
