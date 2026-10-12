"""Claw: the player's first-person 'weapon' -> public/models/claw.glb.

Nodes:  claw (root empty)
          arm     tapered hydraulic forearm, origin at the shoulder pivot (0, 0, 0), reaches
                  x = 0.40 (wrist block); two side pistons; dark bezel for the glow lens
          jaw_l   +Y pincer jaw, origin at its hinge (0.38, +0.05, 0); 12 deg open (baked)
          jaw_r   -Y pincer jaw, origin at its hinge (0.38, -0.05, 0); 12 deg open (baked)
          glow    raised octagonal lens on the back of the wrist, facing up (seen from the
                  first-person camera above/behind), material `claw_glow`
Materials: claw_atlas (art/claw/claw.png), claw_glow (emissive #9babb2, recoloured by tier)
The renderer opens/closes the jaws by rotating them about their local Z (Blender Z).
"""
import math
import os
import sys

sys.dont_write_bytecode = True  # keep art/ free of __pycache__
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "_lib"))
import pix  # noqa: E402

# ---------------------------------------------------------------- atlas layout
R_ARM_TOP = (0, 0, 10, 46)      # u across (+Y left), v=0 at the wrist end
R_CHAMF = (10, 0, 5, 46)
R_JAW_TOP = (15, 0, 12, 28)
R_WRIST_TOP = (27, 0, 22, 10)
R_WRIST_BACK = (27, 10, 22, 10)
R_PISTON = (49, 0, 12, 24)      # 6 faces x 2 texels, v=0 at the front end
R_ROD = (61, 0, 3, 12)          # repeated per face
R_CAP = (61, 12, 3, 3)
R_BEZEL_TOP = (27, 20, 4, 3)
R_BEZEL_SIDE = (31, 20, 4, 3)
R_DARK = (35, 28, 2, 2)
R_KNUCKLE = (35, 20, 14, 8)
R_ARM_SIDE = (15, 28, 20, 8)
R_ARM_BACK = (35, 30, 12, 8)
R_WRIST_SIDE = (49, 24, 8, 8)
R_JAW_EDGE = (0, 46, 48, 6)     # perimeter strip around each jaw, v=0 at the top edge

PLUM = 0
RUST = (20, 21, 22)
DEEP = 19
ORANGE = 16
CREAM = (22, 63, 63)
STEEL = (6, 7, 8)

# ---------------------------------------------------------------- geometry
SEC_A = dict(x=0.02, hw=0.060, hh=0.050, ch=0.026)   # shoulder end of the forearm
SEC_B = dict(x=0.33, hw=0.050, hh=0.036, ch=0.020)   # wrist end
WRIST = dict(x0=0.32, x1=0.40, y=0.085, z0=-0.040, z1=0.038)
KNUCKLE = dict(x0=-0.035, x1=0.035, y=0.07, z=0.052)
HINGE_X, HINGE_Y = 0.38, 0.05
OPEN_DEG = 12.0
GLOW_C = (0.285, 0.0)
BEZEL = dict(r_out=0.047, r_in=0.036, z0=0.032, z1=0.048)
LENS = dict(r0=0.036, r1=0.025, z0=0.047, z1=0.067)
PISTON = dict(y=0.071, z=0.012, x_rear=0.03, x_mid=0.19, x_front=0.33, r=0.017, r_rod=0.008)

# jaw outline (local to the hinge, closed jaw, +Y jaw), outer edge first, tip, then inner
JAW = [(-0.015, 0.032), (0.050, 0.042), (0.110, 0.036), (0.150, 0.018), (0.172, -0.010),
       (0.168, -0.040), (0.150, -0.036), (0.136, -0.014), (0.090, -0.003), (0.030, -0.010),
       (-0.015, -0.024)]
JAW_GRIP_EDGES = {5, 6, 7, 8}          # edges i -> i+1 that get teeth
JAW_LEN = 0.172


