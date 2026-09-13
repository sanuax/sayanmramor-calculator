import sys
import unittest
from pathlib import Path

from bs4 import BeautifulSoup

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
            scrape_slabs.stone_name_from_h1('  ЕдинственноеСлово  '),
            'ЕдинственноеСлово'
        )

    def test_strips_leading_category_word_without_v_slabah_suffix(self):
        self.assertEqual(
            scrape_slabs.stone_name_from_h1('мрамор Arabescato Vagli'),
            'Arabescato Vagli'
        )

    def test_translates_known_russian_origin_word(self):
        self.assertEqual(
            scrape_slabs.stone_name_from_h1('Мрамор Crema Marfil Сирийский в слэбах'),
            'Crema Marfil Syrian'
        )

    def test_transliterates_polockii_with_no_english_name(self):
        self.assertEqual(
            scrape_slabs.stone_name_from_h1('Мрамор Полоцкий в слэбах'),
            'Polotskiy'
        )


class ExtractMainImageUrlTests(unittest.TestCase):
    def test_prefers_og_image_meta_tag(self):
        html = '''
        <html><head>
          <meta property="og:image" content="https://veneziastone.com/img/hero.jpg">
        </head><body>
          <main><img src="https://veneziastone.com/img/thumb.jpg"></main>
        </body></html>
        '''
        soup = BeautifulSoup(html, 'html.parser')
        self.assertEqual(
            scrape_slabs.extract_main_image_url(soup),
            'https://veneziastone.com/img/hero.jpg'
        )

    def test_falls_back_to_first_img_in_main_when_no_og_image(self):
        html = '''
        <html><body>
          <main><img src="https://veneziastone.com/img/thumb.jpg"></main>
        </body></html>
        '''
        soup = BeautifulSoup(html, 'html.parser')
        self.assertEqual(
            scrape_slabs.extract_main_image_url(soup),
            'https://veneziastone.com/img/thumb.jpg'
        )

    def test_none_when_no_image_found_anywhere(self):
        html = '<html><body><main><p>no images here</p></main></body></html>'
        soup = BeautifulSoup(html, 'html.parser')
        self.assertIsNone(scrape_slabs.extract_main_image_url(soup))


FIXTURE_PATH = Path(__file__).resolve().parent / 'fixtures' / 'delicato-brown-slabs.html'
FIXTURE_URL = 'https://veneziastone.com/marble/delicato-brown/slabs/'


