import assert from 'node:assert/strict';
import {Quaternion,Euler,Vector3} from 'three/webgpu';
import {PARTS,PART_BY_ID,type V3} from '../src/assembly/catalog';
import {solveSnap,availableTargets,worldPort,type Pose,type Target} from '../src/assembly/snapping';
import {createAssemblyPhysics} from '../src/assembly/physics';
// Derive two support positions from an arbitrarily rotated ramp: both sockets
// must fit at machine precision, including the standard ramp's diagonal span.
for(const kind of ['ramp','snake','hairpin','jump','split']){
 const ports=PART_BY_ID[kind].ports.filter(p=>p.gender==='female'&&p.axis===-1);assert(ports.length>=2);
 const desired:Pose={yaw:.37,position:[120,94,-65]};
 const targets:Target[]=ports.map((p,i)=>({piece:100+i,position:worldPort(p,desired),port:{id:'top',position:[0,0,0],gender:'male',axis:1}}));
 const near:Pose={yaw:.2,position:[125,94,-70]};const result=solveSnap(kind,near,targets,p=>Math.hypot(...p.position.map((v,i)=>v-desired.position[i])),40);
 assert(result);assert.equal(result.matches.length,ports.length);assert(Math.abs(result.pose.yaw-desired.yaw)<1e-6);
 console.log(kind,'two-ended snap passed');
}
// A tenth of a millimetre of settling drift fits within socket clearance;
// visibly wrong tower spacing must still be rejected as a two-ended fit.
{
 const ports=PART_BY_ID.ramp.ports.filter(p=>p.gender==='female');
 const pose:Pose={yaw:0,position:[0,47,0]};
 const targets:Target[]=ports.map((p,i)=>({piece:i+1,port:{id:'top',position:[0,0,0],gender:'male',axis:1},position:worldPort(p,pose)}));
 targets[1].position[0]-=.095;
 const fit=solveSnap('ramp',pose,targets,p=>Math.hypot(...p.position.map((v,i)=>v-pose.position[i])),30)!;
 assert.equal(fit.matches.length,2);
 targets[1].position[0]-=2;
 assert.equal(solveSnap('ramp',pose,targets,p=>Math.hypot(...p.position.map((v,i)=>v-pose.position[i])),30)!.matches.length,1);
}
const occupied=availableTargets([{id:1,kind:'spacer',pose:{position:[0,0,0],yaw:0}}],[{a:1,ap:'0-above',b:2,bp:'0-below'}],3);
assert(!occupied.some(t=>t.port.id==='0-above'));assert(occupied.some(t=>t.port.id==='0-below'));
const physics=await createAssemblyPhysics();
for(const [index,part] of PARTS.entries()){
 const x=(index%5)*400,z=Math.floor(index/5)*400;
 const b=physics.add(index,part.id,[x,350,z],new Quaternion().setFromEuler(new Euler(.15,0,.12)),false);
 assert(b.getMass()>0);console.log(part.id,'valid loose collider');
}
for(let i=0;i<360;i++)physics.step();
for(const [id,part] of PARTS.entries()){
 const p=physics.pose(id)!;assert(Number.isFinite(p.position.y));assert(p.position.y<340,`${part.id} did not fall`);assert(p.position.y> -350,`${part.id} fell through floor`);
 console.log(part.id,'fell and collided',p.position.y.toFixed(2));
}
physics.dispose();console.log('Assembly tests passed');
const {columnsFor,rotateAroundColumn}=await import('../src/assembly/pivot');
for(const kind of ['ramp','snake','intersection','jump']){
 const columns=columnsFor(PART_BY_ID[kind].ports);assert.equal(columns.length,kind==='intersection'?3:2);
 for(const column of columns)for(const angle of [-2.917,.173,1.348,Math.PI]){
  const before:Pose={position:[27,94,-83],yaw:.38};const after=rotateAroundColumn(before,column.position,angle);
  const port={id:'pivot',position:column.position,gender:'male' as const,axis:1 as const};
  assert(Math.hypot(...worldPort(port,before).map((v,i)=>v-worldPort(port,after)[i]))<1e-10);
 }
}
console.log('Column pivots preserve position at arbitrary angles');
const {inputColumns,inputIsConnected}=await import('../src/assembly/drop');
assert.equal(inputColumns('intersection').length,2);
assert.equal(inputColumns('ramp').length,1);
assert.equal(inputColumns('base').length,1);
const inlet=inputColumns('ramp')[0];
assert(inputIsConnected(4,inlet.port.id,[{a:4,ap:inlet.port.id,b:5,bp:'bottom'}]));
assert(!inputIsConnected(4,inlet.port.id,[{a:4,ap:'outlet',b:5,bp:'bottom'}]));
const rolling=await createAssemblyPhysics();
const collision=(await import('../src/generated/ramp-collision.json')).default;
rolling.registerSurface('ramp','parts' in collision?collision.parts:[collision]);
rolling.add(1,'ramp',[0,150,0],new Quaternion(),true);
const spawn=inlet.position.map((v,i)=>v+(i===1?150:0)) as [number,number,number];
assert(rolling.dropMarble(spawn));
assert(!rolling.dropMarble(spawn),'Overlapping marble spawn was allowed');
let travelled=0;
for(let i=0;i<240;i++){
 rolling.step();const p=rolling.marblePositions()[0];
 travelled=Math.max(travelled,p.x-spawn[0]);
}
assert(travelled>80,`Marble did not travel down the track: ${travelled} mm`);
rolling.dispose();
console.log('Input occupancy and marble rolling on continuous track surface passed');
// The assembly paddle has a real hinge, including after rotating the whole part.
{
 const {PADDLE,paddleAxleY}=await import('../src/pieces/paddle-wheel');
 const collision=(await import('../src/generated/paddle-body-collision.json')).default;
 for(const yaw of [0,.73]){
  const sim=await createAssemblyPhysics(),q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),yaw);
  sim.registerSurface('paddle',[collision]);sim.add(1,'paddle',[0,150,0],q,true);
  sim.dropMarble(new Vector3(-69,279,-24).applyQuaternion(q).add(new Vector3(0,0,0)).toArray());
  let maxAngle=0;
  for(let i=0;i<600;i++){sim.step();maxAngle=Math.max(maxAngle,Math.abs(sim.wheelPose(1)!.angle));}
  assert(maxAngle>.1,`Paddle wheel did not turn at yaw ${yaw}`);
  const anchor=new Vector3(PADDLE.x,paddleAxleY,PADDLE.z).applyQuaternion(q).add(new Vector3(0,150,0));
  assert(sim.wheelPose(1)!.position.distanceTo(anchor)<.1,'Wheel left its axle');
  const before=sim.wheelPose(1)!.angle;for(let i=0;i<1200;i++)sim.step();
  const settled=sim.wheelPose(1)!.angle;for(let i=0;i<120;i++)sim.step();
  assert(Math.abs(sim.wheelPose(1)!.angle-settled)<.02,'Wheel did not slow down');
  sim.remove(1);assert.equal(sim.wheelPose(1),undefined);
  sim.dispose();console.log('Assembly paddle hinge passed',yaw,maxAngle,before);
 }
}
