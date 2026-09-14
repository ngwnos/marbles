import {auditExitBore} from './exit-bore';
import type { ManifoldToplevel } from 'manifold-3d';
import { buildRampSolid, rampSolidToGeometry, COIL_LENGTH, sampleCoil, STANDARD_RAMP } from '../src/pieces/standard-ramp';
import { CONNECTOR, PART_UNITS, TRACK, spanAlongTrack } from '../src/pieces/marbleworks-spec';
import { auditCConnectors } from './c-connector';
import { auditRenderMesh } from './mesh-quality';
import { auditStandardEntry } from './standard-entry';

/** Check the actual boolean result, including room for a nominal 15.9 mm marble. */
export function verifyStandardRamp(kernel: ManifoldToplevel) {
  const ramp = buildRampSolid(kernel);
  const marble = kernel.Manifold.sphere(7.95, 32);
  let probes = 0;
  try {
    if (STANDARD_RAMP.centersAlongTrack !== 138 || STANDARD_RAMP.centersAcrossTrack !== 24)
      throw new Error('Shared port units changed the accepted ramp spacing');
    if (PART_UNITS.stackRise !== 47 || spanAlongTrack(24) !== 138)
      throw new Error('Shared assembly units changed the accepted ramp fit');
    if (PART_UNITS.insertionDepth + PART_UNITS.stackRise !== CONNECTOR.postHeight)
      throw new Error('Connector insertion depth does not match the stack rise');
    if (STANDARD_RAMP.straightStartHeight + TRACK.channelDepth + CONNECTOR.wall / 2 !== CONNECTOR.shoulderHeight)
      throw new Error('Rounded rail does not meet the seating datum');
    if (ramp.status() !== 'NoError') throw new Error(`Invalid ramp solid: ${ramp.status()}`);
    const triangles = ramp.numTri(), volume = ramp.volume();
    const components = ramp.decompose();
    const count = components.length;
    components.forEach(part => part.delete());
    if (count !== 1) throw new Error(`Ramp contains ${count} disconnected pieces`);
    const clear = (x: number, y: number, z: number) => {
      const at = marble.translate([x, y, z]);
      const overlap = ramp.intersect(at);
      try {
        if (overlap.volume() > 0.001) throw new Error(`Marble blocked at ${[x, y, z].join(', ')}`);
        probes++;
      } finally { overlap.delete(); at.delete(); }
    };
    const outletX = STANDARD_RAMP.centersAlongTrack / 2;
    for (let i = 0; i <= 48; i++) {
      const p = sampleCoil(COIL_LENGTH * i / 48);
      clear(outletX + p.x, p.height + 8.05, p.z);
    }
    for (let y = 4; y <= 32; y += 4) clear(outletX, y, 0);
    const postSurface = (angle: number, y: number) => {
      const c = Math.cos(angle), s = Math.sin(angle);
      const hit = ramp.rayCast([outletX + 16 * c, y, 16 * s], [outletX, y, 0])[0];
      if (!hit) throw new Error(`Missing outlet wall at ${angle}, ${y}`);
      return Math.hypot(hit.position[0] - outletX, hit.position[2]);
    };
    // The tray's old cap left a 0.5 mm shelf below the real stacking shoulder.
    // Probe both sides of that cap and the separate shoulder on the final solid.
    for (const angle of [0.2, 0.8, 1.4, 2, 2.25]) {
      if (Math.abs(postSurface(angle, 38.9) - postSurface(angle, 39.1)) > 0.005)
        throw new Error(`Lower coil-to-post lip remains at angle ${angle}`);
    }
    for (const angle of [0.2, 0.8, 1.4, 2]) {
      if (postSurface(angle, 46) - postSurface(angle, 48) < 1)
        throw new Error(`Stacking shoulder lost at angle ${angle}`);
    }
    const end = sampleCoil(COIL_LENGTH), before = sampleCoil(COIL_LENGTH - 1);
    if (Math.abs(end.x) + Math.abs(end.z) > 1e-6 || Math.abs(before.z) > 1e-6 || end.x <= before.x)
      throw new Error('The terminal channel does not feed straight into the bore');
    const connectors = auditCConnectors(ramp, [
      { x: -outletX, z: -24, direction: 0 },
      { x: outletX, z: 0, direction: Math.PI },
    ].map(port => ({ ...port, opening: 2 * Math.asin(TRACK.channelInsideWidth / CONNECTOR.maleDiameter), insideTolerance: 0.06 })));
    const geometry = rampSolidToGeometry(ramp);
    try {
      return { exitBore: auditExitBore(ramp,{x:outletX,z:0,direction:Math.PI}), components: count, clearanceProbes: probes, connectors, entry: auditStandardEntry(ramp, geometry), renderQuality: auditRenderMesh(ramp, geometry), triangles, volume };
    } finally { geometry.dispose(); }
  } finally { marble.delete(); ramp.delete(); }
}
