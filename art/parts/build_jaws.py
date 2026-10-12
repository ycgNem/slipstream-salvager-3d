"""Jaws: two gold mandibles hinged at a body's front -> public/models/jaws.glb.

Nodes:  jaws (root empty, at the mount: front of the body, on the floor)
          jaw_l   left mandible; origin at its hinge (0, 0.12, 0.16); turns about its own Z
          jaw_r   right mandible; origin at (0, -0.12, 0.16)
Each mandible reaches forward 0.34 m and curls in toward the other, ridged gold outside, steel
teeth inside. Worn on a Jaw Snapper's front, either side of your claw in the first-person view,
and on the floor as a pickup. Material: parts_atlas (art/parts/parts.png).
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # keep art/ free of __pycache__
sys.path.insert(0, os.path.join(HERE, "..", "_lib"))
sys.path.insert(0, HERE)
import pix  # noqa: E402
import parts_atlas as A  # noqa: E402

HINGE_Y, HINGE_Z = 0.12, 0.16
# the left mandible's centreline in plan (x, y) from its hinge, then each section's width and height
LINE = [(0.0, 0.0), (0.13, 0.03), (0.25, 0.01), (0.34, -0.07)]
WIDTH = [0.085, 0.075, 0.055, 0.014]
HEIGHT = [0.10, 0.09, 0.07, 0.03]


def mandible(mb, s):
    hy = s * HINGE_Y
    pts = [(x, hy + s * y) for (x, y) in LINE]
    n = len(pts)
    secs = []
    for i, (x, y) in enumerate(pts):
        a = pts[max(0, i - 1)]
        b = pts[min(n - 1, i + 1)]
        tx, ty = b[0] - a[0], b[1] - a[1]
        L = math.hypot(tx, ty)
        tx, ty = tx / L, ty / L
        nx, ny = -ty, tx           # left of the direction of travel
        w, h = WIDTH[i] / 2, HEIGHT[i] / 2
        ox, oy = x + s * nx * w, y + s * ny * w   # outer edge
        ix, iy = x - s * nx * w, y - s * ny * w   # inner edge
        secs.append(dict(
            OT=(ox, oy, HINGE_Z + h), OB=(ox, oy, HINGE_Z - h),
            IT=(ix, iy, HINGE_Z + h), IB=(ix, iy, HINGE_Z - h),
            out=(s * nx, s * ny, 0), t=(tx, ty, 0)))
    for i in range(n - 1):
        a, b = secs[i], secs[i + 1]
        mb.face([a["OT"], b["OT"], b["IT"], a["IT"]], outward=(0, 0, 1), rect=A.R_JAW)
        mb.face([a["OB"], b["OB"], b["IB"], a["IB"]], outward=(0, 0, -1), rect=A.R_DARK)
        o = tuple((p + q) / 2 for p, q in zip(a["out"], b["out"]))
        mb.face([a["OB"], b["OB"], b["OT"], a["OT"]], outward=o, rect=A.R_JAW)
        mb.face([a["IB"], b["IB"], b["IT"], a["IT"]], outward=tuple(-v for v in o), rect=A.R_TEETH)
    tip, back = secs[-1], secs[0]
    mb.face([tip["OT"], tip["IT"], tip["IB"], tip["OB"]], outward=tip["t"], rect=A.R_PLATE_SIDE)
    mb.face([back["OT"], back["IT"], back["IB"], back["OB"]], outward=tuple(-v for v in back["t"]), rect=A.R_KNUCKLE)
    # the hinge knuckle
    mb.box(-0.05, 0.03, hy - 0.045, hy + 0.045, HINGE_Z - 0.055, HINGE_Z + 0.055, {
        "+z": A.R_KNUCKLE, "-x": A.R_KNUCKLE, "+y": A.R_KNUCKLE, "-y": A.R_KNUCKLE,
    })


def build():
    pix.reset_scene()
    mat = pix.atlas_material("parts_atlas", A.atlas_image())
    root = pix.empty("jaws")
    for name, s in (("jaw_l", 1), ("jaw_r", -1)):
        mb = pix.MeshBuilder()
        mandible(mb, s)
        mb.to_object(name, [mat], origin=(0, s * HINGE_Y, HINGE_Z), parent=root)
    total, lo, hi = pix.report(root)
    assert total <= 160, total
    pix.export_glb("jaws")
    pix.setup_preview()
    pix.render_view(pix.preview_path("jaws"), direction=(1.0, 0.7, 0.8))
    return total


if __name__ == "__main__":
    build()