def jaw_points(sgn):
    """World XY of the jaw outline (opened OPEN_DEG outward), and per-vertex top/bottom z."""
    a = math.radians(OPEN_DEG) * sgn
    ca, sa = math.cos(a), math.sin(a)
    pts = []
    for (x, y) in JAW:
        y = y * sgn
        X = HINGE_X + x * ca - y * sa
        Y = HINGE_Y * sgn + x * sa + y * ca
        f = max(0.0, x) / JAW_LEN
        pts.append((X, Y, 0.044 - 0.010 * f, -0.026 + 0.008 * f))
    return pts


def jaw_top_bounds():
    pts = jaw_points(1)
    s = [-p[1] for p in pts]
    t = [p[0] for p in pts]
    return min(s), max(s), min(t), max(t)


def jaw_top_tex(p, bounds):
    """Texel coords of a jaw point on R_JAW_TOP (s=-y right, t=x up)."""
    s0, s1, t0, t1 = bounds
    x, y, w, h = R_JAW_TOP
    a = (-p[1] - s0) / (s1 - s0)
    b = (p[0] - t0) / (t1 - t0)
    e = 0.02
    return (x + e + a * (w - 2 * e), y + e + (1 - b) * (h - 2 * e))


def point_in_poly(px, py, poly):
    inside = False
    n = len(poly)
    for i in range(n):
        (x0, y0), (x1, y1) = poly[i], poly[(i + 1) % n]
        if (y0 > py) != (y1 > py):
            xi = x0 + (py - y0) * (x1 - x0) / (y1 - y0)
            if px < xi:
                inside = not inside
    return inside


def jaw_perimeter():
    pts = jaw_points(1)
    lens = [math.dist(pts[i][:2], pts[(i + 1) % len(pts)][:2]) for i in range(len(pts))]
    total = sum(lens)
    scale = R_JAW_EDGE[2] / total
    offs, acc = [], 0.0
    for L in lens:
        offs.append(acc * scale)
        acc += L
    return lens, offs, scale


