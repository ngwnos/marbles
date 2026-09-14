import {loadSolidKernel} from '../src/pieces/solid-kernel';
import {buildSplitSolid,splitGeometry} from '../src/pieces/split';
import {encodePreviewMesh} from '../src/geometry/preview-mesh';
import {auditRenderMesh,auditCylindricalJoinSheets} from '../tests/mesh-quality';
const k=await loadSolidKernel(),s=buildSplitSolid(k);
console.log(s.status(),s.numTri(),s.volume());
const parts=s.decompose();console.log('components',parts.map(p=>p.volume()));parts.forEach(p=>p.delete());
if(s.status()!=='NoError'||parts.length!==1)throw new Error('Split must be one manifold');

for(const angle of [0,2*Math.PI/3,4*Math.PI/3])console.log(auditCylindricalJoinSheets(s,{x:80.87026606879152*Math.cos(angle),z:80.87026606879152*Math.sin(angle),minY:25,maxY:47,innerRadius:10.5,outerRadius:13.55}));
const g=splitGeometry(s);console.log(auditRenderMesh(s,g));
await Bun.write('src/generated/split.bin',encodePreviewMesh(g));
const simple=s.simplify(.04),m=simple.getMesh();
await Bun.write('src/generated/split-collision.json',JSON.stringify({vertices:Array.from(m.vertProperties),indices:Array.from(m.triVerts)}));
simple.delete();s.delete();g.dispose();
