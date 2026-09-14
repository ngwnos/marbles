import type {Manifold,ManifoldToplevel,MeshOptions} from 'manifold-3d';
import {regularizeMesh} from '../pieces/regularize-mesh';
import {collapseShortEdges} from './collapse-short-edges';

/** Remove numerical Boolean fragments without changing designed fillets.
 * Consumes its input. Significant detached material is an error, never hidden. */
export function finishSolid(k:ManifoldToplevel,source:Manifold){
 const original=source.asOriginal();source.delete();
 const grid=original.warp(v=>{for(let i=0;i<3;i++)v[i]=Math.round(v[i]*1000)/1000;});original.delete();
 const simple=grid.simplify(.012);grid.delete();
 let mesh:MeshOptions=regularizeMesh(simple.getMesh()).mesh;simple.delete();
 for(let i=0;i<5;i++)mesh=collapseShortEdges(mesh,.008);
 const solid=new k.Manifold(new k.Mesh({...mesh,tolerance:.001}));
 const parts=solid.decompose().sort((a,b)=>b.volume()-a.volume());solid.delete();
 if(parts.slice(1).some(p=>Math.abs(p.volume())>1e-4)){const volumes=parts.map(p=>p.volume());parts.forEach(p=>p.delete());throw new Error(`Detached material after solid cleanup: ${volumes}`);}
 parts.slice(1).forEach(p=>p.delete());
 const unified=parts[0].asOriginal();parts[0].delete();
 const final=unified.simplify(.003);unified.delete();
 const repaired=new k.Manifold(new k.Mesh(collapseShortEdges(final.getMesh(),.012)));final.delete();
 const remaining=repaired.decompose().sort((a,b)=>b.volume()-a.volume());repaired.delete();
 if(remaining.slice(1).some(p=>Math.abs(p.volume())>1e-4)){remaining.forEach(p=>p.delete());throw new Error('Edge repair detached material');}
 remaining.slice(1).forEach(p=>p.delete());return remaining[0];
}
