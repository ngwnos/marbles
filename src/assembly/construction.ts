import {Box3,Matrix4,Quaternion,Vector3} from 'three/webgpu';
import envelopes from '../generated/piece-envelopes.json';
import {PART_BY_ID,type V3} from './catalog';
import type {Preset} from './preset-layout';
import {rotate,type Placed} from './snapping';
import {RUG} from './rug-spec';
import {START} from '../pieces/start';
import {PADDLE,paddleAxleY} from '../pieces/paddle-wheel';
import {PART_UNITS} from '../pieces/marbleworks-spec';

const Y=new Vector3(0,1,0),one=new Vector3(1,1,1);
type Point={x:number;z:number};
type Footprint={points:Point[];minX:number;maxX:number;minZ:number;maxZ:number};
export type ConstructionSource={id:number;kind:string;position:Vector3;rotation:Quaternion;fixed:boolean};
export const CONSTRUCTION_CLEARANCE=60;

/** Include the rotor as well as the parent shell in placement/flight bounds. */
export function constructionBounds(kind:string){
 const data=envelopes[kind as keyof typeof envelopes];
 const bounds=new Box3(new Vector3(...data.min),new Vector3(...data.max));
 if(kind==='start'||kind==='paddle'){
  const rotor=envelopes[kind==='start'?'start-rotor':'paddle-wheel'];
  const pivot=kind==='start'?new Vector3(START.pivotX,START.pivotY,0):new Vector3(PADDLE.x,paddleAxleY,PADDLE.z);
  // A sphere encloses every rotor angle, including an open starting gate.
  const radius=Math.hypot(...[0,1,2].map(i=>Math.max(Math.abs(rotor.min[i]),Math.abs(rotor.max[i]))));
  bounds.union(new Box3(pivot.clone().addScalar(-radius),pivot.clone().addScalar(radius)));
 }
 return bounds;
}
export function placedBounds(part:ConstructionSource){
 return constructionBounds(part.kind).applyMatrix4(new Matrix4().compose(part.position,part.rotation,one));
}
function hull(points:Point[]):Point[]{
 const sorted=points.slice().sort((a,b)=>a.x-b.x||a.z-b.z);
 const cross=(a:Point,b:Point,c:Point)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
 const half=(list:Point[])=>{const out:Point[]=[];for(const p of list){while(out.length>1&&cross(out[out.length-2],out[out.length-1],p)<=0)out.pop();out.push(p);}out.pop();return out;};
 return [...half(sorted),...half(sorted.slice().reverse())];
}
function footprint(points:Point[]):Footprint{
 return {points:hull(points),minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minZ:Math.min(...points.map(p=>p.z)),maxZ:Math.max(...points.map(p=>p.z))};
}
function partFootprint(kind:string,position:Vector3,rotation:Quaternion){
 const b=constructionBounds(kind),points:Point[]=[];
 for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])points.push(new Vector3(x,y,z).applyQuaternion(rotation).add(position));
 return footprint(points);
}
const boxFootprint=(b:Box3)=>footprint([{x:b.min.x,z:b.min.z},{x:b.max.x,z:b.min.z},{x:b.max.x,z:b.max.z},{x:b.min.x,z:b.max.z}]);
function overlaps(a:Footprint,b:Footprint,x=0,z=0,margin=CONSTRUCTION_CLEARANCE){
 if(a.maxX+x+margin<b.minX||a.minX+x-margin>b.maxX||a.maxZ+z+margin<b.minZ||a.minZ+z-margin>b.maxZ)return false;
 for(const polygon of [a,b])for(let i=0;i<polygon.points.length;i++){
  const p=polygon.points[i],q=polygon.points[(i+1)%polygon.points.length],nx=p.z-q.z,nz=q.x-p.x,length=Math.hypot(nx,nz);
  if(length<1e-9)continue;
  let alo=Infinity,ahi=-Infinity,blo=Infinity,bhi=-Infinity;
  for(const v of a.points){const d=(v.x+x)*nx+(v.z+z)*nz;alo=Math.min(alo,d);ahi=Math.max(ahi,d);}
  for(const v of b.points){const d=v.x*nx+v.z*nz;blo=Math.min(blo,d);bhi=Math.max(bhi,d);}
  if(ahi+margin*length<blo||bhi+margin*length<alo)return false;
 }
 return true;
}

