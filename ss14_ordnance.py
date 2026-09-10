#!/usr/bin/env python3
"""Ordnance layer: explosion stats for CM-style ammunition casings.

Mirrors the Stories-CM14 ordnance subsystem so the site can compute what a given
reagent mixture does when a casing detonates. Everything here is derived from
prototype data plus a small set of C# constants that are mirrored explicitly
(see MIRRORED SOURCES below) — no hand-curated per-recipe numbers.

MIRRORED SOURCES (space-stories-cm14, verified 2026-09-10):
  Content.Server/_Stories/Ordnance/Explosion/OrdnanceExplosionSystem.cs
      CalculateExplosionStats  -> compute_stats()
      GetEngineExplosionParams -> engine_params()
  Content.Shared/_Stories/Chemistry/Effects/{Explosive,Flowing,Fueling,
      Oxidizing,Viscous}.cs -> EFFECT_MODIFIERS
  Content.Shared/_Stories/Ordnance/OrdnanceCasingComponent.cs -> CASING_DEFAULTS

Output: ordnance/<fork>.json (schema 1).

Run standalone:
    python ss14_ordnance.py            # build every fork that declares "ordnance"
    python ss14_ordnance.py --verify   # build, then check the reference mixtures
"""

import json
import os
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
OUT_DIR = SCRIPT_DIR / "ordnance"
SCHEMA = 1

# ── Mirrored C# constants ────────────────────────────────────────────────────

# IExplosionModifierEffect implementations. Each entry maps an effect class to
# the per-(quantity x potency) deltas it applies. Keys: power, falloff,
# intensity, duration, radius.
EFFECT_MODIFIERS = {
    "Explosive": {"power": 1.0, "falloff": -0.1},
    "Oxidizing": {"intensity": 0.2, "duration": -0.1, "radius": -0.01},
    "Fueling": {"intensity": -0.1, "duration": 0.2, "radius": 0.01},
    "Flowing": {"intensity": -0.05, "duration": -0.05, "radius": 0.05},
    "Viscous": {"radius": -0.025},
}

# OrdnanceCasingComponent field defaults, used when a casing prototype leaves a
# field unset anywhere in its parent chain.
CASING_DEFAULTS = {
    "vol": 1000.0,
    "base": 75.0,
    "minF": 25.0,
    "maxP": 175.0,
    "shards": 8,
    "fi": [3.0, 20.0],
    "fd": [3.0, 24.0],
    "fr": [1.0, 5.0],
    "star": True,
    "cone": 60.0,
    "dualCone": None,
    "mode": "Any",
    "fuel": None,
    "fuelAmount": 60.0,
}

# ExecuteExplosion: star fire lines replace the diamond above this intensity.
STAR_INTENSITY = 30.0
# CalculateExplosionStats: iron -> shrapnel conversion.
SHARDS_PER_UNIT = 0.25
# GetEngineExplosionParams: maxIntensity = power / 5, slope = falloff / 5.
INTENSITY_DIVISOR = 5.0
MIN_SLOPE = 0.1

# Casing YAML field name -> our short key.
_CASING_FIELDS = {
    "maxVolume": "vol",
    "baseFalloff": "base",
    "minFalloff": "minF",
    "maxExplosionPower": "maxP",
    "maxShards": "shards",
    "allowStarShape": "star",
    "coneAngle": "cone",
    "dualIgniterConeAngle": "dualCone",
    "requiredAssemblyMode": "mode",
    "requiredFuelReagent": "fuel",
    "requiredFuelAmount": "fuelAmount",
    "ironReagent": "iron",
    "useDirection": "useDirection",
    "signallerDelay": "signallerDelay",
}
_CASING_RANGE_FIELDS = {
    "minFireIntensity": ("fi", 0), "maxFireIntensity": ("fi", 1),
    "minFireDuration": ("fd", 0), "maxFireDuration": ("fd", 1),
    "minFireRadius": ("fr", 0), "maxFireRadius": ("fr", 1),
}

