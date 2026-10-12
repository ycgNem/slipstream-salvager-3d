"""Scrapper: the player's small patched-together bot -> public/models/scrapper.glb.

Seen only in the rear-view strip (camera at the front of the robot, 0.55 m up, looking
back), so the deck, the back and the tread tops get the detail.

Nodes:  scrapper (root empty)
          body       hull, mudguards, hatch, exhaust, claw shoulder bracket, rear collar
          tread_l    +Y tread block, origin at its centre on the floor (0, +0.28, 0)
          tread_r    -Y tread block, origin (0, -0.28, 0)
          mount_rear empty at the rear collar (x=-0.40, z=0.33): booster.glb attaches here
          claw_root  empty at the front shoulder bracket (x=0.30, z=0.35)
Materials: scrapper_atlas (art/scrapper/scrapper.png)
"""
import math
import os
import sys

sys.dont_write_bytecode = True  # keep art/ free of __pycache__
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "_lib"))
import pix  # noqa: E402

# ---------------------------------------------------------------- atlas layout
R_SIDE = (0, 0, 28, 13)        # hull side (u=0 at the nose)
R_TOP = (28, 0, 18, 26)        # deck: u across (-Y right), v=0 at the nose edge
R_TBAND = (46, 0, 6, 20)       # tread band cleats
R_COLLAR_OUT = (52, 0, 6, 2)
R_COLLAR_RIM = (52, 2, 6, 2)
R_COLLAR_IN = (52, 4, 6, 2)
R_EXHAUST = (52, 6, 3, 8)
R_EXH_TOP = (55, 6, 3, 3)
R_DARK = (55, 10, 2, 2)
R_FENDER_TOP = (58, 0, 6, 26)  # mudguard tops: u across, v along X
R_FRONT_UP = (0, 13, 18, 4)
R_FRONT = (0, 17, 18, 7)
R_FRONT_LO = (0, 24, 18, 4)
R_SHOULDER = (18, 13, 10, 8)
R_TSIDE = (32, 26, 32, 8)      # tread side, road wheels
R_BACK = (0, 28, 18, 14)
R_HATCH_TOP = (18, 28, 14, 14)
R_FENDER_SIDE = (32, 34, 26, 2)
R_FENDER_END = (58, 34, 6, 2)
R_HATCH_SIDE = (18, 42, 14, 3)

PLUM = 0
RUST = (20, 21, 22)
DEEP = 19
ORANGE = 16
CREAM = (22, 63, 63)
TREADC = (0, 1, 2)

# ---------------------------------------------------------------- geometry
HULL_Y = 0.22
HULL_PROF = [(-0.36, 0.10), (0.30, 0.10), (0.34, 0.18), (0.34, 0.34), (0.28, 0.42),
             (-0.36, 0.42)]
TREAD_Y = (0.21, 0.35)
TREAD_PROF = [(-0.33, 0.0), (0.33, 0.0), (0.40, 0.08), (0.355, 0.20), (-0.355, 0.20),
              (-0.40, 0.08)]
FENDER = dict(x0=-0.35, x1=0.31, y0=0.20, y1=0.36, z0=0.20, z1=0.25)
HATCH = dict(x0=-0.12, x1=0.18, y=0.16, z0=0.42, z1=0.48)
COLLAR = dict(z=0.33, r_out=0.095, r_in=0.068, x_face=-0.36, x_rim=-0.40)


