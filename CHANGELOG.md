# Changelog

`data.json` schema version is in `meta.schemaVersion`. Consumers reading this file
should pin on a compatible range (semver: breaking changes bump major).

## 3.3.0 — 2026-07-11 (Increment L — Russian Marine Corps + pure categories)

### New fork: Russian Marine Corps (`rucm`)

Listed as "not addable" in 3.1.0 — its build repo has since been located:
**flex5hybrid/RussianCM** ("RMC-14 fork for RuCM"), `parent_fork: rmc14`.
20 reagents / 14 reactions: 9 craftable CMU medicines (Paracetamol → Tramadol →
Oxycodone painkiller chain; organ-repair line Hepatocytin/Pulmovine/Nephronate/
Cardiocaine/Osteocalc; Biogenic Matrix for limb printing), 7 XenoAlch toxins
(Sagunine, Cholinine, Noctine, Pyrinine, Vapinine, Crynine, Xenosterine —
injected by the xeno Alchemist strain, obtainable marine-side only via blood
draw), Black Sludge (+ CMUCreateSludgeGC: 4 CM meds 16u each → 64u), 3 napalm
mixes (UT/B/E), AU14SpaceCleaner, Abomination Venom, Yautja blood, and the
**Speed Demon** street drug (walk 1.3x / sprint 1.34x, OD 15u, purges Chloral
Hydrate; **no synthesis recipe** — antag drug dealer bottle / WeyU experiments
crate only, wired as `OTHER_REAGENT_SOURCES` → antag-only accessibility).
New antag strategy `speed-demon-pills` with per-fork difficulty: medium on
rucm, impossible everywhere else. Totals: 18 forks, 953 reagents, 850 reactions.

### Parse-time fork stamping (`_fork`)

RuCM adds new prototypes *inside its copies of parent `_RMC14` files*; the old
path-substring attribution (`detect_fork_source`) would have credited them to
rmc14. Prototypes are now stamped with the fetching fork at parse time and
`proto_fork()` prefers the stamp; identical-ID copies are still skipped by
first-wins merge, so attribution of all 17 pre-existing forks is unchanged
(verified: per-fork reagent counts byte-identical to 3.2.0).

### Parent-override auto-diff (`parent_override_reaction_files`)

Same machinery as the vanilla auto-diff, pointed at the parent fork's custom
layer: RuCM's copies of `_RMC14` reaction files are diffed against the rmc14
build data. Result: 5 `modified` annotations (Mindbreaker Toxin, Space Drugs,
Methylphenidate, Citalopram, Paroxetine — all craft **without** Black Goo on
RuCM). `forkStatus`/`forkNotes` now also attach to fork-owned reactions, not
just vanilla ones; the reactions table MOD badge renders them unchanged.

### Pure categories (breaking-ish for deep links)

`categorize_reagent` no longer emits per-fork "{ForkName} Medicine/Toxins/..."
sheets — every reagent lands in one of 15 content-based categories (Medicine,
Toxins, Narcotics, ...; was 79 with fork duplicates). Fork identity lives in
the Source filter. Old share links encoding fork categories silently drop that
filter. Excel: fork reagents merge into the standard category sheets; the
per-fork "Recipes" sheets merge into All Reactions / Drink Recipes.

### Fork lineage in the UI source filter

`meta.forks[].parent` ships fork ancestry; selecting a derivative fork now
shows its whole lineage (Funky → +Goob content, Fish → +Sunrise, RuCM →
+RMC14) instead of only fork-native + vanilla. Craft trees prefer the closest
lineage recipe (self → parent → vanilla). `build_per_fork_views` applies the
same chain plus auto-diff blocked sets, so per-fork strategy difficulty now
accounts for inherited content (global tiers unchanged; per-fork tiers for
derivative forks are more accurate).

## 3.2.0 — 2026-07-07 (Increment K.2 — Sunrise + Fish Station)

Adds the deferred pair from 3.1.0: **Sunrise** (space-sunrise/sunrise-station,
`_Sunrise` layer, 38 reagents / 46 reactions) as the base fork, and
**Fish Station / Рыбья станция** (space-sunrise/fish-station, `_Fish` layer,
2 reagents incl. the polymorphing `UnknownPathogen`; its own reaction file is
empty upstream) with `parent_fork: sunrise`. Registry order puts Sunrise before
Fish so first-wins protects the base. The first-wins merge skipped 34 Sunrise
copies of Corvax cocktails, Goob/ADT gases, Delta-V drinks — attribution of all
15 pre-existing forks is byte-identical to 3.1.0. Totals: 17 forks,
933 reagents, 836 reactions.

