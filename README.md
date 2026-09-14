# Marbles

A marble-run sandbox inspired by Discovery Toys Marbleworks, with 20 procedural
components, snapping and rotation, maze presets, a storage tub full of loose
pieces, and animated construction. Includes component previews, cat’s-eye glass
marbles, and fixed-timestep video exports.

Built with React, TypeScript, Vite, and plain Three.js using WebGPU/TSL.
Box3D handles physics; Manifold generates the part geometry.

## In the repo

- `src/assembly/` — builder, snapping, presets, tub, physics, and cameras.
- `src/pieces/` — parametric parts and shared connector dimensions.
- `src/geometry/` — sweeps, surface joins, mesh cleanup, and normals.
- `src/generated/` — render meshes, collision data, and packed tub layouts.
- `src/vendor/box3d/` — patched Box3D WebAssembly build.
- `public/` — HDR environment, carpet texture, and reference image.
- `references/` — source links, drawings, and modeling notes.
- `scripts/` and `tests/` — geometry builds, physics checks, and video rendering.
- `wrangler.jsonc` — Cloudflare hosting for `marbles.vibe-coded.com`.

[MIT](LICENSE).
