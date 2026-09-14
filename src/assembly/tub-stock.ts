import {Quaternion,Vector3} from 'three/webgpu';
import baked from '../generated/tub-fills.json';
import {STORAGE_TUB as D} from './storage-tub-spec';
import {TUB_PACK_VERSION,type PackedPiece} from './tub-pack';
export {TUB_PACK_VERSION} from './tub-pack';

if(baked.version!==TUB_PACK_VERSION)throw new Error('Rebuild the tub fills for this collider version');
export const TUB_FILL_SEEDS=baked.fills.map(fill=>fill.seed);
const rotation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),D.yaw),origin=new Vector3(...D.position);

/** Saved piles use tub-local coordinates, including parts above the rim. */
export function placeTubPieces(pieces:readonly PackedPiece[]):PackedPiece[]{
 return pieces.map(p=>({
  kind:p.kind,
  position:new Vector3().fromArray(p.position).applyQuaternion(rotation).add(origin).toArray(),
  rotation:rotation.clone().multiply(new Quaternion().fromArray(p.rotation)).toArray(),
  ...(p.rotorRotation?{rotorRotation:[...p.rotorRotation] as [number,number,number,number]}:{}),
 }));
}

/** Pick a certified resting pile. Runtime only transforms the saved poses;
 * all simulation and validation happen in scripts/build-tub-fills.ts. */
export function createTubFill(previousSeed?:number,seed?:number):{seed:number;pieces:PackedPiece[]}{
 const choices=baked.fills.filter(fill=>fill.seed!==previousSeed);
 const fill=seed===undefined?choices[Math.floor(Math.random()*choices.length)]:baked.fills.find(fill=>fill.seed===seed);
 if(!fill)throw new Error(`Unknown tub fill: ${seed}`);
 return {seed:fill.seed,pieces:placeTubPieces(fill.pieces as PackedPiece[])};
}