## 3.1.0 — 2026-07-07 (Increment K — Popular-Server Fork Expansion)

Adds **7 new forks** selected from the SS14 hub server list by peak population,
bringing coverage from 8 to 15 forks (893 reagents, 790 reactions total).
Fork identity was confirmed via each server's `/info` endpoint (`build.fork_id`)
where reachable, then mapped to public GitHub repos.

### New forks

| Fork | Servers covered | Repo | Base |
|---|---|---|---|
| `trauma` | TraumaStation | Trauma-Station/Trauma-Station | Goob |
| `omu` | Omu Pelican/Magpie/Woodpecker | ProjectOmu/OmuStation | Goob |
| `carpmosia` | Carpmosia | carpmosia/carpmosia (`dev`) | vanilla |
| `monolith` | Monolith Babel | Monolith-Station/Monolith (`main`) | Frontier |
| `harmony` | Harmony | ss14-harmony/ss14-harmony | vanilla |
| `corvax` | Corvax Вега/Элизиум | space-syndicate/space-station-14 | vanilla |
| `adt` | Время Приключений | AdventureTimeSS14/space_station_ADT | Corvax |

Not addable — no public build repo: Misfits: Nuclear Wasteland (135 peak),
Colonial Marines Universe 14 (71), Russian Marine Corps (34), STALKER (25),
Byrd Station (28); Space Stories's public repo is dead since 2024-12. Deferred:
Fish Station (needs a Sunrise base fork first), Dumont (own layer is ~2 files;
its Trauma base is now covered).

### Changed (data fix — reagent/reaction `source` attribution)

- **Merge is now first-wins in FORK_REGISTRY order** (was: last-wins).
  Derivative forks carry copied YAML of vanilla/base-fork content (ADT
  redefines `Hydrogen`, copies Goob's `BZ`/`Healium`/`Nitrium`/`Pluoxium`;
  Carpmosia copies Frontier's `Stelloxadone`/`Traumoxadone`). Under last-wins
  the copier stole the `source` label, which (a) hid the reagent from the
  owner fork's Source-filter view, (b) broke the vanilla view for staples
  like `Hydrogen`. The extractor now logs every skipped cross-fork copy
  (43 at release).
- Attribution corrections vs 3.0.0 as a result: `Heparin` funky→vanilla,
  `Multiver`/`Oxandrolone`/`Probital`/`SalicylicAcid`/`SilverSulfadiazine`/
  `StypticPowder` funky→goob, `Daiquiri` (reaction) deltav→vanilla. Funky's
  reagent count drops 36→29 accordingly; Goob rises 66→72.

### Internal

- `sources.py::_BASELINE_GH_OWNERS` extended with the 7 new repo owners.
- Only each fork's **own** prototype layer is manifested (`_Trauma`, `_Omu`,
  `_Carpmosia`, `_Mono`, `_Harmony`, `Corvax`, `ADT`) — copied layers
  (`_Goobstation` inside Trauma/Omu, `_NF` inside Monolith, `Corvax` inside
  ADT, `_EinsteinEngines` everywhere) are deliberately excluded to keep
  `detect_fork_source` attribution unambiguous; lineage is tracked via
  `parent_fork` instead (same pattern as Funky→Goob since 2.x).
- New forks all reuse the standard auto-diff pipeline
  (`vanilla_override_reaction_files`), e.g. soap reactions auto-blocked on
  Omu/Monolith whose repos deleted `soap.yml`.

## 3.0.0 — 2026-04-19 (Increment G — Source Attribution)

Introduces a **source attribution layer**: every curated claim in `data.json`
(strategy `desc`/`method`, reagent `antagTips`) now carries a `sources` / `antagTipsSources`
list pointing at trackable evidence — YAML deep-links, forum threads, wiki
pages, videos, or explicit `maintainer-knowledge` placeholders.

The conceptual shift (from 2.0.0) is why this is a major bump: consumers must
no longer treat curator text as free-form opinion, but as a claim with a
weighted authority trail. Forum user handles (gobbygobbler, Testicular_Man,
Steelclaw) are now first-class catalog entries — `data.sources["forum-gobby-killmix-2026"]`
ships literally in the JSON.

