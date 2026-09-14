import {slopeReceivingFloor} from './receiving-floor';
import { receivingCupProfile as cupProfile, receivingCupRadius as snakeCupRadius, buildReceivingCore } from './track-connector';
export { receivingCupRadius as snakeCupRadius } from './track-connector';
import { sweepSection } from '../geometry/sweep-section';
import * as THREE from 'three/webgpu';
import { circularBridge, profileEnvelope, type Surface } from '../geometry/surfaces';
import type { Join } from '../geometry/continuity';
import { cylinderNormals, angleWeightedNormals } from '../geometry/mesh-normals';
import { collapseShortEdges } from '../geometry/collapse-short-edges';
import { buildCSpigot } from './c-connector';
import { buildCollarMouth, collarMouthHeight } from './connector-mouth';
import { regularizeMesh, MESH_FLIP_TOLERANCE } from './regularize-mesh';
import { solidToGeometry } from './solid-geometry';
import type { Manifold, ManifoldToplevel, MeshOptions, Vec2 } from 'manifold-3d';
import { CONNECTOR, PART_UNITS, TRACK, arc, outerPostProfile,
  socketCoreProfile, troughProfiles } from './marbleworks-spec';

const meshTolerance = 0.01;
// Source recognition covers the pre-cleanup boolean facets, independently of
// how aggressively the final mesh is simplified.
const sourceSurfaceTolerance = 0.01;

// Four alternating near-three-quarter turns, fitted to D294044 and the photos.
// Scale follows the reviewed connector system, not a claimed factory dimension.
const bendRadius = PART_UNITS.portSpan / 4 - TRACK.channelInsideWidth / 2 - CONNECTOR.wall - 0.15;
const inletOverhang = bendRadius + TRACK.channelInsideWidth / 2 + CONNECTOR.wall - PART_UNITS.portSpan / 8;
// Solve the floor from the highest possible rim, including its rolled lip,
// slope and overhang. The connector's seating plane is the governing datum.
const landingFloor = CONNECTOR.shoulderHeight - TRACK.channelDepth - CONNECTOR.wall / 2
  - TRACK.runDrop * inletOverhang / PART_UNITS.portSpan - 0.05;
export const SNAKE_RAMP = {
  portSpan: PART_UNITS.portSpan,
  // Same-side lobes stay distinct; a local blend closes their 0.3 mm separation.
  // The previous radius made those lips overlap and cut across one another.
  radius: bendRadius,
  inletFloor: landingFloor,
  seatClearance: 0.05,
  turns: 4,
} as const;
const radius = SNAKE_RAMP.radius;
const step = PART_UNITS.portSpan / 4;
const offset = Math.sqrt(radius ** 2 - (step / 2) ** 2);
const halfAngle = Math.atan2(offset, step / 2);
const angleSpan = Math.PI + 2 * halfAngle;
export const snakeFloor = (x: number) => SNAKE_RAMP.inletFloor - TRACK.runDrop * (x / PART_UNITS.portSpan + 0.5);
export const snakeBendCenter = (i: number) => ({
  x: -PART_UNITS.portSpan / 2 + step * (i + 0.5),
  z: (i % 2 === 0 ? 1 : -1) * offset,
});
const arcLength = radius * angleSpan;
export const SNAKE_LENGTH = arcLength * 4;

export function sampleSnake(distance: number) {
  const s = THREE.MathUtils.clamp(distance, 0, SNAKE_LENGTH);
  const i = Math.min(3, Math.floor(s / arcLength));
  const sign = i % 2 === 0 ? -1 : 1;
  const start = i % 2 === 0 ? -Math.PI + halfAngle : Math.PI - halfAngle;
  const a = start + sign * (s - i * arcLength) / radius;
  const center = snakeBendCenter(i);
  const x = center.x + radius * Math.cos(a);
  return {
    x,
    z: center.z + radius * Math.sin(a),
    dx: -sign * Math.sin(a), dz: sign * Math.cos(a),
    height: snakeFloor(x),
  };
}

