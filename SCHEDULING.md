# Автоматический запуск скрапера

`scripts/scrape_slabs.py` нужно запускать раз в сутки, чтобы
`data/slabs.json` не устаревал. Скрипт нужно запускать на той машине,
которая раздаёт `data/slabs.json` калькулятору (если веб-сервер
компании — это отдельная машина, а не эта, нужен дополнительный шаг
деплоя файла туда — это вне рамок данной инструкции).

## Вариант 1: через `schtasks` (командная строка)

Выполните в PowerShell от имени пользователя, у которого есть доступ
к `D:\calculator` и установленному Python:

    schtasks /create /tn "VeneziaStone-ScrapeSlabs" /tr "python D:\calculator\scripts\scrape_slabs.py" /sc daily /st 07:00 /f

Проверить, что задача создана: `schtasks /query /tn "VeneziaStone-ScrapeSlabs"`
Запустить вручную для проверки: `schtasks /run /tn "VeneziaStone-ScrapeSlabs"`
Удалить задачу: `schtasks /delete /tn "VeneziaStone-ScrapeSlabs" /f`

## Вариант 2: через графический Task Scheduler

1. Открыть "Планировщик заданий" (Task Scheduler).
2. "Создать задачу" (не "Создать простую задачу" — нужны более гибкие
   настройки).
3. Вкладка "Общие": имя `VeneziaStone-ScrapeSlabs`, "Выполнять, не
   зависимо от того, выполнен ли вход пользователя".
4. Вкладка "Триггеры" → "Создать" → "Ежедневно", время 07:00.
5. Вкладка "Действия" → "Создать" → "Запуск программы":
   - Программа: `python`
   - Аргументы: `D:\calculator\scripts\scrape_slabs.py`
   - Рабочая папка: `D:\calculator`
6. Сохранить, ввести пароль пользователя при запросе.

## Проверка логов

Скрипт печатает в stdout/stderr — при запуске через Task Scheduler это
не видно по умолчанию. Чтобы сохранять лог, замените команду на:

    powershell -Command "python D:\calculator\scripts\scrape_slabs.py *> D:\calculator\scrape_slabs.log"

и используйте эту команду в поле "Аргументы" (с `/tr` в варианте 1)
или в шаге 5 (вариант 2).
