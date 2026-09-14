import {PART_BY_ID} from './catalog';
import {compatible,worldPort,type Placed,type Connection} from './snapping';

export type Preset={id:string;name:string;pieces:Placed[];connections:Connection[]};
export function connect(pieces:Placed[]):Connection[]{
 const result:Connection[]=[];
 for(let i=0;i<pieces.length;i++)for(let j=i+1;j<pieces.length;j++){
  const a=pieces[i],b=pieces[j];
  for(const ap of PART_BY_ID[a.kind].ports)for(const bp of PART_BY_ID[b.kind].ports)
   if(compatible(ap,bp)&&worldPort(ap,a.pose).every((v,k)=>Math.abs(v-worldPort(bp,b.pose)[k])<.001))
    result.push({a:a.id,ap:ap.id,b:b.id,bp:bp.id});
 }
 return result;
}
