import { Vector3 } from 'three/webgpu';
import type { Vec2 } from 'manifold-3d';
import { CONNECTOR, TRACK } from './marbleworks-spec';

import { cubicLoft, surfaceNormal, type Surface } from '../geometry/surfaces';
export { surfaceNormal, type Surface } from '../geometry/surfaces';
export { ShellMesh } from '../geometry/surface-mesh';
export type Meridian = (q: number) => { r: number; y: number; dr: number; dy: number; ddr: number; ddy: number };

/** A regular U section: flat bed, circular corners, and tangent drafted walls. */
const sectionFillet=5.5,sectionFlat=TRACK.channelInsideWidth/2-sectionFillet-.5;
export const channelFloorEdge=sectionFlat+sectionFillet;
export function channelFloorHeight(across:number){
  const r=Math.max(0,Math.abs(across)-sectionFlat);
  return sectionFillet-Math.sqrt(Math.max(0,sectionFillet**2-r**2));
}
function channelSection(u: number): Vec2 {
  const fillet = sectionFillet, flat = sectionFlat;
  const wall = TRACK.channelDepth - fillet;
  const halfLength = wall + fillet * Math.PI / 2 + flat;
  const s = 2 * Math.min(u, 1 - u) * halfLength;
  let z: number, y: number;
  if (s < wall) {
    const t = s / wall;
    z = TRACK.channelInsideWidth / 2 - 0.5 * t * t * (3 - 2 * t);
    y = TRACK.channelDepth - s;
  } else if (s < wall + fillet * Math.PI / 2) {
    const a = (s - wall) / fillet;
    z = flat + fillet * Math.cos(a); y = fillet * (1 - Math.sin(a));
  } else { z = halfLength - s; y = 0; }
  return [u <= 0.5 ? z : -z, y];
}

export function bowlPoint(meridian: Meridian, q: number, theta: number) {
  const p = meridian(q);
  return new Vector3(p.r * Math.cos(theta), p.y, p.r * Math.sin(theta));
}

export function bowlNormal(meridian: Meridian, q: number, theta: number) {
  const p = meridian(q);
  return new Vector3(-p.dy * Math.cos(theta), p.dr, -p.dy * Math.sin(theta)).normalize();
}

/** One loft replaces a cut-out sector of the bowl. There are no overlapping skins. */
export function funnelSurfaces(options: {
  meridian: Meridian; rimQ: number; inletX: number; inletZ: number;
  floor: (x: number) => number; rimRadius: number;
}) {
  const { meridian, rimQ, inletX, inletZ, floor, rimRadius } = options;
  const startX = -62;
  // A small concave fillet puts the inner rail's endpoint on the bowl beyond
  // the raw line/circle intersection, leaving room for the full shell wall.
  const innerFillet = 5, centerZ = inletZ + TRACK.channelInsideWidth / 2 + innerFillet;
  const centerX = -Math.sqrt((rimRadius + innerFillet) ** 2 - centerZ ** 2);
  const thetaA = Math.atan2(centerZ, centerX);
  const thetaB = -Math.PI / 2;
  const theta = (u: number) => thetaA + (thetaB - thetaA) * u;
  const cutQ = (u: number) => rimQ - 12 * Math.sin(Math.PI * u);
  const track: Surface = (t, u) => {
    const x = inletX + (startX - inletX) * t;
    const [z, h] = channelSection(u);
    return new Vector3(x, floor(x) + h, inletZ + z);
  };
  const slope = (floor(startX + 1) - floor(startX - 1)) / 2;
  const controls = (u: number) => {
    const a = track(1, u), q = cutQ(u), angle = theta(u);
    const p = meridian(q), c = bowlPoint(meridian, q, angle);
    const cq = new Vector3(p.dr * Math.cos(angle), p.dy, p.dr * Math.sin(angle));
    const ct = new Vector3(-p.r * Math.sin(angle), 0, p.r * Math.cos(angle));
    const dq = -16 * Math.sin(Math.PI * u), dt = (-20 + 40 * u) / rimRadius;
    const v0 = new Vector3(50, 50 * slope, 0);
    const v1 = cq.multiplyScalar(dq).addScaledVector(ct, dt);
    // Keep the inner cheek's Bezier handle outside the incoming channel.
    // Redirect within the bowl tangent plane, retaining a smooth shared seam.
    const blend = Math.max(0, Math.min(1, (u - 0.4) / 0.25));
    const weight = 1 - blend * blend * (3 - 2 * blend);
    if (weight > 0) {
      const excess = v1.z - 2.5 * (c.z - a.z);
      const correction = (excess + Math.hypot(excess, 3)) / 2;
      v1.addScaledVector(ct, weight * correction / -ct.z);
    }
    return [a, a.clone().addScaledVector(v0, 1 / 3), c.clone().addScaledVector(v1, -1 / 3), c];
  };
  const junction = cubicLoft(controls);
  return { track, junction, thetaA, thetaB, theta, cutQ };
}

/** Half-round edge connecting the running surface to its normal-offset underside. */
export function roundedEdge(position: (s: number) => Vector3, normal: (s: number) => Vector3,
  inward: (s: number) => Vector3): Surface {
  return (s, t) => {
    const n = normal(s), m = inward(s);
    m.addScaledVector(n, -m.dot(n)).normalize();
    const radius = CONNECTOR.wall / 2, angle = Math.PI * t;
    return position(s).addScaledVector(n, radius * (Math.cos(angle) - 1))
      .addScaledVector(m, -radius * Math.sin(angle));
  };
}
