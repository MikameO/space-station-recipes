# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 MikameO
# This file is part of Space Station Recipes.
# See LICENSE for details.

"""
One-shot creator for Yandex.Metrika JS-event goals.

app.js / tutorial.js send `ym(id, 'reachGoal', <goal>)` events, but Metrika
silently drops reachGoal hits until a goal with the same identifier exists
on the counter. Creating 21 goals by hand in the UI is error-prone — this
script pushes them all through the Management API in one run.

Idempotent: fetches existing goals first and skips any whose JS-event id is
already registered, so re-running after adding new goals is safe.

Auth: needs an OAuth token with BOTH `metrika:read` and `metrika:write`
scopes — the script reads existing goals before creating, and Yandex's
write scope does not imply read (a write-only token gets 403 on the read
step; verified 2026-07-12). Easiest path — create an app at
https://oauth.yandex.ru/ (or use the Metrika API debug token page
https://yandex.ru/dev/metrika/ru/intro/authorization) and export it
before running.

Usage
-----
    set METRIKA_TOKEN=y0_AgA...        (PowerShell: $env:METRIKA_TOKEN="y0_AgA...")
    python scripts/create_metrika_goals.py
    python scripts/create_metrika_goals.py --dry-run   (print plan, no writes)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

COUNTER_ID = 108585248
API_BASE = "https://api-metrika.yandex.net/management/v1/counter/{cid}/goals"

# (js_event_id, human name shown in the Metrika UI)
# Must stay in sync with the goal ids listed in app.js next to track().
GOALS: list[tuple[str, str]] = [
    ("tab_reactions",     "Вкладка: Reactions"),
    ("tab_calculator",    "Вкладка: Calculator"),
    ("tab_trees",         "Вкладка: Craft Trees"),
    ("tab_graph",         "Вкладка: Graph"),
    ("tab_botany",        "Вкладка: Botany"),
    ("tab_stats",         "Вкладка: Stats"),
    ("tab_antag",         "Вкладка: Antag Strategies"),
    ("reagent_open",      "Открыта карточка реагента"),
    ("fork_select",       "Выбран форк в Source-фильтре"),
    ("search_used",       "Поиск: запрос с результатами"),
    ("search_zero",       "Поиск: 0 результатов"),
    ("calc_run",          "Калькулятор: расчёт рецепта"),
    ("batch_plan",        "Калькулятор: batch-план"),
    ("reverse_used",      "Калькулятор: reverse lookup"),
    ("tree_built",        "Построено craft-дерево"),
    ("share_click",       "Скопирована share-ссылка"),
    ("antag_on",          "Включён antag-режим"),
    ("strategy_to_batch", "Стратегия загружена в batch"),
    ("tutorial_start",    "Туториал: старт"),
    ("tutorial_done",     "Туториал: пройден до конца"),
    ("tutorial_skip",     "Туториал: пропущен"),
]


def api_request(url: str, token: str, payload: dict | None = None) -> dict:
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"OAuth {token}",
            "Content-Type": "application/json",
        },
        method="POST" if payload is not None else "GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        print(f"  API error {e.code}: {body[:300]}", file=sys.stderr)
        raise


def existing_js_event_ids(token: str, counter_id: int) -> set[str]:
    """JS-event ids of goals already present on the counter."""
    data = api_request(API_BASE.format(cid=counter_id), token)
    ids: set[str] = set()
    for goal in data.get("goals", []):
        for cond in goal.get("conditions", []):
            # For type=action goals the event id travels in `url`
            if cond.get("url"):
                ids.add(cond["url"])
    return ids


def main() -> int:
    parser = argparse.ArgumentParser(description="Create Metrika JS-event goals")
    parser.add_argument("--counter", type=int, default=COUNTER_ID)
    parser.add_argument("--token", default=os.environ.get("METRIKA_TOKEN", ""))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.token and not args.dry_run:
        print("No token: set METRIKA_TOKEN or pass --token (see module docstring).",
              file=sys.stderr)
        return 1

    have = existing_js_event_ids(args.token, args.counter) if not args.dry_run else set()
    created = skipped = 0

    for event_id, name in GOALS:
        if event_id in have:
            print(f"  = {event_id:<20} already exists, skip")
            skipped += 1
            continue
        if args.dry_run:
            print(f"  + {event_id:<20} would create: {name}")
            created += 1
            continue
        payload = {"goal": {
            "name": name,
            "type": "action",
            "conditions": [{"type": "exact", "url": event_id}],
        }}
        api_request(API_BASE.format(cid=args.counter), args.token, payload)
        print(f"  + {event_id:<20} created: {name}")
        created += 1

    print(f"\nDone: {created} created, {skipped} already present "
          f"(counter {args.counter}, {len(GOALS)} total in registry).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
