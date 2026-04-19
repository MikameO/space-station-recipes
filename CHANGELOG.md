# Changelog

`data.json` schema version is in `meta.schemaVersion`. Consumers reading this file
should pin on a compatible range (semver: breaking changes bump major).

## 2.0.0 — 2026-04-19 (Increments A–E)

Quality improvement pack triggered by three [SS14 Discussion](https://forum.spacestation14.com/)
forum critiques (gobbygobbler, Steelclaw, Testicular_Man) about SS13 legacy lore
leaking into curator-written tips and about strategy "easy" labels not reflecting
actual reagent accessibility.

### Breaking (consumers must update)

- `data.json.meta.schemaVersion` introduced (`"2.0.0"`). Previous data had no
  version field — treat anything without `schemaVersion` as implicit `1.x`.
- Each reagent now carries `accessibility: {tier, weight, reason}`. Tiers:
  `dispenser` (0) < `self-chem` (1) < `cross-botany`/`cross-service` (2) <
  `mob-drop` (3) < `antag-only` (4) < `unknown` (5) < `unobtainable` (999).
- Each reagent now carries `verifiedMechanics: string[]` — human-readable claims
  extracted directly from YAML (`tileReactions`, `reactiveEffects`, metabolisms,
  phase-change temps). Curator's `antagTips` is retained as a separate field
  but is no longer treated as authoritative.
- Each reagent gains `boilingPoint` and `meltingPoint` passthrough from YAML.
- Each `antagStrategies[*]` gains:
  - `computedDifficulty: {tier, effortScore, breakdown, authoredTier, mismatch,
    mismatchReason}` — the primary difficulty signal; authored tier becomes a
    hint in the tooltip.
  - `verificationStatus: "all-verified" | "partial" | "lore-only"` — classifies
    whether every ingredient has YAML-verified mechanics AND the strategy's
    `method` matches a known delivery mechanism.
  - `loreWarnings: string[]` — extractor-emitted flags, e.g. "desc mentions
    'melting walls' — SS14 chemistry has no wall-melting mechanic".

### Data fixes (Increment A)

- Purged the SS13 "Thermite melts walls" myth from `ANTAG_DATA["Thermite"].tips`.
  New tips describe only what's actually in pyrotechnic.yml:
  `FlammableTileReaction` (x2 temp) + metabolism Heat 2 + Poison 1.
- `ANTAG_DATA["Lead"].tips` prefixed with "(Unobtainable in vanilla SS14 — no
  reaction, no plant, no dispenser.)"
- Strategy `slow-poison` no longer uses Lead; Histamine amount increased to 25u
  and description rewritten to mention the required Botany cooperation (Nettle
  plant source).
- Strategy `wall-breach` replaced with `floor-pry` — SS14 chemistry has no
  wall-melting, but `ChlorineTrifluoride` has `PryTileReaction` (the only
  structural-damage tile reaction in vanilla), so the strategy now reflects
  the real mechanic and explicitly debunks the SS13 myth.
- Frontend now shows an `UNOBTAINABLE` badge on any reagent card whose
  `recipe === null && obtainSources === [] && !isDispenser` — generalises the
  Lead fix to the whole class.

### New features

- **Computed accessibility** (Increment B). Cycle-safe recursive classifier
  reads `obtainSources` + `recipe` + `BASE_DISPENSER_CHEMICALS`, emits a
  per-reagent tier. Dispenser-bypass short-circuit prevents double-counting
  depth for chemicals that happen to have a recipe but are also in the
  dispenser.
- **Computed strategy difficulty** (Increment B). Effort score = sum of
  ingredient weights + reaction depth + cross-dept penalty + temp-constraint
  penalty + unobtainable penalty. Mapped to `trivial`/`easy`/`medium`/`hard`/
  `expert`/`impossible`. Authored tier preserved for tooltip.
- **Verified vs Community split** (Increment C). `getAntagIntelHTML` now
  renders two distinct sections: `✓ Verified in SS14 code` (green) and
  `ⓘ Community knowledge (unverified)` (amber dashed). Brittle keyword-based
  delivery suggestions replaced with structured tag-based lookup.
- **Antag-page filters** (Increment D). Four selects (difficulty / stealth /
  verification / method) + reset. Counter shows `N of 12 match filters`.
  URL round-trip via `af_d` / `af_s` / `af_v` / `af_m` params (Share button
  only, not auto-applied on every change).
- **Community feedback loop** (Increment E). Each strategy card has a
  `⚠ Report inaccuracy` link opening a pre-filled GitHub issue with
  `strategy_id` and `fork` from the URL. Issue template
  `strategy-inaccuracy.yml` requires a verifiable source link.

### Coverage stats at release

- 647 / 693 reagents (~93%) have ≥1 YAML-verified mechanic.
- 68 dispenser-tier reagents, 134 self-chem, 137 cross-botany, 177 unobtainable.
- 8 / 12 authored strategy difficulty tiers diverge from computed — expected
  and informative, shown in UI via `ⓘ` glyph and tooltip.

### Internal

- New extractor functions in `ss14_chem_extractor.py`:
  `compute_reagent_accessibility`, `compute_reaction_depth`,
  `compute_strategy_difficulty`, `extract_verified_mechanics`,
  `compute_strategy_verification_status`. All reuse the cycle-safe
  `resolving` set pattern from `resolve_parents:463`.
- Build log now prints mismatch report and verified-mechanics coverage.

### Deferred to later increments

- Per-fork accessibility (currently global; would require rebuilding
  `reaction_lookup` + `all_sources` per fork).
- Source attribution layer (Increment G — separate PR after E).
- Russian localization (deferred — see plan file).
