import type { ManifoldToplevel, Vec2, Vec3 } from 'manifold-3d';

/** One sweep implementation for track molds and their matching cavity cores.
 * The mapper owns path, section transition and elevation; use the same mapper
 * for both skins. The caller owns the returned solid. */
export function sweepSection(kernel: ManifoldToplevel, profile: Vec2[], length: number,
  segments: number, map: (point: Vec3) => void) {
  const section = new kernel.CrossSection(profile, 'NonZero');
  try {
    const extrusion = section.extrude(length, segments);
    try { return extrusion.warp(map); }
    finally { extrusion.delete(); }
  } finally { section.delete(); }
}