def paint():
    c = pix.Canvas(fill=PLUM)

    # ---- forearm top: three riveted plates, cream stripe, orange speed chevrons
    x, y, w, h = R_ARM_TOP
    c.panel(x, y, w, h, RUST, outline=PLUM)
    for sv in (14, 30):
        c.seam_h(x + 1, x + w - 2, y + sv, PLUM, RUST[2])
    # front plate (under / around the glow bezel): darker, heat-scorched
    c.rect(x + 1, y + 1, w - 2, 13, RUST[0])
    c.speckle(x + 1, y + 1, w - 2, 13, [DEEP], 10, seed=2)
    # middle plate: cream racing stripe with plum keyline
    c.rect(x + 3, y + 17, 4, 12, CREAM[1])
    c.vline(x + 2, y + 17, y + 28, PLUM)
    c.vline(x + 7, y + 17, y + 28, PLUM)
    c.vline(x + 6, y + 18, y + 28, CREAM[0])
    c.hline(x + 3, x + 6, y + 28, CREAM[0])
    for j in (19, 24):
        c.set(x + 4, y + j, PLUM)        # stripe rivets
        c.set(x + 5, y + j + 1, CREAM[0])
    c.rivet(x + 1, y + 16, RUST[2], DEEP)
    c.rivet(x + 8, y + 16, RUST[2], DEEP)
    # rear plate: orange chevrons pointing forward (v=0 is the front)
    for k, cy in enumerate((34, 38)):
        for i in range(4):
            c.set(x + 1 + i, y + cy + i, ORANGE)
            c.set(x + 8 - i, y + cy + i, ORANGE)
            c.set(x + 1 + i, y + cy + i + 1, DEEP)
            c.set(x + 8 - i, y + cy + i + 1, DEEP)
    for (i, j) in ((1, 32), (8, 32), (1, 43), (8, 43)):
        c.rivet(x + i, y + j, RUST[2], DEEP)
    c.scuffs(x + 2, y + 31, 6, 13, [RUST[2]], 3, seed=7, on={RUST[1]}, length=(1, 2))

    # ---- chamfers: lit bevel strip with rivets, seams aligned with the top plates
    x, y, w, h = R_CHAMF
    c.rect(x, y, w, h, RUST[2])
    c.vline(x + w - 1, y, y + h - 1, RUST[1])
    c.vline(x, y, y + h - 1, PLUM)
    c.hline(x, x + w - 1, y, PLUM)
    c.hline(x, x + w - 1, y + h - 1, PLUM)
    for sv in (14, 30):
        c.hline(x, x + w - 1, y + sv, PLUM)
    for j in range(4, h - 2, 6):
        c.rivet(x + 2, y + j, 63, RUST[0])
    c.speckle(x + 1, y + 1, w - 2, 13, [RUST[1]], 8, seed=4)

    # ---- jaw top: rasterise the jaw outline into its rect, steel with plum outline
    bounds = jaw_top_bounds()
    poly = [jaw_top_tex(p, bounds) for p in jaw_points(1)]
    x, y, w, h = R_JAW_TOP
    inside = set()
    for j in range(h):
        for i in range(w):
            if point_in_poly(x + i + 0.5, y + j + 0.5, poly):
                inside.add((x + i, y + j))
    for (i, j) in inside:
        c.set(i, j, STEEL[1])
    for (i, j) in inside:
        up = (i, j - 1) in inside
        left = (i - 1, j) in inside
        right = (i + 1, j) in inside
        down = (i, j + 1) in inside
        if not (up and left and right and down):
            c.set(i, j, PLUM)                   # 1-texel outline
        elif not ((i - 2, j) in inside):
            c.set(i, j, STEEL[2])               # lit outer (left, +Y) edge
        elif not ((i + 2, j) in inside):
            c.set(i, j, STEEL[0])               # shadowed inner edge
    # hinge pin near the back end, a groove down the jaw, a glint near the hook
    hx, hy = jaw_top_tex((HINGE_X, HINGE_Y), bounds)
    c.hexbolt(int(hx) - 1, int(hy) - 3, (1, 2, STEEL[1]), outline=None)
    for j in range(8, 18):
        if (x + 5, y + j) in inside:
            c.set(x + 5, y + j, STEEL[0])
    c.set(x + 3, y + 5, 9)

    # ---- jaw perimeter strip: steel edge, teeth on the grip edges
    lens, offs, scale = jaw_perimeter()
    x, y, w, h = R_JAW_EDGE
    c.rect(x, y, w, h, STEEL[1])
    c.hline(x, x + w - 1, y, STEEL[2])
    c.hline(x, x + w - 1, y + h - 1, PLUM)
    c.hline(x, x + w - 1, y + h - 2, STEEL[0])
    for i, (o, L) in enumerate(zip(offs, lens)):
        u0, u1 = int(round(o)), int(round(o + L * scale))
        c.vline(x + u0, y, y + h - 1, PLUM)     # corner seam
        if i in JAW_GRIP_EDGES:
            for u in range(u0 + 1, u1, 2):      # sawtooth teeth
                c.vline(x + u, y + 1, y + 3, PLUM)
                c.set(x + u + 1, y + 1, STEEL[2])
                c.set(x + u, y, 2)

    # ---- wrist block: cream hand plate with hinge pins and piston ports
    x, y, w, h = R_WRIST_TOP   # u across (+Y left), v=0 front
    c.panel(x, y, w, h, CREAM, outline=PLUM)
    for py in (HINGE_Y, -HINGE_Y):
        u = int(round((WRIST["y"] - py) / (2 * WRIST["y"]) * w))
        v = int(round((WRIST["x1"] - HINGE_X) / (WRIST["x1"] - WRIST["x0"]) * h))
        c.hexbolt(x + u - 1, y + v - 1, STEEL, outline=PLUM)
    c.hline(x + 9, x + 14, y + 4, ORANGE)
    c.hline(x + 9, x + 14, y + 5, DEEP)
    c.rect(x + 1, y + h - 3, w - 2, 2, RUST[1])            # rust band at the back edge
    c.hline(x + 1, x + w - 2, y + h - 3, RUST[2])
    x, y, w, h = R_WRIST_BACK  # u=0 at +Y; arm enters the middle
    c.panel(x, y, w, h, RUST, outline=PLUM)
    for u in (2, w - 4):
        c.rect(x + u, y + 3, 2, 2, PLUM)                    # piston ports
        c.set(x + u, y + 3, 1)
    c.rect(x + 6, y + 1, 12, 1, CREAM[1])
    x, y, w, h = R_WRIST_SIDE
    c.panel(x, y, w, h, RUST, outline=PLUM)
    c.hexbolt(x + 3, y + 3, STEEL, outline=PLUM)

    # ---- pistons: cream cylinder, plum end bands, steel chrome rod
    x, y, w, h = R_PISTON
    c.rect(x, y, w, h, CREAM[1])
    for k in range(6):
        c.vline(x + 2 * k + 1, y, y + h - 1, CREAM[0])     # facet shading
    c.rect(x, y, w, 2, PLUM)
    c.rect(x, y + h - 2, w, 2, PLUM)
    c.rect(x, y + 10, w, 2, RUST[1])
    c.hline(x, x + w - 1, y + 10, RUST[2])
    c.hline(x, x + w - 1, y + 2, 63)
    x, y, w, h = R_ROD
    c.rect(x, y, w, h, STEEL[2])
    c.vline(x + 2, y, y + h - 1, STEEL[1])
    c.vline(x, y, y + h - 1, 9)
    c.rect(*R_CAP, PLUM)
    c.set(R_CAP[0] + 1, R_CAP[1] + 1, RUST[0])

    # ---- bezel around the glow lens: dark gunmetal so any glow colour pops
    x, y, w, h = R_BEZEL_TOP
    c.rect(x, y, w, h, 1)
    c.hline(x, x + w - 1, y, 2)
    c.set(x + 1, y + 1, STEEL[0])
    x, y, w, h = R_BEZEL_SIDE
    c.rect(x, y, w, h, PLUM)
    c.hline(x, x + w - 1, y, 1)
    c.rect(*R_DARK, PLUM)

    # ---- shoulder knuckle, arm sides, arm back cap
    x, y, w, h = R_KNUCKLE
    c.panel(x, y, w, h, RUST, outline=PLUM)
    c.circle(x + 6, y + 4, 2, PLUM, fill=STEEL[0])
    c.set(x + 5, y + 3, STEEL[2])
    x, y, w, h = R_ARM_SIDE    # u=0 at the wrist end, v=0 top
    c.panel(x, y, w, h, RUST, outline=PLUM)
    c.seam_v(x + 9, y + 1, y + h - 2, PLUM, RUST[2])
    c.rect(x + 12, y + 3, 6, 2, CREAM[1])
    for i in (3, 7, 14, 19):
        c.rivet(x + i, y + 2, RUST[2], DEEP)
    x, y, w, h = R_ARM_BACK
    c.panel(x, y, w, h, RUST, outline=PLUM)
    c.rect(x + 4, y + 3, 4, 2, DEEP)
    return c


