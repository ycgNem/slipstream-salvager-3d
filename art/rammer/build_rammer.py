"""Rammer: heavy blocky scrap bot -> public/models/rammer.glb.

Nodes:  rammer (root empty)
          body        hull + tracks + armoured ram plate (front, +X) + rear socket collar
          eyes        two slanted glowing slits on the cab front, material `rammer_eyes`
          mount_rear  empty at the booster socket (x=-0.55, z=0.5); identity rotation, so
                      booster.glb (which extends along its own -X) attached there points -X
Materials: rammer_atlas (art/rammer/rammer.png), rammer_eyes (emissive #e83b3b)

Front = sloped ram plate with red/plum hazard stripes + red eyes.
Back  = flat purple back plate with a slate socket collar and vents (no red anywhere).
"""
import math
import os
import sys

sys.dont_write_bytecode = True  # keep art/ free of __pycache__
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "_lib"))
import pix  # noqa: E402

# ---------------------------------------------------------------- atlas layout (x, y, w, h)
R_SLOPE = (0, 0, 40, 16)       # ram slope (hazard stripes)
R_LIP = (0, 16, 40, 8)         # ram bumper lip
R_CHEEK = (40, 0, 12, 24)      # ram side cheeks
R_TREAD = (52, 0, 6, 24)       # track tread band
R_COLLAR_OUT = (58, 0, 6, 3)   # socket collar outside (repeated per face)
R_COLLAR_RIM = (58, 3, 6, 3)   # socket collar rim
R_COLLAR_IN = (58, 6, 6, 2)    # socket collar inner wall
R_DARK = (58, 9, 2, 2)         # hidden faces
R_SIDE = (0, 24, 32, 20)       # hull sides
R_BACK = (32, 24, 32, 20)      # hull back plate with socket
R_TRACK = (0, 44, 40, 10)      # track side (road wheels)
R_TOP = (40, 44, 20, 20)       # hull / cab / ram tops
R_CAB_FRONT = (0, 54, 24, 6)   # visor behind the eyes
R_CAB_SIDE = (24, 54, 16, 6)
R_CAB_BACK = (0, 60, 24, 4)
R_STACK = (60, 44, 4, 12)      # exhaust stack side (repeated per face), v=0 at the top
R_STACK_TOP = (60, 56, 4, 4)

PLUM = 0
SLATE = (44, 45, 46)
PURPLE = (49, 50, 51)
SAGE = (34, 35, 36)
TRACKC = (0, 1, 2)
RED = 15
RED_HI = 12
RED_LO = 14
RED_DK = 10
STEEL = (6, 7, 8)

# ---------------------------------------------------------------- geometry constants
HULL = dict(x0=-0.50, x1=0.34, y=0.44, z0=0.18, z1=0.72)
TRACK_Y = (0.335, 0.515)
TRACK_PROF = [(-0.44, 0.0), (0.44, 0.0), (0.53, 0.10), (0.47, 0.27), (-0.47, 0.27), (-0.53, 0.10)]
RAM_Y = 0.525
RAM_PROF = [(0.30, 0.05), (0.555, 0.05), (0.575, 0.30), (0.42, 0.72), (0.30, 0.72)]  # A B C D E
CAB_Y = 0.30
CAB_PROF = [(-0.28, 0.72), (0.30, 0.72), (0.23, 0.87), (-0.24, 0.87)]
SOCKET = dict(z=0.50, r_out=0.21, r_in=0.15, x_face=-0.50, x_rim=-0.55)
# two exhaust stacks at the back corners: the rear reads from the side too
STACKS = dict(x=-0.42, y=0.31, r=0.042, z0=0.66, z1=0.90, sides=6)