/** A connector dependency graph, rather than sorting piece origins by Y:
 * every underside socket must have its supporting piece installed first. */
export function constructionOrder(preset:Preset){
 const below=new Map(preset.pieces.map(p=>[p.id,new Set<number>()]));
 for(const c of preset.connections){
  const a=preset.pieces.find(p=>p.id===c.a)!,port=PART_BY_ID[a.kind].ports.find(p=>p.id===c.ap)!;
  const [lower,upper]=port.axis===1?[c.a,c.b]:[c.b,c.a];below.get(upper)!.add(lower);
 }
 const result:Placed[]=[],remaining=new Map(preset.pieces.map(p=>[p.id,p]));
 while(remaining.size){
  const ready=[...remaining.values()].filter(p=>[...below.get(p.id)!].every(id=>!remaining.has(id)));
  ready.sort((a,b)=>a.pose.position[1]+constructionBounds(a.kind).min.y-b.pose.position[1]-constructionBounds(b.kind).min.y||a.id-b.id);
  if(!ready.length)throw new Error('This preset has a circular support dependency.');
  const next=ready[0];result.push(next);remaining.delete(next.id);
 }
 return result;
}

export function planConstruction(preset:Preset,sources:ConstructionSource[],obstacleBounds:Box3[]=[]){
 const available=new Map<string,number>();
 for(const p of sources)if(!p.fixed)available.set(p.kind,(available.get(p.kind)??0)+1);
 const needed=new Map<string,number>();for(const p of preset.pieces)needed.set(p.kind,(needed.get(p.kind)??0)+1);
 const missing=[...needed].filter(([kind,n])=>n>(available.get(kind)??0));
 if(missing.length)throw new Error('Missing loose parts: '+missing.map(([kind,n])=>`${n-(available.get(kind)??0)} × ${PART_BY_ID[kind].name}`).join(', ')+'.');
 const ordered=constructionOrder(preset);
 const obstacles=[...sources.map(p=>partFootprint(p.kind,p.position,p.rotation)),...obstacleBounds.map(boxFootprint)];
 const candidates:{yaw:number;x:number;z:number;y:number;score:number;shapes:Footprint[]}[]=[];
 // Test the union of the individual projected parts. Empty space between
 // branches need not be discarded as it would with one large bounding box.
 for(let turn=0;turn<24;turn++){
  const yaw=turn*Math.PI/12,shapes=ordered.map(p=>partFootprint(p.kind,new Vector3(...rotate(p.pose.position,yaw)),new Quaternion().setFromAxisAngle(Y,p.pose.yaw+yaw)));
  const bounds=footprint(shapes.flatMap(s=>s.points));
  for(const surface of [{x:RUG.width/2,z:RUG.depth/2,y:0},{x:2400,z:2400,y:-RUG.thickness}]){
   const step=40;
   for(let x=Math.ceil((-surface.x+20-bounds.minX)/step)*step;x<=surface.x-20-bounds.maxX;x+=step)
    for(let z=Math.ceil((-surface.z+20-bounds.minZ)/step)*step;z<=surface.z-20-bounds.maxZ;z+=step){
     if(surface.y<0&&!(bounds.maxX+x< -RUG.width/2-20||bounds.minX+x>RUG.width/2+20||bounds.maxZ+z< -RUG.depth/2-20||bounds.minZ+z>RUG.depth/2+20))continue;
     const cx=x+(bounds.minX+bounds.maxX)/2,cz=z+(bounds.minZ+bounds.maxZ)/2;
     candidates.push({yaw,x,y:surface.y,z,shapes,score:(surface.y<0?1e8:0)+cx*cx+cz*cz});
    }
  }
 }
 candidates.sort((a,b)=>a.score-b.score);
 const placement=candidates.find(c=>!obstacles.some(o=>c.shapes.some(s=>overlaps(s,o,c.x,c.z))));
 if(!placement)throw new Error('There is no clear space for this preset. Move some loose pieces aside.');
 const {x,y,z,yaw}=placement;
 return {presetId:preset.id,name:preset.name,onCarpet:y===0,connections:preset.connections.map(c=>({...c})),pieces:ordered.map(p=>({id:p.id,kind:p.kind,pose:{yaw:p.pose.yaw+yaw,position:rotate(p.pose.position,yaw).map((v,j)=>v+[x,y,z][j]) as V3}}))};
}
export type ConstructionPlan=ReturnType<typeof planConstruction>;

