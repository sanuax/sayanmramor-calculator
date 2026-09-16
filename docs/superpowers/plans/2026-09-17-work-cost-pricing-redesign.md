# Work-Cost Pricing Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `subtotal × workMultiplier × complexityMultiplier × (1 + options%)` pricing formula with an additive, per-m² component formula (fabrication + installation + polish + misc) whose rates are grounded in real commercial quotes, and wire the new formula through `pricing.js`, `product-types.js`, and `sayanmramor-calculator.html`.

**Architecture:** `pricing.js` keeps its existing slab-selection logic untouched (`findBestTypeASlab`, `computeTypeBResult`, `minCostCover`, `findTypeASegmentedResult`) and only replaces what happens *after* a `subtotal` is known: `computeWorkAndTotal` becomes a per-component calculation driven by a `rates` object and three boolean option flags, and `calculatePrice` threads `widthM × lengthM` through as `area`. `product-types.js` replaces its old multiplier constants with a `WORK_RATES` table (one entry per product type, each rate commented as real-data-derived or estimated) plus two misc-cost constants and one shape-complexity multiplier.

**Tech Stack:** Plain ES5-style UMD JavaScript modules (no build step, no framework), Node's built-in test runner (`node --test`).

**Spec:** `docs/superpowers/specs/2026-09-17-work-cost-pricing-redesign-design.md`

## Global Constraints

- Slab-selection/geometry logic (`findBestTypeASlab`, `computeTypeBResult`, `minCostCover`, `findTypeASegmentedResult`, `hasValidPrice`, `computeRemainderAreaM2`, `slabCapacityForCross`) must not change in this plan — only what happens to `subtotal` after it is computed.
- `MISC_FLAT_SUM` and `MISC_RATE_PER_M2` must stay `null` (never a guessed number) until real figures are available from further КП analysis — `computeWorkAndTotal` must treat a `null` misc rate as `0`, not `NaN`.
- Test runner for this repo: `node --test tests/pricing.test.js` (add `tests/product-types.test.js` to the invocation once Task 1 creates it).
- `pricing.js` is also consumed by `sayanmramor-site`, a catalog site skeleton that lives in a **separate repository** and already calls `Pricing.calculatePrice` with the *old* signature. This plan cannot touch that repository — Task 3 ends with a manual post-merge reminder instead of a code task.

---

## Task 1: `product-types.js` — replace multiplier constants with a per-type rate table

**Files:**
- Modify: `product-types.js` (whole file)
- Test: `tests/product-types.test.js` (new file)

**Interfaces:**
- Produces: `ProductTypes.WORK_RATES` — object keyed by product type, each value `{ fabricationRatePerM2: number, installationRatePerM2: number, polishRatePerM2: number }`. `ProductTypes.MISC_FLAT_SUM: null`, `ProductTypes.MISC_RATE_PER_M2: null`, `ProductTypes.COMPLEX_SHAPE_MULTIPLIER: number`. `ProductTypes.PRODUCTS[type]` entries no longer have a `complexityMultiplier` field. `ProductTypes.WORK_MULTIPLIER`, `ProductTypes.HARDNESS_WORK_MULTIPLIER`, `ProductTypes.OPTION_SURCHARGE` no longer exist.
- Consumes: nothing (pure data module).

- [ ] **Step 1: Write the failing smoke test**

Create `tests/product-types.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const ProductTypes = require('../product-types.js');

test('WORK_RATES has an entry for every product type in PRODUCTS', () => {
  const productKeys = Object.keys(ProductTypes.PRODUCTS);
  const rateKeys = Object.keys(ProductTypes.WORK_RATES);
  assert.deepEqual(rateKeys.sort(), productKeys.sort());
});

test('every WORK_RATES entry has positive numeric fabrication/installation/polish rates', () => {
  for (const [type, rates] of Object.entries(ProductTypes.WORK_RATES)) {
    assert.equal(typeof rates.fabricationRatePerM2, 'number', `${type}.fabricationRatePerM2`);
    assert.equal(typeof rates.installationRatePerM2, 'number', `${type}.installationRatePerM2`);
    assert.equal(typeof rates.polishRatePerM2, 'number', `${type}.polishRatePerM2`);
    assert.ok(rates.fabricationRatePerM2 > 0, `${type}.fabricationRatePerM2 > 0`);
  }
});

test('MISC_FLAT_SUM and MISC_RATE_PER_M2 are explicitly null until real data is available', () => {
  assert.equal(ProductTypes.MISC_FLAT_SUM, null);
  assert.equal(ProductTypes.MISC_RATE_PER_M2, null);
});

test('COMPLEX_SHAPE_MULTIPLIER is a number greater than 1', () => {
  assert.equal(typeof ProductTypes.COMPLEX_SHAPE_MULTIPLIER, 'number');
  assert.ok(ProductTypes.COMPLEX_SHAPE_MULTIPLIER > 1);
});

test('PRODUCTS entries no longer carry a complexityMultiplier field', () => {
  for (const product of Object.values(ProductTypes.PRODUCTS)) {
    assert.equal(product.complexityMultiplier, undefined);
  }
});

test('the old multiplier-based constants are removed', () => {
  assert.equal(ProductTypes.WORK_MULTIPLIER, undefined);
  assert.equal(ProductTypes.HARDNESS_WORK_MULTIPLIER, undefined);
  assert.equal(ProductTypes.OPTION_SURCHARGE, undefined);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/product-types.test.js`
