#!/usr/bin/env python3
"""Tactical map layer for marine forks: planet schemas painted like the in-game
tactical map, per-tile strike permissions, map labels, mechanic constants and
the fork's own in-game terms.

Spec: docs/design/2026-09-13-tactical-map.md
Decision: docs/decisions/2026-09-13_tactical-map.md

Every run pins one commit per fork and reads it from a sparse partial git clone in
cache_tactical/<fork>/repo: prototypes and locales first, then only the rotation
planets' map files. Nothing is read from cache_maps/ — that tree is a frozen snapshot.

MIRRORED SOURCES (RMC-14 57112b9, space-stories-cm14 024d853, verified 2026-09-13):
  Content.Shared/_RMC14/Mortar/MortarComponent.cs              -> MIRROR mortar range, dial, target, delays, jitter
  Content.Shared/_RMC14/Mortar/MortarShellComponent.cs         -> MIRROR mortar shell delays
  Content.Shared/_RMC14/Mortar/ActiveMortarShellComponent.cs   -> MIRROR mortar warning ranges
  Content.Shared/_RMC14/Mortar/SharedMortarSystem.cs           -> aim error floor(|target - mortar| / TilesPerOffset);
                                                                  the dial waits TargetDelay, not DialDelay
  Content.Server/_RMC14/Mortar/MortarSystem.cs                 -> fire-time checks, jitter after validation
  Content.Shared/_RMC14/OrbitalCannon/OrbitalCannonComponent.cs,
  Content.Shared/_RMC14/OrbitalCannon/OrbitalCannonFiringComponent.cs -> MIRROR OB timeline, cooldown, warnings
  Content.Shared/_RMC14/OrbitalCannon/OrbitalCannonSystem.cs   -> scatter (misfuel + 1) * Random.Next(-3, 3), wall redirect
  Content.Shared/_RMC14/CCVar/RMCCVars.cs                      -> MIRROR offsetVariance
  Content.Shared/_RMC14/Areas/AreaSystem.cs                    -> tactical map colour rule, IsRoofed geometry
  Content.Shared/_RMC14/Areas/AreaComponent.cs                 -> the Area fields a prototype may set
  Content.Shared/_RMC14/Rangefinder/RangefinderSystem.cs       -> floor(tile centre) + offset, no area requirement
  Content.Shared/_RMC14/Rules/RMCPlanetSystem.cs               -> offset roll
  Content.Shared/_RMC14/SupplyDrop/SharedSupplyDropSystem.cs   -> CanSupplyDrop + IsTileBlocked
  Content.Server/_RMC14/MapInsert/MapInsertSystem.cs           -> map insert selection loop (T10)
  Content.Shared/Physics/CollisionGroup.cs                     -> fixture layers that contain Impassable

Output: tactical/index.json and tactical/<fork>/<planet>.png|json (schema 1).

Run:
    python ss14_tactical.py                   # every tactical fork at its branch head
    python ss14_tactical.py --fork rmc14      # one fork; the other forks keep their index entries
    python ss14_tactical.py --planet lv624    # one planet; the other planets keep their entries
    python ss14_tactical.py --verify          # rebuild at the commits recorded in tactical/index.json
                                              # into a temporary directory and compare, writing nothing
"""
import argparse
import hashlib
import io
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from collections import Counter
from datetime import date
from pathlib import Path

import yaml
from PIL import Image

from config import FORK_REGISTRY
from ss14_map_extractor import decode_chunk

SCRIPT_DIR = Path(__file__).resolve().parent
CACHE_DIR = SCRIPT_DIR / "cache_tactical"
OUT_DIR = SCRIPT_DIR / "tactical"
SCHEMA = 1


class TacticalError(RuntimeError):
    pass


# ── forks ────────────────────────────────────────────────────────────────────

# `locale` is the language the fork's server shows in game; the page takes the
# fork's terms from it no matter which language the page itself is in.
TACTICAL_FORKS = {
    "rmc14": {"family": "rmc", "label": "RMC14", "locale": "en-US"},
    "stories_cm": {"family": "rmc", "label": "Space Stories", "locale": "ru-RU"},
}

RMC_CODE_FILES = [
    "Content.Shared/_RMC14/Mortar/MortarComponent.cs",
    "Content.Shared/_RMC14/Mortar/MortarShellComponent.cs",
    "Content.Shared/_RMC14/Mortar/ActiveMortarShellComponent.cs",
    "Content.Shared/_RMC14/Mortar/SharedMortarSystem.cs",
    "Content.Server/_RMC14/Mortar/MortarSystem.cs",
    "Content.Shared/_RMC14/OrbitalCannon/OrbitalCannonComponent.cs",
    "Content.Shared/_RMC14/OrbitalCannon/OrbitalCannonFiringComponent.cs",
    "Content.Shared/_RMC14/OrbitalCannon/OrbitalCannonSystem.cs",
    "Content.Shared/_RMC14/CCVar/RMCCVars.cs",
    "Content.Shared/_RMC14/Areas/AreaSystem.cs",
    "Content.Shared/_RMC14/Areas/AreaComponent.cs",
    "Content.Shared/_RMC14/Rangefinder/RangefinderSystem.cs",
    "Content.Shared/_RMC14/Rules/RMCPlanetSystem.cs",
    "Content.Shared/_RMC14/SupplyDrop/SharedSupplyDropSystem.cs",
    "Content.Server/_RMC14/MapInsert/MapInsertSystem.cs",
    "Content.Shared/Physics/CollisionGroup.cs",
]

FAMILIES = {
    "rmc": {
        "min_planets": 10,
        "planet_prefix": "RMCPlanet",
        "prototype_dir": "Resources/Prototypes",
        "locale_dirs": ["Resources/Locale/en-US/_RMC14", "Resources/Locale/ru-RU/_RMC14"],
        "code_files": RMC_CODE_FILES,
    },
}