def hexsec(s):
    hw, hh, ch = s["hw"], s["hh"], s["ch"]
    return [(-hw, -hh), (hw, -hh), (hw, hh - ch), (hw - ch, hh), (-hw + ch, hh), (-hw, hh - ch)]


def ring_z(mb, cx, cy, sides, bands, phase=None):
    """Octagonal surfaces of revolution around a vertical axis through (cx, cy).
    bands: list of (r0, z0, r1, z1, rect, out) with out in 'up', 'r+', 'r-'."""
    if phase is None:
        phase = math.pi / sides
    ang = [phase + 2 * math.pi * k / sides for k in range(sides)]
    for (r0, z0, r1, z1, rect, out) in bands:
        for k in range(sides):
            a0, a1 = ang[k], ang[(k + 1) % sides]
            am = a0 + math.pi / sides
            P = lambda r, z, a: (cx + r * math.cos(a), cy + r * math.sin(a), z)  # noqa: E731
            pts = [P(r0, z0, a0), P(r0, z0, a1), P(r1, z1, a1), P(r1, z1, a0)]
            radial = (math.cos(am), math.sin(am), 0.0)
            o = {"up": (0, 0, 1), "r+": radial, "r-": tuple(-v for v in radial)}[out]
            if out != "up":
                o = (o[0], o[1], 0.6 if r1 < r0 else 0.0) if out == "r+" else o
            x, y, w, h = rect
            e = 0.02
            tex = [(x + e, y + h - e), (x + w - e, y + h - e), (x + w - e, y + e), (x + e, y + e)]
            mb.face(pts, outward=o, tex=tex)


