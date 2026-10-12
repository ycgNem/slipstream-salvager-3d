"""Block: one of Jaw Yard's corner heaps, bales stacked over a 5.6 x 3.2 m footprint ->
public/models/block.glb.

Root `block`, one mesh `block`. Footprint exactly 5.6 x 3.2 m (112 x 64 px), long side along X;
two full layers and a broken third, up to 2.0 m: tall enough to hide what's behind it (the
Jaw Snappers lurk in the corners), low enough at its broken end to see a Rammer over.
Material: arena_atlas.
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


def build():
    pix.reset_scene()
    mat = pix.atlas_material("arena_atlas", A.atlas_image())
    root = pix.empty("block")
    mb = pix.MeshBuilder()
    bales.bale(mb, 0, 0, 2.8, 1.6, 0.0, 0.7, 0.0, seed=0)
    bales.bale(mb, -0.05, 0.02, 2.7, 1.5, 0.7, 1.36, 1.0, seed=1)
    # the broken top layer: three bales of different sizes
    bales.bale(mb, -1.6, 0.3, 0.8, 0.8, 1.36, 2.0, -5.0, seed=2)
    bales.bale(mb, 0.1, -0.4, 0.8, 0.7, 1.36, 2.0, 4.0, seed=3)
    bales.bale(mb, 1.7, 0.5, 0.6, 0.6, 1.36, 1.86, 9.0, seed=4)
    mb.to_object("block", [mat], origin=(0, 0, 0), parent=root)
    total, lo, hi = pix.report(root)
    assert total <= 300, total
    assert abs(lo.x + 2.8) < 1e-6 and abs(hi.x - 2.8) < 1e-6, (lo, hi)
    assert abs(lo.y + 1.6) < 1e-6 and abs(hi.y - 1.6) < 1e-6, (lo, hi)
    pix.export_glb("block")
    pix.setup_preview()
    pix.render_view(pix.preview_path("block"), direction=(1.0, 0.9, 0.6))
    return total


if __name__ == "__main__":
    build()