// Revolve the channel's actual inside wall: matching radii make the cup and
// the start of the swept channel tangent, rather than two intersecting skins.
/** End positions come from the curved channel, not an arbitrary half-circle. */
function trackMouthAngles(midRadius: number): [number, number] {
  const w = (TRACK.channelInsideWidth + CONNECTOR.wall) / 2;
  return [radius - w, radius + w].map(receiver => Math.acos(THREE.MathUtils.clamp(
    (midRadius ** 2 + radius ** 2 - receiver ** 2) / (2 * midRadius * radius), -1, 1)) - Math.PI / 2) as [number, number];
}
export const snakeMouthEnds = (_end: number) => trackMouthAngles((CONNECTOR.maleDiameter - CONNECTOR.wall) / 2);
export function snakeConnectorSection(end: number) {
  const path = sampleSnake(end === 0 ? 0 : SNAKE_LENGTH), sign = end === 0 ? 1 : -1;
  const ends = trackMouthAngles((CONNECTOR.maleDiameter - CONNECTOR.wall) / 2);
  return { opening: ends[1] - ends[0], direction: Math.atan2(sign * path.dz, sign * path.dx) + (ends[0] + ends[1]) / 2 };
}

const channelWidth = profileEnvelope(troughProfiles({ roundedOpening: true }).inner);
export function snakeMouthBore(end: number, h: number, y: number, angle: number) {
  const cup = end === 0 ? snakeCupRadius(Math.max(0, Math.min(100, h)))
    : 12.1 - 1.6 * THREE.MathUtils.clamp((y - 46.6) / 0.4, 0, 1);
  if (Math.cos(angle) < 0) return cup;
  const w = channelWidth(Math.max(0, Math.min(100, h)));
  // The receiver is the cup PLUS the curved channel, not just the cup circle.
  const path = sampleSnake(end === 0 ? 0 : SNAKE_LENGTH), sign = end === 0 ? 1 : -1;
  const direction = Math.atan2(sign * path.dz, sign * path.dx);
  const center = snakeBendCenter(end), postX = sign * -PART_UNITS.portSpan / 2;
  const beta = angle + direction - Math.atan2(center.z, center.x - postX);
  const projection = radius * Math.cos(beta), perpendicular2 = radius ** 2 - projection ** 2;
  let boundary = projection + Math.sqrt(Math.max(0, (radius + w) ** 2 - perpendicular2));
  const discriminant = (radius - w) ** 2 - perpendicular2;
  if (discriminant >= 0 && projection - Math.sqrt(discriminant) > 0)
    boundary = Math.min(boundary, projection - Math.sqrt(discriminant));
  // Regions where the channel removes the entire post have no exposed mouth.
  const blend = 0.8 * THREE.MathUtils.smoothstep(h, 0, 1) * THREE.MathUtils.smoothstep(Math.cos(angle), 0, 0.2);
  const overlap = Math.max(0, blend - Math.abs(cup - boundary));
  const joined = Math.min(13.4, Math.max(cup, boundary) + (blend > 0 ? overlap * overlap / (4 * blend) : 0));
  // The core ends at the rim crest. Complete its runout BEFORE that boundary;
  // fading above it left an enlarged cavity abruptly capped beneath the flange.
  const crest = TRACK.channelDepth + CONNECTOR.wall / 2;
  return THREE.MathUtils.lerp(joined, cup, THREE.MathUtils.smoothstep(h, crest - 3, crest));
}

const outerProfile = troughProfiles().outer;
const edges = outerProfile.map((a, i) => {
    const b = outerProfile[(i + 1) % outerProfile.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    return { a, b, dx, dy, length2: dx * dx + dy * dy };
  });
const sectionDistance = (x: number, y: number) => {
    let distance2 = Infinity, inside = false;
    for (const { a, b, dx, dy, length2 } of edges) {
      const t = THREE.MathUtils.clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (length2 || 1), 0, 1);
      distance2 = Math.min(distance2, (x - a[0] - t * dx) ** 2 + (y - a[1] - t * dy) ** 2);
      if ((a[1] > y) !== (b[1] > y) && x < a[0] + dx * (y - a[1]) / dy) inside = !inside;
    }
    return Math.sqrt(distance2) * (inside ? -1 : 1);
  };

const outerWidth = profileEnvelope(outerProfile);

