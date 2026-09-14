import {slopeReceivingFloor} from './receiving-floor';
import { sweepSection } from '../geometry/sweep-section';
import * as THREE from 'three/webgpu';
import type { Manifold, ManifoldToplevel, Vec2 } from 'manifold-3d';
import { buildCSpigot, buildCSpigotSeat } from './c-connector';
import { angleWeightedNormals, cylinderNormals } from '../geometry/mesh-normals';
import { solidToGeometry } from './solid-geometry';
import { collapseShortEdges } from '../geometry/collapse-short-edges';
import { regularizeMesh } from './regularize-mesh';
import { arc, CONNECTOR, PART_UNITS, inletCupProfile, outerPostProfile, socketCoreProfile,
  spanAlongTrack, TRACK, troughProfiles } from './marbleworks-spec';

// Reconstruction dimensions in mm, not factory measurements. The original
// No.142 photographs and patent views are linked in the reference document.
export const STANDARD_RAMP = {
  ...CONNECTOR,
  centersAlongTrack: spanAlongTrack(24), centersAcrossTrack: 24,
  spiralCenterRadius: 24, terminalCenterRadius: 10.5,
  channelInsideWidth: TRACK.channelInsideWidth, channelDepth: TRACK.channelDepth,
  // The rolled rail crest, rather than the unrounded wall, meets the seat.
  straightStartHeight: TRACK.inletFloor - CONNECTOR.wall / 2,
  straightEndHeight: TRACK.inletFloor - CONNECTOR.wall / 2 - TRACK.runDrop + 5,
  spiralEndHeight: TRACK.inletFloor - CONNECTOR.wall / 2 - TRACK.runDrop,
} as const;

// Two internally tangent arcs. The smaller arc's center is chosen so that its
// last tangent is +X on Z=0: the channel points directly into the outlet bore.
const largeRadius = STANDARD_RAMP.spiralCenterRadius;
const smallRadius = STANDARD_RAMP.terminalCenterRadius;
const terminalX = -Math.sqrt(largeRadius ** 2 - 2 * largeRadius * smallRadius);
const joinAngle = Math.atan2(smallRadius, terminalX);
const broadLength = largeRadius * (joinAngle + Math.PI / 2);
const tightLength = smallRadius * (Math.PI * 1.5 - joinAngle);
const bentLength = broadLength + tightLength;
export const COIL_LENGTH = bentLength - terminalX;

export function sampleCoil(distance: number) {
  const s = THREE.MathUtils.clamp(distance, 0, COIL_LENGTH);
  let x: number, z: number, dx: number, dz: number;
  if (s <= broadLength) {
    const a = -Math.PI / 2 + s / largeRadius;
    x = largeRadius * Math.cos(a); z = largeRadius * Math.sin(a);
    dx = -Math.sin(a); dz = Math.cos(a);
  } else if (s <= bentLength) {
    const a = joinAngle + (s - broadLength) / smallRadius;
    x = terminalX + smallRadius * Math.cos(a); z = smallRadius + smallRadius * Math.sin(a);
    dx = -Math.sin(a); dz = Math.cos(a);
  } else {
    x = terminalX + s - bentLength; z = 0; dx = 1; dz = 0;
  }
  const t = Math.min(1, s / bentLength);
  const h0 = STANDARD_RAMP.straightEndHeight, h1 = STANDARD_RAMP.spiralEndHeight;
  const slope = (h0 - STANDARD_RAMP.straightStartHeight) / (STANDARD_RAMP.centersAlongTrack - 7);
  const height = (2 * t ** 3 - 3 * t ** 2 + 1) * h0 + (-2 * t ** 3 + 3 * t ** 2) * h1
    + (t ** 3 - 2 * t ** 2 + t) * slope * bentLength;
  return { x, z, dx, dz, height };
}

