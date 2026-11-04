# CLAUDE.md

## What this is

A browser OpenSCAD: a fork of [openscad/openscad-playground](https://github.com/openscad/openscad-playground)
(remote `upstream`), made faster and given code formatting and an in-app cheatsheet. Repo
[Ledzz/scad-web](https://github.com/Ledzz/scad-web) (remote `origin`, SSH); **every push to `main`
deploys** to https://ledzz.github.io/scad-web/ (`.github/workflows/deploy.yml`: build incl. the
formatter, e2e tests, then GitHub Pages — a failing test blocks the deploy). README's "This fork"
section lists what differs from upstream.

## Commands

```bash
npm install
npm run build:libs        # OpenSCAD WASM + library zips + fonts (once; libs/ and public/libraries/ are gitignored)
npm run build:formatter   # Topiary -> public/formatter/ (needs the Rust toolchain below)
npm start                 # dev server, http://localhost:4000 — NO hot reload, refresh by hand
CI=true NODE_ENV=development npx jest   # 7 upstream e2e tests + cross-section; stop the dev server first (same port)
node tests/cheatsheet-check.mjs         # every Help snippet through native OpenSCAD (needs openscad-nightly)
```

Formatter toolchain on this Mac: rustup is keg-only at `/opt/homebrew/opt/rustup/bin` (build.sh adds
it to PATH), target `wasm32-unknown-unknown`, `wasm-bindgen` **0.2.129** (must equal the crate's
pin), and a clang with a wasm32 backend — Apple's has none, so build.sh uses emscripten's
(`em-config LLVM_ROOT`); CI passes `CLANG=clang LLVM_AR=llvm-ar`.

Native OpenSCAD for comparisons: `openscad-nightly` (2026.10.25, same version as the WASM). Plain
`openscad` on PATH is 2021.01 without Manifold — don't use it.

## How it is built — and what not to regress

- **WASM is the official 2026.10.25 snapshot** (`libs-config.json`). It needed two fixes: BrowserFS's
  `node_ops`/`stream_ops` are bound to their objects in `openscad-worker.ts` (newer emscripten calls
  them unbound → "Cannot read properties of undefined (reading 'fs')"), and `parseOff` reads the counts
  from the line after a bare `OFF` header.
- **Workers are long-lived lanes** (`src/runner/openscad-runner.ts`: `render`, `check`, `format`,
  `plain`), each keeping ONE OpenSCAD instance across runs. `noExitRuntime: true` is what lets
  `callMain` run again (without it main's exit sets ABORT). Inputs are rewritten only when changed,
  with a strictly increasing mtime — OpenSCAD caches `use`d files by whole-second mtime. `--enable=`
  flags stick in the instance, so a different feature set gets a fresh one; a crashed run drops it.
  A superseded job finishes unseen (keeps the caches) unless it has run > 2 s, then the worker is
  killed. Debounces: render 250 ms, syntax check 150 ms.
- **Remaining latency is OpenSCAD itself**: a BOSL2 model spends ~150 ms parsing `std.scad`, ~500 ms
  evaluating, ~120 ms in Manifold — about 2x native, because the WASM build is single-threaded. Only
  a threaded OpenSCAD WASM rebuild would cut it; nothing left at the app level.
- **Formatting** (Cmd/Ctrl+S, Shift+Alt+F): Topiary 0.8 compiled to WASM (`formatter/`), run in
  `src/formatter/formatter-worker.ts`. Output is byte-identical to the `topiary` CLI / `scad-fmt`
  (checked by SHA-256 on a 1600-line file). `formatScad()` applies it only if OpenSCAD's `.ast` export
  of the result equals the original's — formatting can never change code. Rules:
  `formatter/openscad-formatting.scm` = Topiary's OpenSCAD query + two fixes for glued tokens
  (`tag("x")for`, `module m()for`); keep it in sync with `~/.local/share/scad-live/openscad-formatting.scm`.
- **topiary-core 0.8 does not build for wasm32 as published** (its web-tree-sitter path has bit-rotted).
  `formatter/vendor-topiary.sh` vendors core + facade with the wasm cfgs switched to the native path,
  bumps tree-sitter to 0.27.1 / tree-sitter-language 0.1.9 (0.26 traps at run time on wasm32) and
  applies `formatter/patches/*.patch`. The grammar (`formatter/tree-sitter-openscad/`, rev acc196e) is
  compiled in by `build.rs`.
- **Help panel** = fourth layout panel (`help` in `MultiLayoutComponentId`, wired through app-state,
  initial-state, fragment-state, model, App, PanelSwitcher). Data: `src/help/cheatsheet.ts` — only what
  this OpenSCAD has with the app's features (lazy-union); experimental builtins are left out on
  purpose. Run `node tests/cheatsheet-check.mjs` after editing it. Hover docs come from the same data
  (`openscad-register-language.ts`).
- **Customizer** stores a `-D` override only for a real change: PrimeReact InputNumber reports its
  value on mount, which used to pin every parameter so editing it in the code did nothing. That rule
  is `Model.setParameter`, shared by the panel and WebMCP. Overrides are NOT passed as `-D`: OpenSCAD
  appends each `-D` to a global `commandline_commands` that is never cleared, so in a warm instance
  an override outlived its reset. `render` in `src/runner/actions.ts` appends them to the main file
  after `\x03` (TOK_EOT), exactly where OpenSCAD puts `-D` assignments: same mesh, no warnings.
- **WebMCP** (`src/webmcp/webmcp-tools.ts`, registered from App): nine tools on
  `document.modelContext.registerTool` (the spec's name since 2026; `navigator.modelContext` is the
  old one), unregistered through an AbortSignal. App makes a new Model every render, so the tools take
  the latest one from a ref. They wait on its state (`previewing`/`rendering`/`checkingSyntax`), never
  on `Model.render`'s promise, which never settles when a newer run supersedes it.
- **Cross-section** (`src/components/section-view.ts`, `SectionPlane.tsx`, `SectionControls.tsx`):
  model-viewer has no clipping API, so it finds the element's `scene`/`renderer` symbols and works on
  the three.js r163 objects inside — tied to the bundled `public/model-viewer.min.js`; re-check after
  upgrading it. The renderer has no stencil buffer, so the cut is the mesh's back faces painted flat
  and hatched (an `onBeforeCompile` patch after `#include <opaque_fragment>`), nudged 1e-6 towards the
  camera so touching lazy-union solids don't z-fight; a slope-scaled nudge showed on every silhouette.
  The plane (normal, two in-plane directions, origin it turns about) is kept in OpenSCAD coordinates
  and moved to world space in `scene.onBeforeRender`, since the model moves when the camera target
  does. The Onshape-style gizmo (outline, arrow to move, arcs to tilt) is an SVG overlay redrawn from
  that same hook, sized in screen pixels; a drag reads the pointer's move along the handle's direction
  on screen.
- The single-layout TabMenu is controlled (`onTabChange`), so its highlight follows focus changes
  made in code.

## Testing in the browser — gotchas

- Programmatic `.click()` on a PrimeReact `ToggleButton` does NOT toggle it; use a real click. Hidden
  panels stay in the DOM, so code can "work" on a panel that is not visible — check `display`.
- Browser-pane screenshots lag a render; read state with JS before trusting a screenshot.
- The Android UA (mobile viewport preset) gets a plain textarea instead of Monaco
  (`isMonacoSupported`); Help inserts plain text there.
- The deployed site has a service worker (StaleWhileRevalidate): the first load after a deploy can
  still be the old build.
- The browser pane has no WebMCP. To call the tools, launch the system Chrome (156) through
  puppeteer from `node_modules` with `--enable-features=WebMCPTesting`, then use
  `document.modelContext.getTools()` / `executeTool(tool, input)`; the result is a JSON string.
