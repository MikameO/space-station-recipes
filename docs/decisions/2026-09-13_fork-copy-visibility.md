# Decision: A fork sees the ids its own manifest carries — `alsoIn`

**Date:** 2026-09-13
**Tier:** 2 (data.json schema 3.12.0 → 3.13.0, additive field; changes what every fork view shows; touches ss14_chem_extractor.py and app.js)
**Status:** accepted — decided synchronously with the owner (global CLAUDE.md, Tier 2 fallback), who chose it over «accept the losses» and «per-id exclusions».
**Method:** full upstream refresh of all 21 forks on 2026-09-12 (manifest audit → targeted cache refresh → regen), old↔new `data.json` diff with per-fork visible counts replicating `forkVisible`.

## Context

The extractor merges every fork's prototypes first-wins in `FORK_REGISTRY` order, and each reagent or reaction carries a single `source`. `forkVisible` shows an entity to a fork when `source` is vanilla or in the fork's `parent` chain. Registration order was chosen so the owner of shared layers comes first, and two earlier incidents (RuCM gutted by CMU in 2026-07; RuCM dropped from the fork list) were fixed through `parent_fork` lineage.

The 2026-09-12 refresh produced a case lineage cannot fix: an **earlier-registered** fork adds, in its own files, an id a **later, unrelated** fork already shipped. Ownership moves to the earlier fork, and the later fork loses the id from its view although it still has it in game:

| Id | Kind | New owner (file) | Lost from |
|---|---|---|---|
| Necrosol | reaction | starlight (`_Starlight/Recipes/Reactions/medicine.yml`) | carpmosia |
| CrushedPhosphorus | reaction | starlight (`_Starlight/Recipes/Reactions/fun.yml`) | sunrise, fish |
| ResomiBloodBreakdown | reaction | starlight (`_Starlight/Recipes/Reactions/biological.yml`) | adt |
| Caffeine | reagent | goob (`_Goobstation/Reagents/toxins.yml`) | frontier, monolith |

The same pattern already hid content before the refresh: the regen #1 collision log holds 232 explicit-manifest copies, 88 of which were invisible in the copying fork (13 forks; Sunrise alone +24 reagents / +12 reactions).

## Decision

**Chosen:** during the custom-manifest merge pass, when a fork's own manifest carries an id already owned by a non-vanilla fork outside its ancestry, record that fork in the owner's `alsoIn` (sorted list, emitted only when non-empty). `forkVisible` accepts an entity whose `alsoIn` meets the fork's chain; the recipe ranking orders by the nearest fork in the chain that has the id. The owner's definition (text, recipe) is what every view shows.

- Harvested vanilla-path copies do not record `alsoIn` — vanilla ids are visible everywhere already.
- `_also_in` is excluded from parent inheritance, so an abstract base does not pass it to every child.
- A fork's `forkStatus: blocked` still hides the entity.

**Rationale.** A fork that lists a file in its manifest ships that content; hiding it is the regression the fork-add memory warns about («LOST must be 0 for every pre-existing fork»), and ordering the registry cannot satisfy every pair once two unrelated forks copy each other both ways. The field is additive: old app code ignores it, and the app change was committed (7fc614e) before the data so it is safe with either `data.json`.

**Rejected.**
- *Accept the losses* — six recipes disappear from forks that have them, and the next upstream move can hide more without any signal.
- *Per-id `exclude_ids` in config.py* — hides the id from the fork that actually added it, needs a hand edit on every new overlap, and does nothing for the 88 pre-existing hidden copies.
- *Multiple owners / per-fork definitions* — correct in principle (a copy may differ from the owner's version) but a schema change to every consumer; not justified by any observed divergence.

**Conditions to revisit.** A copy whose recipe differs from the owner's (the fork diff would then show the owner's version under the copying fork) — at that point per-fork definitions become worth their cost.

## Consequences

- `scripts/diff_data`-style checks must replicate `forkVisible` with `alsoIn`, or they report phantom losses.
- `meta.forks[].reagentCount` still counts owned ids only.
