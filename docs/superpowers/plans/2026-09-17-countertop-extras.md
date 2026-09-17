# Countertop Extras (Bortik/Fartuk/Ostrov) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bortik (border, ₽/running-meter), fartuk (backsplash, ₽/m²), and ostrov/poluostrov (island/peninsula, ₽/m²) as independently-priced countertop line items, implementing a decision made during the original pricing brainstorm that never made it into the shipped formula.

**Architecture:** `computeWorkAndTotal`/`calculatePrice` in `pricing.js` gain a fifth, backward-compatible `extraDimensions` parameter (`{bortikLengthM, fartukAreaM2, ostrovAreaM2}`, all defaulting to 0) that adds a new `extras` component to `work`, alongside the existing fabrication/installation/polish/misc. `product-types.js` gains a `COUNTERTOP_EXTRAS_RATES` constant (all fields `null` until real per-item КП data exists) and a `supportsCountertopExtras: true` flag on the two countertop product types. `sayanmramor-calculator.html` shows three new number inputs only for those two product types, defensively zeroing them for every other type.

**Tech Stack:** Plain ES5-style UMD JavaScript modules (no build step, no framework), Node's built-in test runner (`node --test`).

**Spec:** `docs/superpowers/specs/2026-09-17-countertop-extras-design.md`

## Global Constraints

- This is an additive change to `computeWorkAndTotal`/`calculatePrice` — every existing call site and test that doesn't pass `extraDimensions` must keep working unchanged (`extras` defaults to `0`). This also protects the separate `sayanmramor-site` repository, which calls the pre-existing signature and must not break.
- `COUNTERTOP_EXTRAS_RATES` fields must stay `null` (never a guessed number) until real per-item КП data is available — same discipline as `MISC_FLAT_SUM`/`MISC_RATE_PER_M2`. `computeWorkAndTotal` must treat a `null` extras rate as `0`, not `NaN`.
- `supportsCountertopExtras: true` must be set on exactly `stoleshnitsa_kuhnya` and `stoleshnitsa_vannaya`, and on no other `PRODUCTS` entry.
- The UI must never let a value left in the bortik/fartuk/ostrov inputs leak into a calculation for a product type that doesn't support them (e.g. switching from a countertop to "Полы" mid-session).
- Test runner for this repo: `node --test tests/pricing.test.js tests/product-types.test.js tests/pricing-product-types-integration.test.js tests/material-picker.test.js`.

---

## Task 1: `product-types.js` — extras rate table and per-type flag

**Files:**
- Modify: `product-types.js` (the `PRODUCTS` object and the block after `COMPLEX_SHAPE_MULTIPLIER`)
- Test: `tests/product-types.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ProductTypes.COUNTERTOP_EXTRAS_RATES = { bortikRatePerM: null, fartukRatePerM2: null, ostrovRatePerM2: null }`. `ProductTypes.PRODUCTS.stoleshnitsa_kuhnya.supportsCountertopExtras === true` and `ProductTypes.PRODUCTS.stoleshnitsa_vannaya.supportsCountertopExtras === true`; no other `PRODUCTS` entry has this field. This is the exact contract Task 3's HTML wiring reads.

- [ ] **Step 1: Write the failing tests**

Append to `tests/product-types.test.js`:

```js
test('COUNTERTOP_EXTRAS_RATES has exactly the three expected fields, all null until real data is available', () => {
  assert.deepEqual(Object.keys(ProductTypes.COUNTERTOP_EXTRAS_RATES).sort(), ['bortikRatePerM', 'fartukRatePerM2', 'ostrovRatePerM2']);
  assert.equal(ProductTypes.COUNTERTOP_EXTRAS_RATES.bortikRatePerM, null);
  assert.equal(ProductTypes.COUNTERTOP_EXTRAS_RATES.fartukRatePerM2, null);
  assert.equal(ProductTypes.COUNTERTOP_EXTRAS_RATES.ostrovRatePerM2, null);
});

test('supportsCountertopExtras is true on exactly stoleshnitsa_kuhnya and stoleshnitsa_vannaya', () => {
  const flagged = Object.entries(ProductTypes.PRODUCTS)
    .filter(([, product]) => product.supportsCountertopExtras === true)
    .map(([key]) => key)
    .sort();
  assert.deepEqual(flagged, ['stoleshnitsa_kuhnya', 'stoleshnitsa_vannaya']);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/product-types.test.js`
