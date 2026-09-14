import {usePreviewDropTest} from './preview-drop-controls';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createFunnel } from './pieces/funnel';
import { CONNECTOR, PART_UNITS, TRACK } from './pieces/marbleworks-spec';
import './ramp-review.css';
import { ComponentLinks } from './component-links';

const references = [
  ['Isolated No. 141 • top oblique', 'https://i.ebayimg.com/images/g/nt0AAeSwYlpqVRJ9/s-l1600.webp', '190 180 920 480'],
  ['Isolated No. 141 • underside', 'https://i.ebayimg.com/images/g/VTYAAeSwuzZqVRJ9/s-l1600.webp'],
  ['Isolated No. 141 • top', 'https://i.ebayimg.com/images/g/g6UAAeSwY89qVRJ9/s-l1600.webp', '495 100 400 705'],
  ['Isolated No. 141 • molded stamp', 'https://i.ebayimg.com/images/g/QGEAAeSwhINqVRJ9/s-l1600.webp'],
  ['Patent • seven views', 'https://patentimages.storage.googleapis.com/6f/d3/63/4d3b444501934e/USD290143-drawings-page-2.png'],
];

function App() {
  const dropTest=usePreviewDropTest('funnel');
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
    const camera = new THREE.OrthographicCamera(-168, 168, 120, -120, 0.1, 2000);
    camera.up.set(0, 1, 0);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(-30, 50, -8);
    controls.enableDamping = true;
    let funnel: Awaited<ReturnType<typeof createFunnel>> | undefined;
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
      const target = controls.target.set(-30, 50, -8);
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
      camera.left = -120 * aspect; camera.right = 120 * aspect;
      camera.top = 120; camera.bottom = -120;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    const observer = new ResizeObserver(resize); observer.observe(el); resize();
    let disposed = false;
    let environment: THREE.RenderTarget | undefined;
    void Promise.all([renderer.init(), createFunnel()]).then(([, createdFunnel]) => {
      funnel = createdFunnel;
      if (disposed) { funnel.dispose(); renderer.dispose(); return; }
      scene.add(funnel.mesh);
      void dropTest.controller.attach(funnel.mesh,scene);
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
      funnel?.dispose(); ground.geometry.dispose(); ground.material.dispose(); environment?.dispose();
      if (renderer.hasInitialized()) renderer.dispose(); renderer.domElement.remove();
    };
  }, []);
  return <main>
    <section className="model">
      <header><span>PIECE 02</span><h1>Original funnel ramp</h1><p>Discovery Toys Marbleworks · No. 141 · approval draft</p></header>
      <div className="viewport" ref={host} />
      <nav>{['Perspective', 'Top', 'Side', 'End', 'Underside'].map(v => <button key={v} onClick={() => setView.current(v)}>{v}</button>)}{dropTest.buttons}</nav>
      <footer>Drag to orbit · scroll to zoom · dimensions remain provisional pending measurement</footer>
    </section>
    <aside><ComponentLinks /><h2>Reference</h2><select value={reference} onChange={e => setReference(Number(e.target.value))}>{references.map(([title], i) => <option key={title} value={i}>{title}</option>)}</select>
      <a href={references[reference][1]} target="_blank">{references[reference][2]
        ? <svg viewBox={references[reference][2]} role="img" aria-label={references[reference][0]}><image href={references[reference][1]} width="1305" height="870" /></svg>
        : <img src={references[reference][1]} alt={references[reference][0]} />}</a>
      <h2>Geometry evidence</h2><p>A tangential inlet feeds a 20-degree conical upper bowl that meets the curved vortex throat tangentially. The lower connector is hollow, with no central standing post.</p>
      <p><a href="https://www.ebay.com/itm/198495370103" target="_blank">Isolated No. 141 specimen</a><br/><a href="https://patents.google.com/patent/USD290143S/en" target="_blank">1987 design patent: seven views</a><br/><a href="https://patents.google.com/patent/US4713038A/en" target="_blank">Utility patent: funnel profile</a></p>
      <h2>Working dimensions</h2><p>Patent: 19 mm throat, ≈24.4 mm vortex/cone transition radius, 20° upper bowl. 27 mm connector OD follows the ramp. Bowl diameter ≈89 mm and overall dimensions remain fitted from reference views.</p>
      <p>Shared fit: {CONNECTOR.maleDiameter} mm male / {CONNECTOR.socketDiameter} mm socket; {PART_UNITS.stackRise} mm stacking unit; {PART_UNITS.portSpan.toFixed(1)} mm tower spacing. The straight slope uses a {2 * TRACK.runDrop} mm fall across the span; the final transition follows the bowl surface.</p>
    </aside>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
