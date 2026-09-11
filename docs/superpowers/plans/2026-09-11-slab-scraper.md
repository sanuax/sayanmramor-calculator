# Slab Scraper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `scripts/scrape_slabs.py`, which reads a list of
veneziastone.com stone-slab page URLs and produces `data/slabs.json`
with one entry per currently-sellable slab (excluding reserved/sold/
on-request items), for the calculator built in the sibling plan
(`2026-09-11-calculator-pricing-rework.md`) to consume.

**Architecture:** Split into a pure HTML-extraction layer (testable
offline against a real saved fixture page, no network or browser
needed) and a thin Playwright-driven orchestration layer (navigates the
live site, scrolls to trigger lazy-loaded batch tables, hands the
rendered HTML to the extraction layer). This mirrors the calculator
plan's pricing.js split: pure logic is unit-tested directly, browser
orchestration is verified manually against the real site since this
environment cannot reach veneziastone.com.

**Tech Stack:** Python 3.14 (confirmed installed), `beautifulsoup4`
(confirmed installable — already verified working during spec
research), `playwright` (needs installing — see Task 7). Tests use
Python's built-in `unittest`, no extra test framework.

**Spec:** `docs/superpowers/specs/2026-09-11-slab-pricing-calculator-design.md`

## Global Constraints

- The parser must use a **headless browser (Playwright)**, not a plain
  HTTP GET — confirmed necessary because only 3 of 15 batch panels on
  the real `delicato-brown-slabs.html` sample had their per-slab tables
  present in static HTML; the rest load lazily.
- Exclude any slab row whose status is `В резерве`, `Продано`, or `По
  запросу`, and/or whose action button is "Заявка" instead of "В
  корзину" (the button check is the more robust fallback signal — use
  both).
- Never toggle the "В пути" (`#switch-shipping`) section — leave it in
  its default (hidden) state so in-transit stock is never scraped.
- Take the **final** (discounted) price shown for a slab, not the
  crossed-out original.
- Merging a stone's freshly-scraped (possibly empty) slab list into
  `data/slabs.json` must never wipe out previously-good data for that
  stone with an empty list — log a warning and keep the old entry
  instead.
- `data/slabs.json` is generated output — stays gitignored, never
  committed.

---

## File Structure

- Create: `scripts/scrape_slabs.py` — extraction functions (pure,
  unit-tested), `merge_stone_into_data`, `load_stone_urls`, the
  Playwright-driven `fetch_rendered_html`, and `main()`.
- Create: `scripts/stone_urls.txt` — one URL per line, `#` comments
  allowed; starts with just the Delicato Brown URL per the user's
  decision to add more later.
- Create: `tests/fixtures/delicato-brown-slabs.html` — copy of the real
  saved supplier page, used as an offline regression fixture.
- Create: `tests/test_scrape_slabs.py` — `unittest` tests for every
  pure function.
- Modify: `.gitignore` — anchor the `delicato-brown-slabs.html` /
  `delicato-brown-slabs_files/` patterns to the repo root (`/...`) so
  they don't also match the new fixture path under `tests/fixtures/`.
- Create: `SCHEDULING.md` — Windows Task Scheduler setup instructions.

---

### Task 1: `parse_ru_number`

**Files:**
- Create: `scripts/scrape_slabs.py`
- Create: `tests/test_scrape_slabs.py`

**Interfaces:**
- Produces: `parse_ru_number(s: str | None) -> float | None` — strips
  non-breaking spaces/spaces/currency symbols, treats `,` as a decimal
  separator, treats `None`/`''`/`'-'`/`'—'` as "no value" → `None`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_scrape_slabs.py`:

```python
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))
import scrape_slabs


class ParseRuNumberTests(unittest.TestCase):
    def test_thousands_with_nbsp_and_currency_symbol(self):
        self.assertEqual(scrape_slabs.parse_ru_number('11\xa0008 \u20bd'), 11008.0)

    def test_comma_decimal(self):
        self.assertEqual(scrape_slabs.parse_ru_number('0,10'), 0.1)

    def test_dash_is_none(self):
        self.assertIsNone(scrape_slabs.parse_ru_number('\u2014'))

    def test_none_is_none(self):
        self.assertIsNone(scrape_slabs.parse_ru_number(None))

    def test_plain_space_thousands(self):
        self.assertEqual(scrape_slabs.parse_ru_number('12 231 \u20bd'), 12231.0)


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest tests.test_scrape_slabs -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'scrape_slabs'`
(the file doesn't exist yet)

- [ ] **Step 3: Write minimal implementation**

Create `scripts/scrape_slabs.py`:

```python
import re


