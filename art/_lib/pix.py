"""Shared helpers for the Slipstream Salvager 3D model scripts.

Runs inside headless Blender (`blender --background --factory-startup --python ...`).
Everything here is deterministic: same script, same .glb, same .png.

Contents
  * Resurrect 64 palette + colour-language guards
  * Canvas: a 64x64 indexed pixel canvas (set/rect/line/outline/panel/dither/hazard/
    rivets/bolts/scuffs), saved as a true-palette PNG by a tiny pure-Python writer
  * MeshBuilder: flat-shaded low-poly geometry built face by face, every face UV-mapped
    onto an explicit atlas rectangle (planar projection or explicit texel UVs)
  * scene reset, materials (atlas / emissive), object + root-empty helpers
  * glTF export, triangle counts, preview renders (EEVEE, nearest-filtered textures)

Conventions (see art/README.md): metres, Blender +Z up, models face +X, origin at the
footprint centre on the floor; glTF exported +Y up.
"""
import json
import math
import os
import random
import struct
import sys
import zlib

import bpy
import bmesh
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ART_DIR = os.path.dirname(HERE)
ROOT = os.path.dirname(ART_DIR)
MODELS_DIR = os.path.join(ROOT, "public", "models")
PREVIEW_DIR = os.path.join(ROOT, "e2e", "out", "art")
ATLAS = 64

# Blender object name -> glTF node name, for nodes that must share a name with their
# root (e.g. root `wall` + mesh `wall`): Blender keeps object names unique, so the mesh
# object becomes `wall.001` and export_glb() renames the node back in the .glb JSON.
NODE_RENAME = {}

# --------------------------------------------------------------------------- palette
PAL_HEX = (
    "2e222f", "3e3546", "625565", "966c6c", "ab947a", "694f62", "7f708a", "9babb2",
    "c7dcd0", "ffffff", "6e2727", "b33831", "ea4f36", "f57d4a", "ae2334", "e83b3b",
    "fb6b1d", "f79617", "f9c22b", "7a3045", "9e4539", "cd683d", "e6904e", "fbb954",
    "4c3e24", "676633", "a2a947", "d5e04b", "fbff86", "165a4c", "239063", "1ebc73",
    "91db69", "cddf6c", "313638", "374e4a", "547e64", "92a984", "b2ba90", "0b5e65",
    "0b8a8f", "0eaf9b", "30e1b9", "8ff8e2", "323353", "484a77", "4d65b4", "4d9be6",
    "8fd3ff", "45293f", "6b3e75", "905ea9", "a884f3", "eaaded", "753c54", "a24b6f",
    "cf657f", "ed8099", "831c5d", "c32454", "f04f78", "f68181", "fca790", "fdcbb0",
)
PAL = [tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) for h in PAL_HEX]
assert len(PAL) == 64

# Colour language (hard rules). Teal is never painted into any texture.
TEAL = {39, 40, 41, 42, 43, 48}
DANGER = {10, 11, 12, 14, 15, 59, 60}   # Rammer eyes + Rammer front hazard stripes only
SALVAGE = {17, 18, 23, 28}              # the parts only: booster, treads, plow, jaws


def srgb_to_linear(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin(idx):
    """Palette index -> linear RGBA for Blender node colour inputs."""
    r, g, b = PAL[idx]
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)


def log(*a):
    print("[pix]", *a)
    sys.stdout.flush()


