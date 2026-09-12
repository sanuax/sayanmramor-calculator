import re

from bs4 import BeautifulSoup


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


def stone_name_from_h1(h1_text):
    m = re.match(r'^\S+\s+(.+?)\s+в слэбах\s*$', h1_text.strip())
    if m:
        return m.group(1)
    return h1_text.strip()


def extract_price_from_cell(td):
    divs = td.find_all('div')
    if not divs:
        return None
    return parse_ru_number(divs[-1].get_text())


def extract_slabs_from_html(html, source_url):
    soup = BeautifulSoup(html, 'html.parser')
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
        'source_url': source_url,
        'slabs': slabs,
    }
    return stone, skipped


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
    if not stone.get('slabs'):
        return data, True

    stones = data.get('stones', [])
    new_stones = []
    updated = False
    for existing in stones:
        if existing.get('id') == stone['id']:
            new_stones.append(stone)
            updated = True
        else:
            new_stones.append(existing)
    if not updated:
        new_stones.append(stone)

    new_data = dict(data)
    new_data['stones'] = new_stones
    return new_data, False


def fetch_rendered_html(url, debug=False):
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(url, wait_until='networkidle')

        # Each party block (.prt) is a Headless UI Disclosure (accordion):
        # its slab rows are already in the DOM but collapsed, and only
        # appear in page.content() once its disclosure button is clicked
        # open. Neither scrolling nor visibility triggers this — it takes
        # an actual click on each of the 15 party blocks.
        parties = page.query_selector_all('.prt')
        if debug:
            print(f'  [debug] found {len(parties)} party blocks')

        for i, party in enumerate(parties):
            try:
                target = party.query_selector('[id^="headlessui-disclosure-button"]') \
                    or party.query_selector('.stretched-link')
                if target:
                    target.scroll_into_view_if_needed()
                    target.click(timeout=3000)
            except Exception as e:
                if debug:
                    print(f'  [debug] party {i + 1}/{len(parties)}, click failed: {e!r}')
            page.wait_for_timeout(150)
            if debug:
                height = page.evaluate('document.body.scrollHeight')
                print(f'  [debug] party {i + 1}/{len(parties)}, scrollHeight={height}')

        # No final networkidle wait here: clicking a disclosure button is a
        # local DOM/CSS toggle, not a network request, and the page keeps
        # firing background analytics traffic that never lets networkidle
        # settle once hundreds of rows are rendered.
        page.wait_for_timeout(1500)
        html = page.content()
        if debug:
            print(f'  [debug] final scrollHeight={page.evaluate("document.body.scrollHeight")}')
        browser.close()
        return html


import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_URLS_PATH = PROJECT_ROOT / 'scripts' / 'stone_urls.txt'
DEFAULT_OUTPUT_PATH = PROJECT_ROOT / 'data' / 'slabs.json'


def load_existing_data(path):
    if not path.exists():
        return {'updated_at': None, 'stones': []}
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def main(argv=None):
    parser = argparse.ArgumentParser(description='Scrape veneziastone.com slab pages into slabs.json')
    parser.add_argument('--urls', default=str(DEFAULT_URLS_PATH))
    parser.add_argument('--output', default=str(DEFAULT_OUTPUT_PATH))
    parser.add_argument('--debug', action='store_true')
    args = parser.parse_args(argv)

    urls = load_stone_urls(args.urls)
    data = load_existing_data(Path(args.output))

    for url in urls:
        print(f'Scraping {url} ...')
        html = fetch_rendered_html(url, debug=args.debug)
        stone, skipped = extract_slabs_from_html(html, url)
        if args.debug:
            print(f'  {stone["id"]}: kept {len(stone["slabs"])}, skipped {len(skipped)}')
            for row in skipped:
                print('   skipped:', row)
        data, was_skipped = merge_stone_into_data(data, stone)
        if was_skipped:
            print(f'  WARNING: no available slabs found for {url}, keeping previous data for this stone', file=sys.stderr)

    data['updated_at'] = datetime.now(timezone.utc).astimezone().isoformat(timespec='seconds')

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'Wrote {output_path}')


if __name__ == '__main__':
    main()
