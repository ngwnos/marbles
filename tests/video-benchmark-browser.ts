import type {createBuilder} from '../src/assembly/world';
import {Vector3} from 'three/webgpu';

type Mode='render'|'capture'|'encode'|'readback';
type Options={width:number;height:number;mode:Mode;frames?:number;keepVideo?:boolean};
type Result={width:number;height:number;mode:Mode;frames:number;seconds:number;fps:number;realtime60:number;frameCreationMs:number;encodedFrames:number;encodedBytes:number;maxEncodeQueue:number;config?:VideoEncoderConfig};
type Device={queue:{onSubmittedWorkDone():Promise<void>}};

/** Opt-in via /build.html?verify=video. Frozen physics isolates capture cost.
 * All runs use the same scene and camera path, warmed shaders, bounded GPU
 * batches, and include GPU completion and encoder flush in elapsed time.
 */
export async function prepareVideoBenchmark(builder:Awaited<ReturnType<typeof createBuilder>>){
 const hook=builder.videoBenchmark;
 if(!hook)throw new Error('Video benchmark requires its development URL');
 const backend=hook.renderer.backend as unknown as {isWebGPUBackend?:boolean;device:Device};
 if(!backend.isWebGPUBackend)throw new Error('Benchmark requires WebGPU, not the WebGL fallback');
 if(typeof VideoEncoder==='undefined')throw new Error('WebCodecs unavailable');
 if(!builder.loadPreset('tangled-garden','built'))throw new Error('Could not load benchmark scene');
 builder.fillGate();
 // Populate marble meshes using the normal frame update before freezing poses.
 for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);
 hook.prepare(1920,1080);
 const initial=builder.inspect();
 const target=hook.target.clone(),offset=hook.camera.position.clone().sub(target);
 const angle=Math.atan2(offset.x,offset.z),radius=Math.hypot(offset.x,offset.z);
 const orbit=(frame:number,frames:number)=>{
  const a=angle+frame/frames*.5;
  hook.camera.position.copy(target).add(new Vector3(Math.sin(a)*radius,offset.y,Math.cos(a)*radius));
  hook.camera.lookAt(target);hook.draw();
 };
 const results:Result[]=[];
 let busy=false,progress='ready',video:Uint8Array[]=[];
 const run=async({width,height,mode,frames=240,keepVideo=false}:Options)=>{
  if(busy)throw new Error('A benchmark is already running');
  if(!Number.isInteger(frames)||frames<60)throw new Error('Use at least 60 frames');
  busy=true;progress=`${width}×${height} ${mode}: warming`;
  let encoder:VideoEncoder|undefined,error:Error|undefined,config:VideoEncoderConfig|undefined;
  let outputFrames=0,bytes=0,maxQueue=0,creationMs=0,measuring=false;
  const timestamps:number[]=[];if(keepVideo)video=[];
  try{
   hook.prepare(width,height);
   if(mode==='encode'){
    config={codec:'avc1.640034',width,height,framerate:60,bitrate:width>=3840?45_000_000:16_000_000,
     hardwareAcceleration:'prefer-hardware',latencyMode:'quality',avc:{format:'annexb'}};
    if(!(await VideoEncoder.isConfigSupported(config)).supported)throw new Error('H.264 hardware-preferred configuration unsupported');
    encoder=new VideoEncoder({error:e=>{error=e;},output:chunk=>{
     if(!measuring)return;
     outputFrames++;bytes+=chunk.byteLength;timestamps.push(chunk.timestamp);
     if(keepVideo){const data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);video.push(data);}
    }});
    encoder.configure(config);
   }
   let readback:Uint8Array|undefined;
   const produce=async(i:number,count:number)=>{
    if(error)throw error;
    orbit(i,count);
    if(mode!=='render'){
     const start=performance.now();
     const frame=new VideoFrame(hook.canvas,{timestamp:Math.round(i*1e6/60),duration:Math.round(1e6/60),alpha:'discard'});
     if(measuring)creationMs+=performance.now()-start;
     try{
      if(mode==='encode'){
       encoder!.encode(frame,{keyFrame:i===0});maxQueue=Math.max(maxQueue,encoder!.encodeQueueSize);
      }else if(mode==='readback'){
       readback??=new Uint8Array(frame.allocationSize());await frame.copyTo(readback);
      }
     }finally{frame.close();}
    }
    // A small pipeline, not an unbounded submission benchmark. GPU fences are
    // identical in all modes; no await per rendered frame in the encode path.
    if(i%4===3)await backend.device.queue.onSubmittedWorkDone();
    if(encoder&&encoder.encodeQueueSize>8)await new Promise<void>((resolve,reject)=>{
     const e=encoder!;
     const finish=()=>{e.removeEventListener('dequeue',check);clearTimeout(timeout);};
     const check=()=>{if(error){finish();reject(error);}else if(e.encodeQueueSize<=8){finish();resolve();}};
     const timeout=setTimeout(()=>{finish();reject(new Error('Encoder queue stalled'));},10000);
     e.addEventListener('dequeue',check);check();
    });
   };
   for(let i=0;i<48;i++)await produce(i,48);
   await backend.device.queue.onSubmittedWorkDone();await encoder?.flush();
   measuring=true;maxQueue=0;progress=`${width}×${height} ${mode}: measuring`;
   const start=performance.now();
   for(let i=0;i<frames;i++){await produce(i,frames);if(i%60===59)progress=`${width}×${height} ${mode}: ${i+1}/${frames}`;}
   await backend.device.queue.onSubmittedWorkDone();await encoder?.flush();
   const seconds=(performance.now()-start)/1000;
   if(error)throw error;
   if(encoder&&(outputFrames!==frames||new Set(timestamps).size!==frames||timestamps.some((t,i)=>t!==Math.round(i*1e6/60)))){
    throw new Error(`Encoded frames/timestamps differ from input: ${outputFrames}/${frames}`);
   }
   const result={width,height,mode,frames,seconds,fps:frames/seconds,realtime60:frames/60/seconds,
    frameCreationMs:creationMs/frames,encodedFrames:outputFrames,encodedBytes:bytes,maxEncodeQueue:maxQueue,config};
   results.push(result);progress='ready';return result;
  }catch(e){progress=`failed: ${e}`;throw e;}
  finally{if(encoder&&encoder.state!=='closed')encoder.close();busy=false;}
 };
 const api={run,results,get progress(){return progress;},scene:{pieces:initial.items.length,marbles:initial.marbles.length,physics:'frozen',backend:'WebGPU',userAgent:navigator.userAgent},
  videoBase64(){return video.map(chunk=>{let s='';for(let i=0;i<chunk.length;i+=32768)s+=String.fromCharCode(...chunk.subarray(i,i+32768));return btoa(s);});},
 };
 Object.assign(window,{videoBenchmark:api});
 document.documentElement.dataset.videoBenchmark='ready';
}
