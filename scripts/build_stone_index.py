"""Build the site's light stone index from data/slabs.json.

data/slabs.json stays the one source of truth: the calculator reads all of
it (slabs, prices, colours, ...). The site's category pages need only a few
fields of each stone that can still be ordered, so this writes just those,
in the source's order, as data/stone-index.json:

    {"updated_at": "<copied from slabs.json>",
     "stones": [{"id": ..., "name": ..., "category_label_ru": ..., "image": ..., "price_from": ...,
                 "countries": [{"label_ru": ...}], "colors": [{"label_ru": ...}], "tone": ...}, ...]}

price_from: the stone's lowest price per m2 among its slabs, whole roubles
(null when no slab has a price) -- the price the stone galleries filter by
(«Цена от … до …») and the configurator's card shows as «от … ₽/м²».
countries / colors: as in slabs.json, each item with its Russian label only --
the galleries' «Страна» and «Цвет» filters (an empty list when the stone has none).
tone: the stone's place in the galleries' colour gradient (0, 1, 2, ...; the sort
«Цвет»), worked out from its photo each time this script runs, so a stone the
parser has just added takes its place by itself. It is an order only, never shown
and never a property of the stone. null: no photo, or the supplier's placeholder
picture (the galleries put such a stone last). Reading photos needs Pillow.

Stones with `available` set to False are left out; every other stone must
have an id (unique) and a name. The input is validated before anything is
written: on any problem the script says what is wrong, exits non-zero and
leaves an existing stone-index.json as it was.

Usage:
  python scripts/build_stone_index.py [--input data/slabs.json] [--output data/stone-index.json]
"""
import argparse
import json
import math
import os
import sys
import tempfile
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT_PATH = PROJECT_ROOT / 'data' / 'slabs.json'
DEFAULT_OUTPUT_PATH = PROJECT_ROOT / 'data' / 'stone-index.json'
FIELDS = ('id', 'name', 'category_label_ru', 'image', 'price_from', 'countries', 'colors', 'tone')
TONE_SIZE = (48, 28)          # a photo is judged at this size: fast, and the veins do not decide
LIKENESS_SIZE = (16, 10)      # ... and compared with the others at this one
PLACEHOLDER_REPEATS = 3       # this many stones with one and the same picture: not a photo of them
CHROMA_NEUTRAL = 9.0          # Lab chroma below this: white, grey or black, not a colour
LIGHT_WHITE = 78.0            # a neutral at least this light is white
LIGHT_BLACK = 30.0            # a neutral darker than this is black
# The gradient: each family in turn, light first (-1) or dark first (1), so that each ends about
# where the next begins: white, beige to brown, dark red up to pink, violet, blue, green, grey, black.
TONE_FAMILIES = (('white', -1), ('warm', -1), ('red', 1), ('violet', -1), ('blue', 1), ('green', -1), ('grey', -1), ('black', -1))


class StoneIndexError(ValueError):
    """slabs.json is not in a shape the index can be built from."""


def _text(value):
    return '' if value is None else str(value)


def _labels(items):
    """[{'label_ru': ..., ...}, ...] -> [{'label_ru': ...}, ...]: the Russian labels only, in order, without blanks or repeats."""
    out = []
    for item in items or []:
        label = item.get('label_ru') if isinstance(item, dict) else None
        if isinstance(label, str) and label.strip() and {'label_ru': label} not in out:
            out.append({'label_ru': label})
    return out


def _price_from(stone):
    """The lowest positive price per m2 among the stone's slabs, rounded to whole roubles, or None."""
    prices = []
    for slab in stone.get('slabs') or []:
        price = slab.get('price_per_m2_rub') if isinstance(slab, dict) else None
        if isinstance(price, (int, float)) and not isinstance(price, bool) and 0 < price < float('inf'):
            prices.append(price)
    return round(min(prices)) if prices else None


def build_stone_index(data):
    """slabs.json data -> the index (a new object; `data` is not changed)."""
    if not isinstance(data, dict):
        raise StoneIndexError('slabs.json: the top level must be an object')
    stones = data.get('stones')
    if not isinstance(stones, list):
        raise StoneIndexError('slabs.json: a "stones" array is required')
    index = []
    seen = set()
    for i, stone in enumerate(stones):
        if not isinstance(stone, dict):
            raise StoneIndexError(f'slabs.json: stones[{i}] is not an object')
        if stone.get('available') is False:
            continue
        stone_id = stone.get('id')
        if not isinstance(stone_id, str) or not stone_id.strip():
            raise StoneIndexError(f'slabs.json: stones[{i}] has no id')
        if stone_id in seen:
            raise StoneIndexError(f'slabs.json: id "{stone_id}" appears more than once')
        seen.add(stone_id)
        name = stone.get('name')
        if not isinstance(name, str) or not name.strip():
            raise StoneIndexError(f'slabs.json: stone "{stone_id}" has no name')
        index.append({
            'id': stone_id,
            'name': name,
            'category_label_ru': _text(stone.get('category_label_ru')),
            'image': _text(stone.get('image')),
            'price_from': _price_from(stone),
            'countries': _labels(stone.get('countries')),
            'colors': _labels(stone.get('colors')),
            'tone': None,
        })
    return {'updated_at': data.get('updated_at'), 'stones': index}


