import {slopeReceivingFloor,receivingFloorSurface,receivingFloorLift} from './receiving-floor';
import {followSocketFloor} from './track-connector';
import {applySurfaceNormals,heightSurfaceNormals} from '../geometry/mesh-normals';
import {solidToGeometry} from './solid-geometry';
import {smoothRamp} from '../geometry/surfaces';
import { sweepSection } from '../geometry/sweep-section';
import * as THREE from 'three/webgpu';
import type { ManifoldToplevel, Vec2 } from 'manifold-3d';
import { assertJoins, type Join } from '../geometry/continuity';
import { bowlNormal, bowlPoint, funnelSurfaces, roundedEdge, ShellMesh, surfaceNormal, channelFloorHeight, channelFloorEdge, type Meridian, type Surface } from './funnel-junction';
import {
  CONNECTOR, TRACK, PART_UNITS, spanAlongTrack, arc, outerPostProfile,
  socketCoreProfile, inletCupProfile, troughProfiles,
} from './marbleworks-spec';

// No.141: patent dimensions for the running surface; fitted outline from the
// original specimen and design views. All connector geometry uses the common spec.
const bowlRadius = 44.5;
const trackOffset = bowlRadius - (TRACK.channelInsideWidth / 2 + CONNECTOR.wall);
export const FUNNEL = {
  ...CONNECTOR,
  bowlDiameter: bowlRadius * 2,
  throatDiameter: 19,
  centersAcrossTrack: trackOffset,
  centersAlongTrack: spanAlongTrack(trackOffset),
  inletRise: PART_UNITS.stackRise,
  coneAngle: 20,
  throatHeight: 30,
  rimHeight: PART_UNITS.stackRise + TRACK.inletFloor - 2 * TRACK.runDrop + TRACK.channelDepth,
} as const;

// US4713038 Fig.2C: d=K[(R/r)^2-1], R=50.8 mm and K=1.06 mm.
// The printed 24.4 mm join radius is rounded. Solve the derivative for an exact
// tangent to the specified 20-degree cone (24.68 mm), avoiding a circular ridge.
const vortexA = 1.06 * 50.8 ** 2;
const coneSlope = Math.tan(FUNNEL.coneAngle * Math.PI / 180);
export const FUNNEL_CONE_JOIN = Math.cbrt(2 * vortexA / coneSlope);
const throatRadius = FUNNEL.throatDiameter / 2;
const coneStartHeight = FUNNEL.throatHeight
  + vortexA * (1 / throatRadius ** 2 - 1 / FUNNEL_CONE_JOIN ** 2);
const lipStart = 40;
const innerRim = bowlRadius - CONNECTOR.wall;
const lipRadius = (innerRim - lipStart) / (1 - Math.sin(FUNNEL.coneAngle * Math.PI / 180));
const lipCenterY = coneStartHeight + (lipStart - FUNNEL_CONE_JOIN) * coneSlope
  + lipRadius * Math.cos(FUNNEL.coneAngle * Math.PI / 180);

/** Rotational running surface, excluding the short vertical lip above it. */
export function sampleFunnelSurface(radius: number) {
  const r = Math.max(throatRadius, radius);
  if (r <= FUNNEL_CONE_JOIN) return {
    height: FUNNEL.throatHeight + vortexA * (1 / throatRadius ** 2 - 1 / r ** 2),
    slope: 2 * vortexA / r ** 3,
  };
  if (r <= lipStart) return {
    height: coneStartHeight + (r - FUNNEL_CONE_JOIN) * coneSlope,
    slope: coneSlope,
  };
  let low = 0, high = lipEndQ;
  for (let i = 0; i < 40; i++) {
    const q = (low + high) / 2;
    if (funnelMeridian(q).r < r) low = q; else high = q;
  }
  const p = funnelMeridian(high);
  return { height: p.y, slope: p.dr > 1e-7 ? p.dy / p.dr : 1e7 };
}

