import assert from 'node:assert/strict';
import {PART_BY_ID} from '../src/assembly/catalog';
import {inputColumns} from '../src/assembly/drop';
import type {Preset} from '../src/assembly/presets';

/** Follow actual outlets through connected columns, including through the
 * open outlet tubes of supporting tracks, until a running inlet is reached. */
export function marbleRoutes(preset:Preset):number[][]{
 const pieces=new Map(preset.pieces.map(p=>[p.id,p]));
 const descend=(id:number,port:string,path:number[]):number[][]=>{
  assert(path.length<=preset.pieces.length,'Cyclic marble route');
  const link=preset.connections.find(c=>c.a===id&&c.ap===port||c.b===id&&c.bp===port);
  assert(link,`Open discharge at ${id}:${port}`);
  const next=pieces.get(link.a===id?link.b:link.a)!,entry=link.a===id?link.bp:link.ap;
  assert(entry.endsWith('-above'),'Outlet does not enter a lower column');
  if(!inputColumns(next.kind).some(c=>c.port.id===entry))return descend(next.id,entry.replace('-above','-below'),path);
  const route=[...path,next.id];
  if(next.kind==='finish')return [route];
  const inlets=new Set(inputColumns(next.kind).map(c=>c.port.id.replace('-above','-below')));
  const exits=PART_BY_ID[next.kind].ports.filter(p=>p.axis===-1&&!inlets.has(p.id));
  assert(exits.length,`Route ends at ${next.kind} ${next.id}`);
  return exits.flatMap(p=>descend(next.id,p.id,route));
 };
 const gates=preset.pieces.filter(p=>p.kind==='start');assert.equal(gates.length,1,'Preset needs one starting gate');
 assert.equal(preset.pieces.filter(p=>p.kind==='finish').length,1,'Preset needs one finish');
 return descend(gates[0].id,'0-below',[]);
}
