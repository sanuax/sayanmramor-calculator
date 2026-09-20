# Rate Catalog & Product Subcategories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the company's detailed rate structure (product subcategories, installation rows, and a general additional-works catalog) from `Ставки_для_калькулятора.xlsx` as null-rate data + UI, without changing the price the calculator currently shows customers.

**Architecture:** A new pure-data UMD module `rate-catalog.js` mirrors the three relevant Excel sheets as flat arrays (`PRODUCT_SUBCATEGORIES`, `ADDITIONAL_WORKS`, `INSTALLATION_RATES`), all rates `null`. `pricing.js` gains one small additive mechanism (`extraLineItems` → `catalogExtras`) that behaves exactly like the existing `extraDimensions` → `extras` mechanism, so it's tested the same way. `sayanmramor-calculator.html` gets a subcategory `<select>` (display-only, not priced) and a generalized additional-works UI block (кромка for all products, cuts/holes/expanded extras for countertop products only), feeding `extraLineItems`.

**Tech Stack:** Plain ES5-compatible JS (UMD modules, same pattern as `pricing.js`/`product-types.js`/`material-picker.js`), `node:test` + `node:assert/strict` for unit tests, no build step, no frameworks.

**Spec:** [docs/superpowers/specs/2026-09-20-rate-catalog-subcategories-design.md](../specs/2026-09-20-rate-catalog-subcategories-design.md)

## Global Constraints

- Every rate in `PRODUCT_SUBCATEGORIES`, `ADDITIONAL_WORKS`, and `INSTALLATION_RATES` is `rate: null` / `currency: null`. Never invent a number.
- No change to the price or breakdown math the calculator currently produces for any existing input combination — this task is additive only.
- `unit` fields keep the literal Cyrillic strings from the spreadsheet: `'м²'`, `'шт.'`, `'компл.'`, `'м.п.'` — no internal enum translation.
- Every new dimension/length input in the UI is in **millimeters**, converted to meters via the existing `mmToM()` helper in `sayanmramor-calculator.html` (added by the prior mm-conversion task) — do not introduce a metre-denominated input.
- Do not modify `bortikLengthM` / `fartukAreaM2` / `ostrovAreaM2` in `pricing.js`, `COUNTERTOP_EXTRAS_RATES` in `product-types.js`, or any existing test that covers them.
- Never touch, read the contents of for editing, stage, or commit `Ставки_для_калькулятора.xlsx` or `~$Ставки_для_калькулятора.xlsx`.
- **Deviation from the spec's code sketch, corrected here for architectural consistency:** the spec describes `extraLineItems` as `[{ rateId, quantity }]` with `pricing.js` calling `getAdditionalWorkRate(rateId)` internally. That would give `pricing.js` a hard dependency on `rate-catalog.js`, breaking its current status as a dependency-free, pure module (today the caller in the HTML page resolves every rate — including `bortikRatePerM` etc. — into a plain number before calling `Pricing`). This plan instead has the **caller** resolve `rateId → rate` via `RateCatalog.getAdditionalWorkRate`, and `extraLineItems` carries `[{ rate, quantity }]` into `pricing.js`. Externally the behavior is identical to the spec (null rate → 0 contribution); only where the lookup happens changes.

---

### Task 1: `rate-catalog.js` — `PRODUCT_SUBCATEGORIES`

**Files:**
- Create: `rate-catalog.js`
- Test: `tests/rate-catalog.test.js`

**Interfaces:**
- Produces: `RateCatalog.PRODUCT_SUBCATEGORIES` (array of 50 `{ id, categoryLabel, shape, variant, unit, rate: null, currency: null }`), `RateCatalog.getSubcategoriesForProduct(categoryLabel) -> array`.

- [ ] **Step 1: Write the failing test file**

Create `tests/rate-catalog.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const RateCatalog = require('../rate-catalog.js');
const ProductTypes = require('../product-types.js');

test('PRODUCT_SUBCATEGORIES has exactly 50 rows', () => {
  assert.equal(RateCatalog.PRODUCT_SUBCATEGORIES.length, 50);
});

test('PRODUCT_SUBCATEGORIES ids are all unique', () => {
  const ids = RateCatalog.PRODUCT_SUBCATEGORIES.map(r => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('PRODUCT_SUBCATEGORIES rows all start with rate/currency null', () => {
  RateCatalog.PRODUCT_SUBCATEGORIES.forEach(row => {
    assert.equal(row.rate, null);
    assert.equal(row.currency, null);
  });
});

test('PRODUCT_SUBCATEGORIES rows only use known units', () => {
  const validUnits = new Set(['м²', 'шт.', 'компл.']);
  RateCatalog.PRODUCT_SUBCATEGORIES.forEach(row => {
    assert.equal(validUnits.has(row.unit), true, `unexpected unit "${row.unit}" on ${row.id}`);
  });
});

test('getSubcategoriesForProduct returns the right row count for every PRODUCTS category', () => {
  const expectedCounts = {
    'Лестницы': 13, 'Панно': 4, 'Подоконники': 5, 'Полы': 5, 'Стены': 5,
    'Фасады': 5, 'Столешницы в ванную': 4, 'Столешницы на кухню': 5, 'Ступени': 4
  };
  Object.values(ProductTypes.PRODUCTS).forEach(product => {
    const rows = RateCatalog.getSubcategoriesForProduct(product.label);
    assert.equal(rows.length, expectedCounts[product.label], `wrong count for ${product.label}`);
  });
});

test('getSubcategoriesForProduct returns an empty array for an unknown category', () => {
  assert.deepEqual(RateCatalog.getSubcategoriesForProduct('Несуществующий тип'), []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/rate-catalog.test.js`
Expected: FAIL — `Cannot find module '../rate-catalog.js'`

- [ ] **Step 3: Create `rate-catalog.js` with the full 50-row `PRODUCT_SUBCATEGORIES` table**

All 50 rows below are transcribed directly from the «Ставки изделий» sheet (columns `ID`, `Категория`, `Подраздел/форма`, `Вариант/комплектация`, `Ед. расчёта`), excluding the 9 `INST-*` rows (handled in Task 3):

