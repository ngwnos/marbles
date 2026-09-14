import {loadSolidKernel} from '../src/pieces/solid-kernel';
import {meshToGeometry} from '../src/pieces/solid-geometry';
import {buildStorageTubSolid} from '../src/assembly/storage-tub-solid';
import {encodePreviewMesh} from '../src/geometry/preview-mesh';
import {auditRenderMesh} from '../tests/mesh-quality';
const k=await loadSolidKernel(),solid=buildStorageTubSolid(k);
const parts=solid.decompose(),count=parts.length;parts.forEach(p=>p.delete());
if(solid.status()!=='NoError'||count!==1)throw new Error(`Tub shell: ${solid.status()}, ${count} components`);
// Both the shell and grips author their normals directly in the model frame.
// No run transforms need to be applied to these properties during export.
const geometry=meshToGeometry(solid.getMesh());geometry.normalizeNormals();
console.log('Tub',auditRenderMesh(solid,geometry),{triangles:solid.numTri(),volume:solid.volume()});
await Bun.write('src/generated/storage-tub.bin',encodePreviewMesh(geometry));
const simplified=solid.simplify(.15),m=simplified.getMesh();
const vertices=Array.from({length:m.vertProperties.length/m.numProp},(_,i)=>Array.from(m.vertProperties.slice(i*m.numProp,i*m.numProp+3))).flat();
await Bun.write('src/generated/storage-tub-collision.json',JSON.stringify({vertices,indices:Array.from(m.triVerts)}));
console.log('Tub collision',simplified.numTri(),'triangles');
geometry.dispose();simplified.delete();solid.delete();
