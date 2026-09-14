import type {CrossSection,ManifoldToplevel,Vec2} from 'manifold-3d';

/** A constant-radius roll around both exposed ends of an extruded profile.
 * Shared boundary vertices join the planar caps, bevels and walls watertightly.
 * The section's inward offsets must remain simple at the requested radius.
 */
export function roundedExtrusion(k:ManifoldToplevel,section:CrossSection,height:number,radius:number){
 const simplified=section.simplify(.008);
 const contours=simplified.toPolygons();simplified.delete();
 const insetVectors=contours.map(c=>c.map((p,i):Vec2=>{
  const a=c[(i+c.length-1)%c.length],b=c[(i+1)%c.length];
  const l0=Math.hypot(p[0]-a[0],p[1]-a[1]),l1=Math.hypot(b[0]-p[0],b[1]-p[1]);
  const n0:Vec2=[-(p[1]-a[1])/l0,(p[0]-a[0])/l0],n1:Vec2=[-(b[1]-p[1])/l1,(b[0]-p[0])/l1];
  const d=1+n0[0]*n1[0]+n0[1]*n1[1];
  return [(n0[0]+n1[0])/d,(n0[1]+n1[1])/d];
 }));
 const steps=6,layers:{z:number,inset:number}[]=[];
 for(const sign of [-1,1])for(let j=0;j<=steps;j++){
  const phi=(sign<0?steps-j:j)/steps*Math.PI/2;
  layers.push({z:sign*(height/2-radius+radius*Math.sin(phi)),inset:radius*(1-Math.cos(phi))});
 }
 const vertices:number[]=[],indices:number[]=[],count=contours.reduce((s,c)=>s+c.length,0);
 for(const layer of layers)for(let c=0;c<contours.length;c++)for(let i=0;i<contours[c].length;i++){
  const p=contours[c][i],n=insetVectors[c][i];vertices.push(p[0]+n[0]*layer.inset,p[1]+n[1]*layer.inset,layer.z);
 }
 for(let l=0;l<layers.length-1;l++){
  let start=0;
  for(const c of contours){for(let j=0;j<c.length;j++){
   const a=l*count+start+j,b=l*count+start+(j+1)%c.length;
   indices.push(a,b,b+count,a,b+count,a+count);
  }start+=c.length;}
 }
 const capContours=contours.map((c,ci)=>c.map((p,i):Vec2=>[p[0]+radius*insetVectors[ci][i][0],p[1]+radius*insetVectors[ci][i][1]]));
 const top=(layers.length-1)*count;
 for(const [a,b,c] of k.triangulate(capContours))indices.push(c,b,a,a+top,b+top,c+top);
 const mesh=new k.Mesh({numProp:3,vertProperties:Float32Array.from(vertices),triVerts:Uint32Array.from(indices)});mesh.merge();
 const solid=new k.Manifold(mesh);
 if(solid.status()!=='NoError')throw new Error(`Rounded extrusion: ${solid.status()}`);
 return solid;
}
