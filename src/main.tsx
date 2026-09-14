import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mix, positionWorld, positionWorldDirection, vec3 } from 'three/tsl';
import { createPhysics, FLOOR_SIZE, scatterMarbles } from './physics';
import { createMarbles, environment } from './marble';
import './style.css';

function App() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = container.current!;
    const renderer = new THREE.WebGPURenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.backgroundNode = environment(positionWorldDirection);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
    camera.position.set(0, 10, 16);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = 5;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.target.set(0, 1, 0);
    controls.maxDistance = 50;
    controls.update();

    const spheres = scatterMarbles();
    const marbles = createMarbles({ spheres });
    scene.add(marbles.group);
    const floorGeometry = new THREE.BoxGeometry(FLOOR_SIZE, 1, FLOOR_SIZE);
    const floorMaterial = new THREE.MeshBasicNodeMaterial();
    const checker = positionWorld.x.div(4).floor().add(positionWorld.z.div(4).floor()).mod(2).abs();
    floorMaterial.colorNode = mix(vec3(0.19, 0.21, 0.23), vec3(0.23, 0.25, 0.27), checker);
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.position.y = -0.5;
    scene.add(floor);
    const keys = new Set<string>();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if ('wasd'.includes(key) && key.length === 1) { keys.add(key); event.preventDefault(); }
      if (event.code === 'Space') {
        event.preventDefault();
        if (!event.repeat) physics?.requestJump();
      }
      if (key === 'r' && !event.repeat) marbles.randomize();
    };
    const onKeyUp = (event: KeyboardEvent) => { keys.delete(event.key.toLowerCase()); };
    const clearKeys = () => { keys.clear(); };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearKeys);

    const resize = () => {
      const { clientWidth: width, clientHeight: height } = host;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let disposed = false;
    let physics: Awaited<ReturnType<typeof createPhysics>> | undefined;
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const followDelta = new THREE.Vector3();
    void Promise.all([renderer.init(), createPhysics(spheres)]).then(([, simulation]) => {
      if (disposed) {
        simulation.dispose();
        if (renderer.hasInitialized()) renderer.dispose();
        return;
      }
      physics = simulation;
      let lastTime = performance.now();
      renderer.setAnimationLoop(() => {
        const now = performance.now();
        const dt = (now - lastTime) / 1000;
        lastTime = now;
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        right.crossVectors(forward, camera.up).normalize();
        direction.copy(forward).multiplyScalar(Number(keys.has('w')) - Number(keys.has('s')))
          .addScaledVector(right, Number(keys.has('d')) - Number(keys.has('a'))).normalize();
        simulation.advance(dt, direction);
        marbles.syncTransforms(simulation.transforms);
        const playerPosition = simulation.transforms[0].position;
        followDelta.copy(playerPosition).sub(controls.target);
        camera.position.add(followDelta);
        controls.target.copy(playerPosition);
        controls.update();
        marbles.render(renderer, scene, camera);
      });
    });

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      observer.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearKeys);
      physics?.dispose();
      floorGeometry.dispose();
      floorMaterial.dispose();
      controls.dispose();
      marbles.dispose();
      if (renderer.hasInitialized()) renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={container} className="scene" />;
}

createRoot(document.getElementById('root')!).render(<App />);
