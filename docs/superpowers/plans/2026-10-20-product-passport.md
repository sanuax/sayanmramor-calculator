# Паспорт изделия - план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** кнопка «Скачать паспорт» на экране результата калькулятора скачивает PDF на одну-две страницы: снимки 3D, камень с фото, размеры, кромка и работы, спецификация с ценой и ссылка (с QR), которая открывает калькулятор с тем же изделием.

**Architecture:** логика без DOM - в двух новых UMD-модулях с тестами `node --test`: `passport-link.js` (выборы клиента <-> параметры адреса) и `passport-model.js` (описание документа из `configuration` / `pricing` / результата расчёта). `passport-pdf.js` рисует это описание в PDF через jsPDF. `ThreeScene.capture()` снимает кадры с той же сцены. Страница `sayanmramor-calculator.html` только связывает: восстанавливает выборы из адреса, собирает данные, грузит библиотеки по нажатию и скачивает файл.

**Tech Stack:** статический HTML/JS без сборки; three.js r160 (`vendor/three/`); jsPDF 2.5.1 UMD и qrcode-generator 1.4.4 - в `vendor/`, без CDN; Montserrat / Unbounded статические TTF в `vendor/fonts/`; тесты - `node --test tests/*.test.js`.

**Spec:** `docs/superpowers/specs/2026-10-20-product-passport-design.md`

## Global Constraints

- Ветка `product-passport` (от `rate-catalog-subcategories`); ничего не пушить и не публиковать без слова владельца.
- В новых текстах только « - », никогда « — ».
- Шапку калькулятора (копия разметки сайта) не трогать.
- Внешний вид и поведение калькулятора не меняются, кроме кнопки «Скачать паспорт» и строки «Камень из паспорта больше не в каталоге - выберите другой».
- Кнопки - прямоугольники со скруглением 6 px, как `.cta-btn`.
- Библиотеки PDF/QR и TTF-шрифты грузятся только по нажатию кнопки; все файлы из `vendor/`.
- Паспорт без контактов клиента, без НДС, доставки, шаблона, разгрузки, расходников.
- Сумма «0 ₽» и пустые строки в таблице недопустимы.
- Дата цен = `updated_at` из `data/slabs.json` (как «Расчёт по ценам на ...» на экране результата); дата скачивания - в шапке.
- Номер паспорта `ГГММДД-NNNN`; имя файла `Паспорт - <название изделия> - ДД.ММ.ГГГГ.pdf`.
- Проверка в браузере - на локальном сервере сайта: `python D:/sayanmramor-site/scripts/dev_server.py --port 8010` (в `D:/sayanmramor-site/.claude/launch.json` это `site-dev`), калькулятор на `http://localhost:8010/sayanmramor-calculator/sayanmramor-calculator.html`.

## Review Focus

1. Расчёт без ставки работ (`result.total === null`, а `summarizePricing` отдаёт `total: 0` со статусом `ok`) - паспорт пишет «Стоимость рассчитает менеджер», не «0 ₽» (тест в Task 3).
2. Дробные суммы строк (ставка × площадь) - округлённые строки складываются ровно в «Всего» (тест в Task 3).
3. Ссылка для изделий со своими полями размеров и форм (фасад, камин, лестница с маршами, П-образная столешница с крылом) - открывает ту же конфигурацию (проверка всех 10 изделий в Task 2).
4. Нет WebGL, у камня нет `image` или фото не загрузилось - паспорт всё равно скачивается, без снимков / без фото (тест в Task 5, проверка в Task 6).
5. Длинная спецификация (П-образная столешница со всеми доп. работами) - таблица уходит на вторую страницу, ничего не налезает (тест в Task 5).

---

### Task 1: Выборы клиента в адресе (`passport-link.js`)

**Files:**
- Create: `passport-link.js`
- Test: `tests/passport-link.test.js`