def build_arm(root, mat):
    mb = pix.MeshBuilder()
    A, B = SEC_A, SEC_B
    sa, sb = hexsec(A), hexsec(B)
    rects = {0: {"rect": R_DARK},
             1: {"rect": R_ARM_SIDE},
             2: {"rect": R_CHAMF, "up": (1, 0, 0)},
             3: {"rect": R_ARM_TOP, "up": (1, 0, 0)},
             4: {"rect": R_CHAMF, "up": (1, 0, 0), "flip_u": True},
             5: {"rect": R_ARM_SIDE, "flip_u": True}}
    for i in range(6):
        (ya0, za0), (ya1, za1) = sa[i], sa[(i + 1) % 6]
        (yb0, zb0), (yb1, zb1) = sb[i], sb[(i + 1) % 6]
        pts = [(A["x"], ya0, za0), (A["x"], ya1, za1), (B["x"], yb1, zb1), (B["x"], yb0, zb0)]
        my, mz = (ya0 + ya1 + yb0 + yb1) / 4, (za0 + za1 + zb0 + zb1) / 4
        mb.face(pts, outward=(0, my, mz), **rects[i])
    mb.face([(A["x"], y, z) for (y, z) in sa], outward=(-1, 0, 0), rect=R_ARM_BACK)

    K = KNUCKLE
    mb.box(K["x0"], K["x1"], -K["y"], K["y"], -K["z"], K["z"], {
        "-x": {"rect": R_KNUCKLE}, "+z": {"rect": R_KNUCKLE},
        "+y": {"rect": R_KNUCKLE}, "-y": {"rect": R_KNUCKLE, "flip_u": True},
    })
    W = WRIST
    mb.box(W["x0"], W["x1"], -W["y"], W["y"], W["z0"], W["z1"], {
        "+z": {"rect": R_WRIST_TOP}, "-x": {"rect": R_WRIST_BACK},
        "+x": {"rect": R_WRIST_BACK, "flip_u": True},
        "+y": {"rect": R_WRIST_SIDE}, "-y": {"rect": R_WRIST_SIDE, "flip_u": True},
    })
    P = PISTON
    for sgn in (1, -1):
        ctr = (P["y"] * sgn, P["z"])
        mb.lathe([(P["x_mid"], P["r"]), (P["x_rear"], P["r"])], sides=6, center=ctr, phase=0.0,
                 bands=[{"rect": R_PISTON, "out": "r+"}], cap_front=R_CAP, cap_back=R_CAP)
        mb.lathe([(P["x_front"], P["r_rod"]), (P["x_mid"], P["r_rod"])], sides=6, center=ctr,
                 phase=0.0, bands=[{"rect": R_ROD, "out": "r+", "repeat": True}])
    Bz = BEZEL
    ring_z(mb, GLOW_C[0], GLOW_C[1], 8, [
        (Bz["r_out"], Bz["z0"], Bz["r_out"], Bz["z1"], R_BEZEL_SIDE, "r+"),
        (Bz["r_out"], Bz["z1"], Bz["r_in"], Bz["z1"], R_BEZEL_TOP, "up"),
    ])
    return mb.to_object("arm", [mat], origin=(0, 0, 0), parent=root)


