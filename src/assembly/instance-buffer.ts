import {Color,InstancedMesh,Matrix4,Quaternion,Vector3,type BufferAttribute} from 'three/webgpu';

/** Retain unchanged GPU data, including while a batch is outside the view. */
export function createInstanceBuffer(mesh:InstancedMesh){
 const capacity=mesh.instanceMatrix.count;
 const poses=new Float64Array(capacity*7).fill(NaN),colors=new Float64Array(capacity*3).fill(NaN);
 const matrix=new Matrix4(),scale=new Vector3(1,1,1);
 let count=0,matrixStart=Infinity,matrixEnd=0,colorStart=Infinity,colorEnd=0;
 const upload=(attribute:BufferAttribute,start:number,end:number)=>{
  if(start===Infinity)return;
  // A culled batch may have unsubmitted edits from earlier frames.
  for(const range of attribute.updateRanges){start=Math.min(start,range.start);end=Math.max(end,range.start+range.count);}
  attribute.clearUpdateRanges();attribute.addUpdateRange(start,end-start);attribute.needsUpdate=true;
 };
 return {
  begin(){count=0;matrixStart=colorStart=Infinity;matrixEnd=colorEnd=0;},
  write(position:Vector3,rotation:Quaternion,color:Color){
   if(count>=capacity)throw new Error('Instance capacity exceeded');
   const slot=count++,p=slot*7,c=slot*3;
   if(poses[p]!==position.x||poses[p+1]!==position.y||poses[p+2]!==position.z||poses[p+3]!==rotation.x||poses[p+4]!==rotation.y||poses[p+5]!==rotation.z||poses[p+6]!==rotation.w){
    poses[p]=position.x;poses[p+1]=position.y;poses[p+2]=position.z;poses[p+3]=rotation.x;poses[p+4]=rotation.y;poses[p+5]=rotation.z;poses[p+6]=rotation.w;
    mesh.setMatrixAt(slot,matrix.compose(position,rotation,scale));matrixStart=Math.min(matrixStart,slot*16);matrixEnd=(slot+1)*16;
   }
   if(colors[c]!==color.r||colors[c+1]!==color.g||colors[c+2]!==color.b){
    colors[c]=color.r;colors[c+1]=color.g;colors[c+2]=color.b;
    mesh.setColorAt(slot,color);colorStart=Math.min(colorStart,c);colorEnd=c+3;
   }
   return slot;
  },
  end(){
   if(mesh.count!==count||matrixStart!==Infinity){mesh.boundingSphere=null;mesh.boundingBox=null;}
   mesh.count=count;
   upload(mesh.instanceMatrix,matrixStart,matrixEnd);
   if(mesh.instanceColor)upload(mesh.instanceColor,colorStart,colorEnd);
  },
 };
}
