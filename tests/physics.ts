import { Vector3 } from 'three/webgpu';
import { createPhysics, scatterMarbles } from '../src/physics';

export async function verifyPhysics() {
  const layout = scatterMarbles();
  if (layout.length !== 241 || layout.some((s, i) => s.center[1] !== 1 || layout.slice(i + 1).some(t =>
    Math.hypot(s.center[0] - t.center[0], s.center[2] - t.center[2]) < 2.3))) throw new Error('Invalid scatter');
  const p = await createPhysics([{ center: [0, 1, 0], radius: 1 }]);
  const forward = new Vector3(0, 0, -1);
  try {
    for (let i = 0; i < 120; i++) p.step(forward);
    const driven = p.bodies[0].getLinearVelocity();
    const spin = p.bodies[0].getAngularVelocity();
    for (let i = 0; i < 60; i++) p.step(new Vector3());
    const coasting = p.bodies[0].getLinearVelocity();
    for (let i = 0; i < 120; i++) p.step(forward.clone().negate());
    const reverse = p.bodies[0].getLinearVelocity();
    const height = p.bodies[0].getPosition().y;
    if (!(driven.z < -5 && spin.x < -5 && coasting.z < -1 && coasting.z > driven.z && reverse.z > 1 && Math.abs(height - 1) < 0.05)) {
      throw new Error(JSON.stringify({ driven, spin, coasting, reverse, height }));
    }
    const collision = await createPhysics([
      { center: [0, 1, 0], radius: 1 }, { center: [0, 1, -5], radius: 1 },
    ]);
    let pushedZ: number;
    try {
      for (let i = 0; i < 120; i++) collision.step(forward);
      pushedZ = collision.bodies[1].getPosition().z;
      if (pushedZ > -7) throw new Error('Player did not push the other marble');
    } finally { collision.dispose(); }
    return { marbleCount: layout.length, driven, spin, coasting, reverse, height, pushedZ };
  } finally { p.dispose(); }
}

export async function verifyContactMaterials() {
  const simulation = await createPhysics([
    { center: [0, 10, 0], radius: 1 }, { center: [0, 10, -2.1], radius: 1 },
  ]);
  try {
    const mass = simulation.bodies[0].getMass();
    simulation.bodies[0].setLinearVelocity({ x: 0, y: 0, z: -10 });
    for (let i = 0; i < 3; i++) simulation.step(new Vector3());
    const incoming = simulation.bodies[0].getLinearVelocity().z;
    const outgoing = simulation.bodies[1].getLinearVelocity().z;
    // Equal masses, restitution .9: approximately .5 and 9.5 after impact.
    if (Math.abs(mass - 4 * Math.PI / 3) > 0.01 || Math.abs(incoming + 0.5) > 0.3 || Math.abs(outgoing + 9.5) > 0.3) {
      throw new Error(JSON.stringify({ mass, incoming, outgoing }));
    }
    return { mass, incoming, outgoing };
  } finally { simulation.dispose(); }
}

export async function verifyJump() {
  const p = await createPhysics([{ center: [0, 1, 0], radius: 1 }]);
  const idle = new Vector3();
  try {
    p.bodies[0].setLinearVelocity({ x: 3, y: 0, z: 0 });
    p.requestJump();
    p.step(idle);
    const launch = p.bodies[0].getLinearVelocity();
    if (launch.y < 10 || Math.abs(launch.x - 3) > 0.01) throw new Error(`Bad launch: ${JSON.stringify(launch)}`);
    for (let i = 0; i < 10; i++) p.step(idle);
    const before = p.bodies[0].getLinearVelocity().y;
    p.requestJump();
    p.step(idle);
    if (p.bodies[0].getLinearVelocity().y >= before) throw new Error('Air jump allowed');
    let peak = 0, bounce = 0, descending = false;
    for (let i = 0; i < 150; i++) {
      p.step(idle);
      const y = p.bodies[0].getPosition().y;
      const vy = p.bodies[0].getLinearVelocity().y;
      peak = Math.max(peak, y);
      if (vy < -1) descending = true;
      if (descending && y < 1.5) bounce = Math.max(bounce, vy);
    }
    if (peak < 3 || bounce < 2) throw new Error(JSON.stringify({ peak, bounce }));
    return { launch, peak, bounce };
  } finally { p.dispose(); }
}
