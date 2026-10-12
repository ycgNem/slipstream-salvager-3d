# Start here — Slipstream Salvager 3D

A separate game in a separate folder and repo. **The 2D project at
`C:\Users\jacks\Documents\slipstream-salvager` is read from and never written to.** If a
prompt below would ever change a file there, that is a bug in the prompt; stop it.

## By hand (5 minutes)

1. This folder is `C:\Users\jacks\Documents\slipstream-salvager-3d`. `git init` here.
2. Finish the 2D playtest first if you can; the 3D version vendors the 2D sim, so tuning
   decided in 2D (DECISIONS #47–#53 and whatever M2 changes) should land there first and be
   re-vendored here. If you'd rather not wait, the vendored copy is a snapshot and the two
   games can diverge; `DECISIONS.md` here records every divergence.
3. The GitHub repo name must be `slipstream-salvager-3d` so the Pages URL differs from the 2D
   game's. Create it when Milestone 0 is done, not before.

## Prompt 0 — Milestone 0: vendor, scaffold, prove the 3D pipeline

```
Read PLAN.md and THREEJS-NOTES.md in this folder first. This is Slipstream Salvager 3D, a
separate first-person Three.js game that shares its rules with the 2D Slipstream Salvager at
C:\Users\jacks\Documents\slipstream-salvager. You may READ that project freely. You must NEVER
write, move, delete, git-commit, or run npm in that folder; everything you make goes in this
folder. Verify at the end with `git -C C:\Users\jacks\Documents\slipstream-salvager status`
showing a clean tree.

1. Copy from the 2D project into this repo: src/sim and src/data verbatim (these are the rules;
   do not edit them, and add a test that fails if they differ from the 2D project's copies so
   drift is deliberate), tests/ and scripts/bots.ts, src/engine (loop, rng, input incl.
   gamepad, audio engine, sfxr, music player and the "Scrap Ring" song), the e2e harness
   (serve.mjs, smoke.mjs, screens.mjs with the overlap audit, coverage.mjs), the Electron
   wrapper, the Pages workflow, the service worker and manifest, the .bat files, vite/vitest/
   tsconfig and package.json. Then rename every identity string per PLAN.md "Identity": package
   name slipstream-salvager-3d, productName "Slipstream Salvager 3D", appId
   com.jacksonwalley.slipstreamsalvager3d, the localStorage prefix ss3d:, titles, README,
   manifest, icons text. Grep for "slipstream-salvager" and "Slipstream Salvager" afterwards
   and show me every remaining hit; only the README's link to the 2D game should remain.
   Do NOT copy src/render, src/ui/hud, src/app, src/render/art or the 2D renderer's code.
   Copy ROADMAP.md, STYLE.md, DECISIONS.md, PROGRESS.md and HANDOFF.md from the 2D project
   as templates and rewrite them for this game: ROADMAP's milestones become M0 (this), M1 (first-
   person parity with the 2D slice), M2 (playtest fixes); STYLE keeps the palette and tier
   colors and replaces the sprite rules with the model and texture rules from THREEJS-NOTES.md;
   DECISIONS starts at #1 here, with #1 being "vendored sim and data from 2D at commit <hash>".

2. Install three (pin the current release; record it in DECISIONS). Build src/render3d/: the
   640x360 render target with whole-number upscale, the pixel pass, the chassis-bolted camera
   with speed-driven FOV, one directional + one hemisphere light, the Ring from src/data/arena
   (floor, walls 1.2 m, four pillars 2 m, gates) as pixel-textured low-poly geometry built in
   code for now, the claw model in the lower middle of the view with its emissive tier glow.

3. Build src/input3d/ per THREEJS-NOTES.md rule 11 (pointer lock, steer demand, W/S thrust,
   A/D, Rip on click/Space, Bolt on E, look-back on Q, gamepad) and wire it to the sim's input
   frame. Run the sim at 60 Hz through the existing loop; render with alpha interpolation.

4. Put one Rammer in the scene driven by the sim (a placeholder box body with a distinct
   booster box on its back and two emissive eyes), its telegraph lane as a floor decal with the
   dashed / solid / flashing states, and the hit-stop and shake from the sim's events. Wire the
   existing SFX bank through a PositionalAudio on the Rammer and the engine hum non-positional.

5. The rear strip (THREEJS-NOTES rule 6) and the screen-edge markers for Rammers out of view.

6. e2e/launch.mjs with the SwiftShader flags that work on this Chromium; e2e/shots.mjs that
   replays a seeded input log to five fixed ticks (at rest facing the Rammer; Slipstream mid-
   pass; being charged from behind, showing the rear strip and an edge marker; a wall clank;
   the results screen) and screenshots each; e2e/perf.mjs with fps, draw calls and triangles.
   Run npm test (the vendored 53 tests must pass unchanged), the smoke test and the shots. Look
   at every screenshot yourself before showing me and say what is wrong with them.

7. Deploy to GitHub Pages only after I've created the slipstream-salvager-3d repo; until then
   leave the workflow inert as the 2D project did.

Finish with PROGRESS.md and HANDOFF.md in the 2D project's format, DECISIONS numbered from #1,
and one commit. Then stop. Do not start Milestone 1.
```

## Prompt 1 — Milestone 1: first-person parity with the 2D slice

```
Read HANDOFF.md, PLAN.md, THREEJS-NOTES.md, ROADMAP.md, STYLE.md, DECISIONS.md and
PROGRESS.md. Build Milestone 1: everything the 2D slice has, in first person, with the sim
untouched. Same read-only rule for the 2D project as in Milestone 0.

In order, each step with its own commit and screenshots: (1) models by script through the
Blender MCP into art/<family>/build_*.py and .glb: Rammer (body, booster, eyes as rigid parts),
loose booster, Scrapper body for the rear strip, claw, pillar, wall, gate, floor; pixel textures
on the Resurrect 64 palette; replace the placeholder boxes. (2) The full Rammer presentation:
stalk, near and far windup with the lane states, charge, skid with steam, rebound, stripped
limp and shove, crackle when damaged, wreck. (3) Salvage: the tear burst, the towed booster on
its cable (visible in the rear strip and swinging into the lower frame on turns), pickups, the
0.7 s bolt with ratchet clicks and the claw-arm animation, the booster on your back in the
rear strip, shatter on a hit. (4) The Burn: hold to rev with the view locked to the lane, your
teal lane on the floor, FOV push, release to pierce, the wall stun. (5) The speed readability
stack from THREEJS-NOTES rule 8, including the HUD-hidden switch; afterimages become edge blur
and speed lines. (6) Waves, gate warnings as floor decals and positional sound, the banner,
results with best clear, title with "3D" and "first person", pause, settings (volumes, music,
shake, hints, mouse sensitivity, invert), the three one-time hints placed in the world where
the 2D ones were. (7) The dev tuning panel with live editing, flat mode, START WITH THE
BOOSTER and Copy, as in 2D. (8) Extend the shots sweep to every state above and the overlap
audit to the HUD; run the smoke test, perf, and the sim tests.

Rules: no sim edits (the drift test must stay green); any first-person rule you believe the
sim needs (for example a different coast time because the view hides deceleration) goes to
DECISIONS.md as a proposal for me, not into code. If a cue a 2D player could read has no
first-person equivalent, that is a bug: add one and record it.

Send me screenshots at: the first teal claw, the first rear tear seen from behind, the booster
in the rear strip, a Burn lane from inside the rev, a windup behind you caught via the strip
and the edge marker. Finish with PROGRESS.md and HANDOFF.md updated and the playtest questions
from the 2D ROADMAP plus the one new one from PLAN.md ("Could you tell your speed with the HUD
hidden?"). Then stop for my playtest. Do not start Milestone 2.
```

## After Milestone 1

Play it with the HUD hidden first. The 2D removal test still applies; the new question is
whether first person carries speed on its own. Then the 2D playtest questions, then flat mode.
