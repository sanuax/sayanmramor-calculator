"""Helpers of the weekly stone update (.github/workflows/weekly-stones.yml).

  python scripts/ci_weekly.py queue --catalog <catalog.txt> --slabs data/slabs.json --out <queue.txt>
      The URLs to scrape: every stone of the supplier's catalog + every stone we already have
      (so a stone that left the catalog is still re-checked and, once its page stays empty,
      marked as not available by the scraper's own rule).

  python scripts/ci_weekly.py check --before <old slabs.json> --after data/slabs.json
        --failed <failed_urls.txt> --attempted N --catalog N [--partial]
      The safety gate. Exits 1, and prints why, when the new data looks broken: then nothing
      is committed and nothing is uploaded to the hosting.

Both write a short report to $GITHUB_STEP_SUMMARY when it is set.
"""
import argparse
import json
import os
import sys
from pathlib import Path


def load_stones(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f).get('stones', [])


def summary(lines):
    text = '\n'.join(lines)
    print(text)
    target = os.environ.get('GITHUB_STEP_SUMMARY')
    if target:
        with open(target, 'a', encoding='utf-8') as f:
            f.write(text + '\n')


def read_urls(path):
    urls = []
    for line in Path(path).read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#'):
            urls.append(line)
    return urls


def cmd_queue(args):
    catalog = set(read_urls(args.catalog))
    existing = {s['source_url'] for s in load_stones(args.slabs) if s.get('source_url')}
    queue = sorted(catalog | existing)
    Path(args.out).write_text('\n'.join(queue) + '\n', encoding='utf-8')
    summary([
        '### Очередь парсера',
        f'- в каталоге поставщика: {len(catalog)}',
        f'- уже есть у нас: {len(existing)}',
        f'- новых камней: {len(catalog - existing)}',
        f'- есть у нас, но нет в каталоге (проверим, остались ли они): {len(existing - catalog)}',
        f'- всего к проверке: {len(queue)}',
    ])
    out = os.environ.get('GITHUB_OUTPUT')
    if out:
        with open(out, 'a', encoding='utf-8') as f:
            f.write(f'catalog_count={len(catalog)}\nqueue_count={len(queue)}\n')


def usable(stone):
    return stone.get('available') is not False and bool(stone.get('slabs'))


def cmd_check(args):
    before = load_stones(args.before)
    after = load_stones(args.after)
    failed = len(read_urls(args.failed)) if Path(args.failed).exists() else 0
    problems = []

    if len(after) < len(before):
        problems.append(f'камней стало меньше: было {len(before)}, стало {len(after)}')
    bad = [s for s in after if not s.get('id') or not s.get('name')]
    if bad:
        problems.append(f'{len(bad)} камней без id или названия')
    ids = [s.get('id') for s in after]
    if len(ids) != len(set(ids)):
        problems.append('в каталоге есть повторяющиеся id')

    max_failed = 0.20 if args.partial else 0.05
    if args.attempted and failed > args.attempted * max_failed:
        problems.append(f'не открылось {failed} страниц из {args.attempted} (допустимо не больше {int(max_failed * 100)}%)')

    ok_before = sum(1 for s in before if usable(s))
    ok_after = sum(1 for s in after if usable(s))
    if not args.partial:
        if ok_after < ok_before * 0.9:
            problems.append(f'камней с плитами в наличии стало заметно меньше: {ok_before} -> {ok_after} (меньше 90%)')
        if before and args.catalog < len(before) * args.min_catalog:
            problems.append(f'каталог поставщика отдал {args.catalog} камней при {len(before)} у нас '
                            f'(меньше {int(args.min_catalog * 100)}%): похоже, вёрстка сайта поставщика изменилась')

    summary([
        '### Проверка данных',
        f'- камней: {len(before)} -> {len(after)}',
        f'- с плитами в наличии: {ok_before} -> {ok_after}',
        f'- страниц не открылось: {failed} из {args.attempted}',
        '- итог: ' + ('ОШИБКА' if problems else 'данные в порядке'),
    ] + [f'  - {p}' for p in problems])
    if problems:
        print('SAFETY GATE FAILED:', '; '.join(problems), file=sys.stderr)
        sys.exit(1)


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest='cmd', required=True)
    q = sub.add_parser('queue')
    q.add_argument('--catalog', required=True)
    q.add_argument('--slabs', required=True)
    q.add_argument('--out', required=True)
    c = sub.add_parser('check')
    c.add_argument('--before', required=True)
    c.add_argument('--after', required=True)
    c.add_argument('--failed', required=True)
    c.add_argument('--attempted', type=int, required=True)
    c.add_argument('--catalog', type=int, default=0)
    c.add_argument('--min-catalog', type=float, default=0.8)
    c.add_argument('--partial', action='store_true')
    args = p.parse_args()
    {'queue': cmd_queue, 'check': cmd_check}[args.cmd](args)


if __name__ == '__main__':
    main()
