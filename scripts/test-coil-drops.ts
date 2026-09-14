import * as THREE from 'three/webgpu';
import {createPreviewPhysics,DROP_PORTS,FIXED_STEP} from '../src/preview-physics';
import {COIL} from '../src/pieces/coil';
const source=DROP_PORTS.coil[0].slice();
const results=[];
for(const [dx,dz] of [[0,0],[1.5,0],[-1.5,0],[0,1.5],[0,-1.5]]){
 const root=new THREE.Mesh(new THREE.BufferGeometry()),sim=await createPreviewPhysics(root,'coil');
 DROP_PORTS.coil[0]=[source[0]+dx,source[1],source[2]+dz];sim.drop();let passed=false,turn=0,last=Math.atan2(source[2]+dz,source[0]+dx);
 for(let i=0;i<10/FIXED_STEP;i++){sim.step();const p=sim.marbles[0].mesh.position;const a=Math.atan2(p.z,p.x);turn+=Math.atan2(Math.sin(a-last),Math.cos(a-last));last=a;if(p.y<0){passed=turn< -14&&Math.hypot(p.x-COIL.radius,p.z)<10.5;break;}}
 const result={offset:[dx,dz],passed,turn,position:sim.marbles[0].mesh.position.toArray()};results.push(result);console.log(result);sim.dispose();root.geometry.dispose();
}
await Bun.write('tmp/checks/coil-drop-results.json',JSON.stringify(results,null,2));
if(results.some(r=>!r.passed))throw new Error('Coil failed to discharge a marble');
