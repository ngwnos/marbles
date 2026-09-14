import {Box3,Quaternion,Vector3} from 'three/webgpu';
import type {ConvexEnvelope} from '../geometry/convex-envelope';

export type WorldHull={vertices:Vector3[];normals:Vector3[];edges:Vector3[];bounds:Box3};
export function transformHull(h:ConvexEnvelope,position:Vector3,rotation:Quaternion):WorldHull{
 const read=(data:number[],point=false)=>Array.from({length:data.length/3},(_,i)=>{const p=new Vector3().fromArray(data,i*3).applyQuaternion(rotation);return point?p.add(position):p;});
 const vertices=read(h.vertices,true);return {vertices,normals:read(h.normals),edges:read(h.edges),bounds:new Box3().setFromPoints(vertices)};
}
/** Complete convex SAT, including edge cross products. Returns zero for a
 * separated pair, otherwise the least separating translation in millimeters. */
export function hullPenetration(a:WorldHull,b:WorldHull){
 if(!a.bounds.intersectsBox(b.bounds))return 0;let depth=Infinity;
 const test=(axis:Vector3)=>{
  const len=axis.length();if(len<1e-6)return true;axis.divideScalar(len);
  let amin=Infinity,amax=-Infinity,bmin=Infinity,bmax=-Infinity;
  for(const p of a.vertices){const d=p.dot(axis);amin=Math.min(amin,d);amax=Math.max(amax,d);}
  for(const p of b.vertices){const d=p.dot(axis);bmin=Math.min(bmin,d);bmax=Math.max(bmax,d);}
  const d=Math.min(amax-bmin,bmax-amin);if(d<=0){depth=0;return false;}depth=Math.min(depth,d);return true;
 };
 for(const n of [...a.normals,...b.normals])if(!test(n.clone()))return 0;
 for(const ae of a.edges)for(const be of b.edges)if(!test(ae.clone().cross(be)))return 0;
 return depth;
}