export function funnelTrackFloor(x: number) {
  const startX = -FUNNEL.centersAlongTrack + 7;
  const start = FUNNEL.inletRise + TRACK.inletFloor - CONNECTOR.wall / 2;
  const end = FUNNEL.rimHeight - TRACK.channelDepth;
  return THREE.MathUtils.lerp(start,end,Math.min(1,smoothRamp(x+FUNNEL.centersAlongTrack,14)/-startX));
}
export const funnelRunningFloor=receivingFloorSurface({x:-FUNNEL.centersAlongTrack,z:-FUNNEL.centersAcrossTrack,dx:1,dz:0,floor:funnelTrackFloor});
export function funnelGeometry(s:import('manifold-3d').Manifold){
  return applyFunnelGeometryNormals(solidToGeometry(s,true));
}
export function applyFunnelGeometryNormals(geometry:THREE.BufferGeometry){
  geometry.normalizeNormals();
  const port={x:-FUNNEL.centersAlongTrack,z:-FUNNEL.centersAcrossTrack,dx:1,dz:0,floor:funnelTrackFloor};
  const section=heightSurfaceNormals((x,z)=>{
    const y=funnelTrackFloor(x)+channelFloorHeight(z-port.z);
    return y+receivingFloorLift(x,y,z,port);
  });
  const matches=section.matches;
  section.matches=(points,face)=>points.every(p=>p.x>=port.x-.001&&p.x<=-62&&Math.abs(p.z-port.z)<=channelFloorEdge)&&matches(points,face);
  return applySurfaceNormals(geometry,[section,heightSurfaceNormals(funnelRunningFloor),heightSurfaceNormals(funnelTrackFloor,-CONNECTOR.wall,-1)]);
}

// q measures distance along the cone and parameterizes the rounded lip without
// the vertical rim's singular radius/height slope. The vortex keeps its formula.
const beta = FUNNEL.coneAngle * Math.PI / 180;
const lipEndQ = lipRadius * (Math.PI / 2 - beta);
export const FUNNEL_LIP_END_Q = lipEndQ;
export const FUNNEL_RIM_Q = lipEndQ + FUNNEL.rimHeight - CONNECTOR.wall / 2 - lipCenterY;
const lipStartY = coneStartHeight + (lipStart - FUNNEL_CONE_JOIN) * coneSlope;
const lipControls: Vec2[] = [[lipStart, lipStartY],
  [lipStart + lipEndQ * Math.cos(beta) / 5, lipStartY + lipEndQ * Math.sin(beta) / 5],
  [lipStart + 2 * lipEndQ * Math.cos(beta) / 5, lipStartY + 2 * lipEndQ * Math.sin(beta) / 5],
  [innerRim, lipCenterY - 2 * lipEndQ / 5], [innerRim, lipCenterY - lipEndQ / 5], [innerRim, lipCenterY]];
function bezier2(points: Vec2[], t: number): Vec2 {
  const p = points.map(v => [...v] as Vec2);
  for (let n = p.length - 1; n > 0; n--) for (let i = 0; i < n; i++)
    p[i] = [THREE.MathUtils.lerp(p[i][0], p[i + 1][0], t), THREE.MathUtils.lerp(p[i][1], p[i + 1][1], t)];
  return p[0];
}
const lipD = lipControls.slice(1).map((p, i): Vec2 =>
  [5 * (p[0] - lipControls[i][0]) / lipEndQ, 5 * (p[1] - lipControls[i][1]) / lipEndQ]);
const lipDD = lipD.slice(1).map((p, i): Vec2 =>
  [4 * (p[0] - lipD[i][0]) / lipEndQ, 4 * (p[1] - lipD[i][1]) / lipEndQ]);
