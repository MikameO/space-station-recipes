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

# CMArmorSystem.OnGetExplosionResistance: resist = ARMOR_BASE ^ (armour / ARMOR_STEP),
# and the incoming damage coefficient is divided by it. A xeno's own
# ExplosionResistance component supplies the coefficient that gets divided, and
# for xenos it is 2 — they take double explosion damage before armour.
ARMOR_BASE = 1.1
ARMOR_STEP = 5.0

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


# ── Targets ──────────────────────────────────────────────────────────────────
# What a mixture actually does to the things people aim it at. The roster is the
# one the in-game demolitions simulator offers (DemolitionsSimulatorLists), so
# the site and the machine on the Almayer talk about the same seventeen xenos.

def parse_entities(files: dict[str, str]) -> dict[str, dict]:
    """Entity prototypes by id. The chem extractor's loader handles !type: tags."""
    import yaml
    from ss14_chem_extractor import SS14Loader
    protos = {}
    for path, text in files.items():
        try:
            docs = yaml.load(text, Loader=SS14Loader)
        except Exception as exc:                      # a malformed upstream file
            print(f"  WARNING: cannot parse {path}: {exc}")
            continue
        for doc in docs or []:
            if isinstance(doc, dict) and doc.get("type") == "entity" and doc.get("id"):
                protos.setdefault(doc["id"], doc)
    return protos


def resolve_entity(protos: dict[str, dict], pid: str, seen=None) -> dict:
    """Flatten an entity's components down its parent chain.

    Components merge by type rather than replacing wholesale, which is what lets
    a child override one field of MobThresholds without restating the rest.
    """
    seen = seen or set()
    if pid in seen or pid not in protos:
        return {}
    seen.add(pid)
    doc = protos[pid]
    parents = doc.get("parent") or []
    if isinstance(parents, str):
        parents = [parents]
    merged: dict = {}
    for parent in parents:
        merged.update(resolve_entity(protos, parent, seen))
    for comp in doc.get("components") or []:
        if not isinstance(comp, dict) or "type" not in comp:
            continue
        base = dict(merged.get(comp["type"], {}))
        base.update({k: v for k, v in comp.items() if k != "type"})
        merged[comp["type"]] = base
    if doc.get("name"):
        merged["_name"] = doc["name"]
    return merged


def _threshold(thresholds: dict, state: str):
    """The health value at which a mob enters `state`, or None if it never does."""
    for value, name in (thresholds or {}).items():
        if str(name) == state:
            return float(value)
    return None


def explosion_coefficient(armour: float, base: float) -> float:
    """CMArmorSystem: the incoming coefficient divided by 1.1 ** (armour / 5)."""
    if armour <= 0:
        return base
    return base / (ARMOR_BASE ** (armour / ARMOR_STEP))


def blast_damage_at(power: float, falloff: float, distance: float,
                    damage_per_intensity: float) -> float:
    """Raw explosion damage this far from the centre.

    The engine spreads an explosion by flood fill and the simulator measures the
    result by detonating a real one, so there is no closed form to mirror. This
    is the linear model the numbers imply: intensity falls from power / 5 at the
    centre to zero exactly at the blast radius. It reproduces the known centre
    value of 2 x power and is stated as a model, not as an engine mirror.
    """
    if power <= 0 or falloff <= 0:
        return 0.0
    max_intensity = power / INTENSITY_DIVISOR
    slope = max(falloff / INTENSITY_DIVISOR, MIN_SLOPE)
    return damage_per_intensity * max(0.0, max_intensity - slope * distance)


def build_targets(conf: dict, files: dict[str, str]) -> list[dict]:
    protos = parse_entities(files)
    out = []
    for tid in conf.get("targets", []):
        if tid not in protos:
            print(f"  WARNING: target prototype {tid} not found")
            continue
        comp = resolve_entity(protos, tid)
        thresholds = comp.get("MobThresholds", {}).get("thresholds", {})
        crit = _threshold(thresholds, "Critical")
        dead = _threshold(thresholds, "Dead")
        if dead is None:
            print(f"  WARNING: {tid} has no Dead threshold, skipped")
            continue
        armour = float(comp.get("CMArmor", {}).get("explosionArmor") or 0)
        base = float(comp.get("ExplosionResistance", {}).get("damageCoefficient") or 1)
        out.append({
            "id": tid,
            "name": comp.get("_name") or tid,
            "tier": comp.get("Xeno", {}).get("tier"),
            # A lesser drone has no critical stage; it goes straight to dead.
            "crit": crit if crit is not None else dead,
            "hasCrit": crit is not None,
            "dead": dead,
            "armor": armour,
            "coefficient": round(explosion_coefficient(armour, base), 5),
            "rsi": comp.get("Sprite", {}).get("sprite"),
        })
    return out


