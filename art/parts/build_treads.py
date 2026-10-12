"""Grip Treads: two gold-guarded track units, one either side of a body -> public/models/treads.glb.

Root `treads`, one mesh `treads` (both units). Origin at the centre of the body's footprint on
the floor; the units run along X (0.84 m long), their centres at y = +-0.30, 0.13 m wide, 0.27 m
tall with the guard. The same model sits on a Snapper's sides, on your own sides (the mirror and
the first-person view see its guards) and lies on the floor as a pickup.
Material: parts_atlas (art/parts/parts.png, shared with the plow and the jaws).
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # keep art/ free of __pycache__
sys.path.insert(0, os.path.join(HERE, "..", "_lib"))
sys.path.insert(0, HERE)
import pix  # noqa: E402
import parts_atlas as A  # noqa: E402

# a track's side profile (x, z), front (+X) first, and its inner and outer y
PROF = [(-0.36, 0.0), (0.36, 0.0), (0.42, 0.10), (0.37, 0.22), (-0.37, 0.22), (-0.42, 0.10)]
Y_IN, Y_OUT = 0.235, 0.365
GUARD_Z = (0.22, 0.27)


def build():
    pix.reset_scene()
    mat = pix.atlas_material("parts_atlas", A.atlas_image())
    root = pix.empty("treads")
    mb = pix.MeshBuilder()
    for s in (1, -1):
        y0, y1 = (Y_IN, Y_OUT) if s > 0 else (-Y_OUT, -Y_IN)

        def side(i, a, b):
            # the belt round the profile: ends on the sloped edges, cleats underneath
            if i == 3:
                return None  # hidden under the guard
            return A.R_TRACK_END if i in (1, 2, 4, 5) else A.R_BELT
        cap_out = {"rect": A.R_TRACK}
        cap_in = {"rect": A.R_TRACK, "flip_u": True}
        mb.prism(PROF, "y", y0, y1, side=side, cap0=cap_in if s > 0 else cap_out, cap1=cap_out if s > 0 else cap_in)
        # the gold guard over the top, a little wider than the track
        g0, g1 = (y0 - 0.012, y1 + 0.012)
        mb.box(-0.40, 0.40, g0, g1, GUARD_Z[0], GUARD_Z[1], {
            "+z": A.R_PLATE, "+x": A.R_PLATE_SIDE, "-x": A.R_PLATE_SIDE,
            "+y": A.R_PLATE_SIDE, "-y": A.R_PLATE_SIDE,
        })
        # a gold skirt down the outer side, so the part reads gold from beside it too
        yo = g1 + 0.004 if s > 0 else g0 - 0.004
        pts = [(-0.38, yo, 0.13), (0.38, yo, 0.13), (0.38, yo, GUARD_Z[0]), (-0.38, yo, GUARD_Z[0])]
        mb.face(pts, outward=(0, s, 0), rect=(0, 0, 32, 6))
    mb.to_object("treads", [mat], origin=(0, 0, 0), parent=root)
    total, lo, hi = pix.report(root)
    assert total <= 200, total
    pix.export_glb("treads")
    pix.setup_preview()
    pix.render_view(pix.preview_path("treads"), direction=(1.0, 0.9, 0.6))
    return total


if __name__ == "__main__":
    build()
