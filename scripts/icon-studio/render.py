"""Renders the calculator's product cards from scripts/icon-studio/studio.html («Люкс», the owner,
2026-11-18). Every product: a frame twice the card's size, scaled down (the picture is sampled finer than
the card shows it), saved as WebP -- the floor's and the mirror's reflections, the LED's glow, a
vignette and a fine grain laid in as a photographer would finish the frame.

    python scripts/icon-studio/render.py icons/products/lux [--only key,key] [--base URL]
    node scripts/stamp_assets.js          (the page carries the hash of the pictures)

The studio is served with the calculator (scripts/dev_server.py of the site, or any server whose
root holds the calculator at /sayanmramor-calculator/). Needs Playwright with Chrome, Pillow and numpy.
A picture is not written when the studio reports an error (a stone photo of data/images that is not there,
a script error): the exit code is 1 and nothing of that product changes.
"""
import argparse, base64, io, os, sys
import numpy as np
from PIL import Image, ImageFilter
from playwright.sync_api import sync_playwright

PRODUCTS = ['lestnitsa', 'panno', 'podokonnik', 'pol', 'stena', 'fasad', 'stoleshnitsa_vannaya',
            'stoleshnitsa_kuhnya', 'stupeni', 'kaminy']
CARD = (720, 480)          # the WebP's size: a card is ~240 css px wide, at 3x
SUPER = 2                  # rendered at twice that, then scaled down
PASSES = ('main', 'refl', 'mask', 'glow', 'mrefl', 'mmask')


def grab(pg, name):
    url = pg.evaluate('window.__pass(%r)' % name)
    if not url:
        return None
    return Image.open(io.BytesIO(base64.b64decode(url.split(',', 1)[1]))).convert('RGB')


def compose(P):
    """The passes into one picture: the mirror's reflection in its glass, the floor's reflection (soft,
    fading away from the product), the LED's glow blooming into the air, a vignette and a fine grain."""
    a = lambda im: np.asarray(im, dtype=np.float32) / 255.0
    W, H = P['main'].size
    img = a(P['main'])
    # a mirror in the picture: what it reflects, laid into its glass (a dark glass: a little dimmer)
    if P.get('mrefl') is not None:
        mm = a(P['mmask'].convert('L').filter(ImageFilter.GaussianBlur(0.8)))[..., None]
        img = img * (1 - mm * 0.9) + a(P['mrefl']) * mm * 0.7
    # the reflection: blurred a little (the floor is not a mirror), only where the floor shows
    refl = a(P['refl'].filter(ImageFilter.GaussianBlur(W / 520)))
    mask = a(P['mask'].convert('L').filter(ImageFilter.GaussianBlur(1.2)))[..., None]
    img = img + refl * mask * 0.42
    # the glow: three widths of bloom, warm
    g = P['glow']
    bloom = sum(w * a(g.filter(ImageFilter.GaussianBlur(W * r))) for w, r in ((0.55, 0.004), (0.45, 0.014), (0.35, 0.04)))
    img = 1 - (1 - img) * (1 - np.clip(bloom * np.array([1.0, 0.86, 0.68], dtype=np.float32), 0, 1))
    # a soft vignette and a fine grain
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H * 0.46) / (H / 2)) ** 2)
    img *= (1 - 0.28 * np.clip(r - 0.55, 0, 1) ** 1.5)[..., None]
    rng = np.random.default_rng(7)
    img += (rng.standard_normal((H, W, 1)).astype(np.float32) * 0.012)
    return Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out', help='where the pictures go: icons/products/lux')
    ap.add_argument('--base', default='http://localhost:8010/sayanmramor-calculator/scripts/icon-studio/studio.html')
    ap.add_argument('--only', default='')
    ap.add_argument('--quality', type=int, default=84)
    a = ap.parse_args()
    keys = a.only.split(',') if a.only else PRODUCTS
    W, H = CARD[0] * SUPER, CARD[1] * SUPER
    os.makedirs(a.out, exist_ok=True)
    failed = []
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome')
        pg = b.new_page(viewport={'width': W, 'height': H})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        for k in keys:
            errs.clear()
            pg.goto('%s?p=%s&w=%d&h=%d' % (a.base, k, W, H))
            pg.wait_for_function('window.__done === true', timeout=60000)
            errs.extend(pg.evaluate('window.__errors || []'))
            if errs:
                failed.append(k)
                print('FAILED', k, '; '.join(errs))
                continue
            img = compose({n: grab(pg, n) for n in PASSES}).resize(CARD, Image.LANCZOS)
            dst = os.path.join(a.out, k + '.webp')
            img.save(dst, 'WEBP', quality=a.quality, method=6)
            print(k, os.path.getsize(dst) // 1024, 'KB')
        b.close()
    if failed:
        sys.exit('not rendered: ' + ', '.join(failed))


if __name__ == '__main__':
    main()
