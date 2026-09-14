# Assembly performance

The development URL `/?verify=performance` creates an isolated editor layout
and exposes `window.assemblyPerformance`. It never restores or saves the user's
layout. `run('dump')`, `run('idle')`, and `run('built')` exercise Tangled Garden
with the real renderer. Optional arguments are frame count, width and height.

Each frame advances exactly 1/60 second. The harness warms the shaders, measures
physics, scene updates and rendering submission separately, resolves WebGPU
timestamps, and waits for GPU completion. It reports per-second timing slices,
draw calls and triangle counts. These are frame-work timings, not uncapped RAF
FPS. Keep other compute-heavy tasks idle when comparing runs.

## Physics equivalence

`bun run benchmark:assembly --all --output tmp/current.json` exercises sleeping
fills, dumping and the drag hinge with all ten fills and the packed preset.
`--engine /path/to/box3d.mjs` selects a baseline engine (keep its companion WASM
beside it). `--compare tmp/baseline.json` fails if any sampled position, rotation,
velocity, sleep state, rotor or tub state differs. Samples cover motion at 10 Hz
and each phase's final state; hashing and pose reads are excluded from timings.

The SIMD validation build also compared every optimized edge query directly
against the scalar query while exercising these cases. This guards the actual
collision calculation, including its choice between equally good contact axes.

## September 2026 measurements

Brave/WebGPU, 1800 × 992 drawing buffer, 90-piece packed Tangled Garden, 360
frames. Both versions rendered 4,055,551 triangles and 18 draws. Representative
runs on the development machine:

| Work | Before | After |
| --- | ---: | ---: |
| Physics in busiest simulated second, mean per frame | 13.54 ms | 9.68 ms |
| Physics over whole dump, mean per frame | 5.59 ms | 4.66 ms |
| Complete frame work, 95th percentile | 18.4 ms | 14.7 ms |
| Render submission, stationary built preset | 0.49 ms | 0.39 ms |

Timing varied under unrelated system load. Alternating the two engines within
the same browser test also measured about 29% less physics time in the busiest
second, with identical sampled state. These figures are workload measurements,
not guaranteed FPS on other hardware.

Rendering retains instance buffers between frames, uploads only changed ranges,
and enables batch frustum culling with bounds invalidated when transforms or
counts change. Pose polling reads sleeping bodies once more when they settle,
then resumes on wake-up or scripted motion. Meshes, materials, resolution,
colliders, solver settings and the dump path are preserved.

Validation includes `test:smoke`, `test:tub-dump`, `test:tub-fills`, and the editor
browser checks. The broad `physics:check` suite has a pre-existing failed paddle
drop at 5°: the original and optimized engines produce the same stalled endpoint
and maximum wheel speed. The performance change does not alter that result.
