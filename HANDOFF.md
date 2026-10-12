# Handoff — Slipstream Salvager 3D

Read this first, every session.

## Where things stand (2026-10-12)

- **Milestone 0 and Milestone 1 are built, plus a first M2 pass of fixes from an internal critic
  and visual QA review. Stopped for the owner's playtest.** Built overnight in one autonomous
  session at the owner's request ("complete a lot of milestones and come back with a playable
  version").
- This is a SEPARATE game from the 2D Slipstream Salvager at `C:\Users\jacks\Documents\slipstream-salvager`.
  That folder is read-only for this project: never write, commit or run npm there.
- **The rules are the 2D game's M2 slice** (vendored from 2D `e0504af`). The 2D project moved on to
  its M3 (a run, more enemies) and M4 (art, 0.2.0) during the night; this game deliberately stays on
  the slice until the owner decides (DECISIONS #21, accepted again at 2D `45dc78f`). Re-vendoring is
  the natural start of a 3D M3.
- No GitHub repo yet; the Pages workflow is inert. Branch `works`. Nothing pushed.

## How to playtest (for the owner)

1. Double-click **`Play.bat`** and open **http://localhost:5183** (keep the black window open).
   Or `npm run dev`. The tuning panel is always on in the dev server: press **`** (backtick) or F1.
2. **Click the game view** once a run starts: that lets the mouse steer (Esc gives the mouse back
   and pauses).

   | | Keyboard + mouse | Gamepad |
   |---|---|---|
   | Steer | mouse (sets where you want the nose; the body turns at its own rate), or A/D (tap = gentle, hold = hard turn that costs speed) | left stick |
   | Thrust / brake | W / S (S never reverses or flips you; below a crawl it just lets you coast and turn) | RT (or stick up) / LT |
   | Rip (hold with the Booster to rev a Burn) | left click or Space | A or RB |
   | Bolt on (tap while towing) | E or right click | Y or X |
   | Look back (hold) | Q | LB |
   | Hide the HUD | H | Back |
   | Pause | Esc or P | Start |
   | Music on/off | N | |

3. What's there: the 2D slice in first person. Three waves in the Ring (1, 2, 3 Rammers). Build
   speed until the claw in front of you glows teal, hit a Rammer's back to tear its booster off; it
   swings behind you on a cable (watch the **mirror** at the top); tap E to bolt it on; now holding
   Rip revs a Burn down your own teal lane. Your bolted part is your armor.
4. **Reading threats in first person:** the mirror at the top shows what's behind you (and your own
   back, with the booster on it); a Rammer winding up where neither the view nor the mirror shows it
   gets an **arrow** (light grey aiming, flashing red locked, red charging): on the screen's side edge
   if it's ahead of you, beside the mirror (and that side of the mirror's frame lights up) if it's
   behind. Its lane is painted on the floor; its windup is heard from where it is, muffled when it's
   behind you (headphones help). When a Rammer that charged past you goes into its skid, the
   mirror's frame flashes **gold**: its back is open, swing round. The pause screen has a short
   controls card.
5. **The playtest questions** are in ROADMAP.md (Milestone 2). The new first-person one: play once
   with the **HUD hidden (H)** — could you tell your speed?
6. **Flat mode** (the removal test) and **START WITH THE BOOSTER** are in the tuning panel, as in 2D.
7. Settings has mouse sensitivity, invert, the speed gauge, and the **pixel palette filter** (on by
   default; off shows the raw 3D render).

## Open points (for the owner)

- **The review's rule proposals** (DECISIONS #24): a longer Rammer skid in 3D (the tear opening is
  behind you in first person), and a low-speed brake (S coasts the last 80 px/s, because the sim's
  brake pivots below that). Neither is in; both need a sim change, which is the 2D game's.
- **Re-vendoring the 2D M3 rules** (DECISIONS #21) is the natural start of a 3D M3.
- **Not verified by a human yet:** how the mouse feels (sensitivity default, the 175° kept turn), and
  whether the muffled-from-behind sound helps. These are the playtest's job.

## How to run everything (for sessions)

Put the portable Node first in every shell:
`export PATH="/c/Users/jacks/tools/node-v22.20.0-win-x64:$PATH"` (bash) or
`$env:PATH = "C:\Users\jacks\tools\node-v22.20.0-win-x64;$env:PATH"` (PowerShell).

| What | Command | Notes |
|---|---|---|
| Play (dev) | `npm run dev` | port 5183; `.claude/launch.json` has `game3d` on 5191 |
| Typecheck | `npm run typecheck` | |
| Unit tests | `npm test` | 71: the vendored 2D suite (61, unchanged), the drift test (2), the steer-adapter tests (8) |
| Drift check | `npm run vendor -- --check` | what the 2D project changed since the snapshot; `--accept '#N'` keeps ours against a decision |
| Strategy bots | `npx vite-node scripts/bots.ts` | the 2D bots on the vendored sim |
| Smoke test | `npm run e2e` | real key presses, pointer lock asked, pause, zero console errors |
| Screenshot sweep | `npm run shots` (or `-- slip burn`) | every scene in `src/app/debug.ts`, PNGs + overlap audit in `e2e/out/shots/` |
| Watch a bot | `node e2e/watch.mjs 40 7 hitAndRunBot [--booster]` | first-person screenshots of every key moment in `e2e/out/watch/` |
| Perf | `npm run perf` | fps, draw calls, triangles in SwiftShader, wave 3 |
| Model coverage | `npm run coverage` | every model from its .glb, node names, budgets, pixel filtering |
| Rebuild models | `npm run models` | headless Blender, every `art/*/build_*.py`, then the verifier |
| Web build | `npm run build` / `Package for web.bat` | `dist/`, about 215 KB gzipped + 100 KB of models |
| Windows app | `npm run dist:win` / `Build desktop app.bat` | `release/` |
| App icons | `npm run icons` | |

All e2e scripts start their own Vite server and headless Chrome with WebGL on SwiftShader
(`e2e/launch.mjs`). The built-in browser pane throttles when hidden; use the e2e scripts for timing.

Agents in `.claude/agents/`: `indie-critic` (design critique, read-only) and `qa-screens` (visual
QA, read-only), both rewritten for first person.

## Code map

- `src/sim/`, `src/data/`: **vendored** from the 2D game; never edit here (`vendor.json`,
  `tests/vendor.test.ts`). `src/render/names.ts` is vendored too (the 2D data test reads it).
- `src/input3d/steer.ts`: the first-person input adapter (mouse demand, keys, stick → the sim's
  stick vector). Pure; `tests/steer.test.ts`.
- `src/render3d/`: everything three.js. `view.ts` (640x360 targets, composite with the palette
  snap and edge smear, the mirror, the blit), `camera.ts` (FOV, shake, look-back, mirror camera),
  `stage.ts` (poses the world from the sim each frame with interpolation; sim events → particles),
  `actors.ts` (Rammer, parts, your robot, cable, debris, the claw), `arena3d.ts` (the Ring, gates,
  skyline, lights), `decals.ts` (lanes, shadows, skid marks), `particles.ts`, `models.ts` (GLB
  loading, placeholders), `textures.ts`, `units.ts` (1 sim px = 0.05 m).
- `src/ui3d/`: the 2D layer: `hud.ts`, `hints.ts`, `overlay.ts` (floating text, banner, speed
  lines, reticle, edge markers).
- `src/ui/`: the 2D game's UI kit, font and overlap audit (copied).
- `src/app/`: `app.ts` (screens, title attract mode, pointer lock), `play.ts` (one encounter:
  input → sim → events → sound and effects), `settings.ts`, `tuning.ts`, `debug.ts` (scenes).
- `src/engine/`: loop, rng, input (+ pointer lock, look, hud), gamepad (+ triggers), audio
  (+ positional panners), music.
- `art/`: Blender build scripts and their textures; `public/models/`: the built .glb files.

## Environment

- Windows 11, no admin rights. Blender 5.2.2 at the Steam path (headless; DECISIONS #5).
- Playwright uses the installed Chrome (`PW_CHANNEL=chrome` by default).
