# Ставки компании v2 — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** калькулятор считает работу по ставкам компании из таблицы v2 — по выбранному типу изделия, с коэффициентом камня, подсветкой, кромкой по длине открытых кромок, швами, замером/доставкой, разгрузкой/расходниками и минимальным заказом.

**Architecture:** все ставки компании — данные в `rate-catalog.js` (ID из таблицы v2); `product-types.js` больше не держит ставок. `ConstructorState.buildPricingInputs` превращает выбранный тип, камень и опции в `rates` + `extraLineItems`; `pricing.js` только суммирует. Длину кромки считает новый чистый модуль `edge-length.js` по сцене `SceneLayout` — по тому же правилу «открыто в комнату», что и 3D.

**Tech Stack:** статический HTML + UMD-модули на vanilla JS, тесты `node --test tests/*.test.js` (node:test + assert/strict).

**Spec:** `docs/superpowers/specs/2026-11-08-company-rates-v2-design.md` — все цифры ставок брать оттуда (таблицы «Ставки изделий», «Доп. работы», «Прочее», «Коэффициент вида камня»).

## Global Constraints

- Рабочая папка: `D:\calculator\.worktrees\rate-catalog-subcategories`, ветка `stone-gradient`. Не пушить, не публиковать — публикация только по слову владельца.
- Ставка в коде существует ровно один раз — в `rate-catalog.js`. Никаких выдуманных ставок; «—» в спеке = `null`.
- Валюта только ₽; поля `currency` удаляются.
- Коэффициент камня — по `stone.category` из `data/slabs.json`; неизвестный вид → 1; клиенту не показывается.
- Толщина, НДС, доставка по км (MISC-03), наценка MISC-08 — не подключаются.
- Сноска дословно: «* Расчёт указан для объектов, находящихся в Москве и Московской области».
- Подписи для клиента — по-русски, в стиле существующих строк.
- 3D внешне не меняется.
- Перед каждым коммитом: `node --test tests/*.test.js` — всё зелёное (изменённые тесты — часть задачи).

## Review Focus

1. **Камень вида, которого нет в таблице коэффициентов** (сланец, новый вид парсера, `category` пустой) — цена считается с ×1, без ошибки и без подписи. Тест — в Task 3.
2. **Клиент сменил тип на тот, где нет полировки, при включённой галочке** — галочка скрывается, снимается и не попадает в цену. Тест — в Task 4.
3. **Г-столешница, чьи крылья ещё не введены (0 мм)** — угловой шов не начисляется, пока крыла нет. Тест — в Task 5.
4. **Кромка не выбрана** (`edge-type` пуст) или изделие без кромки (пол, стена) — 0 ₽ за кромку, строки нет. Тест — в Task 6.
5. **Очень маленькое изделие** (подоконник 300×200 мм без замера и доставки) — итог ровно 20 000 ₽ и пометка о минимальном заказе в паспорте. Тест — в Task 7.

---

### Task 1: Подступенки лестницы — отдельный признак, а не ID типа

Сейчас «с подступенками» у лестницы закодировано в ID STAIR-02/04/06/08 (`card.ids[stairRisers ? 1 : 0]`, `GeometryModel.STAIR_WITH_RISERS`). Task 2 удалит эти ID, поэтому сначала признак выносится отдельно. Внешне ничего не меняется.

**Files:**
- Modify: `sayanmramor-calculator.html` (разметка рядом с `#stairRiserField`, `applyTypeSelection` ~3812, `TYPE_CARDS.lestnitsa` ~2347)
- Modify: `constructor-state.js` (~204–209, `productConfig.lestnitsa`)
- Modify: `visualizer/geometry-model.js` (~44–49, ~341)
- Test: `tests/constructor-state.test.js`, `tests/visualizer-scene.test.js` (и все тесты, где лестница с подступенками задана через STAIR-02/04/06/08 — перевести на признак)

**Interfaces:**
- Produces: скрытый `<input type="checkbox" id="stair-risers" hidden>`; `state.productConfig.lestnitsa.risers: boolean`; `GeometryModel` читает `cfg.risers` вместо `STAIR_WITH_RISERS.includes(id)`. `STAIR_WITH_RISERS` удаляется из экспорта. `STAIR_SHAPES` остаётся, но только с ключами STAIR-01/03/05/07.

