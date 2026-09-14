import assert from 'node:assert/strict';
import {loadSolidKernel} from '../src/pieces/solid-kernel';
import {decodePreviewMesh} from '../src/geometry/preview-mesh';
import {inputColumns} from '../src/assembly/drop';
import {CONNECTOR,TRACK} from '../src/pieces/marbleworks-spec';
import {intersectionPorts} from '../src/pieces/intersection';
import {sampleSnake} from '../src/pieces/snake-solid';
import {bumperEntryAngle} from '../src/pieces/bumper';
import {COIL} from '../src/pieces/coil';

// A manifold can contain an unwanted hole. Probe the actual floor continuously
// across the mouth, in both the rendered skin and the physics collision mesh.
const arg=(name:string,fallback:string)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const assets=arg('--assets','src/generated'),selected=arg('--part','');
const k=await loadSolidKernel();let probes=0;
for(const kind of selected?[selected]:['ramp','snake','funnel','intersection','split','maze','bumper','paddle','hairpin','passing','finish','jump','coil']){
 const name=kind==='paddle'?'paddle-body':kind;
 const g=decodePreviewMesh(await Bun.file(`${assets}/${name}.bin`).arrayBuffer());
 const collision=await Bun.file(`${assets}/${name}-collision.json`).json();
 const data=[{label:'render',vertices:g.getAttribute('position').array,indices:g.index!.array},{label:'collision',...collision}];
 for(const {label,vertices,indices} of data){
  const mesh=new k.Mesh({numProp:3,vertProperties:Float32Array.from(vertices),triVerts:Uint32Array.from(indices)});mesh.merge();
  const solid=new k.Manifold(mesh);
  for(const {port} of inputColumns(kind)){
   const [px,shoulder,pz]=port.position;
   let angle=kind==='split'?Math.PI:kind==='hairpin'||kind==='coil'?Math.PI/2:kind==='bumper'?bumperEntryAngle:0;
   if(kind==='intersection')angle=intersectionPorts.find(p=>Math.hypot(p.x-px,p.z-pz)<.1)!.direction;
   for(let q=6;q<=16;q+=.25)for(let side=-3;side<=3;side++){
    let x=px+q*Math.cos(angle),z=pz+q*Math.sin(angle),dx=Math.cos(angle),dz=Math.sin(angle);
    if(kind==='snake')({x,z,dx,dz}=sampleSnake(q));
    if(kind==='hairpin'||kind==='coil'){
     const r=kind==='hairpin'?24:COIL.radius,a=q/r;
     x=px+r*(1-Math.cos(a));z=pz+r*Math.sin(a);dx=Math.sin(a);dz=Math.cos(a);
    }
    x-=side*dz;z+=side*dx;
    const hits=solid.rayCast([x,shoulder-.01,z],[x,shoulder-CONNECTOR.shoulderHeight-1,z]);
    const top=hits.find(h=>h.normal[1]>.1&&h.position[1]>shoulder-TRACK.channelDepth-TRACK.runDrop-4);
    assert(top,`${kind} ${label}: missing floor at distance ${q}, across ${side}, (${x}, ${z})`);
    const bottom=hits.find(h=>h.normal[1]<-.1&&h.position[1]<top.position[1]-.01);
    assert(bottom&&top.position[1]-bottom.position[1]>.2,`${kind} ${label}: floor has no material thickness at ${q}, ${side}`);
    probes++;
   }
  }
  solid.delete();
 }
 g.dispose();console.log('Continuous receiver floor PASS',kind);
}
console.log(`${probes} render/collider floor and thickness probes passed (connector radius ${CONNECTOR.postDiameter/2} mm)`);
