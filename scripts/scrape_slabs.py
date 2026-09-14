import mimetypes
import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup

# Processing-difficulty tier per stone category (URL segment), used to scale
# the work multiplier in the pricing calculator. Values are provisional --
# assigned by category, not yet backed by real order data; expect this
# mapping and the multipliers that key off it (see sayanmramor-calculator.html)
# to be replaced once that data exists. A category not listed here (a new
# stone type not yet seen in the catalog) gets None and the calculator falls
# back to its pre-tier default multiplier.
HARDNESS_CATEGORY_BY_SEGMENT = {
    # 1 - лёгкая
    'marble': 1,
    'oniks': 1,
    'travertin': 1,
    'limestone': 1,
    'soapstone': 1,          # Талькохлорит
    'terrazzo': 1,           # Терраццо -- not seen in the catalog yet
    'pescanik': 1,           # Песчаник
    'artificial-marble': 1,
    'specennyi-kamen': 1,    # Спечённый камень
    # 2 - средняя
    'quartz-agglomerate': 2,
    'granite': 2,
    'quartzite': 2,
    'labradorite': 2,
    'slate': 2,
    'kvarc': 2,
    # 3 - твёрдая
    'agate': 3,
    'amethyst': 3,
    'malaxit': 3,            # Малахит
    'obsidian': 3,
    'jasper': 3,             # Яшма
    'apatite': 3,
    'septariya': 3,          # Септария
    'tigrovyi-glaz': 3,      # Тигровый глаз
    'petrified-wood': 3,
    'aragonit': 3,           # Арагонит
}


def parse_ru_number(s):
    if s is None:
        return None
    s = s.replace('\xa0', '').replace(' ', '').strip()
    if s in ('', '-', '—'):
        return None
    s = re.sub(r'[^0-9,.\-]', '', s)
    s = s.replace(',', '.')
    if s == '':
        return None
    try:
        return float(s)
    except ValueError:
        return None


def stone_id_and_category_from_url(url):
    parts = [p for p in url.split('/') if p and p not in ('https:', 'http:')]
    parts = parts[1:]  # drop domain
    if parts and parts[-1] == 'slabs':
        parts = parts[:-1]
    stone_id = parts[-1] if parts else None
    category = parts[-2] if len(parts) >= 2 else None
    return stone_id, category


# Russian words that show up inside an otherwise-English stone name and have
# a real English equivalent worth keeping (an origin, or -- for polockii, a
# stone with no separate English name at all) -- as opposed to a bare
# category word like "Мрамор"/"Агломерат", which stone_name_from_h1 strips
# outright instead of translating.
RUSSIAN_WORD_TRANSLATIONS = {
    'Сирийский': 'Syrian',
    'Турецкий': 'Turkish',
    'Испанский': 'Spanish',
    'Полоцкий': 'Polotskiy',
}


def translate_russian_words(name):
    return ' '.join(RUSSIAN_WORD_TRANSLATIONS.get(word, word) for word in name.split(' '))


def stone_name_from_h1(h1_text):
    # The leading \S+ is a category word ("Мрамор", "Агломерат", ...); most
    # category pages' h1 ends with "в слэбах" but some don't, so that suffix
    # is optional rather than required for the category word to be stripped.
    m = re.match(r'^\S+\s+(.+?)(?:\s+в слэбах)?\s*$', h1_text.strip())
    name = m.group(1) if m else h1_text.strip()
    return translate_russian_words(name)


def extract_price_from_cell(td):
    divs = td.find_all('div')
    if not divs:
        return None
    return parse_ru_number(divs[-1].get_text())


def extract_main_image_url(soup, source_url):
    # urljoin leaves an already-absolute URL unchanged, so applying it
    # unconditionally (rather than only to the fallback branch, where it's
    # actually needed) makes "always returns an absolute URL or None" an
    # unconditional contract instead of one that relies on the convention
    # that og:image is always absolute holding true.
    og_image = soup.find('meta', property='og:image')
    if og_image and og_image.get('content'):
        return urljoin(source_url, og_image['content'])
    main = soup.find('main')
    if main:
        img = main.find('img')
        if img and img.get('src'):
            return urljoin(source_url, img['src'])
    return None


def content_type_to_extension(content_type):
    if not content_type:
        return None
    content_type = content_type.split(';')[0].strip().lower()
    return mimetypes.guess_extension(content_type)


