import assert from 'node:assert/strict';
import {Quaternion} from 'three/webgpu';
import {createAssemblyPhysics} from '../src/assembly/physics';
import {inputColumns} from '../src/assembly/drop';
import {PART_BY_ID,type V3} from '../src/assembly/catalog';
import {PART_UNITS} from '../src/pieces/marbleworks-spec';

const kinds=['ramp','snake','funnel','intersection','maze','bumper','split','hairpin','passing','finish','jump','coil'];
const assetIndex=process.argv.indexOf('--assets'),assets=assetIndex<0?'src/generated':process.argv[assetIndex+1];
const partIndex=process.argv.indexOf('--part'),selected=partIndex<0?undefined:process.argv[partIndex+1];
const spacer=await Bun.file('src/generated/spacer-collision.json').json();
let cases=0;
for(const kind of selected?[selected]:kinds){
 const data=await Bun.file(`${assets}/${kind}-collision.json`).json();
 for(const inlet of inputColumns(kind))for(const offset of [[0,0],[1.5,0],[-1.5,0],[0,1.5],[0,-1.5]]){
  const sim=await createAssemblyPhysics();sim.registerSurface(kind,'parts' in data?data.parts:[data]);sim.registerSurface('spacer',[spacer]);
  sim.add(1,kind,[0,200,0],new Quaternion(),true);
  // Both sides must remain usable: an upper spacer covers the inlet while
  // seated lower spacers occupy the sockets under the track.
  let id=2;
  for(const port of PART_BY_ID[kind].ports.filter(p=>p.axis===-1))
   sim.add(id++,'spacer',[port.position[0],200+port.position[1]-PART_UNITS.stackRise,port.position[2]],new Quaternion(),true);
  sim.add(id++,'spacer',[inlet.port.position[0],200+inlet.port.position[1],inlet.port.position[2]],new Quaternion(),true);
  const spawn:V3=[inlet.position[0]+offset[0],200+inlet.port.position[1]+82,inlet.position[2]+offset[1]];
  sim.dropMarble(spawn);let cleared=false;
  for(let i=0;i<720;i++){
   sim.step();const p=sim.marblePositions()[0];
   if(p.y>150&&Math.hypot(p.x-inlet.position[0],p.z-inlet.position[2])>23){cleared=true;break;}
  }
  const final=sim.marblePositions()[0].toArray();sim.dispose();
  assert(cleared,`${kind} ${inlet.port.id} offset ${offset} trapped a marble at ${final}`);
  cases++;
 }
 console.log('PASS stacked entrance',kind);
}
console.log(`${cases} stacked entrance drops passed, with upper and lower spacers installed.`);
