# Calculator Pricing Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the calculator's hardcoded price-range pricing with logic
that matches a real slab from `data/slabs.json` and prices it with a
work/markup multiplier, instead of the old "от-до" range over generic
material categories.

**Architecture:** Extract the pricing math into a small dependency-free
JS module (`pricing.js`, UMD-style so it loads via `<script src>` in the
browser and via `require()` in Node tests) with pure functions. The HTML
file keeps only DOM wiring: it fetches `data/slabs.json`, populates the
material dropdown from it, and calls into `pricing.js` from `calculate()`.

**Tech Stack:** Vanilla JS (no build step, no framework), Node's built-in
`node:test` + `node:assert/strict` for unit tests (Node v24 confirmed
available — no extra dependency to install).

**Spec:** `docs/superpowers/specs/2026-09-11-slab-pricing-calculator-design.md`

## Global Constraints

- `SAW_MARGIN_CM = 4` — saw margin added to **each edge** of the product
  (so total added per dimension is `2 * SAW_MARGIN_CM` = 8cm), per the spec.
- `AREA_WASTE_FACTOR = 1.3` — Type B (seamed) slab-count formula multiplies
  needed area by this before dividing by slab area.
- `WORK_MULTIPLIER = 2` — work cost = `subtotal * WORK_MULTIPLIER *
  complexityMultiplier * (1 + optionSurchargeSum)`; total = `subtotal + work`.
  Verified example from spec: subtotal 52 673 ₽, complexity 1.0, no options
  → work 105 346 ₽, total 158 019 ₽.
- Type A products (single piece, no seam): `stoleshnitsa`, `podokonnik`,
  `kamin`, `stupeni`. Type B products (seamed): `stena`, `fasad`,
  `lestnitsa`. `lestnitsa` additionally shows a manager-confirmation
  disclaimer (see Task 7).
- No slab fits (Type A) → show "нужно уточнить у менеджера", no price.
- Result shows one exact price (not a range), plus a small-text date
  footnote sourced from `slabs.json`'s `updated_at`.
- The result panel always shows the fixed info text about free storage of
  the offcut, and (Type A only) a "Остаток: X м²" line.

---

## File Structure

- Create: `pricing.js` — pure pricing/matching functions, UMD export.
- Create: `tests/pricing.test.js` — Node test-runner unit tests for
  `pricing.js`.
- Create: `data/slabs.json` — hand-written fixture (real Delicato Brown
  numbers + one synthetic stone) so the page works for manual testing
  before the real scraper (Plan 2) has run.
- Modify: `sayanmramor-calculator.html` — add `<script src="pricing.js">`,
  add `type` field to `PRODUCTS`, replace static `MATERIALS` with a
  `fetch('data/slabs.json')` populated dropdown, rewrite `calculate()`,
  add new result-panel elements (`warningOut`, `remainderOut`,
  `updatedAtOut`, static info block) and their CSS.

---

### Task 1: `findBestTypeASlab`

**Files:**
- Create: `pricing.js`
- Test: `tests/pricing.test.js`

**Interfaces:**
- Produces: `findBestTypeASlab(slabs: Array<{width_cm, length_cm, price_total_rub}>, widthM: number, lengthM: number, marginCm: number) -> slabObject | null`
  — rotation allowed; margin added to **each edge**, i.e. required size is
  `widthM*100 + 2*marginCm` by `lengthM*100 + 2*marginCm`; returns the
  cheapest (`price_total_rub`) slab that fits, or `null` if none fit.

- [ ] **Step 1: Write the failing test**