/** Shared stacking levels for flight inspection and the camera. */
export function constructionLayers(plan:ConstructionPlan){
 const heights=plan.pieces.map(p=>{
  const sockets=PART_BY_ID[p.kind].ports.filter(p=>p.axis===-1);
  return p.pose.position[1]+(sockets.length?Math.min(...sockets.map(p=>p.position[1])):0);
 });
 const base=Math.min(...heights);
 return {base,layers:heights.map(y=>Math.round((y-base)/PART_UNITS.stackRise))};
}

export function constructionPlanBounds(plan:ConstructionPlan){
 const bounds=new Box3();
 for(const p of plan.pieces)bounds.union(placedBounds({id:p.id,kind:p.kind,position:new Vector3(...p.pose.position),rotation:new Quaternion().setFromAxisAngle(Y,p.pose.yaw),fixed:true}));
 return bounds;
}

/** Keep the complete footprint centered; rise only once a whole layer is seated. */
export function createConstructionFocus(plan:ConstructionPlan){
 const bounds=constructionPlanBounds(plan);
 const center=bounds.getCenter(new Vector3()),{base,layers}=constructionLayers(plan);
 return (completedIds:readonly number[])=>{
  const seated=new Set(completedIds);
  const remaining=layers.filter((_,i)=>!seated.has(plan.pieces[i].id)),layer=remaining.length?Math.min(...remaining):Math.max(...layers);
  return center.clone().setY(base+layer*PART_UNITS.stackRise);
 };
}

export function constructionIsClear(plan:ConstructionPlan,obstacles:ConstructionSource[],margin=CONSTRUCTION_CLEARANCE){
 return !plan.pieces.some(p=>{
  const shape=partFootprint(p.kind,new Vector3(...p.pose.position),new Quaternion().setFromAxisAngle(Y,p.pose.yaw));
  return obstacles.some(o=>overlaps(shape,partFootprint(o.kind,o.position,o.rotation),0,0,margin));
 });
}

const ease=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*t*(10+t*(-15+6*t));};
// Spend more of the carry accelerating out of the pickup. Velocity,
// acceleration and jerk start at zero; seating still eases to a stop.
const carryProgress=(t:number)=>{t=Math.max(0,Math.min(1,t));return t**4*(15+t*(-24+10*t));};
const overlapXZ=(a:Box3,b:Box3,margin=0)=>a.max.x+margin>=b.min.x&&a.min.x-margin<=b.max.x&&a.max.z+margin>=b.min.z&&a.min.z-margin<=b.max.z;
/** A single curved carry, tangent to the short socket insertion. Arc-length
 * timing eases only at pickup and seating, never at the curve/line join. */