export const funnelMeridian: Meridian = q => {
  if (q <= 0) {
    const r = lipStart + q * Math.cos(beta), p = sampleFunnelSurface(r);
    return { r, y: p.height, dr: Math.cos(beta), dy: p.slope * Math.cos(beta), ddr: 0,
      ddy: r < FUNNEL_CONE_JOIN ? -6 * vortexA / r ** 4 * Math.cos(beta) ** 2 : 0 };
  }
  if (q <= lipEndQ) {
    // Zero curvature at both ends is essential: a circular fillet is only C1,
    // and its curvature jump would become a normal crease inside the loft.
    const t = q / lipEndQ, p = bezier2(lipControls, t), d = bezier2(lipD, t), dd = bezier2(lipDD, t);
    return { r: p[0], y: p[1], dr: d[0], dy: d[1], ddr: dd[0], ddy: dd[1] };
  }
  return { r: innerRim, y: lipCenterY + q - lipEndQ, dr: 0, dy: 1, ddr: 0, ddy: 0 };
};

export function createFunnelSurfaces() {
  return funnelSurfaces({ meridian: funnelMeridian, rimQ: FUNNEL_RIM_Q,
    inletX: -FUNNEL.centersAlongTrack, inletZ: -trackOffset, floor: funnelTrackFloor, rimRadius: innerRim });
}

export function funnelJoinSurfaces() {
  const layout = createFunnelSurfaces();
  const receiver: Surface = (u, v) => bowlPoint(funnelMeridian, layout.cutQ(v) - 6 * u, layout.theta(v));
  const joins: Join[] = [
    { name: 'Funnel: track / loft', expected: 'G1', a: { surface: layout.track, edge: 'u1' }, b: { surface: layout.junction, edge: 'u0' } },
    { name: 'Funnel: loft / bowl', expected: 'G1', a: { surface: layout.junction, edge: 'u1' }, b: { surface: receiver, edge: 'u0' } },
  ];
  return { ...layout, receiver, joins };
}

