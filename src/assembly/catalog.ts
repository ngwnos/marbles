import alignment from '../generated/component-alignment.json';
import {PART_UNITS} from '../pieces/marbleworks-spec';
import {PIECE_COLORS} from './piece-colors';
export type V3=[number,number,number];
export type Port={id:string;position:V3;gender:'male'|'female';axis:1|-1};
export type PartDefinition={id:string;name:string;color:number;ports:Port[]};
const names=[['base','Support base'],['spacer','Spacer'],['ramp','Standard ramp'],['snake','Snake ramp'],['funnel','Funnel ramp'],['intersection','Intersection'],['split','Split track'],['maze','Maze ramp'],['bumper','Zigzag ramp'],['paddle','Paddle wheel'],['hairpin','U-turn'],['passing','Passing lane'],['jump','Jump chute'],['landing','Landing ramp'],['finish','Finish lane'],['start','Starting gate'],['starter-funnel','Starter funnel'],['coil','Coil ramp'],['extension','Extension tube'],['coupler','Double connector']];
export const PARTS:PartDefinition[]=names.map(([id,name],i)=>{
 const alias=id==='ramp'?'standard ramp':id==='starter-funnel'?'starter funnel':id;
 const ports:Port[]=alignment.ports.filter(p=>p.piece===alias).flatMap((p,i)=>p.fits.map(f=>({
  id:`${i}-${f.side}`,position:[p.port[0],f.side==='above'?p.shoulder!:p.bottom,p.port[1]] as V3,
  gender:f.side==='above'?'male' as const:'female' as const,axis:f.side==='above'?1 as const:-1 as const,
 })));
 if(id==='extension')ports.push({id:'bottom',position:[0,0,0],gender:'female',axis:-1},{id:'top',position:[0,6*PART_UNITS.stackRise,0],gender:'female',axis:1});
 if(id==='coupler')ports.push({id:'bottom',position:[0,0,0],gender:'male',axis:-1},{id:'top',position:[0,PART_UNITS.stackRise,0],gender:'male',axis:1});
 return {id,name,ports,color:id==='paddle'?0xf1bf00:PIECE_COLORS[i%PIECE_COLORS.length]};
});
export const PART_BY_ID=Object.fromEntries(PARTS.map(p=>[p.id,p]));
