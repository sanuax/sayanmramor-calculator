# Stone Image Pipeline + Out-of-Stock Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `data/slabs.json` carry a locally-stored main texture image per stone and keep stones with zero available slabs in the file (instead of dropping them), so a future UI can show "out of stock" instead of the stone simply not existing.

**Architecture:** All changes live in `scripts/scrape_slabs.py` (a single-file scraper already structured as small pure functions plus a thin `main()` orchestration loop) and its test file `tests/test_scrape_slabs.py`. `extract_slabs_from_html` gains a third return value (the page's main image URL, extracted for free from HTML already loaded for price scraping). `merge_stone_into_data` is corrected to never drop a stone for having zero slabs, and to carry the `image` field forward across runs that don't touch it. A new `--fetch-images` CLI flag, run on its own weekly Task Scheduler entry, downloads and stores each stone's image; the existing daily flag-less runs never touch image files.

**Tech Stack:** Python 3, BeautifulSoup (`bs4`), Playwright sync API (`page.context.request` for image downloads — reuses the same browser session already used for price scraping instead of adding a new HTTP dependency), `unittest`.

**Spec:** `docs/superpowers/specs/2026-09-13-stone-image-pipeline-design.md`

## Global Constraints

- Images are downloaded and stored **locally** under `data/images/`, never hotlinked — see spec "Решения" §2.
- Image parsing logic lives inside `scripts/scrape_slabs.py`, not a separate script — see spec "Решения" §3.
- Image *extraction* (getting the URL out of already-loaded HTML) always runs; image *downloading* only runs when `--fetch-images` is passed — see spec "Решения" §4.
- Main image URL priority: `<meta property="og:image">` first, fall back to the first `<img>` inside `<main>` — see spec "Извлечение URL картинки".
- Download order is strict: fetch the image into memory first; only after a successful fetch do we delete old `data/images/<stone_id>.*` files and write the new one. A failed download must never delete an existing file or touch `stone['image']` — see spec "Скачивание картинки (`--fetch-images`)".
- A stone with zero available slabs is still saved to `data/slabs.json` (`slabs: []`) **the first time it's seen**. For a stone that already had real slab data from a previous run, an empty result this run must still preserve the previous data unchanged (this is the site's existing "temporary stockout / scrape glitch" protection — do not regress it; see the corrected `merge_stone_into_data` logic in Task 1, which resolves an ambiguity the spec's illustrative pseudocode left underspecified).
- `data/images/` is generated data, gitignored like `data/slabs.json`.

---

### Task 1: `merge_stone_into_data` — persist unseen empty-slab stones, carry `image` forward

**Files:**
- Modify: `scripts/scrape_slabs.py:187-205` (the `merge_stone_into_data` function)
- Test: `tests/test_scrape_slabs.py` (the `MergeStoneIntoDataTests` class, currently at lines 230-262)

**Interfaces:**
- Consumes: nothing new.
- Produces: `merge_stone_into_data(data, stone) -> (new_data, was_empty)` — same signature as before, but now: (1) a stone id not previously present in `data['stones']` is always inserted, even with `slabs: []`; (2) a stone id already present in `data['stones']` whose new `stone` has empty `slabs` is left completely untouched (old behavior, preserved); (3) on any insert or update, if `stone` doesn't have an `'image'` key, it's set from the existing record's `image` (or `None` for a brand-new stone). Later tasks (2-4) rely on this `image`-forwarding behavior.

- [ ] **Step 1: Write the failing tests**

Add these test methods to `MergeStoneIntoDataTests` in `tests/test_scrape_slabs.py` (after the existing `test_skips_and_preserves_data_when_new_slabs_empty`):

```python
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
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `python -m unittest tests.test_scrape_slabs.MergeStoneIntoDataTests -v`
Expected: the 4 new tests FAIL (`test_inserts_new_stone_with_empty_slabs_instead_of_dropping` fails because the current code drops empty-slab stones entirely; the other 3 fail with `KeyError: 'image'` since nothing sets that key yet). The 3 pre-existing tests in this class still PASS.

- [ ] **Step 3: Replace `merge_stone_into_data`**

Replace the function at `scripts/scrape_slabs.py:187-205`:

```python
def merge_stone_into_data(data, stone):
    stones = data.get('stones', [])
    is_empty = not stone.get('slabs')
    existing = next((s for s in stones if s.get('id') == stone.get('id')), None)

    if existing is not None:
        if is_empty:
            # A stone we already have real slab data for came back empty
            # this run (temporary stockout, or a scrape glitch) -- keep
            # what we already know rather than wiping it out.
            return data, True
        if 'image' not in stone:
            stone['image'] = existing.get('image')
        new_stones = [stone if s.get('id') == stone['id'] else s for s in stones]
    else:
        # A stone we've never seen before: keep it even with slabs: [] so
        # the calculator can show it as "out of stock" instead of it simply
        # not existing anywhere in the catalog.
        stone.setdefault('image', None)
        new_stones = stones + [stone]

    new_data = dict(data)
    new_data['stones'] = new_stones
    return new_data, is_empty
```

- [ ] **Step 4: Run the full test file to verify everything passes**

Run: `python -m unittest tests/test_scrape_slabs.py -v`
Expected: PASS, all tests including the 3 pre-existing `MergeStoneIntoDataTests` and the 4 new ones (25 + 4 = 29 tests total pass).

- [ ] **Step 5: Commit**

```bash
git add scripts/scrape_slabs.py tests/test_scrape_slabs.py
git commit -m "$(cat <<'EOF'
fix(scraper): persist stones with zero slabs, carry image field forward

merge_stone_into_data previously dropped a stone entirely the first time
it was seen with zero available slabs -- such a stone could never appear
in slabs.json until it had inventory, making it impossible for a future
UI to show it as "out of stock" rather than simply absent. Now a
never-before-seen stone is always inserted, even with slabs: []. An
already-known stone that comes back empty this run still keeps its
previous (non-empty) data untouched, same as before.

Also makes room for a locally-stored image path per stone: an update
that doesn't set 'image' now carries the existing record's value
forward instead of losing it, and a newly-inserted stone defaults to
image: None.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013tML1KmGGpA82d3E9gb8Qt
EOF
)"
```

---

### Task 2: Extract the stone's main image URL from the page HTML

**Files:**
- Modify: `scripts/scrape_slabs.py:103-173` (`extract_slabs_from_html`) and its callers
- Test: `tests/test_scrape_slabs.py`

**Interfaces:**
- Consumes: `BeautifulSoup` (already imported in `scrape_slabs.py`).
- Produces:
  - `extract_main_image_url(soup) -> str | None` — new function.
  - `extract_slabs_from_html(html, source_url) -> (stone, skipped, image_url)` — **signature change**: now returns a 3-tuple instead of a 2-tuple. `image_url` is the absolute URL string found by `extract_main_image_url`, or `None`. Task 4 (main() wiring) consumes this third value.

This task must update every existing call site of `extract_slabs_from_html` in `tests/test_scrape_slabs.py` (there are 8) to unpack 3 values instead of 2, or the test file will raise `ValueError: too many values to unpack` before any assertions run.

- [ ] **Step 1: Write the failing tests for `extract_main_image_url`**

Add this import near the top of `tests/test_scrape_slabs.py` (with the other imports):

```python
from bs4 import BeautifulSoup
```

Add this new test class (anywhere after the imports, e.g. right before `FIXTURE_PATH = ...`):

```python
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
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `python -m unittest tests.test_scrape_slabs.ExtractMainImageUrlTests -v`
Expected: FAIL with `AttributeError: module 'scrape_slabs' has no attribute 'extract_main_image_url'`.

