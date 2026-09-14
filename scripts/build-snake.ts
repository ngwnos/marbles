import createManifold, { type MeshOptions } from 'manifold-3d';
import { buildSnakeSolid, snakeSolidToGeometry, snakeBridgeSurfaces } from '../src/pieces/snake-solid';
import { assertJoins } from '../src/geometry/continuity';
import { auditRenderMesh } from '../tests/mesh-quality';
import { auditSnakeNormals } from '../tests/snake-normals';
import { auditCollarMouths } from '../tests/connector-mouth';
import { auditVerticalMouths } from '../tests/collar-vertical';
import { auditCConnectors } from '../tests/c-connector';

const started = performance.now();
const draft = process.argv.includes('--draft');
let failedChecks = 0;
const check = (run: () => unknown) => {
  try { console.log(run()); }
  catch (error) {
    if (!draft) throw error;
    failedChecks++;
    console.error('DRAFT PREVIEW — validation failed:', error);
  }
};
assertJoins([...snakeBridgeSurfaces(0).joins, ...snakeBridgeSurfaces(3).joins]);
const serial = process.argv.includes('--serial');
const patches = serial ? undefined : await Promise.all((['middle', 'end'] as const).map(kind =>
  new Promise<MeshOptions[]>((resolve, reject) => {
    const worker = new Worker(new URL('./snake-patch-worker.ts', import.meta.url).href);
    worker.onmessage = ({ data }) => {
      worker.terminate();
      if (data.error) reject(new Error(data.error));
      else resolve(data.meshes);
    };
    worker.onerror = event => { worker.terminate(); reject(new Error(event.message)); };
    worker.postMessage(kind);
  })));
console.log(`parallel patches: ${(performance.now() - started).toFixed(0)} ms`);
const kernel = await createManifold();
kernel.setup();
console.log(auditVerticalMouths(kernel));
let last = performance.now();
const report = (stage: string) => {
  const now = performance.now();
  console.log(`${stage}: ${(now - last).toFixed(0)} ms`);
  last = now;
};
const solid = buildSnakeSolid(kernel, report, patches?.flat());
try {
  const geometry = snakeSolidToGeometry(solid);
  report('render mesh');
  try {
    console.log(auditRenderMesh(solid, geometry));
    check(() => auditCConnectors(solid));
    check(() => auditSnakeNormals(geometry));
    check(() => auditSnakeNormals(geometry, 'bore'));
    check(() => auditCollarMouths(solid, geometry));
    report('audit');
    if (process.argv.includes('--verify')) {
      const { verifySnakeRamp } = await import('../tests/snake-ramp');
      check(() => verifySnakeRamp(kernel, patches?.flat()));
    }
    const positions = geometry.getAttribute('position').array as Float32Array;
    const normals = geometry.getAttribute('normal').array as Float32Array;
    const indices = geometry.index!.array as Uint32Array;
    const bytes = new Uint8Array(8 + positions.byteLength + normals.byteLength + indices.byteLength);
    bytes.set(new Uint8Array(new Uint32Array([positions.length / 3, indices.length]).buffer));
    let offset = 8;
    for (const array of [positions, normals, indices]) {
      bytes.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), offset);
      offset += array.byteLength;
    }
    await Bun.write(new URL('../src/generated/snake.bin', import.meta.url), bytes);
    console.log(`Snake: ${(bytes.length / 1e6).toFixed(2)} MB, built in ${((performance.now() - started) / 1000).toFixed(2)} s`);
    if (failedChecks) {
      console.error(`Draft preview written with ${failedChecks} failing checks. This is not a verified build.`);
      process.exitCode = 1;
    }
  } finally { geometry.dispose(); }
} finally { solid.delete(); }