- [ ] **Step 1: Тест** — в `constructor-state.test.js`: `'stair risers come from #stair-risers, not from the type id'` — документ-заглушка с `productSubcategory = 'STAIR-03'` и `stair-risers.checked = true` → `state.productConfig.lestnitsa.risers === true`, `riserHeightM` из `riser-height`; с `checked = false` → `false` и `riserHeightM === 0`. В `visualizer-scene.test.js`: модель лестницы STAIR-01 с `productConfig.lestnitsa.risers = true` даёт части-подступенки, с `false` — нет.
- [ ] **Step 2: Запустить** `node --test tests/constructor-state.test.js tests/visualizer-scene.test.js` — FAIL.
- [ ] **Step 3: Реализовать.** Карточки лестницы: `ids: ['STAIR-01']`, `['STAIR-03']`, `['STAIR-05']`, `['STAIR-07']`. `applyTypeSelection` ставит `stairRisersInput.checked = stairRisers` (только у `lestnitsa`; у других — `false`). `constructor-state` читает `d.getElementById('stair-risers').checked` при `selectedProductKey === 'lestnitsa'`. Восстановление из URL/паспорта, если оно читает риcеры из ID, — перевести на признак.
- [ ] **Step 4: Запустить** весь набор `node --test tests/*.test.js` — PASS.
- [ ] **Step 5: Коммит** `refactor: stair risers are their own flag, not part of the type id`.

---

### Task 2: Каталог ставок v2 в `rate-catalog.js`

**Files:**
- Modify: `rate-catalog.js` (весь файл)
- Modify: `sayanmramor-calculator.html` (подписи/ID в `TYPE_CARDS`, если подпись строки v2 отличается; `subcategoryLabel`)
- Modify: `step-engine.js:69` и `product-types.js:62` — только комментарии со старыми ID
- Test: `tests/rate-catalog.test.js` (переписать), прочие тесты со старыми ID

**Interfaces:**
- Produces (экспорт `RateCatalog`):
  - `PRODUCT_SUBCATEGORIES`: строки `{ id, categoryLabel, shape, variant, unit: 'м²', fabricationRatePerM2, installationRatePerM2, polishRatePerM2 }` — ровно ID из таблицы «Ставки изделий» спеки (45 строк, включая STAIR-11). Поля `rate`, `currency` удаляются.
  - `getSubcategoriesForProduct(categoryLabel)` — как сейчас.
  - `getProductRates(id) -> { fabricationRatePerM2, installationRatePerM2, polishRatePerM2 } | null`
  - `hasPolishRate(id) -> boolean` (true, только если полировка — конечное число)
  - `countertopTypeId(productKey, shape) -> string | null`: `stoleshnitsa_kuhnya` + `straight|lshape|ushape` → `KITCHEN-11|12|13`; `stoleshnitsa_vannaya` → `BATH-01|02|03`; иначе `null`.
  - `RISER_RATES = { id: 'RISER-00', fabricationRatePerM2: 5000, installationRatePerM2: 5000, polishRatePerM2: null }`
  - `ADDITIONAL_WORKS`: строки `{ id, group, operation, variant, unit, rate, installRate }` — CUT-01…07, EDGE-01/03/04/05/06, EXTRA-01…07, SEAM-01, LIGHT-01 с цифрами из спеки; `installRate` — колонка «Монтаж» (`null` там, где «—»). Единица CUT-03 — `м.п.`.
  - `getAdditionalWorkRate(id) -> number | null`, `getAdditionalWorkInstallRate(id) -> number | null`
  - `MISC = { measure: 15000, delivery: 12000, unloadingPerM2: 3500, consumablesPerM2: 2500, complexShapeMultiplier: 1.5, minOrder: 20000 }` (у каждого поля комментарий с ID MISC-01/02/04/05/06/07)
  - `STONE_COEFFICIENTS` — таблица из спеки (15 ключей) и `stoneCoefficient(category) -> number` (не найден / пусто → 1).
  - `INSTALLATION_RATES` и `getInstallationRow` удаляются.
- Шапка файла: комментарий «Ставки компании — таблица v2 (Ставки_для_калькулятора_заполненные_v2.xlsx), заполнена 2026-11-08».

