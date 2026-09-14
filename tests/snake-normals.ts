import { Vector3, type BufferGeometry } from 'three/webgpu';
import { PART_UNITS } from '../src/pieces/marbleworks-spec';

/** Check interpolated shading on unchanged cylindrical faces of the final mesh. */
export function auditSnakeNormals(geometry: BufferGeometry, surface: 'outer' | 'bore' = 'outer') {
  const radius = surface === 'outer' ? 13.5 : 12.1, sign = surface === 'outer' ? 1 : -1;
  const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal'), indices = geometry.index!;
  let probes = 0, maxAngle = 0;
  let worst = "";
  for (let i = 0; i < indices.count; i += 3) {
    const ids = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)];
    const points = ids.map(id => new Vector3().fromBufferAttribute(positions, id));
    const center = points.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(3);
    const postX = Math.sign(center.x) * PART_UNITS.portSpan / 2;
    const longWall = Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y)) > 5;
    // Include trim triangles just outside the nominal wall: excluding these
    // hid flare normals that were interpolating far up the cylinder.
    if (!points.every(p => Math.abs(Math.hypot(p.x - postX, p.z) - radius) < (longWall ? 0.025 : 0.008) && p.y > (surface === 'outer' ? 0.299 : 0.401) && p.y < 46.601)) continue;
    const radial = new Vector3(center.x - postX, 0, center.z).normalize().multiplyScalar(sign);
    const face = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
    if (face.dot(radial) < (longWall ? 0.98 : 0.999)) continue; // exclude cut faces and bevels
    for (const weights of [[1/3, 1/3, 1/3], [0.8, 0.1, 0.1], [0.1, 0.8, 0.1], [0.1, 0.1, 0.8]]) {
      const p = new Vector3(), n = new Vector3();
      ids.forEach((id, j) => { p.addScaledVector(points[j], weights[j]); n.addScaledVector(new Vector3().fromBufferAttribute(normals, id), weights[j]); });
      const expected = new Vector3(p.x - postX, 0, p.z).normalize().multiplyScalar(sign);
      const angle = Math.acos(Math.min(1, Math.max(-1, expected.dot(n.normalize())))) * 180 / Math.PI;
      if (angle > maxAngle) worst = JSON.stringify({ points: points.map(p => p.toArray()), weights, normals: ids.map(id => new Vector3().fromBufferAttribute(normals, id).toArray()) });
      maxAngle = Math.max(maxAngle, angle); probes++;
    }
  }
  if (probes < 100 || maxAngle > 1) throw new Error(`Cylinder ${surface} shading: ${probes} probes; worst normal error ${maxAngle.toFixed(3)}° ${worst}`);
  return { probes, maxAngle };
}
