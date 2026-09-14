import {Box3,Quaternion,Vector3} from 'three/webgpu';
import {ASSEMBLY_STEP} from '../physics-settings';
import {PART_BY_ID} from './catalog';
import {constructionIsClear,constructionLayers,createConstructionMotion,placedBounds,type ConstructionPlan,type ConstructionSource} from './construction';
import {createConstructionTiming} from './construction-timing';
import type {createAssemblyPhysics} from './physics';
import type {Connection,Placed} from './snapping';

const START_INTERVAL=.3; // Animation seconds; the build-speed slider scales this too.
type Carry={id:number;target:Placed;layer:number;time:number;motion:ReturnType<typeof createConstructionMotion>;rotor?:Quaternion};
export function createConstructionRun(
 plan:ConstructionPlan,
 sources:()=>ConstructionSource[],
 physics:Awaited<ReturnType<typeof createAssemblyPhysics>>,
 tubBounds:()=>Box3,
 placed:(id:number,target:Placed,connections:Connection[])=>void,
){
 const installed=new Map<number,number>(),active=new Map<number,Carry>();
 const {layers}=constructionLayers(plan);
 const timing=createConstructionTiming(),durations=new Map<string,number>();
 const supports=new Map(plan.pieces.map(target=>[target.id,plan.connections.flatMap(c=>{
  const port=c.a===target.id?c.ap:c.b===target.id?c.bp:undefined;
  return port!==undefined&&PART_BY_ID[target.kind].ports.find(p=>p.id===port)!.axis===-1?[c.a===target.id?c.b:c.a]:[];
 })]));
 let nextIndex=0,sinceStart=Infinity;
 const liveSources=()=>sources().map(p=>({...p,...physics.pose(p.id)}));
 const targetBounds=(p:Placed)=>placedBounds({id:p.id,kind:p.kind,position:new Vector3(...p.pose.position),rotation:new Quaternion().setFromAxisAngle(new Vector3(0,1,0),p.pose.yaw),fixed:true});
 const supported=(target:Placed)=>supports.get(target.id)!.every(id=>installed.has(id));
 const remainingTime=()=>{
  const finishes=new Map([...active.values()].map(p=>[p.target.id,p.motion.duration-p.time]));
  let launch=Math.max(0,START_INTERVAL-sinceStart),finish=0;
  // Forecast the same staggered, support-dependent schedule. Durations become
  // exact as flights start; unseen kinds use a typical carry duration.
  for(const target of plan.pieces.slice(nextIndex)){
   launch=Math.max(launch,...supports.get(target.id)!.map(id=>finishes.get(id)??0));
   finishes.set(target.id,launch+(durations.get(target.kind)??1.5));launch+=START_INTERVAL;
  }
  for(const time of finishes.values())finish=Math.max(finish,time);
  return finish;
 };
 return {
  inspect:()=>({completed:installed.size,completedIds:[...installed.keys()],started:nextIndex,total:plan.pieces.length,remainingAnimationTime:remainingTime(),timing:timing.inspect(),active:[...active.values()].map(p=>({id:p.id,targetId:p.target.id,kind:p.target.kind,layer:p.layer})),presetId:plan.presetId,startId:installed.get(plan.pieces.find(p=>p.kind==='start')?.id??-1)}),
  stop(){
   for(const {id,rotor} of active.values()){
    const p=physics.pose(id)!,source=sources().find(s=>s.id===id)!;
    physics.add(id,source.kind,p.position.toArray(),p.rotation,false,{rotorRotation:rotor?.toArray()});
   }
   active.clear();
  },
  step(speed=1){
   for(const carry of active.values())if(carry.time>=carry.motion.duration){
    const {id,target,rotor}=carry,rotation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),target.pose.yaw);
    physics.add(id,target.kind,target.pose.position,rotation,true,{rotorRotation:rotor?.toArray()});
    installed.set(target.id,id);active.delete(id);
    const connections=plan.connections.filter(c=>installed.has(c.a)&&installed.has(c.b)).map(c=>({...c,a:installed.get(c.a)!,b:installed.get(c.b)!}));
    placed(id,target,connections);
   }
   if(installed.size===plan.pieces.length)return true;
   const dt=timing.advance(ASSEMBLY_STEP,speed,remainingTime());sinceStart+=dt;
   const target=plan.pieces[nextIndex],layer=layers[nextIndex];
   // Starts remain staggered and ordered, but only this piece's supports
   // must be seated. Unrelated flights can continue on any layer.
   if(target&&sinceStart>=START_INTERVAL&&supported(target)){
    const all=liveSources(),used=new Set([...installed.values(),...active.keys()]);
    const source=all.filter(p=>!p.fixed&&!used.has(p.id)&&p.kind===target.kind).sort((a,b)=>{
     // Prefer exposed copies; break close height ties by flight distance.
     const score=(p:ConstructionSource)=>physics.bodyBounds(p.id).max.y-.025*Math.hypot(p.position.x-target.pose.position[0],p.position.z-target.pose.position[2]);
     return score(b)-score(a);
    })[0];
    if(!source)throw new Error('A required loose piece is no longer available.');
    const destination=targetBounds(target);
    // Flying pieces are reserved inventory, not loose obstacles. Their final
    // positions still constrain the route, even before they finish seating.
    const obstacles=all.filter(p=>{if(p.id===source.id||used.has(p.id))return false;const b=physics.bodyBounds(p.id);return b.max.y>=destination.min.y-3&&b.min.y<=destination.max.y+3;});
    if(!constructionIsClear({...plan,pieces:[target]},obstacles,3))throw new Error('A loose piece moved into the build area. Clear it and construct again.');
    const motion=createConstructionMotion(source,target,[tubBounds(),...all.filter(p=>p.id!==source.id&&!active.has(p.id)).map(p=>physics.bodyBounds(p.id)),...[...active.values()].map(p=>targetBounds(p.target))]);
    active.set(source.id,{id:source.id,target,layer,time:0,motion,rotor:physics.beginCarry(source.id)});
    durations.set(target.kind,motion.duration);
    nextIndex++;sinceStart=0;
   }
   for(const carry of active.values()){
    carry.time=Math.min(carry.motion.duration,carry.time+dt);
    const pose=carry.motion.sample(carry.time);physics.carry(carry.id,pose.position,pose.rotation,carry.rotor);
   }
   return false;
  },
 };
}
