import assert from 'node:assert/strict';
import {Quaternion,Vector3,Euler} from 'three/webgpu';
import {convexEnvelope} from '../src/geometry/convex-envelope';
import {hullPenetration,transformHull} from '../src/assembly/packing-overlap';
import {generateTubPack,TUB_PIECE_LIMIT,auditPackedOverlap,packedBounds,type PackedPiece} from '../src/assembly/tub-packing';
import {createAssemblyPhysics} from '../src/assembly/physics';

// Independent analytic cases: separated, touching, overlapping and rotated
// cubes. Prevent a broken separation check from certifying an invalid pile.
const cube=convexEnvelope([-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>new Vector3(x,y,z)))),0);
const a=transformHull(cube,new Vector3(),new Quaternion());
for(const x of [2,2.1,10])assert(hullPenetration(a,transformHull(cube,new Vector3(x,0,0),new Quaternion()))<1e-8);
assert(Math.abs(hullPenetration(a,transformHull(cube,new Vector3(1.75,0,0),new Quaternion()))-.25)<1e-8);
assert(Math.abs(hullPenetration(a,transformHull(cube,new Vector3(2,0,0),new Quaternion().setFromEuler(new Euler(0,0,Math.PI/4))))-(Math.SQRT2-1))<1e-8);

const seeds=process.argv.slice(2).map(Number);if(!seeds.length)seeds.push(2018143443,1747,42,100,7,123,999);
for(const seed of seeds){
 const pack=await generateTubPack(seed);
 assert(pack.pieces.length>=60&&pack.pieces.length<=TUB_PIECE_LIMIT);assert.equal(pack.stats.maxPenetration,0);assert(pack.stats.maxDrift<.05);
 assert(new Set(pack.pieces.map(p=>p.kind)).size>=8,'Insufficient assortment');
 const sim=await createAssemblyPhysics(),bodies=pack.pieces.map((p,id)=>sim.add(id,p.kind,p.position,new Quaternion(...p.rotation),false,{awake:false,rotorRotation:p.rotorRotation}));
 const read=():PackedPiece[]=>pack.pieces.flatMap((p,id)=>{const pose=sim.pose(id);if(!pose)return [];const w=sim.wheelPose(id);return [{...p,position:pose.position.toArray(),rotation:pose.rotation.toArray(),...(w?{rotorRotation:pose.rotation.clone().invert().multiply(w.rotation).toArray()}: {})}];});
 const before=read();for(let j=0;j<240;j++)sim.step();
 assert.deepEqual(read(),before,'Saved sleeping pack changed after loading');assert(bodies.every(b=>!b.isAwake()));
 // Adding the marble-only surface shapes must not change plastic mass or
 // disturb the pile. Their filters must not collide with the filled envelopes.
 const mass=bodies.map(b=>b.getMass());assert(sim.dropMarble([0,100,0]));
 assert(bodies.every((b,i)=>Math.abs(b.getMass()-mass[i])<1e-5));sim.clearMarbles();
 for(let j=0;j<120;j++)sim.step();assert.deepEqual(read(),before,'Marble collider activation disturbed sleeping stock');
 // Remove a bottom support, not just an exposed top piece. This must wake
 // its neighbors after a saved-state load, allowing the pile to settle again.
 const bottom=pack.pieces.map((p,i)=>({i,y:packedBounds(p).min.y})).sort((a,b)=>a.y-b.y)[0].i;
 sim.remove(bottom);
 for(let j=0;j<3600&&pack.pieces.some((_,i)=>sim.pose(i)?.awake||sim.wheelPose(i)?.awake);j++)sim.step();
 const after=read();assert(after.some((p,i)=>p.position.some((v,j)=>Math.abs(v-before[i>=bottom?i+1:i].position[j])>.1)),'Removing a bottom support left the whole pile frozen');
 assert.equal(auditPackedOverlap(after).maxPenetration,0,'Removal caused visible overlap');
 assert(pack.pieces.every((_,i)=>!sim.pose(i)?.awake),'Pile did not return to sleep');sim.dispose();
 console.log(JSON.stringify({seed,count:pack.pieces.length,...pack.stats,reload:true,removal:true}));
}
console.log('Tub packing, containment, reload, wake and contact-filter tests passed');
