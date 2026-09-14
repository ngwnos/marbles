import {Vector3} from 'three/webgpu';
import {ConvexHull} from 'three/addons/math/ConvexHull.js';

export type ConvexEnvelope={vertices:number[];normals:number[];edges:number[];volume:number};
const directions:Vector3[]=[];
for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)if(x||y||z)directions.push(new Vector3(x,y,z).normalize());

/** Circumscribed directional hull: unlike selecting extreme input vertices,
 * every input point is enclosed, including between sampled directions. */
export function convexEnvelope(points:Vector3[],padding=.6,additionalDirections:Vector3[]=[]):ConvexEnvelope{
 const planes=[...directions,...additionalDirections].map(n=>({n,d:Math.max(...points.map(p=>p.dot(n)))+padding}));
 const vertices:Vector3[]=[],seen=new Set<string>();
 for(let a=0;a<planes.length;a++)for(let b=a+1;b<planes.length;b++)for(let c=b+1;c<planes.length;c++){
  const A=planes[a],B=planes[b],C=planes[c],bc=B.n.clone().cross(C.n),det=A.n.dot(bc);if(Math.abs(det)<1e-6)continue;
  const p=bc.multiplyScalar(A.d).addScaledVector(C.n.clone().cross(A.n),B.d).addScaledVector(A.n.clone().cross(B.n),C.d).divideScalar(det);
  if(planes.some(h=>p.dot(h.n)>h.d+1e-5))continue;
  const key=p.toArray().map(v=>v.toFixed(4)).join(',');if(!seen.has(key)){seen.add(key);vertices.push(p);}
 }
 if(vertices.length<4)throw new Error('Empty envelope');
 const hull=new ConvexHull().setFromPoints(vertices),axes=new Map<string,Vector3>(),edges=new Map<string,Vector3>();let volume=0;
 const add=(map:Map<string,Vector3>,v:Vector3)=>{v.normalize();if(v.x< -1e-6||Math.abs(v.x)<1e-6&&v.y< -1e-6||Math.abs(v.x)<1e-6&&Math.abs(v.y)<1e-6&&v.z<0)v.negate();map.set(v.toArray().map(x=>x.toFixed(5)).join(','),v);};
 for(const f of hull.faces){
  add(axes,f.normal.clone());let e=f.edge;const face:Vector3[]=[];
  do{face.push(e.head().point);if(e.twin.face.normal.dot(f.normal)<.99999)add(edges,e.head().point.clone().sub(e.tail().point));e=e.next;}while(e!==f.edge);
  for(let i=1;i<face.length-1;i++)volume+=face[0].dot(face[i].clone().cross(face[i+1]))/6;
 }
 // Certify the entire source surface is contained by this convex region.
 for(const p of points)for(const f of hull.faces)if(f.normal.dot(p)-f.constant>1e-4)throw new Error('Envelope excludes source geometry');
 return {vertices:vertices.flatMap(p=>p.toArray()),normals:[...axes.values()].flatMap(p=>p.toArray()),edges:[...edges.values()].flatMap(p=>p.toArray()),volume};
}

export function clipPolygonAxis(polygon:Vector3[],axis:'x'|'y'|'z',limit:number,keepAbove:boolean){
 const normal=new Vector3();normal[axis]=keepAbove?1:-1;
 return clipPolygonPlane(polygon,normal,limit*(keepAbove?1:-1));
}
export function clipPolygonPlane(polygon:Vector3[],normal:Vector3,limit:number){
 const result:Vector3[]=[];
 for(let i=0;i<polygon.length;i++){
  const a=polygon[i],b=polygon[(i+1)%polygon.length],da=a.dot(normal)-limit,db=b.dot(normal)-limit;
  if(da>=0)result.push(a);
  if((da<0)!==(db<0))result.push(a.clone().lerp(b,da/(da-db)));
 }
 return result;
}
