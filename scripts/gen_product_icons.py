"""Product card scenes of the calculator (PRODUCT_ICONS in
sayanmramor-calculator.html).

All ten scenes are FRONT views in the one-point perspective of the original
window-sill and steps scenes (the reference set, 2026-10-10): a point on the
picture plane is drawn where it is (viewBox 120x80, the floor band from
y = 68), and a point z deeper is pulled toward the vanishing point on the
card's axis by
    k = 100 / (100 + z),   screen = VP + (point - VP) * k,   VP = (60, vpy).
Each scene sets only its vanishing point's height vpy (the viewer's eye):
a high eye shows the tops of worktops, treads and the mantel. A face is drawn
only if the viewer can see it (a side left of the axis shows its right face,
a top below the eye its top, and so on). Colours are only the .ps-* classes.

The window sill and the steps are the original scenes, unchanged; the panel
and the wall are the originals without their slanted side edge; the other six
keep the original pieces and details, redrawn from the front.

Usage:
    python scripts/gen_product_icons.py sayanmramor-calculator.html   (rewrites PRODUCT_ICONS)
    python scripts/gen_product_icons.py preview.txt                   (writes the block only)
"""
import math, sys

VPX, DIST = 60, 100


def f(v):
    s = ('%.1f' % v)
    if s.endswith('.0'):
        s = s[:-2]
    return '0' if s == '-0' else s


class Scene:
    """Coordinates are the card's own: x across, y DOWN (as in SVG), z depth."""

    def __init__(self, vpy):
        self.vpy = vpy
        self.items = []

    def P(self, x, y, z=0):
        k = DIST / (DIST + z)
        return (VPX + (x - VPX) * k, self.vpy + (y - self.vpy) * k)

    def path(self, pts, close=True):
        return 'M' + ' '.join('%s %s' % (f(a), f(b)) for a, b in (self.P(*p) for p in pts)) + ('Z' if close else '')

    def poly(self, cls, pts):
        self.add(cls, self.path(pts))

    def line(self, cls, *pts):
        self.add(cls, self.path(pts, False))

    def raw(self, cls, d):
        self.add(cls, d)

    def add(self, cls, d):
        if self.items and self.items[-1][0] == cls and cls not in ('ps-glow', 'ps-wash', 'ps-shadow', 'ps-halo'):
            self.items[-1] = (cls, self.items[-1][1] + ' ' + d)
        else:
            self.items.append((cls, d))

    def box(self, x0, x1, top, bottom, z0, z1, front='ps-stone', topc='ps-top', side='ps-side', under=None, sides=True):
        """A block, x0..x1 across, `top`..`bottom` in screen y, z0..z1 deep:
        the faces the eye can see, then the front."""
        if sides:
            if x1 < VPX and side:
                self.poly(side, [(x1, top, z0), (x1, top, z1), (x1, bottom, z1), (x1, bottom, z0)])
            if x0 > VPX and side:
                self.poly(side, [(x0, top, z0), (x0, top, z1), (x0, bottom, z1), (x0, bottom, z0)])
        if top > self.vpy and topc:
            self.poly(topc, [(x0, top, z0), (x1, top, z0), (x1, top, z1), (x0, top, z1)])
        if bottom < self.vpy and under:
            self.poly(under, [(x0, bottom, z0), (x1, bottom, z0), (x1, bottom, z1), (x0, bottom, z1)])
        self.rect(front, x0, x1, top, bottom, z0)

    def rect(self, cls, x0, x1, y0, y1, z=0):
        self.poly(cls, [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)])

    def hcircle(self, cls, cx, y, cz, r, n=28):
        self.poly(cls, [(cx + r * math.cos(2 * math.pi * i / n), y, cz + r * math.sin(2 * math.pi * i / n)) for i in range(n)])

    def circle(self, cls, cx, cy, r, z=0, n=36):
        self.poly(cls, [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n), z) for i in range(n)])

    def svg(self):
        return ''.join('<path class="%s" d="%s"/>' % (c, d) for c, d in self.items)


