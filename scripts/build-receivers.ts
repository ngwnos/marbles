import type {Manifold,ManifoldToplevel} from 'manifold-3d';
import type {BufferGeometry} from 'three/webgpu';
import {mkdir} from 'node:fs/promises';
import {loadSolidKernel} from '../src/pieces/solid-kernel';
import {encodePreviewMesh} from '../src/geometry/preview-mesh';
import {auditRenderMesh} from '../tests/mesh-quality';
import {buildRampSolid,rampSolidToGeometry} from '../src/pieces/standard-ramp';
import {buildSnakeSolid,snakeSolidToGeometry} from '../src/pieces/snake-solid';
import {buildFunnelSolid,funnelGeometry} from '../src/pieces/funnel';
import {buildIntersectionSolid,intersectionSolidToGeometry} from '../src/pieces/intersection';
import {buildSplitSolid,splitGeometry} from '../src/pieces/split';
import {buildMazeSolid,mazeGeometry} from '../src/pieces/maze';
import {buildBumperSolid,bumperGeometry} from '../src/pieces/bumper';
import {buildPaddleBody,paddleBodyGeometry} from '../src/pieces/paddle-wheel';
import {buildHairpinSolid,hairpinGeometry} from '../src/pieces/hairpin';
import {buildPassingSolid,passingGeometry} from '../src/pieces/passing';
import {buildFinishSolid,finishGeometry} from '../src/pieces/finish';
import {buildJumpSolid,jumpGeometry} from '../src/pieces/jump';
import {buildCoilSolid,coilGeometry} from '../src/pieces/coil';

// Rebuild both assets from the same solid; never let the preview and collider
// silently use different versions of a shared receiver.
const entries:Record<string,[(k:ManifoldToplevel)=>Manifold,(s:Manifold)=>BufferGeometry]>={
 split:[buildSplitSolid,splitGeometry],ramp:[buildRampSolid,rampSolidToGeometry],
 snake:[buildSnakeSolid,snakeSolidToGeometry],
 funnel:[buildFunnelSolid,funnelGeometry],
 intersection:[buildIntersectionSolid,intersectionSolidToGeometry],
 maze:[buildMazeSolid,mazeGeometry],bumper:[buildBumperSolid,bumperGeometry],
 'paddle-body':[buildPaddleBody,paddleBodyGeometry],hairpin:[buildHairpinSolid,hairpinGeometry],
 passing:[buildPassingSolid,passingGeometry],finish:[buildFinishSolid,finishGeometry],
 jump:[buildJumpSolid,jumpGeometry],coil:[buildCoilSolid,coilGeometry],
};
const outIndex=process.argv.indexOf('--out'),output=outIndex<0?'src/generated':process.argv[outIndex+1];
const names=process.argv.slice(2).filter((_,i)=>outIndex<0||i+2!==outIndex&&i+2!==outIndex+1);
for(const name of names)if(!(name in entries))throw new Error(`Unknown receiver part: ${name}`);
await mkdir(output,{recursive:true});const k=await loadSolidKernel();
for(const name of names.length?names:Object.keys(entries)){
 const started=performance.now(),[build,shade]=entries[name],solid=build(k);
 try{
  if(solid.status()!=='NoError')throw new Error(`${name}: ${solid.status()}`);
  const parts=solid.decompose(),count=parts.length,volumes=parts.map(p=>p.volume());parts.forEach(p=>p.delete());
  if(count!==1)throw new Error(`${name}: ${count} disconnected shells: ${volumes}`);
  const geometry=shade(solid);
  const audit=auditRenderMesh(solid,geometry);
  const collision=solid.simplify(.025),m=collision.getMesh();
  const vertices=Array.from({length:m.vertProperties.length/m.numProp},(_,i)=>Array.from(m.vertProperties.slice(i*m.numProp,i*m.numProp+3))).flat();
  await Bun.write(`${output}/${name}.bin`,encodePreviewMesh(geometry));
  await Bun.write(`${output}/${name}-collision.json`,JSON.stringify({vertices,indices:Array.from(m.triVerts)}));
  console.log(name,{...audit,triangles:solid.numTri(),collisionTriangles:collision.numTri(),seconds:+((performance.now()-started)/1000).toFixed(2)});
  geometry.dispose();collision.delete();
 }finally{solid.delete();}
}
