import type { ManifoldToplevel } from 'manifold-3d';
import { buildFunnelSolid, createFunnelSurfaces, FUNNEL, FUNNEL_CONE_JOIN, FUNNEL_LIP_END_Q, funnelMeridian, funnelTrackFloor, sampleFunnelSurface } from '../src/pieces/funnel';
import { bowlNormal, bowlPoint, surfaceNormal, type Surface } from '../src/pieces/funnel-junction';
import { CONNECTOR, outerPostProfile, PART_UNITS, TRACK } from '../src/pieces/marbleworks-spec';

/** Check the final shell, passage of a 15.9 mm marble, and both stacking sockets. */
export function verifyFunnel(kernel: ManifoldToplevel) {
  for (const key of Object.keys(CONNECTOR) as (keyof typeof CONNECTOR)[]) {
    if (FUNNEL[key] !== CONNECTOR[key]) throw new Error(`Funnel connector differs at ${key}`);
  }
  if (Math.abs(Math.hypot(FUNNEL.centersAlongTrack, FUNNEL.centersAcrossTrack) - PART_UNITS.portSpan) > 1e-9)
    throw new Error('Funnel ports do not share the standard part span');
  if (FUNNEL.inletRise !== PART_UNITS.stackRise)
    throw new Error('Funnel inlet is not one standard stacking unit above its outlet');

  const funnel = buildFunnelSolid(kernel);
  const marble = kernel.Manifold.sphere(7.95, 48);
  const failures: string[] = [];
  let clearanceProbes = 0, connectorFits = 0, maxJunctionSeatingAdjustment = 0;
  let seamSamples = 0, regularitySamples = 0, thicknessProbes = 0;
  let maxSeamPositionError = 0, maxSeamNormalError = 0, minJacobianSine = Infinity;
  let maxThicknessError = 0;
  let interiorNormalSamples = 0, maxInteriorNormalError = 0;
  try {
    if (funnel.status() !== 'NoError') throw new Error(`Invalid funnel solid: ${funnel.status()}`);
    const volume = funnel.volume();
    if (!(volume > 0)) throw new Error(`Funnel volume must be positive, received ${volume}`);
    const components = funnel.decompose();
    const count = components.length;
    components.forEach(part => part.delete());
    if (count !== 1) throw new Error(`Funnel contains ${count} disconnected pieces`);

    const layout = createFunnelSurfaces();
    const { track, junction, theta, cutQ } = layout;
    // The inner half of the opening must expand into the bowl, never hook
    // across the incoming U section even when its boundary normals are smooth.
    for (let j = 0; j <= 32; j++) {
      const u = j / 64, entranceZ = track(1, u).z;
      for (let i = 0; i <= 64; i++) {
        const intrusion = entranceZ - junction(i / 64, u).z;
        if (intrusion > 1e-6)
          failures.push(`Channel pinches inward at [${i / 64}, ${u}] by ${intrusion} mm`);
      }
    }
    const junctionNormal: Surface = (t, u) => t === 0 ? surfaceNormal(track, 1, u)
      : t === 1 ? bowlNormal(funnelMeridian, cutQ(u), theta(u)) : surfaceNormal(junction, t, u);
    // Compare the actual patch tangent planes at both seams, including their
    // rail endpoints; checking only the forced shell normals can hide a kink.
    for (let i = 0; i <= 32; i++) {
      const u = i / 32;
      for (const seam of [
        { name: 'Track/junction', a: track(1, u), b: junction(0, u),
          na: surfaceNormal(track, 1, u), nb: surfaceNormal(junction, 0, u) },
        { name: 'Junction/bowl', a: junction(1, u), b: bowlPoint(funnelMeridian, cutQ(u), theta(u)),
          na: surfaceNormal(junction, 1, u), nb: bowlNormal(funnelMeridian, cutQ(u), theta(u)) },
      ]) {
        const positionError = seam.a.distanceTo(seam.b), normalError = seam.na.distanceTo(seam.nb);
        maxSeamPositionError = Math.max(maxSeamPositionError, positionError);
        maxSeamNormalError = Math.max(maxSeamNormalError, normalError);
        if (positionError > 1e-6) failures.push(`${seam.name} position gap at u=${u}: ${positionError} mm`);
        if (normalError > 0.001) failures.push(`${seam.name} tangent kink at u=${u}: normal difference ${normalError}`);
        seamSamples++;
      }
    }
    // Endpoint tangent controls depend on the meridian derivative. A curvature
    // jump there can create a normal crease inside an otherwise G1-seamed loft.
    // Resolve each side independently: the regular surfaceNormal stencil is
    // wider than these offsets and would average across the very crease tested.
    const resolvedNormal = (t: number, u: number) => {
      const along = junction(t + 1e-5, u).sub(junction(t - 1e-5, u));
      const across = junction(t, u + 1e-8).sub(junction(t, u - 1e-8));
      return along.cross(across).normalize();
    };
    for (const breakQ of [0, FUNNEL_LIP_END_Q]) {
      for (const interval of [[0, 0.5], [0.5, 1]]) {
        let [low, high] = interval;
        if ((cutQ(low) - breakQ) * (cutQ(high) - breakQ) > 0) continue;
        for (let i = 0; i < 48; i++) {
          const middle = (low + high) / 2;
          if ((cutQ(low) - breakQ) * (cutQ(middle) - breakQ) <= 0) high = middle;
          else low = middle;
        }
        const u = (low + high) / 2;
        for (let i = 1; i < 10; i++) {
          const t = i / 10;
          const error = resolvedNormal(t, u - 1e-7).distanceTo(resolvedNormal(t, u + 1e-7));
          maxInteriorNormalError = Math.max(maxInteriorNormalError, error);
          if (!Number.isFinite(error) || error >= 0.001)
            failures.push(`Interior normal crease at meridian q=${breakQ}, [${t}, ${u}]: normal difference ${error}`);
          interiorNormalSamples++;
        }
      }
    }
    const partials = (surface: Surface, t: number, u: number) => {
      const e = 0.0001;
      const ta = Math.max(0, t - e), tb = Math.min(1, t + e);
      const ua = Math.max(0, u - e), ub = Math.min(1, u + e);
      return [surface(tb, u).sub(surface(ta, u)).divideScalar(tb - ta),
        surface(t, ub).sub(surface(t, ua)).divideScalar(ub - ua)];
    };
    const underside: Surface = (t, u) => junction(t, u).addScaledVector(junctionNormal(t, u), -CONNECTOR.wall);
    for (let i = 0; i <= 24; i++) for (let j = 0; j <= 24; j++) {
      const t = i / 24, u = j / 24;
      const [a, b] = partials(junction, t, u), [oa, ob] = partials(underside, t, u);
      const jacobian = a.clone().cross(b), offsetJacobian = oa.clone().cross(ob);
      const sine = jacobian.length() / (a.length() * b.length());
      minJacobianSine = Math.min(minJacobianSine, sine);
      if (!Number.isFinite(sine) || a.length() < 1e-4 || b.length() < 1e-4 || sine < 1e-4)
        failures.push(`Singular junction patch at [${t}, ${u}]: Jacobian sine ${sine}`);
      if (offsetJacobian.length() < 1e-4 || offsetJacobian.dot(jacobian) <= 0)
        failures.push(`Normal-offset underside folds or collapses at [${t}, ${u}]`);
      regularitySamples++;
    }
    const thickness = (label: string, point: ReturnType<Surface>, normal: ReturnType<Surface>) => {
      const start = point.clone().addScaledVector(normal, 0.2);
      const end = point.clone().addScaledVector(normal, -CONNECTOR.wall - 0.2);
      const hits = funnel.rayCast(start.toArray(), end.toArray());
      if (hits.length !== 2) failures.push(`${label}: expected two shell faces, found ${hits.length}`);
      else {
        const frontError = Math.hypot(...hits[0].position.map((v, k) => v - point.getComponent(k)));
        const measured = Math.hypot(...hits[0].position.map((v, k) => v - hits[1].position[k]));
        const error = Math.abs(measured - CONNECTOR.wall);
        maxThicknessError = Math.max(maxThicknessError, error);
        if (frontError > 0.05) failures.push(`${label}: final shell differs from running surface by ${frontError} mm`);
        if (error > 0.05) failures.push(`${label}: shell thickness ${measured} mm differs from shared wall`);
      }
      thicknessProbes++;
    };
    for (const t of [0.173, 0.367, 0.613, 0.827]) for (const u of [0.17, 0.33, 0.51, 0.69, 0.83])
      thickness(`Junction thickness [${t}, ${u}]`, junction(t, u), junctionNormal(t, u));
    for (const u of [0.17, 0.33, 0.51, 0.69, 0.83])
      thickness(`Track thickness ${u}`, track(0.71, u), surfaceNormal(track, 0.71, u));
    for (const radius of [18, 28, 37]) {
      const q = (radius - 40) / Math.cos(FUNNEL.coneAngle * Math.PI / 180);
      thickness(`Bowl thickness ${radius}`, bowlPoint(funnelMeridian, q, 0), bowlNormal(funnelMeridian, q, 0));
    }

    const marbleOverlap = (x: number, y: number, z: number) => {
      const at = marble.translate([x, y, z]);
      const overlap = funnel.intersect(at);
      try {
        if (overlap.status() !== 'NoError') throw new Error(`Invalid marble intersection: ${overlap.status()}`);
        return overlap.volume();
      } finally { overlap.delete(); at.delete(); }
    };
    const clear = (label: string, x: number, y: number, z: number) => {
      const overlapVolume = marbleOverlap(x, y, z);
      if (overlapVolume > 0.001)
        failures.push(`${label}: marble blocked at [${x}, ${y}, ${z}], overlap ${overlapVolume} mm³`);
      clearanceProbes++;
    };

    const inletX = -FUNNEL.centersAlongTrack, inletZ = -FUNNEL.centersAcrossTrack;
    const trackStart = inletX + 7;
    const trackSlope = (funnelTrackFloor(0) - funnelTrackFloor(trackStart)) / -trackStart;
    // At fixed X, this height keeps the sphere 8.05 mm normal to the inclined bed.
    const trackClearance = 8.05 * Math.hypot(1, trackSlope);
    for (let i = 0; i <= 48; i++) {
      const point = track(i / 48, 0.5);
      clear(`Incoming track ${i}`, point.x, point.y + trackClearance, point.z);
    }
    // Follow the curved patch's bed rather than the discarded straight-track
    // datum. The bed should keep descending and stay between its seam heights.
    let previousFloor = Infinity;
    const entranceHeight = junction(0, 0.5).y, exitHeight = junction(1, 0.5).y;
    for (let i = 0; i <= 20; i++) {
      const t = i / 20, point = junction(t, 0.5), normal = junctionNormal(t, 0.5);
      if (normal.y <= 0) failures.push(`Junction ${i}: bed normal does not face upward`);
      if (point.y < Math.min(entranceHeight, exitHeight) - 0.05 || point.y > Math.max(entranceHeight, exitHeight) + 0.05)
        failures.push(`Junction ${i}: unexpected floor height ${point.y}`);
      if (point.y > previousFloor + 0.05)
        failures.push(`Junction ${i}: running bed rises toward the bowl`);
      previousFloor = point.y;
      const center = point.clone().addScaledVector(normal, 8.05);
      const cx = center.x, cy = center.y, cz = center.z;
      // A marble bridges the tight concave lip and touches adjacent surfaces;
      // its seat can lie above a single tangent-plane normal offset. Permit
      // at most 1 mm of vertical seating, measured on the actual solid.
      let adjustment = 0;
      if (marbleOverlap(cx, cy, cz) > 0.001) {
        if (marbleOverlap(cx, cy + 1, cz) > 0.001) {
          clear(`Junction ${i}, after maximum 1 mm seating adjustment`, cx, cy + 1, cz);
          continue;
        }
        let low = 0, high = 1;
        for (let step = 0; step < 14; step++) {
          const middle = (low + high) / 2;
          if (marbleOverlap(cx, cy + middle, cz) > 0.001) low = middle;
          else high = middle;
        }
        adjustment = high;
      }
      maxJunctionSeatingAdjustment = Math.max(maxJunctionSeatingAdjustment, adjustment);
      clear(`Junction ${i}`, cx, cy + adjustment, cz);
    }
    for (let i = 0; i <= 16; i++) {
      const y = -4 + (FUNNEL.throatHeight + 12) * i / 16;
      clear(`Centered drain ${i}`, 0, y, 0);
    }

    // Sample the vortex and conical running bed. The narrow retention lip is
    // not a marble contact path; a ball rests against it above the bed instead.
    const radii = [FUNNEL.throatDiameter / 2, 10, 12, 15, 18, 21,
      FUNNEL_CONE_JOIN, 28, 31, 34, 37];
    for (const radius of radii) {
      const { height, slope } = sampleFunnelSurface(radius);
      const normalLength = Math.hypot(1, slope);
      const centerRadius = radius - 8.05 * slope / normalLength;
      const centerHeight = height + 8.05 / normalLength;
      for (let i = 0; i < 8; i++) {
        const angle = 2 * Math.PI * i / 8;
        const signedAngle = Math.atan2(Math.sin(angle), Math.cos(angle));
        if (signedAngle >= layout.thetaA && signedAngle <= layout.thetaB) {
          const u = (signedAngle - layout.thetaA) / (layout.thetaB - layout.thetaA);
          const q = (radius - 40) / Math.cos(FUNNEL.coneAngle * Math.PI / 180);
          // This portion of the original bowl is replaced by the loft above;
          // its actual running bed is covered by the curved junction probes.
          if (q > cutQ(u)) continue;
        }
        clear(`Bowl radius ${radius}, angle ${angle}`,
          centerRadius * Math.cos(angle), centerHeight, centerRadius * Math.sin(angle));
      }
    }

    // Revolve the same complete male connector outline used by the accepted
    // ramp, then seat its shoulder at each lower socket's base plane.
    const section = new kernel.CrossSection(outerPostProfile(), 'NonZero');
    const raw = section.revolve(256);
    const male = raw.rotate([-90, 0, 0]);
    raw.delete(); section.delete();
    try {
      if (male.status() !== 'NoError') throw new Error(`Invalid mating connector: ${male.status()}`);
      for (const port of [
        { name: 'Outlet', x: 0, y: 0, z: 0 },
        { name: 'Inlet', x: inletX, y: FUNNEL.inletRise, z: inletZ },
      ]) {
        const seated = male.translate([port.x, port.y - CONNECTOR.shoulderHeight, port.z]);
        const overlap = funnel.intersect(seated);
        try {
          if (overlap.status() !== 'NoError') throw new Error(`Invalid ${port.name} connector intersection: ${overlap.status()}`);
          const overlapVolume = overlap.volume();
          if (overlapVolume > 0.001)
            failures.push(`${port.name} socket blocks the shared male connector: overlap ${overlapVolume} mm³`);
          connectorFits++;
        } finally { overlap.delete(); seated.delete(); }
      }
    } finally { male.delete(); }

    if (FUNNEL.inletRise + TRACK.inletFloor <= sampleFunnelSurface(FUNNEL.centersAcrossTrack).height)
      failures.push('The incoming track does not descend into the bowl');
    if (failures.length) throw new Error(`Funnel verification failed:\n${failures.join('\n')}`);
    return { components: count, clearanceProbes, connectorFits, maxJunctionSeatingAdjustment,
      seamSamples, maxSeamPositionError, maxSeamNormalError, regularitySamples, minJacobianSine,
      interiorNormalSamples, maxInteriorNormalError,
      thicknessProbes, maxThicknessError,
      triangles: funnel.numTri(), volume };
  } finally { marble.delete(); funnel.delete(); }
}