- [ ] **Step 3: Implement `extract_main_image_url`**

Add this function to `scripts/scrape_slabs.py`, directly above `extract_slabs_from_html` (before line 103):

```python
def extract_main_image_url(soup):
    og_image = soup.find('meta', property='og:image')
    if og_image and og_image.get('content'):
        return og_image['content']
    main = soup.find('main')
    if main:
        img = main.find('img')
        if img and img.get('src'):
            return img['src']
    return None
```

- [ ] **Step 4: Run the new tests again to verify they pass**

Run: `python -m unittest tests.test_scrape_slabs.ExtractMainImageUrlTests -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing test for the `extract_slabs_from_html` signature change**

Add this test to `ExtractSlabsFromHtmlTests` in `tests/test_scrape_slabs.py`:

```python
    def test_returns_main_image_url_as_third_value(self):
        _, _, image_url = scrape_slabs.extract_slabs_from_html(self.html, FIXTURE_URL)
        self.assertEqual(
            image_url,
            'https://cdn.veneziastone.com/234dfwer3r/resize:fill:850:500/enlarge:1/'
            'gravity:ce/format:webp/plain/https://storage.yandexcloud.net/'
            'venezia-photo/textures1710/00354.JPG'
        )
```

(This exact URL comes from the real `og:image` tag already present in `tests/fixtures/delicato-brown-slabs.html`.)

- [ ] **Step 6: Run it to verify it fails**

Run: `python -m unittest tests.test_scrape_slabs.ExtractSlabsFromHtmlTests.test_returns_main_image_url_as_third_value -v`
Expected: FAIL with `ValueError: not enough values to unpack (expected 3, got 2)`.

- [ ] **Step 7: Change `extract_slabs_from_html` to return the image URL**

In `scripts/scrape_slabs.py`, inside `extract_slabs_from_html` (around line 103-106), add the extraction call right after `soup` is built:

```python
def extract_slabs_from_html(html, source_url):
    soup = BeautifulSoup(html, 'html.parser')
    image_url = extract_main_image_url(soup)
    h1 = soup.find('h1')