Create `tests/pricing.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const Pricing = require('../pricing.js');

const slabs = [
  { article: 'P0444194', width_cm: 276, length_cm: 177, price_per_m2_rub: 11008, price_total_rub: 52673 },
  { article: 'M0517386', width_cm: 280, length_cm: 185, price_per_m2_rub: 11008, price_total_rub: 57021 },
  { article: 'P0517523', width_cm: 283, length_cm: 187, price_per_m2_rub: 11135, price_total_rub: 58589 },
];

test('findBestTypeASlab picks the cheapest slab that fits with margin', () => {
  // столешница 1.0 x 0.6 m, margin 4cm each edge -> need 108cm x 68cm, all 3 slabs fit
  const best = Pricing.findBestTypeASlab(slabs, 1.0, 0.6, 4);
  assert.equal(best.article, 'P0444194');
});

test('findBestTypeASlab allows rotation', () => {
  // 1.7m x 2.7m needs a slab that is 178x274 min (rotated fits into 276x177 as 177x276)
  const best = Pricing.findBestTypeASlab(slabs, 1.70, 2.70, 4);
  assert.equal(best.article, 'P0444194');
});

test('findBestTypeASlab returns null when nothing fits', () => {
  const none = Pricing.findBestTypeASlab(slabs, 3, 2, 4);
  assert.equal(none, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/pricing.test.js`
Expected: FAIL — `Cannot find module '../pricing.js'`

- [ ] **Step 3: Write minimal implementation**

Create `pricing.js`:

