import {usePreviewDropTest} from './preview-drop-controls';
import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createSnakeRamp } from './pieces/snake-ramp';
import { CONNECTOR, PART_UNITS } from './pieces/marbleworks-spec';
import './ramp-review.css';
import { ComponentLinks } from './component-links';

function App() {
  const dropTest=usePreviewDropTest('snake');
  const host = useRef<HTMLDivElement>(null);
  const setView = useRef<(view: string) => void>(() => {});
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
    const camera = new THREE.OrthographicCamera(-150, 150, 105, -105, 0.1, 2000);
    camera.up.set(0, 1, 0);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 31, 0);
    controls.enableDamping = true;
    let snake: Awaited<ReturnType<typeof createSnakeRamp>> | undefined;
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
      const target = controls.target.set(0, 31, 0);
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
      camera.left = -105 * aspect; camera.right = 105 * aspect;
      camera.top = 105; camera.bottom = -105;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    const observer = new ResizeObserver(resize); observer.observe(el); resize();
    let disposed = false;
    let environment: THREE.RenderTarget | undefined;
    void Promise.all([renderer.init(), createSnakeRamp()]).then(([, createdSnake]) => {
      snake = createdSnake;
      if (disposed) { snake.dispose(); renderer.dispose(); return; }
      scene.add(snake.mesh);
      void dropTest.controller.attach(snake.mesh,scene);
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
      snake?.dispose(); ground.geometry.dispose(); ground.material.dispose(); environment?.dispose();
      if (renderer.hasInitialized()) renderer.dispose(); renderer.domElement.remove();
    };
  }, []);
  return <main>
    <section className="model">
      <header><span>PIECE 04</span><h1>Snake ramp · No.145</h1><p>Discovery Toys Marbleworks · approval draft</p></header>
      <div className="viewport" ref={host} />
      <nav>{['Perspective', 'Top', 'Side', 'End', 'Underside'].map(v => <button key={v} onClick={() => setView.current(v)}>{v}</button>)}{dropTest.buttons}</nav>
      <footer>Drag to orbit · scroll to zoom · dimensions remain provisional pending measurement</footer>
    </section>
    <aside><ComponentLinks /><h2>Original shape</h2>
      <p><a href="/surfaces.html">Inspect surface continuity</a></p>
      <p>Four alternating curls on one sloping plane, with adjacent outer rims, open centers and blended connecting webs.</p>
      <h2>Working dimensions</h2>
      <p>Port spacing: {PART_UNITS.portSpan.toFixed(1)} mm<br/>Shared connector: {CONNECTOR.postDiameter} mm<br/>Stacking rise: {PART_UNITS.stackRise} mm<br/>Channel: 20 mm · floor drop: 13 mm</p>
      <p>Scaled to the reviewed parts. These are reconstruction dimensions, not verified factory measurements.</p>
      <h2>Original references</h2>
      <p><a href="https://patents.google.com/patent/USD294044S/en" target="_blank">Original design patent · seven views</a></p>
      <a href="https://www.ebay.com/itm/197907406362" target="_blank"><img style={{width: '100%'}} src="https://i.ebayimg.com/images/g/NLgAAeSw7QVpKlas/s-l1600.webp" alt="Original blue No.145 snake ramp, top view" /></a>
      <a href="https://www.ebay.com/itm/197907406362" target="_blank"><img style={{width: '100%'}} src="https://i.ebayimg.com/images/g/GHIAAeSwAo1pKla4/s-l1600.webp" alt="Original blue snake ramp, low side view" /></a>
    </aside>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