/** A part recipe: dimensions and placement; all blend construction is shared. */
export function snakeBridgeSurfaces(end: 0 | 3, trackAttachment = false) {
  const postX = (end === 0 ? -1 : 1) * PART_UNITS.portSpan / 2;
  const center = snakeBendCenter(trackAttachment ? end : end === 0 ? 1 : 2);
  const distance = Math.hypot(center.x - postX, center.z);
  const ux = (center.x - postX) / distance, uz = center.z / distance;
  const height = (v: number) => 2.5 + (TRACK.channelDepth + CONNECTOR.wall / 2 - 2.5) * v;
  const inset = (v: number) => height(v) > TRACK.channelDepth
    ? TRACK.channelInsideWidth / 2 + CONNECTOR.wall - outerWidth(height(v)) : 0;
  const options = {
    distance, height,
    firstRadius: (v: number) => CONNECTOR.postDiameter / 2 - inset(v),
    secondRadius: (v: number) => radius + outerWidth(height(v)),
    filletRadius: (v: number) => (trackAttachment ? 3 : 7) + inset(v),
    transform: (p: THREE.Vector3) => {
      const x = postX + ux * p.x - uz * p.z;
      return new THREE.Vector3(x, snakeFloor(x) + p.y, uz * p.x + ux * p.z);
    },
  };
  const upper = circularBridge({ ...options, side: 1 });
  const lower = circularBridge({ ...options, side: -1 });
  const joins: Join[] = [];
  for (const [name, patch, sign] of [['front', upper, 1], ['back', lower, -1]] as const) {
    // Above the wall, the rolled lip goes inside the post and is trimmed.
    // Only the exposed cylinder contact is a surface-continuity boundary.
    const wall = (surface: Surface): Surface => (u, v) => surface(u, v * (TRACK.channelDepth - 2.5) / (TRACK.channelDepth + CONNECTOR.wall / 2 - 2.5));
    joins.push({ name: `Snake ${end} ${name}: bridge / post`, expected: 'G1',
      a: { surface: wall(patch.surface), edge: 'u0', normalSign: sign },
      b: { surface: wall(patch.firstReceiver), edge: 'u0', normalSign: sign } });
    joins.push({ name: `Snake ${end} ${name}: bridge / band`, expected: 'G1',
      a: { surface: patch.surface, edge: 'u1', normalSign: sign },
      b: { surface: patch.secondReceiver, edge: 'u0', normalSign: -sign } });
  }
  return { upper, lower, joins };
}

