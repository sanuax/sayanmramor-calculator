"""Build the site's light stone index from data/slabs.json.

data/slabs.json stays the one source of truth: the calculator reads all of
it (slabs, prices, colours, ...). The site's category pages need only four
fields of each stone that can still be ordered, so this writes just those,
in the source's order, as data/stone-index.json:

    {"updated_at": "<copied from slabs.json>",
     "stones": [{"id": ..., "name": ..., "category_label_ru": ..., "image": ...}, ...]}

Stones with `available` set to False are left out; every other stone must
have an id (unique) and a name. The input is validated before anything is
written: on any problem the script says what is wrong, exits non-zero and
leaves an existing stone-index.json as it was.

Usage:
  python scripts/build_stone_index.py [--input data/slabs.json] [--output data/stone-index.json]
"""
import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT_PATH = PROJECT_ROOT / 'data' / 'slabs.json'
DEFAULT_OUTPUT_PATH = PROJECT_ROOT / 'data' / 'stone-index.json'
FIELDS = ('id', 'name', 'category_label_ru', 'image')


class StoneIndexError(ValueError):
    """slabs.json is not in a shape the index can be built from."""


def _text(value):
    return '' if value is None else str(value)


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
        })
    return {'updated_at': data.get('updated_at'), 'stones': index}


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
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        print(f'ERROR: {input_path} is not valid JSON ({e}); nothing written', file=sys.stderr)
        return 1
    except StoneIndexError as e:
        print(f'ERROR: {e}; nothing written', file=sys.stderr)
        return 1

    payload = serialize(index)
    write_atomically(args.output, payload)
    total = len(data['stones'])
    print(f'Wrote {args.output}: {len(index["stones"])} of {total} stones, {len(payload)} bytes')
    return 0


if __name__ == '__main__':
    sys.exit(main())