# Blob SHAs of the formula files as last read by a person, shared across forks (a
# fork that carries the same blob needs no second reading). Any other blob in a
# build is listed under `review` in index.json and printed as REVIEW.
REVIEWED_BLOBS = {
    # RMC-14 57112b9, read 2026-09-13
    "Content.Shared/_RMC14/Mortar/MortarComponent.cs": ["a63ffb14f2fd63ac47ac7a6b4fad836a763d2963"],
    "Content.Shared/_RMC14/Mortar/MortarShellComponent.cs": ["60976acf6b2792ee0482a82d0cad75330c9d4fbd"],
    "Content.Shared/_RMC14/Mortar/ActiveMortarShellComponent.cs": ["7950b973a935bfa741cd85825b0ab07a9c2b0aff"],
    "Content.Shared/_RMC14/Mortar/SharedMortarSystem.cs": ["0ef236061699e74beadce1789195eb3b80fc62b4"],
    "Content.Server/_RMC14/Mortar/MortarSystem.cs": ["d77cfc500aa20ea79506b84179ba792a33e9d0b1"],
    "Content.Shared/_RMC14/OrbitalCannon/OrbitalCannonComponent.cs": ["78c0e36ccd02aaf403c9d2b805c7a67fc350ff46"],
    "Content.Shared/_RMC14/OrbitalCannon/OrbitalCannonFiringComponent.cs": ["a7d80a18de225d5a111118feed3eb954bbe7d346"],
    "Content.Shared/_RMC14/OrbitalCannon/OrbitalCannonSystem.cs": ["ee05e14a3b4e8afe034c64ce891063bf65c81204"],
    "Content.Shared/_RMC14/CCVar/RMCCVars.cs": ["1bb0939c7f6133ffc45181df398848cbc34c8f30"],
    "Content.Shared/_RMC14/Areas/AreaSystem.cs": ["efc6246ff3651ff169a721db6672a5df19a38858"],
    "Content.Shared/_RMC14/Areas/AreaComponent.cs": ["8671b4fc9de3a2b7f6c6162ecf0cab12b5fb80a8"],
    "Content.Shared/_RMC14/Rangefinder/RangefinderSystem.cs": ["cce01e9beee39007601288c826f8031db8934bd9"],
    "Content.Shared/_RMC14/Rules/RMCPlanetSystem.cs": ["8bb1fd10aa1b57c72d809ca77a43a283effd5fde"],
    "Content.Shared/_RMC14/SupplyDrop/SharedSupplyDropSystem.cs": ["04d64e0db51e82868fe0e5e7cd93b54ccccceed0"],
    "Content.Server/_RMC14/MapInsert/MapInsertSystem.cs": ["59675bf5a4d2d0f258341c8eaa4dd14568180db1"],
    "Content.Shared/Physics/CollisionGroup.cs": ["60fefd4c4faf0e35b7567027311e88e96eb9181f"],
}

# ── mirrored constants ───────────────────────────────────────────────────────

MIRROR = {
    "rmc": {
        "offsetVariance": 500,
        "mortar": {
            "minRange": 15, "maxRange": 65, "maxDial": 10, "maxTarget": 1000, "tilesPerOffset": 20,
            "jitter": [-1, 0, 0, 1],
            "targetDelay": 3.0, "deployDelay": 4.0, "loadDelay": 1.5,
            "travelDelay": 4.5, "impactWarningDelay": 2.5, "impactDelay": 4.5,
            "warnRange": 15, "impactWarnRange": 10,
        },
        "ob": {
            "scatter": [-3, 2],
            "cooldown": 500.0,
            "timeline": {"alert": 2.0, "beginFire": 6.0, "fire": 12.0, "warnOne": 16.0, "warnTwo": 20.0, "impact": 24.0},
            "warnRanges": [30, 25, 15],
        },
    },
}

_MORTAR = "Content.Shared/_RMC14/Mortar/MortarComponent.cs"
_SHELL = "Content.Shared/_RMC14/Mortar/MortarShellComponent.cs"
_ACTIVE = "Content.Shared/_RMC14/Mortar/ActiveMortarShellComponent.cs"
_CANNON = "Content.Shared/_RMC14/OrbitalCannon/OrbitalCannonComponent.cs"
_FIRING = "Content.Shared/_RMC14/OrbitalCannon/OrbitalCannonFiringComponent.cs"

# (file, C# field, path into the family mirror)
FIELD_CHECKS = [
    (_MORTAR, "MinimumRange", ("mortar", "minRange")),
    (_MORTAR, "MaximumRange", ("mortar", "maxRange")),
    (_MORTAR, "MaxDial", ("mortar", "maxDial")),
    (_MORTAR, "MaxTarget", ("mortar", "maxTarget")),
    (_MORTAR, "TilesPerOffset", ("mortar", "tilesPerOffset")),
    (_MORTAR, "FireRandomOffset", ("mortar", "jitter")),
    (_MORTAR, "TargetDelay", ("mortar", "targetDelay")),
    (_MORTAR, "DeployDelay", ("mortar", "deployDelay")),
    (_SHELL, "LoadDelay", ("mortar", "loadDelay")),
    (_SHELL, "TravelDelay", ("mortar", "travelDelay")),
    (_SHELL, "ImpactWarningDelay", ("mortar", "impactWarningDelay")),
    (_SHELL, "ImpactDelay", ("mortar", "impactDelay")),
    (_ACTIVE, "WarnRange", ("mortar", "warnRange")),
    (_ACTIVE, "ImpactWarnRange", ("mortar", "impactWarnRange")),
    (_CANNON, "FireCooldown", ("ob", "cooldown")),
    (_FIRING, "AlertDelay", ("ob", "timeline", "alert")),
    (_FIRING, "BeginFireDelay", ("ob", "timeline", "beginFire")),
    (_FIRING, "FireDelay", ("ob", "timeline", "fire")),
    (_FIRING, "WarnOneDelay", ("ob", "timeline", "warnOne")),
    (_FIRING, "WarnTwoDelay", ("ob", "timeline", "warnTwo")),
    (_FIRING, "ImpactDelay", ("ob", "timeline", "impact")),
    (_FIRING, "FirstWarningRange", ("ob", "warnRanges", 0)),
    (_FIRING, "SecondWarningRange", ("ob", "warnRanges", 1)),
    (_FIRING, "ThirdWarningRange", ("ob", "warnRanges", 2)),
]

