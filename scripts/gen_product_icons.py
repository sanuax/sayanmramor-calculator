"""Product card scenes of the calculator (PRODUCT_ICONS in
sayanmramor-calculator.html), concept «Интерьер» (the owner, 2026-10-21).

Every product is modelled in centimetres and drawn in one isometric view
(30 degrees): x runs to the right and back, y to the left and back, z up; the
viewer sees the +x, +y and +z faces, and things are painted in the order they
are added (back to front). Each product stands in the corner of a dark room
lit by one warm light; walls a product needs (the panel's, the window's, the
fireplace's) are that room's walls. Stone carries a marble pattern: a few long
tapering veins that follow one slow direction, a fork or two and fine
hairlines, generated from a fixed seed per surface, so a run gives the same
scenes every time. A pattern on a strip (the worktop and its waterfall end,
the two clad walls) runs on across the corner.

Colours are written into the scenes (they are the scene's own lighting, not
page tokens); the card's background (--ps-bg) is the scenes' darkest tone.

Usage:
    python scripts/gen_product_icons.py sayanmramor-calculator.html   (rewrites PRODUCT_ICONS)
    python scripts/gen_product_icons.py preview.txt                   (writes the block only)
"""
import math, random, sys

C30, S30 = math.cos(math.radians(30)), 0.5


def proj(p):
    x, y, z = p
    return ((x - y) * C30, (x + y) * S30 - z)


def lerp(a, b, t):
    return a + (b - a) * t


def hexmix(c1, c2, t):
    a = [int(c1[i:i + 2], 16) for i in (1, 3, 5)]
    b = [int(c2[i:i + 2], 16) for i in (1, 3, 5)]
    return '#%02x%02x%02x' % tuple(round(lerp(a[i], b[i], t)) for i in range(3))


