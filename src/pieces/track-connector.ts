import * as THREE from 'three/webgpu';
import type { Manifold, ManifoldToplevel, Vec2 } from 'manifold-3d';
import { profileEnvelope } from '../geometry/surfaces';
import { arc, CONNECTOR, PART_UNITS, TRACK, troughProfiles, outerPostProfile, socketCoreProfile } from './marbleworks-spec';
import { buildCollarMouth } from './connector-mouth';
import { buildCSpigot, buildCSpigotSeat } from './c-connector';

/** Reserve space for the complete receiver runout, including the uphill rim. */
export function connectorLandingFloor(slopeMagnitude:number, overhang=CONNECTOR.postDiameter/2) {
  return CONNECTOR.shoulderHeight-(TRACK.channelDepth+1)-slopeMagnitude*overhang-.05;
}

/** Bend the socket ceiling with its track, keeping the insertion band fixed.
 * The supplied core's top must start at floor(x,z) - CONNECTOR.wall. */
export function followSocketFloor(socket:Manifold,options:{x:number;z:number;floor:(x:number,z:number)=>number;bottom?:number}){
  const {x,z,floor,bottom=0}=options;
  const roof=floor(x,z)-CONNECTOR.wall,base=bottom+PART_UNITS.insertionDepth+.4;
  const refined=socket.refineToLength(2);
  const shaped=refined.warp(v=>{v[1]+=(floor(v[0],v[2])-floor(x,z))*THREE.MathUtils.clamp((v[1]-base)/(roof-base),0,1);});
  refined.delete();return shaped;
}

/** The reviewed S-ramp receiver profile, shared by every track connector. */
export const receivingCupProfile: Vec2[] = [[0, 0],
  ...troughProfiles({ roundedOpening: true }).inner.filter(([r,h]) => r >= 4 && h <= TRACK.channelDepth),
  ...arc(10.75,TRACK.channelDepth,.75,Math.PI,Math.atan2(.6,-.45)),
  ...Array.from({length:25},(_,i):Vec2=>{
    const t=(i+1)/25;
    return [(2*t*t*t-3*t*t+1)*10.3+(t*t*t-2*t*t+t)*(4/3)*.4+(-2*t*t*t+3*t*t)*10.5,TRACK.channelDepth+.6+.4*t];
  }),[10.5,100],[0,100]];
export const receivingCupRadius = profileEnvelope(receivingCupProfile);

/** One radial receiver core; the part supplies only its channel boundary. */
export function buildReceivingCore(kernel:ManifoldToplevel, options:{
  x:number; z:number; direction:number; floor:(x:number,z:number)=>number;
  radius:(height:number,y:number,angle:number)=>number;
}) {
  const heights=[...new Set([0,TRACK.channelDepth+.75,...Array.from({length:Math.ceil((TRACK.channelDepth+.75)*10)},(_,i)=>i/10),
    ...troughProfiles({roundedOpening:true}).inner.map(p=>p[1]).filter(h=>h>=0&&h<=TRACK.channelDepth+.75)]
    .map(h=>Math.round(h*1e6)/1e6))].sort((a,b)=>a-b);
  const steps=512,vertices:number[]=[],faces:number[]=[];
  for(const h of heights) for(let i=0;i<steps;i++) {
    const angle=i*2*Math.PI/steps, r=options.radius(h,options.floor(options.x,options.z)+h,angle);
    const x=options.x+r*Math.cos(angle+options.direction),z=options.z+r*Math.sin(angle+options.direction);
    vertices.push(x,options.floor(x,z)+h,z);
  }
  for(let j=0;j<heights.length-1;j++)for(let i=0;i<steps;i++) {
    const a=j*steps+i,b=j*steps+(i+1)%steps;
    faces.push(a,a+steps,b+steps,a,b+steps,b);
  }
  for(const j of [0,heights.length-1]) {
    const center=vertices.length/3;vertices.push(options.x,options.floor(options.x,options.z)+heights[j],options.z);
    for(let i=0;i<steps;i++){const a=j*steps+i,b=j*steps+(i+1)%steps;faces.push(...(j===0?[center,a,b]:[center,b,a]));}
  }
  return new kernel.Manifold(new kernel.Mesh({numProp:3,vertProperties:new Float32Array(vertices),triVerts:new Uint32Array(faces)}));
}

