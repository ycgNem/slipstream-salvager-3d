# Handoff — Slipstream Salvager 3D

Read this first, every session.

## Where things stand (2026-10-12)

- **M0-M2 are published. M3, the run in first person, is built and reviewed, not published.** The
  owner played the published M2 build ("looks good"), asked for the view zoomed out (done, DECISIONS
  #27) and for the next milestones: M3 is the 2D game's run re-vendored and presented from the seat
  (DECISIONS #28-#34), then reviewed by the `indie-critic` and `qa-screens` agents and fixed (#35).
- This is a SEPARATE game from the 2D Slipstream Salvager at `C:\Users\jacks\Documents\slipstream-salvager`.
  That folder is read-only for this project: never write, commit or run npm there (git commands
  there use `--no-optional-locks`).
- **The rules are the 2D game's at 2D `297e40c`** (its M3, its M3 review fixes, its M4): vendored,
  never edited here. The 2D game has since started its expansion (M6-M9: the Hopper, the Bouncer,
  terrain, The Compactor, a six-yard run) and was still committing it this session; that drift is
  accepted against DECISIONS #36 (`vendor.json` `divergences`), and re-vendoring it is the natural M4.
- **Published** (DECISIONS #26): the repo is https://github.com/ycgNem/slipstream-salvager-3d, live at
  **https://ycgnem.github.io/slipstream-salvager-3d/** (still the M2 build until the owner says to
  publish M3). Every push to `main` runs the tests, builds and deploys (`.github/workflows/deploy.yml`).
  Day-to-day work is committed on `works`; publishing is pushing `works` and `works:main`.

## Next session: start here

1. Read this file, then `ROADMAP.md` (Milestone 3 has the playtest questions; Milestone 4 isn't
   planned yet, its obvious candidate is re-vendoring the 2D expansion, DECISIONS #36).
2. If the owner has playtest notes on M3, each note becomes one change on `works` ending "DECISIONS
   #N" (the next number is in `DECISIONS.md`). Run the checks (below), commit, and publish only when
   the owner says so.
3. Open calls only the owner can make are under "Open points" below.
4. **`npm test` will likely fail on the drift check at the start of the next session:** the 2D
   project was mid-expansion when #36 accepted its HEAD, and any later 2D commit to a vendored file
   fails it again. That is the design: either re-vendor (`npm run vendor`, a milestone's work now) or
   keep ours with `node scripts/vendor.mjs --accept '#N'` and log it in DECISIONS (CI doesn't run that
   check; it needs the 2D folder on disk).

## How to playtest (for the owner)

1. Double-click **`Play.bat`** and open **http://localhost:5183** (keep the black window open).
   Or `npm run dev`. The tuning panel is always on in the dev server: press **`** (backtick) or F1.
   `http://localhost:5183/?yard=kennel` starts a run in that yard (`ring`, `kennel`, `lanes`, `pit`,
   `jaws`, `heap`).
2. **Click the game view** once a run starts: that lets the mouse steer (Esc gives the mouse back
   and pauses).

   | | Keyboard + mouse | Gamepad |
   |---|---|---|
   | Steer | mouse (sets where you want the nose; the body turns at its own rate), or A/D (tap = gentle, hold = hard turn that costs speed) | left stick |
   | Thrust / brake | W / S (S never reverses or flips you; **with the Grip Treads, a tap of S at speed power-slides you round**) | RT (or stick up) / LT |
   | Rip (hold with the Booster to rev a Burn) | left click or Space | A or RB |
   | Bolt on (tap while towing) | E or right click | Y or X |
   | Look back (hold) | Q | LB |
   | Hide the HUD | H | Back |
   | Pause | Esc or P | Start |
   | Music on/off | N | |

3. **The run:** five yards. The Ring first (three Rammer waves: tear off a Booster, bolt it on). Clear
   a yard and two exit gates open (gold lamps, gold chevrons on the floor, a sign over each: the next
   yard's name, the parts its enemies carry, its last wave's size; a gold arrow at the edge of the
   view when the exit is out of sight). Drive out through the one you want. The Kennel (Snapper packs,
   Grip Treads), Long Lanes (Rammers down three lanes, walls low enough to see over), the Plow Pit
   (Plow Rammers: their front takes nothing, joust their charge), Jaw Yard (Jaw Snappers). The Heap is
   always last. Your hull gets +1 between yards; your parts come with you.
4. **Your parts:** Booster on your back (hold Rip: the Burn), Grip Treads on your sides (tap S at speed:
   a power-slide U-turn; move the mouse while it swings to aim where it comes out), Plow or Jaws on your front (the Plow: drive into them at teal, it blocks
   charges; the Jaws: a teal hit bites on and slings you back out). A hit knocks off the part on the
   side it came from. The bottom right shows your three slots. Pause shows what each part does.
5. **Reading threats in first person** (as in M2): the mirror at the top shows what's behind you;
   an enemy winding up where neither the view nor the mirror shows it gets an arrow (grey aiming,
   flashing red locked, red attacking); lanes are painted on the floor; sounds come from where they
   are, muffled from behind; the mirror's frame flashes gold when a Rammer that charged past opens its
   back, or a Snapper in it starts sliding. Hunting Snappers rumble where they are; a close one in a
   blind spot beside you is a small pip on that edge (gold while its part is open to a tear). A part
   open to a tear blinks gold.
6. **The playtest questions** are in ROADMAP.md (Milestone 3).
7. **Flat mode** and **START WITH** (any part, for the whole run) are in the tuning panel, as in 2D.
8. Settings has mouse sensitivity, invert, the speed gauge, and the pixel palette filter.

## Open points (for the owner)

- **Publish M3?** It's committed on `works` only. "Push live" = push `works` and `works:main`.
- **Rule proposals** (rule changes, so they belong in the 2D game first): the M2 ones (DECISIONS #24:
  a longer Rammer skid in 3D, a low-speed brake) and the critic's M3 ones (#37: the Snapper's slide
  0.6 → 0.8 s, the treads' slideKeep 0.88 → 0.92). The Grip Treads' slide gives first person a
  U-turn; whether that's enough is a playtest question.
- **Not verified by a human yet:** the Snapper packs from the seat (the rumble, the pips), the S-tap
  slide and aiming it, the Jaws' whip camera, the exit signs, and the zoomed-out view.
- **Milestone 4** isn't planned: re-vendoring the 2D expansion once it settles (#36) is the obvious
  start; plan it with the owner's notes.

## How to run everything (for sessions)

Put the portable Node first in every shell:
`export PATH="/c/Users/jacks/tools/node-v22.20.0-win-x64:$PATH"` (bash) or
`$env:PATH = "C:\Users\jacks\tools\node-v22.20.0-win-x64;$env:PATH"` (PowerShell).

| What | Command | Notes |
|---|---|---|
| Play (dev) | `npm run dev` | port 5183; `.claude/launch.json` has `game3d` on 5191 |
| Typecheck | `npm run typecheck` | |
| Unit tests | `npm test` | 105: the vendored 2D suite (86, unchanged), the drift test (2), the steer-adapter tests (17) |
| Drift check | `npm run vendor -- --check` | what the 2D project changed since the snapshot; `--accept '#N'` keeps ours against a decision |
| Strategy bots | `npx vite-node scripts/bots.ts` | the 2D bots on the vendored sim |
| Smoke test | `npm run e2e` | real key presses, pointer lock asked, pause, zero console errors |
| Screenshot sweep | `npm run shots` (or `-- slip burn`) | all 61 scenes in `src/app/debug.ts` (every yard, the enemies and parts, the blind-spot pips, exits, the wipe), PNGs + overlap audit in `e2e/out/shots/` |
| Watch a bot | `node e2e/watch.mjs 40 7 drafterBot [--booster\|--treads\|--plow\|--jaws] [--yard=kennel]` | first-person screenshots of every key moment in `e2e/out/watch/` |
| A whole run | `node e2e/run.mjs 5 8` | a bot plays a run fast-forwarded through the real app; screenshots per yard in `e2e/out/run/` |
| Perf | `npm run perf` | fps, draw calls, triangles in SwiftShader, The Heap's last wave (six enemies) with Booster, Grip Treads and Jaws bolted on (max 57 calls) |
| Model coverage | `npm run coverage` | every model from its .glb, node names, budgets, pixel filtering |
| Rebuild models | `npm run models` | headless Blender, every `art/*/build_*.py`, then the verifier |
| Web build | `npm run build` / `Package for web.bat` | `dist/`, about 230 KB gzipped + 184 KB of models |
| Windows app | `npm run dist:win` / `Build desktop app.bat` | `release/` |
| App icons | `npm run icons` | |
| Publish | `git push origin works`, then `git push origin works:main` | `main` deploys to Pages (Actions tab shows the run); only when the owner says so |

All e2e scripts start their own Vite server and headless Chrome with WebGL on SwiftShader
(`e2e/launch.mjs`). The built-in browser pane throttles when hidden; use the e2e scripts for timing.

Agents in `.claude/agents/`: `indie-critic` (design critique, read-only) and `qa-screens` (visual
QA, read-only), both rewritten for first person.

## Code map

- `src/sim/`, `src/data/`: **vendored** from the 2D game; never edit here (`vendor.json`,
  `tests/vendor.test.ts`). `src/render/names.ts` and `src/ui/signs.ts` are vendored too (the 2D
  tests read them).
- `src/input3d/steer.ts`: the first-person input adapter (mouse demand, keys, stick → the sim's
  stick vector). Pure; `tests/steer.test.ts`.
- `src/render3d/`: everything three.js. `view.ts` (640x360 targets, composite with the palette
  snap and edge smear, the mirror, the blit), `camera.ts` (FOV, shake, look-back, mirror camera),
  `stage.ts` (poses the yard from the sim each frame with interpolation; a new arena per layout; sim
  events → particles; the Jaws' whip camera), `shading.ts` (parts stay gold, flashes go white), `enemies3d.ts` (Rammers, Snappers, their parts, loose
  and towed parts and every shadow, yours too, as instanced batches), `actors.ts` (your robot, cable, debris, the claw
  and your front/side parts as view models), `arena3d.ts` (a yard: walls, obstacles by footprint,
  gates with exits, skyline, lights), `decals.ts` (lanes, one instanced mesh per kind, incl. the gold
  exit chevrons; skid marks), `particles.ts`, `models.ts` (GLB loading, placeholders), `textures.ts`, `units.ts` (1 sim px =
  0.05 m).
- `src/ui3d/`: the 2D layer: `hud.ts` (hull, yard and wave, the three part slots, the gauge),
  `hints.ts`, `overlay.ts` (floating text, banner, speed lines, reticle, edge markers), `signs3d.ts`
  (the exit signs and arrows), `icons.ts` (the part icons).
- `src/ui/`: the 2D game's UI kit, font and overlap audit (copied).
- `src/app/`: `app.ts` (screens, title attract mode, pointer lock), `play.ts` (a run: input → sim →
  events → sound and effects; the wipe between yards; run results), `settings.ts`, `tuning.ts`,
  `debug.ts` (scenes).
- `src/engine/`: loop, rng, input (+ pointer lock, look, hud), gamepad (+ triggers), audio
  (+ positional panners), music.
- `art/`: Blender build scripts and their textures (`arena`, `booster`, `claw`, `parts`, `rammer`,
  `scrapper`, `snapper`); `public/models/`: the built .glb files (16); `public/ui/part-icons.png`.

## Environment

- Windows 11, no admin rights. Blender 5.2.2 at the Steam path (headless; DECISIONS #5).
- Playwright uses the installed Chrome (`PW_CHANNEL=chrome` by default).
