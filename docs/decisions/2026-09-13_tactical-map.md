# Decision: Series T tactical map — sourcing, data contract, constants and increment order after the war-room

**Date:** 2026-09-13
**Tier:** 2 (new extractor `ss14_tactical.py`, new data contract `tactical/`, new standalone page; touches `deploy.yml`, `sections.json`, `sitemap.xml`, `.gitignore`)
**Status:** accepted — synthesized by Claude from war-room round 1. The owner closed the discussion mid-session («мы уже обсудили практически всё, что могли. просто реализуй это. А потом, если что я внесу правки»), so cross-examination and the synthesis agent were skipped. The UX expert's round-1 notes arrived after the first draft and are folded in as decisions 12–13.
**Method:** war-room round 1, Opus agents with conflicting targets — Domain Expert (SS14 correctness), System Architect (maintenance cost), Product Manager (value per effort), Devil's Advocate (resilience), UX Designer (combat usability). Every expert claim adopted below was re-checked against upstream code first; corrections to the spec are listed under Consequences.

## Context

Design: [docs/design/2026-09-13-tactical-map.md](../design/2026-09-13-tactical-map.md), approved by the owner section by section. The panel reviewed ten points Claude had decided (D1–D10); the owner's decisions were fixed constraints.

Facts established during the session that the first spec draft lacked:

- `cache_maps/` trees are frozen July snapshots: `cmu/_tree.json` (2026-07-23) has zero `Content.CMU/` paths, while CMU moved its content there on 2026-08-30. The live recursive trees of RMC14, Stories, CMU and RuCM all return `truncated=true` (~58k entries).
- `MortarComponent` range: RMC14 and Stories 15/65, **CMU and RuCM 8/165**; `TilesPerOffset` 20 and `MaxDial` 10 everywhere.
- CMU `MortarSystem` adds `CanOperateMortarAt` (refusal «covered») and `TryResolveImpactCoordinates` after the random offset.
- Rangefinder mode requires only line of sight, range and a planet grid — no area flag; it reports the snapped tile under the cursor. The `CanCAS`/`CanLase` check applies to designator modes.
- `AreaComponent` has no `mortar` field: `mortar: false` in `RMCAreaProtectionOne` is inert.
- No repository overrides `rmc.planet_coordinate_variance` (RMC14, Stories, CMU).
- Upstream churn since 2026-03-13 (RMC14): mortar, OB, area and planet C# — 0–4 commits per path; `lv624.yml` — 9; `rmc_planets.yml` — 20; all `Resources/Maps/_RMC14` — 100+.

## Decisions

### 1. Sourcing: pinned commit, subtree listing, content-addressed cache

**Chosen:** `ss14_tactical.py` resolves one commit SHA per fork per run, walks only the subtrees it needs at that SHA (`git/trees/<sha>`), downloads raw files at the SHA and caches them by blob SHA in gitignored `cache_tactical/`. An empty response or an unparseable file raises. From `ss14_map_extractor.py` it imports only `_type_constructor` and `decode_chunk`, and fails when `decode_chunk` skips a chunk.
**Rationale:** System Architect and Devil's Advocate (D1 4/10): forever caches plus branch `raw_url` mix July trees with HEAD files, so `ref` proves nothing; confirmed by the stale and truncated trees above.
**Rejected:** reusing `fetch_repo_tree`/`cache_maps/` — frozen snapshot without `Content.CMU`; editing `ss14_map_extractor.py` — other pipelines depend on its cache semantics.
**Conditions to revisit:** subtree walks hit GitHub API limits on a full rebuild.
**Confidence:** high.

### 2. Data contract: per-fork files, content hash per planet

**Chosen:** every fork owns its files (no cross-fork `file` reference). `index.json` carries `sources` (fork → commit SHA, date) and a content hash `h` per planet file set. The page requests planet files with `?h=`, checks the PNG size against `bounds`, and marks markers stale by `h`. `schemaVersion` 1 describes single-level planets; CMU column masks join in T8, as schema 2 if the T1 recon shows v1 cannot hold them.
**Rationale:** System Architect — `maps.js` derives the fork from `file.split('/')[0]` and git stores identical blobs once; Devil's Advocate — staleness keyed to a fork `ref` fires on every regen even when the planet did not change.
**Rejected:** cross-fork `file` deduplication — saves ~17 KB per planet and breaks the maps convention.
**Confidence:** high.