**Interfaces:**
- Produces (UMD, `window.PassportLink`):
  - `PASSPORT_VERSION = 1`, параметр версии `pv`.
  - `collectFields(controls) -> { [id]: string }` - `controls`: массив `{ id, type, value, checked, defaultValue, defaultChecked }`; берёт только отличающиеся от значений по умолчанию; checkbox -> `'1'` / `'0'`.
  - `buildPassportQuery({ productKey, stoneId, fields }) -> string` - `product=<key>&stone=<id>&pv=1&<id>=<value>...`, поля в порядке ключей `fields` (это порядок полей на странице).
  - `readPassportQuery(params: URLSearchParams, fieldIds: string[]) -> { version, productKey, stoneId, fields } | null` - `null`, если нет `pv`; неизвестные параметры отбрасываются; `fields` - в порядке `fieldIds`.

- [ ] **Step 1: Write the failing tests** - `tests/passport-link.test.js`:
  - `collectFields` пропускает поле, у которого `value === defaultValue`, и checkbox с `checked === defaultChecked`; отдаёт `{ length: '2400', 'opt-install': '1' }` для изменённых.
  - `buildPassportQuery({ productKey: 'stoleshnitsa_kuhnya', stoneId: 'bianco-carrara', fields: { length: '2400', width: '600' } })` === `'product=stoleshnitsa_kuhnya&stone=bianco-carrara&pv=1&length=2400&width=600'`.
  - Круг: `readPassportQuery(new URLSearchParams(buildPassportQuery(x)), ['width', 'length'])` возвращает те же `productKey`, `stoneId`, `fields` и `version: 1`, а `Object.keys(fields)` - `['width', 'length']`.
  - Без `pv` -> `null`; параметр `debug=1` и неизвестный `foo=1` не попадают в `fields`; значение с кириллицей и пробелом проходит круг без потерь.

- [ ] **Step 2: Run to see them fail** - `node --test tests/passport-link.test.js` -> FAIL «Cannot find module '../passport-link.js'».

- [ ] **Step 3: Implement `passport-link.js`** по образцу UMD-обёртки `url-bootstrap.js`; кодирование - `URLSearchParams`.

- [ ] **Step 4: Run** - `node --test tests/passport-link.test.js` -> PASS.

- [ ] **Step 5: Commit** - `git add passport-link.js tests/passport-link.test.js && git commit -m "passport: the client's choices in the link"`.

### Task 2: Ссылка открывает то же изделие (страница)

**Files:**
- Modify: `sayanmramor-calculator.html` - подключить `passport-link.js` рядом с `url-bootstrap.js`; бутстрап у `bootstrapParams` (~3187) и в `.then` загрузки `data/slabs.json` (~3210); строка-предупреждение над полем камня в шаге `data-step-id="material"` (~1535).
- Test: `tests/calculator-markup.test.js` (новые проверки разметки)

**Interfaces:**
- Consumes: `PassportLink.readPassportQuery`, `PassportLink.collectFields` (Task 1).
- Produces (в скрипте страницы): `passportFieldControls() -> HTMLElement[]` - все `input/select/textarea[id]` внутри `.configurator` в секциях шагов до `data-step-id="review"` (поля формы заявки не входят); `currentPassportQuery() -> string` для Task 6.

- [ ] **Step 1: Write the failing markup test** - в `tests/calculator-markup.test.js`: страница подключает `passport-link.js`; в шаге `material` есть элемент `#stoneGoneNote` с атрибутом `hidden` и текстом ровно «Камень из паспорта больше не в каталоге - выберите другой»; в тексте страницы нет « — » внутри нового элемента.

- [ ] **Step 2: Run** - `node --test tests/calculator-markup.test.js` -> FAIL.

- [ ] **Step 3: Implement restore.** Если `readPassportQuery` вернул не `null`: изделие выбирается существующим механизмом `product` (как сейчас); затем значения полей ставятся в порядке страницы (`fieldIds` = id из `passportFieldControls()`), после каждого - `input` и `change` с `bubbles: true` (те же события, что от клиента; ранние поля - форма, подкатегория - раскрывают поздние). После загрузки каталога: камень через `handleMaterialSelected`, если `STONES_BY_ID[stoneId]` есть и `available !== false`; иначе `#stoneGoneNote` показывается (и прячется при выборе любого камня). Затем `calculate()` и переход на шаг `review` через `goToStep('review')`; если шаг недостижим (`StepEngine.isReachable`), клиент остаётся на первом шаге, где не хватает данных. Без `pv` поведение страницы прежнее.

