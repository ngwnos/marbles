import * as THREE from 'three/webgpu';
import meshUrl from '../generated/intersection.bin?url';

export async function createIntersection(color = 0x075abe) {
  const response = await fetch(meshUrl);
  if (!response.ok) throw new Error(`Intersection mesh: ${response.status}`);
  const buffer = await response.arrayBuffer();
  const [vertexCount, indexCount] = new Uint32Array(buffer, 0, 2);
  const geometry = new THREE.BufferGeometry();
  const attributeBytes = vertexCount * 3 * 4;
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buffer, 8, vertexCount * 3), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(buffer, 8 + attributeBytes, vertexCount * 3), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(buffer, 8 + attributeBytes * 2, indexCount), 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const material = new THREE.MeshPhysicalNodeMaterial({ color, roughness: 0.27,
    clearcoat: 0.16, clearcoatRoughness: 0.3 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.name = 'Marbleworks No.204 intersection — approval draft';
  return { mesh, dispose() { geometry.dispose(); material.dispose(); } };
}
