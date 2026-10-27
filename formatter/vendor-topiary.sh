#!/bin/bash
# vendor-topiary.sh — copy topiary-core and topiary-tree-sitter-facade 0.8.0
# into ./vendor and switch their wasm32 code paths OFF.
#
# Why: on wasm32, topiary 0.8 routes parsing through web-tree-sitter JS
# bindings that have bit-rotted (5 compile errors in topiary-core, and its own
# Cargo.lock fails on tree-sitter-language). The native path - the one the
# `topiary` CLI runs - compiles to wasm32-unknown-unknown fine, since the
# tree-sitter C runtime ships wasm stdlib shims. So every
# `target_arch = "wasm32"` cfg becomes `any()` (always false): on wasm32 the
# crates now take exactly the code path the CLI takes.
set -euo pipefail
cd "$(dirname "$0")"

reg=$(ls -d "$HOME"/.cargo/registry/src/index.crates.io-*/ | head -1)
for c in topiary-core-0.8.0 topiary-tree-sitter-facade-0.8.0; do
  [ -d "$reg/$c" ] || { echo "missing $reg/$c - run cargo fetch in topiary-wasm first" >&2; exit 1; }
  rm -rf "vendor/$c"; mkdir -p vendor
  cp -R "$reg/$c" "vendor/$c"
  rm -f "vendor/$c/.cargo_vcs_info.json" "vendor/$c/Cargo.toml.orig"
  find "vendor/$c/src" -name '*.rs' -exec sed -i '' 's/target_arch = "wasm32"/any()/g' {} +
done

# Cargo.toml: drop the wasm-only dependency tables, make the native ones
# unconditional. (Published manifests are normalized, so plain text edits.)
python3 - <<'EOF'
import re, pathlib
for c in ["topiary-core-0.8.0", "topiary-tree-sitter-facade-0.8.0"]:
    p = pathlib.Path("vendor") / c / "Cargo.toml"
    t = p.read_text()
    # [target.'cfg(target_arch = "wasm32")'.<kind>] ... up to the next table
    t = re.sub(r'\[target\.\'cfg\(target_arch = "wasm32"\)\'\.[a-z-]+(\.[a-z0-9_-]+)?\]\n(?:(?!\[).*\n?)*', "", t)
    # [target.'cfg(not(target_arch = "wasm32"))'.dependencies.X] -> [dependencies.X]
    t = re.sub(r'\[target\.\'cfg\(not\(target_arch = "wasm32"\)\)\'\.([a-z-]+)', r"[\1", t)
    # tree-sitter 0.26's C runtime traps at run time on wasm32-unknown-unknown
    # (tree-sitter-language 0.1.8+ refuse that pair outright); 0.27 + 0.1.9 work.
    t = t.replace('[dependencies.tree-sitter]\nversion = "=0.26.12"', '[dependencies.tree-sitter]\nversion = "=0.27.1"')
    t = re.sub(r'(\[dependencies\.tree-sitter-language\]\nversion = )"[^"]*"', r'\1"=0.1.9"', t)
    p.write_text(t)
    print(p, "->", "ok" if "wasm32" not in t else "STILL MENTIONS wasm32")
EOF
grep -rn 'target_arch = "wasm32"' vendor && { echo "cfg left behind" >&2; exit 1; } || true

# Port the native path from tree-sitter 0.26 to 0.27 (facade: 6 API changes;
# core: 3 calls where QueryMatch::captures() is now shadowed by an inherent method).
patch -s -d vendor/topiary-tree-sitter-facade-0.8.0 -p1 < patches/facade-tree-sitter-0.27.patch
patch -s -d vendor/topiary-core-0.8.0 -p1 < patches/core-tree-sitter-0.27.patch
echo "vendored: $(ls vendor)"
