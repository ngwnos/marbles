import type { Manifold } from 'manifold-3d';
import { CONNECTOR, PART_UNITS } from '../src/pieces/marbleworks-spec';
import { snakeConnectorSection } from '../src/pieces/snake-solid';

/** Probe the assembled part: shell thickness, inside seam and support under caps. */
export function auditCConnectors(solid: Manifold, ports = [0, 3].map(end => ({
  x: (end === 0 ? -1 : 1) * PART_UNITS.portSpan / 2, z: 0,
  ...snakeConnectorSection(end), insideTolerance: end === 0 ? 0.015 : 0.06,
}))) {
  let thicknessProbes = 0, supportProbes = 0, seamProbes = 0;
  let maxThicknessError = 0, maxInsideStep = 0;
  for (const [end, port] of ports.entries()) {
    const { x: px, z: pz, direction, opening } = port;
    if (opening >= Math.PI || opening < Math.PI / 2) throw new Error('Connector must retain its C-shaped wrap');
    const start = direction + opening / 2, finish = direction + 2 * Math.PI - opening / 2;
    const ray = (angle: number, y: number) => solid.rayCast([px, y, pz], [px + 15 * Math.cos(angle), y, pz + 15 * Math.sin(angle)]);
    for (let i = 1; i < 32; i++) {
      const angle = start + (finish - start) * i / 32;
      for (const y of [48, 52, 57, 61, 61.8]) {
        const hits = ray(angle, y);
        if (hits.length !== 2) throw new Error(`C connector has ${hits.length} skins at ${end}, ${i}, ${y}`);
        const thickness = Math.hypot(...hits[0].position.map((v, axis) => v - hits[1].position[axis]));
        const error = Math.abs(thickness - CONNECTOR.wall);
        maxThicknessError = Math.max(maxThicknessError, error); thicknessProbes++;
        if (error > 0.015) throw new Error(`C wall thickness ${thickness} mm`);
      }
      const below = ray(angle, 46.99)[0], above = ray(angle, 47.01)[0];
      if (!below || !above) throw new Error('Missing inside seam');
      const radius = (p: number[]) => Math.hypot(p[0] - px, p[2] - pz);
      const step = Math.abs(radius(below.position) - radius(above.position));
      maxInsideStep = Math.max(maxInsideStep, step); seamProbes++;
      // The outlet has the existing short socket taper immediately below the seat.
      if (step > port.insideTolerance) throw new Error(`Inside connector step ${step} mm`);
    }
    const centerRadius = CONNECTOR.maleDiameter / 2 - CONNECTOR.wall / 2;
    for (const angle of [start, finish]) for (let j = 0; j < 16; j++) {
      const t = j / 16 * Math.PI * 2;
      const x = px + centerRadius * Math.cos(angle) + 0.3 * Math.cos(t), z = pz + centerRadius * Math.sin(angle) + 0.3 * Math.sin(t);
      if (solid.rayCast([x, 46.95, z], [x, 47.05, z]).length)
        throw new Error(`Unsupported rounded connector end ${end}, ${angle}, ${j}`);
      supportProbes++;
    }
  }
  return { thicknessProbes, supportProbes, seamProbes, maxThicknessError, maxInsideStep };
}
