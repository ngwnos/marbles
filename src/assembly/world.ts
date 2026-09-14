import {ASSEMBLY_STEP} from '../physics-settings';
import * as T from 'three/webgpu';
import {createRug} from './rug';
import {createStorageTub} from './storage-tub';
import {STORAGE_TUB,aboveStorageTub,insideTubOpening} from './storage-tub-spec';
import {createTubFill,TUB_PACK_VERSION} from './tub-stock';
import {tubDragAngle} from './tub-motion';
import type {TubState} from './tub-physics';
import {loadEnvironment} from './environment';
import {createMarbleOutline} from './marble-outline';
import {createInstanceBuffer} from './instance-buffer';
import {createMarbleFollow} from './marble-follow';
import {createOrbitSlew} from './orbit-slew';
import {createConstructionCamera} from './construction-camera';
import {createMazeOrbit} from './maze-orbit';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {columnsFor,rotateAroundColumn} from './pivot';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {loadPreviewMesh} from '../geometry/preview-mesh';
import {PARTS,PART_BY_ID,type V3} from './catalog';
import {availableTargets,solveSnap,worldPort,rotate,type Connection,type Pose} from './snapping';
import {PRESETS} from './presets';
import {createPresetStock,hasPackedPreset} from './preset-stock';
import {planConstruction,createConstructionFocus} from './construction';
import {createConstructionRun} from './construction-run';
import {randomPieceColor,restorePieceColor,pieceAccentColor} from './piece-colors';
import {START} from '../pieces/start';
import {PADDLE,paddleAxleY} from '../pieces/paddle-wheel';
import {inputColumns,inputIsConnected} from './drop';
import {createAssemblyPhysics,ASSEMBLY_MARBLE_RADIUS} from './physics';
import {PART_UNITS} from '../pieces/marbleworks-spec';
const urls=import.meta.glob('../generated/*.bin',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
const collisionUrls=import.meta.glob('../generated/*-collision.json',{query:'?url',import:'default',eager:true}) as Record<string,string>;
const Y=new T.Vector3(0,1,0),capacity=256;
const saveKey="marbleworks-assembly-v1";
type Item={id:number;kind:string;color:number;position:T.Vector3;rotation:T.Quaternion;fixed:boolean;speed:number};
type Batch={mesh:T.InstancedMesh;geometry:T.BufferGeometry;ids:number[];buffer:ReturnType<typeof createInstanceBuffer>};
type Drag={item:Item;fresh:boolean;original?:{position:T.Vector3;rotation:T.Quaternion;connections:Connection[]};anchor:V3;yaw:number;lift:number;snap:ReturnType<typeof solveSnap>;};
type SavedItem={id:number;kind:string;color?:number;position:V3;rotation:[number,number,number,number];awake?:boolean;rotorRotation?:number[]};
type Layout={items:SavedItem[];connections:Connection[];tubSeed?:number;tubVersion?:number;tubInitialized?:boolean;tub?:TubState};
// Pre-tipping saves placed the stock on the carpet. Migrate both the active
// layout and the pre-preset backup, leaving connected maze pieces untouched.
function migrateTubStock(layout:Layout){
 if(layout.tub||!Number.isSafeInteger(layout.tubSeed))return;
 const old=[-760,0,60];
 for(const p of layout.items)if(Array.isArray(p.position)&&p.position.length===3&&p.position.every(Number.isFinite)&&aboveStorageTub(p.position[0],p.position[2],old)&&!layout.connections.some(c=>c.a===p.id||c.b===p.id))p.position=p.position.map((v,j)=>v+STORAGE_TUB.position[j]-old[j]) as V3;
 layout.tub={angle:0,awake:false};
}
export type BuilderState={message:string;holding:boolean;count:number;fillingTub?:boolean;dumpingTub?:boolean;constructing?:{completed:number;total:number};canRestore?:boolean;selected?:{kind:string;name:string;column:number;columns:number;angle:number}};
export async function createBuilder(host:HTMLElement,onChange:(s:BuilderState)=>void,onThumbnail:(id:string,url:string)=>void){
 const profiling=import.meta.env.DEV&&new URLSearchParams(location.search).get('verify')==='performance';
 const renderer=new T.WebGPURenderer({antialias:true,trackTimestamp:profiling});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(host.clientWidth,host.clientHeight);host.appendChild(renderer.domElement);
 renderer.toneMapping=T.ACESFilmicToneMapping;
 const scene=new T.Scene();
 const camera=new T.PerspectiveCamera(42,host.clientWidth/host.clientHeight,1,30000);camera.position.set(520,520,650);
 const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,60,0);controls.enableDamping=true;controls.minDistance=100;controls.maxDistance=3000;controls.maxPolarAngle=Math.PI*.49;controls.update();
 const constructionSlew=createOrbitSlew(camera,controls.target,4);
 let constructionFocus:T.Vector3|undefined;
 let plannedGateFocus:T.Vector3|undefined;
 let cinematicGateId:number|undefined;
 let constructionCamera:ReturnType<typeof createConstructionCamera>|undefined;
 let mazeOrbit:ReturnType<typeof createMazeOrbit>|undefined,followedMaze:number[]=[];
 const previousCamera=camera.position.clone(),previousTarget=controls.target.clone();let cameraStep=0;
 const stopMazeOrbit=()=>{mazeOrbit?.dispose();mazeOrbit=undefined;};

 const physics=await createAssemblyPhysics();await renderer.init();
 const marbleFollow=createMarbleFollow(camera,controls);
 const environment=await loadEnvironment(renderer);scene.environment=environment.lighting;scene.background=environment.source;scene.add(environment.background);
 const rug=await createRug(8);scene.add(rug.group);
 const tub=await createStorageTub();scene.add(tub.mesh);
 const dropLayer=document.createElement('div');dropLayer.className='assembly-drop-layer';host.appendChild(dropLayer);
 const ballGeometry=new T.SphereGeometry(ASSEMBLY_MARBLE_RADIUS,24,16),ballMaterial=new T.MeshPhysicalNodeMaterial({color:0xe44d2e,roughness:.16,clearcoat:1});
 const ballMeshes:T.Mesh[]=[];
 const marbleOutline=createMarbleOutline();
 let wheelBatch:T.InstancedMesh|undefined;
 let wheelGeometry:T.BufferGeometry|undefined;
 const wheelMaterial=new T.MeshPhysicalNodeMaterial({roughness:.27,clearcoat:.16});
 let wheelIds:number[]=[];
 let wheelBuffer:ReturnType<typeof createInstanceBuffer>|undefined,gateBuffer:ReturnType<typeof createInstanceBuffer>|undefined;
 let gateBatch:T.InstancedMesh|undefined,gateGeometry:T.BufferGeometry|undefined;
 const gateMaterial=new T.MeshPhysicalNodeMaterial({roughness:.27,clearcoat:.16});
 let gateIds:number[]=[];
 const marbleMaterials=new Map<number,T.MeshPhysicalNodeMaterial>();
 const batches=new Map<string,Batch>(),items=new Map<number,Item>();let connections:Connection[]=[],serial=1,drag:Drag|undefined,disposed=false;
 let cinematic=false;
 let selected:Item|undefined,columnIndex=0,pending:{item:Item;grab:V3;x:number;y:number;column?:number}|undefined;
 let rotationEdit:{item:Item;original:Pose;rotation:T.Quaternion;connections:Connection[];column:V3}|undefined;
 const pivot=new T.Object3D();scene.add(pivot);
 const rotationControl=new TransformControls(camera,renderer.domElement);rotationControl.setMode('rotate');rotationControl.setSpace('world');rotationControl.showX=false;rotationControl.showZ=false;rotationControl.setSize(.8);scene.add(rotationControl.getHelper());
 const columnMarkers=new T.Group();scene.add(columnMarkers);
 const columnGeometry=new T.SphereGeometry(5,16,12),columnMaterial=new T.MeshBasicNodeMaterial({color:0xf9b72d,depthTest:false});
 const ghostMaterial=new T.MeshPhysicalNodeMaterial({color:0x2b8b6b,roughness:.25,transparent:true,opacity:.62,depthWrite:false});
 const ghost=new T.Mesh(new T.BufferGeometry(),ghostMaterial);ghost.visible=false;scene.add(ghost);
 const markerGeometry=new T.SphereGeometry(3.4,12,8),markerMaterial=new T.MeshBasicNodeMaterial({color:0xffffff,depthTest:false});
 const markers=new T.InstancedMesh(markerGeometry,markerMaterial,2048);markers.count=0;markers.frustumCulled=false;markers.renderOrder=5;scene.add(markers);
 const matrix=new T.Matrix4(),unit=new T.Vector3(1,1,1),instanceColor=new T.Color(),ray=new T.Raycaster(),pointer=new T.Vector2();let clientX=0,clientY=0,inside=false;
 let previousLayout:Layout|undefined,tubSeed:number|undefined,tubInitialized=false,fillingTub=false;
 let wasDumping=false;
 let construction:ReturnType<typeof createConstructionRun>|undefined;
 let constructionSpeed=1;
 let tubDrag:{grab:T.Vector3;angle:number;pointerId:number}|undefined;
 const stored=(i:Item)=>{const p=physics.tubPose(),v=i.position.clone().sub(p.position).applyQuaternion(p.rotation.clone().invert());return v.y>=-5&&insideTubOpening(v.x,v.z);};
 const snapshot=():Layout=>({tub:{angle:physics.tubPose().angle,awake:physics.tubPose().awake},tubSeed,tubInitialized,tubVersion:tubSeed===undefined?undefined:TUB_PACK_VERSION,items:[...items.values()].map(i=>{const w=physics.wheelPose(i.id);return {id:i.id,kind:i.kind,color:i.color,position:i.position.toArray(),rotation:i.rotation.toArray(),awake:physics.pose(i.id)?.awake,...(w?{rotorRotation:i.rotation.clone().invert().multiply(w.rotation).toArray()}: {})};}),connections:connections.map(c=>({...c}))});
 const notify=(message=drag?'Drag to connect · Q / E rotate · wheel changes height':selected?'Choose a column, then drag its green ring to rotate freely':'Click a piece to select · drag to move')=>onChange({message,holding:!!drag,count:items.size,fillingTub,dumpingTub:physics.tubPose().dumping,constructing:construction?.inspect(),canRestore:!!previousLayout,selected:selected&&!drag?{kind:selected.kind,name:PART_BY_ID[selected.kind].name,column:columnIndex,columns:columnsFor(PART_BY_ID[selected.kind].ports).length,angle:pose(selected).yaw*180/Math.PI}:undefined});
 const pose=(item:Item):Pose=>({position:item.position.toArray(),yaw:new T.Euler().setFromQuaternion(item.rotation,'YXZ').y});
 const upright=(i:Item)=>Y.clone().applyQuaternion(i.rotation).dot(Y)>.999;
 const redraw=()=>{
  for(const b of batches.values()){b.ids.length=0;b.buffer.begin();}
  for(const i of items.values())if(i!==drag?.item){const b=batches.get(i.kind)!;b.ids.push(i.id);b.buffer.write(i.position,i.rotation,instanceColor.setHex(i.color).multiplyScalar(i===selected&&!cinematic?1.35:1));}
  wheelIds.length=0;wheelBuffer?.begin();
  if(wheelBatch){
   for(const i of items.values())if(i.kind==='paddle'&&(i!==drag?.item||ghost.visible)){
    const w=physics.wheelPose(i.id);
    const position=w?.position??new T.Vector3(PADDLE.x,paddleAxleY,PADDLE.z).applyQuaternion(i.rotation).add(i.position);
    wheelBuffer!.write(position,w?.rotation??i.rotation,instanceColor.setHex(pieceAccentColor(i.color)));wheelIds.push(i.id);
   }
   wheelBuffer!.end();
  }
  gateIds.length=0;gateBuffer?.begin();
  if(gateBatch){
   for(const i of items.values())if(i.kind==='start'&&(i!==drag?.item||ghost.visible)){
    const w=physics.wheelPose(i.id);
    const position=w?.position??new T.Vector3(START.pivotX,START.pivotY,0).applyQuaternion(i.rotation).add(i.position);
    gateBuffer!.write(position,w?.rotation??i.rotation,instanceColor.setHex(pieceAccentColor(i.color)));gateIds.push(i.id);
   }
   gateBuffer!.end();
  }
  for(const b of batches.values())b.buffer.end();
 };
 const body=(i:Item,fixed:boolean,state:{awake?:boolean;rotorRotation?:number[]}={})=>{i.fixed=fixed;physics.add(i.id,i.kind,i.position.toArray(),i.rotation,fixed,state);};
 const reconcile=()=>{
  const visited=new Set<number>();
  for(const i of items.values()){
   if(i===drag?.item||visited.has(i.id))continue;
   const group=[i];visited.add(i.id);
   for(let n=0;n<group.length;n++)for(const c of connections){const other=c.a===group[n].id?c.b:c.b===group[n].id?c.a:undefined;if(other!==undefined&&!visited.has(other)&&items.has(other)){visited.add(other);group.push(items.get(other)!);}}
   // Connected parts are locked construction placements. An isolated piece
   // returns to physics when its last connection is removed.
   const fixed=group.length>1;
   for(const p of group)if(p.fixed!==fixed)body(p,fixed);
  }
 };
 const inletPosition=(item:Item,point:V3)=>new T.Vector3(...point).applyQuaternion(item.rotation).add(item.position);
 const inletClear=(item:Item,inlet:ReturnType<typeof inputColumns>[number])=>{
  if(!upright(item)||inputIsConnected(item.id,inlet.port.id,connections))return false;
  const inverse=item.rotation.clone().invert();
  return !physics.marblePositions().some(p=>{p.sub(item.position).applyQuaternion(inverse);return Math.hypot(p.x-inlet.position[0],p.z-inlet.position[2])<ASSEMBLY_MARBLE_RADIUS*2&&p.y>inlet.port.position[1]-ASSEMBLY_MARBLE_RADIUS*2&&p.y<inlet.position[1]+ASSEMBLY_MARBLE_RADIUS*2;});
 };
 const dropMarble=(portId:string)=>{
  if(!selected||drag||rotationEdit)return false;
  const inlet=inputColumns(selected.kind).find(i=>i.port.id===portId);
  if(!inlet||!inletClear(selected,inlet))return false;
  return physics.dropMarble(inletPosition(selected,inlet.position).toArray());
 };
 let dropSelection:number|undefined;
 const refreshDrops=()=>{
  if(dropSelection!==selected?.id){dropSelection=selected?.id;dropLayer.replaceChildren();
   if(selected)for(const [index,inlet] of inputColumns(selected.kind).entries()){
    const button=document.createElement('button');button.className='drop-marble';button.textContent='↓ Drop marble';button.setAttribute('aria-label',`Drop marble into input ${index+1}`);
    button.dataset.port=inlet.port.id;button.addEventListener('pointerdown',e=>e.stopPropagation());button.addEventListener('pointerup',e=>e.stopPropagation());button.addEventListener('click',()=>dropMarble(inlet.port.id));dropLayer.appendChild(button);
   }
  }
  if(!selected)return;
  const inlets=inputColumns(selected.kind);
  for(const button of dropLayer.querySelectorAll<HTMLButtonElement>('button')){
   const inlet=inlets.find(i=>i.port.id===button.dataset.port)!;
   const p=inletPosition(selected,inlet.position);p.y+=22;p.project(camera);
   button.hidden=!!drag||!!rotationEdit||!upright(selected)||inputIsConnected(selected.id,inlet.port.id,connections)||p.z< -1||p.z>1||Math.abs(p.x)>1||Math.abs(p.y)>1;
   button.disabled=!inletClear(selected,inlet);
   button.style.left=`${(p.x+1)*host.clientWidth/2}px`;button.style.top=`${(1-p.y)*host.clientHeight/2}px`;
  }
 };
 const refreshPivot=()=>{
  if(!selected||drag){rotationControl.detach();columnMarkers.visible=false;return;}
  const columns=columnsFor(PART_BY_ID[selected.kind].ports);columnMarkers.visible=true;
  while(columnMarkers.children.length<columns.length){const m=new T.Mesh(columnGeometry,columnMaterial);m.renderOrder=10;columnMarkers.add(m);}
  columnMarkers.children.forEach((m,index)=>{m.visible=index<columns.length;if(!m.visible)return;const c=columns[index];m.position.fromArray(c.position).applyQuaternion(selected!.rotation).add(selected!.position);m.position.y+=23;m.scale.setScalar(index===columnIndex?1.4:1);});
  if(!rotationEdit){pivot.position.fromArray(columns[columnIndex].position).applyQuaternion(selected.rotation).add(selected.position);pivot.quaternion.identity();pivot.updateMatrixWorld(true);rotationControl.attach(pivot);}
 };
 const selectColumn=(index:number)=>{if(!selected||rotationEdit)return;columnIndex=Math.max(0,Math.min(index,columnsFor(PART_BY_ID[selected.kind].ports).length-1));refreshPivot();notify();};
 const select=(item?:Item)=>{selected=item;columnIndex=0;refreshPivot();notify();};
 const beginRotation=()=>{
  if(!selected||drag||rotationEdit)return;
  const column=columnsFor(PART_BY_ID[selected.kind].ports)[columnIndex].position;
  rotationEdit={item:selected,original:pose(selected),rotation:selected.rotation.clone(),connections:connections.slice(),column};
  physics.remove(selected.id);controls.enabled=false;
 };
 const changeRotation=(yaw:number)=>{
  if(!rotationEdit)return;const e=rotationEdit,delta=new T.Quaternion().setFromAxisAngle(Y,yaw-e.original.yaw);const anchor=new T.Vector3(...e.column).applyQuaternion(e.rotation).add(new T.Vector3(...e.original.position));e.item.rotation.copy(delta).multiply(e.rotation);if(Y.clone().applyQuaternion(e.rotation).distanceTo(Y)<1e-10)e.item.position.fromArray(rotateAroundColumn(e.original,e.column,yaw).position);else e.item.position.copy(anchor).sub(new T.Vector3(...e.column).applyQuaternion(e.item.rotation));redraw();refreshPivot();notify();
 };
 const finishRotation=(cancelled=false)=>{
  if(!rotationEdit)return;const e=rotationEdit;rotationEdit=undefined;
  if(cancelled){e.item.position.fromArray(e.original.position);e.item.rotation.copy(e.rotation);connections=e.connections;}
  else{
   // Keep joints on the pivot column; only detach ends that actually moved.
   connections=connections.filter(c=>{if(c.a!==e.item.id&&c.b!==e.item.id)return true;const own=PART_BY_ID[e.item.kind].ports.find(p=>p.id===(c.a===e.item.id?c.ap:c.bp))!;const other=items.get(c.a===e.item.id?c.b:c.a)!;const mate=PART_BY_ID[other.kind].ports.find(p=>p.id===(c.a===e.item.id?c.bp:c.ap))!;return new T.Vector3(...worldPort(own,pose(e.item))).distanceTo(new T.Vector3(...worldPort(mate,pose(other))))<.075;});
   // Reconnect other ends only if they already line up at the chosen angle.
   const targets=availableTargets([...items.values()].filter(i=>upright(i)&&(i.fixed||i.speed<.3)).map(i=>({id:i.id,kind:i.kind,pose:pose(i)})),connections,e.item.id);
   for(const p of PART_BY_ID[e.item.kind].ports){if(connections.some(c=>c.a===e.item.id&&c.ap===p.id||c.b===e.item.id&&c.bp===p.id))continue;const t=targets.find(t=>t.port.gender!==p.gender&&t.port.axis===-p.axis&&new T.Vector3(...worldPort(p,pose(e.item))).distanceTo(new T.Vector3(...t.position))<.075);if(t)connections.push({a:e.item.id,ap:p.id,b:t.piece,bp:t.port.id});}
  }
  body(e.item,connections.some(c=>c.a===e.item.id||c.b===e.item.id));reconcile();controls.enabled=true;refreshPivot();notify();
 };
 rotationControl.addEventListener('mouseDown',beginRotation);
 rotationControl.addEventListener('objectChange',()=>{if(rotationEdit)changeRotation(rotationEdit.original.yaw+new T.Euler().setFromQuaternion(pivot.quaternion,'YXZ').y);});
 rotationControl.addEventListener('mouseUp',()=>finishRotation());
 const start=(i:Item,fresh:boolean,grab?:V3)=>{
  if(drag)return;
  select();
  const original=fresh?undefined:{position:i.position.clone(),rotation:i.rotation.clone(),connections:connections.slice()};
  connections=connections.filter(c=>c.a!==i.id&&c.b!==i.id);physics.remove(i.id);
  const yaw=pose(i).yaw;i.rotation.setFromAxisAngle(Y,yaw);
  const ports=PART_BY_ID[i.kind].ports,anchor=grab??(ports.find(p=>p.gender==='female'&&p.axis===-1)??ports[0]).position;
  drag={item:i,fresh,original,anchor,yaw,lift:Math.max(anchor[1]+35,i.position.y+anchor[1]),snap:undefined};
  // Lift stored parts clear of the rim before moving them sideways.
  if(!fresh&&stored(i))drag.lift=Math.max(drag.lift,new T.Box3().setFromObject(tub.mesh).max.y+18+anchor[1]-batches.get(i.kind)!.geometry.boundingBox!.min.y);
  ghost.geometry=batches.get(i.kind)!.geometry;ghost.visible=true;controls.enabled=false;redraw();notify();
 };
 const begin=(kind:string,event:PointerEvent|{clientX:number;clientY:number})=>{
  if(!batches.has(kind)||drag||tubDrag||fillingTub||construction||physics.tubPose().dumping)return;
  if([...items.values()].filter(i=>i.kind===kind).length>=capacity){notify('This part type has reached its 256-copy limit.');return;}
  clientX=event.clientX;clientY=event.clientY;
  const item:Item={id:serial++,kind,color:randomPieceColor(),position:new T.Vector3(),rotation:new T.Quaternion(),fixed:false,speed:0};items.set(item.id,item);start(item,true);updateDrag();
 };
 const setPointer=()=>{const r=renderer.domElement.getBoundingClientRect();inside=clientX>=r.left&&clientX<r.right&&clientY>=r.top&&clientY<r.bottom;pointer.set((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);return r;};
 function updateDrag(){
  if(!drag)return;const rect=setPointer();ghost.visible=inside;if(!inside){markers.count=0;return;}
  const hit=ray.ray.intersectPlane(new T.Plane(Y,-drag.lift),new T.Vector3());if(!hit)return;
  // The open bin is another drop surface. Keep the whole upright piece above
  // its rim while held, then let the ordinary rigid body settle into the cavity.
  const rimLift=Math.max(drag.lift,STORAGE_TUB.position[1]+STORAGE_TUB.height+18+drag.anchor[1]-batches.get(drag.item.kind)!.geometry.boundingBox!.min.y);
  const rimHit=ray.ray.intersectPlane(new T.Plane(Y,-rimLift),new T.Vector3());
  const overTub=Math.abs(physics.tubPose().angle)<.02&&!!rimHit&&aboveStorageTub(rimHit.x,rimHit.z);if(overTub)hit.copy(rimHit!);
  const offset=rotate(drag.anchor,drag.yaw),desired:Pose={yaw:drag.yaw,position:hit.toArray().map((v,j)=>v-offset[j]) as V3};
  const candidates=[...items.values()].filter(i=>i!==drag!.item&&upright(i)&&(i.fixed||i.speed<.3)).map(i=>({id:i.id,kind:i.kind,pose:pose(i)}));
  const targets=overTub?[]:availableTargets(candidates,connections,drag.item.id);
  const score=(p:Pose)=>{if(p.position[1]+batches.get(drag!.item.kind)!.geometry.boundingBox!.min.y<-.2)return Infinity;const anchor=new T.Vector3(...rotate(drag!.anchor,p.yaw)).add(new T.Vector3(...p.position)).project(camera);if(anchor.z>1)return Infinity;return Math.hypot((anchor.x-pointer.x)*rect.width/2,(anchor.y-pointer.y)*rect.height/2);};
  drag.snap=solveSnap(drag.item.kind,desired,targets,score,32);
  let spacing=false;
  if(!drag.snap&&drag.item.kind==='base'){
   // Ground supports magnetize to the common connector span. Users should
   // not have to place the second tower with sub-millimetre mouse precision.
   const a=worldPort({id:'anchor',position:drag.anchor,gender:'male',axis:1},desired);
   const nearby=targets.filter(t=>t.port.gender==='male'&&t.port.axis===1).map(t=>({t,d:Math.hypot(a[0]-t.position[0],a[2]-t.position[2])})).filter(v=>Math.abs(v.d-PART_UNITS.portSpan)<14).sort((a,b)=>Math.abs(a.d-PART_UNITS.portSpan)-Math.abs(b.d-PART_UNITS.portSpan))[0];
   if(nearby){const f=PART_UNITS.portSpan/nearby.d;desired.position[0]=nearby.t.position[0]+(a[0]-nearby.t.position[0])*f-offset[0];desired.position[2]=nearby.t.position[2]+(a[2]-nearby.t.position[2])*f-offset[2];spacing=true;}
  }
  const chosen=drag.snap?.pose??desired;drag.item.position.fromArray(chosen.position);drag.item.rotation.setFromAxisAngle(Y,chosen.yaw);
  ghost.position.copy(drag.item.position);ghost.quaternion.copy(drag.item.rotation);ghostMaterial.color.setHex(drag.snap?0x18a66b:drag.item.color);
  markers.count=Math.min(targets.length,2048);
  targets.slice(0,2048).forEach((t,n)=>{markers.setMatrixAt(n,matrix.makeTranslation(...t.position));markers.setColorAt(n,new T.Color(drag!.snap?.matches.some(m=>m.target===t)?0x09ba62:t.port.gender==='male'?0xe29b22:0x2f81dd));});
  markers.instanceMatrix.needsUpdate=true;if(markers.instanceColor)markers.instanceColor.needsUpdate=true;
  notify(drag.snap?`${drag.snap.matches.length} connector${drag.snap.matches.length===1?'':'s'} aligned · release to join`:spacing?'Support spacing aligned to a track span · release onto floor':'No connection · release to let it fall');
 }
 const cancel=()=>{
  if(!drag)return;const d=drag;drag=undefined;
  if(d.fresh)items.delete(d.item.id);else{d.item.position.copy(d.original!.position);d.item.rotation.copy(d.original!.rotation);connections=d.original!.connections;body(d.item,d.item.fixed);}
  ghost.visible=false;markers.count=0;controls.enabled=true;reconcile();redraw();notify();
 };
 const drop=()=>{
  if(!drag)return;if(!inside){cancel();return;}const d=drag;drag=undefined;
  if(d.snap){for(const m of d.snap.matches)connections.push({a:d.item.id,ap:m.port.id,b:m.target.piece,bp:m.target.port.id});body(d.item,true);for(const m of d.snap.matches){const t=items.get(m.target.piece)!;if(!t.fixed)body(t,true);}}
  else body(d.item,false);
  ghost.visible=false;markers.count=0;controls.enabled=true;reconcile();redraw();notify(d.snap?`Joined ${d.snap.matches.length} connector${d.snap.matches.length===1?'':'s'}`:'Released — loose pieces fall under gravity');
 };
 const releaseTub=()=>{if(!tubDrag)return;const id=tubDrag.pointerId;tubDrag=undefined;physics.endTubTip();if(renderer.domElement.hasPointerCapture(id))renderer.domElement.releasePointerCapture(id);controls.enabled=true;notify('Released tub · gravity controls the tip');};
 const cancelInteraction=()=>{releaseTub();pending=undefined;if(rotationEdit)finishRotation(true);cancel();controls.enabled=true;};
 const onUp=(e:PointerEvent)=>{if(tubDrag){if(e.pointerId===tubDrag.pointerId)releaseTub();return;}if((e.target as Element).closest?.('.assembly-tools'))return;if(pending){const p=pending;pending=undefined;controls.enabled=true;if(selected!==p.item)select(p.item);if(p.column!==undefined)selectColumn(p.column);return;}if(!rotationControl.dragging)drop();};
 const onMove=(e:PointerEvent)=>{clientX=e.clientX;clientY=e.clientY;if(tubDrag){if(e.pointerId!==tubDrag.pointerId)return;const r=renderer.domElement.getBoundingClientRect();tubDrag.angle=tubDragAngle(tubDrag.grab,{x:clientX-r.left,y:clientY-r.top},camera,r.width,r.height,tubDrag.angle);physics.setTubTipTarget(tubDrag.angle);return;}if(pending&&Math.hypot(e.clientX-pending.x,e.clientY-pending.y)>5){const p=pending;pending=undefined;start(p.item,false,p.grab);}if(drag)updateDrag();};
 const onDown=(e:PointerEvent)=>{
  if(e.button!==0||drag||tubDrag||fillingTub||construction||physics.tubPose().dumping)return;clientX=e.clientX;clientY=e.clientY;setPointer();
  if(selected){columnMarkers.updateMatrixWorld(true);const columnHit=ray.intersectObjects(columnMarkers.children.filter(m=>m.visible),false)[0];if(columnHit){e.preventDefault();e.stopImmediatePropagation();selectColumn(columnMarkers.children.indexOf(columnHit.object));return;}if(rotationControl.axis)return;}
  let hit:T.Intersection|undefined=ray.intersectObjects([...batches.values()].map(b=>b.mesh).concat(wheelBatch?[wheelBatch]:[],gateBatch?[gateBatch]:[]),false)[0];
  const tubHit=ray.intersectObject(tub.mesh,false)[0];
  if(tubHit&&(!hit||tubHit.distance<hit.distance)){
   e.preventDefault();e.stopImmediatePropagation();select();controls.enabled=false;
   tubDrag={grab:tub.mesh.worldToLocal(tubHit.point.clone()),angle:physics.tubPose().angle,pointerId:e.pointerId};
   physics.beginTubTip();if(e.isTrusted)renderer.domElement.setPointerCapture(e.pointerId);
   notify('Drag the tub towards the carpet · release to let gravity take over');return;
  }
  if(hit?.instanceId!==undefined){const ids=hit.object===wheelBatch?wheelIds:hit.object===gateBatch?gateIds:[...batches.values()].find(b=>b.mesh===hit.object)!.ids;e.preventDefault();e.stopImmediatePropagation();const item=items.get(ids[hit.instanceId])!;const grab=hit.point.clone().sub(item.position).applyQuaternion(item.rotation.clone().invert()).toArray();const column=columnsFor(PART_BY_ID[item.kind].ports).findIndex(c=>Math.hypot(c.position[0]-grab[0],c.position[2]-grab[2])<14);pending={item,grab,x:e.clientX,y:e.clientY,column:column<0?undefined:column};controls.enabled=false;}
  else select();
 };
 const turn=(amount:number)=>{if(drag){drag.yaw+=amount;updateDrag();}else if(selected){beginRotation();changeRotation(rotationEdit!.original.yaw+amount);finishRotation();}};
 const setAngle=(degrees:number)=>{if(selected){beginRotation();changeRotation(degrees*Math.PI/180);finishRotation();}};
 const lift=(amount:number)=>{if(drag){drag.lift=Math.max(15,drag.lift+amount);updateDrag();}};
 const onWheel=(e:WheelEvent)=>{if(drag){e.preventDefault();e.stopImmediatePropagation();lift(-Math.sign(e.deltaY)*10);}};
 const onKey=(e:KeyboardEvent)=>{if((e.target as HTMLElement).matches?.('input,textarea,[contenteditable=true]'))return;if(e.ctrlKey||e.metaKey||e.altKey)return;if(e.key==='Escape'){if(construction){stopConstruction();return;}releaseTub();pending=undefined;if(rotationEdit)finishRotation(true);else if(drag)cancel();else select();controls.enabled=true;return;}if(!drag&&!selected)return;
  if(['q','e','r','Q','E','R'].includes(e.key)){e.preventDefault();turn((e.key.toLowerCase()==='q'?-1:1)*(e.shiftKey?1:15)*Math.PI/180);}
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();const id=drag?.item.id??selected!.id;drag=undefined;physics.remove(id);select();items.delete(id);connections=connections.filter(c=>c.a!==id&&c.b!==id);ghost.visible=false;markers.count=0;controls.enabled=true;reconcile();redraw();notify();}
 };
 renderer.domElement.addEventListener('pointerdown',onDown,true);renderer.domElement.addEventListener('wheel',onWheel,{capture:true,passive:false});window.addEventListener('pointermove',onMove);window.addEventListener('pointerup',onUp);window.addEventListener('pointercancel',cancelInteraction);window.addEventListener('blur',cancelInteraction);window.addEventListener('keydown',onKey);
 const resize=()=>{if(disposed||!host.clientWidth||!host.clientHeight)return;renderer.setSize(host.clientWidth,host.clientHeight);camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(host);
 const persist=!new URLSearchParams(location.search).has('verify');let previousSave='',restoreComplete=false;
 const save=()=>{if(!persist||drag||tubDrag||rotationEdit||!restoreComplete||fillingTub||construction||physics.tubPose().dumping)return;const json=JSON.stringify({version:1,...snapshot()});if(json!==previousSave){try{localStorage.setItem(saveKey,json);previousSave=json;}catch(error){console.warn('Assembly could not be saved',error);}}};
 let last=performance.now(),accumulator=0,lastSave=0,physicsMilliseconds=0;
 const advance=(dt:number)=>{
  previousCamera.copy(camera.position);previousTarget.copy(controls.target);cameraStep=dt;
  accumulator+=dt;physicsMilliseconds=0;
  while(accumulator>=ASSEMBLY_STEP){
   if(construction)try{
    if(construction.step(constructionSpeed)){
     const startId=construction.inspect().startId;construction=undefined;reconcile();
     select(startId===undefined?undefined:items.get(startId));notify('Preset constructed · Fill all slots, then Release');save();
    }
   }catch(error){stopConstruction();notify('Construction stopped: '+(error instanceof Error?error.message:String(error)));}
   const stepStart=profiling?performance.now():0;
   physics.step();if(profiling)physicsMilliseconds+=performance.now()-stepStart;accumulator-=ASSEMBLY_STEP;
  }
  const tubPose=physics.tubPose();tub.mesh.position.copy(tubPose.position);tub.mesh.quaternion.copy(tubPose.rotation);tub.mesh.updateMatrixWorld();
  if(wasDumping&&!tubPose.dumping){wasDumping=false;notify('Tub dumped · pieces are ready to build with');save();}
  for(const i of items.values())if(i!==drag?.item&&!i.fixed){const p=physics.poseIfChanged(i.id);if(p){i.position.copy(p.position);i.rotation.copy(p.rotation);i.speed=p.speed;}}
  const balls=physics.marbleStates(accumulator/ASSEMBLY_STEP);
  if(marbleFollow.approachingGate&&cinematicGateId!==undefined){
   const gate=items.get(cinematicGateId);if(gate)marbleFollow.moveGate(gateFocus(gate));
  }
  if(mazeOrbit)mazeOrbit.update(dt);else marbleFollow.update(balls,dt);
  if(constructionFocus&&!marbleFollow.approachingGate){const settled=constructionSlew.update(constructionFocus,dt);if(settled&&!construction)constructionFocus=undefined;}
  if(constructionCamera?.update(!!construction,dt))constructionCamera=undefined;
  while(ballMeshes.length<balls.length){const m=new T.Mesh(ballGeometry,ballMaterial);m.castShadow=true;m.receiveShadow=true;ballMeshes.push(m);scene.add(m);}
  ballMeshes.forEach((m,i)=>{m.visible=i<balls.length;if(m.visible){m.position.copy(balls[i].position);m.quaternion.copy(balls[i].rotation);const color=balls[i].color;if(!marbleMaterials.has(color)){const material=ballMaterial.clone();material.color.setHex(color);marbleMaterials.set(color,material);}m.material=marbleMaterials.get(color)!;}});
  redraw();controls.update(dt);if(!cinematic){refreshPivot();refreshDrops();}
 };
 const draw=()=>{
  if(cinematic){rotationControl.getHelper().visible=false;columnMarkers.visible=false;ghost.visible=false;markers.visible=false;}
  renderer.render(scene,camera);marbleOutline.render(renderer,camera,ballMeshes);
 };
 renderer.setAnimationLoop(()=>{
  const now=performance.now(),dt=Math.min((now-last)/1000,.05);last=now;advance(dt);draw();
  if(now-lastSave>1000){save();lastSave=now;}
 });
 // Geometry and GPU buffers are shared by every copy of each part.
 // Allocate instance colors before the first render, including empty batches,
 // so Three compiles their materials with instance-color support from the start.
 const thumbnails=new T.WebGPURenderer({antialias:true,alpha:true});thumbnails.setSize(144,96);await thumbnails.init();
 for(const part of PARTS){
  if(disposed)break;
  const geometry=await loadPreviewMesh(urls[`../generated/${part.id==='paddle'?'paddle-body':part.id==='start'?'start-body':part.id}.bin`]);
  // Reuse the continuous collision mesh from the existing component preview.
  const collisionKey=part.id==='paddle'?'paddle-body':part.id;
  const response=await fetch(collisionUrls[`../generated/${collisionKey}-collision.json`]);if(!response.ok)throw new Error('Could not load track collision surface');
  const collision=await response.json();
  const surfaces='parts' in collision?collision.parts:[collision];
  if(part.id==='paddle'){
   wheelGeometry=await loadPreviewMesh(urls['../generated/paddle-wheel.bin']);
   wheelGeometry.translate(-PADDLE.x,-paddleAxleY,-PADDLE.z);
   wheelBatch=new T.InstancedMesh(wheelGeometry,wheelMaterial,capacity);wheelBatch.castShadow=true;wheelBatch.receiveShadow=true;wheelBatch.count=0;wheelBatch.setColorAt(0,instanceColor.setHex(0xffffff));wheelBuffer=createInstanceBuffer(wheelBatch);scene.add(wheelBatch);
  }
  if(part.id==='start'){
   gateGeometry=await loadPreviewMesh(urls['../generated/start-rotor.bin']);
   gateBatch=new T.InstancedMesh(gateGeometry,gateMaterial,capacity);gateBatch.castShadow=true;gateBatch.receiveShadow=true;gateBatch.count=0;gateBatch.setColorAt(0,instanceColor.setHex(0xffffff));gateBuffer=createInstanceBuffer(gateBatch);scene.add(gateBatch);
  }
  physics.registerSurface(part.id,surfaces);
  const material=new T.MeshPhysicalNodeMaterial({roughness:.3,clearcoat:.15});const mesh=new T.InstancedMesh(geometry,material,capacity);mesh.castShadow=true;mesh.receiveShadow=true;mesh.count=0;mesh.setColorAt(0,instanceColor.setHex(0xffffff));scene.add(mesh);batches.set(part.id,{mesh,geometry,ids:[],buffer:createInstanceBuffer(mesh)});
  const thumbMaterial=material.clone();thumbMaterial.color.setHex(part.color);const thumbMaterials=[thumbMaterial];
  const thumbScene=new T.Scene();thumbScene.environment=environment.source;thumbScene.add(new T.Mesh(geometry,thumbMaterial));
  if(part.id==='paddle'){const material=wheelMaterial.clone();material.color.setHex(0x1855cf);thumbMaterials.push(material);const wheel=new T.Mesh(wheelGeometry!,material);wheel.position.set(PADDLE.x,paddleAxleY,PADDLE.z);thumbScene.add(wheel);}
  if(part.id==='start'){const material=gateMaterial.clone();material.color.setHex(0x188c65);thumbMaterials.push(material);const gate=new T.Mesh(gateGeometry!,material);gate.position.set(START.pivotX,START.pivotY,0);thumbScene.add(gate);}
  const box=geometry.boundingBox!,center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3()).length();const cam=new T.PerspectiveCamera(35,1.5,.1,10000);cam.position.copy(center).add(new T.Vector3(1,1,1).normalize().multiplyScalar(size*1.8));cam.lookAt(center);await thumbnails.renderAsync(thumbScene,cam);onThumbnail(part.id,thumbnails.domElement.toDataURL());
  thumbMaterials.forEach(m=>m.dispose());
 }
 thumbnails.dispose();
 if(persist){try{
  const saved=JSON.parse(localStorage.getItem(saveKey)??'null');
  if(saved?.version===1&&Array.isArray(saved.items)&&Array.isArray(saved.connections)){
   migrateTubStock(saved);
   if(saved.tub&&Number.isFinite(saved.tub.angle))physics.restoreTub({angle:saved.tub.angle,awake:!!saved.tub.awake});
   for(const p of saved.items){
    if(!Number.isSafeInteger(p.id)||items.has(p.id)||!PART_BY_ID[p.kind]||![p.position,p.rotation].every(Array.isArray)||p.position.length!==3||p.rotation.length!==4||![...p.position,...p.rotation].every((n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<10000))continue;
    if([...items.values()].filter(i=>i.kind===p.kind).length>=capacity)continue;
    const i:Item={id:p.id,kind:p.kind,color:restorePieceColor(p.color),position:new T.Vector3(...p.position),rotation:new T.Quaternion(...p.rotation).normalize(),fixed:false,speed:0};items.set(i.id,i);serial=Math.max(serial,i.id+1);body(i,false,{awake:typeof p.awake==='boolean'?p.awake:true,rotorRotation:Array.isArray(p.rotorRotation)&&p.rotorRotation.length===4&&p.rotorRotation.every(Number.isFinite)?p.rotorRotation:undefined});
   }
   connections=saved.connections.filter((c:Connection)=>c.a!==c.b&&items.has(c.a)&&items.has(c.b)&&PART_BY_ID[items.get(c.a)!.kind].ports.some(p=>p.id===c.ap)&&PART_BY_ID[items.get(c.b)!.kind].ports.some(p=>p.id===c.bp));
   reconcile();redraw();
   if(Number.isSafeInteger(saved.tubSeed)&&saved.tubVersion===TUB_PACK_VERSION)tubSeed=saved.tubSeed;
   tubInitialized=saved.tubInitialized===true||tubSeed!==undefined;
  }
 }catch(error){console.warn('Assembly could not be restored',error);}}
 if(persist)try{const backup=JSON.parse(localStorage.getItem(saveKey+'-before-preset')??'null');if(backup&&Array.isArray(backup.items)&&Array.isArray(backup.connections)&&backup.items.every((p:ReturnType<typeof snapshot>['items'][number])=>PART_BY_ID[p.kind]&&Array.isArray(p.position)&&p.position.length===3&&Array.isArray(p.rotation)&&p.rotation.length===4&&[...p.position,...p.rotation].every(Number.isFinite))){migrateTubStock(backup);previousLayout=backup;}}catch{}
 const frameScene=()=>{
  const bounds=new T.Box3().setFromObject(tub.mesh);bounds.expandByPoint(new T.Vector3(260,0,300));
  for(const i of items.values())bounds.union(batches.get(i.kind)!.geometry.boundingBox!.clone().applyMatrix4(new T.Matrix4().compose(i.position,i.rotation,unit)));
  const center=bounds.getCenter(new T.Vector3()),radius=bounds.getSize(new T.Vector3()).length()/2;
  const halfFov=Math.atan(Math.tan(T.MathUtils.degToRad(camera.fov/2))*Math.min(camera.aspect,1));
  controls.target.copy(center);camera.position.copy(center).add(new T.Vector3(1,1.15,1.2).normalize().multiplyScalar(radius/Math.sin(halfFov)*1.1));controls.update();
 };
 frameScene();restoreComplete=true;notify();
 const replaceLayout=(layout:Layout)=>{
  stopMazeOrbit();followedMaze=[];
  constructionCamera?.dispose();constructionCamera=undefined;
  constructionFocus=undefined;constructionSlew.reset();
  marbleFollow.stop();cinematicGateId=undefined;
  cancelInteraction();select();for(const id of items.keys())physics.remove(id);items.clear();physics.clearMarbles();
  connections=layout.connections.map(c=>({...c}));tubSeed=layout.tubSeed;tubInitialized=layout.tubInitialized??(tubSeed!==undefined);physics.restoreTub(layout.tub??{angle:0,awake:false});
  for(const p of layout.items){
   const i:Item={id:p.id,kind:p.kind,color:restorePieceColor(p.color),position:new T.Vector3(...p.position),rotation:new T.Quaternion(...p.rotation),fixed:true,speed:0};
   items.set(i.id,i);serial=Math.max(serial,i.id+1);body(i,connections.some(c=>c.a===i.id||c.b===i.id),p);
  }
  reconcile();redraw();
  frameScene();
  select([...items.values()].find(i=>i.kind==='start'&&i.fixed));save();
 };
 const loadPreset=(id:string,mode:'built'|'packed'='built')=>{
  const preset=PRESETS.find(p=>p.id===id);if(!preset||fillingTub||construction||physics.tubPose().dumping)return;
  if(mode==='packed'&&!hasPackedPreset(preset)){notify('No packed layout available for this preset');return false;}
  // Construct and validate the replacement before changing the current scene.
  const next:Layout={tub:{angle:0,awake:false},tubInitialized:true,
   items:mode==='packed'?createPresetStock(preset).map((p,index)=>({...p,id:index+1,awake:false})):preset.pieces.map(p=>({id:p.id,kind:p.kind,position:p.pose.position,rotation:new T.Quaternion().setFromAxisAngle(Y,p.pose.yaw).toArray()})),
   connections:mode==='packed'?[]:preset.connections};
  cancelInteraction();previousLayout=snapshot();
  if(persist)try{localStorage.setItem(saveKey+'-before-preset',JSON.stringify(previousLayout));}catch(error){console.warn('Previous layout backup failed',error);}
  replaceLayout(next);
  notify(mode==='packed'?`${preset.name} · ${next.items.length} pieces packed in the tub`:preset.name+' built · Fill all slots, then Release');return true;
 };
 const restorePrevious=()=>{if(!previousLayout||fillingTub||construction||physics.tubPose().dumping)return;const layout=previousLayout;previousLayout=undefined;if(persist)localStorage.removeItem(saveKey+'-before-preset');replaceLayout(layout);notify('Previous layout restored');};
 const stopConstruction=()=>{if(!construction)return;if(marbleFollow.approachingGate)marbleFollow.stop();construction.stop();construction=undefined;constructionFocus=undefined;constructionSlew.reset();constructionCamera?.dispose();constructionCamera=undefined;reconcile();redraw();save();notify('Construction stopped · placed pieces kept');};
 const constructPreset=(id:string)=>{
  if(construction||fillingTub||disposed||physics.tubPose().dumping)return false;
  const preset=PRESETS.find(p=>p.id===id);if(!preset)return false;
  cancelInteraction();select();
  try{
   const plan=planConstruction(preset,[...items.values()], [new T.Box3().setFromObject(tub.mesh)]);
   previousLayout=snapshot();save();
   if(persist)localStorage.setItem(saveKey+'-before-preset',JSON.stringify(previousLayout));
   const originalConnections=connections.slice();
   const start=plan.pieces.find(p=>p.kind==='start');
   plannedGateFocus=start?new T.Vector3(START.pivotX-8,START.pivotY+24,0).applyAxisAngle(Y,start.pose.yaw).add(new T.Vector3(...start.pose.position)):undefined;
   const focus=createConstructionFocus(plan);
   construction=createConstructionRun(plan,()=>[...items.values()],physics,()=>new T.Box3().setFromObject(tub.mesh),(id,target,links)=>{
    const item=items.get(id)!;item.position.fromArray(target.pose.position);item.rotation.setFromAxisAngle(Y,target.pose.yaw);item.fixed=true;item.speed=0;
    connections=[...originalConnections,...links];const progress=construction!.inspect();
    constructionFocus=focus(progress.completedIds);
    notify(`Constructing ${plan.name} · ${progress.completed} / ${progress.total}`);
   });
   stopMazeOrbit();marbleFollow.stop();cinematicGateId=undefined;constructionSlew.reset();constructionFocus=focus([]);
   constructionCamera?.dispose();constructionCamera=createConstructionCamera(camera,controls,plan);
   notify(`Constructing ${plan.name}${plan.onCarpet?'':' beside the carpet'} · 0 / ${plan.pieces.length}`);return true;
  }catch(error){notify(error instanceof Error?error.message:String(error));return false;}
 };
 const randomizeColors=()=>{
  for(const i of items.values())i.color=randomPieceColor(i.color);
  if(drag&&!drag.snap)ghostMaterial.color.setHex(drag.item.color);
  redraw();save();notify('Piece colors randomized');
 };
 const dumpTub=()=>{
  if(fillingTub||construction||disposed||physics.tubPose().dumping)return false;
  cancelInteraction();select();save();
  if(!physics.dumpTub())return false;
  wasDumping=true;notify('Dumping tub…');return true;
 };
 const refillTub=async(seed?:number)=>{
  if(fillingTub||construction||disposed||physics.tubPose().dumping)return false;
  if(Math.abs(physics.tubPose().angle)>.02||physics.tubPose().angularSpeed>.02){notify('Tip the tub upright before refilling.');return false;}
  if([...items.values()].some(i=>i.fixed&&aboveStorageTub(i.position.x,i.position.z)&&i.position.y<STORAGE_TUB.height)){notify('Move connected maze pieces out of the tub before refilling.');return false;}
  cancelInteraction();select();fillingTub=true;notify('Filling tub…');
  try{
   const pack=createTubFill(tubSeed,seed);
   for(const part of PARTS){const outside=[...items.values()].filter(i=>i.kind===part.id&&(i.fixed||!aboveStorageTub(i.position.x,i.position.z))).length;
    if(outside+pack.pieces.filter(p=>p.kind===part.id).length>capacity)throw new Error(`Remove some copies of ${part.name} before refilling.`);
   }
   // Commit the validated pack in one frame. Keep every piece of the maze
   // outside the tub, and leave the previous contents intact if packing fails.
   for(const i of items.values())if(!i.fixed&&aboveStorageTub(i.position.x,i.position.z)){physics.remove(i.id);items.delete(i.id);}
   for(const m of physics.marbleStates())if(aboveStorageTub(m.position.x,m.position.z))physics.removeMarble(m.id);
   physics.restoreTub({angle:0,awake:false});
   for(const p of pack.pieces){const i:Item={id:serial++,kind:p.kind,color:randomPieceColor(),position:new T.Vector3(...p.position),rotation:new T.Quaternion(...p.rotation),fixed:false,speed:0};items.set(i.id,i);body(i,false,{awake:false,rotorRotation:p.rotorRotation});}
   tubSeed=pack.seed;tubInitialized=true;fillingTub=false;redraw();save();notify(`Tub filled · ${pack.pieces.length} pieces ready to pick up`);return true;
  }catch(error){if(!disposed){fillingTub=false;notify('Could not fill tub: '+(error instanceof Error?error.message:String(error)));}return false;}
 };
 if(!tubInitialized&&(persist||new URLSearchParams(location.search).get('verify')==='tub'))await refillTub();
 const gateAction=(action:(id:number)=>unknown)=>{if(selected?.kind==='start'&&!drag&&!rotationEdit&&upright(selected))action(selected.id);};
 const releaseGate=()=>gateAction(id=>{
  const released=physics.releaseGate(id);
  if(released.length){
   stopMazeOrbit();
   constructionFocus=undefined;constructionSlew.reset();constructionCamera?.dispose();constructionCamera=undefined;
   // Ignore spare finish pieces in the tub or in unrelated constructions.
   const connected=new Set([id]),queue=[id];
   for(let n=0;n<queue.length;n++)for(const c of connections){const other=c.a===queue[n]?c.b:c.b===queue[n]?c.a:undefined;if(other!==undefined&&!connected.has(other)){connected.add(other);queue.push(other);}}
   const finishes=[...items.values()].filter(i=>i.kind==='finish'&&connected.has(i.id)&&upright(i));
   followedMaze=[...connected];
   marbleFollow.start(released[Math.floor(Math.random()*released.length)],finishes);
  }
 });
 // Opt-in development harness: measure the real render path without RAF,
 // editor helpers, persistence, or wall-clock simulation affecting the comparison.
 const gateFocus=(gate:Item)=>new T.Vector3(START.pivotX-8,START.pivotY+24,0).applyQuaternion(gate.rotation).add(gate.position);
 const videoBenchmark=import.meta.env.DEV&&['video','render','performance'].includes(new URLSearchParams(location.search).get('verify')??'')?{
  prepare(width:number,height:number){
   renderer.setAnimationLoop(null);observer.disconnect();cinematic=true;controls.enabled=false;
   renderer.setPixelRatio(1);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
   redraw();
  },
  canvas:renderer.domElement,
  camera,
  target:controls.target,
  renderer,
  advance,draw,
  profile:()=>({physicsMilliseconds,physics:physics.profile()}),
  overviewMaze(){
   if(mazeOrbit)return true;
   const bounds=new T.Box3();
   for(const id of followedMaze)if(items.get(id)?.fixed)bounds.union(physics.bodyBounds(id));
   if(bounds.isEmpty()||marbleFollow.finishId===undefined)return false;
   mazeOrbit=createMazeOrbit(camera,controls,bounds,{position:previousCamera,target:previousTarget,dt:cameraStep});
   return true;
  },
  approachGate(){
   if(!plannedGateFocus)return false;
   const active=construction?.inspect().active.find(p=>p.kind==='start');
   const gate=active?items.get(active.id):[...items.values()].find(p=>p.kind==='start'&&p.fixed);
   if(!gate)return false;
   const point=gateFocus(gate);
   // Follow the actual gate only once it is upright and on its final approach.
   // A predicted finish time cannot tell us whether the subject is there yet.
   if(!upright(gate)||point.distanceTo(plannedGateFocus)>PART_UNITS.portSpan*.65)return false;
   cinematicGateId=gate.id;marbleFollow.approachGate(point,constructionSlew.velocity);
   constructionFocus=undefined;constructionCamera?.dispose();constructionCamera=undefined;return true;
  },
  state:()=>({dumping:physics.tubPose().dumping,construction:construction?.inspect(),gateFramed:marbleFollow.gateFramed,following:marbleFollow.id,finish:marbleFollow.finishId,overview:mazeOrbit?.elapsed,marbles:ballMeshes.filter(m=>m.visible).length}),
  cameraSample(){
   const marble=physics.marbleStates(accumulator/ASSEMBLY_STEP).find(p=>p.id===marbleFollow.id);
   return {position:camera.position.toArray(),target:controls.target.toArray(),marble:marble?.position.toArray(),visible:marble?physics.clearCameraView(camera.position,marble.position):undefined,foregroundDistance:marble?physics.cameraObstructionDistance(camera.position,marble.position):undefined};
  },
 }:undefined;
 return {videoBenchmark,setConstructionSpeed:(speed:number)=>{constructionSpeed=T.MathUtils.clamp(speed,.25,10);},setMarbleOutline:marbleOutline.setWidths,refillTub,dumpTub,loadPreset,constructPreset,stopConstruction,restorePrevious,randomizeColors,fillGate:()=>gateAction(physics.fillGate),releaseGate,closeGate:()=>gateAction(physics.closeGate),begin,rotate:turn,lift,cancel,selectColumn,setAngle,dropMarble,
 inspect:()=>({camera:{position:camera.position.toArray(),target:controls.target.toArray(),following:marbleFollow.id,marbleAutomatic:marbleFollow.automatic,marbleFinish:marbleFollow.finishId,autoOrbit:controls.autoRotate,constructionTarget:constructionFocus?.toArray()},tub:{...physics.tubPose(),position:physics.tubPose().position.toArray(),rotation:physics.tubPose().rotation.toArray()},tubSeed,fillingTub,construction:construction?.inspect(),gates:gateIds.map(id=>({id,angle:physics.wheelPose(id)?.angle??0})),marbleColors:physics.marbleStates().map(m=>m.color),wheels:wheelIds.map(id=>({id,angle:physics.wheelPose(id)?.angle??0})),marbles:physics.marblePositions().map(p=>p.toArray()),items:snapshot().items.map(i=>({...i,fixed:items.get(i.id)!.fixed})),connections:connections.slice(),holding:drag?.item.id,selected:selected?.id,column:columnIndex}),
 project:(point:V3)=>{const p=new T.Vector3(...point).project(camera),r=renderer.domElement.getBoundingClientRect();return {clientX:r.left+(p.x+1)*r.width/2,clientY:r.top+(1-p.y)*r.height/2};},
 dispose(){stopMazeOrbit();marbleFollow.dispose();constructionCamera?.dispose();releaseTub();save();disposed=true;marbleOutline.dispose();gateBatch?.dispose();gateGeometry?.dispose();gateMaterial.dispose();marbleMaterials.forEach(m=>m.dispose());wheelBatch?.dispose();wheelGeometry?.dispose();wheelMaterial.dispose();dropLayer.remove();ballGeometry.dispose();ballMaterial.dispose();renderer.setAnimationLoop(null);observer.disconnect();window.removeEventListener('pointermove',onMove);window.removeEventListener('pointerup',onUp);window.removeEventListener('pointercancel',cancelInteraction);window.removeEventListener('blur',cancelInteraction);window.removeEventListener('keydown',onKey);renderer.domElement.removeEventListener('pointerdown',onDown,true);renderer.domElement.removeEventListener('wheel',onWheel,true);controls.dispose();rotationControl.dispose();columnGeometry.dispose();columnMaterial.dispose();physics.dispose();for(const b of batches.values()){b.geometry.dispose();(b.mesh.material as T.Material).dispose();b.mesh.dispose();}markerGeometry.dispose();markerMaterial.dispose();markers.dispose();ghostMaterial.dispose();tub.dispose();rug.dispose();environment.dispose();renderer.dispose();renderer.domElement.remove();}};
}
