import {auditExitBore} from '../tests/exit-bore';
import {auditTrackReceivers} from '../tests/track-receivers';
import {loadSolidKernel} from '../src/pieces/solid-kernel';
import {buildIntersectionSolid,intersectionSolidToGeometry,intersectionPorts,intersectionFloor} from '../src/pieces/intersection';
import {auditRenderMesh} from '../tests/mesh-quality';
import {auditCConnectors} from '../tests/c-connector';
const started=performance.now();
const solid=buildIntersectionSolid(await loadSolidKernel());
try {
  if(solid.status()!=='NoError')throw new Error(solid.status());
  const parts=solid.decompose();const count=parts.length;parts.forEach(p=>p.delete());
  if(count!==1)throw new Error(`Disconnected part: ${count}`);
  console.log(auditExitBore(solid,intersectionPorts[0]));
  console.log(auditCConnectors(solid,intersectionPorts));
  console.log(auditTrackReceivers(solid,intersectionPorts,intersectionFloor));
  const geometry=intersectionSolidToGeometry(solid);
  console.log(auditRenderMesh(solid,geometry));
  const positions=geometry.getAttribute('position').array as Float32Array;
  const normals=geometry.getAttribute('normal').array as Float32Array;
  const indices=new Uint32Array(geometry.index!.array);
  const bytes=new Uint8Array(8+positions.byteLength+normals.byteLength+indices.byteLength);
  bytes.set(new Uint8Array(new Uint32Array([positions.length/3,indices.length]).buffer));
  let offset=8;
  for(const array of [positions,normals,indices]){bytes.set(new Uint8Array(array.buffer,array.byteOffset,array.byteLength),offset);offset+=array.byteLength;}
  let probes=0;
  for(const p of intersectionPorts) {
    for(let i=0;i<50;i++) {
      const t=i/50,x=p.x*t,z=p.z*t;
      if(p.outlet&&Math.hypot(x-p.x,z-p.z)<13)continue;
      const y=intersectionFloor(x),hits=solid.rayCast([x,y+1,z],[x,y-.3,z]);
      if(hits.length!==1||Math.abs(hits[0].position[1]-y)>.02)throw new Error(`Broken channel at ${x},${z}, expected y=${y}: ${JSON.stringify(hits.map(h=>({position:h.position,normal:h.normal})))}`);
      probes++;
    }
    const hits=solid.rayCast([p.x,70,p.z],[p.x,-1,p.z]);
    if(hits.length!==(p.outlet?0:2))throw new Error('Wrong inlet/outlet topology');
  }
  console.log({bedProbes:probes,triangles:solid.numTri(),components:count});
  await Bun.write(new URL('../src/generated/intersection.bin',import.meta.url),bytes);
  geometry.dispose();console.log(`Built and checked in ${((performance.now()-started)/1000).toFixed(1)}s`);
} finally {solid.delete();}