# Reagent YAML field name -> our short key. Everything is optional; absence and
# an explicit 0 mean different things during parent resolution, so presence is
# tracked separately.
_REAGENT_NUM_FIELDS = {
    "power": "power",
    "falloffModifier": "falloff",
    "intensityMod": "i",
    "durationMod": "d",
    "radiusMod": "r",
    "burncolormod": "colorWeight",
}
_REAGENT_BOOL_FIELDS = {
    "explosive": "explosive",
    "firePenetrating": "penetrating",
    "fireSpread": "spread",
    "abstract": "abstract",
}
_REAGENT_STR_FIELDS = {
    "burnColor": "color",
    "fireEntity": "fireEntity",
    "name": "nameKey",
    "group": "group",
}


# ── YAML-ish block parsing ───────────────────────────────────────────────────
# The prototype files are large and only a handful of scalar fields matter, so
# blocks are scanned with regexes rather than loaded through PyYAML. This keeps
# the !type: tags (which need custom loader hooks) out of the picture entirely.

_NUM = r"(-?\d+(?:\.\d+)?)"


def _split_prototypes(text: str, kind: str) -> list[str]:
    text = text.replace("\r\n", "\n").lstrip("﻿")
    blocks = re.split(r"\n(?=- type:\s)", text)
    # Upstream freely appends "#TODO ..." to the type line, so the comment has
    # to be tolerated here — RMCIron and RMCEthanol are both declared that way.
    head = re.compile(r"\s*- type:\s*" + kind + r"\s*(?:#.*)?$")
    return [b for b in blocks if head.match(b.split("\n")[0])]


def _top_field(block: str, key: str, pattern: str):
    m = re.search(r"^\s{2}" + re.escape(key) + r":\s*" + pattern, block, re.M)
    return m.group(1) if m else None


def _scalar_field(block: str, key: str):
    """A top-level scalar, quote- and comment-aware.

    Colours are written as "#ffb300", so a naive "strip everything after #"
    rule silently turns every burnColor into an empty string.
    """
    m = re.search(r"^\s{2}" + re.escape(key) + r":\s*(.+?)\s*$", block, re.M)
    if not m:
        return None
    raw = m.group(1)
    if raw.startswith('"'):
        end = raw.find('"', 1)
        return raw[1:end] if end > 0 else raw[1:]
    return re.split(r"\s+#", raw, maxsplit=1)[0].strip()


def _parents(block: str) -> list[str]:
    raw = _top_field(block, "parent", r"(.+?)\s*(?:#.*)?$")
    if not raw:
        return []
    return [p.strip() for p in raw.strip("[]").split(",") if p.strip()]


def _effects(block: str) -> list[tuple[str, float]]:
    """Explosion-modifying metabolism effects as (class, potency) pairs."""
    if "metabolisms:" not in block:
        return []
    body = block[block.index("metabolisms:"):]
    names = "|".join(EFFECT_MODIFIERS)
    out = []
    for m in re.finditer(r"!type:(" + names + r")\b([^\n]*(?:\n(?!\s*-\s*!type:)[^\n]*)*)", body):
        potency = re.search(r"^\s*potency:\s*" + _NUM, m.group(2), re.M)
        out.append((m.group(1), float(potency.group(1)) if potency else 1.0))
    return out


def parse_reagents(files: dict[str, str]) -> dict[str, dict]:
    """{id: own-fields} — only fields the block actually declares."""
    protos = {}
    for path, text in files.items():
        for block in _split_prototypes(text, "reagent"):
            rid = _top_field(block, "id", r"(\S+)")
            if not rid:
                continue
            own = {"_parents": _parents(block), "_file": path}
            for yml, key in _REAGENT_NUM_FIELDS.items():
                v = _top_field(block, yml, _NUM)
                if v is not None:
                    own[key] = float(v)
            for yml, key in _REAGENT_BOOL_FIELDS.items():
                v = _top_field(block, yml, r"(true|false)")
                if v is not None:
                    own[key] = v == "true"
            for yml, key in _REAGENT_STR_FIELDS.items():
                v = _scalar_field(block, yml)
                if v:
                    own[key] = v
            if "metabolisms:" in block:
                own["effects"] = _effects(block)
            # First definition wins, matching the chem extractor's merge order.
            protos.setdefault(rid, own)
    return protos