class ExtractSlabsFromHtmlTests(unittest.TestCase):
    def setUp(self):
        with open(FIXTURE_PATH, encoding='utf-8') as f:
            self.html = f.read()

    def test_stone_metadata(self):
        stone, _, _ = scrape_slabs.extract_slabs_from_html(self.html, FIXTURE_URL)
        self.assertEqual(stone['id'], 'delicato-brown')
        self.assertEqual(stone['category'], 'marble')
        self.assertEqual(stone['hardness_category'], 1)
        self.assertEqual(stone['name'], 'Delicato Brown')
        self.assertEqual(stone['source_url'], FIXTURE_URL)

    def test_hardness_category_by_segment(self):
        cases = [
            ('https://veneziastone.com/granite/absolute-black/slabs/', 2),
            ('https://veneziastone.com/agate/agate-delta/slabs/', 3),
            ('https://veneziastone.com/some-future-stone/x/slabs/', None),
        ]
        for url, expected in cases:
            stone, _, _ = scrape_slabs.extract_slabs_from_html(self.html, url)
            self.assertEqual(stone['hardness_category'], expected, url)

    def test_keeps_available_slabs_with_correct_fields(self):
        stone, _, _ = scrape_slabs.extract_slabs_from_html(self.html, FIXTURE_URL)
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
        stone, skipped, _ = scrape_slabs.extract_slabs_from_html(self.html, FIXTURE_URL)
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
        stone, skipped, _ = scrape_slabs.extract_slabs_from_html(html, 'https://example.test/marble/x/slabs/')
        self.assertEqual(stone['slabs'], [])
        self.assertEqual(skipped[0]['status'], 'По запросу')

    def test_excludes_row_with_only_request_button_no_status_span(self):
        html = _make_synthetic_batch_html(article='ART2', status_text=None, include_request_button=True)
        stone, skipped, _ = scrape_slabs.extract_slabs_from_html(html, 'https://example.test/marble/x/slabs/')
        self.assertEqual(stone['slabs'], [])
        self.assertTrue(skipped[0]['has_request_btn'])

    def test_keeps_row_with_no_status_and_cart_button(self):
        html = _make_synthetic_batch_html(article='ART3', status_text=None, include_request_button=False)
        stone, skipped, _ = scrape_slabs.extract_slabs_from_html(html, 'https://example.test/marble/x/slabs/')
        self.assertEqual(len(stone['slabs']), 1)
        self.assertEqual(stone['slabs'][0]['article'], 'ART3')
        self.assertEqual(skipped, [])

    def test_no_h1_gives_none_name_not_a_fake_empty_stone(self):
        # The site occasionally serves its ErrorPage/fallback shell (HTTP 200,
        # no product data) instead of a real stone page under load. That page
        # has no <h1>, unlike every real stone page -- callers use a None
        # name to tell "error page" apart from "stone genuinely has 0 slabs
        # in stock" (which still has a real <h1>).
        html = '<html><body><div>Товар не найден</div></body></html>'
        stone, skipped, _ = scrape_slabs.extract_slabs_from_html(html, 'https://example.test/agate/x/slabs/')
        self.assertIsNone(stone['name'])
        self.assertEqual(stone['slabs'], [])
        self.assertEqual(skipped, [])

    def test_returns_main_image_url_as_third_value(self):
        _, _, image_url = scrape_slabs.extract_slabs_from_html(self.html, FIXTURE_URL)
        self.assertEqual(
            image_url,
            'https://cdn.veneziastone.com/234dfwer3r/resize:fill:850:500/enlarge:1/'
            'gravity:ce/format:webp/plain/https://storage.yandexcloud.net/'
            'venezia-photo/textures1710/00354.JPG'
        )


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


import tempfile
import os


class LoadStoneUrlsTests(unittest.TestCase):
    def test_skips_blank_lines_and_comments(self):
        content = "# comment\n\nhttps://veneziastone.com/marble/delicato-brown/slabs/\n  \n# another\nhttps://veneziastone.com/onyx/white/slabs/\n"
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='utf-8') as f:
            f.write(content)
            path = f.name
        try:
            urls = scrape_slabs.load_stone_urls(path)
            self.assertEqual(urls, [
                'https://veneziastone.com/marble/delicato-brown/slabs/',
                'https://veneziastone.com/onyx/white/slabs/',
            ])
        finally:
            os.unlink(path)


class LogFailedUrlTests(unittest.TestCase):
    def test_round_trips_cleanly_through_load_stone_urls(self):
        # A url+error glued onto one line (the original bug) would come back
        # out of load_stone_urls as one bogus "url" containing the error
        # text, breaking a retry run built on the same file.
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='utf-8') as f:
            path = f.name
        try:
            scrape_slabs.log_failed_url(path, 'https://veneziastone.com/agate/athena/slabs/', TimeoutError('boom'))
            scrape_slabs.log_failed_url(path, 'https://veneziastone.com/agate/aura/slabs/', TimeoutError('boom2'))
            urls = scrape_slabs.load_stone_urls(path)
            self.assertEqual(urls, [
                'https://veneziastone.com/agate/athena/slabs/',
                'https://veneziastone.com/agate/aura/slabs/',
            ])
        finally:
            os.unlink(path)


