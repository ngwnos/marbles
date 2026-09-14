import {Quaternion,Vector3} from 'three/webgpu';
import {STORAGE_TUB as D} from './storage-tub-spec';
import {tubPoseAtAngle,tubUprightRotation} from './tub-motion';

export const TUB_DUMP_DURATION=3.6;
const center=new Vector3(0,D.height/2,0),axis=new Vector3(1,0,0);
const smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*t*(10+t*(-15+6*t));};

/** One continuous gesture. The lift peaks just after the tip, so the return
 * rolls the bowl back while carrying it above the spilled pieces. */
export function createTubDumpMotion(start:{position:Vector3;rotation:Quaternion},clearance=750){
 const home=tubPoseAtAngle(0),homeCenter=center.clone().applyQuaternion(home.rotation).add(home.position);
 const startCenter=center.clone().applyQuaternion(start.rotation).add(start.position);
 const height=Math.max(clearance,startCenter.y+450);
 const peakTip=2.75;
 return (time:number)=>{
  const t=Math.max(0,Math.min(1,time/TUB_DUMP_DURATION)),wave=Math.sin(Math.PI*t);
  const at=startCenter.clone().lerp(homeCenter,smooth(t));
  at.x+=(-300-homeCenter.x)*wave**3;
  at.y+=(height-homeCenter.y)*wave**2*(1-.3*Math.sin(2*Math.PI*t));
  const tipTime=t-.12*wave/Math.PI;
  const rotation=start.rotation.clone().slerp(tubUprightRotation,smooth(t));
  rotation.multiply(new Quaternion().setFromAxisAngle(axis,peakTip*Math.sin(Math.PI*tipTime)**2));
  return {position:at.sub(center.clone().applyQuaternion(rotation)),rotation};
 };
}
