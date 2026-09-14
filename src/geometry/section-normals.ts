import * as THREE from 'three/webgpu';
import type {Vec2} from 'manifold-3d';
import type {NormalSource} from './mesh-normals';

/** Preserve planar swept-section normals at Boolean trim vertices. Rounded
 * profile facets still share interpolated normals; straight walls stay planar. */
export function straightSectionNormals(options:{
  direction:number;length:number;floor:(x:number)=>number;
  profiles:Record<string,Vec2[]>;
}):NormalSource[] {
  const slope=options.floor(1)-options.floor(0),planes:NormalSource[]=[];
  const dx=Math.cos(options.direction),dz=Math.sin(options.direction);
    for(const [kind,profile] of Object.entries(options.profiles)) {
      for(let i=0;i<profile.length;i++) {
        const a=profile[i],b=profile[(i+1)%profile.length],dr=b[0]-a[0],dh=b[1]-a[1];
        if(Math.hypot(dr,dh)<.01)continue;
        const n=new THREE.Vector3(dh*dz-slope*dr,dr,-dh*dx).normalize().multiplyScalar(kind==='inner'?1:-1);
        planes.push({boundaryPriority:1,normal:()=>n.clone(),matches:(points,face)=>face.dot(n)>.9999&&points.every(v=>{
          const along=v.x*dx+v.z*dz,across=-v.x*dz+v.z*dx,h=v.y-options.floor(v.x);
          const t=((across-a[0])*dr+(h-a[1])*dh)/(dr*dr+dh*dh);
          return along>=0&&along<=options.length&&t>=-.001&&t<=1.001
            &&Math.abs((across-a[0])*dh-(h-a[1])*dr)/Math.hypot(dr,dh)<.006;
        })});
      }
    }
  return planes;
}