icons = {}

# ---- Лестница: марш спереди -- семь ступеней уходят от зрителя вверх к площадке,
# перила справа (как в исходной сцене -- одни перила).
S = Scene(-8)
N, RISE, RUN, X0, X1 = 7, 6, 7, 40, 80
BACK = N * RUN + 16
for i in range(N):
    S.box(X0, X1, 68 - (i + 1) * RISE, 68 - i * RISE, i * RUN, BACK)
    S.line('ps-joint', (X0 + 1, 68 - (i + 1) * RISE + 1.2, i * RUN), (X1 - 1, 68 - (i + 1) * RISE + 1.2, i * RUN))
S.raw('ps-vein', 'M42 66C48 63.5 54 66.5 60 64.5S72 63 78 65.5')
xr = X1 - 3
posts = [(xr, 68 - (i + 1) * RISE, i * RUN + RUN / 2) for i in range(N)]
S.line('ps-metal', *[(x, y - 14, z) for x, y, z in posts], (xr, 68 - N * RISE - 14, N * RUN + 8))
for x, y, z in posts + [(xr, 68 - N * RISE, N * RUN + 8)]:
    S.line('ps-metal', (x, y, z), (x, y - 14, z))
icons['lestnitsa'] = ('Лестница: марш спереди -- семь ступеней уходят вверх к площадке, перила справа.', S)

# ---- Панно: исходная сцена (плита с зеркальной раскладкой, подсвеченная сверху),
# без косого торца.
icons['panno'] = ('Панно: одна вертикальная плита с зеркальной (bookmatch) раскладкой рисунка, подсвеченная сверху.',
                  '<path class="ps-wash" d="M50 3H70L88 66H32Z"/><rect class="ps-metal-f" x="49" y="1.5" width="22" height="1.6" rx="0.8"/>'
                  '<rect class="ps-stone" x="42" y="9" width="36" height="54"/>'
                  '<path class="ps-vein" d="M60 9C53 19 49 28 54 37S51 53 45 63 M60 9C67 19 71 28 66 37S69 53 75 63 M60 23C56 29 57 34 60 37C63 34 64 29 60 23Z"/>'
                  '<path class="ps-joint" d="M60 9V63"/><path class="ps-shadow" d="M40 68H80L82 70H38Z"/>')

# ---- Подоконник: исходная сцена без изменений (эталон этой перспективы).
icons['podokonnik'] = ('Подоконник: фронтальная сцена, точка схода (60, 26) на оси; проём 48x36, стекло утоплено (k = 5/6), плита выходит в комнату (k = 11/9).',
                       '<path class="ps-wall-side" d="M36 8L84 8L80 11L40 11Z"/><path class="ps-wall" d="M36 8L40 11L40 41L36 44Z M84 8L84 44L80 41L80 11Z"/>'
                       '<rect class="ps-glass" x="40" y="11" width="40" height="30"/><rect class="ps-glow" x="40" y="11" width="40" height="30"/>'
                       '<path class="ps-frame" d="M40 11L80 11L80 41L40 41Z M60 11V41"/><path class="ps-top" d="M40 41L80 41L84 44L87 44L93 48L27 48L33 44L36 44Z"/>'
                       '<path class="ps-glow" d="M40 41L80 41L84 44L36 44Z"/><rect class="ps-stone" x="27" y="48" width="66" height="6"/>'
                       '<path class="ps-vein" d="M29 52C40 50 50 52.5 60 51S80 50 91 52"/><path class="ps-shadow" d="M29 54L91 54L89 56.5L31 56.5Z"/>')

