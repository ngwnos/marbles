import {Box3,Euler,Quaternion,Vector3} from 'three/webgpu';
import {createAssemblyPhysics} from './physics';
import {STORAGE_TUB as D,aboveStorageTub} from './storage-tub-spec';
import envelopes from '../generated/piece-envelopes.json';
import {PARTS} from './catalog';
import {PADDLE,paddleAxleY} from '../pieces/paddle-wheel';
import {START} from '../pieces/start';
import {hullPenetration,transformHull,type WorldHull} from './packing-overlap';

import {TUB_PACK_VERSION,TUB_PIECE_LIMIT,type PackedPiece,type TubPack} from './tub-pack';
export {TUB_PACK_VERSION,TUB_PIECE_LIMIT,type PackedPiece,type TubPack} from './tub-pack';
export function seededRandom(seed:number){return ()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};}
const data=(kind:string)=>envelopes[kind as keyof typeof envelopes];
const corners=(min:number[],max:number[])=>[min[0],max[0]].flatMap(x=>[min[1],max[1]].flatMap(y=>[min[2],max[2]].map(z=>new Vector3(x,y,z))));
export function packedBounds(piece:PackedPiece){
 const q=new Quaternion(...piece.rotation),p=new Vector3(...piece.position),d=data(piece.kind);
 const points=corners(d.min,d.max);
 if(piece.kind==='paddle'||piece.kind==='start'){
  const rotor=data(piece.kind==='paddle'?'paddle-wheel':'start-rotor');
  const pivot=piece.kind==='paddle'?new Vector3(PADDLE.x,paddleAxleY,PADDLE.z):new Vector3(START.pivotX,START.pivotY,0);
  const rotorQ=new Quaternion(...(piece.rotorRotation??[0,0,0,1]));
  points.push(...corners(rotor.min,rotor.max).map(p=>p.applyQuaternion(rotorQ).add(pivot)));
 }
 return new Box3().setFromPoints(points.map(v=>v.applyQuaternion(q).add(p)));
}
export function packedHulls(pieces:PackedPiece[],skin=false){
 return pieces.map(piece=>{
  const p=new Vector3(...piece.position),q=new Quaternion(...piece.rotation),list:WorldHull[]=data(piece.kind)[skin?'hulls':'cores'].map(h=>transformHull(h,p,q));
  if(piece.kind==='paddle'||piece.kind==='start'){
   const rotor=piece.kind==='paddle'?'paddle-wheel':'start-rotor',pivot=piece.kind==='paddle'?new Vector3(PADDLE.x,paddleAxleY,PADDLE.z):new Vector3(START.pivotX,START.pivotY,0);
   pivot.applyQuaternion(q).add(p);const rotorQ=q.clone().multiply(new Quaternion(...(piece.rotorRotation??[0,0,0,1])));list.push(...data(rotor)[skin?'hulls':'cores'].map(h=>transformHull(h,pivot,rotorQ)));
  }
  return list;
 });
}
export function auditPackedOverlap(pieces:PackedPiece[],skin=false){
 const hulls=packedHulls(pieces,skin);
 let maxPenetration=0,pair:number[]=[];
 for(let i=0;i<hulls.length;i++)for(let j=i+1;j<hulls.length;j++)for(const a of hulls[i])for(const b of hulls[j]){
  const d=hullPenetration(a,b);if(d>maxPenetration){maxPenetration=d;pair=[i,j];}
 }
 return {maxPenetration,pair};
}

class InvalidPack extends Error{}
/** Rejection sampling: never publish a pile that failed validation. Alternate
 * attempts are derived from the seed, so even retried fills are reproducible. */
export async function generateTubPack(seed:number,onProgress?:(count:number)=>void):Promise<TubPack>{
 const started=performance.now();let candidate=seed>>>0,lastError:unknown;
 for(let attempt=1;attempt<=4;attempt++){
  try{const pack=await simulateTubPack(candidate,onProgress);return {...pack,seed:seed>>>0,stats:{...pack.stats,milliseconds:performance.now()-started,attempts:attempt}};}
  catch(error){if(!(error instanceof InvalidPack))throw error;lastError=error;candidate=(Math.imul(candidate,1664525)+1013904223)>>>0;onProgress?.(0);}
 }
 throw new Error(`Could not settle tub seed ${seed}: ${String(lastError)}`);
}

