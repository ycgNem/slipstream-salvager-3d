"""Verify every exported model against the art contract, then render an arena overview.

Run by scripts/build-models.mjs after all build scripts (or by hand:
  blender --background --factory-startup --python-exit-code 1 --python art/_lib/verify_models.py)

Reads each .glb's JSON directly (Blender would rename duplicate node names on import), and
checks: node names + hierarchy, mesh/empty kinds, triangle budgets, material names,
emissive colours, nearest-filtered samplers, origins, and that every texel of every
embedded texture is a Resurrect 64 colour obeying the colour language.
Exits non-zero (raises) on any failure.
"""
import os
import struct
import sys
import zlib

sys.dont_write_bytecode = True  # keep art/ free of __pycache__
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pix  # noqa: E402

# name -> (kind, Blender-space origin or None)
SPEC = {
    "rammer": dict(
        nodes={"rammer": ("empty", (0, 0, 0)), "body": ("mesh", (0, 0, 0)), "eyes": ("mesh", None),
               "mount_rear": ("empty", (-0.55, 0, 0.5))},
        budget=450, part=300, materials={"rammer_atlas", "rammer_eyes"},
        emissive={"rammer_eyes": 15}, texture_forbid=pix.SALVAGE),
    "booster": dict(
        nodes={"booster": ("empty", (0, 0, 0)), "shell": ("mesh", (0, 0, 0)),
               "nozzle_glow": ("mesh", None)},
        budget=200, part=300, materials={"booster_atlas", "booster_glow"},
        emissive={"booster_glow": 16}, texture_forbid=pix.DANGER),
    "scrapper": dict(
        nodes={"scrapper": ("empty", (0, 0, 0)), "body": ("mesh", (0, 0, 0)),
               "tread_l": ("mesh", None), "tread_r": ("mesh", None),
               "mount_rear": ("empty", None), "claw_root": ("empty", None)},
        budget=350, part=300, materials={"scrapper_atlas"}, emissive={},
        texture_forbid=pix.DANGER | pix.SALVAGE),
    "claw": dict(
        nodes={"claw": ("empty", (0, 0, 0)), "arm": ("mesh", (0, 0, 0)),
               "jaw_l": ("mesh", (0.38, 0.05, 0)), "jaw_r": ("mesh", (0.38, -0.05, 0)),
               "glow": ("mesh", None)},
        budget=300, part=300, materials={"claw_atlas", "claw_glow"},
        emissive={"claw_glow": 7}, texture_forbid=pix.DANGER | pix.SALVAGE),
    "pillar": dict(nodes={"pillar": ("empty", (0, 0, 0)), "pillar/": ("mesh", (0, 0, 0))},
                   budget=150, part=150, materials={"arena_atlas"}, emissive={},
                   texture_forbid=pix.DANGER | pix.SALVAGE),
    "wall": dict(nodes={"wall": ("empty", (0, 0, 0)), "wall/": ("mesh", (0, 0, 0))},
                 budget=60, part=60, materials={"arena_atlas"}, emissive={},
                 texture_forbid=pix.DANGER | pix.SALVAGE),
    "gate": dict(
        nodes={"gate": ("empty", (0, 0, 0)), "frame": ("mesh", (0, 0, 0)),
               "door_l": ("mesh", (-0.4, 0, 0)), "door_r": ("mesh", (0.4, 0, 0)),
               "lamp": ("mesh", None)},
        budget=250, part=250, materials={"arena_atlas", "gate_lamp"},
        emissive={"gate_lamp": 15}, texture_forbid=pix.DANGER | pix.SALVAGE),
    "floor": dict(nodes={"floor": ("empty", (0, 0, 0)), "floor/": ("mesh", (0, 0, 0))},
                  budget=2, part=2, materials={"floor_tile"}, emissive={},
                  texture_forbid=pix.DANGER | pix.SALVAGE),
}
PAL_RGB = {c: i for i, c in enumerate(pix.PAL)}
FAILS = []


def fail(msg):
    FAILS.append(msg)
    print("[verify] FAIL", msg)