- [ ] **Step 1: Тесты** в `rate-catalog.test.js` (старые тесты про `rate: null` и 56 строк удалить):
  - `'PRODUCT_SUBCATEGORIES ids are exactly the v2 table'` — `ids.sort()` равен отсортированному списку 45 ID из спеки; уникальны.
  - `'getProductRates returns the company rates'` — `KITCHEN-12` → `{40000, 20000, 18000}`; `SILL-04` → `{45000, 30000, 18000}`; `STEP-03` → `{90000, 40000, null}`; `FACADE-05` → `{200000, 50000, null}`; `FIREPLACE-03` → `{25000, 30000, 20000}`; `'KITCHEN-01'` → `null`.
  - `'hasPolishRate'` — `true` для `FLOOR-01`, `FACADE-03`; `false` для `STEP-01`, `STAIR-07`, `FACADE-02`, `FACADE-06`, `FACADE-07`, `FACADE-08`, `FACADE-05`.
  - `'countertopTypeId'` — `('stoleshnitsa_kuhnya','lshape') === 'KITCHEN-12'`, `('stoleshnitsa_vannaya','ushape') === 'BATH-03'`, `('pol','straight') === null`.
  - `'additional works rates'` — `CUT-02` 20000; `EDGE-05` 1000; `EXTRA-04` rate 40000, installRate 50000; `EXTRA-01` installRate `null`; `SEAM-01` 25000; `LIGHT-01` 110000.
  - `'stoneCoefficient'` — `granite` 1.3, `quartz-agglomerate` 1.3, `oniks` 1.5, `quartzite` 2, `agate` 3, `kvarc` 2, `soapstone` 2, `marble` 1, `slate` 1, `undefined` 1, `''` 1.
  - `'MISC'` — значения из Interfaces.
  - `'every TYPE_CARDS id exists in the catalog'` — если такой тест есть в `calculator-markup.test.js`, обновить; если нет — добавить: каждый `ids[]` карточек из HTML есть в `PRODUCT_SUBCATEGORIES`.
- [ ] **Step 2: Запустить** `node --test tests/rate-catalog.test.js` — FAIL.
- [ ] **Step 3: Переписать `rate-catalog.js`** по Interfaces. Подписи `shape`/`variant` — по колонке «Строка» таблицы v2 (FACADE-02 «Обрамление окна / двери»). Карточки и подписи в HTML, которые ссылались на удалённые ID (KITCHEN-01…05, BATH-04, STEP-04, STAIR-02/04/06/08/09/10/12/13), — убрать/поправить; карточка фасада FACADE-02 берёт заголовок из `facade-model.js` — его не трогать.
- [ ] **Step 4: Запустить** весь набор — PASS. Падающие тесты, которые читали `rate`/`currency`/`INSTALLATION_RATES`, — переписать под новые поля.
- [ ] **Step 5: Коммит** `feat: company rate table v2 in rate-catalog.js`.

---

### Task 3: Работа по ставке типа × коэффициент камня

**Files:**
- Modify: `constructor-state.js` (`buildPricingInputs` ~311–387; новая `resolveTypeId`)
- Modify: `product-types.js` (удалить `WORK_RATES`, `RISER_WORK_RATES`, `MISC_FLAT_SUM`, `MISC_RATE_PER_M2`, `COMPLEX_SHAPE_MULTIPLIER`, `COUNTERTOP_EXTRAS_RATES`, `COUNTERTOP_EXTRAS_INSTALL_RATES` и их экспорт; TODO про фильтр камня для кухни — удалить)
- Modify: `pricing.js` (`computeWorkAndTotal`, `calculatePrice` — площадки)
- Modify: `sayanmramor-calculator.html` (вызов `buildPricingInputs` ~4471; `EXTRA_RATES` ~4666 — читать из каталога)
- Test: `tests/constructor-state.test.js`, `tests/pricing-rules.test.js`, `tests/pricing-product-types-integration.test.js`, `tests/product-types.test.js` и прочие, читавшие удалённые константы