- [ ] **Step 4: Add `currentPassportQuery()`** - `PassportLink.buildPassportQuery({ productKey: selectedProductKey, stoneId: selectedStoneId, fields: PassportLink.collectFields(passportFieldControls().map(el => ({ id: el.id, type: el.type, value: el.value, checked: el.checked, defaultValue: el.defaultValue, defaultChecked: el.defaultChecked }))) })`. Для `select` значение по умолчанию - у `option.defaultSelected`.

- [ ] **Step 5: Run tests** - `node --test tests/*.test.js` -> PASS (все прежние тоже).

- [ ] **Step 6: Verify all 10 products in the browser.** Для каждого изделия из `PRODUCTS` (у столешниц - форма с крылом / П-образная, у лестницы - 2 марша, у фасада и камина - не первая форма, плюс кромка, работы и опции, где они есть): собрать изделие, в консоли записать `q = currentPassportQuery()` и `before = JSON.stringify(currentResultData())`, открыть `?` + `q` в новой вкладке, дождаться результата и сравнить `JSON.stringify(currentResultData())` с `before`. Ожидается: равны для всех 10, страница открыта на шаге результата. Отдельно: ссылка с `stone=not-a-stone&pv=1` - открывается всё, кроме камня, видна строка `#stoneGoneNote`.

- [ ] **Step 7: Commit** - `git commit -am "passport: the link reopens the same product"` (+ `git add` для изменённых тестов).

### Task 3: Описание паспорта (`passport-model.js`)

**Files:**
- Create: `passport-model.js`
- Test: `tests/passport-model.test.js`

**Interfaces:**
- Consumes: `configuration` и `pricing` из `currentResultData()` (`ResultModel.buildConfiguration` / `summarizePricing`), `view` из `ResultModel.buildResultView`; `result` - объект `Pricing.calculatePrice` (`subtotal`, `matchedSlabs`, `nSlabs`, `fabrication`, `installation`, `polish`, `extras`, `catalogExtras`, `groupWork`, `misc`, `total`); `pricingInputs = { rates, mainAreaM2, complexEnabled }`.
- Produces (UMD, `window.PassportModel`):
  - `passportNumber(date: Date, random4: number) -> string` - `ГГММДД-NNNN`, `random4` 0..9999 с ведущими нулями.
  - `passportFileName(title: string, date: Date) -> string`.
  - `FLAT_PRODUCTS = ['panno', 'pol', 'stena', 'fasad']`; `pickShots(productKey, defaultPreset) -> string[3]` - `[defaultPreset, ...]` + первые два из `['top', 'front', 'side', 'iso']`, не равные `defaultPreset`, без `'side'` для `FLAT_PRODUCTS`.
  - `buildSpecification({ result, pricing, pricingInputs, configuration }) -> { sections: [{ title, rows: [{ name, unit, qty, priceRub, amountRub }] }], totalRub } | { manual: string }`.
  - `buildPassport({ configuration, pricing, result, pricingInputs, view, stone, createdAt: Date, random4, link }) -> PassportDoc`, где `PassportDoc = { number, dateText, title, fileName, shots: string[3], stone: { name, meta, imagePath | null }, specs: view.specs, works: view.works, note: view.note, specification, pricesDateText, link }`.

