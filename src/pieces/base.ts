import {MathUtils} from 'three/webgpu';
import type {ManifoldToplevel,Vec2} from 'manifold-3d';
import {contourSolid} from '../geometry/contour-solid';
import {roundedCSection} from '../geometry/c-section';
import {angleWeightedNormals,cylinderNormals,heightSurfaceNormals} from '../geometry/mesh-normals';
import {solidToGeometry} from './solid-geometry';
import {CONNECTOR,connectorLevels,arc} from './marbleworks-spec';
export const BASE={width:72,length:80,floor:2.5,rim:12.25,postX:-12,postHeight:connectorLevels().top,shoulder:connectorLevels().shoulder,opening:2*Math.asin((17+(CONNECTOR.postDiameter-CONNECTOR.boreDiameter)/2)/((CONNECTOR.postDiameter+CONNECTOR.boreDiameter)/2))};
/** The post opens toward -X; the broad collecting area is toward +X.
 * A smooth raised inlet sends the ball backward first. The tray grade then
 * carries it around the post and forward; a small crossfall avoids a dead
 * center directly behind the post.
 */
export function baseFloor(x:number,z:number){
 return BASE.floor+.04*(40-x)+3*Math.exp(-(((x+5)/16)**2+(z/15)**2))+.08*(z+30);
}
// Photo-fitted shallow elliptical end; use true parallel offsets for the rim.
export function baseContour(offset:number):Vec2[]{return [
 ...Array.from({length:129},(_,i):Vec2=>{
  const a=Math.PI/2+i*Math.PI/128,c=Math.cos(a),s=Math.sin(a),n=Math.hypot(c/27,s/36);
  return [-13+27*c+offset*c/27/n,36*s+offset*s/36/n];
 }),
 ...arc(22,-18,18+offset,-Math.PI/2,0,48),
 ...arc(22,18,18+offset,0,Math.PI/2,48),
];}
export function buildBaseSolid(k:ManifoldToplevel,includeUndersideCoring=true){
 const keepers:{delete():void}[]=[],keep=<T extends {delete():void}>(s:T)=>{keepers.push(s);return s;};
 const outside:Vec2[]=[[0,0],[0,11],...arc(-1.25,11,1.25,0,Math.PI/2).slice(1)];
 const inside:Vec2[]=[...arc(-8,8,5.5,-Math.PI/2,0),[-2.5,11],...arc(-1.25,11,1.25,Math.PI,Math.PI/2).slice(1),[-1.25,100]];
 const mold=keep(contourSolid(k,outside,baseContour,()=>0));
 const core=keep(contourSolid(k,inside,baseContour,()=>0));
 const underside=keep(contourSolid(k,[[-1.5,-5],...arc(-7,-4.5,5.5,0,Math.PI/2)],baseContour,()=>0));
 const tray=keep(keep(mold.subtract(core)).subtract(underside));
 // Full C-shaped post, including a tangent foot fillet on both faces and tips.
 const body:Vec2[]=[[16.5,1.5],...arc(16.5,5.5,3,-Math.PI/2,-Math.PI),
  [13.5,BASE.shoulder-.4],[13.3,BASE.shoulder],
  [12,BASE.shoulder],[12,BASE.postHeight-.5],[11.85,BASE.postHeight]];
 const post=keep(contourSolid(k,body,(outer,h)=>{
  const inner=h<=5.5?10.5-Math.max(0,outer-13.5):10.5;
  return roundedCSection((outer+inner)/2,outer-inner,BASE.opening,Math.PI,192,32).map(([x,z])=>[x+BASE.postX,z]);
 },()=>0));
 const joined=keep(k.Manifold.union([tray,post]));
 // Underside coring follows the post's C footprint, as visible in the mold
 // photograph. It leaves skins on both post faces and closes below the seat.
 const pocketLevels:Vec2[]=[[7,-1],[7,1],...Array.from({length:25},(_,i):Vec2=>{
  const a=(i+1)*Math.PI/50;return [1+6*(1-Math.sin(a)),1+4.5*(1-Math.cos(a))];
 }),[1,BASE.shoulder-1.5],[.8,BASE.shoulder-1]];
 const pocket=keep(contourSolid(k,pocketLevels,(w)=>roundedCSection(12,w,BASE.opening,Math.PI,192,32).map(([x,z])=>[x+BASE.postX,z]),()=>0));
 const solid=includeUndersideCoring?joined.subtract(pocket):k.Manifold.union([joined]);keepers.reverse().forEach(s=>s.delete());
 const refined=solid.refineToLength(1.5);solid.delete();
 const graded=refined.warp(v=>{
  const rise=baseFloor(v[0],v[2])-BASE.floor;
  const lower=MathUtils.clamp(v[1]/BASE.floor,0,1);
  const upper=MathUtils.clamp((BASE.rim-v[1])/(BASE.rim-BASE.floor),0,1);
  v[1]+=rise*lower*upper;
 });refined.delete();const clean=graded.asOriginal();graded.delete();const result=clean.simplify(.003);clean.delete();return result;
}
export function baseGeometry(s:import('manifold-3d').Manifold){
 return angleWeightedNormals(solidToGeometry(s),[
  heightSurfaceNormals(baseFloor),
  ...[13.5,10.5,12].map(radius=>cylinderNormals({x:BASE.postX,radius,inward:radius===10.5,tolerance:.005,minY:BASE.rim,maxY:BASE.postHeight-.5,boundaryPriority:1})),
 ]);
}
