"""Stacks of strapped crushed-scrap bales, shared by the pillar's family of obstacles (the post,
the tower and Jaw Yard's blocks). Not a build script. Each bale side is cut into roughly 0.8 m
faces that all map the bale tile (arena_atlas.R_BALE, 0.8 x 0.7 m), mirrored alternately so a long
side doesn't look stamped.
"""
import math

import arena_atlas as A


def bale(mb, cx, cy, hx, hy, z0, z1, twist_deg=0.0, seed=0, top=True):
    """One bale: a box from z0 to z1 centred on (cx, cy), half sizes hx, hy, turned by twist."""
    t = math.radians(twist_deg)
    ct, st = math.cos(t), math.sin(t)

    def P(lx, ly, z):
        return (cx + lx * ct - ly * st, cy + lx * st + ly * ct, z)
    corners = [(hx, -hy), (hx, hy), (-hx, hy), (-hx, -hy)]   # CCW from +x/-y
    for k in range(4):
        (ax, ay), (bx, by) = corners[k], corners[(k + 1) % 4]
        mx, my = (ax + bx) / 2, (ay + by) / 2
        out = (mx * ct - my * st, mx * st + my * ct, 0.0)
        n = max(1, round(math.hypot(bx - ax, by - ay) / 0.8))
        for h in range(n):
            f0, f1 = h / n, (h + 1) / n
            p0 = (ax + (bx - ax) * f0, ay + (by - ay) * f0)
            p1 = (ax + (bx - ax) * f1, ay + (by - ay) * f1)
            pts = [P(p0[0], p0[1], z0), P(p1[0], p1[1], z0), P(p1[0], p1[1], z1), P(p0[0], p0[1], z1)]
            mb.face(pts, outward=out, rect=A.R_BALE, flip_u=bool((h + k + seed) % 2))
    if top:
        # the top in tiles too, so a big bale's top keeps its texel size
        nx, ny = max(1, round(2 * hx / 0.8)), max(1, round(2 * hy / 0.8))
        for i in range(nx):
            for j in range(ny):
                x0, x1 = -hx + 2 * hx * i / nx, -hx + 2 * hx * (i + 1) / nx
                y0, y1 = -hy + 2 * hy * j / ny, -hy + 2 * hy * (j + 1) / ny
                mb.face([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], outward=(0, 0, 1), rect=A.R_BALE_TOP,
                        rot=90 * ((i + j + seed) % 4))
