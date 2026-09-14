import assert from 'node:assert/strict';
import {BoxGeometry,Color,InstancedMesh,Matrix4,MeshBasicMaterial,Quaternion,Vector3} from 'three/webgpu';
import {createInstanceBuffer} from '../src/assembly/instance-buffer';

const mesh=new InstancedMesh(new BoxGeometry(),new MeshBasicMaterial(),8);
mesh.setColorAt(0,new Color());
const writer=createInstanceBuffer(mesh),rotation=new Quaternion(),color=new Color(0x267acb),unit=new Vector3(1,1,1);
const positions=[new Vector3(1,2,3),new Vector3(4,5,6),new Vector3(7,8,9)];
const write=()=>{writer.begin();for(const p of positions)writer.write(p,rotation,color);writer.end();};
write();mesh.instanceMatrix.clearUpdateRanges();mesh.instanceColor!.clearUpdateRanges();
const initial=[mesh.instanceMatrix.version,mesh.instanceColor!.version];
mesh.computeBoundingSphere();const bounds=mesh.boundingSphere;
write();assert.deepEqual([mesh.instanceMatrix.version,mesh.instanceColor!.version],initial);assert.equal(mesh.boundingSphere,bounds,'Unchanged bounds were invalidated');
positions[1].x=50;write();assert.deepEqual(mesh.instanceMatrix.updateRanges,[{start:16,count:16}]);assert.equal(mesh.instanceColor!.version,initial[1]);assert.equal(mesh.boundingSphere,null);
// Another frame before rendering (e.g. culled): both pending edits must upload.
positions[2].z=80;write();assert.deepEqual(mesh.instanceMatrix.updateRanges,[{start:16,count:32}]);
for(let i=0;i<positions.length;i++){const matrix=new Matrix4();mesh.getMatrixAt(i,matrix);assert.deepEqual(matrix.elements,new Matrix4().compose(positions[i],rotation,unit).elements);}
mesh.instanceMatrix.clearUpdateRanges();const moved=mesh.instanceMatrix.version;
color.setHex(0xff4500);write();assert.equal(mesh.instanceMatrix.version,moved);assert.deepEqual(mesh.instanceColor!.updateRanges,[{start:0,count:9}]);
// Compaction and re-expansion reuse slots, preserving transforms and colors.
positions.shift();write();assert.equal(mesh.count,2);mesh.computeBoundingSphere();assert(mesh.boundingSphere!.containsPoint(positions[1]));
positions.push(new Vector3(-100,20,1));write();assert.equal(mesh.count,3);mesh.computeBoundingSphere();assert(mesh.boundingSphere!.containsPoint(positions[2]));
writer.begin();writer.end();assert.equal(mesh.count,0);assert.equal(mesh.boundingSphere,null);
mesh.geometry.dispose();(mesh.material as MeshBasicMaterial).dispose();mesh.dispose();
console.log('Instance uploads: sleeping, motion, color, culled edits, compaction and bounds passed');
