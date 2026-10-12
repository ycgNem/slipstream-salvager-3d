# Decisions — Slipstream Salvager 3D

Every call and why. Numbered from #1 here; the 2D project has its own numbering ("2D #N" below
means the 2D game's DECISIONS.md). Proposals for the owner are marked **Proposal** and are not in
the code.

## Planning (2026-10-12)

- #0a: Separate product, folder, repo, appId, Pages URL and storage prefix from the 2D game
  (PLAN.md "Identity"). Why: both ship.
- #0b: `src/sim` and `src/data` are vendored verbatim from the 2D project with a drift test. Why:
  same rules, planar sim, the tests and bots come free; divergences must be deliberate and logged here.
- #0c: Camera bolted to the chassis; the mouse is a steer demand, never a free look. Why: the sim's
  turn rate and scrub must stay the truth.

## Milestone 0 (2026-10-12, built overnight by Claude; the owner asked for M0 and M1 in one go)

- #1: **Vendored the rules from 2D commit `e0504af`** (2D M2 plus its M3 mount/name prep; the sim
  itself is the M2 sim). Copied with `git archive` and `git show` only, so the 2D project's
  uncommitted work (an art overhaul in progress) never came across and nothing in that folder was
  written. Vendored: `src/sim/`, `src/data/`, `src/render/names.ts` (the 2D sprite-name list: its data
  test reads it, so the tests can run unchanged; nothing in the 3D game uses it), the six 2D test
  files and `scripts/bots.ts`. `vendor.json` holds the commit and a hash of every file;
  `tests/vendor.test.ts` fails if a vendored file is edited here, or if the 2D project's committed
  copy moves on without either a re-vendor (`npm run vendor`) or an entry in `vendor.json`
  "divergences" naming a decision. The 2D suite is 61 tests now (the plan said 53; 2D M2 added 8);
  all pass unchanged. Why: PLAN.md "What is the same".
- #2: **three.js pinned at 0.186.1** (the latest release on 2026-10-12), `@types/three` 0.186.0.
  `src/render3d/` is the only folder that imports `three` (THREEJS-NOTES rule 1), plus the e2e
  scripts and `src/ui3d/overlay.ts`/`hints.ts`, which project world points for the 2D layer.
