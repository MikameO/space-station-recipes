#!/usr/bin/env python3
"""SS14 map extractor: bakes per-map PNG underlay + item-location JSON.

Companion to ss14_chem_extractor.py (fetch/YAML patterns copied from it,
kept independent on purpose — the two pipelines regen on different cadences).
Spec: docs/design/2026-07-12-map-item-finder.md
Usage:
  python ss14_map_extractor.py --fork vanilla --map Bagel
  python ss14_map_extractor.py --all-forks
  python ss14_map_extractor.py --selfcheck        # asserts against Bagel
"""
import argparse, base64, json, re, struct, sys, time, urllib.request
from pathlib import Path

import yaml

from config import FORK_REGISTRY  # same registry the chem extractor uses

SCRIPT_DIR = Path(__file__).resolve().parent   # anchor like the sibling does
CACHE_DIR = SCRIPT_DIR / "cache_maps"
OUT_DIR = SCRIPT_DIR / "maps"
SCHEMA_VERSION = 1

# ── fetch (copied from ss14_chem_extractor.py:191, keep in sync manually) ──

def fetch_file(url: str, cache_path: Path) -> str:
    if cache_path.exists():
        return cache_path.read_text(encoding="utf-8")
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    print(f"  Fetching: {url.rsplit('/', 1)[-1]}")
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "SS14-Map-Extractor/1.0"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                content = resp.read().decode("utf-8")
            cache_path.write_text(content, encoding="utf-8")
            time.sleep(0.3)
            return content
        except urllib.error.HTTPError as e:
            if e.code in (404, 403):
                print(f"  WARNING: HTTP {e.code} for {url}")
                return ""
            if attempt < 2:
                print(f"  HTTP {e.code}, retry {attempt + 1}/3...")
                time.sleep(2 * (attempt + 1)); continue
            print(f"  FAILED: HTTP {e.code} for {url}"); return ""
        except Exception as e:
            if attempt < 2:
                print(f"  Retry {attempt + 1}/3: {e}")
                time.sleep(2 * (attempt + 1))
            else:
                print(f"  FAILED after 3 attempts: {e} for {url}"); return ""
    return ""

def fetch_binary(url: str, cache_path: Path) -> bytes:
    if cache_path.exists():
        return cache_path.read_bytes()
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "SS14-Map-Extractor/1.0"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = resp.read()
            cache_path.write_bytes(data)
            time.sleep(0.2)
            return data
        except urllib.error.HTTPError as e:
            if e.code in (404, 403):
                print(f"  WARNING: HTTP {e.code} for {url}")
                return b""
            if attempt < 2:
                time.sleep(2 * (attempt + 1))
            else:
                print(f"  WARNING: binary fetch failed {url}: HTTP {e.code}")
        except Exception as e:
            if attempt < 2:
                print(f"  Retry {attempt + 1}/3: {e}")
                time.sleep(2 * (attempt + 1))
            else:
                print(f"  WARNING: binary fetch failed {url}: {e}")
    return b""

# ── YAML loader (copied from ss14_chem_extractor.py:299) ──

class SS14Loader(yaml.SafeLoader):
    pass

# full 3-branch version — keep identical to ss14_chem_extractor.py:304-316
def _type_constructor(loader_inst, suffix, node):
    """Handle !type:SomeType tags by converting to dict with _type key."""
    if isinstance(node, yaml.MappingNode):
        data = loader_inst.construct_mapping(node, deep=True)
        data["_type"] = suffix
        return data
    elif isinstance(node, yaml.ScalarNode):
        val = loader_inst.construct_scalar(node)
        return {"_type": suffix, "_value": val}
    elif isinstance(node, yaml.SequenceNode):
        val = loader_inst.construct_sequence(node, deep=True)
        return {"_type": suffix, "_items": val}
    return {"_type": suffix}

SS14Loader.add_multi_constructor("!type:", _type_constructor)

def load_yaml_docs(content: str, source: str) -> list:
    try:
        return [d for d in yaml.load_all(content, Loader=SS14Loader) if d]
    except yaml.YAMLError as e:
        print(f"  YAML error in {source}: {e}")
        return []

# ── map discovery ──

def repo_meta(fork_cfg: dict) -> tuple[str, str, str]:
    m = re.match(r"https://raw\.githubusercontent\.com/([^/]+)/([^/]+)/([^/]+)/", fork_cfg["raw_url"])
    if not m:
        raise ValueError(f"unparseable raw_url: {fork_cfg['raw_url']}")
    return m.group(1), m.group(2), m.group(3)

def fetch_repo_tree(fork_key: str, fork_cfg: dict) -> list[str]:
    """All file paths in the fork's repo (git/trees API, cached)."""
    owner, repo, branch = repo_meta(fork_cfg)
    url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
    content = fetch_file(url, CACHE_DIR / fork_key / "_tree.json")
    if not content:
        return []
    data = json.loads(content)
    if data.get("truncated"):
        print(f"  WARNING: tree truncated for {fork_key}")
    return [e["path"] for e in data.get("tree", []) if e.get("type") == "blob"]

def discover_maps(fork_key: str, fork_cfg: dict, tree: list[str]) -> list[dict]:
    """Parse gameMap + gameMapPool prototypes → [{id, name, path, inPool}]."""
    proto_paths = [p for p in tree if "/Prototypes/Maps/" in p and p.endswith(".yml")]
    game_maps, pool_ids = {}, set()
    for path in proto_paths:
        content = fetch_file(fork_cfg["raw_url"].format(path=path), CACHE_DIR / fork_key / path)
        for doc in load_yaml_docs(content, path):
            for entry in (doc if isinstance(doc, list) else [doc]):
                if not isinstance(entry, dict):
                    continue
                if entry.get("type") == "gameMap" and entry.get("mapPath"):
                    map_path = "Resources" + entry["mapPath"]
                    game_maps[entry["id"]] = {
                        "id": entry["id"],
                        "name": entry.get("mapName", entry["id"]),
                        "path": map_path,
                    }
                elif entry.get("type") == "gameMapPool":
                    pool_ids.update(entry.get("maps", []))
    block = set()  # ponytail: MAP_BLOCKLIST from config.py lands in Task 16
    out = []
    for gid, gm in sorted(game_maps.items()):
        if gid in block:
            continue
        if gm["path"] not in tree:
            print(f"  WARNING: {fork_key}/{gid} mapPath missing in repo: {gm['path']}")
            continue
        gm["inPool"] = gid in pool_ids
        out.append(gm)
    return out

# ── selfcheck ──

def selfcheck():
    fork = FORK_REGISTRY["vanilla"]
    tree = fetch_repo_tree("vanilla", fork)
    maps = discover_maps("vanilla", fork, tree)
    byid = {m["id"]: m for m in maps}
    assert "Bagel" in byid, f"Bagel missing: {sorted(byid)}"
    assert byid["Bagel"]["name"] == "Bagel Station"
    assert byid["Bagel"]["path"] == "Resources/Maps/bagel.yml"
    assert byid["Bagel"]["inPool"] is True
    assert len(maps) >= 12, f"only {len(maps)} maps"
    print(f"selfcheck OK: {len(maps)} vanilla maps discovered")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fork", default="vanilla")
    ap.add_argument("--map", default=None, help="single gameMap id, e.g. Bagel")
    ap.add_argument("--all-forks", action="store_true")
    ap.add_argument("--selfcheck", action="store_true")
    args = ap.parse_args()
    if args.selfcheck:
        selfcheck(); return
    print(f"fork={args.fork} map={args.map} all_forks={args.all_forks}")

if __name__ == "__main__":
    main()
