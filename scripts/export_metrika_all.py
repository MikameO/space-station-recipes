# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 MikameO
# This file is part of Space Station Recipes.
# See LICENSE for details.

"""
Everything-sweep exporter for Yandex.Metrika counter 108585248.

export_metrika_stats.py pulls the fixed checkpoint set (audience, goals,
params). This script pulls everything else the API will give, for offline
analysis. Best effort: a failing report is recorded in manifest.json and
the sweep moves on, so a wrong dimension name never aborts the run.

Blocks (select with --only, comma-separated; default: all of them):
  mgmt     Management API snapshot: counter, goals, filters, operations,
           segments, chart annotations, log requests -> <out>/mgmt/*.json
  reports  Reporting API sweep over visit- and hit-level dimensions for
           several date windows                     -> <out>/reports/<window>/*.json
  goals    every goal on the counter (registry + historical): totals, daily,
           by source / country / device / newness    -> <out>/reports/<window>/goal_*.json
  params   visit params tree, levels 1..5, level-1 x date, level-1 x source
  logs     Logs API raw dumps of visits and hits     -> <out>/logs/*.tsv
           (visit-level rows with clientID; kept out of git via .gitignore)

Windows: all (counter creation .. date-to), events (2026-07-12 ..),
cp3 (2026-07-28 .., the checkpoint-3 window). Dev visits are excluded
with the same startURL filter as export_metrika_stats.py; the Logs API
dump is unfiltered (filter offline by ym:s:startURL).

Auth: OAuth token with metrika:read, from METRIKA_TOKEN, --token, or a
METRIKA_TOKEN=... line in the repo-root .env (same lookup as the
checkpoint exporter). Logs API needs no extra scope.

Usage
-----
    python scripts/export_metrika_all.py
    python scripts/export_metrika_all.py --out-dir research/site-analytics-2026-09-12
    python scripts/export_metrika_all.py --only logs --logs-wait 900
    python scripts/export_metrika_all.py --skip-logs
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from create_metrika_goals import COUNTER_ID  # noqa: E402
from export_metrika_stats import DEV_FILTER, EVENTS_FROM, FULL_FROM, load_dotenv_token  # noqa: E402

STAT_API = "https://api-metrika.yandex.net/stat/v1/data"
MGMT = "https://api-metrika.yandex.net/management/v1"
CP3_FROM = "2026-07-28"           # checkpoint-3 window start (goals v2 created)
PV_DEV_FILTER = "ym:pv:URL!@'localhost' AND ym:pv:URL!@'127.0.0.1'"
PAUSE = 0.35                      # seconds between Reporting API calls
TIMEOUT = 60
MAX_LIMIT = 100000                # Reporting API hard cap per request

CORE_S = ("ym:s:visits,ym:s:users,ym:s:pageviews,ym:s:bounceRate,"
          "ym:s:pageDepth,ym:s:avgVisitDurationSeconds")
VU = "ym:s:visits,ym:s:users"
PV = "ym:pv:pageviews,ym:pv:users"

# (name, metrics, dimensions, sort, limit, windows)
VISIT_REPORTS: list[tuple[str, str, str, str, int, list[str]]] = [
    # time
    ("daily", CORE_S + ",ym:s:percentNewVisitors,ym:s:sumGoalReachesAny",
     "ym:s:date", "ym:s:date", 10000, ["all"]),
    ("weekly", CORE_S + ",ym:s:percentNewVisitors,ym:s:sumGoalReachesAny",
     "ym:s:startOfWeek", "ym:s:startOfWeek", 1000, ["all"]),
    ("monthly", CORE_S + ",ym:s:percentNewVisitors,ym:s:sumGoalReachesAny",
     "ym:s:startOfMonth", "ym:s:startOfMonth", 1000, ["all"]),
    ("day_of_week", CORE_S, "ym:s:dayOfWeek", "ym:s:dayOfWeek", 100, ["all", "cp3"]),
    ("hour", CORE_S, "ym:s:hour", "ym:s:hour", 100, ["all", "cp3"]),
    ("dow_hour", VU, "ym:s:dayOfWeek,ym:s:hour", "ym:s:dayOfWeek,ym:s:hour", 1000, ["all"]),
    # sources
    ("traffic_source", CORE_S, "ym:s:lastTrafficSource", "-ym:s:visits", 1000,
     ["all", "events", "cp3"]),
    ("source_engine", CORE_S, "ym:s:lastSourceEngine", "-ym:s:visits", 1000, ["all", "cp3"]),
    ("referal_source", CORE_S, "ym:s:lastReferalSource", "-ym:s:visits", 5000, ["all", "cp3"]),
    ("referer", VU, "ym:s:referer", "-ym:s:visits", 10000, ["all"]),
    ("search_engine", CORE_S, "ym:s:lastSearchEngine", "-ym:s:visits", 1000, ["all"]),
    ("search_phrase", VU, "ym:s:searchPhrase", "-ym:s:visits", 5000, ["all"]),
    ("social_network", CORE_S, "ym:s:lastSocialNetwork", "-ym:s:visits", 1000, ["all"]),
    ("social_profile", VU, "ym:s:lastSocialNetworkProfile", "-ym:s:visits", 5000, ["all"]),
    ("messenger", VU, "ym:s:lastMessenger", "-ym:s:visits", 1000, ["all"]),
    ("recommendation_system", VU, "ym:s:lastRecommendationSystem", "-ym:s:visits", 1000, ["all"]),
    ("utm", VU, "ym:s:UTMSource,ym:s:UTMMedium,ym:s:UTMCampaign", "-ym:s:visits", 5000, ["all"]),
    ("utm_content_term", VU, "ym:s:UTMContent,ym:s:UTMTerm", "-ym:s:visits", 5000, ["all"]),
    ("from_tag", VU, "ym:s:from", "-ym:s:visits", 1000, ["all"]),
    ("start_url", VU + ",ym:s:bounceRate", "ym:s:startURL", "-ym:s:visits", 10000, ["all", "cp3"]),
    ("start_url_path", VU + ",ym:s:bounceRate", "ym:s:startURLPathFull", "-ym:s:visits", 10000, ["all"]),
    ("end_url", VU, "ym:s:endURL", "-ym:s:visits", 10000, ["all"]),
    # geo
    ("country", CORE_S, "ym:s:regionCountry", "-ym:s:visits", 1000, ["all", "events", "cp3"]),
    ("region", CORE_S, "ym:s:regionArea", "-ym:s:visits", 5000, ["all"]),
    ("city", VU, "ym:s:regionCountry,ym:s:regionCity", "-ym:s:visits", 10000, ["all", "cp3"]),
    # tech
    ("device", CORE_S, "ym:s:deviceCategory", "-ym:s:visits", 100, ["all", "events", "cp3"]),
    ("os_root", CORE_S, "ym:s:operatingSystemRoot", "-ym:s:visits", 1000, ["all"]),
    ("os", CORE_S, "ym:s:operatingSystem", "-ym:s:visits", 1000, ["all"]),
    ("device_os", CORE_S, "ym:s:deviceCategory,ym:s:operatingSystemRoot", "-ym:s:visits", 1000,
     ["all", "cp3"]),
    ("browser", CORE_S, "ym:s:browser", "-ym:s:visits", 1000, ["all", "cp3"]),
    ("browser_version", VU, "ym:s:browserAndVersionMajor", "-ym:s:visits", 5000, ["all"]),
    ("browser_engine", VU, "ym:s:browserEngine", "-ym:s:visits", 1000, ["all"]),
    ("phone_vendor", VU, "ym:s:mobilePhone", "-ym:s:visits", 1000, ["all"]),
    ("phone_model", VU, "ym:s:mobilePhone,ym:s:mobilePhoneModel", "-ym:s:visits", 5000, ["all"]),
    ("screen_resolution", VU, "ym:s:screenResolution", "-ym:s:visits", 5000, ["all"]),
    ("screen_width", VU, "ym:s:screenWidth", "-ym:s:visits", 5000, ["all"]),
    ("screen_format", VU, "ym:s:screenFormat", "-ym:s:visits", 1000, ["all"]),
    ("screen_orientation", VU, "ym:s:screenOrientation", "-ym:s:visits", 100, ["all"]),
    ("window_area", VU, "ym:s:windowClientArea", "-ym:s:visits", 10000, ["all"]),
    ("browser_language", CORE_S, "ym:s:browserLanguage", "-ym:s:visits", 1000, ["all", "cp3"]),
    ("browser_country", VU, "ym:s:browserCountry", "-ym:s:visits", 1000, ["all"]),
    ("timezone", VU, "ym:s:clientTimeZone", "-ym:s:visits", 1000, ["all"]),
    ("cookie_enabled", VU, "ym:s:cookieEnabled", "-ym:s:visits", 100, ["all"]),
    ("javascript_enabled", VU, "ym:s:javascriptEnabled", "-ym:s:visits", 100, ["all"]),
    ("is_robot", VU, "ym:s:isRobot", "-ym:s:visits", 100, ["all"]),
    # behaviour
    ("new_returning", CORE_S, "ym:s:isNewUser", "-ym:s:visits", 100, ["all", "events", "cp3"]),
    ("duration_interval", VU, "ym:s:visitDurationInterval", "-ym:s:visits", 100, ["all", "cp3"]),
    ("depth_interval", VU, "ym:s:pageViewsInterval", "-ym:s:visits", 100, ["all", "cp3"]),
    ("days_since_first_visit", VU, "ym:s:daysSinceFirstVisitInterval", "-ym:s:visits", 100,
     ["all", "cp3"]),
    ("visits_per_user", VU, "ym:s:userVisitsInterval", "-ym:s:visits", 100, ["all", "cp3"]),
    ("days_since_previous_visit", VU, "ym:s:daysSincePreviousVisitInterval", "-ym:s:visits", 100,
     ["all"]),
    ("first_visit_date", VU, "ym:s:firstVisitDate", "ym:s:firstVisitDate", 10000, ["all"]),
    # demographics (Metrika's aggregate estimates)
    ("gender", VU, "ym:s:gender", "-ym:s:visits", 100, ["all"]),
    ("age", VU, "ym:s:ageInterval", "-ym:s:visits", 100, ["all"]),
    ("gender_age", VU, "ym:s:gender,ym:s:ageInterval", "-ym:s:visits", 100, ["all"]),
    ("interests", VU, "ym:s:interest2d1", "-ym:s:visits", 1000, ["all"]),
    ("interests_legacy", VU, "ym:s:interest", "-ym:s:visits", 1000, ["all"]),
]

HIT_REPORTS: list[tuple[str, str, str, str, int, list[str]]] = [
    ("pv_daily", PV, "ym:pv:date", "ym:pv:date", 10000, ["all"]),
    ("pv_url", PV, "ym:pv:URL", "-ym:pv:pageviews", 20000, ["all", "cp3"]),
    ("pv_url_path", PV, "ym:pv:URLPathFull", "-ym:pv:pageviews", 10000, ["all"]),
    ("pv_url_hash", PV, "ym:pv:URLHash", "-ym:pv:pageviews", 10000, ["all"]),
    ("pv_title", PV, "ym:pv:title", "-ym:pv:pageviews", 5000, ["all"]),
    ("pv_referer", PV, "ym:pv:referer", "-ym:pv:pageviews", 10000, ["all"]),
    ("pv_hour", PV, "ym:pv:hour", "ym:pv:hour", 100, ["all"]),
    ("pv_day_of_week", PV, "ym:pv:dayOfWeek", "ym:pv:dayOfWeek", 100, ["all"]),
    ("pv_device", PV, "ym:pv:deviceCategory", "-ym:pv:pageviews", 100, ["all"]),
]

# Other namespaces; dev filter does not apply (different attribute set).
EXTRA_REPORTS: list[tuple[str, str, str, str, int, list[str]]] = [
    ("external_links_url", "ym:el:links,ym:el:users", "ym:el:URL", "-ym:el:links", 5000, ["all"]),
    ("downloads_url", "ym:dl:downloads,ym:dl:users", "ym:dl:URL", "-ym:dl:downloads", 5000, ["all"]),
]

# Logs API field sets; <attribution> placeholder resolved as "last".
# ym:s:ipAddress / ym:pv:ipAddress deliberately omitted (personal data, no
# analytical use here); isRobotPro is Metrika Pro only.
VISIT_FIELDS = [
    "visitID", "counterID", "watchIDs", "date", "dateTime", "dateTimeUTC", "isNewUser",
    "startURL", "endURL", "pageViews", "visitDuration", "bounce", "regionCountry",
    "regionCity", "clientID", "counterUserIDHash", "goalsID", "goalsSerialNumber",
    "goalsDateTime", "lastTrafficSource", "lastAdvEngine", "lastReferalSource",
    "lastSearchEngineRoot", "lastSearchEngine", "lastSocialNetwork",
    "lastSocialNetworkProfile", "lastRecommendationSystem", "lastMessenger", "referer",
    "from", "lastUTMCampaign", "lastUTMContent", "lastUTMMedium", "lastUTMSource",
    "lastUTMTerm", "browserLanguage", "browserCountry", "clientTimeZone",
    "deviceCategory", "mobilePhone", "mobilePhoneModel", "operatingSystemRoot",
    "operatingSystem", "browser", "browserMajorVersion", "browserMinorVersion",
    "browserEngine", "cookieEnabled", "javascriptEnabled", "screenFormat",
    "screenColors", "screenOrientationName", "screenWidth", "screenHeight",
    "physicalScreenWidth", "physicalScreenHeight", "windowClientWidth",
    "windowClientHeight",
] + [f"parsedParamsKey{i}" for i in range(1, 11)]

HIT_FIELDS = [
    "watchID", "pageViewID", "visitID", "counterID", "clientID", "counterUserIDHash",
    "date", "dateTime", "title", "URL", "referer", "UTMCampaign", "UTMContent",
    "UTMMedium", "UTMSource", "UTMTerm", "from", "lastTrafficSource",
    "lastSearchEngineRoot", "lastSearchEngine", "lastSocialNetwork",
    "lastSocialNetworkProfile", "recommendationSystem", "messenger", "browser",
    "browserMajorVersion", "browserEngine", "browserLanguage", "clientTimeZone",
    "cookieEnabled", "deviceCategory", "javascriptEnabled", "mobilePhone",
    "mobilePhoneModel", "operatingSystem", "operatingSystemRoot", "screenFormat",
    "screenOrientationName", "screenWidth", "screenHeight", "windowClientWidth",
    "windowClientHeight", "regionCity", "regionCountry", "isPageView", "iFrame", "link",
    "download", "notBounce", "artificial", "goalsID", "params", "httpError",
] + [f"parsedParamsKey{i}" for i in range(1, 11)]

# Minimal field sets to fall back on when the API rejects the list without
# naming the offending field.
VISIT_FIELDS_SAFE = [
    "visitID", "date", "dateTime", "isNewUser", "startURL", "endURL", "pageViews",
    "visitDuration", "bounce", "regionCountry", "clientID", "goalsID", "goalsDateTime",
    "lastTrafficSource", "lastReferalSource", "referer", "deviceCategory",
    "operatingSystemRoot", "browser", "browserLanguage",
] + [f"parsedParamsKey{i}" for i in range(1, 6)]
HIT_FIELDS_SAFE = [
    "watchID", "visitID", "clientID", "date", "dateTime", "title", "URL", "referer",
    "lastTrafficSource", "deviceCategory", "isPageView", "artificial", "goalsID", "params",
] + [f"parsedParamsKey{i}" for i in range(1, 6)]


class ApiError(Exception):
    def __init__(self, code: int, body: str):
        super().__init__(f"HTTP {code}: {body[:300]}")
        self.code = code
        self.body = body


def api_call(url: str, token: str, params: dict | None = None, *, method: str = "GET",
             raw: bool = False, retries: int = 4):
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    for attempt in range(retries):
        req = urllib.request.Request(url, method=method,
                                     headers={"Authorization": f"OAuth {token}"})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                body = resp.read().decode("utf-8")
                return body if raw else (json.loads(body) if body else {})
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            if e.code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                time.sleep(2 ** attempt * 2)
                continue
            raise ApiError(e.code, body)
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            if attempt < retries - 1:
                time.sleep(2 ** attempt * 2)
                continue
            raise ApiError(0, str(e))


@dataclass
class Ctx:
    token: str
    counter: int
    out: Path
    windows: dict[str, tuple[str, str]]
    manifest: list[dict] = field(default_factory=list)

    def record(self, block: str, name: str, window: str, ok: bool, **extra) -> None:
        self.manifest.append({"block": block, "name": name, "window": window, "ok": ok, **extra})


def dump(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")


# --- Reporting API -----------------------------------------------------------

def stat(ctx: Ctx, *, metrics: str, dims: str, date1: str, date2: str, sort: str,
         limit: int, filters: str) -> dict:
    params: dict = {"ids": ctx.counter, "metrics": metrics, "date1": date1, "date2": date2,
                    "limit": min(limit, MAX_LIMIT), "accuracy": "full"}
    if dims:
        params["dimensions"] = dims
    if sort:
        params["sort"] = sort
    if filters:
        params["filters"] = filters
    resp = api_call(STAT_API, ctx.token, params)
    # Follow pages when the requested limit was smaller than the result set.
    total = resp.get("total_rows", 0)
    data = resp.get("data", [])
    offset = 1
    while total and len(data) < total and offset + params["limit"] <= MAX_LIMIT * 10:
        offset += params["limit"]
        time.sleep(PAUSE)
        more = api_call(STAT_API, ctx.token, {**params, "offset": offset})
        chunk = more.get("data", [])
        if not chunk:
            break
        data.extend(chunk)
    resp["data"] = data
    share = resp.get("sample_share", 1)
    if share and share < 1:
        print(f"    warning: sampled response (sample_share={share})", file=sys.stderr)
    return {"request": params, "response": resp}


def run_report(ctx: Ctx, block: str, name: str, window: str, *, metrics: str, dims: str,
               sort: str, limit: int, filters: str, extra: dict | None = None) -> None:
    d1, d2 = ctx.windows[window]
    path = ctx.out / "reports" / window / f"{name}.json"
    try:
        payload = stat(ctx, metrics=metrics, dims=dims, date1=d1, date2=d2, sort=sort,
                       limit=limit, filters=filters)
        if extra:
            payload = {**extra, **payload}
        dump(path, payload)
        rows = len(payload["response"].get("data", []))
        totals = payload["response"].get("totals")
        ctx.record(block, name, window, True, rows=rows, file=str(path.relative_to(ctx.out)))
        print(f"  ok   {window:<6} {name:<28} rows={rows:<6} totals={totals}")
    except ApiError as e:
        ctx.record(block, name, window, False, error=str(e))
        print(f"  FAIL {window:<6} {name:<28} {e}")
    time.sleep(PAUSE)


def block_reports(ctx: Ctx) -> None:
    print("\n[reports] visit-level sweep")
    for name, metrics, dims, sort, limit, windows in VISIT_REPORTS:
        for w in windows:
            run_report(ctx, "reports", name, w, metrics=metrics, dims=dims, sort=sort,
                       limit=limit, filters=DEV_FILTER)
    print("\n[reports] hit-level sweep")
    for name, metrics, dims, sort, limit, windows in HIT_REPORTS:
        for w in windows:
            run_report(ctx, "reports", name, w, metrics=metrics, dims=dims, sort=sort,
                       limit=limit, filters=PV_DEV_FILTER)
    print("\n[reports] other namespaces")
    for name, metrics, dims, sort, limit, windows in EXTRA_REPORTS:
        for w in windows:
            run_report(ctx, "reports", name, w, metrics=metrics, dims=dims, sort=sort,
                       limit=limit, filters="")


# --- Goals ------------------------------------------------------------------

def counter_goals(ctx: Ctx) -> list[tuple[str, int]]:
    """(label, goal id) for every goal on the counter, JS-event id as label."""
    data = api_call(f"{MGMT}/counter/{ctx.counter}/goals", ctx.token)
    goals: list[tuple[str, int]] = []
    for g in data.get("goals", []):
        label = next((c["url"] for c in g.get("conditions", []) if c.get("url")), None)
        goals.append((label or f"goal_{g['id']}_{g.get('name', '')}", g["id"]))
    return goals


def goal_chunks(goals: list[tuple[str, int]], tpls: list[str]):
    per = max(1, 20 // len(tpls))
    for i in range(0, len(goals), per):
        chunk = goals[i:i + per]
        yield ([label for label, _ in chunk],
               ",".join(t.format(id=gid) for _, gid in chunk for t in tpls))


def block_goals(ctx: Ctx) -> None:
    print("\n[goals]")
    try:
        goals = counter_goals(ctx)
    except ApiError as e:
        ctx.record("goals", "counter_goals", "-", False, error=str(e))
        print(f"  FAIL counter goals: {e}")
        return
    print(f"  {len(goals)} goals on counter")
    reaches = ["ym:s:goal{id}reaches"]
    full = ["ym:s:goal{id}reaches", "ym:s:goal{id}users", "ym:s:goal{id}conversionRate"]
    # Sort must name a metric or dimension present in the request (error 4012),
    # so the by-* cuts sort on the chunk's first goal metric.
    cuts = [("goal_daily", "ym:s:date", "ym:s:date"),
            ("goal_by_source", "ym:s:lastTrafficSource", None),
            ("goal_by_referal", "ym:s:lastReferalSource", None),
            ("goal_by_country", "ym:s:regionCountry", None),
            ("goal_by_device", "ym:s:deviceCategory", None),
            ("goal_by_newness", "ym:s:isNewUser", None),
            ("goal_by_start_url", "ym:s:startURL", None)]
    for w in ("events", "cp3"):
        for n, (labels, metrics) in enumerate(goal_chunks(goals, full), 1):
            run_report(ctx, "goals", f"goal_totals_{n}", w, metrics=metrics, dims="", sort="",
                       limit=100, filters=DEV_FILTER, extra={"events": labels})
        for name, dims, sort in cuts:
            for n, (labels, metrics) in enumerate(goal_chunks(goals, reaches), 1):
                run_report(ctx, "goals", f"{name}_{n}", w, metrics=metrics, dims=dims,
                           sort=sort or f"-{metrics.split(',')[0]}", limit=5000,
                           filters=DEV_FILTER, extra={"events": labels})
    # any-goal series over the whole life of the counter
    run_report(ctx, "goals", "any_goal_daily", "all",
               metrics="ym:s:visits,ym:s:sumGoalReachesAny,ym:s:anyGoalConversionRate",
               dims="ym:s:date", sort="ym:s:date", limit=10000, filters=DEV_FILTER)


# --- Params -----------------------------------------------------------------

def block_params(ctx: Ctx) -> None:
    print("\n[params]")
    for w in ("events", "cp3"):
        for k in range(1, 6):
            dims = ",".join(f"ym:s:paramsLevel{i}" for i in range(1, k + 1))
            run_report(ctx, "params", f"params_l{k}", w, metrics=VU, dims=dims,
                       sort="-ym:s:visits", limit=50000, filters=DEV_FILTER)
    run_report(ctx, "params", "params_l1_daily", "events", metrics=VU,
               dims="ym:s:paramsLevel1,ym:s:date", sort="ym:s:date", limit=50000,
               filters=DEV_FILTER)
    run_report(ctx, "params", "params_l2_daily", "events", metrics=VU,
               dims="ym:s:paramsLevel1,ym:s:paramsLevel2,ym:s:date", sort="ym:s:date",
               limit=100000, filters=DEV_FILTER)
    run_report(ctx, "params", "params_l1_by_source", "events", metrics=VU,
               dims="ym:s:paramsLevel1,ym:s:lastTrafficSource", sort="-ym:s:visits",
               limit=50000, filters=DEV_FILTER)
    run_report(ctx, "params", "params_l2_by_source", "events", metrics=VU,
               dims="ym:s:paramsLevel1,ym:s:paramsLevel2,ym:s:lastTrafficSource",
               sort="-ym:s:visits", limit=50000, filters=DEV_FILTER)
    run_report(ctx, "params", "params_l1_by_device", "events", metrics=VU,
               dims="ym:s:paramsLevel1,ym:s:deviceCategory", sort="-ym:s:visits",
               limit=50000, filters=DEV_FILTER)
    run_report(ctx, "params", "params_l1_by_country", "events", metrics=VU,
               dims="ym:s:paramsLevel1,ym:s:regionCountry", sort="-ym:s:visits",
               limit=50000, filters=DEV_FILTER)


# --- Management API ---------------------------------------------------------

REDACT_KEYS = {"owner_login", "grants", "email", "emails"}


def redact(obj):
    if isinstance(obj, dict):
        return {k: redact(v) for k, v in obj.items() if k not in REDACT_KEYS}
    if isinstance(obj, list):
        return [redact(v) for v in obj]
    return obj


def fetch_counter(ctx: Ctx) -> dict:
    return api_call(f"{MGMT}/counter/{ctx.counter}", ctx.token).get("counter", {})


def block_mgmt(ctx: Ctx, counter: dict) -> None:
    print("\n[mgmt]")
    dump(ctx.out / "mgmt" / "counter.json", redact(counter))
    ctx.record("mgmt", "counter", "-", True, file="mgmt/counter.json")
    print("  ok   counter")
    for name in ("goals", "filters", "operations", "segments", "chart_annotations",
                 "logrequests"):
        try:
            data = api_call(f"{MGMT}/counter/{ctx.counter}/{name}", ctx.token)
            dump(ctx.out / "mgmt" / f"{name}.json", redact(data))
            ctx.record("mgmt", name, "-", True, file=f"mgmt/{name}.json")
            n = next((len(v) for v in data.values() if isinstance(v, list)), "?")
            print(f"  ok   {name:<18} items={n}")
        except ApiError as e:
            ctx.record("mgmt", name, "-", False, error=str(e))
            print(f"  FAIL {name:<18} {e}")
        time.sleep(PAUSE)


# --- Logs API ---------------------------------------------------------------

def drop_named_fields(fields: list[str], prefix: str, body: str) -> list[str]:
    named = set(re.findall(rf"{prefix}[A-Za-z0-9]+", body))
    return [f for f in fields if f"{prefix}{f}" in named]


def logs_dump(ctx: Ctx, source: str, fields: list[str], safe_fields: list[str],
              date1: str, date2: str, wait: int, keep: bool) -> None:
    prefix = "ym:s:" if source == "visits" else "ym:pv:"
    base = f"{MGMT}/counter/{ctx.counter}"
    fields = list(fields)
    name = f"{source}_{date1}_{date2}"

    # 1. evaluate, shedding rejected field names
    ev = None
    for _ in range(8):
        q = {"date1": date1, "date2": date2, "source": source,
             "fields": ",".join(prefix + f for f in fields)}
        try:
            ev = api_call(f"{base}/logrequests/evaluate", ctx.token, q)
            break
        except ApiError as e:
            bad = drop_named_fields(fields, prefix, e.body)
            if bad:
                print(f"  dropping rejected fields: {bad}")
                fields = [f for f in fields if f not in bad]
            elif fields != safe_fields:
                print(f"  evaluate rejected the field list ({e}); retrying with the safe set")
                fields = list(safe_fields)
            else:
                ctx.record("logs", name, "-", False, error=str(e))
                print(f"  FAIL {name}: {e}")
                return
    if not ev or not ev.get("log_request_evaluation", {}).get("possible"):
        ctx.record("logs", name, "-", False, error=f"not possible: {ev}")
        print(f"  FAIL {name}: evaluation says not possible: {ev}")
        return

    # 2. reuse a matching request if one is already on the server
    wanted = {prefix + f for f in fields}
    req = None
    for r in api_call(f"{base}/logrequests", ctx.token).get("requests", []):
        if (r.get("source") == source and r.get("date1") == date1 and r.get("date2") == date2
                and set(r.get("fields", [])) == wanted
                and r.get("status") in ("created", "processed")):
            req = r
            print(f"  reusing log request {r['request_id']} ({r['status']})")
            break
    if req is None:
        q = {"date1": date1, "date2": date2, "source": source,
             "fields": ",".join(prefix + f for f in fields)}
        req = api_call(f"{base}/logrequests", ctx.token, q, method="POST")["log_request"]
        print(f"  created log request {req['request_id']}")
    rid = req["request_id"]

    # 3. poll
    deadline = time.time() + wait
    while req.get("status") != "processed":
        if req.get("status") in ("processing_failed", "canceled", "cleaned_by_user"):
            ctx.record("logs", name, "-", False, error=f"status {req['status']}", request_id=rid)
            print(f"  FAIL {name}: request {rid} status {req['status']}")
            return
        if time.time() > deadline:
            ctx.record("logs", name, "-", False, error="still processing; rerun --only logs",
                       request_id=rid)
            print(f"  PENDING {name}: request {rid} still {req.get('status')}; "
                  f"rerun with --only logs later")
            return
        time.sleep(15)
        req = api_call(f"{base}/logrequest/{rid}", ctx.token)["log_request"]
        print(f"    {rid}: {req.get('status')} ...")

    # 4. download parts, single header
    parts = sorted(req.get("parts", []), key=lambda p: p["part_number"])
    path = ctx.out / "logs" / f"{name}.tsv"
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = 0
    with path.open("w", encoding="utf-8", newline="") as fh:
        for i, part in enumerate(parts):
            text = api_call(f"{base}/logrequest/{rid}/part/{part['part_number']}/download",
                            ctx.token, raw=True)
            if i > 0 and "\n" in text:
                text = text.split("\n", 1)[1]
            if text and not text.endswith("\n"):
                text += "\n"
            rows += text.count("\n")
            fh.write(text)
    rows = max(0, rows - 1)
    dump(ctx.out / "logs" / f"{name}.request.json", {"request": req, "fields": sorted(wanted)})
    ctx.record("logs", name, "-", True, rows=rows, parts=len(parts), request_id=rid,
               file=f"logs/{name}.tsv")
    print(f"  ok   {name}: {rows} rows in {len(parts)} part(s) -> {path}")

    # 5. free server-side storage unless asked to keep
    if not keep:
        try:
            api_call(f"{base}/logrequest/{rid}/clean", ctx.token, method="POST")
            print(f"  cleaned log request {rid}")
        except ApiError as e:
            print(f"  warning: clean failed for {rid}: {e}")


def block_logs(ctx: Ctx, date1: str, date2: str, wait: int, keep: bool) -> None:
    print(f"\n[logs] {date1}..{date2}")
    logs_dump(ctx, "visits", VISIT_FIELDS, VISIT_FIELDS_SAFE, date1, date2, wait, keep)
    logs_dump(ctx, "hits", HIT_FIELDS, HIT_FIELDS_SAFE, date1, date2, wait, keep)


# --- main -------------------------------------------------------------------

def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    repo_root = Path(__file__).resolve().parent.parent
    today = date.today()

    p = argparse.ArgumentParser(description="Export everything Metrika offers for the counter")
    p.add_argument("--counter", type=int, default=COUNTER_ID)
    p.add_argument("--token", default=os.environ.get("METRIKA_TOKEN", ""))
    p.add_argument("--date-to", default=today.isoformat())
    p.add_argument("--out-dir", default=str(repo_root / f"research/site-analytics-{today.isoformat()}"))
    p.add_argument("--only", default="mgmt,reports,goals,params,logs",
                   help="comma-separated blocks to run")
    p.add_argument("--skip-logs", action="store_true")
    p.add_argument("--logs-date-to", default="",
                   help="Logs API end date (default: date-to, or yesterday when date-to is today)")
    p.add_argument("--logs-wait", type=int, default=480, help="seconds to wait for log processing")
    p.add_argument("--keep-logrequest", action="store_true",
                   help="do not clean the server-side log request after download")
    args = p.parse_args()

    token = args.token or load_dotenv_token(repo_root)
    if not token:
        print("No token: set METRIKA_TOKEN, pass --token, or add METRIKA_TOKEN=... to .env",
              file=sys.stderr)
        return 1
    blocks = {b.strip() for b in args.only.split(",") if b.strip()}
    if args.skip_logs:
        blocks.discard("logs")

    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    ctx = Ctx(token=token, counter=args.counter, out=out, windows={})

    try:
        counter = fetch_counter(ctx)
    except ApiError as e:
        print(f"Cannot read counter {args.counter}: {e}", file=sys.stderr)
        return 2
    created = (counter.get("create_time") or "")[:10] or FULL_FROM
    all_from = min(created, FULL_FROM)
    ctx.windows = {"all": (all_from, args.date_to),
                   "events": (EVENTS_FROM, args.date_to),
                   "cp3": (CP3_FROM, args.date_to)}
    print(f"Counter {args.counter} ({counter.get('name') or counter.get('site')}), "
          f"created {created}; windows: {ctx.windows}; out: {out}")

    if "mgmt" in blocks:
        block_mgmt(ctx, counter)
    if "reports" in blocks:
        block_reports(ctx)
    if "goals" in blocks:
        block_goals(ctx)
    if "params" in blocks:
        block_params(ctx)
    if "logs" in blocks:
        logs_to = args.logs_date_to or (
            (today - timedelta(days=1)).isoformat() if args.date_to == today.isoformat()
            else args.date_to)
        block_logs(ctx, all_from, logs_to, args.logs_wait, args.keep_logrequest)

    # Merge with an earlier manifest so a partial re-run (--only goals) refreshes
    # its own entries without forgetting the rest of the sweep.
    manifest_path = out / "manifest.json"
    merged: dict[tuple, dict] = {}
    if manifest_path.is_file():
        try:
            for m in json.loads(manifest_path.read_text(encoding="utf-8")).get("entries", []):
                merged[(m["block"], m["name"], m["window"])] = m
        except (json.JSONDecodeError, KeyError):
            pass
    for m in ctx.manifest:
        merged[(m["block"], m["name"], m["window"])] = m
    entries = list(merged.values())
    ok = sum(1 for m in entries if m["ok"])
    fail = [m for m in entries if not m["ok"]]
    dump(manifest_path, {
        "counter": args.counter, "date_to": args.date_to, "windows": ctx.windows,
        "blocks": sorted(blocks), "ok": ok, "failed": len(fail), "entries": entries,
    })
    print(f"\nDone: {ok} ok, {len(fail)} failed -> {out / 'manifest.json'}")
    for m in fail:
        print(f"  failed: {m['block']}/{m['name']} [{m['window']}] {m.get('error', '')[:160]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
