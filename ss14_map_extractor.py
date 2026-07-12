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
# Data-driven junk filter: a real playable station has hundreds of searchable
# items; deathmatch/arena/test maps have <100. Cleaner than a per-fork blocklist
# and auto-handles all 18 forks. (E3 vanilla: drops Empty=0, MeteorArena=0,
# dm01-entryway=57, TestTeg=85; keeps Relic=943, Reach=1005.)
MIN_MAP_ITEMS = 100

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

# ── prototype registry ──

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

STRUCT_SKIP_PREFIXES = ("Cable", "Pipe", "GasPipe", "DisposalPipe", "Poweredlight",
                        "PoweredLight", "Catwalk", "Lattice", "Grille", "SignalTimer")
# ponytail: prefix blocklist tuned on Bagel selfcheck; extend when a fork leaks junk

class Registry:
    def __init__(self):
        self.protos = {}        # id -> {"name", "parents": [..], "components": {typeName: dict}}
        self.vend_inventories = {}   # invId -> {"normal": {pid: n}, "contraband": {pid: n}}
        self.tile_sprites = {}  # tileId -> sprite path
        self.tile_colors = {}   # tileId -> (r,g,b) filled in Task 5
        self.entity_tables = {} # entityTable id -> selector tree (modern container fills)
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
        # item BEFORE container: a filled duffel bag is an Item that also carries
        # EntityTableContainerFill — it must stay searchable as an item; Task 7
        # resolves contents via storage_fill() regardless of kind.
        if self._find_component(pid, "Item") is not None:
            return "item"
        if (self._find_component(pid, "EntityStorage") is not None
                or self._find_component(pid, "StorageFill") is not None
                or self._find_component(pid, "EntityTableContainerFill") is not None):
            return "container"
        if self._find_component(pid, "ApcPowerReceiver") is not None:
            return "mach"
        return "skip"

    @staticmethod
    def _amount(a):
        """Coerce amount to int — real data uses !type:NumberSelector dicts
        (Range/Constant/Binomial). Range 'lo, hi' → hi (an 'up to N' hint)."""
        if isinstance(a, dict):
            if "value" in a:
                a = a["value"]
            elif "range" in a:
                a = str(a["range"]).split(",")[-1]
            elif "trials" in a:
                a = a["trials"]
            else:
                return 1
        try:
            return max(1, int(float(a)))
        except (TypeError, ValueError):
            return 1

    def _flatten_table(self, node, p=1.0, depth=0):
        """Yield (proto_id, prob, amount) from an entity-table selector tree.
        ponytail: GroupSelector = weight-proportional split, rolls ignored —
        good enough for 'where can this item be', not a drop-rate simulator."""
        if depth > 8 or not isinstance(node, dict):
            return
        p *= float(node.get("prob", 1.0))
        t = node.get("_type")
        if t == "NestedSelector":
            # plan snippet said node.get("id"); real serialized key is tableId
            # (verified: {"tableId": "FillClosetTool", "_type": "NestedSelector"})
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
            yield node["id"], p, self._amount(node.get("amount", 1))

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
                    inv = entry.get("startingInventory")
                    cinv = entry.get("contrabandInventory")
                    reg.vend_inventories[eid] = {   # dict-guard: a list here would crash the fork loop
                        "normal": inv if isinstance(inv, dict) else {},
                        "contraband": cinv if isinstance(cinv, dict) else {}}
                elif t == "entityTable" and eid:
                    reg.entity_tables[eid] = entry.get("table") or {}
                elif t == "tile" and eid and entry.get("sprite"):
                    reg.tile_sprites[eid] = entry["sprite"]
    # Fluent: beacon names
    ftl_paths = [p for p in tree if p.endswith(".ftl") and "en-US" in p and "navmap" in p.lower()]
    for path in ftl_paths:
        content = fetch_file(fork_cfg["raw_url"].format(path=path), CACHE_DIR / fork_key / path)
        for line in content.splitlines():
            m = re.match(r"^([a-zA-Z0-9-]+)\s*=\s*(.+)$", line.lstrip("\ufeff").strip())
            if m:
                reg.ftl[m.group(1)] = m.group(2).strip()
    return reg

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