def _srgb_to_lab(r, g, b):
    """One sRGB pixel (0-255) -> CIE Lab (D65): lightness and two colour axes, closer to what the eye sees than RGB."""
    def linear(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    def f(t):
        return t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116

    r, g, b = linear(r), linear(g), linear(b)
    x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047)
    y = f(0.2126 * r + 0.7152 * g + 0.0722 * b)
    z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883)
    return 116 * y - 16, 500 * (x - y), 200 * (y - z)


def read_photo(path):
    """A stone photo -> (its colour as a median Lab, so veins do not shift it; a coarse likeness to compare photos by)."""
    from PIL import Image
    with Image.open(path) as im:
        rgb = im.convert('RGB')
        small = rgb.resize(TONE_SIZE, Image.BOX).tobytes()
        likeness = bytes(v // 6 for v in rgb.resize(LIKENESS_SIZE, Image.BOX).tobytes())
    labs = [_srgb_to_lab(small[i], small[i + 1], small[i + 2]) for i in range(0, len(small), 3)]
    return tuple(sorted(channel)[len(channel) // 2] for channel in zip(*labs)), likeness


def tone_family(lab):
    """The family of the gradient a Lab colour belongs to (TONE_FAMILIES)."""
    light, a, b = lab
    if math.hypot(a, b) < CHROMA_NEUTRAL:
        return 'white' if light >= LIGHT_WHITE else 'black' if light < LIGHT_BLACK else 'grey'
    hue = math.degrees(math.atan2(b, a)) % 360
    if 60 <= hue < 112:
        return 'warm'
    if hue < 60 or hue >= 330:
        return 'red'
    if hue >= 270:
        return 'violet'
    return 'blue' if hue >= 180 else 'green'


def tone_order(colors):
    """{stone id: Lab} -> {stone id: its place in the gradient}, from 0; the same colours always give the same order."""
    ordered = []
    for family, direction in TONE_FAMILIES:
        members = [stone_id for stone_id, lab in colors.items() if tone_family(lab) == family]
        ordered += sorted(members, key=lambda stone_id: (direction * colors[stone_id][0], stone_id))
    return {stone_id: place for place, stone_id in enumerate(ordered)}


def add_tones(index, base_dir):
    """Fill `tone` from the photos under base_dir. A stone stays at null without a readable
    photo, or when its picture is the one several stones share. Returns how many stayed so."""
    photos = {}
    for stone in index['stones']:
        path = Path(base_dir) / stone['image'] if stone['image'] else None
        if path is None or not path.is_file():
            continue
        try:
            photos[stone['id']] = read_photo(path)
        except OSError as e:
            print(f'WARNING: {path} cannot be read ({e}); this stone goes last in the gradient', file=sys.stderr)
    repeats = {}
    for _, likeness in photos.values():
        repeats[likeness] = repeats.get(likeness, 0) + 1
    colors = {stone_id: lab for stone_id, (lab, likeness) in photos.items() if repeats[likeness] < PLACEHOLDER_REPEATS}
    order = tone_order(colors)
    for stone in index['stones']:
        stone['tone'] = order.get(stone['id'])
    return len(index['stones']) - len(order)


def serialize(index):
    """Compact UTF-8 JSON (no pretty-print)."""
    return json.dumps(index, ensure_ascii=False, separators=(',', ':')).encode('utf-8')


def write_atomically(path, payload):
    """Write `payload` to `path` through a temporary file in the same folder,
    so a reader never sees a half-written index and a failure leaves the old
    one in place."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=path.name + '.', suffix='.tmp', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(payload)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise


def main(argv=None):
    parser = argparse.ArgumentParser(description='Build data/stone-index.json from data/slabs.json')
    parser.add_argument('--input', default=str(DEFAULT_INPUT_PATH))
    parser.add_argument('--output', default=str(DEFAULT_OUTPUT_PATH))
    args = parser.parse_args(argv)

    input_path = Path(args.input)
    if not input_path.is_file():
        print(f'ERROR: {input_path} does not exist; nothing written', file=sys.stderr)
        return 1
    try:
        with open(input_path, encoding='utf-8') as f:
            data = json.load(f)
        index = build_stone_index(data)
        without_tone = add_tones(index, input_path.parent)
    except ImportError:
        print('ERROR: reading the stone photos needs Pillow (python -m pip install pillow); nothing written', file=sys.stderr)
        return 1
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        print(f'ERROR: {input_path} is not valid JSON ({e}); nothing written', file=sys.stderr)
        return 1
    except StoneIndexError as e:
        print(f'ERROR: {e}; nothing written', file=sys.stderr)
        return 1

    payload = serialize(index)
    write_atomically(args.output, payload)
    total = len(data['stones'])
    print(f'Wrote {args.output}: {len(index["stones"])} of {total} stones, {len(payload)} bytes, {without_tone} without a place in the colour gradient')
    return 0


if __name__ == '__main__':
    sys.exit(main())