def replace_stone_image_file(images_dir, stone_id, image_bytes, extension):
    images_dir.mkdir(parents=True, exist_ok=True)
    for existing_file in images_dir.glob(f'{stone_id}.*'):
        existing_file.unlink()
    dest_path = images_dir / f'{stone_id}{extension}'
    dest_path.write_bytes(image_bytes)
    return dest_path


def download_stone_image(browser, image_url, images_dir, stone_id):
    # Downloads through an actual browser page (Chromium's network stack)
    # rather than APIRequestContext (Node's own TLS client): the CDN's WAF
    # fingerprints TLS handshakes and silently drops non-browser clients --
    # APIRequestContext's requests got dropped mid-handshake, which Node
    # surfaced as a misleading "unable to verify the first certificate"
    # even though the actual certificate chain was never the problem.
    #
    # Takes `browser`, not the scrape page's own `page.context`: that context
    # was created by browser.new_page()'s shorthand and only ever holds that
    # one page, so a second new_page() on it raises "Please use
    # browser.new_context()". browser.new_page() instead opens its own fresh
    # context per call and closes that context automatically when the page
    # closes.
    img_page = browser.new_page()
    try:
        response = img_page.goto(image_url)
        if not response or not response.ok:
            status = response.status if response else 'no response'
            raise RuntimeError(f'image download failed: HTTP {status} for {image_url}')
        extension = content_type_to_extension(response.headers.get('content-type')) or '.jpg'
        return replace_stone_image_file(images_dir, stone_id, response.body(), extension)
    finally:
        img_page.close()


def extract_slabs_from_html(html, source_url):
    soup = BeautifulSoup(html, 'html.parser')
    image_url = extract_main_image_url(soup, source_url)
    h1 = soup.find('h1')
    name = stone_name_from_h1(h1.get_text()) if h1 else None
    stone_id, category = stone_id_and_category_from_url(source_url)

    slabs = []
    skipped = []
    for card in soup.select('.prt-container'):
        wrapper = card.parent
        card_text = card.get_text()
        party_match = re.search(r'Партия\s*#(\d+)', card_text)
        party = party_match.group(1) if party_match else None

        table = wrapper.find('table', class_='pr-table') if wrapper else None
        if not table:
            continue

        for row in table.select('tbody tr.pr-tr'):
            cells = row.find_all('td', class_='pr-td')
            if len(cells) < 10:
                continue

            article_cell = cells[1]
            article_btn = article_cell.find('button')
            article = article_btn.get_text().strip() if article_btn else None

            status_span = article_cell.find('span', class_='font-bold')
            status_text = status_span.get_text().strip() if status_span else None

            last_cell = cells[-1]
            request_btn = last_cell.find('button', attrs={'aria-label': 'Заявка'})
            unavailable = bool(status_text) or request_btn is not None

            if unavailable:
                skipped.append({'article': article, 'status': status_text, 'has_request_btn': request_btn is not None})
                continue

            pachka = cells[2].get_text(strip=True)
            city = cells[3].get_text(strip=True)
            size_text = cells[4].get_text(strip=True)
            size_match = re.match(r'([\d,]+)\s*x\s*([\d,]+)', size_text)
            if not size_match:
                skipped.append({'article': article, 'status': 'bad_size', 'has_request_btn': False})
                continue
            width_m = parse_ru_number(size_match.group(1))
            length_m = parse_ru_number(size_match.group(2))

            price_per_m2 = extract_price_from_cell(cells[8])
            price_total = extract_price_from_cell(cells[9])

            slabs.append({
                'article': article,
                'party': party,
                'pachka': pachka,
                'city': city,
                'width_cm': round(width_m * 100),
                'length_cm': round(length_m * 100),
                'price_per_m2_rub': price_per_m2,
                'price_total_rub': price_total,
            })

    stone = {
        'id': stone_id,
        'name': name,
        'category': category,
        'hardness_category': HARDNESS_CATEGORY_BY_SEGMENT.get(category),
        'source_url': source_url,
        'slabs': slabs,
    }
    return stone, skipped, image_url


def load_stone_urls(path):
    urls = []
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            urls.append(line)
    return urls


