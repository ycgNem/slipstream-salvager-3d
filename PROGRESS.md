# Progress — Slipstream Salvager 3D

What is built. Newest first.

## 2026-10-12 — Milestone 3: the critic's and the visual QA's review

- **Salvage stays gold** in shade and light; **flashes go white**; a cracked part flickers white (#35).
- **Every part shows its tear window** (a sliding Snapper's treads blink gold, as in 2D).
- **The pack you can't see:** hunting Snappers rumble where they are; a close enemy in a blind spot
  is a pip on that edge (gold when it's open); a Snapper sliding in the mirror lights its frame gold.
- **The treads' slide is aimed** by the mouse and keys while it swings, goes round the side with
  room, and S held after it no longer cuts thrust (3 new tests).
- **The Jaws' whip camera** holds through the hit-stop and eases out onto your fling line; **the claw
  ducks** for a close threat ahead; smaller tread and plow view models.
- **Exit signs** below the banner, a U-turn arrow and part icons for an exit behind you; HUD slots
  that read as three; the banner on whole pixels; frost floodlight lamps.
- **Draw calls with a full build:** 65 → 57 (lanes and shadows instanced, the chassis merged); perf
  now runs with Booster, Grip Treads and Jaws bolted on.
- **The 2D expansion (its M6-M9) is not vendored yet** (#36); the critic's rule ideas are proposals (#37).
- **Checks:** 105 tests; smoke; 61 scenes with 0 overlaps; perf (full build: max 57 draw calls,
  ~17k triangles, ~60 fps); coverage (16 models); whole runs (seeds 5 and 8).

## 2026-10-12 — Milestone 3: the run in first person

- **The view zoomed out** at the owner's request: FOV 82-102° (was 70-92°), the eye 0.68 m up and
  a little behind the body's centre (DECISIONS #27).
- **The 2D rules re-vendored** at 2D `297e40c`: the run, the Snapper, the Plow Rammer, the Jaw
  Snapper, three mounts, the Grip Treads, the Plow, the Jaws (#28).
- **The run:** five yards (The Ring; three of the Kennel, Long Lanes, the Plow Pit and Jaw Yard,
  chosen by driving out an exit; The Heap), each with its own obstacles; exits with gold lamps,
  chevrons and signs pinned over the gates (edge arrows when out of view); the wipe; run results and
  bests; the title tours the yards (#30, #32).
- **Models** by script in Blender: the Snapper (92 tris), the Grip Treads (60), the Plow (44), the Jaws
  (72), the post (20), the tower (132), the scrap block (258), the barrier (26); a parts atlas in gold.
- **Enemies as instanced batches**, so The Heap's six fit the draw-call budget (#29).
- **Your parts from the seat:** a tap of S with the Grip Treads power-slides you round; the Plow's
  blade, the Jaws and the treads' guards as view models; the Jaws' whip turns the view half a turn
  from the enemy you bit to your fling line; three HUD slots; the M3 hints; the pause card lists
  your parts' verbs (#31, #32).
- **Version 0.2.0**, service worker cache v2 (#33).
- **Checks:** 102 tests; smoke; 58 scenes with 0 overlaps; perf on The Heap's last wave (max 59
  draw calls, ~17k triangles, ~61 fps); coverage (16 models); whole runs end to end (`e2e/run.mjs`,
  #34).

## 2026-10-12 — Published

- The GitHub repo https://github.com/ycgNem/slipstream-salvager-3d (public, like the 2D game's) with `main` and `works`; GitHub Pages builds,
  tests and deploys every push to `main`: https://ycgnem.github.io/slipstream-salvager-3d/ (DECISIONS #26).

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
| M2 — Playtest fixes | first pass from the critic and QA review; published; the owner's note: zoom out (#27) |
| M3 — The run in first person | built, reviewed and fixed (#35); waiting for the owner's playtest |