### Breaking

- `data.json.meta.schemaVersion` bumped to `"3.0.0"`.
- New top-level `data.sources`: dict of catalog entries keyed by short IDs
  (e.g. `code-pyro-clf3-prytile`, `forum-testicular-thermite-walls-2026`).
  Each entry includes `type`, `url`, `title`, `author?`, `date`, `note`,
  `quote?`, `archive_url?`, and a derived `authorityWeight` (0-10).
- New field on each strategy: `sources: (string | object)[]` — list of
  catalog refs or inline source objects.
- New field on each reagent: `antagTipsSources: string[]` — defaults to
  `["mk-general-antag-playtime"]` for reagents with curated `antagTips`
  but no explicit source backfill yet.
- New `data.meta.sourceAttribution` summary: `{total, attributed,
  maintainerKnowledgeOnly, speculationOnly, coveragePercent, avgAuthority,
  warnings}`.

### New files

- `sources.py` — catalog + `AUTHORITY_WEIGHTS` + `ALLOWED_DOMAINS` +
  `validate_source_refs`. Separate from `config.py` so drive-by contributors
  can PR attribution in isolation.
- `scripts/check_sources.py` — weekly HEAD-request link checker, writes to
  `cache/link_health.json`, exits 1 on ≥10% broken.
- `.github/workflows/check-links.yml` — cron `Monday 03:00 UTC` runs the
  checker, auto-commits the health file, auto-files an issue listing broken
  URLs with suggested `archive_url` fix pattern.
- `.github/ISSUE_TEMPLATE/attribution.yml` — community form for suggesting
  sources. Required fields: `entry_id`, `field`, `source_type`, `source_url`,
  `source_note` + two acknowledgement checkboxes.

### New features

- **Authority ladder** (`AUTHORITY_WEIGHTS`): 8 types from `speculation`(1)
  through `code`(10). Centralized — a contributor cannot inflate weight by
  editing entry-level data; weight is derived from `type`. Aggregation uses
  `max()` not `sum()`, so one code reference outranks ten forum posts.
- **Domain whitelist** in `sources.py::ALLOWED_DOMAINS`. GitHub owners are
  auto-derived from `FORK_REGISTRY` + `space-wizards`. Unknown domains emit
  a warning so whitelist expansion requires a visible PR.
- **UI source pills** in `renderSources()`: green (code/maintainer-test),
  cyan (forum-consensus/wiki), amber (forum-post/video/mk), red (speculation).
  Clickable for entries with URL; `target="_blank" rel="noopener noreferrer"`
  (OWASP standard).
- **Attribution-needed state**: reagents with `antagTipsSources: []` render
  a `⚠ needs attribution` badge with a "Suggest a source" link that opens
  the pre-filled `attribution.yml` issue.
- **Build-time validator** emits warnings for: branch-pinned GitHub URLs
  (master/main rather than a commit SHA), unknown domains, invalid ISO
  dates, missing required fields by source-type, overlong `quote` (>200),
  non-web.archive.org `archive_url`, YouTube `/embed/` form, and Reddit URLs
  outside the `/r/SpaceStation14` scope. Fatal: unresolved catalog IDs.

### Backfill at release

- 12/12 antag strategies have explicit `sources`:
  - `slow-poison` → `forum-gobby-killmix-2026` + `code-reagents-lead`
  - `floor-pry` → `code-pyro-clf3-prytile` + `forum-testicular-thermite-walls-2026` + `forum-steelclaw-thermite-forks-2026` + `code-pyro-thermite`
  - `silent-kill` / `sedation-ambush` → `code-chemicals-chloral`
  - `mass-explosion` → `code-reagents-potassium-water`
  - `clf3-armageddon` → `code-pyro-clf3-prytile`
  - Others → `mk-general-antag-playtime` (placeholder, community PR
    welcome via attribution.yml).
- 46 ANTAG_DATA reagent entries default to `["mk-general-antag-playtime"]`.
  Coverage: 6/52 (11%) non-mk sources; avg authority 2.92.

### Internal notes

- `config.py` was NOT extended with a `sources` dict — the catalog lives in
  `sources.py` to keep `config.py` focused on "what to render" vs "what
  backs it up". Extractor does `from sources import SOURCES, ...`.
- Field naming `antagTipsSources` (not `sources`) on reagent level
  deliberately avoids collision with the existing `obtainSources` field
  which means "where to get the chemical in-game".

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
