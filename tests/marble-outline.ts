import * as T from 'three/webgpu';
import {createMarbleOutline, projectSphere} from '../src/assembly/marble-outline';

const result = document.querySelector<HTMLPreElement>('#result')!;
const checks: string[] = [];
const check = (ok: boolean, label: string) => {if (!ok) throw new Error(label); checks.push(label);};
async function run() {
  const renderer = new T.WebGPURenderer({forceWebGL: new URLSearchParams(location.search).has('webgl')});
  await renderer.init(); renderer.setSize(256, 256); renderer.setClearColor(0);
  document.body.append(renderer.domElement);
  const outline = createMarbleOutline();
  const camera = new T.OrthographicCamera(-128,128,128,-128,.1,1000);
  camera.position.z = 100; camera.updateMatrixWorld();
  const scene = new T.Scene(); scene.background = new T.Color(0);
  const geometry = new T.SphereGeometry(24, 64, 32);
  const red = new T.Mesh(geometry, new T.MeshPhysicalNodeMaterial({color: 0xff0000}));
  const green = new T.Mesh(geometry, new T.MeshPhysicalNodeMaterial({color: 0x00ff00}));
  green.visible = false;
  const marbles = [red, green];
  const output = new T.RenderTarget(256,256,{type:T.UnsignedByteType});
  async function capture(inside: number, outside: number, dpr = 1, view: T.PerspectiveCamera | T.OrthographicCamera = camera) {
    renderer.setPixelRatio(dpr); output.setSize(256*dpr,256*dpr);
    renderer.setRenderTarget(output); renderer.render(scene,view);
    outline.setWidths(inside,outside); outline.render(renderer,view,marbles);
    return await renderer.readRenderTargetPixelsAsync(output,0,0,output.width,output.height) as Uint8Array;
  }
  for (const dpr of [1,2]) for (const [inside,outside] of [[3,0],[0,4],[2,5],[0,0]]) {
    const pixels = await capture(inside,outside,dpr), row=128*dpr;
    const occupied: number[]=[];
    for(let x=128*dpr;x<180*dpr;x++) if(pixels[(row*output.width+x)*4]>63.5) occupied.push(x/dpr);
    check(Math.abs(occupied.length/dpr-inside-outside)<.51, `DPR ${dpr}: ${inside}px inside + ${outside}px outside has correct total width`);
    if(occupied.length) {
      check(Math.abs(occupied[0]-(152-inside))<.51, `DPR ${dpr}: inner edge at requested distance`);
      check(Math.abs(occupied.at(-1)!+1/dpr-(152+outside))<.51, `DPR ${dpr}: outer edge at requested distance`);
    }
  }
  // A front marble's transparent center must occlude the back marble's ring.
  green.visible=true; green.position.set(12,0,30);
  let pixels=await capture(2,3);
  const pixel=(x:number,y:number,c:number)=>pixels[(y*256+x)*4+c];
  check(pixel(151,128,0)===0, 'A nearer marble hides the back marble outline');
  check(Math.abs(pixel(165,128,1)-127.5)<1.5 && pixel(165,128,0)===0,'Each marble uses its own base color at 50% opacity');
  green.material.color.setHex(0x0000ff); pixels=await capture(2,3);
  check(Math.abs(pixel(165,128,2)-127.5)<1.5 && pixel(165,128,1)===0,'Reused marble slots update outline color');
  green.material.color.setHex(0x31ca75); pixels=await capture(2,3);
  check(green.material.color.toArray().every((value,c)=>Math.abs(pixel(165,128,c)-value*127.5)<1.5),'Outline preserves the linear base color at 50% opacity without extra tone mapping');
  green.visible=false;
  const occluder=new T.Mesh(new T.PlaneGeometry(256,256),new T.MeshBasicNodeMaterial({color:0x333333}));
  occluder.position.z=50;scene.add(occluder);pixels=await capture(2,3);
  check([1,0,0].every((value,c)=>Math.abs(pixel(153,128,c)-(value*255+pixel(128,128,c))*.5)<1.5),'Outline blends at 50% opacity over an opaque track');
  check(pixel(128,128,0)>0 && pixel(128,128,0)<100,'Hidden interior preserves the track surface');
  scene.remove(occluder);

  // Validate perspective silhouettes independently with tangent ray equations.
  const perspective = new T.PerspectiveCamera(65,1,.1,1000);
  for (const depth of [80,160,300]) {
    red.position.set(15,0,-depth);
    const e=projectSphere(red.position,24,perspective,new T.Vector2(256,256))!;
    const pixels=await capture(2,4,1,perspective),occupied:number[]=[];
    for(let x=Math.ceil(e.x);x<256;x++) if(pixels[(128*256+x)*4]>63.5)occupied.push(x);
    check(occupied.length===6,`Off-axis perspective at distance ${depth}: width stays 6 CSS pixels`);
    check(Math.abs(occupied[0]+.5-(e.x+e.a-2))<1,`Off-axis perspective at distance ${depth}: correct inner placement`);
  }
  for (const center of [new T.Vector3(0,0,-100),new T.Vector3(47,31,-100),new T.Vector3(-90,50,-70)]) {
    const radius=24, e=projectSphere(center,radius,perspective,new T.Vector2(256,256))!;
    for(let i=0;i<100;i++) {
      const angle=i/100*Math.PI*2, x=e.a*Math.cos(angle),y=e.b*Math.sin(angle);
      const ray=new T.Vector3((e.x+e.cos*x-e.sin*y-128)/(128*perspective.projectionMatrix.elements[0]),(e.y+e.sin*x+e.cos*y-128)/(128*perspective.projectionMatrix.elements[5]),-1);
      const discriminant=ray.dot(center)**2-ray.lengthSq()*(center.lengthSq()-radius*radius);
      check(Math.abs(discriminant)<1e-7, 'Perspective silhouette is tangent to sphere');
    }
  }
  // Visual fixture: oblique perspective, different colors, an overlapping marble.
  renderer.setRenderTarget(null);renderer.setPixelRatio(devicePixelRatio);renderer.setSize(640,480);
  perspective.aspect=640/480;perspective.updateProjectionMatrix();
  scene.background=new T.Color(0x202730);
  red.position.set(-19,-10,-100);green.position.set(17,8,-70);green.visible=true;green.material.color.setHex(0x31ca75);
  renderer.render(scene,perspective);outline.setWidths(2,4);outline.render(renderer,perspective,marbles);
  result.textContent=`PASS — ${checks.length} assertions\nInside/outside placement, DPR 1/2, zero widths, colors, overlap, occlusion, and off-axis projection.\nVisual fixture: 2 px inside / 4 px outside.`;
}
run().catch(error=>{result.textContent=`FAIL — ${error.message}\n${error.stack}`;console.error(error);});
