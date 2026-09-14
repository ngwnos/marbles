import * as THREE from 'three/webgpu';
import { createMarbles } from '../src/marble';

// Compare the depth-prepass result against ordinary opaque depth rendering
// across camera distances, including multisampled output.
export async function verifyDepth() {
  const renderer = new THREE.WebGPURenderer();
  await renderer.init();
  renderer.setSize(256, 256);
  const marbles = createMarbles();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x606060);
  scene.add(marbles.group);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  const target = new THREE.RenderTarget(256, 256, { samples: 4 });
  const depthMesh = marbles.group.children.find(child => child !== marbles.mesh)!;
  const results = [];
  try {
    renderer.setRenderTarget(target);
    for (const distance of [9, 10.3, 13.7, 18.1, 25, 40, 50]) {
      camera.position.set(13, 10, 18).normalize().multiplyScalar(distance);
      camera.lookAt(0, 0, 0);
      const capture = async (reference: boolean) => {
        depthMesh.visible = !reference;
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        marbles.render(renderer, scene, camera);
        return await renderer.readRenderTargetPixelsAsync(target, 0, 0, 256, 256);
      };
      const actual = await capture(false);
      const reference = await capture(true);
      let differentPixels = 0;
      for (let i = 0; i < actual.length; i += 4) {
        if ([0, 1, 2].some(c => Math.abs(actual[i + c] - reference[i + c]) > 8)) differentPixels++;
      }
      results.push({ distance, differentPixels });
    }
    if (results.some(result => result.differentPixels !== 0)) {
      throw new Error(`Depth prepass differs from ordinary depth rendering: ${JSON.stringify(results)}`);
    }
    return results;
  } finally {
    renderer.setRenderTarget(null);
    target.dispose();
    marbles.dispose();
    renderer.dispose();
  }
}