/** Construct the outside mold, then remove the connected channel/socket cores. */
export function buildRampSolid(kernel: ManifoldToplevel, options: { elevation?: (x: number) => number; bendEdgeLength?: number; channelPath?: { inletRise: number; start: number; end: number; map: (x:number,height:number)=>{x:number;y:number} } } = {}) {
  const { Manifold: M, CrossSection } = kernel;
  const d = STANDARD_RAMP;
  const garbage: { delete(): void }[] = [];
  const keep = <T extends { delete(): void }>(v: T): T => { garbage.push(v); return v; };
  const section = (points: Vec2[]) => keep(new CrossSection(points, 'NonZero'));
  const inletX = -d.centersAlongTrack / 2, outletX = -inletX;
  const outer = d.postDiameter / 2;
  const opening = 2 * Math.asin(TRACK.channelInsideWidth / CONNECTOR.maleDiameter);
  const lathe = (profile: Vec2[], x: number, z: number) => {
    const raw = keep(section(profile).revolve(192));
    const turned = keep(raw.rotate([-90, 0, 0]));
    return keep(turned.translate([x, 0, z]));
  };
  const raised = (solid: ReturnType<typeof lathe>, x:number) => options.channelPath && x===inletX
    ? keep(solid.translate([0,options.channelPath.inletRise,0])) : solid;
  const outerPost = (x: number, z: number) => raised(options.channelPath ? keep(lathe(outerPostProfile(), x, z).trimByPlane([0,-1,0],-CONNECTOR.shoulderHeight)) : lathe(outerPostProfile(), x, z),x);
  const socketCore = (x: number, z: number, top = CONNECTOR.postHeight+1) => raised(lathe(socketCoreProfile(top, x === outletX ? PART_UNITS.insertionDepth : CONNECTOR.shoulderHeight), x, z),x);
  const mainFloor = (x: number) => THREE.MathUtils.lerp(d.straightStartHeight, d.straightEndHeight,
    THREE.MathUtils.clamp((x - inletX - 7) / (outletX - inletX - 7), 0, 1));
  const trough = (profile: Vec2[], start: number, end: number) => {
    return keep(sweepSection(kernel, profile, end - start, options.channelPath ? Math.ceil((end-start)/.25) : 100, v => {
      const [across, height, along] = v;
      // This rotation has positive determinant, preserving the solid winding.
      const x=start+along;
      const p=options.channelPath?.map(x,height);
      v[0] = p?.x ?? x; v[1] = p?.y ?? height+mainFloor(x); v[2] = -24-across;
    }));
  };
  const { outer: outerTrough, inner: innerTrough } = troughProfiles({ roundedOpening: true });
  // Begin with exactly the straight channel's section. Ease into the coil's
  // asymmetric inner fillet downstream, with zero change of section at the join.
  const coilProfile = innerTrough;

  // The underside photo shows a full circular shell, joined to the straight
  // with an integral web. The inner channel curls into the post within it.
  const rimHeight = d.straightEndHeight + TRACK.channelDepth;
  const bowlBase = d.spiralEndHeight - 4.75;
  const trayOuterRaw = lathe([[0, bowlBase], [13.5, bowlBase],
    ...arc(17.5, bowlBase, 4, Math.PI, Math.PI / 2), [28, bowlBase + 4],
    ...arc(28, bowlBase + 11, 7, -Math.PI / 2, 0), [35.5, rimHeight],
    ...arc(34.75, rimHeight, 0.75, 0, Math.PI), [0, rimHeight]], outletX, 0);
  const trayOuter = keep(trayOuterRaw.warp(v => {
    const x = v[0] - outletX, angle = Math.atan2(v[2], x) + Math.PI / 2;
    const distance = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) * largeRadius;
    const entryWeight = 1 - THREE.MathUtils.smoothstep(distance, 0, largeRadius / 2);
    const rimWeight = THREE.MathUtils.smoothstep(v[1], rimHeight - 3, rimHeight - 1);
    const slope = (d.straightEndHeight - d.straightStartHeight) / (d.centersAlongTrack - 7);
    v[1] += slope * x * entryWeight * rimWeight;
  }));
  const warpCoil = (v: number[]) => {
    const [sourceAcross, sourceHeight, along] = v;
    const blend = THREE.MathUtils.smoothstep(along, 0, largeRadius / 2);
    let targetAcross = THREE.MathUtils.clamp(sourceAcross, -10, 10), targetHeight = sourceHeight;
    if (sourceAcross < -4 && sourceHeight <= 5.5) {
      targetAcross = -4 + (sourceAcross + 4) * 6 / 5.5;
      targetHeight = sourceHeight * 6 / 5.5;
    } else if (sourceAcross < -4 && sourceHeight < TRACK.channelDepth) {
      targetAcross = -10;
      targetHeight = 6 + (sourceHeight - 5.5) * (TRACK.channelDepth - 6) / (TRACK.channelDepth - 5.5);
    }
    const across = THREE.MathUtils.lerp(sourceAcross, targetAcross, blend);
    const height = THREE.MathUtils.lerp(sourceHeight, targetHeight, blend);
    const p = sampleCoil(along);
    // +across is the outside of the bend. At the tight turn the inside
    // offset still has positive radius (10.5 - 10 = 0.5 mm).
    let x = p.x + p.dz * across, z = p.z - p.dx * across;
    let innerRise = 0;
    if (across < -4) {
      // One quarter-circle joins the flat bed directly to the vertical post.
      // On the broad arc its radius is 6.5 mm; no extra cheek or S-bend.
      // Apply the correction radially so the tight terminal turn cannot fold.
      const edgeRadius = Math.hypot(p.x - 10 * p.dz, p.z + 10 * p.dx);
      const extraRadius = Math.max(0, edgeRadius - outer) * blend;
      const scale = 1 - extraRadius * (-across - 4) / 6 / Math.hypot(x, z);
      x *= scale; z *= scale;
      innerRise = extraRadius * Math.min(height / 6, 1);
    }
    v[0] = outletX + x;
    const entrySlope = (d.straightEndHeight - d.straightStartHeight) / (d.centersAlongTrack - 7);
    v[1] = p.height + height + innerRise + (1 - blend) * entrySlope * (x - p.x);
    v[2] = z;
  };
  const coilCore = keep(sweepSection(kernel, coilProfile, COIL_LENGTH, Math.ceil(COIL_LENGTH / 0.35), warpCoil));
  // The incoming rolled divider needs an outside skin through the transition;
  // a cutter alone cannot create its crest above the bowl's flat mold cap.
  const dividerProfile: Vec2[] = [];
  outerTrough.forEach((a, i) => {
    const b = outerTrough[(i + 1) % outerTrough.length];
    if (a[0] <= 0) dividerProfile.push(a);
    if ((a[0] < 0 && b[0] > 0) || (a[0] > 0 && b[0] < 0))
      dividerProfile.push([0, a[1] + (b[1] - a[1]) * -a[0] / (b[0] - a[0])]);
  });
  const entryShell = keep(sweepSection(kernel, dividerProfile, largeRadius / 2, 48, warpCoil));
  const entranceBody = outerPost(inletX, -24);
  const exitBody = outerPost(outletX, 0);
  const fullStraightBody = trough(outerTrough, inletX, outletX);
  const shellSection=options.channelPath ? keep(section(outerTrough).subtract(section(innerTrough))) : undefined;
  const straightBody = shellSection ? trough(shellSection.toPolygons()[0], inletX, outletX) : fullStraightBody;
  const outside = keep(M.union([entranceBody, exitBody,
    straightBody, trayOuter, entryShell]));

  // The inlet cup has a rounded floor and an open socket beneath it. Its
  // upper core merges with the trough core, rather than overlaying a tongue.
  const cup = raised(lathe(inletCupProfile(d.straightStartHeight, true), inletX, -24),inletX);
  const slot = (x: number, z: number, angle: number, floor: number) => {
    const profile: Vec2[] = [[0, 0], ...arc(0, 0, 19, angle - 0.84, angle + 0.84)];
    const raw = keep(section(profile).extrude(70));
    const turned = keep(raw.rotate([-90, 0, 0]));
    return keep(turned.translate([x, floor, z]));
  };
  // The incoming trough's inner cheek remains as a divider through the tray
  // and joins the outlet column. The bowl core must not cut that cheek away.
  const protectedExitChannel = keep(coilCore.subtract(fullStraightBody));
  const inside = keep(M.union([socketCore(inletX, -24, d.straightStartHeight - CONNECTOR.wall), socketCore(outletX, 0),
    cup, ...(options.channelPath
      ? [trough(innerTrough,inletX,options.channelPath.start),trough(innerTrough,options.channelPath.end,outletX)]
      : [trough(innerTrough,inletX,outletX)]), protectedExitChannel,
    slot(inletX, -24, 0, CONNECTOR.shoulderHeight+(options.channelPath?.inletRise ?? 0))]));
  const carved = keep(outside.subtract(inside));
  const lower = options.channelPath ? carved : keep(carved.trimByPlane([0,-1,0],-CONNECTOR.shoulderHeight));
  // The cut edges are round, constant-thickness C shells, independent of the
  // tall channel cutters. Preserve this part's existing channel-width opening.
  const inletSpigot = keep(keep(buildCSpigot(kernel, inletX, 0, opening)).translate([0, options.channelPath?.inletRise ?? 0, -24]));
  const outletSpigot = keep(buildCSpigot(kernel, outletX, Math.PI, opening, false));
  // Carry the same C footprint through the existing 0.4 mm seating shoulder.
  // Otherwise the old channel cuts leave its rounded tips hanging over air.
  const seats = [inletSpigot, outletSpigot].map(spigot => keep(buildCSpigotSeat(spigot)));
  const joined = keep(M.union([lower, ...seats, inletSpigot, outletSpigot]));
  // The 0.75 mm rolled rails need a tighter chord budget than the large bowls.
  // Variants preserve the same receiver and coil; only the connecting chute
  // changes elevation. Refine before bending so long planar faces follow it.
  const shaped = options.elevation
    ? keep(keep(joined.refineToLength(options.bendEdgeLength ?? 3)).warp(v => { v[1] += options.elevation!(v[0]); }))
    : joined;
  const simplified = keep(keep(shaped.asOriginal()).simplify(CONNECTOR.wall / 600));
  const regular = regularizeMesh(simplified.getMesh());
  const result = new M(new kernel.Mesh(collapseShortEdges(regular.mesh, 0.001)));
  const landed=slopeReceivingFloor(kernel,result,{x:inletX,z:-24,dx:1,dz:0,
    floor:x=>options.channelPath ? options.channelPath.map(x,0).y : mainFloor(x)+(options.elevation?.(x) ?? 0)});
  result.delete();
  garbage.reverse().forEach(v => v.delete());
  return landed;
}

