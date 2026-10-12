"""Gate: where Rammers drive in -> public/models/gate.glb.

Root `gate`:
  frame   two heavy steel posts (x in [-1.0, -0.8] and [0.8, 1.0], y in [-0.4, 0.4],
          1.5 m tall), a lintel across the top (z 1.35-1.6), the door hanger rail under it,
          a floor rail and the lamp housing. Origin at the bottom centre.
  door_l  sliding leaf covering x in [-0.8, 0], 1.2 m tall, 0.1 m thick; origin at its own
          centre at floor level (-0.4, 0, 0)
  door_r  sliding leaf covering x in [0, 0.8]; origin (0.4, 0, 0)
  lamp    octagonal warning dome on the lintel centre, material `gate_lamp` (emissive
          #e83b3b); origin at its base (0, 0, 1.64)
Opening: exactly x in [-0.8, 0.8] in a wall 0.8 m thick (y in [-0.4, 0.4]).
Material: arena_atlas (art/arena/arena.png, shared with wall and pillar).
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

POST_H = 1.5
LINTEL = dict(z0=1.35, z1=1.60, y=0.32)
DOOR = dict(h=1.2, t=0.05)
LAMP = dict(r0=0.07, r1=0.045, z0=1.64, z1=1.74)


def segs(a, b, n):
    return [(a + (b - a) * i / n, a + (b - a) * (i + 1) / n) for i in range(n)]


def build_frame(root, mat):
    mb = pix.MeshBuilder()
    for sgn in (-1, 1):
        x0, x1 = (0.8, 1.0) if sgn > 0 else (-1.0, -0.8)
        xi = 0.8 * sgn                       # inner face, toward the opening
        for (za, zb) in segs(0.0, POST_H, 3):
            # front / back faces of the post, one 0.5 m tile each
            mb.face([(x0, 0.4, za), (x1, 0.4, za), (x1, 0.4, zb), (x0, 0.4, zb)],
                    outward=(0, 1, 0), rect=A.R_POST)
            mb.face([(x0, -0.4, za), (x1, -0.4, za), (x1, -0.4, zb), (x0, -0.4, zb)],
                    outward=(0, -1, 0), rect=A.R_POST)
            # jamb (the door slides into here)
            mb.face([(xi, -0.4, za), (xi, 0.4, za), (xi, 0.4, zb), (xi, -0.4, zb)],
                    outward=(-sgn, 0, 0), rect=A.R_JAMB)
        mb.face([(x0, -0.4, POST_H), (x1, -0.4, POST_H), (x1, 0.4, POST_H), (x0, 0.4, POST_H)],
                outward=(0, 0, 1), rect=A.R_STEEL_TOP)
    L = LINTEL
    for (xa, xb) in segs(-1.0, 1.0, 4):
        for sy in (1, -1):
            yy = L["y"] * sy
            mb.face([(xa, yy, L["z0"]), (xb, yy, L["z0"]), (xb, yy, L["z1"]), (xa, yy, L["z1"])],
                    outward=(0, sy, 0), rect=A.R_LINTEL)
    mb.box(-1.0, 1.0, -L["y"], L["y"], L["z0"], L["z1"], {
        "+x": {"rect": A.R_LINTEL}, "-x": {"rect": A.R_LINTEL},
        "+z": {"rect": A.R_STEEL_TOP},
    })
    for (xa, xb) in segs(-0.8, 0.8, 2):      # underside of the lintel, seen from below
        mb.face([(xa, -L["y"], L["z0"]), (xb, -L["y"], L["z0"]), (xb, L["y"], L["z0"]),
                 (xa, L["y"], L["z0"])], outward=(0, 0, -1), rect=A.R_JAMB, rot=90)
    # door hanger rail under the lintel and the floor guide rail
    mb.box(-0.8, 0.8, -0.06, 0.06, DOOR["h"], L["z0"], {
        "+y": {"rect": A.R_RAIL}, "-y": {"rect": A.R_RAIL}, "-z": {"rect": A.R_RAIL}})
    mb.box(-0.8, 0.8, -0.07, 0.07, 0.0, 0.025, {
        "+y": {"rect": A.R_RAIL}, "-y": {"rect": A.R_RAIL}, "+z": {"rect": A.R_RAIL}})
    # lamp housing
    mb.box(-0.1, 0.1, -0.1, 0.1, L["z1"], LAMP["z0"], {
        "+x": {"rect": A.R_LAMP_BASE}, "-x": {"rect": A.R_LAMP_BASE},
        "+y": {"rect": A.R_LAMP_BASE}, "-y": {"rect": A.R_LAMP_BASE},
        "+z": {"rect": A.R_DARK}})
    return mb.to_object("frame", [mat], origin=(0, 0, 0), parent=root)


def build_door(root, mat, sgn):
    mb = pix.MeshBuilder()
    x0, x1 = (0.0, 0.8) if sgn > 0 else (-0.8, 0.0)
    t = DOOR["t"]
    mirror = sgn > 0
    mb.box(x0, x1, -t, t, 0.0, DOOR["h"], {
        "+y": {"rect": A.R_DOOR, "flip_u": not mirror},
        "-y": {"rect": A.R_DOOR, "flip_u": mirror},
        "+x": {"rect": A.R_DOOR_EDGE}, "-x": {"rect": A.R_DOOR_EDGE},
        "+z": {"rect": A.R_DOOR_EDGE},
    })
    name = "door_r" if sgn > 0 else "door_l"
    return mb.to_object(name, [mat], origin=(0.4 * sgn, 0.0, 0.0), parent=root)


def build_lamp(root, mat):
    mb = pix.MeshBuilder()
    n = 8
    ph = math.pi / n
    L = LAMP
    ang = [ph + 2 * math.pi * k / n for k in range(n)]
    for k in range(n):
        a0, a1 = ang[k], ang[(k + 1) % n]
        am = a0 + math.pi / n
        pts = [(L["r0"] * math.cos(a0), L["r0"] * math.sin(a0), L["z0"]),
               (L["r0"] * math.cos(a1), L["r0"] * math.sin(a1), L["z0"]),
               (L["r1"] * math.cos(a1), L["r1"] * math.sin(a1), L["z1"]),
               (L["r1"] * math.cos(a0), L["r1"] * math.sin(a0), L["z1"])]
        mb.face(pts, outward=(math.cos(am), math.sin(am), 0.4), tex=[(0.5, 0.5)] * 4)
    mb.face([(L["r1"] * math.cos(a), L["r1"] * math.sin(a), L["z1"]) for a in ang],
            outward=(0, 0, 1), tex=[(0.5, 0.5)] * n)
    return mb.to_object("lamp", [mat], origin=(0, 0, L["z0"]), parent=root)


def build():
    pix.reset_scene()
    mat = pix.atlas_material("arena_atlas", A.atlas_image())
    m_lamp = pix.emissive_material("gate_lamp", 15)
    root = pix.empty("gate")
    build_frame(root, mat)
    build_door(root, mat, -1)
    build_door(root, mat, 1)
    build_lamp(root, m_lamp)
    total, lo, hi = pix.report(root)
    assert total <= 250, total
    pix.export_glb("gate")

    pix.setup_preview()
    # flanking wall segments for context (preview only) if the wall is built
    import bpy
    wall = os.path.join(pix.MODELS_DIR, "wall.glb")
    if os.path.exists(wall):
        for dx in (-1.4, -2.2, 1.4, 2.2):
            for o in pix.import_glb(wall):
                if o.parent is None:
                    o.location = (dx, 0, 0)
    pix.render_view(pix.preview_path("gate"), direction=(0.6, -1.0, 0.42), lens=40,
                    objs=[o for o in root.children_recursive if o.type == "MESH"])
    for d, dx in (("door_l", -0.8), ("door_r", 0.8)):
        ob = bpy.data.objects[d]
        ob.location.x += dx
    pix.render_view(pix.preview_path("gate-open"), direction=(0.6, -1.0, 0.42), lens=40,
                    objs=[o for o in root.children_recursive if o.type == "MESH"])
    return total


if __name__ == "__main__":
    build()
