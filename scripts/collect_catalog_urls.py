"""Collect individual stone slab-page URLs from the veneziastone.com catalog
(https://veneziastone.com/slabs/?page=N) into a queue file that
scrape_slabs.py can consume with --consume-queue.

Finds stone links by URL shape (`.../<category>/<stone-id>/slabs/`) rather
than by catalog card markup, since that shape is already known from every
individual stone page and is far less likely to break than a CSS selector
for the catalog's card component.
"""
import argparse
import re
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT_PATH = PROJECT_ROOT / 'scripts' / 'catalog_queue.txt'
CATALOG_PAGE_URL = 'https://veneziastone.com/slabs/?page={}'
STONE_URL_RE = re.compile(r'^https://veneziastone\.com/[^/]+/[^/]+/slabs/?$')


def extract_stone_links(page):
    hrefs = page.eval_on_selector_all('a[href]', 'els => els.map(e => e.href)')
    return sorted(set(h for h in hrefs if STONE_URL_RE.match(h)))


def main(argv=None):
    parser = argparse.ArgumentParser(description='Collect stone slab-page URLs from the veneziastone.com catalog')
    parser.add_argument('--output', default=str(DEFAULT_OUTPUT_PATH))
    parser.add_argument('--max-pages', type=int, default=200, help='safety cap on catalog pages to visit')
    parser.add_argument('--delay', type=float, default=1.5, help='seconds to wait between catalog pages')
    parser.add_argument('--debug', action='store_true')
    args = parser.parse_args(argv)

    from playwright.sync_api import sync_playwright

    all_urls = set()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        for page_num in range(1, args.max_pages + 1):
            url = CATALOG_PAGE_URL.format(page_num)
            page.goto(url, wait_until='networkidle', timeout=45000)
            found = extract_stone_links(page)
            if args.debug:
                print(f'  page {page_num}: {len(found)} stone links')
            if not found:
                if args.debug:
                    print(f'  page {page_num} is empty, stopping')
                break
            all_urls.update(found)
            time.sleep(args.delay)

        browser.close()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        for u in sorted(all_urls):
            f.write(u + '\n')
    print(f'Found {len(all_urls)} stone URLs, wrote {output_path}')


if __name__ == '__main__':
    main()
