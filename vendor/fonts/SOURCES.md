# Шрифты калькулятора

Те же шрифты, что на сайте (`sayanmramor-site`, `assets/fonts/`, описание там в
`SOURCES.md`): Montserrat — текст, Unbounded — заголовки `h1`/`h2` и название
«Саянмрамор». Файлы скопированы с сайта без изменений 2026-10-10, чтобы
калькулятор и сайт выглядели одним продуктом. Подключены в
`sayanmramor-calculator.html` (`@font-face` в начале `<style>`).

Оба шрифта под SIL Open Font License 1.1, лицензии рядом:
`LICENSE-montserrat.txt`, `LICENSE-unbounded.txt`. Исходник — пакеты
`@fontsource-variable/montserrat@5.3.0` и `@fontsource-variable/unbounded@5.3.0`
(`cdn.jsdelivr.net/npm/...`).

| Файл | Байт | SHA-256 |
|---|---|---|
| `montserrat-cyrillic-wght-normal.woff2` | 23 828 | `a187b077090fe8ae3fd2d7496aabbeae604819c718a282e0afc92df72b450766` |
| `montserrat-latin-wght-normal.woff2` | 37 956 | `06b16db7a969135d48d38c49183be7fb88d4452e2a3011957c7851941f4e4879` |
| `montserrat-latin-ext-wght-normal.woff2` | 70 688 | `54d9a78b7ff60b689ad9f3017ffac8547b5d871afec733f6c1c3ae36577ee504` |
| `unbounded-cyrillic-wght-normal.woff2` | 31 424 | `e30bf6a6063b6a47232bbd657e24c7cf4fdaf76fc2c50d92d9ee63e2ad2087cf` |
| `unbounded-latin-wght-normal.woff2` | 50 904 | `22f9b928aa3928a896340422b54d690fbb5875c30eae4c106f029c61f2289fd6` |

`montserrat-latin-ext` нужен ради знака ₽ (U+20BD) в ценах; браузер скачивает
каждый файл только если на странице есть символы его диапазона (`unicode-range`).

Если шрифты на сайте поменяются, их нужно заменить и здесь.