def merge_stone_into_data(data, stone):
    stones = data.get('stones', [])
    is_empty = not stone.get('slabs')
    existing = next((s for s in stones if s.get('id') == stone.get('id')), None)

    if existing is not None:
        if is_empty:
            # A stone we already have real slab data for came back empty
            # this run (temporary stockout, or a scrape glitch) -- keep
            # what we already know rather than wiping it out. But if a
            # --fetch-images run just downloaded a fresh image for this
            # stone (the file is already on disk by the time we get here),
            # apply that one field so disk and JSON don't go out of sync --
            # everything else about the existing record stays untouched.
            if stone.get('image') and stone['image'] != existing.get('image'):
                updated_existing = dict(existing)
                updated_existing['image'] = stone['image']
                new_data = dict(data)
                new_data['stones'] = [updated_existing if s.get('id') == stone.get('id') else s
                                       for s in stones]
                return new_data, True
            return data, True
        if 'image' not in stone:
            stone['image'] = existing.get('image')
        new_stones = [stone if s.get('id') == stone['id'] else s for s in stones]
    else:
        # A stone we've never seen before: keep it even with slabs: [] so
        # the calculator can show it as "out of stock" instead of it simply
        # not existing anywhere in the catalog.
        stone.setdefault('image', None)
        new_stones = stones + [stone]

    new_data = dict(data)
    new_data['stones'] = new_stones
    return new_data, is_empty


# Party rows (.prt) and, for stones with more than one category/surface
# group, the group itself (e.g. two different "Категория" values) are both
# the same Headless UI Disclosure component, just at different nesting
# depths -- there's no fixed number of levels: a group closed by default
# hides its parties from the DOM entirely (they don't just stay hidden via
# CSS), so a second group's parties can be completely invisible to a
# selector that only ever looks at .prt. This selects any closed disclosure
# button anywhere under <main>, at whatever depth, so a click-and-requery
# loop can open every level without assuming how many there are. Scoped to
# <main> (rather than unscoped) to skip the site's mobile nav drawer and
# footer accordions, which reuse the same component but are permanently
# invisible in a desktop-viewport headless run -- clicking them only wastes
# time across a large batch for no benefit.
CLOSED_DISCLOSURE_SELECTOR = 'main [id^="headlessui-disclosure-button"][aria-expanded="false"]'
EXPAND_MAX_PASSES = 6
EXPAND_ACTION_TIMEOUT_MS = 2000
EXPAND_WALL_CLOCK_BUDGET_S = 20


def dismiss_overlays(page):
    # A `.cbk-window-bgr` callback/chat-widget overlay can appear and
    # intercept pointer events, blocking every click underneath it.
    page.evaluate("document.querySelectorAll('.cbk-window-bgr').forEach(el => el.remove())")


def expand_all_parties(page, debug=False):
    # Only clicks disclosures that are actually closed (aria-expanded
    # "false"). Clicking one that's already open would collapse it and
    # make its slab table disappear from the captured HTML -- this is what
    # silently produced zero slabs for stones whose single party the site
    # already expands by default.
    start = time.monotonic()
    for pass_num in range(1, EXPAND_MAX_PASSES + 1):
        if time.monotonic() - start > EXPAND_WALL_CLOCK_BUDGET_S:
            if debug:
                print(f'  [debug] expand loop: {EXPAND_WALL_CLOCK_BUDGET_S}s wall-clock budget exceeded')
            break

        dismiss_overlays(page)

        closed = page.query_selector_all(CLOSED_DISCLOSURE_SELECTOR)
        if debug:
            print(f'  [debug] expand pass {pass_num}: {len(closed)} closed disclosure(s)')
        if not closed:
            break

        for btn in closed:
            if time.monotonic() - start > EXPAND_WALL_CLOCK_BUDGET_S:
                break
            try:
                btn.scroll_into_view_if_needed(timeout=EXPAND_ACTION_TIMEOUT_MS)
                btn.click(timeout=EXPAND_ACTION_TIMEOUT_MS)
            except Exception as e:
                if debug:
                    print(f'  [debug] expand click failed: {e!r}')
        page.wait_for_timeout(300)


def fetch_rendered_html(page, url, debug=False):
    # `page` is a Playwright page reused across every stone in a run — see
    # main(): opening/closing a whole Chromium instance per stone is wasteful
    # when scraping hundreds of them.
    page.goto(url, wait_until='networkidle')

    expand_all_parties(page, debug=debug)

    # No final networkidle wait here: clicking a disclosure button is a
    # local DOM/CSS toggle, not a network request, and the page keeps
    # firing background analytics traffic that never lets networkidle
    # settle once hundreds of rows are rendered.
    page.wait_for_timeout(1500)
    html = page.content()
    if debug:
        print(f'  [debug] final scrollHeight={page.evaluate("document.body.scrollHeight")}')
    return html


import argparse
import json
import random
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_URLS_PATH = PROJECT_ROOT / 'scripts' / 'stone_urls.txt'
DEFAULT_OUTPUT_PATH = PROJECT_ROOT / 'data' / 'slabs.json'
DEFAULT_FAILED_LOG_PATH = PROJECT_ROOT / 'scripts' / 'failed_urls.txt'


