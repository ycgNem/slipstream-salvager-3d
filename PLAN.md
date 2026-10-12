# Slipstream Salvager 3D — Plan

Written 2026-10-12. **This is the first-person Three.js version of Slipstream Salvager.** It is
a separate, separately published game, not a mode of the 2D one.

## Identity (so both can ship)

| | 2D (exists) | 3D (this) |
|---|---|---|
| Product name | Slipstream Salvager | **Slipstream Salvager 3D** |
| Folder / repo | `slipstream-salvager` | `slipstream-salvager-3d` |
| package.json name | `slipstream-salvager` | `slipstream-salvager-3d` |
| Electron appId | `com.jacksonwalley.slipstreamsalvager` | `com.jacksonwalley.slipstreamsalvager3d` |
| Pages URL | `ycgnem.github.io/slipstream-salvager/` | `ycgnem.github.io/slipstream-salvager-3d/` |
| itch slug (later) | `slipstream-salvager` | `slipstream-salvager-3d` |
| Title screen | "Slipstream Salvager" | "Slipstream Salvager **3D**" with "first person" under it |
| localStorage key prefix | `ss:` | `ss3d:` (so settings and bests never collide if both run on one origin) |

Every string the player or a store sees carries "3D". The two READMEs link to each other.

## What is the same (and is copied, not rewritten)

The 2D game's `PLAN.md` sections 1–4 are this game's design, verbatim: the pitch, the removal
test, the pillars, the Ring, the Scrapper, the speed tiers, the Rip, the Rammer, the Booster, the
Burn, the three waves, hull pips, parts as armor, the wave 1 safety net, flat mode, the bots.
**None of it changes.** The simulation is planar (heading, speed, x/y on a 640×360 field) and
already pure and deterministic, so **`src/sim/` and `src/data/` are vendored from the 2D
project as they stand**, with their 53 tests and the strategy bots. The removal-test guards
(turret deals zero, hit-and-run beats brawler and matador, the route flip with the Booster) pass
on day one because they are the same code.

The 3D game is a **new presentation and a new input adapter on the same rules**:
`src/render3d/` (Three.js), `src/input3d/` (mouse/keys/pad → the sim's stick vector),
`src/ui3d/` (HUD and hints in the 3D view), `src/app/` (title → play → results).

Divergences from the 2D sim are allowed only when first person demands them, and each one is a
`DECISIONS.md` entry that names the 2D rule it changes. Expected ones: none in Milestone 1.

## What first person changes (the design work of this project)

**The pitch gets stronger.** "Speed is the weapon" is felt from inside the robot: field of view
widens as you accelerate, the arena blurs at the edges at Slipstream, the claw in front of you
glows grey / amber / teal, and the pass-through goes right through the Rammer's body. The one
thing the 2D version shows you, this one makes you feel.

**Readability gets harder, and pillar 4 ("readable at a glance") is the whole risk.** In 2D the
whole Ring is on screen. In first person you see ~90° of it. Threats come from behind. The
answers, all in Milestone 1 and all testable:

1. **The rear strip.** A second camera renders the view behind you into a narrow pixel strip
   across the top of the screen, like a racing game's mirror. It also shows the towed part
   swinging on its cable, which is the fiction's reason for it to exist.
2. **Telegraph lanes are painted on the floor** exactly as in 2D (the Rammer's lane, your Burn
   lane), as pixel-textured floor decals. A lane can be seen from anywhere it crosses your view,
   and its lock flash is bright enough to read in the rear strip.
3. **Sound is positional.** Every Rammer windup, charge and skid is a Web Audio PannerNode in the
   arena; a windup behind you is heard behind you. The 2D engine's SFX bank is reused through
   panners.
4. **Edge markers.** A Rammer winding up outside your view gets a small arrow on the screen edge
   nearest to it, grey while tracking, flashing on lock. No minimap.
5. **At most two windups at once** (already in the sim) keeps the count readable.

**Steering is the second risk.** The sim turns at a limited rate (14 rad/s at rest → 4 at top
speed, plus turn scrub). A mouse cannot be allowed to turn the camera faster than the body
turns, or the body and the view disagree. So: **the camera is bolted to the chassis**; the mouse
sets a *steer demand* (where you want the nose), shown as a small reticle that drifts from the
nose tick when you ask for more turn than the body can give, and the sim turns the body at its
own rate. That gap is the turn scrub made visible: ask too hard and you watch yourself bleed
speed. Keys: W thrust, S brake, A/D steer at full demand, mouse adds steer; Rip on left click or
Space; Bolt on E; a look-back key (Q) that swings the camera 180° for as long as it's held
without turning the body. Gamepad: left stick X = steer demand, left stick Y / RT = thrust, A =
Rip, Y = Bolt, LB = look back. Pointer lock on click; Esc releases it and pauses.

**Scale.** 1 sim px = 0.05 m. The Ring is 30.4 × 16.4 m, pillars 1.6 m square and 2 m tall,
walls 0.8 m thick and 1.2 m tall (you can see over them to the gates). The Scrapper's eye is
0.55 m up. Top speed 240 px/s = 12 m/s, which reads as fast at that eye height; the Burn's 330
px/s = 16.5 m/s. All of this is the renderer's business; the sim never sees meters.

**Look.** Low-poly, pixel-textured, rendered at **640×360 internal resolution** through a
pixelation pass and upscaled by whole numbers, so it is recognizably the same game as the 2D
one. Same Resurrect 64 palette, same tier colors (grey / amber / teal), same claw. Pixel art is
never rotated in 2D; in 3D models rotate freely, and the rule becomes: textures are pixel art
at 64 or 128 px, nearest-filtered, no mipmaps, and the pixel pass is what keeps the edges
honest. 8-direction sprites are gone; the Rammer is one model with a booster on its back you
can see from any angle, which actually makes the rear-tear rule easier to read than in 2D.

## Pillars (unchanged, with the first-person reading)

1. **Speed is the weapon** — and you feel it: FOV, blur, hum, claw glow.
2. **Commit, pass, escape** — the lunge takes the camera through the enemy.
3. **You become what you rip** — the booster bolts onto your back, visible in the rear strip,
   and the Burn locks your view to a lane.
4. **Readable at a glance** — rear strip, floor lanes, positional sound, edge markers. If a
   playtester gets hit from behind without a cue they could have read, that is a bug.
5. **Small and proven before big** — Milestone 1 is parity with the 2D slice and nothing more.

## The removal test, in 3D

Identical, plus one first-person question in the playtest: *Could you tell your speed with the
HUD hidden?* The renderer has a switch that hides the gauge; the FOV, blur, hum and claw must
carry it alone.

## Not in Milestone 1

Anything not in the 2D slice. Also: motion blur beyond the edge blur, head bob, a free-look
camera, any VR, shadows beyond a blob, any model with a skeleton. The Scrapper's claw and the
Rammer's parts animate by moving rigid pieces.

## Tech

TypeScript strict + Vite + **Three.js** (pinned at setup, in DECISIONS), the S&S / 2D engine
layer (loop, RNG, input, audio engine, sfxr, music), the 2D project's `src/sim` and `src/data`
vendored, Vitest, Playwright + headless Chromium with SwiftShader, GitHub Pages, Electron. Models
built by script in Blender through the Blender MCP and exported as `.glb`; textures from the
pixel pipeline. Details and rules in `THREEJS-NOTES.md`.