/** Complete vertical receiver. Bodies are unioned before cores are subtracted;
 * the spigot is installed after trimming the result at the seating plane. */
export function buildTrackConnector(kernel:ManifoldToplevel, options:{
  x:number;z:number;direction:number;outlet:boolean;floor:(x:number,z:number)=>number;
  ends?:readonly [number,number];
  /** The supplied track core already contains its rounded receiving floor. */
  integratedReceiver?:boolean;
  conformSocketRoof?:boolean;
  channelBoundary?:(height:number,angle:number)=>number;
}) {
  const {x,z,direction,floor,outlet}=options;
  const garbage:{delete():void}[]=[];
  const keep=<T extends {delete():void}>(v:T):T=>{garbage.push(v);return v;};
  const lathe=(profile:Vec2[])=>keep(keep(keep(keep(new kernel.CrossSection(profile)).revolve(192)).rotate([-90,0,0])).translate([x,0,z]));
  const width=profileEnvelope(troughProfiles({roundedOpening:true}).inner);
  const half=Math.asin((TRACK.channelInsideWidth+CONNECTOR.wall)/(CONNECTOR.maleDiameter-CONNECTOR.wall));
  const ends=options.ends??[-half,half];
  const dx=Math.cos(direction),dz=Math.sin(direction);
  const mouth=(innerOnly:boolean)=>{
    const local=keep(buildCollarMouth(kernel,0,0,u=>floor(x+u*dx,z+u*dz),10.5,ends,innerOnly));
    const turned=keep(keep(local.rotate([0,-direction*180/Math.PI,0])).translate([x,0,z]));
    return keep(turned.warp(v=>{
      const u=(v[0]-x)*dx+(v[2]-z)*dz;
      if(v[1]<CONNECTOR.postHeight+1) v[1]+=floor(v[0],v[2])-floor(x+u*dx,z+u*dz);
    }));
  };
  const body=keep(lathe(outerPostProfile()).subtract(mouth(false)));
  let socket=lathe(socketCoreProfile(outlet?CONNECTOR.postHeight+1:floor(x,z)-CONNECTOR.wall, PART_UNITS.insertionDepth));
  if(!outlet&&options.conformSocketRoof){
    socket=keep(followSocketFloor(socket,{x,z,floor}));
  }
  const cores:Manifold[]=[mouth(true),socket];
  if(!outlet)cores.push(keep(lathe(receivingCupProfile).warp(v=>{v[1]+=floor(v[0],v[2]);})));
  if(!options.integratedReceiver) cores.push(keep(buildReceivingCore(kernel,{x,z,direction,floor,radius:(h,_y,a)=>{
    const cup=outlet?CONNECTOR.boreDiameter/2:receivingCupRadius(h);
    if(Math.cos(a)<0)return cup;
    const boundary=options.channelBoundary?.(h,a)??width(h)/Math.max(1e-9,Math.abs(Math.sin(a)));
    const blend=.8*THREE.MathUtils.smoothstep(h,0,1)*THREE.MathUtils.smoothstep(Math.cos(a),0,.2);
    const overlap=Math.max(0,blend-Math.abs(cup-boundary));
    const joined=Math.min(13.4,Math.max(cup,boundary)+(blend>0?overlap*overlap/(4*blend):0));
    return THREE.MathUtils.lerp(joined,cup,THREE.MathUtils.smoothstep(h,TRACK.channelDepth-2.25,TRACK.channelDepth+.75));
  }})));
  const spigot=keep(keep(buildCSpigot(kernel,x,direction+(ends[0]+ends[1])/2,ends[1]-ends[0],false)).translate([0,0,z]));
  const seat=keep(buildCSpigotSeat(spigot));
  return {body,cores,spigot,seat,opening:ends[1]-ends[0],dispose(){garbage.reverse().forEach(v=>v.delete());}};
}