```

And change the `return` statement at the end of the function (around line 173):

```python
    return stone, skipped, image_url
```

- [ ] **Step 8: Fix every other call site to unpack 3 values**

In `tests/test_scrape_slabs.py`, every existing call of the form `stone, skipped = scrape_slabs.extract_slabs_from_html(...)` or `stone, _ = scrape_slabs.extract_slabs_from_html(...)` must add a third variable. Update these exact lines (by original line number, before this task's edits shift them — search for the literal text if line numbers have already moved):

- `test_stone_metadata`: `stone, _ = scrape_slabs.extract_slabs_from_html(self.html, FIXTURE_URL)` → `stone, _, _ = scrape_slabs.extract_slabs_from_html(self.html, FIXTURE_URL)`
- `test_hardness_category_by_segment`: `stone, _ = scrape_slabs.extract_slabs_from_html(self.html, url)` → `stone, _, _ = scrape_slabs.extract_slabs_from_html(self.html, url)`
- `test_keeps_available_slabs_with_correct_fields`: `stone, _ = scrape_slabs.extract_slabs_from_html(self.html, FIXTURE_URL)` → `stone, _, _ = scrape_slabs.extract_slabs_from_html(self.html, FIXTURE_URL)`
- `test_excludes_reserved_and_sold_rows`: `stone, skipped = scrape_slabs.extract_slabs_from_html(self.html, FIXTURE_URL)` → `stone, skipped, _ = scrape_slabs.extract_slabs_from_html(self.html, FIXTURE_URL)`
- `test_excludes_synthetic_po_zaprosu_row`: `stone, skipped = scrape_slabs.extract_slabs_from_html(html, 'https://example.test/marble/x/slabs/')` → `stone, skipped, _ = scrape_slabs.extract_slabs_from_html(html, 'https://example.test/marble/x/slabs/')`
- `test_excludes_row_with_only_request_button_no_status_span`: same pattern, add `, _`
- `test_keeps_row_with_no_status_and_cart_button`: same pattern, add `, _`
- `test_no_h1_gives_none_name_not_a_fake_empty_stone`: `stone, skipped = scrape_slabs.extract_slabs_from_html(html, 'https://example.test/agate/x/slabs/')` → `stone, skipped, _ = scrape_slabs.extract_slabs_from_html(html, 'https://example.test/agate/x/slabs/')`

In `scripts/scrape_slabs.py`, in `main()` (around line 361): `stone, skipped = extract_slabs_from_html(html, url)` → `stone, skipped, image_url = extract_slabs_from_html(html, url)` (the new `image_url` local variable is unused until Task 4 wires it up — that's fine, it will be used there).

- [ ] **Step 9: Run the full test file to verify everything passes**

Run: `python -m unittest tests/test_scrape_slabs.py -v`
Expected: PASS, all tests (29 from Task 1 + 3 `ExtractMainImageUrlTests` + 1 new `test_returns_main_image_url_as_third_value` = 33 total).

- [ ] **Step 10: Commit**

```bash
git add scripts/scrape_slabs.py tests/test_scrape_slabs.py
git commit -m "$(cat <<'EOF'
feat(scraper): extract each stone's main image URL from its page HTML

extract_slabs_from_html now also returns the page's main texture image
URL as a third value, read for free from the HTML already loaded for
price scraping (no extra network request). Prefers <meta
property="og:image"> -- a cross-site standard not tied to any one
category page's markup -- and falls back to the first <img> inside
<main> when that's absent.

