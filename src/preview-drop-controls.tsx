import {useEffect,useMemo,useState} from 'react';
import type * as THREE from 'three/webgpu';
import {createPreviewPhysics,DROP_PORTS,type ComponentKind} from './preview-physics';

export function usePreviewDropTest(kind:ComponentKind){
 const [status,setStatus]=useState('Loading physics…');
 const controller=useMemo(()=>{
  let physics:Awaited<ReturnType<typeof createPreviewPhysics>>|undefined,disposed=false;
  return {
   async attach(root:THREE.Object3D,scene:THREE.Scene){
    try{const created=await createPreviewPhysics(root,kind);if(disposed){created.dispose();return;}
     physics=created;scene.add(created.group);setStatus('');
    }catch(error){setStatus(`Physics failed: ${String(error)}`);console.error(error);}
   },
   update(time:number){physics?.update(time);},
   fill(){physics?.fill();},release(){physics?.release();},
   drop(port:number){physics?.drop(port);},reset(){physics?.reset();},
   dispose(){disposed=true;physics?.dispose();physics=undefined;},
  };
 },[kind]);
 useEffect(()=>()=>controller.dispose(),[controller]);
 const buttons=<>{kind==='start'&&<button disabled={!!status} onClick={()=>controller.fill()}>Fill all slots</button>}{DROP_PORTS[kind].map((_,i)=><button key={`drop-${i}`} disabled={!!status} onClick={()=>controller.drop(i)} title="Drop a 15.9 mm marble under gravity">Drop marble{DROP_PORTS[kind].length>1?` ${i+1}`:''}</button>)}{kind==='start'&&<button disabled={!!status} onClick={()=>controller.release()}>Release</button>}<button disabled={!!status} onClick={()=>controller.reset()}>Reset</button>{status&&<span role="status">{status}</span>}</>;
 return {controller,buttons};
}
