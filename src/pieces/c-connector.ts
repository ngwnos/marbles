import * as THREE from 'three/webgpu';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { roundedCSection } from '../geometry/c-section';
import { CONNECTOR } from './marbleworks-spec';

/** The male spigot has one boundary loop per level: no bore/track cutters. */
export function buildCSpigot(kernel: ManifoldToplevel, x: number, direction: number, opening: number, draft = true) {
  const shoulder = CONNECTOR.shoulderHeight, top = CONNECTOR.postHeight;
  const levels = [[shoulder, CONNECTOR.maleDiameter / 2],
    [shoulder + 0.4, CONNECTOR.maleDiameter / 2],
    [top - 0.5, CONNECTOR.maleDiameter / 2 - (draft ? 0.28 : 0)],
    [top, CONNECTOR.maleDiameter / 2 - (draft ? 0.5 : 0)]];
  const sections = levels.map(([, outer]) => roundedCSection(outer - CONNECTOR.wall / 2, CONNECTOR.wall, opening, direction));
  const count = sections[0].length, positions: number[] = [], triangles: number[] = [];
  sections.forEach((section, level) => section.forEach(([px, z]) => positions.push(x + px, levels[level][0], z)));
  for (let level = 0; level < levels.length - 1; level++) for (let i = 0; i < count; i++) {
    const a = level * count + i, b = level * count + (i + 1) % count;
    triangles.push(a, a + count, b + count, a, b + count, b);
  }
  for (const level of [0, levels.length - 1]) {
    const points = sections[level].map(([x, z]) => new THREE.Vector2(x, z));
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(points, [])) {
      const offset = level * count;
      triangles.push(...(level === 0 ? [a + offset, b + offset, c + offset] : [c + offset, b + offset, a + offset]));
    }
  }
  return new kernel.Manifold(new kernel.Mesh({ numProp: 3, vertProperties: new Float32Array(positions), triVerts: new Uint32Array(triangles) }));
}

/** Shared seating footprint: carry every rounded C tip into the lower collar. */
export function buildCSpigotSeat(spigot:Manifold) {
  const shifted=spigot.translate([0,-.4,0]);
  try{return shifted.trimByPlane([0,-1,0],-CONNECTOR.shoulderHeight);}
  finally{shifted.delete();}
}
