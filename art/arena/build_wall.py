"""Wall: one straight, tileable wall segment -> public/models/wall.glb.

Root `wall`, one mesh `wall`: x in [-0.4, 0.4] (0.8 m, the tiling direction), y in
[-0.4, 0.4] (0.8 m thick), z in [0, 1.2]; origin at the bottom centre.
Cross-section: dark block base course (0-0.25 m, full thickness), corrugated scrap-sheet
body set back 3 cm, light riveted capping (1.05-1.2 m, full thickness). Both long faces
and the top are textured; the texture is periodic in x so copies tile seamlessly.
Material: arena_atlas (art/arena/arena.png, shared with pillar and gate).
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # keep art/ free of __pycache__
sys.path.insert(0, os.path.join(HERE, "..", "_lib"))
sys.path.insert(0, HERE)
import pix  # noqa: E402
import arena_atlas as A  # noqa: E402

PROF = [(-0.40, 0.00), (0.40, 0.00), (0.40, 0.25), (0.37, 0.25), (0.37, 1.05), (0.40, 1.05),
        (0.40, 1.20), (-0.40, 1.20), (-0.40, 1.05), (-0.37, 1.05), (-0.37, 0.25),
        (-0.40, 0.25)]


def build():
    pix.reset_scene()
    mat = pix.atlas_material("arena_atlas", A.atlas_image())
    root = pix.empty("wall")
    mb = pix.MeshBuilder()
    ledge = {"rect": A.R_LEDGE_TOP, "up": (0, 1, 0)}
    under = {"rect": A.R_CAP_UNDER, "up": (0, 1, 0)}
    sides = {
        0: None,
        1: {"rect": A.R_WALL_BASE}, 2: ledge, 3: {"rect": A.R_WALL_BODY}, 4: under,
        5: {"rect": A.R_WALL_CAP}, 6: {"rect": A.R_WALL_TOP},
        7: {"rect": A.R_WALL_CAP}, 8: under, 9: {"rect": A.R_WALL_BODY}, 10: ledge,
        11: {"rect": A.R_WALL_BASE},
    }
    mb.prism(PROF, "x", -0.4, 0.4, side=lambda i, a, b: sides[i],
             cap0={"rect": A.R_WALL_END}, cap1={"rect": A.R_WALL_END})
    wall = mb.to_object("wall", [mat], origin=(0, 0, 0), parent=root)
    total, lo, hi = pix.report(root)
    assert total <= 60, total
    assert abs(lo.x + 0.4) < 1e-6 and abs(hi.x - 0.4) < 1e-6
    assert abs(lo.y + 0.4) < 1e-6 and abs(hi.y - 0.4) < 1e-6
    assert abs(lo.z) < 1e-6 and abs(hi.z - 1.2) < 1e-6
    pix.export_glb("wall")

    # preview: three copies in a row to show the seamless tiling
    import bpy
    src = wall
    for dx in (-0.8, 0.8):
        dup = src.copy()
        dup.location = (dx, 0, 0)
        bpy.context.scene.collection.objects.link(dup)
    pix.setup_preview()
    pix.render_view(pix.preview_path("wall"), direction=(0.55, -1.0, 0.45), lens=40)
    return total


if __name__ == "__main__":
    build()