- [ ] **Step 1: Write the failing tests** - `tests/passport-model.test.js`, данные - реальным `Pricing.calculatePrice` на кухонной столешнице (как в `tests/result-lead.test.js`):
  - `passportNumber(new Date(2026, 9, 20), 173)` === `'261020-0173'`; `passportFileName('Столешница на кухню', new Date(2026, 9, 20))` === `'Паспорт - Столешница на кухню - 20.10.2026.pdf'`.
  - `pickShots('stoleshnitsa_kuhnya', 'iso-eye-level')` deep-equals `['iso-eye-level', 'top', 'front']`; `pickShots('pol', 'top')` deep-equals `['top', 'front', 'iso']`; `pickShots('stena', 'front')` deep-equals `['front', 'top', 'iso']`.
  - Разделы по порядку «Камень», «Изготовление», «Монтаж», «Кромка и дополнительные работы», «Прочее»; пустой раздел не выводится; ни одна строка не имеет `amountRub === 0`.
  - «Камень»: одинаковые слэбы (тот же `width_cm`, `length_cm`, `price_total_rub`) - одна строка с `qty` = их числом, `unit: 'шт.'`; сумма строк раздела === `Math.round(result.subtotal)`.
  - «Изготовление»: `unit: 'м²'`, `qty` = `mainAreaM2` с двумя знаками; `priceRub` = ставка × (множитель сложной формы, если `complexEnabled`), если ставка задана, иначе `null`; «Полировка» и «Подступенки - работы» - отдельные строки этого раздела, если не нулевые.
  - «Кромка и дополнительные работы»: одна строка, `amountRub` = `extras + catalogExtras`, `name` перечисляет кромку и работы из `configuration` (`edge.label`, `additionalWorks[].label`).
  - Сумма всех `amountRub` === `totalRub` === `pricing.total` - на подобранных дробных ставках (например площадь 1,37 м² × 3333,33 ₽), где поштучное округление даёт расхождение: разница отдаётся самой крупной строке.
  - `pricing.status === 'manual'` -> `{ manual: pricing.message || 'Стоимость рассчитает менеджер' }`; `result.total === null` при `pricing.status === 'ok'` -> тоже `manual` (Review Focus 1).
  - `pricesDateText` из `pricing.pricesUpdatedAt` `'2026-09-15T23:53:23+03:00'` === `'15.09.2026'`.
  - Ни в одной строке документа нет « — ».

- [ ] **Step 2: Run** - `node --test tests/passport-model.test.js` -> FAIL.

- [ ] **Step 3: Implement `passport-model.js`.** Без DOM и сети. Округление: каждая строка `Math.round`, затем `pricing.total - Σ` прибавляется к строке с наибольшей суммой.

- [ ] **Step 4: Run** - `node --test tests/passport-model.test.js` -> PASS.

- [ ] **Step 5: Commit** - `git add passport-model.js tests/passport-model.test.js && git commit -m "passport: the document's content from the result"`.

### Task 4: Снимки сцены (`ThreeScene.capture`)

**Files:**
- Modify: `visualizer/three-scene.js` (рядом с `setView`, ~735; экспорт `ThreeScene` ~770)
- Test: `tests/visualizer-scene.test.js` (`three-scene.js` - ES-модуль с `import`, в node не загружается; тест читает его текст)

**Interfaces:**
- Produces: `ThreeScene.capture(presetName: string, { width: number, height: number }) -> string | null` - JPEG data URL (качество 0.9) или `null`, если сцены/модели нет.

- [ ] **Step 1: Write the failing test** - текст `visualizer/three-scene.js` содержит `const ThreeScene = { init, update, setView, resetView, capture, dispose };` и функцию `capture`, которая не трогает `userAdjusted`.
- [ ] **Step 2: Run** - `node --test tests/visualizer-scene.test.js` -> FAIL.
- [ ] **Step 3: Implement `capture`.** Синхронно, в одной задаче, без кадров между: запомнить размер рендерера, `camera.aspect`, позицию камеры и `controls.target`; `renderer.setSize(width, height, false)`, `camera.aspect = width / height`, `frame(CAMERA_PRESETS[presetName].direction)`, `renderer.render(scene, camera)`, `canvas.toDataURL('image/jpeg', 0.9)`; вернуть всё как было и `renderer.render` ещё раз. Так снимок читается без `preserveDrawingBuffer`, а экран не мигает. `userAdjusted` не меняется.
- [ ] **Step 4: Run** - `node --test tests/visualizer-scene.test.js` -> PASS; в браузере на столешнице: `ThreeScene.capture('top', { width: 1200, height: 900 })` даёт картинку вида сверху, камера клиента после вызова там же, где была.
- [ ] **Step 5: Commit** - `git commit -am "3D: capture a view for the passport"`.

