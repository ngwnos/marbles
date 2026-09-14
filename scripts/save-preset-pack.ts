import assert from 'node:assert/strict';
import {Quaternion,Vector3} from 'three';
import {PRESETS} from '../src/assembly/presets';
import {STORAGE_TUB as D} from '../src/assembly/storage-tub-spec';
import {TUB_PACK_VERSION,type TubPack,type PackedPiece} from '../src/assembly/tub-pack';
import {auditPackedOverlap,packedHulls} from '../src/assembly/tub-packing';
import {createAssemblyPhysics} from '../src/assembly/physics';

// Import a simulated, settled pile into the preset bank. Piles may overflow
// the open rim; actual shell containment and piece clearance must still pass.
const [id,path]=process.argv.slice(2),preset=PRESETS.find(p=>p.id===id);
assert(preset&&path,'Usage: bun scripts/save-preset-pack.ts <preset-id> <settled-pack.json>');
const pack:TubPack=await Bun.file(path).json();assert.equal(pack.version,TUB_PACK_VERSION);
const inventory=(pieces:{kind:string}[])=>pieces.map(p=>p.kind).sort();
assert.deepEqual(inventory(pack.pieces),inventory(preset.pieces),'Packed inventory does not match preset');
assert(auditPackedOverlap(pack.pieces).maxPenetration<.001);
const audit=await createAssemblyPhysics({packing:true});
assert(audit.tubContains(packedHulls(pack.pieces).flatMap(hs=>hs.flatMap(h=>h.vertices))));audit.dispose();
const inverse=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),D.yaw).invert(),origin=new Vector3(...D.position);
const pieces:PackedPiece[]=pack.pieces.map(p=>({...p,position:new Vector3(...p.position).sub(origin).applyQuaternion(inverse).toArray(),rotation:inverse.clone().multiply(new Quaternion(...p.rotation)).toArray()}));
const file=Bun.file('src/generated/preset-packs.json');
const bank:{version:number;packs:{presetId:string;pieces:PackedPiece[]}[]}=await file.exists()?await file.json():{version:TUB_PACK_VERSION,packs:[]};
assert.equal(bank.version,TUB_PACK_VERSION,'Rebuild outdated preset packs first');
bank.packs=bank.packs.filter(p=>p.presetId!==id);bank.packs.push({presetId:id,pieces});
await Bun.write(file,JSON.stringify(bank));console.log('Saved',id,pieces.length,'pieces');