# Roof structures a player can mark; ranges and flags are read from prototypes.
ROOFING_PROTOS = ["HiveCoreXeno", "HivePylonXeno"]
ROOF_FLAGS = [("canOrbitalBombard", "OB"), ("canCAS", "CAS"), ("canMortarFire", "mortarFire"),
              ("canMortarPlace", "mortarPlacement"), ("canSupplyDrop", "supplyDrop"), ("canLase", "lasing")]

# In-game strings the page shows, by fork locale.
TERM_KEYS = {
    "rangefinderLongitude": "rmc-rangefinder-longitude",
    "rangefinderLatitude": "rmc-rangefinder-latitude",
    "mortarTargetTitle": "rmc-mortar-target-title",
    "mortarTargetX": "rmc-mortar-target-x",
    "mortarTargetY": "rmc-mortar-target-y",
    "mortarTargetSet": "rmc-mortar-target-set",
    "mortarOffsetTitle": "rmc-mortar-offset-title",
    "mortarOffsetX": "rmc-mortar-offset-x",
    "mortarOffsetY": "rmc-mortar-offset-y",
    "mortarOffsetSet": "rmc-mortar-offset-set",
    "overwatchLongitude": "rmc-overwatch-console-longitude",
    "overwatchLatitude": "rmc-overwatch-console-latitude",
    "supplyLongitude": "ui-supply-drop-console-longitude",
    "supplyLatitude": "ui-supply-drop-console-latitude",
    "refuseTooFar": "rmc-mortar-target-too-far",
    "refuseTooClose": "rmc-mortar-target-too-close",
    "refuseCovered": "rmc-mortar-target-covered",
    "refuseLandingZone": "rmc-mortar-target-is-lz",
    "refuseNotArea": "rmc-mortar-target-not-area",
    "refuseDeployIndoors": "rmc-mortar-covered",
    "obProtected": "rmc-ob-target-protected",
    "obUnderground": "rmc-ob-target-underground",
    "supplyUnderground": "rmc-supply-drop-underground",
    "supplyBlocked": "rmc-supply-drop-blocked",
}

# Research snapshot of LV-624 (docs/design/2026-09-13-tactical-map.md, «Верификация»),
# checked only when the build runs at the same commit.
GOLDEN = {
    ("rmc14", "57112b967"): {"lv624": {"tiles": 38850, "areas": 75, "labels": 21,
                                        "flags": {"OB": 38850, "CAS": 19392, "mortarFire": 19381,
                                                  "mortarPlacement": 15982, "supplyDrop": 19381}}},
    ("stories_cm", "024d853a1"): {"lv624": {"tiles": 38850, "areas": 75, "labels": 21,
                                             "flags": {"OB": 38850, "CAS": 19392, "mortarFire": 19381,
                                                       "mortarPlacement": 15982, "supplyDrop": 19381}}},
}

FLAG_BITS = [("OB", 1), ("CAS", 2), ("mortarFire", 4), ("mortarPlacement", 8),
             ("supplyDrop", 16), ("landingZone", 32), ("lasing", 64)]
DEFAULT_TACMAP_COLOUR = (0x6C, 0x67, 0x67, 0xD8)   # AreaSystem.Update fallback
AREA_ALPHA = 127                                   # areaComp.MinimapColor.WithAlpha(0.5f)


# ── git checkout ─────────────────────────────────────────────────────────────

NETWORK_ERRORS = ("unable to access", "timed out", "could not fetch", "early EOF", "RPC failed",
                  "Could not resolve host", "Connection reset")


def run_git(args: list[str], cwd: Path | None = None, retries: int = 3) -> str:
    """Run git; commands that reach GitHub (a partial clone fetches blobs lazily, even on
    checkout) get `retries` more attempts on network errors. A transfer slower than
    1 KB/s for 60 s is abandoned instead of waiting out a 300 s connect timeout."""
    import time
    for attempt in range(retries + 1):
        proc = subprocess.run(["git", "-c", "core.longpaths=true", "-c", "http.lowSpeedLimit=1000",
                               "-c", "http.lowSpeedTime=60", *args], cwd=cwd,
                              capture_output=True, text=True, encoding="utf-8", errors="replace")
        if proc.returncode == 0:
            return proc.stdout
        err = proc.stderr.strip()
        if attempt < retries and any(s in err for s in NETWORK_ERRORS):
            wait = 15 * (attempt + 1)
            print(f"  git {args[0]}: network error, retry {attempt + 1}/{retries} in {wait}s", flush=True)
            time.sleep(wait)
            continue
        raise TacticalError(f"git {' '.join(args)} failed: {err[-600:]}")
    raise AssertionError("unreachable")