**Interfaces:**
- Consumes: Task 2 (`getProductRates`, `countertopTypeId`, `RISER_RATES`, `getAdditionalWorkRate`, `getAdditionalWorkInstallRate`, `MISC`, `stoneCoefficient`).
- Produces:
  - `ConstructorState.resolveTypeId(state) -> string | null` = `countertopTypeId(state.product && state.product.key, state.shape) || state.subcategory.id`.
  - `ConstructorState.buildPricingInputs(state, { catalog })` — `catalog` = объект `RateCatalog`; прежние поля конфига (`productRates`, `miscFlatSum`, `countertopExtrasRates`, `riserRates`, `extrasInstallRates`…) удаляются. Возвращает как сейчас `{ rates, extraLineItems, extraDimensions, areaM2, job, groupRates }`, где
    - `rates = { fabricationRatePerM2: тип.изг × k, installationRatePerM2, polishRatePerM2, complexShapeMultiplier: MISC.complexShapeMultiplier, landingRates: { fabricationRatePerM2: STAIR-11.изг × k, installationRatePerM2, polishRatePerM2 } | null }`; `k = stoneCoefficient(state.stone && state.stone.category)`.
    - `groupRates` riser: `{ fabricationRatePerM2: 5000 × k, installationRatePerM2: 5000, polishRatePerM2: null }`.
    - CUT-03 (интегрированная раковина, ₽/м.п.): `quantity = state.sinkCounts.integrated × длина выреза раковины вдоль столешницы, м` — длина из `GeometryModel.buildGeometryModel(state).sink.cut.lengthM` (та же, что рисует 3D). Нет длины → строка `{ rate: null }` (= «уточнит менеджер»), никогда не 1 м.
    - Элементы столешницы: работа EXTRA-01 (бортик, м.п.), EXTRA-02 (фартук), EXTRA-03, EXTRA-04/05 (остров), EXTRA-06/07 (стойка) — строками `extraLineItems` `{ rate: rate × k, quantity }`; монтаж — `{ rate: installRate, quantity: площадь, install: key }` при `installEnabled`. Поля `extraDimensions` бортика/фартука/острова и `bortikRatePerM`/`fartukRatePerM2`/`ostrovRatePerM2` в `rates` удаляются (всё через `extraLineItems`).
  - `Pricing.computeWorkAndTotal`: без `bortik/fartuk/ostrov`; площадки — отдельная сумма по `rates.landingRates` на площадь деталей `key === 'landing'` (основная площадь для ставки типа — `main` без площадок). `misc` пока 0 (Task 7).

- [ ] **Step 1: Тесты** (в `pricing-product-types-integration.test.js` или новом `tests/company-rates.test.js`, через `buildPricingInputs` + `calculatePrice` на заглушечном камне с одним слэбом):
  - `'kitchen L-shape uses KITCHEN-12'` — мрамор, `shape: 'lshape'`, монтаж и полировка включены → `fabrication === 40000 × S`, `installation === 20000 × S`, `polish === 18000 × S` (S — `mainAreaM2` задания).
  - `'stone coefficient multiplies fabrication only'` — тот же расчёт с `category: 'quartzite'` → `fabrication === 80000 × S`, `installation` и `polish` без изменений.
  - `'unknown stone category prices as x1'` — `category: 'slate'` и `category: undefined` → `fabrication === 40000 × S`.
  - `'complex shape stacks with the coefficient'` — гранит + сложная форма → `fabrication === 40000 × 1.3 × 1.5 × S`.
  - `'stair landings priced at STAIR-11'` — Г-лестница STAIR-03 с одной площадкой: изготовление = `50000 × S_ступеней + 50000 × S_площадки` (цифры равны, но тест проверяет, что площадка берётся из `landingRates`: подменить в тесте `catalog` с STAIR-11.изг = 1 и увидеть `+1 × S_площадки`).
  - `'risers use RISER-00 with the coefficient'` — ступени с подступенками, оникс → работа подступенков = `5000 × 1.5 × S_подст` (+ `5000 × S_подст` при монтаже).
  - `'island work and install from EXTRA-04'` — кухня с прямоугольным островом A м², кварцит, монтаж включён → в `extraLineItems` есть `{rate: 80000, quantity: A}` и `{rate: 50000, quantity: A, install: 'island'}`.
  - `'bortik from EXTRA-01'` — бортик 2 м, мрамор → `{ rate: 25000, quantity: 2 }`.
  - `'cuts are not multiplied by the coefficient'` — 1 подстольная раковина, агат → `{ rate: 20000, quantity: 1 }`.
  - `'integrated sink priced per metre of its cut'` — 1 интегрированная раковина, длина выреза L м по модели → `{ rate: 70000, quantity: L }`.
