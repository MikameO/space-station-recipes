# Scratch analysis helpers used to build SUMMARY.md / insight-*.md of this package.
# Need the Logs API dumps in ../logs/ (git-ignored): python scripts/export_metrika_all.py --only logs
import csv, json, sys, re
from collections import Counter, defaultdict
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
PKG = Path(__file__).resolve().parent.parent  # research/site-analytics-<date>/
csv.field_size_limit(10**8)
def load_hits():
    p=next(PKG.glob("logs/hits_*.tsv"))
    with p.open(encoding="utf-8", newline="") as fh:
        rd=csv.reader(fh, delimiter="\t"); hdr=[h.replace("ym:pv:","") for h in next(rd)]
        return [dict(zip(hdr,r)) for r in rd if r]
if __name__=="__main__":
    H=load_hits(); print("hits rows",len(H),"dates",min(h["date"] for h in H),"..",max(h["date"] for h in H),"fields",len(H[0]))
    print("isPageView:",Counter(h["isPageView"] for h in H),"artificial:",Counter(h["artificial"] for h in H))
    schemes=Counter(re.match(r"^[a-z]+:",h["URL"]).group(0) if re.match(r"^[a-z]+:",h["URL"]) else "?" for h in H); print("URL schemes:",schemes)
    goalhits=[h for h in H if h["URL"].startswith("goal://")]
    print("\ngoal:// hits:",len(goalhits)); print("sample URLs:",[h["URL"] for h in goalhits[:3]])
    name=lambda u: u.split("/",3)[-1] if u.count("/")>=3 else u
    c=Counter(name(h["URL"]) for h in goalhits); print("\ngoal:// names total (top 60):"); 
    for k,v in c.most_common(60): print(f"  {k:<26}{v:>6}")
    recent=[h for h in goalhits if h["date"]>="2026-09-10"]
    print("\ngoal:// since 09-10:",len(recent)); c2=Counter(name(h["URL"]) for h in recent)
    for k,v in c2.most_common(80): print(f"  {k:<26}{v:>6}")
    # params on ordnance/library hits
    print("\nsample params of ordnance hits:",[h["params"] for h in recent if "ordnance" in h["URL"]][:8])
    print("\nordnance/library hits by clientID (to see how many distinct users):")
    oc=Counter(h["clientID"] for h in recent if "ordnance" in h["URL"] or "library" in h["URL"]); print(oc.most_common(10))
    # non-goal artificial hits / other URL kinds
    other=[h for h in H if not h["URL"].startswith(("goal://","https://mikameo.github.io"))]
    print("\nother URL hosts:",Counter(h["URL"].split("/")[2] if "//" in h["URL"] else h["URL"][:30] for h in other).most_common(10))
    print("link/download hits:",sum(1 for h in H if h["link"]=="1"),sum(1 for h in H if h["download"]=="1"),"notBounce:",sum(1 for h in H if h["notBounce"]=="1"),"httpError:",Counter(h["httpError"] for h in H).most_common(3))
