import {Mesh,MeshPhysicalNodeMaterial} from 'three/webgpu';
import {loadPreviewMesh} from '../geometry/preview-mesh';
import meshUrl from '../generated/storage-tub.bin?url';
import {STORAGE_TUB} from './storage-tub-spec';

export async function createStorageTub(){
 const geometry=await loadPreviewMesh(meshUrl);
 const material=new MeshPhysicalNodeMaterial({color:STORAGE_TUB.color,roughness:.44,clearcoat:.08,clearcoatRoughness:.4});
 const mesh=new Mesh(geometry,material);mesh.name='Blue-grey storage tub';
 mesh.position.fromArray(STORAGE_TUB.position);mesh.rotation.y=STORAGE_TUB.yaw;
 mesh.updateMatrixWorld();
 return {mesh,dispose(){geometry.dispose();material.dispose();}};
}
