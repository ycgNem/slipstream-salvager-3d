"""Booster: the gold thruster everyone fights over -> public/models/booster.glb.

Nodes:  booster (root empty)
          shell        thruster; origin at the centre of the mounting flange (front, +X
                       end); the body extends backwards, x in [-0.5, 0]
          nozzle_glow  hot core inside the nozzle bell, material `booster_glow`
Materials: booster_atlas (art/booster/booster.png), booster_glow (emissive #fb6b1d)
"""
import os
import sys

sys.dont_write_bytecode = True  # keep art/ free of __pycache__
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "_lib"))
import pix  # noqa: E402

SIDES = 8
CW = 6  # texels per octagon face column

# Lathe profile (x, r), front -> back. Bands: one texture strip each (48 x rows).
PROFILE = [
    (0.000, 0.190),   # flange front edge
    (-0.050, 0.190),  # A flange rim
    (-0.050, 0.160),  # B flange back step
    (-0.300, 0.160),  # C body
    (-0.340, 0.120),  # D neck
    (-0.500, 0.190),  # E bell outer flare
    (-0.500, 0.165),  # F bell rim
    (-0.370, 0.085),  # G bell inner (faces inward)
]
STRIP = {  # band -> (y, rows) in the atlas; all strips are 48 wide at x=0
    "A": (0, 3), "B": (3, 2), "C": (5, 12), "D": (17, 3), "E": (20, 8), "F": (28, 2),
    "G": (30, 7),
}
CAP = (0, 40, 20, 20)        # front mounting face (octagon, planar)
GOLD = (17, 18, 23)          # dark, mid, light
SPARK = 28
STEEL = (6, 7, 8)
PLUM = 0


def paint():
    c = pix.Canvas(fill=PLUM)
    W = SIDES * CW
    # A: flange rim - gold ring with plum bolt holes
    y, h = STRIP["A"]
    c.rect(0, y, W, h, GOLD[1])
    c.hline(0, W - 1, y, GOLD[2])
    c.hline(0, W - 1, y + h - 1, GOLD[0])
    for k in range(SIDES):
        c.set(k * CW, y, PLUM)            # face seams
        c.set(k * CW, y + 1, PLUM)
        c.set(k * CW, y + 2, PLUM)
        c.set(k * CW + 3, y + 1, PLUM)    # bolt hole
        c.set(k * CW + 2, y + 1, SPARK if k % 2 else GOLD[2])
    # B: flange back step - shadowed gold
    y, h = STRIP["B"]
    c.rect(0, y, W, h, GOLD[0])
    c.hline(0, W - 1, y + h - 1, PLUM)
    # C: body - two rows of riveted gold plates around a dark steel band
    y, h = STRIP["C"]
    for k in range(SIDES):
        x = k * CW
        # forward plate (rows 0-4), steel band (5-7), aft plate (8-11)
        c.panel(x, y, CW + 1, 6, GOLD, outline=PLUM)
        c.panel(x, y + 8, CW + 1, 5, GOLD, outline=PLUM)
        c.rect(x, y + 5, CW, 3, STEEL[1])
        c.hline(x, x + CW - 1, y + 5, STEEL[2])
        c.hline(x, x + CW - 1, y + 7, STEEL[0])
        c.set(x + 2, y + 6, PLUM)          # band bolt
        c.set(x + 1, y + 6, STEEL[2])
        # rivets in the plate corners (pale gold head, amber shadow)
        c.rivet(x + 1, y + 1, SPARK, GOLD[0])
        c.rivet(x + CW - 2, y + 1, GOLD[2], GOLD[0])
        c.rivet(x + 1, y + 9, GOLD[2], GOLD[0])
        # a diagonal glint on alternate plates
        if k % 2 == 1:
            c.set(x + 3, y + 3, SPARK)
            c.set(x + 4, y + 2, SPARK)
            c.set(x + 3, y + 10, SPARK)
        # small plum scuffs
        if k in (2, 6):
            c.set(x + 4, y + 10, GOLD[0])
            c.set(x + 2, y + 4, GOLD[0])
    # top face (k=1) carries a stamped plum chevron pointing forward (+X = rect top)
    x = 1 * CW
    for i, (dx, dy) in enumerate(((2, 9), (3, 9), (1, 10), (4, 10))):
        c.set(x + dx, y + dy, PLUM)
    # D: neck - dark steel collar
    y, h = STRIP["D"]
    c.rect(0, y, W, h, STEEL[0])
    c.hline(0, W - 1, y, STEEL[1])
    c.hline(0, W - 1, y + h - 1, PLUM)
    for k in range(SIDES):
        c.set(k * CW + 3, y + 1, STEEL[2])
    # E: bell outer - flared gold plates, seams follow the faces
    y, h = STRIP["E"]
    for k in range(SIDES):
        x = k * CW
        c.panel(x, y, CW + 1, h + 1, GOLD, outline=PLUM)
        c.rivet(x + 2, y + 2, SPARK if k % 2 == 0 else GOLD[2], GOLD[0])
        c.set(x + 3, y + h - 3, GOLD[0])
        if k % 3 == 0:
            c.set(x + 4, y + 4, SPARK)
    # F: rim - saturated gold lip that rings the glow (stays gold, not olive, when the
    # back of the booster is in shade - which is how you usually see it)
    y, h = STRIP["F"]
    c.rect(0, y, W, h, GOLD[1])
    c.hline(0, W - 1, y, GOLD[2])
    for k in range(SIDES):
        c.set(k * CW + 3, y + 1, SPARK)
        c.set(k * CW, y + 1, GOLD[0])
    # G: bell inner - amber lip fading into soot toward the throat
    y, h = STRIP["G"]
    c.rect(0, y, W, h, 1)
    c.hline(0, W - 1, y, GOLD[0])
    c.dither(0, y + 1, W, 1, GOLD[0], "checker")
    c.dither(0, y + 2, W, 2, 5, "quarter")
    c.dither(0, y + 5, W, 2, PLUM, "checker", phase=1)
    c.hline(0, W - 1, y + h - 1, PLUM)
    # front cap: steel coupling plate, plum ring, four bolts, dark socket pin
    x, y, w, h = CAP
    c.rect(x, y, w, h, GOLD[0])
    c.panel(x + 2, y + 2, w - 4, h - 4, STEEL, outline=PLUM)
    c.circle(x + 9, y + 9, 5, PLUM)
    c.rect(x + 7, y + 7, 5, 5, 1)
    c.rect(x + 8, y + 8, 2, 2, 2)
    for bx, by in ((x + 4, y + 4), (x + 14, y + 4), (x + 4, y + 14), (x + 14, y + 14)):
        c.bolt(bx, by, STEEL, outline=PLUM)
    return c


