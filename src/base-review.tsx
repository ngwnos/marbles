import {usePreviewDropTest} from './preview-drop-controls';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createBase } from './pieces/base-preview';
import './ramp-review.css';
import {BASE} from './pieces/base';
import {CONNECTOR} from './pieces/marbleworks-spec';
import { ComponentLinks } from './component-links';

const references = [
 ['Ruler and post proportions','https://i.ebayimg.com/images/g/8rcAAeSwjB5oxePV/s-l1600.webp'],
 ['Second underside view','https://i.ebayimg.com/images/g/BXkAAeSww8FoxePV/s-l1600.webp'],
 ['Top and C-shaped post','https://i.ebayimg.com/images/g/J88AAeSwNOFqG0Jk/s-l1600.webp'],
 ['Tray and outer foot fillet','https://i.ebayimg.com/images/g/NE8AAeSwUGNqG0Jl/s-l1600.webp'],
 ['Underside','https://i.ebayimg.com/images/g/6JEAAeSwP5RqG0Jl/s-l1600.webp'],
];
function App() {
  const dropTest=usePreviewDropTest('base');
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
    controls.target.set(0, 20, 0);
    controls.enableDamping = true;
    let ramp: Awaited<ReturnType<typeof createBase>> | undefined;
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
      const target = controls.target.set(0, 20, 0);
      const positions: Record<string, number[]> = { Perspective: [-160, 150, 220], Top: [0, 330, 0.01], Side: [0, 0, 350], End: [350, 0, 0], Underside: [0, -330, -0.01] };
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
      camera.left = -65 * aspect; camera.right = 65 * aspect;
      camera.top = 65; camera.bottom = -65;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    const observer = new ResizeObserver(resize); observer.observe(el); resize();
    let disposed = false;
    let environment: THREE.RenderTarget | undefined;
    void Promise.all([renderer.init(), createBase()]).then(([, createdRamp]) => {
      ramp = createdRamp;
      if (disposed) { ramp.dispose(); renderer.dispose(); return; }
      scene.add(ramp.mesh);
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
      <header><span>PIECE 09</span><h1>Support base</h1><p>Discovery Toys Marbleworks · No. 143 · approval draft</p></header>
      <div className="viewport" ref={host} />
      <nav>{['Perspective', 'Top', 'Side', 'End', 'Underside'].map(v => <button key={v} onClick={() => setView.current(v)}>{v}</button>)}{dropTest.buttons}</nav>
      <footer>Drag to orbit · scroll to zoom · dimensions remain provisional pending measurement</footer>
    </section>
    <aside><ComponentLinks /><h2>Reference</h2><select value={reference} onChange={e => setReference(Number(e.target.value))}>{references.map(([title], i) => <option key={title} value={i}>{title}</option>)}</select>
      <a href={references[reference][1]} target="_blank"><img src={references[reference][1]} alt={references[reference][0]} /></a>
      <h2>Original construction</h2><p>D-shaped catch tray, offset C post, rounded rim and flared post foot. The slot faces the rounded end of the tray.</p>
      <p><a href="https://www.ebay.com/itm/377231002083" target="_blank">No. 143: top and underside photos</a></p>
      <h2>Working dimensions</h2><p>{BASE.length} × {BASE.width} mm footprint, {BASE.postHeight} mm post height, {BASE.shoulder} mm seating shoulder and {CONNECTOR.maleDiameter} mm male end. Footprint and tray proportions are photo fits; factory measurements remain unverified.</p>
    </aside>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
