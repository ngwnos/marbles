import {RUG} from './rug-spec';
// Millimeters. Published 18-gallon Roughneck dimensions include the lid;
// the open shell, wall thickness and molded details are fitted to photographs.
const dimensions={
  height:418.75,wall:3.5,bottomRoundover:14,bottomLength:444.5,bottomWidth:273.05,
  topHalfLength:270,topHalfWidth:182.5,cornerRadius:25.4,
  collarOffset:8,rimOffset:8,contactSkin:.15,
} as const;
export const STORAGE_TUB={
  ...dimensions,
  // The upper rim extends farther than the footprint. Leave 30 mm between
  // that widest edge and the rug; the wood floor is below the carpet pile.
  position:[-RUG.width/2-(dimensions.topHalfWidth+dimensions.collarOffset+dimensions.rimOffset)-30,-RUG.thickness+dimensions.contactSkin,60] as [number,number,number],yaw:Math.PI/2,
  color:0x50627f,
} as const;

/** Project a world point into the rounded opening (millimeters). */
export function aboveStorageTub(x:number,z:number,origin:readonly number[]=STORAGE_TUB.position){
 const dx=x-origin[0],dz=z-origin[2],c=Math.cos(STORAGE_TUB.yaw),s=Math.sin(STORAGE_TUB.yaw);
 return insideTubOpening(c*dx-s*dz,s*dx+c*dz);
}

export function insideTubOpening(localX:number,localZ:number){
 const r=45;
 const qx=Math.abs(localX)-(STORAGE_TUB.topHalfLength-STORAGE_TUB.wall-r);
 const qz=Math.abs(localZ)-(STORAGE_TUB.topHalfWidth-STORAGE_TUB.wall-r);
 return Math.hypot(Math.max(qx,0),Math.max(qz,0))+Math.min(Math.max(qx,qz),0)<=r;
}

/** Outward sidewall slope, before the upper collar. */
export const tubWallDraft={
 x:(STORAGE_TUB.topHalfLength-(STORAGE_TUB.bottomLength/2+STORAGE_TUB.bottomRoundover-STORAGE_TUB.wall/2))/(STORAGE_TUB.height-8-STORAGE_TUB.bottomRoundover),
 z:(STORAGE_TUB.topHalfWidth-(STORAGE_TUB.bottomWidth/2+STORAGE_TUB.bottomRoundover-STORAGE_TUB.wall/2))/(STORAGE_TUB.height-8-STORAGE_TUB.bottomRoundover),
};
