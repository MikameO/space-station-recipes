# Scratch analysis helpers used to build SUMMARY.md / insight-*.md of this package.
# Need the Logs API dumps in ../logs/ (git-ignored): python scripts/export_metrika_all.py --only logs
import csv, json, re, sys, ast
from collections import Counter, defaultdict
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
PKG = Path(__file__).resolve().parent.parent  # research/site-analytics-<date>/
csv.field_size_limit(10**8)
def load_visits():
    p=next(PKG.glob("logs/visits_*.tsv"))
    with p.open(encoding="utf-8", newline="") as fh:
        rd=csv.reader(fh, delimiter="\t"); hdr=[h.replace("ym:s:","") for h in next(rd)]
        rows=[dict(zip(hdr,r)) for r in rd if r]
    return rows
def arr(s):
    s=(s or "").strip()
    if not s or s[0] != "[": return []
    try: return list(ast.literal_eval(s))
    except Exception: return [x.strip().strip("'\"") for x in s.strip("[]").split(",") if x.strip()]
GOALS={g["id"]:(next((c["url"] for c in g["conditions"] if c.get("url")),g["name"])) for g in json.loads((PKG/"mgmt/goals.json").read_text(encoding="utf-8"))["goals"]}
DEV_RE=re.compile(r"localhost|127\.0\.0\.1|[?&](nocache|fresh|cb|nc|perf|prodcheck|prod|_ym_debug)=", re.I)
if __name__=="__main__":
    V=load_visits(); print("visits rows", len(V), "dates", min(v["date"] for v in V), "..", max(v["date"] for v in V))
    print("fields:", len(V[0]))
    dev_clients={v["clientID"] for v in V if DEV_RE.search(v["startURL"]) or DEV_RE.search(v["endURL"]) or DEV_RE.search(v["referer"])}
    print("dev-marker visits:", sum(1 for v in V if DEV_RE.search(v["startURL"]) or DEV_RE.search(v["endURL"])), "dev clientIDs:", len(dev_clients))
    flagged=[v for v in V if v["clientID"] in dev_clients]
    print("visits by dev clientIDs:", len(flagged), "share", f"{len(flagged)/len(V):.1%}")
    print("dev clientIDs visit counts:", Counter(v["clientID"] for v in flagged).most_common(10))
    print("dev visits by month:", sorted(Counter(v["date"][:7] for v in flagged).items()))
    print("dev visits on 09-10..12:", sum(1 for v in flagged if v["date"]>="2026-09-10"), "of", sum(1 for v in V if v["date"]>="2026-09-10"))
    # where do dev visits come from (country/city) — to sanity check one owner
    print("dev visits geo:", Counter((v["regionCountry"],v["regionCity"]) for v in flagged).most_common(5))
    # organic cp3
    cp=[v for v in V if v["date"]>="2026-07-28" and not DEV_RE.search(v["startURL"])]
    org=[v for v in cp if v["clientID"] not in dev_clients]
    print(f"\ncp3 visits(all-dev-url)={len(cp)} users={len({v['clientID'] for v in cp})}; organic(excl dev clients) visits={len(org)} users={len({v['clientID'] for v in org})}")
    # goals reached organically in cp3
    gc=Counter(); gu=defaultdict(set)
    for v in org:
        for gid in arr(v["goalsID"]):
            e=GOALS.get(int(gid), str(gid)); gc[e]+=1; gu[e].add(v["clientID"])
    print("\norganic cp3 goal reaches (visit-level array, dev clients removed):")
    for e,c in gc.most_common(60): print(f"  {e:<24} {c:>5} reaches  {len(gu[e]):>4} users")
    # visits with zero goals and duration bucket
    zero=[v for v in org if not arr(v["goalsID"])]
    print(f"\norganic cp3 visits with no goal at all: {len(zero)} ({len(zero)/len(org):.0%}); their median duration={sorted(int(v['visitDuration']) for v in zero)[len(zero)//2]}s; pageViews==1: {sum(1 for v in zero if v['pageViews']=='1')}")
    print("their startURL top:", Counter(v["startURL"] for v in zero).most_common(4))
    print("their traffic source:", Counter(v["lastTrafficSource"] for v in zero).most_common(4))
    print("their isNewUser:", Counter(v["isNewUser"] for v in zero))
