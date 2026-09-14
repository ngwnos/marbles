import * as THREE from 'three/webgpu';
import {createPreviewPhysics,DROP_PORTS,FIXED_STEP} from '../src/preview-physics';
import {HAIRPIN} from '../src/pieces/hairpin';
const source=DROP_PORTS.hairpin[0].slice();
const results=[];
for(const [dx,dz] of [[0,0],[1.5,0],[-1.5,0],[0,1.5],[0,-1.5]]){
 const root=new THREE.Mesh(new THREE.BufferGeometry()),sim=await createPreviewPhysics(root,'hairpin');
 DROP_PORTS.hairpin[0]=[source[0]+dx,source[1],source[2]+dz];sim.drop();let passed=false,maxX=-Infinity;
 for(let i=0;i<10/FIXED_STEP;i++){sim.step();const p=sim.marbles[0].mesh.position;maxX=Math.max(maxX,p.x);if(p.y<0){passed=maxX>HAIRPIN.turnX&&Math.hypot(p.x-HAIRPIN.outletX,p.z)<10.5;break;}}
 const result={offset:[dx,dz],passed,maxX,position:sim.marbles[0].mesh.position.toArray()};results.push(result);console.log(result);sim.dispose();root.geometry.dispose();
}
await Bun.write('tmp/checks/hairpin-drop-results.json',JSON.stringify(results,null,2));
if(results.some(r=>!r.passed))throw new Error('U-turn failed to discharge a marble');
