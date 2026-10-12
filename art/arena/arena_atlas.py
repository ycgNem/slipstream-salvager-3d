"""The arena family atlas (art/arena/arena.png), shared by the pillar, wall and gate.

Not a build script: build_pillar.py / build_wall.py / build_gate.py import it, and each
repaints the identical (deterministic) atlas before exporting.

Palette: warm neutrals 1-5, olive 24-25, a little moss 34-35, plum 0 seams, cool steel
1/2/6 for the gate. Low contrast: the arena is the backdrop, the bots must pop.
"""
import pix

# ---------------------------------------------------------------- layout (x, y, w, h)
R_WALL_BODY = (0, 0, 32, 32)    # corrugated scrap sheet; tiles left-right (0.8 m)
R_WALL_BASE = (0, 32, 32, 10)   # dark block base course (0.25 m)
R_WALL_CAP = (0, 42, 32, 6)     # light capping (0.15 m)
R_LEDGE_TOP = (0, 48, 32, 1)    # top of the base course step
R_CAP_UNDER = (0, 49, 32, 1)    # underside of the capping overhang
R_WALL_TOP = (0, 50, 14, 14)
R_WALL_END = (14, 50, 9, 14)
R_BALE = (32, 0, 32, 28)        # crushed-scrap bale side, 0.8 x 0.7 m
R_BALE_TOP = (32, 28, 16, 16)
R_DOOR = (48, 28, 16, 24)       # door leaf face, 0.8 x 1.2 m
R_JAMB = (32, 44, 16, 10)       # gate post inner face tile, 0.8 x 0.5 m
R_LINTEL = (32, 54, 16, 8)      # lintel face tile, 0.5 x 0.25 m
R_RAIL = (32, 62, 16, 2)        # door rails
R_POST = (48, 52, 6, 12)        # gate post face tile, 0.2 x 0.5 m
R_DOOR_EDGE = (54, 52, 2, 12)
R_DARK = (56, 52, 2, 2)
R_LAMP_BASE = (58, 52, 6, 4)
R_STEEL_TOP = (56, 56, 8, 8)

PLUM = 0
SHEET = (1, 2, 5)        # corrugated sheet: shadow, ridge, valley tone
BLOCK = (0, 1, 24)       # base course blocks
CAPC = (5, 3, 4)         # capping: dark, mid, light
STEEL = (1, 2, 6)        # gate steel (cool neutrals)
OLIVE = (24, 25)
MOSS = (34, 35)


