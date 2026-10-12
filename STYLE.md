# Slipstream Salvager 3D — Style bible

The 2D game's palette and color language, kept exactly, with the sprite rules replaced by model and
texture rules (THREEJS-NOTES.md). Change this file on purpose, never by drift, and log the change in
`DECISIONS.md`.

## The look in one paragraph

A scrappy little robot tearing around a scrapyard ring at dusk, seen from its own eye height
(0.55 m). Warm, rusty, hand-patched metal on your claw and your robot; heavier, colder, bolted-plate
enemies; a dim, low-contrast floor so everything that moves pops. Color does the talking: **speed is
teal**, **danger is red**, **salvage is gold**. Low-poly, pixel-textured, rendered at **640x360** and
snapped to the palette with an ordered dither, so it is recognizably the same game as the 2D one.
Kinetic and playful, never grim.

## Palette

**Resurrect 64** by Kerrie Lake (`src/data/palette.ts`, vendored). Every texel of every texture is
one of the 64 colors, and **every frame is snapped to them** in the composite pass (a 32³ lookup
table, 4x4 Bayer dither, `src/render3d/view.ts`), so lighting can't invent colors. The snap can be
switched off in Settings for comparison.

```
 0-4  #2e222f #3e3546 #625565 #966c6c #ab947a   warm neutrals (plum-black .. taupe)
 5-9  #694f62 #7f708a #9babb2 #c7dcd0 #ffffff   cool neutrals
10-15 #6e2727 #b33831 #ea4f36 #f57d4a #ae2334 #e83b3b   reds
16-18 #fb6b1d #f79617 #f9c22b                   orange .. gold
19-23 #7a3045 #9e4539 #cd683d #e6904e #fbb954   rust .. amber
24-28 #4c3e24 #676633 #a2a947 #d5e04b #fbff86   olive .. pale yellow
29-33 #165a4c #239063 #1ebc73 #91db69 #cddf6c   greens
34-38 #313638 #374e4a #547e64 #92a984 #b2ba90   sage
39-43 #0b5e65 #0b8a8f #0eaf9b #30e1b9 #8ff8e2   teals
44-48 #323353 #484a77 #4d65b4 #4d9be6 #8fd3ff   blues
49-53 #45293f #6b3e75 #905ea9 #a884f3 #eaaded   purples
54-57 #753c54 #a24b6f #cf657f #ed8099           roses
58-63 #831c5d #c32454 #f04f78 #f68181 #fca790 #fdcbb0   magenta .. peach
```

## Color language (hard rules, unchanged from 2D)

