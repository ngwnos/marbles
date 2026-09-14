# Render the preset sequence

Run `python3 -u scripts/receive-video.py tmp/videos/run.mp4 60` from the
project. The output must not already exist. The receiver prints a unique
loopback endpoint and exits after writing the MP4 and its JSON metadata.

Open `/build.html?verify=render` in a separate development tab. Wait for
`document.documentElement.dataset.sceneVideo === 'ready'`, then invoke:

```js
await sceneVideo.run({endpoint: 'http://127.0.0.1:PORT/TOKEN'});
```

Defaults: 3840 × 2160, 60 fps, seed 20260913, Tangled Garden, construction
at 5×. Optional `width`, `height`, `fps` (30 or 60), and `seed` arguments
are supported; receiver and renderer FPS must match. Read
`sceneVideo.progress` while the asynchronous render runs.

The sequence starts packed and begins construction immediately after the dump,
while the loose pieces are still settling. The camera approaches the starting
gate only once the actual upright gate enters its final approach, then carries
its motion into marble following. The gate fills as construction completes and
releases once the camera has acquired it (with at least 0.45 seconds to settle).
The camera follows one marble to the finish, then after two seconds begins a
continuous pullback into a faster orbit of the completed maze. The ten-second
ending fits the whole connected structure, using a fixed zoom once the pullback
finishes. Spare pieces and the tub do not affect its framing.
It uses the existing physics, construction, and camera code with a fixed
frame clock. Editor helpers and HTML are excluded, and saved user layouts
are untouched. Construction verifies the original inventory and all final
connections; capture checks every encoded frame's timestamp and count. The JSON
also samples the camera path and the followed marble's line of sight for review.

Marble following uses a steady orbit with bounded angular speed and acceleration.
Its whole orbit follows the marble, including height; nearby towers cannot hold
the camera up and turn the view vertical. Temporary occlusion does not select
a new camera angle. The orbit turns toward the finish's front early and eases
into its final view. `bun run test:marble-follow` replays a recorded Tangled Garden
descent at 30, 60, and 120 fps, checking viewing angle, distance and height relative
to the marble, angular motion, and manual orbit/zoom takeover.
`bun run test:maze-orbit` checks the ending's handoff, steady wide framing through
every angle, faster orbit, manual takeover, and matching motion at 30/60/120 fps.

Canvas-backed VideoFrames feed hardware-preferred H.264 WebCodecs encoding.
Ordered compressed chunks are uploaded in bounded batches; FFmpeg adds
fixed-rate packet timestamps and muxes directly into MP4 without re-encoding.
The receiver rejects missing/out-of-order chunks. There is no raw pixel
readback in the rendering loop. Close the development tab after export.