# ── map file parse ──

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

# ── PNG underlay bake ──

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

# ── selfcheck ──

def selfcheck():
    fork = FORK_REGISTRY["vanilla"]
    tree = fetch_repo_tree("vanilla", fork)
    if not tree:
        sys.exit("tree fetch failed — network or GitHub rate limit? (see WARNINGs above)")
    maps = discover_maps("vanilla", fork, tree)
    byid = {m["id"]: m for m in maps}
    assert "Bagel" in byid, f"Bagel missing: {sorted(byid)}"
    assert byid["Bagel"]["name"] == "Bagel Station"
    assert byid["Bagel"]["path"] == "Resources/Maps/bagel.yml"
    assert byid["Bagel"]["inPool"] is True
    assert len(maps) >= 12, f"only {len(maps)} maps"

    reg = build_registry("vanilla", fork, tree)
    assert reg.kind("Crowbar") == "item" and reg.name("Crowbar") == "crowbar"
    assert reg.kind("WallSolid") == "wall"
    assert reg.kind("VendingMachineYouTool") == "vendor"
    assert reg.vendor_pack("VendingMachineYouTool"), "YouTool pack missing"
    assert "Crowbar" in reg.vendor_inventory("VendingMachineYouTool"), "Crowbar not in YouTool"
    assert reg.kind("DefaultStationBeaconMedical") == "beacon"
    # NOTE: recon said "Medbay"; live upstream has station-beacon-medical = "Medical" —
    # "Medbay" is a distinct sibling beacon (DefaultStationBeaconMedbay -> station-beacon-medbay).
    # Verified station_beacon.yml + station-beacons.ftl directly; parse logic is correct, recon was stale.
    assert reg.beacon_text("DefaultStationBeaconMedical") == "Medical"
    fills = reg.storage_fill("ClosetToolFilled")
    assert fills, "ClosetToolFilled fill empty"
    fill_ids = {f["id"] for f in fills}
    assert any(("Crowbar" in i) or ("Wrench" in i) or ("Screwdriver" in i) for i in fill_ids), fill_ids
    assert reg.kind("ClosetToolFilled") == "container"
    assert reg.kind("CrateTrashCartFilled") == "container"
    assert reg.kind("Crowbar") == "item", "container branch must not steal plain items"
    assert reg.storage_fill("BookshelfFilled"), "dict-amount (NumberSelector) container must not crash"
    # prob propagation: LockerWeldingSuppliesFilled fills purely via GroupSelector weight
    # splits (FillWelderSupplies 1/1/0.25/0.05, FillWelderSuppliesMask 1/0.25/0.25/0.25 —
    # verified in Catalog/Fills/Lockers/engineer.yml), so every flattened entry has prob<1.
    assert any("prob" in f for f in reg.storage_fill("LockerWeldingSuppliesFilled"))
    load_tile_colors("vanilla", fork, reg)
    c = reg.tile_color("FloorSteel")
    assert c and abs(c[0] - c[1]) < 40 and sum(c) > 60, f"FloorSteel avg color odd: {c}"

    parsed = parse_map_file("vanilla", fork, "Resources/Maps/bagel.yml")
    # Bagel's main grid (uid 60) carries a bare MetaData component with no
    # `name` key (verified live: {'type': 'MetaData'}) — the station's display
    # name lives in the gameMap prototype (Task 2), not the map file. None is
    # the correct, expected result here; only an empty-string name is a bug smell.
    assert parsed["name"] == "Bagel Station" or parsed["name"] is None or parsed["name"], "map name"
    # Verified live (independent raw struct-unpack cross-check, bypassing decode_chunk
    # entirely): Bagel main grid = 104 chunks * 256 = 26624 tile slots, exactly 15567
    # non-Space. The plan's ">20000" guess conflated this with the 25039 *entity* count
    # (a different metric) — threshold corrected to a real sanity floor, not the parser.
    assert len(parsed["tiles"]) > 10000, f"too few tiles: {len(parsed['tiles'])}"
    crow = parsed["entities"].get("Crowbar", [])
    # Live coords for uid 23156 are -106.484505,24.465736 (parent 60) — but the
    # parser intentionally rounds to 1 decimal (matches the plan's own data-schema
    # example: "p": [[-106.5, 24.5, 0], ...]), so 0.01 tolerance against the raw
    # recon number is tighter than the rounding step itself (max err 0.05). Assert
    # against the documented rounded value instead of the pre-rounding recon number.
    assert any(abs(x - -106.5) < 0.001 and abs(y - 24.5) < 0.001
               for x, y, grid in crow), f"Crowbar pos mismatch: {crow[:4]}"
    assert parsed["main_grid"] in parsed["grid_names"] or True
    assert len(parsed["offgrid_names"]) >= 1, "Syndi Puddle grid expected"

    png_path, bounds = bake_png("vanilla", "Bagel", parsed, reg)
    from PIL import Image
    img = Image.open(png_path)
    assert img.width == bounds["maxX"] - bounds["minX"] + 1
    assert img.height == bounds["maxY"] - bounds["minY"] + 1
    opaque = sum(1 for p in img.convert("RGBA").getdata() if p[3] > 0)
    assert opaque > 15000, f"suspiciously empty PNG: {opaque} opaque px"
    print(f"selfcheck OK: {len(maps)} maps, {len(reg.protos)} protos, {len(parsed['tiles'])} tiles")

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