export function buildSnakePatches(kernel: ManifoldToplevel, kind: 'middle' | 'end') {
  const M = kernel.Manifold;
  const garbage: { delete(): void }[] = [];
  const keep = <T extends { delete(): void }>(value: T): T => { garbage.push(value); return value; };
  const inlet = -PART_UNITS.portSpan / 2, outlet = -inlet;
  const bodies: Manifold[] = [];
  // Signed distance to the actual molded section, including the curved
  // underside and rolled lip. Blend these surfaces in 3D, not a capped bridge.
  let contactTemplate: Manifold | undefined;
  for (const i of kind === 'middle' ? [0, 1] : []) {
    const left = snakeBendCenter(i), right = snakeBendCenter(i + 2);
    const mid = (left.x + right.x) / 2;
    const contact = contactTemplate ??= keep(M.levelSet(([x, h, z]) => {
      const a = sectionDistance(Math.hypot(x + step, z) - radius, h);
      const b = sectionDistance(Math.hypot(x - step, z) - radius, h);
      const blend = 2;
      const t = Math.max(blend - Math.abs(a - b), 0) / blend;
      // Outside the actual blend, sink the patch beneath the existing
      // tessellated wall. Coincident analytic/faceted skins create slivers.
      const distance = Math.min(a, b) - blend * t * t / 4 + 0.02 * (1 - t) ** 2;
      // The upper surface stays on the shared slope. All other surfaces flow
      // continuously into the existing section; there is no bridge floor/cap.
      return -Math.max(distance, h - (TRACK.channelDepth + .75));
    }, { min: [-4, -2.5, -11], max: [4, TRACK.channelDepth + 1.25, 11] }, 0.24, 0, 0.0001));
    bodies.push(keep(contact.warp(v => {
      v[0] += mid;
      v[1] += snakeFloor(v[0]);
      v[2] += left.z;
    })));
  }
  // A rolling-circle fillet connects the post and neighboring band's outer
  // circle on BOTH sides. The two concave arcs are tangent to both bodies;
  // this produces the neck in the original, rather than an added curved strip.
  for (const [end, trackAttachment] of kind === 'end' ? [[0, false], [3, false], [0, true], [3, true]] as const : []) {
    const { upper, lower } = snakeBridgeSurfaces(end, trackAttachment);
    const heights = [...new Set([...outerProfile.map(p => p[1]),
      ...Array.from({ length: 33 }, (_, i) => 2.5 + (TRACK.channelDepth - 1.75) * i / 32)].filter(h => h >= 2.5).map(h => Math.round(h * 1e6) / 1e6))].sort((a, b) => a - b);
    const segments = 64, rowSize = 2 * (segments + 1);
    const vertices: number[] = [], triangles: number[] = [];
    for (const h of heights) {
      const v = (h - 2.5) / (TRACK.channelDepth + CONNECTOR.wall / 2 - 2.5);
      for (const [surface, reverse] of [[upper.surface, false], [lower.surface, true]] as const)
        for (let j = 0; j <= segments; j++) {
          const p = surface((reverse ? segments - j : j) / segments, v);
          vertices.push(p.x, p.y, p.z);
        }
    }

    for (let row = 0; row < heights.length - 1; row++) for (let j = 0; j < rowSize; j++) {
      const a = row * rowSize + j, b = row * rowSize + (j + 1) % rowSize;
      triangles.push(a, b, b + rowSize, a, b + rowSize, a + rowSize);
    }
    for (const row of [0, heights.length - 1]) {
      const offset = row * rowSize;
      const points = Array.from({ length: rowSize }, (_, j) =>
        new THREE.Vector2(vertices[(offset + j) * 3], vertices[(offset + j) * 3 + 2]));
      for (const face of THREE.ShapeUtils.triangulateShape(points, [])) {
        let [a, b, c] = face.map(i => offset + i);
        const crossY = (vertices[b * 3 + 2] - vertices[a * 3 + 2]) * (vertices[c * 3] - vertices[a * 3])
          - (vertices[b * 3] - vertices[a * 3]) * (vertices[c * 3 + 2] - vertices[a * 3 + 2]);
        if ((crossY > 0) !== (row !== 0)) [b, c] = [c, b];
        triangles.push(a, b, c);
      }
    }
    const patch = keep(new M(new kernel.Mesh({ numProp: 3,
      vertProperties: new Float32Array(vertices), triVerts: new Uint32Array(triangles) })));
    if (trackAttachment) {
      // The receiver is a PARTIAL arc. Only its entrance/exit side exists;
      // the other solution for two complete circles would protrude behind the post.
      const path = sampleSnake(end === 0 ? 0 : SNAKE_LENGTH);
      const sign = end === 0 ? 1 : -1;
      const normal: [number, number, number] = [sign * path.dx, 0, sign * path.dz];
      bodies.push(keep(patch.trimByPlane(normal, normal[0] * path.x + normal[2] * path.z)));
    } else bodies.push(patch);
  }
  // Caller owns the transformed solids; discard only construction intermediates.
  garbage.filter(value => !bodies.includes(value as Manifold)).reverse().forEach(value => value.delete());
  return bodies;
}

/** One continuous void boundary at the cup/channel intersection. */
function buildMouthCore(kernel: ManifoldToplevel, end: number) {
  const path = sampleSnake(end === 0 ? 0 : SNAKE_LENGTH), sign = end === 0 ? 1 : -1;
  const px = sign * -PART_UNITS.portSpan / 2, direction = Math.atan2(sign * path.dz, sign * path.dx);
  return buildReceivingCore(kernel, { x: px, z: 0, direction, floor: snakeFloor,
    radius: (h, y, angle) => snakeMouthBore(end, h, y, angle) });
}