def build():
    pix.reset_scene()
    canvas = paint()
    img = canvas.to_image("booster", pix.tex_path("booster"), forbid=pix.DANGER)
    m_atlas = pix.atlas_material("booster_atlas", img)
    m_glow = pix.emissive_material("booster_glow", 16)

    root = pix.empty("booster")

    mb = pix.MeshBuilder()
    names = "ABCDEFG"
    outs = {"A": "r+", "B": "x-", "C": "r+", "D": "r+", "E": "r+", "F": "x-", "G": "r-"}
    bands = []
    for n in names:
        y, h = STRIP[n]
        bands.append({"rect": (0, y, SIDES * CW, h), "out": outs[n]})
    mb.lathe(PROFILE, sides=SIDES, bands=bands, cap_front=CAP)
    # (the throat is closed by the glow cone below)
    shell = mb.to_object("shell", [m_atlas], origin=(0, 0, 0), parent=root)

    # glow: a short cone whose tip points back out of the bell, so its faces are seen
    # from behind and from the sides of the bell mouth
    gb = pix.MeshBuilder()
    import math
    ring = [(-0.372, 0.088 * math.cos(math.pi / 8 + k * math.pi / 4),
             0.088 * math.sin(math.pi / 8 + k * math.pi / 4)) for k in range(SIDES)]
    tip = (-0.430, 0.0, 0.0)
    for k in range(SIDES):
        a, b = ring[k], ring[(k + 1) % SIDES]
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
        out = (-0.5, mid[1], mid[2])
        gb.face([a, b, tip], outward=out, tex=[(0.5, 0.5)] * 3)
    glow = gb.to_object("nozzle_glow", [m_glow], origin=(-0.40, 0, 0), parent=root)

    total, lo, hi = pix.report(root)
    assert total <= 200, total
    pix.export_glb("booster")

    pix.setup_preview()
    pix.render_view(pix.preview_path("booster"), direction=(0.9, 1.0, 0.6))
    pix.render_view(pix.preview_path("booster-back"), direction=(-1.0, 0.55, 0.35))
    return total


if __name__ == "__main__":
    build()