/** Fresh seeded packing, simulated before display. No stored pose templates. */
async function simulateTubPack(seed:number,onProgress?:(count:number)=>void):Promise<TubPack>{
 const started=performance.now(),random=seededRandom(seed),sim=await createAssemblyPhysics({packing:true}),pieces:PackedPiece[]=[];
 const kinds=PARTS.flatMap(p=>Array.from({length:p.id==='spacer'?8:p.id==='base'?5:p.id==='start'?1:3},()=>p.id));
 const read=()=>pieces.map((p,i)=>{const pose=sim.pose(i)!,wheel=sim.wheelPose(i);return {...p,position:pose.position.toArray(),rotation:pose.rotation.toArray(),...(wheel?{rotorRotation:pose.rotation.clone().invert().multiply(wheel.rotation).toArray()}: {})};});
 const advance=(steps:number)=>{for(let j=0;j<steps;j++)sim.step();};
 try{
  let missed=0;
  for(let trial=0;trial<240&&pieces.length<TUB_PIECE_LIMIT&&missed<20;trial++){
   const id=pieces.length;
   const kind=kinds[Math.floor(random()*kinds.length)];
   const previous=read(),bounds=previous.map(p=>packedBounds(p));let best:PackedPiece|undefined,bestHeight=Infinity;
   for(let attempt=0;attempt<24;attempt++){
    const rotation=new Quaternion().setFromEuler(new Euler((random()-.5)*Math.PI,random()*2*Math.PI,(random()-.5)*Math.PI));
    const draft:PackedPiece={kind,position:[0,0,0],rotation:rotation.toArray()},box=packedBounds(draft),center=box.getCenter(new Vector3()),size=box.getSize(new Vector3());
    // Tub's short dimension runs along world X. Fit the whole bounds inside
    // its lower interior, leaving room to tumble and settle without hooking a rim.
    const halfX=D.bottomWidth/2-12,halfZ=D.bottomLength/2-12;if(size.x>halfX*2||size.z>halfZ*2)continue;
    const p=new Vector3(D.position[0]+(random()-.5)*(halfX*2-size.x)-center.x,0,D.position[2]+(random()-.5)*(halfZ*2-size.z)-center.z);
    const footprint=box.clone().translate(p);let floor=D.position[1]+D.wall+8;
    for(const b of bounds)if(footprint.min.x<b.max.x+3&&footprint.max.x>b.min.x-3&&footprint.min.z<b.max.z+3&&footprint.max.z>b.min.z-3)floor=Math.max(floor,b.max.y+8);
    p.y=floor-box.min.y;const top=p.y+box.max.y;
    if(top<bestHeight){bestHeight=top;best={...draft,position:p.toArray()};}
   }
   // This is the release height, not the settled pile height. Allow a part
   // to start above the rim so it can tumble into the remaining space.
   if(!best||bestHeight>D.position[1]+D.height+90){missed++;continue;}missed=0;
   pieces.push(best);sim.add(id,kind,best.position,new Quaternion(...best.rotation),false);advance(80);onProgress?.(pieces.length);
  }
  advance(360);
  for(let t=0;t<1800&&pieces.some((_,i)=>sim.pose(i)!.awake||sim.wheelPose(i)?.awake);t++)sim.step();
  const settled=read();advance(240);
  const final=read(),maxDrift=Math.max(0,...final.map((p,i)=>{
   const before=settled[i],radius=packedBounds(p).getSize(new Vector3()).length()/2;
   return new Vector3(...before.position).distanceTo(new Vector3(...p.position))+radius*(new Quaternion(...before.rotation).angleTo(new Quaternion(...p.rotation))+new Quaternion(...(before.rotorRotation??[0,0,0,1])).angleTo(new Quaternion(...(p.rotorRotation??[0,0,0,1]))));
  }));
  const overlap=auditPackedOverlap(final),maxHeight=Math.max(...final.map(p=>packedBounds(p).max.y));
  const contained=sim.tubContains(packedHulls(final).flatMap(hulls=>hulls.flatMap(h=>h.vertices))),awake=pieces.some((_,i)=>sim.pose(i)!.awake||sim.wheelPose(i)?.awake);
  if(pieces.length<20||awake||!contained||maxDrift>.05||overlap.maxPenetration>.001||final.some(p=>!aboveStorageTub(p.position[0],p.position[2])))throw new InvalidPack(`Unstable tub seed ${seed}: ${JSON.stringify({count:pieces.length,maxDrift,...overlap,maxHeight,contained,awake,kinds:overlap.pair.map(i=>pieces[i].kind)})}`);
  return {version:TUB_PACK_VERSION,seed,pieces:final,stats:{milliseconds:performance.now()-started,maxPenetration:overlap.maxPenetration,maxDrift,maxHeight,attempts:1}};
 }finally{sim.dispose();}
}