This URL isn't persisted yet; a later change wires up an opt-in
--fetch-images flag that downloads it to a local file.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013tML1KmGGpA82d3E9gb8Qt
EOF
)"
```

---

### Task 3: Download and store a stone's image locally

**Files:**
- Modify: `scripts/scrape_slabs.py` (add `import mimetypes` near the top; add new functions near `extract_slabs_from_html`)
- Test: `tests/test_scrape_slabs.py`

**Interfaces:**
- Consumes: nothing new from earlier tasks (this is a self-contained file/HTTP-response-handling unit; Task 4 wires it to `page.context.request` and to `extract_slabs_from_html`'s `image_url` output).
- Produces:
  - `content_type_to_extension(content_type) -> str | None`
  - `replace_stone_image_file(images_dir, stone_id, image_bytes, extension) -> pathlib.Path` — deletes any existing `images_dir/<stone_id>.*` before writing `images_dir/<stone_id><extension>`.
  - `download_stone_image(request_context, image_url, images_dir, stone_id) -> pathlib.Path` — calls `request_context.get(image_url)`, which must return an object with `.ok` (bool), `.status` (int), `.headers` (dict-like, supports `.get('content-type')`), and `.body()` (bytes) — this matches Playwright's sync `APIResponse` interface. Raises `RuntimeError` if `.ok` is falsy; does not touch the filesystem in that case. Task 4 passes `page.context.request` (Playwright's `APIRequestContext`) as `request_context`.

- [ ] **Step 1: Write the failing tests**

Add these test classes to `tests/test_scrape_slabs.py` (anywhere after the existing imports; `tempfile`, `os`, and `Path` are already imported in this file):

```python
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
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `python -m unittest tests.test_scrape_slabs.ContentTypeToExtensionTests tests.test_scrape_slabs.ReplaceStoneImageFileTests tests.test_scrape_slabs.DownloadStoneImageTests -v`
Expected: FAIL with `AttributeError` for each missing function (`content_type_to_extension`, `replace_stone_image_file`, `download_stone_image`).

- [ ] **Step 3: Add `import mimetypes`**

At the top of `scripts/scrape_slabs.py`, change:

```python
import re

from bs4 import BeautifulSoup
```

to:

```python
import mimetypes
import re

from bs4 import BeautifulSoup
```

- [ ] **Step 4: Implement the three functions**

Add these to `scripts/scrape_slabs.py`, directly above `extract_slabs_from_html`:

```python
def content_type_to_extension(content_type):
    if not content_type:
        return None
    content_type = content_type.split(';')[0].strip().lower()
    return mimetypes.guess_extension(content_type)


def replace_stone_image_file(images_dir, stone_id, image_bytes, extension):
    images_dir.mkdir(parents=True, exist_ok=True)
    for existing_file in images_dir.glob(f'{stone_id}.*'):
        existing_file.unlink()
    dest_path = images_dir / f'{stone_id}{extension}'
    dest_path.write_bytes(image_bytes)
    return dest_path


def download_stone_image(request_context, image_url, images_dir, stone_id):
    response = request_context.get(image_url)
    if not response.ok:
        raise RuntimeError(f'image download failed: HTTP {response.status} for {image_url}')
    extension = content_type_to_extension(response.headers.get('content-type')) or '.jpg'
    return replace_stone_image_file(images_dir, stone_id, response.body(), extension)
```

- [ ] **Step 5: Run the full test file to verify everything passes**

Run: `python -m unittest tests/test_scrape_slabs.py -v`
Expected: PASS, all tests (33 from Task 2 + 4 `ContentTypeToExtensionTests` + 3 `ReplaceStoneImageFileTests` + 4 `DownloadStoneImageTests` = 44 total).

- [ ] **Step 6: Commit**

```bash
git add scripts/scrape_slabs.py tests/test_scrape_slabs.py
git commit -m "$(cat <<'EOF'
feat(scraper): add local image download with old-extension cleanup

download_stone_image fetches an image via a Playwright APIRequestContext
(reusing the same authenticated browser session already used for price
scraping, rather than adding a fresh HTTP client dependency) and only
touches the filesystem after a successful fetch: replace_stone_image_file
deletes any existing data/images/<stone_id>.* before writing the new
file, so a stone whose source image changes format (e.g. .jpg -> .webp)
never leaves an orphaned file behind. A failed download raises before
any file is touched, so it can never wipe out a stone's existing image.

Not wired into main() yet -- these are standalone, independently tested
building blocks for the next change.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013tML1KmGGpA82d3E9gb8Qt
EOF
)"
```