# ---- Пол: комната спереди -- окно в дальней стене (его низ параллелен полу),
# пятно света от него на полу, плитка.
S = Scene(22)
L, R, FLOOR, CEIL, D = -6, 126, 80, -40, 160
S.poly('ps-wall-side', [(L, CEIL, 0), (R, CEIL, 0), (R, CEIL, D), (L, CEIL, D)])
S.poly('ps-wall-side', [(R, FLOOR, 0), (R, FLOOR, D), (R, CEIL, D), (R, CEIL, 0)])
S.rect('ps-wall', L, R, CEIL, FLOOR, D)
S.poly('ps-wall-side', [(L, FLOOR, 0), (L, FLOOR, D), (L, CEIL, D), (L, CEIL, 0)])
S.rect('ps-glass', 34, 86, 1, 53, D)
S.rect('ps-glow', 34, 86, 1, 53, D)
S.line('ps-frame', (34, 1, D), (86, 1, D), (86, 53, D), (34, 53, D), (34, 1, D))
S.line('ps-frame', (60, 1, D), (60, 53, D))
S.poly('ps-top', [(L, FLOOR, 0), (R, FLOOR, 0), (R, FLOOR, D), (L, FLOOR, D)])
S.poly('ps-glow', [(34, FLOOR, D - 4), (86, FLOOR, D - 4), (96, FLOOR, D - 90), (24, FLOOR, D - 90)])
for x in range(L + 22, R, 22):
    S.line('ps-joint', (x, FLOOR, 0), (x, FLOOR, D))
for z in (22, 44, 66, 88, 110, 132):
    S.line('ps-joint', (L, FLOOR, z), (R, FLOOR, z))
icons['pol'] = ('Пол: комната спереди -- окно в дальней стене, пятно света от него на полу, плитка.', S)

# ---- Стена: исходная сцена (облицовка крупноформатными плитами), без косого торца.
icons['stena'] = ('Стена: облицовка крупноформатными плитами по всей высоте, рисунок камня проходит через швы.',
                  '<rect class="ps-stone" x="10" y="6" width="100" height="62"/><ellipse class="ps-wash" cx="60" cy="8" rx="50" ry="22"/>'
                  '<path class="ps-vein" d="M10 58C28 52 40 54 56 42S88 28 110 20 M10 32C24 28 34 32 48 23"/>'
                  '<path class="ps-joint" d="M10 27H110M10 47.5H110M35 6V68M60 6V68M85 6V68"/>')

# ---- Фасад: дом из исходной сцены спереди -- каменный объём с окнами, кровля
# с выносом (видна снизу), стеклянная пристройка справа с тёмной кровлей.
S = Scene(30)
# The annex first: the house in front of it hides what is behind its corner.
S.box(76, 106, 42, 68, 0, 18, front='ps-glass', topc=None, sides=False)
S.rect('ps-glow', 76, 106, 42, 68)
S.raw('ps-frame', S.path([(76, 42), (106, 42), (106, 68), (76, 68)]) + ' ' + S.path([(86, 42), (86, 68)], False) + ' ' + S.path([(96, 42), (96, 68)], False))
S.box(76, 108, 39, 42, -2, 20, front='ps-cab', topc='ps-core-top', sides=False)
S.box(12, 76, 24, 68, 0, 30, sides=False)
S.raw('ps-joint', 'M12 35H76M12 46H76M12 57H76M38 24V35M60 35V46M30 46V57M52 57V68')
for x0, x1, y0, y1 in ((20, 32, 30, 62), (42, 68, 30, 42)):
    S.rect('ps-glass', x0, x1, y0, y1)
    S.rect('ps-glow', x0, x1, y0, y1)
S.raw('ps-frame', 'M20 30H32V62H20Z M42 30H68V42H42Z M55 30V42')
S.box(8, 80, 19, 24, -4, 34, front='ps-cab', topc=None, under='ps-core', sides=False)
icons['fasad'] = ('Фасад: дом с каменным объёмом и окнами, кровля с выносом, стеклянная пристройка справа.', S)