/** The entire channel/bowl is one structured, normal-offset shell. */
export function buildFunnelShell(kernel: ManifoldToplevel) {
  assertJoins(funnelJoinSurfaces().joins);
  const layout = createFunnelSurfaces(), mesh = new ShellMesh();
  const { track, junction, thetaA, thetaB, theta, cutQ } = layout;
  const acrossSteps = 64, trackSteps = 64, joinSteps = 64, bowlSteps = 80, aroundSteps = 192;
  const outsideRadius = CONNECTOR.postDiameter / 2;
  const offset = (q: number) => {
    const p = bowlPoint(funnelMeridian, q, 0);
    return p.addScaledVector(bowlNormal(funnelMeridian, q, 0), -CONNECTOR.wall);
  };
  let low = (throatRadius - lipStart) / Math.cos(beta), high = (FUNNEL_CONE_JOIN - lipStart) / Math.cos(beta);
  for (let i = 0; i < 48; i++) {
    const q = (low + high) / 2;
    if (offset(q).x < outsideRadius) low = q; else high = q;
  }
  const neckQ = high, neck = funnelMeridian(neckQ), outerNeck = offset(neckQ);
  const trackN = (t: number, u: number) => surfaceNormal(track, t, u);
  const junctionN = (t: number, u: number) => t === 0 ? trackN(1, u)
    : t === 1 ? bowlNormal(funnelMeridian, cutQ(u), theta(u)) : surfaceNormal(junction, t, u);
  const topSeam = mesh.seam(v => track(1, v), acrossSteps);
  const bottomSeam = mesh.seam(v => track(1, v).addScaledVector(trackN(1, v), -CONNECTOR.wall), acrossSteps);
  const skin = (surface: Surface, normal: Surface, nu: number, nv: number, edge?: 'u0' | 'u1') => {
    mesh.patch(surface, nu, nv, false, normal, edge ? { [edge]: topSeam } : {});
    mesh.patch((u, v) => surface(u, v).addScaledVector(normal(u, v), -CONNECTOR.wall), nu, nv, true,
      (u, v) => normal(u, v).negate(), edge ? { [edge]: bottomSeam } : {});
  };
  skin(track, trackN, trackSteps, acrossSteps, 'u1');
  skin(junction, junctionN, joinSteps, acrossSteps, 'u0');
  const bowlSector = (angle: (u: number) => number, top: (u: number) => number, steps: number) => {
    skin((u, v) => bowlPoint(funnelMeridian, neckQ + (top(u) - neckQ) * v, angle(u)),
      (u, v) => bowlNormal(funnelMeridian, neckQ + (top(u) - neckQ) * v, angle(u)), steps, bowlSteps);
  };
  bowlSector(theta, cutQ, acrossSteps);
  const remainingTheta = (u: number) => thetaB + (thetaA + Math.PI * 2 - thetaB) * u;
  bowlSector(remainingTheta, () => FUNNEL_RIM_Q, aroundSteps);

  const edgeSteps = 8;
  const rail = (surface: Surface, normal: Surface, u: number, steps: number, isJunction = false) => {
    const edge = roundedEdge(t => surface(t, u), t => normal(t, u), t => {
      if (isJunction && t === 1) return new THREE.Vector3(0, -1, 0);
      const tangent = surface(Math.min(1, t + 0.000001), u).sub(surface(Math.max(0, t - 0.000001), u)).normalize();
      return normal(t, u).cross(tangent).multiplyScalar(u === 0 ? 1 : -1);
    });
    mesh.patch(edge, steps, edgeSteps, u === 0,
      (s, t) => surfaceNormal(edge, s, t).multiplyScalar(u === 0 ? -1 : 1));
    return edge;
  };
  const railA = rail(track, trackN, 0, trackSteps), railB = rail(track, trackN, 1, trackSteps);
  rail(junction, junctionN, 0, joinSteps, true); rail(junction, junctionN, 1, joinSteps, true);
  const bowlEdge = roundedEdge(u => bowlPoint(funnelMeridian, FUNNEL_RIM_Q, remainingTheta(u)),
    u => bowlNormal(funnelMeridian, FUNNEL_RIM_Q, remainingTheta(u)), () => new THREE.Vector3(0, -1, 0));
  mesh.patch(bowlEdge, aroundSteps, edgeSteps, false, (u, v) => surfaceNormal(bowlEdge, u, v));

  // Close only the inlet end, inside the shared connector where it is cut open.
  mesh.patch((u, t) => track(0, u).addScaledVector(trackN(0, u), -CONNECTOR.wall * t), acrossSteps, 2);
  for (const [u, edge] of [[0, railA], [1, railB]] as const) {
    const center = track(0, u).addScaledVector(trackN(0, u), -CONNECTOR.wall / 2);
    mesh.patch((s, t) => center.clone().lerp(edge(0, s), t), edgeSteps, 1, u === 1);
  }

  // The socket and lower vortex are an exact revolved profile, sharing the
  // neck ring with the structured bowl; no boolean seam at the drain either.
  const bottom: Vec2[] = [[neck.r, neck.y]];
  for (let i = 1; i <= 40; i++) {
    const r = THREE.MathUtils.lerp(neck.r, throatRadius, i / 40);
    bottom.push([r, sampleFunnelSurface(r).height]);
  }
  const socket = CONNECTOR.socketDiameter / 2, engagement = PART_UNITS.insertionDepth;
  bottom.push([throatRadius, engagement + 1.5], [throatRadius + 1, engagement],
    [socket, engagement], [socket, 0.4], [socket + 0.25, 0], [outsideRadius - 0.3, 0],
    [outsideRadius, 0.3], [outsideRadius, outerNeck.y]);
  for (let j = 0; j < bottom.length - 1; j++) {
    const a = bottom[j], b = bottom[j + 1];
    for (const [angle, steps] of [[theta, acrossSteps], [remainingTheta, aroundSteps]] as const)
      mesh.patch((u, v) => {
        const r = THREE.MathUtils.lerp(a[0], b[0], v), y = THREE.MathUtils.lerp(a[1], b[1], v);
        return new THREE.Vector3(r * Math.cos(angle(u)), y, r * Math.sin(angle(u)));
      }, steps, 1, true);
  }
  return mesh.solid(kernel);
}

