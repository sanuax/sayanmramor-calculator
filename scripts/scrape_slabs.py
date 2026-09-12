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
