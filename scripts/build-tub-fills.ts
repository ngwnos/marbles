import {Quaternion,Vector3} from 'three/webgpu';
import {generateTubPack,TUB_PACK_VERSION} from '../src/assembly/tub-packing';
import {STORAGE_TUB as D} from '../src/assembly/storage-tub-spec';

// Bake once during development. Each candidate must pass the packer's full
// containment, overlap and settling checks before it can enter the asset.
const seeds=[2018143443,1747,42,100,7,123,999,2026,777,312];
const inverse=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),D.yaw).invert(),origin=new Vector3(...D.position);
const fills=[];
for(const seed of seeds){
 const pack=await generateTubPack(seed);
 const pieces=pack.pieces.map(p=>({...p,
  position:new Vector3(...p.position).sub(origin).applyQuaternion(inverse).toArray(),
  rotation:inverse.clone().multiply(new Quaternion(...p.rotation)).toArray(),
 }));
 fills.push({seed,pieces});
 console.log(JSON.stringify({seed,count:pieces.length,...pack.stats}));
}
// Coordinates are relative to the upright tub, so moving the tub doesn't
// require re-running packing. Write only after all ten fills pass.
await Bun.write('src/generated/tub-fills.json',JSON.stringify({version:TUB_PACK_VERSION,fills}));
console.log('Baked',fills.length,'validated tub fills');