Expected: FAIL — `ProductTypes.WORK_RATES` is `undefined` (current `product-types.js` doesn't export it), so `Object.keys(ProductTypes.WORK_RATES)` throws a `TypeError`.

- [ ] **Step 3: Rewrite `product-types.js`**

Replace the entire file content with:

```js
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.ProductTypes = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  const PRODUCTS = {
    lestnitsa:            { label: "Лестницы", type: 'B' },
    panno:                { label: "Панно", type: 'B' },
    podokonnik:           { label: "Подоконники", type: 'A' },
    pol:                  { label: "Полы", type: 'B' },
    stena:                { label: "Стены", type: 'B' },
    fasad:                { label: "Фасады", type: 'B' },
    stoleshnitsa_vannaya: { label: "Столешницы в ванную", type: 'A' },
    // TODO: кухонные столешницы нуждаются в отдельной фильтрации камня по
    // устойчивости к мех./хим. воздействиям (нож, вино и т.д.) — не весь
    // камень из общего каталога годится для кухни. Фильтрации пока нет,
    // добавим отдельным шагом, когда определим критерий классификации камня.
    stoleshnitsa_kuhnya:  { label: "Столешницы на кухню", type: 'A' },
    stupeni:              { label: "Ступени", type: 'A' }
  };

  const SAW_MARGIN_CM = 4;       // запас на распил с каждого края
  const AREA_WASTE_FACTOR = 1.3; // на подрезку/подгонку швов и брак (тип B)

  // Ставки работы ₽/м², заменяют старую формулу
  // subtotal × WORK_MULTIPLIER × HARDNESS_WORK_MULTIPLIER × complexityMultiplier.
  // Разбор 11 реальных коммерческих предложений показал, что изготовление и
  // монтаж в компании считаются как фиксированная ставка за м² (почти не
  // зависящая от цены камня), а не как множитель на стоимость камня — см.
  // docs/superpowers/specs/2026-09-17-work-cost-pricing-redesign-design.md.
  //
  // Каждая запись помечена источником:
  //   РЕАЛЬНОЕ  — взято непосредственно из разобранного КП.
  //   ОЦЕНКА    — прямых данных нет; посчитано как соответствующая ставка
  //               столешницы × прежний complexityMultiplier этого типа
  //               (значение множителя сохранено в комментарии для
  //               прослеживаемости). Уточнить, когда появятся реальные
  //               заказы по этому типу изделия.
  const WORK_RATES = {
    // РЕАЛЬНЫЕ КП (7 шт.): диапазон изготовления 30 000-65 000 ₽/м² в
    // зависимости от камня и сложности выреза — единой зависимости от
    // hardness_category не найдено (травертин, category 1, дал одну из
    // самых высоких ставок из-за пор в камне, а не из-за твёрдости).
    // По решению пользователя взято усреднённое значение без разбивки по
    // материалу. ТРЕБУЕТ УТОЧНЕНИЯ при разборе оставшихся 3-4 КП.
    stoleshnitsa_kuhnya:  { fabricationRatePerM2: 37500, installationRatePerM2: 17500, polishRatePerM2: 18000 /* ОЦЕНКА: нет своих данных по полировке столешниц, взята ставка пола/стен */ },
    stoleshnitsa_vannaya: { fabricationRatePerM2: 37500, installationRatePerM2: 17500, polishRatePerM2: 18000 /* тот же источник и та же оговорка */ },

    // РЕАЛЬНОЕ: обычный пол без герба, из КП «панно-герб».
    pol: { fabricationRatePerM2: 3600, installationRatePerM2: 9600, polishRatePerM2: 18000 },

    // ЧАСТИЧНО РЕАЛЬНОЕ: санузел. installationRatePerM2/polishRatePerM2 —
    // из КП (там была одна позиция монтаж+переполировка = 45000, разложена
    // на 25000/20000). fabricationRatePerM2 — ОЦЕНКА: 37500 × 1.1 (прежний
    // complexityMultiplier типа "stena"); в КП изготовление стен санузла
    // шло одной общей позицией без отдельной разбивки.
    stena: { fabricationRatePerM2: 41250, installationRatePerM2: 25000, polishRatePerM2: 20000 },

    // ОЦЕНКА целиком: 37500/17500/18000 × 1.6 (прежний complexityMultiplier
    // типа "panno"). Реальный КП по панно есть, но это крайний случай —
    // гидроабразивная резка герба, 510 000 ₽/м² — НЕ берём как типовую
    // ставку, это пример верхней границы сложности, не рабочее число:
    // panno_extreme_example_rub_per_m2 = 510000 (герб, гидроабразивная резка)
    panno: { fabricationRatePerM2: 60000, installationRatePerM2: 28000, polishRatePerM2: 28800 },

    // ОЦЕНКИ целиком, данных нет вообще — соответствующая ставка столешницы
    // × прежний complexityMultiplier каждого типа.
    lestnitsa:  { fabricationRatePerM2: 67500, installationRatePerM2: 31500, polishRatePerM2: 32400 }, // × 1.8
    fasad:      { fabricationRatePerM2: 48750, installationRatePerM2: 22750, polishRatePerM2: 23400 }, // × 1.3
    stupeni:    { fabricationRatePerM2: 52500, installationRatePerM2: 24500, polishRatePerM2: 25200 }, // × 1.4
    podokonnik: { fabricationRatePerM2: 30000, installationRatePerM2: 14000, polishRatePerM2: 14400 }  // × 0.8
  };

  // "Прочее" (замер/доставка/расходники/разгрузка) — ни один из 7
  // разобранных КП не даёт эти суммы отдельно от камня и работы. Известно
  // только, что "прочее" — 15-25% от суммы КП и что оно неоднородно
  // (замер и один рейс доставки — фиксированная часть; расходники и
  // разгрузка — растущая с площадью часть). Осознанно оставлено `null`, а
  // не подставлено случайным числом на глаз — `computeWorkAndTotal`
  // трактует `null` как 0, то есть "прочее" пока честно не учитывается в
  // цене. ТРЕБУЕТ ЗАПОЛНЕНИЯ, когда появятся построчные данные.
  const MISC_FLAT_SUM = null;
  const MISC_RATE_PER_M2 = null;

  // ОЦЕНКА по одному наблюдению: остров с вырезом под мойку/варочную
  // панель дал 35 000 → 95 000 ₽/м² изготовление (≈×2.7), но это самый
  // сложный из виденных случаев, а не типичная "сложная форма". Берём
  // более умеренную оценку до появления второго наблюдения.
  const COMPLEX_SHAPE_MULTIPLIER = 1.5;

  return {
    PRODUCTS, SAW_MARGIN_CM, AREA_WASTE_FACTOR,
    WORK_RATES, MISC_FLAT_SUM, MISC_RATE_PER_M2, COMPLEX_SHAPE_MULTIPLIER
  };
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/product-types.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add product-types.js tests/product-types.test.js
git commit -m "feat: replace pricing multipliers with per-type work-cost rate table"
```

---

## Task 2: `pricing.js` — additive per-component work formula

**Files:**
- Modify: `pricing.js:165-239` (`computeWorkAndTotal` and `calculatePrice`)
- Test: `tests/pricing.test.js`

**Interfaces:**
- Consumes: nothing from Task 1 directly — this task's tests build their own `rates`/`options` fixtures so it can be implemented and verified independently of `product-types.js`.
- Produces: `Pricing.computeWorkAndTotal(subtotal: number, area: number, rates: { fabricationRatePerM2, installationRatePerM2, polishRatePerM2, miscFlatSum, miscRatePerM2, complexShapeMultiplier }, options: { installEnabled, polishEnabled, complexEnabled }) -> { fabrication, installation, polish, misc, work, total }`. `Pricing.calculatePrice(params)` where `params` is `{ stone, widthM, lengthM, productType, marginCm, wasteFactor, rates, installEnabled = false, polishEnabled = false, complexEnabled = false, allowSeam = true }`, returning the existing result shape plus `fabrication`/`installation`/`polish`/`misc`. This is the exact contract `sayanmramor-calculator.html` will be wired to in Task 3, and the exact contract the separate `sayanmramor-site` repository must be updated to match (see the Global Constraints note and Task 3's follow-up).

- [ ] **Step 1: Write failing tests for the new `computeWorkAndTotal`**

In `tests/pricing.test.js`, replace the two existing `computeWorkAndTotal` tests (currently at lines 63-74: `'computeWorkAndTotal matches spec-verified example...'` and `'computeWorkAndTotal compounds complexity and options'`) with:

```js
const SAMPLE_RATES = {
  fabricationRatePerM2: 30000,
  installationRatePerM2: 15000,
  polishRatePerM2: 10000,
  miscFlatSum: 5000,
  miscRatePerM2: 2000,
  complexShapeMultiplier: 1.5,
};
const ZERO_RATES = { fabricationRatePerM2: 0, installationRatePerM2: 0, polishRatePerM2: 0, miscFlatSum: 0, miscRatePerM2: 0, complexShapeMultiplier: 1 };
const NO_OPTIONS = { installEnabled: false, polishEnabled: false, complexEnabled: false };

test('computeWorkAndTotal: base case, no options -- work is fabrication plus misc only', () => {
  // area=2: fabrication=30000*2=60000, misc=5000+2000*2=9000, install/polish off
  const r = Pricing.computeWorkAndTotal(100000, 2, SAMPLE_RATES, NO_OPTIONS);
  assert.equal(r.fabrication, 60000);
  assert.equal(r.installation, 0);
  assert.equal(r.polish, 0);
  assert.equal(r.misc, 9000);
  assert.equal(r.work, 69000);
  assert.equal(r.total, 169000);
});

test('computeWorkAndTotal: complexEnabled scales fabrication only, not installation/polish/misc', () => {
  const r = Pricing.computeWorkAndTotal(100000, 2, SAMPLE_RATES, { installEnabled: true, polishEnabled: true, complexEnabled: true });
  // fabrication=30000*1.5*2=90000, installation=15000*2=30000, polish=10000*2=20000, misc=9000
  assert.equal(r.fabrication, 90000);
  assert.equal(r.installation, 30000);
  assert.equal(r.polish, 20000);
  assert.equal(r.misc, 9000);
  assert.equal(r.work, 90000 + 30000 + 20000 + 9000);
  assert.equal(r.total, 100000 + r.work);
});

test('computeWorkAndTotal: installEnabled and polishEnabled toggle independently', () => {
  const installOnly = Pricing.computeWorkAndTotal(100000, 2, SAMPLE_RATES, { installEnabled: true, polishEnabled: false, complexEnabled: false });
  assert.equal(installOnly.installation, 30000);
  assert.equal(installOnly.polish, 0);

  const polishOnly = Pricing.computeWorkAndTotal(100000, 2, SAMPLE_RATES, { installEnabled: false, polishEnabled: true, complexEnabled: false });
  assert.equal(polishOnly.installation, 0);
  assert.equal(polishOnly.polish, 20000);
});

test('computeWorkAndTotal: null miscFlatSum/miscRatePerM2 (no real data yet) are treated as 0, not NaN', () => {
  const ratesWithoutMisc = { fabricationRatePerM2: 0, installationRatePerM2: 0, polishRatePerM2: 0, miscFlatSum: null, miscRatePerM2: null, complexShapeMultiplier: 1 };
  const r = Pricing.computeWorkAndTotal(100000, 2, ratesWithoutMisc, NO_OPTIONS);
  assert.equal(r.misc, 0);
  assert.equal(r.work, 0);
  assert.equal(r.total, 100000);
});

test('computeWorkAndTotal: all-zero rates leave total equal to subtotal (isolates geometry tests from the pricing formula)', () => {
  const r = Pricing.computeWorkAndTotal(52673, 0.6, ZERO_RATES, NO_OPTIONS);
  assert.equal(r.work, 0);
  assert.equal(r.total, 52673);
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `node --test --test-name-pattern="computeWorkAndTotal" tests/pricing.test.js`
Expected: FAIL — the current `computeWorkAndTotal(subtotal, workMultiplier, complexityMultiplier, optionSurchargeSum)` reads `SAMPLE_RATES`/`NO_OPTIONS` positionally as numbers, producing `NaN`, not the asserted values.

- [ ] **Step 3: Rewrite `computeWorkAndTotal`**

In `pricing.js`, replace lines 165-169:

```js
  function computeWorkAndTotal(subtotal, workMultiplier, complexityMultiplier, optionSurchargeSum) {
    const work = subtotal * workMultiplier * complexityMultiplier * (1 + optionSurchargeSum);
    const total = subtotal + work;
    return { work, total };
  }
```

with:

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
    const miscFlatSum = rates.miscFlatSum ?? 0;
    const miscRatePerM2 = rates.miscRatePerM2 ?? 0;
    const misc = miscFlatSum + miscRatePerM2 * area;
    const work = fabrication + installation + polish + misc;
    const total = subtotal + work;
    return { fabrication, installation, polish, misc, work, total };
  }
```

- [ ] **Step 4: Run the `computeWorkAndTotal` tests to verify they pass**

Run: `node --test --test-name-pattern="computeWorkAndTotal" tests/pricing.test.js`
Expected: PASS (5 tests). The rest of the suite is still failing/broken at this point because `calculatePrice` hasn't been updated yet — that's expected and fixed in the next steps.

- [ ] **Step 5: Rewrite `calculatePrice`**

In `pricing.js`, replace the whole `calculatePrice` function (lines 171-239) with:

```js
  function calculatePrice(params) {
    const {
      stone, widthM, lengthM, productType, marginCm, wasteFactor,
      rates, installEnabled = false, polishEnabled = false, complexEnabled = false,
      allowSeam = true
    } = params;

    const empty = {
      subtotal: null, fabrication: null, installation: null, polish: null, misc: null,
      work: null, total: null, nSlabs: 0, remainderM2: null, matchedSlab: null, matchedSlabs: []
    };

    if (!(widthM > 0) || !(lengthM > 0)) {
      return Object.assign({ ok: false, reason: 'invalid_dimensions' }, empty);
    }
    if (!stone || !stone.slabs || stone.slabs.length === 0) {
      return Object.assign({ ok: false, reason: 'no_slabs_for_stone' }, empty);
    }
    // Distinct from 'no_slabs_for_stone': slabs exist (so stock is real) but
    // none of them have a usable total price -- without this check the
    // request would fall through to the geometry-fit paths below, which
    // (now that they skip priceless slabs) would report 'no_fitting_slab'
    // and wrongly blame the product's dimensions instead of missing price data.
    if (!stone.slabs.some(hasValidPrice)) {
      return Object.assign({ ok: false, reason: 'no_priced_slab' }, empty);
    }

    const area = widthM * lengthM;
    const options = { installEnabled, polishEnabled, complexEnabled };

    if (productType === 'A') {
      const slab = findBestTypeASlab(stone.slabs, widthM, lengthM, marginCm);
      if (slab) {
        const subtotal = slab.price_total_rub;
        const { fabrication, installation, polish, misc, work, total } = computeWorkAndTotal(subtotal, area, rates, options);
        const remainderM2 = computeRemainderAreaM2(slab, widthM, lengthM);
        return {
          ok: true, reason: null, subtotal, fabrication, installation, polish, misc, work, total,
          nSlabs: 1, remainderM2, matchedSlab: slab, matchedSlabs: [slab]
        };
      }

      // Some Type A products (e.g. decorative panels) look wrong with a seam,
      // so they skip the segmented fallback entirely and go straight to
      // "ask a manager" when they don't fit a single slab.
      if (!allowSeam) {
        return Object.assign({ ok: false, reason: 'no_fitting_slab' }, empty);
      }

      const segmented = findTypeASegmentedResult(stone.slabs, widthM, lengthM, marginCm);
      if (!segmented) {
        return Object.assign({ ok: false, reason: 'no_fitting_slab' }, empty);
      }
      if (segmented.subtotal === null) {
        return Object.assign({ ok: false, reason: 'insufficient_stock' }, empty);
      }
      const { fabrication, installation, polish, misc, work, total } = computeWorkAndTotal(segmented.subtotal, area, rates, options);
      return {
        ok: true, reason: null, subtotal: segmented.subtotal, fabrication, installation, polish, misc, work, total,
        nSlabs: segmented.slabs.length, remainderM2: null,
        matchedSlab: segmented.slabs[0], matchedSlabs: segmented.slabs
      };
    }

    const typeBResult = computeTypeBResult(stone.slabs, widthM, lengthM, wasteFactor);
    if (!typeBResult) {
      return Object.assign({ ok: false, reason: 'no_slabs_for_stone' }, empty);
    }
    if (typeBResult.subtotal === null) {
      return Object.assign({ ok: false, reason: 'insufficient_stock' }, empty);
    }
    const { fabrication, installation, polish, misc, work, total } = computeWorkAndTotal(typeBResult.subtotal, area, rates, options);
    return {
      ok: true, reason: null, subtotal: typeBResult.subtotal, fabrication, installation, polish, misc, work, total,
      nSlabs: typeBResult.slabs.length, remainderM2: null,
      matchedSlab: typeBResult.slabs[0], matchedSlabs: typeBResult.slabs
    };
  }
```

- [ ] **Step 6: Migrate every existing `calculatePrice` test call to the new signature**

Replace lines 78-116 (from `test('calculatePrice: invalid dimensions'...)` through `test('calculatePrice: type A allowSeam defaults to true when omitted'...)`) with:

```js
test('calculatePrice: invalid dimensions', () => {
  const r = Pricing.calculatePrice({ stone, widthM: 0, lengthM: 1, productType: 'A', rates: ZERO_RATES, ...NO_OPTIONS, marginCm: 4, wasteFactor: 1.3 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'invalid_dimensions');
});

test('calculatePrice: no stone selected / no slabs', () => {
  const r = Pricing.calculatePrice({ stone: { name: 'X', slabs: [] }, widthM: 1, lengthM: 1, productType: 'A', rates: ZERO_RATES, ...NO_OPTIONS, marginCm: 4, wasteFactor: 1.3 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_slabs_for_stone');
});

test('calculatePrice: type A no fitting slab even with a seam (cross dimension exceeds every slab side)', () => {
  // 3x3 needs a 308cm cross dimension in every orientation, but the largest
  // slab side in the fixture is 283cm -- no amount of splitting along one
  // axis can fit a 308cm cross-section, so this must fall back to "ask a manager".
  const r = Pricing.calculatePrice({ stone, widthM: 3, lengthM: 3, productType: 'A', rates: ZERO_RATES, ...NO_OPTIONS, marginCm: 4, wasteFactor: 1.3 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_fitting_slab');
});

test('calculatePrice: type A with allowSeam:false skips the segmented fallback (panels look wrong with a seam)', () => {
  const plentySlabs = [].concat(slabs, slabs, slabs, slabs, slabs);
  const r = Pricing.calculatePrice({
    stone: { name: 'X', slabs: plentySlabs }, widthM: 5, lengthM: 0.6, productType: 'A',
    rates: ZERO_RATES, ...NO_OPTIONS, marginCm: 4, wasteFactor: 1.3,
    allowSeam: false
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_fitting_slab');
});

test('calculatePrice: type A allowSeam defaults to true when omitted', () => {
  const r = Pricing.calculatePrice({ stone, widthM: 1.0, lengthM: 0.6, productType: 'A', rates: ZERO_RATES, ...NO_OPTIONS, marginCm: 4, wasteFactor: 1.3 });
  assert.equal(r.ok, true);
});
```

Replace lines 151-220 (from `test('calculatePrice: type A happy path matches spec-verified numbers'...)` through `test('calculatePrice: type B reports insufficient_stock without guessing a slab count'...)`, which also contains the `const plentySlabs = ...` declaration used by the seam-scenario tests) with:

```js
test('calculatePrice: type A happy path, zero rates -- total equals subtotal (the formula itself is tested in the computeWorkAndTotal tests above)', () => {
  const r = Pricing.calculatePrice({ stone, widthM: 1.0, lengthM: 0.6, productType: 'A', rates: ZERO_RATES, ...NO_OPTIONS, marginCm: 4, wasteFactor: 1.3 });
  assert.equal(r.ok, true);
  assert.equal(r.matchedSlab.article, 'P0444194');
  assert.equal(r.subtotal, 52673);
  assert.equal(r.total, 52673);
  assert.equal(r.nSlabs, 1);
  assert.ok(Math.abs(r.remainderM2 - 4.2852) < 0.0001);
});

const plentySlabs = [].concat(slabs, slabs, slabs, slabs, slabs); // 15 slabs, enough stock for seam scenarios

test('calculatePrice: type A, 10x0.6 countertop needs a seam (far too long for one slab)', () => {
  // need_l=1008cm, cross=68cm -> best capacity per slab is floor(276/68)*177=708
  // (see slabCapacityForCross test above): ceil(1008/708) = 2 slabs, not 4 --
  // a slab yields more than one strip, so segments-per-slab must be counted.
  const r = Pricing.calculatePrice({ stone: { name: 'X', slabs: plentySlabs }, widthM: 10, lengthM: 0.6, productType: 'A', rates: ZERO_RATES, ...NO_OPTIONS, marginCm: 4, wasteFactor: 1.3 });
  assert.equal(r.ok, true);
  assert.equal(r.nSlabs, 2);
  assert.equal(r.subtotal, 2 * 52673);
  assert.equal(r.remainderM2, null);
});

test('calculatePrice: type A, 5x0.6 countertop fits a single slab cut into two pieces (area alone would be misleading)', () => {
  const r = Pricing.calculatePrice({ stone: { name: 'X', slabs: plentySlabs }, widthM: 5, lengthM: 0.6, productType: 'A', rates: ZERO_RATES, ...NO_OPTIONS, marginCm: 4, wasteFactor: 1.3 });
  assert.equal(r.ok, true);
  assert.equal(r.nSlabs, 1);
  assert.equal(r.subtotal, 52673);
  assert.equal(r.remainderM2, null);
});

test('calculatePrice: type A, 2x1.5 countertop still fits a single slab (no seam)', () => {
  const r = Pricing.calculatePrice({ stone, widthM: 2, lengthM: 1.5, productType: 'A', rates: ZERO_RATES, ...NO_OPTIONS, marginCm: 4, wasteFactor: 1.3 });
  assert.equal(r.ok, true);
  assert.equal(r.nSlabs, 1);
  assert.equal(r.matchedSlab.article, 'P0444194');
  assert.equal(r.subtotal, 52673);
  assert.ok(r.remainderM2 > 0);
});

test('calculatePrice: type B happy path uses the real combined cost of the distinct slabs actually needed', () => {
  const r = Pricing.calculatePrice({ stone, widthM: 3, lengthM: 3, productType: 'B', rates: ZERO_RATES, ...NO_OPTIONS, marginCm: 4, wasteFactor: 1.3 });
  assert.equal(r.ok, true);
  assert.equal(r.nSlabs, 3);
  assert.equal(r.subtotal, 52673 + 57021 + 58589);
  assert.equal(r.remainderM2, null);
  assert.equal(r.matchedSlabs.length, 3);
  assert.equal(r.matchedSlab, r.matchedSlabs[0]);
});

test('calculatePrice: type B reports insufficient_stock without guessing a slab count', () => {
  const r = Pricing.calculatePrice({ stone, widthM: 5, lengthM: 3, productType: 'B', rates: ZERO_RATES, ...NO_OPTIONS, marginCm: 4, wasteFactor: 1.3 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'insufficient_stock');
  assert.equal(r.total, null);
});
```

Replace lines 361-379 (the two final `nullPricedSlabs`-based `calculatePrice` tests) with:

```js
test('calculatePrice: stone with slabs but none priced reports a distinct "no price data" reason, not ≈0 ₽', () => {
  const r = Pricing.calculatePrice({
    stone: { name: 'Black Mirror', slabs: nullPricedSlabs }, widthM: 3.5, lengthM: 0.7, productType: 'A',
    rates: ZERO_RATES, ...NO_OPTIONS, marginCm: 4, wasteFactor: 1.3
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_priced_slab');
  assert.equal(r.total, null);
});

test('calculatePrice: type B stone with slabs but none priced reports "no price data", not ≈0 ₽', () => {
  const r = Pricing.calculatePrice({
    stone: { name: 'Black Mirror', slabs: nullPricedSlabs }, widthM: 1, lengthM: 1, productType: 'B',
    rates: ZERO_RATES, ...NO_OPTIONS, marginCm: 4, wasteFactor: 1.3
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_priced_slab');
  assert.equal(r.total, null);
});
```

- [ ] **Step 7: Run the full suite to verify everything passes**

Run: `node --test tests/pricing.test.js`
Expected: PASS, all tests (no failures, no `TypeError`).

- [ ] **Step 8: Add end-to-end tests for `rates`/option flags flowing through `calculatePrice`**

Append to `tests/pricing.test.js`:

```js
test('calculatePrice: rates and option flags flow through to the top-level result', () => {
  const r = Pricing.calculatePrice({
    stone, widthM: 1.0, lengthM: 0.6, productType: 'A',
    rates: SAMPLE_RATES, installEnabled: true, polishEnabled: true, complexEnabled: true,
    marginCm: 4, wasteFactor: 1.3
  });
  assert.equal(r.ok, true);
  assert.equal(r.subtotal, 52673);
  const area = 1.0 * 0.6;
  const fabrication = SAMPLE_RATES.fabricationRatePerM2 * SAMPLE_RATES.complexShapeMultiplier * area;
  const installation = SAMPLE_RATES.installationRatePerM2 * area;
  const polish = SAMPLE_RATES.polishRatePerM2 * area;
  const misc = SAMPLE_RATES.miscFlatSum + SAMPLE_RATES.miscRatePerM2 * area;
  assert.ok(Math.abs(r.fabrication - fabrication) < 0.001);
  assert.ok(Math.abs(r.installation - installation) < 0.001);
  assert.ok(Math.abs(r.polish - polish) < 0.001);
  assert.ok(Math.abs(r.misc - misc) < 0.001);
  assert.ok(Math.abs(r.total - (r.subtotal + fabrication + installation + polish + misc)) < 0.001);
});

test('calculatePrice: installEnabled/polishEnabled/complexEnabled default to false when omitted', () => {
  const r = Pricing.calculatePrice({ stone, widthM: 1.0, lengthM: 0.6, productType: 'A', rates: SAMPLE_RATES, marginCm: 4, wasteFactor: 1.3 });
  assert.equal(r.installation, 0);
  assert.equal(r.polish, 0);
  assert.equal(r.fabrication, SAMPLE_RATES.fabricationRatePerM2 * (1.0 * 0.6));
});
```

- [ ] **Step 9: Run the full suite once more**

Run: `node --test tests/pricing.test.js`
Expected: PASS, all tests.

- [ ] **Step 10: Commit**

```bash
git add pricing.js tests/pricing.test.js
git commit -m "feat: rework computeWorkAndTotal/calculatePrice into a per-component work-cost formula"
```

---

## Task 3: Wire the new formula into `sayanmramor-calculator.html`

**Files:**
- Modify: `sayanmramor-calculator.html:690` (destructure) and `sayanmramor-calculator.html:877-904` (option handling + `Pricing.calculatePrice` call)

**Interfaces:**
- Consumes: `ProductTypes.WORK_RATES`, `ProductTypes.MISC_FLAT_SUM`, `ProductTypes.MISC_RATE_PER_M2`, `ProductTypes.COMPLEX_SHAPE_MULTIPLIER` (Task 1); `Pricing.calculatePrice`'s new signature (Task 2).
- Produces: nothing consumed elsewhere — this is the final leaf of the change within this repository.

There is no automated test harness for this static HTML file in this repo (`sayanmramor-calculator.html` has no build step and isn't loaded under `node --test`), so this task is verified manually in a browser instead of via `node --test`.

- [ ] **Step 1: Update the `ProductTypes` destructure**

In `sayanmramor-calculator.html`, replace line 690:

```js
  const { SAW_MARGIN_CM, AREA_WASTE_FACTOR, WORK_MULTIPLIER, HARDNESS_WORK_MULTIPLIER, OPTION_SURCHARGE } = ProductTypes;
```

with:

```js
  const { SAW_MARGIN_CM, AREA_WASTE_FACTOR, WORK_RATES, MISC_FLAT_SUM, MISC_RATE_PER_M2, COMPLEX_SHAPE_MULTIPLIER } = ProductTypes;
```

- [ ] **Step 2: Replace the option-surcharge block and `calculatePrice` call**

Replace lines 877-904:

```js
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
      workMultiplier: HARDNESS_WORK_MULTIPLIER[stone.hardness_category] || WORK_MULTIPLIER,
      allowSeam: product.allowSeam !== false
    });
```

with:

```js
    const complexEnabled = document.getElementById('opt-complex').checked;
    const polishEnabled = document.getElementById('opt-polish').checked;
    const installEnabled = document.getElementById('opt-install').checked;
    const surchargeLabel = [];
    if (complexEnabled) surchargeLabel.push('сложная форма');
    if (polishEnabled) surchargeLabel.push('полировка');
    if (installEnabled) surchargeLabel.push('монтаж');

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

Note: `rates.miscFlatSum`/`rates.miscRatePerM2` will be `null` at this point (Task 1 leaves `MISC_FLAT_SUM`/`MISC_RATE_PER_M2` as `null` pending real data) — `computeWorkAndTotal` (Task 2) treats that as `0`, so the calculator keeps working correctly, it simply doesn't add a misc line yet.

- [ ] **Step 3: Manual verification in a browser**

Open `sayanmramor-calculator.html` directly in a browser (no dev server needed — it's a static file):

```bash
start sayanmramor-calculator.html
```

Check:
1. Pick any in-stock stone and the "Столешницы на кухню" product type, enter width/length (e.g. 1.0 x 0.6) — the price should render as a concrete ₽ number, not "NaN ₽" or a JS console error.
2. Toggle "Сложная форма / фигурный рез", "Дополнительная полировка", and "Монтаж на объекте" on and off one at a time — the displayed price should change each time an installation/polish-affecting checkbox toggles (complex form only changes the price if paired with visible fabrication cost, which it always is).
3. Confirm the options line under the price shows plain labels ("сложная форма, полировка, монтаж") without the old "+X%" text.
4. Switch product type to "Полы" and to "Лестницы" and confirm both still produce a sane, non-NaN price (this exercises the `pol` real-data rate and the `lestnitsa` estimated rate).

- [ ] **Step 4: Commit**

```bash
git add sayanmramor-calculator.html
git commit -m "feat: wire per-type work-cost rates into the calculator UI"
```

---

## Post-merge follow-up (outside this repository)

`sayanmramor-site` (a separate repository, catalog site skeleton) already calls `Pricing.calculatePrice` with the **old** signature (`complexityMultiplier`/`optionSurchargeSum`/`workMultiplier`). This plan's Task 2 is a breaking change to that signature. After merging Tasks 1-3:

- [ ] In the `sayanmramor-site` repository, find every call to `Pricing.calculatePrice` and update it to the new signature: pass `rates` (built from `ProductTypes.WORK_RATES[type]` plus `MISC_FLAT_SUM`/`MISC_RATE_PER_M2`/`COMPLEX_SHAPE_MULTIPLIER`) and `installEnabled`/`polishEnabled`/`complexEnabled` instead of `complexityMultiplier`/`optionSurchargeSum`/`workMultiplier`. Use `sayanmramor-calculator.html`'s Task 3 changes in this repo as the reference implementation.

This item is not executable from within this plan (this plan's tools only operate on `D:\calculator`) — it is a manual reminder so the cross-repo break doesn't get discovered by a live customer instead of by the person who ships it.