# ---- Ванная: исходная сцена спереди -- подвесная столешница, накладная чаша,
# смеситель из стены, круглое зеркало с подсветкой, деревянный ящик.
S = Scene(-6)
D = 18
S.circle('ps-halo', 60, 20, 15.5, D)
S.circle('ps-glass', 60, 20, 14, D)
S.circle('ps-rim', 60, 20, 14, D)
S.box(32, 88, 53, 62, 3, D, front='ps-wood', topc=None, side='ps-cab-side')
S.raw('ps-handle', S.path([(54, 57.5, 3), (66, 57.5, 3)], False))
S.poly('ps-shadow', [(32, 62, 3), (88, 62, 3), (91, 64, 3), (35, 64, 3)])
S.box(24, 96, 48, 53, 0, D)
S.line('ps-metal', (60, 34, D), (60, 34, D - 6), (60, 37, D - 6))
rim_y, base_y, cz = 41, 48, D / 2 - 1
n = 28
rim = [(60 + 11 * math.cos(2 * math.pi * i / n), rim_y, cz + 6 * math.sin(2 * math.pi * i / n)) for i in range(n)]
base = [(60 + 6 * math.cos(2 * math.pi * i / n), base_y, cz + 3.5 * math.sin(2 * math.pi * i / n)) for i in range(n)]
near_rim = sorted([p for p in rim if p[2] <= cz + 1e-9], key=lambda p: p[0])
near_base = sorted([p for p in base if p[2] <= cz + 1e-9], key=lambda p: -p[0])
S.poly('ps-bowl', near_rim + near_base)
S.poly('ps-bowl', rim)
S.poly('ps-bowl-in', [(60 + 9 * math.cos(2 * math.pi * i / n), rim_y, cz + 4.6 * math.sin(2 * math.pi * i / n)) for i in range(n)])
icons['stoleshnitsa_vannaya'] = ('Столешница в ванную: подвесная каменная столешница с накладной раковиной, смеситель из стены, круглое зеркало с подсветкой, деревянный ящик.', S)

# ---- Кухня: исходная сцена спереди -- длинная столешница на тумбах с мойкой,
# смесителем и варочной панелью, подвесные светильники.
S = Scene(-10)
D = 16
for x in (38, 82):
    S.raw('ps-metal', 'M%s 0V8' % x)
    S.raw('ps-metal-f', 'M%s 12H%s L%s 8H%sZ' % (x - 5, x + 5, x + 2, x - 2))
    S.raw('ps-glow', S.path([(x + 6 * math.cos(2 * math.pi * i / 20), 12.5 + 1.4 * math.sin(2 * math.pi * i / 20)) for i in range(20)]))
S.box(10, 110, 49, 68, 0, D, front='ps-cab', topc=None, side='ps-cab-side')
S.raw('ps-cab-line', 'M35 49V68M60 49V68M85 49V68')
S.raw('ps-handle', 'M16 52.5H29M41 52.5H54M66 52.5H79M91 52.5H104')
S.box(8, 112, 44, 49, -2, D + 2)
S.poly('ps-dark', [(22, 44, 3), (52, 44, 3), (52, 44, 13), (22, 44, 13)])
S.line('ps-metal', (37, 44, 15), (37, 32, 15), (37, 32, 9), (37, 35, 9))
S.poly('ps-dark', [(66, 44, 2), (100, 44, 2), (100, 44, 14), (66, 44, 14)])
# Burners: front r 2.4 at z 4.5, back r 2.2 at z 11.4 -- a clear gap (2.3) between
# them on the glass, none touching even with the ring's stroke.
for cx, cz, r, cls in ((74, 4.5, 2.4, 'ps-ring-hot'), (92, 4.5, 2.4, 'ps-ring'), (74, 11.4, 2.2, 'ps-ring'), (92, 11.4, 2.2, 'ps-ring')):
    S.hcircle(cls, cx, 44, cz, r, n=20)
icons['stoleshnitsa_kuhnya'] = ('Столешница на кухню: длинная рабочая поверхность на тумбах с мойкой, смесителем и варочной панелью, подвесные светильники.', S)

