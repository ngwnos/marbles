import * as T from 'three/webgpu';
import {EXRLoader} from 'three/addons/loaders/EXRLoader.js';
import {equirectUV,positionWorld,texture,vec3} from 'three/tsl';
import {RUG} from './rug-spec';

export async function loadEnvironment(renderer:T.WebGPURenderer){
 // Keep the linear HDR source for the background; prefilter a separate map
 // for roughness-dependent lighting and reflections on physical materials.
 const source=await new EXRLoader().setDataType(T.HalfFloatType).loadAsync('/environments/lebombo_4k.exr');
 source.mapping=T.EquirectangularReflectionMapping;
 const generator=new T.PMREMGenerator(renderer);
 const filtered=generator.fromEquirectangular(source);
 generator.dispose();
 // Estimated capture height in millimeters, not a measured property of Lebombo.
 // The flattened panorama floor shares the physical floor below the rug.
 const captureHeight=1500;
 // Project from the capture point onto a room enclosure. Unlike a grounded
 // sphere, its floor is exactly planar all the way to the vertical walls.
 // Floor-wall lines fitted from pairs of pixels in the 1520x760 source
 // panorama. Recover each point by intersecting its ray with the floor,
 // then intersect adjacent wall lines. This preserves the room's rotation
 // and unequal wall distances instead of assuming an axis-aligned square.
 const wallSamples=[[[310,484],[460,504]],[[760,514],[960,515]],[[1210,494],[1360,481]],[[1460,469],[60,491]]];
 const walls=wallSamples.map(pair=>{
  const points=pair.map(([u,v])=>{const angle=(u/1520-.5)*Math.PI*2,r=captureHeight/Math.tan((v/760-.5)*Math.PI);return new T.Vector2(r*Math.cos(angle),r*Math.sin(angle));});
  const normal=new T.Vector2(points[1].y-points[0].y,points[0].x-points[1].x).normalize();
  return {normal,d:normal.dot(points[0])};
 });
 const corners=walls.map((a,i)=>{const b=walls[(i+1)%walls.length],det=a.normal.x*b.normal.y-a.normal.y*b.normal.x;return new T.Vector2((a.d*b.normal.y-a.normal.y*b.d)/det,(a.normal.x*b.d-a.d*b.normal.x)/det);});
 const vertices:number[]=[],indices:number[]=[];
 const floorY=-RUG.thickness,ceilingY=3000-RUG.thickness;
 for(const y of [floorY,ceilingY])for(const p of corners)vertices.push(p.x,y,p.y);
 indices.push(0,1,2,0,2,3,4,6,5,4,7,6);
 for(let i=0;i<4;i++){const j=(i+1)%4;indices.push(i,j+4,j,i,i+4,j+4);}
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);
 const background=new T.Mesh(geometry,new T.MeshBasicNodeMaterial({side:T.BackSide,depthWrite:false}));
 const direction=positionWorld.sub(vec3(0,captureHeight-RUG.thickness,0)).normalize();
 background.material.colorNode=texture(source,equirectUV(direction));
 background.name='Ground-projected Lebombo';
 background.renderOrder=-100;
 return {source,background,lighting:filtered.texture,dispose(){background.geometry.dispose();background.material.dispose();filtered.dispose();source.dispose();}};
}
