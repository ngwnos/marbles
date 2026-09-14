import {loadSolidKernel} from '../src/pieces/solid-kernel';
import {buildStarterFunnelSolid,starterFunnelGeometry} from '../src/pieces/starter-funnel';
import {encodePreviewMesh} from '../src/geometry/preview-mesh';
import {auditRenderMesh} from '../tests/mesh-quality';
const k=await loadSolidKernel(),s=buildStarterFunnelSolid(k);
console.log(s.status(),s.numTri(),s.volume());
const parts=s.decompose();console.log('components',parts.map(p=>p.volume()));parts.forEach(p=>p.delete());
if(s.status()!=='NoError'||parts.length!==1)throw new Error('Starter funnel must be one manifold');

const g=starterFunnelGeometry(s);console.log(auditRenderMesh(s,g));
await Bun.write('src/generated/starter-funnel.bin',encodePreviewMesh(g));
const simple=s.simplify(.04),m=simple.getMesh();
await Bun.write('src/generated/starter-funnel-collision.json',JSON.stringify({vertices:Array.from(m.vertProperties),indices:Array.from(m.triVerts)}));
simple.delete();s.delete();g.dispose();
