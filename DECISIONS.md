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
  two more enemy models); the 2D tests' 61 cases here are the M2 ones. **Accepted again** at 2D
  `45dc78f` the same night: the 2D project finished its M4 (art) and an M3 review pass (Rammers no
  longer stall at corners, charges run 120 px past you, and more; 2D DECISIONS #78-#79) while this
  game's M2 pass was built. Same call; a re-vendor now would bring all of it.
- #22: **The camera swings through a heading that jumps** (a head-on clank reflects you, a charge
  throws you, a crawl Rip bounces you off): when the interpolated heading moves more than 0.4 rad in a
  frame, the view lags behind it and catches up with a 0.07 s time constant, instead of teleporting
  up to 180°. Presentation only; the sim's heading is untouched and normal steering never triggers it.
  Why: an instant 180° view snap in first person reads as a glitch, and you lose where the wall was.

## Milestone 2, first pass: the critic's and the visual QA's review (2026-10-12)

Two read-only review agents went over the M1 build before the owner's playtest: `indie-critic`
(played ~90 s with real keys, watched three bots, checked the turning against the real adapter and
sim) and `qa-screens` (33 scenes, perf, coverage, a bot watch). Everything below is presentation or
input; the sim is untouched (the drift test holds).

- #23: **The review fixes.**
  - **A crash at the moment of impact (critic #3).** The speed-line count went negative when the
    tier still read Slipstream in the tick a hit cut the speed, which threw in `Overlay.update` and
    dropped the frame through the hit-stop. Clamped to 0..26.
  - **Steering (critic #1, #2, #8), `src/input3d/steer.ts`:**
    - S only brakes while it can't become the 2D pivot (above pivotSpeed + 20). Below that, S is
      just "no thrust" and A/D and the mouse still turn you (it used to send nothing: S + D at rest
      turned 0°, then the view snapped 83° when S was released). The sim's brake can't shed the last
      80 px/s without pivoting, so that last bit is a coast (a **Proposal** below).
    - The whole mouse turn is kept (up to 175°) and worked off by the body at its own rate; the sim
      only ever sees 75° of it at a time, so it never brakes. The same flick now turns the same amount
      at rest and at top speed (it was 175° at rest and 87° with the Booster, the rest thrown away).
    - A/D (and the stick) turn gently (4.2 rad/s, which never scrubs) for 0.25 s, then ramp up to
      6.5 rad/s or the body's own rate if lower, which scrubs at Slipstream like a hard mouse turn
      (the 2D rule: tight turns cost speed). Keyboard players used to never meet turn scrub, and a
      key U-turn took 0.75 s, so the tear opening behind you was gone by the time you faced it.
    - Turn scrub is shown and heard: the reticle blinks white, the robot leaves skid marks, and a
      squeal plays once per hard turn. A demand past the edge of the view pins the reticle to the
      edge with a chevron. The reticle is measured against the sim's heading, so it no longer
      flickers on key turns.
  - **Threats beside and behind you (critic #5, QA #7, #8):** the edge markers are long filled
    arrows (the old one read as ▼ whichever way it pointed), compass-style (ahead = up). A threat
    ahead of you but out of view gets one on the frame's side edge; one behind you that the mirror
    doesn't show gets one beside the mirror, and that side of the mirror's frame lights up. Nothing
    is drawn on the claw any more. Aiming is frost, not mist. A warned gate gets a marker too, and an
    arrow dropping onto it when it's in view (at 20 m the gate is a few pixels); its chevrons flash
    between two reds instead of blinking off, and its lane is 5 m, not 3. Sounds from behind you are
    low-passed (down to 1.4 kHz dead behind), since HRTF alone is weakest at front vs back.
  - **The tear behind you (critic #8):** the mirror's frame flashes gold when a Rammer that charged
    past you goes into its skid out of view: its back is open.
  - **Speed with the HUD hidden (critic #6):** the floor's plate seams and rivets glow one palette
    step above the darkened floor (an emissive map in plum and slate, no extra draw call), so ground
    rush survives the palette snap below Slipstream. Amends #19: the floor is still the darkest
    thing, but no longer a flat two-color field.
  - **Onboarding (critic #9):** the first time a Rammer winds up out of view, a hint under the mirror
    says the mirror shows it and Q looks back. The tear hint says the back will be behind you ("LET IT
    CHARGE PAST, SWING ROUND, HIT ITS GOLD BACK AT TEAL"). The slot doesn't repeat "E: BOLT ON" while
    the bolt hint says it. The pause screen has a five-line card: W/S (S never reverses or flips you),
    the body turns at its own rate, what the reticle is, the keys, the mirror is behind you.
  - **The Burn lane (critic #4, QA #3)** starts a metre ahead of the eye: a quad corner at the eye
    projects to w = 0 and drew the lane as one teal slash.
  - **Colors stay on meaning (critic #7, QA #1, #2, #5, #14, #15):** the edge flashes (gold tear and
    bolt, teal tier-up, red hurt) are the exact palette color dithered in by an ordered threshold,
    and the snap leaves those pixels alone (they were blended, then snapped to olive and grey-green); Rammer eyes and the claw glow are set to exact
    palette colors (they over-drove to salmon 61); speed lines use speedSky 48, not frost; the shadow
    line under the mirror no longer runs across the whole frame.
  - **Smaller QA fixes:** shattered or knocked-loose parts break behind you, not at eye height (#4);
    hints sit above the claw's jaw tips (#6); the lane fill's dither is in screen pixels, since on the
    5 cm grid it moiréd past 4 m and hid the chevrons (#9); the towed part is drawn twice as far back
    as the sim's 14 px cable, with a two-strand cable, so towing and bolted look different in the
    mirror (#10, presentation only); a stripped Rammer's back plate is a step lighter with a light
    blue rim round the socket (#11, `art/rammer/build_rammer.py`); the mirror pitches down 0.12, not
    0.24, so the Ring behind fills more of it (#12); the claw's hemisphere light is neutral, so its
    steel reads as the player's greys, not the Rammer's sage (#13); the HUD hides while paused (#16);
    the sky texture is 1024x256, so its texels are frame pixels (#17); the tuning panel starts under
    the mirror (#18); the sky's cap is gone (the background is the same ink), one draw call a pass
    (#19).
- #24: **Proposals for the owner from the review (not in the code; the sim is the 2D game's):**
  - **Rammer `skidTime` +0.3 s in the 3D game** (a logged divergence): in first person the tear
    opening is behind you, and turning round takes most of the skid. Try the hard key turn and the
    gold mirror flash first.
  - **A low-speed brake:** the sim can't brake below pivotSpeed + 15 without pivoting, so S coasts
    the last 80 px/s (about 1.2 s). A 3D-only rule "a brake input below pivotSpeed just decelerates"
    would need a sim change.
- #25: **The critic's re-check of #23** (same agent, same checks re-run): fixed S + turn, the crash,
  the Burn lane, the markers, the flash colors; the floor mostly (2 → 5 colors in Crawl, a small
  step: judge it in motion); the mouse partly; the tear behind you not at speed (the body's own turn
  rate, 4-5 rad/s near top speed, is the limit, not the key rate: that's the skidTime **Proposal** in
  #24, which the tuning panel can try live). What it found new, and what changed:
  - **The scrub cue fired when turning cost nothing** (at top speed a 4 rad/s turn is just over
    scrubLat, and thrust wins it straight back): it would have taught "never turn". Scrub is now
    shown and heard only on a net loss: the scrub minus what thrust gives back along the nose
    (`steer.ts`, more than 30 px/s²).
  - **A mouse turn stayed committed after the hand stopped** (up to 1.1 s with the Booster), which
    reads as mouse smoothing. The kept turn is capped at 0.45 s of the body's own turning (never
    under 75°): 175° at rest, about 155° at Slipstream, about 103° at top speed.
  - **Hints covered the reward text** (the Burn hint over BOLTED ON!, the mirror hint over TORN
    OFF!). A hint now steps aside for a frame where a floating text is drawn in its place; the overlap
    audit couldn't see this, since it only happens in play.
  - **The mirror hint fired when only the arrow showed the Rammer**, and pushed the tear hint aside
    for 4 s. It now fires only when the windup is in the mirror, and ranks below the tear and bolt hints.
  - **A reflex E right after TORN OFF! was lost** (the sim reads the bolt on its press edge and
    refuses it during the lunge, so the press was used up). A press is now retried, every other tick,
    for 0.4 s while you're towing and not bolting. Input buffering only, like the sim's own Rip buffer.
  - Smaller: the gold mirror flash skips the Rammer that just hit you (red and gold at once said
    nothing); the reticle past 0.5 rad is frost, not lime (a speed color).
  - Left as they are: S with a turn creeps at 14 px/s (the sim's minimum stick); a flick made during
    the 0.18 s brake from top speed mostly fades (the body can't turn while braking); 3 draw calls of
    headroom.

## Publishing (2026-10-12)

- #26: **Published at the owner's word ("commit and push live").** Created the repo
  `ycgNem/slipstream-salvager-3d` with `gh`, public like the 2D game's (GitHub Pages on this account
  needs a public repo), named as PLAN.md "Identity" and START-HERE step 3 say. Pages builds from
  GitHub Actions (`deploy.yml`: `npm ci`, `npm test`, `npm run build`, deploy `dist/`) on every push
  to `main`: https://ycgnem.github.io/slipstream-salvager-3d/. `works` stays the working branch; `main` is fast-forwarded to it to publish. CI
  runs the vendored suite and the steer tests; the drift test's second check only runs where the 2D
  project is on disk, so it never fails in CI. The build uses relative paths (`base: './'`), so it
  works under the Pages subpath. The Windows installer is not published anywhere (it's built
  locally into `release/`, which git ignores).

## The owner's note on the published build (2026-10-12)

- #27: **The view is zoomed out** (the owner: "looks good, see if you can zoom the perspective out a
  little more"). The field of view is 82° at rest to 102° at Slipstream (was 70° to 92°; the cap with
  a Burn and overspeed is 112°), so the 22° → 20° widening that tells you your speed is kept. The eye
  is 0.68 m up (was 0.55) and 0.22 m behind the body's centre, inside its 0.4 m radius so the view
  never pokes through a wall the body touches; looking back, it sits that far ahead instead. You see
  more floor, so lanes, skid marks and the floor's rush read sooner, and the claw takes less of the
  frame. Presentation only.

## Milestone 3: the run in first person (2026-10-12)

The owner, on the published M2 build: "looks good ... otherwise get started on your next milestones".
The natural next milestone was already named (#21, HANDOFF "Open points"): re-vendor the 2D game's
M3 rules and present the run in first person. Nothing in the sim is ours: every change below is
presentation or input, and the proposals in #24 still stand.

- #28: **Re-vendored the 2D rules at 2D `297e40c`** (its M3, the M3 review fixes, and M4's few sim
  changes): the run (five yards, six layouts, exits, the yard patch-up), the Snapper and the Jaw
  Snapper, the Plow Rammer, three mounts with the Grip Treads, the Plow and the Jaws, hit zones that
  tear by mount, armor by hit side. The vendored list grew by `src/ui/signs.ts` (the exit sign's
  content, which the 2D run test checks) and the 2D `m3` and `run` tests; `vendor.json`'s
  divergences were emptied, since nothing is kept against #21 any more. 102 tests (86 vendored, 2
  drift, 14 steer, 3 of them new). *Why:* the owner asked for the next milestone, and every rule
  change the 2D game made since `e0504af` was a fix or the run itself.
- #29: **Enemies and loose parts are instanced batches** (`src/render3d/enemies3d.ts`, THREEJS-NOTES
  rule 13). As separate meshes a Rammer cost five draw calls a pass, and The Heap's last wave is six
  enemies: one InstancedMesh per model piece instead (Rammer body, Snapper body, booster shell, treads,
  plow, jaw, shadow), filled from the sim each frame. Per-instance color does what per-material
  color did: the hit flash (x3), the gold glint of an open back, a cracked part's grey. Every glow (both
  enemies' eyes, every nozzle) is one batch of unlit unit boxes sized from the models' glow meshes, in
  exact palette colors. The right jaw is the left one mirrored (DoubleSide; flat shading lights a
  mirrored face correctly). Also: the eight gate doors are one mesh, the floodlights are drawn by the
  main camera only (layer 2), your own chassis is merged into one mesh for the mirror. The Heap's
  last wave: max 59 draw calls (budget 60), ~17k triangles, ~61 fps in SwiftShader.
- #30: **The yards in 3D** (`src/render3d/arena3d.ts`): obstacles by footprint, each kind one
  instanced Blender model: 32 px a pillar, 16 px a post (two bales, 1.36 m), 48 px the Plow Pit's
  tower (four layers, 2.7 m), a 16 px run Long Lanes' barrier, anything else Jaw Yard's scrap block
  (5.6 x 3.2 m, up to 2 m). **The barrier is 0.5 m, below the 0.68 m eye**, so from one lane you see
  the next lane and the Rammers in it over the wall (the 2D game shows all three lanes at once);
  Jaw Yard's blocks are tall, so its corners hide what's in them. **The exits:** once a yard is
  cleared its exit gates' doors open and stay open, their lamps blink gold, and gold chevrons on the
  floor point out through them. **The exit signs** (`src/ui3d/signs3d.ts`): the 2D sign's content
  (the vendored `signLayout`: the yard's name, its parts' icons and names, its last wave's size) as a
  panel pinned over each exit gate on the 2D layer, crisp at 1:1, with a gold arrow down onto the
  gate; an exit out of view gets a gold arrow on the frame's edge, compass-style, with the yard's
  name. *Why:* text painted on the floor 20 m away is a smear from the seat. Driving out wipes to the
  next yard (ink bars, its name), and you come in through the opposite gate at 150 px/s, as in 2D.
  The title's attract mode plays a different yard each time round.
- #31: **The parts in first person.**
  - **Grip Treads: a tap of S at speed is the power-slide, a U-turn** (`src/input3d/steer.ts`). The
    2D slide swings you toward the stick while it lasts; from the seat "the stick" is the steer
    demand, which turns with you, so the adapter holds a fixed target 173° round (the side you're
    steering with A/D, the stick or the mouse, else to the right) until the sim's slide ends, then
    steering finishes the turn. One slide per press; S held after it just coasts (there's no brake
    with the treads, as in 2D). Tested: round in ~0.3 s, still at Slipstream, on the side you chose.
    *Why:* the treads' line is the hairpin (strike, slide round, strike again), and in first person
    turning round was the hardest thing to do (#24, #25): the treads make it one key.
  - **View models** (`src/render3d/actors.ts`): your Plow is a gold blade across the bottom of the
    view (tipped toward you, so you see its lip, not its braced back), your Jaws flank the claw (they
    gape with it and clamp shut while you swing), your Treads' gold guards sit in the bottom corners.
    The mirror sees the booster and the treads on your body; not the front parts (the mirror camera
    sits in front of you, looking back over you).
  - **The Jaws' whip:** the sim spins your heading a full turn round the bitten enemy in 0.2 s and then
    flings you out facing back the way you came: 540° of turning from the seat. The view instead starts
    on the enemy you bit and turns one way through half a turn while the world wheels past, ending on
    the line you're flung out along, continuous at both ends (`Stage.latchYaw`).
- #32: **HUD, hints and texts.** Three part slots bottom right (rear, sides, front, as in 2D) with the
  2D game's four part icons, cropped from its pixel-art-studio sheet into `public/ui/part-icons.png`
  (same palette, same names; the 2D folder was only read). YARD n/5 WAVE n/3 by the hull. The 2D M3
  hints, placed in the world: the enemy hints over the nearest enemy they're about, the part and exit
  hints above the claw; "TAP S AT SPEED TO POWER-SLIDE ROUND" says the first-person key. A knock names
  the part ("JAWS KNOCKED LOOSE"); CLANG! JOUST IT, BLOCKED!, SLUNG! as in 2D. The pause card adds a
  line for each bolted part's verb. The wave banner is drawn last and its subtitle sits clear of the
  title. Run results as in 2D (yards cleared, parts torn off, wrecks, jousts, the build's icons) and
  run bests on the title.
- #33: **Version 0.2.0** (on the title, like the 2D game), and the service worker's cache is
  `salvager3d-v2`: models and icons aren't hashed, so a new cache name is what makes a returning
  player fetch new ones (bump it with every release that changes a model).
- #34: **A whole-run check in the real app** (`e2e/run.mjs`): the drafter bot plays a run fast-
  forwarded through the real presentation (a real frame drawn between chunks of ticks), and the run
  must go Ring → three different middle yards → Heap → results with no console errors. A wave the bot
  hasn't finished in 90 s of sim is cleared for it and counted: the rule bots are weak against
  Snapper packs (2D #74), and this checks the presentation, not difficulty.
- Smaller: the claw sits 3 cm lower (the zoomed-out view showed more of its arm, and a close Snapper
  hid behind it); the drift-check warning in HANDOFF no longer applies until the 2D game changes its
  rules again.

## Milestone 3: the critic's and the visual QA's review (2026-10-12)

Both agents played and shot M3 (`indie-critic`, `qa-screens`); every fix below is presentation or
input. Their two rule ideas are proposals for the owner (#37).

- #35: **The M3 review fixes.**
  - **Salvage stays gold** (`src/render3d/shading.ts`). The palette snap turned a gold part's shaded
    faces olive (a Plow Rammer's plow from the side was 92% olive) and its lit faces lime. Every
    part's material (the enemy batches, your own robot in the mirror, the view models) now lights
    40% of its own texture and caps a lit face at 1.15x its texture; the self-light follows the
    tint, so a glint still flashes.
  - **A flash goes white:** the hit flash blends the lit color toward white (per instance on the
    batches) instead of multiplying it by 3, which saturated gold into lime and the Snapper's plum
    into pink. **A cracked part flickers white** (the 2D game's white crack) instead of greying,
    which on gold was olive again.
  - **Every part shows its tear window** (the 2D game's `tearable()`, 2D #60): a Snapper's treads
    blink gold while it slides or reels, a Plow while it charges, Jaws while they wind up. Before,
    only the Rammer's booster did, and nothing said "now" to a Snapper's slide.
  - **The pack you can't see:** a hunting Snapper's treads rumble where it is (`tread`, positional,
    muffled behind you); a close enemy beside you that neither the view nor the mirror shows gets a
    pip on that edge, dim while it circles, blinking gold while a part of its is open; a Snapper that
    starts sliding in the mirror lights the mirror's frame gold, as a Rammer's open back does. The
    Snapper hint names the window: "HIT ITS SIDE AT TEAL AS IT SLIDES".
  - **The Grip Treads' slide is aimed** (`src/input3d/steer.ts`): while it swings, the mouse and the
    keys move its exit up to 60° either side of the reversal (it can't be pushed so far past the body
    that the sim would swing back). With no side asked for it goes round the side with room (you
    can't see a wall beside you from the seat), else toward the nearest enemy behind you. S held on
    after a slide no longer cuts your thrust (with the treads S isn't a brake). Tested.
  - **The Jaws' whip camera** holds still during the bite's hit-stop (it ran ahead and snapped back,
    a 26° sawtooth) and eases out, so the line you're flung along arrives slowly enough to read
    (it used to arrive at the fastest spin, ~1600°/s).
  - **The claw ducks** while an enemy within 4 m and 20° of straight ahead winds up or strikes: a close
    Snapper hid behind it, and the Jaw Snapper's gaping jaws (its warning) were behind the claw tips.
  - **Smaller view models:** the treads' guards are now just their gold tips beside the claw (they
    covered a fifth of the lower view, and side lanes under it); the Plow's blade is about the claw's
    width.
  - **Exit signs:** below the YARD CLEARED banner while it's up (it hid the sign the moment the exits
    opened); the arrow's tail clear of the panel; an exit out of view shows its parts' icons beside
    its name, and once it's behind you its arrow is a U-turn, not the down arrow that points onto a
    gate in view. Two new scenes: `exits-banner`, `exits-behind`.
  - **Draw calls with a full build** were 65 (over the 60 budget): every lane of a kind is now one
    instanced mesh (the four gate warnings were four meshes a pass, each windup its own), your shadow
    joins the shadow batch, and your chassis really merges (materials cloned per mesh never matched;
    they're grouped by how they look). `npm run perf` now plays with Booster, Grip Treads and Jaws
    bolted on: max 57.
  - **HUD:** the three slots are 16 px with ink gaps, an empty socket is slate (it was the slot's own
    plum, invisible), the "goes here" line sits under the icon. The banner's box is on whole pixels
    (an odd title width put its edges on half pixels, off the palette). The floodlights' lamps are
    frost, not pale gold: gold means salvage and exits.
  - Kept: the zoomed-out view (#27). The critic measured it as a modest win (blind spots 6% smaller,
    enemies 20% smaller) that reads the floor lanes better; it won't fix the pack, the pips and the
    rumble do.
  - Not done: the overlap audit still doesn't see arrows and icons (drawn straight to the canvas).
- #36: **The 3D game stays on the 2D rules at `297e40c` while the 2D expansion is being built.** The 2D
  project is in the middle of its M6-M9 (the Hopper, the Bouncer, the Spring Rammer, terrain, The
  Compactor, a six-yard run, committing as this was written). Re-vendoring that is a milestone of
  new models and presentation, not a fix, and chasing it mid-build would mean re-vendoring again
  tomorrow. Kept our copy with `node scripts/vendor.mjs --accept '#36'` (as #21 did); the drift test
  fails again when the 2D project next changes a vendored file. **For the owner:** re-vendoring the
  expansion once it settles is the natural Milestone 4. **Accepted again** at 2D `c8a56e1` when M3 was
  published (#38): by then the 2D game had built its M6-M9 (the Hopper and the Jump Jets, the Bouncer
  and the Springs, the Spring Rammer, terrain: boost strips, oil, jump ramps, crusher plates; The
  Compactor, a boss you take apart; a six-yard run; two new chassis, the Skiff and the Hauler; the
  Garage, unlocks, run modifiers, the Log and a daily run) and drafted its 0.3.0 notes.
- #37: **Rule proposals from the critic (for the owner; they belong in the 2D game first):** the
  Snapper's slide 0.6 s → 0.8 s (most of its slides start out of the view from the seat, so its open
  side is gone before you can turn to it); the Grip Treads' slideKeep 0.88 → 0.92 (only a hairpin
  from above ~212 px/s still exits at Slipstream, so the next rip after a slide from Cruise speed is
  a shove).

## Publishing M3 (2026-10-12)

- #38: **M3 published at the owner's word ("commit this project and push live").** `works` pushed and
  `main` fast-forwarded to it; the Pages workflow tests, builds and deploys
  https://ycgnem.github.io/slipstream-salvager-3d/. The live build is 0.2.0 (the title says so): the
  run of five yards, the Snapper, the Plow and the Jaws in first person, with the review fixes (#35).
  The service worker's cache is `salvager3d-v2` (#33), so a returning player fetches the new models.
