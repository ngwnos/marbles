# Scene video benchmark

Measured September 13, 2026 in the user's Brave browser (Chromium 153), on
an Apple M5 Pro with 20 GPU cores and 48 GB memory.

| Output | Render only | Render + WebCodecs H.264 | Speed relative to 60 fps |
| --- | ---: | ---: | ---: |
| 1920 × 1080 | 696 fps | 279 fps | 4.66× |
| 3840 × 2160 | 287 fps | 74 fps | 1.23× |

Medians of three 1,200-frame runs per combination, alternating mode order.
Encoded throughput ranges: 279.4–279.6 fps at 1080p, 72.3–73.8 fps at 4K.
Raw measurements are in `video-benchmark-results.json`.

The actual builder scene contains the 90-piece Tangled Garden, six marbles,
marble outlines, the carpet material, tub, and HDRI lighting/background.
The deterministic camera orbit changes every frame. Physics is frozen to
isolate render/capture/encode throughput; these are not measurements of the
complete construction-and-physics exporter. Pixel ratio is one, with the
existing antialiasing and tone mapping. Selection helpers are hidden and
HTML UI is excluded because only the WebGPU canvas is captured.

Each case warms 48 frames, bounds GPU submission to batches of four, and
limits the encoder input queue to nine. Timings include GPU completion and
the final encoder flush. There is no RAF/vsync limit, explicit pixel
readback, image compression, or transfer through browser automation in the
encode path. H.264 uses `prefer-hardware`, quality latency, Annex B output,
and 16 Mbps at 1080p / 45 Mbps at 4K. This preference does not prove the
browser selected a hardware encoder or that its internal path is zero-copy.

Constructing the canvas-backed VideoFrame averaged about 0.022 ms at 1080p
and 0.031 ms at 4K during encoding. A diagnostic that explicitly copies
every frame into CPU memory achieved 318 / 143 fps (without encoding).
These measurements support avoiding explicit readback; they do not identify
the browser's internal encoder/color-conversion bottleneck.

All encoded runs checked output frame counts and exact microsecond
timestamps against input. A saved 4K sample was muxed into MP4 without
re-encoding, decoded with FFmpeg, and checked: 240 distinct decoded frames,
3840 × 2160, 60 fps, exactly four seconds. First/middle/last frames were
visually inspected for camera motion, scene content, and absence of UI.
Muxing, disk writes, loading, and shader compilation are outside the timings.

## Reproduce

Open `http://127.0.0.1:5215/build.html?verify=video` in a separate Brave tab.
This disables persistence and only enables the harness in development.
Wait for `document.documentElement.dataset.videoBenchmark === 'ready'`.
In that tab's console:

```js
for (let repeat = 0; repeat < 3; repeat++) {
  for (const width of [1920, 3840]) {
    const height = width === 1920 ? 1080 : 2160;
    for (const mode of repeat % 2 ? ['encode', 'render'] : ['render', 'encode']) {
      console.log(await videoBenchmark.run({width, height, mode, frames: 1200}));
    }
  }
}
```

The API also accepts `capture` (create/close VideoFrame) and `readback`
(VideoFrame.copyTo) modes. `videoBenchmark.results` retains measurements;
`videoBenchmark.progress` reports progress. An encode run with
`keepVideo: true` retains compressed chunks, available as base64 through
`videoBenchmark.videoBase64()`. Export/transfer those only after timing.
Reloading the test tab resets it. The regular builder has no benchmark UI.
