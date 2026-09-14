import type {CrossSection,ManifoldToplevel,Vec2} from 'manifold-3d';

/** Parallel closed contours, including holes, lofted through the shared channel
 * section. A single triangulated cap spans the whole footprint at each end. */
export function loftFootprint(k:ManifoldToplevel,footprint:CrossSection,levels:Vec2[],floor:(x:number,z:number)=>number){
 const contours=footprint.toPolygons();
 const outward=contours.map(c=>c.map((p,i):Vec2=>{
  const a=c[(i+c.length-1)%c.length],b=c[(i+1)%c.length],u=[p[0]-a[0],p[1]-a[1]],v=[b[0]-p[0],b[1]-p[1]];
  const lu=Math.hypot(...u),lv=Math.hypot(...v),n0=[u[1]/lu,-u[0]/lu],n1=[v[1]/lv,-v[0]/lv],d=1+n0[0]*n1[0]+n0[1]*n1[1];
  if(d<1e-5)throw new Error('Footprint has an unresolved cusp');
  return [(n0[0]+n1[0])/d,(n0[1]+n1[1])/d];
 }));
 const rings=levels.map(([w])=>contours.map((c,j)=>c.map((p,i):Vec2=>[p[0]+(w-10)*outward[j][i][0],p[1]+(w-10)*outward[j][i][1]])));
 const count=contours.reduce((n,c)=>n+c.length,0),vertices:number[]=[],indices:number[]=[];
 rings.forEach((cs,j)=>cs.forEach(c=>c.forEach(([x,z])=>vertices.push(x,floor(x,z)+levels[j][1],z))));
 for(let layer=0;layer<levels.length-1;layer++){
  let start=0;for(const c of contours){for(let i=0;i<c.length;i++){
   const a=layer*count+start+i,b=layer*count+start+(i+1)%c.length;indices.push(a,a+count,b+count,a,b+count,b);
  }start+=c.length;}
 }
 for(const j of [0,levels.length-1])for(const [a,b,c] of k.triangulate(rings[j])){
  const n=j*count;indices.push(...(j===0?[a+n,b+n,c+n]:[c+n,b+n,a+n]));
 }
 const solid=new k.Manifold(new k.Mesh({numProp:3,vertProperties:Float32Array.from(vertices),triVerts:Uint32Array.from(indices)}));
 if(solid.status()!=='NoError'||solid.volume()<=0){solid.delete();throw new Error('Invalid footprint loft');}return solid;
}