### 3. Mechanic constants: explicit mirror, field check, review flag (System Architect VETO resolved)

**Chosen:** constants are mirrored per fork in `ss14_tactical.py` with a MIRRORED SOURCES block, as `ss14_ordnance.py` does. At build time the extractor reads a whitelist of `Name = value;` field defaults at the pinned SHA and fails when a mirrored value differs. It records the blob SHAs of the formula files (mortar, OB, areas, rangefinder, planet, map inserts, CMU top-down ordnance) and prints REVIEW when one differs from the last reviewed SHA. No regex fingerprints of formulas. CI runs `check_tactical.py` offline: committed data, invariants, mirror consistency.
**Rationale:** System Architect VETO — formula fingerprints over a forever cache see no drift and add syntax failure points; Domain Expert — values differ per fork (CMU 8/165) and CMU changed the order of checks, which a formula fingerprint misses and a blob-SHA review flag catches; Devil's Advocate — a network-dependent check must not block the single deploy job.
**Rejected:** regex formula fingerprints — false failures on renames; plain hardcoding — CMU divergence would pass silently.
**Confidence:** high.

### 4. Page assets live in `tactical/`; shared files are edited once

**Chosen:** `tactical.html` at the root; `tactical/tactical.js`, `tactical/mapview.js` (local canvas view: fit, pan, zoom to cursor, DPR, tile↔screen, layer redraw), `tactical/tactical.css`, strings in the module's own L10N table. `deploy.yml` is edited once in T2 (copy list, asset-guard page list, Node test, offline check). `sw.js`, `i18n.js` and `style.css` are not edited: the network-first handler caches visited files, and offline use is best-effort, not promised in the UI.
**Rationale:** System Architect — 6 of the 11 shared files the series planned to touch were already being edited by parallel sessions; Product Manager (D4 5/10) — a generic MapView pays off only with the Maps tab migration, which is outside the series; Devil's Advocate — `activate` deletes the runtime cache on every `CACHE` bump, so PRECACHE entries buy nothing durable.
**Rejected:** a root-level shared `mapview.js` — no second consumer in the series; PRECACHE entries — wiped by other sessions' bumps.
**Confidence:** medium-high.

### 5. Calibration lifetime (Devil's Advocate VETO resolved by mitigation)

**Chosen:** one-point calibration stays (owner decision). Added: the calibration age next to every coordinate output; after 20 minutes without input on the page, a reload, or an off-planet typed coordinate the fire panels ask «тот же раунд?» (one click) or offer the compare-only check of decision 13; the check point is suggested actively and always chosen with |dx| ≠ |dy| relative to the first point; an impact reported through «Упало здесь» beyond the theoretical error bound shows «калибровка устарела?»; the ±500 bound stays a warning; «Новый раунд» clears calibration and shots. The calibration hint asks for a floor tile or a wall corner in line of sight, never a tall sprite.
**Rationale:** Devil's Advocate — the previous round's offset passes every designed check; Domain Expert — the rangefinder reports the tile under the cursor, and tall sprites (73 trees, 368 lamps on LV-624) shift Y by 1–2 tiles.
**Overridden:** a mandatory second measurement after every reload — it contradicts the owner's one-point calibration; the age display and confirm step cover the stale-offset failure without blocking.
**Confidence:** medium.

### 6. Increment order: close the mortar loop first, CMU before depth features

**Chosen:** T1 RMC-family data (+ CMU recon spike) → T2 page and deploy wiring → T3 calibration → T4 mortar core (position, rings with tile-centre geometry, zero-error zone, target coordinates with checks, mortar strike layer, Sections card) → audit → T5 fire loop (dial variant, «Выстрел» and timers, «Упало здесь» with Para-Cam input, laser mode) → T6 markers → T7 OB and supply → T8 CMU/RuCM rules and levels → audit → T9 grid labels and ruler → T10 variable insert zones → T11 landmark glyphs → T12 sprites, NOTICES, docs, sitemap, goal registry, final audit.
**Rationale:** Product Manager (D6 3/10) — coordinates without range and permission checks spend the first ~23 h on output the game refuses half the time (LV-624: `mortarFire` on 19 381 of 38 850 tiles); CMU adds players (hub 2026-09-12 per PM: RMC14 157, Stories 128, CMU 47, RuCM 21) while inserts and landmarks deepen the same audience; System Architect and Devil's Advocate — validate one multi-level CMU planet before the schema freezes.
**Rejected:** the draft order (markers before strike checks, CMU after inserts and landmarks).
**Confidence:** high.

