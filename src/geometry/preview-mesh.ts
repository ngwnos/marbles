import * as THREE from 'three/webgpu';

export function encodePreviewMesh(geometry:THREE.BufferGeometry) {
  const positions=new Float32Array(geometry.getAttribute('position').array);
  const normals=new Float32Array(geometry.getAttribute('normal').array);
  const indices=new Uint32Array(geometry.index!.array);
  const bytes=new Uint8Array(8+positions.byteLength+normals.byteLength+indices.byteLength);
  bytes.set(new Uint8Array(new Uint32Array([positions.length/3,indices.length]).buffer));
  let offset=8;
  for(const array of [positions,normals,indices]){
    bytes.set(new Uint8Array(array.buffer,array.byteOffset,array.byteLength),offset);offset+=array.byteLength;
  }
  return bytes;
}

export async function loadPreviewMesh(url:string) {
  const response=await fetch(url);
  if(!response.ok)throw new Error(`Preview mesh: ${response.status}`);
  return decodePreviewMesh(await response.arrayBuffer());
}

export function decodePreviewMesh(buffer:ArrayBuffer) {
  const [vertices,indices]=new Uint32Array(buffer,0,2);
  const geometry=new THREE.BufferGeometry(),size=vertices*3*4;
  geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(buffer,8,vertices*3),3));
  geometry.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(buffer,8+size,vertices*3),3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(buffer,8+size*2,indices),1));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