def paint():
    c = pix.Canvas(fill=PLUM)

    # ---- hull side: rust plates, a cream patch riveted over a hole, weld seam
    x, y, w, h = R_SIDE   # u=0 at the front (x=0.34), v=0 at the top (z=0.42)
    c.panel(x, y, w, h, RUST, outline=PLUM)
    c.seam_v(x + 12, y + 1, y + h - 2, PLUM, RUST[2])
    c.panel(x + 15, y + 3, 8, 6, CREAM, outline=PLUM)             # patch
    for (i, j) in ((16, 4), (21, 4), (16, 7), (21, 7)):
        c.set(x + i, y + j, RUST[0])                              # patch rivets
    c.hline(x + 17, x + 19, y + 6, RUST[2])                       # scratch on the patch
    for i in range(2, 11, 3):
        c.rivet(x + i, y + 2, RUST[2], DEEP)
    for i in range(2, 26, 4):
        c.set(x + i, y + h - 3, DEEP)                             # bottom bolt row
    c.hline(x + 3, x + 9, y + 7, ORANGE)                          # orange paint stripe
    c.hline(x + 3, x + 9, y + 8, DEEP)
    c.scuffs(x + 2, y + 3, 24, 7, [DEEP, RUST[2]], 7, seed=3, on={RUST[1]}, length=(1, 2))

    # ---- deck (hull top). The hatch covers v 4..16, u 3..15; the rear deck (v 17..25)
    # is what the rear-view strip looks across, so the detail goes there
    x, y, w, h = R_TOP
    c.panel(x, y, w, h, RUST, outline=PLUM)
    c.seam_h(x + 1, x + w - 2, y + 3, PLUM, RUST[2])
    c.seam_h(x + 1, x + w - 2, y + 17, PLUM, RUST[2])
    c.panel(x + 2, y + 19, 6, 5, CREAM, outline=PLUM)             # cream repair plate
    c.set(x + 3, y + 20, 63)
    c.set(x + 4, y + 20, 63)
    c.set(x + 3, y + 22, RUST[0])                                 # patch rivets
    c.set(x + 6, y + 22, RUST[0])
    c.hline(x + 10, x + 15, y + 20, ORANGE)                       # orange paint stripe
    c.hline(x + 10, x + 15, y + 21, DEEP)
    for (i, j) in ((2, 1), (15, 1), (15, 23), (10, 24)):
        c.rivet(x + i, y + j, RUST[2], DEEP)
    for j in range(5, 16, 3):
        c.set(x + 1, y + j, RUST[2])
        c.set(x + w - 2, y + j, DEEP)
    c.scuffs(x + 9, y + 22, 7, 3, [DEEP], 3, seed=5, on={RUST[1]}, length=(1, 2))

    # ---- tread band: cleats
    x, y, w, h = R_TBAND
    for j in range(h):
        col = (TREADC[2], TREADC[1], PLUM)[j % 3]
        c.hline(x, x + w - 1, y + j, col)
    c.vline(x, y, y + h - 1, PLUM)
    c.vline(x + w - 1, y, y + h - 1, PLUM)
    c.set(x + 2, y + 1, DEEP)

    # ---- collar pieces + exhaust + dark
    x, y, w, h = R_COLLAR_OUT
    c.rect(x, y, w, h, RUST[0])
    c.hline(x, x + w - 1, y, RUST[1])
    c.vline(x, y, y + h - 1, PLUM)
    x, y, w, h = R_COLLAR_RIM
    c.rect(x, y, w, h, CREAM[1])
    c.hline(x, x + w - 1, y + 1, CREAM[0])
    c.vline(x, y, y + h - 1, PLUM)
    x, y, w, h = R_COLLAR_IN
    c.rect(x, y, w, h, 1)
    c.hline(x, x + w - 1, y + 1, PLUM)
    x, y, w, h = R_EXHAUST
    c.rect(x, y, w, h, 2)
    c.vline(x, y, y + h - 1, 5)
    c.vline(x + 2, y, y + h - 1, 1)
    c.hline(x, x + 2, y, PLUM)
    c.hline(x, x + 2, y + 1, DEEP)
    c.rect(*R_EXH_TOP, PLUM)
    c.set(R_EXH_TOP[0] + 1, R_EXH_TOP[1] + 1, 1)
    c.rect(*R_DARK, PLUM)

    # ---- front faces
    x, y, w, h = R_FRONT_UP
    c.panel(x, y, w, h, RUST, outline=PLUM)
    c.hline(x + 2, x + w - 3, y + 1, RUST[2])
    x, y, w, h = R_FRONT
    c.panel(x, y, w, h, CREAM, outline=PLUM)                      # cream nose plate
    c.rect(x + 6, y + 2, 6, 3, DEEP)                              # claw socket shadow
    c.hline(x + 6, x + 11, y + 2, PLUM)
    for i in (2, 15):
        c.rivet(x + i, y + 2, 63, RUST[0])
    c.hline(x + 2, x + 4, y + 5, RUST[0])
    x, y, w, h = R_FRONT_LO
    c.panel(x, y, w, h, RUST, outline=PLUM)
    for i in range(3, w - 2, 4):
        c.set(x + i, y + 1, RUST[2])

    # ---- shoulder bracket
    x, y, w, h = R_SHOULDER
    c.panel(x, y, w, h, RUST, outline=PLUM)
    c.rect(x + 3, y + 3, 3, 2, DEEP)
    c.set(x + 3, y + 3, 1)

    # ---- back: rust plate, cream number patch, collar seat, tail lights in plum/orange
    x, y, w, h = R_BACK   # u=0 at +Y (left), v=0 at top (z=0.42)
    c.panel(x, y, w, h, RUST, outline=PLUM)
    cx, cy = x + 9, y + 4        # collar centre: z=0.33 -> v=(0.09/0.32)*14=3.9
    for j in range(-4, 5):
        for i in range(-4, 5):
            d = math.hypot(i + 0.5, j + 0.5)
            if d <= 4.4:
                c.set(cx + i, cy + j, RUST[0])
            if d <= 3.0:
                c.set(cx + i, cy + j, PLUM)
    c.rect(cx - 1, cy - 1, 2, 2, 1)
    c.set(cx - 1, cy - 1, 2)
    c.panel(x + 2, y + 9, 4, 4, CREAM, outline=PLUM)              # patch
    c.rect(x + 13, y + 10, 3, 2, ORANGE)                          # tail lamp (painted)
    c.hline(x + 13, x + 15, y + 12, DEEP)
    c.rect(x + 2, y + 2, 2, 1, ORANGE)
    c.scuffs(x + 2, y + 2, 14, 10, [DEEP], 4, seed=9, on={RUST[1]})

    # ---- hatch
    x, y, w, h = R_HATCH_TOP
    c.panel(x, y, w, h, CREAM, outline=PLUM)
    c.panel(x + 3, y + 3, 8, 8, RUST, outline=PLUM, inset=True)
    c.hline(x + 5, x + 8, y + 6, ORANGE)                          # handle
    c.hline(x + 5, x + 8, y + 7, DEEP)
    for (i, j) in ((1, 1), (11, 1), (1, 11), (11, 11)):
        c.set(x + i + 0, y + j + 0, RUST[1])
    x, y, w, h = R_HATCH_SIDE
    c.rect(x, y, w, h, CREAM[0])
    c.hline(x, x + w - 1, y, 63)
    c.hline(x, x + w - 1, y + h - 1, PLUM)
    c.vline(x, y, y + h - 1, PLUM)

    # ---- tread side: dark tread, three road wheels, rust hubs
    x, y, w, h = R_TSIDE   # u=0 front
    c.rect(x, y, w, h, TREADC[1])
    c.hline(x, x + w - 1, y, TREADC[2])
    for i in range(0, w, 3):
        c.set(x + i, y, PLUM)
    c.rect(x + 3, y + 2, w - 6, h - 3, PLUM)
    for wx in (6, 16, 26):
        cx, cy = x + wx, y + 4
        c.circle(cx, cy, 2, PLUM, fill=1)
        c.rect(cx - 1, cy - 1, 2, 2, RUST[1])
        c.set(cx - 1, cy - 1, RUST[2])
        c.set(cx, cy, DEEP)
    c.outline(x, y, w, h, PLUM)

    # ---- mudguards
    x, y, w, h = R_FENDER_TOP   # u across, v along X (front at top)
    c.panel(x, y, w, h, RUST, outline=PLUM)
    for j in range(3, h - 2, 5):
        c.rivet(x + 2, y + j, RUST[2], DEEP)
    c.rect(x + 2, y + 15, 2, 5, CREAM[1])
    c.vline(x + 4, y + 15, y + 19, CREAM[0])
    x, y, w, h = R_FENDER_SIDE
    c.rect(x, y, w, h, RUST[0])
    c.hline(x, x + w - 1, y, RUST[2])
    c.hline(x, x + w - 1, y + h - 1, PLUM)
    x, y, w, h = R_FENDER_END
    c.rect(x, y, w, h, RUST[0])
    c.hline(x, x + w - 1, y + h - 1, PLUM)
    return c


