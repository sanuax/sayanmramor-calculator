import copy
import hashlib
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))
import build_stone_index as bsi

REAL_SLABS = bsi.DEFAULT_INPUT_PATH


def sample():
    return {
        'updated_at': '2026-09-15T23:53:23+03:00',
        'stones': [
            {'id': 'nero-marquina', 'name': 'Nero Marquina', 'category': 'marble', 'category_label_ru': 'Мрамор',
             'colors': ['black'], 'countries': [{'code': 'es'}], 'image': 'images/nero-marquina.webp',
             'slabs': [{'article': 'M1', 'width_cm': 300}], 'available': True},
            {'id': 'sold-out', 'name': 'Sold Out', 'category_label_ru': 'Мрамор', 'image': 'images/sold-out.webp',
             'available': False},
            {'id': 'absolute-black', 'name': 'Absolute Black', 'category_label_ru': 'Гранит',
             'image': 'images/absolute-black.webp'},
            {'id': 'no-type', 'name': 'No Type', 'category_label_ru': None, 'image': None, 'available': True},
        ],
    }


def run_main(*args):
    out, err = StringIO(), StringIO()
    with redirect_stdout(out), redirect_stderr(err):
        code = bsi.main(list(args))
    return code, out.getvalue(), err.getvalue()


class BuildStoneIndexTests(unittest.TestCase):
    def test_unavailable_stones_are_left_out_and_order_is_kept(self):
        index = bsi.build_stone_index(sample())
        self.assertEqual([s['id'] for s in index['stones']], ['nero-marquina', 'absolute-black', 'no-type'])

    def test_each_stone_has_exactly_the_four_fields(self):
        for stone in bsi.build_stone_index(sample())['stones']:
            self.assertEqual(list(stone.keys()), ['id', 'name', 'category_label_ru', 'image'])

    def test_missing_type_and_image_become_empty_strings(self):
        stone = bsi.build_stone_index(sample())['stones'][-1]
        self.assertEqual(stone, {'id': 'no-type', 'name': 'No Type', 'category_label_ru': '', 'image': ''})

    def test_updated_at_is_carried_over(self):
        self.assertEqual(bsi.build_stone_index(sample())['updated_at'], '2026-09-15T23:53:23+03:00')

    def test_input_data_is_not_changed(self):
        data = sample()
        before = copy.deepcopy(data)
        bsi.build_stone_index(data)
        self.assertEqual(data, before)

    def test_invalid_input_is_refused(self):
        bad = [
            [],                                                          # not an object
            {'updated_at': None},                                        # no stones
            {'stones': {'id': 'x'}},                                     # stones not an array
            {'stones': ['x']},                                           # a stone that is not an object
            {'stones': [{'name': 'No Id'}]},                             # available stone without id
            {'stones': [{'id': ' ', 'name': 'Blank Id'}]},
            {'stones': [{'id': 'a', 'name': 'A'}, {'id': 'a', 'name': 'A again'}]},   # duplicate id
            {'stones': [{'id': 'a'}]},                                   # available stone without name
        ]
        for data in bad:
            with self.subTest(data=data):
                with self.assertRaises(bsi.StoneIndexError):
                    bsi.build_stone_index(data)

    def test_unavailable_stones_are_not_validated(self):
        # A stone that is left out cannot break the index.
        data = {'stones': [{'id': 'a', 'name': 'A'}, {'available': False}]}
        self.assertEqual(len(bsi.build_stone_index(data)['stones']), 1)

    def test_output_is_compact_utf8_json(self):
        payload = bsi.serialize(bsi.build_stone_index(sample()))
        text = payload.decode('utf-8')
        self.assertIn('Мрамор', text)
        self.assertNotIn('\n', text)
        self.assertNotIn(': ', text)
        self.assertEqual(json.loads(text), bsi.build_stone_index(sample()))


class MainTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.input = self.dir / 'slabs.json'
        self.output = self.dir / 'stone-index.json'

    def tearDown(self):
        self.tmp.cleanup()

    def test_writes_the_index(self):
        self.input.write_text(json.dumps(sample(), ensure_ascii=False), encoding='utf-8')
        code, out, _ = run_main('--input', str(self.input), '--output', str(self.output))
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(self.output.read_text(encoding='utf-8')), bsi.build_stone_index(sample()))
        self.assertIn('3 of 4 stones', out)

    def test_bad_input_leaves_the_existing_index_untouched(self):
        self.output.write_text('{"previous": true}', encoding='utf-8')
        cases = {
            'missing file': None,
            'broken json': '{"stones": [',
            'duplicate id': json.dumps({'stones': [{'id': 'a', 'name': 'A'}, {'id': 'a', 'name': 'B'}]}),
        }
        for label, content in cases.items():
            with self.subTest(label):
                if content is None:
                    if self.input.exists():
                        self.input.unlink()
                else:
                    self.input.write_text(content, encoding='utf-8')
                code, _, err = run_main('--input', str(self.input), '--output', str(self.output))
                self.assertNotEqual(code, 0)
                self.assertIn('nothing written', err)
                self.assertEqual(self.output.read_text(encoding='utf-8'), '{"previous": true}')
                self.assertEqual([p.name for p in self.dir.iterdir() if p.suffix == '.tmp'], [])

    def test_input_file_is_not_modified(self):
        self.input.write_text(json.dumps(sample(), ensure_ascii=False, indent=2), encoding='utf-8')
        before = self.input.read_bytes()
        run_main('--input', str(self.input), '--output', str(self.output))
        self.assertEqual(self.input.read_bytes(), before)


@unittest.skipUnless(REAL_SLABS.is_file(), 'data/slabs.json is not in git; present only on the working machine')
class RealCatalogTests(unittest.TestCase):
    def test_real_catalog(self):
        raw = REAL_SLABS.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        data = json.loads(raw)
        index = bsi.build_stone_index(data)
        self.assertEqual(len(data['stones']), 891)
        self.assertEqual(len(index['stones']), 883)
        ids = [s['id'] for s in index['stones']]
        self.assertEqual(len(ids), len(set(ids)))
        # Exactly the stones that are not marked unavailable, in the source's order.
        self.assertEqual(ids, [s['id'] for s in data['stones'] if s.get('available') is not False])
        self.assertEqual(index['updated_at'], data['updated_at'])
        # Building the index never touches the calculator's data.
        with tempfile.TemporaryDirectory() as tmp:
            code, _, _ = run_main('--output', str(Path(tmp) / 'stone-index.json'))
            self.assertEqual(code, 0)
        self.assertEqual(hashlib.sha256(REAL_SLABS.read_bytes()).hexdigest(), digest)


if __name__ == '__main__':
    unittest.main()
