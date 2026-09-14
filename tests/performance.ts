import * as THREE from 'three/webgpu';
import { positionWorldDirection } from 'three/tsl';
import { createMarbles, environment } from '../src/marble';

// Reproducible GPU timings, including Retina resolution and a close-up view.
// Run in the Vite page: await (await import('/tests/performance.ts')).profile()
export async function profile(includePixels = false) {
  const renderer = new THREE.WebGPURenderer({ trackTimestamp: true });
  await renderer.init();
  renderer.info.autoReset = false;
  const random = Math.random;
  let seed = 1729;
  Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  let marbles: ReturnType<typeof createMarbles>;
  try { marbles = createMarbles(); } finally { Math.random = random; }
  const scene = new THREE.Scene();
  scene.backgroundNode = environment(positionWorldDirection);
  scene.add(marbles.group);
  const camera = new THREE.PerspectiveCamera(50, 1800 / 992, 0.1, 100);
  const results: { name: string; medianGpuMs: number | null; drawCalls: number }[] = [];
  try {
    for (const [name, width, height, zoom] of [
      ['overview-retina', 3600, 1984, 1],
      ['close-retina', 3600, 1984, 0.45],
      ['close-css-resolution', 1800, 992, 0.45],
    ] as const) {
      const target = new THREE.RenderTarget(width, height, { samples: 4 });
      renderer.setRenderTarget(target);
      camera.position.set(13 * zoom, 10 * zoom, 18 * zoom);
      camera.lookAt(0, 0, 0);
      const timings: number[] = [];
      for (let frame = 0; frame < 15; frame++) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        renderer.info.reset();
        marbles.render(renderer, scene, camera);
        const ms = await renderer.resolveTimestampsAsync('render');
        if (frame > 3 && ms !== undefined) timings.push(ms);
      }
      results.push({ name, medianGpuMs: timings.sort((a, b) => a - b)[Math.floor(timings.length / 2)] ?? null,
        drawCalls: renderer.info.render.drawCalls });
      renderer.setRenderTarget(null);
      target.dispose();
    }
    let pixels: number[] = [];
    if (includePixels) {
      const target = new THREE.RenderTarget(640, 352, { type: THREE.UnsignedByteType });
      renderer.setRenderTarget(target);
      camera.position.set(13 * 0.45, 10 * 0.45, 18 * 0.45);
      camera.lookAt(0, 0, 0);
      marbles.render(renderer, scene, camera);
      pixels = Array.from(await renderer.readRenderTargetPixelsAsync(target, 0, 0, 640, 352));
      renderer.setRenderTarget(null);
      target.dispose();
    }
    return { results, pixels };
  } finally { marbles.dispose(); renderer.dispose(); }
}