def build_body(root, mat):
    mb = pix.MeshBuilder()

    def hull_side(i, a, b):
        return {0: None,                        # bottom
                1: {"rect": R_FRONT_LO},        # lower nose chamfer
                2: {"rect": R_FRONT},           # nose
                3: {"rect": R_FRONT_UP},        # upper nose chamfer
                4: {"rect": R_TOP},             # deck
                5: {"rect": R_BACK}}[i]         # back
    mb.prism(HULL_PROF, "y", -HULL_Y, HULL_Y, side=hull_side,
             cap0={"rect": R_SIDE, "flip_u": True}, cap1={"rect": R_SIDE})

    F = FENDER
    for sgn in (1, -1):
        y0, y1 = (F["y0"], F["y1"]) if sgn > 0 else (-F["y1"], -F["y0"])
        side_out = "+y" if sgn > 0 else "-y"
        mb.box(F["x0"], F["x1"], y0, y1, F["z0"], F["z1"], {
            "+z": {"rect": R_FENDER_TOP},
            side_out: {"rect": R_FENDER_SIDE, "flip_u": sgn < 0},
            "+x": {"rect": R_FENDER_END},
            "-x": {"rect": R_FENDER_END},
        })

    H = HATCH
    mb.box(H["x0"], H["x1"], -H["y"], H["y"], H["z0"], H["z1"], {
        "+z": {"rect": R_HATCH_TOP},
        "+x": {"rect": R_HATCH_SIDE}, "-x": {"rect": R_HATCH_SIDE},
        "+y": {"rect": R_HATCH_SIDE}, "-y": {"rect": R_HATCH_SIDE},
    })

    # exhaust stub on the back-left corner of the deck (kept below the hatch top so it
    # never blocks the rear-view strip)
    mb.box(-0.34, -0.28, 0.11, 0.17, 0.42, 0.48, {
        "+z": {"rect": R_EXH_TOP},
        "+x": {"rect": (52, 6, 3, 3)}, "-x": {"rect": (52, 6, 3, 3)},
        "+y": {"rect": (52, 6, 3, 3)}, "-y": {"rect": (52, 6, 3, 3)},
    })

    # claw shoulder bracket on the nose
    mb.box(0.33, 0.37, -0.075, 0.075, 0.28, 0.41, {
        "+x": {"rect": R_SHOULDER}, "+z": {"rect": (18, 13, 10, 3)},
        "+y": {"rect": (18, 13, 3, 8)}, "-y": {"rect": (18, 13, 3, 8)},
    })

    C = COLLAR
    mb.lathe([(C["x_face"], C["r_out"]), (C["x_rim"], C["r_out"]), (C["x_rim"], C["r_in"]),
              (C["x_face"], C["r_in"])], sides=8, center=(0.0, C["z"]),
             bands=[{"rect": R_COLLAR_OUT, "out": "r+", "repeat": True},
                    {"rect": R_COLLAR_RIM, "out": "x-", "repeat": True},
                    {"rect": R_COLLAR_IN, "out": "r-", "repeat": True}])
    return mb.to_object("body", [mat], origin=(0, 0, 0), parent=root)


