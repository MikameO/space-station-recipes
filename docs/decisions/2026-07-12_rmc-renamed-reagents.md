# Decision: RMC-family renamed-reagent namespace → dead vanilla recipes

**Date:** 2026-07-12
**Tier:** 2 (data model, affects a fork class, ~110 reactions, prod-facing)
**Status:** accepted

## Context

User report: on **Russian Marine Corps (`rucm`)**, Fluorosurfactant and Space
Mirage (and "other things") show a recipe in the tool but **do not craft
in-game**.

### Root-cause investigation (systematic-debugging Phase 1)

- The tool shows Fluorosurfactant makeable on `rucm` with the vanilla recipe
  `Carbon + Fluorine + SulfuricAcid` — internally consistent with the data.
- Decisive evidence: **RMC-14 renames 21 fundamental base reagents**
  (`Carbon→RMCCarbon`, `Fluorine→RMCFluorine`, `Oxygen`, `Hydrogen`, `Ethanol`,
  … — atoms + ethanol), giving each an `RMC*` id that carries the *same locale
  name* as its vanilla twin. RMC's repo also keeps vanilla-path files (with
  `Fluorine`) which the extractor ingests as `*_vanilla_overrides`, so the
  extractor treats vanilla reagents as part of RMC's namespace. But the
  *playable* reagents in RMC's game are the `RMC*` ones; the vanilla-named twins
  are vestigial. → vanilla recipes referencing them are dead in-game.
- This is exactly what `scripts/audit_dead_reactions.py`'s docstring described,
  but that audit reports "0 dead" because RMC's repo still *defines* Fluorine
  (existence ≠ obtainability).

### Scope (measured on data.json)

- **RMC family only: `rmc14` + `rucm`** (rucm inherits rmc14's renames via
  `parent_fork`). `rmc14` custom dir renames 21 base reagents.
- **110 / 316 vanilla reactions (35%)** use ≥1 renamed reagent → dead on
  RMC/RuCM (incl. Bicaridine, Acetone, Ammonia, Benzene).
- The other 16 forks are **additive** (extend vanilla, no base renames) — clean.
  `adt`/`sunrise` have 1–2 edge renames (negligible, not systemic).

## Decision

**Option 1 — detect-rename → block dead recipes + warn banner** (chosen).

1. Extractor builds a per-fork **rename map**: a fork reagent whose id is not a
   vanilla id but shares a vanilla reagent's locale `name` and is prefixed →
   the vanilla twin is **shadowed** (not obtainable on that fork).
2. Remove shadowed reagents from the fork's obtainable namespace and compute
   **dead reactions transitively** (a reaction is dead if any reactant is
   unobtainable and not producible by a non-dead reaction). Mark
   `forkStatus[fork] = "blocked"`.
3. Frontend: a fork-level banner on total-conversion forks ("RMC = total
   conversion; vanilla chemistry uses renamed reagents, most vanilla recipes
   don't apply").

### Rejected alternatives

- **Warn-only banner:** fast but leaves 110 non-working recipes shown as
  makeable — dishonest for a reference tool.
- **Full remap `RMCFluorine≡Fluorine`:** would make vanilla recipes "resolve"
  transparently, but assumes RMC's recipes actually work with the renamed
  reagents — the user confirmed they DON'T, so this risks re-showing broken
  recipes. Higher effort, higher risk.

## Consequences

- RMC/RuCM players see dead vanilla recipes as blocked/unobtainable (honest) +
  a banner explaining why. The tool no longer claims makeable-when-not.
- The rename-detection is **general** (locale-name collision + fork prefix), so
  any future total-conversion fork is handled automatically.
- Follow-up (not in this increment): surface RMC's *own* `RMC*` chemistry if it
  exists as parallel recipes (needs verifying RMC has real crafting).