### Task 5: PDF (`passport-pdf.js` + библиотеки)

**Files:**
- Create: `passport-pdf.js`; `vendor/jspdf/jspdf.umd.min.js` + `LICENSE` (jsPDF 2.5.1, MIT, с `https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js`); `vendor/qrcode/qrcode.js` + `LICENSE` (qrcode-generator 1.4.4, MIT, `https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js`); `vendor/fonts/Montserrat-Regular.ttf`, `Montserrat-SemiBold.ttf` (из `github.com/JulietaUla/Montserrat`, `fonts/ttf/`), `Unbounded-Medium.ttf` (из `github.com/googlefonts/unbounded`, `fonts/ttf/`); источники дописать в `vendor/fonts/SOURCES.md`.
- Test: `tests/passport-pdf.test.js`

**Interfaces:**
- Consumes: `PassportDoc` (Task 3).
- Produces (UMD, `window.PassportPdf`): `renderPassportPdf(passportDoc, assets, libs) -> Uint8Array` - `assets = { fonts: { regular, semibold, display } (base64 TTF), shots: (string|null)[3], stonePhoto: string|null (JPEG data URL), qr: boolean }`, `libs = { jsPDF, qrcode }` (в браузере - `window.jspdf.jsPDF`, `window.qrcode`; в тестах - `require`).

- [ ] **Step 1: Download the vendor files** по ссылкам выше; проверить: `head -c 4 vendor/fonts/Montserrat-Regular.ttf | xxd` -> `0001 0000` (TrueType), у jsPDF в начале файла `jsPDF` и версия `2.5.1`.
- [ ] **Step 2: Write the failing tests** - `tests/passport-pdf.test.js` (jsPDF и qrcode через `require` из `vendor/`, шрифты через `fs`):
  - документ из Task 3 (кухонная столешница) -> байты начинаются с `%PDF`, 1 страница (`/Type /Page` встречается 1 раз), размер < 3 МБ.
  - П-образная столешница со всеми доп. работами и длинным названием камня -> 2 страницы; на странице 2 есть «Всего» (Review Focus 5).
  - `shots: [null, null, null]`, `stonePhoto: null` -> PDF собирается без исключений, 1 страница (Review Focus 4).
  - `specification.manual` -> собирается, текст «Стоимость рассчитает менеджер» есть в документе.
- [ ] **Step 3: Run** - `node --test tests/passport-pdf.test.js` -> FAIL.
- [ ] **Step 4: Implement `renderPassportPdf`.** A4 книжная, поля 14 мм, раскладка варианта A (`.superpowers/brainstorm/219-1792515568/content/passport-layout.html`): шапка «САЯНМРАМОР» + номер и дата; заголовок изделия (Unbounded); общий вид 16:9 и три ракурса (подписи «общий вид» не нужны, под тремя - названия ракурсов); две колонки: «Камень» (фото 28×28 мм + название и `meta`) и размеры из `specs`, «Кромка и работы» из `works`; таблица спецификации (колонки «Наименование», «Ед.», «Кол-во», «Цена, ₽», «Сумма, ₽»; заголовки разделов строкой), «Всего»; строка «Цены на ДД.ММ.ГГГГ. Цена предварительная. Доставку и окончательную стоимость рассчитает менеджер.»; внизу QR (25×25 мм, `qrcode(0, 'M')`) и «Открыть 3D-модель» + ссылка (`textWithLink`). Если таблица не помещается, её продолжение и подвал - на странице 2 с повтором шапки. Цвета - палитра калькулятора (камень `#f8f7f4`, графит `#1c1d1b`, приглушённый `#77786f`, verde `--accent: #2a5446` калькулятора для плашки «Всего»).
- [ ] **Step 5: Run** - `node --test tests/passport-pdf.test.js` -> PASS.
- [ ] **Step 6: Commit** - `git add passport-pdf.js vendor/jspdf vendor/qrcode vendor/fonts tests/passport-pdf.test.js && git commit -m "passport: the PDF, one page as in variant A"`.

