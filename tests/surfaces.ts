import { Vector3 } from 'three/webgpu';
import { assertJoins, inspectJoin, type Join } from '../src/geometry/continuity';
import { ShellMesh } from '../src/geometry/surface-mesh';
import { snakeBridgeSurfaces } from '../src/pieces/snake-solid';
import { funnelJoinSurfaces } from '../src/pieces/funnel';

function assert(value: boolean, message = 'Assertion failed') { if (!value) throw new Error(message); }
function throws(run: () => void, pattern: RegExp) {
  try { run(); } catch (error) { if (pattern.test(String(error))) return; throw error; }
  throw new Error(`Expected failure matching ${pattern}`);
}

const plane = (u: number, v: number) => new Vector3(u, v, 0);
const fixture = (surface: typeof plane, expected: Join['expected'] = 'G1'): Join => ({
  name: 'Synthetic seam', a: { surface: plane, edge: 'u1' }, b: { surface, edge: 'u0' }, expected,
});
assert(inspectJoin(fixture((u, v) => new Vector3(1 + u, v, 0), 'G2')).passed);
assert(!inspectJoin(fixture((u, v) => new Vector3(1.01 + u, v, 0))).passed, 'Must catch a gap');
assert(!inspectJoin(fixture((u, v) => new Vector3(1 + u, v, 0.2 * u))).passed, 'Must catch a crease');
const curved = (u: number, v: number) => new Vector3(1 + u, v, u * u);
assert(inspectJoin(fixture(curved)).passed, 'Tangent circular/planar transitions may be G1');
assert(!inspectJoin(fixture(curved, 'G2')).passed, 'Must catch curvature jumps');
assert(!inspectJoin(fixture((_u, v) => new Vector3(1, v, 0))).passed, 'Must catch collapsed patches');
const mesh = new ShellMesh(), edge = mesh.seam(v => plane(1, v), 8);
mesh.patch(plane, 4, 8, false, undefined, { u1: edge });
mesh.patch((u, v) => new Vector3(1 + u, v, 0), 4, 8, false, undefined, { u0: edge });
throws(() => mesh.patch(plane, 4, 7, false, undefined, { u1: edge }), /sampling mismatch/);
throws(() => mesh.patch((u, v) => new Vector3(u + 0.01, v, 0), 4, 8, false, undefined, { u1: edge }), /disagrees/);
const results = assertJoins([...snakeBridgeSurfaces(0).joins, ...snakeBridgeSurfaces(3).joins, ...funnelJoinSurfaces().joins]);
console.table(results.map(({ name, maxGap, maxAngle, maxCurvatureDifference }) => ({ name, maxGap, maxAngle, maxCurvatureDifference })));
console.log('Surface contracts: synthetic defects rejected; 10 real seams pass G1.');
