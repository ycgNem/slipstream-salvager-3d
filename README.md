# Slipstream Salvager 3D

The **first-person** version of [Slipstream Salvager](https://github.com/ycgNem/slipstream-salvager)
(the 2D top-down original: https://ycgnem.github.io/slipstream-salvager/). Same rules, same run of
five scrapyards, same Rammers and Snappers, seen from inside the little scrap robot: speed is the
weapon, and here you feel it.

You drive a small, fast scrap robot. Only a hit at full speed (the claw glows teal) does damage. Hit
an enemy where its part sits to tear the part off, tow it behind you, bolt it on, and you move the
way it did: a Rammer's Booster turns your attack into its charge, a Snapper's Grip Treads let you
power-slide round, a Plow makes your front a ram, Jaws bite on and sling you back out. Clear a yard,
then drive out through the exit whose sign shows the part you want.

- **Play in the browser:** https://ycgnem.github.io/slipstream-salvager-3d/ (click the view once a run starts so the mouse can steer).
- **Play locally:** double-click `Play.bat` (or `npm run dev`), then open http://localhost:5183.
  A Windows installer and portable exe: `Build desktop app.bat` (or `npm run dist:win`), in `release/`.
- **Controls:** mouse or A/D steer (click the view to let the mouse steer), W thrust, S brake (with
  the Grip Treads, a tap of S power-slides you round), click or Space rip (hold with a booster to rev
  a Burn), E bolt on, Q look back, H hide the HUD, Esc pause.
  Gamepad: stick steers, RT thrust, LT brake, A rip, Y bolt, LB look back.
- **Tuning panel and flat mode:** `?debug` in the address (always on in the dev server); press `.
- **Docs:** `HANDOFF.md` (how to run everything; read first), `PLAN.md` (what first person changes),
  `THREEJS-NOTES.md` (the rendering rules), `ROADMAP.md`, `STYLE.md`, `DECISIONS.md`, `PROGRESS.md`.

TypeScript + Vite + Three.js, rendered at 640x360 and snapped to the Resurrect 64 palette. Models
built by script in Blender (`art/`). The rules are vendored from the 2D game (`src/sim`, `src/data`).
