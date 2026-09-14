import { Vector3 } from 'three/webgpu';

export type Surface = (u: number, v: number) => Vector3;
export type Curve = (t: number) => Vector3;

/** Boundary controls own both position and tangent; consumers share this loft. */
export function cubicLoft(controls: (v: number) => Vector3[]): Surface {
  return (u, v) => {
    const p = controls(v), s = 1 - u;
    const weights = [s ** 3, 3 * u * s * s, 3 * u * u * s, u ** 3];
    return p.reduce((point, control, i) => point.addScaledVector(control, weights[i]), new Vector3());
  };
}

export function sweep(profile: Curve, frame: (u: number, point: Vector3) => Vector3): Surface {
  return (u, v) => frame(u, profile(v));
}

export function surfaceNormal(surface: Surface, u: number, v: number) {
  const e = 0.00001;
  const a = surface(Math.min(1, u + e), v).sub(surface(Math.max(0, u - e), v));
  const b = surface(u, Math.min(1, v + e)).sub(surface(u, Math.max(0, v - e)));
  return a.cross(b).normalize();
}

/** A circular blend tangent to two circular receivers at every profile height. */
export function circularBridge(options: {
  distance: number;
  firstRadius: (v: number) => number;
  secondRadius: (v: number) => number;
  filletRadius: (v: number) => number;
  height: (v: number) => number;
  transform: (point: Vector3) => Vector3;
  side?: 1 | -1;
}) {
  const { distance, transform } = options;
  const side = options.side ?? 1;
  const section = (v: number) => {
    const r0 = options.firstRadius(v), r1 = options.secondRadius(v), f = options.filletRadius(v);
    const x = ((r0 + f) ** 2 - (r1 + f) ** 2 + distance ** 2) / (2 * distance);
    const z2 = (r0 + f) ** 2 - x * x;
    if (z2 <= 0) throw new Error('Circular blend has no regular tangent solution');
    const z = Math.sqrt(z2);
    return { x, z, f, r0, r1, a0: Math.atan2(-z, -x), a1: Math.atan2(-z, distance - x) };
  };
  const surface: Surface = (u, v) => {
    const p = section(v), a = p.a0 + (p.a1 - p.a0) * u;
    return transform(new Vector3(p.x + p.f * Math.cos(a), options.height(v), side * (p.z + p.f * Math.sin(a))));
  };
  // Receiver patches use the same edge parameterization, not independently
  // reconstructed intersection points. Their interior extends away from the blend.
  const receiver = (which: 0 | 1): Surface => (u, v) => {
    const p = section(v), center = which === 0 ? 0 : distance, r = which === 0 ? p.r0 : p.r1;
    const angle = Math.atan2(side * p.z, p.x - center) + side * (which === 0 ? -1 : 1) * u * 0.15;
    return transform(new Vector3(center + r * Math.cos(angle), options.height(v), r * Math.sin(angle)));
  };
  return { surface, firstReceiver: receiver(0), secondReceiver: receiver(1), section };
}

/** One profile definition supplies polygon lofts as well as section evaluation. */
export function profileEnvelope(points: readonly (readonly [number, number])[]) {
  return (height: number) => {
    let width = -Infinity;
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      if (height < Math.min(a[1], b[1]) - 1e-9 || height > Math.max(a[1], b[1]) + 1e-9) continue;
      const dy = b[1] - a[1];
      width = Math.max(width, Math.abs(dy) < 1e-10 ? Math.max(a[0], b[0]) : a[0] + (b[0] - a[0]) * (height - a[1]) / dy);
    }
    if (!Number.isFinite(width)) throw new Error(`Profile has no section at height ${height}`);
    return width;
  };
}

/** Integral of quintic smoothstep: a flat start becomes a constant grade
 * without a tangent/curvature break. Past width it equals x - width/2. */
export function smoothRamp(x:number,width:number){
  if(x<=0)return 0;if(x>=width)return x-width/2;
  const t=x/width;return width*(2.5*t**4-3*t**5+t**6);
}
