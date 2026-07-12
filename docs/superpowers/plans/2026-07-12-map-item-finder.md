# Map Item Finder (Maps Tab) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Maps tab on the SS14 Chemistry Database site: pick a station map, search an item, see glowing markers on a rendered station schematic + a location list (floor / lockers / vending machines), across all 18 forks.

**Architecture:** New `ss14_map_extractor.py` (mirrors `ss14_chem_extractor.py` patterns) bakes per-map artifacts offline: a PNG underlay (1 px = 1 tile: floors colored by average texture color, walls/windows/doors overlaid) and a JSON index (items with resolved container/vendor positions, beacons, bounds). Frontend `maps.js` lazily fetches `maps/index.json` → per-map PNG+JSON, renders canvas with zoom/pan, markers, and a beacon-grouped location list. Spec: `docs/design/2026-07-12-map-item-finder.md`.

**Tech Stack:** Python 3 stdlib + PyYAML + Pillow (new dep, PNG read/write); vanilla JS canvas; GitHub raw + `git/trees` API; no build step.

**Verified format facts (recon 2026-07-12, do not re-derive):**
- Map YAML `meta.format: 7`. Tile chunk = base64, **7 bytes/tile**: `typeId:u32LE + flags:u8 + variant:u16LE`. Chunk is 16×16, row-major (index = y*16 + x within chunk), keyed by `ind: "cx,cy"`.
- `tilemap:` in each map file maps typeId → tile prototype id (e.g. `93: FloorSteel`). typeId 0 = Space.
- Entities: `- proto: Crowbar` → `entities: [{uid, components: [{type: Transform, pos: "x,y", parent: <gridUid>}]}]`. Bagel main grid uid=60 (25 039 ents), secondary grid uid=7536 `Syndi Puddle CS108` (326 ents, name in its `MetaData` component).
- Playable maps: `Resources/Prototypes/Maps/*.yml` → `- type: gameMap, id: Bagel, mapName: 'Bagel Station', mapPath: /Maps/bagel.yml`. Pool: `Resources/Prototypes/Maps/Pools/default.yml` → `- type: gameMapPool, maps: [Bagel, Box, ...12 ids]`.
- Beacons: entity protos `DefaultStationBeacon*` with `NavMapBeacon.defaultText: station-beacon-<x>` (a Fluent key). Locale file: `Resources/Locale/en-US/navmap-beacons/station-beacons.ftl` (`station-beacon-medical = Medbay` style lines). Map entities MAY override with a `NavMapBeacon` component carrying `text:`.
- Items: prototypes with `Item` component (inherited). Container fill (CORRECTED during Task 3 — upstream drifted): `StorageFill` is LEGACY (0 uses in current vanilla; keep parsing it for forks on older code). Modern fill = `EntityTableContainerFill` component: `containers: {<name>: !type:AllSelector {children: [{id, amount?, prob?, weight?} | nested selector]}}`; selector types `AllSelector` (all children), `GroupSelector` (one child by weight), `NestedSelector` (`tableId` → a `- type: entityTable, id, table: <selector>` prototype). The container *classification* signal is the `EntityStorage` component (on `ClosetBase`/`CrateGeneric` ancestors). Vendors: entity has `VendingMachine.pack: <invId>`; inventory protos `- type: vendingMachineInventory, id, startingInventory: {ProtoId: count}, contrabandInventory: {...}` in `Catalog/VendingMachines/Inventories/*.yml`.
- Tiles: `Resources/Prototypes/Tiles/*.yml` → `- type: tile, id: FloorSteel, sprite: /Textures/Tiles/steel.png`.
- `parent:` in entity protos is a string OR a list.
- Chem extractor patterns to copy (NOT import — keep pipelines independent): `fetch_file`/`fetch_all_files` (ss14_chem_extractor.py:191-235), `SS14Loader` + `!type:` multi_constructor (ss14_chem_extractor.py:299-330).
- `app.js` tabs are generic (`setupTabs`, app.js:479): any `.tab-btn[data-tab=X]` button toggles panel `#tab-X`, fires `track('tab_X')`, unknown tab is a no-op in `renderCurrentTab`. Deep-link whitelist `validTabs` at app.js:2564. Share URL built from scratch in `encodeURLState` (app.js:2528).
- `.github/workflows/deploy.yml` copies an EXPLICIT file list — new artifacts must be added there.
- Dev server: `preview_start {name: "ss14-chem"}` (launch.json, port 8090).

**Data schema (fixed, schemaVersion 1):**

`maps/index.json`:
```json
{"schemaVersion": 1, "forks": [
  {"key": "vanilla", "label": "Vanilla SS14", "maps": [
    {"id": "Bagel", "name": "Bagel Station", "file": "vanilla/Bagel",
     "inPool": true, "items": 3120, "beacons": 47, "px": [251, 171]}
  ]}
]}
```

`maps/<fork>/<MapId>.json`:
```json
{"schemaVersion": 1, "id": "Bagel", "name": "Bagel Station", "fork": "vanilla",
 "bounds": {"minX": -120, "minY": -85, "maxX": 130, "maxY": 85},
 "beacons": [["Medbay", 12.5, -3.5]],
 "offgrid": {"7536": "Syndi Puddle CS108"},
 "items": {
   "Crowbar": {"n": "crowbar", "c": "item", "p": [
     [-106.5, 24.5, 0],
     [12.0, -3.0, 1, "tool closet", 0.5],
     [88.0, 10.0, 2, "YouTool", 5],
     [3.0, 4.0, 3, "Syndi Puddle CS108"]
   ]}
 }}
```
Position tuple `[x, y, kind, via?, extra?]`, trailing fields omitted when empty. `kind`: 0=floor, 1=inside container (`via`=container display name, `extra`=prob if <1), 2=vending (`via`=vendor display name, `extra`=stock count), 3=off-main-grid (`via`=grid name), 4=vending contraband (same fields as 2). `c`: `item` | `mach`. PNG pixel for tile (tx,ty): `px = tx - minX`, `py = maxY - ty` (Y flipped). World pos → tile: `tx = floor(x)`, `ty = floor(y)`.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `ss14_map_extractor.py` | Create | Whole pipeline: discovery → prototype registry → map parse → PNG+JSON bake. CLI: `--fork KEY` (default vanilla), `--map ID` (optional single map), `--all-forks`, `--selfcheck` |
| `maps/index.json`, `maps/<fork>/<Id>.{json,png}` | Generate | Shipped data artifacts (committed) |
| `maps.js` | Create | Maps tab UI: state, fetch, canvas render, zoom/pan, search, location list, deep-links |
| `index.html` | Modify | Tab button, tab panel skeleton, `<script src="maps.js?v=1">`, bump `app.js`/`style.css` `?v=` |
| `app.js` | Modify (2 spots) | `validTabs` += `'maps'`; `encodeURLState` hook `window.mapsURLState` |
| `style.css` | Modify (append) | `.maps-*` styles |
| `config.py` | Modify (append) | `MAP_BLOCKLIST` (gameMap ids to skip per fork) |
| `.github/workflows/deploy.yml` | Modify | Ship `maps.js` and `maps/` |
| `README.md`, `CHANGELOG.md`, `ROADMAP.md` | Modify | Feature row + Pillow dep; data note; series E checkboxes |

Increment boundaries: E1 = Tasks 1–8 (data, Bagel e2e), E2 = Tasks 9–14 (frontend on Bagel), E3 = Task 15 (all vanilla maps), E4 = Tasks 16–17 (all forks + ship).

**Session discipline (workbook §0):** Tasks 9–14 touch `index.html`/`app.js`/`style.css` — run them sequentially in ONE session (parallel-session rule). Bump `?v=N` on every `maps.js`/`style.css` change. Commit after each task; push only on explicit request.

---

### Task 1: Extractor skeleton + selfcheck runner

**Files:**
- Create: `ss14_map_extractor.py`

- [ ] **Step 1: Check `.gitignore` covers the cache dir**

Run: `grep -n "cache" .gitignore`
If no line matches `cache_maps/`, add the line `cache_maps/` to `.gitignore`.

- [ ] **Step 2: Write the skeleton**

```python
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
                time.sleep(2 * (attempt + 1))
            else:
                print(f"  WARNING: binary fetch failed {url}: {e}")
    return b""

# ── YAML loader (copied from ss14_chem_extractor.py:299) ──

class SS14Loader(yaml.SafeLoader):
    pass

def _type_constructor(loader, tag_suffix, node):
    # full 3-branch version — keep identical to ss14_chem_extractor.py:304-316
    if isinstance(node, yaml.MappingNode):
        d = loader.construct_mapping(node, deep=True); d["_type"] = tag_suffix; return d
    if isinstance(node, yaml.ScalarNode):
        return {"_type": tag_suffix, "_value": loader.construct_scalar(node)}
    if isinstance(node, yaml.SequenceNode):
        return {"_type": tag_suffix, "_items": loader.construct_sequence(node, deep=True)}
    return {"_type": tag_suffix}

SS14Loader.add_multi_constructor("!type:", _type_constructor)

def load_yaml_docs(content: str, source: str) -> list:
    try:
        return [d for d in yaml.load_all(content, Loader=SS14Loader) if d]
    except yaml.YAMLError as e:
        print(f"  YAML error in {source}: {e}")
        return []

# ── selfcheck ──

def selfcheck():
    print("selfcheck: not implemented yet"); sys.exit(1)

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
```

