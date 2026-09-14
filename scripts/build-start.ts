import {loadSolidKernel} from '../src/pieces/solid-kernel';
import {buildStartBody,buildStartRotor,startGeometry,startRotorHulls,START} from '../src/pieces/start';
import {encodePreviewMesh} from '../src/geometry/preview-mesh';
import {auditRenderMesh} from '../tests/mesh-quality';
const k=await loadSolidKernel(),body=buildStartBody(k),rotor=buildStartRotor(k);
for(let i=0;i<=8;i++){
 const placed=rotor.rotate([0,0,START.releaseAngle*180/Math.PI*i/8]).translate([START.pivotX,START.pivotY,0]),overlap=body.intersect(placed);
 const v=overlap.volume();overlap.delete();placed.delete();if(v>.05)throw new Error(`Gate intersects body at release fraction ${i/8}: ${v} mm³`);
}
for(const [name,s] of [['start-body',body],['start-rotor',rotor]] as const){const g=startGeometry(s);console.log(name,s.status(),s.numTri(),auditRenderMesh(s,g));await Bun.write(`src/generated/${name}.bin`,encodePreviewMesh(g));g.dispose();}
const simple=body.simplify(.04),m=simple.getMesh();await Bun.write('src/generated/start-collision.json',JSON.stringify({vertices:Array.from(m.vertProperties),indices:Array.from(m.triVerts)}));simple.delete();
await Bun.write('src/generated/start-hulls.json',JSON.stringify(startRotorHulls()));
const moved=rotor.translate([START.pivotX,START.pivotY,0]),assembly=k.Manifold.union([body,moved]),g=startGeometry(assembly);
await Bun.write('src/generated/start.bin',encodePreviewMesh(g));g.dispose();assembly.delete();moved.delete();body.delete();rotor.delete();
