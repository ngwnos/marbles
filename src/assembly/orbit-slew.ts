import {Vector3} from 'three/webgpu';

/** Move the orbit rig together, preserving the user's angle and distance. */
export function createOrbitSlew(camera:{position:Vector3},target:Vector3,frequency=14){
 const velocity=new Vector3(),offset=new Vector3(),impulse=new Vector3(),delta=new Vector3();
 return {
  get velocity(){return velocity.clone();},
  reset(initialVelocity?:Vector3){if(initialVelocity)velocity.copy(initialVelocity);else velocity.set(0,0,0);},
  update(goal:Vector3,dt:number,rate=frequency){
   // Exact critically damped spring, independent of frame rate.
   const decay=Math.exp(-rate*dt);
   offset.copy(target).sub(goal);
   impulse.copy(velocity).addScaledVector(offset,rate).multiplyScalar(dt);
   delta.copy(offset).add(impulse).multiplyScalar(decay).add(goal).sub(target);
   velocity.addScaledVector(impulse,-rate).multiplyScalar(decay);
   camera.position.add(delta);target.add(delta);
   return target.distanceToSquared(goal)<.0001&&velocity.lengthSq()<.0001;
  },
 };
}
