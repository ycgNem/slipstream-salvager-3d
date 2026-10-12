# Progress — Slipstream Salvager 3D

What is built. Newest first.

## 2026-10-12 — Milestone 2, first pass: the critic's and the visual QA's review

- Two review agents (design critic, visual QA) went over the M1 build; every finding that wasn't a
  rule change is fixed (DECISIONS #23); the rule changes are proposals (#24).
- **Controls:** S no longer blocks steering at low speed; a mouse turn is kept whole, so the same
  flick turns the same amount at any speed; held A/D ramp into a hard turn that scrubs like the 2D
  game; scrub is shown (the reticle blinks, skid marks) and heard (a squeal).
- **Threats:** long filled arrows, compass-style; behind you they sit beside the mirror and light its
  frame; a warned gate gets one; sounds from behind are muffled; the mirror's frame flashes gold when a
  Rammer that charged past you opens its back.
- **Speed without the HUD:** the floor's seams and rivets glow a step above the dark floor, so the
  ground streams under you below Slipstream.
- **Fixed:** a crash in the speed lines at the moment of impact; the Burn lane drawn as a slash;
  muddy flash colors; a stray line across the sky; moiré in the lanes; towing vs bolted looking the
  same in the mirror; and smaller QA findings. A first-time mirror hint, a clearer tear hint, and a
  controls card on the pause screen.
- **The critic's re-check** (DECISIONS #25): the scrub cue only on a real loss, mouse turns no longer
  committed for long, hints step aside for reward text, a reflex E after a tear is kept.
- **Checks:** 74 tests; smoke; 33 scenes with 0 overlaps and 0 off-palette pixels; perf 54-63 fps, max
  56 draw calls, ~15k triangles; bot watches with no console errors.

## 2026-10-12 — Milestone 1: first-person parity with the 2D slice

- **Models** by script in headless Blender (`art/`, `npm run models`, verified by
  `art/_lib/verify_models.py`): Rammer 296 tris with its booster, booster 126, Scrapper 150, claw
  232, pillar 54, wall 42, gate 130, floor 2; 64x64 Resurrect 64 atlases.
- **The Rammer in every state:** stalk bob, the crouched windup with its lane dashed then locked
  (flashing chevrons), the charge lean and plume, the skid with steam and marks, the stunned wobble,
  the stripped limp with smoke, crackle at low HP, the wreck burst with debris; its booster glints
  gold while its back is open; its sounds come from where it is.
- **Salvage:** the gold tear burst, the towed booster on its cable in the mirror (and a tether that
  whips into the lower frame on turns), pickups bobbing and glinting, the 0.7 s bolt (the claw's
  ratchet twist, sparks at your back), the booster on your back in the mirror, knock-loose and shatter.
- **The Burn:** the teal lane, the FOV push, the claw coiled and trembling, the whine, the plume;
  release to pierce; the wall stun with stars and a wobble.
- **Speed without the HUD:** FOV 70→92°, the claw glow and ring grey/lime/teal, the hum, the edge
  smear and speed lines at Slipstream, grit rushing past; the gauge last and hideable (H).
- **Readability from behind:** the 400x90 mirror, edge markers, positional sound (DECISIONS #6, #13, #15).
- **Screens:** title with a live attract mode, settings (volumes, music, shake, hints, mouse
  sensitivity, invert, speed gauge, palette filter), pause, results with best clear, the hints placed
  in the world, the wave banner, gate warnings on the floor, the tuning panel with flat mode and
  START WITH THE BOOSTER.
- **Checks:** 68 tests; smoke; 33 scripted scenes with the overlap audit; perf (SwiftShader, wave 3:
  ~55 fps, ~51 draw calls, ~14k triangles); model coverage; the web build; the Windows installer and
  portable exe (`release/`, 0.1.0).

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
| M1 — First-person parity with the 2D slice | done |
| M2 — Playtest fixes | first pass from the critic and QA review; waiting for the owner's playtest |