class Scene:
    def __init__(self):
        self.items = []

    # ---------------------------------------------------------------- solids
    def face(self, pts, mat, normal, tag=None, smooth=False):
        self.items.append(('face', [tuple(p) for p in pts], mat, normal, tag, smooth))

    def prism(self, base, z0, z1, mat, top_mat=None, side_mat=None, tag=None, smooth=False):
        """base: CCW polygon in the xy plane. Visible sides, back to front, then the top."""
        n = len(base)
        sides = []
        for i in range(n):
            (x1, y1), (x2, y2) = base[i], base[(i + 1) % n]
            nx, ny = (y2 - y1), -(x2 - x1)
            L = math.hypot(nx, ny) or 1
            nx, ny = nx / L, ny / L
            if nx + ny > 1e-6:
                sides.append(((x1 + x2) + (y1 + y2), [(x1, y1, z0), (x2, y2, z0), (x2, y2, z1), (x1, y1, z1)], (nx, ny, 0)))
        for _, pts, nrm in sorted(sides, key=lambda s: s[0]):
            self.face(pts, side_mat or mat, nrm, tag, smooth)
        if smooth:
            # one outline around the curved band instead of an edge per facet
            self.items.append(('band', [pts for _, pts, _ in sides]))
        self.face([(x, y, z1) for x, y in base], top_mat or mat, (0, 0, 1), tag)

    def box(self, x0, x1, y0, y1, z0, z1, mat, **kw):
        self.prism([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], z0, z1, mat, **kw)

    def line(self, pts, style):
        self.items.append(('line', [tuple(p) for p in pts], style))

    def poly(self, pts, style):
        self.items.append(('poly', [tuple(p) for p in pts], style))

    # ---------------------------------------------------------------- marble
    def veins(self, O, U, V, w, h, seed, density=1.0, mirror=False, segs=None, bold=1.0, clip=None):
        """Marble on the rectangle O + u*U + v*V (u in [0,w], v in [0,h], cm).
        segs: (u_start, O, U) for a strip wrapping several faces."""
        rnd = random.Random(seed)
        size = (w * h) ** 0.5
        theta = rnd.uniform(-0.75, 0.75)
        step = size / 90

        def march(c, ang0, amp, length=None):
            f1, f2 = rnd.uniform(0.5, 1.1), rnd.uniform(1.6, 2.8)
            p1, p2 = rnd.uniform(0, 6.3), rnd.uniform(0, 6.3)

            def ang(s):
                return ang0 + amp * math.sin(s / size * 6.283 * f1 + p1) + amp * 0.4 * math.sin(s / size * 6.283 * f2 + p2)
            sides = []
            for sign in ((1,) if length else (1, -1)):
                p, s, pts = list(c), 0.0, []
                while 0 <= p[0] <= w and 0 <= p[1] <= h and (length is None or s < length):
                    a = ang(s * sign)
                    p[0] += math.cos(a) * step * sign
                    p[1] += math.sin(a) * step * sign
                    s += step
                    pts.append(tuple(p))
                sides.append(pts)
            if length:
                return [tuple(c)] + sides[0]
            return sides[1][::-1] + [tuple(c)] + sides[0]

        def ribbon(pts, w0, taper_start=True):
            n = len(pts)
            fq, ph = rnd.uniform(1.0, 2.5), rnd.uniform(0, 6.3)
            L, R = [], []
            for i, (u, v) in enumerate(pts):
                t = i / max(n - 1, 1)
                prof = (0.22 + 0.78 * math.sin(math.pi * t) ** 0.7) if taper_start else (1 - t) ** 0.8
                wv = w0 * prof * (0.72 + 0.28 * math.sin(6.283 * fq * t + ph)) / 2
                j0, j1 = max(i - 1, 0), min(i + 1, n - 1)
                du, dv = pts[j1][0] - pts[j0][0], pts[j1][1] - pts[j0][1]
                ln = math.hypot(du, dv) or 1
                nu, nv = -dv / ln, du / ln
                L.append((u + nu * wv, v + nv * wv)); R.append((u - nu * wv, v - nv * wv))
            return L + R[::-1]

        lines, ribbons = [], []
        for k in range(max(1, round(density * size / 75))):
            c = (rnd.uniform(0.2, 0.8) * w, rnd.uniform(0.2, 0.8) * h)
            pts = march(c, theta + rnd.uniform(-0.25, 0.25), 0.32)
            if len(pts) < 6:
                continue
            w0 = size * 0.012 * bold * rnd.uniform(0.75, 1.2)
            ribbons.append(ribbon(pts, w0))
            lines.append((pts, 1.0, 'halo'))
            for _ in range(rnd.choice([1, 1, 2])):
                j = rnd.randrange(len(pts) // 4, max(len(pts) // 4 + 1, 3 * len(pts) // 4))
                br = march(pts[j], theta + rnd.choice([-1, 1]) * rnd.uniform(0.4, 0.7), 0.25, length=size * rnd.uniform(0.22, 0.4))
                if len(br) > 4:
                    ribbons.append(ribbon(br, w0 * 0.55, taper_start=False))
        for k in range(max(1, round(density * size / 55))):
            c = (rnd.uniform(0.1, 0.9) * w, rnd.uniform(0.1, 0.9) * h)
            pts = march(c, theta + rnd.uniform(-0.3, 0.3), 0.3, length=size * rnd.uniform(0.3, 0.6))
            if len(pts) > 4:
                lines.append((pts, rnd.uniform(0.5, 1.0), 'hair'))
        if mirror:
            lines += [([(w - u, v) for u, v in c], wt, kd) for c, wt, kd in lines]
            ribbons += [[(w - u, v) for u, v in r] for r in ribbons]

        def seg_of(u):
            k = 0
            for i, s in enumerate(segs):
                if u >= s[0]:
                    k = i
            return k

        def to3(u, v, k=None):
            if segs:
                us, O2, U2 = segs[seg_of(u) if k is None else k]
                return tuple(O2[i] + (u - us) * U2[i] + v * V[i] for i in range(3))
            return tuple(O[i] + u * U[i] + v * V[i] for i in range(3))

        out_lines = []
        for c, wt, kd in lines:
            run, last = [], None
            for u, v in c:
                k = seg_of(u) if segs else 0
                if last is not None and k != last and len(run) > 1:
                    out_lines.append((run, wt * bold, kd)); run = []
                run.append(to3(u, v)); last = k
            if len(run) > 1:
                out_lines.append((run, wt * bold, kd))
        out_rib = []
        for r in ribbons:
            if segs:
                n = len(r) // 2
                for k in range(len(segs)):
                    idx = [i for i in range(n) if seg_of((r[i][0] + r[-1 - i][0]) / 2) == k]
                    if len(idx) > 1:
                        out_rib.append([to3(*r[i], k=k) for i in idx] + [to3(*r[-1 - i], k=k) for i in idx[::-1]])
            else:
                out_rib.append([to3(u, v) for u, v in r])
        if clip is None and not segs:
            clip = [O, tuple(O[i] + w * U[i] for i in range(3)),
                    tuple(O[i] + w * U[i] + h * V[i] for i in range(3)), tuple(O[i] + h * V[i] for i in range(3))]
        self.items.append(('veins', out_lines, clip, out_rib))


# ---------------------------------------------------------------- the products
def ellipse3(cx, cy, z, r, n=48, a0=0, a1=2 * math.pi):
    return [(cx + r * math.cos(lerp(a0, a1, i / n)), cy + r * math.sin(lerp(a0, a1, i / n)), z) for i in range(n + 1)]


def ellipse3c_xz(cx, y, cz, r, n=48):
    return [(cx + r * math.cos(2 * math.pi * i / n), y, cz + r * math.sin(2 * math.pi * i / n)) for i in range(n + 1)]


def m_lestnitsa(s):
    """Лестница: марш из восьми ступеней, каменные проступи с выносом над подступенками."""
    N, d, h, W = 8, 26, 17, 84
    for i in range(N):
        yb = (N - i) * d
        z0, z1 = i * h, (i + 1) * h
        s.box(0, W, 0, yb, z0, z1 - 4, 'core')
        s.face([(0, yb, z0), (W, yb, z0), (W, yb, z1 - 4), (0, yb, z1 - 4)], 'stone2', (0, 1, 0))
        s.box(0, W, 0, yb + 2.5, z1 - 4, z1, 'stone')
        s.poly([(0, yb, z1 - 4), (W, yb, z1 - 4), (W, yb, z1 - 6.5), (0, yb, z1 - 6.5)], 'ao')
        s.veins((0, yb + 2.5, z1), (1, 0, 0), (0, -1, 0), W, d + 2.5, 100 + i, density=0.35)


def m_panno(s):
    """Панно: каменная плита на стене, раскладка «бабочкой» (зеркально от шва), подсветка из-за краёв."""
    s.box(0, 150, -6, 0, 0, 112, 'wall', tag='roomwall')
    s.poly([(28, 0, 6), (122, 0, 6), (122, 0, 106), (28, 0, 106)], 'halo')
    s.box(34, 116, 0, 4, 12, 100, 'stone')
    s.veins((34, 4, 100), (1, 0, 0), (0, 0, -1), 82, 88, 3, density=1.1, mirror=True, bold=1.25)
    s.line([(75, 4, 100), (75, 4, 12)], 'seam')


def m_podokonnik(s):
    """Подоконник: проём в стене комнаты, свет из окна, плита выходит из проёма в комнату."""
    X0, X1, Z0, Z1 = 38, 112, 40, 104
    T = 26
    s.face([(X0, 7, Z0), (X1, 7, Z0), (X1, 7, Z1), (X0, 7, Z1)], 'glass', (0, 1, 0))
    s.line([((X0 + X1) / 2, 7, Z0), ((X0 + X1) / 2, 7, Z1)], 'frame')
    s.poly([(X0, 7, Z1), (X0 + 22, 7, Z1), (X0 + 4, 7, Z0 + 22), (X0, 7, Z0 + 26)], 'sky')
    s.face([(X0, 7, Z0), (X0, T, Z0), (X0, T, Z1), (X0, 7, Z1)], 'wall', (1, 0, 0))
    s.box(X0, X1, 6, T, Z0 - 4, Z0, 'stone')
    # the wall with its opening: the room's back wall is drawn instead, but its extent frames the scene
    s.face([(0, T, 0), (150, T, 0), (150, T, 118), (0, T, 118)], 'wall', (0, 1, 0), tag=('hole', [(X0, T, Z0 - 4), (X1, T, Z0 - 4), (X1, T, Z1), (X0, T, Z1)]))
    s.box(X0 - 8, X1 + 8, T, T + 9, Z0 - 4, Z0, 'stone')
    s.poly([(X0 - 8, T, Z0 - 4), (X1 + 8, T, Z0 - 4), (X1 + 8, T, Z0 - 8), (X0 - 8, T, Z0 - 8)], 'ao')
    s.veins((X0 - 8, T + 9, Z0), (1, 0, 0), (0, -1, 0), X1 - X0 + 16, 9 + T - 6, 5, density=0.9)


def m_pol(s):
    """Пол: квадрат из девяти крупных плит, рисунок камня проходит через швы."""
    L = 150
    s.box(0, L, 0, L, 0, 3, 'stone')
    s.veins((0, L, 3), (1, 0, 0), (0, -1, 0), L, L, 9, density=0.9)
    for i in (1, 2):
        s.line([(i * L / 3, 0, 3), (i * L / 3, L, 3)], 'joint')
        s.line([(0, i * L / 3, 3), (L, i * L / 3, 3)], 'joint')
    s.line([(L / 3, L, 0), (L / 3, L, 3)], 'joint'); s.line([(2 * L / 3, L, 0), (2 * L / 3, L, 3)], 'joint')
    s.line([(L, L / 3, 0), (L, L / 3, 3)], 'joint'); s.line([(L, 2 * L / 3, 0), (L, 2 * L / 3, 3)], 'joint')


def m_stena(s):
    """Стены: обе стены угла комнаты облицованы плитами, рисунок переходит через угол."""
    H, A, B = 120, 120, 100
    s.face([(0, 0.01, 0), (A, 0.01, 0), (A, 0.01, H), (0, 0.01, H)], 'stone', (0, 1, 0))
    s.face([(0.01, 0, 0), (0.01, B, 0), (0.01, B, H), (0.01, 0, H)], 'stone', (1, 0, 0))
    s.poly([(0.01, 0, 0), (0.01, 0, H), (4, 0, H), (4, 0, 0)], 'aoface')
    s.veins(None, None, (0, 0, -1), A + B, H, 12, density=1.0, bold=1.1,
            segs=[(0, (0.02, B, H), (0, -1, 0)), (B, (0, 0.02, H), (1, 0, 0))])
    for z in (H / 3, 2 * H / 3):
        s.line([(0, 0.02, z), (A, 0.02, z)], 'joint'); s.line([(0.02, 0, z), (0.02, B, z)], 'joint')
    s.line([(A / 2, 0.02, 0), (A / 2, 0.02, H)], 'joint')
    s.line([(0.02, B / 2, 0), (0.02, B / 2, H)], 'joint')


def m_fasad(s):
    """Фасад: двухэтажный дом в камне - цоколь, межэтажный пояс, карниз, окна с подоконниками."""
    W, D, H = 112, 82, 96
    s.box(-2, W + 2, -2, D + 2, 0, 14, 'stone2')
    s.box(0, W, 0, D, 14, H, 'stone')
    s.veins((0, D, H), (1, 0, 0), (0, 0, -1), W, H - 14, 31, density=0.55)
    s.veins((W, D, H), (0, -1, 0), (0, 0, -1), D, H - 14, 32, density=0.55)
    for z in (40, 72):
        s.line([(0, D, z), (W, D, z), (W, 0, z)], 'joint')
    s.box(-1, W + 1, -1, D + 1, 52, 55, 'stone')
    s.box(-4, W + 4, -4, D + 4, H, H + 5, 'stone2')
    s.box(-1.5, W + 1.5, -1.5, D + 1.5, H + 5, H + 8, 'stone2')
    for xc in (22, 56, 90):
        for z0 in (22, 62):
            s.face([(xc - 8, D, z0), (xc + 8, D, z0), (xc + 8, D, z0 + 22), (xc - 8, D, z0 + 22)], 'glass', (0, 1, 0))
            s.box(xc - 10, xc + 10, D, D + 2, z0 - 3, z0, 'stone2')
    for yc in (22, 60):
        for z0 in (22, 62):
            s.face([(W, yc + 8, z0), (W, yc - 8, z0), (W, yc - 8, z0 + 22), (W, yc + 8, z0 + 22)], 'glass', (1, 0, 0))
            s.box(W, W + 2, yc - 10, yc + 10, z0 - 3, z0, 'stone2')


def m_vannaya(s):
    """Столешница в ванную: подвесная плита с накладной раковиной, смеситель из стены, круглое зеркало с подсветкой, деревянный ящик."""
    s.box(-10, 140, -6, 0, 0, 130, 'wall', tag='roomwall')
    s.poly(ellipse3c_xz(65, 0.01, 104, 19), 'mirrorglow')
    s.poly(ellipse3c_xz(65, 0.02, 104, 17), 'mirror')
    s.box(14, 116, 0, 44, 42, 62, 'wood')
    s.line([(14, 44, 52), (116, 44, 52)], 'woodline')
    s.box(0, 130, 0, 52, 62, 66, 'stone')
    s.veins((0, 52, 66), (1, 0, 0), (0, -1, 0), 130, 52, 4, density=1.0)
    cx, cy = 62, 27
    outline = ellipse3(cx, cy, 77, 17, a0=-math.pi / 4, a1=3 * math.pi / 4) + ellipse3(cx, cy, 66, 12, a0=3 * math.pi / 4, a1=-math.pi / 4)
    s.poly(outline, 'ceramic_side')
    s.poly(ellipse3(cx, cy, 77, 17), 'ceramic_top')
    s.poly(ellipse3(cx, cy, 77, 14.5), 'ceramic_in')
    s.line([(cx - 2, 3, 92), (cx - 2, 10, 92), (cx - 2, 12, 88)], 'metal')


def m_kuhnya(s):
    """Столешница на кухню: остров на тёмных тумбах, камень сверху и ниспадающим торцом, мойка, смеситель, варочная панель."""
    L, D, H, t = 168, 66, 90, 4
    s.box(4, L - t, 3, D - 6, 8, H - t, 'dark')
    s.box(6, L - t, 5, D - 9, 0, 8, 'darker')
    for x in (44, 84, 124):
        s.line([(x, D - 6, 10), (x, D - 6, H - t - 2)], 'cabline')
    for x in (24, 64, 104, 144):
        s.line([(x - 8, D - 6, H - t - 8), (x + 8, D - 6, H - t - 8)], 'handle')
    s.box(L - t, L, 0, D, 0, H - t, 'stone')
    s.box(0, L, 0, D, H - t, H, 'stone')
    s.veins(None, None, (0, -1, 0), L + H - t, D, 21, density=0.9, bold=1.1,
            segs=[(0, (0, D, H), (1, 0, 0)), (L, (L, D, H), (0, 0, -1))])
    s.poly([(26, 18, H), (64, 18, H), (64, 46, H), (26, 46, H)], 'sink')
    s.poly([(28, 20, H), (62, 20, H), (62, 44, H), (28, 44, H)], 'sink_in')
    s.line([(45, 10, H), (45, 10, H + 18), (45, 22, H + 18), (45, 23, H + 14)], 'metal')
    s.poly([(92, 16, H), (140, 16, H), (140, 48, H), (92, 48, H)], 'cooktop')
    for cx, cy, r in ((104, 26, 7), (128, 26, 6), (104, 39, 6), (128, 39, 7)):
        s.line(ellipse3(cx, cy, H + 0.1, r), 'ring')


def m_stupeni(s):
    """Ступени: три широкие ступени крыльца, нижняя с радиусным передним краем."""
    W, d, h = 150, 32, 16
    arc = [(W / 2 + (W / 2) * math.cos(math.pi * i / 32), 3 * d + 16 * math.sin(math.pi * i / 32)) for i in range(33)]
    base = [(0, 0), (W, 0)] + arc
    s.prism(base, 0, h, 'stone', smooth=True)
    s.veins((0, 3 * d + 16, h), (1, 0, 0), (0, -1, 0), W, 3 * d + 16, 7, density=0.7,
            clip=[(x, y, h) for x, y in base])
    for i in (1, 2):
        yb = (3 - i) * d
        s.box(0, W, 0, yb, i * h, (i + 1) * h, 'stone')
        s.face([(0, yb, i * h), (W, yb, i * h), (W, yb, i * h + 1.6), (0, yb, i * h + 1.6)], 'aoface', (0, 1, 0))
        s.veins((0, yb, (i + 1) * h), (1, 0, 0), (0, -1, 0), W, yb, 20 + i, density=0.7)
        s.veins((0, yb, (i + 1) * h), (1, 0, 0), (0, 0, -1), W, h, 40 + i, density=0.35)


def m_kaminy(s):
    """Камины: портал с полкой на подиуме, тёмная топка с огнём."""
    W = 150
    s.box(-8, W + 8, -6, 0, 0, 132, 'wall', tag='roomwall')
    s.box(0, W, 0, 46, 0, 7, 'stone2')
    s.face([(34, 0.01, 7), (116, 0.01, 7), (116, 0.01, 84), (34, 0.01, 84)], 'firebox', (0, 1, 0))
    s.poly([(52, 0.02, 7), (98, 0.02, 7), (98, 0.02, 12), (52, 0.02, 12)], 'logs')
    s.poly([(56, 0.03, 12), (62, 0.03, 30), (66, 0.03, 20), (75, 0.03, 44), (82, 0.03, 22), (88, 0.03, 32), (94, 0.03, 12)], 'flame')
    s.face([(34, 0, 7), (34, 18, 7), (34, 18, 84), (34, 0, 84)], 'stone2', (1, 0, 0))
    s.box(10, 34, 0, 20, 7, 84, 'stone')
    s.box(116, 140, 0, 20, 7, 84, 'stone')
    s.box(10, 140, 0, 20, 84, 104, 'stone')
    s.veins((10, 20, 104), (1, 0, 0), (0, 0, -1), 130, 97, 44, density=0.8)
    s.box(2, 148, -2, 28, 104, 110, 'stone')
    s.poly([(10, 20, 104), (140, 20, 104), (140, 20, 101), (10, 20, 101)], 'ao')
    s.veins((2, 28, 110), (1, 0, 0), (0, -1, 0), 146, 30, 46, density=0.6)


PRODUCTS = [
    ('lestnitsa', m_lestnitsa), ('panno', m_panno), ('podokonnik', m_podokonnik), ('pol', m_pol),
    ('stena', m_stena), ('fasad', m_fasad), ('stoleshnitsa_vannaya', m_vannaya),
    ('stoleshnitsa_kuhnya', m_kuhnya), ('stupeni', m_stupeni), ('kaminy', m_kaminy),
]

# ---------------------------------------------------------------- rendering
# material -> (top, +y face (lit), +x face (shade))
PAL = {
    'stone': ('#f1eee8', '#dcd6ca', '#b6ae9f'),
    'stone2': ('#d9d2c5', '#c3bbac', '#9f978a'),
    'core': ('#7d7a73', '#6b6962', '#58564f'),
    'wall': ('#343a36', '#272d29', '#1f2421'),
    'dark': ('#3b413d', '#2c322e', '#222724'),
    'darker': ('#1a1e1c', '#161a18', '#121513'),
    'wood': ('#8b6a4c', '#76583d', '#5f4631'),
    'glass': ('#56665f', '#4f5f59', '#465550'),
    'firebox': ('#121513', '#121513', '#121513'),
}
BG, ROOM_BACK, ROOM_SIDE, ROOM_FLOOR, LIGHT = '#1e2320', '#272d29', '#1f2421', '#2f3632', '#f0c795'
EDGE, EDGE_W = 'rgba(0,0,0,0.25)', 0.2
VEIN, VEIN_HALO, VEIN_CORE, HAIR_OP, HAIR_W = '#8a8174', 0.08, 0.66, 0.45, 0.16
# 2D styles: (fill, stroke, stroke-width, opacity)
STY = {
    'ao': ('#000', None, 0, 0.3), 'aoface': ('#000', None, 0, 0.25),
    'halo': ('#f0c795', None, 0, 0.28), 'seam': (None, 'rgba(70,66,58,0.6)', 0.25, 1),
    'sky': ('#f6dcb8', None, 0, 0.3), 'frame': (None, '#8e908a', 0.8, 1),
    'mirrorglow': ('#f0c795', None, 0, 0.6), 'mirror': ('#4a5652', '#9a9c96', 0.35, 1),
    'woodline': (None, '#4a3726', 0.4, 1), 'ceramic_side': ('#e6e4de', None, 0, 1),
    'ceramic_top': ('#f7f6f2', None, 0, 1), 'ceramic_in': ('#c6c2b8', None, 0, 1),
    'metal': (None, '#9a9c96', 0.9, 1), 'cabline': (None, '#151917', 0.45, 1), 'handle': (None, '#c2a98e', 0.7, 1),
    'sink': ('#b3ac9e', None, 0, 1), 'sink_in': ('#8f897d', None, 0, 1), 'cooktop': ('#151917', None, 0, 1),
    'ring': (None, '#565b56', 0.35, 1), 'logs': ('#4a3726', None, 0, 1), 'flame': ('#f0b36f', None, 0, 1),
    'joint': (None, 'rgba(70,66,58,0.6)', 0.22, 1),
}
# where the room's walls stand (x plane, y plane); none listed = 40 cm behind the product
ROOM = {'panno': (-60, 0), 'stoleshnitsa_vannaya': (-60, 0), 'kaminy': (-60, 0), 'stena': (0, 0), 'podokonnik': (-60, 26)}
# a vertex that moves a scene by less than this (viewBox units, ~0.02 px on a card) is left out
SIMPLIFY = 0.01


def f(v):
    s = ('%.2f' % v).rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def simplify(pts, eps=SIMPLIFY):
    """Ramer-Douglas-Peucker on screen points."""
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy)
    best, idx = -1, 0
    for i in range(1, len(pts) - 1):
        px, py = pts[i]
        d = abs(dy * (px - x1) - dx * (py - y1)) / L if L else math.hypot(px - x1, py - y1)
        if d > best:
            best, idx = d, i
    if best <= eps:
        return [pts[0], pts[-1]]
    return simplify(pts[:idx + 1], eps)[:-1] + simplify(pts[idx:], eps)


