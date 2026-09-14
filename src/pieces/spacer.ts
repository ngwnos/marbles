import * as THREE from 'three/webgpu';
import type { ManifoldToplevel } from 'manifold-3d';
import { CONNECTOR, outerPostProfile, socketCoreProfile } from './marbleworks-spec';

/** The shared connector, with an uninterrupted bore and no track opening. */
export function buildSpacerSolid(kernel: ManifoldToplevel) {
  const outside = new kernel.CrossSection(outerPostProfile(), 'NonZero');
  const core = new kernel.CrossSection(socketCoreProfile(), 'NonZero');
  const section = outside.subtract(core);
  const revolved = section.revolve(192);
  const solid = revolved.rotate([-90, 0, 0]);
  outside.delete(); core.delete(); section.delete(); revolved.delete();
  return solid;
}

export async function createSpacer(color = 0x15964f) {
  const { loadSolidKernel, solidToGeometry } = await import('./solid-kernel');
  const solid = buildSpacerSolid(await loadSolidKernel());
  const geometry = solidToGeometry(solid);
  solid.delete();
  const material = new THREE.MeshPhysicalNodeMaterial({ color, roughness: 0.27,
    clearcoat: 0.16, clearcoatRoughness: 0.3 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.name = 'Marbleworks — straight spacer';
  return { mesh, dimensions: CONNECTOR, dispose() { geometry.dispose(); material.dispose(); } };
}
