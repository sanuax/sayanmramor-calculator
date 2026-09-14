# Дизайн: UI-пикер выбора материала (Шаг B)

Дата: 2026-09-14

## Контекст и цель

Шаг A (пайплайн картинок камней + подготовка данных для "нет в наличии")
завершён и закоммичен. Этот документ — дизайн Шага B: замена плоского
`<select>` выбора материала в `sayanmramor-calculator.html` на
полноэкранную модалку в стиле пикера подарков в Telegram — поиск, сетка
карточек с картинкой, лайтбокс, фильтр по твёрдости, сортировка, ленивая
подгрузка.

## Решения, принятые до этого документа

1. UI — полноэкранная модалка, открывается по клику на поле "Материал",
   закрывается после выбора карточки.
2. Поиск — текстовое поле сверху модалки, по названию камня.
3. Сетка карточек: картинка (из Шага A) + название.
4. Клик по картинке карточки — лайтбокс на весь экран.
5. Фильтр по твёрдости — чипы/чекбоксы над сеткой ("Лёгкая обработка" /
   "Средняя обработка" / "Сложная обработка"), можно выбрать несколько
   одновременно, не вкладки. Фильтра по конкретной породе камня
   (мрамор/гранит/агат/...) в этой версии нет и не планируется — фильтра
   по твёрдости достаточно; при необходимости добавляется отдельной
   задачей позже.
6. Сортировка — по алфавиту (А-Я) и по минимальной цене за м².
7. "Нет в наличии" — такие камни не скрываются, показываются с пометкой.
8. Производительность — ленивая подгрузка карточек порциями по мере
   скролла (889 позиций).

## Найденное расхождение и его решение (Шаг A, доработка)

`merge_stone_into_data` в текущем виде: если скрейп нашёл 0 слэбов для
уже известного камня, запись в `data/slabs.json` не меняется вообще —
старые (потенциально устаревшие) `slabs` остаются как есть, чтобы разовый
глитч скрейпа не стирал реальные данные о распроданном на самом деле
камне. Из этого следует, что `slabs: []` в файле сегодня означает только
"камень, у которого ни разу не было успешного непустого скрейпа" — не
"камень, который был в наличии, а теперь распродан". Это ломает
предпосылку решения №7: в реальности большинство распродаж (был на
складе → закончился) никогда не дадут `slabs: []`.

**Решение:** ввести на каждом камне два новых поля и логику подряд-идущих
пустых прогонов вместо мгновенного флага.

```json
{
  "id": "delicato-brown",
  "name": "Delicato Brown",
  "category": "marble",
  "hardness_category": 1,
  "source_url": "...",
  "image": "images/delicato-brown.webp",
  "available": true,
  "consecutive_empty_scrapes": 0,
  "slabs": [...]
}
```

Логика в `merge_stone_into_data`:

- Непустой результат скрейпа → `consecutive_empty_scrapes = 0`,
  `available = true`, `slabs`/цены обновляются как сегодня (без
  изменений в этой части).
- Пустой результат для уже известного камня → `consecutive_empty_scrapes`
  увеличивается на 1; `slabs` **не трогаются** (остаются как справочные,
  устаревшие данные — решение принято явно: не чистить их до `[]`, чтобы
  сортировка по цене и её отображение в карточке всё ещё были возможны
  для распроданных камней); `available = consecutive_empty_scrapes < 2`.