def parse_casings(files: dict[str, str]) -> dict[str, dict]:
    protos = {}
    for path, text in files.items():
        for block in _split_prototypes(text, "entity"):
            cid = _top_field(block, "id", r"(\S+)")
            if not cid or "OrdnanceCasing" not in block:
                continue
            own = {"_parents": _parents(block), "_file": path}
            comp = block[block.index("OrdnanceCasing"):]
            comp = re.split(r"\n  - type: ", comp)[0]
            for yml, key in _CASING_FIELDS.items():
                m = re.search(r"^\s+" + yml + r":\s*\"?([^\"\n#]+?)\"?\s*(?:#.*)?$", comp, re.M)
                if m:
                    raw = m.group(1).strip()
                    if raw in ("true", "false"):
                        own[key] = raw == "true"
                    elif re.fullmatch(_NUM, raw):
                        own[key] = float(raw)
                    else:
                        own[key] = raw
            for yml, (key, idx) in _CASING_RANGE_FIELDS.items():
                m = re.search(r"^\s+" + yml + r":\s*" + _NUM, comp, re.M)
                if m:
                    own.setdefault("_range", {})[(key, idx)] = float(m.group(1))
            protos.setdefault(cid, own)
    return protos


def _resolve(protos: dict[str, dict], rid: str, cache: dict, stack=()) -> dict:
    """Flatten a prototype against its parent chain.

    SS14 semantics: later parents override earlier ones, the child overrides
    all of them, and an absent field falls through. `metabolisms` is a whole-
    field override, so a child that declares any effects replaces the parent's
    set rather than merging into it.
    """
    if rid in cache:
        return cache[rid]
    if rid in stack or rid not in protos:
        return {}
    own = protos[rid]
    merged: dict = {}
    for parent in own["_parents"]:
        merged.update(_resolve(protos, parent, cache, stack + (rid,)))
    # `abstract` marks the prototype itself, never its children — inheriting it
    # would hide every concrete reagent whose parent is an abstract base.
    merged.pop("abstract", None)
    for k, v in own.items():
        if k.startswith("_"):
            continue
        merged[k] = v
    if "_range" in own:
        for (key, idx), v in own["_range"].items():
            span = list(merged.get(key, CASING_DEFAULTS.get(key, [0.0, 0.0])))
            span[idx] = v
            merged[key] = span
    cache[rid] = merged
    return merged


def resolve_all(protos: dict[str, dict]) -> dict[str, dict]:
    cache: dict = {}
    return {rid: _resolve(protos, rid, cache) for rid in protos}


# ── The formula ──────────────────────────────────────────────────────────────

def _reagent_deltas(spec: dict) -> dict:
    """Per-unit contribution of one reagent, explicit fields plus effects."""
    d = {
        "power": spec.get("power", 0.0) if spec.get("explosive") else 0.0,
        "falloff": spec.get("falloff", 0.0) if spec.get("explosive") else 0.0,
        "intensity": spec.get("i", 0.0),
        "duration": spec.get("d", 0.0),
        "radius": spec.get("r", 0.0),
    }
    for name, potency in spec.get("effects", []):
        for key, coeff in EFFECT_MODIFIERS[name].items():
            d[key] += coeff * potency
    return d


