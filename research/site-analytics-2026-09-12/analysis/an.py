# Scratch analysis helpers used to build SUMMARY.md / insight-*.md of this package.
# Need the Logs API dumps in ../logs/ (git-ignored): python scripts/export_metrika_all.py --only logs
"""Scratch helper: load Metrika sweep JSON into simple tables."""
import json, sys
from pathlib import Path
from collections import defaultdict
PKG = Path(__file__).resolve().parent.parent  # research/site-analytics-<date>/
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

def load(window, name):
    p = PKG / "reports" / window / f"{name}.json"
    d = json.loads(p.read_text(encoding="utf-8"))
    resp = d["response"]; q = resp.get("query", {})
    dims = q.get("dimensions", []); mets = q.get("metrics", [])
    rows = []
    for r in resp.get("data", []):
        dv = tuple((x.get("name") if x.get("name") is not None else x.get("id")) for x in r.get("dimensions", []))
        rows.append((dv, tuple(r["metrics"])))
    return {"dims": dims, "mets": mets, "rows": rows, "totals": resp.get("totals"),
            "events": d.get("events"), "total_rows": resp.get("total_rows")}

def goal_series(window, prefix):
    """Merge chunked goal reports -> {event: {dimvalue: value(s)}} plus per-event totals."""
    out = defaultdict(dict); tot = {}
    n = 1
    while True:
        p = PKG / "reports" / window / f"{prefix}_{n}.json"
        if not p.exists(): break
        t = load(window, f"{prefix}_{n}")
        ev = t["events"]; per = len(t["mets"]) // len(ev)
        for dv, mv in t["rows"]:
            for i, e in enumerate(ev):
                out[e][dv] = mv[i*per:(i+1)*per] if per > 1 else mv[i]
        if t["totals"]:
            for i, e in enumerate(ev):
                tot[e] = t["totals"][i*per:(i+1)*per] if per > 1 else t["totals"][i]
        n += 1
    return out, tot

def table(rows, headers, top=None):
    print("| " + " | ".join(headers) + " |"); print("|" + "|".join("---" for _ in headers) + "|")
    for r in (rows[:top] if top else rows):
        print("| " + " | ".join(str(round(x, 2)) if isinstance(x, float) else str(x) for x in r) + " |")

def show(window, name, top=25):
    t = load(window, name)
    print(f"\n## {window}/{name}  total_rows={t['total_rows']} totals={t['totals']}")
    table([(*dv, *mv) for dv, mv in t["rows"]], [d.split(':')[-1] for d in t["dims"]] + [m.split(':')[-1] for m in t["mets"]], top=top)
