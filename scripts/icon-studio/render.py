"""Рендер картинки изделия офлайн-студией (концепт карточек «Тип изделия», ветка icons-concept).

    python scripts/icon-studio/render.py kitchen docs/icons-concept/kitchen-island.png [--frames 512] [--w 2400 --h 1600]

Поднимает локальный http-сервер на корне репозитория, открывает studio.html в Chromium
(Playwright, с GPU), ждёт окончания накопления кадров и сохраняет PNG.
"""
import argparse, base64, urllib.parse, functools, http.server, pathlib, threading, time
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]

ap = argparse.ArgumentParser()
ap.add_argument('product')
ap.add_argument('out')
ap.add_argument('--stone', default='calacatta-aella')
ap.add_argument('--frames', type=int, default=512)
ap.add_argument('--w', type=int, default=2400)
ap.add_argument('--h', type=int, default=1600)
ap.add_argument('--rules', default='')
a = ap.parse_args()


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
url = (f'http://127.0.0.1:{srv.server_port}/scripts/icon-studio/studio.html'
       f'?product={a.product}&stone={a.stone}&frames={a.frames}&w={a.w}&h={a.h}'
       + (f'&rules={urllib.parse.quote(a.rules)}' if a.rules else ''))

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'])
    pg = b.new_page(viewport={'width': a.w, 'height': a.h})
    pg.on('console', lambda m: print('console:', m.text))
    pg.on('pageerror', lambda e: print('pageerror:', e))
    t0 = time.time()
    pg.goto(url)
    print('gpu:', pg.evaluate("""() => { const g = document.createElement('canvas').getContext('webgl2');
        const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; }"""))
    pg.wait_for_function('window.__done === true', timeout=900_000, polling=1000)
    data = pg.evaluate("document.querySelector('canvas').toDataURL('image/png')")
    out = pathlib.Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(base64.b64decode(data.split(',', 1)[1]))
    print(f'saved {out} in {time.time() - t0:.1f}s')
    b.close()
srv.shutdown()