def paint():
    c = pix.Canvas(fill=PLUM)

    # ---- wall body: corrugated sheets, rivet rows, rust weeps, moss at the foot.
    # Everything is periodic in x with period 32 so copies tile seamlessly.
    x, y, w, h = R_WALL_BODY
    for i in range(w):
        col = (2, 2, 5, 1)[i % 4]          # ridge lit from the left, valley, shadow
        c.vline(x + i, y, y + h - 1, col)
    c.vline(x, y, y + h - 1, PLUM)        # sheet joint at the segment edge (0.8 m)
    c.vline(x + 16, y, y + h - 1, 1)      # overlap of two half sheets
    for ry in (2, 15, 29):                # rivet rows on the purlins
        c.hline(x, x + w - 1, y + ry, 1)
        for i in range(2, w, 4):
            c.set(x + i, y + ry, 4 if i % 8 == 2 else 3)
    # rust weeps below a few rivets (low contrast 3 on 2/5)
    for (i, j0, L) in ((6, 3, 5), (22, 16, 6), (11, 16, 3), (27, 3, 4)):
        for k in range(L):
            if c.get(x + i, y + j0 + k) != PLUM:
                c.set(x + i, y + j0 + k, 3)
    # dents
    for (i, j) in ((9, 8), (25, 22), (4, 24)):
        c.set(x + i, y + j, 1)
        c.set(x + i + 1, y + j, 4)
    # olive grime + moss along the bottom rows
    c.dither(x, y + h - 4, w, 4, 24, "quarter")
    c.dither(x, y + h - 2, w, 2, 35, "sparse", phase=1)
    c.hline(x, x + w - 1, y + h - 1, 24)

    # ---- base course: dark blocks in running bond, plum mortar
    x, y, w, h = R_WALL_BASE
    c.rect(x, y, w, h, 1)
    for j in range(h):
        for i in range(w):
            bx = (i + (8 if (j // 5) % 2 else 0)) % 16
            if j % 5 == 0 or bx == 0:
                c.set(x + i, y + j, PLUM)
            elif j % 5 == 1 or bx == 1:
                c.set(x + i, y + j, 5 if (i // 16 + j // 5) % 2 else 24)   # lit lip
    c.speckle(x, y, w, h, [24, 34], 14, seed=101, on={1})
    c.hline(x, x + w - 1, y + h - 1, PLUM)

    # ---- capping: lighter riveted steel channel
    x, y, w, h = R_WALL_CAP
    c.rect(x, y, w, h, CAPC[1])
    c.hline(x, x + w - 1, y, CAPC[2])
    c.hline(x, x + w - 1, y + h - 1, PLUM)
    c.hline(x, x + w - 1, y + h - 2, CAPC[0])
    for i in range(4, w, 8):
        c.rivet(x + i, y + 2, CAPC[2], CAPC[0])
    c.vline(x, y, y + h - 2, CAPC[0])     # capping joint each segment
    c.speckle(x + 1, y + 1, w - 2, h - 3, [5], 5, seed=102, on={CAPC[1]})

    c.hline(R_LEDGE_TOP[0], R_LEDGE_TOP[0] + 31, R_LEDGE_TOP[1], 5)
    for i in range(0, 32, 16):
        c.set(R_LEDGE_TOP[0] + i, R_LEDGE_TOP[1], PLUM)
    c.hline(R_CAP_UNDER[0], R_CAP_UNDER[0] + 31, R_CAP_UNDER[1], PLUM)

    # wall top: capping plate seen from above
    x, y, w, h = R_WALL_TOP
    c.rect(x, y, w, h, CAPC[1])
    c.vline(x, y, y + h - 1, CAPC[0])
    c.hline(x, x + w - 1, y, CAPC[2])
    c.hline(x, x + w - 1, y + h - 1, CAPC[0])
    c.speckle(x + 1, y + 1, w - 2, h - 2, [5, 24], 8, seed=103)
    # wall end: plain block texture
    x, y, w, h = R_WALL_END
    c.rect(x, y, w, h, 1)
    c.hline(x, x + w - 1, y, 4)
    c.rect(x, y + 1, w, 2, 3)
    c.rect(x, y + h - 4, w, 4, 24)
    c.outline(x, y, w, h, PLUM)

    # ---- crushed-car bale: compressed layers, embedded junk, steel straps
    x, y, w, h = R_BALE
    # squashed sheet-metal layers in close mid tones (2 / 5), thin accent layers of
    # olive and dusty rose, dark crush seams; every row is broken up so it reads as
    # crumpled metal rather than stripes
    layers = [(3, 5), (2, 2), (1, 25), (3, 5), (2, 2), (3, 5), (1, 3), (2, 2), (3, 5),
              (2, 2), (1, 24), (3, 5)]
    yy = y + 1
    for (t, col) in layers:
        for j in range(t):
            if yy < y + h - 1:
                c.hline(x, x + w - 1, yy, col)
                yy += 1
        if yy < y + h - 1:
            c.hline(x, x + w - 1, yy, 1)      # crush seam between layers
            yy += 1
    c.scuffs(x, y + 1, w, h - 2, [1], 26, seed=104, length=(2, 5))       # folds
    c.scuffs(x, y + 1, w, h - 2, [2, 5], 18, seed=107, length=(2, 4), on={1})
    c.speckle(x, y + 1, w, h - 2, [3], 4, seed=105, on={2})              # glints
    # embedded junk: a crushed tyre arc and a hubcap
    for i in range(-4, 5):
        j = int(round(0.22 * i * i))
        c.set(x + 8 + i, y + 7 + j, PLUM)
        c.set(x + 8 + i, y + 8 + j, 1)
    c.circle(x + 25, y + 19, 2, 1, fill=2)
    c.set(x + 24, y + 18, 3)
    c.hline(x + 4, x + 8, y + 21, 6)                                     # door handle
    c.hline(x + 4, x + 8, y + 22, 1)
    # one steel strap per tile (two per bale side), low contrast
    sx = x + 16
    c.vline(sx - 1, y, y + h - 1, 1)
    c.vline(sx, y, y + h - 1, 6)
    c.vline(sx + 1, y, y + h - 1, 2)
    c.vline(sx + 2, y, y + h - 1, 1)
    for j in (5, 18):
        c.set(sx, y + j, 4)                   # strap clips
        c.set(sx + 1, y + j + 1, 1)
    # bale edges: lit top lip, dark bottom edge (no side edges: the two mirrored tiles
    # on each bale side join without a seam)
    c.hline(x, x + w - 1, y + h - 1, PLUM)
    c.hline(x, x + w - 1, y, 3)
    # bale top (seen only from above)
    x, y, w, h = R_BALE_TOP
    c.rect(x, y, w, h, 5)
    for j in range(1, h, 3):
        c.hline(x, x + w - 1, y + j, 2)
    c.scuffs(x, y, w, h, [1], 10, seed=108, length=(2, 3))
    c.vline(x + 8, y, y + h - 1, 6)
    c.outline(x, y, w, h, PLUM)

    # ---- gate door: riveted steel slab with an X brace (u=0 left, v=0 top)
    x, y, w, h = R_DOOR
    c.panel(x, y, w, h, (1, 5, 3), outline=PLUM)
    for k in range(h - 4):                    # X brace
        i0 = 2 + int(round(k * (w - 5) / (h - 5)))
        i1 = w - 3 - int(round(k * (w - 5) / (h - 5)))
        for i in (i0, i1):
            c.set(x + i, y + 2 + k, 2)
            c.set(x + i + 1, y + 2 + k, 1)
    c.hline(x + 1, x + w - 2, y + 12, PLUM)   # mid rail
    c.hline(x + 1, x + w - 2, y + 13, 2)
    for i in range(2, w - 1, 4):
        c.set(x + i, y + 2, 4)
        c.set(x + i, y + h - 3, 4)
        c.set(x + i, y + 13, 4)
    c.rect(x + 2, y + h - 5, w - 4, 2, 24)    # grime kicked up at the bottom
    c.speckle(x + 2, y + 3, w - 4, h - 8, [1], 6, seed=106, on={5})

    # ---- gate steel: posts, jambs, lintel, rails (cool neutrals 1, 2, 6)
    x, y, w, h = R_POST
    c.rect(x, y, w, h, STEEL[1])
    c.vline(x, y, y + h - 1, PLUM)
    c.vline(x + 1, y, y + h - 1, STEEL[2])
    c.vline(x + w - 1, y, y + h - 1, STEEL[0])
    c.hline(x, x + w - 1, y, PLUM)
    for j in (3, 9):
        c.bolt(x + 2, y + j, (1, 2, 6))
    x, y, w, h = R_JAMB
    c.rect(x, y, w, h, STEEL[0])
    c.hline(x, x + w - 1, y, PLUM)
    c.hline(x, x + w - 1, y + 1, STEEL[1])
    for i in range(1, w, 5):
        c.bolt(x + i, y + 4, (PLUM, 2, 6))
    c.dither(x, y + h - 3, w, 3, 24, "quarter")
    x, y, w, h = R_LINTEL
    c.panel(x, y, w, h, (1, 2, 6), outline=PLUM)
    for i in (2, 7, 12):
        c.bolt(x + i, y + 3, (PLUM, 1, 6))
    x, y, w, h = R_RAIL
    c.hline(x, x + w - 1, y, 6)
    c.hline(x, x + w - 1, y + 1, 1)
    x, y, w, h = R_DOOR_EDGE
    c.rect(x, y, w, h, 1)
    c.vline(x, y, y + h - 1, 2)
    c.rect(*R_DARK, PLUM)
    x, y, w, h = R_LAMP_BASE
    c.rect(x, y, w, h, 1)
    c.hline(x, x + w - 1, y, 6)
    c.hline(x, x + w - 1, y + h - 1, PLUM)
    x, y, w, h = R_STEEL_TOP
    c.rect(x, y, w, h, 1)
    c.outline(x, y, w, h, PLUM)
    c.set(x + 2, y + 2, 2)
    c.set(x + 5, y + 5, 2)
    return c


ARENA_FORBID = pix.DANGER | pix.SALVAGE


def atlas_image():
    canvas = paint()
    return canvas.to_image("arena", pix.tex_path("arena"), forbid=ARENA_FORBID)