```js
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.Pricing = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  function findBestTypeASlab(slabs, widthM, lengthM, marginCm) {
    const needW = widthM * 100 + 2 * marginCm;
    const needL = lengthM * 100 + 2 * marginCm;
    let best = null;
    for (const slab of slabs) {
      const fitsDirect = slab.width_cm >= needW && slab.length_cm >= needL;
      const fitsRotated = slab.width_cm >= needL && slab.length_cm >= needW;
      if (!fitsDirect && !fitsRotated) continue;
      if (!best || slab.price_total_rub < best.price_total_rub) {
        best = slab;
      }
    }
    return best;
  }

  return { findBestTypeASlab };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/pricing.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add pricing.js tests/pricing.test.js
git commit -m "$(cat <<'EOF'
feat: add findBestTypeASlab slab-matching function

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `computeRemainderAreaM2`

**Files:**
- Modify: `pricing.js`
- Test: `tests/pricing.test.js`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `computeRemainderAreaM2(slab: {width_cm, length_cm}, widthM: number, lengthM: number) -> number`
  — raw slab area (`width_cm/100 * length_cm/100`) minus product area
  (`widthM * lengthM`). Uses full raw slab dimensions (not net of
  "Вычет"), per the spec's MVP decision to ignore Вычет.

- [ ] **Step 1: Write the failing test**

Append to `tests/pricing.test.js`:

```js
test('computeRemainderAreaM2 uses full raw slab area', () => {
  const slab = { width_cm: 276, length_cm: 177 };
  // 2.76*1.77 = 4.8852; product 1.0*0.6 = 0.6 -> remainder 4.2852
  const remainder = Pricing.computeRemainderAreaM2(slab, 1.0, 0.6);
  assert.ok(Math.abs(remainder - 4.2852) < 0.0001);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/pricing.test.js`
Expected: FAIL — `Pricing.computeRemainderAreaM2 is not a function`

- [ ] **Step 3: Write minimal implementation**

In `pricing.js`, add inside the factory function (before the final `return`):

```js
  function computeRemainderAreaM2(slab, widthM, lengthM) {
    const slabAreaM2 = (slab.width_cm / 100) * (slab.length_cm / 100);
    return slabAreaM2 - widthM * lengthM;
  }
```

Update the final `return` statement to:

```js
  return { findBestTypeASlab, computeRemainderAreaM2 };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/pricing.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add pricing.js tests/pricing.test.js
git commit -m "$(cat <<'EOF'
feat: add computeRemainderAreaM2

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `computeTypeBResult`

**Files:**
- Modify: `pricing.js`
- Test: `tests/pricing.test.js`

**Interfaces:**
- Produces: `computeTypeBResult(slabs: Array<{width_cm, length_cm, price_per_m2_rub, price_total_rub}>, widthM: number, lengthM: number, wasteFactor: number) -> {slab, nSlabs, subtotal} | null`
  — picks the slab with the lowest `price_per_m2_rub`; `nSlabs =
  Math.ceil((widthM*lengthM*wasteFactor) / slabAreaM2)`; `subtotal =
  nSlabs * slab.price_total_rub`. Returns `null` if `slabs` is empty.

- [ ] **Step 1: Write the failing test**

Append to `tests/pricing.test.js`:

```js
test('computeTypeBResult picks cheapest-per-m2 slab and computes slab count', () => {
  // area 5*3=15 m2, waste 1.3 -> 19.5 m2 needed; cheapest per-m2 is P0444194 (11008), area 2.76*1.77=4.8852
  // ceil(19.5 / 4.8852) = 4
  const result = Pricing.computeTypeBResult(slabs, 5, 3, 1.3);
  assert.equal(result.slab.article, 'P0444194');
  assert.equal(result.nSlabs, 4);
  assert.equal(result.subtotal, 4 * 52673);
});

test('computeTypeBResult returns null for empty slab list', () => {
  assert.equal(Pricing.computeTypeBResult([], 1, 1, 1.3), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/pricing.test.js`
Expected: FAIL — `Pricing.computeTypeBResult is not a function`

- [ ] **Step 3: Write minimal implementation**

In `pricing.js`, add inside the factory function:

```js
  function computeTypeBResult(slabs, widthM, lengthM, wasteFactor) {
    if (!slabs.length) return null;
    let cheapest = slabs[0];
    for (const slab of slabs) {
      if (slab.price_per_m2_rub < cheapest.price_per_m2_rub) cheapest = slab;
    }
    const areaNeeded = widthM * lengthM;
    const slabAreaM2 = (cheapest.width_cm / 100) * (cheapest.length_cm / 100);
    const nSlabs = Math.ceil((areaNeeded * wasteFactor) / slabAreaM2);
    const subtotal = nSlabs * cheapest.price_total_rub;
    return { slab: cheapest, nSlabs, subtotal };
  }
```

Update the final `return` statement to:

```js
  return { findBestTypeASlab, computeRemainderAreaM2, computeTypeBResult };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/pricing.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add pricing.js tests/pricing.test.js
git commit -m "$(cat <<'EOF'
feat: add computeTypeBResult seamed-area slab count formula

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `computeWorkAndTotal`

**Files:**
- Modify: `pricing.js`
- Test: `tests/pricing.test.js`

**Interfaces:**
- Produces: `computeWorkAndTotal(subtotal: number, workMultiplier: number, complexityMultiplier: number, optionSurchargeSum: number) -> {work, total}`
  — `work = subtotal * workMultiplier * complexityMultiplier * (1 +
  optionSurchargeSum)`; `total = subtotal + work`.

- [ ] **Step 1: Write the failing test**

Append to `tests/pricing.test.js`:

```js
test('computeWorkAndTotal matches spec-verified example (complexity 1.0, no options)', () => {
  const { work, total } = Pricing.computeWorkAndTotal(52673, 2, 1.0, 0);
  assert.equal(work, 105346);
  assert.equal(total, 158019);
});

test('computeWorkAndTotal compounds complexity and options', () => {
  // complexity 1.8 (лестница), one option +0.25 -> work = 52673 * 2 * 1.8 * 1.25
  const { work, total } = Pricing.computeWorkAndTotal(52673, 2, 1.8, 0.25);
  assert.ok(Math.abs(work - 52673 * 2 * 1.8 * 1.25) < 0.001);
  assert.ok(Math.abs(total - (52673 + work)) < 0.001);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/pricing.test.js`
Expected: FAIL — `Pricing.computeWorkAndTotal is not a function`

- [ ] **Step 3: Write minimal implementation**

In `pricing.js`, add inside the factory function:

```js
  function computeWorkAndTotal(subtotal, workMultiplier, complexityMultiplier, optionSurchargeSum) {
    const work = subtotal * workMultiplier * complexityMultiplier * (1 + optionSurchargeSum);
    const total = subtotal + work;
    return { work, total };
  }
```

Update the final `return` statement to:

```js
  return { findBestTypeASlab, computeRemainderAreaM2, computeTypeBResult, computeWorkAndTotal };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/pricing.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add pricing.js tests/pricing.test.js
git commit -m "$(cat <<'EOF'
feat: add computeWorkAndTotal markup formula

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `calculatePrice` orchestrator

**Files:**
- Modify: `pricing.js`
- Test: `tests/pricing.test.js`

**Interfaces:**
- Consumes: `findBestTypeASlab`, `computeRemainderAreaM2`,
  `computeTypeBResult`, `computeWorkAndTotal` (all from this file, Tasks 1-4).
- Produces: `calculatePrice(params) -> result`, where `params` is
  ```
  {
    stone: {name: string, slabs: Array} | null,
    widthM: number, lengthM: number,
    productType: 'A' | 'B',
    complexityMultiplier: number,
    optionSurchargeSum: number,
    marginCm: number, wasteFactor: number, workMultiplier: number
  }
  ```
  and `result` is
  ```
  {
    ok: boolean,
    reason: null | 'invalid_dimensions' | 'no_slabs_for_stone' | 'no_fitting_slab',
    subtotal: number | null,
    work: number | null,
    total: number | null,
    nSlabs: number,
    remainderM2: number | null,
    matchedSlab: object | null
  }
  ```
  This is the single function `sayanmramor-calculator.html`'s
  `calculate()` (Task 7) calls.

- [ ] **Step 1: Write the failing test**

Append to `tests/pricing.test.js`:

```js
const stone = { name: 'Delicato Brown', slabs };

test('calculatePrice: invalid dimensions', () => {
  const r = Pricing.calculatePrice({ stone, widthM: 0, lengthM: 1, productType: 'A', complexityMultiplier: 1, optionSurchargeSum: 0, marginCm: 4, wasteFactor: 1.3, workMultiplier: 2 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'invalid_dimensions');
});

test('calculatePrice: no stone selected / no slabs', () => {
  const r = Pricing.calculatePrice({ stone: { name: 'X', slabs: [] }, widthM: 1, lengthM: 1, productType: 'A', complexityMultiplier: 1, optionSurchargeSum: 0, marginCm: 4, wasteFactor: 1.3, workMultiplier: 2 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_slabs_for_stone');
});

test('calculatePrice: type A no fitting slab', () => {
  const r = Pricing.calculatePrice({ stone, widthM: 3, lengthM: 2, productType: 'A', complexityMultiplier: 1, optionSurchargeSum: 0, marginCm: 4, wasteFactor: 1.3, workMultiplier: 2 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_fitting_slab');
});

test('calculatePrice: type A happy path matches spec-verified numbers', () => {
  const r = Pricing.calculatePrice({ stone, widthM: 1.0, lengthM: 0.6, productType: 'A', complexityMultiplier: 1.0, optionSurchargeSum: 0, marginCm: 4, wasteFactor: 1.3, workMultiplier: 2 });
  assert.equal(r.ok, true);
  assert.equal(r.matchedSlab.article, 'P0444194');
  assert.equal(r.subtotal, 52673);
  assert.equal(r.total, 158019);
  assert.equal(r.nSlabs, 1);
  assert.ok(Math.abs(r.remainderM2 - 4.2852) < 0.0001);
});

test('calculatePrice: type B happy path', () => {
  const r = Pricing.calculatePrice({ stone, widthM: 5, lengthM: 3, productType: 'B', complexityMultiplier: 1.1, optionSurchargeSum: 0, marginCm: 4, wasteFactor: 1.3, workMultiplier: 2 });
  assert.equal(r.ok, true);
  assert.equal(r.nSlabs, 4);
  assert.equal(r.subtotal, 4 * 52673);
  assert.equal(r.remainderM2, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/pricing.test.js`
Expected: FAIL — `Pricing.calculatePrice is not a function`

- [ ] **Step 3: Write minimal implementation**

In `pricing.js`, add inside the factory function:

```js
  function calculatePrice(params) {
    const {
      stone, widthM, lengthM, productType, complexityMultiplier,
      optionSurchargeSum, marginCm, wasteFactor, workMultiplier
    } = params;

    const empty = { subtotal: null, work: null, total: null, nSlabs: 0, remainderM2: null, matchedSlab: null };

    if (!(widthM > 0) || !(lengthM > 0)) {
      return Object.assign({ ok: false, reason: 'invalid_dimensions' }, empty);
    }
    if (!stone || !stone.slabs || stone.slabs.length === 0) {
      return Object.assign({ ok: false, reason: 'no_slabs_for_stone' }, empty);
    }

    if (productType === 'A') {
      const slab = findBestTypeASlab(stone.slabs, widthM, lengthM, marginCm);
      if (!slab) {
        return Object.assign({ ok: false, reason: 'no_fitting_slab' }, empty);
      }
      const subtotal = slab.price_total_rub;
      const { work, total } = computeWorkAndTotal(subtotal, workMultiplier, complexityMultiplier, optionSurchargeSum);
      const remainderM2 = computeRemainderAreaM2(slab, widthM, lengthM);
      return { ok: true, reason: null, subtotal, work, total, nSlabs: 1, remainderM2, matchedSlab: slab };
    }

    const typeBResult = computeTypeBResult(stone.slabs, widthM, lengthM, wasteFactor);
    if (!typeBResult) {
      return Object.assign({ ok: false, reason: 'no_slabs_for_stone' }, empty);
    }
    const { work, total } = computeWorkAndTotal(typeBResult.subtotal, workMultiplier, complexityMultiplier, optionSurchargeSum);
    return { ok: true, reason: null, subtotal: typeBResult.subtotal, work, total, nSlabs: typeBResult.nSlabs, remainderM2: null, matchedSlab: typeBResult.slab };
  }
```

Update the final `return` statement to:

```js
  return { findBestTypeASlab, computeRemainderAreaM2, computeTypeBResult, computeWorkAndTotal, calculatePrice };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/pricing.test.js`
Expected: PASS (13 tests)

- [ ] **Step 5: Commit**

```bash
git add pricing.js tests/pricing.test.js
git commit -m "$(cat <<'EOF'
feat: add calculatePrice orchestrator

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `data/slabs.json` fixture

**Files:**
- Create: `data/slabs.json`

**Interfaces:**
- Consumes: nothing (static data file).
- Produces: the JSON `sayanmramor-calculator.html` (Task 7) fetches at
  runtime. Shape must match `pricing.js`'s expected slab fields
  (`width_cm`, `length_cm`, `price_per_m2_rub`, `price_total_rub`) plus
  `article`/`party`/`pachka`/`city` for display/debug (unused by
  `pricing.js` itself).

This file is data, not code, so there's no test-driven step — just
create it and verify it's valid JSON.

- [ ] **Step 1: Create the fixture**

Create `data/slabs.json` (real Delicato Brown data verified against the
supplier page, plus one synthetic second stone so the manual browser
test in Task 8 can exercise the material dropdown with more than one
option):

```json
{
  "updated_at": "2026-09-11T10:00:00+03:00",
  "stones": [
    {
      "id": "delicato-brown",
      "name": "Delicato Brown",
      "category": "marble",
      "source_url": "https://veneziastone.com/marble/delicato-brown/slabs/",
      "slabs": [
        { "article": "P0444194", "party": "13168", "pachka": "BLP02316", "city": "Санкт-Петербург", "width_cm": 276, "length_cm": 177, "price_per_m2_rub": 11008, "price_total_rub": 52673 },
        { "article": "M0517386", "party": "14011", "pachka": "BLM18905", "city": "Москва", "width_cm": 280, "length_cm": 185, "price_per_m2_rub": 11008, "price_total_rub": 57021 },
        { "article": "M0517383", "party": "14011", "pachka": "BLM18905", "city": "Москва", "width_cm": 280, "length_cm": 185, "price_per_m2_rub": 11008, "price_total_rub": 57021 },
        { "article": "P0517523", "party": "14012", "pachka": "BLP03079", "city": "Санкт-Петербург", "width_cm": 283, "length_cm": 187, "price_per_m2_rub": 11135, "price_total_rub": 58589 }
      ]
    },
    {
      "id": "onyx-white",
      "name": "White Onyx (тестовые данные)",
      "category": "onyx",
      "source_url": "https://veneziastone.com/onyx/white/slabs/",
      "slabs": [
        { "article": "TEST0001", "party": "99001", "pachka": "TST001", "city": "Москва", "width_cm": 190, "length_cm": 90, "price_per_m2_rub": 45000, "price_total_rub": 76950 }
      ]
    }
  ]
}
```

- [ ] **Step 2: Verify it's valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('data/slabs.json', 'utf8')); console.log('valid')"`
Expected: prints `valid`

- [ ] **Step 3: No commit for this task**

`data/slabs.json` is generated output (the real scraper from Plan 2
will overwrite it daily), so it's intentionally excluded by
`.gitignore` and never committed — same as it will behave once the
real scraper exists. It only needs to exist on disk for Task 7/8's
manual browser testing.

---

### Task 7: Wire `pricing.js` and `data/slabs.json` into `sayanmramor-calculator.html`

**Files:**
- Modify: `sayanmramor-calculator.html`

**Interfaces:**
- Consumes: `Pricing.calculatePrice` (global, from `pricing.js`,
  Task 5), `data/slabs.json` (Task 6).

- [ ] **Step 1: Add the script tag and remove the static `MATERIALS` constant**

In the `<head>` or right before the main `<script>` block, add:

```html
<script src="pricing.js"></script>
```

In the existing `<script>` block, delete the `MATERIALS` constant
entirely (it's replaced by data loaded at runtime in Step 3).

- [ ] **Step 2: Add `type` field to `PRODUCTS` and new constants**

Replace the `PRODUCTS` constant with:

```js
const PRODUCTS = {
  stoleshnitsa: { label: "Столешница", complexityMultiplier: 1.0, type: 'A' },
  podokonnik:   { label: "Подоконник", complexityMultiplier: 0.8, type: 'A' },
  lestnitsa:    { label: "Лестница", complexityMultiplier: 1.8, type: 'B' },
  kamin:        { label: "Каминный портал", complexityMultiplier: 1.5, type: 'A' },
  stena:        { label: "Облицовка стены", complexityMultiplier: 1.1, type: 'B' },
  fasad:        { label: "Фасад", complexityMultiplier: 1.3, type: 'B' },
  stupeni:      { label: "Ступени", complexityMultiplier: 1.4, type: 'A' }
};

const SAW_MARGIN_CM = 4;
const AREA_WASTE_FACTOR = 1.3;
const WORK_MULTIPLIER = 2;
```

- [ ] **Step 3: Replace static material population with `fetch('data/slabs.json')`**

Replace this existing block:

```js
Object.entries(MATERIALS).forEach(([key, val]) => {
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = val.label;
  materialSelect.appendChild(opt);
});
```

with:

```js
let STONES_BY_ID = {};
let UPDATED_AT = null;
let DATA_LOADED = false;

materialSelect.innerHTML = '<option value="">Загрузка материалов…</option>';

fetch('data/slabs.json')
  .then(r => r.json())
  .then(data => {
    UPDATED_AT = data.updated_at;
    materialSelect.innerHTML = '';
    (data.stones || []).forEach(stone => {
      STONES_BY_ID[stone.id] = stone;
      const opt = document.createElement('option');
      opt.value = stone.id;
      opt.textContent = stone.name;
      materialSelect.appendChild(opt);
    });
    DATA_LOADED = true;
    calculate();
  })
  .catch(() => {
    materialSelect.innerHTML = '<option value="">Ошибка загрузки</option>';
    warningOut.textContent = 'Не удалось загрузить data/slabs.json. Проверьте, что страница открыта через веб-сервер (не как локальный файл).';
    warningOut.style.display = 'block';
  });
```

- [ ] **Step 4: Add new result-panel DOM elements**

Replace the `result-panel` div with:

```html
<div class="result-panel">
  <div>
    <div class="result-label">Ориентировочная стоимость</div>
    <div class="result-price" id="priceOut">—</div>
    <div class="warning-box" id="warningOut" style="display:none"></div>
    <div class="result-breakdown" id="breakdown"></div>
    <div class="remainder-line" id="remainderOut"></div>
    <div class="info-block">Стоимость указана за весь слэб — остаток после раскроя бесплатно хранится на складе компании, клиент может использовать его для другого проекта или забрать себе.</div>
  </div>
  <div>
    <button class="cta-btn" id="ctaBtn">Получить точный расчёт</button>
    <div class="disclaimer" id="updatedAtOut"></div>
    <div class="disclaimer">Расчёт ориентировочный. Финальная цена зависит от партии камня, сложности рисунка и логистики.</div>
  </div>
</div>
```

Add these CSS rules to the existing `<style>` block:

```css
.warning-box {
  background: #3a2a12;
  border: 1px solid #ff7a3d;
  color: #ffcfa3;
  padding: 10px 12px;
  border-radius: 3px;
  font-size: 12px;
  line-height: 1.5;
  margin-bottom: 16px;
}
.remainder-line {
  font-size: 12px;
  color: #8fd19e;
  margin-top: -8px;
  margin-bottom: 16px;
}
.info-block {
  font-size: 12px;
  color: #bbb;
  line-height: 1.5;
  margin-bottom: 20px;
}
```

- [ ] **Step 5: Add DOM references and `formatDate` helper**

Near the other `document.getElementById` lines, add:

```js
const warningOut = document.getElementById('warningOut');
const remainderOut = document.getElementById('remainderOut');
const updatedAtOut = document.getElementById('updatedAtOut');
```

Add near `formatRub`:

```js
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU');
}
```

- [ ] **Step 6: Rewrite `calculate()`**

Replace the entire `calculate()` function with:

```js
function calculate() {
  if (!DATA_LOADED) return;

  const width = parseFloat(widthInput.value) || 0;
  const length = parseFloat(lengthInput.value) || 0;

  warningOut.style.display = 'none';
  warningOut.innerHTML = '';
  remainderOut.textContent = '';

  if (width <= 0 || length <= 0) {
    dimError.style.display = 'block';
    priceOut.textContent = '—';
    breakdown.innerHTML = '';
    updatedAtOut.textContent = '';
    return;
  }
  dimError.style.display = 'none';

  const product = PRODUCTS[productSelect.value];
  const stone = STONES_BY_ID[materialSelect.value];

  let multiplier = 1;
  let surchargeLabel = [];
  if (document.getElementById('opt-complex').checked) {
    multiplier += OPTION_SURCHARGE.complex;
    surchargeLabel.push('сложная форма +' + (OPTION_SURCHARGE.complex * 100) + '%');
  }
  if (document.getElementById('opt-polish').checked) {
    multiplier += OPTION_SURCHARGE.polish;
    surchargeLabel.push('полировка +' + (OPTION_SURCHARGE.polish * 100) + '%');
  }
  if (document.getElementById('opt-install').checked) {
    multiplier += OPTION_SURCHARGE.install;
    surchargeLabel.push('монтаж +' + (OPTION_SURCHARGE.install * 100) + '%');
  }
  const optionSurchargeSum = multiplier - 1;

  const result = Pricing.calculatePrice({
    stone,
    widthM: width,
    lengthM: length,
    productType: product.type,
    complexityMultiplier: product.complexityMultiplier,
    optionSurchargeSum,
    marginCm: SAW_MARGIN_CM,
    wasteFactor: AREA_WASTE_FACTOR,
    workMultiplier: WORK_MULTIPLIER
  });

  if (!result.ok) {
    priceOut.textContent = 'Нужно уточнить у менеджера';
    let msg = 'Подходящего слэба нет в наличии — пришлите размеры менеджеру для точного расчёта.';
    if (result.reason === 'no_slabs_for_stone') {
      msg = 'Для этого камня сейчас нет данных о слэбах в наличии.';
    }
    warningOut.textContent = msg;
    warningOut.style.display = 'block';
    breakdown.innerHTML = '';
    updatedAtOut.textContent = '';
    return;
  }

  priceOut.textContent = '≈ ' + formatRub(result.total);

  let html = `Площадь: <span>${(width * length).toFixed(2)} м²</span><br>`;
  html += `Материал: <span>${stone.name}</span><br>`;
  html += `Изделие: <span>${product.label}</span>`;
  if (surchargeLabel.length) {
    html += `<br>Опции: <span>${surchargeLabel.join(', ')}</span>`;
  }
  breakdown.innerHTML = html;

  if (product.type === 'A' && result.remainderM2 !== null) {
    remainderOut.textContent = 'Остаток слэба после раскроя: ' + result.remainderM2.toFixed(2) + ' м²';
  }

  if (result.nSlabs > 1) {
    warningOut.textContent = 'Потребуется ' + result.nSlabs + ' слэба со швом.';
    warningOut.style.display = 'block';
  }

  if (productSelect.value === 'lestnitsa') {
    const note = 'Точный расчёт лестницы требует уточнения количества и размера ступеней у менеджера — цена ориентировочная.';
    warningOut.textContent = warningOut.textContent ? warningOut.textContent + ' ' + note : note;
    warningOut.style.display = 'block';
  }

  updatedAtOut.textContent = 'Расчёт по ценам на ' + formatDate(UPDATED_AT) + ', точная цена подтверждается менеджером.';
}
```

- [ ] **Step 7: Remove the now-invalid trailing `calculate()` call**

At the bottom of the script, there's a bare `calculate();` call left
over from the old synchronous-data version — delete it. `calculate()`
is now first invoked from inside the `fetch(...).then(...)` chain added
in Step 3, once `data/slabs.json` has actually loaded.

- [ ] **Step 8: Commit**

```bash
git add sayanmramor-calculator.html
git commit -m "$(cat <<'EOF'
feat: rework calculator to price real slabs from data/slabs.json

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Manual browser verification

**Files:** none (verification only).

- [ ] **Step 1: Start a local static server**

Run (from `D:\calculator`): `python -m http.server 8000`

(Needed because `fetch('data/slabs.json')` is blocked under `file://`
— this was flagged in the spec's Hosting question and confirmed the
calculator will run on a real web server; a local HTTP server
reproduces that here for testing.)

- [ ] **Step 2: Open the page and verify Type A (single slab) happy path**

Open `http://localhost:8000/sayanmramor-calculator.html`. Select
"Столешница" + "Delicato Brown", width `1`, length `0.6`.
Expected: price shows `≈ 158 019 ₽`, breakdown shows area `0.60 м²`,
remainder line shows `Остаток слэба после раскроя: 4.29 м²`, date
footnote shows today's date formatted as `дд.мм.гггг`, no warning box.

- [ ] **Step 3: Verify Type A no-fit case**

Same material, set width `3`, length `2`.
Expected: price shows "Нужно уточнить у менеджера", warning box shows
the no-fitting-slab message, breakdown is empty.

- [ ] **Step 4: Verify Type B multi-slab warning**

Select "Облицовка стены" + "Delicato Brown", width `5`, length `3`.
Expected: price shows a number (subtotal × formula, not "—"), warning
box shows "Потребуется 4 слэба со швом.", no remainder line shown.

- [ ] **Step 5: Verify лестница disclaimer**

Select "Лестница" + "Delicato Brown", width `1`, length `0.3`.
Expected: warning box includes "Точный расчёт лестницы требует
уточнения количества и размера ступеней у менеджера — цена
ориентировочная."

- [ ] **Step 6: Verify options and material switching**

Toggle "Сложная форма" checkbox on the Type A столешница case from
Step 2 — price should increase (verify against `computeWorkAndTotal`
math by hand: work = 52673 × 2 × 1.0 × 1.25). Switch material to
"White Onyx (тестовые данные)" and confirm the dropdown option appears
and price recalculates using the onyx slab's numbers.

- [ ] **Step 7: No commit for this task**

This task only verifies behavior manually — nothing to commit. If any
step fails, fix the relevant Task 1-7 code, re-run this checklist from
Step 2, and commit the fix with its own message.