```js
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.RateCatalog = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  const PRODUCT_SUBCATEGORIES = [
    { id: 'STAIR-01', categoryLabel: 'Лестницы', shape: 'Прямая', variant: 'Ступени', unit: 'м²', rate: null, currency: null },
    { id: 'STAIR-02', categoryLabel: 'Лестницы', shape: 'Прямая', variant: 'Ступени + подступенки', unit: 'м²', rate: null, currency: null },
    { id: 'STAIR-03', categoryLabel: 'Лестницы', shape: 'Г-образная', variant: 'Ступени', unit: 'м²', rate: null, currency: null },
    { id: 'STAIR-04', categoryLabel: 'Лестницы', shape: 'Г-образная', variant: 'Ступени + подступенки', unit: 'м²', rate: null, currency: null },
    { id: 'STAIR-05', categoryLabel: 'Лестницы', shape: 'П-образная', variant: 'Ступени', unit: 'м²', rate: null, currency: null },
    { id: 'STAIR-06', categoryLabel: 'Лестницы', shape: 'П-образная', variant: 'Ступени + подступенки', unit: 'м²', rate: null, currency: null },
    { id: 'STAIR-07', categoryLabel: 'Лестницы', shape: 'Винтовая / радиусная', variant: 'Ступени', unit: 'м²', rate: null, currency: null },
    { id: 'STAIR-08', categoryLabel: 'Лестницы', shape: 'Винтовая / радиусная', variant: 'Ступени + подступенки', unit: 'м²', rate: null, currency: null },
    { id: 'STAIR-09', categoryLabel: 'Лестницы', shape: 'Любая', variant: 'Калошница / тетива', unit: 'м²', rate: null, currency: null },
    { id: 'STAIR-10', categoryLabel: 'Лестницы', shape: 'Любая', variant: 'Боковина / торец лестницы', unit: 'м²', rate: null, currency: null },
    { id: 'STAIR-11', categoryLabel: 'Лестницы', shape: 'Любая', variant: 'Площадка', unit: 'м²', rate: null, currency: null },
    { id: 'STAIR-12', categoryLabel: 'Лестницы', shape: 'Любая', variant: 'Полная облицовка лестницы', unit: 'компл.', rate: null, currency: null },
    { id: 'STAIR-13', categoryLabel: 'Лестницы', shape: 'Наружная / входная группа', variant: 'Облицовка', unit: 'м²', rate: null, currency: null },

    { id: 'PANEL-01', categoryLabel: 'Панно', shape: 'Стеновое', variant: 'Стандартное', unit: 'м²', rate: null, currency: null },
    { id: 'PANEL-02', categoryLabel: 'Панно', shape: 'Декоративное', variant: 'Стандартное', unit: 'м²', rate: null, currency: null },
    { id: 'PANEL-03', categoryLabel: 'Панно', shape: 'Художественное / наборное', variant: 'Нестандартное', unit: 'м²', rate: null, currency: null },
    { id: 'PANEL-04', categoryLabel: 'Панно', shape: 'С подсветкой', variant: 'Подготовка / монтаж', unit: 'м²', rate: null, currency: null },

    { id: 'SILL-01', categoryLabel: 'Подоконники', shape: 'Прямой', variant: 'Стандартный', unit: 'м²', rate: null, currency: null },
    { id: 'SILL-02', categoryLabel: 'Подоконники', shape: 'Угловой', variant: 'Стандартный', unit: 'м²', rate: null, currency: null },
    { id: 'SILL-03', categoryLabel: 'Подоконники', shape: 'Эркерный', variant: 'Стандартный', unit: 'м²', rate: null, currency: null },
    { id: 'SILL-04', categoryLabel: 'Подоконники', shape: 'Эркерный радиусный', variant: 'Стандартный', unit: 'м²', rate: null, currency: null },
    { id: 'SILL-05', categoryLabel: 'Подоконники', shape: 'Фигурный', variant: 'Нестандартный', unit: 'м²', rate: null, currency: null },

    { id: 'FLOOR-01', categoryLabel: 'Полы', shape: 'Прямая раскладка', variant: 'Стандартная', unit: 'м²', rate: null, currency: null },
    { id: 'FLOOR-02', categoryLabel: 'Полы', shape: 'Диагональная', variant: 'Стандартная', unit: 'м²', rate: null, currency: null },
    { id: 'FLOOR-03', categoryLabel: 'Полы', shape: 'Крупноформатные плиты', variant: 'Стандартная', unit: 'м²', rate: null, currency: null },
    { id: 'FLOOR-04', categoryLabel: 'Полы', shape: 'По рисунку', variant: 'Нестандартная раскладка', unit: 'м²', rate: null, currency: null },
    { id: 'FLOOR-05', categoryLabel: 'Полы', shape: 'Художественная / сложная', variant: 'Нестандартная', unit: 'м²', rate: null, currency: null },

    { id: 'WALL-01', categoryLabel: 'Стены', shape: 'Обычная облицовка', variant: 'Стандартная', unit: 'м²', rate: null, currency: null },
    { id: 'WALL-02', categoryLabel: 'Стены', shape: 'Стеновые панели', variant: 'Стандартная', unit: 'м²', rate: null, currency: null },
    { id: 'WALL-03', categoryLabel: 'Стены', shape: 'Крупноформатные плиты', variant: 'Стандартная', unit: 'м²', rate: null, currency: null },
    { id: 'WALL-04', categoryLabel: 'Стены', shape: 'Радиусная', variant: 'Нестандартная', unit: 'м²', rate: null, currency: null },
    { id: 'WALL-05', categoryLabel: 'Стены', shape: 'С подсветкой', variant: 'Подготовка / монтаж', unit: 'м²', rate: null, currency: null },

    { id: 'FACADE-01', categoryLabel: 'Фасады', shape: 'Фасад здания', variant: 'Облицовка', unit: 'м²', rate: null, currency: null },
    { id: 'FACADE-02', categoryLabel: 'Фасады', shape: 'Фасадный элемент', variant: 'Изделие', unit: 'шт.', rate: null, currency: null },
    { id: 'FACADE-03', categoryLabel: 'Фасады', shape: 'Колонны', variant: 'Облицовка', unit: 'м²', rate: null, currency: null },
    { id: 'FACADE-04', categoryLabel: 'Фасады', shape: 'Цоколь', variant: 'Облицовка', unit: 'м²', rate: null, currency: null },
    { id: 'FACADE-05', categoryLabel: 'Фасады', shape: 'Декоративные элементы', variant: 'Изделие', unit: 'шт.', rate: null, currency: null },

    { id: 'BATH-01', categoryLabel: 'Столешницы в ванную', shape: 'Прямая', variant: 'Без раковины', unit: 'м²', rate: null, currency: null },
    { id: 'BATH-02', categoryLabel: 'Столешницы в ванную', shape: 'Угловая', variant: 'Без раковины', unit: 'м²', rate: null, currency: null },
    { id: 'BATH-03', categoryLabel: 'Столешницы в ванную', shape: 'П-образная', variant: 'Без раковины', unit: 'м²', rate: null, currency: null },
    { id: 'BATH-04', categoryLabel: 'Столешницы в ванную', shape: 'Фигурная', variant: 'Без раковины', unit: 'м²', rate: null, currency: null },

    { id: 'KITCHEN-01', categoryLabel: 'Столешницы на кухню', shape: 'Основная столешница', variant: 'Стандартная', unit: 'м²', rate: null, currency: null },
    { id: 'KITCHEN-02', categoryLabel: 'Столешницы на кухню', shape: 'Остров', variant: 'Прямоугольный', unit: 'м²', rate: null, currency: null },
    { id: 'KITCHEN-03', categoryLabel: 'Столешницы на кухню', shape: 'Остров', variant: 'Фигурный / радиусный', unit: 'м²', rate: null, currency: null },
    { id: 'KITCHEN-04', categoryLabel: 'Столешницы на кухню', shape: 'Барная стойка', variant: 'Стандартная', unit: 'м²', rate: null, currency: null },
    { id: 'KITCHEN-05', categoryLabel: 'Столешницы на кухню', shape: 'Барная стойка', variant: 'Сложная / радиусная', unit: 'м²', rate: null, currency: null },

    { id: 'STEP-01', categoryLabel: 'Ступени', shape: 'Ступень', variant: 'Прямая', unit: 'шт.', rate: null, currency: null },
    { id: 'STEP-02', categoryLabel: 'Ступени', shape: 'Ступень', variant: 'Забежная', unit: 'шт.', rate: null, currency: null },
    { id: 'STEP-03', categoryLabel: 'Ступени', shape: 'Ступень', variant: 'Радиусная', unit: 'шт.', rate: null, currency: null },
    { id: 'STEP-04', categoryLabel: 'Ступени', shape: 'Подступенок', variant: 'Стандартный', unit: 'шт.', rate: null, currency: null },
  ];

  function getSubcategoriesForProduct(categoryLabel) {
    return PRODUCT_SUBCATEGORIES.filter(row => row.categoryLabel === categoryLabel);
  }

  return {
    PRODUCT_SUBCATEGORIES, getSubcategoriesForProduct,
  };
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/rate-catalog.test.js`
Expected: PASS (6/6 tests)