def paint():
    c = pix.Canvas(fill=PLUM)

    # ---- ram slope: bold diagonal red / plum hazard stripes in a bolted frame
    x, y, w, h = R_SLOPE
    c.hazard(x + 1, y + 2, w - 2, h - 4, RED, PLUM, width=4, direction=1)
    # light catches the top of each red stripe, shadow at its foot
    for i in range(w):
        if c.get(x + i, y + 2) == RED:
            c.set(x + i, y + 2, RED_HI)
        if c.get(x + i, y + h - 3) == RED:
            c.set(x + i, y + h - 3, RED_LO)
    # slate top rail (meets the ram's flat top) and foot rail
    c.rect(x + 1, y + 1, w - 2, 1, SLATE[2])
    c.rect(x + 1, y + h - 2, w - 2, 1, SLATE[0])
    c.outline(x, y, w, h, PLUM)
    # heavy bolts down the stripes
    for bx in (x + 3, x + 18, x + 34):
        c.hexbolt(bx, y + 6, SLATE, outline=PLUM)
    # chips and scrapes in the paint (slate showing through)
    c.scuffs(x + 2, y + 3, w - 4, h - 6, [SLATE[1], RED_LO], 14, seed=11, on={RED}, length=(1, 3))
    c.scuffs(x + 2, y + 3, w - 4, h - 6, [1], 8, seed=12, on={PLUM}, length=(1, 2))

    # ---- ram lip: battered slate bumper bar, big rivets, impact scrapes
    x, y, w, h = R_LIP
    c.panel(x, y, w, h, SLATE, outline=PLUM)
    c.hline(x + 1, x + w - 2, y + 1, RED_LO)    # red paint edge wraps over the lip top
    for i in (3, 13, 25, 35):
        c.bolt(x + i, y + 3, SLATE, outline=PLUM)
    # a few long horizontal impact scrapes
    for (sx, sy, L) in ((7, 5, 4), (17, 4, 6), (29, 5, 3), (19, 6, 2)):
        c.hline(x + sx, x + sx + L - 1, y + sy, SLATE[2])
    c.set(x + 18, y + 4, STEEL[1])
    c.set(x + 30, y + 5, STEEL[1])

    # ---- ram cheeks (pentagon side of the plate; u=0 is the front edge)
    x, y, w, h = R_CHEEK
    c.panel(x, y, w, h, SLATE, outline=PLUM)
    # slope edge from C (u=0, v=15) to D (u=6.8, v=0): paint the red plate edge along it
    for j in range(0, 16):
        u = int(round(6.8 * (15 - j) / 15.0))
        for k in range(u):
            c.set(x + k, y + j, PLUM)      # outside the polygon (unused)
        c.set(x + u, y + j, RED)
        c.set(x + u + 1, y + j, RED_LO)
        c.set(x + u + 2, y + j, PLUM)
    for j in range(15, h - 1):             # lip edge: red cap then plum
        c.set(x, y + j, RED_LO)
        c.set(x + 1, y + j, PLUM)
    for by in (8, 13, 18):
        c.bolt(x + 7, y + by, SLATE, outline=PLUM)
    c.bolt(x + 4, y + 19, SLATE, outline=PLUM)
    c.scuffs(x + 3, y + 2, 8, 20, [SLATE[2]], 5, seed=31)

    # ---- tread band: chunky cleats
    x, y, w, h = R_TREAD
    for j in range(h):
        row = j % 3
        col = TRACKC[2] if row == 0 else (TRACKC[1] if row == 1 else PLUM)
        c.hline(x, x + w - 1, y + j, col)
    c.vline(x, y, y + h - 1, PLUM)
    c.vline(x + w - 1, y, y + h - 1, PLUM)

    # ---- socket collar pieces (each face maps the whole little rect)
    x, y, w, h = R_COLLAR_OUT
    c.rect(x, y, w, h, SLATE[1])
    c.hline(x, x + w - 1, y, SLATE[2])
    c.hline(x, x + w - 1, y + h - 1, SLATE[0])
    c.vline(x, y, y + h - 1, PLUM)
    c.set(x + 3, y + 1, SLATE[2])
    c.set(x + 4, y + 2, PLUM)
    x, y, w, h = R_COLLAR_RIM
    c.rect(x, y, w, h, SLATE[2])
    c.hline(x, x + w - 1, y + h - 1, SLATE[0])
    c.vline(x, y, y + h - 1, PLUM)
    c.set(x + 3, y + 1, STEEL[2])
    c.set(x + 4, y + 1, SLATE[0])
    x, y, w, h = R_COLLAR_IN
    c.rect(x, y, w, h, 1)
    c.hline(x, x + w - 1, y + h - 1, PLUM)
    c.rect(*R_DARK, PLUM)

    # ---- hull side: two bolted armour plates, purple unit stripe, sage vent
    x, y, w, h = R_SIDE
    c.rect(x, y, w, h, SLATE[0])
    c.panel(x + 1, y + 1, 15, 16, SLATE, outline=PLUM)    # front plate
    c.panel(x + 15, y + 1, 16, 16, SLATE, outline=PLUM)   # rear plate
    c.panel(x, y + 16, w, 4, SAGE, outline=PLUM)          # sage skirt over the track
    c.outline(x, y, w, h, PLUM)
    c.rect(x + 3, y + 8, 11, 2, PURPLE[1])                # unit stripe
    c.hline(x + 3, x + 13, y + 8, PURPLE[2])
    c.hline(x + 3, x + 13, y + 10, PURPLE[0])
    for i in range(18, 29, 2):                            # vent slots
        c.vline(x + i, y + 6, y + 11, PLUM)
        c.vline(x + i + 1, y + 6, y + 11, SAGE[1])
    c.rect(x + 17, y + 5, 13, 1, PLUM)
    c.rect(x + 17, y + 12, 13, 1, SAGE[2])
    for bx in (3, 9, 18, 24, 28):
        c.bolt(x + bx, y + 3, SLATE, outline=PLUM)
    for bx in (3, 12, 18, 28):
        c.rivet(x + bx, y + 14, SLATE[2], PLUM)
    c.scuffs(x + 2, y + 2, 28, 13, [SLATE[0]], 6, seed=41, on={SLATE[1]}, length=(2, 3))
    c.scuffs(x + 2, y + 2, 28, 13, [SLATE[2]], 3, seed=42, on={SLATE[1]}, length=(2, 2))

    # ---- hull back: purple back plate, socket hole, two sage vent grilles
    x, y, w, h = R_BACK
    c.rect(x, y, w, h, PURPLE[0])
    c.panel(x + 1, y + 1, w - 2, h - 5, PURPLE, outline=PLUM)
    c.panel(x, y + 15, w, 5, SAGE, outline=PLUM)          # bumper bar
    for bx in (3, 10, 19, 26):
        c.rivet(x + bx, y + 17, SAGE[2], PLUM)
    c.outline(x, y, w, h, PLUM)
    # socket: centre (u=16, v=8.1), inner radius ~5.5 texels: dark well + coupling
    cx, cy = x + 16, y + 8
    for j in range(-6, 7):
        for i in range(-6, 7):
            if math.hypot(i + 0.5, j + 0.5) <= 6.6:
                c.set(cx + i, cy + j, SLATE[0])
            if math.hypot(i + 0.5, j + 0.5) <= 5.2:
                c.set(cx + i, cy + j, PLUM)
    c.rect(cx - 2, cy - 2, 4, 4, 1)                       # coupling boss
    c.bolt(cx - 1, cy - 1, STEEL)
    for (i, j) in ((-4, -1), (3, -1), (-1, -4), (-1, 3)):
        c.set(cx + i, cy + j, STEEL[0])                   # pin holes
    # vent grilles left and right of the socket
    for gx in (x + 3, x + 24):
        c.rect(gx, y + 3, 5, 10, PLUM)
        for j in range(4, 12, 2):
            c.hline(gx + 1, gx + 3, y + j, SAGE[1])
            c.hline(gx + 1, gx + 3, y + j + 1, PLUM)
        c.hline(gx, gx + 4, y + 13, PURPLE[2])
    for (bx, by) in ((3, 1), (27, 1)):
        c.rivet(x + bx, y + by + 1, PURPLE[2], PLUM)
    c.scuffs(x + 2, y + 2, 28, 11, [PURPLE[2], PURPLE[0]], 10, seed=51, on={PURPLE[1]})

    # ---- track side: dark track, four road wheels
    x, y, w, h = R_TRACK
    c.rect(x, y, w, h, TRACKC[1])
    c.hline(x, x + w - 1, y, TRACKC[2])
    c.hline(x, x + w - 1, y + 1, TRACKC[1])
    c.hline(x, x + w - 1, y + h - 1, PLUM)
    for i in range(0, w, 3):
        c.set(x + i, y, PLUM)                             # cleat notches on top
        c.set(x + i + 1, y + h - 1, TRACKC[1])
    c.rect(x + 3, y + 2, w - 6, h - 4, PLUM)
    for k, wx in enumerate((7, 16, 24, 33)):
        cx, cy = x + wx, y + 5
        c.circle(cx, cy, 3, PLUM, fill=SLATE[0])     # tyre + rim
        c.set(cx - 2, cy - 1, SLATE[1])
        c.set(cx - 1, cy - 2, SLATE[1])
        c.set(cx - 2, cy, SLATE[1])
        c.set(cx, cy - 2, SLATE[1])
        c.rect(cx - 1, cy - 1, 2, 2, SLATE[2])        # hub, lit top-left
        c.set(cx, cy, SLATE[0])
        c.set(cx - 1, cy - 1, STEEL[1])
    c.outline(x, y, w, h, PLUM)

    # ---- tops: slate deck plates, sage hatch, bolts
    x, y, w, h = R_TOP
    c.panel(x, y, w, h, SLATE, outline=PLUM)
    c.seam_h(x + 1, x + w - 2, y + 6, PLUM, SLATE[2])
    c.seam_h(x + 1, x + w - 2, y + 13, PLUM, SLATE[2])
    c.panel(x + 6, y + 8, 8, 5, SAGE, outline=PLUM)
    for bx, by in ((2, 2), (16, 2), (2, 16), (16, 16), (9, 3)):
        c.rivet(x + bx, y + by, SLATE[2], PLUM)
    c.scuffs(x + 2, y + 2, 16, 16, [SLATE[0]], 8, seed=61, on={SLATE[1]})

    # ---- cab
    x, y, w, h = R_CAB_FRONT
    c.panel(x, y, w, h, SLATE, outline=PLUM)
    c.rect(x + 2, y + 2, w - 4, 3, PLUM)                  # dark visor slot behind the eyes
    c.dither(x + 2, y + 2, w - 4, 1, 1, "checker")
    x, y, w, h = R_CAB_SIDE
    c.panel(x, y, w, h, SLATE, outline=PLUM)
    for i in range(4, 12, 2):
        c.vline(x + i, y + 2, y + 3, PLUM)
    c.rivet(x + 2, y + 2, SLATE[2], PLUM)
    x, y, w, h = R_CAB_BACK
    c.panel(x, y, w, h, PURPLE, outline=PLUM)
    for i in range(3, w - 2, 5):
        c.set(x + i, y + 1, PURPLE[2])

    # ---- exhaust stacks: slate pipe, sooty mouth, sage clamp band
    x, y, w, h = R_STACK
    c.rect(x, y, w, h, SLATE[1])
    c.vline(x, y, y + h - 1, SLATE[2])
    c.vline(x + w - 1, y, y + h - 1, SLATE[0])
    c.rect(x, y, w, 2, PLUM)
    c.hline(x, x + w - 1, y + 2, 1)
    c.rect(x, y + 6, w, 2, SAGE[1])
    c.hline(x, x + w - 1, y + 6, SAGE[2])
    c.set(x + 1, y + 9, SLATE[2])
    x, y, w, h = R_STACK_TOP
    c.rect(x, y, w, h, PLUM)
    c.set(x + 1, y + 1, 1)
    return c