class Checkout:
    """A sparse partial clone of one fork, pinned to a single commit."""

    def __init__(self, fork_key: str):
        fconf = FORK_REGISTRY[fork_key]
        self.fork = fork_key
        self.repo = fconf["repo"]
        self.branch = fconf.get("branch", "master")
        self.dir = CACHE_DIR / fork_key / "repo"
        self.sha = ""
        self.date = ""

    def pin(self, sha: str | None = None) -> None:
        if not (self.dir / ".git").is_dir():
            self.dir.parent.mkdir(parents=True, exist_ok=True)
            print(f"  cloning {self.repo} (blobless, sparse)", flush=True)
            run_git(["clone", "-q", "--filter=blob:none", "--no-checkout", "--depth", "1",
                     "--branch", self.branch, f"https://github.com/{self.repo}.git", str(self.dir)])
        run_git(["fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", sha or self.branch], cwd=self.dir)
        self.sha = run_git(["rev-parse", "FETCH_HEAD"], cwd=self.dir).strip()
        if sha and not self.sha.startswith(sha):
            raise TacticalError(f"{self.fork}: asked for {sha}, fetched {self.sha}")
        self.date = run_git(["log", "-1", "--format=%cs", self.sha], cwd=self.dir).strip()
        print(f"  {self.fork} @ {self.sha[:9]} ({self.date})", flush=True)

    def checkout(self, patterns: list[str]) -> None:
        info = self.dir / ".git" / "info"
        info.mkdir(parents=True, exist_ok=True)
        (info / "sparse-checkout").write_text("\n".join(patterns) + "\n", encoding="utf-8")
        run_git(["config", "core.sparseCheckout", "true"], cwd=self.dir)
        run_git(["config", "core.sparseCheckoutCone", "false"], cwd=self.dir)
        run_git(["checkout", "-q", "--force", "--detach", self.sha], cwd=self.dir)
        run_git(["read-tree", "-mu", "HEAD"], cwd=self.dir)   # re-apply a changed pattern list

    def read(self, path: str) -> str:
        p = self.dir / path
        if not p.is_file():
            raise TacticalError(f"{self.fork}: {path} is missing at {self.sha[:9]}")
        return p.read_text(encoding="utf-8-sig")

    def files(self, prefix: str, suffix: str) -> list[str]:
        root = self.dir / prefix
        if not root.is_dir():
            return []
        return sorted(p.relative_to(self.dir).as_posix() for p in root.rglob(f"*{suffix}") if p.is_file())

    def blob(self, path: str) -> str:
        return run_git(["rev-parse", f"{self.sha}:{path}"], cwd=self.dir).strip()


# ── YAML and prototypes ──────────────────────────────────────────────────────

class _Loader(getattr(yaml, "CSafeLoader", yaml.SafeLoader)):
    pass


def _tagged(loader, suffix, node):
    if isinstance(node, yaml.MappingNode):
        data = loader.construct_mapping(node, deep=True)
        data["_type"] = suffix
        return data
    if isinstance(node, yaml.SequenceNode):
        return {"_type": suffix, "_items": loader.construct_sequence(node, deep=True)}
    return {"_type": suffix, "_value": loader.construct_scalar(node)}


_Loader.add_multi_constructor("!", _tagged)


class Protos:
    """Entity and tile prototypes with parent chains."""

    def __init__(self):
        self.ents: dict[str, dict] = {}
        self.tiles: dict[str, dict] = {}
        self.errors: list[str] = []

    def load_dir(self, co: Checkout, prefix: str) -> None:
        for path in co.files(prefix, ".yml"):
            try:
                docs = list(yaml.load_all(co.read(path), Loader=_Loader))
            except yaml.YAMLError as e:
                self.errors.append(f"{path}: {str(e).splitlines()[0]}")
                continue
            for doc in docs:
                if not isinstance(doc, list):
                    continue
                for p in doc:
                    if not isinstance(p, dict) or "id" not in p:
                        continue
                    kind = p.get("type")
                    if kind == "entity":
                        self.ents[str(p["id"])] = p
                    elif kind == "tile":
                        self.tiles[str(p["id"])] = p

    @staticmethod
    def _parents(p: dict) -> list[str]:
        v = p.get("parent")
        if isinstance(v, list):
            return [str(x) for x in v]
        return [str(v)] if v else []

    def chain(self, table: dict, pid: str) -> list[dict]:
        """The prototype, then its parents depth-first in declaration order."""
        out, seen = [], set()

        def walk(x: str) -> None:
            if x in seen:
                return
            if x not in table:
                raise TacticalError(f"prototype {x!r} is missing (chain of {pid!r})")
            seen.add(x)
            out.append(table[x])
            for par in self._parents(table[x]):
                walk(par)

        walk(pid)
        return out

    def comp(self, pid: str, ctype: str) -> dict | None:
        for p in self.chain(self.ents, pid):
            for c in p.get("components") or []:
                if isinstance(c, dict) and c.get("type") == ctype:
                    return c
        return None

    def comp_field(self, pid: str, ctype: str, key: str, default=None):
        """Nearest definition of one component field (a child's list replaces the parent's)."""
        for p in self.chain(self.ents, pid):
            for c in p.get("components") or []:
                if isinstance(c, dict) and c.get("type") == ctype and key in c:
                    return c[key]
        return default

    def area_fields(self, pid: str) -> dict:
        """Area component fields merged field by field, the nearest prototype winning."""
        out: dict = {}
        for p in reversed(self.chain(self.ents, pid)):
            for c in p.get("components") or []:
                if isinstance(c, dict) and c.get("type") == "Area":
                    out.update({k: v for k, v in c.items() if k != "type"})
        return out

    def name(self, pid: str) -> str:
        for p in self.chain(self.ents, pid):
            if p.get("name"):
                return str(p["name"])
        return pid

    def tile_field(self, tid: str, key: str):
        for p in self.chain(self.tiles, tid):
            if key in p:
                return p[key]
        return None


# ── C# and locale readers ────────────────────────────────────────────────────

