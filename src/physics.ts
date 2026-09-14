import initBox3D from 'box3d-wasm/standard';
import { Quaternion, Vector3 } from 'three/webgpu';
import type { Sphere } from './marble';

export const FLOOR_SIZE = 120;
export const PHYSICS_STEP = 1 / 60;
const engine = initBox3D();

export function scatterMarbles(count = 241): Sphere[] {
  const spheres: Sphere[] = [{ center: [0, 1, 0], radius: 1 }];
  for (let attempts = 0; spheres.length < count && attempts < count * 100; attempts++) {
    const x = (Math.random() - 0.5) * 90;
    const z = (Math.random() - 0.5) * 90;
    if (spheres.some(s => (s.center[0] - x) ** 2 + (s.center[2] - z) ** 2 < 2.3 ** 2)) continue;
    spheres.push({ center: [x, 1, z], radius: 1 });
  }
  return spheres;
}

export async function createPhysics(spheres: Sphere[]) {
  const b3 = await engine;
  const world = new b3.World({ gravity: { x: 0, y: -20, z: 0 }, enableSleep: true, enableContinuous: true });
  const ground = world.createBody({ type: 'static', position: { x: 0, y: -0.5, z: 0 } });
  ground.createBox({ halfExtents: { x: FLOOR_SIZE / 2, y: 0.5, z: FLOOR_SIZE / 2 }, friction: 0.7, rollingResistance: 0.025, filter: { categoryBits: 1, maskBits: 4 } }).delete();
  ground.delete();
  const bodies = spheres.map(s => {
    const body = world.createBody({ type: 'dynamic', position: { x: s.center[0], y: s.center[1], z: s.center[2] }, angularDamping: 0, linearDamping: 0 });
    // The WASM binding has no material-mixing callbacks. Two filtered shapes
    // on one body give each contact pair its own material without double contacts.
    body.createSphere({ radius: s.radius, density: 1, friction: 0.08, rollingResistance: 0,
      restitution: 0.9, filter: { categoryBits: 2, maskBits: 2 } }).delete();
    // Zero density preserves the original sphere mass and angular inertia.
    body.createSphere({ radius: s.radius, density: 0, friction: 0.7, rollingResistance: 0.025,
      restitution: 0.4, filter: { categoryBits: 4, maskBits: 1 } }).delete();
    return body;
  });
  const transforms = spheres.map(s => ({ position: new Vector3(...s.center), rotation: new Quaternion() }));
  const previous = transforms.map(t => ({ position: t.position.clone(), rotation: t.rotation.clone() }));
  const current = transforms.map(t => ({ position: t.position.clone(), rotation: t.rotation.clone() }));
  const torque = new Vector3();
  const player = bodies[0];
  const inertia = 0.4 * player.getMass() * spheres[0].radius ** 2;
  let accumulator = 0;
  let jumpBuffer = 0;
  const step = (direction: Vector3) => {
    if (jumpBuffer > 0) {
      jumpBuffer -= PHYSICS_STEP;
      const velocity = player.getLinearVelocity();
      // Rays starting inside the player's sphere ignore that shape. Check both
      // the floor and other marbles, but only accept support beneath us.
      const support = world.castRayClosest(player.getPosition(),
        { x: 0, y: -(spheres[0].radius + 0.08), z: 0 },
        { filter: { categoryBits: 6, maskBits: 3 } });
      if (support.hit && support.normal!.y > 0.5 && velocity.y < 1) {
        player.applyLinearImpulseToCenter({ x: 0, y: player.getMass() * (11 - velocity.y), z: 0 }, true);
        jumpBuffer = 0;
      }
      support.shape?.delete();
    }
    // Torque, rather than forced velocity, lets traction and collisions govern movement.
    // No input means coasting; opposing input brakes the existing spin.
    if (direction.lengthSq() > 0) {
      const angular = player.getAngularVelocity();
      const speed = 20 / spheres[0].radius;
      torque.set(direction.z * speed - angular.x, 0, -direction.x * speed - angular.z)
        .multiplyScalar(inertia * 10).clampLength(0, inertia * 35);
      player.applyTorque(torque, true);
    }
    current.forEach((t, i) => { previous[i].position.copy(t.position); previous[i].rotation.copy(t.rotation); });
    world.step(PHYSICS_STEP, 4);
    bodies.forEach((body, i) => {
      current[i].position.copy(body.getPosition());
      current[i].rotation.copy(body.getRotation());
    });
  };
  return {
    bodies, transforms, step,
    requestJump() { jumpBuffer = 0.12; },
    advance(dt: number, direction: Vector3) {
      accumulator += Math.min(dt, 0.1);
      while (accumulator >= PHYSICS_STEP) { step(direction); accumulator -= PHYSICS_STEP; }
      const alpha = accumulator / PHYSICS_STEP;
      transforms.forEach((t, i) => {
        t.position.lerpVectors(previous[i].position, current[i].position, alpha);
        t.rotation.slerpQuaternions(previous[i].rotation, current[i].rotation, alpha);
      });
    },
    dispose() { bodies.forEach(body => body.delete()); world.destroy(); world.delete(); },
  };
}