def build_tread(root, mat, sgn):
    mb = pix.MeshBuilder()
    y0, y1 = TREAD_Y if sgn > 0 else (-TREAD_Y[1], -TREAD_Y[0])

    def band(i, a, b):
        L = math.dist(a, b)
        rows = max(3, min(R_TBAND[3], int(round(L * 26))))
        return {"rect": (R_TBAND[0], R_TBAND[1], R_TBAND[2], rows)}

    outer = {"rect": R_TSIDE, "flip_u": sgn < 0}
    inner = {"rect": R_DARK}
    mb.prism(TREAD_PROF, "y", y0, y1, side=band,
             cap0=(outer if sgn < 0 else inner), cap1=(outer if sgn > 0 else inner))
    name = "tread_l" if sgn > 0 else "tread_r"
    return mb.to_object(name, [mat], origin=(0, 0.28 * sgn, 0), parent=root)


def build():
    pix.reset_scene()
    canvas = paint()
    img = canvas.to_image("scrapper", pix.tex_path("scrapper"),
                          forbid=pix.DANGER | pix.SALVAGE)
    mat = pix.atlas_material("scrapper_atlas", img)

    root = pix.empty("scrapper")
    build_body(root, mat)
    build_tread(root, mat, 1)
    build_tread(root, mat, -1)
    mount = pix.empty("mount_rear", (-0.40, 0.0, COLLAR["z"]), parent=root,
                      display="SINGLE_ARROW", size=0.15)
    claw_root = pix.empty("claw_root", (0.30, 0.0, 0.35), parent=root,
                          display="SINGLE_ARROW", size=0.15)

    total, lo, hi = pix.report(root)
    assert total <= 350, total
    pix.export_glb("scrapper")

    # previews (claw + booster attached for context when they exist)
    pix.setup_preview()
    extras = []
    claw = os.path.join(pix.MODELS_DIR, "claw.glb")
    if os.path.exists(claw):
        extras += pix.import_glb(claw, parent_to=claw_root)
    pix.render_view(pix.preview_path("scrapper"), direction=(1.0, 0.85, 0.75))
    booster = os.path.join(pix.MODELS_DIR, "booster.glb")
    if os.path.exists(booster):
        extras += pix.import_glb(booster, parent_to=mount)
    pix.render_view(pix.preview_path("scrapper-back"), direction=(-1.0, 0.7, 0.8))
    # what the rear-view strip camera sees: at the front, 0.55 m up, looking back
    pix.render_view(pix.preview_path("scrapper-mirror"), cam_loc=(0.32, 0.0, 0.55),
                    look_at=(-3.0, 0.0, 0.25), fov_deg=80, size=(640, 160), clip_start=0.05)
    return total


if __name__ == "__main__":
    build()