def compute_stats(mix: dict[str, float], casing: dict, reagents: dict[str, dict],
                  dampener: bool = False, iron: str = "RMCIron") -> dict:
    """Mirror of OrdnanceExplosionSystem.CalculateExplosionStats."""
    power = 0.0
    falloff = float(casing["base"])
    intensity = duration = radius = 0.0
    shards = 0
    penetrating = False
    for rid, qty in mix.items():
        if qty <= 0:
            continue
        spec = reagents.get(rid)
        if spec is None:
            raise KeyError(f"unknown reagent {rid!r}")
        d = _reagent_deltas(spec)
        power += qty * d["power"]
        falloff += qty * d["falloff"]
        intensity += qty * d["intensity"]
        duration += qty * d["duration"]
        radius += qty * d["radius"]
        penetrating = penetrating or bool(spec.get("penetrating"))
        if rid == iron:
            shards += int(qty * SHARDS_PER_UNIT)

    if power <= 0:
        shards = 0
    power = min(power, float(casing["maxP"]))
    falloff = max(falloff, float(casing["minF"]))
    if dampener:
        falloff *= 2.0
    shards = min(shards, int(casing["shards"]))

    if intensity > 0:
        fi, fd, fr = casing["fi"], casing["fd"], casing["fr"]
        intensity = min(max(intensity, fi[0]), fi[1])
        duration = min(max(duration, fd[0]), fd[1])
        radius = min(max(radius, fr[0]), fr[1])
    else:
        intensity = duration = radius = 0.0

    engine = engine_params(power, falloff)
    star = bool(casing.get("star", True)) and intensity > STAR_INTENSITY
    # ExecuteExplosion: a star throws fire lines whose length is round(radius x 1.5),
    # capped by the casing's max fire radius. The diamond uses fireRadius as-is.
    ray = min(int(round(radius * 1.5)), int(casing["fr"][1])) if star else 0
    return {
        "power": power,
        "falloff": falloff,
        "shards": shards,
        "fireIntensity": intensity,
        "fireDuration": duration,
        "fireRadius": radius,
        "firePenetrating": penetrating,
        "blastRadius": engine["radius"],
        "hasBlast": engine["totalIntensity"] > 0,
        "star": star,
        "rayRange": ray,
        "reach": ray if star else int(radius),
    }


def engine_params(power: float, falloff: float) -> dict:
    """Mirror of GetEngineExplosionParams."""
    if power <= 0 or falloff <= 0:
        return {"totalIntensity": 0.0, "slope": 0.0, "maxIntensity": 0.0, "radius": 0.0}
    max_intensity = power / INTENSITY_DIVISOR
    slope = max(falloff / INTENSITY_DIVISOR, MIN_SLOPE)
    radius = max_intensity / slope
    calc_radius = max(0.0, radius - 1.0)
    import math
    total = math.pi / 3.0 * slope * calc_radius ** 3
    return {"totalIntensity": total, "slope": slope, "maxIntensity": max_intensity,
            "radius": radius}


def damage_per_intensity(explosion_files: dict[str, str], proto: str) -> float:
    """Sum of damagePerIntensity for the explosion prototype the casings use."""
    for text in explosion_files.values():
        for block in _split_prototypes(text, "explosion"):
            if _top_field(block, "id", r"(\S+)") != proto:
                continue
            m = re.search(r"damagePerIntensity:\s*\n\s+types:\s*\n((?:\s+\w+:\s*-?[\d.]+\n?)+)", block)
            if not m:
                continue
            return sum(float(v) for v in re.findall(r":\s*(-?[\d.]+)", m.group(1)))
    return 0.0


# ── Build ────────────────────────────────────────────────────────────────────

