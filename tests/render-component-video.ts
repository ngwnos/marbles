import * as T from 'three/webgpu';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {loadPreviewMesh} from '../src/geometry/preview-mesh';
import {START} from '../src/pieces/start';
import {PARTS} from '../src/assembly/catalog';
import references from './fixtures/component-photos.json';
import {encodeSceneVideo} from './encode-scene-video';

type Photo={url:string;source:string;crop?:number[]};
type Part={id:string;name:string;color:number;photos:Photo[]};
const parts:Part[]=references;
const size=1080,cell=size/2,fps=60,pairSeconds=2,framesPerPair=fps*pairSeconds;
const modelUrls=import.meta.glob('../src/generated/*.bin',{query:'?url',import:'default',eager:true}) as Record<string,string>;
const renderer=new T.WebGPURenderer({antialias:true});
renderer.setPixelRatio(1);renderer.setSize(size,size,false);
renderer.toneMapping=T.ACESFilmicToneMapping;renderer.autoClear=false;
document.body.appendChild(renderer.domElement);
let progress:Record<string,unknown>={state:'loading'},busy=false,playing=false,playStarted=0;
const frames=parts.length/2*framesPerPair;

function cameraPose(camera:T.OrthographicCamera,t:number){
 const azimuth=T.MathUtils.degToRad(35+225*t);
 const elevation=T.MathUtils.degToRad(32+24*Math.sin(Math.PI*t));
 camera.position.set(Math.sin(azimuth)*Math.cos(elevation),Math.sin(elevation),Math.cos(azimuth)*Math.cos(elevation)).multiplyScalar(1000);
 camera.lookAt(0,0,0);camera.updateMatrixWorld();
}

async function loadModel(part:Part,environment:T.Texture){
 const scene=new T.Scene();scene.background=new T.Color(0xe8e7e3);
 scene.environment=environment;scene.environmentIntensity=.5;
 const light=new T.DirectionalLight(0xffffff,2);light.position.set(-100,230,160);
 scene.add(light,new T.HemisphereLight(0xffffff,0x9497a0,.65));
 const group=new T.Group();scene.add(group);
 const meshes=part.id==='paddle'?['paddle-body','paddle-wheel']:part.id==='start'?['start-body','start-rotor']:[part.id];
 for(const [index,name] of meshes.entries()){
  const geometry=await loadPreviewMesh(modelUrls[`../src/generated/${name}.bin`]);
  const color=index===0?part.color:part.id==='paddle'?0x1855cf:0xf1bf00;
  const material=new T.MeshPhysicalNodeMaterial({color,roughness:.27,clearcoat:.16,clearcoatRoughness:.3});
  const mesh=new T.Mesh(geometry,material);group.add(mesh);
  if(name==='start-rotor')mesh.position.set(START.pivotX,START.pivotY,0);
 }
 const bounds=new T.Box3().setFromObject(group),center=bounds.getCenter(new T.Vector3());
 group.position.copy(center).negate();group.updateMatrixWorld(true);bounds.translate(center.negate());
 const camera=new T.OrthographicCamera(-1,1,1,-1,.1,3000);
 const corners=[bounds.min.x,bounds.max.x].flatMap(x=>[bounds.min.y,bounds.max.y].flatMap(y=>[bounds.min.z,bounds.max.z].map(z=>new T.Vector3(x,y,z))));
 let extent=0;
 // Fit the entire turn once, so neither rotation nor elongated parts pump the zoom.
 for(let f=0;f<=framesPerPair;f++){
  cameraPose(camera,f/framesPerPair);
  for(const p of corners){const view=p.clone().applyMatrix4(camera.matrixWorldInverse);extent=Math.max(extent,Math.abs(view.x),Math.abs(view.y));}
 }
 extent*=1.16;camera.left=camera.bottom=-extent;camera.right=camera.top=extent;camera.updateProjectionMatrix();
 return {scene,camera,corners,extent};
}

async function loadPhoto(photo:Photo,cache:Record<string,string>){
 const response=await fetch(cache[photo.url]);if(!response.ok)throw new Error(`Missing reference: ${photo.url}`);
 const image=await createImageBitmap(await response.blob());
 const [x,y,w,h]=photo.crop??[0,0,1,1];
 const sw=w*image.width,sh=h*image.height;
 const side=Math.min(Math.max(sw,sh),image.width,image.height);
 const sx=T.MathUtils.clamp((x+w/2)*image.width-side/2,0,image.width-side);
 const sy=T.MathUtils.clamp((y+h/2)*image.height-side/2,0,image.height-side);
 // A true square crop of the original photo: no stretching or letterboxing.
 const canvas=document.createElement('canvas');canvas.width=canvas.height=cell;
 const ctx=canvas.getContext('2d')!;
 ctx.drawImage(image,sx,sy,side,side,0,0,cell,cell);
 image.close();
 const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
 return texture;
}

