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
  Ступени / м²); 9 rows (`INST-*`, one per product category, all with
  `shape='Монтаж'`, `variant='Монтаж на объекте'`, `unit='м²'`) mirror
  the installation rate that already exists in the calculator as
  `WORK_RATES[key].installationRatePerM2`. **All 59 rows are kept in
  the data model** — the `INST-*` rows are not dropped just because
  they don't drive pricing yet; they live in their own array,
  `INSTALLATION_RATES`, separate from `PRODUCT_SUBCATEGORIES` (see
  below).
- **«Дополнительные работы»** — 19 rows: `ID, Группа, Операция,
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
  // ... all 19 rows from «Дополнительные работы», in sheet order
];

// The 9 INST-* rows from «Ставки изделий» -- kept as their own array, in the
// same row shape as PRODUCT_SUBCATEGORIES, rather than folded into it: there
// is exactly one per product category (not several shape/variant options),
// and it is a distinct pricing concept that already has a live UI+field
// (the "Монтаж на объекте" checkbox -> WORK_RATES[key].installationRatePerM2).
// Kept for completeness/traceability of the source spreadsheet -- see
// "Installation rows" below for why nothing reads from this array yet.
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

function getSubcategoriesForProduct(categoryLabel) {
  return PRODUCT_SUBCATEGORIES.filter(row => row.categoryLabel === categoryLabel);
}

function getAdditionalWorkRate(id) {
  const row = ADDITIONAL_WORKS.find(r => r.id === id);
  return row ? row.rate : null;
}

function getInstallationRow(categoryLabel) {
  return INSTALLATION_RATES.find(row => row.categoryLabel === categoryLabel) || null;
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

## Availability configuration: declarative per-product capability flags

**Revised 2026-09-20, before implementation started on this section.**
The first draft of this spec gated «Кромка» on "any product type" and
gated the rest of the additional-works UI on the single existing
`supportsCountertopExtras` flag for both countertop product types
identically. Real-world UX review found this too coarse in both
directions: some non-countertop products (Полы, Стены, Фасады, Панно)
have no business showing an open-edge finishing option at all, and the
two countertop types themselves need different additional-work items
(a bathroom vanity has no cooktop, island, or bar counter).

The fix is **declarative per-product capability flags on `PRODUCTS` in
`product-types.js`**, read by the UI as plain booleans — never a chain
like `if (selectedProductKey === 'pol') { ... }`. Every additional-work
UI block/field checks exactly one boolean on the currently selected
product; adding a new work item later means adding one new flag and
one new `if (product.newFlag) { ... }` block, without touching any
other block's code.

Two flag "levels" are needed, chosen to keep the existing,
already-shipped `supportsCountertopExtras` flag (predates this spec,
gates the original bortik/fartuk/rectangular-island feature) working
exactly as it does today, unrenamed and unmoved:

```js
// product-types.js -- PRODUCTS entries gain up to three new fields.
// Absent = false everywhere (existing truthy checks on supportsCountertopExtras
// already treat "missing" as falsy, so no product needs an explicit `false`
// unless it wants to document one for a human reader).
const PRODUCTS = {
  lestnitsa:            { label: "Лестницы",              type: 'B', supportsEdgeWork: true },
  panno:                { label: "Панно",                 type: 'B' },
  podokonnik:            { label: "Подоконники",           type: 'A', supportsEdgeWork: true },
  pol:                   { label: "Полы",                  type: 'B' },
  stena:                 { label: "Стены",                 type: 'B' },
  fasad:                 { label: "Фасады",                type: 'B' },
  stoleshnitsa_vannaya:  {
    label: "Столешницы в ванную", type: 'A',
    supportsEdgeWork: true,
    supportsCountertopExtras: true,        // unchanged flag, unchanged meaning
    additionalWorks: { cooktopCutout: false, island: false, barCounter: false }
  },
  stoleshnitsa_kuhnya:   {
    label: "Столешницы на кухню", type: 'A',
    supportsEdgeWork: true,
    supportsCountertopExtras: true,
    additionalWorks: { cooktopCutout: true, island: true, barCounter: true }
  },
  stupeni:               { label: "Ступени",               type: 'A', supportsEdgeWork: true }
};
```

- **`supportsEdgeWork`** (new, flat boolean, same style as the existing
  `supportsCountertopExtras`) -- gates the whole «Кромка» block as one
  unit for all 5 edge variants. There is no per-edge-variant flag: the
  matrix below never needs one variant of «Кромка» on but another off
  for the same product.
- **`supportsCountertopExtras`** (existing flag, meaning unchanged) --
  still gates the base countertop-extras group exactly as it does
  today: sink cutouts (3 variants), all 3 holes, бортик, фартук,
  стеновая панель. `COUNTERTOP_EXTRAS_RATES` and its wiring
  (`bortikRatePerM`/`fartukRatePerM2`/`ostrovRatePerM2` in
  `pricing.js`) are **not touched or renamed** by this revision.
- **`additionalWorks: { cooktopCutout, island, barCounter }`** (new,
  nested -- only these three items differ between the two countertop
  product types, so they get their own flags rather than forcing a
  third top-level boolean per item). Read as `product.additionalWorks
  && product.additionalWorks.X`, matching the plain ES5-safe syntax
  the rest of `sayanmramor-calculator.html` already uses (no optional
  chaining).

**Rejected alternative:** folding `supportsCountertopExtras` itself
into `additionalWorks` (e.g. `additionalWorks.sinkCutout`,
`.bortik`, `.fartuk`, `.wallPanel`, alongside `.cooktopCutout`,
`.island`, `.barCounter`) for full uniformity. Rejected because
`supportsCountertopExtras` is read today by code that predates this
entire spec (the original bortik/fartuk/island feature); renaming or
relocating it would require touching and re-verifying that
already-shipped, already-tested code path for no behavioral gain. If
a future redesign wants full uniformity, that is its own task.

`ADDITIONAL_WORKS` in `rate-catalog.js` is **not changed by this
revision** -- it stays the single global catalog of every possible
additional-work row (all 19, `EDGE-*`/`CUT-*`/`EXTRA-*`), regardless of
which products currently expose which rows in their UI. Availability
is entirely a `PRODUCTS`-config concern; the rate catalog never
shrinks just because today's UI doesn't surface one of its rows for a
given product.

## Availability matrix

✅ = the field/block is shown for this product. ❌ = hidden. Every row
is driven by the flags above -- no per-product `if` in the UI logic.

| Product | Кромка (`supportsEdgeWork`) | Вырез: раковина ×3 | Вырез: варочная панель (`additionalWorks.cooktopCutout`) | Отверстия ×3 | Бортик | Фартук | Стеновая панель | Остров ×2 (`additionalWorks.island`) | Барная стойка ×2 (`additionalWorks.barCounter`) |
|---|---|---|---|---|---|---|---|---|---|
| Лестницы | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Панно | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Подоконники | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Полы | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Стены | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Фасады | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Столешницы в ванную | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Столешницы на кухню | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ступени | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

The "вырез: раковина ×3 / отверстия ×3 / бортик / фартук / стеновая
панель" columns are all driven by the same single
`supportsCountertopExtras` flag (always on together, always off
together, in this matrix) -- listed as separate columns only for
readability against the source matrix, not because each has its own
flag.

**Design principle for future work items (Панно / Стены / Фасады):**
if the company later wants edge-like finishing on a panel edge, a wall
corner/niche, or a façade element's edge, that is a **new, separate**
additional-work item (a new `rate-catalog.js` row + a new capability
flag + a new UI field) -- never achieved by flipping `supportsEdgeWork`
to `true` for those products and reusing the generic «Кромка» rows.
The generic «Кромка» concept (`EDGE-01/03/04/05/06`) means "an open
stone edge on a slab-like product where edge finishing is standard
practice" (столешницы, подоконники, лестницы, ступени) -- it is not a
catch-all for "any product that might someday need some edge treated."

**Design principle for Полы:** a floor's perimeter is not treated as
«Кромка» -- showing 5 edge-length inputs for an ordinary floor area
would be confusing UI noise for a field that (per the company) isn't
priced as edge work in practice. Skirting boards, thresholds, borders,
and similar floor-specific trim are, if the company ever introduces
them, separate future additional-work items with their own capability
flag -- not routed through `supportsEdgeWork`.

## UI: additional-works block

Replaces and extends the current `#countertopExtras` block. Every
sub-block below is gated by reading the relevant flag from the
currently selected `PRODUCTS[key]` entry (see the availability matrix
above) -- the UI code itself contains no product-identity branching.