- Новый камень, впервые встреченный уже пустым → `consecutive_empty_scrapes
  = 1`, `available = true` на этот первый день (см. "Известные
  ограничения" ниже).

Порог — **2 подряд идущих пустых прогона** (скрейп идёт ежедневно):
один глитч прощается, реальная распродажа помечается уже на второй день.

## Данные для пикера

Минимальная цена за м² для сортировки и отображения:

```
minPricePerM2(stone) = min(slab.price_per_m2_rub for slab in stone.slabs
                            if slab.price_per_m2_rub is not null)
                        or null, если таких слэбов нет
```

Камни без вычислимой цены (`null`) всегда идут в конец списка при
сортировке по цене, вне зависимости от направления и от `available`.

## Разметка (`sayanmramor-calculator.html`)

Поле "Материал" перестаёт быть `<select>` и становится кнопкой,
стилизованной как остальные поля формы:

```html
<div class="field">
  <label id="materialLabel">Материал</label>
  <button type="button" class="material-field" id="materialField"
          aria-labelledby="materialLabel" aria-haspopup="dialog">
    <span class="material-field-thumb" id="materialFieldThumb" hidden><img alt=""></span>
    <span class="material-field-text" id="materialFieldText">Выберите камень</span>
    <span class="material-field-chevron" aria-hidden="true">▾</span>
  </button>
</div>
```

До выбора — плейсхолдер "Выберите камень" (по решению: изначально ничего
не выбрано, расчёт не запускается, пока пользователь не выберет камень
через модалку).

Модалка и лайтбокс добавляются один раз, ближе к концу `<body>`, скрыты
по умолчанию (`hidden`):

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

Карточка камня строится в JS (не статическая разметка):

```html
<div class="stone-card" data-id="delicato-brown">
  <div class="stone-card-image">
    <img src="data/images/delicato-brown.webp" loading="lazy" alt="">
    <span class="badge-oos" hidden>Нет в наличии</span>
  </div>
  <div class="stone-card-name">Delicato Brown</div>
</div>
```

## `material-picker.js`

Тот же UMD-паттерн, что и в `pricing.js` (работает и как `<script>` в
браузере через `window.MaterialPicker`, и как `require(...)` в Node для
тестов):

```js
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.MaterialPicker = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function minPricePerM2(stone) { /* ... */ }
  function matchesSearch(stone, query) { /* ... */ }
  function matchesHardnessFilter(stone, selectedHardnesses) { /* ... */ }
  function sortStones(stones, sortKey) { /* ... */ }
  function filterAndSort(stones, { query, hardnesses, sortKey }) { /* ... */ }
  function init({ stones, onSelect }) { /* DOM-обвязка, возвращает { open, close } */ }
  return { minPricePerM2, matchesSearch, matchesHardnessFilter, sortStones, filterAndSort, init };
});
```

`minPricePerM2` / `matchesSearch` / `matchesHardnessFilter` / `sortStones`
/ `filterAndSort` — чистые функции, без DOM, юнит-тестируются напрямую
(как всё содержимое `pricing.js`). `init` — DOM-обвязка (рендер карточек,
`IntersectionObserver`, обработчики событий), проверяется вручную в
браузере, как и остальной инлайн-скрипт страницы сегодня.

Инлайн-скрипт страницы вызывает `MaterialPicker.init({ stones: data.stones,
onSelect: handleMaterialSelected })` один раз после загрузки
`data/slabs.json`, вешает клик по `#materialField` на `picker.open()`, и в
`handleMaterialSelected(stoneId)` обновляет текст/картинку кнопки поля,
сохраняет `stoneId` и вызывает существующий `calculate()`.

## Взаимодействие

- `open()` — сбрасывает поиск/чипы/сортировку к значениям по умолчанию
  (пустой поиск, ни один чип, сортировка "А-Я"), считает
  `filterAndSort(...)`, рендерит первую порцию (40 карточек), показывает
  оверлей, фокус — в поле поиска.
- Изменение поиска/чипов/сортировки — пересчитать список, очистить сетку,
  отрендерить заново с порции 0.
- `IntersectionObserver` на `#pickerSentinel` — при пересечении добавляет
  следующую порцию из уже посчитанного списка; флаг `isLoadingBatch`
  защищает от повторного срабатывания, пока порция ещё рендерится.
- Клик по картинке карточки — `stopPropagation()`, открывает лайтбокс
  с тем же `src` на весь экран.
- Клик по остальной части карточки (включая карточки "нет в наличии") —
  `onSelect(stoneId)`, закрытие модалки. `calculate()` явно проверяет
  `stone.available === false` и в этом случае показывает "нужно уточнить
  у менеджера" с сообщением о распроданном камне, не вызывая
  `Pricing.calculatePrice` — это отдельная проверка от уже существующей
  ветки `no_slabs_for_stone` (камень, для которого вообще никогда не было
  данных о слэбах). Это важно, потому что по дизайну скрейпера
  (`merge_stone_into_data`) запись распроданного камня сохраняет старые,
  устаревшие данные о слэбах с ценой — без явной проверки `available`
  калькулятор выдал бы уверенную, но неактуальную цену.
- Клик по фону/крестику/`Escape` — закрыть модалку без выбора, прежний
  выбор (если был) не меняется.

## Обработка ошибок

- Не загрузился `data/slabs.json` — поле "Материал" показывает
  ошибку/недоступное состояние (расширение уже существующего сообщения
  об ошибке загрузки), клик не открывает модалку.
- Битая/отсутствующая картинка карточки — `onerror` подменяет на
  плейсхолдер; карточка остаётся кликабельной, имя видно.
- Поиск + чипы не дали ни одного результата — показывается
  `#pickerEmpty`, сетка и сентинел скрываются.

## Тестирование

- `tests/test_scrape_slabs.py` — новые кейсы на `available` /
  `consecutive_empty_scrapes`: один пустой прогон ещё не меняет
  `available`; второй подряд — переключает в `false`; последующий
  непустой прогон сбрасывает счётчик и возвращает `available: true`;
  `slabs` не трогаются все это время.
- `tests/material-picker.test.js` (`node:test`, как `pricing.test.js`) —
  юнит-тесты на каждую чистую функцию: `minPricePerM2`, `matchesSearch`
  (регистронезависимый поиск по подстроке), `matchesHardnessFilter`
  (пустой выбор = показывать все; несколько чипов — ИЛИ),
  `sortStones` (алфавит; цена по возрастанию, `null`-цена всегда в
  конце), `filterAndSort`.
- Ручная проверка в браузере (в проекте нет DOM-тест-раннера): открытие/
  закрытие модалки, живой поиск, комбинации чипов, переключение
  сортировки, ленивая подгрузка (через DevTools Network — картинки за
  пределами первой порции не запрашиваются до скролла), лайтбокс, выбор
  как доступного, так и распроданного камня корректно доходит до
  `calculate()`.

## Известные ограничения / вне рамок

- Новый камень, впервые увиденный уже пустым, один день (до второго
  подряд пустого прогона) показывается как доступный, хотя слэбов у него
  нет. Осознанно принято — самоисправляется за сутки, а `calculate()`
  и так корректно обрабатывает пустой `slabs` независимо от `available`.
- Фильтра по породе камня (мрамор/гранит/...) нет — подтверждено,
  достаточно фильтра по твёрдости.
- Ресайз/сжатие картинок под миниатюры — по-прежнему вне рамок (решено
  ещё в Шаге A); сетка использует полноразмерные изображения с
  `loading="lazy"`.
- Отдельного прохода по доступности (клавиатурная навигация, скринридеры)
  сверх базовых `role="dialog"`/`aria-modal` не делается.
- Точный визуальный дизайн (отступы, типографика, анимации) — отдельный
  проход с навыком `frontend-design` на этапе реализации, не фиксируется
  в этом документе.
