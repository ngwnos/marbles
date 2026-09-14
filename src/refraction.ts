import * as THREE from 'three/webgpu';
import { mrt, output, screenUV, texture, vec4 } from 'three/tsl';

// Reserved for the two instanced marble draws; ordinary world objects use layer 0.
export const MARBLE_LAYER = 31;

export function createRefractionPasses() {
  const world = new THREE.RenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    depthTexture: new THREE.DepthTexture(1, 1),
  });
  const marbles = new THREE.RenderTarget(1, 1, { type: THREE.HalfFloatType, count: 2 });
  marbles.textures[0].name = 'output';
  marbles.textures[1].name = 'marbleId';
  marbles.textures[1].format = THREE.RedFormat;
  marbles.textures[1].type = THREE.FloatType;
  marbles.textures[1].minFilter = THREE.NearestFilter;
  marbles.textures[1].magFilter = THREE.NearestFilter;
  const outputs = mrt({ output, marbleId: vec4(0) });
  const background = texture(world.texture, screenUV);
  const size = new THREE.Vector2();

  const render = (
    renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera,
    mesh: THREE.InstancedMesh, baseMaterial: THREE.Material, finalMaterial: THREE.Material,
  ) => {
    const destination = renderer.getRenderTarget();
    const previousMRT = renderer.getMRT();
    const previousLayers = camera.layers.mask;
    const previousBackground = scene.background;
    const previousBackgroundNode = scene.backgroundNode;
    const previousAutoClear = renderer.autoClear;
    if (destination) size.set(destination.width, destination.height);
    else renderer.getDrawingBufferSize(size);
    if (world.width !== size.x || world.height !== size.y) {
      world.setSize(size.x, size.y);
      marbles.setSize(size.x, size.y);
    }
    try {
      renderer.autoClear = true;
      // 1. Opaque world color/depth, with every marble excluded.
      camera.layers.mask = previousLayers & ~(1 << MARBLE_LAYER);
      renderer.setMRT(null);
      renderer.setRenderTarget(world);
      renderer.render(scene, camera);

      // 2. Base marbles refract only the world. Color and nearest-surface ID
      // are written together, so an ID-only scene render is unnecessary.
      camera.layers.set(MARBLE_LAYER);
      scene.background = null;
      scene.backgroundNode = background;
      mesh.material = baseMaterial;
      renderer.setMRT(outputs);
      renderer.setRenderTarget(marbles);
      renderer.render(scene, camera);

      // 3. Final marbles sample the completed base capture. It is never sampled
      // while attached for writing, and never reused from an earlier frame.
      mesh.material = finalMaterial;
      renderer.setMRT(null);
      renderer.setRenderTarget(destination);
      renderer.render(scene, camera);
    } finally {
      mesh.material = finalMaterial;
      camera.layers.mask = previousLayers;
      scene.background = previousBackground;
      scene.backgroundNode = previousBackgroundNode;
      renderer.autoClear = previousAutoClear;
      renderer.setMRT(previousMRT);
      renderer.setRenderTarget(destination);
    }
  };
  return { world, marbles, render, dispose: () => { world.dispose(); marbles.dispose(); } };
}
