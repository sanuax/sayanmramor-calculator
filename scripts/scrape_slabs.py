import re


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
