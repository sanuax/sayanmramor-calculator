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
