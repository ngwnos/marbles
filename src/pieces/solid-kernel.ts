import createManifoldModule, { type Manifold, type ManifoldToplevel } from 'manifold-3d';
import manifoldWasmUrl from 'manifold-3d/manifold.wasm?url';

let kernel: Promise<ManifoldToplevel> | undefined;

export function loadSolidKernel(): Promise<ManifoldToplevel> {
  return kernel ??= createManifoldModule({ locateFile: () => manifoldWasmUrl }).then((module) => {
    module.setup();
    return module;
  });
}

export { solidToGeometry } from './solid-geometry';