def build_body(root, mat):
    mb = pix.MeshBuilder()

    # tracks (side profile extruded along Y); outer caps carry the road wheels
    def tread_side(i, a, b):
        L = math.dist(a, b)
        rows = max(3, min(24, int(round(L * 26))))
        x, y, w, h = R_TREAD
        return {"rect": (x, y, w, rows)}

    for sgn in (1, -1):
        y0, y1 = (TRACK_Y if sgn > 0 else (-TRACK_Y[1], -TRACK_Y[0]))
        outer = {"rect": R_TRACK, "flip_u": sgn < 0}
        inner = {"rect": R_DARK}
        mb.prism(TRACK_PROF, "y", y0, y1, side=tread_side,
                 cap0=(outer if sgn < 0 else inner), cap1=(outer if sgn > 0 else inner))

    # hull box (front face is buried in the ram plate; bottom is never seen)
    H = HULL
    mb.box(H["x0"], H["x1"], -H["y"], H["y"], H["z0"], H["z1"], {
        "+y": {"rect": R_SIDE},
        "-y": {"rect": R_SIDE, "flip_u": True},
        "-x": {"rect": R_BACK},
        "+z": {"rect": R_TOP},
    })

    # exhaust stacks (hexagonal pipes, vertical) at the back corners of the deck
    St = STACKS
    n = St["sides"]
    for sgn in (1, -1):
        cx, cy = St["x"], St["y"] * sgn
        ring = [(cx + St["r"] * math.cos(2 * math.pi * k / n),
                 cy + St["r"] * math.sin(2 * math.pi * k / n)) for k in range(n)]
        for k in range(n):
            (ax, ay), (bx, by) = ring[k], ring[(k + 1) % n]
            out = ((ax + bx) / 2 - cx, (ay + by) / 2 - cy, 0.0)
            mb.face([(ax, ay, St["z0"]), (bx, by, St["z0"]), (bx, by, St["z1"]), (ax, ay, St["z1"])],
                    outward=out, rect=R_STACK)
        mb.face([(px, py, St["z1"]) for (px, py) in ring], outward=(0, 0, 1), rect=R_STACK_TOP)

    # ram plate: side profile A B C D E extruded across the full width
    def ram_side(i, a, b):
        return {0: None,                 # A->B bottom, never seen
                1: {"rect": R_LIP},      # B->C bumper lip
                2: {"rect": R_SLOPE},    # C->D sloped hazard plate
                3: {"rect": (40, 44, 20, 3)},  # D->E flat top strip (deck texture)
                4: None}[i]              # E->A back, inside the hull
    mb.prism(RAM_PROF, "y", -RAM_Y, RAM_Y, side=ram_side,
             cap0={"rect": R_CHEEK, "flip_u": True}, cap1={"rect": R_CHEEK})

    # cab with sloped visor front
    def cab_side(i, a, b):
        return {0: None, 1: {"rect": R_CAB_FRONT}, 2: {"rect": R_TOP, "up": (1, 0, 0)},
                3: {"rect": R_CAB_BACK}}[i]
    mb.prism(CAB_PROF, "y", -CAB_Y, CAB_Y, side=cab_side,
             cap0={"rect": R_CAB_SIDE, "flip_u": True}, cap1={"rect": R_CAB_SIDE})

    # socket collar on the back plate (octagon around the X axis at z=0.5)
    S = SOCKET
    mb.lathe([(S["x_face"], S["r_out"]), (S["x_rim"], S["r_out"]), (S["x_rim"], S["r_in"]),
              (S["x_face"], S["r_in"])], sides=8, center=(0.0, S["z"]),
             bands=[{"rect": R_COLLAR_OUT, "out": "r+", "repeat": True},
                    {"rect": R_COLLAR_RIM, "out": "x-", "repeat": True},
                    {"rect": R_COLLAR_IN, "out": "r-", "repeat": True}])
    return mb.to_object("body", [mat], origin=(0, 0, 0), parent=root)


