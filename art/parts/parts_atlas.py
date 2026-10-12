"""The parts family atlas (art/parts/parts.png), shared by the Grip Treads, the Plow and the Jaws.

Not a build script: build_treads.py / build_plow.py / build_jaws.py import it, and each repaints
the identical (deterministic) atlas before exporting.

Salvage reads gold (STYLE.md colour language): every part is gold plate over dark steel, so a
part on an enemy, on the floor, on your cable or bolted on you says "salvage" at a glance, like
the booster. Gold 17/18/23 with 28 glints, steel 6/7/8, dark 0/1/2. No danger red, no teal.
"""
import pix

# ---------------------------------------------------------------- layout (x, y, w, h)
R_PLATE = (0, 0, 32, 16)        # gold plate with bolts: the plow's face, the tread guards
R_PLATE_SIDE = (32, 0, 16, 8)   # gold edge strip (thin faces, caps)
R_EDGE = (48, 0, 16, 8)         # steel cutting edge, nicked
R_BELT = (0, 16, 32, 8)         # tread belt with cleats (repeats)
R_TRACK = (0, 24, 32, 14)       # a track's side: road wheels under a gold guard band
R_TRACK_END = (32, 8, 8, 14)    # the belt round a track's end
R_JAW = (32, 24, 32, 12)        # a mandible's outer face: ridged gold, darker to the tip
R_TEETH = (32, 36, 32, 8)       # its inner face: steel teeth
R_BACK = (0, 40, 32, 12)        # the plow's back: dark bracing
R_KNUCKLE = (40, 8, 8, 8)       # a jaw's hinge knuckle
R_STRUT = (48, 8, 8, 14)        # bracing strut
R_DARK = (60, 60, 4, 4)

PLUM = 0
GOLD = (17, 18, 23)   # dark, mid, light
SPARK = 28
STEEL = (6, 7, 8)
DARK = (0, 1, 2)


def paint():
    c = pix.Canvas(fill=PLUM)

    # ---- gold plate: two riveted panels with a seam, glints on the light edges
    x, y, w, h = R_PLATE
    c.panel(x, y, 16, h, GOLD, outline=PLUM)
    c.panel(x + 16, y, 16, h, GOLD, outline=PLUM)
    for px in (x, x + 16):
        for (bx, by) in ((2, 2), (12, 2), (2, 12), (12, 12)):
            c.rivet(px + bx, y + by, SPARK, GOLD[0])
        c.set(px + 5, y + 4, SPARK)
        c.set(px + 6, y + 3, SPARK)
        c.scuffs(px + 2, y + 5, 12, 6, [GOLD[0]], 3, seed=px + 7, on={GOLD[1]})
    # a stamped chevron in the middle of each panel
    for px in (x + 6, x + 22):
        for i in range(3):
            c.set(px + i, y + 8 - i, GOLD[0])
            c.set(px + 4 - i, y + 8 - i, GOLD[0])

    # ---- gold edge strip
    x, y, w, h = R_PLATE_SIDE
    c.rect(x, y, w, h, GOLD[1])
    c.hline(x, x + w - 1, y, GOLD[2])
    c.hline(x, x + w - 1, y + h - 1, GOLD[0])
    for i in range(0, w, 4):
        c.set(x + i + 1, y + 3, SPARK if i % 8 == 0 else GOLD[0])

    # ---- steel cutting edge: light steel, a few dark nicks
    x, y, w, h = R_EDGE
    c.rect(x, y, w, h, STEEL[1])
    c.hline(x, x + w - 1, y, STEEL[2])
    c.hline(x, x + w - 1, y + h - 1, STEEL[0])
    for i in (3, 7, 12):
        c.set(x + i, y + h - 2, PLUM)
        c.set(x + i, y + h - 3, STEEL[0])

    # ---- tread belt: cleats every 4 texels, steel on dark
    x, y, w, h = R_BELT
    c.rect(x, y, w, h, DARK[1])
    for i in range(0, w, 4):
        c.rect(x + i, y + 1, 2, h - 2, STEEL[0])
        c.vline(x + i, y + 1, y + h - 2, STEEL[1])
    c.hline(x, x + w - 1, y, PLUM)
    c.hline(x, x + w - 1, y + h - 1, PLUM)

    # ---- track side: a gold guard band on top, road wheels below
    x, y, w, h = R_TRACK
    c.rect(x, y, w, h, DARK[1])
    c.panel(x, y, w, 4, GOLD, outline=PLUM)
    for i in range(2, w - 1, 6):
        c.set(x + i, y + 1, SPARK if (i // 6) % 2 else GOLD[2])
    for k in range(4):
        cx = x + 4 + k * 8
        c.circle(cx, y + 9, 3, STEEL[0], fill=STEEL[1])
        c.set(cx - 1, y + 8, STEEL[2])
        c.set(cx, y + 9, DARK[0])
    c.hline(x, x + w - 1, y + h - 1, PLUM)

    # ---- track end: belt wrapping round
    x, y, w, h = R_TRACK_END
    c.rect(x, y, w, h, DARK[1])
    for j in range(0, h, 3):
        c.hline(x + 1, x + w - 2, y + j, STEEL[0])
    c.outline(x, y, w, h, PLUM)

    # ---- mandible outer face: gold ridges, darker toward the tip (right end)
    x, y, w, h = R_JAW
    c.rect(x, y, w, h, GOLD[1])
    c.hline(x, x + w - 1, y, GOLD[2])
    c.hline(x, x + w - 1, y + h - 1, GOLD[0])
    for i in range(3, w, 6):
        c.vline(x + i, y + 1, y + h - 2, GOLD[0])
        c.vline(x + i - 1, y + 1, y + h - 2, GOLD[2])
    c.dither(x + w - 8, y + 1, 8, h - 2, GOLD[0], "checker")
    c.set(x + 5, y + 3, SPARK)
    c.set(x + 6, y + 2, SPARK)
    c.outline(x, y, w, h, PLUM)

    # ---- inner face: steel teeth on dark
    x, y, w, h = R_TEETH
    c.rect(x, y, w, h, DARK[0])
    for i in range(0, w, 4):
        c.set(x + i + 1, y + 1, STEEL[2])
        c.rect(x + i, y + 2, 3, 3, STEEL[1])
        c.set(x + i + 1, y + 5, STEEL[0])
    c.hline(x, x + w - 1, y + h - 1, GOLD[0])

    # ---- plow back: dark steel with two gold braces
    x, y, w, h = R_BACK
    c.panel(x, y, w, h, DARK, outline=PLUM)
    for bx in (x + 7, x + 23):
        c.rect(bx, y + 1, 2, h - 2, GOLD[0])
        c.vline(bx, y + 1, y + h - 2, GOLD[1])
    for (bx, by) in ((x + 3, y + 3), (x + 28, y + 3), (x + 3, y + 8), (x + 28, y + 8)):
        c.bolt(bx, by, STEEL, outline=PLUM)

    # ---- hinge knuckle
    x, y, w, h = R_KNUCKLE
    c.panel(x, y, w, h, GOLD, outline=PLUM)
    c.bolt(x + 3, y + 3, STEEL, outline=PLUM)

    # ---- strut
    x, y, w, h = R_STRUT
    c.panel(x, y, w, h, STEEL, outline=PLUM)
    c.vline(x + 4, y + 1, y + h - 2, STEEL[0])

    x, y, w, h = R_DARK
    c.rect(x, y, w, h, DARK[0])
    return c


def atlas_image():
    return paint().to_image("parts", pix.tex_path("parts"), forbid=pix.DANGER)