| Meaning | Colors (indices) | Used for | Never used for |
|---|---|---|---|
| **Speed** | teals 40–43, blue 48 | the claw glow and ring at Slipstream, speed lines, the grit that rushes past, the Burn lane, the tier-up edge flash | enemies, danger |
| Cruise | lime 32–33 | the claw glow and gauge band at Cruise | |
| Crawl | cool neutrals 6–7 | the claw glow and gauge at Crawl | |
| **Danger** | reds 11, 12, 15 and magenta 59–60 | enemy lanes, eyes and the Rammer's hazard stripes, edge markers, hurt flashes, gate lamps and warnings | anything friendly or decorative |
| **Salvage** | gold 18, amber 23, pale yellow 28 | every part (booster, Grip Treads, Plow, Jaws: on an enemy, loose, towed, bolted on, as view models), the cable, the tear burst, the HUD part slots, an open exit (its lamps, floor chevrons, sign and arrows: it's where the next part is) | enemy bodies |
| Player | rust and orange 19–22, 16, cream 63, plum outline 0 | the claw, the Scrapper | |
| Rammer | blues and slate 44–46, purple 50, sage 35 | the Rammer, so it reads as "not you" | |
| Snapper | lavender and purple 50–52, blue steel 44–46, ink 49 | the Snapper (the 2D sheet's colours): small, low, lilac; its treads are the gold part | |
| Arena | warm neutrals 1–5, olive 24–25 | floor, walls, pillars, gates; low contrast | |

Sparks are white, frost and orange, never gold. Shadows are dithered plum blobs, never blurred.

## Models (THREEJS-NOTES rule 9)

- **Built by script** in Blender: `art/<family>/build_<asset>.py` → `public/models/<asset>.glb`
  (`npm run models`, headless; DECISIONS #5). Nothing hand-edited. `art/README.md` has the details.
- **Units are metres, models face +X** (Blender +X; the renderer turns them with `rotation.y =
  -heading`), origin at the footprint centre on the floor. 1 sim px = 0.05 m.
- **Node names are an API** (`art/README.md`): `rammer` {body, eyes, mount_rear}, `booster` {shell,
  nozzle_glow; origin at the mounting flange}, `scrapper` {body, tread_l, tread_r, mount_rear,
  claw_root}, `claw` {arm, jaw_l, jaw_r, glow}, `pillar`, `wall`, `gate` {frame, door_l, door_r,
  lamp}, `floor`; M3: `snapper` {body, eyes, mount_front}, `treads`, `plow` {blade}, `jaws` {jaw_l,
  jaw_r}, `post`, `tower`, `block`, `barrier`. Rigid parts only: no skeletons (PLAN.md "Not in
  Milestone 1").
- **Triangle budgets:** Rammer ≤ 600 with its booster (body + eyes ≤ 450), any part ≤ 300, booster
  ≤ 200, Scrapper ≤ 350, claw ≤ 300, pillar ≤ 150, wall segment ≤ 60, gate ≤ 250, floor 2; M3:
  Snapper ≤ 350, treads ≤ 200, plow ≤ 120, jaws ≤ 160, post ≤ 120, tower ≤ 200, block ≤ 300,
  barrier ≤ 60. `npm run coverage` checks them. ≤ 20k on screen, ≤ 60 draw calls a frame (`npm run
  perf`): enemies and loose parts are instanced batches, one draw call per model piece for every
  body that wears it (DECISIONS #29), so a new enemy kind costs a call or two, not one per enemy.
- **Obstacles by footprint** (DECISIONS #30): the pillar's strapped bales at every size (a post, the
  tower, Jaw Yard's blocks); Long Lanes' walls are a low barrier, below the eye.
- **Flat-shaded, low-poly.** The Rammer's armored front (the sloped ram plate with red hazard
  stripes) must read from far away and differ obviously from its flat back with the booster socket.

## Textures

- **64x64 per family atlas** (rammer, booster, scrapper, claw, arena, snapper, parts; the floor has its own
  tiling 64x64), painted texel by texel in the build scripts, Resurrect 64 only, a 3-shade ramp
  per material lit from the upper left, 1-texel plum seams and outlines.
- In the renderer every texture is `NearestFilter`, no mipmaps, sRGB; every material is
  `MeshLambertMaterial` (flat shaded); emissive parts (eyes, glows, lamps) keep their color as
  emissive and the renderer drives their intensity.
- Code-made textures (`src/render3d/textures.ts`): the blob shadow, the sky bands. Lanes are a
  shader on the sim's own pixel grid (1 texel = 1 sim px = 5 cm).

## Frame and motion rules

- **640x360, whole-number scaling only**, letterboxed; the window's DPR never changes the grid.
- The 2D layer (HUD, text, menus, markers) uses the 2D game's pixel font and UI kit, in whole
  pixels; dimming behind menus is the ink checker, not alpha.
- The camera is bolted to the chassis. Shake: at most 1.5° of roll and 3 cm of offset, never pitch,
  and it can be turned off. No head bob, no motion blur beyond the Slipstream edge smear.
- Every input answers within one tick visibly (the claw, the FOV, sound).
- Speed must read **without the HUD** (H hides it): FOV, the claw glow, the hum, the edge smear,
  speed lines, grit rushing past. The gauge is last.
- Telegraphs are floor decals **under** bodies: two edge lines and dither between, dashed while
  aiming, solid with flashing chevrons once locked; enemy lanes red, your Burn lane teal.
- Flashes are palette colors over the frame edge (hurt red, tier-up teal, tear and bolt gold), and
  a white flash on a Rammer body when it's hit.
