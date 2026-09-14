import assert from 'node:assert/strict';
import {Triangle,Vector3} from 'three';
import {inputColumns} from '../src/assembly/drop';
// Configuration-space connectivity: a sphere center must stay at least its
// radius from BOTH the track and the uncut spacer seated above it.
const assetIndex=process.argv.indexOf('--assets'),assets=assetIndex<0?'src/generated':process.argv[assetIndex+1];
const spacer=await Bun.file('src/generated/spacer-collision.json').json();
const radius=7.95;
const closest=new Vector3();
for(const kind of ['ramp','snake','intersection','split','maze','bumper','paddle','hairpin','passing','funnel','finish','jump','coil']){
 const raw=await Bun.file(assets+'/'+(kind==='paddle'?'paddle-body':kind)+'-collision.json').json();
 for(const {port} of inputColumns(kind)){
  const [x,shoulder,z]=port.position;
  const triangles:Triangle[]=[];
  for(const [data,offset] of [...(raw.parts??[raw]).map((d:typeof raw)=>[d,new Vector3()]),[spacer,new Vector3(x,shoulder,z)]] as const){
   for(let i=0;i<data.indices.length;i+=3){
    const vertices=[0,1,2].map(j=>new Vector3().fromArray(data.vertices,data.indices[i+j]*3).add(offset));
    if(Math.min(...vertices.map(v=>v.x))<x+55&&Math.max(...vertices.map(v=>v.x))>x-55&&Math.min(...vertices.map(v=>v.z))<z+55&&Math.max(...vertices.map(v=>v.z))>z-55&&Math.min(...vertices.map(v=>v.y))<shoulder+40&&Math.max(...vertices.map(v=>v.y))>shoulder-45)
     triangles.push(new Triangle(...vertices as [Vector3,Vector3,Vector3]));
   }
  }

  const cache=new Map<string,number>();
  const clearance=(u:number,v:number,w:number)=>{
   const key=[u,v,w].join(',');if(cache.has(key))return cache.get(key)!;
   const center=new Vector3(x+u,shoulder+25-v,z+w);
   let distance=radius+.2;
   for(const t of triangles){
    const a=t.a,b=t.b,c=t.c;
    if(center.x+distance<Math.min(a.x,b.x,c.x)||center.x-distance>Math.max(a.x,b.x,c.x)||center.y+distance<Math.min(a.y,b.y,c.y)||center.y-distance>Math.max(a.y,b.y,c.y)||center.z+distance<Math.min(a.z,b.z,c.z)||center.z-distance>Math.max(a.z,b.z,c.z))continue;
    t.closestPointToPoint(center,closest);distance=Math.min(distance,closest.distanceTo(center));
   }
   cache.set(key,distance);return distance;
  };
  let landing=0;while(landing<65&&clearance(0,landing+1,0)>=radius+.05)landing++;
  const edgeSafe=(a:number[],b:number[],depth=0):boolean=>{
   const m=a.map((v,i)=>(v+b[i])/2),length=Math.hypot(...a.map((v,i)=>v-b[i]));
   const d=clearance(m[0],m[1],m[2]);
   if(d>=radius+length/2+.001)return true;
   if(d<radius||depth===8)return false;
   return edgeSafe(a,m,depth+1)&&edgeSafe(m,b,depth+1);
  };
  const queue:[number,number,number][]=[[0,landing,0]],visited=new Set<string>(['0,'+landing+',0']);
  let found=false;
  for(let i=0;i<queue.length;i++){
   const [u,v,w]=queue[i];if(Math.hypot(u,w)>23&&v>25){found=true;break;}
   for(const [du,dv,dw] of [[-1,0,0],[1,0,0],[0,1,0],[0,0,-1],[0,0,1]]){
    const nu=u+du,nv=v+dv,nw=w+dw,key=[nu,nv,nw].join(',');
    if(Math.abs(nu)>26||Math.abs(nw)>26||nv<0||nv>65||visited.has(key))continue;
    if(nv<25&&Math.hypot(nu,nw)>1.5)continue;
    if(clearance(nu,nv,nw)<radius+.05||!edgeSafe([u,v,w],[nu,nv,nw]))continue;
    visited.add(key);queue.push([nu,nv,nw]);
   }
  }
  assert(found,kind+' '+port.id+' has no downhill swept-sphere route');
  console.log(kind,port.id,found?'PASS: gravity descent from rest':'FAIL: uphill lip or obstruction',triangles.length,'local triangles');
  
 }
}
