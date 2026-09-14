import {usePreviewDropTest} from './preview-drop-controls';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createCatalogPiece, catalogPiece } from './pieces/catalog-preview';
import './ramp-review.css';
import { ComponentLinks } from './component-links';

const references = catalogPiece.references;
function App() {
  const dropTest=usePreviewDropTest(catalogPiece.kind);
  const host = useRef<HTMLDivElement>(null);
  const setView = useRef<(view: string) => void>(() => {});
  const [reference, setReference] = useState(0);
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGPURenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe8e7e3);
    const camera = new THREE.OrthographicCamera(-140, 140, 100, -100, 0.1, 2000);
    camera.up.set(0, 1, 0);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(10, 27, 0);
    const framingTarget=new THREE.Vector3(10,27,0);
    let frameHeight=110;
    controls.enableDamping = true;
    let ramp: Awaited<ReturnType<typeof createCatalogPiece>> | undefined;
    const light = new THREE.DirectionalLight(0xffffff, 1.8);
    light.position.set(-100, 230, 160);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    Object.assign(light.shadow.camera, { left: -180, right: 180, top: 180, bottom: -180, near: 1, far: 600 });
    light.shadow.bias = -0.0005;
    light.shadow.normalBias = 0.3;
    scene.add(light, new THREE.HemisphereLight(0xffffff, 0x9497a0, 0.4));
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.ShadowMaterial({ opacity: 0.16 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.2;
    ground.receiveShadow = true;
    scene.add(ground);
    setView.current = view => {
      controls.enableDamping = false;
      controls.update();
      const target = controls.target.copy(framingTarget);
      const positions: Record<string, number[]> = { Perspective: [160, 150, 220], Top: [0, 330, 0.01], Side: [0, 0, 350], End: [350, 0, 0], Underside: [0, -330, -0.01] };
      camera.position.copy(target).add(new THREE.Vector3(...positions[view]));
      ground.visible = view !== 'Underside';
      camera.zoom = 1;
      camera.updateProjectionMatrix();
      controls.update();
      controls.enableDamping = true;
    };
    setView.current('Perspective');
    const resize = () => {
      const aspect = el.clientWidth / el.clientHeight;
      camera.left = -frameHeight * aspect; camera.right = frameHeight * aspect;
      camera.top = frameHeight; camera.bottom = -frameHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    const observer = new ResizeObserver(resize); observer.observe(el); resize();
    let disposed = false;
    let environment: THREE.RenderTarget | undefined;
    void Promise.all([renderer.init(), createCatalogPiece()]).then(([, createdRamp]) => {
      ramp = createdRamp;
      if (disposed) { ramp.dispose(); renderer.dispose(); return; }
      scene.add(ramp.mesh);
      const bounds=new THREE.Box3().setFromObject(ramp.mesh),size=bounds.getSize(new THREE.Vector3());bounds.getCenter(framingTarget);
      frameHeight=Math.max(size.y*.7,size.x*.5,size.z*.7,90);resize();
      setView.current('Perspective');
      void dropTest.controller.attach(ramp.mesh,scene);
      const pmrem = new THREE.PMREMGenerator(renderer);
      const room = new RoomEnvironment();
      environment = pmrem.fromScene(room, 0.04);
      scene.environment = environment.texture;
      scene.environmentIntensity = 0.35;
      room.dispose(); pmrem.dispose();
      renderer.setAnimationLoop((time) => { dropTest.controller.update(time); controls.update(); renderer.render(scene, camera); });
    });
    return () => {
      disposed = true; dropTest.controller.dispose(); observer.disconnect(); controls.dispose(); renderer.setAnimationLoop(null);
      ramp?.dispose(); ground.geometry.dispose(); ground.material.dispose(); environment?.dispose();
      if (renderer.hasInitialized()) renderer.dispose(); renderer.domElement.remove();
    };
  }, []);
  return <main>
    <section className="model">
      <header><span>MARBLEWORKS</span><h1>{catalogPiece.name}</h1><p>Reference reconstruction · dimensions provisional</p></header>
      <div className="viewport" ref={host} />
      <nav>{['Perspective', 'Top', 'Side', 'End', 'Underside'].map(v => <button key={v} onClick={() => setView.current(v)}>{v}</button>)}{dropTest.buttons}</nav>
      <footer>Drag to orbit · scroll to zoom · dimensions remain provisional pending measurement</footer>
    </section>
    <aside><ComponentLinks /><h2>Reference</h2><select value={reference} onChange={e => setReference(Number(e.target.value))}>{references.map(([title], i) => <option key={title} value={i}>{title}</option>)}</select>
      <a href={references[reference][1]} target="_blank">Open reference</a>
      {/\.pdf(?:$|\?)/i.test(references[reference][1])?<object data={references[reference][1]} type="application/pdf" style={{width:'100%',height:500}} aria-label={references[reference][0]} />:/\.(?:webp|jpg|png)(?:$|\?)/i.test(references[reference][1])?<img src={references[reference][1]} alt={references[reference][0]} style={{width:'100%'}} />:null}
      {catalogPiece.kind==='jump'&&<p><a href='/part.html?piece=jump-run'>Test jump and landing together</a></p>}
      <h2>Construction</h2><p>{catalogPiece.description}</p>
    </aside>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
