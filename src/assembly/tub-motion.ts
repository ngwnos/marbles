import {Quaternion,Vector3,type Camera} from 'three/webgpu';
import {STORAGE_TUB as D,tubWallDraft} from './storage-tub-spec';

export const TUB_MAX_TIP=Math.PI*.6;
// Intersection of the flat underside and the drafted outer sidewall. The
// rounded foot lies inside this corner, allowing rotation without digging
// into the floor. Include the collision skin on both supporting planes.
export const tubLocalPivot=new Vector3(0,-D.contactSkin,D.bottomWidth/2+D.bottomRoundover-tubWallDraft.z*D.bottomRoundover+D.contactSkin);
export const tubUprightRotation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),D.yaw);
export const tubWorldPivot=tubLocalPivot.clone().applyQuaternion(tubUprightRotation).add(new Vector3(...D.position));

/** The only allowed motion: rotate towards +world X about the bottom edge
 * parallel to the rug. Its midpoint is a point on the fixed hinge axis. */
export function tubPoseAtAngle(angle:number){
 const rotation=tubUprightRotation.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),angle));
 return {position:tubWorldPivot.clone().sub(tubLocalPivot.clone().applyQuaternion(rotation)),rotation};
}

/** Find the closest screen projection of the grabbed point's circular path.
 * Unlike a ray/plane intersection this also works when the hinge is edge-on. */
export function tubDragAngle(grab:Vector3,screen:{x:number;y:number},camera:Camera,width:number,height:number,previous:number){
 const score=(angle:number)=>{const pose=tubPoseAtAngle(angle),p=grab.clone().applyQuaternion(pose.rotation).add(pose.position).project(camera);
  return ((p.x+1)*width/2-screen.x)**2+((1-p.y)*height/2-screen.y)**2+.01*(angle-previous)**2;
 };
 const step=TUB_MAX_TIP/90;let best=previous,bestScore=score(best);
 for(let i=0;i<=90;i++){const angle=i*step,s=score(angle);if(s<bestScore){best=angle;bestScore=s;}}
 let lo=Math.max(0,best-step),hi=Math.min(TUB_MAX_TIP,best+step);
 for(let i=0;i<18;i++){const a=lo+(hi-lo)/3,b=hi-(hi-lo)/3;if(score(a)<score(b))hi=b;else lo=a;}
 return (lo+hi)/2;
}