- #3: **The engine layer is copied, not vendored**, and adapted: `input.ts` gained pointer-lock
  mouse deltas, the look-back (Q / LB) and hide-HUD (H / Back) actions, and W/S are labelled
  Thrust/Brake; `gamepad.ts` reads RT/LT as analog; `audio.ts` gained positional sound (#13). RT is
  thrust in first person, so Rip on the pad is A or RB (2D had A or RT).
- #4: **Identity:** package `slipstream-salvager-3d`, productName "Slipstream Salvager 3D", appId
  `com.jacksonwalley.slipstreamsalvager3d`, localStorage prefix `ss3d:`, service-worker cache
  `salvager3d-v1`, title "Slipstream Salvager 3D / first person". Dev server port 5183 (`Play.bat`),
  `.claude/launch.json` uses 5191/4191, so both games can run side by side.
- #5: **Models are built by script in headless Blender** (`blender --background --factory-startup
  --python art/<family>/build_*.py`, `npm run models`), not through the Blender MCP as
  THREEJS-NOTES rule 9 says. Why: the Blender the owner left open holds unsaved work from another
  project, and building in it would have meant clearing that scene. The scripts are the same either
  way; headless is also reproducible. Blender 5.2.2.
- #6: **The rear strip is a 400x90 mirror at the top centre, not 640x72** (THREEJS-NOTES rule 6).
  Why: a 9:1 strip is about 22° tall at any useful width, so it shows either your own back or the
  Ring behind you, never both; 400x90 at a 110° field shows both. The rear camera sits up to a metre
  ahead of the robot (less when a wall is close), 0.95 m up, tilted down 14°, so your robot's back,
  the booster on it, the cable and the towed part sit at the bottom of the mirror like a racing
  game's rear deck. The image is mirrored left-right, like a real mirror. It costs one extra render
  of the scene per frame.
- #7: **The pixel pass is a hand-written composite, not `RenderPixelatedPass`.** The world renders
  at 640x360 into a nearest-filtered target; one composite pass at 640x360 does the Slipstream edge
  smear, the rear strip, the flashes, then **snaps every pixel to Resurrect 64** through a 32³
  lookup table with a 4x4 ordered dither, then lays the 2D UI layer on top; a blit draws it at the
  largest whole-number scale, letterboxed, in device pixels (`setPixelRatio(1)`, the canvas sized
  by hand). Why: the palette snap is what makes it recognizably the 2D game; lit 3D otherwise
  invents colors. The snap can be turned off in Settings ("PIXEL PALETTE FILTER").
- #8: **Headless WebGL:** Chrome with `--use-angle=swiftshader --enable-unsafe-swiftshader
  --ignore-gpu-blocklist` (in `e2e/launch.mjs`) gives WebGL2 on this machine; it runs the sim in
  real time.
- #9: **Placeholders:** if a `.glb` is missing, `src/render3d/models.ts` builds a blocky stand-in
  with the same node names, so the game always runs; `npm run coverage` fails while any model is a
  placeholder. A dev server answers a missing file with index.html, so the loader checks the glTF
  magic bytes, not the status.
- #10: **The 2D UI kit, font and overlap audit are reused** for the 2D layer (HUD, menus, hints,
  floating text, markers) on a 640x360 canvas that the composite puts over the frame. Why: same
  pixel font, same buttons and keyboard/pad navigation, and the overlap audit works unchanged.

## Milestone 1 (2026-10-12)

- #11: **FOV is horizontal**: 70° at rest to 92° at Slipstream (smoothstep on speed / slipAt),
  +up to 5° of overspeed above top speed, +4° while revving a Burn, +3° during the Burn, eased with a
  0.14 s time constant; converted to three's vertical FOV for 16:9. Why: "you see ~90° of it"
  (PLAN.md) only works as a horizontal figure; 92° vertical would be 120° across.
- #12: **The input adapter** (`src/input3d/steer.ts`): the mouse moves an absolute demanded heading
  (clamped to 75° ahead of the body, short of the sim's 150° brake-and-pivot); A/D and the stick ask
  for a turn at min(the body's own turn rate, 4.2 rad/s) every tick, which carries the demand with
  it; any heading change the controls didn't ask for (a wall slide, a throw, aim assist) also
  carries it, so the body never steers back into a wall it glanced off. While a lunge, a rev, a
  throw or a stun has the body, the demand fades (0.1 s) instead of snapping the view afterwards.
  W thrusts (the stick's up or RT is analog thrust), **S brakes to a stop without the 2D pivot**
  (it stops asking 20 px/s above the pivot speed): in first person the pivot is an instant 180°
  camera flip. Turning with no thrust sends a tiny stick magnitude (0.06) so the body can turn
  while it coasts; at rest that creeps forward at up to 14 px/s. Tests in `tests/steer.test.ts`.
- #13: **Positional sound with raw Web Audio panners** (HRTF, linear distance model, silent at the
  37 m arena diagonal), one per Rammer and gate, following it every frame, the listener on the
  camera; not three's `PositionalAudio`, which would need its own AudioContext and a second copy of
  the SFX bank. The engine hum stays non-positional (THREEJS-NOTES rule 10).
- #14: **The claw is a view model** drawn after a depth clear, so it never pokes through a wall you
  are pressed against. It thrusts on a Rip, locks out on a Burn, coils and trembles while revving,
  dips to the bottom edge and twists like a ratchet wrench through a bolt (one click per third, so
  the view stays clear while you drive away), sways against turns, shudders above 55% speed, and
  its glow and the ring of pixels round its jaws are grey / lime / teal by tier (lime at Cruise,
  2D #45).
- #15: **First-person equivalents of every 2D cue** (PLAN.md: a 2D cue without one is a bug):
  - speed tier: the FOV, the claw glow and ring, the hum, the edge smear and speed lines at
    Slipstream, grit in the air ahead (motes at Cruise, teal specks at Slipstream) that rushes past,
    dust behind you in the mirror; the gauge last, and hideable (H, or SPEED GAUGE in Settings).
  - the heading tick: the steer reticle (the nose tick at the centre, the demand reticle drifting
    off it when you ask for more turn than the body can give).
  - afterimages: the edge smear (THREEJS-NOTES rule 8).
  - the Rammer's lane: a floor decal on the sim's pixel grid, dashed while aiming, solid with
    flashing chevrons once locked; behind you it shows in the mirror; outside both views an edge
    marker (grey aiming, flashing red locked, red charging) points at it, behind = bottom edge.
  - its windup: crouch, coil, jitter, brighter eyes, the nozzle glowing; positional windup sound.
  - the open back: the booster glints gold while locked, charging or skidding (2D #60).
  - skid and stun: steam, skid marks, wobble, flickering eyes; damaged: crackling sparks; stripped:
    smoke from the socket and a limp.
  - the tow: the booster swinging on a gold cable behind you, in the mirror; TOWING in the HUD.
  - the bolt: ratchet clicks, sparks at your back (mirror), the claw's wrench twist, BOLTED ON!
  - the Burn: your teal lane, FOV push, the claw coiling, the whine, the plume in the mirror.
  - hits on you: a danger-red edge flash, shake, and the part or hull pip lost.
  - the gate warning: blinking red chevrons on the floor inside the gate, the lamp blinking, the
    doors sliding open, the gate sound from the gate.
- #16: **The title is an attract mode**: the hit-and-run bot plays the real sim under a slow orbit
  camera behind the title. Why: it shows the game in 3D before you play, at no content cost.
- #17: **Shake** maps the 2D game's 1–3 px shakes to trauma (0.22 per px), drawn as up to 1.5° of
  roll and 3 cm of offset, never pitch (THREEJS-NOTES rule 2).
- #18: **The tuning panel's COPY output is a proposal for both games**: the numbers live in the
  vendored `src/data/tuning.ts`, which this project can't edit (#1).
- #19: **The floor is darkened in the renderer** (its texture multiplied by about 0.35) and the
  sky is flat bands with a two-row checker: in first person the floor fills half the frame, and at
  full brightness its plate pattern competed with the lanes (STYLE: the floor is the calmest thing).
- #20: **A frozen screenshot scene ages its effects tick by tick**, like play, so a flash that
  ended before the freeze isn't frozen on screen.
- #21: **The 3D game stays on the 2D M2 rules (the `e0504af` snapshot) for now.** While M1 was being
  built, the 2D project committed its M3 (`c2506b1`: a five-yard run, the Snapper, the Plow and the
  Jaws, enemies as data with `w.enemies` replacing `w.rammers`, three mounts, a 0.2.0 version); 21
  vendored files changed and the drift test caught it, as designed. M1 here is parity with the 2D
  *slice*, and the renderer is built on the M2 sim, so re-vendoring now would be a new milestone, not
  a fix. Kept our copy with `node scripts/vendor.mjs --accept '#21'`, which records the 2D version of
  each file it accepted in `vendor.json`: if the 2D project changes any of them again, the test fails
  again. **For the owner:** re-vendoring M3 is the natural start of a 3D M3 (the run, the yards and
  two more enemy models); the 2D tests' 61 cases here are the M2 ones.
- #22: **The camera swings through a heading that jumps** (a head-on clank reflects you, a charge
  throws you, a crawl Rip bounces you off): when the interpolated heading moves more than 0.4 rad in a
  frame, the view lags behind it and catches up with a 0.07 s time constant, instead of teleporting
  up to 180°. Presentation only; the sim's heading is untouched and normal steering never triggers it.
  Why: an instant 180° view snap in first person reads as a glitch, and you lose where the wall was.