class MergeStoneIntoDataTests(unittest.TestCase):
    def test_inserts_new_stone(self):
        data = {'updated_at': None, 'stones': []}
        stone = {'id': 'delicato-brown', 'name': 'Delicato Brown', 'slabs': [{'article': 'A1'}]}
        new_data, skipped = scrape_slabs.merge_stone_into_data(data, stone)
        self.assertFalse(skipped)
        self.assertEqual(len(new_data['stones']), 1)
        self.assertEqual(new_data['stones'][0]['id'], 'delicato-brown')

    def test_updates_existing_stone_without_touching_others(self):
        data = {
            'updated_at': None,
            'stones': [
                {'id': 'delicato-brown', 'name': 'Old', 'slabs': [{'article': 'OLD'}]},
                {'id': 'other-stone', 'name': 'Other', 'slabs': [{'article': 'X1'}]},
            ],
        }
        stone = {'id': 'delicato-brown', 'name': 'New', 'slabs': [{'article': 'NEW'}]}
        new_data, skipped = scrape_slabs.merge_stone_into_data(data, stone)
        self.assertFalse(skipped)
        by_id = {s['id']: s for s in new_data['stones']}
        self.assertEqual(by_id['delicato-brown']['name'], 'New')
        self.assertEqual(by_id['other-stone']['slabs'][0]['article'], 'X1')

    def test_skips_and_preserves_data_when_new_slabs_empty(self):
        data = {
            'updated_at': None,
            'stones': [{'id': 'delicato-brown', 'name': 'Old', 'slabs': [{'article': 'OLD'}]}],
        }
        stone = {'id': 'delicato-brown', 'name': 'New', 'slabs': []}
        new_data, skipped = scrape_slabs.merge_stone_into_data(data, stone)
        self.assertTrue(skipped)
        self.assertEqual(new_data, data)

    def test_inserts_new_stone_with_empty_slabs_instead_of_dropping(self):
        data = {'updated_at': None, 'stones': []}
        stone = {'id': 'new-stone', 'name': 'New Stone', 'slabs': []}
        new_data, was_empty = scrape_slabs.merge_stone_into_data(data, stone)
        self.assertTrue(was_empty)
        self.assertEqual(len(new_data['stones']), 1)
        self.assertEqual(new_data['stones'][0]['id'], 'new-stone')
        self.assertEqual(new_data['stones'][0]['slabs'], [])

    def test_new_stone_defaults_image_to_none(self):
        data = {'updated_at': None, 'stones': []}
        stone = {'id': 'delicato-brown', 'name': 'Delicato Brown', 'slabs': [{'article': 'A1'}]}
        new_data, _ = scrape_slabs.merge_stone_into_data(data, stone)
        self.assertIsNone(new_data['stones'][0]['image'])

    def test_carries_forward_image_when_new_stone_omits_it(self):
        data = {
            'updated_at': None,
            'stones': [{
                'id': 'delicato-brown', 'name': 'Old',
                'image': 'images/delicato-brown.jpg', 'slabs': [{'article': 'OLD'}],
            }],
        }
        stone = {'id': 'delicato-brown', 'name': 'New', 'slabs': [{'article': 'NEW'}]}
        new_data, _ = scrape_slabs.merge_stone_into_data(data, stone)
        self.assertEqual(new_data['stones'][0]['image'], 'images/delicato-brown.jpg')

    def test_keeps_new_image_when_new_stone_sets_it(self):
        data = {
            'updated_at': None,
            'stones': [{
                'id': 'delicato-brown', 'name': 'Old',
                'image': 'images/old.jpg', 'slabs': [{'article': 'OLD'}],
            }],
        }
        stone = {
            'id': 'delicato-brown', 'name': 'New',
            'image': 'images/delicato-brown.jpg', 'slabs': [{'article': 'NEW'}],
        }
        new_data, _ = scrape_slabs.merge_stone_into_data(data, stone)
        self.assertEqual(new_data['stones'][0]['image'], 'images/delicato-brown.jpg')


class ContentTypeToExtensionTests(unittest.TestCase):
    def test_jpeg(self):
        self.assertEqual(scrape_slabs.content_type_to_extension('image/jpeg'), '.jpg')

    def test_webp(self):
        self.assertEqual(scrape_slabs.content_type_to_extension('image/webp'), '.webp')

    def test_strips_charset_suffix(self):
        self.assertEqual(scrape_slabs.content_type_to_extension('image/png; charset=binary'), '.png')

    def test_none_when_missing(self):
        self.assertIsNone(scrape_slabs.content_type_to_extension(None))


