import type { Vec2 } from 'manifold-3d';

// Shared reconstruction dimensions in mm. These profiles preserve the accepted
// No.142 ramp; the fitted port span is provisional, not a factory measurement.
export const VERTICAL_GRID = { rise:47, insertion:15 } as const;
/** All mating elevations come from this grid; the exposed male tip is not
 * the stacking datum. A piece seats on the shoulder below that tip. */
export function connectorLevels(baseUnits=0) {
  if(!Number.isInteger(baseUnits)||baseUnits<0)throw new Error('Connector elevation must be a nonnegative integer number of units');
  const bottom=baseUnits*VERTICAL_GRID.rise;
  return {bottom,shoulder:bottom+VERTICAL_GRID.rise,top:bottom+VERTICAL_GRID.rise+VERTICAL_GRID.insertion};
}
export const CONNECTOR = {
  postDiameter: 27, maleDiameter: 24, boreDiameter: 21, socketDiameter: 24.2,
  postHeight: connectorLevels().top, shoulderHeight: connectorLevels().shoulder, wall: 1.5,
} as const;

// 15.9 mm marble plus clearance beneath a seated, uncut upper socket.
const channelDepth = 17;
export const TRACK = {
  channelInsideWidth: 20, channelDepth, inletFloor: CONNECTOR.shoulderHeight - channelDepth,
  // Fitted floor-to-floor fall of the accepted standard ramp.
  runDrop: 13,
} as const;

export const PART_UNITS = {
  stackRise: CONNECTOR.shoulderHeight,
  insertionDepth: CONNECTOR.postHeight - CONNECTOR.shoulderHeight,
  portSpan: Math.hypot(138, 24),
} as const;

export function spanAlongTrack(across: number) {
  return Math.sqrt(PART_UNITS.portSpan ** 2 - across ** 2);
}

export const arc = (cx: number, cy: number, r: number, a: number, b: number, n = 20): Vec2[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = a + (b - a) * i / n;
    return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
  });

export function outerPostProfile(): Vec2[] {
  const outer = CONNECTOR.postDiameter / 2, male = CONNECTOR.maleDiameter / 2;
  const shoulder = CONNECTOR.shoulderHeight, top = CONNECTOR.postHeight;
  return [
    [0, 0], [outer - 0.3, 0], [outer, 0.3], [outer, shoulder - 0.4],
    [outer - 0.2, shoulder], [male + 0.2, shoulder], [male, shoulder + 0.4], [male - 0.28, top - 0.5],
    [male - 0.5, top], [0, top],
  ];
}

export function socketCoreProfile(top = CONNECTOR.postHeight + 1, socketDepth: number = CONNECTOR.shoulderHeight): Vec2[] {
  const socket = CONNECTOR.socketDiameter / 2, bore = CONNECTOR.boreDiameter / 2;
  // Reserve the entire insertion depth before tapering to the running bore.
  const shoulder = Math.max(socketDepth, VERTICAL_GRID.insertion + 0.4);
  return [
    [0, -1], [socket + 0.25, -1], [socket + 0.25, 0], [socket, 0.4],
    [socket, Math.min(top, shoulder - 0.4)],
    ...(top > shoulder ? [[bore, shoulder], [bore, top]] as Vec2[] : []), [0, top],
  ];
}

export function inletCupProfile(floor: number = TRACK.inletFloor, continuousBore = false): Vec2[] {
  const halfWidth = TRACK.channelInsideWidth / 2;
  const fillet = 5.5, flat = halfWidth - fillet - 0.5;
  const bore = CONNECTOR.boreDiameter / 2, shoulder = CONNECTOR.shoulderHeight;
  const top = CONNECTOR.postHeight + 1;
  return [[0, floor], [flat, floor],
    ...arc(flat, floor + fillet, fillet, -Math.PI / 2, 0),
    ...(continuousBore ? Array.from({ length: 24 }, (_, i): Vec2 => {
      const t = (i + 1) / 24, start = flat + fillet;
      return [start + (bore - start) * t * t * (3 - 2 * t), floor + fillet + (shoulder - floor - fillet) * t];
    }) : [[halfWidth, shoulder]] as Vec2[]),
    [bore, shoulder], [bore, top], [0, top]];
}

export function troughProfiles(options: { roundedOpening?: boolean } = {}): { inner: Vec2[]; outer: Vec2[] } {
  const halfWidth = TRACK.channelInsideWidth / 2, depth = TRACK.channelDepth;
  const wall = CONNECTOR.wall, fillet = 5.5, flat = halfWidth - fillet - 0.5;
  const lipRadius = wall / 2, lipCenter = halfWidth + lipRadius;
  const outer: Vec2[] = [[-halfWidth - wall, depth], [-halfWidth - wall + 0.5, fillet],
    ...arc(-flat, fillet, fillet + wall, Math.PI, Math.PI * 1.5), [flat, -wall],
    ...arc(flat, fillet, fillet + wall, -Math.PI / 2, 0), [halfWidth + wall, depth],
    ...arc(lipCenter, depth, lipRadius, 0, Math.PI), [-halfWidth, depth],
    ...arc(-lipCenter, depth, lipRadius, 0, Math.PI)];
  // Cut the whole rolled opening, including where a joining web adds material
  // outside the nominal wall. A vertical cutter would truncate that web sharply.
  const openingWidth = options.roundedOpening ? lipCenter : halfWidth;
  const inner: Vec2[] = [[-openingWidth, 100],
    ...(options.roundedOpening ? arc(-lipCenter, depth, lipRadius, Math.PI / 2, 0) : [[-halfWidth, depth]] as Vec2[]), [-halfWidth + 0.5, fillet],
    ...arc(-flat, fillet, fillet, Math.PI, Math.PI * 1.5), [flat, 0],
    ...arc(flat, fillet, fillet, -Math.PI / 2, 0), [halfWidth, depth],
    ...(options.roundedOpening ? arc(lipCenter, depth, lipRadius, Math.PI, Math.PI / 2) : []), [openingWidth, 100]];
  return { inner, outer };
}