- **Кромка** (5 number inputs, м.п. — прямая/фигурная/скругление/
  скос/подгиб камнем, catalog ids `EDGE-01,03,04,05,06`) — shown when
  `product.supportsEdgeWork` is true.
- **Вырезы**: раковина накладная/подшивная/интегрированная (3 quantity
  inputs, шт., ids `CUT-01..03`) shown when `product.supportsCountertopExtras`;
  варочная панель (1 quantity input, шт., id `CUT-04`) shown only when
  `product.supportsCountertopExtras && product.additionalWorks &&
  product.additionalWorks.cooktopCutout` (true only for
  `stoleshnitsa_kuhnya` today).
- **Отверстия** (3 quantity inputs, шт. — смеситель/розетка/дозатор,
  ids `CUT-05..07`) — shown when `product.supportsCountertopExtras`.
- **Дополнительно**, `product.supportsCountertopExtras` gate unless noted:
  - Бортик (`extra-bortik`, м.п.) and Фартук (`extra-fartuk-width/length`,
    м²) — **existing fields, unchanged**, still wired to
    `COUNTERTOP_EXTRAS_RATES.bortikRatePerM` /
    `fartukRatePerM2` exactly as today.
  - Стеновая панель (width+length, `EXTRA-03`) — shown when
    `product.supportsCountertopExtras`.
  - Остров прямоугольный — existing `extra-ostrov-width/length` pair,
    relabeled "Остров прямоугольный", keeps its existing wiring to
    `ostrovRatePerM2` unchanged (catalog id `EXTRA-04`, for
    traceability only — not read from the catalog). Shown when
    `product.supportsCountertopExtras && product.additionalWorks &&
    product.additionalWorks.island`.
  - Остров фигурный/радиусный (width+length, `EXTRA-05`) — same
    `additionalWorks.island` gate as the rectangular pair, so both
    island variants appear/disappear together.
  - Барная стойка стандартная и сложная/радиусная (width+length each,
    `EXTRA-06`/`EXTRA-07`) — shown when `product.supportsCountertopExtras
    && product.additionalWorks && product.additionalWorks.barCounter`.

