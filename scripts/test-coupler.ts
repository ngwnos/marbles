import * as THREE from 'three/webgpu';
import {loadSolidKernel} from '../src/pieces/solid-kernel';
import {buildExtensionSolid,EXTENSION} from '../src/pieces/extension';
import {buildCouplerSolid} from '../src/pieces/coupler';
import {PART_UNITS} from '../src/pieces/marbleworks-spec';
import {createPreviewPhysics,DROP_PORTS,FIXED_STEP} from '../src/preview-physics';
const k=await loadSolidKernel(),tube=buildCouplerSolid(k),spacer=buildExtensionSolid(k);
for(const top of [false,true]){const positioned=top?spacer.translate([0,PART_UNITS.stackRise,0]):spacer.translate([0,-EXTENSION.height,0]);const overlap=tube.intersect(positioned);if(overlap.volume()>.001)throw new Error('Coupler insertion blocked');overlap.delete();positioned.delete();}
tube.delete();spacer.delete();const results=[],source=DROP_PORTS.coupler[0].slice();
for(const [x,z] of [[0,0],[1.5,0],[-1.5,0],[0,1.5],[0,-1.5]]){
 const root=new THREE.Mesh(new THREE.BufferGeometry()),sim=await createPreviewPhysics(root,'coupler');DROP_PORTS.coupler[0]=[x,source[1],z];sim.drop();let passed=false;
 for(let i=0;i<3/FIXED_STEP;i++){sim.step();const p=sim.marbles[0].mesh.position;if(p.y< -15){passed=Math.hypot(p.x,p.z)<12.1;break;}}
 results.push({offset:[x,z],passed});sim.dispose();root.geometry.dispose();
}
DROP_PORTS.coupler[0]=source;console.log(results);await Bun.write('tmp/checks/coupler-drop-results.json',JSON.stringify(results,null,2));if(results.some(r=>!r.passed))throw new Error('Tube blocked a marble');
