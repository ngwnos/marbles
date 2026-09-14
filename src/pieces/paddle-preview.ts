import * as THREE from 'three/webgpu';
import bodyUrl from '../generated/paddle-body.bin?url';
import wheelUrl from '../generated/paddle-wheel.bin?url';
import {loadPreviewMesh} from '../geometry/preview-mesh';

export async function createPaddleRamp() {
  const [bodyGeometry,wheelGeometry]=await Promise.all([loadPreviewMesh(bodyUrl),loadPreviewMesh(wheelUrl)]);
  const yellow=new THREE.MeshPhysicalNodeMaterial({color:0xf1bf00,roughness:.27,clearcoat:.16,clearcoatRoughness:.3});
  const blue=new THREE.MeshPhysicalNodeMaterial({color:0x1855cf,roughness:.27,clearcoat:.16,clearcoatRoughness:.3});
  const mesh=new THREE.Group();
  const body=new THREE.Mesh(bodyGeometry,yellow),wheel=new THREE.Mesh(wheelGeometry,blue);
  const pivot=wheelGeometry.boundingBox!.getCenter(new THREE.Vector3());
  wheelGeometry.translate(-pivot.x,-pivot.y,-pivot.z);wheel.position.copy(pivot);
  body.name='No.147 chute and bearing supports';wheel.name='No.147 twelve-pocket paddle wheel';
  for(const part of [body,wheel]){part.castShadow=true;part.receiveShadow=true;mesh.add(part);}
  return {mesh,dispose(){bodyGeometry.dispose();wheelGeometry.dispose();yellow.dispose();blue.dispose();}};
}