def shade(mat, n):
    t, l, r = PAL[mat]
    if n[2] > 0.5:
        return t
    nx, ny = max(n[0], 0), max(n[1], 0)
    return hexmix(l, r, nx / (nx + ny) if nx + ny else 0.5)


def convex_hull(pts):
    pts = sorted(set((round(x, 3), round(y, 3)) for x, y in pts))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, hi = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(hi) >= 2 and cross(hi[-2], hi[-1], p) <= 0:
            hi.pop()
        hi.append(p)
    return lo[:-1] + hi[:-1]


def render(key, model):
    s = Scene()
    model(s)
    items = [it for it in s.items if not (it[0] == 'face' and it[4] == 'roomwall')]
    ids = [0]

    def uid(p):
        ids[0] += 1
        return 'pi-%s-%s%d' % (key, p, ids[0])

    # fit the product into the card, the room around it runs off the edges
    pts = [proj(p) for it in items if it[0] in ('face', 'poly', 'line') for p in it[1]]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    bx0, bx1, by0, by1 = min(xs), max(xs), min(ys), max(ys)
    ax0, ax1, ay0, ay1 = 18, 102, 9, 71
    sc = min((ax1 - ax0) / (bx1 - bx0), (ay1 - ay0) / (by1 - by0))
    ox = (ax0 + ax1) / 2 - (bx0 + bx1) / 2 * sc
    oy = (ay0 + ay1) / 2 - (by0 + by1) / 2 * sc

    def P(p):
        x, y = proj(p)
        return (ox + x * sc, oy + y * sc)

    def path(ps, close=True, simple=False):
        q = [P(p) for p in ps]
        if simple:
            q = simplify(q)
        return 'M' + ' '.join('%s %s' % (f(x), f(y)) for x, y in q) + ('Z' if close else '')

    out, defs = [], []
    out.append('<rect width="120" height="80" fill="%s"/>' % BG)
    # the room: floor, back wall, side wall; a warm pool of light on the floor and a wash on the back wall
    allx = [p[0] for it in items if it[0] == 'face' for p in it[1]]
    ally = [p[1] for it in items if it[0] == 'face' for p in it[1]]
    rx, ry = ROOM.get(key, (min(allx) - 40, min(ally) - 40))
    F = Z = 900
    out.append('<path fill="%s" d="%s"/>' % (ROOM_FLOOR, path([(rx, ry, 0), (rx + F, ry, 0), (rx + F, ry + F, 0), (rx, ry + F, 0)])))
    out.append('<path fill="%s" d="%s"/>' % (ROOM_BACK, path([(rx, ry, 0), (rx + F, ry, 0), (rx + F, ry, Z), (rx, ry, Z)])))
    out.append('<path fill="%s" d="%s"/>' % (ROOM_SIDE, path([(rx, ry, 0), (rx, ry + F, 0), (rx, ry + F, Z), (rx, ry, Z)])))
    cx_, cy_ = (max(allx) + min(allx)) / 2, (max(ally) + min(ally)) / 2
    fx, fy = P((cx_ + 20, cy_ + 30, 0))
    g1, g2 = uid('fl'), uid('wl')
    defs.append('<radialGradient id="%s" cx="%s" cy="%s" r="58" gradientUnits="userSpaceOnUse" gradientTransform="translate(%s %s) scale(1 0.5) translate(%s %s)"><stop offset="0" stop-color="%s" stop-opacity="0.2"/><stop offset="1" stop-color="%s" stop-opacity="0"/></radialGradient>'
                % (g1, f(fx), f(fy), f(fx), f(fy), f(-fx), f(-fy), LIGHT, LIGHT))
    out.append('<rect width="120" height="80" fill="url(#%s)"/>' % g1)
    defs.append('<radialGradient id="%s" cx="0.55" cy="0" r="0.9"><stop offset="0" stop-color="%s" stop-opacity="0.18"/><stop offset="1" stop-color="%s" stop-opacity="0"/></radialGradient>' % (g2, LIGHT, LIGHT))
    out.append('<rect width="120" height="80" fill="url(#%s)"/>' % g2)
    out.append('<path fill="none" stroke="#000" stroke-opacity="0.25" stroke-width="0.4" d="%s"/>' % path([(rx, ry, 0), (rx, ry, Z)], False))

    # the product's shadow on the floor (the cladding of «Стены» lies on the walls and casts none)
    foot = [] if key == 'stena' else [P(p) for it in items if it[0] == 'face' for p in it[1] if p[2] <= 0.6]
    if len(foot) > 2:
        hull = convex_hull(foot)
        fid = uid('sh')
        defs.append('<filter id="%s" x="-30%%" y="-30%%" width="160%%" height="160%%"><feGaussianBlur stdDeviation="1.6"/></filter>' % fid)
        out.append('<path fill="#000" opacity="0.55" filter="url(#%s)" d="M%sZ"/>' % (fid, ' '.join('%s %s' % (f(x + 2.2), f(y + 1.0)) for x, y in hull)))
        out.append('<path fill="#000" opacity="0.35" d="M%sZ"/>' % ' '.join('%s %s' % (f(x), f(y + 0.3)) for x, y in hull))

    for it in items:
        kind = it[0]
        if kind == 'face':
            _, ps, mat, n, tag, smooth = it
            if mat == 'aoface':
                out.append('<path fill="%s" opacity="%s" d="%s"/>' % (STY['aoface'][0], STY['aoface'][3], path(ps)))
                continue
            if isinstance(tag, tuple) and tag[0] == 'hole':
                continue   # the room's own back wall is this wall; the opening shows through it
            fill = shade(mat, n)
            if smooth:
                # a facet of a curved side: no edge of its own (the band draws the outline)
                out.append('<path fill="%s" stroke="%s" stroke-width="0.25" stroke-linejoin="round" d="%s"/>' % (fill, fill, path(ps)))
            else:
                out.append('<path fill="%s" stroke="%s" stroke-width="%s" stroke-linejoin="round" d="%s"/>' % (fill, EDGE, EDGE_W, path(ps)))
        elif kind == 'band':
            chain = it[1]
            top = [c[3] for c in chain[:1]] + [c[2] for c in chain]
            bot = [c[0] for c in chain[:1]] + [c[1] for c in chain]
            d = ' '.join((path(top, False, True), path(bot, False, True), path([chain[0][0], chain[0][3]], False), path([chain[-1][1], chain[-1][2]], False)))
            out.append('<path fill="none" stroke="%s" stroke-width="%s" stroke-linecap="round" stroke-linejoin="round" d="%s"/>' % (EDGE, EDGE_W, d))
        elif kind == 'veins':
            _, runs, clip, ribbons = it
            body = []
            for run, wt, kd in runs:
                d = path(run, False, True)
                if kd == 'halo':
                    body.append('<path stroke-opacity="%s" stroke-width="%s" d="%s"/>' % (VEIN_HALO, f(2.6 * wt), d))
                else:
                    body.append('<path stroke-opacity="%s" stroke-width="%s" d="%s"/>' % ('%.2f' % (HAIR_OP * wt), HAIR_W, d))
            for r in ribbons:
                body.append('<path fill="%s" fill-opacity="%s" stroke="none" d="%s"/>' % (VEIN, VEIN_CORE, path(r, True, True)))
            if not body:
                continue
            cl = ''
            if clip:
                cid = uid('cl')
                defs.append('<clipPath id="%s"><path d="%s"/></clipPath>' % (cid, path(clip, True, True)))
                cl = ' clip-path="url(#%s)"' % cid
            out.append('<g fill="none" stroke="%s" stroke-linecap="round" stroke-linejoin="round"%s>%s</g>' % (VEIN, cl, ''.join(body)))
        elif kind in ('poly', 'line'):
            _, ps, style = it
            fill, stroke, sw, op = STY[style]
            closed = kind == 'poly'
            attrs = 'fill="%s"' % (fill if (fill and closed) else 'none')
            if stroke:
                attrs += ' stroke="%s" stroke-width="%s" stroke-linecap="round" stroke-linejoin="round"' % (stroke, sw)
            if op != 1:
                attrs += ' opacity="%s"' % op
            if style in ('halo', 'mirrorglow'):
                fid = uid('gl')
                defs.append('<filter id="%s" x="-40%%" y="-40%%" width="180%%" height="180%%"><feGaussianBlur stdDeviation="2.2"/></filter>' % fid)
                attrs += ' filter="url(#%s)"' % fid
            if style == 'flame':
                fid = uid('fg')
                defs.append('<filter id="%s" x="-60%%" y="-60%%" width="220%%" height="220%%"><feGaussianBlur stdDeviation="1.4"/></filter>' % fid)
                out.append('<path fill="%s" opacity="0.7" filter="url(#%s)" d="%s"/>' % (LIGHT, fid, path(ps)))
            out.append('<path %s d="%s"/>' % (attrs, path(ps, closed, True)))
    return '<defs>' + ''.join(defs) + '</defs>' + ''.join(out)


def block():
    lines = []
    for k, model in PRODUCTS:
        lines.append("    // %s\n    %s: '%s'," % (model.__doc__, k, render(k, model)))
    return '\n'.join(lines)


if __name__ == '__main__':
    path = sys.argv[1]
    if path.endswith('.txt'):
        open(path, 'w', encoding='utf-8').write(block() + '\n')
        print('block written:', path)
        sys.exit(0)
    raw = open(path, 'rb').read()
    crlf = b'\r\n' in raw
    html = raw.decode('utf-8').replace('\r\n', '\n')
    start = html.index('  const PRODUCT_ICONS = {\n') + len('  const PRODUCT_ICONS = {\n')
    end = html.index('\n  };\n', start)
    html = html[:start] + block() + html[end:]
    if crlf:
        html = html.replace('\n', '\r\n')
    open(path, 'wb').write(html.encode('utf-8'))
    print('PRODUCT_ICONS rewritten:', len(PRODUCTS), 'scenes')
