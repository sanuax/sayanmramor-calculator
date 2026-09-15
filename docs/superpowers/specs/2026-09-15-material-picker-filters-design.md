# Дизайн: фильтры "Тип камня" и "Цвет" в пикере материала

Дата: 2026-09-15

## Контекст

Продолжение Шага B (`docs/superpowers/specs/2026-09-14-material-picker-design.md`),
где фильтр по породе камня был осознанно отложен ("достаточно фильтра по
твёрдости"). Этот документ добавляет два новых фильтра — "Тип камня" и
"Цвет" — и ради единообразия переводит существующий фильтр по твёрдости
с трёх кнопок-чипов на тот же компонент дропдауна, что и новые фильтры.
Дизайн предложен и одобрен пользователем в предыдущей сессии; здесь он
фиксируется письменно, так как ранее нигде не был записан.

## 1. Парсинг (`scripts/scrape_slabs.py`)

Страница камня содержит блок характеристик вида:

```html
<div class="flex items-center text-sm md:text-base">
  <div class="text-blue-gray ... dark:text-gray-300">Тип материала</div>
  <div class="lg:text-right"><a class="inv-link" href="https://veneziastone.com/marble/">Мрамор</a></div>
</div>
```

Метка ищется по точному тексту, а не по CSS-классам блока (они
Tailwind-generated и могут случайно совпасть с чем-то ещё на странице):

```python
def extract_characteristic(soup, label):
    label_div = soup.find(lambda tag: tag.name == 'div'
                           and 'text-blue-gray' in (tag.get('class') or [])
                           and tag.get_text(strip=True) == label)
    if label_div is None:
        return []
    value_cell = label_div.find_next_sibling('div')
    if value_cell is None:
        return []
    results = []
    for link in value_cell.find_all('a', class_='inv-link'):
        href = link.get('href') or ''
        segments = [s for s in href.split('/') if s]
        results.append({'label_ru': link.get_text(strip=True), 'segment': segments[-1] if segments else None})
    return results
```

Возвращает список (не одно значение) — на случай, если у камня в "Цвет"
несколько ссылок. Вызывается внутри `extract_slabs_from_html` для 'Тип
материала', 'Цвет', 'Страна':

```python
stone['category_label_ru'] = (extract_characteristic(soup, 'Тип материала') or [{}])[0].get('label_ru')
stone['colors'] = extract_characteristic(soup, 'Цвет')
stone['countries'] = extract_characteristic(soup, 'Страна')
```

`merge_stone_into_data` не меняется — она и так перезаписывает весь
`stone`-словарь целиком при непустом скрейпе.

Камни без этого блока на странице получают `category_label_ru: None` и
пустые списки `colors`/`countries` — фильтр их не теряет (пустой список
проходит любой выбранный фильтр так же, как отсутствие фильтра).

## 2. Backfill существующих ~891 камней

Отдельный скрипт не нужен — тот же `scrape_slabs.py`, прогнанный по
списку `source_url` из уже существующего `data/slabs.json` (полный
повторный скрейп перезапишет каждую запись целиком, включая новые поля).

## 3. Данные (`data/slabs.json`)

Новые поля на каждом камне:

```json
{
  "category_label_ru": "Мрамор",
  "colors": [{ "segment": "beige", "label_ru": "Бежевый" }],
  "countries": [{ "segment": "oman", "label_ru": "Оман" }]
}
```

## 4. Логика фильтрации (`material-picker.js`)

```js
function matchesCategoryFilter(stone, selected) {
  if (!selected || selected.length === 0) return true;
  return selected.includes(stone.category);
}
function matchesColorFilter(stone, selected) {
  if (!selected || selected.length === 0) return true;
  return (stone.colors || []).some(c => selected.includes(c.segment));
}
```

Фильтр по типу использует `stone.category` (сегмент URL, уже есть на
каждом камне) — сравнивается с `segment` из `category_label_ru`-блока,
т.к. это один и тот же URL-сегмент категории. Списки опций для всех
трёх дропдаунов (твёрдость/тип/цвет) строятся динамически из фактических
данных при `init()`, а не хардкодятся — не всякая категория/цвет
встречаются в каталоге.

## 5. UI: три дропдауна вместо ряда чипов

`[Твёрдость ▾] [Тип ▾] [Цвет ▾]` — один переиспользуемый компонент
"дропдаун с чекбоксами внутри" для всех трёх, включая твёрдость
(переделывается из 3 статичных кнопок в дропдаун ради единообразия с
новыми фильтрами). Кнопка дропдауна показывает подпись фильтра и
количество активных чекбоксов, если оно больше нуля: "Тип" /
"Тип (2)".

## 6. Карточка камня — подпись типа под названием

```js
if (stone.category_label_ru) {
  const type = document.createElement('div');
  type.className = 'stone-card-type';
  type.textContent = stone.category_label_ru;
  card.appendChild(type);
}
```

## Тестирование

- `tests/test_scrape_slabs.py` — новые кейсы на `extract_characteristic`
  (метка найдена/не найдена, несколько ссылок в значении) и на то, что
  `extract_slabs_from_html` кладёт `category_label_ru`/`colors`/
  `countries` в результат по фикстуре `delicato-brown-slabs.html`
  (`Мрамор` / `[{'segment': 'beige', 'label_ru': 'Бежевый'}]` /
  `[{'segment': 'oman', 'label_ru': 'Оман'}]`).
- `tests/material-picker.test.js` — юнит-тесты на
  `matchesCategoryFilter` и `matchesColorFilter` (пустой выбор =
  показывать всё; несколько значений — ИЛИ; камень без `colors` не
  ломает фильтр).
- Ручная проверка в браузере — три дропдауна открываются/закрываются
  независимо, чекбоксы внутри работают, счётчик в кнопке обновляется,
  твёрдость как дропдаун ведёт себя как раньше как чипы (можно выбрать
  несколько), подпись типа камня отображается на карточке.
