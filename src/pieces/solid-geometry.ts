import type { Manifold, Mesh } from 'manifold-3d';
import { BufferAttribute, BufferGeometry } from 'three/webgpu';

/** Keeps smoothly curved walls smooth while preserving molded corners. */
export function solidToGeometry(solid: Manifold, preserveNormals = false): BufferGeometry {
  const normalSolid = preserveNormals ? solid : solid.calculateNormals(0, 40);
  try {
    return meshToGeometry(normalSolid.getMesh(preserveNormals ? 3 : undefined));
  } finally {
    if (!preserveNormals) normalSolid.delete();
  }
}

/** Convert an exported mesh whose normal properties are already in world space. */
export function meshToGeometry(mesh: Mesh): BufferGeometry {
  const count = mesh.vertProperties.length / mesh.numProp;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions.set(mesh.vertProperties.subarray(i * mesh.numProp, i * mesh.numProp + 3), i * 3);
    normals.set(mesh.vertProperties.subarray(i * mesh.numProp + 3, i * mesh.numProp + 6), i * 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setIndex(new BufferAttribute(new Uint32Array(mesh.triVerts), 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