def build_eyes(root, mat):
    """Two slanted slits standing proud of the cab's sloped front (angry V)."""
    mb = pix.MeshBuilder()
    (xa, za), (xb, zb) = CAB_PROF[1], CAB_PROF[2]
    d = (xb - xa, zb - za)
    L = math.hypot(*d)
    n = (d[1] / L, -d[0] / L)                  # outward normal in XZ (points +X, up)

    def P(y, t, off):
        return (xa + d[0] * t + n[0] * off, y, za + d[1] * t + n[1] * off)

    for sgn in (1, -1):
        yi, yo = 0.05 * sgn, 0.22 * sgn        # inner / outer ends
        ti, to = (0.22, 0.58), (0.42, 0.80)    # inner end sits lower: angry slant
        front = [P(yi, ti[0], 0.018), P(yo, to[0], 0.018), P(yo, to[1], 0.018), P(yi, ti[1], 0.018)]
        back = [P(yi, ti[0], -0.004), P(yo, to[0], -0.004), P(yo, to[1], -0.004), P(yi, ti[1], -0.004)]
        mb.face(front, outward=(n[0], 0, n[1]), tex=[(0, 0)] * 4)
        for k in range(4):
            a, b = k, (k + 1) % 4
            quad = [front[a], front[b], back[b], back[a]]
            mid = [sum(p[i] for p in quad) / 4 for i in range(3)]
            ctr = [sum(p[i] for p in front) / 4 for i in range(3)]
            out = tuple(mid[i] - ctr[i] for i in range(3))
            mb.face(quad, outward=out, tex=[(0, 0)] * 4)
    return mb.to_object("eyes", [mat], origin=(0.27, 0.0, 0.80), parent=root)