export function createConstructionMotion(source:ConstructionSource,target:Placed,obstacles:Box3[]=[]){
 const to=new Vector3(...target.pose.position),rotation=new Quaternion().setFromAxisAngle(Y,target.pose.yaw),bounds=constructionBounds(source.kind);
 const localCenter=bounds.getCenter(new Vector3());
 const fromCenter=localCenter.clone().applyQuaternion(source.rotation).add(source.position),toCenter=localCenter.clone().applyQuaternion(rotation).add(to);
 const seatHeight=PART_UNITS.insertionDepth+9,distance=Math.hypot(toCenter.x-fromCenter.x,toCenter.z-fromCenter.z);
 const lift=Math.max(45,distance*.14);let clearanceLift=0;
 const controls=[fromCenter,fromCenter.clone(),fromCenter.clone().lerp(toCenter,.25),toCenter.clone().add(new Vector3(0,seatHeight+60,0)),toCenter.clone().add(new Vector3(0,seatHeight+20,0)),toCenter.clone().add(new Vector3(0,seatHeight,0))];
 const setLift=()=>{
  controls[1].y=fromCenter.y+Math.max(0,toCenter.y-fromCenter.y)*.55+lift+clearanceLift;
  controls[2].y=Math.max(fromCenter.y,toCenter.y)+lift+clearanceLift;
  controls[3].y=toCenter.y+seatHeight+60+clearanceLift;
 };
 const weights=(u:number)=>{const v=1-u;return [v**5,5*u*v**4,10*u*u*v**3,10*u**3*v*v,5*u**4*v,u**5];};
 const point=(u:number)=>{const p=new Vector3();weights(u).forEach((w,i)=>p.addScaledVector(controls[i],w));return p;};
 const turn=(u:number)=>source.rotation.clone().slerp(rotation,ease((u-.08)/.74));
 const sourceBox=placedBounds(source),targetBox=bounds.clone().applyMatrix4(new Matrix4().compose(to,rotation,one));
 // Ease out of the pickup column, including overhangs above the source.
 // A vertical gap does not make an overhang an obstacle we can clear instantly.
 // Destination contacts are the intended sockets handled by the short tail.
 const blockers=obstacles.filter(b=>!b.intersectsBox(targetBox.clone().expandByScalar(seatHeight))).map(box=>({box,pickup:overlapXZ(sourceBox,box,12)}));
 setLift();
 // Raise the curved part only for obstacles under this particular carry.
 // A distant tower or the tub cannot impose a scene-wide cruising height.
 for(let pass=0;pass<4;pass++){
  let extra=0;
  for(let i=1;i<80;i++){
   const u=i/80,q=turn(u),p=point(u).sub(localCenter.clone().applyQuaternion(q)),b=bounds.clone().applyMatrix4(new Matrix4().compose(p,q,one));
   const floor=Math.min(0,sourceBox.min.y)*(1-ease(u/.2))+Math.min(0,targetBox.min.y)*ease((u-.8)/.2);
   let rise=Math.max(0,floor-b.min.y);
   for(const {box:obstacle,pickup} of blockers)if(overlapXZ(b,obstacle)){
    const clear=pickup?sourceBox.min.y+(obstacle.max.y+12-sourceBox.min.y)*ease(u/.3):obstacle.max.y+12;
    rise=Math.max(rise,clear-b.min.y);
   }
   // Lift the approach control too: correcting a late obstacle through only
   // the two pickup controls amplifies tiny weights into enormous arches.
   const w=weights(u);extra=Math.max(extra,rise/(w[1]+w[2]+w[3]));
  }
  if(extra<.01)break;clearanceLift+=extra;setLift();
 }
 const lengths=[0],steps=256;let previous=point(0);
 for(let i=1;i<=steps;i++){const next=point(i/steps);lengths.push(lengths[i-1]+next.distanceTo(previous));previous=next;}
 const arcLength=lengths[steps],length=arcLength+seatHeight,duration=Math.max(1.05,Math.min(2.2,length/900));
 return {duration,seatHeight,arcLength,length,sample(time:number){
  const travelled=carryProgress(time/duration)*length;
  if(travelled>=arcLength)return {position:to.clone().add(new Vector3(0,Math.max(0,length-travelled),0)),rotation:rotation.clone()};
  let lo=0,hi=steps;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(lengths[mid]<travelled)lo=mid;else hi=mid;}
  const u=(lo+(travelled-lengths[lo])/(lengths[hi]-lengths[lo]))/steps,q=turn(u);
  return {position:point(u).sub(localCenter.clone().applyQuaternion(q)),rotation:q};
 }};
}
