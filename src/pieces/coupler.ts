import type {ManifoldToplevel,Vec2} from 'manifold-3d';
import {CONNECTOR,PART_UNITS,outerPostProfile} from './marbleworks-spec';
import {finishSolid} from '../geometry/finish-solid';
import {angleWeightedNormals,cylinderNormals} from '../geometry/mesh-normals';
import {solidToGeometry} from './solid-geometry';
export function buildCouplerSolid(k:ManifoldToplevel){
 const shoulder=PART_UNITS.stackRise,tip=outerPostProfile().filter(([r,y])=>r>0&&y>=shoulder),body=outerPostProfile().filter(([r,y])=>r>0&&y>0);
 const profile:Vec2[]=[[0,-PART_UNITS.insertionDepth],...tip.slice().reverse().map(([r,y]):Vec2=>[r,shoulder-y]),[13.3,0],...body,[0,CONNECTOR.postHeight]];
 const section=new k.CrossSection(profile),raw=section.revolve(256),outside=raw.rotate([-90,0,0]);section.delete();raw.delete();
 const core=k.Manifold.cylinder(100,10.5,10.5,256).rotate([-90,0,0]).translate([0,-20,0]);
 const cutters=[core];
 for(const top of [false,true]){
  const y=top?CONNECTOR.postHeight-24:-PART_UNITS.insertionDepth+24;
  const box=k.Manifold.cube([40,26,2.5]).translate([-20,top?y:y-26,-1.25]);
  const end=k.Manifold.cylinder(40,1.25,1.25,48).rotate([0,90,0]).translate([-20,y,0]);cutters.push(box,end);
 }
 const holes=k.Manifold.union(cutters),solid=outside.subtract(holes);outside.delete();holes.delete();cutters.forEach(s=>s.delete());return finishSolid(k,solid);
}
export function couplerGeometry(s:import('manifold-3d').Manifold){return angleWeightedNormals(solidToGeometry(s),[13.5,10.5,12].map(radius=>cylinderNormals({x:0,z:0,radius,inward:radius===10.5,tolerance:.005,minY:-15,maxY:62})));}
