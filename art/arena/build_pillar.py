"""Pillar: a stack of three strapped crushed-car bales -> public/models/pillar.glb.

Root `pillar`, one mesh `pillar`. Footprint exactly 1.6 x 1.6 m (the bottom bale is the
collision square), height exactly 2.0 m, origin at the footprint centre on the floor.
The two upper bales sit slightly offset and twisted but stay inside the footprint.
Material: arena_atlas (art/arena/arena.png, shared with wall and gate).
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # keep art/ free of __pycache__
sys.path.insert(0, os.path.join(HERE, "..", "_lib"))
sys.path.insert(0, HERE)
import pix  # noqa: E402
import arena_atlas as A  # noqa: E402

# (centre x, centre y, half x, half y, z0, z1, twist deg)
BALES = [
    (0.000, 0.000, 0.800, 0.800, 0.00, 0.70, 0.0),
    (0.010, 0.020, 0.750, 0.740, 0.70, 1.36, -3.0),
    (-0.020, 0.000, 0.680, 0.700, 1.36, 2.00, 5.0),
]


def build():
    pix.reset_scene()
    mat = pix.atlas_material("arena_atlas", A.atlas_image())
    root = pix.empty("pillar")
    mb = pix.MeshBuilder()
    for b, (cx, cy, hx, hy, z0, z1, tw) in enumerate(BALES):
        t = math.radians(tw)
        ct, st = math.cos(t), math.sin(t)

        def P(lx, ly, z):
            return (cx + lx * ct - ly * st, cy + lx * st + ly * ct, z)
        corners = [(hx, -hy), (hx, hy), (-hx, hy), (-hx, -hy)]   # CCW from +x/-y
        for k in range(4):
            (ax, ay), (bx, by) = corners[k], corners[(k + 1) % 4]
            mx, my = (ax + bx) / 2, (ay + by) / 2
            out = (mx * ct - my * st, mx * st + my * ct, 0.0)
            # each side is split in two 0.8 m-ish halves that both map the bale tile;
            # alternate mirroring per half and per bale so the stack doesn't look stamped
            for h in range(2):
                f0, f1 = h / 2.0, (h + 1) / 2.0
                p0 = (ax + (bx - ax) * f0, ay + (by - ay) * f0)
                p1 = (ax + (bx - ax) * f1, ay + (by - ay) * f1)
                pts = [P(p0[0], p0[1], z0), P(p1[0], p1[1], z0), P(p1[0], p1[1], z1),
                       P(p0[0], p0[1], z1)]
                mb.face(pts, outward=out, rect=A.R_BALE, flip_u=bool((h + k + b) % 2))
        top = [P(x, y, z1) for (x, y) in corners]
        mb.face(top, outward=(0, 0, 1), rect=A.R_BALE_TOP)
    mb.to_object("pillar", [mat], origin=(0, 0, 0), parent=root)
    total, lo, hi = pix.report(root)
    assert total <= 150, total
    assert abs(lo.x + 0.8) < 1e-6 and abs(hi.x - 0.8) < 1e-6, (lo, hi)
    assert abs(lo.y + 0.8) < 1e-6 and abs(hi.y - 0.8) < 1e-6, (lo, hi)
    assert abs(lo.z) < 1e-6 and abs(hi.z - 2.0) < 1e-6, (lo, hi)
    pix.export_glb("pillar")
    pix.setup_preview()
    pix.render_view(pix.preview_path("pillar"), direction=(1.0, 0.8, 0.5))
    return total


if __name__ == "__main__":
    build()