### 7. Map inserts: replay the game loop

**Chosen:** probabilities come from replaying `ProcessMapInsert` for each scenario of the planet — an ineligible variant still adds its probability to the running sum, so the draw passes to the next eligible variant; placement truncates `marker − 0.5 + variation offset` with `(int)`. Live data is checked only for invariants (ΣP ≤ 1 per marker); the loop is unit-tested on synthetic markers. Percentages stay in the UI.
**Rationale:** Domain Expert (D7 7/10) — a closed-form derivation is wrong for mixed-scenario markers; System Architect — golden probabilities would be rubber-stamped on every regen.
**Rejected:** an outline without percentages (Product Manager) — once footprints exist, replay makes percentages nearly free.
**Confidence:** high.

### 8. Fire geometry and mortar modes

**Chosen:** `TacticalLogic` takes the fork `family` and the mortar `mode`. Range and aim error run from the mortar tile centre (x + 0.5) to the integer target point, so the valid span along an axis for range 65 is M−64…M+65 and «too close» is asymmetric. Roof markers are measured from the aim corner to the roof tile centre. Laser mode has no aim error, dial or jitter and needs CAS + lasing + mortarFire outside landing zones. «Упало здесь» takes the epicentre tile or typed Para-Cam coordinates. The timer starts at firing, with an optional load-start mode (+1.5 s). The OB scatter box shows where the shell can land, not blocked ground — only cluster sub-blasts re-check protection.
**Rationale:** Devil's Advocate — tile centre vs corner math decides hits at the range edge and the dial variant; Domain Expert — laser mode, Para-Cam names, roof asymmetry, OB cluster semantics.
**Confidence:** high for RMC14/Stories; medium for CMU until T8.

### 9. CMU multi-level rules (spec correction)

**Chosen:** on CMU/RuCM a mortar or OB strike is allowed only if every non-opening surface in the column allows it; OB detonates on the lowest surface; mortar HE carves through up to 8 surfaces; placement needs open sky above plus the placement flag and is re-checked at fire time; ±1 jitter next to a blocked column is a refusal risk; range 8/165. Data: a per-weapon column permission mask and the OB terminal level per tile. An opening is an empty or `Transparent` tile. T8 re-reads `CMUTopDownOrdnanceSystem` before the UI states any of it.
**Rationale:** Domain Expert (D2 4/10, confidence 9); CMU refusal and impact redirection confirmed in `MortarSystem.cs`; the draft's «highest surface decides» row was wrong.
**Confidence:** medium until T8.

### 10. Storage per planet

**Chosen:** one localStorage key per planet (`chemdb-tactical:<fork>/<planet>`) plus a prefs key; a `storage` event listener reloads state written by another tab; in-memory fallback with a banner.
**Rationale:** Devil's Advocate — a single blob lets two tabs overwrite each other's markers.
**Confidence:** high.

### 11. Verification without trusting our own parser

**Chosen:** `scripts/test_tactical_logic.js` uses synthetic cases derived from game code (centre/corner geometry, laser mode, insert replay, calibration discrimination); `scripts/check_tactical.py` runs offline in CI; `python ss14_tactical.py --verify` builds into a temporary directory and compares with committed data without writing tracked files; browser checks run on the preview server. In-game verification is an owner step before any announcement: calibrate on a floor tile, lase three tiles including negative world coordinates, compare flare Para-Cam names with the tool; repeat on one CMU planet after T8.
**Rationale:** Devil's Advocate and Domain Expert (D10 3/10) — goldens produced by the same parser detect change, not truth; Product Manager — a 20-minute control round catches axis and click errors before depth work.
**Confidence:** high.

### 12. Fire cards mirror the fork's mortar window (UX Designer, round 1)