def fetch_target_sprites(fconf: dict, targets: list[dict], states: list[str]) -> int:
    """Pull each target's alive / crit / dead frame into sprites/xenos/."""
    import urllib.error
    out_dir = SCRIPT_DIR / "sprites" / "xenos"
    out_dir.mkdir(parents=True, exist_ok=True)
    base = fconf["raw_url"]
    got = 0
    for target in targets:
        rsi = target.get("rsi")
        if not rsi:
            print(f"  WARNING: {target['id']} has no sprite path")
            continue
        target["sprites"] = {}
        for state in states:
            dest = out_dir / f"{target['id']}-{state}.png"
            if dest.exists():
                target["sprites"][state] = dest.name
                got += 1
                continue
            url = base.format(path=f"Resources/Textures/{rsi}/{state}.png")
            try:
                with urllib.request.urlopen(url, timeout=30) as resp:
                    dest.write_bytes(resp.read())
            except urllib.error.HTTPError:
                # Not every roster member draws all three states.
                print(f"  note: {target['id']} has no '{state}' frame")
                continue
            except Exception as exc:
                print(f"  WARNING: {target['id']} {state}: {exc}")
                continue
            target["sprites"][state] = dest.name
            got += 1
    return got


# ── Catalogue ────────────────────────────────────────────────────────────────
# Ready mixtures, one per casing and role. The search is an exhaustive sweep over
# PAIRS rather than a hill climb, and that is not a shortcut: every output of the
# formula is linear in the amounts and blast radius is a ratio of two linear
# terms, so a single-objective optimum always sits on a vertex or an edge of the
# composition simplex. Two reagents are provably enough, so the sweep is exact.

# Each role names what it maximises and what breaks a tie. Ties are the normal
# case, not the exception: power clamps at the casing ceiling, fire clamps at its
# cap and shrapnel at the shard limit, so most of the search space is flat at the
# top. A tie-break of "whatever else still hurts" is what separates a usable
# recipe from a technically-optimal dud — 204 iron with 36 welding fuel maxes the
# mortar's shards at 4 power, where the same shards come with 72.
_RADIUS = lambda s, c: s["blastRadius"] if s["hasBlast"] else 0.0
CATALOGUE_ROLES = [
    ("radius", "Blast radius", _RADIUS, lambda s, c: s["power"]),
    ("damage", "Peak damage", lambda s, c: s["power"], _RADIUS),
    ("shrapnel", "Shrapnel", lambda s, c: s["shards"], lambda s, c: s["power"]),
    ("fire", "Fire intensity", lambda s, c: s["fireIntensity"], lambda s, c: s["fireDuration"]),
    ("burn", "Burn time", lambda s, c: s["fireDuration"], lambda s, c: s["fireIntensity"]),
]
CATALOGUE_STEPS = 20        # grid resolution as a fraction of the casing volume
CHEAP_SHARE = 0.9           # the "cheap" row must still reach this much of the best


def load_obtainable(path="data.json") -> set[str]:
    """Reagents a player can actually get hold of.

    A reagent with neither a reaction nor a dispenser slot exists only inside
    something the game hands out pre-filled — the flamer tank napalms and the
    research variants. They belong in the calculator, because modelling one is
    fair, but never in a recommendation: the catalogue kept proposing
    RMCNapalmUTTank, which no one can pour into a casing.
    """
    src = SCRIPT_DIR / path
    if not src.exists():
        return set()
    data = json.loads(src.read_text(encoding="utf-8"))
    out = set()
    for rid, spec in data.get("reagents", {}).items():
        if spec.get("isDispenser") or spec.get("recipe"):
            out.add(rid)
    return out


def load_cost_model(path="data.json"):
    """Units of each base reagent needed per unit of a product.

    Read from the chemistry the site already ships rather than restated here, so
    a recipe change upstream moves the catalogue's costs with it. Catalysts are
    skipped because they are not consumed.
    """
    src = SCRIPT_DIR / path
    if not src.exists():
        print(f"  note: {path} absent, catalogue costs unavailable")
        return {}
    data = json.loads(src.read_text(encoding="utf-8"))
    reagents = data.get("reagents", {})
    memo: dict[str, dict[str, float]] = {}

    def cost_of(rid, seen=frozenset()):
        if rid in memo:
            return memo[rid]
        spec = reagents.get(rid)
        if not spec or spec.get("isBase") or not spec.get("recipe") or rid in seen:
            return {rid: 1.0}
        recipe = spec["recipe"]
        yield_ = (recipe.get("products") or {}).get(rid) or 1
        out: dict[str, float] = {}
        for sub, info in (recipe.get("reactants") or {}).items():
            if info.get("catalyst"):
                continue
            per = info["amount"] / yield_
            for base, amount in cost_of(sub, seen | {rid}).items():
                out[base] = out.get(base, 0.0) + amount * per
        result = out or {rid: 1.0}
        memo[rid] = result
        return result

    return {rid: cost_of(rid) for rid in reagents}


def mix_cost(mix: dict, costs: dict, base: str) -> float:
    return sum(costs.get(rid, {}).get(base, 0.0) * qty for rid, qty in mix.items())


