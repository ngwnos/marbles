import type { Manifold } from 'manifold-3d';
import { CONNECTOR, PART_UNITS } from '../src/pieces/marbleworks-spec';

/** Probe the exposed rear bore through the lower collar and upper C shell. */
export function auditExitBore(solid:Manifold, port:{x:number;z:number;direction:number}) {
  let probes=0,maxRadiusError=0;
  for(const y of [PART_UNITS.insertionDepth+1,20,25,30,35,40,46.5,46.99,47.01,50,55,60,61.8]) {
    for(const offset of [-.6,-.3,0,.3,.6]) {
      const a=port.direction+Math.PI+offset;
      const hits=solid.rayCast([port.x,y,port.z],[port.x+15*Math.cos(a),y,port.z+15*Math.sin(a)]);
      if(!hits.length)throw new Error(`Exit bore has ${hits.length} skins at height ${y}`);
      const radius=Math.hypot(hits[0].position[0]-port.x,hits[0].position[2]-port.z);
      maxRadiusError=Math.max(maxRadiusError,Math.abs(radius-CONNECTOR.boreDiameter/2));
      if(Math.abs(radius-CONNECTOR.boreDiameter/2)>.02)throw new Error(`Exit bore radius ${radius} at height ${y}`);
      probes++;
    }
  }
  return {boreProbes:probes,maxRadiusError};
}