export function rampSolidToGeometry(solid: Manifold) {
  return angleWeightedNormals(solidToGeometry(solid),
    [[-STANDARD_RAMP.centersAlongTrack / 2, -24], [STANDARD_RAMP.centersAlongTrack / 2, 0]]
      .flatMap(([x, z]) => [
        { radius: CONNECTOR.postDiameter / 2, sign: 1 },
        { radius: CONNECTOR.socketDiameter / 2, sign: -1 },
        { radius: CONNECTOR.boreDiameter / 2, sign: -1 },
      ].map(({ radius, sign }) => cylinderNormals({
        x, z, radius, inward: sign < 0, boundaryPriority: 1,
        minY: 0.399, maxY: radius === CONNECTOR.boreDiameter / 2 ? CONNECTOR.postHeight+.01 : CONNECTOR.shoulderHeight - 0.399, tolerance: 0.005,
      }))));
}

export async function createStandardRamp(color = 0xf1bf00) {
  const { loadSolidKernel } = await import('./solid-kernel');
  const solid: Manifold = buildRampSolid(await loadSolidKernel());
  if (solid.status() !== 'NoError') throw new Error(`Ramp solid: ${solid.status()}`);
  const parts = solid.decompose();
  const componentCount = parts.length;
  parts.forEach(p => p.delete());
  if (componentCount !== 1) throw new Error(`Ramp has ${componentCount} disconnected components`);
  const geometry = rampSolidToGeometry(solid);
  solid.delete();
  const material = new THREE.MeshPhysicalNodeMaterial({ color, roughness: 0.27,
    clearcoat: 0.16, clearcoatRoughness: 0.3 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.name = 'Marbleworks No.142 — connected solid approval draft';
  return { mesh, dimensions: STANDARD_RAMP, dispose() { geometry.dispose(); material.dispose(); } };
}
