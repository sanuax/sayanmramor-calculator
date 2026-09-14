# Material Picker (Step B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain `<select>` material field in the calculator with a full-screen, Telegram-gift-picker-style modal: search, hardness-category chip filter, alphabetical/price sort, lazy-loaded card grid, and an image lightbox — backed by a corrected `available` flag from the scraper.

**Architecture:** A small Python fix in `scripts/scrape_slabs.py` makes `available` a reliable signal (2 consecutive empty scrapes, not 1, before flipping false). A new `material-picker.js` (UMD module, same pattern as the existing `pricing.js`) holds pure, unit-tested filter/sort/search functions plus DOM glue (`init({ stones, onSelect })` → `{ open, close }`) that is verified manually in a browser. `sayanmramor-calculator.html` swaps its `<select>` for a button that opens the picker, and its inline script switches from reading `materialSelect.value` to a `selectedStoneId` variable set by the picker's `onSelect` callback.

**Tech Stack:** Vanilla JS (no build step, no framework — matches the rest of the repo), Python 3 + `unittest` for the scraper, Node's built-in `node:test` for JS unit tests (same as `tests/pricing.test.js`).

**Spec:** `docs/superpowers/specs/2026-09-14-material-picker-design.md`

## Global Constraints

- No build step or bundler — plain `<script>` tags and CommonJS/UMD modules only, exactly like `pricing.js`.
- No new runtime dependencies (npm packages, CDN libraries).
- `available` flips to `false` only after **2 consecutive** empty scrapes (not 1) — protects against a single scrape glitch.
- Lazy-load batch size is **40** cards per render.
- No filter by stone category (marble/granite/...) in this version — hardness-category chips only.
- No image resizing/thumbnails — grid uses the full-size images from Step A with `loading="lazy"`.
- Visual polish (spacing, typography, animation) is deferred to a dedicated `frontend-design` pass (Task 5) — earlier tasks only need functional, non-broken CSS.

---

### Task 1: `available` flag follow-up in `scrape_slabs.py`

**Files:**
- Modify: `scripts/scrape_slabs.py:249-283` (`merge_stone_into_data`)
- Test: `tests/test_scrape_slabs.py` (`MergeStoneIntoDataTests` class, starting at line 289; also fixes the now-outdated `test_skips_and_preserves_data_when_new_slabs_empty` at line 313)

**Interfaces:**
- Consumes: nothing new — same `data` dict / `stone` dict shapes already used throughout `scrape_slabs.py`.
- Produces: every stone dict in `data['stones']` now always carries `available` (bool) and `consecutive_empty_scrapes` (int), consumed by Task 4's inline script and by `material-picker.js`'s `matchesHardnessFilter`/badge rendering in Task 3.

- [ ] **Step 1: Write the failing tests**

Replace the existing `test_skips_and_preserves_data_when_new_slabs_empty` (it currently asserts the output equals the input byte-for-byte, which will no longer hold once bookkeeping fields are added) and add the new cases, in `tests/test_scrape_slabs.py` inside `MergeStoneIntoDataTests`:

