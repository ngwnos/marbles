import * as THREE from 'three/webgpu';
import meshUrl from '../generated/snake.bin?url';
export { buildSnakeSolid, sampleSnake, SNAKE_LENGTH, SNAKE_RAMP, snakeFloor, snakeBendCenter } from './snake-solid';

export async function createSnakeRamp(color = 0x126dcc) {
  const response = await fetch(meshUrl);
  if (!response.ok) throw new Error(`Snake mesh: ${response.status}`);
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
  mesh.name = 'Marbleworks No.145 snake — approval draft';
  return { mesh, dispose() { geometry.dispose(); material.dispose(); } };
}
