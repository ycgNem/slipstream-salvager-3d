"""Plow: a gold moldboard blade for a body's front -> public/models/plow.glb.

Root `plow`, one mesh `blade`. Origin at the mount: the middle of the blade's back edge on the
floor; the blade reaches forward (+X) to x = 0.27, 0.96 m wide (y +-0.48), 0.42 m tall, braced
back to the mount by two struts. Worn on a Plow Rammer's front, on your own front (the first-
person view sees it across the bottom of the frame) and lies on the floor as a pickup.
Material: parts_atlas (art/parts/parts.png).
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # keep art/ free of __pycache__
sys.path.insert(0, os.path.join(HERE, "..", "_lib"))
sys.path.insert(0, HERE)
import pix  # noqa: E402
import parts_atlas as A  # noqa: E402

# the moldboard's side profile (x, z): cutting edge low and forward, curling back at the top
PROF = [(0.0, 0.0), (0.22, 0.0), (0.27, 0.06), (0.22, 0.24), (0.12, 0.40), (0.0, 0.42)]
HALF = 0.48


def build():
    pix.reset_scene()
    mat = pix.atlas_material("parts_atlas", A.atlas_image())
    root = pix.empty("plow")
    mb = pix.MeshBuilder()

    def side(i, a, b):
        return [None, A.R_EDGE, A.R_PLATE, A.R_PLATE, A.R_PLATE_SIDE, A.R_BACK][i]
    # two halves, so the plate texture keeps square-ish texels across the blade
    mb.prism(PROF, "y", -HALF, 0.0, side=side, cap0=A.R_PLATE_SIDE)
    mb.prism(PROF, "y", 0.0, HALF, side=side, cap1=A.R_PLATE_SIDE)
    # two struts from the back of the blade to the mount
    for sy in (-0.2, 0.2):
        mb.box(-0.08, 0.0, sy - 0.035, sy + 0.035, 0.08, 0.30, {
            "-x": A.R_STRUT, "+y": A.R_STRUT, "-y": A.R_STRUT, "+z": A.R_DARK,
        })
    mb.to_object("blade", [mat], origin=(0, 0, 0), parent=root)
    total, lo, hi = pix.report(root)
    assert total <= 120, total
    pix.export_glb("plow")
    pix.setup_preview()
    pix.render_view(pix.preview_path("plow"), direction=(1.0, 0.8, 0.5))
    pix.render_view(pix.preview_path("plow-back"), direction=(-1.0, 0.6, 0.5))
    return total


if __name__ == "__main__":
    build()
