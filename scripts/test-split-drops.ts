import * as THREE from 'three/webgpu';
import {createPreviewPhysics,DROP_PORTS,FIXED_STEP} from '../src/preview-physics';
import {splitPorts} from '../src/pieces/split';
const source=DROP_PORTS.split[0].slice();
const results=[];
for(const [dx,dz] of [[0,0],[1.5,0],[-1.5,0],[0,1.5],[0,-1.5]]){
 const root=new THREE.Mesh(new THREE.BufferGeometry()),sim=await createPreviewPhysics(root,'split');
 DROP_PORTS.split[0]=[source[0]+dx,source[1],source[2]+dz];sim.drop();let passed=false;
 for(let i=0;i<10/FIXED_STEP;i++){sim.step();const p=sim.marbles[0].mesh.position;if(p.y<0){passed=Math.min(...splitPorts.filter(port=>port.outlet).map(port=>Math.hypot(p.x-port.x,p.z-port.z)))<10.5;break;}}
 const result={offset:[dx,dz],passed,position:sim.marbles[0].mesh.position.toArray()};results.push(result);console.log(result);sim.dispose();root.geometry.dispose();
}
await Bun.write('tmp/checks/split-drop-results.json',JSON.stringify(results,null,2));
if(results.some(r=>!r.passed))throw new Error('Split failed to discharge a marble');
