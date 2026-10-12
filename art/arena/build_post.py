"""Post: a small pillar, two strapped bales -> public/models/post.glb.

Root `post`, one mesh `post`. Footprint exactly 0.8 x 0.8 m (16 px: the Kennel's posts, the
Plow Pit's corner posts, The Heap's), 1.36 m tall, origin at the footprint centre on the floor.
Material: arena_atlas (art/arena/arena.png, shared with the wall, pillar and gate).
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
    root = pix.empty("post")
    mb = pix.MeshBuilder()
    bales.bale(mb, 0, 0, 0.4, 0.4, 0.0, 0.7, 0.0, seed=0)
    bales.bale(mb, 0.01, -0.01, 0.34, 0.35, 0.7, 1.36, 6.0, seed=1)
    mb.to_object("post", [mat], origin=(0, 0, 0), parent=root)
    total, lo, hi = pix.report(root)
    assert total <= 120, total
    assert abs(lo.x + 0.4) < 1e-6 and abs(hi.x - 0.4) < 1e-6, (lo, hi)
    assert abs(lo.y + 0.4) < 1e-6 and abs(hi.y - 0.4) < 1e-6, (lo, hi)
    pix.export_glb("post")
    pix.setup_preview()
    pix.render_view(pix.preview_path("post"), direction=(1.0, 0.8, 0.5))
    return total


if __name__ == "__main__":
    build()