```python
    def test_first_empty_scrape_keeps_available_true(self):
        data = {
            'updated_at': None,
            'stones': [{'id': 'delicato-brown', 'name': 'Old', 'slabs': [{'article': 'OLD'}]}],
        }
        stone = {'id': 'delicato-brown', 'name': 'New', 'slabs': []}
        new_data, skipped = scrape_slabs.merge_stone_into_data(data, stone)
        self.assertTrue(skipped)
        updated = new_data['stones'][0]
        self.assertTrue(updated['available'])
        self.assertEqual(updated['consecutive_empty_scrapes'], 1)
        self.assertEqual(updated['slabs'], [{'article': 'OLD'}])
        self.assertEqual(updated['name'], 'Old')

    def test_second_consecutive_empty_scrape_marks_unavailable(self):
        data = {
            'updated_at': None,
            'stones': [{
                'id': 'delicato-brown', 'name': 'Old', 'slabs': [{'article': 'OLD'}],
                'available': True, 'consecutive_empty_scrapes': 1,
            }],
        }
        stone = {'id': 'delicato-brown', 'name': 'New', 'slabs': []}
        new_data, skipped = scrape_slabs.merge_stone_into_data(data, stone)
        self.assertTrue(skipped)
        updated = new_data['stones'][0]
        self.assertFalse(updated['available'])
        self.assertEqual(updated['consecutive_empty_scrapes'], 2)
        self.assertEqual(updated['slabs'], [{'article': 'OLD'}])

    def test_non_empty_scrape_resets_counter_and_marks_available(self):
        data = {
            'updated_at': None,
            'stones': [{
                'id': 'delicato-brown', 'name': 'Old', 'slabs': [{'article': 'OLD'}],
                'available': False, 'consecutive_empty_scrapes': 2,
            }],
        }
        stone = {'id': 'delicato-brown', 'name': 'New', 'slabs': [{'article': 'NEW'}]}
        new_data, skipped = scrape_slabs.merge_stone_into_data(data, stone)
        self.assertFalse(skipped)
        updated = new_data['stones'][0]
        self.assertTrue(updated['available'])
        self.assertEqual(updated['consecutive_empty_scrapes'], 0)
        self.assertEqual(updated['slabs'], [{'article': 'NEW'}])

    def test_new_stone_empty_on_first_sighting_gets_available_true_and_counter_one(self):
        data = {'updated_at': None, 'stones': []}
        stone = {'id': 'new-stone', 'name': 'New Stone', 'slabs': []}
        new_data, was_empty = scrape_slabs.merge_stone_into_data(data, stone)
        self.assertTrue(was_empty)
        inserted = new_data['stones'][0]
        self.assertTrue(inserted['available'])
        self.assertEqual(inserted['consecutive_empty_scrapes'], 1)

    def test_new_stone_with_slabs_gets_available_true_and_counter_zero(self):
        data = {'updated_at': None, 'stones': []}
        stone = {'id': 'delicato-brown', 'name': 'Delicato Brown', 'slabs': [{'article': 'A1'}]}
        new_data, _ = scrape_slabs.merge_stone_into_data(data, stone)
        inserted = new_data['stones'][0]
        self.assertTrue(inserted['available'])
        self.assertEqual(inserted['consecutive_empty_scrapes'], 0)
```

Also delete the old `test_skips_and_preserves_data_when_new_slabs_empty` method (lines 313-321) — it's superseded by `test_first_empty_scrape_keeps_available_true` above, which checks the same "slabs preserved" behavior plus the new fields.

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m unittest tests.test_scrape_slabs -v`
Expected: the 5 new tests FAIL (`KeyError: 'available'` or similar) — everything else still passes.

- [ ] **Step 3: Implement the minimal change**

Replace `merge_stone_into_data` (currently `scripts/scrape_slabs.py:249-283`) with:

```python
AVAILABLE_EMPTY_SCRAPE_THRESHOLD = 2


def merge_stone_into_data(data, stone):
    stones = data.get('stones', [])
    is_empty = not stone.get('slabs')
    existing = next((s for s in stones if s.get('id') == stone.get('id')), None)

    if existing is not None:
        if is_empty:
            # A stone we already have real slab data for came back empty
            # this run -- keep the stale slabs/prices as a reference rather
            # than wiping them, and only flip `available` to False once
            # enough consecutive empty runs rule out a one-off scrape
            # glitch (AVAILABLE_EMPTY_SCRAPE_THRESHOLD).
            updated_existing = dict(existing)
            updated_existing['consecutive_empty_scrapes'] = existing.get('consecutive_empty_scrapes', 0) + 1
            updated_existing['available'] = (
                updated_existing['consecutive_empty_scrapes'] < AVAILABLE_EMPTY_SCRAPE_THRESHOLD
            )
            # A --fetch-images run can download a fresh image for a stone
            # that comes back with zero slabs this run -- the file is
            # already on disk by the time this runs, so apply that one
            # field even though slabs are being preserved untouched.
            if stone.get('image') and stone['image'] != existing.get('image'):
                updated_existing['image'] = stone['image']
            new_data = dict(data)
            new_data['stones'] = [updated_existing if s.get('id') == stone.get('id') else s
                                   for s in stones]
            return new_data, True
        if 'image' not in stone:
            stone['image'] = existing.get('image')
        stone['consecutive_empty_scrapes'] = 0
        stone['available'] = True
        new_stones = [stone if s.get('id') == stone['id'] else s for s in stones]
    else:
        # A stone we've never seen before: keep it even with slabs: [] so
        # the calculator can show it as "out of stock" instead of it simply
        # not existing anywhere in the catalog.
        stone.setdefault('image', None)
        stone['consecutive_empty_scrapes'] = 1 if is_empty else 0
        stone['available'] = stone['consecutive_empty_scrapes'] < AVAILABLE_EMPTY_SCRAPE_THRESHOLD
        new_stones = stones + [stone]

    new_data = dict(data)
    new_data['stones'] = new_stones
    return new_data, is_empty
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m unittest tests.test_scrape_slabs -v`
Expected: all tests PASS (51 tests: the 47 from before, minus the 1 replaced (`test_skips_and_preserves_data_when_new_slabs_empty`), plus the 5 new ones).

- [ ] **Step 5: Commit**

```bash
git add scripts/scrape_slabs.py tests/test_scrape_slabs.py
git commit -m "feat(scraper): flip available to false only after 2 consecutive empty scrapes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `material-picker.js` — pure filter/sort/search functions

