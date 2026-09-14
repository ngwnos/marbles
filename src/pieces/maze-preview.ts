import * as THREE from 'three/webgpu';
import meshUrl from '../generated/maze.bin?url';
import {loadPreviewMesh} from '../geometry/preview-mesh';
export async function createMaze(color=0x075abe){
 const geometry=await loadPreviewMesh(meshUrl);
 const material=new THREE.MeshPhysicalNodeMaterial({color,roughness:.27,clearcoat:.16,clearcoatRoughness:.3});
 const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;
 mesh.name='Marbleworks No.146 maze — approval draft';
 return {mesh,dispose(){geometry.dispose();material.dispose();}};
}