def decode_png(data):
    """Minimal PNG decoder (8-bit greyscale/RGB/RGBA, non-interlaced) -> (w, h, [(r,g,b)])."""
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    pos, idat = 8, b""
    while pos < len(data):
        L, tag = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + L]
        if tag == b"IHDR":
            w, h, depth, ctype, _, _, inter = struct.unpack(">IIBBBBB", body)
        elif tag == b"IDAT":
            idat += body
        pos += 12 + L
    assert depth == 8 and inter == 0, (depth, inter)
    bpp = {0: 1, 2: 3, 4: 2, 6: 4}[ctype]
    raw = zlib.decompress(idat)
    stride = w * bpp
    prev = bytearray(stride)
    out = []
    p = 0
    for _ in range(h):
        f = raw[p]
        line = bytearray(raw[p + 1:p + 1 + stride])
        p += 1 + stride
        for i in range(stride):
            a = line[i - bpp] if i >= bpp else 0
            b = prev[i]
            c = prev[i - bpp] if i >= bpp else 0
            if f == 1:
                line[i] = (line[i] + a) & 255
            elif f == 2:
                line[i] = (line[i] + b) & 255
            elif f == 3:
                line[i] = (line[i] + (a + b) // 2) & 255
            elif f == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pr = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
        for x in range(w):
            px = line[x * bpp:(x + 1) * bpp]
            out.append((px[0], px[0], px[0]) if bpp in (1, 2) else (px[0], px[1], px[2]))
        prev = line
    return w, h, out


def tris_of_mesh(doc, mi):
    t = 0
    for prim in doc["meshes"][mi]["primitives"]:
        mode = prim.get("mode", 4)
        assert mode == 4, "non-triangle primitive"
        if "indices" in prim:
            t += doc["accessors"][prim["indices"]]["count"] // 3
        else:
            t += doc["accessors"][prim["attributes"]["POSITION"]]["count"] // 3
    return t


def to_blender(v):
    """glTF (x, y, z) Y-up -> Blender (x, -z, y)."""
    return (v[0], -v[2], v[1])


def check(name):
    spec = SPEC[name]
    path = os.path.join(pix.MODELS_DIR, name + ".glb")
    if not os.path.exists(path):
        fail("%s: missing %s" % (name, path))
        return 0
    size = os.path.getsize(path)
    doc, binc = pix.read_glb(path)
    nodes = doc.get("nodes", [])
    scene = doc["scenes"][doc.get("scene", 0)]
    roots = [nodes[i] for i in scene["nodes"]]
    if len(roots) != 1 or roots[0].get("name") != name:
        fail("%s: expected one root node named %r, got %r" % (name, name, [r.get("name") for r in roots]))
        return 0
    root = roots[0]
    kids = [nodes[i] for i in root.get("children", [])]
    found = {name: root}
    for k in kids:
        key = k.get("name")
        if key == name:
            key = name + "/"   # mesh child sharing the root's name
        found[key] = k
        if k.get("children"):
            fail("%s: node %s has children (parts must be flat under the root)" % (name, k.get("name")))
    if set(found) != set(spec["nodes"]):
        fail("%s: nodes %s != expected %s" % (name, sorted(found), sorted(spec["nodes"])))
    total = 0
    lines = []
    for key, (kind, origin) in spec["nodes"].items():
        n = found.get(key)
        if n is None:
            continue
        is_mesh = "mesh" in n
        if (kind == "mesh") != is_mesh:
            fail("%s: node %s should be %s" % (name, key, kind))
        if n.get("rotation") or n.get("scale"):
            rot = n.get("rotation", [0, 0, 0, 1])
            scl = n.get("scale", [1, 1, 1])
            if any(abs(a - b) > 1e-6 for a, b in zip(rot, [0, 0, 0, 1])) or \
               any(abs(a - 1) > 1e-6 for a in scl):
                fail("%s: node %s has unapplied rotation/scale" % (name, key))
        t = to_blender(n.get("translation", [0, 0, 0]))
        if key != name:
            # children of the root: root is identity, so translation == model-space origin
            pass
        if origin is not None and any(abs(a - b) > 1e-4 for a, b in zip(t, origin)):
            fail("%s: node %s origin %s != %s" % (name, key, t, origin))
        tri = tris_of_mesh(doc, n["mesh"]) if is_mesh else 0
        total += tri
        if tri > spec["part"]:
            fail("%s: part %s has %d tris > %d" % (name, key, tri, spec["part"]))
        mats = sorted({doc["materials"][p["material"]]["name"]
                       for p in doc["meshes"][n["mesh"]]["primitives"]}) if is_mesh else []
        lines.append("    %-12s %-5s %4s tris  origin (%.3f, %.3f, %.3f)  %s" % (
            n.get("name"), "mesh" if is_mesh else "empty", tri if is_mesh else "-",
            t[0], t[1], t[2], ",".join(mats)))
    if total > spec["budget"] or (name == "floor" and total != 2):
        fail("%s: %d tris over budget %d" % (name, total, spec["budget"]))
    mats = {m["name"] for m in doc.get("materials", [])}
    if mats != spec["materials"]:
        fail("%s: materials %s != %s" % (name, sorted(mats), sorted(spec["materials"])))
    for m in doc.get("materials", []):
        pbr = m.get("pbrMetallicRoughness", {})
        if pbr.get("metallicFactor", 1) != 0 or pbr.get("roughnessFactor", 1) != 1:
            fail("%s: material %s not metallic 0 / roughness 1" % (name, m["name"]))
        if m["name"] in spec["emissive"]:
            want = pix.lin(spec["emissive"][m["name"]])[:3]
            em = m.get("emissiveFactor", [0, 0, 0])
            bc = pbr.get("baseColorFactor", [1, 1, 1, 1])[:3]
            if any(abs(a - b) > 2e-3 for a, b in zip(em, want)) or \
               any(abs(a - b) > 2e-3 for a, b in zip(bc, want)):
                fail("%s: %s emissive/base %s/%s != %s" % (name, m["name"], em, bc, want))
        elif "baseColorTexture" not in pbr:
            fail("%s: atlas material %s has no base colour texture" % (name, m["name"]))
    for s in doc.get("samplers", []):
        if s.get("magFilter") != 9728:
            fail("%s: sampler magFilter %s is not NEAREST" % (name, s.get("magFilter")))
    if doc.get("cameras") or doc.get("extensions", {}).get("KHR_lights_punctual"):
        fail("%s: exported cameras or lights" % name)
    # embedded textures: palette + colour language
    for img in doc.get("images", []):
        bv = doc["bufferViews"][img["bufferView"]]
        data = binc[bv.get("byteOffset", 0):bv.get("byteOffset", 0) + bv["byteLength"]]
        w, h, px = decode_png(data)
        bad = {p for p in px if p not in PAL_RGB}
        if bad:
            fail("%s: texture %s has %d non-palette colours" % (name, img.get("name"), len(bad)))
        used = {PAL_RGB[p] for p in px if p in PAL_RGB}
        forbidden = used & (pix.TEAL | spec["texture_forbid"])
        if forbidden:
            fail("%s: texture %s uses forbidden indices %s" % (name, img.get("name"), sorted(forbidden)))
        lines.append("    texture %s %dx%d, %d palette colours %s" % (
            img.get("name"), w, h, len(used), sorted(used)))
    print("[verify] %-8s %4d tris  %6d bytes  materials %s" % (name, total, size, ",".join(sorted(mats))))
    for ln in lines:
        print("[verify]" + ln)
    return total


def overview():
    """Arena overview render with every model, for eyeballing contrast and scale."""
    import bpy
    import math
    pix.reset_scene()
    M = pix.MODELS_DIR

    def place(name, loc, rot_deg=0.0):
        objs = pix.import_glb(os.path.join(M, name + ".glb"))
        root = [o for o in objs if o.parent is None][0]
        root.location = loc
        root.rotation_euler = (0, 0, math.radians(rot_deg))
        return root, objs

    for i in range(-3, 3):
        for j in range(-3, 3):
            place("floor", (0.8 + 1.6 * i, 0.8 + 1.6 * j, 0))
    for k in range(-5, 6):
        x = 0.8 * k
        if abs(x) > 1.0:
            place("wall", (x, 5.2, 0))
    place("gate", (0, 5.2, 0))
    place("pillar", (-2.6, 1.6, 0))
    r, _ = place("rammer", (1.4, 1.6, 0), rot_deg=-120)
    mount = [o for o in r.children_recursive if o.name.startswith("mount_rear")][0]
    pix.import_glb(os.path.join(M, "booster.glb"), parent_to=mount)
    place("booster", (-0.3, -0.6, 0.19), rot_deg=200)
    s, _ = place("scrapper", (-1.0, -2.3, 0), rot_deg=60)
    croot = [o for o in s.children_recursive if o.name.startswith("claw_root")][0]
    pix.import_glb(os.path.join(M, "claw.glb"), parent_to=croot)
    pix.setup_preview()
    pix.render_view(os.path.join(pix.PREVIEW_DIR, "arena-overview.png"), cam_loc=(3.2, -6.5, 3.4),
                    look_at=(-0.2, 1.4, 0.3), fov_deg=50, fit="VERTICAL", size=(640, 360))
    pix.render_view(os.path.join(pix.PREVIEW_DIR, "arena-eye.png"), cam_loc=(0.4, -4.2, 0.55),
                    look_at=(0.6, 4.0, 0.55), fov_deg=70, fit="VERTICAL", size=(640, 360),
                    clip_start=0.05)


def main():
    totals = {n: check(n) for n in SPEC}
    combo = totals.get("rammer", 0) + totals.get("booster", 0)
    print("[verify] rammer + booster = %d tris (budget 600)" % combo)
    if combo > 600:
        fail("rammer + booster over 600 tris")
    if "--no-render" not in sys.argv:
        overview()
    if FAILS:
        raise SystemExit("[verify] %d failure(s)" % len(FAILS))
    print("[verify] all models OK")


main()
