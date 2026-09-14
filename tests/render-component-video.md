# Square model / photograph comparison

The comparison is 1080 × 1080 at 60 fps: four 540 × 540 cells, models in the
top row and their original reference photographs directly below. Every pair
lasts exactly two seconds. All 20 catalog components appear once, for a
20-second / 1,200-frame video. Photographs change every half-second; smaller
photo sets cycle. No editor UI, titles, intro, outro, or audio are added.

1. Run `python3 scripts/cache-component-photos.py` to cache the original photos
   in ignored `tmp/component-video/`. Source URLs and subject crop regions live
   in `tests/fixtures/component-photos.json`.
2. Run `python3 -u scripts/receive-video.py tmp/videos/comparison.mp4 60`.
   Use a new filename. Copy the loopback endpoint it prints.
3. Open `http://127.0.0.1:5215/tests/component-video.html` in Brave and wait for
   `document.documentElement.dataset.componentVideo === 'ready'`.
4. Invoke `componentVideo.run({endpoint: 'http://127.0.0.1:PORT/TOKEN'})`.
   Read `componentVideo.progress` for status. The receiver writes MP4 + JSON
   and exits. Close the temporary browser tab after export.

`componentVideo.seek(frame)` previews a specific frame and returns the pair,
active photos, and model bounds in screen coordinates. `play()` and `pause()`
allow real-time review. These hooks are confined to the development page.

The renderer loads the same baked geometry as the component previews. The
starting gate and paddle use their existing separate moving meshes and pivot
placement. Geometry is never regenerated or changed for this video.

Each model turns through 225° with a gentle elevation change. Its view stays
centered on its bounds and uses one fixed orthographic fit for the whole turn.
The bottom cells use square crops from the original photographs, without
stretching, invented background, or letterboxing. Detail photographs are
intentionally allowed to show only part of a component. Listed sources include
the original preview references and additional photographs of matching parts;
they are preserved in the MP4's JSON sidecar as well.

The export uses WebGPU canvas-backed VideoFrames and the existing FFmpeg MP4
receiver. It verifies every encoded timestamp and frame count, and bounds both
the GPU and encoder queues. Rendering does not read pixels back to JavaScript.
