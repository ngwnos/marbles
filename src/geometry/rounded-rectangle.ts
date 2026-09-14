import {Vector2} from 'three/webgpu';

/** A continuous perimeter chart, with corresponding points on inset rings.
 * Flat sides receive their own parameter intervals, independent of aspect. */
export function roundedRectanglePoint(u:number,halfX:number,halfZ:number,radius:number){
 const section=((u%1+1)%1)*8,i=Math.floor(section),t=section-i;
 switch(i){
  case 0:return new Vector2(halfX,-halfZ+radius+2*(halfZ-radius)*t);
  case 1:{const a=t*Math.PI/2;return new Vector2(halfX-radius+radius*Math.cos(a),halfZ-radius+radius*Math.sin(a));}
  case 2:return new Vector2(halfX-radius-2*(halfX-radius)*t,halfZ);
  case 3:{const a=(1+t)*Math.PI/2;return new Vector2(-halfX+radius+radius*Math.cos(a),halfZ-radius+radius*Math.sin(a));}
  case 4:return new Vector2(-halfX,halfZ-radius-2*(halfZ-radius)*t);
  case 5:{const a=(2+t)*Math.PI/2;return new Vector2(-halfX+radius+radius*Math.cos(a),-halfZ+radius+radius*Math.sin(a));}
  case 6:return new Vector2(-halfX+radius+2*(halfX-radius)*t,-halfZ);
  default:{const a=(3+t)*Math.PI/2;return new Vector2(halfX-radius+radius*Math.cos(a),-halfZ+radius+radius*Math.sin(a));}
 }
}
