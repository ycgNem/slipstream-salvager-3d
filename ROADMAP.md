# Slipstream Salvager 3D — Roadmap

Written 2026-10-12. `PLAN.md` is what the game is (and what first person changes), `THREEJS-NOTES.md`
the rendering rules, `STYLE.md` the art rules, `DECISIONS.md` every call and why, `PROGRESS.md`
what's built, `HANDOFF.md` where the last session stopped. The game's rules are the 2D game's
(`C:\Users\jacks\Documents\slipstream-salvager`, read-only from here), vendored in `src/sim` and
`src/data`.

**Status (2026-10-12):** M0-M2 are built and published (https://ycgnem.github.io/slipstream-salvager-3d/).
The owner played it ("looks good"), asked for the view zoomed out (done, DECISIONS #27) and for the
next milestones: **M3, the run in first person, is built** (DECISIONS #28-#34) and reviewed by the
critic and visual QA agents; it waits for the owner's playtest and their word to publish.

**How every session runs:** start with *"Read ROADMAP.md and HANDOFF.md"*. Build the phase,
deciding small things alone and logging them in `DECISIONS.md`. Run the phase's checks. Commit on
`works`. **Push and publish only when the owner says so** (pushing `main` deploys to Pages;
DECISIONS #26).

---

## Milestone 0 — Vendor, scaffold, prove the 3D pipeline (done)

- Vendor `src/sim`, `src/data` (+ the 2D tests, the bots, the sprite-name list the data test reads)
  from the 2D project with `vendor.json` and a drift test; copy the engine layer, e2e harness,
  Electron wrapper, Pages workflow, service worker, manifest, `.bat` files and configs; rename every
  identity string (PLAN.md "Identity").
- Three.js pinned; `src/render3d/`: the 640x360 target with whole-number upscale, the composite
  pass, the chassis-bolted camera with speed-driven FOV, one directional + one hemisphere light, the
  Ring from `src/data/arena`, the claw in the lower middle of the view with its tier glow.
- `src/input3d/`: pointer lock, steer demand, W/S, A/D, Rip on click/Space, Bolt on E, look-back on Q,
  gamepad; the sim at 60 Hz through the existing loop, rendered with alpha interpolation.
- One Rammer driven by the sim with its telegraph lane decal, hit-stop and shake from events, the
  SFX bank through positional panners, the engine hum non-positional.
- The rear strip and the screen-edge markers.
- `e2e/launch.mjs` (SwiftShader flags), `e2e/shots.mjs` (scripted scenes incl. the five M0 ones:
  at rest facing a Rammer, a Slipstream mid-pass, being charged from behind, a wall clank, the
  results), `e2e/perf.mjs`, `e2e/smoke.mjs`.

**Checks:** `npm test` (the vendored suite unchanged + the drift and steer tests), `npm run e2e`,
`npm run shots`, `npm run perf`.

## Milestone 1 — First-person parity with the 2D slice (done)

1. Models by script in Blender into `art/<family>/build_*.py` and `.glb`: Rammer, booster, Scrapper,
   claw, pillar, wall, gate, floor; pixel textures on Resurrect 64; placeholders replaced.
2. The full Rammer presentation: stalk, near and far windup with the lane states, charge, skid with
   steam, rebound, stripped limp and shove, crackle when damaged, wreck.
3. Salvage: the tear burst, the towed booster on its cable (in the mirror), pickups, the 0.7 s bolt
   with ratchet clicks and the claw animation, the booster on your back in the mirror, knock-loose
   and shatter.
4. The Burn: hold to rev with the view locked to the lane, the teal lane, the FOV push, release to
   pierce, the wall stun.
5. The speed readability stack (THREEJS-NOTES rule 8) and the HUD-hidden switch.
6. Waves, gate warnings as floor decals and positional sound, the banner, results with best clear,
   title with "3D" and "first person", pause, settings (volumes, music, shake, hints, mouse
   sensitivity, invert, speed gauge, palette filter), the hints placed in the world.
7. The dev tuning panel with live editing, flat mode, START WITH THE BOOSTER and Copy.
8. The shots sweep over every state, the overlap audit on the HUD, smoke, perf, coverage, the sim
   tests.

## Milestone 2 — Playtest fixes (the critic's pass done and published; the owner's notes became #27 and M3)

Each of the owner's playtest notes becomes one change commit ending "DECISIONS #N". Rule changes
the 3D game seems to need go to `DECISIONS.md` as **proposals**, since the sim is the 2D game's.

### Playtest questions (for the owner)

From the 2D game's M1 list, in first person:

1. Did you ever want to stop moving? When, and why?
2. Could you tell how fast you were going without looking at the gauge?
3. Did a good pass feel *decisive*: a clear before, hit, after?
4. Was getting clear after a pass natural, or did you end up stuck next to enemies?
5. Did the Rammer's telegraph give you enough time? Too much? Did you ever get hit from behind
   without a cue you could have read (the mirror, the edge marker, the sound)?
6. After bolting on the Booster, did you take different lines or attack differently? Did you like
   it, or prefer the base body? (The tuning panel's START WITH THE BOOSTER gives a whole run with it.)
7. Movement: too floaty, too twitchy, or right? Mouse steering vs A/D vs a gamepad?
8. **Flat mode:** play the three waves once with flat mode on. Was it noticeably less fun?
9. If you imagine this with ten parts and a run of arenas: is the loop strong enough?

The new one (PLAN.md): **10. Play once with the HUD hidden (H). Could you tell your speed with the
HUD hidden?**

## Milestone 3 — The run in first person (published as 0.2.0; the owner's playtest next)

The 2D game's M3 (its PLAN.md section 8) re-vendored and presented from the seat. Rules: none of
ours (DECISIONS #28).

1. **Re-vendor** the 2D rules (2D `297e40c`), with its M3 and run tests and the exit sign's layout.
2. **The yards:** obstacles by footprint as Blender models (post, tower, barrier below the eye, scrap
   block); a new arena per yard; exits that open with gold lamps and chevrons; exit signs pinned over
   the gates and edge arrows when out of view; the wipe; entering through the opposite gate; run
   results and bests; the attract mode tours the yards.
3. **The enemies:** the Snapper and Jaw Snapper (hunt, circle, snap windup with its short lane, the
   snap, the broadside power-slide, stunned, stripped limp) and the Plow Rammer, as instanced
   batches so The Heap's six fit the draw-call budget.
4. **Your mounts:** the Grip Treads' power-slide as a tap of S (a first-person U-turn), view models
   for the treads, plow and jaws, the Jaws' whip camera, three HUD slots, the M3 hints placed in the
   world, the pause card's part lines.
5. **Checks:** typecheck; `npm test` (102); `npm run e2e`; `npm run shots` (58 scenes, 0 overlaps);
   `npm run perf` (The Heap's last wave within budget); `npm run coverage` (16 models, no
   placeholders); `node e2e/run.mjs 5 8` (whole runs end to end); then the `indie-critic` and
   `qa-screens` agents and their fixes.
6. **The review** (DECISIONS #35): salvage stays gold, flashes go white, every part shows its tear
   window, the pack you can't see is heard and pipped, the treads' slide is aimed, the Jaws' camera
   eases, the claw ducks for a close threat, smaller view models, exit signs below the banner and a
   U-turn arrow, a full build within the draw-call budget. Checks after it: 105 tests, 61 scenes.

### Playtest questions for M3 (for the owner)

1. Could you read a Snapper pack from the seat: where they were, which one was about to snap?
2. The Grip Treads: did a tap of S to slide round feel like the hairpin (strike, slide, strike
   again)? Did you aim the slide's exit with the mouse?
3. The Plow and the Jaws from the seat: did ramming and the bite-and-sling feel decisive, or
   disorienting?
4. Did you find the exits and understand the signs? Did you choose a yard for its part?
5. Did the zoomed-out view help? Is the claw (and a front part) in the way?
6. Which yard was the most fun, which the least, and why?

## Milestone 4 — not planned yet

To plan from the owner's notes on M3. The obvious candidate: **re-vendor the 2D expansion** (its
M6-M9: the Hopper and the Jump Jets, the Bouncer and the Springs, the Spring Rammer, terrain (boost
strips, oil, jump ramps, crusher plates), The Compactor, a six-yard run, the Skiff and the Hauler
chassis, the Garage, unlocks, run modifiers, the Log, a daily run), once the 2D game has finished
building it (DECISIONS #36): new models, enemies that leap and roll seen from the seat, terrain on
the floor, a boss, a garage screen. Also: whatever the playtest finds; the rule proposals (#24: a longer skid in 3D, a low-speed
brake; #37: a longer Snapper slide, a slide that keeps more speed), which go to the 2D game first; a
pass on the models.

---

## Hard rules (the `qa-screens` checklist)

1. 640x360 and whole-number scaling only; every texture nearest-filtered, no mipmaps; every frame
   on the palette.
2. Three.js lives only in `src/render3d/` (and the 2D layer's projections); `src/sim` and
   `src/data` are vendored and never edited here (the drift test).
3. `src/sim` never touches the DOM, audio or `Math.random`.
4. Danger colors only for danger, speed colors only for speed, gold only for salvage.
5. No text overlaps (the overlap audit must report zero).
6. Every cue a 2D player could read has a first-person equivalent (DECISIONS #15).
7. Within budget: ≤ 60 draw calls, ≤ 20k triangles, ≥ 15 fps in SwiftShader.