- [ ] **Step 2: Запустить** эти тесты — FAIL.
- [ ] **Step 3: Реализовать** по Interfaces. `calculate()` в HTML передаёт `{ catalog: RateCatalog }`. `EXTRA_RATES` в HTML (пометка «уточнит менеджер» для элементов без ставки) читает `getAdditionalWorkRate` по EXTRA-ID.
- [ ] **Step 4: Запустить** весь набор — PASS (старые тесты на `WORK_RATES`/`MISC_*`/`COUNTERTOP_EXTRAS_*` переписать или удалить вместе с константами).
- [ ] **Step 5: Коммит** `feat: work priced by the chosen type's company rate x stone coefficient`.

---

### Task 4: Подсветка и скрытие полировки

**Files:**
- Modify: `sayanmramor-calculator.html` (шаг «Опции» ~2027: новая строка `opt-light`; показ/скрытие `opt-polish` и `opt-light` при смене изделия/типа — рядом с `applyTypeSelection` и сменой изделия)
- Modify: `constructor-state.js` (`options.lightEnabled`; `buildPricingInputs`)
- Modify: `pricing.js` (`computeWorkAndTotal` — `lighting`)
- Test: `tests/constructor-state.test.js`, `tests/company-rates.test.js`, `tests/calculator-markup.test.js`

**Interfaces:**
- Consumes: Task 2 (`hasPolishRate`, `getAdditionalWorkRate('LIGHT-01')`), Task 3 (`resolveTypeId`).
- Produces:
  - Разметка: `<label class="checkbox-row" id="opt-light-row"><input type="checkbox" id="opt-light"> Подсветка камня</label>` после «Дополнительной полировки»; строка полировки получает `id="opt-polish-row"`.
  - `ConstructorState.polishAvailable(state) -> boolean` = `hasPolishRate(resolveTypeId(state))`; `ConstructorState.lightToggleAvailable(productKey) -> boolean` = кухня или ванная.
  - `state.options.polishEnabled` = чекбокс **и** `polishAvailable`; `state.options.lightEnabled` = (`opt-light` **и** `lightToggleAvailable`) **или** тип `PANEL-04` / `WALL-05`.
  - `rates.lightingRatePerM2 = LIGHT-01` (без коэффициента); `computeWorkAndTotal` возвращает `lighting = lightEnabled ? lightingRatePerM2 × mainArea : 0` и включает его в `work`; `calculatePrice` отдаёт `result.lighting`.
- HTML: при смене типа/изделия `opt-polish-row.hidden = !polishAvailable`, и если скрыт — `opt-polish.checked = false`; `opt-light-row.hidden = !lightToggleAvailable`, скрыт → `checked = false`.

- [ ] **Step 1: Тесты:**
  - `'polish is unavailable for types without a polish rate'` — `polishAvailable` false для `stupeni`/STEP-02, `lestnitsa`/STAIR-01, `fasad`/FACADE-07; true для `pol`/FLOOR-03, `fasad`/FACADE-01, кухни.
  - `'a checked polish box on a type without polish adds nothing'` — ступени STEP-01, `opt-polish.checked = true` → `state.options.polishEnabled === false`, `result.polish === 0`, `unpriced` без `'polish'`.
  - `'panel with lighting adds LIGHT-01 on its area'` — PANEL-04, S м² → `result.lighting === 110000 × S`; PANEL-01 → 0.
  - `'wall with lighting adds LIGHT-01'` — WALL-05 → `110000 × S` (решение строителя из спеки).
  - `'countertop lighting toggle'` — кухня `opt-light` вкл. → `lighting === 110000 × mainAreaM2` (с крыльями, без острова); выкл. → 0; у подоконника `opt-light.checked = true` → 0.
  - `calculator-markup.test.js`: `#opt-light` и `#opt-polish-row` существуют в шаге «Опции».
- [ ] **Step 2: Запустить** — FAIL.
- [ ] **Step 3: Реализовать** по Interfaces.
- [ ] **Step 4: Запустить** весь набор — PASS.
- [ ] **Step 5: Коммит** `feat: lighting (LIGHT-01) and polish only where the type has a polish rate`.

---

### Task 5: Швы столешниц (SEAM-01)

**Files:**
- Modify: `pricing.js` (`cutPieces` ~223, `planPartsInTurn` ~356, `planMaterial` ~445 — счёт швов по ключам деталей)
- Modify: `constructor-state.js` или `sayanmramor-calculator.html` — место, где строка швов добавляется в цену (см. Interfaces)
- Test: `tests/pricing.test.js`, `tests/company-rates.test.js`

