import assert from 'node:assert/strict';
import init from '../src/vendor/box3d/box3d.mjs';
import {createAssemblyPhysics} from '../src/assembly/physics';
import {addMarbleShapes,CARPET,WOOD,PLASTIC} from '../src/contact-materials';
import {MM_TO_PHYSICS as S,GRAVITY_MM,MARBLE_RADIUS_MM as R,CONTACT_HERTZ,PHYSICS_SUBSTEPS,SOLVER_STEP,ASSEMBLY_STEP} from '../src/physics-settings';

// Exercise the actual builder clock/scale, with no surface in the drop path.
const builder=await createAssemblyPhysics();builder.dropMarble([0,1000,0]);
for(let i=0;i<24;i++)builder.step();
const fall=1000-builder.marblePositions()[0].y,expected=.5*GRAVITY_MM*(24*ASSEMBLY_STEP)**2;
assert(Math.abs(fall-expected)<1,`Free fall ${fall} versus ${expected} mm`);
const before=builder.marbleStates(0)[0],after=builder.marbleStates(1)[0],mid=builder.marbleStates(.5)[0];
assert(Math.abs(mid.position.y-(before.position.y+after.position.y)/2)<1e-6);
console.log('Builder 0.2-second fall (mm)',{actual:fall,expected});builder.dispose();

const b3=await init();
function world(gravity=true){return new b3.World({gravity:{x:0,y:gravity?-GRAVITY_MM*S:0,z:0},contactHertz:CONTACT_HERTZ,enableSleep:true,enableContinuous:true});}
function ball(w:ReturnType<typeof world>,x:number,y:number,legacy=false){
 const body=w.createBody({type:'dynamic',position:{x:x*S,y:y*S,z:0},angularDamping:0,linearDamping:0});
 if(legacy)body.createSphere({radius:R*S,density:2.5,friction:.22,restitution:.18,rollingResistance:0}).delete();else addMarbleShapes(body,R*S);
 return body;
}
function impact(legacy:boolean){
 const w=world(false),a=ball(w,-40,0,legacy),b=ball(w,0,0,legacy);
 a.setLinearVelocity({x:1000*S,y:0,z:0});
 for(let i=0;i<24;i++)w.step(SOLVER_STEP,PHYSICS_SUBSTEPS);
 const result={incoming:a.getLinearVelocity().x/S,target:b.getLinearVelocity().x/S,mass:a.getMass()};
 a.delete();b.delete();w.destroy();w.delete();return result;
}
const old=impact(true),glass=impact(false);
assert(Math.abs(glass.mass-old.mass)<1e-6,'Contact channels must not double mass');
assert(Math.abs(glass.incoming+glass.target-1000)<2,'Momentum must be conserved');
assert(glass.target>880&&glass.target<980,'Glass should transfer most of the incoming speed');
assert(glass.incoming**2+glass.target**2<=1000**2*1.001,'Impact must not add energy');
console.log('Head-on marble impact (mm/s)',{old,glass});

function roll(material:typeof CARPET|typeof WOOD|typeof PLASTIC|undefined){
 const w=world(),floor=w.createBody({type:'static',position:{x:0,y:-3*S,z:0}});
 floor.createBox({halfExtents:{x:3000*S,y:3*S,z:100*S},...(material??{friction:.5,rollingResistance:0})}).delete();
 const b=ball(w,0,R+.02,!material);b.setLinearVelocity({x:400*S,y:0,z:0});b.setAngularVelocity({x:0,y:0,z:-400/R});
 for(let i=0;i<720;i++)w.step(SOLVER_STEP,PHYSICS_SUBSTEPS);
 const result={distance:b.getPosition().x/S,speed:Math.abs(b.getLinearVelocity().x/S)};
 b.delete();floor.delete();w.destroy();w.delete();return result;
}
const rolls={old:roll(undefined),carpet:roll(CARPET),wood:roll(WOOD),plastic:roll(PLASTIC)};
assert(rolls.carpet.speed<5,'Carpet must stop a rolling marble');
assert(rolls.carpet.distance>50&&rolls.carpet.distance<600,'Carpet must coast before stopping');
assert(rolls.wood.distance>rolls.carpet.distance*2,'Wood must roll farther than carpet');
assert(rolls.plastic.distance>rolls.wood.distance,'Plastic track must retain more rolling speed');
console.log('400 mm/s roll after 3 seconds',rolls);

function rebound(material:typeof CARPET|typeof WOOD|typeof PLASTIC){
 const w=world(),floor=w.createBody({type:'static',position:{x:0,y:-3*S,z:0}});
 floor.createBox({halfExtents:{x:100*S,y:3*S,z:100*S},...material}).delete();
 const b=ball(w,0,R+100);let touched=false,peak=0;
 for(let i=0;i<240;i++){
  w.step(SOLVER_STEP,PHYSICS_SUBSTEPS);
  if(b.getLinearVelocity().y>0)touched=true;
  if(touched)peak=Math.max(peak,b.getPosition().y/S-R);
 }
 b.delete();floor.delete();w.destroy();w.delete();return peak;
}
const bounce={carpet:rebound(CARPET),wood:rebound(WOOD),plastic:rebound(PLASTIC)};
assert(bounce.carpet<1,'Carpet must not inherit glass restitution');
assert(bounce.plastic>1&&bounce.plastic<5,'Plastic should have a modest rebound');
assert(bounce.wood>bounce.plastic&&bounce.wood<12,'Hard floor should rebound more than plastic');
console.log('Rebound from a 100 mm drop (mm)',bounce);
console.log('Physics response checks passed');
