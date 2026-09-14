import {Vector3,Mesh,Raycaster,type BufferGeometry} from 'three/webgpu';
import type {NormalSource} from '../src/geometry/mesh-normals';
import {heightSurfaceNormals} from '../src/geometry/mesh-normals';

/** Probe a designed patch independently of triangle classification. A malformed
 * face must fail its geometric/normal contract rather than silently be skipped. */
export function auditHeightSurfaceSamples(g:BufferGeometry,height:(x:number,z:number)=>number,samples:readonly (readonly [number,number])[]){
 const mesh=new Mesh(g),ray=new Raycaster(),down=new Vector3(0,-1,0),source=heightSurfaceNormals(height);
 if(!g.boundingBox)g.computeBoundingBox();
 let missing=0,maxHeightError=0,maxNormalAngle=0;
 for(const [x,z] of samples){
  const y=height(x,z);ray.set(new Vector3(x,Math.max(y,g.boundingBox!.max.y)+1,z),down);
  const hit=ray.intersectObject(mesh)[0];
  if(!hit){missing++;continue;}
  maxHeightError=Math.max(maxHeightError,Math.abs(hit.point.y-y));
  maxNormalAngle=Math.max(maxNormalAngle,hit.normal!.angleTo(source.normal(hit.point))*180/Math.PI);
 }
 (mesh.material as import('three/webgpu').Material).dispose();
 return {probes:samples.length,missing,maxHeightError,maxNormalAngle};
}

/** Probe actual interpolated normals, not merely finite/unit-length vectors.
 * This catches triangular shading patches on unchanged authored surfaces. */
export function auditParentSurfaceNormals(g:BufferGeometry,sources:NormalSource[]) {
 const p=g.getAttribute('position'),n=g.getAttribute('normal'),idx=g.index!;
 let probes=0,maxAngle=0,maxVertexAngle=0;
 for(let t=0;t<idx.count;t+=3){
  const ids=[0,1,2].map(j=>idx.getX(t+j));
  const points=ids.map(i=>new Vector3().fromBufferAttribute(p,i));
  const face=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
  const source=sources.find(s=>s.matches(points,face));if(!source)continue;
  ids.forEach((id,j)=>{
   const actual=new Vector3().fromBufferAttribute(n,id).normalize();
   maxVertexAngle=Math.max(maxVertexAngle,Math.acos(Math.max(-1,Math.min(1,actual.dot(source.normal(points[j])))))*180/Math.PI);
  });
  for(const weights of [[1/3,1/3,1/3],[.8,.1,.1],[.1,.8,.1],[.1,.1,.8]]){
   const point=new Vector3(),actual=new Vector3();
   ids.forEach((id,j)=>{point.addScaledVector(points[j],weights[j]);actual.addScaledVector(new Vector3().fromBufferAttribute(n,id),weights[j]);});
   const angle=Math.acos(Math.max(-1,Math.min(1,actual.normalize().dot(source.normal(point)))))*180/Math.PI;
   maxAngle=Math.max(maxAngle,angle);probes++;
  }
 }
 return {probes,maxAngle,maxVertexAngle};
}
