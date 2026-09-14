import * as THREE from 'three/webgpu';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {encodePreviewMesh} from '../src/geometry/preview-mesh';
export const landingX=108;
async function read(name:string){const a=await Bun.file('src/generated/'+name+'.bin').arrayBuffer(),[nv,ni]=new Uint32Array(a,0,2);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(a,8,nv*3),3));g.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(a,8+nv*12,nv*3),3));g.setIndex(new THREE.BufferAttribute(new Uint32Array(a,8+nv*24,ni),1));return g;}
const j=await read('jump'),l=await read('landing');l.rotateY(Math.PI/2);l.translate(landingX,0,0);const g=mergeGeometries([j,l])!;
await Bun.write('src/generated/jump-run.bin',encodePreviewMesh(g));
const jc=await Bun.file('src/generated/jump-collision.json').json(),lc=await Bun.file('src/generated/landing-collision.json').json();
const vertices=[...jc.vertices],indices=[...jc.indices],offset=vertices.length/3;
for(let i=0;i<lc.vertices.length;i+=3)vertices.push(lc.vertices[i+2]+landingX,lc.vertices[i+1],-lc.vertices[i]);
indices.push(...lc.indices.map((i:number)=>i+offset));
await Bun.write('src/generated/jump-run-collision.json',JSON.stringify({vertices,indices,parts:[jc,{vertices:vertices.slice(jc.vertices.length),indices:lc.indices}]}));g.dispose();j.dispose();l.dispose();console.log({landingX});
