import type {Manifold} from 'manifold-3d';
import {loadSolidKernel} from '../src/pieces/solid-kernel';
import {CONNECTOR,PART_UNITS,connectorLevels} from '../src/pieces/marbleworks-spec';
import {buildRampSolid,STANDARD_RAMP} from '../src/pieces/standard-ramp';
import {buildFunnelSolid,FUNNEL} from '../src/pieces/funnel';
import {buildSpacerSolid} from '../src/pieces/spacer';
import {BASE} from '../src/pieces/base';
const k=await loadSolidKernel(),spacer=buildSpacerSolid(k);
const assetIndex=process.argv.indexOf('--assets'),assets=assetIndex<0?'src/generated':process.argv[assetIndex+1];
async function cached(name:string){
 const candidate=Bun.file(`${assets}/${name}.bin`);
 const a=await (await candidate.exists()?candidate:Bun.file(`src/generated/${name}.bin`)).arrayBuffer(),[nv,ni]=new Uint32Array(a,0,2);
 const mesh=new k.Mesh({numProp:3,vertProperties:new Float32Array(a,8,nv*3),triVerts:new Uint32Array(a,8+nv*24,ni)});mesh.merge();return new k.Manifold(mesh);
}
type Port={x:number;z:number;units:number;male?:boolean;female?:boolean};
const span=PART_UNITS.portSpan,arm=span/Math.sqrt(3),run=STANDARD_RAMP.centersAlongTrack/2;
const ends=(units=0):Port[]=>[{x:-span/2,z:0,units},{x:span/2,z:0,units:0}];
const rows:{name:string;solid:Manifold;ports:Port[]}[]=[
 {name:'coil',solid:await cached('coil'),ports:[{x:-span/2,z:0,units:2,female:false},{x:span/2,z:0,units:0,male:false}]},
 {name:'starter funnel',solid:await cached('starter-funnel'),ports:[{x:0,z:0,units:0,male:false}]},
 {name:'start',solid:await cached('start-body'),ports:[{x:0,z:0,units:0,male:false}]},
 {name:'hairpin',solid:await cached('hairpin'),ports:ends(1)},
 {name:'passing',solid:await cached('passing'),ports:ends()},
 {name:'finish',solid:await cached('finish'),ports:[{x:0,z:0,units:0}]},
 {name:'split',solid:await cached('split'),ports:[0,2*Math.PI/3,4*Math.PI/3].map(a=>({x:arm*Math.cos(a),z:arm*Math.sin(a),units:0}))},
 {name:'jump',solid:await cached('jump'),ports:[{x:-69,z:0,units:2},{x:69,z:24,units:0}]},
 {name:'landing',solid:await cached('landing'),ports:[{x:-55,z:0,units:0}]},
 {name:'base',solid:await cached('base'),ports:[{x:BASE.postX,z:0,units:0,female:false}]},
 {name:'spacer',solid:spacer,ports:[{x:0,z:0,units:0}]},
 {name:'standard ramp',solid:buildRampSolid(k),ports:[{x:-run,z:-24,units:0},{x:run,z:0,units:0}]},
 {name:'funnel',solid:buildFunnelSolid(k),ports:[{x:-FUNNEL.centersAlongTrack,z:-FUNNEL.centersAcrossTrack,units:1},{x:0,z:0,units:0,male:false}]},
 {name:'snake',solid:await cached('snake'),ports:ends()},
 {name:'maze',solid:await cached('maze'),ports:ends()},
 {name:'bumper',solid:await cached('bumper'),ports:ends()},
 {name:'intersection',solid:await cached('intersection'),ports:[0,2*Math.PI/3,4*Math.PI/3].map(a=>({x:arm*Math.cos(a),z:arm*Math.sin(a),units:0}))},
 {name:'paddle',solid:await cached('paddle-body'),ports:[{x:-run,z:-24,units:1},{x:run,z:0,units:0}]},
];
const results=[],errors:string[]=[];
for(const {name,solid,ports} of rows){
 const m=solid.getMesh();
 for(const port of ports){
  const levels=connectorLevels(port.units);let top=-Infinity,bottom=Infinity,seat=0;
  for(let i=0;i<m.vertProperties.length;i+=m.numProp){const [x,y,z]=m.vertProperties.slice(i,i+3),r=Math.hypot(x-port.x,z-port.z);
   if(r>10&&r<13.6){top=Math.max(top,y);bottom=Math.min(bottom,y);if(Math.abs(y-levels.shoulder)<.003&&r>12.2)seat++;}
  }
  if(port.male!==false&&(Math.abs(top-levels.top)>.015||!seat))throw new Error(`${name}: wrong tip/seat ${JSON.stringify({top,expected:levels.top,seat})}`);
  if(port.female!==false&&Math.abs(bottom-levels.bottom)>.015)throw new Error(`${name}: socket bottom ${bottom} != grid ${levels.bottom}`);
  const fits:{side:string;overlap:number}[]=[];
  for(const side of ['above','below']){
   if((side==='above'&&port.male===false)||(side==='below'&&port.female===false))continue;
   const y=side==='above'?levels.shoulder:levels.bottom-PART_UNITS.stackRise;
   const mate=spacer.translate([port.x,y,port.z]),overlap=solid.intersect(mate),volume=Math.abs(overlap.volume());
   overlap.delete();mate.delete();fits.push({side,overlap:volume});
   if(volume>.05)errors.push(`${name} (${port.x},${port.z}): ${side} spacer interferes by ${volume} mm3`);
  }
  // The same socket placed above a base + N spacers must land on the grid.
  for(let n=0;n<=4;n++){
   const placedBottom=connectorLevels(n).shoulder;
   const seatY=placedBottom+levels.shoulder;
   if(Math.abs(seatY/PART_UNITS.stackRise-Math.round(seatY/PART_UNITS.stackRise))>1e-9)throw new Error('Accumulated stacking drift');
  }
  results.push({piece:name,port:[port.x,port.z],bottom:levels.bottom,shoulder:port.male===false?null:levels.shoulder,tip:port.male===false?null:top,fits});
 }
 console.log(`${name}: ${ports.length} ports aligned`);
}
if(errors.length)throw new Error(errors.join("\n"));
await Bun.write(`${assets}/component-alignment.json`,JSON.stringify({rise:PART_UNITS.stackRise,insertion:PART_UNITS.insertionDepth,ports:results},null,2));
rows.forEach(r=>r.solid.delete());console.log(`${results.length} ports checked, including physical spacer fits above and below`);
