import type { Manifold } from 'manifold-3d';
import { profileEnvelope } from '../src/geometry/surfaces';
import { troughProfiles } from '../src/pieces/marbleworks-spec';

/** Check actual channel clearance on both sides of each connector approach.
 * Circle/track unions must never let the receiver pinch the nominal U section. */
export function auditTrackReceivers(solid:Manifold, ports:readonly {x:number;z:number;direction:number}[],
  floor:(x:number,z:number)=>number) {
  const width=profileEnvelope(troughProfiles({roundedOpening:true}).inner);
  let probes=0,maxNarrowing=0;
  for(const p of ports)for(const distance of [6,8,10,12,14,16,20,24])for(const h of [5.5,8,9.5])for(const side of [-1,1]) {
    const dx=Math.cos(p.direction),dz=Math.sin(p.direction);
    const x=p.x+dx*distance,z=p.z+dz*distance;
    const ex=x-dz*15*side,ez=z+dx*15*side;
    const hits=solid.rayCast([x,floor(x,z)+h,z],[ex,floor(ex,ez)+h,ez]);
    if(!hits.length)throw new Error(`Missing receiver wall at ${x},${z},${h}`);
    const clearance=Math.hypot(hits[0].position[0]-x,hits[0].position[2]-z);
    maxNarrowing=Math.max(maxNarrowing,width(h)-clearance);probes++;
    if(clearance<width(h)-.04)throw new Error(`Receiver pinches ${width(h)-clearance} mm at ${x},${z},${h}`);
  }
  return {receiverClearanceProbes:probes,maxNarrowing};
}
