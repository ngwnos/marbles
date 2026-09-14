import {connectorNormals} from './connector-normals';
import type {ManifoldToplevel,Vec2} from 'manifold-3d';
import {buildDrainTray,drainFloor} from './drain-tray';
import {roundedExtrusion} from '../geometry/rounded-extrusion';
import {finishSolid} from '../geometry/finish-solid';
import {heightSurfaceNormals,angleWeightedNormals} from '../geometry/mesh-normals';
import {solidToGeometry} from './solid-geometry';
export const START={radius:55,back:150,pivotX:-112,pivotY:98,lanePitch:18,lanes:6,releaseAngle:-.72};
export const startDeck=(x:number)=>x<0?-.1*x:.45*x;
const deckSections:Vec2[][]=[[[ -52,3.7],[0,-1.5],[0,0],[-52,5.2]],[[0,-1.5],[22,8.4],[22,9.9],[0,0]]];
const dividerSections:Vec2[][]=[[[ -28,2.8],[0,0],[0,12],[-28,14.8]],[[0,0],[22,9.9],[22,21.9],[0,12]]];
export function buildStartBody(k:ManifoldToplevel){
 const tray=buildDrainTray(k,{radius:START.radius,back:START.back,bumps:true}),parts=[tray];
 for(const sign of [-1,1]){
  const profile=new k.CrossSection([[-119,68],[-105,68],[-105,98],[-106,102],[-110,105],[-114,105],[-118,102]]);
  const rounded=profile.offset(-1,'Round',2,32),section=rounded.offset(1,'Round',2,32);
  const raw=roundedExtrusion(k,section,2,.45),tab=raw.translate([0,0,sign*56.5]);parts.push(tab);
  profile.delete();rounded.delete();section.delete();raw.delete();
 }
 const combined=k.Manifold.union(parts);parts.forEach(s=>s.delete());
 const bore=k.Manifold.cylinder(120,1.85,1.85,64).translate([START.pivotX,START.pivotY,-60]);
 const body=combined.subtract(bore);combined.delete();bore.delete();return finishSolid(k,body);
}
export function startRotorHulls(){
 const hulls:number[][]=[];
 const add=(section:Vec2[],depth:number,z:number)=>hulls.push([-depth/2,depth/2].flatMap(d=>section.flatMap(([x,y])=>[x,y,z+d])));
 for(const section of deckSections)add(section,109.5,0);
 for(let i=0;i<=START.lanes;i++)for(const section of dividerSections)add(section,1.5,(i-3)*18);
 hulls.push([-58,58].flatMap(z=>Array.from({length:32},(_,i)=>[1.5*Math.cos(i*Math.PI/16),1.5*Math.sin(i*Math.PI/16),z]).flat()));return hulls;
}
export function buildStartRotor(k:ManifoldToplevel){
 const parts:import('manifold-3d').Manifold[]=[];
 const add=(points:Vec2[],width:number,z:number)=>{const s=new k.CrossSection(points),solid=roundedExtrusion(k,s,width,.3);parts.push(solid.translate([0,0,z]));solid.delete();s.delete();};
 // The V-shaped deck and dividers are each continuous across their crease.
 add([[-52,3.7],[0,-1.5],[22,8.4],[22,9.9],[0,0],[-52,5.2]],109.5,0);
 for(let i=0;i<=START.lanes;i++)add([[-28,2.8],[0,0],[22,9.9],[22,21.9],[0,12],[-28,14.8]],1.5,(i-3)*18);
 parts.push(k.Manifold.cylinder(116,1.5,1.5,64).translate([0,0,-58]));
 const solid=k.Manifold.union(parts);parts.forEach(p=>p.delete());return finishSolid(k,solid);
}
export function startGeometry(s:import('manifold-3d').Manifold){return applyStartGeometryNormals(solidToGeometry(s));}
export function applyStartGeometryNormals(geometry:import('three/webgpu').BufferGeometry){
 const floor=(x:number,z:number)=>drainFloor(x,z,{radius:START.radius,back:START.back,bumps:true});
 return angleWeightedNormals(geometry,[heightSurfaceNormals(floor),heightSurfaceNormals(floor,-1.5,-1),...connectorNormals(0)]);
}