def cs_field(text: str, name: str, path: str):
    m = re.search(rf"\b{name}\s*=\s*([^;]+);", text)
    if not m:
        raise TacticalError(f"{path}: field {name} not found")
    expr = m.group(1).strip()
    if t := re.fullmatch(r"TimeSpan\.FromSeconds\(\s*(-?\d+(?:\.\d+)?)f?\s*\)", expr):
        return float(t.group(1))
    if t := re.fullmatch(r"(?:new(?:\s*int)?\s*\[\s*\]\s*\{|\[)([^}\]]*)[}\]]", expr):
        return [int(v) for v in t.group(1).split(",") if v.strip()]
    if t := re.fullmatch(r"(-?\d+)", expr):
        return int(t.group(1))
    if t := re.fullmatch(r"(-?\d+\.\d+)f?", expr):
        return float(t.group(1))
    raise TacticalError(f"{path}: field {name} has an unparsed value {expr!r}")


def mirror_get(mirror: dict, key_path: tuple):
    v = mirror
    for k in key_path:
        v = v[k]
    return v


def check_constants(co: Checkout, family: str) -> dict:
    mirror = MIRROR[family]
    texts: dict[str, str] = {}
    mismatches = []
    for path, field, key_path in FIELD_CHECKS:
        text = texts.setdefault(path, co.read(path))
        actual, expected = cs_field(text, field, path), mirror_get(mirror, key_path)
        same = (actual == expected) if isinstance(expected, list) else math.isclose(float(actual), float(expected))
        if not same:
            mismatches.append(f"{path} {field} = {actual!r}, mirror {'.'.join(map(str, key_path))} = {expected!r}")
    cvars = co.read("Content.Shared/_RMC14/CCVar/RMCCVars.cs")
    m = re.search(r'CVarDef\.Create\(\s*"rmc\.planet_coordinate_variance"\s*,\s*(\d+)', cvars)
    if not m:
        mismatches.append("rmc.planet_coordinate_variance not found in RMCCVars.cs")
    elif int(m.group(1)) != mirror["offsetVariance"]:
        mismatches.append(f"rmc.planet_coordinate_variance = {m.group(1)}, mirror {mirror['offsetVariance']}")
    if mismatches:
        raise TacticalError(f"{co.fork}: mirrored constants differ from the code:\n    " + "\n    ".join(mismatches))
    return json.loads(json.dumps(mirror))   # deep copy


def impassable_layers(text: str) -> set[str]:
    """CollisionGroup members whose bits include Impassable."""
    body = text[text.index("enum CollisionGroup"):]
    body = body[body.index("{") + 1:body.index("}")]
    bits: dict[str, int] = {}
    for line in body.splitlines():
        line = line.split("//")[0].strip().rstrip(",")
        m = re.fullmatch(r"(\w+)\s*=\s*(.+)", line)
        if not m:
            continue
        name, expr = m.group(1), m.group(2).strip()
        if t := re.fullmatch(r"1\s*<<\s*(\d+)", expr):
            bits[name] = 1 << int(t.group(1))
        elif re.fullmatch(r"-?\d+", expr):
            bits[name] = int(expr)
        elif re.fullmatch(r"\w+(\s*\|\s*\w+)*", expr):
            parts = [p.strip() for p in expr.split("|")]
            if all(p in bits for p in parts):
                value = 0
                for p in parts:
                    value |= bits[p]
                bits[name] = value
    if "Impassable" not in bits:
        raise TacticalError("CollisionGroup.cs: Impassable not found")
    imp = bits["Impassable"]
    return {n for n, v in bits.items() if v > 0 and v & imp}


def area_component_keys(text: str) -> set[str]:
    keys = set()
    for m in re.finditer(r"\[DataField(?:\(\s*\"(\w+)\"[^)]*\))?[^\]]*\]\s*(?:\[[^\]]*\]\s*)*public\s+[\w<>?,\s\[\]]+?\s+(\w+)\s*[;={]", text):
        keys.add(m.group(1) or (m.group(2)[0].lower() + m.group(2)[1:]))
    return keys


