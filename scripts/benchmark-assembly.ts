import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Quaternion} from 'three/webgpu';
import {createAssemblyPhysics} from '../src/assembly/physics';
import {createTubFill,TUB_FILL_SEEDS} from '../src/assembly/tub-stock';
import {createPresetStock} from '../src/assembly/preset-stock';
import {PRESETS} from '../src/assembly/presets';

const argument=(name:string)=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const enginePath=argument('--engine');
const engine=enginePath?(await import(pathToFileURL(resolve(enginePath)).href)).default:undefined;
const packs=[{name:'tangled-garden',pieces:createPresetStock(PRESETS.find(p=>p.id==='tangled-garden')!)}];
if(process.argv.includes('--all'))for(const seed of TUB_FILL_SEEDS)packs.push({name:`fill-${seed}`,pieces:createTubFill(undefined,seed).pieces});
const summarize=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b);return {mean:values.reduce((a,b)=>a+b,0)/values.length,p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1)};};
const results=[];
for(const pack of packs){
 const sim=await createAssemblyPhysics({engine});
 try{
  const started=performance.now();
  pack.pieces.forEach((p,id)=>sim.add(id,p.kind,p.position,new Quaternion(...p.rotation),false,{awake:false,rotorRotation:p.rotorRotation}));
  const loadMilliseconds=performance.now()-started;
  const phases=[];
  for(const mode of ['sleeping','dump','tip'] as const){
   if(mode==='dump')assert(sim.dumpTub());
   if(mode==='tip'){sim.beginTubTip();sim.setTubTipTarget(.4);}
   const hash=createHash('sha256'),milliseconds:number[]=[];
   const steps=mode==='dump'?1800:mode==='tip'?840:240;
   for(let tick=0;tick<steps;tick++){
    if(mode==='tip'&&tick===240)sim.endTubTip();
    const start=performance.now();sim.step();milliseconds.push(performance.now()-start);
    // Compare the full motion, not just the final settled arrangement. Timing
    // excludes state reads and hashing. JSON preserves the exact JS numbers.
    if(tick%12===0||tick===steps-1)hash.update(JSON.stringify({tub:sim.tubPose(),pieces:pack.pieces.map((_,id)=>[sim.pose(id),sim.wheelPose(id)])}));
   }
   phases.push({mode,milliseconds:summarize(milliseconds),seconds:Array.from({length:Math.ceil(steps/120)},(_,i)=>summarize(milliseconds.slice(i*120,(i+1)*120))),trajectory:hash.digest('hex')});
  }
  const result={name:pack.name,pieces:pack.pieces.length,loadMilliseconds,phases};results.push(result);
  console.log(pack.name,JSON.stringify(phases.map(p=>({mode:p.mode,meanMs:p.milliseconds.mean,p95Ms:p.milliseconds.p95,trajectory:p.trajectory}))));
 }finally{sim.dispose();}
}
const compare=argument('--compare');
if(compare){
 const baseline=await Bun.file(compare).json();
 for(const result of results){
  const before=baseline.results.find((p:{name:string})=>p.name===result.name);assert(before,`Missing baseline: ${result.name}`);
  for(const phase of result.phases)assert.equal(phase.trajectory,before.phases.find((p:{mode:string})=>p.mode===phase.mode).trajectory,`${result.name}/${phase.mode}: physics trajectory changed`);
 }
 console.log('Every sampled body, rotor and tub state exactly matches the baseline.');
}
const output=argument('--output');if(output)await Bun.write(output,JSON.stringify({engine:enginePath??'vendored',results},null,2));
