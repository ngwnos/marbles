import * as T from 'three/webgpu';
import {normalMap,positionWorld,texture,vec2} from 'three/tsl';
import {RUG} from './rug-spec';

// One deterministic 32 mm patch of short pile. Height derivatives produce
// tangent normals; the town artwork never contributes to height or roughness.
function pileTexture(){
 const size=256, height=new Float32Array(size*size);let seed=19381;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<6500;i++){
  const x=random()*size,y=random()*size,a=random()*Math.PI*2;
  const length=2+random()*5,strength=.3+random()*.7;
  for(let s=-length;s<=length;s+=.6)for(let w=-2;w<=2;w++){
   const px=(Math.round(x+Math.cos(a)*s-Math.sin(a)*w)+size)%size;
   const py=(Math.round(y+Math.sin(a)*s+Math.cos(a)*w)+size)%size;
   height[py*size+px]+=strength*Math.exp(-w*w/1.4-s*s/(length*length));
  }
 }
 const data=new Uint8Array(size*size*4);
 const at=(x:number,y:number)=>height[((y+size)%size)*size+(x+size)%size];
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const dx=(at(x+1,y)-at(x-1,y))*.24,dy=(at(x,y+1)-at(x,y-1))*.24;
  const n=new T.Vector3(-dx,-dy,1).normalize(),i=(y*size+x)*4;
  data[i]=(n.x*.5+.5)*255;data[i+1]=(n.y*.5+.5)*255;data[i+2]=(n.z*.5+.5)*255;
  data[i+3]=Math.min(255,215+at(x,y)*5);
 }
 const map=new T.DataTexture(data,size,size);map.wrapS=map.wrapT=T.RepeatWrapping;
 map.magFilter=T.LinearFilter;map.minFilter=T.LinearMipmapLinearFilter;
 map.generateMipmaps=true;map.needsUpdate=true;return map;
}

export async function createRug(anisotropy:number){
 const print=await new T.TextureLoader().loadAsync('/textures/city-life-rug.jpg');
 print.colorSpace=T.SRGBColorSpace;print.anisotropy=anisotropy;
 // Inside the photographed binding. Avoid resampling/compressing the source.
 print.offset.set(310/3000,180/2143);print.repeat.set(2420/3000,1780/2143);
 const pile=pileTexture();pile.anisotropy=anisotropy;
 const pileUV=vec2(positionWorld.x,positionWorld.z.negate()).div(32);
 const fibers=texture(pile,pileUV);
 const material=new T.MeshPhysicalNodeMaterial({map:print,roughness:.92,metalness:0,sheen:.28,sheenColor:0xc8cfb2,sheenRoughness:.95});
 material.normalNode=normalMap(fibers.xyz,vec2(.32));
 material.roughnessNode=fibers.a.mul(.14).add(.84);
 const group=new T.Group();group.name='City carpet';
 const outline=new T.Shape(),hw=RUG.width/2,hd=RUG.depth/2,corner=7;
 outline.moveTo(-hw+corner,-hd);outline.lineTo(hw-corner,-hd);
 outline.quadraticCurveTo(hw,-hd,hw,-hd+corner);outline.lineTo(hw,hd-corner);
 outline.quadraticCurveTo(hw,hd,hw-corner,hd);outline.lineTo(-hw+corner,hd);
 outline.quadraticCurveTo(-hw,hd,-hw,hd-corner);outline.lineTo(-hw,-hd+corner);
 outline.quadraticCurveTo(-hw,-hd,-hw+corner,-hd);
 const top=new T.ShapeGeometry(outline,12),positions=top.getAttribute('position'),uvs=top.getAttribute('uv');
 for(let i=0;i<positions.count;i++)uvs.setXY(i,(positions.getX(i)+hw)/RUG.width,(positions.getY(i)+hd)/RUG.depth);
 const surface=new T.Mesh(top,material);
 surface.rotation.x=-Math.PI/2;surface.receiveShadow=true;group.add(surface);
 const edgeMaterial=new T.MeshPhysicalNodeMaterial({color:0x53652e,roughness:.94,sheen:.25,sheenRoughness:.9});
 const backing=new T.Mesh(new T.ExtrudeGeometry(outline,{depth:RUG.thickness-2,bevelEnabled:false,curveSegments:12}),edgeMaterial);
 backing.rotation.x=-Math.PI/2;backing.position.y=-RUG.thickness;backing.receiveShadow=true;group.add(backing);
 // A continuous rounded binding, including the corners, instead of four
 // intersecting cylinders. Its crown meets the pile surface.
 const points:T.Vector3[]=[],r=7;
 for(const [cx,cz,start] of [[RUG.width/2-r,RUG.depth/2-r,0],[-RUG.width/2+r,RUG.depth/2-r,Math.PI/2],[-RUG.width/2+r,-RUG.depth/2+r,Math.PI],[RUG.width/2-r,-RUG.depth/2+r,Math.PI*1.5]]){
  for(let i=0;i<=12;i++){const a=start+i/12*Math.PI/2;points.push(new T.Vector3(cx+Math.cos(a)*r,-2,cz+Math.sin(a)*r));}
 }
 const curve=new T.CurvePath<T.Vector3>();for(let i=0;i<points.length;i++)curve.add(new T.LineCurve3(points[i],points[(i+1)%points.length]));
 const binding=new T.Mesh(new T.TubeGeometry(curve,1200,RUG.bindingRadius,8,true),edgeMaterial);binding.receiveShadow=true;group.add(binding);
 return {group,dispose(){group.traverse(o=>{if(o instanceof T.Mesh)o.geometry.dispose();});material.dispose();edgeMaterial.dispose();print.dispose();pile.dispose();}};
}
