"""Tower: the Plow Pit's big pillar, four layers of bales -> public/models/tower.glb.

Root `tower`, one mesh `tower`. Footprint exactly 2.4 x 2.4 m (48 px), 2.7 m tall, origin at
the footprint centre on the floor. Each layer is a little smaller and turned, so it reads as a
heap of scrap, not a box. Material: arena_atlas.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # keep art/ free of __pycache__
sys.path.insert(0, os.path.join(HERE, "..", "_lib"))
sys.path.insert(0, HERE)
import pix  # noqa: E402
import arena_atlas as A  # noqa: E402
import bales  # noqa: E402

# (centre x, centre y, half x, half y, z0, z1, twist deg)
LAYERS = [
    (0.00, 0.00, 1.20, 1.20, 0.00, 0.70, 0.0),
    (0.02, -0.02, 1.08, 1.06, 0.70, 1.38, -3.0),
    (-0.04, 0.03, 0.98, 1.00, 1.38, 2.04, 4.0),
    (0.06, 0.00, 0.80, 0.78, 2.04, 2.70, -6.0),
]


def build():
    pix.reset_scene()
    mat = pix.atlas_material("arena_atlas", A.atlas_image())
    root = pix.empty("tower")
    mb = pix.MeshBuilder()
    for i, (cx, cy, hx, hy, z0, z1, tw) in enumerate(LAYERS):
        bales.bale(mb, cx, cy, hx, hy, z0, z1, tw, seed=i)
    mb.to_object("tower", [mat], origin=(0, 0, 0), parent=root)
    total, lo, hi = pix.report(root)
    assert total <= 200, total
    assert abs(lo.x + 1.2) < 1e-6 and abs(hi.x - 1.2) < 1e-6, (lo, hi)
    pix.export_glb("tower")
    pix.setup_preview()
    pix.render_view(pix.preview_path("tower"), direction=(1.0, 0.8, 0.5))
    return total


if __name__ == "__main__":
    build()