export function buildSnakeSolid(kernel: ManifoldToplevel, report: (stage: string) => void = () => {}, preparedPatches?: MeshOptions[]) {
  const { Manifold: M, CrossSection } = kernel;
  const garbage: { delete(): void }[] = [];
  const keep = <T extends { delete(): void }>(value: T): T => { garbage.push(value); return value; };
  const section = (profile: Vec2[]) => keep(new CrossSection(profile, 'NonZero'));
  const lathe = (profile: Vec2[], x: number) => {
    const raw = keep(section(profile).revolve(192));
    return keep(keep(raw.rotate([-90, 0, 0])).translate([x, 0, 0]));
  };
  // Each turn is a valid swept mold. Apply the same world-space slope to
  // every vertex, including both lips, rather than dropping by travel distance.
  const sweep = (profile: Vec2[], i: number) => {
    return keep(sweepSection(kernel, profile, arcLength, 224, v => {
      const [across, height, along] = v;
      const p = sampleSnake(i * arcLength + along);
      v[0] = p.x + p.dz * across;
      v[1] = snakeFloor(v[0]) + height;
      v[2] = p.z - p.dx * across;
    }));
  };
  const inlet = -PART_UNITS.portSpan / 2, outlet = -inlet;
  const profiles = troughProfiles({ roundedOpening: true });
  const bodies = Array.from({ length: 4 }, (_, i) => sweep(profiles.outer, i));
  const boundedCore = profiles.inner.map(([r, h]): Vec2 => [r, Math.min(h, TRACK.channelDepth + .75)]);
  const cores = Array.from({ length: 4 }, (_, i) => sweep(boundedCore, i));
  report('sweeps');
  for (const patch of preparedPatches ?? [
    ...buildSnakePatches(kernel, 'middle'), ...buildSnakePatches(kernel, 'end'),
  ]) bodies.push(keep('getMesh' in patch ? patch : new M(new kernel.Mesh(patch))));
  report('blends');
  // Shape the cylindrical collar before adding the track. The receiving core
  // constructs their interior transition separately.
  const mouthCores: Manifold[] = [];
  const posts = [0, 3].map(end => {
    const path = sampleSnake(end === 0 ? 0 : SNAKE_LENGTH), sign = end === 0 ? 1 : -1;
    const x = end === 0 ? inlet : outlet;
    const mouth = keep(buildCollarMouth(kernel, x, Math.atan2(sign * path.dz, sign * path.dx),
      snakeFloor, end === 0 ? 10.5 : 12.1, snakeMouthEnds(end)));
    // Apply the inside half to the final union as well. Otherwise the bridge
    // adds material back over the rounded interior edge. Its outer boundary
    // is at the crest of the roll, above all track bodies, so it leaves no seam.
    mouthCores.push(keep(buildCollarMouth(kernel, x, Math.atan2(sign * path.dz, sign * path.dx),
      snakeFloor, end === 0 ? 10.5 : 12.1, snakeMouthEnds(end), true)));
    return keep(lathe(outerPostProfile(), x).subtract(mouth));
  });
  const outside = keep(M.union([...bodies, ...posts]));
  // The landing cup and channel must share one floor plane. A level cup
  // intersected with the sloping channel leaves a crescent-shaped crease.
  // The upper cup section is already a constant-radius bore before the seat.
  const cup = keep(lathe(cupProfile, inlet).warp(v => { v[1] += snakeFloor(v[0]); }));
  const inside = keep(M.union([...cores, ...mouthCores, keep(buildMouthCore(kernel, 0)), keep(buildMouthCore(kernel, 3)), cup,
    lathe(socketCoreProfile(SNAKE_RAMP.inletFloor - CONNECTOR.wall), inlet),
    lathe(socketCoreProfile(), outlet)]));
  const carved = keep(outside.subtract(inside));
  // The upper connector owns its opening and bore as a single rounded shell.
  // Keep track cutters below the seating plane so they cannot shave its edges.
  const lower = keep(carved.trimByPlane([0, -1, 0], -CONNECTOR.shoulderHeight));
  const cut = keep(M.union([lower, ...[0, 3].map(end => {
    const path = sampleSnake(end === 0 ? 0 : SNAKE_LENGTH);
    const { direction, opening } = snakeConnectorSection(end);
    return keep(buildCSpigot(kernel, end === 0 ? inlet : outlet, direction, opening));
  })]));
  // Coincident rounded lips can leave zero-volume sheets in the boolean.
  // Discard only sub-0.0001 mm³ numerical debris; larger detached geometry is an error.
  const parts = cut.decompose();
  report('booleans');
  parts.sort((a, b) => b.volume() - a.volume());
  const result = parts[0];
  const detached = parts.slice(1).some(part => Math.abs(part.volume()) > 1e-4);
  parts.slice(1).forEach(part => part.delete());
  if (detached) {
    result.delete();
    garbage.reverse().forEach(value => value.delete());
    throw new Error('Disconnected snake rim geometry');
  }
  garbage.reverse().forEach(value => value.delete());
  // Remove numerical zero-area remnants before Float32 rendering/normals.
  // Discard construction-face IDs so coplanar joins can actually be merged,
  // rather than retaining invisible boolean boundaries as sliver triangles.
  const unified = result.asOriginal();
  const firstPass = unified.simplify(meshTolerance);
  const cleaned = firstPass.simplify(meshTolerance);
  firstPass.delete();
  unified.delete();
  result.delete();
  const regular = regularizeMesh(cleaned.getMesh(), points => {
    for (const postX of [inlet, outlet]) {
      if (points.every(p => Math.abs(Math.hypot(p[0] - postX, p[2]) - CONNECTOR.postDiameter / 2) < 0.0025)) return `post-${postX}`;
    }
    return undefined;
  });
  // Boolean trim vertices can become nearly coincident after the Float32
  // round-trip. Use the surface tolerance for topology-safe
  // edge collapse rather than retaining numerically degenerate trim slivers.
  const resultMesh = new M(new kernel.Mesh(collapseShortEdges(regular.mesh, sourceSurfaceTolerance)));
  cleaned.delete();
  const finalParts = resultMesh.decompose().sort((a, b) => b.volume() - a.volume());
  resultMesh.delete();
  if (finalParts.slice(1).some(part => Math.abs(part.volume()) > 1e-4)) {
    finalParts.forEach(part => part.delete());
    throw new Error('Cleanup detached a non-negligible part');
  }
  finalParts.slice(1).forEach(part => part.delete());
  report('cleanup');
  const path=sampleSnake(0);
  const landed=slopeReceivingFloor(kernel,finalParts[0],{x:inlet,z:0,dx:path.dx,dz:path.dz,floor:snakeFloor});
  finalParts[0].delete();return landed;
}

