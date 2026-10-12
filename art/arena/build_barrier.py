"""Barrier: a low jersey-barrier segment for Long Lanes' walls -> public/models/barrier.glb.

Root `barrier`, one mesh `barrier`. 0.8 m along X (it tiles along X like the wall), 0.8 m deep
(the 16 px wall's collision), 0.5 m tall: below the 0.68 m eye, so from one lane you see the
next lane, and the Rammers in it, over the wall. Origin at the centre of the footprint on the
floor. Material: arena_atlas (the wall's block base and capping).
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # keep art/ free of __pycache__
sys.path.insert(0, os.path.join(HERE, "..", "_lib"))
sys.path.insert(0, HERE)
import pix  # noqa: E402
import arena_atlas as A  # noqa: E402

# cross-section (y, z), extruded along X
PROF = [(-0.4, 0.0), (0.4, 0.0), (0.4, 0.12), (0.24, 0.26), (0.2, 0.5), (-0.2, 0.5), (-0.24, 0.26), (-0.4, 0.12)]


def build():
    pix.reset_scene()
    mat = pix.atlas_material("arena_atlas", A.atlas_image())
    root = pix.empty("barrier")
    mb = pix.MeshBuilder()

    def side(i, a, b):
        return [None, A.R_WALL_BASE, A.R_WALL_BASE, A.R_WALL_CAP, A.R_WALL_TOP, A.R_WALL_CAP, A.R_WALL_BASE, A.R_WALL_BASE][i]
    mb.prism(PROF, "x", -0.4, 0.4, side=side, cap0=A.R_WALL_END, cap1=A.R_WALL_END)
    mb.to_object("barrier", [mat], origin=(0, 0, 0), parent=root)
    total, lo, hi = pix.report(root)
    assert total <= 60, total
    assert abs(hi.z - 0.5) < 1e-6, (lo, hi)
    pix.export_glb("barrier")
    pix.setup_preview()
    pix.render_view(pix.preview_path("barrier"), direction=(0.6, 1.0, 0.7))
    return total


if __name__ == "__main__":
    build()
