import {mkdir,copyFile} from 'node:fs/promises';
import {decodePreviewMesh,encodePreviewMesh} from '../src/geometry/preview-mesh';
import {applyHairpinGeometryNormals,hairpinFloor,hairpinRunningFloor} from '../src/pieces/hairpin';
import {applyFunnelGeometryNormals,funnelTrackFloor,funnelRunningFloor} from '../src/pieces/funnel';
import {applySplitGeometryNormals,splitFloor,splitRunningFloor} from '../src/pieces/split';
import {applyPassingGeometryNormals,passingFloor,passingRunningFloor} from '../src/pieces/passing';
import {applyFinishGeometryNormals,finishFloor,finishRunningFloor,finishDeckNormals} from '../src/pieces/finish';
import {applyLandingGeometryNormals,landingFloor} from '../src/pieces/landing';
import {applyJumpGeometryNormals} from '../src/pieces/jump';
import {applyCoilGeometryNormals} from '../src/pieces/coil';
import {applyStartGeometryNormals,START} from '../src/pieces/start';
import {applyStarterFunnelGeometryNormals,STARTER_FUNNEL} from '../src/pieces/starter-funnel';
import {drainFloor} from '../src/pieces/drain-tray';
import {heightSurfaceNormals,type NormalSource} from '../src/geometry/mesh-normals';
import {auditParentSurfaceNormals} from '../tests/parent-surface-normals';
import type {BufferGeometry} from 'three/webgpu';
type Height=(x:number,z:number)=>number;
const entries:[string,(g:BufferGeometry)=>BufferGeometry,Height?,Height?,NormalSource[]?][]=[
 ['funnel',applyFunnelGeometryNormals,funnelTrackFloor,funnelRunningFloor],
 ['hairpin',applyHairpinGeometryNormals,hairpinFloor,hairpinRunningFloor],['split',applySplitGeometryNormals,splitFloor,splitRunningFloor],
 ['passing',applyPassingGeometryNormals,passingFloor,passingRunningFloor],['finish',applyFinishGeometryNormals,finishFloor,finishRunningFloor,[finishDeckNormals]],
 ['landing',applyLandingGeometryNormals,landingFloor],['jump',applyJumpGeometryNormals],['coil',applyCoilGeometryNormals],
 ['start-body',applyStartGeometryNormals,(x,z)=>drainFloor(x,z,{radius:START.radius,back:START.back,bumps:true})],
 ['start',applyStartGeometryNormals,(x,z)=>drainFloor(x,z,{radius:START.radius,back:START.back,bumps:true})],
 ['starter-funnel',applyStarterFunnelGeometryNormals,(x,z)=>drainFloor(x,z,{radius:STARTER_FUNNEL.radius,back:0})],
];
const report=[];
const assetIndex=process.argv.indexOf('--assets'),assets=assetIndex<0?'src/generated':process.argv[assetIndex+1];
const checkOnly=process.argv.includes('--check');
await mkdir('tmp/normals-before',{recursive:true});
for(const [name,shade,floor,running,extraSources=[]] of entries){
 const file=`${assets}/${name}.bin`;
 if(assets!=='src/generated'&&!await Bun.file(file).exists())continue;
 if(!checkOnly)await copyFile(file,`tmp/normals-before/${name}.bin`);
 const g=decodePreviewMesh(await Bun.file(file).arrayBuffer());
 const sources=[...(floor?[heightSurfaceNormals(running??floor),heightSurfaceNormals(floor,-1.5,-1)]:[]),...extraSources];
 const verify=(mesh:BufferGeometry)=>{
  const audit=auditParentSurfaceNormals(mesh,sources);
  // Vertex tangents should be exact. Interpolation across a curved surface
  // has a separate, looser tessellation budget, particularly at tray bumps.
  if(floor&&(audit.probes<100||audit.maxVertexAngle>.01||audit.maxAngle>5))
   throw new Error(`${name}: authored surface shading failed ${JSON.stringify(audit)}`);
  return audit;
 };
 if(checkOnly){console.log(name,verify(g));g.dispose();continue;}
 const result=shade(g.clone());
 // Normal refresh must preserve the geometric triangle soup exactly.
 const signature=(mesh:BufferGeometry)=>{const p=mesh.getAttribute('position'),i=mesh.index!;return Array.from({length:i.count/3},(_,t)=>[0,1,2].map(j=>{const id=i.getX(t*3+j);return [p.getX(id),p.getY(id),p.getZ(id)].join(',');}).sort().join('|')).sort().join(';');};
 if(signature(g)!==signature(result))throw new Error(`${name}: normal refresh changed geometry`);
 const before=auditParentSurfaceNormals(g,sources),after=verify(result);
 console.log(name,{before,after});report.push({name,before,after});
 await Bun.write(file,encodePreviewMesh(result));g.dispose();result.dispose();
}
if(!checkOnly)await Bun.write('tmp/checks/parent-surface-normal-results.json',JSON.stringify(report,null,2));
