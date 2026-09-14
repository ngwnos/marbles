import {usePreviewDropTest} from './preview-drop-controls';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createStandardRamp } from './pieces/standard-ramp';
import './ramp-review.css';
import { ComponentLinks } from './component-links';

const references = [
  ['Your photo • tight terminal bend', '/references/no142-curve-reference.png', '770 700 225 240'],
  ['Your photo • full image', '/references/no142-curve-reference.png'],
  ['Isolated No. 142 • top', 'https://i.ebayimg.com/images/g/74gAAeSw-1dqVmcC/s-l1600.webp'],
  ['Isolated No. 142 • underside', 'https://i.ebayimg.com/images/g/khIAAeSwvA9qVmcC/s-l1600.webp'],
  ['Closeup • outlet openings', 'https://di2ponv0v5otw.cloudfront.net/posts/2026/06/16/6a31e7eecf0577d47dfd4d8f/l_6a31e7eff6035aba5cbddb0f.jpeg'],
  ['Closeup • underside junction', 'https://di2ponv0v5otw.cloudfront.net/posts/2026/06/16/6a31e7eecf0577d47dfd4d8f/l_6a31e7f088849a59408ba2c1.jpeg'],
  ['Photo • top / inlet', 'https://i.ebayimg.com/images/g/yI8AAeSwXldpcIcz/s-l1600.webp'],
  ['Photo • side / slot', 'https://i.ebayimg.com/images/g/UTQAAeSwwhFpcIdJ/s-l1600.webp'],
  ['Photo • underside', 'https://i.ebayimg.com/images/g/qr4AAeSwrxJpcIdR/s-l1600.webp'],
  ['Patent • seven views', 'https://patentimages.storage.googleapis.com/ff/77/ac/8ed6d93fc79fa3/USD290028-drawings-page-2.png'],
  ['Patent • cutaway', 'https://patentimages.storage.googleapis.com/49/54/ce/80a4fa1be2d8f3/US4713038-drawings-page-3.png'],
];
function App() {
  const dropTest=usePreviewDropTest('ramp');
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
    controls.target.set(10, 27, -5);
    controls.enableDamping = true;
    let ramp: Awaited<ReturnType<typeof createStandardRamp>> | undefined;
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
      const target = controls.target.set(10, 27, -5);
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
    void Promise.all([renderer.init(), createStandardRamp()]).then(([, createdRamp]) => {
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
      <header><span>PIECE 01</span><h1>Original standard ramp</h1><p>Discovery Toys Marbleworks · J-loop · approval draft</p></header>
      <div className="viewport" ref={host} />
      <nav>{['Perspective', 'Top', 'Side', 'End', 'Underside'].map(v => <button key={v} onClick={() => setView.current(v)}>{v}</button>)}{dropTest.buttons}</nav>
      <footer>Drag to orbit · scroll to zoom · dimensions remain provisional pending measurement</footer>
    </section>
    <aside><ComponentLinks /><h2>Reference</h2><select value={reference} onChange={e => setReference(Number(e.target.value))}>{references.map(([title], i) => <option key={title} value={i}>{title}</option>)}</select>
      <a href={references[reference][1]} target="_blank">{references[reference][2]
        ? <svg viewBox={references[reference][2]} role="img" aria-label={references[reference][0]}><image href={references[reference][1]} width="1200" height="1064" /></svg>
        : <img src={references[reference][1]} alt={references[reference][0]} />}</a>
      <h2>Geometry evidence</h2><p>The broad curve tightens near the end, then points directly into the outlet. The outer rail follows that changing curve into the opening; the inlet divider remains connected to the post.</p>
      <p><a href="https://www.ebay.com/itm/198497502658" target="_blank">Isolated No. 142: both sides</a><br/><a href="https://patents.google.com/patent/USD290028S/en" target="_blank">1987 design patent: seven views</a><br/><a href="https://patents.google.com/patent/US4713038A/en" target="_blank">Utility patent: exit cutaway</a><br/><a href="https://www.ebay.com/itm/358138698821" target="_blank">1988 specimen photos with ruler</a></p>
      <h2>Working dimensions</h2><p>Shared working fit: 27 mm body, 24 mm male connector, 47 mm stacking rise. Overall length ≈187 mm, width ≈73 mm, height 62 mm. Dimensions remain fitted from photographs and drawings, not verified factory measurements.</p>
    </aside>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
