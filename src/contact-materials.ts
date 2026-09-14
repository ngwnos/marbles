import type {Body} from 'box3d-wasm/standard';

// Shared material response, independent of component identity or whether a
// track is fixed. These are tuning values, not measured material constants.
export const SOLID_FILTER={categoryBits:1,maskBits:1|4|8|16};
export const PLASTIC={friction:.45,restitution:.18,rollingResistance:.0015,filter:SOLID_FILTER};
export const WOOD={friction:.4,restitution:.3,rollingResistance:.003,filter:SOLID_FILTER};
export const CARPET={friction:.65,restitution:.04,rollingResistance:.035,filter:SOLID_FILTER};

export function addMarbleShapes(body:Body,radius:number){
 // Box3D's default restitution mix is max(A,B), and the WASM wrapper has no
 // pair-material callback. Disjoint filters give glass/glass its own response
 // without making carpet bounce like glass. Exactly one shape contacts any
 // other body; only the glass shape contributes mass and angular inertia.
 body.createSphere({radius,density:2.5,friction:.08,restitution:.85,rollingResistance:0,filter:{categoryBits:2,maskBits:2}}).delete();
 // Default friction mixing is sqrt(A*B): preserve the established 0.22
 // glass/plastic pair while giving plastic/plastic its original 0.45 grip.
 body.createSphere({radius,density:0,friction:.22**2/PLASTIC.friction,restitution:0,rollingResistance:0,filter:{categoryBits:4,maskBits:1}}).delete();
}
