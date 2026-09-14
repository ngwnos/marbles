import createManifold from 'manifold-3d';
import { buildSnakePatches } from '../src/pieces/snake-solid';

self.onmessage = async ({ data }: MessageEvent<'middle' | 'end'>) => {
  try {
    const kernel = await createManifold();
    kernel.setup();
    const patches = buildSnakePatches(kernel, data);
    try {
      const meshes = patches.map(patch => {
        const mesh = patch.getMesh();
        return { numProp: mesh.numProp, vertProperties: mesh.vertProperties,
          triVerts: mesh.triVerts, mergeFromVert: mesh.mergeFromVert, mergeToVert: mesh.mergeToVert };
      });
      self.postMessage({ meshes }, meshes.flatMap(mesh => [mesh.vertProperties.buffer,
        mesh.triVerts.buffer, mesh.mergeFromVert.buffer, mesh.mergeToVert.buffer]));
    } finally { patches.forEach(patch => patch.delete()); }
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