**Files:**
- Create: `material-picker.js` (project root, sibling of `pricing.js`)
- Test: Create `tests/material-picker.test.js`

**Interfaces:**
- Consumes: stone objects shaped like `data/slabs.json` entries — `{ id, name, hardness_category, available, slabs: [{ price_per_m2_rub, ... }] }`.
- Produces (used by Task 3 in the same file, and by Task 4's inline script indirectly via `material-picker.js`'s `init`, added in Task 3): `MaterialPicker.minPricePerM2(stone)`, `MaterialPicker.matchesSearch(stone, query)`, `MaterialPicker.matchesHardnessFilter(stone, selectedHardnesses)`, `MaterialPicker.sortStones(stones, sortKey)` where `sortKey` is `'name'` or `'price'`, `MaterialPicker.filterAndSort(stones, { query, hardnesses, sortKey })`.

- [ ] **Step 1: Write the failing tests**

Create `tests/material-picker.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const MaterialPicker = require('../material-picker.js');

const stones = [
  { id: 'a', name: 'Bianco Carrara', hardness_category: 1, available: true,
    slabs: [{ price_per_m2_rub: 5000 }, { price_per_m2_rub: 4000 }] },
  { id: 'b', name: 'Absolute Black', hardness_category: 2, available: true,
    slabs: [{ price_per_m2_rub: 9000 }] },
  { id: 'c', name: 'Agate Moon', hardness_category: 3, available: false,
    slabs: [{ price_per_m2_rub: 12000 }] },
  { id: 'd', name: 'Delicato Brown', hardness_category: 1, available: false,
    slabs: [] },
];

test('minPricePerM2 returns the lowest price among a stone\'s slabs', () => {
  assert.equal(MaterialPicker.minPricePerM2(stones[0]), 4000);
});

test('minPricePerM2 returns null when there are no priced slabs', () => {
  assert.equal(MaterialPicker.minPricePerM2(stones[3]), null);
});

test('minPricePerM2 ignores null prices among the slabs', () => {
  const stone = { slabs: [{ price_per_m2_rub: null }, { price_per_m2_rub: 3000 }] };
  assert.equal(MaterialPicker.minPricePerM2(stone), 3000);
});

test('matchesSearch is case-insensitive substring match', () => {
  assert.equal(MaterialPicker.matchesSearch(stones[0], 'carra'), true);
  assert.equal(MaterialPicker.matchesSearch(stones[0], 'CARRARA'), true);
  assert.equal(MaterialPicker.matchesSearch(stones[0], 'xyz'), false);
});

test('matchesSearch with an empty query matches everything', () => {
  assert.equal(MaterialPicker.matchesSearch(stones[0], ''), true);
});

test('matchesHardnessFilter with no chips selected matches everything', () => {
  assert.equal(MaterialPicker.matchesHardnessFilter(stones[0], []), true);
});

test('matchesHardnessFilter matches any selected hardness (OR)', () => {
  assert.equal(MaterialPicker.matchesHardnessFilter(stones[0], [1, 3]), true);
  assert.equal(MaterialPicker.matchesHardnessFilter(stones[1], [1, 3]), false);
});

test('sortStones by name sorts alphabetically', () => {
  const sorted = MaterialPicker.sortStones(stones, 'name');
  assert.deepEqual(sorted.map(s => s.id), ['b', 'a', 'd', 'c']);
});

test('sortStones by price sorts ascending with null prices last', () => {
  const sorted = MaterialPicker.sortStones(stones, 'price');
  assert.deepEqual(sorted.map(s => s.id), ['a', 'b', 'c', 'd']);
});

test('sortStones does not mutate the input array', () => {
  const copy = stones.slice();
  MaterialPicker.sortStones(stones, 'name');
  assert.deepEqual(stones, copy);
});

test('filterAndSort combines search, hardness filter, and sort', () => {
  const result = MaterialPicker.filterAndSort(stones, {
    query: '', hardnesses: [1], sortKey: 'price',
  });
  assert.deepEqual(result.map(s => s.id), ['a', 'd']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/material-picker.test.js`
