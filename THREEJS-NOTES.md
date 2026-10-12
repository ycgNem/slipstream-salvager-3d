# Three.js notes — Slipstream Salvager 3D

Read every session. These are the 3D equivalents of the 2D project's hard pixel rules.

## What Three.js is, in a paragraph

A scene graph on WebGL. A `Scene` holds `Object3D`s (meshes = geometry + material, lights,
groups); a `Camera` looks at it; a `WebGLRenderer` draws it to a canvas each frame. Units are
ours (**1 sim px = 0.05 m**), **Y is up**, a camera looks down its own −Z. It ships with
TypeScript types; `npm i three`; Vite needs no config. Pin the version at setup and record it in
`DECISIONS.md`; the API moves between releases, so read `node_modules/three/src` and
threejs.org/docs for the pinned one, not memory.

## The rules

1. **Three.js lives only in `src/render3d/`.** `src/sim` is the vendored 2D sim and never
   imports three. The renderer reads sim state (positions in px, headings in radians, speeds,
   tiers, lanes, events) and maps it to meters each frame. The sim ticks at 60 Hz; the renderer
   interpolates between the last two ticks with the loop's alpha, same as the 2D renderer did.
2. **The camera is bolted to the chassis.** Position = chassis position + (0, 0.55 m, 0);
   yaw = chassis heading (interpolated); no independent look except the held look-back, which
   adds 180° to yaw and nothing else. FOV: 70° at rest → 92° at Slipstream, eased; the Burn adds
   4° while revving. Hit-stop freezes the sim, not the camera lerp. Shake is ≤ 1.5° of roll and
   ≤ 3 cm of offset, never pitch.
3. **The internal resolution is 640×360**, rendered to a `WebGLRenderTarget` with nearest
   filtering and drawn to the window at a whole-number scale, letterboxed, exactly like the 2D
   scaler. `RenderPixelatedPass` from `three/addons/postprocessing` at that size is the
   simplest route; if its edge normals look wrong, a plain render-target blit is fine.
   `renderer.setPixelRatio(1)`; the window's DPR never matters.
4. **Materials**: `MeshLambertMaterial` with pixel textures (`NearestFilter`, `generateMipmaps =
   false`), one directional light plus a hemisphere light, emissive for the claw's tier glow and
   the Rammer's booster and eyes. No PBR, no shadows except a round blob decal under each body.
5. **Floor decals** (telegraph lanes, Burn lane, skid marks, gate warnings) are flat quads 1 cm
   above the floor with `depthWrite = false`, `polygonOffset`, explicit `renderOrder`, and a
   pixel texture. The lane texture has the same dashed / solid / flashing states as 2D.
6. **The rear strip** is a second `PerspectiveCamera` (yaw + 180°, FOV 80°) rendered to a
   640×72 target each frame and composited as a strip across the top of the main target before
   the pixel pass, with a one-pixel frame. Cost: one extra render of a small scene; budget it.
7. **Pass-through**: the Rammer's material is `FrontSide` so being inside it for a few frames
   shows nothing; the camera's near plane is 0.05 m; the hit flash covers the rest.
8. **Speed readability stack**, in order of importance: FOV, claw glow (emissive grey / amber /
   teal on the claw model that sits in the lower middle of the view), engine hum pitch, edge
   blur at Slipstream (a radial darken-and-smear on the outer 15% of the frame, done in the
   pixel pass shader, not a motion blur), speed lines at Slipstream (a few pixel streaks
   anchored to the frame edges), dust and sparks. The HUD gauge is last and can be hidden.
9. **Models by script.** `art/<family>/build_<asset>.py` builds each model in Blender through
   the MCP and exports `.glb`; nothing is hand-edited. Scrapper (seen only as the claw in view
   and the body in the rear strip), Rammer (body, booster, eyes, as separate rigid parts so
   the booster can be torn off and towed), booster as a loose part, pillar, wall segment, gate,
   floor tile. Triangle budget: ≤ 600 per Rammer, ≤ 300 per part, ≤ 20k on screen total.
   Textures 64×64 per family atlas, Resurrect 64.
10. **Positional audio**: one `AudioListener` on the camera, a `PositionalAudio` per Rammer for
    windup / charge / skid / shove, fed from the existing SFX bank; the engine hum is
    non-positional. Panner distance model `linear`, max distance = arena diagonal.
11. **Input adapter** (`src/input3d/`): pointer lock on click; mouse dx accumulates into a steer
    demand that decays toward the body heading; A/D set full demand; W/S thrust; the adapter
    outputs the sim's stick vector (direction = demanded heading, magnitude = thrust) so the
    sim's turn rate, scrub and brake rules apply untouched. Gamepad: stick X = demand, Y / RT =
    thrust. Look-back: Q / LB.
12. **Dispose** everything on results → restart; WebGL memory does not collect itself.
13. **Perf budget**, measured by `e2e/perf.mjs`: ≤ 60 draw calls, ≤ 20k triangles, 60 fps on
    the owner's PC, ≥ 15 fps in headless SwiftShader (the proxy for a weak laptop). Every pass
    counts twice (the view and the mirror), so anything with many copies is instanced: walls,
    obstacles, gate doors, and since M3 every enemy and loose part (one InstancedMesh per model piece,
    per-instance color for glows and glints, a per-instance `whiten` for flashes; DECISIONS #29),
    every floor lane of a kind and every blob shadow (#35). Measured on The Heap's last wave with a
    full build bolted on (the most view models and mirror meshes there can be).
14. **Salvage stays gold under the palette snap** (`src/render3d/shading.ts`, DECISIONS #35): a part's
    material lights 40% of its own texture and caps a lit face at 1.15x it, or shade goes olive and
    light goes lime. Flashes blend toward white; never multiply a color up (it saturates the hue).

## Testing

The sim tests and bots run unchanged (`npm test`). The 3D layer is tested by Playwright:
launch Chromium with `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`
(Claude confirms the exact flags on the first run and writes them in `e2e/launch.mjs`);
`e2e/shots.mjs` replays a seeded input log to fixed ticks (at rest facing a Rammer, at
Slipstream mid-pass, revving a Burn, towing the booster, the rear strip with a windup behind)
and screenshots each; a pixel-diff against stored baselines catches regressions; the smoke test
checks zero console errors and that pointer lock is requested on click. `e2e/coverage.mjs` lists
every model and texture the renderer asked for, as the 2D sprite coverage did.

## Things that look like good ideas and aren't (for Milestone 1)

A physics engine (the sim is the physics); shadows; motion blur; head bob; free look; a
minimap (the rear strip and edge markers are the answer, and a minimap would hide whether they
work); react-three-fiber; downloading models; bloom before the pixel pass.
