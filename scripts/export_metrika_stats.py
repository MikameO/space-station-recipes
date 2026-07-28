# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 MikameO
# This file is part of Space Station Recipes.
# See LICENSE for details.

"""
Repeatable exporter of Yandex.Metrika usage stats for the analytics checkpoint.

Pulls three data classes from counter 108585248 and saves raw JSON responses
to research/site-analytics-<date>/raw/ for offline analysis:

  1. Audience/channels since 2026-04-12 (daily series, traffic sources, geo,
     devices, new-vs-returning) — refresh of the April..July baseline.
  2. Goal conversions since 2026-07-12 (per-goal totals, daily series, and a
     lastTrafficSource split) for the 21 JS-event goals registered in
     create_metrika_goals.py. Goal ids are resolved via the Management API
     because the Reporting API addresses goals by numeric id, not by the
     JS-event identifier.
  3. Visit params tree (paramsLevel1..3) — written independently of goals,
     so it survives even if goals were created late.

Dev visits are excluded with a startURL filter (localhost / 127.0.0.1);
the Metrika counter itself has no such filter configured.

Auth: OAuth token with `metrika:read` scope (the Management API read also
needs it; write scope alone gets 403 — verified 2026-07-12). The token is
taken from METRIKA_TOKEN env var, --token, or a KEY=VALUE line in the
repo-root .env file (gitignored via *.env).

Usage
-----
    python scripts/export_metrika_stats.py                (both windows, all blocks)
    python scripts/export_metrika_stats.py --out-dir research/site-analytics-2026-07-28
    python scripts/export_metrika_stats.py --date-to 2026-07-28
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from create_metrika_goals import COUNTER_ID, GOALS  # noqa: E402  (single source of truth)

STAT_API = "https://api-metrika.yandex.net/stat/v1/data"
MGMT_GOALS_API = "https://api-metrika.yandex.net/management/v1/counter/{cid}/goals"

FULL_FROM = "2026-04-12"    # previous audience baseline start (insight-metrika-audience.md)
EVENTS_FROM = "2026-07-12"  # event analytics deploy date (commit 62c964c)

# Visit-level filter: drop dev sessions; counter has no localhost filter configured.
DEV_FILTER = "ym:s:startURL!@'localhost' AND ym:s:startURL!@'127.0.0.1'"

# Metrika caps metrics at 20 per request -> chunk per-goal metric lists.
METRICS_PER_REQUEST = 20


def load_dotenv_token(repo_root: Path) -> str:
    env_file = repo_root / ".env"
    if not env_file.is_file():
        return ""
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("METRIKA_TOKEN="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def api_get(url: str, token: str, params: dict | None = None) -> dict:
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"Authorization": f"OAuth {token}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        print(f"  API error {e.code}: {body[:300]}", file=sys.stderr)
        if e.code == 403:
            print("  hint: token must carry metrika:read scope "
                  "(write alone is not enough)", file=sys.stderr)
        raise


def stat_query(token: str, counter: int, *, metrics: str, date1: str, date2: str,
               dimensions: str = "", sort: str = "", limit: int = 1000,
               filters: str = DEV_FILTER) -> dict:
    params = {
        "ids": counter,
        "metrics": metrics,
        "date1": date1,
        "date2": date2,
        "limit": limit,
        "accuracy": "full",
    }
    if dimensions:
        params["dimensions"] = dimensions
    if sort:
        params["sort"] = sort
    if filters:
        params["filters"] = filters
    resp = api_get(STAT_API, token, params)
    share = resp.get("sample_share", 1)
    if share and share < 1:
        print(f"  warning: sampled response (sample_share={share})", file=sys.stderr)
    return {"request": params, "response": resp}


def save(out_dir: Path, name: str, payload: dict) -> None:
    path = out_dir / f"{name}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    rows = len(payload.get("response", {}).get("data", []))
    totals = payload.get("response", {}).get("totals")
    print(f"  saved {path.name:<34} rows={rows:<5} totals={totals}")


def fetch_goal_map(token: str, counter: int) -> tuple[dict, list[dict]]:
    """event_id -> numeric goal id for goals present on the counter."""
    data = api_get(MGMT_GOALS_API.format(cid=counter), token)
    raw_goals = data.get("goals", [])
    mapping: dict[str, int] = {}
    for goal in raw_goals:
        for cond in goal.get("conditions", []):
            if cond.get("url"):
                mapping[cond["url"]] = goal["id"]
    return mapping, raw_goals


def chunked_goal_metrics(goal_map: dict, metric_tpls: list[str]) -> list[tuple[list[str], str]]:
    """Split per-goal metric names into <=20-metric requests.

    Returns [(event_ids_in_chunk, comma_joined_metrics), ...]; metric order
    inside a chunk follows event order so responses can be re-labelled.
    """
    per_goal = len(metric_tpls)
    goals_per_req = METRICS_PER_REQUEST // per_goal
    events = [e for e, _ in GOALS if e in goal_map]
    chunks = []
    for i in range(0, len(events), goals_per_req):
        chunk = events[i:i + goals_per_req]
        metrics = ",".join(tpl.format(id=goal_map[e]) for e in chunk for tpl in metric_tpls)
        chunks.append((chunk, metrics))
    return chunks


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    repo_root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description="Export Metrika usage stats")
    parser.add_argument("--counter", type=int, default=COUNTER_ID)
    parser.add_argument("--token", default=os.environ.get("METRIKA_TOKEN", ""))
    parser.add_argument("--full-from", default=FULL_FROM)
    parser.add_argument("--events-from", default=EVENTS_FROM)
    parser.add_argument("--date-to", default=date.today().isoformat())
    parser.add_argument("--out-dir",
                        default=str(repo_root / f"research/site-analytics-{date.today().isoformat()}"))
    args = parser.parse_args()

    token = args.token or load_dotenv_token(repo_root)
    if not token:
        print("No token: set METRIKA_TOKEN, pass --token, or add METRIKA_TOKEN=... "
              "to repo-root .env (see module docstring).", file=sys.stderr)
        return 1

    out_dir = Path(args.out_dir) / "raw"
    out_dir.mkdir(parents=True, exist_ok=True)
    full = dict(date1=args.full_from, date2=args.date_to)
    events = dict(date1=args.events_from, date2=args.date_to)
    q = lambda **kw: stat_query(token, args.counter, **kw)  # noqa: E731

    print(f"Exporting counter {args.counter} -> {out_dir}")
    print(f"  windows: full {full['date1']}..{full['date2']}, "
          f"events {events['date1']}..{events['date2']}")

    # 1. Audience / channels ------------------------------------------------
    save(out_dir, "audience_daily_full", q(
        metrics="ym:s:visits,ym:s:users,ym:s:bounceRate,ym:s:pageDepth,"
                "ym:s:avgVisitDurationSeconds",
        dimensions="ym:s:date", sort="ym:s:date", **full))
    for label, win in (("full", full), ("events", events)):
        save(out_dir, f"sources_{label}", q(
            metrics="ym:s:visits,ym:s:users,ym:s:bounceRate",
            dimensions="ym:s:lastTrafficSource", sort="-ym:s:visits", **win))
        save(out_dir, f"geo_{label}", q(
            metrics="ym:s:visits,ym:s:users",
            dimensions="ym:s:regionCountry", sort="-ym:s:visits", **win))
        save(out_dir, f"new_returning_{label}", q(
            metrics="ym:s:visits,ym:s:users",
            dimensions="ym:s:isNewUser", sort="-ym:s:visits", **win))
    save(out_dir, "sources_detail_full", q(
        metrics="ym:s:visits,ym:s:users,ym:s:bounceRate",
        dimensions="ym:s:lastSourceEngine", sort="-ym:s:visits", **full))
    save(out_dir, "devices_full", q(
        metrics="ym:s:visits,ym:s:users",
        dimensions="ym:s:deviceCategory,ym:s:operatingSystemRoot",
        sort="-ym:s:visits", **full))

    # 2. Goals --------------------------------------------------------------
    goal_map, raw_goals = fetch_goal_map(token, args.counter)
    (out_dir / "goals_registry.json").write_text(
        json.dumps({"event_to_id": goal_map, "goals": raw_goals},
                   ensure_ascii=False, indent=1), encoding="utf-8")
    missing = [e for e, _ in GOALS if e not in goal_map]
    print(f"  goals on counter: {len(goal_map)}; registry: {len(GOALS)}; "
          f"missing: {missing or 'none'}")
    if missing:
        print("  warning: missing goals collect nothing until created "
              "(run create_metrika_goals.py)", file=sys.stderr)

    if goal_map:
        for n, (chunk, metrics) in enumerate(
                chunked_goal_metrics(goal_map, ["ym:s:goal{id}reaches",
                                                "ym:s:goal{id}users"]), 1):
            save(out_dir, f"goal_totals_events_{n}",
                 {"events": chunk, **q(metrics=metrics, **events)})
        for n, (chunk, metrics) in enumerate(
                chunked_goal_metrics(goal_map, ["ym:s:goal{id}reaches"]), 1):
            save(out_dir, f"goal_daily_events_{n}",
                 {"events": chunk, **q(metrics=metrics, dimensions="ym:s:date",
                                       sort="ym:s:date", **events)})
            save(out_dir, f"goal_by_source_events_{n}",
                 {"events": chunk, **q(metrics=metrics,
                                       dimensions="ym:s:lastTrafficSource", **events)})

    # 3. Visit params (independent of goals) --------------------------------
    save(out_dir, "params_events", q(
        metrics="ym:s:visits",
        dimensions="ym:s:paramsLevel1,ym:s:paramsLevel2,ym:s:paramsLevel3",
        sort="-ym:s:visits", **events))

    print("Done. Raw JSON is analysis input; interpret in the research package.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
