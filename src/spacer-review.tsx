import {usePreviewDropTest} from './preview-drop-controls';
import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createSpacer } from './pieces/spacer';
import { CONNECTOR, PART_UNITS } from './pieces/marbleworks-spec';
import './ramp-review.css';
import { ComponentLinks } from './component-links';

function App() {
  const dropTest=usePreviewDropTest('spacer');
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
    const camera = new THREE.OrthographicCamera(-72, 72, 52, -52, 0.1, 2000);
    camera.up.set(0, 1, 0);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 31, 0);
    controls.enableDamping = true;
    let spacer: Awaited<ReturnType<typeof createSpacer>> | undefined;
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
      camera.left = -52 * aspect; camera.right = 52 * aspect;
      camera.top = 52; camera.bottom = -52;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    const observer = new ResizeObserver(resize); observer.observe(el); resize();
    let disposed = false;
    let environment: THREE.RenderTarget | undefined;
    void Promise.all([renderer.init(), createSpacer()]).then(([, createdSpacer]) => {
      spacer = createdSpacer;
      if (disposed) { spacer.dispose(); renderer.dispose(); return; }
      scene.add(spacer.mesh);
      void dropTest.controller.attach(spacer.mesh,scene);
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
      spacer?.dispose(); ground.geometry.dispose(); ground.material.dispose(); environment?.dispose();
      if (renderer.hasInitialized()) renderer.dispose(); renderer.domElement.remove();
    };
  }, []);
  return <main>
    <section className="model">
      <header><span>PIECE 03</span><h1>Straight spacer</h1><p>Discovery Toys Marbleworks · approval draft</p></header>
      <div className="viewport" ref={host} />
      <nav>{['Perspective', 'Top', 'Side', 'End', 'Underside'].map(v => <button key={v} onClick={() => setView.current(v)}>{v}</button>)}{dropTest.buttons}</nav>
      <footer>Drag to orbit · scroll to zoom · dimensions remain provisional pending measurement</footer>
    </section>
    <aside><ComponentLinks /><h2>Shared connector</h2>
      <p>A hollow straight spacer with the same tapered male end, seating shoulder and female socket used by the reviewed ramps.</p>
      <h2>Working dimensions</h2>
      <p>Body diameter: {CONNECTOR.postDiameter} mm<br/>Overall height: {CONNECTOR.postHeight} mm<br/>Stacking rise: {PART_UNITS.stackRise} mm<br/>Insertion: {PART_UNITS.insertionDepth} mm</p>
      <p>Male diameter: {CONNECTOR.maleDiameter} mm<br/>Female socket: {CONNECTOR.socketDiameter} mm<br/>Through bore: {CONNECTOR.boreDiameter} mm</p>
      <p>These preserve the existing parts’ working fit; they are not verified factory measurements.</p>
      <h2>Reference</h2><p><a href="https://patents.google.com/patent/US4713038A/en" target="_blank">Original system patent: tubular supports and common mating ends</a></p>
    </aside>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