Expected: FAIL — `Cannot find module '../material-picker.js'`.

- [ ] **Step 3: Write the minimal implementation**

Create `material-picker.js`:

```js
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.MaterialPicker = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  function minPricePerM2(stone) {
    const prices = (stone.slabs || [])
      .map(s => s.price_per_m2_rub)
      .filter(p => p !== null && p !== undefined);
    if (prices.length === 0) return null;
    return Math.min(...prices);
  }

  function matchesSearch(stone, query) {
    if (!query) return true;
    return stone.name.toLowerCase().includes(query.toLowerCase());
  }

  function matchesHardnessFilter(stone, selectedHardnesses) {
    if (!selectedHardnesses || selectedHardnesses.length === 0) return true;
    return selectedHardnesses.includes(stone.hardness_category);
  }

  function sortStones(stones, sortKey) {
    const copy = stones.slice();
    if (sortKey === 'price') {
      copy.sort((a, b) => {
        const pa = minPricePerM2(a);
        const pb = minPricePerM2(b);
        if (pa === null && pb === null) return a.name.localeCompare(b.name, 'ru');
        if (pa === null) return 1;
        if (pb === null) return -1;
        if (pa !== pb) return pa - pb;
        return a.name.localeCompare(b.name, 'ru');
      });
    } else {
      copy.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    }
    return copy;
  }

  function filterAndSort(stones, { query, hardnesses, sortKey }) {
    const filtered = stones.filter(s => matchesSearch(s, query) && matchesHardnessFilter(s, hardnesses));
    return sortStones(filtered, sortKey);
  }

  return { minPricePerM2, matchesSearch, matchesHardnessFilter, sortStones, filterAndSort };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/material-picker.test.js`
Expected: all 11 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add material-picker.js tests/material-picker.test.js
git commit -m "feat: add material-picker pure filter/sort/search functions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `material-picker.js` — DOM glue (modal, lazy-load, lightbox)

**Files:**
- Modify: `material-picker.js` (extends the file from Task 2 — add `init` inside the same factory function, before the final `return`)

