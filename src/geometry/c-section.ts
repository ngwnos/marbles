import type { Vec2 } from 'manifold-3d';

/** A constant-width circular strip with semicircular, tangent end caps. */
export function roundedCSection(radius: number, thickness: number, opening: number, direction: number,
  aroundSteps = 128, capSteps = 20): Vec2[] {
  if (radius <= thickness / 2 || opening <= 0 || opening >= Math.PI * 2) throw new Error('Invalid C section');
  const half = thickness / 2, start = direction + opening / 2, end = direction + Math.PI * 2 - opening / 2;
  const points: Vec2[] = [];
  for (let i = 0; i <= aroundSteps; i++) {
    const a = start + (end - start) * i / aroundSteps;
    points.push([(radius + half) * Math.cos(a), (radius + half) * Math.sin(a)]);
  }
  const cap = (a: number, first: number) => {
    for (let i = 1; i <= capSteps; i++) {
      const t = a + first + Math.PI * i / capSteps;
      points.push([radius * Math.cos(a) + half * Math.cos(t), radius * Math.sin(a) + half * Math.sin(t)]);
    }
  };
  cap(end, 0);
  for (let i = 1; i <= aroundSteps; i++) {
    const a = end - (end - start) * i / aroundSteps;
    points.push([(radius - half) * Math.cos(a), (radius - half) * Math.sin(a)]);
  }
  cap(start, Math.PI);
  points.pop(); // last cap point is the first vertex
  return points;
}
