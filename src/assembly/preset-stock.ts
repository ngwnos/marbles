import baked from '../generated/preset-packs.json';
import type {Preset} from './preset-layout';
import {TUB_PACK_VERSION,type PackedPiece} from './tub-pack';
import {placeTubPieces} from './tub-stock';

const inventory=(pieces:readonly {kind:string}[])=>pieces.map(p=>p.kind).sort().join(',');
const packed=(preset:Preset)=>baked.version===TUB_PACK_VERSION?baked.packs.find(p=>p.presetId===preset.id&&inventory(p.pieces)===inventory(preset.pieces)):undefined;
export const hasPackedPreset=(preset:Preset)=>!!packed(preset);

/** Each load owns its transforms; moving a piece cannot change the saved kit. */
export function createPresetStock(preset:Preset):PackedPiece[]{
 const pack=packed(preset);
 if(!pack)throw new Error('No matching packed layout for '+preset.name);
 return placeTubPieces(pack.pieces as PackedPiece[]);
}