def build(fork_id: str, fconf: dict, fetch) -> dict:
    """Fetch the fork's ordnance manifest and produce the JSON payload."""
    conf = fconf["ordnance"]
    url = fconf["raw_url"]
    reagent_files = fetch(conf["reagent_files"], url, f"{fork_id}_ordnance")
    casing_files = fetch(conf["casing_files"], url, f"{fork_id}_ordnance")
    explosion_files = fetch(conf.get("explosion_files", []), url, f"{fork_id}_ordnance")

    reagents = resolve_all(parse_reagents(reagent_files))
    casings = resolve_all(parse_casings(casing_files))
    iron = conf.get("iron_reagent", "RMCIron")

    out_reagents = {}
    for rid, spec in reagents.items():
        if spec.get("abstract"):
            continue
        d = _reagent_deltas(spec)
        interesting = (spec.get("explosive") or rid == iron
                       or any(abs(d[k]) > 1e-9 for k in ("intensity", "duration", "radius"))
                       or spec.get("color"))
        if not interesting:
            continue
        entry = {
            "explosive": bool(spec.get("explosive")),
            "power": round(d["power"], 4),
            "falloff": round(d["falloff"], 4),
            "i": round(d["intensity"], 4),
            "d": round(d["duration"], 4),
            "r": round(d["radius"], 4),
        }
        if spec.get("color"):
            entry["color"] = spec["color"]
            entry["colorWeight"] = spec.get("colorWeight", 0.0)
        if spec.get("penetrating"):
            entry["penetrating"] = True
        if spec.get("nameKey"):
            entry["nameKey"] = spec["nameKey"]
        if rid == iron:
            entry["shardsPerUnit"] = SHARDS_PER_UNIT
        # Explicit fields vs effect-derived ones, so the UI can explain a number
        # the wiki disagrees with.
        if spec.get("effects"):
            entry["via"] = [{"effect": n, "potency": p} for n, p in spec["effects"]]
        out_reagents[rid] = entry

    out_casings = {}
    for cid, spec in casings.items():
        if "maxP" not in spec and "vol" not in spec:
            continue
        merged = {**CASING_DEFAULTS, **{k: v for k, v in spec.items() if not k.startswith("_")}}
        out_casings[cid] = {
            "vol": merged["vol"], "base": merged["base"], "minF": merged["minF"],
            "maxP": merged["maxP"], "shards": int(merged["shards"]),
            "fi": merged["fi"], "fd": merged["fd"], "fr": merged["fr"],
            "star": bool(merged["star"]), "mode": merged["mode"],
            "cone": merged.get("dualCone") or merged["cone"],
            "fuel": merged.get("fuel"), "fuelAmount": merged.get("fuelAmount"),
        }

    dmg = damage_per_intensity(explosion_files, conf.get("explosion_proto", "RMC"))
    return {
        "schema": SCHEMA,
        "fork": fork_id,
        "formula": {
            "damagePerIntensity": dmg,
            "intensityDivisor": INTENSITY_DIVISOR,
            "minSlope": MIN_SLOPE,
            "starIntensity": STAR_INTENSITY,
            "shardsPerUnit": SHARDS_PER_UNIT,
            "ironReagent": iron,
        },
        "reagents": out_reagents,
        "casings": out_casings,
    }


def write(fork_id: str, payload: dict) -> Path:
    OUT_DIR.mkdir(exist_ok=True)
    path = OUT_DIR / f"{fork_id}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1, sort_keys=True),
                    encoding="utf-8")
    return path


def build_all(fetch) -> dict[str, Path]:
    from config import FORK_REGISTRY
    written = {}
    for fork_id, fconf in FORK_REGISTRY.items():
        if not fconf.get("ordnance"):
            continue
        payload = build(fork_id, fconf, fetch)
        path = write(fork_id, payload)
        written[fork_id] = path
        print(f"  ordnance/{fork_id}.json: {len(payload['reagents'])} reagents, "
              f"{len(payload['casings'])} casings")
    return written


def main() -> int:
    from ss14_chem_extractor import fetch_all_files
    print("=== Ordnance layer ===")
    written = build_all(fetch_all_files)
    if not written:
        print("  no fork declares an 'ordnance' manifest")
        return 0
    if "--verify" in sys.argv:
        from ordnance_reference import verify
        return 0 if verify(written) else 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