## Installation rows (`INST-*`): kept as data, not wired or rendered yet

`INSTALLATION_RATES` is populated with all 9 rows (one per product
category, all `rate: null`) so the catalog is a complete, faithful
mirror of «Ставки изделий» — nothing from the source spreadsheet is
silently dropped just because a live equivalent already exists.

At this stage it is **inert on both sides**:

- **UI**: no new element is added for it. The existing "Монтаж на
  объекте" checkbox (`#opt-install`) already is the installation UX
  for every product type, today driven by
  `WORK_RATES[key].installationRatePerM2`. Rendering a second,
  parallel "installation rate" control from `INSTALLATION_RATES` at
  this point would just duplicate that checkbox with a control that
  does nothing (its rate is `null`).
- **Pricing**: `getInstallationRow`/`INSTALLATION_RATES` is not called
  from `computeWorkAndTotal`/`calculatePrice`. Installation cost keeps
  coming from `WORK_RATES[key].installationRatePerM2`, unchanged.

This mirrors exactly how the main subcategory rate
(`PRODUCT_SUBCATEGORIES[i].rate`) is handled: present in the data
model, visible nowhere new in pricing math, deferred to the same
follow-up task that will decide how the filled-in Excel rates
(subcategory *and* installation) eventually replace or combine with
`WORK_RATES[key].fabricationRatePerM2` /
`WORK_RATES[key].installationRatePerM2`.

