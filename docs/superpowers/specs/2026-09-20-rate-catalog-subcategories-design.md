# Design: product subcategories + additional-works rate catalog

## Goal

The company supplied `Ставки_для_калькулятора.xlsx`, a detailed rate
structure for future pricing: per-product-type subcategories (shape /
configuration variants) and a general catalog of additional works
(cutouts, holes, edge treatment, countertop extras). All rates in the
file are empty — the company will fill them in later.

This task implements **only the structure**: selectable subcategory
fields per product type, quantity/length inputs for additional works,
and a data catalog to hold the (currently `null`) rates — matching the
existing convention already used for `MISC_FLAT_SUM`,
`MISC_RATE_PER_M2`, and `COUNTERTOP_EXTRAS_RATES` in
[product-types.js](../../../product-types.js). No rate values are
invented. No change to the price the calculator currently shows to
customers.

## Source data

`Ставки_для_калькулятора.xlsx` has three relevant sheets:

- **«Ставки изделий»** — 59 rows: `ID, Категория, Подраздел/форма,
  Вариант/комплектация, Ед. расчёта, Ставка, Валюта, Монтаж`. 50 rows
  are product subcategories (e.g. `STAIR-01` / Лестницы / Прямая /
  Ступени / м²); 9 rows (`INST-*`) are one flat installation rate per
  product category — these already exist as
  `WORK_RATES[key].installationRatePerM2` and are excluded from the
  new catalog to avoid a duplicate concept.
- **«Дополнительные работы»** — 21 rows: `ID, Группа, Операция,
  Вариант, Ед. расчёта, Ставка, Валюта, Примечание`. Groups: Вырезы
  (raковина ×3 variants, варочная панель), Отверстия (смеситель,
  розетка, дозатор), Кромка (5 variants), Дополнительно (бортик,
  фартук, стеновая панель, остров ×2 variants, барная стойка ×2
  variants).
- **«Логика цены»** — confirms: main product line = area/count ×
  subcategory rate; each additional-work line = quantity × its own
  rate; installation = area/count × the category's installation rate;
  discount/markup = % of the total, applied separately (out of scope
  here — no discount/markup UI exists yet and none is added by this
  task).

`Категория` values in the sheet are byte-for-byte identical to
`PRODUCTS[key].label` in `product-types.js` (verified for all 9
types), so no separate product↔category mapping table is needed.

## Data model: new file `rate-catalog.js`

A new UMD module (same pattern as `pricing.js`/`product-types.js`/
`material-picker.js`), kept separate from `product-types.js` because
it is a different concern (a fill-in-later rate table, not product
identity) and `product-types.js` is already large.

```js
const PRODUCT_SUBCATEGORIES = [
  { id: 'STAIR-01', categoryLabel: 'Лестницы', shape: 'Прямая', variant: 'Ступени', unit: 'м²', rate: null, currency: null },
  // ... all 50 non-INST rows from «Ставки изделий», in sheet order
];

const ADDITIONAL_WORKS = [
  { id: 'CUT-01', group: 'Вырезы', operation: 'Раковина', variant: 'Накладная', unit: 'шт.', rate: null, currency: null },
  // ... all 21 rows from «Дополнительные работы», in sheet order
];

function getSubcategoriesForProduct(categoryLabel) {
  return PRODUCT_SUBCATEGORIES.filter(row => row.categoryLabel === categoryLabel);
}

function getAdditionalWorkRate(id) {
  const row = ADDITIONAL_WORKS.find(r => r.id === id);
  return row ? row.rate : null;
}
```

`unit` keeps the literal Cyrillic strings from the sheet (`'м²'`,
`'шт.'`, `'компл.'`, `'м.п.'`) rather than an internal enum — one less
translation layer to keep in sync with the source spreadsheet if the
company edits and resends it.

## UI: product subcategory selector

- A new `<select id="productSubcategory">` field, populated via
  `getSubcategoriesForProduct(product.label)` whenever a product type
  is chosen. Option label: `shape === 'Любая' ? variant : shape + ' — ' + variant`.
  Hidden until a product type is selected (same visibility rule as
  the existing `#countertopExtras` block).
- When the selected row's `unit === 'шт.'`, reveal a number input
  `#subcategoryQty` ("Количество, шт."). Rows with `unit === 'компл.'`
  imply a quantity of 1 and get no extra input. Rows with
  `unit === 'м²'` reuse the product's own width/length.
- The selection (and quantity, if shown) is **not passed to
  `Pricing.calculatePrice`**. It is captured only for display in the
  breakdown panel (e.g. an extra "Вариант: Прямая — Ступени" line),
  the same way `product.label` is shown today. This keeps the
  customer-visible total price unchanged until the company fills in
  `PRODUCT_SUBCATEGORIES[i].rate` — deferred to a follow-up task, at
  which point that task also decides how a filled-in subcategory rate
  should relate to `WORK_RATES[key].fabricationRatePerM2`.

