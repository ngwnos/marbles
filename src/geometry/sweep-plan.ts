import type {ManifoldToplevel,Vec2} from 'manifold-3d';
import {sweepSection} from './sweep-section';

/** Right-handed frame for a planar track. Height stays Y-up; positive section
 * width is the right rail. Reject folded/inverted solids before Boolean joins. */
export function sweepPlan(k:ManifoldToplevel,profile:Vec2[],length:number,segments:number,
 path:(u:number)=>{x:number;z:number;dx:number;dz:number},floor:(x:number,z:number)=>number){
 const s=sweepSection(k,profile,length,segments,v=>{
  const [w,h,u]=v,p=path(u),n=Math.hypot(p.dx,p.dz);
  v[0]=p.x+w*p.dz/n;v[2]=p.z-w*p.dx/n;v[1]=floor(v[0],v[2])+h;
 });
 if(s.status()!=='NoError'||s.volume()<=0){s.delete();throw new Error('Track sweep is folded or has inverted winding');}
 return s;
}