def build_recipes(casings: dict, reagents: dict, formula: dict, costs: dict,
                  cost_base: str) -> list[dict]:
    pool = [rid for rid, spec in reagents.items()
            if spec.get("obtainable")
            and (spec.get("explosive") or spec.get("i") or spec.get("d") or spec.get("r")
                 or rid == formula["ironReagent"])]
    iron = formula["ironReagent"]
    out = []

    for casing_id, casing in casings.items():
        if casing_id not in CATALOGUE_CASINGS:
            continue
        cap = casing["vol"]
        unit = cap / CATALOGUE_STEPS
        # value -> (score, mix) per role, plus every evaluated point for the
        # cheap row, which needs the whole frontier rather than just its peak.
        best = {key: None for key, _, _, _ in CATALOGUE_ROLES}
        radius_points = []

        for i, first in enumerate(pool):
            for second in pool[i:]:
                for a in range(CATALOGUE_STEPS + 1):
                    for b in range(CATALOGUE_STEPS + 1 - a):
                        if a == 0 and b == 0:
                            continue
                        if first == second and b:
                            continue
                        mix = {}
                        if a:
                            mix[first] = a * unit
                        if b:
                            mix[second] = mix.get(second, 0) + b * unit
                        st = compute_stats(mix, casing, reagents, iron=iron)
                        volume = sum(mix.values())
                        cost = mix_cost(mix, costs, cost_base) if costs else 0.0
                        for key, _, score, tiebreak in CATALOGUE_ROLES:
                            value = score(st, casing)
                            if value <= 0:
                                continue
                            # Role first, then its own tie-break, then cheapest,
                            # then least material for the same result.
                            rank = (round(value, 6), round(tiebreak(st, casing), 6),
                                    -round(cost, 4), -volume)
                            if best[key] is None or rank > best[key][0]:
                                best[key] = (rank, value, dict(mix))
                        if st["hasBlast"]:
                            radius_points.append((st["blastRadius"], dict(mix)))

        # One mixture can be best at several roles at once; say so on one row
        # rather than printing it three times.
        rows: dict[tuple, dict] = {}
        for key, label, _, _tb in CATALOGUE_ROLES:
            if best[key] is None:
                continue
            _, value, mix = best[key]
            signature = tuple(sorted((rid, round(q, 3)) for rid, q in mix.items()))
            if signature in rows:
                rows[signature]["roles"].append(key)
                rows[signature]["labels"].append(label)
                continue
            rows[signature] = {"casing": casing_id, "roles": [key], "labels": [label],
                               "mix": mix}
        out.extend(rows.values())

        # The cheap row: least of the scarce reagent that still reaches most of
        # the best radius. This is the finding the whole series turns on.
        if radius_points and costs:
            ceiling = max(v for v, _ in radius_points)
            target = ceiling * CHEAP_SHARE
            good = [(mix_cost(m, costs, cost_base), v, m)
                    for v, m in radius_points if v >= target]
            if good:
                cost, value, mix = min(good, key=lambda x: (x[0], -x[1]))
                out.append({"casing": casing_id, "roles": ["cheap"],
                            "labels": [f"{int(CHEAP_SHARE * 100)}% of the radius for the least cost"],
                            "mix": mix})
    return out


# Only the casings people actually build; the base prototype and the propellant
# holders have no business in a catalogue.
CATALOGUE_CASINGS = {
    "RMCM40GrenadeCasing", "RMCM15GrenadeCasing", "RMCM20MineCasing",
    "RMCC4PlasticCasing", "RMC88mmRocketWarhead", "RMC80mmMortarWarhead",
}


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
    obtainable = load_obtainable()

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
        if rid in obtainable:
            entry["obtainable"] = True
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

    target_files = fetch(conf.get("target_files", []), url, f"{fork_id}_ordnance")
    targets = build_targets(conf, target_files) if target_files else []
    if targets:
        n = fetch_target_sprites(fconf, targets, conf.get("target_sprite_states", []))
        print(f"  targets: {len(targets)} with {n} sprite frames")

    costs = load_cost_model()
    cost_base = conf.get("cost_base", "RMCPhoron")
    dmg = damage_per_intensity(explosion_files, conf.get("explosion_proto", "RMC"))
    formula = {
        "damagePerIntensity": dmg,
        "intensityDivisor": INTENSITY_DIVISOR,
        "minSlope": MIN_SLOPE,
        "starIntensity": STAR_INTENSITY,
        "shardsPerUnit": SHARDS_PER_UNIT,
        "ironReagent": iron,
        "armorBase": ARMOR_BASE,
        "armorStep": ARMOR_STEP,
        "costBase": cost_base,
    }
    recipes = build_recipes(out_casings, out_reagents, formula, costs, cost_base)
    print(f"  catalogue: {len(recipes)} recipes")
    return {
        "schema": SCHEMA,
        "fork": fork_id,
        "formula": formula,
        "targets": targets,
        "recipes": recipes,
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
              f"{len(payload['casings'])} casings, {len(payload['targets'])} targets, "
              f"{len(payload['recipes'])} recipes")
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
