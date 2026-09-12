import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))
import scrape_slabs


class ParseRuNumberTests(unittest.TestCase):
    def test_thousands_with_nbsp_and_currency_symbol(self):
        self.assertEqual(scrape_slabs.parse_ru_number('11\xa0008 ₽'), 11008.0)

    def test_comma_decimal(self):
        self.assertEqual(scrape_slabs.parse_ru_number('0,10'), 0.1)

    def test_dash_is_none(self):
        self.assertIsNone(scrape_slabs.parse_ru_number('—'))

    def test_none_is_none(self):
        self.assertIsNone(scrape_slabs.parse_ru_number(None))

    def test_plain_space_thousands(self):
        self.assertEqual(scrape_slabs.parse_ru_number('12 231 ₽'), 12231.0)


class StoneIdFromUrlTests(unittest.TestCase):
    def test_typical_slabs_url(self):
        stone_id, category = scrape_slabs.stone_id_and_category_from_url(
            'https://veneziastone.com/marble/delicato-brown/slabs/'
        )
        self.assertEqual(stone_id, 'delicato-brown')
        self.assertEqual(category, 'marble')

    def test_url_without_trailing_slash(self):
        stone_id, category = scrape_slabs.stone_id_and_category_from_url(
            'https://veneziastone.com/onyx/white-onyx/slabs'
        )
        self.assertEqual(stone_id, 'white-onyx')
        self.assertEqual(category, 'onyx')


if __name__ == '__main__':
    unittest.main()
