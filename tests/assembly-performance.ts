import type {createBuilder} from '../src/assembly/world';

const summarize=(samples:number[])=>{
 const sorted=[...samples].sort((a,b)=>a-b);
 return {mean:samples.reduce((a,b)=>a+b,0)/samples.length,median:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1)};
};

/** /?verify=performance: fixed simulation time, warmed shaders, GPU fences.
 * Physics, JS submission and GPU execution are measured independently.
 * Does not load or overwrite the user's saved layout.
 */
export function prepareAssemblyPerformance(builder:Awaited<ReturnType<typeof createBuilder>>){
 const hook=builder.videoBenchmark!;
 const backend=hook.renderer.backend as unknown as {device?:{queue:{onSubmittedWorkDone():Promise<void>}}};
 hook.prepare(1800,992);
 let busy=false;
 const run=async(mode:'dump'|'idle'|'built',frames=360,width=1800,height=992)=>{
  if(busy)throw new Error('Benchmark already running');busy=true;
  try{
   hook.prepare(width,height);
   builder.loadPreset('tangled-garden',mode==='built'?'built':'packed');
   for(let i=0;i<30;i++){hook.draw();if(i%4===3)await backend.device?.queue.onSubmittedWorkDone();}
   await backend.device?.queue.onSubmittedWorkDone();
   if(mode==='dump')builder.dumpTub();
   const physics:number[]=[],update:number[]=[],submission:number[]=[],gpu:number[]=[],total:number[]=[];
   hook.renderer.info.autoReset=false;
   let calls=0,triangles=0;
   for(let i=0;i<frames;i++){
    hook.renderer.info.reset();
    const start=performance.now();hook.advance(1/60);const submitted=performance.now();hook.draw();const end=performance.now();
    physics.push(hook.profile().physicsMilliseconds);update.push(submitted-start);submission.push(end-submitted);
    const ms=await hook.renderer.resolveTimestampsAsync('render');if(ms!==undefined)gpu.push(ms);
    await backend.device?.queue.onSubmittedWorkDone();total.push(performance.now()-start);
    calls=Math.max(calls,hook.renderer.info.render.drawCalls);triangles=Math.max(triangles,hook.renderer.info.render.triangles);
    // Allow browser input and progress without including RAF throttling in timings.
    if(i%60===59){document.documentElement.dataset.performanceProgress=`${mode} ${i+1}/${frames}`;await new Promise(r=>setTimeout(r,0));}
   }
   const slices=Array.from({length:Math.ceil(frames/60)},(_,i)=>({second:i,physics:summarize(physics.slice(i*60,(i+1)*60)),total:summarize(total.slice(i*60,(i+1)*60))}));
   const result={mode,width,height,frames,calls,triangles,physics:summarize(physics),update:summarize(update),submission:summarize(submission),gpu:summarize(gpu),total:summarize(total),slices};
   return result;
  }finally{busy=false;document.documentElement.dataset.performanceProgress='ready';}
 };
 Object.assign(window,{assemblyPerformance:{run,builder}});
 document.documentElement.dataset.assemblyPerformance='ready';
}
