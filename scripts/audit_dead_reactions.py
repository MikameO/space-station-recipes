# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 MikameO
# This file is part of Space Station Recipes.

"""
One-shot diagnostic: find "dead" reactions — YAML-valid recipes whose
reactants don't exist as prototypes in the target fork's reagent namespace.

Motivated by user report (2026-04-21): RMC14 shows FluorosulfuricAcid in the
UI, but the recipe uses `Fluorine/Hydrogen/Potassium/SulfuricAcid` — names
that exist only in vanilla. RMC14 provides only `RMCFluorine`,
`RMCHydrogen`, etc. Engine cannot match, reaction never fires.

Reads cache/ directly (offline). Writes cache/dead_reactions_audit.json
plus a markdown summary to stdout.
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

import yaml

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from config import FORK_REGISTRY  # noqa: E402

CACHE = _ROOT / "cache"


class _IgnoreTag(yaml.SafeLoader):
    pass


def _tag_ignore(loader, tag_suffix, node):
    if isinstance(node, yaml.ScalarNode):
        return loader.construct_scalar(node)
    if isinstance(node, yaml.MappingNode):
        return loader.construct_mapping(node, deep=True)
    if isinstance(node, yaml.SequenceNode):
        return loader.construct_sequence(node, deep=True)
    return None


_IgnoreTag.add_multi_constructor("!type:", _tag_ignore)
_IgnoreTag.add_multi_constructor("!", _tag_ignore)


def _load_yml(path: Path):
    try:
        with path.open(encoding="utf-8") as f:
            docs = list(yaml.load_all(f, Loader=_IgnoreTag))
    except Exception as exc:
        print(f"  ! parse error {path}: {exc}", file=sys.stderr)
        return []
    out = []
    for doc in docs:
        if isinstance(doc, list):
            out.extend(doc)
    return out


def _iter_yml(dir_path: Path):
    if not dir_path.exists():
        return
    for yml in sorted(dir_path.rglob("*.yml")):
        yield yml


def _collect(dir_path: Path, want_type: str) -> dict[str, dict]:
    """Return {id: prototype_dict} for every entry of want_type under dir."""
    found = {}
    for yml in _iter_yml(dir_path):
        for item in _load_yml(yml):
            if not isinstance(item, dict):
                continue
            if item.get("type") != want_type:
                continue
            iid = item.get("id")
            if iid:
                found[iid] = item
    return found


def fork_reagent_ids(fork_id: str) -> set[str]:
    """IDs of reagent prototypes actually present on this fork's server.

    Detection rule: a fork that sets `blocked_categories` is treated as
    namespace-replacement (like RMC14 — replaces vanilla elements with
    RMC-prefixed versions). All others extend vanilla.

    Also walks parent_fork chain so Funky (child of Goob) inherits Goob's
    custom reagents.
    """
    vanilla_dir = CACHE / "vanilla" / "Resources" / "Prototypes" / "Reagents"
    vanilla_ids = set(_collect(vanilla_dir, "reagent").keys())

    if fork_id == "vanilla":
        return vanilla_ids

    conf = FORK_REGISTRY[fork_id]
    is_replacement = bool(conf.get("blocked_categories"))

    # Custom-layer manifests + vanilla-path copies: forks add definitions
    # inside patched vanilla files too (Goob's Warfarin/Necrosol — harvested
    # by extractor Phase 2b from the same *_vanilla_overrides cache).
    fork_ids = set(_collect(CACHE / fork_id, "reagent").keys())
    fork_ids |= set(_collect(CACHE / f"{fork_id}_vanilla_overrides", "reagent").keys())
    parent = conf.get("parent_fork")
    while parent:
        fork_ids |= set(_collect(CACHE / parent, "reagent").keys())
        fork_ids |= set(_collect(CACHE / f"{parent}_vanilla_overrides", "reagent").keys())
        parent = FORK_REGISTRY.get(parent, {}).get("parent_fork")

    if is_replacement:
        return fork_ids
    return vanilla_ids | fork_ids


def fork_active_reactions(fork_id: str) -> dict[str, dict]:
    """Return reactions considered active on this fork.

    - Start with vanilla reactions.
    - Replace with fork's vanilla_overrides (if fork dropped a vanilla
      reaction from its override file, drop it from the active set).
    - Add fork-exclusive reactions from fork's own reaction_files.
    - Subtract manually blocked (from FORK_REGISTRY.blocked_reactions).
    """
    if fork_id == "vanilla":
        vdir = CACHE / "vanilla" / "Resources" / "Prototypes" / "Recipes" / "Reactions"
        return _collect(vdir, "reaction")

    conf = FORK_REGISTRY[fork_id]
    vanilla_rxns = _collect(
        CACHE / "vanilla" / "Resources" / "Prototypes" / "Recipes" / "Reactions",
        "reaction",
    )

    override_dir = CACHE / f"{fork_id}_vanilla_overrides"
    has_override = override_dir.exists() and any(override_dir.rglob("*.yml"))
    if has_override:
        override_rxns = _collect(override_dir, "reaction")
        # For each vanilla-path file the fork overrides, the override is
        # AUTHORITATIVE — reactions in that file but missing from override
        # were dropped by the fork. Since we collect all overrides as one
        # flat dict, the simplest safe approximation is: keep vanilla rxns
        # that also exist in the override. This matches current extractor
        # behaviour (see diff_fork_reactions).
        active = {k: override_rxns[k] for k in override_rxns}
        # Also preserve vanilla rxns whose file is NOT overridden at all
        # (edge case: fork keeps some vanilla files untouched).
        overridden_files = {
            rf for rf in conf.get("vanilla_override_reaction_files", [])
        }
        for rid, rdata in vanilla_rxns.items():
            if rid in active:
                continue
            # Hard to know which vanilla file each rxn came from without
            # re-parsing; treat as present if not explicitly overridden.
            # Safer to err on side of "present" for vanilla reactions —
            # the dead-reactant check will filter them anyway.
            active.setdefault(rid, rdata)
    else:
        active = dict(vanilla_rxns)

    # Add fork-exclusive reactions
    fork_own = _collect(CACHE / fork_id, "reaction")
    active.update(fork_own)

    # Subtract manually blocked
    for blk in conf.get("blocked_reactions", set()):
        active.pop(blk, None)

    return active


def _reaction_reactants(rxn: dict) -> set[str]:
    r = rxn.get("reactants") or {}
    if isinstance(r, dict):
        return set(r.keys())
    return set()


def audit_fork(fork_id: str) -> dict:
    reagents = fork_reagent_ids(fork_id)
    reactions = fork_active_reactions(fork_id)
    dead = {}
    for rid, rxn in reactions.items():
        reactants = _reaction_reactants(rxn)
        missing = reactants - reagents
        if missing:
            dead[rid] = sorted(missing)
    return {
        "fork": fork_id,
        "fork_name": FORK_REGISTRY[fork_id]["name"],
        "reagents_count": len(reagents),
        "reactions_active": len(reactions),
        "dead_reactions": len(dead),
        "dead_pct": round(100.0 * len(dead) / max(len(reactions), 1), 1),
        "examples": dict(sorted(dead.items())[:15]),
        "all_dead_ids": sorted(dead.keys()),
    }


def main() -> None:
    reports = {}
    for fork_id in FORK_REGISTRY:
        print(f"-> Auditing {fork_id}...")
        reports[fork_id] = audit_fork(fork_id)

    out_path = CACHE / "dead_reactions_audit.json"
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(reports, f, indent=2, ensure_ascii=False)

    print("\n" + "=" * 70)
    print("DEAD REACTION AUDIT — results")
    print("=" * 70)
    print(f"{'Fork':<14}{'Reagents':>10}{'Rxns':>8}{'Dead':>8}{'Dead %':>9}")
    print("-" * 70)
    for fid, rep in reports.items():
        print(
            f"{rep['fork_name'][:13]:<14}"
            f"{rep['reagents_count']:>10}"
            f"{rep['reactions_active']:>8}"
            f"{rep['dead_reactions']:>8}"
            f"{rep['dead_pct']:>8}%"
        )
    print("\nSample dead reactions per fork (first 8):")
    for fid, rep in reports.items():
        if rep["dead_reactions"] == 0:
            continue
        print(f"\n[{rep['fork_name']}]")
        for rid, missing in list(rep["examples"].items())[:8]:
            print(f"  {rid:<32} missing: {', '.join(missing)}")

    print(f"\nFull dump: {out_path.relative_to(_ROOT)}")


if __name__ == "__main__":
    main()
