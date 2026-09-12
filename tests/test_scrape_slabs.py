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


class StoneNameFromH1Tests(unittest.TestCase):
    def test_typical_h1(self):
        self.assertEqual(
            scrape_slabs.stone_name_from_h1('Мрамор Delicato Brown в слэбах'),
            'Delicato Brown'
        )

    def test_falls_back_to_raw_text_on_mismatch(self):
        self.assertEqual(
            scrape_slabs.stone_name_from_h1('  Какой-то другой заголовок  '),
            'Какой-то другой заголовок'
        )


FIXTURE_PATH = Path(__file__).resolve().parent / 'fixtures' / 'delicato-brown-slabs.html'
FIXTURE_URL = 'https://veneziastone.com/marble/delicato-brown/slabs/'


class ExtractSlabsFromHtmlTests(unittest.TestCase):
    def setUp(self):
        with open(FIXTURE_PATH, encoding='utf-8') as f:
            self.html = f.read()

    def test_stone_metadata(self):
        stone, _ = scrape_slabs.extract_slabs_from_html(self.html, FIXTURE_URL)
        self.assertEqual(stone['id'], 'delicato-brown')
        self.assertEqual(stone['category'], 'marble')
        self.assertEqual(stone['name'], 'Delicato Brown')
        self.assertEqual(stone['source_url'], FIXTURE_URL)

    def test_keeps_available_slabs_with_correct_fields(self):
        stone, _ = scrape_slabs.extract_slabs_from_html(self.html, FIXTURE_URL)
        self.assertEqual(len(stone['slabs']), 16)
        by_article = {s['article']: s for s in stone['slabs']}
        self.assertIn('P0444194', by_article)
        slab = by_article['P0444194']
        self.assertEqual(slab['width_cm'], 276)
        self.assertEqual(slab['length_cm'], 177)
        self.assertEqual(slab['price_per_m2_rub'], 11008.0)
        self.assertEqual(slab['price_total_rub'], 52673.0)
        self.assertEqual(slab['party'], '13168')
        self.assertEqual(slab['pachka'], 'BLP02316')
        self.assertEqual(slab['city'], 'Санкт-Петербург')

    def test_excludes_reserved_and_sold_rows(self):
        stone, skipped = scrape_slabs.extract_slabs_from_html(self.html, FIXTURE_URL)
        kept_articles = {s['article'] for s in stone['slabs']}
        self.assertNotIn('P0444195', kept_articles)  # В резерве
        self.assertNotIn('P0517504', kept_articles)  # Продано
        skipped_statuses = {row['status'] for row in skipped}
        self.assertIn('В резерве', skipped_statuses)
        self.assertIn('Продано', skipped_statuses)

    def test_excludes_synthetic_po_zaprosu_row(self):
        html = _make_synthetic_batch_html(
            article='ART1', status_text='По запросу',
            include_request_button=True,
        )
        stone, skipped = scrape_slabs.extract_slabs_from_html(html, 'https://example.test/marble/x/slabs/')
        self.assertEqual(stone['slabs'], [])
        self.assertEqual(skipped[0]['status'], 'По запросу')

    def test_excludes_row_with_only_request_button_no_status_span(self):
        html = _make_synthetic_batch_html(article='ART2', status_text=None, include_request_button=True)
        stone, skipped = scrape_slabs.extract_slabs_from_html(html, 'https://example.test/marble/x/slabs/')
        self.assertEqual(stone['slabs'], [])
        self.assertTrue(skipped[0]['has_request_btn'])

    def test_keeps_row_with_no_status_and_cart_button(self):
        html = _make_synthetic_batch_html(article='ART3', status_text=None, include_request_button=False)
        stone, skipped = scrape_slabs.extract_slabs_from_html(html, 'https://example.test/marble/x/slabs/')
        self.assertEqual(len(stone['slabs']), 1)
        self.assertEqual(stone['slabs'][0]['article'], 'ART3')
        self.assertEqual(skipped, [])


def _make_synthetic_batch_html(article, status_text, include_request_button):
    status_span = f'<span class="font-bold">{status_text}</span>' if status_text else ''
    action_btn = (
        '<button aria-label="Заявка">Заявка</button>'
        if include_request_button
        else '<button aria-label="В корзину">В корзину</button>'
    )
    return f'''
    <html><body>
    <h1>Мрамор Test Stone в слэбах</h1>
    <div>
      <div class="prt-container">Партия #1</div>
      <table class="pr-table"><tbody>
        <tr class="pr-tr">
          <td class="pr-td"></td>
          <td class="pr-td"><div><button>{article} </button></div>{status_span}</td>
          <td class="pr-td">PACHKA1</td>
          <td class="pr-td">Москва</td>
          <td class="pr-td">2,00 x 1,00</td>
          <td class="pr-td">—</td>
          <td class="pr-td">2,00</td>
          <td class="pr-td">0%</td>
          <td class="pr-td"><div>10000 ₽</div></td>
          <td class="pr-td"><div>20000 ₽</div></td>
          <td class="pr-td">{action_btn}</td>
        </tr>
      </tbody></table>
    </div>
    </body></html>
    '''


if __name__ == '__main__':
    unittest.main()
