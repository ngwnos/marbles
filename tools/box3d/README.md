# Box3D preview mesh binding

The previews use Box3D, with a small extension to the existing WASM wrapper:
`MeshGeometry` owns a `b3MeshData`; `Body.createMesh` attaches a static mesh.
Keep mesh data alive until after world destruction. The engine contact-query capacity is raised from 256 to 4096 triangles, with a 1 MiB WASM stack for its temporary contact arrays.

`manifold-allocation.patch` prevents quadratic contact-pool preallocation: small
manifold arrays use lazily allocated pools; arrays larger than eight contacts use
an allocation sized to the actual count. The unpatched switch-track off-center
drop exhausted the 2 GiB WASM heap. The reproducer completes under AddressSanitizer
with the patch. `scripts/test-split-drops.ts` includes the triggering offset.

`sat-simd.patch` batches the hull edge-pair predicate across four SIMD lanes.
It keeps scalar dot-product ordering, pair traversal order, separating axes,
and contact construction. Non-SSE2 targets retain the original scalar path.
Defining `B3_VALIDATE_EDGE_SIMD` in the engine C flags additionally runs the
original query and aborts on a differing axis or separation. The checked build
was exercised against all ten tub fills and the packed Tangled Garden preset.
`benchmark:assembly` can compare their full sampled trajectories with an older
WASM build; see `tests/assembly-performance.md`.

Assemblies keep one connected collider per component. Joining disconnected parts
into one triangle mesh changed contacts on the jump chute before landing contact.

Sources pinned in `build.sh`:
- https://github.com/monteslu/box3d-wasm (wrapper; licenses in src/vendor/box3d)
- https://github.com/erincatto/box3d (engine; same revision as wrapper versions.json)

To rebuild, activate Emscripten 4.0.18, install CMake, then run `bun run physics:build`.
The checked-in JS/WASM artifacts mean normal development needs neither tool.

## Preview collision assets

`bun run physics:colliders` rebuilds collision caches. Static meshes are simplified
with a 0.08 mm tolerance, preserving the visible geometry separately. Runtime collision
uses one connected mesh per part, preserving triangle adjacency across the entire
surface. Splitting the surface into small mesh shapes created false exposed edges.
Mesh welding and edge identification are enabled.

The wheel is a compound of convex prisms triangulated/merged from actual rotor
cross-sections, plus convex axle/hub prisms. Section simplification is 0.035 mm;
a symmetric volume-difference check guards against filling its holes. It is a
dynamic rigid body on a Z-axis revolute joint. A zero-speed, torque-limited motor
models dry axle friction (coefficient 0.04, load from wheel weight, axle radius
1.6 mm), with angular damping 0.2. It resists rotation without driving it.
The tests check passage, spin-down within 12 seconds, and no spontaneous motion
after reset. Density ratio
is 2.5 for glass to 1.2 for plastic. Friction/restitution are test parameters, not
measurements. Current physics settings live in `src/physics-settings.ts`: 16 mm
units, Earth gravity, 240 Hz solver steps with eight substeps per call. The
builder advances two solver calls per 120 Hz assembly tick.

`bun run physics:check` runs the same simulation headlessly, checks six wheel
starting angles and both intersection inlets, writes drop-test-results.json, and
fails if any marble does not exit. This is a functional diagnostic, not a claim
that the reference reconstruction is dimensionally certified. The 15.9 mm marble
is the existing project's nominal test size; its match to the vintage set is unverified.

The paddle now passes all six tested wheel angles after deepening the chute bed,
with its wheel dimensions, axle position, upper rims and connectors unchanged.
`bun scripts/test-preview-drops.ts --paddle` checks it independently.
At the initial connected-mesh implementation, the standard ramp, funnel and snake
stalled at their receivers; later receiver geometry work is described in
`src/geometry/README.md` and `src/assembly/README.md`. Rerun the drop checks for
current results. Earlier partitioned-mesh passes were unreliable.