**Interfaces:**
- Produces:
  - `cutPieces` возвращает дополнительно `seamsByKey: { [pieceKey]: number }`; `planPartsInTurn`/`planPiecesOnce` суммируют его; `material.seamsByKey` в результате `planMaterial`. `seams` (общее) не меняется.
  - `Pricing.countertopSeams(job, material, shape) -> number` = угловые стыки (`lshape` 1, `ushape` 2, но только по крыльям, реально присутствующим в `job.pieces`) + `material.seamsByKey` по ключам основной столешницы и крыльев + по `island` и `barCounter`. Распилы `backsplash` и `wallPanel` не считаются. Для изделий не-столешниц → 0.
  - `calculatePrice` принимает `seamRate` (число или `null`) и `shape`; при `seamRate` и швах > 0 добавляет `result.seams = { count, amount: count × seamRate }` и включает `amount` в `work`. Кухня/ванная передают `seamRate = getAdditionalWorkRate('SEAM-01')`, остальные — `null`.
  - Ключи деталей столешницы/крыльев — уточнить в `product-parts.js` (`buildJob` для столешниц) и использовать их как есть.

- [ ] **Step 1: Тесты:**
  - `'cutPieces reports seams per piece key'` — две детали `main` (длиннее слэба, режется на 2) и `backsplash` (на 2) → `seamsByKey.main === 1`, `seamsByKey.backsplash === 1`, `seams === 2`.
  - `'L countertop that fits the slabs has one seam'` — кухня `lshape`, обе детали влезают → `result.seams.count === 1`, `amount === 25000`.
  - `'U countertop has two corner seams'` → `count === 2`.
  - `'straight countertop longer than a slab'` — разрезана на 2 → `count === 1`.
  - `'island split counts, backsplash split does not'` — остров режется на 2, фартук на 2 → `count === 1`.
  - `'L shape without a wing yet has no corner seam'` — `lshape`, крыло 0×0 → `count === 0`.
  - `'floors never get SEAM-01'` — пол из нескольких слэбов → `result.seams` отсутствует или `count === 0`.
- [ ] **Step 2: Запустить** — FAIL.
- [ ] **Step 3: Реализовать** по Interfaces.
- [ ] **Step 4: Запустить** весь набор — PASS.
- [ ] **Step 5: Коммит** `feat: countertop seams priced at SEAM-01 (corner joints + splits)`.

---

### Task 6: Кромка по длине открытых кромок

**Files:**
- Create: `edge-length.js` (UMD, `root.EdgeLength`)
- Modify: `visualizer/scene-layout.js` (проступи `tread` ~906/956 и площадки `landing` ~1052 получают метаданные `openEdges`; рендер не меняется)
- Modify: `constructor-state.js` (`buildPricingInputs`: строка кромки), `sayanmramor-calculator.html` (подключить `<script src="edge-length.js">`; посчитать длину в `calculate()`; подпись в `optionLabels`)
- Test: `tests/edge-length.test.js` (новый), `tests/visualizer-scene.test.js`

**Interfaces:**
- Consumes: `GeometryModel.buildGeometryModel(state)`, `SceneLayout.buildSceneLayout(model)` (части `{ outline, closed?, edge, name }`), `EDGE_FIELDS` (тип → EDGE-ID) из `constructor-state.js`.
- Produces:
  - `EdgeLength.openEdgeLengthM(layout) -> number` (м): сумма по частям каменной поверхности с профилем кромки:
    - части с `closed` (`main`, `wing` столешницы; `main` подоконника) — длины рёбер `outline`, чьих индексов нет в `closed`;
    - `island`, `bar` — весь периметр `outline`;
    - `tread`, `landing` — длины рёбер из нового поля `openEdges` (индексы рёбер `outline` по передней кромке — там, где 3D кладёт полосу `wrap`);
    - прочие части (`wrap`, `riser`, раковина…) не считаются.
  - Метаданные в `scene-layout.js`: `tread`/`landing` — `openEdges: number[]`. `three-scene.js` это поле не читает.
  - `buildPricingInputs(state, { catalog, edgeLengthM })`: при `supportsEdgeWork` и выбранном `state.edge.type` добавляет `{ rate: getAdditionalWorkRate(EDGE_FIELDS[type].rateId), quantity: edgeLengthM, edge: type }`; без типа или без поддержки — ничего. Старые скрытые поля длин (`edge-straight`…) больше не участвуют в цене (`edgeLineItems` из них — удалить из цены; поля оставить, только если на них завязано 3D/URL, иначе удалить).
  - `calculate()`: `edgeLengthM = EdgeLength.openEdgeLengthM(SceneLayout.buildSceneLayout(GeometryModel.buildGeometryModel(constructorState)))` — всегда, не только при `viewerReady`. В «Опции» результата: `кромка прямая: 4,20 м.п.` (подписи из существующего словаря `labels`).