- [ ] **Step 5: Commit**

```bash
git add rate-catalog.js tests/rate-catalog.test.js
git commit -m "feat: add PRODUCT_SUBCATEGORIES rate catalog (structure only, null rates)"
```

---

### Task 2: `rate-catalog.js` — `ADDITIONAL_WORKS`

**Files:**
- Modify: `rate-catalog.js`
- Test: `tests/rate-catalog.test.js`

**Interfaces:**
- Consumes: the UMD wrapper and `PRODUCT_SUBCATEGORIES`/`getSubcategoriesForProduct` from Task 1 (this task adds to the same `return` object, doesn't replace it).
- Produces: `RateCatalog.ADDITIONAL_WORKS` (array of 19 `{ id, group, operation, variant, unit, rate: null, currency: null }`), `RateCatalog.getAdditionalWorkRate(id) -> number|null`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/rate-catalog.test.js`:

```js
test('ADDITIONAL_WORKS has exactly 19 rows', () => {
  assert.equal(RateCatalog.ADDITIONAL_WORKS.length, 19);
});

test('ADDITIONAL_WORKS ids are all unique', () => {
  const ids = RateCatalog.ADDITIONAL_WORKS.map(r => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('ADDITIONAL_WORKS rows all start with rate/currency null', () => {
  RateCatalog.ADDITIONAL_WORKS.forEach(row => {
    assert.equal(row.rate, null);
    assert.equal(row.currency, null);
  });
});

test('ADDITIONAL_WORKS groups match the expected row counts', () => {
  const counts = {};
  RateCatalog.ADDITIONAL_WORKS.forEach(row => { counts[row.group] = (counts[row.group] || 0) + 1; });
  assert.deepEqual(counts, { 'Вырезы': 4, 'Отверстия': 3, 'Кромка': 5, 'Дополнительно': 7 });
});

test('getAdditionalWorkRate returns null for every existing row (no real rates yet)', () => {
  RateCatalog.ADDITIONAL_WORKS.forEach(row => {
    assert.equal(RateCatalog.getAdditionalWorkRate(row.id), null);
  });
});

test('getAdditionalWorkRate returns null for an unknown id', () => {
  assert.equal(RateCatalog.getAdditionalWorkRate('NOPE-99'), null);
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `node --test tests/rate-catalog.test.js`
Expected: FAIL — `RateCatalog.ADDITIONAL_WORKS` is `undefined` (`Cannot read properties of undefined`)

- [ ] **Step 3: Add `ADDITIONAL_WORKS` and `getAdditionalWorkRate` to `rate-catalog.js`**

Insert after the `PRODUCT_SUBCATEGORIES` array (before `function getSubcategoriesForProduct`), transcribed from the «Дополнительные работы» sheet (`ID`, `Группа`, `Операция`, `Вариант`, `Ед. расчёта`):

```js
  const ADDITIONAL_WORKS = [
    { id: 'CUT-01', group: 'Вырезы', operation: 'Раковина', variant: 'Накладная', unit: 'шт.', rate: null, currency: null },
    { id: 'CUT-02', group: 'Вырезы', operation: 'Раковина', variant: 'Подшивная снизу', unit: 'шт.', rate: null, currency: null },
    { id: 'CUT-03', group: 'Вырезы', operation: 'Раковина', variant: 'Интегрированная', unit: 'шт.', rate: null, currency: null },
    { id: 'CUT-04', group: 'Вырезы', operation: 'Варочная панель', variant: 'Стандартный вырез', unit: 'шт.', rate: null, currency: null },
    { id: 'CUT-05', group: 'Отверстия', operation: 'Смеситель', variant: '1 отверстие', unit: 'шт.', rate: null, currency: null },
    { id: 'CUT-06', group: 'Отверстия', operation: 'Розетка', variant: '1 отверстие', unit: 'шт.', rate: null, currency: null },
    { id: 'CUT-07', group: 'Отверстия', operation: 'Дозатор', variant: '1 отверстие', unit: 'шт.', rate: null, currency: null },
    { id: 'EDGE-01', group: 'Кромка', operation: 'Кромка', variant: 'Прямая', unit: 'м.п.', rate: null, currency: null },
    { id: 'EDGE-03', group: 'Кромка', operation: 'Кромка', variant: 'Фигурная / сложная', unit: 'м.п.', rate: null, currency: null },
    { id: 'EDGE-04', group: 'Кромка', operation: 'Скругление', variant: 'R / профиль', unit: 'м.п.', rate: null, currency: null },
    { id: 'EDGE-05', group: 'Кромка', operation: 'Скос', variant: 'Фаска / скос', unit: 'м.п.', rate: null, currency: null },
    { id: 'EDGE-06', group: 'Кромка', operation: 'Подгиб камнем', variant: 'Столешница / фасад', unit: 'м.п.', rate: null, currency: null },
    { id: 'EXTRA-01', group: 'Дополнительно', operation: 'Бортик', variant: 'Стандартный', unit: 'м.п.', rate: null, currency: null },
    { id: 'EXTRA-02', group: 'Дополнительно', operation: 'Фартук', variant: 'Стандартный', unit: 'м²', rate: null, currency: null },
    { id: 'EXTRA-03', group: 'Дополнительно', operation: 'Стеновая панель', variant: 'Стандартная', unit: 'м²', rate: null, currency: null },
    { id: 'EXTRA-04', group: 'Дополнительно', operation: 'Остров', variant: 'Прямоугольный', unit: 'м²', rate: null, currency: null },
    { id: 'EXTRA-05', group: 'Дополнительно', operation: 'Остров', variant: 'Фигурный / радиусный', unit: 'м²', rate: null, currency: null },
    { id: 'EXTRA-06', group: 'Дополнительно', operation: 'Барная стойка', variant: 'Стандартная', unit: 'м²', rate: null, currency: null },
    { id: 'EXTRA-07', group: 'Дополнительно', operation: 'Барная стойка', variant: 'Сложная / радиусная', unit: 'м²', rate: null, currency: null },
  ];
```

Add after `getSubcategoriesForProduct`:

```js
  function getAdditionalWorkRate(id) {
    const row = ADDITIONAL_WORKS.find(r => r.id === id);
    return row ? row.rate : null;
  }
```

Update the `return` statement to:

```js
  return {
    PRODUCT_SUBCATEGORIES, getSubcategoriesForProduct,
    ADDITIONAL_WORKS, getAdditionalWorkRate,
  };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/rate-catalog.test.js`
Expected: PASS (12/12 tests)

- [ ] **Step 5: Commit**

```bash
git add rate-catalog.js tests/rate-catalog.test.js
git commit -m "feat: add ADDITIONAL_WORKS rate catalog (structure only, null rates)"
```

---

### Task 3: `rate-catalog.js` — `INSTALLATION_RATES`

**Files:**
- Modify: `rate-catalog.js`
- Test: `tests/rate-catalog.test.js`

**Interfaces:**
- Consumes: the UMD wrapper from Task 1/2 (adds to the same `return` object).
- Produces: `RateCatalog.INSTALLATION_RATES` (array of 9 `{ id, categoryLabel, shape, variant, unit, rate: null, currency: null }`), `RateCatalog.getInstallationRow(categoryLabel) -> row|null`.

Per the design spec's "Installation rows" section: these rows mirror the `INST-*` rows from «Ставки изделий» and are kept in the model, but nothing reads from `INSTALLATION_RATES` yet — installation pricing keeps coming from `WORK_RATES[key].installationRatePerM2` in `product-types.js`, and no new UI element renders these rows at this stage. This task only adds the data + a lookup helper.

- [ ] **Step 1: Write the failing tests**

Append to `tests/rate-catalog.test.js`:

```js
test('INSTALLATION_RATES has exactly 9 rows', () => {
  assert.equal(RateCatalog.INSTALLATION_RATES.length, 9);
});

test('INSTALLATION_RATES ids are all unique and start with INST-', () => {
  const ids = RateCatalog.INSTALLATION_RATES.map(r => r.id);
  assert.equal(new Set(ids).size, ids.length);
  ids.forEach(id => assert.equal(id.startsWith('INST-'), true));
});

test('INSTALLATION_RATES rows all start with rate/currency null', () => {
  RateCatalog.INSTALLATION_RATES.forEach(row => {
    assert.equal(row.rate, null);
    assert.equal(row.currency, null);
  });
});

test('getInstallationRow finds exactly one row for every PRODUCTS category', () => {
  Object.values(ProductTypes.PRODUCTS).forEach(product => {
    const row = RateCatalog.getInstallationRow(product.label);
    assert.notEqual(row, null, `no installation row for ${product.label}`);
    assert.equal(row.categoryLabel, product.label);
  });
});

test('getInstallationRow returns null for an unknown category', () => {
  assert.equal(RateCatalog.getInstallationRow('Несуществующий тип'), null);
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `node --test tests/rate-catalog.test.js`
Expected: FAIL — `RateCatalog.INSTALLATION_RATES` is `undefined`

- [ ] **Step 3: Add `INSTALLATION_RATES` and `getInstallationRow` to `rate-catalog.js`**

Insert after `ADDITIONAL_WORKS` (before `function getSubcategoriesForProduct`):

```js
  // The 9 INST-* rows from «Ставки изделий» -- kept as their own array, in
  // the same row shape as PRODUCT_SUBCATEGORIES, because there is exactly
  // one per product category (not several shape/variant options) and it is
  // a distinct pricing concept that already has a live UI+field (the
  // "Монтаж на объекте" checkbox -> WORK_RATES[key].installationRatePerM2
  // in product-types.js). Kept for completeness/traceability of the source
  // spreadsheet; nothing reads from this array yet.
  const INSTALLATION_RATES = [
    { id: 'INST-100', categoryLabel: 'Лестницы', shape: 'Монтаж', variant: 'Монтаж на объекте', unit: 'м²', rate: null, currency: null },
    { id: 'INST-101', categoryLabel: 'Панно', shape: 'Монтаж', variant: 'Монтаж на объекте', unit: 'м²', rate: null, currency: null },
    { id: 'INST-102', categoryLabel: 'Подоконники', shape: 'Монтаж', variant: 'Монтаж на объекте', unit: 'м²', rate: null, currency: null },
    { id: 'INST-103', categoryLabel: 'Полы', shape: 'Монтаж', variant: 'Монтаж на объекте', unit: 'м²', rate: null, currency: null },
    { id: 'INST-104', categoryLabel: 'Стены', shape: 'Монтаж', variant: 'Монтаж на объекте', unit: 'м²', rate: null, currency: null },
    { id: 'INST-105', categoryLabel: 'Фасады', shape: 'Монтаж', variant: 'Монтаж на объекте', unit: 'м²', rate: null, currency: null },
    { id: 'INST-106', categoryLabel: 'Столешницы в ванную', shape: 'Монтаж', variant: 'Монтаж на объекте', unit: 'м²', rate: null, currency: null },
    { id: 'INST-107', categoryLabel: 'Столешницы на кухню', shape: 'Монтаж', variant: 'Монтаж на объекте', unit: 'м²', rate: null, currency: null },
    { id: 'INST-108', categoryLabel: 'Ступени', shape: 'Монтаж', variant: 'Монтаж на объекте', unit: 'м²', rate: null, currency: null },
  ];
```

Add after `getAdditionalWorkRate`:

```js
  function getInstallationRow(categoryLabel) {
    return INSTALLATION_RATES.find(row => row.categoryLabel === categoryLabel) || null;
  }
```

Update the `return` statement to:

```js
  return {
    PRODUCT_SUBCATEGORIES, getSubcategoriesForProduct,
    ADDITIONAL_WORKS, getAdditionalWorkRate,
    INSTALLATION_RATES, getInstallationRow,
  };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/rate-catalog.test.js`
Expected: PASS (17/17 tests)

- [ ] **Step 5: Commit**

```bash
git add rate-catalog.js tests/rate-catalog.test.js
git commit -m "feat: add INSTALLATION_RATES to rate catalog (data only, not wired to pricing)"
```

---

### Task 4: `pricing.js` — generic `extraLineItems` → `catalogExtras`

**Files:**
- Modify: `pricing.js`
- Test: `tests/pricing.test.js`

**Interfaces:**
- Consumes: nothing from Tasks 1–3 (deliberately no dependency on `rate-catalog.js` — see Global Constraints deviation note). The caller resolves rates before calling.
- Produces: `computeWorkAndTotal(subtotal, area, rates, options, extraDimensions, extraLineItems)` where `extraLineItems` is `Array<{ rate: number|null, quantity: number }> | undefined`, adding a `catalogExtras` field to its return value. `calculatePrice(params)` gains an optional `params.extraLineItems`, passed through the same way `extraDimensions` already is, adding `catalogExtras` to its return value.

- [ ] **Step 1: Write the failing tests**

Append to `tests/pricing.test.js` (after the existing `extraDimensions` tests, before `const stone = { name: 'Delicato Brown', slabs };`):

```js
test('computeWorkAndTotal: extraLineItems sum independently with their own rates', () => {
  const r = Pricing.computeWorkAndTotal(100000, 2, SAMPLE_RATES, NO_OPTIONS, null, [
    { rate: 500, quantity: 3 },
    { rate: 1200, quantity: 2 }
  ]);
  assert.equal(r.catalogExtras, 500 * 3 + 1200 * 2);
  assert.equal(r.work, r.fabrication + r.installation + r.polish + r.misc + r.extras + r.catalogExtras);
});

test('computeWorkAndTotal: null rate in an extraLineItems entry is treated as 0, not NaN', () => {
  const r = Pricing.computeWorkAndTotal(100000, 2, SAMPLE_RATES, NO_OPTIONS, null, [{ rate: null, quantity: 5 }]);
  assert.equal(r.catalogExtras, 0);
});

test('computeWorkAndTotal: negative quantity in an extraLineItems entry is clamped to 0', () => {
  const r = Pricing.computeWorkAndTotal(100000, 2, SAMPLE_RATES, NO_OPTIONS, null, [{ rate: 500, quantity: -4 }]);
  assert.equal(r.catalogExtras, 0);
});

test('computeWorkAndTotal: omitting extraLineItems defaults catalogExtras to 0 (backward compatible)', () => {
  const r = Pricing.computeWorkAndTotal(100000, 2, SAMPLE_RATES, NO_OPTIONS);
  assert.equal(r.catalogExtras, 0);
});

test('computeWorkAndTotal: empty extraLineItems array defaults catalogExtras to 0', () => {
  const r = Pricing.computeWorkAndTotal(100000, 2, SAMPLE_RATES, NO_OPTIONS, null, []);
  assert.equal(r.catalogExtras, 0);
});
```

Append after the existing `calculatePrice: extraDimensions defaults to zero extras when omitted (backward compatible)` test, at the end of the file:

```js
test('calculatePrice: extraLineItems flow through to the top-level catalogExtras field', () => {
  const r = Pricing.calculatePrice({
    stone, widthM: 1.0, lengthM: 0.6, productType: 'A', rates: SAMPLE_RATES,
    extraLineItems: [{ rate: 700, quantity: 4 }],
    marginCm: 4, wasteFactor: 1.3
  });
  assert.equal(r.ok, true);
  assert.equal(r.catalogExtras, 2800);
  assert.equal(r.total, r.subtotal + r.fabrication + r.installation + r.polish + r.misc + r.extras + r.catalogExtras);
});

test('calculatePrice: extraLineItems defaults to zero catalogExtras when omitted (backward compatible)', () => {
  const r = Pricing.calculatePrice({ stone, widthM: 1.0, lengthM: 0.6, productType: 'A', rates: SAMPLE_RATES, marginCm: 4, wasteFactor: 1.3 });
  assert.equal(r.catalogExtras, 0);
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `node --test tests/pricing.test.js`
Expected: FAIL — `r.catalogExtras` is `undefined`, assertions comparing `undefined` to a number fail

- [ ] **Step 3: Implement `extraLineItems`/`catalogExtras` in `pricing.js`**

In `computeWorkAndTotal` (currently `pricing.js:165-187`), change the signature and add the new sum:

```js
  function computeWorkAndTotal(subtotal, area, rates, options, extraDimensions, extraLineItems) {
    const { installEnabled, polishEnabled, complexEnabled } = options;
    const { bortikLengthM = 0, fartukAreaM2 = 0, ostrovAreaM2 = 0 } = extraDimensions || {};
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
    const extras = Math.max(0, bortikLengthM) * bortikRatePerM
                 + Math.max(0, fartukAreaM2) * fartukRatePerM2
                 + Math.max(0, ostrovAreaM2) * ostrovRatePerM2;
    // Generic sum for the rate-catalog-backed additional works (cuts, holes,
    // edge treatment, and the expanded "Дополнительно" items) -- each entry
    // already carries its own resolved rate (or null, until the company
    // fills in rate-catalog.js), so this needs no lookup of its own.
    const catalogExtras = (extraLineItems || []).reduce(
      (sum, item) => sum + Math.max(0, item.quantity) * (item.rate || 0),
      0
    );
    const work = fabrication + installation + polish + misc + extras + catalogExtras;
    const total = subtotal + work;
    return { fabrication, installation, polish, misc, extras, catalogExtras, work, total };
  }
```

In `calculatePrice` (currently `pricing.js:189-266`):

1. Add `extraLineItems = []` to the destructured `params` (alongside `extraDimensions = {}`):

```js
    const {
      stone, widthM, lengthM, productType, marginCm, wasteFactor,
      rates, installEnabled = false, polishEnabled = false, complexEnabled = false,
      extraDimensions = {}, extraLineItems = [], allowSeam = true
    } = params;
```

2. Add `catalogExtras: null` to the `empty` result template (alongside the existing `extras: null`):

```js
    const empty = {
      subtotal: null, fabrication: null, installation: null, polish: null, misc: null, extras: null,
      catalogExtras: null, work: null, total: null, nSlabs: 0, remainderM2: null, matchedSlab: null, matchedSlabs: []
    };
```

3. In all three `computeWorkAndTotal(...)` call sites (Type A single-slab, Type A segmented, Type B), add `extraLineItems` as the 6th argument and destructure `catalogExtras` alongside the existing fields, then include it in both returned objects. For example, the Type A single-slab branch becomes:

```js
      if (slab) {
        const subtotal = slab.price_total_rub;
        const { fabrication, installation, polish, misc, extras, catalogExtras, work, total } = computeWorkAndTotal(subtotal, area, rates, options, extraDimensions, extraLineItems);
        const remainderM2 = computeRemainderAreaM2(slab, widthM, lengthM);
        return {
          ok: true, reason: null, subtotal, fabrication, installation, polish, misc, extras, catalogExtras, work, total,
          nSlabs: 1, remainderM2, matchedSlab: slab, matchedSlabs: [slab]
        };
      }
```

Apply the identical change to the Type A segmented branch, so it reads:

```js
      const segmented = findTypeASegmentedResult(stone.slabs, widthM, lengthM, marginCm);
      if (!segmented) {
        return Object.assign({ ok: false, reason: 'no_fitting_slab' }, empty);
      }
      if (segmented.subtotal === null) {
        return Object.assign({ ok: false, reason: 'insufficient_stock' }, empty);
      }
      const { fabrication, installation, polish, misc, extras, catalogExtras, work, total } = computeWorkAndTotal(segmented.subtotal, area, rates, options, extraDimensions, extraLineItems);
      return {
        ok: true, reason: null, subtotal: segmented.subtotal, fabrication, installation, polish, misc, extras, catalogExtras, work, total,
        nSlabs: segmented.slabs.length, remainderM2: null,
        matchedSlab: segmented.slabs[0], matchedSlabs: segmented.slabs
      };
```

And the Type B branch, so it reads:

```js
    const typeBResult = computeTypeBResult(stone.slabs, widthM, lengthM, wasteFactor);
    if (!typeBResult) {
      return Object.assign({ ok: false, reason: 'no_slabs_for_stone' }, empty);
    }
    if (typeBResult.subtotal === null) {
      return Object.assign({ ok: false, reason: 'insufficient_stock' }, empty);
    }
    const { fabrication, installation, polish, misc, extras, catalogExtras, work, total } = computeWorkAndTotal(typeBResult.subtotal, area, rates, options, extraDimensions, extraLineItems);
    return {
      ok: true, reason: null, subtotal: typeBResult.subtotal, fabrication, installation, polish, misc, extras, catalogExtras, work, total,
      nSlabs: typeBResult.slabs.length, remainderM2: null,
      matchedSlab: typeBResult.slabs[0], matchedSlabs: typeBResult.slabs
    };
```

4. Update the module's `return` statement — no change needed, `computeWorkAndTotal`/`calculatePrice` are already exported by name.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/pricing.test.js`
Expected: PASS (all tests, including the 7 new ones)

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `node --test tests/*.test.js`
Expected: PASS, same total count as before plus 7

- [ ] **Step 6: Commit**

```bash
git add pricing.js tests/pricing.test.js
git commit -m "feat: add generic extraLineItems/catalogExtras mechanism to pricing.js"
```

---

### Task 5: HTML — product subcategory selector (display-only)

**Files:**
- Modify: `sayanmramor-calculator.html`

**Interfaces:**
- Consumes: `RateCatalog.getSubcategoriesForProduct` (Task 1), `PRODUCTS` (existing), `mmToM` (existing, added by the prior mm-conversion task).
- Produces: nothing consumed by later tasks in this plan — this is a leaf UI feature. Establishes the `<script src="rate-catalog.js">` include that Tasks 6–8 also rely on.

No automated test exists for the inline script (consistent with the rest of `sayanmramor-calculator.html`); this task is verified with an explicit manual browser check in Step 4.

- [ ] **Step 1: Add the `rate-catalog.js` script include**

In `sayanmramor-calculator.html`, find the existing script tags (currently around line 628-630):

```html
<script src="pricing.js"></script>
<script src="material-picker.js"></script>
<script src="product-types.js"></script>
```

Add `rate-catalog.js` after `product-types.js`:

```html
<script src="pricing.js"></script>
<script src="material-picker.js"></script>
<script src="product-types.js"></script>
<script src="rate-catalog.js"></script>
```

- [ ] **Step 2: Add the subcategory field markup**

Insert a new `.field` block right after the product-type field (currently `sayanmramor-calculator.html:525-528`) and before the Материал field:

```html
      <div class="field">
        <label id="productLabel">Тип изделия</label>
        <div class="product-grid" id="productGrid" role="radiogroup" aria-labelledby="productLabel"></div>
      </div>

      <div class="field" id="productSubcategoryField" style="display:none">
        <label for="productSubcategory">Вариант исполнения</label>
        <select id="productSubcategory"></select>
        <input type="number" id="subcategoryQty" placeholder="Количество, шт." min="0" step="1" style="margin-top:8px;display:none">
      </div>

      <div class="field">
        <label id="materialLabel" for="materialField">Материал</label>
```

- [ ] **Step 3: Wire it up in the inline script**

Add new element references alongside the existing ones (`sayanmramor-calculator.html:726-732`, after `const countertopExtrasField = document.getElementById('countertopExtras');`):

```js
  const productSubcategoryField = document.getElementById('productSubcategoryField');
  const productSubcategorySelect = document.getElementById('productSubcategory');
  const subcategoryQtyInput = document.getElementById('subcategoryQty');
```

Add these functions right after the `mmToM` helper (which Task 2 of the earlier mm-conversion work placed just before `formatRub`):

```js
  function currentSubcategoryRow() {
    const product = selectedProductKey ? PRODUCTS[selectedProductKey] : null;
    if (!product) return null;
    const rows = getSubcategoriesForProduct(product.label);
    return rows.find(r => r.id === productSubcategorySelect.value) || null;
  }

  function subcategoryLabel(row) {
    return row.shape === 'Любая' ? row.variant : `${row.shape} — ${row.variant}`;
  }

  function updateSubcategoryQtyVisibility() {
    const row = currentSubcategoryRow();
    subcategoryQtyInput.style.display = row && row.unit === 'шт.' ? '' : 'none';
  }

  function renderSubcategoryOptions(product) {
    productSubcategorySelect.innerHTML = '';
    getSubcategoriesForProduct(product.label).forEach(row => {
      const opt = document.createElement('option');
      opt.value = row.id;
      opt.textContent = subcategoryLabel(row);
      productSubcategorySelect.appendChild(opt);
    });
    productSubcategoryField.style.display = '';
    updateSubcategoryQtyVisibility();
  }
```

Destructure `getSubcategoriesForProduct` from `RateCatalog` alongside the existing `ProductTypes` destructuring (`sayanmramor-calculator.html:632`):

```js
  const { PRODUCTS } = ProductTypes;
  const { getSubcategoriesForProduct } = RateCatalog;
```

Update the product radio's `change` handler (`sayanmramor-calculator.html:742-745`) to populate the new select:

```js
    input.addEventListener('change', () => {
      selectedProductKey = key;
      renderSubcategoryOptions(val);
      calculate();
    });
```

Add change/input listeners near the other field listeners (`sayanmramor-calculator.html:1014-1023`):

```js
  productSubcategorySelect.addEventListener('change', () => { updateSubcategoryQtyVisibility(); calculate(); });
  subcategoryQtyInput.addEventListener('input', calculate);
```

Finally, show the selection in the breakdown. In `calculate()`, right after the line that builds `html += \`Изделие: <span>${product.label}</span>\`;` (currently `sayanmramor-calculator.html:990`), add:

```js
    const subcategoryRow = currentSubcategoryRow();
    if (subcategoryRow) {
      html += `<br>Вариант: <span>${escapeHtml(subcategoryLabel(subcategoryRow))}</span>`;
      if (subcategoryRow.unit === 'шт.') {
        const subcategoryQty = parseFloat(subcategoryQtyInput.value) || 0;
        html += ` (${subcategoryQty} шт.)`;
      }
    }
```

This is purely informational — `subcategoryRow`/`subcategoryQty` are never passed into `Pricing.calculatePrice`, matching the spec's requirement that the current price stay unchanged.

- [ ] **Step 4: Manual browser verification**

Serve the directory (e.g. `python3 -m http.server 8791` from `D:\calculator`) and open `sayanmramor-calculator.html`:
1. Click "Лестницы" — the new "Вариант исполнения" select appears with 13 options, first one being "Прямая — Ступени".
2. Select "Полная облицовка лестницы" — no quantity field appears (unit is `компл.`).
3. Click "Ступени" (product type) — the select repopulates with 4 options ("Прямая", "Забежная", "Радиусная", "Стандартный" for STEP-01..04); selecting any of them reveals the "Количество, шт." field (unit is `шт.`).
4. Pick a material and enter width/length in mm; the breakdown panel shows a "Вариант: …" line matching the current selection, and the total price is unaffected by changing the subcategory or its quantity.

- [ ] **Step 5: Commit**

```bash
git add sayanmramor-calculator.html
git commit -m "feat: add product subcategory selector (display-only, not priced)"
```

---

### Task 6: HTML — «Кромка» block (all product types)

**Files:**
- Modify: `sayanmramor-calculator.html`

**Interfaces:**
- Consumes: `RateCatalog.getAdditionalWorkRate` (Task 2), `mmToM` (existing), `Pricing.calculatePrice`'s new `extraLineItems` param (Task 4).
- Produces: the `extraLineItems` array assembled here is extended by Task 7/8 (this task establishes the pattern and the variable).

- [ ] **Step 1: Add the markup**

Insert a new field after the existing dimensions field and before `#countertopExtras` (currently `sayanmramor-calculator.html:540-548`):

```html
      <div class="field" id="edgeWork" style="display:none">
        <label>Кромка</label>
        <input type="number" id="edge-straight" placeholder="Прямая, мм (погонный размер)" min="0" step="1">
        <input type="number" id="edge-figured" placeholder="Фигурная / сложная, мм (погонный размер)" min="0" step="1" style="margin-top:8px">
        <input type="number" id="edge-round" placeholder="Скругление (R/профиль), мм (погонный размер)" min="0" step="1" style="margin-top:8px">
        <input type="number" id="edge-chamfer" placeholder="Скос / фаска, мм (погонный размер)" min="0" step="1" style="margin-top:8px">
        <input type="number" id="edge-stonefold" placeholder="Подгиб камнем, мм (погонный размер)" min="0" step="1" style="margin-top:8px">
      </div>
```

- [ ] **Step 2: Wire it up in the inline script**

Add the element reference and config array near the other extras inputs (`sayanmramor-calculator.html:727-732`):

```js
  const edgeWorkField = document.getElementById('edgeWork');
  const EDGE_LINE_ITEMS = [
    { rateId: 'EDGE-01', elId: 'edge-straight', label: 'кромка прямая' },
    { rateId: 'EDGE-03', elId: 'edge-figured', label: 'кромка фигурная/сложная' },
    { rateId: 'EDGE-04', elId: 'edge-round', label: 'скругление' },
    { rateId: 'EDGE-05', elId: 'edge-chamfer', label: 'скос/фаска' },
    { rateId: 'EDGE-06', elId: 'edge-stonefold', label: 'подгиб камнем' },
  ];
```

Replace the `RateCatalog` destructure line Task 5 added (`const { getSubcategoriesForProduct } = RateCatalog;`) with:

```js
  const { getSubcategoriesForProduct, getAdditionalWorkRate } = RateCatalog;
```

Add a small generic reader function next to `mmToM`:

```js
  // Reads a list of {rateId, elId, label} mm-length inputs into extraLineItems
  // entries plus human-readable breakdown labels, skipping anything left at
  // zero. Shared by the edge/cuts/holes/extras blocks so each doesn't hand-
  // write its own near-identical read loop.
  function readLengthLineItems(configs) {
    const items = [];
    const labels = [];
    configs.forEach(({ rateId, elId, label }) => {
      const lengthM = mmToM(parseFloat(document.getElementById(elId).value) || 0);
      if (lengthM > 0) {
        items.push({ rate: getAdditionalWorkRate(rateId), quantity: lengthM });
        labels.push(`${label}: ${lengthM.toFixed(2)} м.п.`);
      }
    });
    return { items, labels };
  }
```

Update the product radio's `change` handler to also reveal the edge block (alongside the existing `renderSubcategoryOptions` call added in Task 5):

```js
    input.addEventListener('change', () => {
      selectedProductKey = key;
      renderSubcategoryOptions(val);
      edgeWorkField.style.display = '';
      calculate();
    });
```

In `calculate()`, after the line `if (installEnabled) optionLabels.push('монтаж');` (currently `sayanmramor-calculator.html:914`), read the edge inputs and start building `extraLineItems`:

```js
    const edgeResult = readLengthLineItems(EDGE_LINE_ITEMS);
    let extraLineItems = edgeResult.items;
    optionLabels.push(...edgeResult.labels);
```

Pass `extraLineItems` into the `Pricing.calculatePrice({...})` call (currently `sayanmramor-calculator.html:947-952`):

```js
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
      extraLineItems,
      marginCm: SAW_MARGIN_CM,
      wasteFactor: AREA_WASTE_FACTOR,
      allowSeam: product.allowSeam !== false
    });
```

Add a listener for the 5 new inputs near the other extras listeners (`sayanmramor-calculator.html:1021-1023`):

```js
  EDGE_LINE_ITEMS.forEach(({ elId }) => {
    document.getElementById(elId).addEventListener('input', calculate);
  });
```

- [ ] **Step 3: Manual browser verification**

Reload the page:
1. Select any product type (e.g. "Полы") — the "Кромка" field appears (previously only countertop products showed any additional-works UI).
2. Enter `3000` in "Прямая, мм" — after filling in material/width/length, the breakdown shows "кромка прямая: 3.00 м.п." and the total price is unchanged (rate is `null`).
3. Switch to "Столешницы в ванную" — the "Кромка" field is still visible and keeps working the same way.

- [ ] **Step 4: Commit**

```bash
git add sayanmramor-calculator.html
git commit -m "feat: add edge-treatment (кромка) inputs for all product types"
```

---

### Task 7: HTML — «Вырезы» + «Отверстия» blocks (countertop products only)

**Files:**
- Modify: `sayanmramor-calculator.html`

**Interfaces:**
- Consumes: `readLengthLineItems`'s sibling pattern (this task adds an analogous `readQuantityLineItems`), `extraLineItems` variable established in Task 6.

- [ ] **Step 1: Add the markup**

Insert inside the existing `#countertopExtras` field, before the existing bortik input (currently `sayanmramor-calculator.html:549-551`):

```html
      <div class="field" id="countertopExtras" style="display:none">
        <label>Дополнительные позиции</label>

        <label style="margin-top:0">Вырезы</label>
        <input type="number" id="cut-sink-overlay" placeholder="Раковина накладная, шт." min="0" step="1">
        <input type="number" id="cut-sink-undermount" placeholder="Раковина подшивная снизу, шт." min="0" step="1" style="margin-top:8px">
        <input type="number" id="cut-sink-integrated" placeholder="Раковина интегрированная, шт." min="0" step="1" style="margin-top:8px">
        <input type="number" id="cut-cooktop" placeholder="Варочная панель, шт." min="0" step="1" style="margin-top:8px">

        <label style="margin-top:16px">Отверстия</label>
        <input type="number" id="hole-mixer" placeholder="Смеситель, шт." min="0" step="1">
        <input type="number" id="hole-socket" placeholder="Розетка, шт." min="0" step="1" style="margin-top:8px">
        <input type="number" id="hole-dispenser" placeholder="Дозатор, шт." min="0" step="1" style="margin-top:8px">

        <label style="margin-top:16px">Дополнительно</label>
        <input type="number" id="extra-bortik" placeholder="Бортик, мм (погонный размер)" min="0" step="1">
```

(The rest of the existing `#countertopExtras` block — фартук and остров inputs — stays where it is; Task 8 edits it further.)

- [ ] **Step 2: Wire it up in the inline script**

Add the config array next to `EDGE_LINE_ITEMS`:

```js
  const QUANTITY_LINE_ITEMS = [
    { rateId: 'CUT-01', elId: 'cut-sink-overlay', label: 'вырез под накладную раковину' },
    { rateId: 'CUT-02', elId: 'cut-sink-undermount', label: 'вырез под подшивную раковину' },
    { rateId: 'CUT-03', elId: 'cut-sink-integrated', label: 'вырез под интегрированную раковину' },
    { rateId: 'CUT-04', elId: 'cut-cooktop', label: 'вырез под варочную панель' },
    { rateId: 'CUT-05', elId: 'hole-mixer', label: 'отверстие под смеситель' },
    { rateId: 'CUT-06', elId: 'hole-socket', label: 'отверстие под розетку' },
    { rateId: 'CUT-07', elId: 'hole-dispenser', label: 'отверстие под дозатор' },
  ];
```

Add the reader function next to `readLengthLineItems`:

```js
  function readQuantityLineItems(configs) {
    const items = [];
    const labels = [];
    configs.forEach(({ rateId, elId, label }) => {
      const qty = parseFloat(document.getElementById(elId).value) || 0;
      if (qty > 0) {
        items.push({ rate: getAdditionalWorkRate(rateId), quantity: qty });
        labels.push(`${label}: ${qty} шт.`);
      }
    });
    return { items, labels };
  }
```

Inside the `if (product.supportsCountertopExtras) { ... }` block in `calculate()` (currently `sayanmramor-calculator.html:920-932`), after the existing `if (ostrovAreaM2 > 0) optionLabels.push(...)` line, extend `extraLineItems` and `optionLabels`:

```js
      const quantityResult = readQuantityLineItems(QUANTITY_LINE_ITEMS);
      extraLineItems = extraLineItems.concat(quantityResult.items);
      optionLabels.push(...quantityResult.labels);
```

Add listeners for the 7 new inputs near the `EDGE_LINE_ITEMS` listener loop added in Task 6:

```js
  QUANTITY_LINE_ITEMS.forEach(({ elId }) => {
    document.getElementById(elId).addEventListener('input', calculate);
  });
```

- [ ] **Step 3: Manual browser verification**

Reload the page:
1. Select "Столешницы на кухню" — «Вырезы» (4 fields) and «Отверстия» (3 fields) appear above «Дополнительно».
2. Select "Полы" — those two sub-sections are gone, but the "Кромка" field from Task 6 is still present.
3. Enter `2` in "Смеситель, шт." — after filling in material/width/length, breakdown shows "отверстие под смеситель: 2 шт."; total price unchanged.

- [ ] **Step 4: Commit**

```bash
git add sayanmramor-calculator.html
git commit -m "feat: add cutout/hole quantity inputs for countertop product types"
```

---

### Task 8: HTML — expand «Дополнительно» (wall panel, figured island, bar counter)

**Files:**
- Modify: `sayanmramor-calculator.html`

**Interfaces:**
- Consumes: `readLengthLineItems`/`extraLineItems` pattern from Tasks 6–7. Introduces one more small reader, `readAreaLineItems`, for width+length pairs.

- [ ] **Step 1: Update the markup**

The existing `#countertopExtras` block currently ends with (after Task 7's edits moved бортик up; the фартук/остров pairs are unchanged from before this plan):

```html
        <div class="dims" style="margin-top:12px">
          <input type="number" id="extra-fartuk-width" placeholder="Фартук, ширина мм" min="0" step="1">
          <input type="number" id="extra-fartuk-length" placeholder="Фартук, длина мм" min="0" step="1">
        </div>
        <div class="dims" style="margin-top:12px">
          <input type="number" id="extra-ostrov-width" placeholder="Остров, ширина мм" min="0" step="1">
          <input type="number" id="extra-ostrov-length" placeholder="Остров, длина мм" min="0" step="1">
        </div>
      </div>
```

Relabel the existing острoв pair as "прямоугольный" (its `id`s and wiring stay exactly as-is — only the placeholder text changes) and append the 4 new pairs:

```html
        <div class="dims" style="margin-top:12px">
          <input type="number" id="extra-fartuk-width" placeholder="Фартук, ширина мм" min="0" step="1">
          <input type="number" id="extra-fartuk-length" placeholder="Фартук, длина мм" min="0" step="1">
        </div>
        <div class="dims" style="margin-top:12px">
          <input type="number" id="extra-ostrov-width" placeholder="Остров прямоугольный, ширина мм" min="0" step="1">
          <input type="number" id="extra-ostrov-length" placeholder="Остров прямоугольный, длина мм" min="0" step="1">
        </div>
        <div class="dims" style="margin-top:12px">
          <input type="number" id="extra-ostrov-figured-width" placeholder="Остров фигурный, ширина мм" min="0" step="1">
          <input type="number" id="extra-ostrov-figured-length" placeholder="Остров фигурный, длина мм" min="0" step="1">
        </div>
        <div class="dims" style="margin-top:12px">
          <input type="number" id="extra-wallpanel-width" placeholder="Стеновая панель, ширина мм" min="0" step="1">
          <input type="number" id="extra-wallpanel-length" placeholder="Стеновая панель, длина мм" min="0" step="1">
        </div>
        <div class="dims" style="margin-top:12px">
          <input type="number" id="extra-bar-standard-width" placeholder="Барная стойка стандартная, ширина мм" min="0" step="1">
          <input type="number" id="extra-bar-standard-length" placeholder="Барная стойка стандартная, длина мм" min="0" step="1">
        </div>
        <div class="dims" style="margin-top:12px">
          <input type="number" id="extra-bar-complex-width" placeholder="Барная стойка сложная, ширина мм" min="0" step="1">
          <input type="number" id="extra-bar-complex-length" placeholder="Барная стойка сложная, длина мм" min="0" step="1">
        </div>
      </div>
```

- [ ] **Step 2: Wire it up in the inline script**

Add the config array next to `QUANTITY_LINE_ITEMS`:

```js
  const AREA_LINE_ITEMS = [
    { rateId: 'EXTRA-05', widthElId: 'extra-ostrov-figured-width', lengthElId: 'extra-ostrov-figured-length', label: 'остров фигурный' },
    { rateId: 'EXTRA-03', widthElId: 'extra-wallpanel-width', lengthElId: 'extra-wallpanel-length', label: 'стеновая панель' },
    { rateId: 'EXTRA-06', widthElId: 'extra-bar-standard-width', lengthElId: 'extra-bar-standard-length', label: 'барная стойка стандартная' },
    { rateId: 'EXTRA-07', widthElId: 'extra-bar-complex-width', lengthElId: 'extra-bar-complex-length', label: 'барная стойка сложная' },
  ];
```

Add the reader function next to `readQuantityLineItems`:

```js
  function readAreaLineItems(configs) {
    const items = [];
    const labels = [];
    configs.forEach(({ rateId, widthElId, lengthElId, label }) => {
      const widthM = mmToM(parseFloat(document.getElementById(widthElId).value) || 0);
      const lengthM = mmToM(parseFloat(document.getElementById(lengthElId).value) || 0);
      const areaM2 = widthM * lengthM;
      if (areaM2 > 0) {
        items.push({ rate: getAdditionalWorkRate(rateId), quantity: areaM2 });
        labels.push(`${label}: ${areaM2.toFixed(2)} м²`);
      }
    });
    return { items, labels };
  }
```

In `calculate()`, right after the `quantityResult` lines added in Task 7:

```js
      const areaResult = readAreaLineItems(AREA_LINE_ITEMS);
      extraLineItems = extraLineItems.concat(areaResult.items);
      optionLabels.push(...areaResult.labels);
```

Add listeners for the 8 new inputs near the `QUANTITY_LINE_ITEMS` listener loop added in Task 7:

```js
  AREA_LINE_ITEMS.forEach(({ widthElId, lengthElId }) => {
    document.getElementById(widthElId).addEventListener('input', calculate);
    document.getElementById(lengthElId).addEventListener('input', calculate);
  });
```

- [ ] **Step 3: Manual browser verification — full smoke test across all 9 product types**

Reload the page and, for each of the 9 product-type cards, click it and confirm:
- **Лестницы, Панно, Подоконники, Полы, Стены, Фасады, Ступени**: "Вариант исполнения" select populates (Task 5) with the counts from Task 1's test (13/4/5/5/5/5/4 respectively); "Кромка" field is visible; "Дополнительные позиции" (вырезы/отверстия/бортик/фартук/остров×2/панель/барная стойка×2) is hidden.
- **Столешницы в ванную, Столешницы на кухню**: same as above, plus "Дополнительные позиции" is visible with all 4+3+7=14 new/existing fields.

Then, with "Столешницы на кухню" selected, a material picked, and width/length filled in:
1. Enter `900` / `1500` into "Остров фигурный, ширина/длина мм" — breakdown shows "остров фигурный: 1.35 м²".
2. Enter `2` into "Розетка, шт." — breakdown shows "отверстие под розетку: 2 шт.".
3. Enter `3000` into "Кромка → Прямая, мм" — breakdown shows "кромка прямая: 3.00 м.п.".
4. Confirm the total price (`≈ ... ₽`) is identical to what it was before entering any of these three values — every new rate is `null`, so `catalogExtras` stays 0.

- [ ] **Step 4: Run the full automated suite one more time**

Run: `node --test tests/*.test.js`
Expected: PASS, full count 104 (the 80 tests present before this plan + 17 new in `tests/rate-catalog.test.js` (Tasks 1-3) + 7 new `extraLineItems`/`catalogExtras` cases added to `tests/pricing.test.js` in Task 4)

- [ ] **Step 5: Commit**

```bash
git add sayanmramor-calculator.html
git commit -m "feat: expand additional-works catalog UI (wall panel, figured island, bar counter)"
```
