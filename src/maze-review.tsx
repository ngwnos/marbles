import {usePreviewDropTest} from './preview-drop-controls';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createMaze } from './pieces/maze-preview';
import './ramp-review.css';
import { ComponentLinks } from './component-links';

const references = [
 ['Original maze drawing • Fig. 7', 'https://patentimages.storage.googleapis.com/06/15/b2/91a255822e9b86/US4713038-drawings-page-4.png'],
];
function App() {
  const dropTest=usePreviewDropTest('maze');
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
    controls.enableDamping = true;
    let ramp: Awaited<ReturnType<typeof createMaze>> | undefined;
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
      const target = controls.target.set(10, 27, 0);
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
      camera.left = -110 * aspect; camera.right = 110 * aspect;
      camera.top = 110; camera.bottom = -110;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    const observer = new ResizeObserver(resize); observer.observe(el); resize();
    let disposed = false;
    let environment: THREE.RenderTarget | undefined;
    void Promise.all([renderer.init(), createMaze()]).then(([, createdRamp]) => {
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
      <header><span>PIECE 07</span><h1>Maze ramp</h1><p>Discovery Toys Marbleworks · No. 146 · approval draft</p></header>
      <div className="viewport" ref={host} />
      <nav>{['Perspective', 'Top', 'Side', 'End', 'Underside'].map(v => <button key={v} onClick={() => setView.current(v)}>{v}</button>)}{dropTest.buttons}</nav>
      <footer>Drag to orbit · scroll to zoom · dimensions remain provisional pending measurement</footer>
    </section>
    <aside><ComponentLinks /><h2>Reference</h2><select value={reference} onChange={e => setReference(Number(e.target.value))}>{references.map(([title], i) => <option key={title} value={i}>{title}</option>)}</select>
      <a href={references[reference][1]} target="_blank"><img src={references[reference][1]} alt={references[reference][0]} /></a>
      <h2>Original construction</h2><p>A scalloped tray with eight staggered, hollow pins. The shared inlet cup feeds the tray; the opposite C connector is the drop.</p>
      <p><a href="https://www.ebay.com/itm/117301914006" target="_blank">No. 146: top and underside photos</a></p>
      <h2>Working dimensions</h2><p>140.1 mm connector spacing, 27 mm bodies, 13 mm fall. Pin and tray proportions are fitted to the photographs and patent; physical measurements remain unverified.</p>
    </aside>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
