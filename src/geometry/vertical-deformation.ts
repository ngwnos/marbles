import type {Manifold} from 'manifold-3d';

/** Deform one continuous shell and transport authored normals with it. */
export function deformVertical(solid:Manifold,lift:(x:number,y:number,z:number)=>number,maxEdge:number){
 const refined=solid.refineToLength(maxEdge);
 const shaded=refined.numProp()>=3?refined.setProperties(refined.numProp(),(next,p,old)=>{
  for(let i=0;i<old.length;i++)next[i]=old[i];
  const e=.001,gradient=[0,1,2].map(axis=>{
   const a=[...p],b=[...p];a[axis]+=e;b[axis]-=e;
   return (lift(a[0],a[1],a[2])-lift(b[0],b[1],b[2]))/(2*e);
  });
  const y=old[1]/(1+gradient[1]),x=old[0]-gradient[0]*y,z=old[2]-gradient[2]*y,length=Math.hypot(x,y,z);
  if(length>0){next[0]=x/length;next[1]=y/length;next[2]=z/length;}
 }):refined;
 const result=shaded.warp(v=>{v[1]+=lift(v[0],v[1],v[2]);});
 if(shaded!==refined)shaded.delete();refined.delete();return result;
}
