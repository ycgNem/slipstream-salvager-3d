# Progress — Slipstream Salvager 3D

What is built. Newest first.

## 2026-10-12 — Milestone 0: vendor, scaffold, the 3D pipeline

- The 2D game's rules vendored from 2D `e0504af` (`src/sim`, `src/data`, its 61 tests and the bots),
  with `vendor.json` and a drift test (DECISIONS #1). The engine layer, e2e harness, Electron
  wrapper, Pages workflow (inert), service worker, manifest and `.bat` files copied and renamed.
- Three.js 0.186.1. `src/render3d/`: 640x360 target, composite pass with the palette snap, the
  rear mirror, edge markers, the chassis-bolted camera with speed FOV, the Ring from the arena data,
  the claw view model, the Rammer with its telegraph lane, particles, positional audio.
- `src/input3d/steer.ts`: the steer-demand adapter (mouse, A/D, W/S, gamepad), with tests.
- e2e: `launch.mjs` (SwiftShader), `smoke.mjs`, `shots.mjs` (scripted scenes + overlap audit),
  `perf.mjs`, `watch.mjs` (a bot plays in first person), `coverage.mjs` (models).

## 2026-10-12 — Planning

- PLAN, THREEJS-NOTES, START-HERE, HANDOFF, DECISIONS written. No code.

## Milestones

| Milestone | Status |
|---|---|
| M0 — Vendor, scaffold, 3D pipeline | done |
| M1 — First-person parity with the 2D slice | in progress |
| M2+ | waiting for the playtest |
