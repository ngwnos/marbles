#!/usr/bin/env bash
# Requires Emscripten 4.0.18 (active in PATH) and CMake.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BUILD="$ROOT/tools/box3d/.build"
WRAPPER=2f2f97aee74a075c3f24184d1c4fd504497d0da5
ENGINE=29bf523ce7bc4590aba9f17c9db791cdc5c4397e
mkdir -p "$BUILD/wrapper" "$BUILD/engine"
curl -fLs "https://github.com/monteslu/box3d-wasm/archive/$WRAPPER.tar.gz" | tar -xz --strip-components=1 -C "$BUILD/wrapper"
curl -fLs "https://github.com/erincatto/box3d/archive/$ENGINE.tar.gz" | tar -xz --strip-components=1 -C "$BUILD/engine"
(cd "$BUILD/wrapper" && patch -p1 < "$ROOT/tools/box3d/mesh-binding.patch")
(cd "$BUILD/engine" && patch -p1 < "$ROOT/tools/box3d/manifold-allocation.patch")
(cd "$BUILD/engine" && patch -p1 < "$ROOT/tools/box3d/sat-simd.patch")
# Keep complete triangle adjacency for detailed toy-sized receivers. The upstream
# 256-triangle cap can discard the floor contacts of an entire marble-sized patch.
python3 - "$BUILD/engine/src/mesh_contact.c" <<'PYCODE'
import sys
p=sys.argv[1]
s=open(p).read().replace('#define B3_MAX_MESH_CONTACT_TRIANGLES 256','#define B3_MAX_MESH_CONTACT_TRIANGLES 4096')
open(p,'w').write(s)
PYCODE
emcmake cmake --fresh -S "$BUILD/engine" -B "$BUILD/cmake" -DCMAKE_BUILD_TYPE=Release -DBOX3D_SAMPLES=OFF -DBOX3D_UNIT_TESTS=OFF -DBOX3D_BENCHMARKS=OFF -DBOX3D_DOCS=OFF -DBOX3D_VALIDATE=OFF
cmake --build "$BUILD/cmake" --parallel
emcc "$BUILD/wrapper/csrc/glue.cpp" "$BUILD/wrapper/csrc/flat.cpp" "$BUILD/cmake/src/libbox3d.a" \
 -I "$BUILD/engine/include" -std=c++17 -lembind -O3 -msimd128 -msse2 \
 -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=Box3D -sENVIRONMENT=web,worker,node \
 -sSTACK_SIZE=1048576 -sALLOW_MEMORY_GROWTH=1 -sALLOW_TABLE_GROWTH=1 -sFILESYSTEM=0 \
 -sEXPORTED_RUNTIME_METHODS=HEAPF32,HEAPU8,HEAPU32 -o "$ROOT/src/vendor/box3d/box3d.mjs"
