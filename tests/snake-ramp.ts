import { buildSpacerSolid } from '../src/pieces/spacer';
import { auditRenderMesh } from './mesh-quality';
import { auditSnakeRim } from './snake-rim';
import { auditCConnectors } from './c-connector';
import { auditPostDomains } from './post-domain';
import { auditTrackPostJoins } from './track-post';
import { auditCollarMouths } from './connector-mouth';
import { auditCupTrack } from './cup-track';
import type { ManifoldToplevel, MeshOptions } from 'manifold-3d';
import { buildSnakePatches, buildSnakeSolid, sampleSnake, SNAKE_LENGTH, snakeBendCenter, snakeFloor, SNAKE_RAMP } from '../src/pieces/snake-solid';
import { CONNECTOR, PART_UNITS } from '../src/pieces/marbleworks-spec';

export function verifySnakeRamp(kernel: ManifoldToplevel, patches?: MeshOptions[]) {
  const solid = buildSnakeSolid(kernel, undefined, patches);
  // In a section normal to the bridge edge, its roll must lie on the same
  // 0.75 mm circle as the track lip, all along the concave join.
  const necks = buildSnakePatches(kernel, 'end');
  let lipProbes = 0;
  try {
    for (let end = 0; end < 2; end++) {
      const postX = (end === 0 ? -1 : 1) * PART_UNITS.portSpan / 2;
      const c = snakeBendCenter(end === 0 ? 1 : 2);
      const distance = Math.hypot(c.x - postX, c.z), ux = (c.x - postX) / distance, uz = c.z / distance;
      const postRadius = CONNECTOR.postDiameter / 2, bandRadius = SNAKE_RAMP.radius + 11.5;
      const fx = ((postRadius + 7) ** 2 - (bandRadius + 7) ** 2 + distance ** 2) / (2 * distance);
      const fz = Math.sqrt((postRadius + 7) ** 2 - fx ** 2);
      const m = necks[end].getMesh();
      for (let i = 0; i < m.vertProperties.length; i += m.numProp) {
        const [x, y, z] = m.vertProperties.subarray(i, i + 3);
        const h = y - snakeFloor(x) - 10;
        if (h <= 0 || h >= 0.75) continue;
        const lx = ux * (x - postX) + uz * z, lz = -uz * (x - postX) + ux * z;
        const inset = Math.hypot(lx - fx, Math.abs(lz) - fz) - 7;
        const measuredRadius = Math.hypot(0.75 - inset, h);
        if (Math.abs(measuredRadius - 0.75) > 0.003) throw new Error(`Distorted bridge lip: ${measuredRadius}`);
        lipProbes++;
      }
    }
    if (lipProbes < 100) throw new Error('Missing bridge lip samples');
  } finally { necks.forEach(neck => neck.delete()); }
  const marble = kernel.Manifold.sphere(7.95, 32);
  let probes = 0;
  try {
    if (solid.status() !== 'NoError') throw new Error(solid.status());
    // This section previously crossed an extra thin flange and air gap at the
    // band-to-neck seam. It must cross only the outside and inside of one wall.
    const seamHits = solid.rayCast([54, 28.5, 17.5], [49, 28.5, 17.5]);
    if (seamHits.length !== 2) throw new Error(`Extra surface at end-neck seam: ${seamHits.length} crossings`);

    const components = solid.decompose();
    const count = components.length;
    components.forEach(p => p.delete());
    if (count !== 1) throw new Error(`${count} disconnected components`);
    const clear = (position: [number, number, number]) => {
      const at = marble.translate(position), overlap = solid.intersect(at);
      try {
        if (overlap.volume() > 0.001) throw new Error(`Blocked marble at ${position}: ${overlap.volume()} mm³`);
        probes++;
      } finally { at.delete(); overlap.delete(); }
    };
    for (let i = 0; i <= 160; i++) {
      const p = sampleSnake(SNAKE_LENGTH * i / 160);
      clear([p.x, p.height + 8.05, p.z]);
    }
    // The landing disk must not retain the old horizontal cup plane.
    const inletX = -PART_UNITS.portSpan / 2;
    for (const dx of [-3, -1.5, 0, 1.5, 3]) {
      for (const z of [-1, 0, 1]) {
        const x = inletX + dx, floor = snakeFloor(x);
        const hit = solid.rayCast([x, floor + 2, z], [x, floor - 1, z])[0];
        if (!hit || Math.abs(hit.position[1] - floor) > 0.005)
          throw new Error(`Crease in inlet landing floor at ${dx}, ${z}`);
      }
    }
    for (let y = 4; y <= 32; y += 4) clear([PART_UNITS.portSpan / 2, y, 0]);
    // A full-width neck must exist on both sides of its axis at rim height.
    // The old curved strip enclosed the hole but failed these outer-side probes.
    for (const end of [0, 3]) {
      const postX = (end === 0 ? -1 : 1) * PART_UNITS.portSpan / 2;
      const neighbor = end === 0 ? 1 : 2;
      const { x: bx, z: bz } = snakeBendCenter(neighbor);
      const d = Math.hypot(bx - postX, bz), ux = (bx - postX) / d, uz = bz / d;
      const floor = sampleSnake((end === 0 ? 1 : 3) * SNAKE_LENGTH / 4).height;
      for (const side of [-3, 0, 3]) {
        const x = postX + ux * 17 - uz * side, z = uz * 17 + ux * side;
        if (!solid.rayCast([x, floor + 14, z], [x, floor + 7, z]).length)
          throw new Error(`Missing blended neck ${end}, side ${side}`);
      }
    }
    let rimProbes = 0;
    for (let bend = 0; bend < 4; bend++) {
      for (const t of [0.2, 0.4, 0.6, 0.8]) {
        const p = sampleSnake(SNAKE_LENGTH * (bend + t) / 4);
        for (const side of [-10.75, 10.75]) {
          const x = p.x + p.dz * side, z = p.z - p.dx * side;
          if (Math.min(Math.hypot(x - PART_UNITS.portSpan / 2, z),
            Math.hypot(x + PART_UNITS.portSpan / 2, z)) < 14) continue;
          const expected = snakeFloor(x) + 10.75;
          const hits = solid.rayCast([x, expected + 1, z], [x, expected - 1, z]);
          if (!hits.length || Math.abs(hits[0].position[1] - expected) > 0.04)
            throw new Error(`Rim leaves common slope plane at bend ${bend}, ${t}, ${side}`);
          rimProbes++;
        }
      }
    }
    for (const bend of [0, 1]) {
      const a = snakeBendCenter(bend), b = snakeBendCenter(bend + 2);
      const x = (a.x + b.x) / 2, z = a.z, y = snakeFloor(x);
      for (const dz of [-1, 0, 1]) {
        const hits = solid.rayCast([x, y + 12, z + dz], [x, y + 8, z + dz]);
        if (!hits.length || Math.abs(hits[0].position[1] - (y + 10.75)) > 0.04)
          throw new Error(`Missing coplanar blended contact at ${bend}, ${dz}`);
      }
      const bottomHeights = [0, 3].map(dz => {
        const hit = solid.rayCast([x, y + 2, z + dz], [x, y + 10, z + dz])[0];
        if (!hit) throw new Error(`Missing curved underside of rim blend ${bend}`);
        return hit.position[1];
      });
      if (Math.abs(bottomHeights[0] - bottomHeights[1]) < 0.1)
        throw new Error(`Rim contact has a flat block underside at ${bend}`);
      if (solid.rayCast([x, y + 3, z], [x, y - 2, z]).length)
        throw new Error(`Contact filled the gap between rounded undersides at ${bend}`);
    }
    // No track or blend may intrude above the connector seating plane.
    // Only the two standardized male spigots are allowed above that datum.
    const mesh = solid.getMesh();
    for (let i = 0; i < mesh.vertProperties.length; i += mesh.numProp) {
      const [x, y, z] = mesh.vertProperties.subarray(i, i + 3);
      if (y <= CONNECTOR.shoulderHeight + 0.001) continue;
      const r = Math.min(Math.hypot(x - PART_UNITS.portSpan / 2, z), Math.hypot(x + PART_UNITS.portSpan / 2, z));
      if (r > CONNECTOR.maleDiameter / 2 + 0.21)
        throw new Error(`Geometry obstructs connector seat at ${x}, ${y}, ${z}`);
    }
    const spacer = buildSpacerSolid(kernel);
    try {
      for (const x of [-PART_UNITS.portSpan / 2, PART_UNITS.portSpan / 2]) {
        const placed = spacer.translate([x, CONNECTOR.shoulderHeight, 0]);
        const overlap = solid.intersect(placed);
        try {
          if (overlap.volume() > 0.001) throw new Error(`Spacer collides with ramp at connector ${x}`);
        } finally { overlap.delete(); placed.delete(); }
      }
    } finally { spacer.delete(); }
    return { cupTrack: auditCupTrack(solid), collarMouths: auditCollarMouths(solid), trackPostJoins: auditTrackPostJoins(solid), postDomains: auditPostDomains(solid), connectors: auditCConnectors(solid), finalRim: auditSnakeRim(solid), renderQuality: auditRenderMesh(solid), components: count, clearanceProbes: probes, rimPlaneProbes: rimProbes, triangles: solid.numTri(), volume: solid.volume() };
  } finally { marble.delete(); solid.delete(); }
}
