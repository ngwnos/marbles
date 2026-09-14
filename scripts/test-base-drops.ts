import * as THREE from 'three/webgpu';
import {createPreviewPhysics,DROP_PORTS,FIXED_STEP,PHYSICS_SCALE,MARBLE_RADIUS} from '../src/preview-physics';
import {BASE} from '../src/pieces/base';
const results=[];
for(const [dx,dz] of [[0,0],[1.5,0],[-1.5,0],[0,1.5],[0,-1.5]]){
 const root=new THREE.Mesh(new THREE.BufferGeometry()),sim=await createPreviewPhysics(root,'base');
 const source=DROP_PORTS.base[0];source[0]+=dx;source[2]+=dz;sim.drop();source[0]-=dx;source[2]-=dz;
 let escaped=false;for(let i=0;i<30/FIXED_STEP;i++){sim.step();const p=sim.marbles[0].mesh.position;if(p.y<0||Math.abs(p.x)>BASE.length/2||Math.abs(p.z)>BASE.width/2)escaped=true;}
 const ball=sim.marbles[0],v=ball.body.getLinearVelocity(),speed=Math.hypot(v.x,v.y,v.z)/PHYSICS_SCALE;
 const p=ball.mesh.position;const passed=!escaped&&p.x>10&&speed<.5&&p.y>=BASE.floor+MARBLE_RADIUS-.5&&p.y<BASE.rim+MARBLE_RADIUS;
 const result={offset:[dx,dz],passed,speed,position:p.toArray()};results.push(result);console.log(result);
 sim.dispose();root.geometry.dispose();
}
await Bun.write('tmp/checks/base-drop-results.json',JSON.stringify(results,null,2));
if(results.some(r=>!r.passed))throw new Error('Base failed to retain and settle a marble');