def build_jaw(root, mat, sgn):
    mb = pix.MeshBuilder()
    pts = jaw_points(sgn)
    n = len(pts)
    bounds = jaw_top_bounds()
    top = [(p[0], p[1], p[2]) for p in pts]
    bot = [(p[0], p[1], p[3]) for p in pts]
    # top face: explicit UVs so the texture matches the rasterised outline exactly
    if sgn > 0:
        tex = [jaw_top_tex(p, bounds) for p in pts]
    else:  # mirror image of the +Y jaw
        tex = [jaw_top_tex((p[0], -p[1]), bounds) for p in pts]
    mb.face(top, outward=(0, 0, 1), tex=tex)
    mb.face(bot, outward=(0, 0, -1), tex=[(R_DARK[0] + 1, R_DARK[1] + 1)] * n)
    lens, offs, scale = jaw_perimeter()
    x, y, w, h = R_JAW_EDGE
    for i in range(n):
        j = (i + 1) % n
        quad = [bot[i], bot[j], top[j], top[i]]
        u0, u1 = x + offs[i] + 0.02, x + offs[i] + lens[i] * scale - 0.02
        t = [(u0, y + h - 0.02), (u1, y + h - 0.02), (u1, y + 0.02), (u0, y + 0.02)]
        dx, dy = pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]
        # outline is CW for sgn>0 (outer edge first); outward normal is to the left
        out = (-dy, dx, 0.0) if sgn > 0 else (dy, -dx, 0.0)
        mb.face(quad, outward=out, tex=t)
    name = "jaw_l" if sgn > 0 else "jaw_r"
    return mb.to_object(name, [mat], origin=(HINGE_X, HINGE_Y * sgn, 0.0), parent=root)


def build_glow(root, mat):
    mb = pix.MeshBuilder()
    L = LENS
    ring_z(mb, GLOW_C[0], GLOW_C[1], 8, [(L["r0"], L["z0"], L["r1"], L["z1"], (0, 0, 1, 1), "r+")])
    sides = 8
    ph = math.pi / sides
    top = [(GLOW_C[0] + L["r1"] * math.cos(ph + 2 * math.pi * k / sides),
            GLOW_C[1] + L["r1"] * math.sin(ph + 2 * math.pi * k / sides), L["z1"]) for k in range(sides)]
    mb.face(top, outward=(0, 0, 1), tex=[(0.5, 0.5)] * sides)
    return mb.to_object("glow", [mat], origin=(GLOW_C[0], GLOW_C[1], L["z0"]), parent=root)


def build():
    pix.reset_scene()
    canvas = paint()
    img = canvas.to_image("claw", pix.tex_path("claw"), forbid=pix.DANGER | pix.SALVAGE)
    m_atlas = pix.atlas_material("claw_atlas", img)
    m_glow = pix.emissive_material("claw_glow", 7)

    root = pix.empty("claw")
    build_arm(root, m_atlas)
    build_jaw(root, m_atlas, 1)
    build_jaw(root, m_atlas, -1)
    build_glow(root, m_glow)

    total, lo, hi = pix.report(root)
    assert total <= 300, total
    pix.export_glb("claw")

    pix.setup_preview()
    pix.render_view(pix.preview_path("claw"), direction=(1.0, 0.9, 0.8))
    # first-person: camera 0.3 m behind and 0.3 m above the shoulder, looking along +X,
    # pitched 6 deg down, 70 deg vertical FOV at the game's 640x360
    fp = dict(fit="VERTICAL", cam_loc=(-0.3, 0.0, 0.3), look_at=(0.7, 0.0, 0.3 - math.tan(math.radians(6))),
              fov_deg=70, size=(640, 360), clip_start=0.05)
    pix.render_view(pix.preview_path("claw-fp"), **fp)
    # same view with the glow recoloured to the Slipstream tier (preview only)
    bsdf = next(n for n in m_glow.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = pix.lin(42)
    bsdf.inputs["Emission Color"].default_value = pix.lin(42)
    pix.render_view(pix.preview_path("claw-fp-teal"), **fp)
    return total


if __name__ == "__main__":
    build()
