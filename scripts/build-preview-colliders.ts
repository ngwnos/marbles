import {buildBaseSolid} from '../src/pieces/base';
import {loadSolidKernel} from '../src/pieces/solid-kernel';
import {buildRampSolid} from '../src/pieces/standard-ramp';
import {buildFunnelSolid} from '../src/pieces/funnel';
import {buildSpacerSolid} from '../src/pieces/spacer';
const k=await loadSolidKernel();
for(const name of ['paddle-body','intersection','snake','maze','bumper']){
 const a=await Bun.file(`src/generated/${name}.bin`).arrayBuffer(),[nv,ni]=new Uint32Array(a,0,2);
 const mesh=new k.Mesh({numProp:3,vertProperties:new Float32Array(a,8,nv*3),triVerts:new Uint32Array(a,8+nv*24,ni)});mesh.merge();
 const solid=new k.Manifold(mesh),original=solid.asOriginal(),simple=original.simplify(name==='maze'?.04:.08),m=simple.getMesh();
 console.log(name,solid.status(),solid.numTri(),simple.numTri());
 await Bun.write(`src/generated/${name}-collision.json`,JSON.stringify({vertices:Array.from({length:m.vertProperties.length/m.numProp},(_,i)=>Array.from(m.vertProperties.slice(i*m.numProp,i*m.numProp+3))).flat(),indices:Array.from(m.triVerts)}));
 simple.delete();original.delete();solid.delete();
}
for(const [name,build] of [['ramp',buildRampSolid],['funnel',buildFunnelSolid],['spacer',buildSpacerSolid],['base',(kernel:typeof k)=>buildBaseSolid(kernel,false)]] as const){
 const solid=build(k),original=solid.asOriginal(),simple=original.simplify(.08),m=simple.getMesh();
 console.log(name,solid.numTri(),simple.numTri());
 await Bun.write(`src/generated/${name}-collision.json`,JSON.stringify({vertices:Array.from({length:m.vertProperties.length/m.numProp},(_,i)=>Array.from(m.vertProperties.slice(i*m.numProp,i*m.numProp+3))).flat(),indices:Array.from(m.triVerts)}));
 simple.delete();original.delete();solid.delete();
}