**Chosen:** two cards instead of one line. «Новая цель»: the target fields X Y are big, with a line «смещение 0 0» plus «(сейчас −2 −1)» when the mortar holds another dial. «Смещение»: only the dial is big, with a red line «цель не менять — уже 274 −210: нажатие „Установить цель“ перевыберет ошибку». Each card has its own «Выстрел» that records exactly that variant; the last shot can be undone. Field and button labels come from the selected fork's locale — RMC14 and CMU in English, Stories and RuCM in Russian (the dial button is «Dial Offset» in RMC14, «Установить смещение» in RuCM, «Откалибровать смещение» in Stories) — not from the page language. Copied numbers use ASCII "-". Refusals quote the fork's own popup text, mistranslations included. The page's calibration button reads «Сохранить сдвиг раунда».
**Rationale:** the mortar window pre-fills Target, and every «Установить цель» re-rolls the error even for identical input; a one-line «274 −210 +6 −4» invites exactly that click, and a shared «Выстрел» cannot tell which variant was entered.
**Confidence:** high.

### 13. Picking a tile, and staying out of the fight (UX Designer, round 1)

**Chosen:** a 4 px drag threshold separates panning from clicking; below 12 px per tile a pick for calibration or «Упало здесь» first zooms in around the point. The check point is compare-only: the page chooses a tile with |dx| ≠ |dy| relative to the first point, predicts the rangefinder numbers, and the player answers ✓ or ✗. «Тот же раунд?» appears after 20 minutes without input on the page (a second monitor never goes hidden), after a reload, or when a typed coordinate falls off the planet; there is no hour-based reminder. `tactical.html` sets a flag that `home.js` (`decideAutoShow`) and `feedback.js` (`surveyDecision`) honor, so neither the Sections intro nor the survey opens over the map mid-fight.
**Rationale:** LV-624 fits at ~4 px per tile on a 1080p screen, where the lased tile cannot be picked; `maps.js` pans without a threshold; `home.js` opens a full-screen overlay 800 ms after load when a card badge is unseen, and the new Sections card creates exactly that state.
**Confidence:** high.

Checked for these decisions: `Target`, `Offset` and `Dial` are assigned only in `OnMortarTargetDoAfter` and `OnMortarDialDoAfter`, so undeploying, redeploying, another operator or a mode switch keeps them — the «Смещение» card survives a relocation; only the range check changes.

## Vetoes raised and resolution

| Expert | Target | Reason | Resolution |
|---|---|---|---|
| UX Designer | D10 verification | numbers-to-type ship without one in-game run; per-fork labels were unverified | PARTLY RESOLVED BY decision 12 (labels read from the forks' locales) and decision 11 (owner's in-game run before any announcement); implementation proceeds under the owner's «просто реализуй», and the page carries a beta note until the owner confirms a run per fork family |
| System Architect | D3 formula fingerprints | a forever cache compares fingerprints with the first snapshot; goldens are hand-edited anyway | RESOLVED BY decision 1 (pinned SHA) and decision 3 (explicit mirror, whitelist field check, blob-SHA review flag, no formula regex) |
| Devil's Advocate | D8 calibration | the previous round's offset passes all checks; the optional check point misses swaps when dx = dy | RESOLVED BY decision 5 (age display, confirm after reload or idle, check-point discrimination, stale-impact hint); a mandatory re-measurement OVERRIDDEN because the owner chose one-point calibration |

## Open risks

| Risk | Severity | Mitigation | Status |
|---|---|---|---|
| CMU rules read from code, never observed in a round | high | T1 recon spike, T8 re-read, owner round on one CMU planet | NEEDS_SPIKE |
| Stale calibration in a new round | high | decision 5 | MITIGATED |
| Parallel sessions editing shared files | medium | decision 4; small commits after `git status` | MITIGATED |
| Nothing reaches players until the owner pushes | medium | ask for a push after T4; outreach kit from Series J | ACCEPTED |
| Upstream map churn (100+ commits in 6 months) | medium | regen per release; `sources` and `h` shown on the page | ACCEPTED |
| Calibration on tall sprites | low | hint text; landmark categories flagged | MITIGATED |

## Consequences

- The design spec is revised in place: mechanics table (CMU range, CMU column rule, laser mode, rangefinder requirements, Para-Cam, roof geometry, OB cluster semantics, insert replay), extractor sourcing and constants, data contract (`sources`, `h`, no cross-fork `file`), page layout under `tactical/`, calibration lifetime, storage, integration without `sw.js`/`i18n.js`/`style.css`, verification, increment order.
- Series T in `ROADMAP.md` follows decision 6.
- Weekly upstream drift workflow (System Architect proposal) goes to the series backlog: code paths change 0–4 times in six months, so the build-time REVIEW flag covers them for now.