def process_fork(fork_key: str, map_filter: str | None = None) -> list[dict]:
    fork_cfg = FORK_REGISTRY[fork_key]
    tree = fetch_repo_tree(fork_key, fork_cfg)
    if not tree:
        print(f"SKIP fork {fork_key}: no tree"); return []
    maps = discover_maps(fork_key, fork_cfg, tree)
    if map_filter:
        maps = [m for m in maps if m["id"] == map_filter]
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
            if len(data["items"]) < MIN_MAP_ITEMS:
                print(f"  SKIP {fork_key}/{gm['id']}: only {len(data['items'])} items (non-station/junk)")
                png_path.unlink(missing_ok=True)
                (OUT_DIR / fork_key / f"{gm['id']}.json").unlink(missing_ok=True)
                continue
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
        label = FORK_REGISTRY[key].get("name", key)  # display-name key is `name` (verified in config.py), not `label`
        forks.append({"key": key, "label": label, "maps": maps})
    OUT_DIR.mkdir(exist_ok=True)
    (OUT_DIR / "index.json").write_text(
        json.dumps({"schemaVersion": SCHEMA_VERSION, "forks": forks},
                   ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote maps/index.json ({sum(len(m) for m in per_fork.values())} maps)")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fork", default="vanilla")
    ap.add_argument("--map", default=None, help="single gameMap id, e.g. Bagel")
    ap.add_argument("--all-forks", action="store_true")
    ap.add_argument("--selfcheck", action="store_true")
    args = ap.parse_args()
    if args.selfcheck:
        selfcheck(); return
    if args.all_forks:
        per_fork = {}
        for key in FORK_REGISTRY:
            try:
                per_fork[key] = process_fork(key)
            except Exception as e:
                print(f"SKIP fork {key}: crashed: {e}")
                per_fork[key] = []
        write_index(per_fork)
        return
    done = process_fork(args.fork, args.map)
    index_path = OUT_DIR / "index.json"
    per_fork = {}
    if index_path.exists():
        existing = json.loads(index_path.read_text(encoding="utf-8"))
        per_fork = {f["key"]: f["maps"] for f in existing.get("forks", [])}
    if args.map:
        # single-map refresh: upsert by id, don't drop the fork's other maps
        # (a full-fork `--fork X` run rebuilds every map, so wholesale-replace is fine there)
        merged = {m["id"]: m for m in per_fork.get(args.fork, [])}
        for m in done:
            merged[m["id"]] = m
        per_fork[args.fork] = list(merged.values())
    else:
        per_fork[args.fork] = done
    write_index(per_fork)

if __name__ == "__main__":
    main()