Expected: FAIL — `ProductTypes.COUNTERTOP_EXTRAS_RATES` is `undefined` (`Object.keys(undefined)` throws), and no `PRODUCTS` entry has `supportsCountertopExtras` yet (the second test's `flagged` array would be `[]`, not matching).

- [ ] **Step 3: Add the flag and the rate table**

In `product-types.js`, change the two countertop entries in `PRODUCTS` (currently):

```js
    stoleshnitsa_vannaya: { label: "Столешницы в ванную", type: 'A' },
    // TODO: кухонные столешницы нуждаются в отдельной фильтрации камня по
    // устойчивости к мех./хим. воздействиям (нож, вино и т.д.) — не весь
    // камень из общего каталога годится для кухни. Фильтрации пока нет,
    // добавим отдельным шагом, когда определим критерий классификации камня.
    stoleshnitsa_kuhnya:  { label: "Столешницы на кухню", type: 'A' },
```

to:

```js
    stoleshnitsa_vannaya: { label: "Столешницы в ванную", type: 'A', supportsCountertopExtras: true },
    // TODO: кухонные столешницы нуждаются в отдельной фильтрации камня по
    // устойчивости к мех./хим. воздействиям (нож, вино и т.д.) — не весь
    // камень из общего каталога годится для кухни. Фильтрации пока нет,
    // добавим отдельным шагом, когда определим критерий классификации камня.
    stoleshnitsa_kuhnya:  { label: "Столешницы на кухню", type: 'A', supportsCountertopExtras: true },
```

Then, right after the `COMPLEX_SHAPE_MULTIPLIER` block and before the final `return { ... }` statement, add:

```js
  // Ставки для доп. позиций столешницы (бортик/фартук/остров). Ни один из
  // 7 разобранных КП не даёт эти суммы отдельной строкой от базовой
  // столешницы (в Tundra Grey бортик+остров учтены одной суммой внутри
  // "изготовления" — 135300 ₽ на 5.32 м², что уже превышает ставку
  // столешницы 37500 ₽/м² почти вдвое, если считать всё как одну
  // столешницу). ТРЕБУЕТ ЗАПОЛНЕНИЯ реальными данными, когда появится
  // КП с этими позициями, выделенными отдельно.
  const COUNTERTOP_EXTRAS_RATES = {
    bortikRatePerM: null,
    fartukRatePerM2: null,
    ostrovRatePerM2: null
  };
```

And update the return statement from:

```js
  return {
    PRODUCTS, SAW_MARGIN_CM, AREA_WASTE_FACTOR,
    WORK_RATES, MISC_FLAT_SUM, MISC_RATE_PER_M2, COMPLEX_SHAPE_MULTIPLIER
  };
```

to:

```js
  return {
    PRODUCTS, SAW_MARGIN_CM, AREA_WASTE_FACTOR,
    WORK_RATES, MISC_FLAT_SUM, MISC_RATE_PER_M2, COMPLEX_SHAPE_MULTIPLIER,
    COUNTERTOP_EXTRAS_RATES
  };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/product-types.test.js`
Expected: PASS (9 tests: the 7 pre-existing plus the 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add product-types.js tests/product-types.test.js
git commit -m "feat: add countertop-extras rate table and per-type flag"
```

---

## Task 2: `pricing.js` — `extras` component in the formula

**Files:**
- Modify: `pricing.js` (`computeWorkAndTotal` and `calculatePrice`, currently at lines 165-259)
- Test: `tests/pricing.test.js`

**Interfaces:**
- Consumes: nothing from Task 1 — this task's own tests build their own `rates`/`extraDimensions` fixtures, same pattern as the original work-cost-pricing-redesign plan.
- Produces: `Pricing.computeWorkAndTotal(subtotal, area, rates, options, extraDimensions = {})` where `extraDimensions` is `{ bortikLengthM = 0, fartukAreaM2 = 0, ostrovAreaM2 = 0 }`, returning `{ fabrication, installation, polish, misc, extras, work, total }` (adds `extras` to the existing shape). `Pricing.calculatePrice(params)` gains an optional `extraDimensions` field in `params` (same shape, same defaults), and every returned object (including the `ok: false` `empty` shape) gains an `extras` field. This is the exact contract Task 3's HTML wiring calls into.

- [ ] **Step 1: Write the failing tests**

In `tests/pricing.test.js`, insert these tests right after the existing `'computeWorkAndTotal: all-zero rates leave total equal to subtotal...'` test (the last test before the `test('calculatePrice: invalid dimensions'...)` block):

```js
test('computeWorkAndTotal: backward compatible -- omitting extraDimensions defaults extras to 0', () => {
  const r = Pricing.computeWorkAndTotal(100000, 2, SAMPLE_RATES, NO_OPTIONS);
  assert.equal(r.extras, 0);
  assert.equal(r.work, 69000); // unchanged from the base-case test above
});

test('computeWorkAndTotal: bortik/fartuk/ostrov each contribute independently to extras', () => {
  const ratesWithExtras = Object.assign({}, SAMPLE_RATES, {
    bortikRatePerM: 4000,
    fartukRatePerM2: 12000,
    ostrovRatePerM2: 45000
  });
  const bortikOnly = Pricing.computeWorkAndTotal(100000, 2, ratesWithExtras, NO_OPTIONS, { bortikLengthM: 3 });
  assert.equal(bortikOnly.extras, 12000); // 3 * 4000

  const fartukOnly = Pricing.computeWorkAndTotal(100000, 2, ratesWithExtras, NO_OPTIONS, { fartukAreaM2: 1.5 });
  assert.equal(fartukOnly.extras, 18000); // 1.5 * 12000

  const ostrovOnly = Pricing.computeWorkAndTotal(100000, 2, ratesWithExtras, NO_OPTIONS, { ostrovAreaM2: 2 });
  assert.equal(ostrovOnly.extras, 90000); // 2 * 45000

  const allThree = Pricing.computeWorkAndTotal(100000, 2, ratesWithExtras, NO_OPTIONS, { bortikLengthM: 3, fartukAreaM2: 1.5, ostrovAreaM2: 2 });
  assert.equal(allThree.extras, 12000 + 18000 + 90000);
  assert.equal(allThree.work, allThree.fabrication + allThree.installation + allThree.polish + allThree.misc + allThree.extras);
});

test('computeWorkAndTotal: null bortik/fartuk/ostrov rates (no real data yet) are treated as 0, not NaN', () => {
  const ratesWithoutExtraRates = Object.assign({}, SAMPLE_RATES, {
    bortikRatePerM: null, fartukRatePerM2: null, ostrovRatePerM2: null
  });
  const r = Pricing.computeWorkAndTotal(100000, 2, ratesWithoutExtraRates, NO_OPTIONS, { bortikLengthM: 3, fartukAreaM2: 1.5, ostrovAreaM2: 2 });
  assert.equal(r.extras, 0);
});
```

Append these two tests at the very end of the file (after the existing `'calculatePrice: installEnabled/polishEnabled/complexEnabled default to false when omitted'` test):

```js

test('calculatePrice: extraDimensions flow through to the top-level extras field', () => {
  const ratesWithExtras = Object.assign({}, SAMPLE_RATES, {
    bortikRatePerM: 4000,
    fartukRatePerM2: 12000,
    ostrovRatePerM2: 45000
  });
  const r = Pricing.calculatePrice({
    stone, widthM: 1.0, lengthM: 0.6, productType: 'A',
    rates: ratesWithExtras, extraDimensions: { bortikLengthM: 3, fartukAreaM2: 1.5, ostrovAreaM2: 2 },
    marginCm: 4, wasteFactor: 1.3
  });
  assert.equal(r.ok, true);
  assert.equal(r.extras, 3 * 4000 + 1.5 * 12000 + 2 * 45000);
  assert.equal(r.total, r.subtotal + r.fabrication + r.installation + r.polish + r.misc + r.extras);
});

test('calculatePrice: extraDimensions defaults to zero extras when omitted (backward compatible)', () => {
  const r = Pricing.calculatePrice({ stone, widthM: 1.0, lengthM: 0.6, productType: 'A', rates: SAMPLE_RATES, marginCm: 4, wasteFactor: 1.3 });
  assert.equal(r.extras, 0);
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `node --test --test-name-pattern="extras|extraDimensions" tests/pricing.test.js`
Expected: FAIL — `computeWorkAndTotal`/`calculatePrice` don't accept a 5th argument / `extraDimensions` field yet, so `r.extras` is `undefined`, not the asserted numbers.

- [ ] **Step 3: Extend `computeWorkAndTotal`**

In `pricing.js`, replace the current `computeWorkAndTotal` function:

```js
  function computeWorkAndTotal(subtotal, area, rates, options) {
    const { installEnabled, polishEnabled, complexEnabled } = options;
    const fabricationRate = rates.fabricationRatePerM2 * (complexEnabled ? rates.complexShapeMultiplier : 1);
    const fabrication = fabricationRate * area;
    const installation = installEnabled ? rates.installationRatePerM2 * area : 0;
    const polish = polishEnabled ? rates.polishRatePerM2 * area : 0;
    // miscFlatSum/miscRatePerM2 are `null` in product-types.js until real
    // КП data for "прочее" is available -- treat that as "not charged yet",
    // not NaN.
    const miscFlatSum = rates.miscFlatSum || 0;
    const miscRatePerM2 = rates.miscRatePerM2 || 0;
    const misc = miscFlatSum + miscRatePerM2 * area;
    const work = fabrication + installation + polish + misc;
    const total = subtotal + work;
    return { fabrication, installation, polish, misc, work, total };
  }
```

with:

```js
  function computeWorkAndTotal(subtotal, area, rates, options, extraDimensions = {}) {
    const { installEnabled, polishEnabled, complexEnabled } = options;
    const { bortikLengthM = 0, fartukAreaM2 = 0, ostrovAreaM2 = 0 } = extraDimensions;
    const fabricationRate = rates.fabricationRatePerM2 * (complexEnabled ? rates.complexShapeMultiplier : 1);
    const fabrication = fabricationRate * area;
    const installation = installEnabled ? rates.installationRatePerM2 * area : 0;
    const polish = polishEnabled ? rates.polishRatePerM2 * area : 0;
    // miscFlatSum/miscRatePerM2/bortikRatePerM/fartukRatePerM2/ostrovRatePerM2
    // are `null` in product-types.js until real КП data is available for
    // each -- treat that as "not charged yet", not NaN.
    const miscFlatSum = rates.miscFlatSum || 0;
    const miscRatePerM2 = rates.miscRatePerM2 || 0;
    const misc = miscFlatSum + miscRatePerM2 * area;
    const bortikRatePerM = rates.bortikRatePerM || 0;
    const fartukRatePerM2 = rates.fartukRatePerM2 || 0;
    const ostrovRatePerM2 = rates.ostrovRatePerM2 || 0;
    const extras = bortikLengthM * bortikRatePerM + fartukAreaM2 * fartukRatePerM2 + ostrovAreaM2 * ostrovRatePerM2;
    const work = fabrication + installation + polish + misc + extras;
    const total = subtotal + work;
    return { fabrication, installation, polish, misc, extras, work, total };
  }
```

- [ ] **Step 4: Extend `calculatePrice`**

In `pricing.js`, in the `calculatePrice` function:

Replace the params destructure:

```js
    const {
      stone, widthM, lengthM, productType, marginCm, wasteFactor,
      rates, installEnabled = false, polishEnabled = false, complexEnabled = false,
      allowSeam = true
    } = params;
```

with:

```js
    const {
      stone, widthM, lengthM, productType, marginCm, wasteFactor,
      rates, installEnabled = false, polishEnabled = false, complexEnabled = false,
      extraDimensions = {}, allowSeam = true
    } = params;
```

Replace the `empty` object:

```js
    const empty = {
      subtotal: null, fabrication: null, installation: null, polish: null, misc: null,
      work: null, total: null, nSlabs: 0, remainderM2: null, matchedSlab: null, matchedSlabs: []
    };
```

with:

```js
    const empty = {
      subtotal: null, fabrication: null, installation: null, polish: null, misc: null, extras: null,
      work: null, total: null, nSlabs: 0, remainderM2: null, matchedSlab: null, matchedSlabs: []
    };
```

Then, at each of the three `computeWorkAndTotal(...)` call sites, add `extraDimensions` as the fifth argument and add `extras` to both the destructure and the returned object. All three call sites currently look like one of these two patterns — update each:

```js
        const { fabrication, installation, polish, misc, work, total } = computeWorkAndTotal(subtotal, area, rates, options);
        const remainderM2 = computeRemainderAreaM2(slab, widthM, lengthM);
        return {
          ok: true, reason: null, subtotal, fabrication, installation, polish, misc, work, total,
          nSlabs: 1, remainderM2, matchedSlab: slab, matchedSlabs: [slab]
        };
```
becomes
```js
        const { fabrication, installation, polish, misc, extras, work, total } = computeWorkAndTotal(subtotal, area, rates, options, extraDimensions);
        const remainderM2 = computeRemainderAreaM2(slab, widthM, lengthM);
        return {
          ok: true, reason: null, subtotal, fabrication, installation, polish, misc, extras, work, total,
          nSlabs: 1, remainderM2, matchedSlab: slab, matchedSlabs: [slab]
        };
```

Apply the same two changes (add `extraDimensions` to the `computeWorkAndTotal` call, add `extras` to the destructure and the returned object) at the Type A segmented-result call site and the Type B call site — both currently read `computeWorkAndTotal(segmented.subtotal, area, rates, options)` and `computeWorkAndTotal(typeBResult.subtotal, area, rates, options)` respectively, with their own matching `return { ok: true, ... }` blocks right below.

- [ ] **Step 5: Run the new tests to verify they pass**

Run: `node --test --test-name-pattern="extras|extraDimensions" tests/pricing.test.js`
Expected: PASS (5 tests: 3 `computeWorkAndTotal` + 2 `calculatePrice`)

- [ ] **Step 6: Run the full suite to verify nothing else broke**

Run: `node --test tests/pricing.test.js`
Expected: PASS, all tests (the pre-existing tests never pass `extraDimensions`, so they must still pass unchanged — this is the backward-compatibility guarantee from the Global Constraints section).

- [ ] **Step 7: Commit**

```bash
git add pricing.js tests/pricing.test.js
git commit -m "feat: add extras (bortik/fartuk/ostrov) component to the work-cost formula"
```

---

## Task 3: Wire the new fields into `sayanmramor-calculator.html`

**Files:**
- Modify: `sayanmramor-calculator.html` (markup around lines 549-559, the `ProductTypes` destructure at line 690, the DOM-element consts around lines 707-713, the `product` lookup around line 854, the rates/options block around lines 877-907, and the event-listener wiring around lines 969-975)

**Interfaces:**
- Consumes: `ProductTypes.COUNTERTOP_EXTRAS_RATES`, `PRODUCTS[key].supportsCountertopExtras` (Task 1); `Pricing.calculatePrice`'s new `extraDimensions` param and `extras` return field (Task 2).
- Produces: nothing consumed elsewhere — final leaf of this feature.

There is no automated test harness for this static HTML file (same situation as the original pricing-redesign plan's Task 3). Verify manually as described in Step 6.

- [ ] **Step 1: Add the markup**

In `sayanmramor-calculator.html`, insert this new field block immediately after the closing `</div>` of `<div class="checkboxes">` (currently ends at line 559) and before the closing `</div>` of its parent container (currently line 560):

```html
      <div class="field" id="countertopExtras" style="display:none">
        <label>Дополнительные позиции</label>
        <div class="dims">
          <input type="number" id="extra-bortik" placeholder="Бортик, м.п." min="0" step="0.01">
          <input type="number" id="extra-fartuk" placeholder="Фартук, м²" min="0" step="0.01">
          <input type="number" id="extra-ostrov" placeholder="Остров/полуостров, м²" min="0" step="0.01">
        </div>
      </div>
```

- [ ] **Step 2: Update the `ProductTypes` destructure**

Replace:

```js
  const { SAW_MARGIN_CM, AREA_WASTE_FACTOR, WORK_RATES, MISC_FLAT_SUM, MISC_RATE_PER_M2, COMPLEX_SHAPE_MULTIPLIER } = ProductTypes;
```

with:

```js
  const { SAW_MARGIN_CM, AREA_WASTE_FACTOR, WORK_RATES, MISC_FLAT_SUM, MISC_RATE_PER_M2, COMPLEX_SHAPE_MULTIPLIER, COUNTERTOP_EXTRAS_RATES } = ProductTypes;
```

- [ ] **Step 3: Cache the new DOM elements**

Right after the existing block of `const ... = document.getElementById(...)` declarations (the line declaring `infoBlock`, currently `const infoBlock = document.getElementById('infoBlock');`), add:

```js
  const countertopExtrasField = document.getElementById('countertopExtras');
  const extraBortikInput = document.getElementById('extra-bortik');
  const extraFartukInput = document.getElementById('extra-fartuk');
  const extraOstrovInput = document.getElementById('extra-ostrov');
```

- [ ] **Step 4: Toggle visibility and build `extraDimensions` in `calculate()`**

Right after the line `const product = PRODUCTS[selectedProductKey];` inside `calculate()`, add the visibility toggle:

```js
    const product = PRODUCTS[selectedProductKey];
    countertopExtrasField.style.display = product.supportsCountertopExtras ? '' : 'none';
```

Then, in the block that currently reads:

```js
    const complexEnabled = document.getElementById('opt-complex').checked;
    const polishEnabled = document.getElementById('opt-polish').checked;
    const installEnabled = document.getElementById('opt-install').checked;
    const optionLabels = [];
    if (complexEnabled) optionLabels.push('сложная форма');
    if (polishEnabled) optionLabels.push('полировка');
    if (installEnabled) optionLabels.push('монтаж');

    const productRates = WORK_RATES[selectedProductKey];
    const rates = {
      fabricationRatePerM2: productRates.fabricationRatePerM2,
      installationRatePerM2: productRates.installationRatePerM2,
      polishRatePerM2: productRates.polishRatePerM2,
      miscFlatSum: MISC_FLAT_SUM,
      miscRatePerM2: MISC_RATE_PER_M2,
      complexShapeMultiplier: COMPLEX_SHAPE_MULTIPLIER
    };

    const result = Pricing.calculatePrice({
      stone,
      widthM: width,
      lengthM: length,
      productType: product.type,
      rates,
      installEnabled,
      polishEnabled,
      complexEnabled,
      marginCm: SAW_MARGIN_CM,
      wasteFactor: AREA_WASTE_FACTOR,
      allowSeam: product.allowSeam !== false
    });
```

replace it with:

```js
    const complexEnabled = document.getElementById('opt-complex').checked;
    const polishEnabled = document.getElementById('opt-polish').checked;
    const installEnabled = document.getElementById('opt-install').checked;
    const optionLabels = [];
    if (complexEnabled) optionLabels.push('сложная форма');
    if (polishEnabled) optionLabels.push('полировка');
    if (installEnabled) optionLabels.push('монтаж');

    // Defensive zeroing: a value left in these fields from a previously
    // selected product must never leak into a product type that doesn't
    // support these extras (e.g. switching from a countertop to "Полы").
    let extraDimensions = { bortikLengthM: 0, fartukAreaM2: 0, ostrovAreaM2: 0 };
    if (product.supportsCountertopExtras) {
      const bortikLengthM = parseFloat(extraBortikInput.value) || 0;
      const fartukAreaM2 = parseFloat(extraFartukInput.value) || 0;
      const ostrovAreaM2 = parseFloat(extraOstrovInput.value) || 0;
      extraDimensions = { bortikLengthM, fartukAreaM2, ostrovAreaM2 };
      if (bortikLengthM > 0) optionLabels.push(`бортик: ${bortikLengthM} м.п.`);
      if (fartukAreaM2 > 0) optionLabels.push(`фартук: ${fartukAreaM2} м²`);
      if (ostrovAreaM2 > 0) optionLabels.push(`остров/полуостров: ${ostrovAreaM2} м²`);
    }

    const productRates = WORK_RATES[selectedProductKey];
    const rates = {
      fabricationRatePerM2: productRates.fabricationRatePerM2,
      installationRatePerM2: productRates.installationRatePerM2,
      polishRatePerM2: productRates.polishRatePerM2,
      miscFlatSum: MISC_FLAT_SUM,
      miscRatePerM2: MISC_RATE_PER_M2,
      complexShapeMultiplier: COMPLEX_SHAPE_MULTIPLIER,
      bortikRatePerM: COUNTERTOP_EXTRAS_RATES.bortikRatePerM,
      fartukRatePerM2: COUNTERTOP_EXTRAS_RATES.fartukRatePerM2,
      ostrovRatePerM2: COUNTERTOP_EXTRAS_RATES.ostrovRatePerM2
    };

    const result = Pricing.calculatePrice({
      stone,
      widthM: width,
      lengthM: length,
      productType: product.type,
      rates,
      installEnabled,
      polishEnabled,
      complexEnabled,
      extraDimensions,
      marginCm: SAW_MARGIN_CM,
      wasteFactor: AREA_WASTE_FACTOR,
      allowSeam: product.allowSeam !== false
    });
```

- [ ] **Step 5: Wire recalculation on input**

Right after the existing block:

```js
  document.querySelectorAll('.checkbox-row input').forEach(el => {
    el.addEventListener('change', calculate);
  });
```

add:

```js
  [extraBortikInput, extraFartukInput, extraOstrovInput].forEach(el => {
    el.addEventListener('input', calculate);
  });
```

- [ ] **Step 6: Manual verification in a browser**

Open `sayanmramor-calculator.html` in a browser (a static file server such as `python -m http.server` works, since the page also fetches `data/slabs.json`).

Check:
1. Select a product type that is NOT a countertop (e.g. "Полы") — the "Дополнительные позиции" field must stay hidden.
2. Switch to "Столешницы на кухню" — the field must appear, with three empty number inputs.
3. Enter a stone, width/length, and a value in "Бортик, м.п." (e.g. `3`) — since `COUNTERTOP_EXTRAS_RATES.bortikRatePerM` is `null` (Task 1), the total price must NOT change (extras contributes 0 until a real rate exists), but the "Опции:" line under the price must show "бортик: 3 м.п." so the entered value is visibly acknowledged.
4. With a countertop-extra value entered, switch the product type to "Полы" and back to "Столешницы на кухню" — confirm the price calculation for "Полы" never included the leftover bortik/fartuk/ostrov values (no crash, no unexpected price bump) per the defensive-zeroing requirement.
5. Confirm no JS console errors appear at any point in the above.

- [ ] **Step 7: Commit**

```bash
git add sayanmramor-calculator.html
git commit -m "feat: add countertop extras (bortik/fartuk/ostrov) inputs to the calculator UI"
```

---

## Post-merge note (informational, no action required by this plan)

`COUNTERTOP_EXTRAS_RATES` ships with all three rates `null`, so this feature is inert in production (extras always contribute `0`) until real per-item rate data is filled in — consistent with how `MISC_FLAT_SUM`/`MISC_RATE_PER_M2` already work. No further action is needed for this plan to be complete; filling in real rates is a future, separate change once a "clean" quote with these items broken out becomes available.