function coreNormalSource(end: number) {
  const path = sampleSnake(end === 0 ? 0 : SNAKE_LENGTH), sign = end === 0 ? 1 : -1;
  const px = sign * -PART_UNITS.portSpan / 2, direction = Math.atan2(sign * path.dz, sign * path.dx);
  const surface = (h: number, angle: number) => {
    const r = snakeMouthBore(end, h, snakeFloor(px) + h, angle);
    const x = px + r * Math.cos(angle + direction);
    return new THREE.Vector3(x, snakeFloor(x) + h, r * Math.sin(angle + direction));
  };
  const cache = new Map<string, { gap: number; normal: THREE.Vector3 }>();
  const sample = (p: THREE.Vector3) => {
    const key = p.toArray().join(','), cached = cache.get(key); if (cached) return cached;
    const h = p.y - snakeFloor(p.x), angle = Math.atan2(p.z, p.x - px) - direction, e = 0.00001;
    const normal = surface(h, angle + e).sub(surface(h, angle - e))
      .cross(surface(h + e, angle).sub(surface(h - e, angle))).normalize();
    const result = { gap: surface(h, angle).distanceTo(p), normal }; cache.set(key, result); return result;
  };
  return {
    matches: (points: THREE.Vector3[], face: THREE.Vector3) => points.every(p => {
      const h = p.y - snakeFloor(p.x), r = Math.hypot(p.x - px, p.z);
      if (h < 0.001 || h > 13.99 || r > 13.42) return false;
      const hit = sample(p); return hit.gap < 0.012 && hit.normal.dot(face) > 0.8;
    }),
    normal: (p: THREE.Vector3) => sample(p).normal,
  };
}

