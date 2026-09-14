import * as THREE from 'three/webgpu';
import {createPreviewPhysics,FIXED_STEP,DROP_PORTS,type ComponentKind} from '../src/preview-physics';
import {paddleAxleY,PADDLE} from '../src/pieces/paddle-wheel';
import {PART_UNITS} from '../src/pieces/marbleworks-spec';
const started=performance.now();
const outcomes=[];
const paddleOnly=process.argv.includes('--paddle');
const offsets=process.argv.includes('--offsets')?[[0,0],[1.5,0],[-1.5,0],[0,1.5],[0,-1.5]]:[[0,0]];
for(const kind of (paddleOnly?['paddle']:['paddle','ramp','funnel','snake','intersection','spacer','maze','bumper']) as ComponentKind[]){
 for(let port=0;port<DROP_PORTS[kind].length;port++)for(const degrees of kind==='paddle'?[0,5,10,15,20,25]:[0])for(const offset of offsets){
  const root=new THREE.Group();root.add(new THREE.Mesh(new THREE.BufferGeometry()));
  if(kind==='paddle'){const wheel=new THREE.Mesh(new THREE.BufferGeometry());wheel.position.set(PADDLE.x,paddleAxleY,PADDLE.z);wheel.rotation.z=degrees*Math.PI/180;wheel.name='paddle wheel';root.add(wheel);}
  const sim=await createPreviewPhysics(root,kind);
  const source=DROP_PORTS[kind][port];source[0]+=offset[0];source[2]+=offset[1];
  sim.drop(port);source[0]-=offset[0];source[2]-=offset[1];
  let maxWheelSpeed=0,passed=false,escaped=false,time=0,minimumY=Infinity;
  const outlet=kind==='spacer'||kind==='funnel'?[0,0]:(kind==='snake'||kind==='maze'||kind==='bumper')?[PART_UNITS.portSpan/2,0]:kind==='intersection'?[PART_UNITS.portSpan/Math.sqrt(3),0]:[69,0];
  for(let i=0;i<240*15;i++){
   sim.step();time=(i+1)*FIXED_STEP;const p=sim.marbles[0].mesh.position;minimumY=Math.min(minimumY,p.y);
   if(sim.rotor)maxWheelSpeed=Math.max(maxWheelSpeed,Math.abs(sim.rotor.getAngularVelocity().z));
   if(p.y<0){passed=Math.hypot(p.x-outlet[0],p.z-outlet[1])<10.5;escaped=!passed;break;}
  }
  const end=sim.marbles[0].mesh.position.toArray().map(v=>Number(v.toFixed(2)));
  let coastSeconds:number|undefined;
  if(sim.rotor&&passed){
   for(let i=0;i<240*12;i++){sim.step();if(Math.abs(sim.rotor.getAngularVelocity().z)<.02){coastSeconds=Number(((i+1)*FIXED_STEP).toFixed(2));break;}}
   if(coastSeconds===undefined)throw new Error(`Wheel failed to stop after drop at ${degrees} degrees`);
  }
  const result={kind,port,degrees,offset,passed,escaped,coastSeconds,time:Number(time.toFixed(2)),maxWheelSpeed:Number(maxWheelSpeed.toFixed(2)),end};
  outcomes.push(result);console.log(result);
  // Reset must clear balls and restore the axle without creating a second world.
  sim.reset();if(sim.marbles.length)throw new Error('Reset retained marbles');
  if(sim.rotor){for(let i=0;i<240*3;i++)sim.step();if(Math.abs(sim.rotor.getAngularVelocity().z)>.02)throw new Error('Wheel started moving without a marble');}
  sim.dispose();root.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});
 }
}
if(!paddleOnly)await Bun.write('tmp/checks/drop-test-results.json',JSON.stringify(outcomes,null,2));
console.log({seconds:(performance.now()-started)/1000});
if(outcomes.some(o=>!o.passed))throw new Error('Some component drops failed; inspect tmp/checks/drop-test-results.json');
