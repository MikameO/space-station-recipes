# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 MikameO
# This file is part of Space Station Recipes.
# See LICENSE for details.
"""Validate sections.json against the pages and assets it points to.

Errors (exit 1): bad schema, duplicate ids, missing bilingual text, unknown or
unresolvable target, missing screenshot, missing, malformed or inverted dates.
Warning only: a screenshot committed before its section's `updated` date (needs
git history, so it is skipped on shallow clones and with --no-git).

    python scripts/check_sections.py                # from the repo root
    python scripts/check_sections.py --manifest other.json --no-git
"""
from __future__ import annotations

import argparse
import datetime
import json
import pathlib
import re
import subprocess
import sys

DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
LANGS = ('en', 'ru')
REQUIRED = ('id', 'weight', 'target', 'title', 'desc')
DATED = ('shot', 'added', 'updated', 'whatsNew')


def bilingual(obj) -> bool:
    return isinstance(obj, dict) and all(isinstance(obj.get(l), str) and obj[l].strip() for l in LANGS)


def parse_date(value) -> datetime.date | None:
    if not isinstance(value, str) or not DATE_RE.match(value):
        return None
    try:
        return datetime.date.fromisoformat(value)
    except ValueError:  # 2026-13-45 matches the pattern but is no date
        return None


def git_date(root: pathlib.Path, path: str) -> str | None:
    try:
        shallow = subprocess.run(['git', 'rev-parse', '--is-shallow-repository'], cwd=root,
                                 capture_output=True, text=True).stdout.strip()
        if shallow == 'true':
            return None
        out = subprocess.run(['git', 'log', '-1', '--format=%cs', '--', path], cwd=root,
                             capture_output=True, text=True).stdout.strip()
        return out or None
    except OSError:  # git missing: the staleness check is best-effort
        return None


def check(data: dict, root: pathlib.Path, use_git: bool) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    if data.get('schema') != 1:
        errors.append('schema must be 1')
    sections = data.get('sections') or []
    ids = [s.get('id') for s in sections]
    for dup in sorted({i for i in ids if ids.count(i) > 1}, key=str):
        errors.append(f'duplicate id {dup!r}')

    index_html = (root / 'index.html').read_text(encoding='utf-8')
    tabs = set(re.findall(r'class="tab-btn[^"]*"[^>]*data-tab="([^"]+)"', index_html))
    # CI runs in UTC while the owner commits in UTC+3: a day of slack keeps an
    # evening bump of `updated` from failing the whole deploy.
    latest = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=1)).date()

    for s in sections:
        sid = s.get('id') or '?'
        for k in REQUIRED:
            if k not in s:
                errors.append(f'{sid}: missing {k}')
        for k in ('title', 'desc'):
            if k in s and not bilingual(s[k]):
                errors.append(f'{sid}: {k} needs non-empty en and ru')
        for chip in s.get('inside', []):
            if not bilingual(chip):
                errors.append(f'{sid}: inside chip needs en and ru')
        if s.get('weight') not in ('hero', 'normal'):
            errors.append(f'{sid}: weight must be hero or normal')

        kind, _, arg = str(s.get('target', '')).partition(':')
        if kind == 'tab':
            if arg not in tabs:
                errors.append(f'{sid}: target tab {arg!r} has no .tab-btn[data-tab] in index.html')
        elif kind == 'page':
            if not (root / arg).is_file():
                errors.append(f'{sid}: target page {arg!r} not found')
        elif kind == 'mode':
            if arg != 'antag':
                errors.append(f'{sid}: unknown mode {arg!r}')
        elif kind == 'action':
            if arg != 'feedback':
                errors.append(f'{sid}: unknown action {arg!r}')
        else:
            errors.append(f'{sid}: unknown target kind {kind!r}')

        if kind == 'action':
            continue  # the idea card carries no dates, screenshot or badge
        for k in DATED:
            if k not in s:
                errors.append(f'{sid}: missing {k}')
        if 'whatsNew' in s and not bilingual(s['whatsNew']):
            errors.append(f'{sid}: whatsNew needs non-empty en and ru')
        shot = s.get('shot')
        if shot and not (root / shot).is_file():
            errors.append(f'{sid}: shot {shot!r} not found')
        added, updated = parse_date(s.get('added')), parse_date(s.get('updated'))
        for k, d in (('added', added), ('updated', updated)):
            if k in s and d is None:
                errors.append(f'{sid}: {k} {s.get(k)!r} is not a YYYY-MM-DD date')
        if added and updated:
            if updated < added:
                errors.append(f'{sid}: updated {updated} is before added {added}')
            elif updated > latest:
                errors.append(f'{sid}: updated {updated} is in the future')
        if use_git and shot and updated and (root / shot).is_file():
            shot_date = git_date(root, shot)
            if shot_date and shot_date < updated.isoformat():
                warnings.append(f'{sid}: screenshot last committed {shot_date}, section updated {updated} — re-shoot it')
    return errors, warnings


def main() -> int:
    ap = argparse.ArgumentParser(description='Validate sections.json.')
    ap.add_argument('--manifest', default='sections.json')
    ap.add_argument('--root', default='.')
    ap.add_argument('--no-git', action='store_true', help='skip the screenshot-age warning')
    args = ap.parse_args()
    root = pathlib.Path(args.root)
    try:
        data = json.loads(pathlib.Path(args.manifest).read_text(encoding='utf-8'))
    except (OSError, ValueError) as e:
        print(f'ERROR {args.manifest}: cannot read: {e}')
        return 1
    errors, warnings = check(data, root, use_git=not args.no_git)
    for w in warnings:
        print('WARN ', w)
    for e in errors:
        print('ERROR', e)
    print(f'sections.json: {len(data.get("sections") or [])} sections, {len(errors)} errors, {len(warnings)} warnings')
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
