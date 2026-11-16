# Еженедельное обновление камней (без компьютера владельца)

Каждый понедельник в 04:00 по Москве GitHub сам запускает `.github/workflows/weekly-stones.yml`.
Компьютер владельца и Claude для этого не нужны.

## Что происходит

1. Парсер обходит каталог veneziastone.com (`scripts/collect_catalog_urls.py`) и собирает ссылки
   на все камни. К ним добавляются камни, которые уже есть в `data/slabs.json`
   (так пропавший у поставщика камень тоже проверяется, а не висит «в наличии» вечно).
2. `scripts/scrape_slabs.py --fetch-images` обновляет `data/slabs.json` и картинки. Занимает 2–3 часа.
3. **Проверка** (`scripts/ci_weekly.py check`). Если что-то не так, на этом всё останавливается:
   ничего не коммитится и не выкладывается, сайт остаётся как был, а GitHub шлёт письмо о сбое.
   Остановка при любом из условий:
   - камней стало меньше, чем было, или у камня нет id/названия, или id повторяются;
   - не открылось больше 5% страниц;
   - камней с плитами в наличии стало меньше 90% от прежнего;
   - каталог поставщика отдал меньше 80% от числа наших камней (признак смены вёрстки).
4. Пересобираются `data/stone-index.json` и `data/stone-slabs.json`, прогоняются тесты
   (`node --test tests/*.test.js` и `pytest tests/test_scrape_slabs.py`).
5. Данные коммитятся в ветку `rate-catalog-subcategories` («Weekly stone update ...»).
6. Сайт (`sanuax/sayanmramor-site`, ветка master) и конфигуратор собираются для домена
   (`scripts/build_domain.js`) и заливаются на хостинг reg.ru. На хостинге их принимает
   `~/bin/sayanmramor-receive.sh`: проверяет сборку, старую версию оставляет как
   `www/sayanmramor.ru.prev`, новую ставит вместо живой.
7. Проверяется, что https://sayanmramor.ru/, /studio/ и данные отвечают и на сайте те же данные.

Итоги каждого запуска: GitHub → репозиторий `sanuax/sayanmramor-calculator` → вкладка **Actions** →
**weekly-stones** → нужный запуск → внизу «Summary».

## Запустить вручную

Actions → **weekly-stones** → **Run workflow**:
- `limit` — сколько камней обработать (пусто = все); для проверки поставьте 15;
- `publish` — выключено: только проверить, ничего не коммитить и не выкладывать; включено: как по расписанию.

## Если пришло письмо «weekly-stones failed»

Откройте запуск (вкладка Actions), найдите красный шаг.
- **Safety gate** — данные выглядят сломанными; сайт не тронут. Чаще всего поставщик изменил вёрстку.
  Парсер правится в `scripts/scrape_slabs.py` (и `collect_catalog_urls.py`). Проверка на малой выборке:
  Run workflow с `limit` 15 и `publish` выключено.
- **Upload to sayanmramor.ru** — не принял хостинг (проверки приёмника, доступ, ключ). Данные уже
  в репозитории, следующая успешная загрузка выложит всё.
- **Tests** — упал тест; данные не закоммичены.
- Сайт после выкладки сломан — откат на предыдущую версию: `bash scripts/deploy_regru.sh --rollback`
  в репозитории сайта (или на хостинге: поменять местами `www/sayanmramor.ru` и `www/sayanmramor.ru.prev`).

## Секрет и ключ

- GitHub → репозиторий `sayanmramor-calculator` → Settings → Secrets and variables → Actions →
  секрет `SSH_DEPLOY_KEY` (закрытая часть ключа ed25519).
- Открытая часть лежит на хостинге в `~/.ssh/authorized_keys` с ограничением
  `command="/var/www/u1248418/data/bin/sayanmramor-receive.sh",restrict`: этим ключом нельзя ничего,
  кроме отправки сборки в приёмник. Копия файла до изменения: `~/.ssh/authorized_keys.bak-before-ci`.
- Заменить ключ: создать новый (`ssh-keygen -t ed25519`), заменить строку в `authorized_keys`
  и секрет в GitHub.
- Отключить автоматику: Actions → weekly-stones → «⋯» → Disable workflow, либо убрать строку
  из `authorized_keys`.

## Если запускать парсер на своём компьютере

Данные теперь коммитит GitHub, поэтому перед локальным запуском сделайте `git pull` в ветке
`rate-catalog-subcategories`, иначе при push будет конфликт в `data/slabs.json`.