# --------------------------------------------------------------------------- canvas
class Canvas:
    """A w x h grid of palette indices. (0,0) is the TOP-LEFT texel, y grows downward.

    Ramps are (dark, mid, light) palette-index triples; light comes from the upper left.
    With wrap=True every write wraps around the edges (for seamless tiles)."""

    def __init__(self, w=ATLAS, h=ATLAS, fill=0, wrap=False):
        self.w, self.h, self.wrap = w, h, wrap
        self.px = [[fill] * w for _ in range(h)]
        self.clip = None  # optional (x, y, w, h): writes outside are ignored

    # -- primitive access
    def set(self, x, y, c):
        if c is None:
            return
        x, y = int(x), int(y)
        if self.wrap:
            x %= self.w
            y %= self.h
        elif not (0 <= x < self.w and 0 <= y < self.h):
            return
        if self.clip:
            cx, cy, cw, ch = self.clip
            if not (cx <= x < cx + cw and cy <= y < cy + ch):
                return
        assert 0 <= c < 64, c
        self.px[y][x] = c

    def get(self, x, y):
        if self.wrap:
            return self.px[int(y) % self.h][int(x) % self.w]
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.px[int(y)][int(x)]
        return None

    def region(self, rect):
        """Restrict writes to rect until region(None)."""
        self.clip = rect

    # -- shapes
    def rect(self, x, y, w, h, c):
        for j in range(h):
            for i in range(w):
                self.set(x + i, y + j, c)

    def hline(self, x0, x1, y, c):
        for x in range(min(x0, x1), max(x0, x1) + 1):
            self.set(x, y, c)

    def vline(self, x, y0, y1, c):
        for y in range(min(y0, y1), max(y0, y1) + 1):
            self.set(x, y, c)

    def line(self, x0, y0, x1, y1, c):
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err = dx + dy
        while True:
            self.set(x0, y0, c)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    def outline(self, x, y, w, h, c):
        self.hline(x, x + w - 1, y, c)
        self.hline(x, x + w - 1, y + h - 1, c)
        self.vline(x, y, y + h - 1, c)
        self.vline(x + w - 1, y, y + h - 1, c)

    def panel(self, x, y, w, h, ramp, outline=0, inset=False):
        """A raised plate: 1-texel outline, light top/left lip, dark bottom/right lip.
        inset=True gives a recessed plate (dark top/left, light bottom/right)."""
        dark, mid, light = ramp
        self.rect(x, y, w, h, mid)
        a, b = (dark, light) if inset else (light, dark)
        o = 1 if outline is not None else 0
        if w - 2 * o > 0 and h - 2 * o > 0:
            self.hline(x + o, x + w - 1 - o, y + o, a)
            self.vline(x + o, y + o, y + h - 1 - o, a)
            self.hline(x + o, x + w - 1 - o, y + h - 1 - o, b)
            self.vline(x + w - 1 - o, y + o, y + h - 1 - o, b)
            if not inset:  # corner where light meets shadow stays mid
                self.set(x + w - 1 - o, y + o, mid)
                self.set(x + o, y + h - 1 - o, mid)
        if outline is not None:
            self.outline(x, y, w, h, outline)

    def seam_h(self, x0, x1, y, dark, light=None):
        """Horizontal plate seam: dark groove, lit lower lip."""
        self.hline(x0, x1, y, dark)
        if light is not None:
            self.hline(x0, x1, y + 1, light)

    def seam_v(self, x, y0, y1, dark, light=None):
        """Vertical plate seam: dark groove, lit right lip (light from the left)."""
        self.vline(x, y0, y1, dark)
        if light is not None:
            self.vline(x + 1, y0, y1, light)

    def dither(self, x, y, w, h, c, mode="checker", phase=0):
        """Ordered dither of colour c over the rect: checker (50%), sparse (25%),
        rows (alternate rows of checker), dots (12.5%)."""
        for j in range(h):
            for i in range(w):
                X, Y = x + i, y + j
                if mode == "checker":
                    on = (X + Y + phase) % 2 == 0
                elif mode == "sparse":
                    on = X % 2 == 0 and Y % 2 == 0 and (X // 2 + Y // 2 + phase) % 2 == 0
                elif mode == "quarter":
                    on = (X + phase) % 2 == 0 and Y % 2 == 0
                elif mode == "dots":
                    on = (X + 2 * (Y // 2) + phase) % 4 == 0 and Y % 2 == 0
                else:
                    raise ValueError(mode)
                if on:
                    self.set(X, Y, c)

    def hazard(self, x, y, w, h, ca, cb, width=3, direction=1, phase=0):
        """Diagonal hazard stripes, bands `width` texels wide."""
        for j in range(h):
            for i in range(w):
                k = ((i + direction * j + phase) // width) % 2
                self.set(x + i, y + j, ca if k == 0 else cb)

    def rivet(self, x, y, light, dark):
        """A 1-texel rivet head with its shadow texel down-right."""
        self.set(x, y, light)
        self.set(x + 1, y + 1, dark)

    def bolt(self, x, y, ramp, outline=None):
        """A 2x2 bolt head lit from the upper left (optionally ringed by an outline)."""
        dark, mid, light = ramp
        if outline is not None:
            for i in range(2):
                self.set(x + i, y - 1, outline)
                self.set(x + i, y + 2, outline)
                self.set(x - 1, y + i, outline)
                self.set(x + 2, y + i, outline)
        self.set(x, y, light)
        self.set(x + 1, y, mid)
        self.set(x, y + 1, mid)
        self.set(x + 1, y + 1, dark)

    def hexbolt(self, x, y, ramp, outline=0):
        """A 3x3 bolt head: outline ring corners cut, lit top-left."""
        dark, mid, light = ramp
        for j in range(3):
            for i in range(3):
                self.set(x + i, y + j, mid)
        self.set(x, y, light)
        self.set(x + 1, y, light)
        self.set(x, y + 1, light)
        self.set(x + 2, y + 2, dark)
        self.set(x + 2, y + 1, dark)
        self.set(x + 1, y + 2, dark)
        self.set(x + 1, y + 1, mid)
        if outline is not None:
            for i in range(3):
                self.set(x + i, y - 1, outline)
                self.set(x + i, y + 3, outline)
                self.set(x - 1, y + i, outline)
                self.set(x + 3, y + i, outline)

    def scuffs(self, x, y, w, h, colors, n, seed, on=None, length=(1, 3), vertical=False):
        """n short scratch dashes in random palette colours, only over texels whose
        current colour is in `on` (if given)."""
        rng = random.Random(seed)
        for _ in range(n):
            L = rng.randint(length[0], length[1])
            sx = x + rng.randrange(max(1, w))
            sy = y + rng.randrange(max(1, h))
            c = rng.choice(colors)
            for k in range(L):
                X, Y = (sx, sy + k) if vertical else (sx + k, sy)
                if not self.wrap and not (x <= X < x + w and y <= Y < y + h):
                    continue
                if on is None or self.get(X, Y) in on:
                    self.set(X, Y, c)

    def speckle(self, x, y, w, h, colors, n, seed, on=None):
        self.scuffs(x, y, w, h, colors, n, seed, on=on, length=(1, 1))

    def blob(self, cx, cy, rx, ry, c, seed=0, rough=0.25, on=None):
        """A rough elliptical stain (oil, moss)."""
        rng = random.Random(seed)
        for j in range(-ry - 1, ry + 2):
            for i in range(-rx - 1, rx + 2):
                d = (i / max(rx, 0.5)) ** 2 + (j / max(ry, 0.5)) ** 2
                if d <= 1.0 + rng.uniform(-rough, rough):
                    if on is None or self.get(cx + i, cy + j) in on:
                        self.set(cx + i, cy + j, c)

    def noise(self, cells=(4, 8), seed=0, weights=(0.65, 0.35)):
        """Tileable value noise over the whole canvas (periodic in both directions):
        returns rows of floats in [0, 1]. Sum of octaves with lattice sizes `cells`."""
        rng = random.Random(seed)
        out = [[0.0] * self.w for _ in range(self.h)]
        for L, wgt in zip(cells, weights):
            lat = [[rng.random() for _ in range(L)] for _ in range(L)]
            for y in range(self.h):
                fy = (y + 0.5) / self.h * L
                j0 = int(fy)
                ty = fy - j0
                ty = ty * ty * (3 - 2 * ty)
                for x in range(self.w):
                    fx = (x + 0.5) / self.w * L
                    i0 = int(fx)
                    tx = fx - i0
                    tx = tx * tx * (3 - 2 * tx)
                    a = lat[j0 % L][i0 % L]
                    b = lat[j0 % L][(i0 + 1) % L]
                    c = lat[(j0 + 1) % L][i0 % L]
                    d = lat[(j0 + 1) % L][(i0 + 1) % L]
                    v = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty
                    out[y][x] += v * wgt
        return out

    def circle(self, cx, cy, r, c, fill=None):
        """Midpoint-ish pixel circle (outline c, optional fill)."""
        for j in range(-r, r + 1):
            for i in range(-r, r + 1):
                d = math.hypot(i, j)
                if fill is not None and d <= r - 0.5:
                    self.set(cx + i, cy + j, fill)
                if r - 0.5 < d <= r + 0.5:
                    self.set(cx + i, cy + j, c)

    def remap(self, x, y, w, h, mapping):
        """Recolour texels in rect through {old: new}."""
        for j in range(h):
            for i in range(w):
                c = self.get(x + i, y + j)
                if c in mapping:
                    self.set(x + i, y + j, mapping[c])

    def copy(self, sx, sy, w, h, dx, dy, flip_x=False, flip_y=False):
        src = [[self.get(sx + i, sy + j) for i in range(w)] for j in range(h)]
        for j in range(h):
            for i in range(w):
                ii = w - 1 - i if flip_x else i
                jj = h - 1 - j if flip_y else j
                self.set(dx + i, dy + j, src[jj][ii])

    # -- output
    def used(self):
        return sorted({c for row in self.px for c in row})

    def check(self, forbid=()):
        used = set(self.used())
        bad = used & (TEAL | set(forbid))
        if bad:
            raise AssertionError("forbidden palette indices painted: %s" % sorted(bad))
        return used

    def save_png(self, path, forbid=()):
        """Write an 8-bit RGB PNG (pure Python, deterministic). Every texel is a palette
        colour by construction."""
        self.check(forbid)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        raw = bytearray()
        for row in self.px:
            raw.append(0)
            for c in row:
                raw.extend(PAL[c])

        def chunk(tag, data):
            body = tag + data
            return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

        png = b"\x89PNG\r\n\x1a\n"
        png += chunk(b"IHDR", struct.pack(">IIBBBBB", self.w, self.h, 8, 2, 0, 0, 0))
        png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        png += chunk(b"IEND", b"")
        with open(path, "wb") as f:
            f.write(png)
        log("texture", os.path.relpath(path, ROOT), "%dx%d" % (self.w, self.h),
            "colours", len(self.used()))
        return path

    def to_image(self, name, path, forbid=()):
        """Save the PNG and load it into Blender, packed (so the .glb embeds it)."""
        self.save_png(path, forbid)
        img = bpy.data.images.load(path, check_existing=False)
        img.name = name
        img.colorspace_settings.name = "sRGB"
        img.pack()
        return img


# --------------------------------------------------------------------------- scene
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.images,
                 bpy.data.cameras, bpy.data.lights):
        for item in list(coll):
            coll.remove(item)


def _principled(mat):
    try:
        mat.use_nodes = True
    except Exception:
        pass
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    out = next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"), None)
    if out is None:
        out = nt.nodes.new("ShaderNodeOutputMaterial")
    if bsdf is None:
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        nt.links.new(bsdf.outputs[0], out.inputs[0])
    bsdf.inputs["Roughness"].default_value = 1.0
    bsdf.inputs["Metallic"].default_value = 0.0
    return nt, bsdf


def atlas_material(name, image):
    """Principled BSDF, Base Color from the pixel atlas (Closest), roughness 1, metal 0."""
    mat = bpy.data.materials.new(name)
    nt, bsdf = _principled(mat)
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation = "Closest"
    tex.location = (-400, 200)
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def emissive_material(name, idx, strength=1.0):
    """Solid palette colour, emissive in the same colour (the renderer recolours it)."""
    mat = bpy.data.materials.new(name)
    nt, bsdf = _principled(mat)
    bsdf.inputs["Base Color"].default_value = lin(idx)
    bsdf.inputs["Emission Color"].default_value = lin(idx)
    bsdf.inputs["Emission Strength"].default_value = strength
    mat.diffuse_color = lin(idx)
    return mat


def empty(name, location=(0, 0, 0), parent=None, display="PLAIN_AXES", size=0.1):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_type = display
    ob.empty_display_size = size
    ob.location = location
    bpy.context.scene.collection.objects.link(ob)
    if parent is not None:
        ob.parent = parent
    return ob


# --------------------------------------------------------------------------- geometry
def newell(pts):
    n = Vector((0.0, 0.0, 0.0))
    for i, p in enumerate(pts):
        q = pts[(i + 1) % len(pts)]
        n.x += (p.y - q.y) * (p.z + q.z)
        n.y += (p.z - q.z) * (p.x + q.x)
        n.z += (p.x - q.x) * (p.y + q.y)
    return n


def face_frame(n, up=None):
    """(right, up) unit vectors of a face seen from outside. Texture-up is +Z for walls,
    +X (the model's front) for floors/ceilings, unless `up` is given."""
    n = n.normalized()
    if up is None:
        up_ref = Vector((1, 0, 0)) if abs(n.z) > 0.7 else Vector((0, 0, 1))
    else:
        up_ref = Vector(up)
    right = up_ref.cross(n)
    if right.length < 1e-6:
        right = Vector((0, 1, 0)).cross(n)
    right.normalize()
    upv = n.cross(right).normalized()
    return right, upv


class MeshBuilder:
    """Builds one mesh face by face. Faces never share vertices (flat shading, exact
    per-face UVs). Coordinates are model space; to_object() re-bases them on the origin."""

    def __init__(self, atlas=ATLAS):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.atlas = atlas
        self.density = []

    # -- UV helpers
    def _tex_to_uv(self, tx, ty):
        return (tx / self.atlas, 1.0 - ty / self.atlas)

    def face(self, pts, rect=None, outward=None, mat=0, up=None, bounds=None,
             flip_u=False, flip_v=False, rot=0, tex=None, inset=0.02, tag=None):
        """Add a polygon. `outward` (vector) fixes the winding. UVs:
          rect=(x, y, w, h) atlas texels -> planar projection of the face onto the rect
                (bounds=(s0, s1, t0, t1) in metres overrides the face's own extent),
          tex=[(tx, ty), ...] explicit texel coords per vertex (in the given order).
        rot=90/180/270 rotates the image on the face; flip_u/flip_v mirror it."""
        pts = [Vector(p) for p in pts]
        n = newell(pts)
        if outward is not None and n.dot(Vector(outward)) < 0:
            pts.reverse()
            if tex is not None:
                tex = list(reversed(tex))
            n = -n
        verts = [self.bm.verts.new(p) for p in pts]
        f = self.bm.faces.new(verts)
        f.material_index = mat
        f.smooth = False
        if tex is not None:
            for loop, (tx, ty) in zip(f.loops, tex):
                loop[self.uv].uv = self._tex_to_uv(tx, ty)
        elif rect is not None:
            right, upv = face_frame(n, up)
            st = [(p.dot(right), p.dot(upv)) for p in pts]
            if bounds is None:
                s0, s1 = min(s for s, _ in st), max(s for s, _ in st)
                t0, t1 = min(t for _, t in st), max(t for _, t in st)
            else:
                s0, s1, t0, t1 = bounds
            x, y, w, h = rect
            ex = inset  # keep samples a hair inside the rect (no bleeding)
            for loop, (s, t) in zip(f.loops, st):
                a = (s - s0) / (s1 - s0) if s1 > s0 else 0.5
                b = (t - t0) / (t1 - t0) if t1 > t0 else 0.5
                if flip_u:
                    a = 1 - a
                if flip_v:
                    b = 1 - b
                for _ in range(int(rot // 90) % 4):
                    a, b = b, 1 - a
                tx = x + ex + a * (w - 2 * ex)
                ty = y + ex + (1 - b) * (h - 2 * ex)
                loop[self.uv].uv = self._tex_to_uv(tx, ty)
            if tag:
                ww, hh = (w, h) if int(rot // 90) % 2 == 0 else (h, w)
                self.density.append((tag, ww / max(s1 - s0, 1e-6), hh / max(t1 - t0, 1e-6)))
        return f

    def box(self, x0, x1, y0, y1, z0, z1, rects, mat=0, **kw):
        """Axis-aligned box. rects: {'+x','-x','+y','-y','+z','-z'} -> rect or dict of
        face() kwargs; missing sides are not built."""
        P = {
            "+x": ([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], (1, 0, 0)),
            "-x": ([(x0, y1, z0), (x0, y0, z0), (x0, y0, z1), (x0, y1, z1)], (-1, 0, 0)),
            "+y": ([(x1, y1, z0), (x0, y1, z0), (x0, y1, z1), (x1, y1, z1)], (0, 1, 0)),
            "-y": ([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], (0, -1, 0)),
            "+z": ([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], (0, 0, 1)),
            "-z": ([(x0, y1, z0), (x1, y1, z0), (x1, y0, z0), (x0, y0, z0)], (0, 0, -1)),
        }
        out = {}
        for side, spec in rects.items():
            if spec is None:
                continue
            pts, n = P[side]
            opts = dict(kw)
            if isinstance(spec, dict):
                opts.update(spec)
            else:
                opts["rect"] = spec
            opts.setdefault("mat", mat)
            out[side] = self.face(pts, outward=n, **opts)
        return out

    @staticmethod
    def _axis_map(axis):
        # profile (a, b) + extrusion c -> xyz
        if axis == "y":    # side profile in XZ, extruded along Y
            return lambda a, b, c: (a, c, b), (0, 1, 0)
        if axis == "x":    # cross-section in YZ, extruded along X
            return lambda a, b, c: (c, a, b), (1, 0, 0)
        if axis == "z":    # plan in XY, extruded along Z
            return lambda a, b, c: (a, b, c), (0, 0, 1)
        raise ValueError(axis)

    def prism(self, profile, axis, c0, c1, side=None, cap0=None, cap1=None, mat=0):
        """Extrude a 2D polygon `profile` [(a, b), ...] along `axis` from c0 to c1.
        side(i, (a0,b0), (a1,b1)) -> rect / face-kwargs dict / None (skip) for edge i.
        cap0 / cap1: rect or kwargs for the end caps at c0 / c1 (None = no cap)."""
        to3, ax = self._axis_map(axis)
        prof = list(profile)
        area = sum(prof[i][0] * prof[(i + 1) % len(prof)][1] - prof[(i + 1) % len(prof)][0] * prof[i][1]
                   for i in range(len(prof)))
        if area < 0:
            prof.reverse()
            remap = list(reversed(range(len(profile))))
        else:
            remap = list(range(len(profile)))
        faces = []
        nP = len(prof)
        for i in range(nP):
            (a0, b0), (a1, b1) = prof[i], prof[(i + 1) % nP]
            # edge index in the caller's original order
            oi = remap[i] if area >= 0 else remap[(i + 1) % nP]
            spec = side(oi, profile[oi], profile[(oi + 1) % nP]) if side else None
            if spec is None:
                continue
            da, db = a1 - a0, b1 - b0
            o2 = to3(db, -da, 0.0)
            pts = [to3(a0, b0, c0), to3(a1, b1, c0), to3(a1, b1, c1), to3(a0, b0, c1)]
            opts = dict(spec) if isinstance(spec, dict) else {"rect": spec}
            opts.setdefault("mat", mat)
            faces.append(self.face(pts, outward=o2, **opts))
        for c, spec, sgn in ((c0, cap0, -1), (c1, cap1, 1)):
            if spec is None:
                continue
            pts = [to3(a, b, c) for a, b in prof]
            opts = dict(spec) if isinstance(spec, dict) else {"rect": spec}
            opts.setdefault("mat", mat)
            faces.append(self.face(pts, outward=tuple(sgn * v for v in ax), **opts))
        return faces

    def lathe(self, profile, sides=8, center=(0.0, 0.0), bands=None, cap_front=None,
              cap_back=None, mat=0, phase=None):
        """Solid of revolution around the X axis. profile: [(x, r), ...] front to back.
        bands[j] = dict(out='r+'|'r-'|'x+'|'x-', rect=(x, y, w, h) strip whose width is
        split into `sides` columns, rows mapped along the band) or None to skip band j.
        cap_front / cap_back: rect for a flat polygon cap at the first / last point
        (only if its radius > 0). Faces sit flat on top/bottom/sides (phase 22.5 deg)."""
        cy, cz = center
        if phase is None:
            phase = math.pi / sides
        ang = [phase + 2 * math.pi * k / sides for k in range(sides)]

        def P(x, r, k):
            a = ang[k % sides]
            return (x, cy + r * math.cos(a), cz + r * math.sin(a))

        faces = []
        for j in range(len(profile) - 1):
            spec = bands[j] if bands else None
            if spec is None:
                continue
            (xa, ra), (xb, rb) = profile[j], profile[j + 1]
            rx, ry, rw, rh = spec["rect"]
            rep = spec.get("repeat", False)  # every face maps the whole rect
            cw = rw if rep else rw / sides
            for k in range(sides):
                am = (ang[k] + ang[(k + 1) % sides] + (2 * math.pi if k == sides - 1 else 0)) / 2
                radial = Vector((0, math.cos(am), math.sin(am)))
                o = spec.get("out", "r+")
                outward = {"r+": radial, "r-": -radial, "x+": Vector((1, 0, 0)),
                           "x-": Vector((-1, 0, 0))}[o]
                pts = [P(xa, ra, k), P(xa, ra, k + 1), P(xb, rb, k + 1), P(xb, rb, k)]
                e = 0.02
                kk = 0 if rep else k
                u0, u1 = rx + kk * cw + e, rx + (kk + 1) * cw - e
                v0, v1 = ry + e, ry + rh - e
                # u grows with the angle; the band's first profile point is the rect top
                tex = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
                if spec.get("flip_v"):
                    tex = [(u0, v1), (u1, v1), (u1, v0), (u0, v0)]
                faces.append(self.face(pts, outward=outward, tex=tex, mat=spec.get("mat", mat)))
        for spec, (x, r), sgn in ((cap_front, profile[0], 1), (cap_back, profile[-1], -1)):
            if spec is None or r <= 0:
                continue
            pts = [P(x, r, k) for k in range(sides)]
            opts = dict(spec) if isinstance(spec, dict) else {"rect": spec}
            opts.setdefault("mat", mat)
            faces.append(self.face(pts, outward=(sgn, 0, 0), up=(0, 0, 1), **opts))
        return faces

    def tris(self):
        return sum(len(f.verts) - 2 for f in self.bm.faces)

    def to_object(self, name, materials, origin=(0, 0, 0), parent=None):
        """Create the mesh object. Vertex coordinates are model space; the object's
        origin is put at `origin` (mesh data is re-based so nothing moves)."""
        bm = self.bm
        big = [f for f in bm.faces if len(f.verts) > 4]
        if big:
            bmesh.ops.triangulate(bm, faces=big, quad_method="BEAUTY", ngon_method="EAR_CLIP")
        o = Vector(origin)
        for v in bm.verts:
            v.co -= o
        bm.normal_update()
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        for p in me.polygons:
            p.use_smooth = False
        for m in materials:
            me.materials.append(m)
        ob = bpy.data.objects.new(name, me)
        ob.location = o
        bpy.context.scene.collection.objects.link(ob)
        if parent is not None:
            ob.parent = parent
        if ob.name != name:
            NODE_RENAME[ob.name] = name
        log("mesh %-12s %4d tris" % (name, tri_count(ob)))
        return ob


def tri_count(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def report(root):
    """Print the hierarchy, triangle counts and world bounds; returns total tris."""
    total = 0
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    bpy.context.view_layer.update()
    for ob in [root] + list(root.children_recursive):
        if ob.type == "MESH":
            t = tri_count(ob)
            total += t
            for v in ob.data.vertices:
                w = ob.matrix_world @ v.co
                lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
                hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
            mats = [m.name for m in ob.data.materials]
            log("  node %-12s mesh  %4d tris  origin %s  mats %s" % (
                ob.name, t, tuple(round(c, 3) for c in ob.location), mats))
        else:
            log("  node %-12s %s  origin %s" % (ob.name, ob.type.lower(),
                                                 tuple(round(c, 3) for c in ob.location)))
    log("TOTAL %s: %d tris; bounds x[%.3f, %.3f] y[%.3f, %.3f] z[%.3f, %.3f]" % (
        root.name, total, lo.x, hi.x, lo.y, hi.y, lo.z, hi.z))
    return total, lo, hi


# --------------------------------------------------------------------------- export
def export_glb(name):
    os.makedirs(MODELS_DIR, exist_ok=True)
    path = os.path.join(MODELS_DIR, name + ".glb")
    wanted = dict(
        filepath=path, export_format="GLB", export_yup=True, export_apply=True,
        export_texcoords=True, export_normals=True, export_tangents=False,
        export_materials="EXPORT", export_image_format="AUTO", export_cameras=False,
        export_lights=False, export_extras=False, export_animations=False,
        export_skins=False, export_morph=False, use_selection=False, use_visible=False,
        export_vertex_color="NONE",
    )
    props = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    kwargs = {k: v for k, v in wanted.items() if k in props}
    bpy.ops.export_scene.gltf(**kwargs)
    if NODE_RENAME:
        patch_glb_node_names(path, NODE_RENAME)
    log("exported", os.path.relpath(path, ROOT), os.path.getsize(path), "bytes")
    return path


def read_glb(path):
    """-> (json dict, bin bytes)"""
    with open(path, "rb") as f:
        data = f.read()
    magic, version, length = struct.unpack("<4sII", data[:12])
    assert magic == b"glTF" and version == 2, (magic, version)
    pos, doc, binc = 12, None, b""
    while pos < length:
        clen, ctype = struct.unpack("<I4s", data[pos:pos + 8])
        chunk = data[pos + 8:pos + 8 + clen]
        if ctype == b"JSON":
            doc = json.loads(chunk.decode("utf-8"))
        elif ctype == b"BIN\x00":
            binc = chunk
        pos += 8 + clen
    return doc, binc


def write_glb(path, doc, binc):
    js = json.dumps(doc, separators=(",", ":")).encode("utf-8")
    js += b" " * ((4 - len(js) % 4) % 4)
    out = struct.pack("<I4s", len(js), b"JSON") + js
    if binc:
        binc = binc + b"\x00" * ((4 - len(binc) % 4) % 4)
        out += struct.pack("<I4s", len(binc), b"BIN\x00") + binc
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, 12 + len(out)) + out)


def patch_glb_node_names(path, mapping):
    doc, binc = read_glb(path)
    for node in doc.get("nodes", []):
        if node.get("name") in mapping:
            log("node rename %s -> %s" % (node["name"], mapping[node["name"]]))
            node["name"] = mapping[node["name"]]
    write_glb(path, doc, binc)


def import_glb(path, parent_to=None):
    """Import a .glb (e.g. booster for a preview); returns the new top-level objects."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    tops = [o for o in new if o.parent is None or o.parent not in new]
    if parent_to is not None:
        for o in tops:
            mw = o.matrix_world.copy()
            o.parent = parent_to
            o.matrix_world = parent_to.matrix_world @ mw
    return new


# --------------------------------------------------------------------------- previews
def setup_preview(sun=2.6, ambient=0.55, sun_dir=(-0.55, -0.35, -0.75),
                  world_color=(0.32, 0.30, 0.34)):
    """EEVEE, Standard view transform, sun from the upper left of the default view +
    flat ambient world light. Textures already sample with Closest."""
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except TypeError:
        scene.render.engine = "BLENDER_WORKBENCH"
    scene.view_settings.view_transform = "Standard"
    try:
        scene.view_settings.look = "None"
    except Exception:
        pass
    scene.render.film_transparent = False
    try:
        scene.render.filter_size = 0.5
    except Exception:
        pass
    try:
        scene.eevee.taa_render_samples = 16
    except Exception:
        pass
    world = bpy.data.worlds.new("preview_world")
    scene.world = world
    try:
        world.use_nodes = True
    except Exception:
        pass
    bgn = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    # ambient light (and the backdrop) = world colour * strength, neutral-ish
    bgn.inputs[0].default_value = (world_color[0], world_color[1], world_color[2], 1.0)
    bgn.inputs[1].default_value = ambient
    ld = bpy.data.lights.new("preview_sun", "SUN")
    ld.energy = sun
    ld.angle = 0.0
    try:
        ld.use_shadow = True
    except Exception:
        pass
    lo = bpy.data.objects.new("preview_sun", ld)
    scene.collection.objects.link(lo)
    lo.rotation_euler = Vector(sun_dir).to_track_quat("-Z", "Y").to_euler()
    cd = bpy.data.cameras.new("preview_cam")
    co = bpy.data.objects.new("preview_cam", cd)
    scene.collection.objects.link(co)
    scene.camera = co
    return co, lo


def _bounds_of(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for ob in objs:
        if ob.type != "MESH":
            continue
        for v in ob.data.vertices:
            w = ob.matrix_world @ v.co
            lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
            hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
    return lo, hi


def render_view(path, direction=(1.0, 1.0, 0.65), size=(512, 512), lens=55.0,
                cam_loc=None, look_at=None, fov_deg=None, margin=1.08, objs=None,
                sun_dir=None, clip_start=0.01, fit="AUTO"):
    """Render a preview PNG. Default: 3/4 view from the front-left (+X front, +Y left),
    slightly above, framed on the model's bounds. Or pass cam_loc + look_at."""
    scene = bpy.context.scene
    cam = scene.camera
    bpy.context.view_layer.update()
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    cam.data.clip_start = clip_start
    cam.data.clip_end = 200
    cam.data.sensor_fit = fit   # "VERTICAL" makes fov_deg a vertical FOV (three.js style)
    if fov_deg is not None:
        cam.data.lens_unit = "FOV"
        cam.data.angle = math.radians(fov_deg)
    else:
        cam.data.lens = lens
    if cam_loc is None:
        objs = objs or [o for o in scene.objects if o.type == "MESH"]
        lo, hi = _bounds_of(objs)
        c = (lo + hi) / 2
        r = (hi - lo).length / 2
        d = Vector(direction).normalized()
        fov = cam.data.angle if fov_deg is None else math.radians(fov_deg)
        if size[0] < size[1]:
            fov = 2 * math.atan(math.tan(fov / 2) * size[0] / size[1])
        dist = r / math.sin(fov / 2) * margin
        cam.location = c + d * dist
        target = c
    else:
        cam.location = Vector(cam_loc)
        target = Vector(look_at)
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    sun = bpy.data.objects.get("preview_sun")
    if sun is not None:
        if sun_dir is None:
            # light from behind the camera's upper-left shoulder
            f = (target - cam.location).normalized()
            r = f.cross(Vector((0, 0, 1)))
            r = r.normalized() if r.length > 1e-6 else Vector((1, 0, 0))
            u = r.cross(f).normalized()
            L = -f * 0.55 + u * 0.75 - r * 0.45   # direction toward the light
            sun_dir = -L
        sun.rotation_euler = Vector(sun_dir).to_track_quat("-Z", "Y").to_euler()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    scene.render.filepath = path
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
    log("preview", os.path.relpath(path, ROOT))
    return path


def preview_path(name):
    return os.path.join(PREVIEW_DIR, name + ".png")


def tex_path(family, name=None):
    return os.path.join(ART_DIR, family, (name or family) + ".png")