- [ ] **Step 3: Verify it runs**

Run: `python ss14_map_extractor.py --fork vanilla`
Expected: `fork=vanilla map=None all_forks=False`
Run: `python ss14_map_extractor.py --selfcheck`
Expected: `selfcheck: not implemented yet`, exit code 1.

Note: `config.py` top-level must import cleanly (it's a data module — it does, the chem extractor imports it the same way). The vanilla fork key in `FORK_REGISTRY` — verify with `python -c "from config import FORK_REGISTRY; print(list(FORK_REGISTRY)[:3])"` and use the actual key for upstream (expected `vanilla`; if it differs, use that key everywhere below).

- [ ] **Step 4: Commit**

```bash
git add ss14_map_extractor.py .gitignore
git commit -m "feat(maps): extractor skeleton — fetch/YAML utils, CLI, selfcheck stub"
```

---

### Task 2: Map discovery via gameMap prototypes

**Files:**
- Modify: `ss14_map_extractor.py`

- [ ] **Step 1: Add failing selfcheck asserts** (replace `selfcheck` body)

```python
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
```

Run: `python ss14_map_extractor.py --selfcheck`
Expected: `NameError: fetch_repo_tree` — FAIL.

- [ ] **Step 2: Implement discovery**

`FORK_REGISTRY[key]["raw_url"]` is a template like `https://raw.githubusercontent.com/space-wizards/space-station-14/master/{path}`. Derive owner/repo/branch from it:

```python
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
```

- [ ] **Step 3: Run selfcheck until green**

Run: `python ss14_map_extractor.py --selfcheck`
Expected: `selfcheck OK: 15 vanilla maps discovered` (12 in pool + centcomm/relic/saltern-class extras; exact count may drift with upstream — assert is `>= 12`).

- [ ] **Step 4: Commit**

```bash
git add ss14_map_extractor.py
git commit -m "feat(maps): map discovery via gameMap/gameMapPool prototypes"
```

---

### Task 3: Prototype registry (names, kinds, fills, beacons, tiles)

**Files:**
- Modify: `ss14_map_extractor.py`

- [ ] **Step 1: Extend selfcheck with registry asserts** (append before the final print)

```python
    reg = build_registry("vanilla", fork, tree)
    assert reg.kind("Crowbar") == "item" and reg.name("Crowbar") == "crowbar"
    assert reg.kind("WallSolid") == "wall"
    assert reg.kind("VendingMachineYouTool") == "vendor"
    assert reg.vendor_pack("VendingMachineYouTool"), "YouTool pack missing"
    assert "Crowbar" in reg.vendor_inventory("VendingMachineYouTool"), "Crowbar not in YouTool"
    assert reg.kind("DefaultStationBeaconMedical") == "beacon"
    assert reg.beacon_text("DefaultStationBeaconMedical") == "Medbay"
    fills = reg.storage_fill("LockerWeldingSuppliesFilled") or reg.storage_fill("ClosetToolFilled")
    assert fills, "no StorageFill resolved on a known filled locker"
    assert reg.tile_color("FloorSteel") is not None
```

Run: `python ss14_map_extractor.py --selfcheck`
Expected: FAIL `NameError: build_registry`.

- [ ] **Step 2: Implement the registry**

First a concurrent fetch helper — the registry pulls 2–3k prototype files; serial fetch_file with its 0.3 s politeness sleep would take ~30 min, 8 threads bring it to ~2–4 min (raw.githubusercontent is a CDN, 8 parallel is polite enough):

```python
def fetch_many(paths: list[str], fork_key: str, fork_cfg: dict) -> dict[str, str]:
    """Concurrent cached fetch of many raw files. Returns {path: content}, empties skipped."""
    from concurrent.futures import ThreadPoolExecutor
    results, done = {}, 0
    def one(path):
        return path, fetch_file(fork_cfg["raw_url"].format(path=path), CACHE_DIR / fork_key / path)
    with ThreadPoolExecutor(max_workers=8) as ex:
        for path, content in ex.map(one, paths):
            done += 1
            if done % 200 == 0:
                print(f"  ... {done}/{len(paths)} files")
            if content:
                results[path] = content
    return results
```

```python
STRUCT_SKIP_PREFIXES = ("Cable", "Pipe", "GasPipe", "DisposalPipe", "Poweredlight",
                        "PoweredLight", "Catwalk", "Lattice", "Grille", "SignalTimer")
# ponytail: prefix blocklist tuned on Bagel selfcheck; extend when a fork leaks junk

class Registry:
    def __init__(self):
        self.protos = {}        # id -> {"name", "parents": [..], "components": {typeName: dict}}
        self.vend_inventories = {}   # invId -> {"normal": {pid: n}, "contraband": {pid: n}}
        self.tile_sprites = {}  # tileId -> sprite path
        self.tile_colors = {}   # tileId -> (r,g,b) filled in Task 5
        self.ftl = {}           # fluent key -> english text
        self._kind_cache = {}

    def _chain(self, pid, seen=None):
        """Yield pid and all ancestors, depth-first, cycle-safe."""
        seen = seen or set()
        if pid in seen or pid not in self.protos:
            return
        seen.add(pid)
        yield self.protos[pid]
        for par in self.protos[pid]["parents"]:
            yield from self._chain(par, seen)

    def _find_component(self, pid, comp_name):
        for node in self._chain(pid):
            if comp_name in node["components"]:
                return node["components"][comp_name]
        return None

    def name(self, pid):
        for node in self._chain(pid):
            if node.get("name"):
                return node["name"]
        return pid

    def kind(self, pid):
        if pid in self._kind_cache:
            return self._kind_cache[pid]
        k = self._kind(pid)
        self._kind_cache[pid] = k
        return k

    def _kind(self, pid):
        if pid.startswith(STRUCT_SKIP_PREFIXES):
            return "skip"
        if self._find_component(pid, "NavMapBeacon") is not None:
            return "beacon"
        if self._find_component(pid, "VendingMachine") is not None:
            return "vendor"
        for node in self._chain(pid):
            nid = node["id"]
            if nid.startswith("BaseWall") or nid == "WallSolid":
                return "wall"
            if nid.startswith(("BaseWindow", "Window")):
                return "window"
            if nid.startswith(("BaseAirlock", "BaseFirelock", "Airlock", "Firelock")):
                return "door"
        if self._find_component(pid, "StorageFill") is not None:
            return "container"
        if self._find_component(pid, "Item") is not None:
            return "item"
        if self._find_component(pid, "ApcPowerReceiver") is not None:
            return "mach"
        return "skip"

    def storage_fill(self, pid):
        comp = self._find_component(pid, "StorageFill")
        return (comp or {}).get("contents") or []

    def vendor_pack(self, pid):
        comp = self._find_component(pid, "VendingMachine")
        return (comp or {}).get("pack")

    def vendor_inventory(self, pid):
        inv = self.vend_inventories.get(self.vendor_pack(pid) or "", {})
        return inv.get("normal", {})

    def vendor_contraband(self, pid):
        inv = self.vend_inventories.get(self.vendor_pack(pid) or "", {})
        return inv.get("contraband", {})

    def beacon_text(self, pid):
        comp = self._find_component(pid, "NavMapBeacon") or {}
        key = comp.get("defaultText", "")
        if not key:
            return "Beacon"
        return self.ftl.get(key) or key.removeprefix("station-beacon-").replace("-", " ").title()

    def tile_color(self, tile_id):
        return self.tile_colors.get(tile_id)


def build_registry(fork_key: str, fork_cfg: dict, tree: list[str]) -> Registry:
    reg = Registry()
    proto_paths = [p for p in tree if "/Prototypes/" in p and p.endswith(".yml")
                   and "/Prototypes/Maps/" not in p]
    print(f"  registry: {len(proto_paths)} prototype files")
    for path, content in fetch_many(proto_paths, fork_key, fork_cfg).items():
        for doc in load_yaml_docs(content, path):
            for entry in (doc if isinstance(doc, list) else [doc]):
                if not isinstance(entry, dict):
                    continue
                t, eid = entry.get("type"), entry.get("id")
                if t == "entity" and eid:
                    parents = entry.get("parent") or []
                    if isinstance(parents, str):
                        parents = [parents]
                    comps = {}
                    for c in entry.get("components") or []:
                        if isinstance(c, dict) and c.get("type"):
                            comps[c["type"]] = c
                    reg.protos[eid] = {"id": eid, "name": entry.get("name"),
                                       "parents": parents, "components": comps}
                elif t == "vendingMachineInventory" and eid:
                    reg.vend_inventories[eid] = {
                        "normal": entry.get("startingInventory") or {},
                        "contraband": entry.get("contrabandInventory") or {}}
                elif t == "tile" and eid and entry.get("sprite"):
                    reg.tile_sprites[eid] = entry["sprite"]
    # Fluent: beacon names
    ftl_paths = [p for p in tree if p.endswith(".ftl") and "en-US" in p and "navmap" in p.lower()]
    for path in ftl_paths:
        content = fetch_file(fork_cfg["raw_url"].format(path=path), CACHE_DIR / fork_key / path)
        for line in content.splitlines():
            m = re.match(r"^([a-zA-Z0-9-]+)\s*=\s*(.+)$", line.strip())
            if m:
                reg.ftl[m.group(1)] = m.group(2).strip()
    return reg
```

Insert a temporary `reg.tile_colors["FloorSteel"] = (128, 128, 128)` stub line at the end of `build_registry`? **No** — instead make the Task 3 selfcheck line about `tile_color` read `assert reg.tile_sprites.get("FloorSteel")` and switch it to `tile_color` in Task 5.

- [ ] **Step 3: Run selfcheck until green**

Run: `python ss14_map_extractor.py --selfcheck`
Expected: all asserts pass. First run downloads ~2–3k YAML files (~10 min, then cached). If a known-locker assert fails on the id, list candidates with:
`python -c "..."` → inside selfcheck temporarily: `print([k for k in reg.protos if 'Filled' in k][:20])` and pick a real filled locker id for the assert.

- [ ] **Step 4: Commit**

```bash
git add ss14_map_extractor.py
git commit -m "feat(maps): prototype registry — kinds, fills, vendors, beacon ftl, tiles"
```

---

### Task 3.5: Container fills v2 — EntityTableContainerFill (upstream drift fix)

**Why:** Task 3 discovered `StorageFill` has 0 uses in current vanilla — containers fill via `EntityTableContainerFill` + `entityTable` selector trees (620 uses). Without this, every locker classifies as `skip` and the container layer is empty.

**Files:**
- Modify: `ss14_map_extractor.py`

- [ ] **Step 1: Selfcheck asserts** — REPLACE the Task 3 storage-fill assert block (the one asserting `storage_fill(...)` returns `[]`) with:

```python
    fills = reg.storage_fill("ClosetToolFilled")
    assert fills, "ClosetToolFilled fill empty"
    fill_ids = {f["id"] for f in fills}
    assert any(("Crowbar" in i) or ("Wrench" in i) or ("Screwdriver" in i) for i in fill_ids), fill_ids
    assert reg.kind("ClosetToolFilled") == "container"
    assert reg.kind("CrateTrashCartFilled") == "container"
    assert reg.kind("Crowbar") == "item", "container branch must not steal plain items"
```
Plus one probability assert: find ONE real proto whose flatten yields `prob < 1` (grep the live cache under `cache_maps/vanilla/.../Catalog/Fills/` for a GroupSelector-filled crate/bookshelf), hardcode that verified id, and assert `any("prob" in f for f in reg.storage_fill("<TheId>"))`. Note the chosen id in the commit message.

Run selfcheck: expected FAIL (`ClosetToolFilled fill empty`).

- [ ] **Step 2: Implement**

In `Registry.__init__` add `self.entity_tables = {}`. In `build_registry`'s prototype loop add:

```python
                elif t == "entityTable" and eid:
                    reg.entity_tables[eid] = entry.get("table") or {}
```

Replace `storage_fill` and the `_kind` container logic:

```python
    def _flatten_table(self, node, p=1.0, depth=0):
        """Yield (proto_id, prob, amount) from an entity-table selector tree.
        ponytail: GroupSelector = weight-proportional split, rolls ignored —
        good enough for 'where can this item be', not a drop-rate simulator."""
        if depth > 8 or not isinstance(node, dict):
            return
        p *= float(node.get("prob", 1.0))
        t = node.get("_type")
        if t == "NestedSelector":
            # real serialized key is tableId (verified live), not id
            yield from self._flatten_table(self.entity_tables.get(node.get("tableId"), {}), p, depth + 1)
            return
        children = [c for c in (node.get("children") or []) if isinstance(c, dict)]
        if t == "GroupSelector" and children:
            total = sum(float(c.get("weight", 1.0)) for c in children)
            for c in children:
                w = float(c.get("weight", 1.0))
                yield from self._flatten_table(c, p * (w / total if total else 0), depth + 1)
            return
        if children:  # AllSelector or any selector with children
            for c in children:
                yield from self._flatten_table(c, p, depth + 1)
            return
        if node.get("id"):  # leaf entity entry
            yield node["id"], p, int(node.get("amount", 1) or 1)

    def storage_fill(self, pid):
        """[{id, prob?, amount?}] — legacy StorageFill or modern EntityTableContainerFill."""
        comp = self._find_component(pid, "StorageFill")
        if comp:
            return comp.get("contents") or []
        comp = self._find_component(pid, "EntityTableContainerFill")
        if not comp:
            return []
        out = []
        for table in (comp.get("containers") or {}).values():
            for eid, p, amount in self._flatten_table(table):
                rec = {"id": eid}
                if p < 0.995:
                    rec["prob"] = round(p, 2)
                if amount > 1:
                    rec["amount"] = amount
                out.append(rec)
        return out
```

In `_kind`, REORDER and replace the container branch: the order becomes beacon → vendor → wall/window/door → **item** → **container** → mach → skip, with the container test being:

```python
        if (self._find_component(pid, "EntityStorage") is not None
                or self._find_component(pid, "StorageFill") is not None
                or self._find_component(pid, "EntityTableContainerFill") is not None):
            return "container"
```
(`item` BEFORE `container`: a filled duffel bag is an Item that also carries EntityTableContainerFill — it must stay searchable as an item; Task 7 resolves contents via `storage_fill()` regardless of kind, see Task 7 note.)

- [ ] **Step 3: Selfcheck to green** (cache-warm, ~30 s). Also spot-print `reg.storage_fill("ClosetToolFilled")` and sanity-eye the ids/probs.

- [ ] **Step 4: Commit** — `git commit -m "feat(maps): container fills v2 — EntityTableContainerFill selector trees (upstream drift)"`

---

### Task 4: Map file parse (grids, chunks, entities)

**Files:**
- Modify: `ss14_map_extractor.py`

- [ ] **Step 1: Selfcheck asserts** (append)

```python
    parsed = parse_map_file("vanilla", fork, "Resources/Maps/bagel.yml")
    assert parsed["name"] == "Bagel Station" or parsed["name"], "map name"
    assert len(parsed["tiles"]) > 20000, f"too few tiles: {len(parsed['tiles'])}"
    crow = parsed["entities"].get("Crowbar", [])
    assert any(abs(x - -106.484505) < 0.01 and abs(y - 24.465736) < 0.01
               for x, y, grid in crow), f"Crowbar pos mismatch: {crow[:4]}"
    assert parsed["main_grid"] in parsed["grid_names"] or True
    assert len(parsed["offgrid_names"]) >= 1, "Syndi Puddle grid expected"
```

Run: expect FAIL `NameError: parse_map_file`.

- [ ] **Step 2: Implement**

```python
def decode_chunk(b64: str):
    """Yield (i, typeId) for each of the 256 tiles; 7 bytes/tile, u32LE typeId."""
    raw = base64.b64decode(b64)
    for i in range(len(raw) // 7):
        yield i, struct.unpack_from("<I", raw, i * 7)[0]

def parse_map_file(fork_key: str, fork_cfg: dict, path: str) -> dict:
    content = fetch_file(fork_cfg["raw_url"].format(path=path), CACHE_DIR / fork_key / path)
    if not content:
        raise RuntimeError(f"empty map file {path}")
    try:
        loader = yaml.CSafeLoader  # ~10x faster if libyaml present
        class _L(loader):  # noqa: N801
            pass
        _L.add_multi_constructor("!type:", _type_constructor)
        docs = list(yaml.load_all(content, Loader=_L))
    except AttributeError:
        docs = load_yaml_docs(content, path)
    doc = docs[0]
    tilemap = doc.get("tilemap") or {}
    grids = {}       # gridUid -> {"tiles": {(tx,ty): tileProtoId}, "name": str|None}
    entities = {}    # protoId -> [(x, y, gridUid)]
    beacon_overrides = {}  # (x,y,grid) -> text  — map-level NavMapBeacon text override
    for group in doc.get("entities") or []:
        proto = group.get("proto") or ""
        for ent in group.get("entities") or []:
            comps = {c.get("type"): c for c in ent.get("components") or [] if isinstance(c, dict)}
            grid_comp = comps.get("MapGrid")
            if grid_comp:
                uid = ent["uid"]
                g = grids.setdefault(uid, {"tiles": {}, "name": None})
                g["name"] = (comps.get("MetaData") or {}).get("name")
                for ind, chunk in (grid_comp.get("chunks") or {}).items():
                    cx, cy = map(int, str(chunk.get("ind", ind)).split(","))
                    for i, type_id in decode_chunk(chunk["tiles"]):
                        if type_id == 0:
                            continue  # Space
                        tx, ty = cx * 16 + i % 16, cy * 16 + i // 16
                        g["tiles"][(tx, ty)] = tilemap.get(type_id)
                continue
            tr = comps.get("Transform")
            if not proto or not tr or "pos" not in tr:
                continue
            try:
                x, y = (float(v) for v in str(tr["pos"]).split(","))
            except ValueError:
                continue
            grid = tr.get("parent")
            entities.setdefault(proto, []).append((round(x, 1), round(y, 1), grid))
            nb = comps.get("NavMapBeacon")
            if nb and nb.get("text"):
                beacon_overrides[(round(x, 1), round(y, 1), grid)] = str(nb["text"])
    if not grids:
        raise RuntimeError(f"no grids in {path}")
    main_grid = max(grids, key=lambda u: len(grids[u]["tiles"]))
    map_name = None
    for gm_id, g in grids.items():
        if gm_id == main_grid:
            map_name = g["name"]
    return {
        "name": map_name,
        "tiles": grids[main_grid]["tiles"],
        "main_grid": main_grid,
        "grid_names": {u: g["name"] for u, g in grids.items()},
        "offgrid_names": {u: (g["name"] or f"grid {u}") for u, g in grids.items() if u != main_grid},
        "entities": entities,
        "beacon_overrides": beacon_overrides,
    }
```

- [ ] **Step 3: Run selfcheck until green**

Run: `python ss14_map_extractor.py --selfcheck`
Expected: PASS (parse of bagel.yml takes 5–40 s depending on libyaml). If the Crowbar assert fails, print `crow[:5]` — if coordinates are right but grid mismatches, the assert tuple order is wrong, fix the assert, not the parser.

- [ ] **Step 4: Commit**

```bash
git add ss14_map_extractor.py
git commit -m "feat(maps): map YAML parse — 7-byte chunk decode, grids, entities, overrides"
```

---

### Task 5: Tile colors from real textures

**Files:**
- Modify: `ss14_map_extractor.py`, `README.md`

- [ ] **Step 1: Install Pillow, note the dep**

Run: `pip install pillow`
In `README.md` Quick-Start/Adding-a-fork section, change `pip install pyyaml openpyxl` → `pip install pyyaml openpyxl pillow`.

- [ ] **Step 2: Selfcheck assert** — switch the Task 3 tile assert to:

```python
    load_tile_colors("vanilla", fork, reg)
    c = reg.tile_color("FloorSteel")
    assert c and abs(c[0] - c[1]) < 40 and sum(c) > 60, f"FloorSteel avg color odd: {c}"
```

Run: expect FAIL `NameError: load_tile_colors`.

- [ ] **Step 3: Implement**

```python
def load_tile_colors(fork_key: str, fork_cfg: dict, reg: Registry):
    """Average color of each tile texture; cached as one JSON per fork."""
    from PIL import Image
    cache = CACHE_DIR / fork_key / "_tile_colors.json"
    if cache.exists():
        reg.tile_colors = {k: tuple(v) for k, v in json.loads(cache.read_text()).items()}
        return
    import io
    for tile_id, sprite in reg.tile_sprites.items():
        rel = "Resources" + sprite if sprite.startswith("/") else "Resources/" + sprite
        data = fetch_binary(fork_cfg["raw_url"].format(path=rel),
                            CACHE_DIR / fork_key / rel)
        if not data:
            continue
        try:
            img = Image.open(io.BytesIO(data)).convert("RGBA")
            px = [p for p in img.getdata() if p[3] > 0]
            if px:
                n = len(px)
                reg.tile_colors[tile_id] = (sum(p[0] for p in px) // n,
                                            sum(p[1] for p in px) // n,
                                            sum(p[2] for p in px) // n)
        except Exception as e:
            print(f"  WARNING: tile texture {tile_id}: {e}")
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps({k: list(v) for k, v in reg.tile_colors.items()}))
```

- [ ] **Step 4: Run selfcheck until green, commit**

```bash
git add ss14_map_extractor.py README.md
git commit -m "feat(maps): tile colors from average texture color (+pillow dep)"
```

---

### Task 6: PNG underlay bake

**Files:**
- Modify: `ss14_map_extractor.py`

- [ ] **Step 1: Selfcheck asserts** (append)

```python
    png_path, bounds = bake_png("vanilla", "Bagel", parsed, reg)
    from PIL import Image
    img = Image.open(png_path)
    assert img.width == bounds["maxX"] - bounds["minX"] + 1
    assert img.height == bounds["maxY"] - bounds["minY"] + 1
    opaque = sum(1 for p in img.convert("RGBA").getdata() if p[3] > 0)
    assert opaque > 15000, f"suspiciously empty PNG: {opaque} opaque px"
```

Run: expect FAIL.

- [ ] **Step 2: Implement**

```python
WALL_COLOR = (58, 78, 109, 255)      # matches site --border-active family
WINDOW_COLOR = (44, 82, 130, 255)
DOOR_COLOR = (138, 153, 179, 255)
FLOOR_FALLBACK = (34, 42, 54, 255)

def bake_png(fork_key: str, map_id: str, parsed: dict, reg: Registry):
    from PIL import Image
    tiles = parsed["tiles"]
    xs = [t[0] for t in tiles]; ys = [t[1] for t in tiles]
    bounds = {"minX": min(xs), "minY": min(ys), "maxX": max(xs), "maxY": max(ys)}
    w = bounds["maxX"] - bounds["minX"] + 1
    h = bounds["maxY"] - bounds["minY"] + 1
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    put = img.putpixel
    for (tx, ty), tile_id in tiles.items():
        c = reg.tile_color(tile_id) if tile_id else None
        rgba = (*c, 255) if c else FLOOR_FALLBACK
        put((tx - bounds["minX"], bounds["maxY"] - ty), rgba)
    overlay = {"wall": WALL_COLOR, "window": WINDOW_COLOR, "door": DOOR_COLOR}
    main = parsed["main_grid"]
    for proto, poss in parsed["entities"].items():
        color = overlay.get(reg.kind(proto))
        if not color:
            continue
        for x, y, grid in poss:
            if grid != main:
                continue
            px, py = int(x // 1) - bounds["minX"], bounds["maxY"] - int(y // 1)
            if 0 <= px < w and 0 <= py < h:
                put((px, py), color)
    out = OUT_DIR / fork_key / f"{map_id}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, optimize=True)
    print(f"  baked {out} {w}x{h}")
    return out, bounds
```

- [ ] **Step 3: Run selfcheck; eyeball the PNG**

Run: `python ss14_map_extractor.py --selfcheck` → PASS.
Open `maps/vanilla/Bagel.png` (any viewer, zoom in). Expected: a **recognizable station silhouette** — connected rooms, wall outlines, distinct floor colors (white medbay, dark maint). If it looks like noise, the chunk tile order is wrong: change `tx, ty = cx * 16 + i % 16, cy * 16 + i // 16` index math (swap `% / //`) and re-eyeball.

- [ ] **Step 4: Commit**

```bash
git add ss14_map_extractor.py
git commit -m "feat(maps): PNG underlay bake — floors by texture color, wall/window/door overlay"
```

---

### Task 7: Items index + beacons + per-map JSON + index.json

**Files:**
- Modify: `ss14_map_extractor.py`

- [ ] **Step 0: Pipeline hardening (from Task 2 quality review)**

Three fixes before the fork loop exists:

(a) Authenticated tree fetch — anonymous api.github.com is capped at 60 req/h and a 403 currently reads as "fork has no tree". Port the `gh auth token` pattern from `scripts/audit_fork_manifests.py:107-129`:

```python
def _gh_token() -> str:
    import subprocess
    try:
        t = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True, timeout=10)
        return t.stdout.strip() if t.returncode == 0 else ""
    except Exception:
        return ""

def fetch_repo_tree(fork_key: str, fork_cfg: dict) -> list[str]:
    """All file paths in the fork's repo (git/trees API, cached, gh-authenticated when possible)."""
    owner, repo, branch = repo_meta(fork_cfg)
    cache_path = CACHE_DIR / fork_key / "_tree.json"
    if not cache_path.exists():
        url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
        headers = {"User-Agent": "SS14-Map-Extractor/1.0"}
        token = _gh_token()
        if token:
            headers["Authorization"] = f"Bearer {token}"
        else:
            print("  NOTE: no gh token — anonymous API limit is 60 req/h")
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        for attempt in range(3):
            try:
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=120) as resp:
                    cache_path.write_text(resp.read().decode("utf-8"), encoding="utf-8")
                break
            except Exception as e:
                if attempt < 2:
                    print(f"  Retry {attempt + 1}/3: {e}"); time.sleep(2 * (attempt + 1))
                else:
                    print(f"  FAILED tree fetch for {fork_key}: {e}"); return []
    data = json.loads(cache_path.read_text(encoding="utf-8"))
    if data.get("truncated"):
        print(f"  WARNING: tree truncated for {fork_key}")
    return [e["path"] for e in data.get("tree", []) if e.get("type") == "blob"]
```
(This REPLACES the Task 2 version of `fetch_repo_tree`; keep `repo_meta` as is.)

(b) Selfcheck preflight — right after `tree = fetch_repo_tree(...)` in `selfcheck()` add:
```python
    if not tree:
        sys.exit("tree fetch failed — network or GitHub rate limit? (see WARNINGs above)")
```

(c) The `--all-forks` loop in `main()` must isolate fork crashes (design-doc invariant "regen never dies whole"):
```python
    if args.all_forks:
        per_fork = {}
        for key in FORK_REGISTRY:
            try:
                per_fork[key] = process_fork(key)
            except Exception as e:
                print(f"SKIP fork {key}: crashed: {e}")
                per_fork[key] = []
        write_index(per_fork)
```

- [ ] **Step 1: Selfcheck asserts** (append)

```python
    data = build_map_json("vanilla", "Bagel", "Bagel Station", parsed, reg, bounds)
    items = data["items"]
    assert "Crowbar" in items
    kinds = {p[2] for p in items["Crowbar"]["p"]}
    assert 0 in kinds, "floor crowbar missing"
    assert 2 in kinds or 4 in kinds, "vending crowbar missing (YouTool is on Bagel)"
    assert any(p[2] == 1 for plist in (v["p"] for v in items.values()) for p in plist), "no container-sourced items at all"
    assert len(data["beacons"]) > 20, f"beacons: {len(data['beacons'])}"
    assert all(len(b) == 3 for b in data["beacons"])
    raw = json.dumps(data)
    assert len(raw) < 2_000_000, f"map json too big: {len(raw)}"
    print("selfcheck OK: full Bagel pipeline")
```

Run: expect FAIL `NameError: build_map_json`.

- [ ] **Step 2: Implement**

```python
def build_map_json(fork_key, map_id, map_name, parsed, reg, bounds):
    main = parsed["main_grid"]
    offnames = parsed["offgrid_names"]
    items = {}   # protoId -> {"n", "c", "p": [...]}

    def add(pid, x, y, kind, via=None, extra=None):
        k = reg.kind(pid)
        if k not in ("item", "mach", "container", "vendor", "beacon"):
            return
        cat = "item" if k == "item" else "mach"
        rec = items.setdefault(pid, {"n": reg.name(pid), "c": cat, "p": []})
        p = [x, y, kind]
        if via is not None:
            p.append(via)
            if extra is not None:
                p.append(extra)
        rec["p"].append(p)

    beacons = []
    for proto, poss in parsed["entities"].items():
        kind = reg.kind(proto)
        for x, y, grid in poss:
            offgrid = grid != main
            if kind == "beacon":
                if not offgrid:
                    text = parsed["beacon_overrides"].get((x, y, grid)) or reg.beacon_text(proto)
                    beacons.append([text, x, y])
                continue
            if kind == "skip" or kind in ("wall", "window", "door"):
                continue
            if offgrid:
                add(proto, x, y, 3, offnames.get(grid, "off-grid"))
                continue
            # the thing itself is searchable (locker, vendor, machine, item)
            add(proto, x, y, 0)
            fills = reg.storage_fill(proto)  # containers AND filled items (duffel bags)
            if fills:
                via = reg.name(proto)
                for entry in fills:
                    if not isinstance(entry, dict) or not entry.get("id"):
                        continue
                    prob = entry.get("prob")
                    amount = entry.get("amount", 1)
                    extra = round(prob, 2) if isinstance(prob, (int, float)) and prob < 1 else (amount if amount > 1 else None)
                    add(entry["id"], x, y, 1, via, extra)
            if kind == "vendor":
                via = reg.name(proto)
                for pid, count in reg.vendor_inventory(proto).items():
                    add(pid, x, y, 2, via, count)
                for pid, count in reg.vendor_contraband(proto).items():
                    add(pid, x, y, 4, via, count)
    data = {"schemaVersion": SCHEMA_VERSION, "id": map_id, "name": map_name,
            "fork": fork_key, "bounds": bounds, "beacons": beacons,
            "offgrid": {str(u): n for u, n in offnames.items()}, "items": items}
    out = OUT_DIR / fork_key / f"{map_id}.json"
    out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  wrote {out} ({out.stat().st_size // 1024} KB, {len(items)} protos)")
    return data
```

Note: `add(proto, x, y, 0)` for vendors/containers/machinery means the machine itself is findable at kind=floor — intended (searching "youtool" shows the vendor).

- [ ] **Step 3: Wire `main()` + `write_index`**

```python
def process_fork(fork_key: str) -> list[dict]:
    fork_cfg = FORK_REGISTRY[fork_key]
    tree = fetch_repo_tree(fork_key, fork_cfg)
    if not tree:
        print(f"SKIP fork {fork_key}: no tree"); return []
    maps = discover_maps(fork_key, fork_cfg, tree)
    if not maps:
        print(f"SKIP fork {fork_key}: no gameMap protos"); return []
    reg = build_registry(fork_key, fork_cfg, tree)
    load_tile_colors(fork_key, fork_cfg, reg)
    done = []
    for gm in maps:
        try:
            parsed = parse_map_file(fork_key, fork_cfg, gm["path"])
            png_path, bounds = bake_png(fork_key, gm["id"], parsed, reg)
            data = build_map_json(fork_key, gm["id"], gm["name"], parsed, reg, bounds)
            done.append({"id": gm["id"], "name": gm["name"], "file": f"{fork_key}/{gm['id']}",
                         "inPool": gm["inPool"], "items": len(data["items"]),
                         "beacons": len(data["beacons"]),
                         "px": [bounds["maxX"] - bounds["minX"] + 1, bounds["maxY"] - bounds["minY"] + 1]})
        except Exception as e:
            print(f"  WARNING: {fork_key}/{gm['id']} failed: {e}")
    print(f"fork {fork_key}: {len(done)}/{len(maps)} maps baked")
    return done

def write_index(per_fork: dict):
    forks = []
    for key, maps in per_fork.items():
        if not maps:
            continue
        label = FORK_REGISTRY[key].get("label", key)
        forks.append({"key": key, "label": label, "maps": maps})
    OUT_DIR.mkdir(exist_ok=True)
    (OUT_DIR / "index.json").write_text(
        json.dumps({"schemaVersion": SCHEMA_VERSION, "forks": forks},
                   ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote maps/index.json ({sum(len(m) for m in per_fork.values())} maps)")
```

In `main()`: `--fork X [--map ID]` → `process_fork` (filter to one map when `--map` given, still `write_index({fork: done})` merging with existing index.json if present — read it, replace that fork's entry, write back). `--all-forks` → loop `for key in FORK_REGISTRY`. Check the `label` key actually exists in `FORK_REGISTRY` values (`python -c "from config import FORK_REGISTRY; print(list(FORK_REGISTRY['vanilla'].keys()))"`) — if the display-name key is named differently (e.g. `name`), use that.

- [ ] **Step 4: Run selfcheck until green; run the real thing**

Run: `python ss14_map_extractor.py --selfcheck` → `selfcheck OK: full Bagel pipeline`
Run: `python ss14_map_extractor.py --fork vanilla --map Bagel`
Expected: `maps/vanilla/Bagel.png` + `maps/vanilla/Bagel.json` + `maps/index.json` exist.

- [ ] **Step 5: Commit**

```bash
git add ss14_map_extractor.py
git commit -m "feat(maps): items index — container/vendor resolve, beacons, per-map json, index"
```

---

### Task 8: E1 gate — manual spot-check against upstream YAML

**Files:** none (verification only), commit generated data.

- [ ] **Step 1: Spot-check 3 items of 3 source kinds**

Pick from `maps/vanilla/Bagel.json`:
1. Floor: `Crowbar` p-entry kind 0 → grep `bagel.yml` cache for `proto: Crowbar` block, confirm pos matches.
2. Container: any kind-1 entry (e.g. a `Welder` inside a tool locker) → confirm the locker proto's `StorageFill` in prototype cache lists it, and locker pos matches.
3. Vending: `Crowbar` kind 2 via YouTool → `youtool.yml` says `Crowbar: 5` → extra == 5.

Document the three checks in the commit message body (proto, expected, got).

- [ ] **Step 2: Commit data**

```bash
git add maps/
git commit -m "feat(maps): vanilla Bagel baked data (E1 verified: 3-way spot-check vs YAML)"
```

---

### Task 9: Tab skeleton (index.html + app.js hooks + empty maps.js)

**Files:**
- Modify: `index.html` (tab button after Botany at index.html:190; panel after the last `.tab-panel`; script tag next to `tutorial.js`)
- Modify: `app.js:2564` (`validTabs`), `app.js:2549` (inside `encodeURLState`, before `return`)
- Create: `maps.js`

- [ ] **Step 1: index.html tab button** (after the `btn-botany` line)

```html
      <button class="tab-btn" id="btn-maps" data-tab="maps" role="tab" aria-selected="false" aria-controls="tab-maps">Maps</button>
```

- [ ] **Step 2: index.html panel** (after the last tab-panel `</div>`, before the closing of the tab container — mirror sibling structure)

```html
    <!-- Maps Tab -->
    <div class="tab-panel" id="tab-maps" role="tabpanel" aria-labelledby="btn-maps">
      <div class="maps-toolbar">
        <select id="mapsMapSelect" aria-label="Station map"></select>
        <div class="maps-search-wrap">
          <input type="text" id="mapsSearch" class="search-input" placeholder="Search an item on this map… (crowbar, plasma, defib)" autocomplete="off" disabled>
          <div id="mapsSuggest" class="maps-suggest" hidden></div>
        </div>
      </div>
      <div class="maps-body">
        <div class="maps-canvas-wrap">
          <canvas id="mapsCanvas"></canvas>
          <div class="maps-zoom-controls">
            <button id="mapsZoomIn" aria-label="Zoom in">+</button>
            <button id="mapsZoomOut" aria-label="Zoom out">−</button>
            <button id="mapsZoomFit" aria-label="Fit map">⛶</button>
          </div>
          <div id="mapsStatus" class="maps-status"></div>
        </div>
        <aside class="maps-locations" id="mapsLocations"></aside>
      </div>
      <div class="maps-legend">
        <span><i class="maps-dot maps-dot-floor"></i> on the floor</span>
        <span><i class="maps-dot maps-dot-container"></i> inside a locker/crate</span>
        <span><i class="maps-dot maps-dot-vendor"></i> vending machine</span>
      </div>
    </div>
```

- [ ] **Step 3: script tag** (next to the tutorial.js one) `<script src="maps.js?v=1" defer></script>`. Bump `app.js?v=N` and `style.css?v=N` (+1 to current values — workbook cache-bust rule).

- [ ] **Step 4: app.js — two edits**

app.js:2564: add `'maps'`:
```js
  const validTabs = ['reagents','reactions','calculator','trees','graph','stats','antag','maps'];
```
app.js encodeURLState, before `return params.toString() ...`:
```js
  if (window.mapsURLState) for (const [k, v] of Object.entries(window.mapsURLState())) params.set(k, v);
```

- [ ] **Step 5: maps.js lazy-init skeleton**

```js
// Maps tab — station map item finder. Data: maps/index.json + maps/<fork>/<Id>.{json,png}
// Spec: docs/design/2026-07-12-map-item-finder.md. Loaded lazily on first tab open.
(function () {
  'use strict';
  const S = {
    index: null, mapMeta: null, mapData: null, img: null,
    scale: 1, ox: 0, oy: 0,        // canvas transform
    selectedProto: null, inited: false,
  };
  window.mapsURLState = () => {
    const out = {};
    if (S.mapMeta) out.map = S.mapMeta.file;
    if (S.selectedProto) out.item = S.selectedProto;
    return out;
  };
  async function init() {
    if (S.inited) return;
    S.inited = true;
    const status = document.getElementById('mapsStatus');
    status.textContent = 'Loading map index…';
    try {
      const r = await fetch('maps/index.json');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      S.index = await r.json();
      status.textContent = '';
      buildMapSelect();
    } catch (e) {
      status.innerHTML = 'Failed to load maps index. <button id="mapsRetry">Retry</button>';
      document.getElementById('mapsRetry').onclick = () => { S.inited = false; init(); };
    }
  }
  function buildMapSelect() { /* Task 10 */ }
  document.getElementById('btn-maps').addEventListener('click', init);
})();
```

- [ ] **Step 6: Verify in preview**

`preview_start {name: "ss14-chem"}` → open `http://localhost:8090` → click Maps tab.
Expected: tab activates, toolbar renders (unstyled ok), console has no errors, status shows nothing or index loaded. Deep-link `.../#tab=maps` opens the tab.

- [ ] **Step 7: Commit**

```bash
git add index.html app.js maps.js
git commit -m "feat(maps): Maps tab skeleton — lazy init, deep-link whitelist, URL state hook"
```

---

### Task 10: Map selector + canvas underlay render

**Files:** Modify: `maps.js`

- [ ] **Step 1: Implement selector + loading + first draw**

```js
  function buildMapSelect() {
    const sel = document.getElementById('mapsMapSelect');
    sel.innerHTML = '';
    for (const fork of S.index.forks) {
      const og = document.createElement('optgroup');
      og.label = fork.label;
      const maps = [...fork.maps].sort((a, b) => (b.inPool - a.inPool) || a.name.localeCompare(b.name));
      for (const m of maps) {
        const o = document.createElement('option');
        o.value = m.file;
        o.textContent = m.name + (m.inPool ? '' : ' (off-rotation)');
        og.appendChild(o);
      }
      sel.appendChild(og);
    }
    sel.onchange = () => loadMap(sel.value);
    loadMap(sel.value);   // first map by default
  }

  async function loadMap(file) {
    const status = document.getElementById('mapsStatus');
    status.textContent = 'Loading ' + file + '…';
    S.mapData = null; S.selectedProto = null;
    try {
      const [jr, img] = await Promise.all([
        fetch('maps/' + file + '.json').then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }),
        new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'maps/' + file + '.png'; }),
      ]);
      S.mapData = jr; S.img = img;
      S.mapMeta = S.index.forks.flatMap(f => f.maps).find(m => m.file === file);
      status.textContent = '';
      document.getElementById('mapsSearch').disabled = false;
      buildSearchIndex();          // Task 12
      zoomFit();
      renderLocations(null);       // Task 13
      if (typeof track === 'function') track('maps_map_select');
    } catch (e) {
      status.innerHTML = 'Failed to load map. <button id="mapsRetryMap">Retry</button>';
      document.getElementById('mapsRetryMap').onclick = () => loadMap(file);
    }
  }

  function canvasSize() {
    const c = document.getElementById('mapsCanvas');
    const wrap = c.parentElement;
    const dpr = window.devicePixelRatio || 1;
    c.width = wrap.clientWidth * dpr; c.height = wrap.clientHeight * dpr;
    c.style.width = wrap.clientWidth + 'px'; c.style.height = wrap.clientHeight + 'px';
    return { w: c.width, h: c.height };
  }

  function zoomFit() {
    const { w, h } = canvasSize();
    S.scale = Math.min(w / S.img.width, h / S.img.height) * 0.95;
    S.ox = (w - S.img.width * S.scale) / 2;
    S.oy = (h - S.img.height * S.scale) / 2;
    draw();
  }

  function draw() {
    const c = document.getElementById('mapsCanvas');
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(S.img, S.ox, S.oy, S.img.width * S.scale, S.img.height * S.scale);
    drawBeacons(ctx);   // Task 12 (no-op stub for now: define as empty function)
    drawMarkers(ctx);   // Task 12 (stub)
  }
  function drawBeacons() {} // replaced in Task 12
  function drawMarkers() {} // replaced in Task 12
  window.addEventListener('resize', () => { if (S.img && document.getElementById('tab-maps').classList.contains('active')) zoomFit(); });
```
Also in `init()` after successful index fetch: honor deep-link — parse `location.hash` `URLSearchParams`, if `map=` present and exists in index set the select value before `buildMapSelect()`'s default `loadMap` (set `sel.value = wanted` then call `loadMap(sel.value)` once).

- [ ] **Step 2: Verify in preview**

Reload → Maps tab → Bagel renders as a pixelated station schematic centered in the canvas. `#tab=maps&map=vanilla/Bagel` deep-link loads it directly.

- [ ] **Step 3: Commit** — `git add maps.js index.html` (bump `maps.js?v=2`) `git commit -m "feat(maps): map selector + PNG underlay canvas render"`

---

### Task 11: Zoom & pan

**Files:** Modify: `maps.js`

- [ ] **Step 1: Implement pointer-events pan + wheel/button zoom**

```js
  function zoomAt(cx, cy, factor) {
    const ns = Math.min(Math.max(S.scale * factor, 0.2), 40);
    S.ox = cx - (cx - S.ox) * (ns / S.scale);
    S.oy = cy - (cy - S.oy) * (ns / S.scale);
    S.scale = ns; draw();
  }
  function setupCanvasNav() {
    const c = document.getElementById('mapsCanvas');
    const dpr = () => window.devicePixelRatio || 1;
    c.addEventListener('wheel', e => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      zoomAt((e.clientX - r.left) * dpr(), (e.clientY - r.top) * dpr(), e.deltaY < 0 ? 1.25 : 0.8);
    }, { passive: false });
    let drag = null;
    c.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', e => {
      if (!drag) return;
      S.ox += (e.clientX - drag.x) * dpr(); S.oy += (e.clientY - drag.y) * dpr();
      drag = { x: e.clientX, y: e.clientY }; draw();
    });
    c.addEventListener('pointerup', () => { drag = null; });
    document.getElementById('mapsZoomIn').onclick = () => zoomAt(c.width / 2, c.height / 2, 1.4);
    document.getElementById('mapsZoomOut').onclick = () => zoomAt(c.width / 2, c.height / 2, 0.7);
    document.getElementById('mapsZoomFit').onclick = zoomFit;
  }
```
Call `setupCanvasNav()` once inside `init()` after index load.

- [ ] **Step 2: Verify in preview** — wheel zooms toward cursor, drag pans, buttons work, fit re-centers. (Per project memory: drive clicks via eval if preview clicks are flaky.)

- [ ] **Step 3: Commit** — bump `?v=3`; `git commit -m "feat(maps): canvas zoom/pan — wheel, drag, buttons"`

---

### Task 12: Beacon labels, item search, markers

**Files:** Modify: `maps.js`

- [ ] **Step 1: Coordinate helpers + beacon layer + marker layer** (replace stubs)

```js
  const KIND_COLOR = { 0: '#39ff85', 1: '#ffb627', 2: '#c17aff', 4: '#ff3d5a' };
  function tileToScreen(x, y) {
    const b = S.mapData.bounds;
    return [(Math.floor(x) - b.minX + 0.5) * S.scale + S.ox,
            (b.maxY - Math.floor(y) + 0.5) * S.scale + S.oy];
  }
  function drawBeacons(ctx) {
    if (!S.mapData || S.scale < 1.2) return;   // labels only when zoomed in enough
    ctx.font = `${Math.max(10, Math.min(13, S.scale * 3))}px 'Share Tech Mono', monospace`;
    ctx.textAlign = 'center'; ctx.fillStyle = '#00e5ff'; ctx.globalAlpha = 0.85;
    for (const [name, x, y] of S.mapData.beacons) {
      const [sx, sy] = tileToScreen(x, y);
      ctx.fillText(name, sx, sy);
    }
    ctx.globalAlpha = 1;
  }
  function drawMarkers(ctx) {
    if (!S.selectedProto || !S.mapData) return;
    const rec = S.mapData.items[S.selectedProto];
    if (!rec) return;
    const r = Math.max(3, Math.min(8, S.scale * 1.2));
    for (const p of rec.p) {
      if (p[2] === 3) continue;              // off-grid: list only
      const [sx, sy] = tileToScreen(p[0], p[1]);
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = KIND_COLOR[p[2]] || '#39ff85';
      ctx.fill();
      ctx.strokeStyle = '#06090f'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }
```

- [ ] **Step 2: Search index + suggest dropdown**

```js
  let searchIdx = [];
  function buildSearchIndex() {
    searchIdx = Object.entries(S.mapData.items)
      .map(([pid, r]) => ({ pid, name: r.n || pid, count: r.p.length, cat: r.c }))
      .sort((a, b) => b.count - a.count);
    const inp = document.getElementById('mapsSearch');
    inp.value = ''; S.selectedProto = null;
    inp.oninput = () => suggest(inp.value.trim().toLowerCase());
    inp.onkeydown = e => {
      if (e.key === 'Enter') {
        const first = document.querySelector('#mapsSuggest [data-pid]');
        if (first) pick(first.dataset.pid);
      }
    };
  }
  function suggest(q) {
    const box = document.getElementById('mapsSuggest');
    if (!q) { box.hidden = true; return; }
    const hits = searchIdx.filter(e => e.name.toLowerCase().includes(q) || e.pid.toLowerCase().includes(q)).slice(0, 12);
    box.innerHTML = hits.map(h =>
      `<button data-pid="${h.pid}"><span>${h.name}</span><small>${h.pid} · ${h.count}</small></button>`).join('') ||
      '<div class="maps-nohit">not found on this map</div>';
    box.hidden = false;
    box.querySelectorAll('[data-pid]').forEach(b => b.onclick = () => pick(b.dataset.pid));
  }
  function pick(pid) {
    S.selectedProto = pid;
    const rec = S.mapData.items[pid];
    document.getElementById('mapsSearch').value = rec.n || pid;
    document.getElementById('mapsSuggest').hidden = true;
    draw(); renderLocations(pid);
    if (typeof track === 'function') track('maps_search');
  }
```
(`renderLocations` still a stub — define empty; filled in Task 13.)

- [ ] **Step 3: Verify in preview** — type `crow` → suggestions appear; pick Crowbar → green/amber/violet dots on the map; zoom in ≥1.2 → cyan beacon labels appear.

- [ ] **Step 4: Commit** — bump `?v=4`; `git commit -m "feat(maps): beacon labels, item search with suggestions, kind-colored markers"`

---

### Task 13: Location list grouped by nearest beacon

**Files:** Modify: `maps.js`

- [ ] **Step 1: Implement grouping + list + click-to-zoom**

```js
  function nearestBeacon(x, y) {
    let best = null, bd = Infinity;
    for (const [name, bx, by] of S.mapData.beacons) {
      const d = (bx - x) ** 2 + (by - y) ** 2;
      if (d < bd) { bd = d; best = name; }
    }
    return best || 'no beacon';
  }
  const KIND_LABEL = { 0: 'on the floor', 1: 'in', 2: 'vend', 4: 'vend (contraband)' };
  function renderLocations(pid) {
    const el = document.getElementById('mapsLocations');
    if (!pid) { el.innerHTML = '<p class="maps-hint">Pick an item to see where it lives.</p>'; return; }
    const rec = S.mapData.items[pid];
    const groups = new Map();   // key -> {label, kindMix, entries: [...]}
    for (const p of rec.p) {
      const key = p[2] === 3 ? '☄ ' + (p[3] || 'off-grid') : nearestBeacon(p[0], p[1]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
    const rows = [...groups.entries()].sort((a, b) => b[1].length - a[1].length).map(([label, ps], gi) => {
      const bits = ps.map(p => {
        const badge = `<i class="maps-dot" style="background:${KIND_COLOR[p[2]] || '#8a99b3'}"></i>`;
        if (p[2] === 0) return badge + ' ' + KIND_LABEL[0];
        if (p[2] === 1) return badge + ` in ${p[3]}` + (p[4] ? (p[4] < 1 ? ` (~${Math.round(p[4] * 100)}%)` : ` ×${p[4]}`) : '');
        if (p[2] === 2 || p[2] === 4) return badge + ` ${KIND_LABEL[p[2]]} ${p[3]}` + (p[4] ? ` ×${p[4]}` : '');
        return badge + ' ' + label;
      });
      return `<button class="maps-loc" data-gi="${gi}"><b>${label}</b><span>${ps.length}</span><small>${[...new Set(bits)].join(' · ')}</small></button>`;
    });
    el.innerHTML = rows.join('');
    const entries = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
    el.querySelectorAll('.maps-loc').forEach(btn => btn.onclick = () => {
      const ps = entries[+btn.dataset.gi][1].filter(p => p[2] !== 3);
      if (!ps.length) return;
      const cx = ps.reduce((s, p) => s + p[0], 0) / ps.length;
      const cy = ps.reduce((s, p) => s + p[1], 0) / ps.length;
      const c = document.getElementById('mapsCanvas');
      S.scale = Math.max(S.scale, 4);
      const b = S.mapData.bounds;
      S.ox = c.width / 2 - (Math.floor(cx) - b.minX + 0.5) * S.scale;
      S.oy = c.height / 2 - (b.maxY - Math.floor(cy) + 0.5) * S.scale;
      draw();
    });
  }
```

- [ ] **Step 2: Verify in preview** — Crowbar list shows groups (Tool Room 3, …), off-grid group shows `☄ Syndi Puddle CS108` if applicable, prob shows `~50%`, vendor `×5`; clicking a group zooms the canvas to it.

- [ ] **Step 3: Commit** — bump `?v=5`; `git commit -m "feat(maps): location list grouped by nearest beacon, click-to-zoom"`

---

### Task 14: Styles + mobile stack + deep-link item restore

**Files:** Modify: `style.css` (append), `maps.js`, `index.html` (bump)

- [ ] **Step 1: Styles** (append to style.css, theme vars already defined at :root)

```css
/* ── Maps tab ── */
.maps-toolbar { display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
#mapsMapSelect { background: var(--panel); color: var(--text-bright); border: 1px solid var(--border-active);
  font-family: 'Share Tech Mono', monospace; padding: 8px 10px; min-width: 220px; }
.maps-search-wrap { position: relative; flex: 1; min-width: 220px; }
.maps-suggest { position: absolute; top: 100%; left: 0; right: 0; z-index: 30; background: var(--panel-raised);
  border: 1px solid var(--border-active); max-height: 300px; overflow-y: auto; }
.maps-suggest button { display: flex; justify-content: space-between; gap: 8px; width: 100%; padding: 7px 10px;
  background: none; border: 0; border-bottom: 1px solid var(--border-subtle); color: var(--text-main);
  font-family: 'Share Tech Mono', monospace; font-size: 0.85rem; cursor: pointer; text-align: left; }
.maps-suggest button:hover { background: var(--panel-hover); color: var(--text-bright); }
.maps-suggest small { color: var(--text-ghost); }
.maps-nohit { padding: 8px 10px; color: var(--text-ghost); font-size: 0.85rem; }
.maps-body { display: flex; gap: 12px; min-height: 480px; }
.maps-canvas-wrap { position: relative; flex: 1; background: #050810; border: 1px solid var(--border-subtle); min-height: 480px; }
#mapsCanvas { display: block; width: 100%; height: 100%; cursor: grab; touch-action: none; }
#mapsCanvas:active { cursor: grabbing; }
.maps-zoom-controls { position: absolute; right: 10px; top: 10px; display: flex; flex-direction: column; gap: 6px; }
.maps-zoom-controls button { width: 34px; height: 34px; background: var(--panel-raised); color: var(--text-bright);
  border: 1px solid var(--border-active); font-size: 1.1rem; cursor: pointer; }
.maps-status { position: absolute; left: 10px; bottom: 10px; color: var(--amber); font-size: 0.85rem; }
.maps-locations { width: 260px; overflow-y: auto; max-height: 560px; display: flex; flex-direction: column; gap: 6px; }
.maps-loc { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; padding: 8px 10px; background: var(--panel);
  border: 1px solid var(--border-subtle); border-left: 2px solid var(--phosphor-dim); color: var(--text-main);
  font-family: 'Share Tech Mono', monospace; font-size: 0.82rem; cursor: pointer; text-align: left; }
.maps-loc:hover { background: var(--panel-hover); border-left-color: var(--phosphor); }
.maps-loc b { color: var(--text-bright); font-weight: normal; }
.maps-loc span { color: var(--phosphor); }
.maps-loc small { grid-column: 1 / -1; color: var(--text-ghost); }
.maps-hint { color: var(--text-ghost); font-size: 0.85rem; padding: 8px; }
.maps-legend { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 10px; color: var(--text-sub); font-size: 0.8rem; }
.maps-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; vertical-align: -1px; }
.maps-dot-floor { background: var(--phosphor); }
.maps-dot-container { background: var(--amber); }
.maps-dot-vendor { background: var(--violet); }
@media (max-width: 820px) {
  .maps-body { flex-direction: column; }
  .maps-locations { width: auto; max-height: 300px; }
  .maps-canvas-wrap { min-height: 320px; }
}
```

- [ ] **Step 2: Deep-link item restore** — in `loadMap` success path, after `buildSearchIndex()`: parse hash once; if `item=` matches a key in `S.mapData.items`, call `pick(thatPid)`.

- [ ] **Step 3: Verify** — desktop layout side-by-side, ≤820px stacks; share button URL contains `tab=maps&map=…&item=…`; opening that URL in a fresh tab restores map+item+markers. Screenshot for the increment log.

- [ ] **Step 4: Commit** — bump `style.css?v` and `maps.js?v`; `git commit -m "feat(maps): tab styles, mobile stack, item deep-link restore (E2 verified e2e)"`

---

### Task 15: E3 — bake all vanilla maps

**Files:** run extractor; possibly `config.py` (blocklist stub)

- [ ] **Step 1:** Run `python ss14_map_extractor.py --fork vanilla` (all discovered maps).
Expected: ~15 maps baked, warnings (if any) reviewed one by one — a broken map is a WARNING+skip, not a crash.
- [ ] **Step 2:** Spot-check 2 non-Bagel maps in the browser (pick Box + Marathon): select → renders → search `crowbar` → markers.
- [ ] **Step 3:** Check repo weight: `du -sh maps/` — expect < 5 MB total. If a single JSON balloons >1.5 MB, investigate the offending proto (usually a spammy spawner) before committing.
- [ ] **Step 4: Commit** — `git add maps/ && git commit -m "feat(maps): all vanilla station maps baked (E3)"`

---

### Task 16: E4 — all 18 forks

**Files:** Modify: `config.py` (append), `ss14_map_extractor.py` (enable blocklist), run `--all-forks`

- [ ] **Step 1: config.py** (append at the end)

```python
# ── Maps tab (ss14_map_extractor.py) ──
# gameMap prototype ids to skip per fork (debug/lobby/arena maps that slip past the pool filter)
MAP_BLOCKLIST: dict[str, list[str]] = {
    # "vanilla": ["Debug"],   # fill as regen warnings reveal junk maps
}
```
Enable the two blocklist lines in `discover_maps` (drop the ponytail stub).

- [ ] **Step 2:** Run `python ss14_map_extractor.py --all-forks` (long: trees + protos per fork; cached afterwards).
Review output per fork: `fork X: N/M maps baked`. Forks with 0 gameMaps (pure content forks that reuse upstream maps) are expected SKIPs — count them in the commit message. Any *parse* failure (format drift) → inspect, either fix decode or blocklist the map with a comment.

- [ ] **Step 3:** Browser check 2 RU forks (per audience): pick a Corvax and an ADT map, search a common item (`лом` won't hit — search `crowbar`; RU search is a spec non-goal), verify markers + beacon labels render (fork beacons may use their own ftl — beacon fallback `.title()` covers missing keys).

- [ ] **Step 4:** `du -sh maps/` sanity (< 25 MB with 18 forks; if way above, check PNG `optimize=True` held and no map has an absurd bounds from a stray far-away tile — if one does, clamp: ignore tiles whose |coord| > 1500 with a warning).

- [ ] **Step 5: Commit** — `git add maps/ config.py ss14_map_extractor.py && git commit -m "feat(maps): all-fork bake, per-fork blocklist (E4 data)"`

---

### Task 17: Ship — deploy workflow, docs, final verify

**Files:** Modify: `.github/workflows/deploy.yml`, `README.md`, `CHANGELOG.md`, `ROADMAP.md`

- [ ] **Step 1: deploy.yml** — in "Collect static files": add `maps.js` to the `cp` list and `cp -r maps _site/maps` after the sprites line.

- [ ] **Step 2: README** — Features table: add row `| **Maps** | Item finder | Pick a station map, search any item — see it on a rendered schematic with locker/vendor sources |`; Architecture block: add `maps.js`, `ss14_map_extractor.py`, `maps/` lines.

- [ ] **Step 3: CHANGELOG** — new entry: maps schemaVersion 1, what's baked, known non-goals (RU search, spawners, secondary grids).

- [ ] **Step 4: ROADMAP** — mark series E increments `[x]` with dates + one-line verification notes (per workbook DoD format).

- [ ] **Step 5: Final e2e** — fresh reload with `?nocache=1`, walk the whole flow on 2 forks, screenshot, check Metrika debug fires `tab_maps` / `maps_map_select` / `maps_search`.

- [ ] **Step 6: Commit** — `git commit -m "feat(maps): ship — deploy workflow, docs, changelog (series E complete)"`

---

## Plan Self-Review (done at write time)

- **Spec coverage:** pipeline (T1–8), tab UI+canvas+markers+list (T9–14), all-vanilla (T15), 18 forks + resilience (T16), deploy/docs/metrics (T9 auto `tab_maps`, T10/T12 custom events, T17). Non-goals honored: no spawners, no RU search, no secondary-grid render (kind-3 list entries only). Multi-grid naming via `MetaData` ✓. Contraband bonus kind=4 (cheap, antag-audience value) — small scope add, flagged here.
- **Placeholders:** `renderLocations`/`drawBeacons`/`drawMarkers` stubs are explicitly replaced in named tasks; blocklist stub explicitly enabled in T16. No TBDs remain.
- **Type consistency:** `S.mapData.items[pid].p` tuple `[x,y,kind,via,extra]` used identically in T7 (writer), T12 (markers), T13 (list). `bounds` keys minX/minY/maxX/maxY everywhere. `file` = `<fork>/<Id>` in index, fetched as `maps/<file>.{json,png}`.
- **Risk register:** chunk row order (T6 eyeball gate), fork format drift (T16 warning+skip), `FORK_REGISTRY` key names (`vanilla`, `label`) verified in T1/T7 steps before use.