def parse_ru_number(s):
    if s is None:
        return None
    s = s.replace('\xa0', '').replace(' ', '').strip()
    if s in ('', '-', '\u2014'):
        return None
    s = re.sub(r'[^0-9,.\-]', '', s)
    s = s.replace(',', '.')
    if s == '':
        return None
    try:
        return float(s)
    except ValueError:
        return None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest tests.test_scrape_slabs -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/scrape_slabs.py tests/test_scrape_slabs.py
git commit -m "$(cat <<'EOF'
feat: add parse_ru_number for scraper

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `stone_id_and_category_from_url`

**Files:**
- Modify: `scripts/scrape_slabs.py`
- Modify: `tests/test_scrape_slabs.py`

**Interfaces:**
- Produces: `stone_id_and_category_from_url(url: str) -> tuple[str | None, str | None]`
  — for `https://veneziastone.com/marble/delicato-brown/slabs/` returns
  `('delicato-brown', 'marble')`. Drops the domain and a trailing
  `slabs` segment; last remaining segment is the id, the one before it
  is the category.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_scrape_slabs.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest tests.test_scrape_slabs -v`
Expected: FAIL — `AttributeError: module 'scrape_slabs' has no attribute 'stone_id_and_category_from_url'`

- [ ] **Step 3: Write minimal implementation**

Append to `scripts/scrape_slabs.py`:

```python
def stone_id_and_category_from_url(url):
    parts = [p for p in url.split('/') if p and p not in ('https:', 'http:')]
    parts = parts[1:]  # drop domain
    if parts and parts[-1] == 'slabs':
        parts = parts[:-1]
    stone_id = parts[-1] if parts else None
    category = parts[-2] if len(parts) >= 2 else None
    return stone_id, category
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest tests.test_scrape_slabs -v`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/scrape_slabs.py tests/test_scrape_slabs.py
git commit -m "$(cat <<'EOF'
feat: derive stone id/category from source URL

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `stone_name_from_h1`

**Files:**
- Modify: `scripts/scrape_slabs.py`
- Modify: `tests/test_scrape_slabs.py`

**Interfaces:**
- Produces: `stone_name_from_h1(h1_text: str) -> str` — for `"Мрамор
  Delicato Brown в слэбах"` returns `"Delicato Brown"` (strips the
  leading category word and the trailing "в слэбах"); falls back to
  the raw (stripped) text if the pattern doesn't match.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_scrape_slabs.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest tests.test_scrape_slabs -v`
Expected: FAIL — `AttributeError: module 'scrape_slabs' has no attribute 'stone_name_from_h1'`

- [ ] **Step 3: Write minimal implementation**

Append to `scripts/scrape_slabs.py`:

```python
def stone_name_from_h1(h1_text):
    m = re.match(r'^\S+\s+(.+?)\s+в слэбах\s*$', h1_text.strip())
    if m:
        return m.group(1)
    return h1_text.strip()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest tests.test_scrape_slabs -v`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/scrape_slabs.py tests/test_scrape_slabs.py
git commit -m "$(cat <<'EOF'
feat: extract stone display name from page h1

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `extract_slabs_from_html` (the core extraction function)

**Files:**
- Modify: `scripts/scrape_slabs.py`
- Modify: `tests/test_scrape_slabs.py`
- Create: `tests/fixtures/delicato-brown-slabs.html`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `parse_ru_number` (Task 1), `stone_id_and_category_from_url`
  (Task 2), `stone_name_from_h1` (Task 3).
- Produces:
  - `extract_price_from_cell(td) -> float | None` — takes a BeautifulSoup
    `<td>` Tag, returns the last `<div>` child's parsed number (the
    final/discounted price, since a crossed-out original price if
    present is the *first* `<div class="price-sale">`).
  - `extract_slabs_from_html(html: str, source_url: str) -> tuple[dict, list]`
    — returns `(stone, skipped)` where `stone` is
    `{id, name, category, source_url, slabs: [{article, party, pachka,
    city, width_cm, length_cm, price_per_m2_rub, price_total_rub}]}`
    and `skipped` is a list of `{article, status, has_request_btn}`
    dicts for every excluded row (for `--debug` logging in Task 7).

