import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three/webgpu';
import { normalView, reflect, positionView, vec3, sin, smoothstep, mix } from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { snakeBridgeSurfaces } from './pieces/snake-solid';
import { funnelJoinSurfaces } from './pieces/funnel';
import { inspectJoin, type Join } from './geometry/continuity';
import { inspectionMesh } from './geometry/inspection-mesh';
import type { Surface } from './geometry/surfaces';
import './ramp-review.css';
import { ComponentLinks } from './component-links';

const snake = snakeBridgeSurfaces(3), funnel = funnelJoinSurfaces();
const cases: Record<string, { patches: [Surface, number][]; joins: Join[] }> = {
  'Snake · bridge / tube': { patches: [
    [snake.joins[0].b.surface, 1], [snake.joins[0].a.surface, 1],
    [(u, v) => snake.upper.secondReceiver(u, v * 7.5 / 8.25), -1],
  ], joins: [snake.joins[0]] },
  'Snake · bridge / rolled rim': { patches: [[snake.upper.surface, 1], [snake.upper.secondReceiver, -1]], joins: [snake.joins[1]] },
  'Funnel · track / bowl': { patches: [[(u, v) => funnel.track(0.85 + 0.15 * u, v), 1], [funnel.junction, 1], [funnel.receiver, 1]], joins: funnel.joins },
};

function App() {
  const host = useRef<HTMLDivElement>(null);
  const [part, setPart] = useState(Object.keys(cases)[0]);
  const [mode, setMode] = useState('Zebra');
  const [seams, setSeams] = useState(true);
  const [strict, setStrict] = useState(false);
  const views = useRef<Record<string, { position: THREE.Vector3; target: THREE.Vector3 }>>({});
  const recipe = cases[part];
  const reports = recipe.joins.map(j => inspectJoin(strict ? { ...j, expected: 'G2' } : j));
  useEffect(() => {
    const el = host.current!, renderer = new THREE.WebGPURenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0xe8e7e3);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 3000);
    const controls = new OrbitControls(camera, renderer.domElement);
    const group = new THREE.Group(); scene.add(group);
    const materials: THREE.Material[] = [], geometries: THREE.BufferGeometry[] = [];
    for (const [surface, sign] of recipe.patches) {
      const geometry = inspectionMesh(surface, sign); geometries.push(geometry);
      let material: THREE.Material;
      if (mode === 'Zebra') {
        const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
        const direction = reflect(positionView.normalize(), normalView);
        const stripe = smoothstep(-0.08, 0.08, sin(direction.dot(vec3(0.7, 1, 0.2)).mul(32)));
        m.colorNode = mix(vec3(0.035), vec3(0.95), stripe); material = m;
      } else if (mode === 'Normals') material = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
      else material = new THREE.MeshStandardNodeMaterial({ color: mode === 'Curvature' ? 0xffffff : 0x087ccb,
        vertexColors: mode === 'Curvature', roughness: 0.3, side: THREE.DoubleSide, wireframe: mode === 'Wireframe' });
      materials.push(material); group.add(new THREE.Mesh(geometry, material));
    }
    if (seams) for (const report of reports) {
      const g = new THREE.BufferGeometry().setFromPoints(report.points.map(p => p.position));
      const m = new THREE.LineBasicMaterial({ color: report.passed ? 0x17bb64 : 0xff3030, depthTest: false });
      geometries.push(g); materials.push(m);
      const line = new THREE.Line(g, m); line.renderOrder = 2; group.add(line);
    }
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2));
    const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(-80, 140, 80); scene.add(light);
    const box = new THREE.Box3().setFromObject(group), center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    controls.target.copy(center); camera.position.copy(center).add(new THREE.Vector3(0.5, 0.65, 1).normalize().multiplyScalar(size * 1.7));
    const saved = views.current[part];
    if (saved) { camera.position.copy(saved.position); controls.target.copy(saved.target); }
    controls.update();
    const resize = () => { camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(el.clientWidth, el.clientHeight); };
    const observer = new ResizeObserver(resize); observer.observe(el); resize();
    let disposed = false;
    void renderer.init().then(() => { if (!disposed) renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); }); else renderer.dispose(); });
    return () => { views.current[part] = { position: camera.position.clone(), target: controls.target.clone() };
      disposed = true; observer.disconnect(); renderer.setAnimationLoop(null); controls.dispose();
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
      if (renderer.hasInitialized()) renderer.dispose(); renderer.domElement.remove(); };
  }, [part, mode, seams, strict]);
  return <main><section className="model"><header><span>SURFACE LAB</span><h1>Join inspection</h1><p>Source surfaces · no CSG rebuild</p></header>
    <div className="viewport" ref={host}/><nav>{['Zebra', 'Shaded', 'Normals', 'Curvature', 'Wireframe'].map(m => <button key={m} style={{ fontWeight: mode === m ? 700 : 400 }} onClick={() => setMode(m)}>{m}</button>)}</nav>
    <footer>Drag to orbit · scroll to zoom · open surface patches, not complete solids</footer></section>
    <aside><ComponentLinks /><h2>Shared construction</h2><select value={part} onChange={e => setPart(e.target.value)}>{Object.keys(cases).map(p => <option key={p}>{p}</option>)}</select>
      <p>These are the same surface functions used to construct the parts. Normals come from their derivatives, without seam smoothing overrides.</p>
      <p><label><input type="checkbox" checked={seams} onChange={e => setSeams(e.target.checked)}/> Show tested seams</label><br/>
      <label><input type="checkbox" checked={strict} onChange={e => setStrict(e.target.checked)}/> Require curvature continuity (G2)</label></p>
      {reports.map(r => <div key={r.name}><h2 style={{ color: r.passed ? '#167749' : '#bb2525' }}>{r.passed ? 'PASS' : 'FAIL'} · {r.expected}</h2><p>{r.name}<br/>Gap: {r.maxGap.toExponential(2)} mm<br/>Tangent change: {r.maxAngle.toFixed(5)}°<br/>Curvature change: {r.maxCurvatureDifference.toFixed(4)} /mm</p></div>)}
      <p>G1 permits a change in curvature but no crease. G2 also checks curvature across the seam. These circular fillets are designed for G1; the G2 option exposes their curvature jumps.</p>
      <p>Curvature colors: blue = flat, red = |mean curvature| ≥ 1.5 /mm. Zebra stripes show changes in reflection direction.</p>
      <h2>Scope</h2><p>This checks the selected boundaries. It does not certify the final boolean mesh, trimmed tube lip, or every edge of either part.</p>
      <p><a href="/snake.html">Full snake</a> · <a href="/funnel.html">Full funnel</a></p>
    </aside></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
