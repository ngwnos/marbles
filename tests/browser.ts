import * as THREE from 'three/webgpu';
import { createMarbles } from '../src/marble';

// Run from Vite: await (await import('/tests/browser.ts')).verify()
// Verify world capture, ID-based self rejection, visible-neighbor refraction,
// the known fully-hidden-neighbor limitation, and foreground occlusion.
export async function verify() {
  const renderer = new THREE.WebGPURenderer();
  await renderer.init();
  renderer.setSize(128, 128);
  const marbles = createMarbles({ spheres: [
    { center: [0, 0, 0], radius: 1 }, { center: [0, 0, -2.25], radius: 0.8 },
  ] });
  const scene = new THREE.Scene();
  scene.add(marbles.group);
  const planeGeometry = new THREE.PlaneGeometry(20, 20);
  const worldMaterial = new THREE.MeshBasicNodeMaterial({ color: 0x1060e0 });
  const world = new THREE.Mesh(planeGeometry, worldMaterial);
  world.position.z = -5;
  scene.add(world);
  const frontMaterial = new THREE.MeshBasicNodeMaterial({ color: 0x20ee50 });
  const front = new THREE.Mesh(planeGeometry, frontMaterial);
  front.scale.setScalar(0.02);
  front.position.z = 2;
  front.visible = false;
  scene.add(front);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  const target = new THREE.RenderTarget(128, 128, { type: THREE.UnsignedByteType });
  const array = marbles.appearanceAttribute.array as Float32Array;
  for (let id = 0; id < 2; id++) {
    const base = id * 32;
    array.set([0.63, 0.34, 0.65, 0.28], base);
    array.set([id === 0 ? 0 : 1.4, 3, 1.51, 0], base + 4);
    array.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0], base + 8);
  }
  const capture = async (worldHex: number, rearHex: number) => {
    worldMaterial.color.setHex(worldHex);
    const color = new THREE.Color(rearHex);
    for (let i = 0; i < 3; i++) array.set([...color.toArray(), 0], 32 + 20 + i * 4);
    marbles.appearanceAttribute.needsUpdate = true;
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    marbles.render(renderer, scene, camera);
    return new Uint8Array(await renderer.readRenderTargetPixelsAsync(target, 0, 0, 128, 128));
  };
  try {
    renderer.setRenderTarget(target);
    const blueWorld = await capture(0x1060e0, 0xe02010);
    const yellowWorld = await capture(0xe0c010, 0xe02010);
    const blueRear = await capture(0xe0c010, 0x1040ee);
    const ids = await renderer.readRenderTargetPixelsAsync(marbles.passes.marbles, 0, 0, 128, 128, 1);
    const base = await renderer.readRenderTargetPixelsAsync(marbles.passes.marbles, 0, 0, 128, 128);
    let selfPixels = 0, selfFeedbackPixels = 0;
    for (let pixel = 0; pixel < ids.length; pixel++) {
      if (ids[pixel] !== 1) continue;
      const i = pixel * 4;
      selfPixels++;
      if ([0, 1, 2].some(c => Math.abs(blueRear[i + c] - Math.min(255,
        Math.round(THREE.DataUtils.fromHalfFloat(base[i + c]) * 255))) > 3)) selfFeedbackPixels++;
    }
    let worldChanges = 0, rearChanges = 0;
    // This region is covered by the front marble, not the directly visible world.
    for (let y = 40; y < 88; y++) for (let x = 40; x < 88; x++) {
      const i = (y * 128 + x) * 4;
      const difference = (a: Uint8Array, b: Uint8Array) =>
        Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      if (difference(blueWorld, yellowWorld) > 8) worldChanges++;
      if (difference(yellowWorld, blueRear) > 8) rearChanges++;
    }
    front.visible = true;
    const withForeground = await capture(0xe0c010, 0x1040ee);
    marbles.group.visible = false;
    const worldOnly = await capture(0xe0c010, 0x1040ee);
    const center = (64 * 128 + 64) * 4;
    const foregroundPreserved = [0, 1, 2].every(c => withForeground[center + c] === worldOnly[center + c]);
    if (worldChanges < 100 || rearChanges !== 0 || !foregroundPreserved || selfPixels < 100 || selfFeedbackPixels > 0) {
      const at = (a: Uint8Array, x: number, y: number) => Array.from(a.slice((y * 128 + x) * 4, (y * 128 + x) * 4 + 4));
      throw new Error(JSON.stringify({ worldChanges, rearChanges, foregroundPreserved, selfPixels, selfFeedbackPixels, blue: at(blueWorld, 45, 45), yellow: at(yellowWorld, 45, 45), outsideBlue: at(blueWorld, 5, 5), outsideYellow: at(yellowWorld, 5, 5) }));
    }
    front.visible = false;
    scene.remove(marbles.group);
    const neighbors = createMarbles({ spheres: [
      { center: [0, 0, 0], radius: 1 }, { center: [1.65, 0, -1.5], radius: 0.8 },
    ] });
    scene.add(neighbors.group);
    const neighborArray = neighbors.appearanceAttribute.array as Float32Array;
    neighborArray.set(array);
    try {
      const captureNeighbor = async (hex: number) => {
        const color = new THREE.Color(hex);
        for (let i = 0; i < 3; i++) neighborArray.set([...color.toArray(), 0], 32 + 20 + i * 4);
        neighbors.appearanceAttribute.needsUpdate = true;
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        neighbors.render(renderer, scene, camera);
        return new Uint8Array(await renderer.readRenderTargetPixelsAsync(target, 0, 0, 128, 128));
      };
      const red = await captureNeighbor(0xe02010);
      const blue = await captureNeighbor(0x1040ee);
      const visibleIds = await renderer.readRenderTargetPixelsAsync(neighbors.passes.marbles, 0, 0, 128, 128, 1);
      let refractedNeighborPixels = 0;
      for (let i = 0; i < red.length; i += 4) {
        if (visibleIds[i / 4] === 1 && Math.abs(red[i] - blue[i]) + Math.abs(red[i + 1] - blue[i + 1]) + Math.abs(red[i + 2] - blue[i + 2]) > 8) {
          refractedNeighborPixels++;
        }
      }
      if (refractedNeighborPixels < 10) throw new Error(`Visible neighbor did not refract: ${refractedNeighborPixels}`);
      return { worldChanges, rearChanges, foregroundPreserved, selfPixels, selfFeedbackPixels, refractedNeighborPixels };
    } finally { neighbors.dispose(); }
  } finally {
    renderer.setRenderTarget(null);
    target.dispose();
    marbles.dispose();
    planeGeometry.dispose();
    worldMaterial.dispose();
    frontMaterial.dispose();
    renderer.dispose();
  }
}
