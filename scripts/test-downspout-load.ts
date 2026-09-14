import assert from 'node:assert/strict';
import {Quaternion,Vector3} from 'three/webgpu';
import {createAssemblyPhysics} from '../src/assembly/physics';
import {inputColumns} from '../src/assembly/drop';
import {CONNECTOR,PART_UNITS} from '../src/pieces/marbleworks-spec';
import {MARBLE_RADIUS_MM} from '../src/physics-settings';
import {PRESETS} from '../src/assembly/presets';

const sourceIndex=process.argv.indexOf('--assets'),assets=sourceIndex<0?'src/generated':process.argv[sourceIndex+1];
async function read(kind:string){
 const name=kind==='paddle'?'paddle-body':kind;
 const candidate=Bun.file(`${assets}/${name}-collision.json`);
 return (await candidate.exists()?candidate:Bun.file(`src/generated/${name}-collision.json`)).json();
}
const spacer=await read('spacer');
let cases=0;const failures:string[]=[];
const partIndex=process.argv.indexOf('--part'),selected=partIndex<0?undefined:process.argv[partIndex+1];
for(const kind of process.argv.includes('--gate-only')?[]:selected?[selected]:['ramp','snake','funnel','intersection','split','maze','bumper','paddle','hairpin','passing','finish','jump','coil','base']){
 const failuresBefore=failures.length;
 const data=await read(kind);
 for(const {port} of inputColumns(kind))for(const count of [2,3,6])for(const phase of [0,Math.PI/3,Math.PI]){
  const sim=await createAssemblyPhysics();sim.registerSurface(kind,data.parts??[data]);sim.registerSurface('spacer',[spacer]);
  sim.add(1,kind,[0,200,0],new Quaternion(),true);
  const [x,y,z]=port.position,shoulder=y+200;
  for(let i=0;i<3;i++)sim.add(2+i,'spacer',[x,shoulder+i*PART_UNITS.stackRise,z],new Quaternion(),true);
  for(let i=0;i<count;i++){
   const angle=phase+i*2.4;
   assert(sim.dropMarble([x+2.2*Math.cos(angle),shoulder+25+17*i,z+2.2*Math.sin(angle)]));
  }
  const escaped=new Set<number>();
  for(let i=0;i<1440;i++){
   sim.step();
   // Isolate this receiver: remove a marble only after its entire sphere has
   // left the column. A downstream peg/wheel queue is a different failure and
   // otherwise backs up into the inlet, invalidating this local flow test.
   // The full-maze regression below retains every marble normally.
   for(const m of sim.marbleStates())if(Math.hypot(m.position.x-x,m.position.z-z)>CONNECTOR.postDiameter/2+MARBLE_RADIUS_MM&&m.position.y<shoulder+8&&m.position.y>150){
    escaped.add(m.id);sim.removeMarble(m.id);
   }
   if(escaped.size===count)break;
  }
  const positions=sim.marblePositions().map(p=>p.toArray());sim.dispose();
  if(escaped.size!==count)failures.push(`${kind} ${port.id}: ${count}-marble column, phase ${phase}, cleared ${escaped.size}, remaining ${JSON.stringify(positions)}`);
  cases++;
 }
 console.log('Loaded downspout',failures.length===failuresBefore?'PASS':'FAIL',kind);
}
console.log(`${cases-failures.length}/${cases} loaded-column cases passed`);
for(const failure of failures)console.error(failure);
if(selected){assert.equal(failures.length,0,failures.join('\n'));process.exit(0);}
// Regression for the actual stack reported in the builder. Retain the world
// between batches: starting every run from a fresh solver missed this failure.
const preset=PRESETS.find(p=>p.id==='grand-tour')!,sim=await createAssemblyPhysics();
for(const kind of new Set(preset.pieces.map(p=>p.kind))){const data=await read(kind);sim.registerSurface(kind,data.parts??[data]);}
for(const p of preset.pieces)sim.add(p.id,p.kind,p.pose.position,new Quaternion().setFromAxisAngle(new Vector3(0,1,0),p.pose.yaw),true);
const gate=preset.pieces.find(p=>p.kind==='start')!;
let inletPasses=0,downstreamPasses=0;
for(let run=0;run<12;run++){
 sim.clearMarbles();assert.equal(sim.fillGate(gate.id),6);
 for(let i=0;i<240;i++)sim.step();sim.releaseGate(gate.id);
 const inletCleared=new Set<number>(),cleared=new Set<number>();
 for(let i=0;i<2520;i++){
  sim.step();for(const m of sim.marbleStates()){
   const [x,y,z]=gate.pose.position;
   if(Math.hypot(m.position.x-x,m.position.z-z)>CONNECTOR.postDiameter/2+MARBLE_RADIUS_MM&&m.position.y<y+8)inletCleared.add(m.id);
   if(m.position.y<y-30)cleared.add(m.id);
  }
 }
 // Keep the original downstream criterion as well as the specific inlet
 // regression. A ball can leave the receiver and stop at the split divider;
 // report that failure without misidentifying it as the original column jam.
 if(inletCleared.size===6)inletPasses++;
 else failures.push(`Gate release ${run+1}: only ${inletCleared.size}/6 exited the inlet column`);
 if(cleared.size===6)downstreamPasses++;
 else failures.push(`Gate release ${run+1}: downstream test failed, remaining ${JSON.stringify(sim.marbleStates().filter(m=>!cleared.has(m.id)).map(m=>m.position.toArray()))}`);
 console.log(`Gate release ${run+1}: ${inletCleared.size}/6 left inlet column; ${cleared.size}/6 passed downstream height`);
}
sim.dispose();console.log(`Repeated gate releases: ${inletPasses}/12 inlet passes, ${downstreamPasses}/12 downstream passes`);
assert.equal(failures.length,0,failures.join('\n'));
