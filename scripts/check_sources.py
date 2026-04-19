# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 MikameO
# This file is part of Space Station Recipes.
# See LICENSE for details.

"""
Link-rot checker for SOURCES catalog (Increment G.5).

Walks every entry in sources.py SOURCES dict, performs an HTTP HEAD against
the `url` (and `archive_url` if present), and writes the result to
`cache/link_health.json`. Exits with code 1 if ≥10 % of URLs return 4xx/5xx
— intended to be run weekly from .github/workflows/check-links.yml.

Why HEAD not GET: we only care about reachability, not content. HEAD is ≥10x
cheaper per request and avoids downloading large YAML files from GitHub.

Why 1-second rate limit: polite to github.com and forum.spacestation14.com.
20 URLs × 1s = ~20s, well within GitHub Actions' free-tier budget.

Usage
-----
    python scripts/check_sources.py
    python scripts/check_sources.py --fail-threshold 5  (stricter: 5% broken → fail)
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

# Allow importing sources.py from the project root even when run via
# `python scripts/check_sources.py` (CWD may be project root or scripts/).
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from sources import SOURCES

CACHE_DIR = _PROJECT_ROOT / "cache"
HEALTH_FILE = CACHE_DIR / "link_health.json"
TIMEOUT_S = 10
RATE_LIMIT_S = 1.0
USER_AGENT = "NanoTrasen-ChemDB-LinkChecker/1.0 (+https://github.com/MikameO/space-station-recipes)"


def check_url(url: str) -> dict:
    """Run one HEAD request. Returns {status, ok, error, final_url}."""
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
            status = resp.status
            return {"status": status, "ok": 200 <= status < 400, "error": None, "final_url": resp.url}
    except urllib.error.HTTPError as e:
        return {"status": e.code, "ok": False, "error": f"HTTP {e.code} {e.reason}", "final_url": url}
    except urllib.error.URLError as e:
        return {"status": None, "ok": False, "error": f"URLError: {e.reason}", "final_url": url}
    except Exception as e:  # noqa: BLE001
        return {"status": None, "ok": False, "error": f"{type(e).__name__}: {e}", "final_url": url}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--fail-threshold",
        type=float,
        default=10.0,
        help="Fail (exit 1) if this percentage or more of URLs are broken. Default: 10.",
    )
    parser.add_argument(
        "--rate-limit",
        type=float,
        default=RATE_LIMIT_S,
        help=f"Seconds to sleep between requests. Default: {RATE_LIMIT_S}.",
    )
    args = parser.parse_args()

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    results = {}
    total = 0
    broken = []
    skipped_mk = 0

    for sid, entry in SOURCES.items():
        url = entry.get("url")
        if not url:
            # maintainer-knowledge has no URL by design
            skipped_mk += 1
            continue
        total += 1
        print(f"[{total}] {sid} ... ", end="", flush=True)
        primary = check_url(url)
        archive_result = None
        archive_url = entry.get("archive_url")
        if archive_url:
            time.sleep(args.rate_limit)
            archive_result = check_url(archive_url)
        status_str = primary["status"] if primary["ok"] else f"BROKEN ({primary['error']})"
        print(status_str)

        record = {
            "type": entry.get("type"),
            "url": url,
            "primary": primary,
            "archive": archive_result,
            "last_checked": now,
        }
        results[sid] = record
        if not primary["ok"]:
            broken.append({"id": sid, "url": url, "error": primary["error"]})

        time.sleep(args.rate_limit)

    summary = {
        "last_run": now,
        "total_checked": total,
        "broken_count": len(broken),
        "broken_percent": round(100 * len(broken) / total, 1) if total else 0.0,
        "maintainer_knowledge_skipped": skipped_mk,
        "broken": broken,
    }
    output = {"summary": summary, "entries": results}

    HEALTH_FILE.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nWritten {HEALTH_FILE.relative_to(_PROJECT_ROOT)}")
    print(
        f"Total checked: {total}; broken: {len(broken)} "
        f"({summary['broken_percent']}%); fail threshold: {args.fail_threshold}%"
    )

    if summary["broken_percent"] >= args.fail_threshold:
        print(f"\nFAIL: broken percentage {summary['broken_percent']}% exceeds threshold {args.fail_threshold}%")
        for b in broken:
            print(f"  - {b['id']}: {b['url']} — {b['error']}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