def load_existing_data(path):
    if not path.exists():
        return {'updated_at': None, 'stones': []}
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def save_data(data, output_path):
    data = dict(data)
    data['updated_at'] = datetime.now(timezone.utc).astimezone().isoformat(timespec='seconds')
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return data


def write_url_list(path, urls):
    with open(path, 'w', encoding='utf-8') as f:
        for u in urls:
            f.write(u + '\n')


def log_failed_url(path, url, error):
    # The error goes on its own '#' comment line so failed_urls.txt stays a
    # valid input for --urls on a retry (load_stone_urls already skips '#'
    # lines) -- a url+error glued onto one line would get treated as a
    # single, invalid "url" on the next run.
    with open(path, 'a', encoding='utf-8') as f:
        f.write(f'# {error!r}\n{url}\n')


def main(argv=None):
    parser = argparse.ArgumentParser(description='Scrape veneziastone.com slab pages into slabs.json')
    parser.add_argument('--urls', default=str(DEFAULT_URLS_PATH))
    parser.add_argument('--output', default=str(DEFAULT_OUTPUT_PATH))
    parser.add_argument('--debug', action='store_true')
    parser.add_argument('--fetch-images', action='store_true',
                         help="also download each stone's main texture image; run this on its own, less "
                              "frequent schedule than the price scrape (e.g. weekly) since it downloads "
                              "binary files instead of just reading text")
    parser.add_argument('--limit', type=int, default=None,
                         help='process at most N urls this run, leaving the rest queued for next time')
    parser.add_argument('--consume-queue', action='store_true',
                         help='rewrite --urls after each stone to drop it from the file (for large, resumable '
                              'catalog runs); without this flag --urls is left untouched, as for the small '
                              'curated stone_urls.txt list')
    parser.add_argument('--failed-log', default=str(DEFAULT_FAILED_LOG_PATH))
    parser.add_argument('--delay-min', type=float, default=3.0, help='min seconds to wait between stones')
    parser.add_argument('--delay-max', type=float, default=7.0, help='max seconds to wait between stones')
    args = parser.parse_args(argv)

    urls = load_stone_urls(args.urls)
    batch = urls[:args.limit] if args.limit is not None else urls
    output_path = Path(args.output)
    data = load_existing_data(output_path)

    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        for i, url in enumerate(batch):
            print(f'Scraping {url} ...')
            try:
                html = fetch_rendered_html(page, url, debug=args.debug)
                stone, skipped, image_url = extract_slabs_from_html(html, url)
                if stone.get('name') is None:
                    # No <h1> means the site served its ErrorPage / fallback
                    # shell instead of the real stone page (seen under load —
                    # a 200 response with no product data, not a fetch
                    # exception), not a stone that's genuinely out of stock.
                    # Queue it for a retry instead of a silent stderr warning
                    # that's easy to miss across hundreds of stones.
                    print(f'  ERROR: {url} served no <h1> (likely an error/fallback page, not the real stone page)',
                          file=sys.stderr)
                    log_failed_url(Path(args.failed_log), url, 'no <h1> found — likely served an error page')
                else:
                    if args.debug:
                        print(f'  {stone["id"]}: kept {len(stone["slabs"])}, skipped {len(skipped)}')
                        for row in skipped:
                            print('   skipped:', row)
                    if args.fetch_images and image_url:
                        try:
                            images_dir = output_path.parent / 'images'
                            dest_path = download_stone_image(browser, image_url, images_dir, stone['id'])
                            stone['image'] = f'images/{dest_path.name}'
                        except Exception as e:
                            print(f'  ERROR downloading image for {url}: {e!r}', file=sys.stderr)
                    data, was_skipped = merge_stone_into_data(data, stone)
                    if was_skipped:
                        print(f'  WARNING: no available slabs found for {url}, keeping previous data for this stone',
                              file=sys.stderr)
            except Exception as e:
                print(f'  ERROR scraping {url}: {e!r}', file=sys.stderr)
                log_failed_url(Path(args.failed_log), url, e)

            # Persist after every single stone (success or failure) so a
            # crash mid-run never loses progress already made.
            data = save_data(data, output_path)
            if args.consume_queue:
                write_url_list(Path(args.urls), urls[i + 1:])

            if i < len(batch) - 1:
                time.sleep(random.uniform(args.delay_min, args.delay_max))

        browser.close()

    print(f'Wrote {output_path}')


if __name__ == '__main__':
    main()