- [ ] **Step 1: Тесты** в `tests/edge-length.test.js` (через реальные `GeometryModel` + `SceneLayout`):
  - `'straight countertop against the wall: front edge and both ends'` — 3000×600 мм → `3.0 + 0.6 + 0.6 = 4.2`.
  - `'L countertop: no edge along the walls or at the joint'` — основная 3000×600, крыло длиной 1500 (ширина крыла 600) → `5.1`: основная — фронт 2.4 (без участка стыка) + свободный торец 0.6; крыло — длинная открытая сторона 1.5 + торец 0.6 (по `mainClosed` и `closed: [.., 3]` в `scene-layout.js`).
  - `'island: full perimeter'` — остров 1200×800 → `+4.0` к столешнице.
  - `'sill: only the room side'` — прямой подоконник 1500×300 → `1.5` (торцы у откосов и сторона окна закрыты, по `sillClosed`).
  - `'straight stair: one nosing per tread'` — STAIR-01, 10 ступеней, ширина марша 1000 мм → `10.0`.
  - `'floor and wall have no edge'` — `pol` / `stena` → `0`.
  - В `company-rates.test.js`: `'edge priced by the chosen profile'` — кухня 3000×600, `edge.type = 'bevel'` → строка `{ rate: 1000, quantity: 4.2 }`; `edge.type = null` → строки кромки нет.
- [ ] **Step 2: Запустить** `node --test tests/edge-length.test.js` — FAIL.
- [ ] **Step 3: Реализовать** `edge-length.js`, `openEdges` в `scene-layout.js`, подключение в `buildPricingInputs` и `calculate()`.
- [ ] **Step 4: Запустить** весь набор — PASS (в т.ч. `visualizer-scene.test.js`: геометрия частей не изменилась).
- [ ] **Step 5: Коммит** `feat: edge work priced on the length of every open edge`.

---

### Task 7: Замер, доставка, разгрузка, расходники, минимальный заказ, сноска

**Files:**
- Modify: `sayanmramor-calculator.html` (блок `.service-options` с двумя чекбоксами; переносится в нужный шаг при смене изделия; сноска под ценой)
- Modify: `constructor-state.js` (`options.measureEnabled`, `options.deliveryEnabled`; `buildPricingInputs`)
- Modify: `pricing.js` (`computeWorkAndTotal`: `misc`, `calculatePrice`: минимум)
- Test: `tests/company-rates.test.js`, `tests/calculator-markup.test.js`

**Interfaces:**
- Consumes: Task 2 (`MISC`).
- Produces:
  - Разметка: `<div class="checkboxes service-options"><label class="checkbox-row"><input type="checkbox" id="opt-measure"> Замер на объекте</label><label class="checkbox-row"><input type="checkbox" id="opt-delivery"> Доставка</label></div>`. Функция `placeServiceOptions(productKey)` в HTML переносит этот один блок в конец шага `#countertopExtras` («Доп. работы») для кухни и ванной, иначе — в конец шага «Опции». Один DOM-узел, одни ID.
  - `state.options.measureEnabled`, `state.options.deliveryEnabled` (для всех изделий).
  - `rates.misc = { measure, delivery, perM2: unloadingPerM2 + consumablesPerM2, minOrder }` из `MISC`.
  - `computeWorkAndTotal`: `misc = (measureEnabled ? measure : 0) + (deliveryEnabled ? delivery : 0) + perM2 × S_всего`, где `S_всего` — площадь всех деталей задания (`jobArea(job)` без фильтра группы); передаётся в `computeWorkAndTotal` новым аргументом `totalAreaM2`.
  - `calculatePrice`: после суммы `total = max(total, minOrder)`; `result.minOrderApplied: boolean`.
  - Сноска: элемент `<p class="price-note" id="priceRegionNote">* Расчёт указан для объектов, находящихся в Москве и Московской области</p>` под ценой на экране результата (и в итоговой колонке, где выводится `setPriceValue`); звёздочка добавляется к самой цене: `'≈ ' + formatRub(total) + '*'`.

