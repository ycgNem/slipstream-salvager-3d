"""Floor: one 1.6 x 1.6 m tile -> public/models/floor.glb.

Root `floor`, one mesh `floor`: a single quad (2 tris) at z = 0, origin at its centre,
UVs covering exactly 0..1 of its own 64x64 texture art/arena/floor.png (40 texels/m),
which tiles seamlessly in both directions (the renderer repeats it over the 30 x 16 m Ring).
Dim, low-contrast packed dirt and oil-stained steel plates: the darkest, calmest thing in
the arena. Palette: 0, 1, 2, 5 and olive 24 only.
Material: floor_tile.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # keep art/ free of __pycache__
sys.path.insert(0, os.path.join(HERE, "..", "_lib"))
import pix  # noqa: E402

DIRT, BASE, SEAM, LIP, BOLT = 24, 1, 0, 5, 2


def paint():
    """Mostly dark steel deck (1) half-buried in packed olive dirt (24), joined by a few
    long plate seams with bolt rows, oil pools and faint skid scratches. All drawing
    wraps around the edges, so the tile repeats without a visible border."""
    c = pix.Canvas(fill=BASE, wrap=True)
    # packed dirt drifts from tileable value noise: solid dirt where the noise is high,
    # a checker-dithered fringe around it, loose dust specks further out
    n = c.noise(cells=(3, 6, 12), seed=301, weights=(0.5, 0.33, 0.17))
    for y in range(64):
        for x in range(64):
            v = n[y][x]
            if v > 0.64:
                c.set(x, y, DIRT)
            elif v > 0.58 and (x + y) % 2 == 0:
                c.set(x, y, DIRT)
            elif v > 0.52 and x % 2 == 0 and y % 2 == 0 and (x // 2 + y // 2) % 2 == 0:
                c.set(x, y, DIRT)
    c.speckle(0, 0, 64, 64, [BASE], 70, seed=305, on={DIRT})      # grit in the dirt
    # plate seams: two long horizontal joints and staggered vertical joints (a
    # running-bond deck of 0.8 x 0.8 m plates), bolts along the joints
    for sy in (0, 32):
        c.hline(0, 63, sy, SEAM)
        for bx in range(4, 64, 8):
            c.set(bx, sy + 2, BOLT)
            c.set(bx + 1, sy + 3, SEAM)
    for (sx, y0) in ((20, 1), (52, 33)):
        c.vline(sx, y0, y0 + 30, SEAM)
        for by in range(y0 + 5, y0 + 30, 8):
            c.set(sx + 2, by, BOLT)
            c.set(sx + 3, by + 1, SEAM)
    # oil pools: darkest plum, irregular (second noise field), one wraps the tile edge
    m = c.noise(cells=(4, 8), seed=307)
    for y in range(64):
        for x in range(64):
            if m[y][x] > 0.74:
                c.set(x, y, SEAM)
            elif m[y][x] > 0.71 and (x + y) % 2 == 0:
                c.set(x, y, SEAM)
    # faint skid scratches
    for (x0, y0, L) in ((6, 12, 7), (34, 26, 9), (44, 9, 5), (9, 40, 6), (55, 52, 6)):
        for k in range(L):
            if c.get(x0 + k, y0 + k // 3) in (BASE, DIRT):
                c.set(x0 + k, y0 + k // 3, LIP)
    return c


def build():
    pix.reset_scene()
    canvas = paint()
    img = canvas.to_image("floor", pix.tex_path("arena", "floor"),
                          forbid=pix.DANGER | pix.SALVAGE)
    used = set(canvas.used())
    assert used <= {0, 1, 2, 5, 24}, used
    mat = pix.atlas_material("floor_tile", img)
    root = pix.empty("floor")
    mb = pix.MeshBuilder()
    s = 0.8
    # UV (0,0)..(1,1): texel coords (0,64)..(64,0) -> exact full texture, no inset
    mb.face([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], outward=(0, 0, 1),
            tex=[(64, 64), (64, 0), (0, 0), (0, 64)])
    tile = mb.to_object("floor", [mat], origin=(0, 0, 0), parent=root)
    total, lo, hi = pix.report(root)
    assert total == 2, total
    pix.export_glb("floor")

    # preview: 4 x 3 tiles to show the seamless repeat
    import bpy
    src = tile
    for i in range(-2, 2):
        for j in range(-1, 2):
            if i == 0 and j == 0:
                continue
            d = src.copy()
            d.location = (i * 1.6, j * 1.6, 0)
            bpy.context.scene.collection.objects.link(d)
    pix.setup_preview()
    pix.render_view(pix.preview_path("floor"), cam_loc=(2.4, 0.0, 3.4), look_at=(-0.8, 0.0, 0.0),
                    lens=30, size=(640, 360))
    # eye level (0.55 m), as the player sees it
    pix.render_view(pix.preview_path("floor-eye"), cam_loc=(2.6, 0.0, 0.55),
                    look_at=(-3.0, 0.0, 0.0), fov_deg=70, fit="VERTICAL", size=(640, 360))
    return total


if __name__ == "__main__":
    build()