## UI: additional-works block

Replaces and extends the current `#countertopExtras` block:

- **Кромка** (5 number inputs, м.п. — прямая/фигурная/скругление/
  скос/подгиб камнем, catalog ids `EDGE-01,03,04,05,06`) — shown for
  **all 9 product types**, since an edge treatment can apply to any
  flat stone piece.
- **Вырезы** (4 quantity inputs, шт. — раковина накладная/подшивная/
  интегрированная, варочная панель, ids `CUT-01..04`) and
  **Отверстия** (3 quantity inputs, шт. — смеситель/розетка/дозатор,
  ids `CUT-05..07`) — shown only when `product.supportsCountertopExtras`
  (unchanged flag, still exactly `stoleshnitsa_vannaya` and
  `stoleshnitsa_kuhnya`), since cutouts for a sink/cooktop have no
  meaning outside a countertop.
- **Дополнительно**, same `supportsCountertopExtras` gate:
  - Бортик (`extra-bortik`, м.п.) and Фартук (`extra-fartuk-width/length`,
    м²) — **existing fields, unchanged**, still wired to
    `COUNTERTOP_EXTRAS_RATES.bortikRatePerM` /
    `fartukRatePerM2` exactly as today.
  - Остров — existing `extra-ostrov-width/length` pair is relabeled
    "Остров прямоугольный" and keeps its existing wiring to
    `ostrovRatePerM2` unchanged (catalog id `EXTRA-04`, for
    traceability only — not read from the catalog).
  - New: "Остров фигурный/радиусный" (width+length, `EXTRA-05`),
    "Стеновая панель" (width+length, `EXTRA-03`), "Барная стойка
    стандартная" and "Барная стойка сложная/радиусная" (width+length
    each, `EXTRA-06`/`EXTRA-07`) — four new width+length pairs, same
    UX pattern as фартук/остров today.

## Pricing: additive generic mechanism, existing code untouched

`bortikLengthM` / `fartukAreaM2` / `ostrovAreaM2` in
`computeWorkAndTotal`/`calculatePrice` stay exactly as implemented and
tested today — no changes to their fields, defaults, or clamping.

A new optional parameter is added alongside them:

```js
computeWorkAndTotal(subtotal, area, rates, options, extraDimensions, extraLineItems)
// extraLineItems: [{ rateId: 'EDGE-01', quantity: 3.2 }, ...]
```

`extraLineItems` computes `catalogExtras = Σ max(0, quantity_i) ×
(getAdditionalWorkRate(rateId_i) || 0)` and adds it into `work` and
`total` the same way `extras` does today; the return value gains a new
`catalogExtras` field (no existing test asserts the full shape of the
returned object, so this is additive and non-breaking). Omitting
`extraLineItems` defaults `catalogExtras` to 0, matching the
backward-compatibility behavior already established for
`extraDimensions`.

The four new width+length "Дополнительно" items (wall panel,
figured island, both bar-counter variants), plus edge/cuts/holes, all
flow through `extraLineItems`. Because every rate in `ADDITIONAL_WORKS`
is `null` right now, `catalogExtras` is always 0 — the total price
shown to customers does not change.

## Testing

- New `tests/rate-catalog.test.js`: row counts (50 + 21), unique
  `id`s, every `PRODUCTS` label has at least one matching row in
  `getSubcategoriesForProduct`, valid `unit` values.
- Extend `tests/pricing.test.js` with `extraLineItems`/`catalogExtras`
  cases mirroring the existing bortik/fartuk/ostrov tests: null rate
  → 0, negative quantity clamped to 0, omitted parameter defaults to
  0, multiple line items sum independently.
- No changes to existing `pricing.test.js` /
  `pricing-product-types-integration.test.js` cases for
  `extraDimensions` — they continue to pass unmodified.
- UI (`sayanmramor-calculator.html`) has no automated test today
  (inline script); verified manually in-browser per product type,
  same as the existing countertop-extras block.

## Explicitly out of scope (follow-up work)

- Filling in any real rate value in `PRODUCT_SUBCATEGORIES` or
  `ADDITIONAL_WORKS` — all stay `null` until the company provides
  data.
- Deciding how a filled-in subcategory rate should replace or combine
  with `WORK_RATES[key].fabricationRatePerM2` — a separate task once
  real data exists.
- Discount/markup (% of total) from the «Логика цены» sheet — no UI
  or calculation exists for it yet; not introduced by this task.
- Converting the two other in-flight tasks (country filter, mm input)
  — tracked and implemented separately, unrelated to this data model.
