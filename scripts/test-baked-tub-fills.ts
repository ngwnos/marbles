import assert from 'node:assert/strict';
import {Quaternion,Vector3} from 'three/webgpu';
import {createTubFill,TUB_FILL_SEEDS} from '../src/assembly/tub-stock';
import {TUB_PACK_VERSION,TUB_PIECE_LIMIT} from '../src/assembly/tub-pack';
import {auditPackedOverlap,packedHulls} from '../src/assembly/tub-packing';
import {createAssemblyPhysics} from '../src/assembly/physics';
import baked from '../src/generated/tub-fills.json';

assert.equal(baked.version,TUB_PACK_VERSION);
assert.equal(TUB_FILL_SEEDS.length,10);
assert.equal(new Set(TUB_FILL_SEEDS).size,10);
const asset=JSON.stringify(baked);
for(const seed of TUB_FILL_SEEDS){
 const fill=createTubFill(undefined,seed);
 assert(fill.pieces.length>=60&&fill.pieces.length<=TUB_PIECE_LIMIT);
 assert(new Set(fill.pieces.map(p=>p.kind)).size>=8);
 assert(auditPackedOverlap(fill.pieces).maxPenetration<.001);
 const audit=await createAssemblyPhysics({packing:true});
 assert(audit.tubContains(packedHulls(fill.pieces).flatMap(hs=>hs.flatMap(h=>h.vertices))));audit.dispose();
 const sim=await createAssemblyPhysics();
 fill.pieces.forEach((p,id)=>sim.add(id,p.kind,p.position,new Quaternion(...p.rotation),false,{awake:false,rotorRotation:p.rotorRotation}));
 const before=fill.pieces.map((_,id)=>({position:sim.pose(id)!.position.toArray(),rotation:sim.pose(id)!.rotation.toArray(),rotor:sim.wheelPose(id)?.rotation.toArray()}));
 for(let i=0;i<240;i++)sim.step();
 fill.pieces.forEach((_,id)=>{
  const p=sim.pose(id)!;assert(!p.awake);
  assert(new Vector3(...before[id].position).distanceTo(p.position)<.001);
  assert(new Quaternion(...before[id].rotation).angleTo(p.rotation)<1e-6);
  const rotor=sim.wheelPose(id);if(rotor){assert(!rotor.awake);assert(new Quaternion(...before[id].rotor!).angleTo(rotor.rotation)<1e-6);}
 });
 sim.dispose();
 for(let i=0;i<20;i++)assert.notEqual(createTubFill(seed).seed,seed,'Repeated the current fill');
 // Every selection owns its transforms; editing one cannot corrupt the bank.
 fill.pieces[0].position[0]=123456;
 assert.notEqual(createTubFill(undefined,seed).pieces[0].position[0],123456);
 console.log(seed,fill.pieces.length,'pieces: containment, overlap, sleeping reload passed');
}
assert.equal(JSON.stringify(baked),asset);
assert.throws(()=>createTubFill(undefined,-1),/Unknown tub fill/);
console.log('All ten baked fills passed');
