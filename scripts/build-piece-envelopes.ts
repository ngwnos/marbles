import {Vector3} from 'three/webgpu';
import {decodePreviewMesh} from '../src/geometry/preview-mesh';
import {convexEnvelope,clipPolygonAxis,type ConvexEnvelope} from '../src/geometry/convex-envelope';
import {PARTS} from '../src/assembly/catalog';
import {PADDLE,paddleAxleY} from '../src/pieces/paddle-wheel';
const result:Record<string,{hulls:ConvexEnvelope[];cores:ConvexEnvelope[];min:number[];max:number[];volume:number}>= {};
for(const part of [...PARTS,{id:'paddle-wheel'},{id:'start-rotor'}]){
 const g=decodePreviewMesh(await Bun.file(`src/generated/${part.id==='start'?'start-body':part.id==='paddle'?'paddle-body':part.id}.bin`).arrayBuffer());
 if(part.id==='paddle-wheel'){g.translate(-PADDLE.x,-paddleAxleY,-PADDLE.z);g.computeBoundingBox();}
 const bounds=g.boundingBox!,size=bounds.getSize(new Vector3()),axis=(['x','y','z'] as const).reduce((a,b)=>size[a]>size[b]?a:b);
 const slices=Math.max(1,Math.ceil(size[axis]/60)),cells:Vector3[][]=Array.from({length:slices},()=>[]),p=g.getAttribute('position'),ix=g.index!;
 let volume=0;
 for(let i=0;i<ix.count;i+=3){
  const tri=[0,1,2].map(j=>new Vector3().fromBufferAttribute(p,ix.getX(i+j))),lo=Math.min(...tri.map(v=>v[axis])),hi=Math.max(...tri.map(v=>v[axis]));
  volume+=tri[0].dot(tri[1].clone().cross(tri[2]))/6;
  for(let s=0;s<slices;s++){
   const a=bounds.min[axis]+size[axis]*s/slices,b=bounds.min[axis]+size[axis]*(s+1)/slices;if(hi<a||lo>b)continue;
   cells[s].push(...clipPolygonAxis(clipPolygonAxis(tri,axis,a,true),axis,b,false));
  }
 }
 const unique=cells.filter(p=>p.length).map(points=>[...new Map(points.map(p=>[p.toArray().map(v=>v.toFixed(4)).join(','),p])).values()]);
 // The contact skin absorbs solver compression. Independently certified
 // unpadded cores enclose the complete rendered surface for overlap audits.
 const hulls=unique.map(points=>convexEnvelope(points,1.5)),cores=unique.map(points=>convexEnvelope(points,0));
 result[part.id]={hulls,cores,min:bounds.min.toArray(),max:bounds.max.toArray(),volume:Math.abs(volume)};
 console.log(part.id,hulls.length,'envelopes',Math.max(...hulls.map(h=>h.vertices.length/3)),'max vertices');g.dispose();
}
await Bun.write('src/generated/piece-envelopes.json',JSON.stringify(result));
