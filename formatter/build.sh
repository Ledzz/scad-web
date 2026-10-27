#!/bin/bash
# build.sh — compile Topiary's OpenSCAD formatter to public/formatter/.
#
# Output (served next to the app, loaded by src/formatter/formatter-worker.ts):
#   topiary_scad.js / topiary_scad_bg.wasm  wasm-bindgen glue + module
#   openscad-formatting.scm                 the formatting rules (same file as
#                                           scad-fmt's: topiary 0.8.0 + fixes)
#
# Needs: rustup with the wasm32-unknown-unknown target, wasm-bindgen 0.2.129,
# and a clang with a wasm32 backend for the tree-sitter C runtime (Apple's
# clang has none; emscripten's bundled clang is used if CLANG is not set).
set -euo pipefail
cd "$(dirname "$0")"
export PATH="/opt/homebrew/opt/rustup/bin:$HOME/.cargo/bin:$PATH"

llvm=$(em-config LLVM_ROOT 2>/dev/null || true)
CLANG=${CLANG:-$llvm/clang}
LLVM_AR=${LLVM_AR:-$llvm/llvm-ar}
[ -x "$CLANG" ] || { echo "no wasm-capable clang: set CLANG=/path/to/clang" >&2; exit 1; }

(cd topiary-wasm && CC_wasm32_unknown_unknown="$CLANG" AR_wasm32_unknown_unknown="$LLVM_AR" \
  cargo build --release --target wasm32-unknown-unknown)

out=../public/formatter
mkdir -p "$out"
# no-modules: a classic script defining `wasm_bindgen`, so the worker can
# importScripts() it like openscad-worker does with browserfs.
wasm-bindgen --target no-modules --no-typescript --out-dir "$out" \
  topiary-wasm/target/wasm32-unknown-unknown/release/topiary_scad.wasm

wasm_opt=$(em-config BINARYEN_ROOT 2>/dev/null || true)/bin/wasm-opt
command -v wasm-opt >/dev/null && wasm_opt=$(command -v wasm-opt)
if [ -x "$wasm_opt" ]; then
  "$wasm_opt" -Oz --enable-bulk-memory --enable-nontrapping-float-to-int \
    "$out/topiary_scad_bg.wasm" -o "$out/topiary_scad_bg.wasm"
fi

cp openscad-formatting.scm "$out/"
ls -l "$out"