## Pricing: additive generic mechanism, existing code untouched

`bortikLengthM` / `fartukAreaM2` / `ostrovAreaM2` in
`computeWorkAndTotal`/`calculatePrice` stay exactly as implemented and
tested today — no changes to their fields, defaults, or clamping.

A new optional parameter is added alongside them. Note this is a
correction from an earlier draft of this spec, applied during planning:
`pricing.js` must stay a dependency-free pure module (it never
`require`s `rate-catalog.js`, exactly like it never required
`product-types.js` before), so the **caller** (the HTML script)
resolves `rateId → rate` via `RateCatalog.getAdditionalWorkRate`
*before* building `extraLineItems` — `pricing.js` itself never looks
up a rate by id:

```js
computeWorkAndTotal(subtotal, area, rates, options, extraDimensions, extraLineItems)
// extraLineItems: [{ rate: 4000 /* or null */, quantity: 3.2 }, ...]
// -- rate is already resolved by the caller; pricing.js never imports rate-catalog.js.
```

`extraLineItems` computes `catalogExtras = Σ max(0, quantity_i) ×
(rate_i || 0)` and adds it into `work` and `total` the same way
`extras` does today; the return value gains a new `catalogExtras`
field (no existing test asserts the full shape of the returned object,
so this is additive and non-breaking). Omitting `extraLineItems`
defaults `catalogExtras` to 0, matching the backward-compatibility
behavior already established for `extraDimensions`.

The four new width+length "Дополнительно" items (wall panel,
figured island, both bar-counter variants), plus edge/cuts/holes, all
flow through `extraLineItems`. Because every rate in `ADDITIONAL_WORKS`
is `null` right now, `catalogExtras` is always 0 — the total price
shown to customers does not change.

## Testing

- New `tests/rate-catalog.test.js`: row counts (50 + 19 + 9), unique
  `id`s across all three arrays, every `PRODUCTS` label has at least
  one matching row in `getSubcategoriesForProduct`, valid `unit`
  values, and every `PRODUCTS` label has exactly one row in
  `INSTALLATION_RATES` (`getInstallationRow` returns non-null for all
  9 categories, and never for an unknown label).
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
- Manual verification must now walk the full **availability matrix**
  above, not just "countertop vs. non-countertop": for every one of
  the 9 product types, confirm exactly the ✅/❌ cells shown in the
  matrix — in particular that `stoleshnitsa_vannaya` shows sink cutouts
  but not the cooktop cutout, island, or bar counter, while
  `stoleshnitsa_kuhnya` shows all of them; and that Полы/Стены/Фасады/
  Панно show no additional-works UI at all (not even «Кромка»).
- A new `product-types.test.js` case (or extension of the existing
  `supportsCountertopExtras is true on exactly ...` test) should assert
  `supportsEdgeWork` is `true` on exactly `lestnitsa`, `podokonnik`,
  `stoleshnitsa_vannaya`, `stoleshnitsa_kuhnya`, `stupeni`, and that
  `additionalWorks.island`/`.barCounter`/`.cooktopCutout` are `true`
  only on `stoleshnitsa_kuhnya`.

## Explicitly out of scope (follow-up work)

- Filling in any real rate value in `PRODUCT_SUBCATEGORIES` or
  `ADDITIONAL_WORKS` — all stay `null` until the company provides
  data.
- Deciding how a filled-in subcategory rate (or a filled-in
  `INSTALLATION_RATES` row) should replace or combine with
  `WORK_RATES[key].fabricationRatePerM2` /
  `installationRatePerM2` — a separate task once real data exists.
- Discount/markup (% of total) from the «Логика цены» sheet — no UI
  or calculation exists for it yet; not introduced by this task.
- Converting the two other in-flight tasks (country filter, mm input)
  — tracked and implemented separately, unrelated to this data model.
