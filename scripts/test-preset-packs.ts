import assert from 'node:assert/strict';
import {Quaternion,Vector3} from 'three';
import {PRESETS} from '../src/assembly/presets';
import {createPresetStock,hasPackedPreset} from '../src/assembly/preset-stock';
import {auditPackedOverlap,packedHulls} from '../src/assembly/tub-packing';
import {createAssemblyPhysics} from '../src/assembly/physics';
import {STORAGE_TUB as D} from '../src/assembly/storage-tub-spec';
const inventory=(pieces:{kind:string}[])=>pieces.map(p=>p.kind).sort();
for(const preset of PRESETS.filter(hasPackedPreset)){
 const pieces=createPresetStock(preset);
 assert.deepEqual(inventory(pieces),inventory(preset.pieces));
 assert(auditPackedOverlap(pieces).maxPenetration<.001);
 const points=packedHulls(pieces).flatMap(hs=>hs.flatMap(h=>h.vertices));
 const audit=await createAssemblyPhysics({packing:true});assert(audit.tubContains(points));audit.dispose();
 const sim=await createAssemblyPhysics();
 pieces.forEach((p,id)=>sim.add(id,p.kind,p.position,new Quaternion(...p.rotation),false,{awake:false,rotorRotation:p.rotorRotation}));
 for(let i=0;i<600;i++)sim.step();
 for(const [id,before] of pieces.entries()){
  const after=sim.pose(id)!;assert(!after.awake,'Packed body woke on reload');
  assert(after.position.distanceTo(new Vector3(...before.position))<.001);
  assert(after.rotation.angleTo(new Quaternion(...before.rotation))<1e-6);
  const rotor=sim.wheelPose(id);if(rotor){assert(!rotor.awake);assert(rotor.rotation.angleTo(new Quaternion(...before.rotation).multiply(new Quaternion(...before.rotorRotation!)))<1e-6);}
 }
 sim.dispose();
 pieces[0].position[0]=1e6;assert.notEqual(createPresetStock(preset)[0].position[0],1e6,'Stock returned a shared transform');
 assert(!hasPackedPreset({...preset,pieces:preset.pieces.slice(1)}),'Changed inventory accepted an obsolete pack');
 console.log(preset.name,pieces.length,'pieces; stable reload; above rim',Math.round(Math.max(...points.map(p=>p.y))-D.position[1]-D.height),'mm');
}
assert(hasPackedPreset(PRESETS.find(p=>p.id==='tangled-garden')!));
assert.throws(()=>createPresetStock({...PRESETS[0],id:'unknown'}),/No matching packed layout/);
