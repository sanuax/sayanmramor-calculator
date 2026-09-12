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


if __name__ == '__main__':
    unittest.main()