- [ ] **Step 1: Copy the real fixture and fix `.gitignore`**

The saved supplier page already at `D:\calculator\delicato-brown-slabs.html`
was used during spec research — copy it into the test fixtures
directory (only the `.html` file; the extraction function never loads
the referenced images/JS, so the `_files` folder isn't needed):

```bash
mkdir -p tests/fixtures
cp delicato-brown-slabs.html tests/fixtures/delicato-brown-slabs.html
```

Then fix `.gitignore` — its current unanchored patterns
(`delicato-brown-slabs.html`, `delicato-brown-slabs_files/`) match a
file of that name *anywhere* in the tree, which would also hide the
new fixture. Anchor them to the repo root by adding a leading `/`.
Replace the first two lines of `.gitignore` with:

```
/delicato-brown-slabs.html
/delicato-brown-slabs_files/
data/slabs.json
```

- [ ] **Step 2: Write the failing test**

Append to `tests/test_scrape_slabs.py`:

```python
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
        self.assertEqual(slab['city'], '\u0421\u0430\u043d\u043a\u0442-\u041f\u0435\u0442\u0435\u0440\u0431\u0443\u0440\u0433')

    def test_excludes_reserved_and_sold_rows(self):
        stone, skipped = scrape_slabs.extract_slabs_from_html(self.html, FIXTURE_URL)
        kept_articles = {s['article'] for s in stone['slabs']}
        self.assertNotIn('P0444195', kept_articles)  # В резерве
        self.assertNotIn('P0517504', kept_articles)  # Продано
        skipped_statuses = {row['status'] for row in skipped}
        self.assertIn('\u0412 \u0440\u0435\u0437\u0435\u0440\u0432\u0435', skipped_statuses)
        self.assertIn('\u041f\u0440\u043e\u0434\u0430\u043d\u043e', skipped_statuses)

    def test_excludes_synthetic_po_zaprosu_row(self):
        html = _make_synthetic_batch_html(
            article='ART1', status_text='\u041f\u043e \u0437\u0430\u043f\u0440\u043e\u0441\u0443',
            include_request_button=True,
        )
        stone, skipped = scrape_slabs.extract_slabs_from_html(html, 'https://example.test/marble/x/slabs/')
        self.assertEqual(stone['slabs'], [])
        self.assertEqual(skipped[0]['status'], '\u041f\u043e \u0437\u0430\u043f\u0440\u043e\u0441\u0443')

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
        '<button aria-label="\u0417\u0430\u044f\u0432\u043a\u0430">\u0417\u0430\u044f\u0432\u043a\u0430</button>'
        if include_request_button
        else '<button aria-label="\u0412 \u043a\u043e\u0440\u0437\u0438\u043d\u0443">\u0412 \u043a\u043e\u0440\u0437\u0438\u043d\u0443</button>'
    )
    return f'''
    <html><body>
    <h1>\u041c\u0440\u0430\u043c\u043e\u0440 Test Stone \u0432 \u0441\u043b\u044d\u0431\u0430\u0445</h1>
    <div>
      <div class="prt-container">\u041f\u0430\u0440\u0442\u0438\u044f #1</div>
      <table class="pr-table"><tbody>
        <tr class="pr-tr">
          <td class="pr-td"></td>
          <td class="pr-td"><div><button>{article} </button></div>{status_span}</td>
          <td class="pr-td">PACHKA1</td>
          <td class="pr-td">\u041c\u043e\u0441\u043a\u0432\u0430</td>
          <td class="pr-td">2,00 x 1,00</td>
          <td class="pr-td">\u2014</td>
          <td class="pr-td">2,00</td>
          <td class="pr-td">0%</td>
          <td class="pr-td"><div>10000 \u20bd</div></td>
          <td class="pr-td"><div>20000 \u20bd</div></td>
          <td class="pr-td">{action_btn}</td>
        </tr>
      </tbody></table>
    </div>
    </body></html>
    '''
```

- [ ] **Step 3: Run test to verify it fails**

Run: `python -m unittest tests.test_scrape_slabs -v`
Expected: FAIL — `AttributeError: module 'scrape_slabs' has no attribute 'extract_slabs_from_html'`

- [ ] **Step 4: Write minimal implementation**

This exact code was prototyped and run against the real fixture during
spec research (verified: 16 slabs kept, 5 correctly excluded — 1 "В
резерве", 4 "Продано" — with correct `width_cm`/`length_cm`/prices for
every kept slab). Append to `scripts/scrape_slabs.py` (needs
`beautifulsoup4`; run `python -m pip install beautifulsoup4` if not
already installed):

```python
from bs4 import BeautifulSoup


def extract_price_from_cell(td):
    divs = td.find_all('div')
    if not divs:
        return None
    return parse_ru_number(divs[-1].get_text())


def extract_slabs_from_html(html, source_url):
    soup = BeautifulSoup(html, 'html.parser')
    h1 = soup.find('h1')
    name = stone_name_from_h1(h1.get_text()) if h1 else None
    stone_id, category = stone_id_and_category_from_url(source_url)

    slabs = []
    skipped = []
    for card in soup.select('.prt-container'):
        wrapper = card.parent
        card_text = card.get_text()
        party_match = re.search(r'\u041f\u0430\u0440\u0442\u0438\u044f\s*#(\d+)', card_text)
        party = party_match.group(1) if party_match else None

        table = wrapper.find('table', class_='pr-table') if wrapper else None
        if not table:
            continue

        for row in table.select('tbody tr.pr-tr'):
            cells = row.find_all('td', class_='pr-td')
            if len(cells) < 10:
                continue

            article_cell = cells[1]
            article_btn = article_cell.find('button')
            article = article_btn.get_text().strip() if article_btn else None

            status_span = article_cell.find('span', class_='font-bold')
            status_text = status_span.get_text().strip() if status_span else None

            last_cell = cells[-1]
            request_btn = last_cell.find('button', attrs={'aria-label': '\u0417\u0430\u044f\u0432\u043a\u0430'})
            unavailable = bool(status_text) or request_btn is not None

            if unavailable:
                skipped.append({'article': article, 'status': status_text, 'has_request_btn': request_btn is not None})
                continue

            pachka = cells[2].get_text(strip=True)
            city = cells[3].get_text(strip=True)
            size_text = cells[4].get_text(strip=True)
            size_match = re.match(r'([\d,]+)\s*x\s*([\d,]+)', size_text)
            if not size_match:
                skipped.append({'article': article, 'status': 'bad_size', 'has_request_btn': False})
                continue
            width_m = parse_ru_number(size_match.group(1))
            length_m = parse_ru_number(size_match.group(2))

            price_per_m2 = extract_price_from_cell(cells[8])
            price_total = extract_price_from_cell(cells[9])

            slabs.append({
                'article': article,
                'party': party,
                'pachka': pachka,
                'city': city,
                'width_cm': round(width_m * 100),
                'length_cm': round(length_m * 100),
                'price_per_m2_rub': price_per_m2,
                'price_total_rub': price_total,
            })

    stone = {
        'id': stone_id,
        'name': name,
        'category': category,
        'source_url': source_url,
        'slabs': slabs,
    }
    return stone, skipped
```

- [ ] **Step 5: Run test to verify it passes**

Run: `python -m unittest tests.test_scrape_slabs -v`
Expected: PASS (15 tests)

- [ ] **Step 6: Commit**

```bash
git add scripts/scrape_slabs.py tests/test_scrape_slabs.py tests/fixtures/delicato-brown-slabs.html .gitignore
git commit -m "$(cat <<'EOF'
feat: add core slab extraction, verified against real supplier page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `load_stone_urls`

**Files:**
- Modify: `scripts/scrape_slabs.py`
- Modify: `tests/test_scrape_slabs.py`

**Interfaces:**
- Produces: `load_stone_urls(path: str | Path) -> list[str]` — reads
  the file, skips blank lines and lines starting with `#`, returns the
  rest stripped.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_scrape_slabs.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest tests.test_scrape_slabs -v`
Expected: FAIL — `AttributeError: module 'scrape_slabs' has no attribute 'load_stone_urls'`

- [ ] **Step 3: Write minimal implementation**

Append to `scripts/scrape_slabs.py`:

```python
def load_stone_urls(path):
    urls = []
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            urls.append(line)
    return urls
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest tests.test_scrape_slabs -v`
Expected: PASS (16 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/scrape_slabs.py tests/test_scrape_slabs.py
git commit -m "$(cat <<'EOF'
feat: add load_stone_urls config reader

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `merge_stone_into_data`

**Files:**
- Modify: `scripts/scrape_slabs.py`
- Modify: `tests/test_scrape_slabs.py`

**Interfaces:**
- Produces: `merge_stone_into_data(data: dict, stone: dict) -> tuple[dict, bool]`
  — upserts `stone` into `data['stones']` by matching `id`; returns
  `(new_data, skipped)` where `skipped=True` means the stone had an
  empty `slabs` list and `data` was returned **unchanged** (never
  overwrite good data with an empty scrape). Does not touch
  `data['updated_at']` — that's `main()`'s job (Task 7) once all URLs
  are processed.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_scrape_slabs.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest tests.test_scrape_slabs -v`
Expected: FAIL — `AttributeError: module 'scrape_slabs' has no attribute 'merge_stone_into_data'`

- [ ] **Step 3: Write minimal implementation**

Append to `scripts/scrape_slabs.py`:

```python
def merge_stone_into_data(data, stone):
    if not stone.get('slabs'):
        return data, True

    stones = data.get('stones', [])
    new_stones = []
    updated = False
    for existing in stones:
        if existing.get('id') == stone['id']:
            new_stones.append(stone)
            updated = True
        else:
            new_stones.append(existing)
    if not updated:
        new_stones.append(stone)

    new_data = dict(data)
    new_data['stones'] = new_stones
    return new_data, False
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest tests.test_scrape_slabs -v`
Expected: PASS (19 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/scrape_slabs.py tests/test_scrape_slabs.py
git commit -m "$(cat <<'EOF'
feat: add merge_stone_into_data upsert-without-clobbering logic

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Playwright orchestration + `main()` CLI

**Files:**
- Modify: `scripts/scrape_slabs.py`
- Create: `scripts/stone_urls.txt`

**Interfaces:**
- Consumes: `load_stone_urls`, `extract_slabs_from_html`,
  `merge_stone_into_data` (Tasks 4-6).
- Produces: `fetch_rendered_html(url: str) -> str` and `main(argv=None)`
  (CLI entry point), writing `data/slabs.json`.

This task's browser-driving code **cannot be unit-tested from this
environment** — veneziastone.com is unreachable from here (confirmed
during spec research: DNS resolves, TCP connection times out both via
curl and via the WebFetch tool). There is no automated test step for
`fetch_rendered_html`; Step 5 below is a manual verification you must
run yourself against the live site.

- [ ] **Step 1: Install Playwright**

Run: `python -m pip install playwright && python -m playwright install chromium`

- [ ] **Step 2: Write `fetch_rendered_html`**

Append to `scripts/scrape_slabs.py`:

```python
def fetch_rendered_html(url, debug=False):
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(url, wait_until='networkidle')

        previous_height = -1
        stable_rounds = 0
        for _ in range(60):
            page.mouse.wheel(0, 2000)
            page.wait_for_timeout(500)
            height = page.evaluate('document.body.scrollHeight')
            if height == previous_height:
                stable_rounds += 1
                if stable_rounds >= 3:
                    break
            else:
                stable_rounds = 0
            previous_height = height

        page.wait_for_load_state('networkidle')
        html = page.content()
        if debug:
            print(f'  [debug] final scrollHeight={previous_height}')
        browser.close()
        return html
```

- [ ] **Step 3: Write `main()`**

Append to `scripts/scrape_slabs.py`:

```python
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_URLS_PATH = PROJECT_ROOT / 'scripts' / 'stone_urls.txt'
DEFAULT_OUTPUT_PATH = PROJECT_ROOT / 'data' / 'slabs.json'


def load_existing_data(path):
    if not path.exists():
        return {'updated_at': None, 'stones': []}
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def main(argv=None):
    parser = argparse.ArgumentParser(description='Scrape veneziastone.com slab pages into slabs.json')
    parser.add_argument('--urls', default=str(DEFAULT_URLS_PATH))
    parser.add_argument('--output', default=str(DEFAULT_OUTPUT_PATH))
    parser.add_argument('--debug', action='store_true')
    args = parser.parse_args(argv)

    urls = load_stone_urls(args.urls)
    data = load_existing_data(Path(args.output))

    for url in urls:
        print(f'Scraping {url} ...')
        html = fetch_rendered_html(url, debug=args.debug)
        stone, skipped = extract_slabs_from_html(html, url)
        if args.debug:
            print(f'  {stone["id"]}: kept {len(stone["slabs"])}, skipped {len(skipped)}')
            for row in skipped:
                print('   skipped:', row)
        data, was_skipped = merge_stone_into_data(data, stone)
        if was_skipped:
            print(f'  WARNING: no available slabs found for {url}, keeping previous data for this stone', file=sys.stderr)

    data['updated_at'] = datetime.now(timezone.utc).astimezone().isoformat(timespec='seconds')

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'Wrote {output_path}')


if __name__ == '__main__':
    main()
```

- [ ] **Step 4: Create `scripts/stone_urls.txt`**

```
# Одна строка — один URL страницы слэбов конкретного камня.
# Строки, начинающиеся с #, и пустые строки игнорируются.
https://veneziastone.com/marble/delicato-brown/slabs/
```

- [ ] **Step 5: Manual verification against the real site (you must run this)**

From `D:\calculator`, run: `python scripts/scrape_slabs.py --debug`

Expected: it prints `Scraping https://veneziastone.com/marble/delicato-brown/slabs/ ...`,
then a kept/skipped count, then `Wrote .../data/slabs.json`. Open the
resulting `data/slabs.json` and check: does the kept slab count look
plausible compared to what you see on the actual page (should be well
above the 16 we saw in the static snapshot, since the live page has
all 15 batches, not just 3)? Do the `price_total_rub` values match
what the site shows? If the count looks too low (e.g. still only
matching a handful of batches), the scroll-to-bottom loop in
`fetch_rendered_html` isn't triggering all batches to lazy-load —
report back what you see and I'll adjust the wait/scroll strategy.

- [ ] **Step 6: Commit**

```bash
git add scripts/scrape_slabs.py scripts/stone_urls.txt
git commit -m "$(cat <<'EOF'
feat: add Playwright orchestration and CLI entry point

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `SCHEDULING.md` — Windows Task Scheduler setup

**Files:**
- Create: `SCHEDULING.md`

- [ ] **Step 1: Write the scheduling instructions**

Create `SCHEDULING.md`:

```markdown
# Автоматический запуск скрапера

`scripts/scrape_slabs.py` нужно запускать раз в сутки, чтобы
`data/slabs.json` не устаревал. Скрипт нужно запускать на той машине,
которая раздаёт `data/slabs.json` калькулятору (если веб-сервер
компании — это отдельная машина, а не эта, нужен дополнительный шаг
деплоя файла туда — это вне рамок данной инструкции).

## Вариант 1: через `schtasks` (командная строка)

Выполните в PowerShell от имени пользователя, у которого есть доступ
к `D:\calculator` и установленному Python:

    schtasks /create /tn "VeneziaStone-ScrapeSlabs" /tr "python D:\calculator\scripts\scrape_slabs.py" /sc daily /st 07:00 /f

Проверить, что задача создана: `schtasks /query /tn "VeneziaStone-ScrapeSlabs"`
Запустить вручную для проверки: `schtasks /run /tn "VeneziaStone-ScrapeSlabs"`
Удалить задачу: `schtasks /delete /tn "VeneziaStone-ScrapeSlabs" /f`

## Вариант 2: через графический Task Scheduler

1. Открыть "Планировщик заданий" (Task Scheduler).
2. "Создать задачу" (не "Создать простую задачу" — нужны более гибкие
   настройки).
3. Вкладка "Общие": имя `VeneziaStone-ScrapeSlabs`, "Выполнять, не
   зависимо от того, выполнен ли вход пользователя".
4. Вкладка "Триггеры" → "Создать" → "Ежедневно", время 07:00.
5. Вкладка "Действия" → "Создать" → "Запуск программы":
   - Программа: `python`
   - Аргументы: `D:\calculator\scripts\scrape_slabs.py`
   - Рабочая папка: `D:\calculator`
6. Сохранить, ввести пароль пользователя при запросе.

## Проверка логов

Скрипт печатает в stdout/stderr — при запуске через Task Scheduler это
не видно по умолчанию. Чтобы сохранять лог, замените команду на:

    powershell -Command "python D:\calculator\scripts\scrape_slabs.py *> D:\calculator\scrape_slabs.log"

и используйте эту команду в поле "Аргументы" (с `/tr` в варианте 1)
или в шаге 5 (вариант 2).
```

- [ ] **Step 2: Commit**

```bash
git add SCHEDULING.md
git commit -m "$(cat <<'EOF'
docs: add Windows Task Scheduler setup instructions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
