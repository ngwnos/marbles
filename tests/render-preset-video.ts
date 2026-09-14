import type {createBuilder} from '../src/assembly/world';
import {PRESETS} from '../src/assembly/presets';

type Options={endpoint:string;width?:number;height?:number;fps?:number;seed?:number};
type Phase='packed'|'dumping'|'building'|'gate-camera'|'built'|'filled'|'following'|'finish'|'overview';

/** Development-only scene export. The normal simulation and camera updates
 * share the exact same frame path; only the clock and video output differ.
 */
export function preparePresetVideo(builder:Awaited<ReturnType<typeof createBuilder>>){
 const hook=builder.videoBenchmark;
 if(!hook)throw new Error('Use /build.html?verify=render');
 const backend=hook.renderer.backend as unknown as {isWebGPUBackend?:boolean;device:{queue:{onSubmittedWorkDone():Promise<void>}}};
 if(!backend.isWebGPUBackend)throw new Error('WebGPU is required');
 let busy=false,progress:Record<string,unknown>={state:'ready'};
 const run=async({endpoint,width=3840,height=2160,fps=60,seed=20260913}:Options)=>{
  if(busy)throw new Error('An export is already running');
  const address=new URL(endpoint);
  if(address.hostname!=='127.0.0.1'||address.protocol!=='http:')throw new Error('Use the local video receiver');
  if(fps!==30&&fps!==60)throw new Error('Use 30 or 60 fps');
  busy=true;
  const random=Math.random;let randomState=seed>>>0;
  Math.random=()=>{randomState=(randomState+0x6d2b79f5)|0;let t=Math.imul(randomState^(randomState>>>15),1|randomState);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};
  let encoder:VideoEncoder|undefined,error:Error|undefined,frameIndex=0,encoded=0,bytes=0,sequence=0;
  let chunks:Uint8Array[]=[],chunkBytes=0;
  const started=performance.now(),events:{phase:Phase;frame:number;seconds:number;camera:ReturnType<typeof builder.inspect>['camera']}[]=[];
  const eventFrames=new Map<Phase,number>();
  const cameraSamples:{seconds:number;view:ReturnType<typeof hook.cameraSample>}[]=[];
  const preset=PRESETS.find(p=>p.id==='tangled-garden')!;
  let phase='packed' as Phase;
  const record=(next:Phase)=>{eventFrames.set(next,frameIndex);events.push({phase:next,frame:frameIndex,seconds:frameIndex/fps,camera:builder.inspect().camera});};
  const transition=(next:Phase)=>{phase=next;record(next);};
  const age=(event:Phase)=>(frameIndex-eventFrames.get(event)!)/fps;
  const upload=async()=>{
   if(!chunks.length)return;
   const batch=chunks;chunks=[];chunkBytes=0;
   const response=await fetch(`${endpoint}/chunk?sequence=${sequence++}`,{method:'POST',body:new Blob(batch as BlobPart[],{type:'video/h264'})});
   if(!response.ok)throw new Error(await response.text());
  };
  try{
   const config:VideoEncoderConfig={codec:'avc1.640034',width,height,framerate:fps,bitrate:width>=3840?45_000_000:16_000_000,
    hardwareAcceleration:'prefer-hardware',latencyMode:'quality',avc:{format:'annexb'}};
   if(!(await VideoEncoder.isConfigSupported(config)).supported)throw new Error('Encoder configuration unsupported');
   hook.prepare(width,height);
   if(!builder.loadPreset(preset.id,'packed'))throw new Error('Could not load the packed preset');
   builder.setConstructionSpeed(5);hook.advance(0);
   const original=builder.inspect();
   if(original.items.length!==preset.pieces.length||original.connections.length)throw new Error('Packed inventory differs from preset');
   for(let i=0;i<12;i++){hook.draw();await backend.device.queue.onSubmittedWorkDone();}
   encoder=new VideoEncoder({error:e=>{error=e;},output:chunk=>{
    if(chunk.timestamp!==Math.round(encoded*1e6/fps)){error=new Error('Encoder reordered or lost a frame');return;}
    const data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);chunks.push(data);chunkBytes+=data.byteLength;bytes+=data.byteLength;encoded++;
   }});encoder.configure(config);
   transition('packed');
   for(frameIndex=0;frameIndex<fps*120;frameIndex++){
    if(error)throw error;
    if(frameIndex>0)hook.advance(1/fps);
    const state=hook.state();
    // Independent milestones let camera work lead the action. Only actual
    // dependencies (a placed gate and a complete route) delay the release.
    if(!eventFrames.has('dumping')&&frameIndex/fps>=1){if(!builder.dumpTub())throw new Error('Dump did not start');transition('dumping');}
    if(eventFrames.has('dumping')&&!eventFrames.has('building')&&!hook.state().dumping){
     if(!builder.constructPreset(preset.id))throw new Error('Construction could not find a placement');transition('building');
    }
    if(state.construction&&!eventFrames.has('gate-camera')&&hook.approachGate())record('gate-camera');
    if(eventFrames.has('building')&&!eventFrames.has('built')&&!hook.state().construction){
     const built=builder.inspect();
     if(built.items.length!==original.items.length||built.items.some(p=>!p.fixed)||built.connections.length!==preset.connections.length)throw new Error('Construction stopped before completion');
     if(built.items.some((p,i)=>p.id!==original.items[i].id||p.color!==original.items[i].color))throw new Error('Construction replaced inventory');
     if(!eventFrames.has('gate-camera')){if(!hook.approachGate())throw new Error('Could not frame the placed gate');record('gate-camera');}
     record('built');builder.fillGate();if(!builder.inspect().marbles.length)throw new Error('Gate did not fill');transition('filled');
    }
    if(eventFrames.has('filled')&&!eventFrames.has('following')&&age('filled')>=.45&&state.gateFramed){
     builder.releaseGate();if(hook.state().following===undefined)throw new Error('Gate release did not acquire a marble');transition('following');
    }
    if(eventFrames.has('following')&&!eventFrames.has('finish')&&state.finish!==undefined)transition('finish');
    if(eventFrames.has('following')&&!eventFrames.has('finish')&&(age('following')>45||hook.state().following===undefined))throw new Error('Followed marble did not reach the finish');
    if(eventFrames.has('finish')&&!eventFrames.has('overview')&&age('finish')>=2){
     if(!hook.overviewMaze())throw new Error('Could not frame the completed maze');transition('overview');
    }
    if(eventFrames.has('overview')&&age('overview')>=10)break;
    if(frameIndex%6===0)cameraSamples.push({seconds:frameIndex/fps,view:hook.cameraSample()});
    hook.draw();
    const timestamp=Math.round(frameIndex*1e6/fps);
    const frame=new VideoFrame(hook.canvas,{timestamp,duration:Math.round((frameIndex+1)*1e6/fps)-timestamp,alpha:'discard'});
    try{encoder.encode(frame,{keyFrame:frameIndex%(fps*2)===0});}finally{frame.close();}
    if(frameIndex%4===3)await backend.device.queue.onSubmittedWorkDone();
    if(encoder.encodeQueueSize>8)await new Promise<void>((resolve,reject)=>{
     const e=encoder!;
     const finish=()=>{e.removeEventListener('dequeue',check);clearTimeout(timeout);};
     const check=()=>{if(error){finish();reject(error);}else if(e.encodeQueueSize<=8){finish();resolve();}};
     const timeout=setTimeout(()=>{finish();reject(new Error('Encoder queue stalled'));},15000);
     e.addEventListener('dequeue',check);check();
    });
    if(chunkBytes>=8*1024*1024)await upload();
    if(frameIndex%30===0)progress={state:'rendering',phase,frame:frameIndex,seconds:frameIndex/fps,wallSeconds:(performance.now()-started)/1000,completed:state.construction?.completed,encoded};
   }
   if(phase!=='overview')throw new Error('Sequence exceeded its duration limit');
   await backend.device.queue.onSubmittedWorkDone();await encoder.flush();await upload();
   if(error)throw error;if(encoded!==frameIndex)throw new Error(`Frame count mismatch: ${encoded}/${frameIndex}`);
   const result={width,height,fps,frames:encoded,duration:encoded/fps,bytes,seed,preset:preset.id,buildSpeed:5,events,cameraSamples,wallSeconds:(performance.now()-started)/1000,final:builder.inspect()};
   const response=await fetch(`${endpoint}/finish`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(result)});
   if(!response.ok)throw new Error(await response.text());
   progress={state:'complete',...result,output:await response.json()};return progress;
  }catch(e){progress={state:'failed',phase,frame:frameIndex,error:String(e)};throw e;}
  finally{if(encoder&&encoder.state!=='closed')encoder.close();Math.random=random;busy=false;}
 };
 Object.assign(window,{sceneVideo:{run,get progress(){return progress;}}});
 document.documentElement.dataset.sceneVideo='ready';
}