def build():
    pix.reset_scene()
    canvas = paint()
    img = canvas.to_image("rammer", pix.tex_path("rammer"), forbid=pix.SALVAGE)
    m_atlas = pix.atlas_material("rammer_atlas", img)
    m_eyes = pix.emissive_material("rammer_eyes", 15)

    root = pix.empty("rammer")
    build_body(root, m_atlas)
    build_eyes(root, m_eyes)
    pix.empty("mount_rear", (SOCKET["x_rim"], 0.0, SOCKET["z"]), parent=root,
              display="SINGLE_ARROW", size=0.2)

    total, lo, hi = pix.report(root)
    assert total <= 450, total
    pix.export_glb("rammer")

    # previews: with the booster bolted on (if built), then the bare back
    pix.setup_preview()
    booster = os.path.join(pix.MODELS_DIR, "booster.glb")
    attached = []
    if os.path.exists(booster):
        attached = pix.import_glb(booster, parent_to=bpy_obj("mount_rear"))
    pix.render_view(pix.preview_path("rammer"), direction=(1.0, 0.8, 0.55))
    pix.render_view(pix.preview_path("rammer-back"), direction=(-1.0, -0.75, 0.5))
    pix.render_view(pix.preview_path("rammer-eye"), cam_loc=(4.0, 1.2, 0.55),
                    look_at=(0.0, 0.0, 0.45), fov_deg=30, size=(640, 360))
    for o in attached:
        o.hide_render = True
    pix.render_view(pix.preview_path("rammer-back-bare"), direction=(-1.0, 0.6, 0.45))
    return total


def bpy_obj(name):
    import bpy
    return bpy.data.objects[name]


if __name__ == "__main__":
    build()
