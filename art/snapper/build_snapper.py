"""Snapper: a small, low, fast tread-bot with a snout -> public/models/snapper.glb.

Nodes:  snapper (root empty)
          body         low wedge hull + snout + bare axle stubs + a tail fin; built WITHOUT
                       its treads (they're the Grip Treads part, treads.glb, so a stripped
                       Snapper limps on its bare axles, as in 2D)
          eyes         two slanted slits on the snout, material `snapper_eyes`
          mount_front  empty at the front of the snout on the floor (0.40, 0, 0): the Jaws
Materials: snapper_atlas (art/snapper/snapper.png), snapper_eyes (emissive #e83b3b)

The Snapper's own colours (the 2D sheet's): lavender and purple 50-52 with blue steel 44-46 and
plum/ink; no gold (that's its treads, the salvage) and no red outside the eyes. Its radius is
8 px = 0.4 m, the Scrapper's size; the treads fit outside its hull at y = +-0.30.
"""
import os
import sys

sys.dont_write_bytecode = True  # keep art/ free of __pycache__
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "_lib"))
import pix  # noqa: E402

# ---------------------------------------------------------------- atlas layout (x, y, w, h)
R_TOP = (0, 0, 24, 16)        # deck plates
R_SIDE = (0, 16, 24, 12)      # hull side (the profile cap)
R_BACK = (24, 0, 12, 12)      # back plate with exhaust grille
R_FRONT = (24, 12, 12, 8)     # front slopes
R_SNOUT_TOP = (36, 0, 12, 12)
R_SNOUT_SIDE = (36, 12, 12, 8)
R_MOUTH = (48, 0, 12, 10)     # grille teeth
R_AXLE = (48, 10, 8, 8)
R_FIN = (56, 10, 8, 10)
R_UNDER = (60, 0, 4, 4)
R_STRIPE = (0, 28, 24, 4)     # a blue steel rub strip

PLUM = 0
INK = 49
HULL = (50, 51, 52)      # dark, mid, light (lavender)
STEEL = (44, 45, 46)     # blue steel
DARK = (0, 1, 2)

# hull side profile (x, z), extruded along y +-HULL_Y
HULL_PROF = [(-0.34, 0.08), (0.18, 0.08), (0.24, 0.16), (0.20, 0.30), (-0.12, 0.36), (-0.34, 0.30)]
HULL_Y = 0.20
SNOUT_PROF = [(0.18, 0.09), (0.37, 0.09), (0.42, 0.15), (0.37, 0.24), (0.18, 0.27)]
SNOUT_Y = 0.12


def paint():
    c = pix.Canvas(fill=PLUM)
    # deck: two lavender plates, seam, rivets, a vent
    x, y, w, h = R_TOP
    c.panel(x, y, 12, h, HULL, outline=INK)
    c.panel(x + 12, y, 12, h, HULL, outline=INK)
    for px in (x, x + 12):
        c.rivet(px + 2, y + 2, HULL[2], HULL[0])
        c.rivet(px + 9, y + 2, HULL[2], HULL[0])
        c.rivet(px + 2, y + 12, HULL[2], HULL[0])
        c.rivet(px + 9, y + 12, HULL[2], HULL[0])
    for j in range(5, 11, 2):
        c.hline(x + 15, x + 20, y + j, INK)
    c.scuffs(x + 2, y + 3, 20, 10, [HULL[0], STEEL[1]], 8, seed=5, on={HULL[1]})
    # side: lavender panel, a blue rub strip low, vents
    x, y, w, h = R_SIDE
    c.panel(x, y, w, h, HULL, outline=INK)
    c.rect(x + 1, y + h - 4, w - 2, 2, STEEL[1])
    c.hline(x + 1, x + w - 2, y + h - 4, STEEL[2])
    for i in range(4, 12, 2):
        c.vline(x + i, y + 3, y + 6, INK)
    c.bolt(x + 16, y + 3, STEEL, outline=INK)
    c.bolt(x + 20, y + 3, STEEL, outline=INK)
    c.scuffs(x + 2, y + 2, w - 4, h - 6, [HULL[0]], 4, seed=9, on={HULL[1]})
    # back: purple plate, a dark exhaust grille
    x, y, w, h = R_BACK
    c.panel(x, y, w, h, HULL, outline=INK)
    c.rect(x + 2, y + 3, w - 4, 6, DARK[0])
    for i in range(3, w - 2, 2):
        c.vline(x + i, y + 3, y + 8, DARK[1])
    # front slopes: blue steel bumper
    x, y, w, h = R_FRONT
    c.panel(x, y, w, h, STEEL, outline=INK)
    c.hline(x + 1, x + w - 2, y + 3, STEEL[0])
    # snout top and sides: darker purple
    x, y, w, h = R_SNOUT_TOP
    c.panel(x, y, w, h, (INK, HULL[0], HULL[1]), outline=PLUM)
    c.hline(x + 2, x + w - 3, y + 6, INK)
    x, y, w, h = R_SNOUT_SIDE
    c.panel(x, y, w, h, (INK, HULL[0], HULL[1]), outline=PLUM)
    c.set(x + 3, y + 3, STEEL[2])
    # mouth: a dark slot full of blue steel teeth
    x, y, w, h = R_MOUTH
    c.rect(x, y, w, h, DARK[0])
    for i in range(0, w, 3):
        c.rect(x + i, y + 1, 2, 3, STEEL[2])
        c.set(x + i + 1, y + 3, STEEL[1])
        c.rect(x + i + 1, y + h - 4, 2, 3, STEEL[1])
    c.outline(x, y, w, h, PLUM)
    # bare axles: blue steel hubs
    x, y, w, h = R_AXLE
    c.rect(x, y, w, h, DARK[1])
    c.circle(x + 3, y + 3, 2, STEEL[0], fill=STEEL[1])
    c.set(x + 2, y + 2, STEEL[2])
    # tail fin
    x, y, w, h = R_FIN
    c.panel(x, y, w, h, STEEL, outline=INK)
    c.set(x + 2, y + 2, STEEL[2])
    x, y, w, h = R_UNDER
    c.rect(x, y, w, h, DARK[0])
    x, y, w, h = R_STRIPE
    c.rect(x, y, w, h, STEEL[1])
    c.hline(x, x + w - 1, y, STEEL[2])
    return c


