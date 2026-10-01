#!/usr/bin/env bash
# AEML, NTUST -- Linux rebuild of the wasm-dolphin core with the Wii Remote hook.
#
# Mirrors tools/configure-upstream-wasm.mjs + build-upstream-target.mjs, but:
#   * uses a locally built toolchain (LLVM 23 + Binaryen 128 + Emscripten 5.0.7)
#     instead of the Windows emsdk the lock file pins;
#   * links a C stub for the Rust Naga bridge (only the experimental WebGPU
#     hardware renderer uses it);
#   * writes to build/aeml-core-out so the shipped core is not overwritten
#     until the new one has been tested.
# SPDX-License-Identifier: GPL-2.0-or-later
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TC="${AEML_TOOLCHAIN:-/home/claude/tc}"
export EM_CONFIG="$TC/emscripten-config.py"
export PATH="$TC/emscripten:$TC/llvm/bin:$PATH"
BUILD="${DOLPHIN_WASM_BUILD_DIR:-$ROOT/build/dolphin-wasm}"
OUT="${DOLPHIN_WASM_OUTPUT_DIR:-$ROOT/build/aeml-core-out}"
JOBS="${BUILD_PARALLELISM:-2}"
LTO="${AEML_LTO:--flto=thin}"
mkdir -p "$BUILD" "$OUT" "$ROOT/build/naga-stub"

# 1. Naga stand-in
emcc -O2 -pthread -c "$ROOT/tools/aeml-naga-stub.c" -o "$ROOT/build/naga-stub/stub.o"
emar rcs "$ROOT/build/naga-stub/libnaga_spirv_wgsl.a" "$ROOT/build/naga-stub/stub.o"
NAGA="$ROOT/build/naga-stub/libnaga_spirv_wgsl.a"
# Prefer the real Naga bridge (WebGPU hardware renderer) when it has been built:
#   cd tools/naga-spirv-wgsl && RUSTC_BOOTSTRAP=1 cargo build --locked --release \
#     --target wasm32-unknown-emscripten      (Ubuntu rustc 1.91 + rust-1.91-src works)
REAL_NAGA="$ROOT/tools/naga-spirv-wgsl/target/wasm32-unknown-emscripten/release/libnaga_spirv_wgsl.a"
if [ -f "$REAL_NAGA" ] && [ "${AEML_NAGA_STUB:-0}" != "1" ]; then NAGA="$REAL_NAGA"; fi
echo "Naga library: $NAGA"

# 2. Configure (same flags as the committed core, see its build.json)
FLAGS="-O3 -pthread -msimd128 $LTO -DXXH_VECTOR=0 -DDOLPHIN_WEB_HOT_COUNTERS=0 \
-DDOLPHIN_WEB_INLINE_FAST_BRANCH=1 -DDOLPHIN_WEB_FALLBACK_MAP_DIAGNOSTICS=0 \
-DDOLPHIN_WEB_FALLBACK_MAP_BITS=16 -DDOLPHIN_WEB_DIRECT_WASM_BLOCK_DISPATCH=0"
if [ ! -f "$BUILD/CMakeCache.txt" ]; then
  emcmake cmake -S "$ROOT/vendor/dolphin" -B "$BUILD" -GNinja \
    -DCMAKE_BUILD_TYPE=Release -DCMAKE_TRY_COMPILE_CONFIGURATION=Debug \
    -DCMAKE_EXPORT_COMPILE_COMMANDS=ON -DUSE_SYSTEM_LIBS=OFF -DENABLE_GENERIC=ON \
    -DENABLE_QT=OFF -DENABLE_NOGUI=OFF -DENABLE_CLI_TOOL=OFF -DENABLE_HEADLESS=OFF \
    -DENABLE_ALSA=OFF -DENABLE_PULSEAUDIO=OFF -DENABLE_CUBEB=OFF -DENABLE_X11=OFF \
    -DENABLE_EGL=OFF -DENABLE_SDL=OFF -DENABLE_VULKAN=OFF -DENABLE_LLVM=OFF \
    -DENABLE_TESTS=OFF -DUSE_UPNP=OFF -DUSE_DISCORD_PRESENCE=OFF -DUSE_MGBA=OFF \
    -DUSE_RETRO_ACHIEVEMENTS=OFF -DENABLE_AUTOUPDATE=OFF -DENABLE_ANALYTICS=OFF \
    -DENCODE_FRAMEDUMPS=OFF -DWITH_OPTIM=OFF -DWITH_SSE2=OFF -DWITH_SSSE3=OFF \
    -DWITH_SSE41=OFF -DWITH_SSE42=OFF -DWITH_PCLMULQDQ=OFF -DWITH_AVX2=OFF \
    -DWITH_AVX512=OFF -DWITH_AVX512VNNI=OFF -DWITH_VPCLMULQDQ=OFF \
    "-DCMAKE_C_FLAGS:STRING=$FLAGS" "-DCMAKE_CXX_FLAGS:STRING=$FLAGS" \
    "-DCMAKE_C_FLAGS_DEBUG:STRING=-O0 -fno-lto" "-DCMAKE_CXX_FLAGS_DEBUG:STRING=-O0 -fno-lto" \
    "-DDOLPHIN_WASM_NAGA_WGSL_LIB=$NAGA" \
    "-DDOLPHIN_WASM_JIT_CACHE_PRE_JS=$ROOT/tools/jit-cache-prejs.js" \
    -DDOLPHIN_WASM_MEMORY_PAGES=24576 \
    "-DDOLPHIN_WASM_PROJECT_ROOT=$ROOT" \
    "-DDOLPHIN_WASM_BRIDGE_SOURCE=$ROOT/core/upstream/dolphin_web_discio.cpp" \
    "-DDOLPHIN_WASM_SHARED_SOURCE_DIR=$ROOT/core/upstream" \
    "-DDOLPHIN_WASM_CORE_SOURCE=$ROOT/core/upstream/dolphin_web_core.cpp" \
    "-DDOLPHIN_WASM_OUTPUT_DIR=$OUT"
fi

# keep an existing configuration in sync with the chosen Naga library
cmake "$BUILD" "-DDOLPHIN_WASM_NAGA_WGSL_LIB=$NAGA" > /dev/null

# 3. Build the full browser core
cmake --build "$BUILD" --target dolphin_web_core --parallel "$JOBS"
ls -la "$OUT"