**Interfaces:**
- Consumes: `minPricePerM2`, `matchesSearch`, `matchesHardnessFilter`, `sortStones`, `filterAndSort` (all defined in Task 2, same closure scope — no import needed since they're in the same UMD factory).
- Produces: `MaterialPicker.init({ stones, onSelect })` → `{ open, close }`, consumed by Task 4's inline script. `init` expects the DOM elements below to already exist in the page (added in Task 4):
  `#pickerOverlay`, `#pickerSearch`, `#pickerClose`, `#pickerChips` (containing `.chip[data-hardness]` buttons), `#pickerSort` (containing `.sort-btn[data-sort]` buttons), `#pickerGrid`, `#pickerSentinel`, `#pickerEmpty`, `#lightboxOverlay`, `#lightboxClose`, `#lightboxImg`.

This task's code is DOM-driven (`document`, `IntersectionObserver`) and is not covered by `node:test` — per the spec, it's verified manually in a browser once Task 4 wires it into the actual page. There is no separate "write failing test" step for this task; instead, the last step is a manual browser check against a temporary harness page.

- [ ] **Step 1: Add `init` to `material-picker.js`**

Insert into `material-picker.js`, inside the factory function, after `filterAndSort` and before the final `return { ... }` line — and update that final `return` to also include `init`:

```js
  const BATCH_SIZE = 40;

  function init({ stones, onSelect }) {
    const overlay = document.getElementById('pickerOverlay');
    const searchInput = document.getElementById('pickerSearch');
    const closeBtn = document.getElementById('pickerClose');
    const chips = Array.from(document.querySelectorAll('#pickerChips .chip'));
    const sortButtons = Array.from(document.querySelectorAll('#pickerSort .sort-btn'));
    const grid = document.getElementById('pickerGrid');
    const sentinel = document.getElementById('pickerSentinel');
    const emptyMessage = document.getElementById('pickerEmpty');
    const lightboxOverlay = document.getElementById('lightboxOverlay');
    const lightboxClose = document.getElementById('lightboxClose');
    const lightboxImg = document.getElementById('lightboxImg');

    let currentQuery = '';
    let currentHardnesses = [];
    let currentSortKey = 'name';
    let filteredList = [];
    let renderedCount = 0;
    let isLoadingBatch = false;

    function buildCard(stone) {
      const card = document.createElement('div');
      card.className = 'stone-card';
      card.dataset.id = stone.id;

      const imageWrap = document.createElement('div');
      imageWrap.className = 'stone-card-image';

      const img = document.createElement('img');
      img.loading = 'lazy';
      img.alt = '';
      img.src = stone.image ? 'data/' + stone.image : '';
      img.addEventListener('error', () => {
        imageWrap.classList.add('image-broken');
        img.remove();
      });
      img.addEventListener('click', (e) => {
        e.stopPropagation();
        lightboxImg.src = img.src;
        lightboxOverlay.hidden = false;
      });
      imageWrap.appendChild(img);

      if (stone.available === false) {
        const badge = document.createElement('span');
        badge.className = 'badge-oos';
        badge.textContent = 'Нет в наличии';
        imageWrap.appendChild(badge);
      }

      const name = document.createElement('div');
      name.className = 'stone-card-name';
      name.textContent = stone.name;

      card.appendChild(imageWrap);
      card.appendChild(name);
      card.addEventListener('click', () => {
        onSelect(stone.id);
        close();
      });
      return card;
    }

    function renderNextBatch() {
      if (isLoadingBatch) return;
      isLoadingBatch = true;
      const nextSlice = filteredList.slice(renderedCount, renderedCount + BATCH_SIZE);
      nextSlice.forEach(stone => grid.appendChild(buildCard(stone)));
      renderedCount += nextSlice.length;
      sentinel.hidden = renderedCount >= filteredList.length;
      isLoadingBatch = false;
    }

    function resetAndRender() {
      filteredList = filterAndSort(stones, {
        query: currentQuery, hardnesses: currentHardnesses, sortKey: currentSortKey,
      });
      grid.innerHTML = '';
      renderedCount = 0;
      emptyMessage.hidden = filteredList.length > 0;
      sentinel.hidden = filteredList.length === 0;
      renderNextBatch();
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) renderNextBatch();
    });
    observer.observe(sentinel);

    searchInput.addEventListener('input', () => {
      currentQuery = searchInput.value.trim();
      resetAndRender();
    });

    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chip.classList.toggle('active');
        currentHardnesses = chips
          .filter(c => c.classList.contains('active'))
          .map(c => Number(c.dataset.hardness));
        resetAndRender();
      });
    });

    sortButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        currentSortKey = btn.dataset.sort;
        sortButtons.forEach(b => b.classList.toggle('active', b === btn));
        resetAndRender();
      });
    });

    function closeLightbox() {
      lightboxOverlay.hidden = true;
      lightboxImg.src = '';
    }
    lightboxClose.addEventListener('click', closeLightbox);
    lightboxOverlay.addEventListener('click', (e) => {
      if (e.target === lightboxOverlay) closeLightbox();
    });

    function close() {
      overlay.hidden = true;
    }
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!lightboxOverlay.hidden) { closeLightbox(); return; }
        if (!overlay.hidden) close();
      }
    });

    function open() {
      currentQuery = '';
      currentHardnesses = [];
      currentSortKey = 'name';
      searchInput.value = '';
      chips.forEach(c => c.classList.remove('active'));
      sortButtons.forEach(b => b.classList.toggle('active', b.dataset.sort === 'name'));
      resetAndRender();
      overlay.hidden = false;
      searchInput.focus();
    }

    return { open, close };
  }
```

And change the module's final line from:

```js
  return { minPricePerM2, matchesSearch, matchesHardnessFilter, sortStones, filterAndSort };
```

to:

```js
  return { minPricePerM2, matchesSearch, matchesHardnessFilter, sortStones, filterAndSort, init };
```

- [ ] **Step 2: Run the Task 2 unit tests to confirm nothing broke**

Run: `node --test tests/material-picker.test.js`
Expected: same 11 tests still PASS (this task only adds `init`, doesn't touch the pure functions).

- [ ] **Step 3: Commit**

```bash
git add material-picker.js
git commit -m "feat: add material-picker modal DOM glue (render, lazy-load, lightbox)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

(Manual browser verification of `init`'s actual behavior happens in Task 4's final step, once the required DOM elements exist on the real page — there's nothing renderable to click through until then.)

---

### Task 4: Wire the picker into `sayanmramor-calculator.html`

**Files:**
- Modify: `sayanmramor-calculator.html`

**Interfaces:**
- Consumes: `MaterialPicker.init({ stones, onSelect })` from Task 3.
- Produces: nothing further downstream — this is the last integration point.

- [ ] **Step 1: Replace the material `<select>` with a picker-trigger button**

In `sayanmramor-calculator.html`, replace:

```html
      <div class="field">
        <label for="material">Материал</label>
        <select id="material"></select>
      </div>
```

with:

```html
      <div class="field">
        <label id="materialLabel">Материал</label>
        <button type="button" class="material-field" id="materialField"
                aria-labelledby="materialLabel" aria-haspopup="dialog" disabled>
          <span class="material-field-thumb" id="materialFieldThumb" hidden><img alt=""></span>
          <span class="material-field-text" id="materialFieldText">Загрузка материалов…</span>
          <span class="material-field-chevron" aria-hidden="true">▾</span>
        </button>
      </div>
```

- [ ] **Step 2: Add the picker modal and lightbox markup**

Just before `<script src="pricing.js">`, add:

```html
<div class="picker-overlay" id="pickerOverlay" hidden role="dialog" aria-modal="true" aria-label="Выбор камня">
  <div class="picker-header">
    <input type="search" id="pickerSearch" placeholder="Поиск по названию…" autocomplete="off">
    <button type="button" id="pickerClose" aria-label="Закрыть">✕</button>
  </div>
  <div class="picker-chips" id="pickerChips">
    <button type="button" class="chip" data-hardness="1">Лёгкая обработка</button>
    <button type="button" class="chip" data-hardness="2">Средняя обработка</button>
    <button type="button" class="chip" data-hardness="3">Сложная обработка</button>
  </div>
  <div class="picker-sort" id="pickerSort">
    <button type="button" class="sort-btn active" data-sort="name">А-Я</button>
    <button type="button" class="sort-btn" data-sort="price">Цена ↑</button>
  </div>
  <div class="picker-grid" id="pickerGrid"></div>
  <div class="picker-sentinel" id="pickerSentinel"></div>
  <div class="picker-empty" id="pickerEmpty" hidden>Ничего не найдено</div>
</div>

<div class="lightbox-overlay" id="lightboxOverlay" hidden>
  <button type="button" id="lightboxClose" aria-label="Закрыть">✕</button>
  <img id="lightboxImg" alt="">
</div>
```

- [ ] **Step 3: Add functional CSS**

Add to the `<style>` block (after the existing `.checkbox-row input` rule):

```css
  .material-field {
    width: 100%;
    padding: 12px 14px;
    border: 1px solid #ddd;
    border-radius: 3px;
    font-size: 15px;
    background: #fafafa;
    color: #1a1a1a;
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
  }
  .material-field:disabled { color: #999; cursor: default; }
  .material-field-thumb img { width: 28px; height: 28px; object-fit: cover; border-radius: 3px; display: block; }
  .material-field-text { flex: 1; }
  .material-field-chevron { color: #999; }

  .picker-overlay {
    position: fixed; inset: 0; background: #fff; z-index: 1000;
    display: flex; flex-direction: column; padding: 16px;
  }
  .picker-overlay[hidden] { display: none; }
  .picker-header { display: flex; gap: 8px; margin-bottom: 12px; }
  #pickerSearch { flex: 1; padding: 10px 12px; border: 1px solid #ddd; border-radius: 3px; font-size: 15px; }
  #pickerClose { background: none; border: none; font-size: 20px; cursor: pointer; padding: 4px 10px; }
  .picker-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
  .chip { padding: 6px 12px; border: 1px solid #ddd; border-radius: 16px; background: #fafafa; font-size: 13px; cursor: pointer; }
  .chip.active { background: #ff5a1f; border-color: #ff5a1f; color: #fff; }
  .picker-sort { display: flex; gap: 8px; margin-bottom: 12px; }
  .sort-btn { padding: 6px 12px; border: 1px solid #ddd; border-radius: 3px; background: #fff; font-size: 13px; cursor: pointer; }
  .sort-btn.active { border-color: #ff5a1f; color: #ff5a1f; font-weight: 700; }
  .picker-grid {
    flex: 1; overflow-y: auto; display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px;
  }
  .stone-card { cursor: pointer; }
  .stone-card-image { position: relative; aspect-ratio: 1; border-radius: 4px; overflow: hidden; background: #eee; }
  .stone-card-image img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .stone-card-image.image-broken::after {
    content: '—'; display: flex; align-items: center; justify-content: center;
    position: absolute; inset: 0; color: #999; font-size: 12px;
  }
  .badge-oos {
    position: absolute; bottom: 4px; left: 4px; right: 4px;
    background: rgba(26,26,26,0.85); color: #fff; font-size: 10px;
    text-align: center; padding: 3px 4px; border-radius: 2px;
  }
  .stone-card-name { font-size: 12px; margin-top: 4px; color: #1a1a1a; }
  .picker-empty { text-align: center; color: #999; padding: 40px 0; }
  .picker-sentinel { height: 1px; }
  .lightbox-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 1100;
    display: flex; align-items: center; justify-content: center;
  }
  .lightbox-overlay[hidden] { display: none; }
  .lightbox-overlay img { max-width: 90vw; max-height: 90vh; object-fit: contain; }
  #lightboxClose {
    position: absolute; top: 16px; right: 16px; background: none; border: none;
    color: #fff; font-size: 24px; cursor: pointer;
  }
```

- [ ] **Step 4: Load `material-picker.js` and rewrite the inline script's material handling**

Add `<script src="material-picker.js"></script>` right after the existing `<script src="pricing.js"></script>` line.

In the inline `<script>` block, replace:

```js
  const materialSelect = document.getElementById('material');
```

with:

```js
  const materialField = document.getElementById('materialField');
  const materialFieldThumb = document.getElementById('materialFieldThumb');
  const materialFieldThumbImg = materialFieldThumb.querySelector('img');
  const materialFieldText = document.getElementById('materialFieldText');
  let selectedStoneId = null;
  let picker = null;
```

Replace the whole `materialSelect.innerHTML = '<option value="">Загрузка материалов…</option>';` line and the `fetch('data/slabs.json')...catch(...)` block with:

```js
  fetch('data/slabs.json')
    .then(r => r.json())
    .then(data => {
      UPDATED_AT = data.updated_at;
      (data.stones || []).forEach(stone => { STONES_BY_ID[stone.id] = stone; });
      picker = MaterialPicker.init({ stones: data.stones || [], onSelect: handleMaterialSelected });
      materialField.disabled = false;
      materialFieldText.textContent = 'Выберите камень';
      DATA_LOADED = true;
      calculate();
    })
    .catch(() => {
      materialField.disabled = true;
      materialFieldText.textContent = 'Ошибка загрузки';
      warningOut.textContent = 'Не удалось загрузить data/slabs.json. Проверьте, что страница открыта через веб-сервер (не как локальный файл).';
      warningOut.style.display = 'block';
    });

  function handleMaterialSelected(stoneId) {
    const stone = STONES_BY_ID[stoneId];
    selectedStoneId = stoneId;
    materialFieldText.textContent = stone.name;
    if (stone.image) {
      materialFieldThumbImg.src = 'data/' + stone.image;
      materialFieldThumb.hidden = false;
    } else {
      materialFieldThumb.hidden = true;
    }
    calculate();
  }

  materialField.addEventListener('click', () => {
    if (picker) picker.open();
  });
```

In `calculate()`, replace:

```js
    const product = PRODUCTS[productSelect.value];
    const stone = STONES_BY_ID[materialSelect.value];
```

with:

```js
    const product = PRODUCTS[productSelect.value];

    if (!selectedStoneId) {
      priceOut.textContent = '—';
      breakdown.innerHTML = '';
      warningOut.style.display = 'none';
      updatedAtOut.textContent = '';
      infoBlock.style.display = 'none';
      return;
    }
    const stone = STONES_BY_ID[selectedStoneId];
```

Finally, remove `materialSelect` from the shared listener array — replace:

```js
  [productSelect, materialSelect, widthInput, lengthInput].forEach(el => {
```

with:

```js
  [productSelect, widthInput, lengthInput].forEach(el => {
```

- [ ] **Step 5: Manual browser verification**

Serve the directory (`python -m http.server` from `D:\calculator`, since `fetch('data/slabs.json')` requires http(s), not `file://`) and open `sayanmramor-calculator.html`:

1. Material field shows "Загрузка материалов…" then "Выберите камень"; clicking it before data loads does nothing (disabled).
2. Clicking the field after load opens the full-screen picker; typing in search filters the grid live; toggling multiple hardness chips combines as OR; switching sort between "А-Я" and "Цена ↑" re-renders from the top.
3. Scroll the grid in DevTools with the Network panel open — confirm images beyond the first ~40 cards are not requested until scrolled into view.
4. Click a card's image — lightbox opens full-screen with that image; click the backdrop or ✕ to close it without selecting.
5. Click the rest of a card (not the image) — modal closes, the material field shows that stone's thumbnail + name, and `calculate()` runs.
6. Pick a stone with `available: false` — same selection flow works, and the existing "нужно уточнить у менеджера" messaging appears since its usable slab count is 0.
7. Confirm `Escape` closes the lightbox first (if open), then the modal.

- [ ] **Step 6: Commit**

```bash
git add sayanmramor-calculator.html
git commit -m "feat: wire material picker modal into the calculator page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Visual design pass + final QA

**Files:**
- Modify: `sayanmramor-calculator.html` (the `<style>` block only — no markup or script changes)

**Interfaces:**
- Consumes: the functional picker built in Tasks 1-4.
- Produces: nothing further downstream — this is the last task in the plan.

- [ ] **Step 1: Invoke the `frontend-design` skill**

Use the `frontend-design` skill to polish the picker modal's visual design — spacing, typography, chip/sort-button styling, card grid rhythm, lightbox transition — informed by the Telegram gift-picker reference named throughout this project's brainstorming. Keep the same element IDs/classes and the orange `#ff5a1f` / dark `#1a1a1a` accent already used elsewhere on the page; this is a CSS-only pass — do not change `material-picker.js` or the HTML structure added in Task 4.

- [ ] **Step 2: Re-run the full automated test suite**

Run: `python -m unittest tests.test_scrape_slabs -v && node --test tests/pricing.test.js tests/material-picker.test.js`
Expected: all tests PASS (the CSS-only change in Step 1 shouldn't affect any of them, but this confirms nothing else regressed).

- [ ] **Step 3: Repeat the manual browser verification from Task 4, Step 5**

Confirm all 7 checks still hold after the visual pass (in particular that the chip/sort "active" states and the out-of-stock badge are still visually distinguishable, and the lazy-load sentinel behavior wasn't affected by layout changes).

- [ ] **Step 4: Commit**

```bash
git add sayanmramor-calculator.html
git commit -m "style: polish material picker modal visual design

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
