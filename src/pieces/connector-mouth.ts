import type { ManifoldToplevel } from 'manifold-3d';
import { CONNECTOR, TRACK } from './marbleworks-spec';

export function collarAngularRoll(radius: number, inner: number, q: number) {
  const capRadius = CONNECTOR.wall / 2;
  const capCenter = CONNECTOR.maleDiameter / 2 - capRadius;
  const cosine = (radius * radius + capCenter * capCenter - capRadius * capRadius) / (2 * radius * capCenter);
  const capAngle = Math.acos(Math.max(-1, Math.min(1, cosine)));
  return Math.max(q, capAngle * (inner + 13.5) / 2);
}

/** Rounded runout of the collar mouth, in unwrapped cylindrical coordinates.
 * The circular bend is tangent to the horizontal rim and the vertical mouth.
 * Parallel offsets across the wall give both exposed edges a 0.75 mm roll.
 */
export function collarMouthHeight(radius: number, angle: number, floor: number, inner: number, ends: readonly [number, number]) {
  const outer = 13.5, roll = 0.75, bend = 3;
  const middle = (inner + outer) / 2;
  const edgeDistance = Math.max(0, Math.min(radius - inner, outer - radius));
  const q = edgeDistance >= roll ? roll : Math.sqrt(roll * roll - (roll - edgeDistance) ** 2);
  // The lower mouth stops at the tangent plane supporting the complete rounded
  // spigot end, including the cap's forward-most point.
  const wrapped = Math.atan2(Math.sin(angle), Math.cos(angle));
  const end = (wrapped < 0 ? -ends[0] : ends[1]) * middle;
  const s = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) * middle;
  const t = s - (end - bend), radiusOfBend = bend - collarAngularRoll(radius, inner, q);
  if (t >= radiusOfBend) return CONNECTOR.postHeight+1;
  return Math.min(CONNECTOR.postHeight+1, floor + TRACK.channelDepth + bend - (bend - q) * Math.sqrt(1 - (Math.max(0, t) / radiusOfBend) ** 2));
}

/** A cutter for the collar alone; it never trims the adjoining track or cup. */
export function buildCollarMouth(kernel: ManifoldToplevel, postX: number, direction: number,
  floor: (x: number) => number, inner: number, ends: readonly [number, number], innerOnly = false) {
  const roll = 0.75, bend = 3, middle = (inner + 13.5) / 2;
  const radii = [...new Set([0.01, 8, 20, inner + roll,
    ...Array.from({ length: 61 }, (_, i) => 9 + i * 0.1),
    ...Array.from({ length: 33 }, (_, i) => inner + roll * (1 - Math.cos(i * Math.PI / 64))),
    ...Array.from({ length: 33 }, (_, i) => 13.5 - roll * (1 - Math.cos(i * Math.PI / 64))),
  ])].filter(r => !innerOnly || r <= inner + roll).sort((a, b) => a - b);
  const positions: number[] = [], triangles: number[] = [];
  const rows = radii.map(r => {
    const d = Math.max(0, Math.min(r - inner, 13.5 - r));
    const q = d >= roll ? roll : Math.sqrt(roll * roll - (roll - d) ** 2);
    // The seating face must support the actual semicircular C end cap,
    // including the portion inside the wider lower socket bore.
    const angularQ = collarAngularRoll(r, inner, q);
    const half = (endAngle: number) => {
      const end = endAngle * middle, start = (end - bend) / middle;
      const points: [number, number][] = [];
      for (let i = 0; i <= 32; i++) points.push([start * i / 32, TRACK.channelDepth + q]);
      for (let i = 1; i <= 48; i++) {
        const t = i * Math.PI / 96;
        points.push([(end - bend + (bend - angularQ) * Math.sin(t)) / middle, TRACK.channelDepth + bend - (bend - q) * Math.cos(t)]);
      }
      const finish = (end - angularQ) / middle;
      points.push([finish, 100]);
      for (let i = 1; i <= 32; i++) points.push([finish + (Math.PI - finish) * i / 32, 100]);
      return points;
    };
    return [...half(ends[1]), ...half(-ends[0]).slice(1, -1).reverse().map(([angle, y]): [number, number] => [-angle, y])];
  });
  const steps = rows[0].length;
  for (const top of [false, true]) radii.forEach((r, row) => rows[row].forEach(([angle, h], i) => {
    // Keep corresponding azimuths on the lid and molded boundary. A uniform
    // lid twists the radial side faces into chords that gouge the bore.
    const a = angle;
    // Keep the collar in cylindrical coordinates. Warping each radial row
    // against a different bore height folds the cutter back across itself,
    // removing flange skin. The separate core owns the bore/track transition.
    const mapped = r;
    const x = postX + mapped * Math.cos(a + direction);
    positions.push(x, top ? CONNECTOR.postHeight+2 : Math.min(CONNECTOR.postHeight+1, floor(x) + h), mapped * Math.sin(a + direction));
  }));
  const layer = radii.length * steps;
  for (let j = 0; j < radii.length - 1; j++) for (let i = 0; i < steps; i++) {
    const a = j * steps + i, b = j * steps + (i + 1) % steps, c = a + steps, d = b + steps;
    triangles.push(a, b, d, a, d, c, a + layer, d + layer, b + layer, a + layer, c + layer, d + layer);
  }
  for (const j of [0, radii.length - 1]) for (let i = 0; i < steps; i++) {
    const a = j * steps + i, b = j * steps + (i + 1) % steps;
    if (j === 0) triangles.push(a, a + layer, b + layer, a, b + layer, b);
    else triangles.push(a, b + layer, a + layer, a, b, b + layer);
  }
  for (let i = 0; i < triangles.length; i += 3) [triangles[i + 1], triangles[i + 2]] = [triangles[i + 2], triangles[i + 1]];
  return new kernel.Manifold(new kernel.Mesh({ numProp: 3,
    vertProperties: new Float32Array(positions), triVerts: new Uint32Array(triangles) }));
}
