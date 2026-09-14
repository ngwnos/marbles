import {loadSolidKernel} from '../src/pieces/solid-kernel';
import {buildPaddleRotor,PADDLE,paddleAxleY} from '../src/pieces/paddle-wheel';
const k=await loadSolidKernel(),solid=buildPaddleRotor(k);
const rim=solid.slice(PADDLE.z+5),center=solid.slice(PADDLE.z);
const web=center.subtract(rim);
const hulls:number[][]=[];
for(const [section,depth] of [[rim,18],[web,2.5]] as const){
 const simple=section.simplify(.035),contours=simple.toPolygons(),points=contours.flat();
 const polygons=k.triangulate(contours).map(t=>[...t]);
 // Merge adjacent triangles whenever the result remains convex.
 let changed=true;
 while(changed){changed=false;const edges=new Map<string,{p:number,e:number}>();
  outer:for(let i=0;i<polygons.length;i++){const a=polygons[i];if(!a.length)continue;
   for(let j=0;j<a.length;j++){
    const u=a[j],v=a[(j+1)%a.length],other=edges.get(`${v},${u}`);
    if(other){const b=polygons[other.p];const merged=[...a.slice(j+1),...a.slice(0,j+1),...b.slice(other.e+2),...b.slice(0,other.e)];
     if(merged.length<=16){let sign=0,convex=true;
      for(let n=0;n<merged.length;n++){const p=points[merged[n]],q=points[merged[(n+1)%merged.length]],r=points[merged[(n+2)%merged.length]];
       const cross=(q[0]-p[0])*(r[1]-q[1])-(q[1]-p[1])*(r[0]-q[0]);
       if(Math.abs(cross)>1e-8){if(sign&&sign*Math.sign(cross)<0){convex=false;break;}sign=Math.sign(cross);}}
      if(convex){polygons[i]=merged;polygons[other.p]=[];changed=true;break outer;}
     }
    }
    edges.set(`${u},${v}`,{p:i,e:j});
   }
  }
 }
 for(const poly of polygons)if(poly.length)hulls.push([-depth/2,depth/2].flatMap(z=>poly.flatMap(i=>[points[i][0]-PADDLE.x,points[i][1]-paddleAxleY,z])));
 simple.delete();
}
// Axle/hub are cylinders, represented by convex prisms.
for(const [radius,depth] of [[4.6,20],[1.6,28]])hulls.push([-depth/2,depth/2].flatMap(z=>Array.from({length:24},(_,i)=>[radius*Math.cos(i*Math.PI/12),radius*Math.sin(i*Math.PI/12),z]).flat()));
const solids=hulls.map(h=>k.Manifold.hull(Array.from({length:h.length/3},(_,i)=>[h[i*3]+PADDLE.x,h[i*3+1]+paddleAxleY,h[i*3+2]+PADDLE.z] as [number,number,number])));
const combined=k.Manifold.union(solids),extra=combined.subtract(solid),missing=solid.subtract(combined);
const volumeError=(extra.volume()+missing.volume())/solid.volume();
if(volumeError>.02)throw new Error(`Wheel collider differs from visible wheel by ${volumeError*100}% of volume`);
console.log({volumeError});extra.delete();missing.delete();combined.delete();solids.forEach(s=>s.delete());
await Bun.write('src/generated/paddle-colliders.json' ,JSON.stringify(hulls));
console.log({hulls:hulls.length});web.delete();rim.delete();center.delete();solid.delete();
