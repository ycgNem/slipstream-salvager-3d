# Slipstream Salvager 3D

The **first-person** version of [Slipstream Salvager](https://github.com/ycgNem/slipstream-salvager)
(the 2D top-down original: https://ycgnem.github.io/slipstream-salvager/). Same rules, same three
waves in the Ring, same Rammer and Booster, seen from inside the little scrap robot: speed is the
weapon, and here you feel it.

You drive a small, fast scrap robot. Only a hit at full speed (the claw glows teal) does damage. Hit
a Rammer's back at speed to tear its booster off, tow it behind you, bolt it on, and your attack
becomes the Rammer's own charge: hold to rev in a locked straight line, let go to burn through.

- **Play locally:** double-click `Play.bat` (or `npm run dev`), then open http://localhost:5183.
- **Controls:** mouse or A/D steer (click the view to let the mouse steer), W thrust, S brake, click
  or Space rip (hold with a booster to rev a Burn), E bolt on, Q look back, H hide the HUD, Esc pause.
  Gamepad: stick steers, RT thrust, LT brake, A rip, Y bolt, LB look back.
- **Tuning panel and flat mode:** `?debug` in the address (always on in the dev server); press `.
- **Docs:** `HANDOFF.md` (how to run everything; read first), `PLAN.md` (what first person changes),
  `THREEJS-NOTES.md` (the rendering rules), `ROADMAP.md`, `STYLE.md`, `DECISIONS.md`, `PROGRESS.md`.

TypeScript + Vite + Three.js, rendered at 640x360 and snapped to the Resurrect 64 palette. Models
built by script in Blender (`art/`). The rules are vendored from the 2D game (`src/sim`, `src/data`).
