import {Vector3} from 'three/webgpu';
import {decodePreviewMesh} from '../src/geometry/preview-mesh';
import {clipPolygonAxis,clipPolygonPlane,convexEnvelope} from '../src/geometry/convex-envelope';
import {STORAGE_TUB as D,tubWallDraft} from '../src/assembly/storage-tub-spec';

// Angular wall sectors keep the cavity open. Vertical bands preserve the
// bottom roundover and upper collar instead of spanning them with one hull.
const g=decodePreviewMesh(await Bun.file('src/generated/storage-tub.bin').arrayBuffer());
const p=g.getAttribute('position'),ix=g.index!,sectors=24,levels=[D.wall,14,326,342,D.height+.01];
const cells:Vector3[][]=Array.from({length:sectors*(levels.length-1)},()=>[]),floor:Vector3[]=[];
for(let i=0;i<ix.count;i+=3){
 const tri=[0,1,2].map(j=>new Vector3().fromBufferAttribute(p,ix.getX(i+j))),min=Math.min(...tri.map(p=>p.y)),max=Math.max(...tri.map(p=>p.y));
 if(max<=D.wall+.0001){floor.push(...tri);continue;}
 const angles=tri.map(p=>(Math.atan2(p.z,p.x)/(Math.PI*2)+1)%1*sectors),first=angles[0];
 const unwrapped=angles.map(a=>first+((a-first+sectors*1.5)%sectors-sectors/2));
 for(let n=Math.floor(Math.min(...unwrapped));n<=Math.floor(Math.max(...unwrapped));n++){
  const sector=(n+sectors)%sectors,a=sector*Math.PI*2/sectors,b=(sector+1)*Math.PI*2/sectors;
  let polygon=clipPolygonPlane(tri,new Vector3(-Math.sin(a),0,Math.cos(a)),0);
  polygon=clipPolygonPlane(polygon,new Vector3(Math.sin(b),0,-Math.cos(b)),0);
  if(polygon.length<3)continue;
  for(let y=0;y<levels.length-1;y++)if(max>levels[y]&&min<levels[y+1])cells[sector*(levels.length-1)+y].push(...clipPolygonAxis(clipPolygonAxis(polygon,'y',levels[y],true),'y',levels[y+1],false));
 }
}
// Preserve the shallow wall drafts: the generic 26 axes alone can extend
// a hull below the wall during tipping and create false floor contacts.
const wallNormals=[-1,1].flatMap(s=>[new Vector3(s,-tubWallDraft.x,0).normalize(),new Vector3(0,-tubWallDraft.z,s).normalize()]);
const hulls=[floor,...cells].filter(p=>p.length).map(points=>convexEnvelope([...new Map(points.map(p=>[p.toArray().map(v=>v.toFixed(4)).join(','),p])).values()],D.contactSkin,wallNormals));
await Bun.write('src/generated/storage-tub-envelopes.json',JSON.stringify(hulls));
console.log(hulls.length,'convex tub sections, enclosing the rendered shell');g.dispose();
