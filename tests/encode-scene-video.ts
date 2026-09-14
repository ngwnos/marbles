import type {WebGPURenderer} from 'three/webgpu';

/** Fixed-clock canvas → hardware-preferred H.264 → the existing local MP4 muxer. */
export async function encodeSceneVideo({renderer,endpoint,frames,fps,draw,metadata,onProgress}: {
 renderer:WebGPURenderer;endpoint:string;frames:number;fps:30|60;
 draw:(frame:number)=>void;metadata:Record<string,unknown>;onProgress:(frame:number)=>void;
}){
 const address=new URL(endpoint);
 if(address.protocol!=='http:'||address.hostname!=='127.0.0.1')throw new Error('Use the local video receiver');
 const backend=renderer.backend as unknown as {isWebGPUBackend?:boolean;device:{queue:{onSubmittedWorkDone():Promise<void>}}};
 if(!backend.isWebGPUBackend)throw new Error('WebGPU is required for export');
 const {width,height}=renderer.domElement;
 const config:VideoEncoderConfig={codec:'avc1.640034',width,height,framerate:fps,bitrate:16_000_000,
  hardwareAcceleration:'prefer-hardware',latencyMode:'quality',avc:{format:'annexb'}};
 if(!(await VideoEncoder.isConfigSupported(config)).supported)throw new Error('H.264 encoder configuration unsupported');
 let error:Error|undefined,encoded=0,bytes=0,sequence=0,chunkBytes=0,chunks:Uint8Array[]=[];
 const started=performance.now();
 const encoder=new VideoEncoder({error:e=>{error=e;},output:chunk=>{
  if(chunk.timestamp!==Math.round(encoded*1e6/fps)){error=new Error('Encoder reordered or lost a frame');return;}
  const data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);chunks.push(data);
  encoded++;bytes+=data.byteLength;chunkBytes+=data.byteLength;
 }});
 const upload=async()=>{
  if(!chunks.length)return;
  const batch=chunks;chunks=[];chunkBytes=0;
  const response=await fetch(`${endpoint}/chunk?sequence=${sequence++}`,{method:'POST',body:new Blob(batch as BlobPart[],{type:'video/h264'})});
  if(!response.ok)throw new Error(await response.text());
 };
 try{
  encoder.configure(config);
  for(let i=0;i<frames;i++){
   if(error)throw error;
   draw(i);
   const timestamp=Math.round(i*1e6/fps);
   const frame=new VideoFrame(renderer.domElement,{timestamp,duration:Math.round((i+1)*1e6/fps)-timestamp,alpha:'discard'});
   try{encoder.encode(frame,{keyFrame:i%(fps*2)===0});}finally{frame.close();}
   if(i%4===3)await backend.device.queue.onSubmittedWorkDone();
   if(encoder.encodeQueueSize>8)await new Promise<void>((resolve,reject)=>{
    const finish=()=>{encoder.removeEventListener('dequeue',check);clearTimeout(timeout);};
    const check=()=>{if(error){finish();reject(error);}else if(encoder.encodeQueueSize<=8){finish();resolve();}};
    const timeout=setTimeout(()=>{finish();reject(new Error('Encoder queue stalled'));},15000);
    encoder.addEventListener('dequeue',check);check();
   });
   if(chunkBytes>=8*1024*1024)await upload();
   if(i%30===0)onProgress(i);
  }
  await backend.device.queue.onSubmittedWorkDone();await encoder.flush();await upload();
  if(error)throw error;
  if(encoded!==frames)throw new Error(`Missing frames: ${encoded}/${frames}`);
  const result={...metadata,width,height,fps,frames:encoded,duration:frames/fps,bytes,wallSeconds:(performance.now()-started)/1000};
  const response=await fetch(`${endpoint}/finish`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(result)});
  if(!response.ok)throw new Error(await response.text());
  return {...result,output:await response.json()};
 }finally{if(encoder.state!=='closed')encoder.close();}
}