function mouthNormalSource(end: number) {
  const path = sampleSnake(end === 0 ? 0 : SNAKE_LENGTH), sign = end === 0 ? 1 : -1;
  const px = sign * -PART_UNITS.portSpan / 2, inner = end === 0 ? 10.5 : 12.1;
  const direction = Math.atan2(sign * path.dz, sign * path.dx);
  const surface = (r: number, angle: number) => {
    const h = collarMouthHeight(r, angle, 0, inner, snakeMouthEnds(end));
    const x = px + r * Math.cos(angle + direction);
    return new THREE.Vector3(x, snakeFloor(x) + h, r * Math.sin(angle + direction));
  };
  const cache = new Map<string, { gap: number; normal: THREE.Vector3 }>();
  const project = (p: THREE.Vector3) => {
    const key = p.toArray().join(',');
    const cached = cache.get(key); if (cached) return cached;
    const angle = Math.atan2(p.z, p.x - px) - direction, radius = Math.hypot(p.x - px, p.z);
    let low = inner + 0.000001, high = 13.5 - 0.000001;
    for (let i = 0; i < 28; i++) {
      const mid = (low + high) / 2, q = surface(mid, angle);
      if (Math.hypot(q.x - px, q.z) < radius) low = mid; else high = mid;
    }
    const r = (low + high) / 2, q = surface(r, angle), e = 0.0000001;
    const normal = surface(r + e, angle).sub(surface(r - e, angle))
      .cross(surface(r, angle + e).sub(surface(r, angle - e))).normalize();
    if (normal.y < 0) normal.negate();
    const result = { gap: q.distanceTo(p), normal }; cache.set(key, result); return result;
  };
  return {
    matches: (points: THREE.Vector3[], face: THREE.Vector3) => points.every(p => {
      const radius = Math.hypot(p.x - px, p.z), h = p.y - snakeFloor(p.x);
      // Leave shared cylinder-boundary vertices owned by the existing cylinder
      // source; this source supplies the curved mouth's interior normals.
      if (radius < inner - 0.6 || radius > 13.5 - 3 * sourceSurfaceTolerance
        || h < 9.99 || h > 13.1 || p.y > 46.59) return false;
      const hit = project(p);
      return hit.gap < 0.025 && hit.normal.dot(face) > 0.8;
    }),
    normal: (p: THREE.Vector3) => project(p).normal,
  };
}

export function snakeSolidToGeometry(solid: Manifold) {
  return applySnakeNormals(solidToGeometry(solid));
}

export function applySnakeNormals(geometry: THREE.BufferGeometry) {
  const floorNormal = new THREE.Vector3(TRACK.runDrop / PART_UNITS.portSpan, 1, 0).normalize();
  return angleWeightedNormals(geometry, [
    ...[-PART_UNITS.portSpan / 2, PART_UNITS.portSpan / 2].map(x => cylinderNormals({
      x, radius: CONNECTOR.postDiameter / 2, faceAlignment: 0.9,
      tolerance: 2 * sourceSurfaceTolerance + MESH_FLIP_TOLERANCE + CONNECTOR.postDiameter / 2 * (1 - Math.cos(Math.PI / 192)),
    })),
    ...[-PART_UNITS.portSpan / 2, PART_UNITS.portSpan / 2].map(x => cylinderNormals({
      x, radius: CONNECTOR.socketDiameter / 2, inward: true, boundaryPriority: 1,
      minY: 0.399, maxY: CONNECTOR.shoulderHeight - 0.399,
      tolerance: 2 * sourceSurfaceTolerance + MESH_FLIP_TOLERANCE,
    })),
    mouthNormalSource(0), mouthNormalSource(3), coreNormalSource(0), coreNormalSource(3),
    ...[0, TRACK.channelDepth + CONNECTOR.wall / 2].map(height => ({
      matches: (points: THREE.Vector3[], normal: THREE.Vector3) => normal.dot(floorNormal) > 0.9999
        && points.every(p => Math.abs(p.y - snakeFloor(p.x) - height) < 0.002),
      normal: () => floorNormal.clone(),
    })),
  ]);
}