async function prepare(){
 if(parts.length%2||new Set(parts.map(p=>p.id)).size!==PARTS.length||PARTS.some(p=>!parts.find(r=>r.id===p.id)))throw new Error('Comparison must cover every component exactly once');
 await renderer.init();
 const response=await fetch('/tmp/component-video/photos.json');
 if(!response.ok)throw new Error('Run python3 scripts/cache-component-photos.py first');
 const cache:Record<string,string>=await response.json();
 const room=new RoomEnvironment(),pmrem=new T.PMREMGenerator(renderer),environment=pmrem.fromScene(room,.04);
 room.dispose();pmrem.dispose();
 const models=[] as Awaited<ReturnType<typeof loadModel>>[],photos:T.Texture[][]=[];
 for(const part of parts){
  models.push(await loadModel(part,environment.texture));
  photos.push(await Promise.all(part.photos.map(photo=>loadPhoto(photo,cache))));
  progress={state:'loading',part:part.name,completed:models.length,total:parts.length};
 }
 const photoScene=new T.Scene(),photoCamera=new T.OrthographicCamera(-1,1,1,-1,.1,10);
 photoCamera.position.z=1;
 const photoMaterial=new T.MeshBasicNodeMaterial({toneMapped:false});
 photoScene.add(new T.Mesh(new T.PlaneGeometry(2,2),photoMaterial));
 const panel=(x:number,y:number,scene:T.Scene,camera:T.Camera)=>{
  renderer.setViewport(x,y,cell,cell);renderer.setScissor(x,y,cell,cell);renderer.setScissorTest(true);renderer.render(scene,camera);
 };
 const draw=(frame:number)=>{
  const pair=Math.min(parts.length/2-1,Math.floor(frame/framesPerPair)),local=frame%framesPerPair,t=local/(framesPerPair-1);
  renderer.setScissorTest(false);renderer.setViewport(0,0,size,size);renderer.clear();
  for(let column=0;column<2;column++){
   const index=pair*2+column,{scene,camera}=models[index];cameraPose(camera,t);
   // WebGPURenderer canvas viewports have their origin at the upper left.
   panel(column*cell,0,scene,camera);
   photoMaterial.map=photos[index][Math.floor(local/(fps/2))%photos[index].length];
   panel(column*cell,cell,photoScene,photoCamera);
  }
 };
 // Compile each mesh/photo combination before the fixed-frame encoder runs.
 for(let i=0;i<frames;i+=fps/2)draw(i);
 await (renderer.backend as unknown as {device:{queue:{onSubmittedWorkDone():Promise<void>}}}).device.queue.onSubmittedWorkDone();
 draw(0);
 const pairs=Array.from({length:parts.length/2},(_,i)=>({start:i*pairSeconds,end:(i+1)*pairSeconds,parts:parts.slice(i*2,i*2+2).map(p=>({id:p.id,name:p.name,photos:p.photos}))}));
 const inspect=(frame:number)=>{
  const pair=Math.min(parts.length/2-1,Math.floor(frame/framesPerPair));draw(frame);
  return {pair,parts:parts.slice(pair*2,pair*2+2).map((p,j)=>{
   const m=models[pair*2+j],projected=m.corners.map(c=>c.clone().project(m.camera));
   return {id:p.id,maxNdc:Math.max(...projected.flatMap(v=>[Math.abs(v.x),Math.abs(v.y)])),photo:Math.floor((frame%framesPerPair)/(fps/2))%p.photos.length};
  })};
 };
 Object.assign(window,{componentVideo:{
  get progress(){return progress;},pairs,
  seek(frame:number){if(busy)throw new Error('Export in progress');playing=false;return inspect(Math.max(0,Math.min(frames-1,Math.floor(frame))));},
  play(){if(busy)return;playStarted=performance.now();playing=true;},
  pause(){playing=false;},
  inspect,
  async run({endpoint}:{endpoint:string}){
   if(busy)throw new Error('An export is already running');busy=true;playing=false;
   try{
    progress={state:'rendering',frame:0,frames};
    const result=await encodeSceneVideo({renderer,endpoint,frames,fps,draw,metadata:{kind:'component-reference-comparison',pairSeconds,cellSize:cell,referenceInterval:.5,pairs},onProgress:frame=>{progress={state:'rendering',frame,frames,pair:Math.floor(frame/framesPerPair)};}});
    progress={state:'complete',...result};return progress;
   }catch(error){progress={state:'failed',error:String(error)};throw error;}finally{busy=false;}
  },
 }});
 renderer.setAnimationLoop(()=>{if(playing&&!busy)draw(Math.floor((performance.now()-playStarted)/1000*fps)%frames);});
 progress={state:'ready',frames,duration:frames/fps,parts:parts.length};
 document.documentElement.dataset.componentVideo='ready';
}
prepare().catch(error=>{progress={state:'failed',error:String(error)};document.body.append(String(error));console.error(error);});