# ---- Ступени: исходная сцена без изменений -- три отдельных каменных блока
# в той же центральной перспективе (точка схода выше кадра).
icons['stupeni'] = ('Ступени: три отдельных каменных блока в центральной перспективе с оси x=60 (s = 100/(Z+100)), без перил.',
                    '<path class="ps-stone" d="M22 58L98 58L98 68L22 68Z"/><path class="ps-vein" d="M24 65C42 61 50 66 60 63S82 61 96 64"/>'
                    '<path class="ps-top" d="M22 58L98 58L92.76 47.24L27.24 47.24Z"/><path class="ps-shadow" d="M26.37 49.03L93.63 49.03L92.76 47.24L27.24 47.24Z"/>'
                    '<path class="ps-joint" d="M23.73 56.47H96.27M24.25 55.36H95.75"/><path class="ps-stone" d="M27.24 38.62L92.76 38.62L92.76 47.24L27.24 47.24Z"/>'
                    '<path class="ps-top" d="M27.24 38.62L92.76 38.62L88.79 31.52L31.21 31.52Z"/><path class="ps-shadow" d="M30.54 32.71L89.46 32.71L88.79 31.52L31.21 31.52Z"/>'
                    '<path class="ps-joint" d="M28.64 37.63H91.36M29.04 36.9H90.96"/><path class="ps-stone" d="M31.21 23.94L88.79 23.94L88.79 31.52L31.21 31.52Z"/>'
                    '<path class="ps-top" d="M31.21 23.94L88.79 23.94L85.68 19.19L34.32 19.19Z"/><path class="ps-joint" d="M32.39 23.28H87.61M32.69 22.8H87.31"/>')

# ---- Камины: исходная сцена спереди -- портал (две опоры, перемычка), полка,
# тёмная топка с глубиной и отблеском огня.
S = Scene(-10)
FB = 10
S.rect('ps-dark', 44, 76, 40, 68, FB)
S.poly('ps-cab', [(44, 40, 0), (44, 40, FB), (44, 68, FB), (44, 68, 0)])
S.poly('ps-cab', [(76, 40, 0), (76, 40, FB), (76, 68, FB), (76, 68, 0)])
S.raw('ps-glow', S.path([(52, 68, FB), (52, 61, FB), (57, 58, FB), (56, 52, FB), (61, 56, FB), (60, 60, FB), (62, 62, FB), (64, 58, FB), (66, 57, FB), (66, 54, FB), (70, 59, FB), (69, 64, FB), (68, 68, FB)]))
S.box(30, 44, 26, 68, 0, 8, sides=False)
S.box(76, 90, 26, 68, 0, 8, sides=False)
S.box(44, 76, 26, 40, 0, 8, topc=None, sides=False)
S.raw('ps-vein', 'M30 36C40 31 52 37 62 32S80 30 90 36')
S.raw('ps-joint', 'M30 40H44M76 40H90')
S.rect('ps-shadow', 30, 90, 26, 27.5)
S.box(26, 94, 21, 26, -3, 11, sides=False)
icons['kaminy'] = ('Камины: каминный портал спереди -- две опоры, перемычка, полка и тёмная топка с отблеском огня.', S)

ORDER = ['lestnitsa', 'panno', 'podokonnik', 'pol', 'stena', 'fasad', 'stoleshnitsa_vannaya', 'stoleshnitsa_kuhnya', 'stupeni', 'kaminy']
OWN_FLOOR = ('pol',)   # draws its own floor (no SCENE_FLOOR band)


def block():
    lines = []
    for k in ORDER:
        note, sc = icons[k]
        svg = sc if isinstance(sc, str) else sc.svg()
        floor = '' if k in OWN_FLOOR else 'SCENE_FLOOR + '
        lines.append("    // %s\n    %s: %s'%s'," % (note, k, floor, svg))
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
    print('PRODUCT_ICONS rewritten:', len(ORDER), 'scenes')