---

### Task 4: Wire `--fetch-images` into `main()`, update `.gitignore` and `SCHEDULING.md`

**Files:**
- Modify: `scripts/scrape_slabs.py:330-397` (`main()`)
- Modify: `.gitignore`
- Modify: `SCHEDULING.md`

**Interfaces:**
- Consumes: `extract_slabs_from_html`'s 3-tuple return (Task 2), `merge_stone_into_data`'s image-forwarding behavior (Task 1), `download_stone_image` (Task 3).
- Produces: the `--fetch-images` CLI flag. No new importable interface for other code — this is the final integration point.

This task's wiring can't be exercised by the existing unit test suite (`main()` drives a real Playwright browser against the live site and has never been unit-tested — the existing tests only cover the small pure functions it calls). Verify it with the full test suite (regression-only) plus a manual smoke test once network access to veneziastone.com is available.

- [ ] **Step 1: Add the `--fetch-images` argument**

In `scripts/scrape_slabs.py`, inside `main()`, add this line to the `argparse` block (after the existing `parser.add_argument('--debug', ...)` line, around line 334):

```python
    parser.add_argument('--fetch-images', action='store_true',
                         help="also download each stone's main texture image; run this on its own, less "
                              "frequent schedule than the price scrape (e.g. weekly) since it downloads "
                              "binary files instead of just reading text")
```

- [ ] **Step 2: Update the unpacking of `extract_slabs_from_html` and add the download call**

In `scripts/scrape_slabs.py`, inside the `for i, url in enumerate(batch):` loop in `main()`, replace:

```python
                html = fetch_rendered_html(page, url, debug=args.debug)
                stone, skipped, image_url = extract_slabs_from_html(html, url)
                if stone.get('name') is None:
                    # No <h1> means the site served its ErrorPage / fallback
                    # shell instead of the real stone page (seen under load —
                    # a 200 response with no product data, not a fetch
                    # exception), not a stone that's genuinely out of stock.
                    # Queue it for a retry instead of a silent stderr warning
                    # that's easy to miss across hundreds of stones.
                    print(f'  ERROR: {url} served no <h1> (likely an error/fallback page, not the real stone page)',
                          file=sys.stderr)
                    log_failed_url(Path(args.failed_log), url, 'no <h1> found — likely served an error page')
                else:
                    if args.debug:
                        print(f'  {stone["id"]}: kept {len(stone["slabs"])}, skipped {len(skipped)}')
                        for row in skipped:
                            print('   skipped:', row)
                    data, was_skipped = merge_stone_into_data(data, stone)
                    if was_skipped:
                        print(f'  WARNING: no available slabs found for {url}, keeping previous data for this stone',
                              file=sys.stderr)
```

with:

```python
                html = fetch_rendered_html(page, url, debug=args.debug)
                stone, skipped, image_url = extract_slabs_from_html(html, url)
                if stone.get('name') is None:
                    # No <h1> means the site served its ErrorPage / fallback
                    # shell instead of the real stone page (seen under load —
                    # a 200 response with no product data, not a fetch
                    # exception), not a stone that's genuinely out of stock.
                    # Queue it for a retry instead of a silent stderr warning
                    # that's easy to miss across hundreds of stones.
                    print(f'  ERROR: {url} served no <h1> (likely an error/fallback page, not the real stone page)',
                          file=sys.stderr)
                    log_failed_url(Path(args.failed_log), url, 'no <h1> found — likely served an error page')
                else:
                    if args.debug:
                        print(f'  {stone["id"]}: kept {len(stone["slabs"])}, skipped {len(skipped)}')
                        for row in skipped:
                            print('   skipped:', row)
                    if args.fetch_images and image_url:
                        try:
                            images_dir = output_path.parent / 'images'
                            dest_path = download_stone_image(page.context.request, image_url, images_dir, stone['id'])
                            stone['image'] = f'images/{dest_path.name}'
                        except Exception as e:
                            print(f'  ERROR downloading image for {url}: {e!r}', file=sys.stderr)
                    data, was_skipped = merge_stone_into_data(data, stone)
                    if was_skipped:
                        print(f'  WARNING: no available slabs found for {url}, keeping previous data for this stone',
                              file=sys.stderr)
```

