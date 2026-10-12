# art/ — low-poly models, built by script

Every model is built **entirely by a Python script in headless Blender** (nothing is
hand-edited, and the output is deterministic). Each `art/<family>/build_<asset>.py` builds
its model in an empty scene, paints its 64×64 pixel atlas texel by texel, exports
`public/models/<asset>.glb`, renders previews to `e2e/out/art/`, and prints triangle counts.

## Rebuild

```sh
node scripts/build-models.mjs              # all models, then verification
node scripts/build-models.mjs rammer claw  # only scripts whose path matches
BLENDER="C:/path/to/blender.exe" node scripts/build-models.mjs
```

Blender defaults to `C:\Program Files (x86)\Steam\steamapps\common\Blender\blender.exe`
(5.2). Each script runs as
`blender --background --factory-startup --python-exit-code 1 --python art/<family>/build_<asset>.py`.
**Never** build through the Blender MCP or a running Blender. After the builds,
`art/_lib/verify_models.py` reads every `.glb` and fails the run if a node name, origin,
budget, material, emissive colour, sampler or texture palette is off; it also renders
`e2e/out/art/arena-overview.png` and `arena-eye.png` (every model together).

## Conventions

- **Units are metres. Blender +Z is up. Every model faces Blender +X.** Origin at the
  centre of the footprint on the floor (z = 0) unless listed below. Exported glTF +Y up, so
  Blender +X stays three.js +X and Blender +Z becomes three.js +Y (Blender −Y → three.js +Z).
- Separate rigid parts are separate objects (flat under one root empty named after the
  asset). Rotation/scale are applied; each part keeps its origin at its pivot. Empties
  have identity rotation.
- Flat shaded, low poly, `FrontSide`-friendly (closed where it can be seen).
- One material per family atlas (`<family>_atlas`: Principled BSDF, base colour from the
  Closest-filtered atlas, roughness 1, metallic 0). Emissive parts have their own material
  (solid colour, emissive = base colour) so the renderer can recolour them.

## Palette and colour language

Resurrect 64 only, every texel (`art/_lib/pix.py` `PAL`); no gradients, no blur. Panels
get 1-texel plum outlines and a 3-shade ramp lit from the upper left.

| meaning | indices | where |
|---|---|---|
| speed (teal) | 39–43, 48 | **never in a texture**; only the renderer's recolour of `claw_glow` |
| danger (red/magenta) | 10–12, 14, 15, 59, 60 | Rammer eyes + hazard stripes on the Rammer front plate; `gate_lamp` material |
| salvage (gold) | 17, 18, 23, 28 | the parts only: booster, treads, plow, jaws |
| player | rust 19–22, 16, cream 63, plum 0 (+ steel 6–8 jaws) | scrapper, claw |
| Rammer | slate 44–46, purple 49–51, sage 34–36 | rammer |
| Snapper | lavender/purple 49–52, blue steel 44–46 | snapper |
| arena | warm neutrals 1–5, olive 24–25, moss 34–35, plum 0; gate steel 1/2/6 | pillar, wall, gate, floor |

The build scripts assert these (forbidden indices raise), and the verifier re-checks the
textures embedded in each `.glb`.

## Models (node names are an API the renderer depends on)