def parse_ftl(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    key = None
    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        m = re.match(r"^([A-Za-z][\w-]*)\s*=\s*(.*)$", line)
        if m:
            key = m.group(1)
            out[key] = m.group(2).strip()
        elif key and line[:1] in (" ", "\t"):
            out[key] = f"{out[key]} {line.strip()}".strip()
    return out


def clean_term(value: str) -> str:
    value = re.sub(r"\[/?[A-Za-z]+(?:[= ][^\]]*)?\]", "", value)
    value = re.sub(r"\{[^}]*\}", "", value)
    return re.sub(r"\s+", " ", value).strip(" ,:")


def read_terms(co: Checkout, family: str, locale: str) -> dict[str, str]:
    tables: dict[str, dict[str, str]] = {}
    for d in FAMILIES[family]["locale_dirs"]:
        loc = d.split("/")[2]
        table = tables.setdefault(loc, {})
        for path in co.files(d, ".ftl"):
            table.update(parse_ftl(co.read(path)))
    terms, missing = {}, []
    for name, key in TERM_KEYS.items():
        value = tables.get(locale, {}).get(key) or tables.get("en-US", {}).get(key)
        if value is None:
            missing.append(key)
        else:
            terms[name] = clean_term(value)
    if missing:
        print(f"  WARNING {co.fork}: no locale string for {', '.join(missing)}", flush=True)
    return terms


# ── planets and maps ─────────────────────────────────────────────────────────

def discover_planets(protos: Protos, family: str) -> list[dict]:
    prefix = FAMILIES[family]["planet_prefix"]
    planets = []
    for pid, proto in protos.ents.items():
        comp = next((c for c in proto.get("components") or []
                     if isinstance(c, dict) and c.get("type") == "RMCPlanetMapPrototype"), None)
        if comp is None or comp.get("inRotation", True) is False:
            continue
        map_path = str(comp.get("map") or "")
        if not map_path.startswith("/Maps/"):
            raise TacticalError(f"{pid}: unexpected map path {map_path!r}")
        planets.append({
            "id": (pid[len(prefix):] if pid.startswith(prefix) else pid).lower(),
            "proto": pid,
            "name": protos.name(pid),
            "map": "Resources" + map_path,
            "minPlayers": int(comp.get("minPlayers") or 0),
            "maxPlayers": int(comp.get("maxPlayers") or 0),
            "scenarios": [{"name": str(s.get("scenarioName")), "p": float(s.get("scenarioProbability") or 0)}
                          for s in comp.get("nightmareScenarios") or []],
        })
    ids = [p["id"] for p in planets]
    if len(set(ids)) != len(ids):
        raise TacticalError(f"duplicate planet ids: {ids}")
    return planets


def parse_map(text: str, path: str) -> dict:
    try:
        doc = next(iter(yaml.load_all(text, Loader=_Loader)))
    except (yaml.YAMLError, StopIteration) as e:
        raise TacticalError(f"{path}: {e}") from e
    tilemap = {int(k): str(v) for k, v in (doc.get("tilemap") or {}).items()}
    grids: dict[int, dict] = {}
    area_grids: list[tuple[int, dict]] = []
    ents: list[dict] = []
    for group in doc.get("entities") or []:
        proto = str(group.get("proto") or "")
        for ent in group.get("entities") or []:
            comps = {c["type"]: c for c in ent.get("components") or [] if isinstance(c, dict) and "type" in c}
            if "AreaGrid" in comps:
                area_grids.append((ent["uid"], comps["AreaGrid"]))
            if "MapGrid" in comps:
                tiles = {}
                for key, chunk in (comps["MapGrid"].get("chunks") or {}).items():
                    cx, cy = map(int, str(chunk.get("ind", key)).split(","))
                    decoded = 0
                    for i, tid in decode_chunk(chunk["tiles"]):
                        decoded += 1
                        if tid not in tilemap:
                            raise TacticalError(f"{path}: tile id {tid} is not in the tilemap")
                        # Tile ids are per map: Sorokyne maps 0 to CMFloorPlating and Space to 2.
                        if tilemap[tid] == "Space":
                            continue
                        tiles[(cx * 16 + i % 16, cy * 16 + i // 16)] = tilemap[tid]
                    if decoded != 256:
                        raise TacticalError(f"{path}: chunk {key} decoded {decoded}/256 tiles (format drift?)")
                grids[ent["uid"]] = tiles
                continue
            tr = comps.get("Transform") or {}
            if not proto or "pos" not in tr:
                continue
            x, y = (float(v) for v in str(tr["pos"]).split(","))
            ents.append({"proto": proto, "x": x, "y": y, "parent": tr.get("parent"),
                         "anchored": tr.get("anchored"), "name": (comps.get("MetaData") or {}).get("name")})
    if not grids:
        raise TacticalError(f"{path}: no MapGrid")
    main = max(grids, key=lambda uid: len(grids[uid]))
    chosen = [ag for uid, ag in area_grids if uid == main] or [ag for _, ag in area_grids]
    if len(chosen) != 1:
        raise TacticalError(f"{path}: expected one AreaGrid, found {len(chosen)}")
    areas = {tuple(map(int, str(k).split(","))): str(v) for k, v in (chosen[0].get("areas") or {}).items()}
    if not areas:
        raise TacticalError(f"{path}: the AreaGrid has no areas")
    return {"tiles": grids[main], "areas": areas, "entities": [e for e in ents if e["parent"] == main]}


def parse_colour(value) -> tuple[int, int, int, int] | None:
    if value is None:
        return None
    h = str(value).strip().lstrip("#")
    if len(h) == 6:
        h += "FF"
    if not re.fullmatch(r"[0-9A-Fa-f]{8}", h):
        raise TacticalError(f"unparseable colour {value!r}")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4, 6))


def rle_rows(width: int, height: int, value_at) -> list[list[int]]:
    rows = []
    for row in range(height):
        out, prev, run = [], value_at(0, row), 0
        for col in range(width):
            v = value_at(col, row)
            if v == prev:
                run += 1
            else:
                out += [prev, run]
                prev, run = v, 1
        rows.append(out + [prev, run])
    return rows


def build_planet(fork: str, planet: dict, parsed: dict, protos: Protos, impassable: set[str],
                 area_keys: set[str]) -> tuple[dict, bytes, dict]:
    tiles, areas = parsed["tiles"], parsed["areas"]
    xs = [t[0] for t in tiles]
    ys = [t[1] for t in tiles]
    min_x, max_x, min_y, max_y = min(xs), max(xs), min(ys), max(ys)
    width, height = max_x - min_x + 1, max_y - min_y + 1

    ent_info: dict[str, dict | None] = {}
    unknown = Counter()

    def info(proto: str) -> dict | None:
        if proto not in ent_info:
            try:
                colour_comp = protos.comp(proto, "MinimapColor")
                fixtures = protos.comp_field(proto, "Fixtures", "fixtures") or {}
                ent_info[proto] = {
                    "anchored": bool(protos.comp_field(proto, "Transform", "anchored", False)),
                    "colour": parse_colour(colour_comp.get("color")) if colour_comp else None,
                    "wall": "Wall" in (protos.comp_field(proto, "Tag", "tags") or [])
                            and protos.comp(proto, "Damageable") is None,
                    "blocks": any(isinstance(fx, dict) and fx.get("hard", True) is not False
                                  and impassable & set(fx.get("layer") or [])
                                  for fx in (fixtures.values() if isinstance(fixtures, dict) else [])),
                    "label": protos.comp(proto, "AreaLabel") is not None,
                }
            except TacticalError:
                ent_info[proto] = None
        return ent_info[proto]

    entity_colour: dict[tuple[int, int], tuple] = {}
    hard_wall: set[tuple[int, int]] = set()
    blocked: set[tuple[int, int]] = set()
    labels = []
    for e in parsed["entities"]:
        inf = info(e["proto"])
        if inf is None:
            unknown[e["proto"]] += 1
            continue
        if inf["label"]:
            labels.append([str(e["name"] or protos.name(e["proto"])), round(e["x"], 2), round(e["y"], 2)])
        anchored = inf["anchored"] if e["anchored"] is None else bool(e["anchored"])
        if not anchored:
            continue
        tile = (math.floor(e["x"]), math.floor(e["y"]))
        if tile not in tiles:
            continue
        if inf["colour"] is not None:
            entity_colour[tile] = inf["colour"]   # the last anchored MinimapColor wins
        if inf["wall"]:
            hard_wall.add(tile)
        if inf["blocks"]:
            blocked.add(tile)
    if unknown:
        top = ", ".join(f"{p}×{n}" for p, n in unknown.most_common(6))
        print(f"    WARNING {planet['id']}: {len(unknown)} entity prototypes not loaded ({top})", flush=True)

    tile_colour = {}
    for tid in sorted(set(tiles.values())):
        if tid not in protos.tiles:
            raise TacticalError(f"{planet['id']}: tile prototype {tid!r} is missing")
        tile_colour[tid] = parse_colour(protos.tile_field(tid, "minimapColor"))

    area_ids = sorted(set(areas.values()))
    area_rows, flag_of, unknown_keys = [], {}, set()
    for aid in area_ids:
        fields = protos.area_fields(aid)
        unknown_keys |= set(fields) - area_keys
        flags = sum(bit for key, bit in FLAG_BITS if fields.get(key))
        colour = parse_colour(fields.get("minimapColor"))
        flag_of[aid] = flags
        area_rows.append([aid, protos.name(aid),
                          None if colour is None else "#%02x%02x%02x%02x" % colour, flags])
    if unknown_keys:
        print(f"    note {planet['id']}: Area keys the component does not declare: {sorted(unknown_keys)}", flush=True)
    area_colour = {row[0]: parse_colour(row[2]) for row in area_rows}
    index = {aid: i + 1 for i, aid in enumerate(area_ids)}

    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    px = img.load()
    for (x, y), tid in tiles.items():
        colour = entity_colour.get((x, y)) or tile_colour[tid]
        if colour is None:
            ac = area_colour.get(areas.get((x, y)))
            colour = (ac[0], ac[1], ac[2], AREA_ALPHA) if ac else DEFAULT_TACMAP_COLOUR
        px[x - min_x, max_y - y] = colour
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    png = buf.getvalue()

    def tile_at(col: int, row: int) -> tuple[int, int]:
        return min_x + col, max_y - row

    grid = rle_rows(width, height, lambda c, r: index.get(areas.get(tile_at(c, r)), 0)
                    if tile_at(c, r) in tiles else 0)
    masks = {
        "blocked": rle_rows(width, height, lambda c, r: 1 if tile_at(c, r) in blocked else 0),
        "hardWall": rle_rows(width, height, lambda c, r: 1 if tile_at(c, r) in hard_wall else 0),
    }
    labels.sort(key=lambda l: (l[0], l[1], l[2]))
    data = {
        "schemaVersion": SCHEMA,
        "fork": fork,
        "planet": planet["id"],
        "level": 0,
        "bounds": {"minX": min_x, "minY": min_y, "maxX": max_x, "maxY": max_y},
        "areas": area_rows,
        "grid": grid,
        "masks": masks,
        "labels": labels,
    }
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    data["h"] = hashlib.sha1(body + png).hexdigest()[:12]

    on_tile = [areas[t] for t in tiles if t in areas]
    stats = {
        "tiles": len(tiles),
        "areas": len(area_ids),
        "labels": len(labels),
        "flags": {key: sum(1 for a in on_tile if flag_of[a] & bit) for key, bit in FLAG_BITS if key != "lasing"},
        "blocked": len(blocked),
        "hardWall": len(hard_wall),
        "size": [width, height],
    }
    return data, png, stats


def roofing(protos: Protos) -> list[dict]:
    out = []
    for proto in ROOFING_PROTOS:
        comp = protos.comp(proto, "RoofingEntity")
        if comp is None:
            raise TacticalError(f"{proto}: no RoofingEntity")
        out.append({"proto": proto, "range": float(comp["range"]),
                    "allows": [flag for key, flag in ROOF_FLAGS if protos.comp_field(proto, "RoofingEntity", key)]})
    return out


def review_list(co: Checkout, family: str) -> list[dict]:
    out = []
    for path in FAMILIES[family]["code_files"]:
        blob = co.blob(path)
        if blob not in REVIEWED_BLOBS.get(path, []):
            out.append({"path": path, "blob": blob})
    return out


# ── build ────────────────────────────────────────────────────────────────────

def build_fork(fork: str, out_dir: Path, only_planet: str | None = None, sha: str | None = None,
               previous: dict | None = None) -> dict:
    cfg = TACTICAL_FORKS[fork]
    family = FAMILIES[cfg["family"]]
    print(f"[{fork}]", flush=True)
    co = Checkout(fork)
    co.pin(sha)
    base = [f"/{family['prototype_dir']}/"] + [f"/{d}/" for d in family["locale_dirs"]] \
        + [f"/{p}" for p in family["code_files"]]
    co.checkout(base)

    protos = Protos()
    protos.load_dir(co, family["prototype_dir"])
    print(f"  prototypes: {len(protos.ents)} entities, {len(protos.tiles)} tiles", flush=True)
    if protos.errors:
        print(f"  WARNING: {len(protos.errors)} prototype files failed to parse, first: {protos.errors[0]}", flush=True)

    planets = discover_planets(protos, cfg["family"])
    if len(planets) < family["min_planets"]:
        raise TacticalError(f"{fork}: {len(planets)} rotation planets, expected at least {family['min_planets']}")
    if only_planet:
        planets = [p for p in planets if p["id"] == only_planet]
        if not planets:
            raise TacticalError(f"{fork}: no rotation planet {only_planet!r}")
    co.checkout(base + [f"/{p['map']}" for p in planets])

    impassable = impassable_layers(co.read("Content.Shared/Physics/CollisionGroup.cs"))
    area_keys = area_component_keys(co.read("Content.Shared/_RMC14/Areas/AreaComponent.cs"))
    constants = check_constants(co, cfg["family"])
    constants["roofing"] = roofing(protos)
    terms = read_terms(co, cfg["family"], cfg["locale"])
    review = review_list(co, cfg["family"])

    fork_dir = out_dir / fork
    fork_dir.mkdir(parents=True, exist_ok=True)
    golden = GOLDEN.get((fork, co.sha[:9]), {})
    entries = {p["id"]: p for p in (previous or {}).get("planets", [])} if only_planet else {}
    for planet in planets:
        print(f"  {planet['id']}: {planet['map']}", flush=True)
        parsed = parse_map(co.read(planet["map"]), planet["map"])
        data, png, stats = build_planet(fork, planet, parsed, protos, impassable, area_keys)
        (fork_dir / f"{planet['id']}.png").write_bytes(png)
        (fork_dir / f"{planet['id']}.json").write_text(
            json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        print(f"    {stats['size'][0]}x{stats['size'][1]} tiles={stats['tiles']} areas={stats['areas']} "
              f"labels={stats['labels']} blocked={stats['blocked']} hardWall={stats['hardWall']} "
              f"flags={stats['flags']} png={len(png)}B h={data['h']}", flush=True)
        expected = golden.get(planet["id"])
        if expected:
            got = {k: ({f: stats[k][f] for f in expected[k]} if isinstance(expected[k], dict) else stats[k])
                   for k in expected}
            if got != expected:
                raise TacticalError(f"{fork}/{planet['id']}: golden mismatch\n    expected {expected}\n    got      {got}")
            print("    golden ok", flush=True)
        entries[planet["id"]] = {
            "id": planet["id"], "proto": planet["proto"], "name": planet["name"],
            "file": f"{fork}/{planet['id']}", "h": data["h"], "inRotation": True,
            "minPlayers": planet["minPlayers"], "maxPlayers": planet["maxPlayers"],
            "levels": [0], "scenarios": planet["scenarios"],
        }
    order = [p["id"] for p in discover_planets(protos, cfg["family"])]
    for r in review:
        print(f"  REVIEW {r['path']} blob {r['blob'][:12]}", flush=True)
    return {
        "key": fork, "label": cfg["label"], "family": cfg["family"], "locale": cfg["locale"],
        "source": {"sha": co.sha, "date": co.date},
        "constants": constants, "terms": terms, "review": review,
        "planets": [entries[i] for i in order if i in entries],
    }


def load_index(out_dir: Path = OUT_DIR) -> dict | None:
    path = out_dir / "index.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None


def write_index(index: dict, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    order = list(TACTICAL_FORKS)
    index["forks"].sort(key=lambda f: order.index(f["key"]))
    (out_dir / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def build(forks: list[str], only_planet: str | None) -> None:
    index = load_index() or {"schemaVersion": SCHEMA, "built": "", "forks": []}
    by_key = {f["key"]: f for f in index["forks"]}
    for fork in forks:
        by_key[fork] = build_fork(fork, OUT_DIR, only_planet, previous=by_key.get(fork))
        # Written after every fork: a later fork's network failure keeps this one usable.
        write_index({"schemaVersion": SCHEMA, "built": date.today().isoformat(), "forks": list(by_key.values())}, OUT_DIR)
        print(f"wrote {OUT_DIR / 'index.json'} ({fork})", flush=True)


def verify() -> int:
    index = load_index()
    if index is None:
        print("no tactical/index.json to verify")
        return 1
    tmp = Path(tempfile.mkdtemp(prefix="tactical-verify-"))
    problems = []
    try:
        for old in index["forks"]:
            new = build_fork(old["key"], tmp, sha=old["source"]["sha"])
            for key in ("family", "locale", "source", "constants", "terms", "planets"):
                if old.get(key) != new.get(key):
                    problems.append(f"{old['key']}: index field {key!r} differs")
            for planet in new["planets"]:
                for ext in ("json", "png"):
                    a, b = OUT_DIR / f"{planet['file']}.{ext}", tmp / f"{planet['file']}.{ext}"
                    if not a.is_file() or a.read_bytes() != b.read_bytes():
                        problems.append(f"{planet['file']}.{ext} differs from a rebuild at {old['source']['sha'][:9]}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    for p in problems:
        print(f"  MISMATCH {p}")
    print("verify: OK" if not problems else f"verify: {len(problems)} mismatches")
    return 0 if not problems else 1


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8", errors="replace")   # Windows consoles default to cp1251
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--fork", choices=sorted(TACTICAL_FORKS))
    ap.add_argument("--planet", help="planet id, e.g. lv624")
    ap.add_argument("--verify", action="store_true", help="rebuild at the recorded commits and compare, writing nothing")
    args = ap.parse_args()
    try:
        if args.verify:
            return verify()
        build([args.fork] if args.fork else list(TACTICAL_FORKS), args.planet)
        return 0
    except TacticalError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