- [ ] **Step 3: Run the full test suite to verify no regression**

Run: `python -m unittest tests/test_scrape_slabs.py -v`
Expected: PASS, all 44 tests (this task adds no new unit tests of its own — `main()`'s loop body isn't unit-tested anywhere in this file, consistent with how it already wasn't before this change).

- [ ] **Step 4: Add `data/images/` to `.gitignore`**

In `.gitignore`, add a line after the existing `data/slabs.json` line:

```
/delicato-brown-slabs.html
/delicato-brown-slabs_files/
data/slabs.json
data/images/
__pycache__/
scripts/catalog_queue.txt
scripts/failed_urls.txt
```

- [ ] **Step 5: Document the second Task Scheduler entry in `SCHEDULING.md`**

In `SCHEDULING.md`, add a new section after the existing "## Вариант 1: через `schtasks`" section (after its `schtasks /delete ...` line, before "## Вариант 2"):

```markdown
## Отдельная задача для картинок

Картинки камней меняются намного реже цен, поэтому их скачивание —
отдельная задача на своём, более редком расписании (раз в неделю),
а не часть ежедневного прогона:

    schtasks /create /tn "VeneziaStone-ScrapeSlabsImages" /tr "python D:\calculator\scripts\scrape_slabs.py --fetch-images" /sc weekly /d SUN /st 07:00 /f

Запустить вручную для проверки: `schtasks /run /tn "VeneziaStone-ScrapeSlabsImages"`
Удалить задачу: `schtasks /delete /tn "VeneziaStone-ScrapeSlabsImages" /f`

```

- [ ] **Step 6: Commit**

```bash
git add scripts/scrape_slabs.py .gitignore SCHEDULING.md
git commit -m "$(cat <<'EOF'
feat(scraper): wire up --fetch-images flag for weekly image downloads

The daily price-scrape Task Scheduler entry keeps running as-is, never
passing this flag -- stone['image'] is left untouched on those runs and
merge_stone_into_data (see earlier commit) carries the previous value
forward. A new weekly Task Scheduler entry (documented in
SCHEDULING.md) runs the same script with --fetch-images, which
downloads each stone's main texture image via the already-open
Playwright browser session and records its local path.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013tML1KmGGpA82d3E9gb8Qt
EOF
)"
```

- [ ] **Step 7: Manual smoke test (requires live network access to veneziastone.com)**

Once the network is reachable, run:

```bash
python scripts/scrape_slabs.py --urls scripts/stone_urls.txt --output /tmp/smoke-slabs.json --fetch-images --limit 1
```

Inspect `/tmp/smoke-slabs.json`: the one scraped stone should have a non-null `image` field pointing at `images/<stone_id>.<ext>`, and that file should exist on disk at `<directory containing /tmp/smoke-slabs.json>/images/<stone_id>.<ext>` and be a real, openable image. This also doubles as the point where the `extract_main_image_url` DOM fallback's real-world CSS selector accuracy can finally be checked against a live, non-`delicato-brown` category page (flagged as an open question in the spec's "Вне рамок").

---

## Self-Review Notes

- **Spec coverage:** every requirement in `2026-09-13-stone-image-pipeline-design.md` maps to a task — empty-slab persistence and `image` forwarding (Task 1), og:image/`<img>` extraction (Task 2), download-then-replace with old-extension cleanup (Task 3), `--fetch-images` flag + `.gitignore` + `SCHEDULING.md` (Task 4).
- **Ambiguity resolved:** the spec's illustrative `merge_stone_into_data` pseudocode would have overwritten an existing stone's real slab data with an empty result on a transient stockout, regressing the site's current "keep previous data" protection (and failing the existing `test_skips_and_preserves_data_when_new_slabs_empty` test). Task 1's actual implementation preserves that protection — it only changes behavior for a stone id not previously present in the data.
- **Type/name consistency checked:** `extract_slabs_from_html`'s new 3-tuple return is consumed identically in Task 2's own test, Task 4's `main()` wiring, and every pre-existing test updated in Task 2 Step 8. `download_stone_image`'s `request_context.get(url)` duck-type (`.ok`, `.status`, `.headers`, `.body()`) matches both the `FakeRequestContext`/`FakeImageResponse` test doubles in Task 3 and the real `page.context.request` (Playwright `APIRequestContext`/`APIResponse`) used in Task 4.
