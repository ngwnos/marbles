export const TUB_PACK_VERSION=2;
export const TUB_PIECE_LIMIT=100;
export type PackedPiece={kind:string;position:[number,number,number];rotation:[number,number,number,number];rotorRotation?:[number,number,number,number]};
export type TubPack={version:number;seed:number;pieces:PackedPiece[];stats:{milliseconds:number;maxPenetration:number;maxDrift:number;maxHeight:number;attempts:number}};