### Task 6: Кнопка и скачивание (страница)

**Files:**
- Modify: `sayanmramor-calculator.html` - кнопка в `#leadArea` (~2073) рядом с `#resultCtaBtn`; стиль; `computeAndRenderSummary` (~4210) хранит `pricingInputs`; `currentResultData()` (~4765) отдаёт `result` и `pricingInputs`; `applyLeadMode` не прячет новую кнопку.
- Test: `tests/calculator-markup.test.js`, `tests/result-lead.test.js`

**Interfaces:**
- Consumes: `currentPassportQuery()` (Task 2), `PassportModel.buildPassport` / `pickShots` (Task 3), `ThreeScene.capture` (Task 4), `PassportPdf.renderPassportPdf` (Task 5).

- [ ] **Step 1: Write the failing tests** - разметка: `<button type="button" class="lead-secondary-btn" id="passportBtn">Скачать паспорт</button>` (тот же класс, что у «Отмена» / «Изменить контакты» рядом) внутри `#leadArea` и вне `#leadForm`; страница подключает `passport-model.js` и `passport-pdf.js`, но **не** подключает `vendor/jspdf` / `vendor/qrcode` тегом `<script>` (они грузятся по нажатию). `tests/result-lead.test.js`: снимок расчёта содержит `pricingInputs.rates` и `pricingInputs.mainAreaM2`.
- [ ] **Step 2: Run** - `node --test tests/calculator-markup.test.js tests/result-lead.test.js` -> FAIL.
- [ ] **Step 3: Implement.** Новых стилей кнопки нет - класс `lead-secondary-btn`; при необходимости только отступ между ней и `#resultCtaBtn`. По нажатию: кнопка `disabled`, текст «Готовим паспорт...»; грузятся (один раз, кэшируются промисом) `vendor/jspdf/jspdf.umd.min.js`, `vendor/qrcode/qrcode.js` и три TTF (`fetch` -> base64); снимки - `pickShots` + `ThreeScene.capture` (1600×900 для общего вида, 800×600 для ракурсов), `null`, если WebGL нет (`WebglSupport`); фото камня - `data/<stone.image>` через `<img>` -> canvas -> JPEG data URL, `null` при ошибке; ссылка = `location.origin + location.pathname + '?' + currentPassportQuery()`; `buildPassport` (`random4` из `crypto.getRandomValues`) -> `renderPassportPdf` -> `Blob` `application/pdf` -> `<a download="fileName">` + `URL.createObjectURL` -> клик -> `revokeObjectURL` через 10 с. В `finally` кнопка снова активна. Ошибка - в `console.error` и короткая строка под кнопкой «Не удалось подготовить паспорт, попробуйте ещё раз».
- [ ] **Step 4: Run all tests** - `node --test tests/*.test.js` -> PASS.
- [ ] **Step 5: Verify in the browser** (Chrome на 8010, затем узкое окно 375 px): кухонная столешница, лестница, фасад, пол - нажать «Скачать паспорт», открыть скачанный PDF: кириллица читается, три снимка разные и совпадают с моделью, фото камня есть, сумма «Всего» = сумме на экране результата, «Цены на 15.09.2026»; QR-код с экрана открывает ту же конфигурацию (сравнить `currentResultData()` как в Task 2); двойной клик даёт один файл; камера клиента после скачивания там же. Изделие с ценой «уточнит менеджер» - паспорт скачивается с этой строкой. Скриншоты экрана с кнопкой и первой страницы PDF приложить к отчёту.
- [ ] **Step 6: Commit** - `git commit -am "passport: the download button on the result"`.

### Task 7: Показать владельцу

- [ ] **Step 1:** `node --test tests/*.test.js` в калькуляторе и `node --test tests/*.test.js` в `D:/sayanmramor-site` (тест «the configurator wears the site's header» должен пройти; «the site and the configurator carry the same file» падал и до этой работы).
- [ ] **Step 2:** Показать владельцу кнопку и скачанный паспорт для 2-3 изделий; ждать его слова. Не мержить в `rate-catalog-subcategories` и не пушить.