class ReplaceStoneImageFileTests(unittest.TestCase):
    def test_writes_new_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            images_dir = Path(tmp)
            dest = scrape_slabs.replace_stone_image_file(images_dir, 'delicato-brown', b'fake-bytes', '.jpg')
            self.assertEqual(dest, images_dir / 'delicato-brown.jpg')
            self.assertEqual(dest.read_bytes(), b'fake-bytes')

    def test_removes_old_extension_before_writing_new_one(self):
        with tempfile.TemporaryDirectory() as tmp:
            images_dir = Path(tmp)
            images_dir.mkdir(parents=True, exist_ok=True)
            (images_dir / 'delicato-brown.jpg').write_bytes(b'old')
            dest = scrape_slabs.replace_stone_image_file(images_dir, 'delicato-brown', b'new-bytes', '.webp')
            self.assertFalse((images_dir / 'delicato-brown.jpg').exists())
            self.assertEqual(dest, images_dir / 'delicato-brown.webp')
            self.assertEqual(dest.read_bytes(), b'new-bytes')

    def test_does_not_touch_other_stones(self):
        with tempfile.TemporaryDirectory() as tmp:
            images_dir = Path(tmp)
            images_dir.mkdir(parents=True, exist_ok=True)
            (images_dir / 'other-stone.jpg').write_bytes(b'other')
            scrape_slabs.replace_stone_image_file(images_dir, 'delicato-brown', b'new-bytes', '.jpg')
            self.assertTrue((images_dir / 'other-stone.jpg').exists())


class FakeImageResponse:
    def __init__(self, ok, status, content_type, body_bytes):
        self.ok = ok
        self.status = status
        self.headers = {'content-type': content_type} if content_type else {}
        self._body_bytes = body_bytes

    def body(self):
        return self._body_bytes


class FakeRequestContext:
    def __init__(self, response):
        self._response = response

    def get(self, url):
        return self._response


class DownloadStoneImageTests(unittest.TestCase):
    def test_successful_download_writes_file_and_returns_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            images_dir = Path(tmp)
            request_context = FakeRequestContext(
                FakeImageResponse(ok=True, status=200, content_type='image/webp', body_bytes=b'image-bytes')
            )
            dest = scrape_slabs.download_stone_image(
                request_context, 'https://example.test/img.webp', images_dir, 'delicato-brown'
            )
            self.assertEqual(dest, images_dir / 'delicato-brown.webp')
            self.assertEqual(dest.read_bytes(), b'image-bytes')

    def test_failed_download_raises_and_does_not_write_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            images_dir = Path(tmp)
            request_context = FakeRequestContext(
                FakeImageResponse(ok=False, status=404, content_type=None, body_bytes=b'')
            )
            with self.assertRaises(RuntimeError):
                scrape_slabs.download_stone_image(
                    request_context, 'https://example.test/missing.jpg', images_dir, 'delicato-brown'
                )
            images_dir.mkdir(parents=True, exist_ok=True)
            self.assertEqual(list(images_dir.glob('*')), [])

    def test_failed_download_does_not_delete_existing_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            images_dir = Path(tmp)
            images_dir.mkdir(parents=True, exist_ok=True)
            (images_dir / 'delicato-brown.jpg').write_bytes(b'old-bytes')
            request_context = FakeRequestContext(
                FakeImageResponse(ok=False, status=500, content_type=None, body_bytes=b'')
            )
            with self.assertRaises(RuntimeError):
                scrape_slabs.download_stone_image(
                    request_context, 'https://example.test/img.jpg', images_dir, 'delicato-brown'
                )
            self.assertEqual((images_dir / 'delicato-brown.jpg').read_bytes(), b'old-bytes')

    def test_unknown_content_type_falls_back_to_jpg_extension(self):
        with tempfile.TemporaryDirectory() as tmp:
            images_dir = Path(tmp)
            request_context = FakeRequestContext(
                FakeImageResponse(ok=True, status=200, content_type=None, body_bytes=b'bytes')
            )
            dest = scrape_slabs.download_stone_image(
                request_context, 'https://example.test/img', images_dir, 'delicato-brown'
            )
            self.assertEqual(dest, images_dir / 'delicato-brown.jpg')


if __name__ == '__main__':
    unittest.main()