| file | root | nodes (origin, Blender coords) | materials | tris (budget) |
|---|---|---|---|---|
| `rammer.glb` | `rammer` | `body` (0,0,0), `eyes`, empty `mount_rear` (−0.55, 0, 0.5) | `rammer_atlas`, `rammer_eyes` | 170 (≤ 450; + booster ≤ 600) |
| `booster.glb` | `booster` | `shell` (0,0,0) = centre of the mounting flange, body extends to x = −0.5; `nozzle_glow` | `booster_atlas`, `booster_glow` | 126 (≤ 200) |
| `scrapper.glb` | `scrapper` | `body` (0,0,0), `tread_l` (0, 0.28, 0), `tread_r` (0, −0.28, 0), empties `mount_rear` (−0.40, 0, 0.33), `claw_root` (0.30, 0, 0.35) | `scrapper_atlas` | 150 (≤ 350) |
| `claw.glb` | `claw` | `arm` (0,0,0) = shoulder pivot, `jaw_l` (0.38, 0.05, 0), `jaw_r` (0.38, −0.05, 0) hinges (rotate about local Z; 12° open baked in), `glow` | `claw_atlas`, `claw_glow` | 232 (≤ 300) |
| `pillar.glb` | `pillar` | mesh `pillar`: exactly 1.6 × 1.6 × 2.0 m | `arena_atlas` | 54 (≤ 150) |
| `wall.glb` | `wall` | mesh `wall`: x, y ∈ [−0.4, 0.4], 1.2 m tall; tiles along X | `arena_atlas` | 42 (≤ 60) |
| `gate.glb` | `gate` | `frame` (0,0,0), `door_l` (−0.4, 0, 0), `door_r` (0.4, 0, 0) (slide along X), `lamp` (0, 0, 1.64); opening x ∈ [−0.8, 0.8] | `arena_atlas`, `gate_lamp` | 130 (≤ 250) |
| `floor.glb` | `floor` | mesh `floor`: one 1.6 m quad at z = 0, UV 0..1 of its own tiling `floor.png` | `floor_tile` | 2 |
| `snapper.glb` | `snapper` | `body` (0,0,0) hull + snout + bare axles + tail fin (no treads: they're the part), `eyes`, empty `mount_front` (0.40, 0, 0) | `snapper_atlas`, `snapper_eyes` | 92 (≤ 350) |
| `treads.glb` | `treads` | mesh `treads`: both track units at y = ±0.30, 0.84 m long, gold guards on top and down the outer sides | `parts_atlas` | 60 (≤ 200) |
| `plow.glb` | `plow` | mesh `blade`: origin at the mount (the blade's back edge on the floor), reaching +X to 0.27, 0.96 m wide, 0.42 m tall, two struts | `parts_atlas` | 44 (≤ 120) |
| `jaws.glb` | `jaws` | `jaw_l` (0, 0.12, 0.16), `jaw_r` (0, −0.12, 0.16) hinges (turn about local Z), each reaching 0.34 m and curling in | `parts_atlas` | 72 (≤ 160) |
| `post.glb` | `post` | mesh `post`: two bales, exactly 0.8 × 0.8 m, 1.36 m tall | `arena_atlas` | 20 (≤ 120) |
| `tower.glb` | `tower` | mesh `tower`: four layers of bales, exactly 2.4 × 2.4 m, 2.7 m tall | `arena_atlas` | 132 (≤ 200) |
| `block.glb` | `block` | mesh `block`: bales over exactly 5.6 × 3.2 m (long side X), two layers and a broken third, ≤ 2.0 m | `arena_atlas` | 258 (≤ 300) |
| `barrier.glb` | `barrier` | mesh `barrier`: a jersey barrier 0.8 m along X (tiles along X), 0.8 m deep, 0.5 m tall | `arena_atlas` | 26 (≤ 60) |

Emissive base colours: `rammer_eyes` #e83b3b, `booster_glow` #fb6b1d, `claw_glow` #9babb2,
`gate_lamp` #e83b3b. The booster attaches by placing `booster` (its root) at a body's
`mount_rear` with identity rotation; it then points −X.

Where a mesh shares its root's name (`pillar`, `wall`, `floor`), Blender keeps object
names unique (`wall.001`), so `pix.export_glb` renames the node back in the glTF JSON.

## Textures

`art/<family>/<family>.png` (64×64): `rammer`, `booster`, `scrapper`, `claw`, `snapper`, `arena`
(shared by pillar, wall, gate, post, tower, block, barrier; painted by `art/arena/arena_atlas.py`;
`art/arena/bales.py` stacks the bales), `parts` (shared by treads, plow, jaws; `art/parts/parts_atlas.py`) and
`art/arena/floor.png` (tiles seamlessly in both directions). Target 40–64 texels/m (claw
~100–150, arena 20–40); faces are mapped to atlas rectangles sized to keep texels square.

## Layout

- `art/_lib/pix.py` — palette, `Canvas` (indexed 64×64 painter + pure-Python PNG
  writer), `MeshBuilder` (faces, boxes, prisms, lathes; per-face UV rects), materials,
  export (+ node rename), triangle report, preview renders.
- `art/_lib/verify_models.py` — the contract checks and overview renders.
- `art/<family>/build_<asset>.py` — one model each.
- Previews: `e2e/out/art/<asset>.png` (3/4 front-left), plus `rammer-back.png`,
  `rammer-back-bare.png`, `rammer-eye.png`, `booster-back.png`, `scrapper-back.png`,
  `scrapper-mirror.png`, `claw-fp.png` (first-person: camera 0.3 m behind and above the
  shoulder), `claw-fp-teal.png`, `gate-open.png`, `floor-eye.png`.