- [ ] **Step 1: Тесты:**
  - `'measure and delivery only when ticked'` — без галочек `misc === 6000 × S_всего`; с обеими — `+ 27000`.
  - `'unloading and consumables use the whole stone area'` — кухня с островом → `misc` считает `S_всего` = столешница + остров.
  - `'minimum order lifts a small total to 20 000'` — подоконник 300×200 мм, без замера/доставки → `total === 20000`, `minOrderApplied === true`; большой заказ → `minOrderApplied === false`.
  - `calculator-markup.test.js`: `#opt-measure`, `#opt-delivery` существуют ровно по одному разу; текст сноски дословно как в Global Constraints.
- [ ] **Step 2: Запустить** — FAIL.
- [ ] **Step 3: Реализовать** по Interfaces.
- [ ] **Step 4: Запустить** весь набор — PASS.
- [ ] **Step 5: Коммит** `feat: measure/delivery on request, unloading and consumables, minimum order, Moscow note`.

---

### Task 8: Строки в результате и паспорте, документация

**Files:**
- Modify: `result-model.js` (`summarizePricing` ~270)
- Modify: `passport-model.js` (`buildSpecification` ~88)
- Modify: `lead-payload.js` — только если он перечисляет строки работы сам (иначе берёт их из `summarizePricing`)
- Modify: `docs/pricing-logic.md`, `CLAUDE_HANDOFF.md` (разделы C-таблица модулей, E, F), `CLAUDE_START_HERE.md` (строка про таблицу ставок и число тестов)
- Test: `tests/result-lead.test.js`, `tests/passport-model.test.js`

**Interfaces:**
- Consumes: `result.lighting`, `result.seams`, `result.misc`, `result.minOrderApplied`, `extraLineItems` с полями `edge`/`install`.
- Produces — строки (только с суммой > 0), по порядку: Камень; Изготовление; Монтаж; Полировка; Подсветка; Швы (переполировка); Кромка и дополнительные работы; Подступенки — работы; Замер; Доставка; Разгрузка и расходные материалы; «Доплата до минимального заказа» (= 20 000 − сумма строк, только при `minOrderApplied`). Сумма строк паспорта по-прежнему точно равна итогу (механизм остатков округления — как сейчас). Для этого `computeWorkAndTotal` возвращает раздельно `measure`, `delivery`, `unloading` (вместо одного `misc`, или вместе с ним).
- Сноска про Москву и МО — в паспорте/PDF под итогом, тем же текстом.

- [ ] **Step 1: Тесты:**
  - `result-lead.test.js`: `'summary lists lighting, seams, measure, delivery, unloading'` — результат с ними → `lines.map(l => l.key)` содержит `'lighting','seams','measure','delivery','unloading'` в порядке из Interfaces; суммы округлены.
  - `'minimum order top-up line'` — `minOrderApplied` → последняя строка «Доплата до минимального заказа», сумма строк = 20 000.
  - `passport-model.test.js`: `'specification rows add up to the total with the new lines'`; `'passport carries the Moscow note'`.
- [ ] **Step 2: Запустить** — FAIL.
- [ ] **Step 3: Реализовать**; обновить документацию: `pricing-logic.md` — новая формула из спеки; HANDOFF E — таблица ставок теперь в `rate-catalog.js` (v2, заполнена 2026-11-08), `null`-ставок нет, кроме будущих; F — формула; убрать фразы «все `rate: null`».
- [ ] **Step 4: Запустить** весь набор `node --test tests/*.test.js` — PASS; записать итоговое число тестов в `CLAUDE_START_HERE.md`.
- [ ] **Step 5: Проверить в браузере** (preview калькулятора): кухня Г 3000×600 + крыло 1500×600, гранит, монтаж + полировка + подсветка + замер — цена со звёздочкой и сноской; ступени — нет галочки полировки; панно «С подсветкой» — строка «Подсветка» в паспорте; подоконник 300×200 — 20 000 ₽. Скриншоты — владельцу.
- [ ] **Step 6: Коммит** `feat: result and passport lines for the v2 rates; docs`.