/** Attach only the shared inlet connector to the already joined shell. */
export function buildFunnelSolid(kernel: ManifoldToplevel) {
  const { Manifold: M, CrossSection } = kernel;
  const garbage: { delete(): void }[] = [];
  const keep = <T extends { delete(): void }>(v: T): T => { garbage.push(v); return v; };
  const section = (points: Vec2[]) => keep(new CrossSection(points, 'NonZero'));
  const lathe = (profile: Vec2[], x = 0, y = 0, z = 0) => {
    const raw = keep(section(profile).revolve(256));
    const turned = keep(raw.rotate([-90, 0, 0]));
    const placed = keep(turned.translate([x, y, z]));
    return keep(placed.calculateNormals(0, 40));
  };
  const inletX = -FUNNEL.centersAlongTrack, inletZ = -trackOffset;
  const body = keep(buildFunnelShell(kernel));
  if (body.status() !== 'NoError') throw new Error(`Funnel shell: ${body.status()}`);
  const outside = keep(M.union([body, lathe(outerPostProfile(), inletX, FUNNEL.inletRise, inletZ)]));
  const slotShape = section([[0, 0], ...arc(0, 0, 19, -0.84, 0.84)]);
  const slotRaw = keep(slotShape.extrude(70));
  const slotTurned = keep(slotRaw.rotate([-90, 0, 0]));
  const slot = keep(slotTurned.translate([inletX, FUNNEL.inletRise + CONNECTOR.shoulderHeight, inletZ]));
  const channel = keep(sweepSection(kernel, troughProfiles().inner, 34, 68, v => {
    const [across, height, along] = v, x = inletX + along;
    v[0] = x; v[1] = funnelTrackFloor(x) + height; v[2] = inletZ - across;
  }));
  const socket=lathe(socketCoreProfile(funnelTrackFloor(inletX)-FUNNEL.inletRise-CONNECTOR.wall),inletX,FUNNEL.inletRise,inletZ);
  const inside = keep(M.union([keep(channel.calculateNormals(0, 40)),
    keep(followSocketFloor(socket,{x:inletX,z:inletZ,floor:funnelTrackFloor,bottom:FUNNEL.inletRise})),
    lathe(inletCupProfile(TRACK.inletFloor - CONNECTOR.wall / 2), inletX, FUNNEL.inletRise, inletZ), keep(slot.calculateNormals(0, 40))]));
  const carved = outside.subtract(inside);
  const result=slopeReceivingFloor(kernel,carved,{x:inletX,z:inletZ,dx:1,dz:0,floor:funnelTrackFloor});
  carved.delete();
  garbage.reverse().forEach(v => v.delete());
  return result;
}

export async function createFunnel(color = 0xd32623) {
  const { loadSolidKernel } = await import('./solid-kernel');
  const solid = buildFunnelSolid(await loadSolidKernel());
  if (solid.status() !== 'NoError') throw new Error(`Funnel solid: ${solid.status()}`);
  const components = solid.decompose();
  const count = components.length;
  components.forEach(p => p.delete());
  if (count !== 1) throw new Error(`Funnel has ${count} disconnected components`);
  const geometry = funnelGeometry(solid);
  solid.delete();
  const material = new THREE.MeshPhysicalNodeMaterial({ color, roughness: 0.27,
    clearcoat: 0.16, clearcoatRoughness: 0.3 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.name = 'Marbleworks No.141 — funnel approval draft';
  return { mesh, dimensions: FUNNEL, dispose() { geometry.dispose(); material.dispose(); } };
}