def build():
    pix.reset_scene()
    img = paint().to_image("snapper", pix.tex_path("snapper"), forbid=pix.DANGER | pix.SALVAGE)
    m_atlas = pix.atlas_material("snapper_atlas", img)
    m_eyes = pix.emissive_material("snapper_eyes", 15)
    root = pix.empty("snapper")

    mb = pix.MeshBuilder()

    def hull_side(i, a, b):
        return [R_UNDER, R_FRONT, R_FRONT, R_TOP, R_TOP, R_BACK][i]
    mb.prism(HULL_PROF, "y", -HULL_Y, HULL_Y, side=hull_side, cap0=R_SIDE, cap1={"rect": R_SIDE, "flip_u": True})

    def snout_side(i, a, b):
        return [R_UNDER, R_MOUTH, R_MOUTH, R_SNOUT_TOP, None][i]
    mb.prism(SNOUT_PROF, "y", -SNOUT_Y, SNOUT_Y, side=snout_side, cap0=R_SNOUT_SIDE, cap1={"rect": R_SNOUT_SIDE, "flip_u": True})
    # bare axle stubs, two each side (what's left when the treads come off)
    for ax in (-0.2, 0.16):
        for s in (1, -1):
            y0, y1 = (HULL_Y, HULL_Y + 0.05) if s > 0 else (-HULL_Y - 0.05, -HULL_Y)
            mb.box(ax - 0.045, ax + 0.045, y0, y1, 0.06, 0.15, {
                "+y" if s > 0 else "-y": R_AXLE, "+x": R_UNDER, "-x": R_UNDER, "+z": R_UNDER,
            })
    # a tail fin on the back deck: the back reads from any side
    mb.box(-0.32, -0.20, -0.012, 0.012, 0.32, 0.47, {"+y": R_FIN, "-y": R_FIN, "-x": R_FIN, "+z": R_UNDER, "+x": R_UNDER})
    mb.to_object("body", [m_atlas], origin=(0, 0, 0), parent=root)

    eb = pix.MeshBuilder()
    for s in (1, -1):
        # slanted slits on the snout's top front
        y0, y1 = (0.03, 0.095) if s > 0 else (-0.095, -0.03)
        eb.box(0.31, 0.36, y0, y1, 0.245, 0.275, {"+z": (0, 0, 2, 2), "+x": (0, 0, 2, 2), "+y": (0, 0, 2, 2), "-y": (0, 0, 2, 2)})
    eb.to_object("eyes", [m_eyes], origin=(0.33, 0, 0.26), parent=root)
    pix.empty("mount_front", location=(0.40, 0, 0), parent=root)

    total, lo, hi = pix.report(root)
    assert total <= 350, total
    pix.export_glb("snapper")
    pix.setup_preview()
    pix.render_view(pix.preview_path("snapper"), direction=(1.0, 0.9, 0.6))
    pix.render_view(pix.preview_path("snapper-back"), direction=(-1.0, 0.6, 0.5))
    return total


if __name__ == "__main__":
    build()
