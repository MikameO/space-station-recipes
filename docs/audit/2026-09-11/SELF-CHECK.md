# Phase 4 Self-Check — draft (orchestrator, 2026-09-11)

## Step 1 — Coverage matrix (computed: grep of each source path across findings/*.md)
Hand-written source files: 45 tracked non-generated files (JS/HTML/CSS/py/yml/md/config). Every one is cited by ≥1 agent report:
- Frontend (8): index.html T2 T3 T4 U1 · app.js T1-T4 U1 · ordnance.js T1-T4 U1 · i18n.js T1-T4 · maps.js T1-T4 · tutorial.js T2 T3 T4 U1 · sw.js T1-T4 U1 · style.css T2 T3 T4 U1 (a11y depth → U2)
- PWA/SEO (3): manifest.json T3 T4 · robots.txt T3 T4 · sitemap.xml T3 T4
- Pipeline (6): config.py T1-T4 · ss14_chem_extractor.py T1-T4 · ss14_map_extractor.py T1-T4 · ss14_ordnance.py T1-T4 · ordnance_reference.py T1 T2 T4 · sources.py T1-T4
- Scripts (6): _ss14_yaml T1 · audit_dead_reactions T1 · audit_fork_manifests T1 T4 · check_sources T3 · create_metrika_goals T2 T3 T4 · export_metrika_stats T2 T3 T4
- CI (4): deploy.yml T1-T4 · check-links.yml T1 T3 T4 · attribution.yml T3 T4 · strategy-inaccuracy.yml T3 T4 U1
- Docs (13): README T1 T3 T4 · CHANGELOG T1 T3 T4 · ROADMAP T1 T3 T4 · NOTICES T3 T4 · LICENSE T3 · .gitignore T1 T3 T4 · launch.json T3 T4 · 2 decisions T1/T4 · 5 design docs T3/T4 · plan doc T3 T4
- Generated artifacts (3 families): data.json T1-T4 U1 · maps/index.json + 114 maps + 15 prices T1 (all read) T2 (all scanned) · ordnance/stories_cm.json T1-T4
File coverage: 45/45 = 100%. "Routes" (runtime data endpoints: data.json, maps/index.json, maps/<fork>/<Id>.json, prices.json, ordnance/stories_cm.json, sw.js): 6/6 probed (U1 network log 170/170 OK; T3 curl on prod). Pages (tabs + modes): reagents, calculator, medbay, trees, botany, maps(+sell list), ordnance, forkdiff, antag, ?mode=companion, tutorial = 11/11 visited by U1; U2/U3/U4 pending.

## Step 3 — Spot-check of agent claims (orchestrator re-read the cited lines / re-ran the probe)
| # | Claim (agent) | Cited evidence | Verdict |
|---|---|---|---|
| 1 | T2 A2 — product name interpolated raw in "Produces:" | app.js:1222 `${DATA.reagents[id]?.name \|\| id}` no esc() | CONFIRMED |
| 2 | T2 D1 — 'all' mode returns reactions unsorted | app.js:1748 `if (activeSource === 'all') return rxns;` | CONFIRMED |
| 3 | U1-013 — closeDetail leaves selectedReagentId | app.js:1307-1310 clears detailHistory only; 1196 pushes stale id | CONFIRMED |
| 4 | U1-023 — openDetail('undefined') for 144 product-less reactions | app.js:2348 `Object.keys(rxn.products)[0]` | CONFIRMED |
| 5 | T2 A8 — esc() lacks `'` | app.js:2163-2166 | CONFIRMED |
| 6 | T2 D21 / T4 6.2 — Math.round vs banker's | ordnance.js:232 vs ss14_ordnance.py:357 `int(round(...))` | CONFIRMED (Python 3 round = half-to-even) |
| 7 | T3 2.4 — three forum sources point at forum root | sources.py:261,270,279 | CONFIRMED |
| 8 | T4 10.7/10.8 — display:flex without [hidden] override | style.css:3107 `.ord-fork-note{display:flex}`, :3154 `.ord-mask-modes{display:flex}`; ordnance.js:2288/2290, :1219 toggle `.hidden`; the maps/ord-field overrides at :2864/:3003 exist | CONFIRMED (code) **+ CONFIRMED runtime on PROD** (orchestrator, https://mikameo.github.io/space-station-recipes/, 2026-09-11 ~04:25): on fork stories_cm `.ord-fork-note` hidden=true yet computed display:flex, 43 px tall, elementFromPoint lands inside it, visible in screenshot ("Цифры взяты из форка Space Stories … Переключить приложение на него" shown while already on that fork); after goob→stories_cm the note stays. With zero masks in flat view `#ordMaskMode` hidden=true, display:flex, 28 px, chips "Маски выключены / Наложить маски / Только пересечение" visible next to "+ Добавить маску". → 10.7 BROKEN P1, 10.8 BROKEN P2, both runtime_verified. |
| 9 | T3 4.7 — 7 deploys with ordnance.js 404 | `git rev-list --count 316b2d5..6a6cde8` = 7; deploy.yml@316b2d5 has 0 "ordnance.js" | CONFIRMED |
| 10 | T3 4.7 / T2 D19 — addAll atomic + swallowed register error | sw.js:27-33; app.js:126 `.catch(() => {})` | CONFIRMED |
| 11 | T1 5.2 — upstream seeds.yml gone | curl: seeds.yml 404, plants.yml 200 (53.8 KB) | CONFIRMED |
| 12 | T3 1.8 — no branded 404 | curl bogus path → 404, 9,379 B GitHub default | CONFIRMED |
| 13 | T3 3.4 — gzip on data.json | curl -H gzip → 416,316 B | CONFIRMED |
| 14 | T1 5.7 — 523 empty descriptions, Goob 98/100 | python count | CONFIRMED (523; goob 98/100); "583 prettified names" plausible (my looser regex gives 913 incl. legit one-word names) |
| 15 | T2 E1 — loadData 3 attempts, 600·n ms backoff | app.js:110-120 | CONFIRMED |
| 16 | T4 2.2 — init() hard-requires DATA.edges | app.js:150 | CONFIRMED |
| 17 | T3 2.1 — cache/link_health.json is gitignored | `git check-ignore -v` → .gitignore:2 | CONFIRMED |
| 18 | T3 8.4 / T4 5.17 — NOTICES covers a fraction of forks | NOTICES has 1 GitHub URL (space-wizards) + 8 fork names | CONFIRMED |
| 19 | T4 3.3 — duplicate i18n keys From/To | i18n.js:156-157 vs 245-246 | CONFIRMED |
| 20 | T2 D3 — catalysts scaled in steps but never in baseNeeds | app.js:2031-2041 | CONFIRMED |
| 21 | T2 D22 — exclusion leaks via current-mix seed | ordnance.js:1853, 1934 | CONFIRMED |
| 22 | U1-030 — species chip with no physiology renders nothing | app.js:1658 `if (!p) { host.innerHTML=''; return; }` | CONFIRMED |
| 23 | U1-058 — no History API usage | grep pushState/replaceState/popstate → none | CONFIRMED |
| 24 | T1 2.2 — issue #2: Goob owns Oxandrolone, Funky copy dropped | data.json source=goob (SodiumCarbonate+Dermaline+Phenol+Leporazine); cache/funky medicine.yml:39 own recipe (Phenol…) | CONFIRMED |
| 25 | T1 1.2 — 2 phantom products | BeastBlood, MilkChoco not in reagents | CONFIRMED |
Spot-check failure rate: 0/25 (all confirmed). Report-quality gate (<20% failures): PASS.

## Repo-state incident during the audit
- 03:21:47 local: T1 ran `python ss14_map_extractor.py --selfcheck` (listed as read-only in RULES.md) → rewrote maps/vanilla/Bagel.json and Bagel.png (T3 and T4 both detected it independently). Orchestrator verified the modified set == exactly those two files and restored them with `git checkout --` at ~04:05. `ordnance/stories_cm.json` was rewritten byte-identically by `--verify` (tree clean). Working tree is back to HEAD + the 3 pre-existing untracked items.

## Step 5 — Disagreement resolution (technical department)
| Item | Positions | Independent check | Resolution |
|---|---|---|---|
| SW precache addAll failure | T2 D19: PARTIAL P3 "safe — old SW keeps serving" · T3 4.7: BROKEN P1 "SW never installed for every visitor for 93 min" | sw.js:27-33 addAll rejects → install fails; returning visitors keep the previous SW (safe); NEW visitors during the window had no SW at all (no offline, no data cache). Online app unaffected. | BROKEN → **PARTIAL, P1** (silent-failure class + realised incident; T3's "every visitor" holds for first-time visitors only). [DISPUTED → RESOLVED] |
| Star-ray rounding | T2 D21: BROKEN P1 · T4 6.2: PARTIAL P2 | Both computed the same divergence (T2: 85/2,577 sweep cases; T4: 6 casings at fr floor 3.0). Wrong tile count in a calculator whose value is exactness; 3-line fix. | **BROKEN, P1** (invariant 7 violated; --verify blind to JS). [DISPUTED → RESOLVED] |
| Dead payload in data.json | T1 1.4/9.6: P3 · T4 2.2: P2 (433 KB, 11.3%) | T4's figure is script-computed; mobile 29% of users; gzip shrinks it but the parse cost stays. | **PARTIAL, P2** [2/2] |
| Client schemaVersion check | T1 10.2 P3 · T2 D19/E5 P2-P3 · T3 4.9 P1 · T4 2.5 P2 | All schema changes so far additive; SWR serves old data for one load after a breaking regen; blocks dropping `edges`. | **MISSING, P2** [4/4 flagged; severity median] |
| Metrika webvisor / consent | T3 8.1 BROKEN P1 · T2 B1 UNCERTAIN P3 (field-recording setting unknown) · T4 4.5 FUNCTIONAL (README discloses) | index.html:85 `webvisor:true, clickmap:true` before any interaction; no in-app notice; ~15% EU users. README disclosure ≠ consent. | **BROKEN (compliance), P1** — owner policy decision; one-flag mitigation. [3 lenses → reconciled] |
| Google Fonts @import | T3 3.12 P1 · T4 9.5 P3 | style.css:13; render-blocking + not cached by SW + third-party IP transfer. | **PARTIAL, P2** [2/2] |
| NOTICES coverage | T3 8.4 P1 · T4 5.17 P2 | Verified 1 URL + 8 names of 21 forks; sprites/xenos from stories_cm unattributed. | **PARTIAL, P1** (licence obligation) [2/2] |
| --selfcheck / --verify write tracked files | T1 4.3 BROKEN P1 · T4 10.9 P2 | Reproduced in this audit (git status dirty). | **BROKEN, P1** [2/2 + orchestrator] |
| check-links auto-commit no-op | T3 2.1 P2 · T4 5.18 P3 | check-ignore confirms. | **BROKEN (step), P2** [2/2] |
| Tutorial step targets | T2 D17 FUNCTIONAL (all selectors exist) · U1-004 DEFECT (step 4 spotlights an off-screen 8px sliver) | Both true: the target exists but is not visible. | **PARTIAL, P2** [CROSS-DEPT RECONCILED: Tech OK, UX DEFECT → PARTIAL] |
| Ordnance tab visibility | MANIFEST/ROADMAP/design doc say "hidden on other forks" · T4 5.10 (code shows tab always + note) · U1-039 OK (tab always visible + note works) | Runtime confirms T4: tab always shown; the note is the fork gate. Docs stale. | Code = design change (intentional per ordnance.js:2280-2284); docs PARTIAL P3. |

## Step 6 — War-room trigger evaluation (preliminary)
- A CROSS_DEPT_CRITICAL: no P0 items exist → not met.
- B ARCHITECTURAL_CLUSTER: needs 3+ P0 in one module → not met at P0. NOTE: a P1 cluster exists — the single-owner fork merge model (T1 2.2, 2.3, 2.4, 2.5, 2.6, 1.3, 1.13 + T2 D1, D4, D5, D6): 11 findings, one design decision (per-fork membership sets vs single owner; recipe-selection policy). Recommend a dedicated /war-room (Tier 2 per global CLAUDE.md) BEFORE implementing — flagged in Part VI/IX, not run inside the audit (trigger threshold is P0).
- C PERSISTENT_DISAGREEMENT: all tech disagreements resolved above → not met.
- D FORCED: --war-room not set.
→ War-room NOT triggered.

## Step 0 — Cross-department reconciliation (U1 + U2 vs T1-T4) — added after U2
| Item | Tech view | UX view | Check | Resolution |
|---|---|---|---|---|
| Ordnance tab gating | T4 5.10: code shows tab always + fork note (docs stale) | U1-039 OK: tab visible on all forks, note + "Switch" button work | Runtime (prod): note never hides on stories_cm (T4 10.7) | Design change intentional (docs PARTIAL P3); the note element itself BROKEN P1 [CROSS-DEPT RECONCILED: Tech BROKEN, UX OK-but-missed → BROKEN] — U1 tested the foreign-fork state only. |
| Tutorial step targets | T2 D17 FUNCTIONAL | U1-004 DEFECT (step 4 spotlight = 8px sliver of closed panel) | both true | PARTIAL P2 [RECONCILED] |
| Pin callout over tutorial | T2 (no finding; code comment says deliberate) | U1-002 major (40% of last card covered) | app.js:3274-3277 confirms deliberate | DEFECT P1 (UX) — owner decision flagged |
| Loading overlay | U1-001 OK (pointer-events none, inert for mouse) | U2-023 DEFECT (opacity:0 keeps it in a11y tree, z 10000) | both true | PARTIAL P3 [RECONCILED] |
| Detail panel closed state | T2 (no finding) | U2-011 stays in a11y tree, focusable close button; U2-010 no focus management; U1-014 close/back scroll away | style.css:1513-1528 | PARTIAL P1 (a11y) + P2 (UX) |
| Autocomplete keyboard | T2 (no finding — click-only handlers not flagged) | U2-002 critical: app.js:2095-2157 no keydown; all downstream gated on click-set ids | code confirms | **BROKEN P1** (WCAG 2.1.1 A; product severity P1 not P0 — core loop still mouse-usable) [GAP in Tech coverage: keyboard operability was not on T2's checklist] |
| Mobile header overflow | T2 F (no finding) | U2-048 critical: `.header-right` no flex-wrap, body overflow hidden → help/share/PiP (+lang at 360px) unreachable on phones | style.css:164, 2489-2490 | **BROKEN P1** (29% mobile users; core loop intact → P1 not P0). U4 to corroborate → consensus. |
| Contrast tokens | — | U2-035..038: ~20 pairs < 4.5:1 via `--text-ghost` and `--phosphor-dim`; antag result count 1.82:1 | computed WCAG luminance | DEFECT P1 (single-token fix) |
| i18n aria-labels | T4 3.1: 21 Ordnance aria-labels + 10 chrome strings untranslated (static) | U2-042: 28 English accessible names in RU mode (runtime) | same set | PARTIAL P1 [2/2, static+runtime] |
| Disclaimer panel RU | T4 3.1 (2 fragments untranslated) | U2-045 whole legal panel English | same | PARTIAL P2 [2/2] |
| toggles aria-pressed | — | U2-026 (antag, heal chips, maps chips, diff chips) | app.js:580/2827 do it for effect chips | DEFECT P1 (a11y) |
| Toast live region | — | U2-021 | index.html:747 | MISSING P2 |
| Species chips no-op | T1 (species 2 curated in data.json; 8 physiology) | U1-030 major: 9/17 chips do nothing | app.js:1658 | DEFECT P1 [RECONCILED] |
| Reverse lookup product-less rows | T1 1.2: 144 zero-product reactions legitimate | U1-023 BROKEN: `openDetail('undefined')` rows | app.js:2348 | BROKEN P1 [CROSS-DEPT: data legit, UI broken] |
| Reverse lookup fork filter | T2 D5 BROKEN P2 (5/11 foreign) | U1-023 (not tested for fork) | code | BROKEN P2 [T2 only; UX not contradicting] |
| Header meta static | — | U1-018 | app.js:185-186 | DEFECT P2 |
| Back button / URL state | T2 D12 (share round-trip incomplete) | U1-058 major: no history entries; U1-059 share failure advice wrong | grep confirms no History API | DEFECT P1 (UX) + P2 (T2) [RECONCILED: same root cause — state lives only in the Share hash] |
| Companion mode one-way | — | U1-051 major, U1-053 PiP navigates same tab in this pane (medium confidence) | app.js:3258-3271 no null check | MISSING P1 (back link) + PARTIAL P2 (popup feedback) |
| Botany search below 2.8k-px chart | — | U1-033 | DOM | DEFECT P2 |
| Hint tooltips clipped | — | U1-034; U2-027 (pseudo-element not exposed to AT) | style.css:1120-1149 | DEFECT P2 [2 angles] |
| Sell list visibility | memory: `[hidden]` fix at style.css:2864 | U1-038 OK (screenshot-verified close) | T4 10.1 confirms rule | FUNCTIONAL [3/3] |
| RU toggle | T4 3.6 (share drops lang) | U1-047 OK (persist, html lang) ; U2-047 OK | — | FUNCTIONAL, with P3 share gap |
| Console/network | — | U1-061: 0 console errors, 170/170 200 OK; U2: no console errors | — | FUNCTIONAL [2/2] |

## Step 0 (cont.) — U4 vs Tech/U2 reconciliation
| Item | Positions | Resolution |
|---|---|---|
| Google Fonts @import | T3 3.12 P1 · T4 9.5 P3 · U4-001 P0 (prod Slow-3G trace: chain index→css→googleapis→gstatic = 14.2 s critical path, RenderBlocking savings −4.3 s FCP/LCP) | **PARTIAL P1** [3/3 agree on defect; severity median P1; U4's trace is the strongest evidence] |
| data.json fetch gated behind DOMContentLoaded + 3 deferred scripts | U4-002 P0 (starts 14.0 s, ends 24.4 s on Slow 3G) · T2 E1 FUNCTIONAL (retry logic) — different aspect | **DEFECT P1** (new; U4 only, runtime_verified on prod) |
| Fewest Steps sort cost | T2 F3 PARTIAL P3 (code: O(reagents×reactions) once, memoised) · U4-003 P0 (12.2 s blocked at 4× throttle mobile; 2.2 s desktop; re-paid per fork switch) | **DEFECT P1** [DISPUTED → RESOLVED by measurement: T2 under-weighted mobile; same root cause = no product index] |
| Fork filter switch 902 ms mobile | T2 F3 (reagentInFork find over all reactions per reagent) · U4-010 P1 | **DEFECT P1** [2/2 same root cause] |
| Load More O(n²) re-render | T2 F3 (`innerHTML +=` double parse) · U4-005 P1 (full re-render each click, 34k nodes, 146 MB heap) | **DEFECT P1** [2/2; U4's measurement sharper: it is `grid.innerHTML = showing.map(...)` — full rebuild] |
| Header overflow on phones | U2-048 P0 · U4-004 P0 (505 px intrinsic, body overflow-x hidden, sweep 360-480) | **BROKEN P1** [2/2 UX consensus; product rubric P1 since core loop intact — see normalization note] |
| Maps touch-action:none / no pinch; sell-list money columns off-screen | U4-006/007 P1 · U2 (no mobile maps finding) | DEFECT P1 [U4 only, geometry runtime] |
| 100vh shell, no dvh | U4-009 P1 (code_analysis + structure) | DEFECT P1, MEDIUM confidence (not reproducible in emulation) |
| Lazy-load maps.js/ordnance.js | U4-014 P1 · T3 10 (deferred: "splitting data.json" — different) | DEFECT P1 (new) |
| Mobile font sizes / tap targets | U2-040 P3 (8.8 px badges) · U2-049 P2 (targets) · U4-017 P2 (1,221 elements <12 px; 62/62 ordnance controls <44) | **DEFECT P2** [3/3] |
| manifest id/screenshots/maskable | T3 4.2/4.3 P2-P3 · U4-022 | PARTIAL P2 [2/2] |
| Lighthouse a11y contrast + label-content-name-mismatch | U2-035..038 (computed) · U4-027 (Lighthouse 97, same nodes) | DEFECT P1 [2/2 independent methods agree on the same nodes] |
| Map JSON not memoised (re-fetch on re-select) | T2 D20 (prices cached; map load race) · U4-020 | DEFECT P2 [2/2 complementary] |
| Metrika tag.js 97 kB gz (19 % of first-visit payload) + 18 third-party cookies | T3 8.1 (privacy) · U4-015 (perf) | PARTIAL P2 (perf) — merges with the P1 consent finding |
| Tutorial card inline maxWidth 380 px beats mobile CSS | U4-011 P2 · U1-004/005 (other tutorial defects) | DEFECT P2 |
| CLS 0.00, viewport meta allows zoom, detail panel/sidebar on mobile OK, search 1.3 ms work | U4-012/016/025/023 OK | FUNCTIONAL |

## Priority normalization (applied in Part I)
Agents graded severity with their own lenses (U2/U4 used P0 for WCAG-A and Core-Web-Vitals failures). The report applies the shared rubric from RULES.md: **P0 = production-breaking for all users, data-corrupting, or a live security hole; P1 = this sprint (a cohort blocked, a wrong number in a "verified" calculator, a compliance exposure, a silent-failure class that already fired); P2 = next sprint; P3 = backlog.** Under that rubric the audit found **no P0**: production is up, prod == HEAD, data is deterministic and clean, and no live XSS exists. The four items U2/U4 rated P0 (keyboard-only autocomplete, phone header clipping, 3G cold load, Fewest-Steps freeze) are P1 with the agents' original grade recorded next to them.

## Step 4 — Cross-cutting concerns (orchestrator)
- Dead code: 0 unreferenced JS functions (T4 8.1); 1 dead CSS selector `.badge-modified` (T4 8.2); 10 dead i18n keys + 3 RX rules (T4 3b); `edges` dead data (T4 2.2); orphan logo SVGs ×4 (T3 7.10/T4 1.5); `ordnance_pareto_use` retained deliberately.
- Orphan endpoints: n/a (static). Runtime endpoints all consumed (T4 1b).
- Unused schema fields: 433 KB (T4 §2 list).
- Doc-code mismatches: 20 rows in T4 §5 (README openpyxl/20 forks/architecture, CHANGELOG ~13 KB/Pareto/no O6-O19, ROADMAP header 3.4.2/A5 dup/rev 1.5+1.7 dup/E4/§0.2 sw.js, design-doc ordnance item 5 not built, meta/JSON-LD numbers ×4, attribution.yml dead link, decision "21 renamed" vs 20, maps legend 3/4 kinds, loreWarnings claimed not rendered).
- Undocumented features: ordnance JSON keys `fires/targets/recipes/nonFillable` (no CHANGELOG/schema bump); Ordnance tab visible on all forks (docs say hidden).
- Env consistency: only METRIKA_TOKEN (env/.env), documented in script docstrings; no .env.example needed (single owner). Python version drift 3.11 (CI) vs 3.14.3 (local); no requirements.txt.
- i18n completeness: T4 §3 static lists + U2-042/045/046 runtime = consistent.

## Step 3 (cont.) — spot-checks of U3 claims
| # | Claim | Cited evidence | Verdict |
|---|---|---|---|
| 26 | U3-009 — shared `#q=` arrives unfiltered | app.js:179-181: `decodeURLState(); restoreSession(); renderReagents();` (no query arg) | CONFIRMED |
| 27 | U3-010 — `botany` missing from validTabs | app.js:3073 list of 8 vs index.html data-tab set of 9 (botany absent) | CONFIRMED — T4 10.6 verified the whitelist mechanism but missed the omission (coverage gap closed by U3) |
| 28 | U3-032 — loadMap race, last-to-resolve wins | maps.js:71-84: `S.mapData = jr` after `await Promise.all` with no sequence token | CONFIRMED (T2 D20 predicted it as "minor race") |
| 29 | U3-039 — non-numeric `at` bypasses TTL | app.js:37 `!raw.at || Date.now() - raw.at > SESSION_TTL` → NaN compare false | CONFIRMED (T2 D15 noted "harmless") |
Spot-check failure rate: 0/29.

## Step 0 (cont.) — U3 vs Tech/U1/U2 reconciliation
| Item | Positions | Resolution |
|---|---|---|
| Live XSS via inputs/URL | T2 A: 0 payloads in data, 14 latent unescaped sinks · U3-016: all 9 inputs + `#q=` escaped at runtime, no img/svg created | FUNCTIONAL today (runtime) + latent P1 hardening (code) [2/2 consistent] |
| `__proto__`/`constructor` keys | T2 D14 P3 · T2 D24 (masks) P3 · U3-006/011/041 P2 (runtime: 459 KB phantom panel; Maps "Failed to load map" + repeated TypeError on every draw; Ordnance flat view throws) | **PARTIAL P2** [runtime confirms code review; severity raised by the persistent console errors] |
| `#tab=antag` without antag=1 | T2 D13 P3 · U3-003 P2 | PARTIAL P2 [2/2] |
| `sort=steps-asc` dropped | T2 D12 P2 · T4 10.6 P3 · U3-008 P2 | PARTIAL P2 [3/3] |
| `?lang=` raw value persisted | T2 A17 P3 · U3-013 P3 | PARTIAL P3 [2/2] |
| Typed-not-picked autocomplete no-op | U2-002 (keyboard) · U3-019 (mouse+typing) | same root cause → merge: **BROKEN P1** (a11y) with the UX no-op aspect |
| Batch Plan empty no-op / stale plan | U1-022 · U3-029 | PARTIAL P2 [2/2] |
| Back button leaves site | U1-058 · U3-035 | DEFECT P1 [2/2 UX] |
| Mask colour CSS injection (self-inflicted) | T2 G4 P3 · U3-042 P2 | PARTIAL P2 (stored-state → UI injection; no cross-user vector) |
| SW cache growth per query string | U3-045 (new, cosmetic P3) · T3 4.10 (maps in versioned cache) | PARTIAL P3 (+ merges into the SW cache design item) |
| `#q=` unfiltered on arrival | U3-009 (new) | **BROKEN P1** — every shared search link is wrong; T2 D12 tested encode/decode symmetry but not the post-decode re-render |
| `#tab=botany` not whitelisted | U3-010 (new) | **BROKEN P1** — Share from Botany opens Reagents; docs/T4 claim "whitelist OK" corrected |
| Map select race | T2 D20 (predicted) · U3-032 (reproduced) | **BROKEN P1** [DISPUTED severity → RESOLVED by reproduction] |
| Maps ignores active fork | U3-027 (new) P2 | PARTIAL P2 |
| Calculator amount validation | U3-018 (new) P2 · T2 (no finding) | PARTIAL P2 |
| Beaker temp 0→293 silently | U3-022 P3 | PARTIAL P3 |
| Header result counter stale on other tabs | U3-047 · U1-018 (header meta static) | PARTIAL P3 / P2 |
| 404 page | T3 1.8 P2 · U3-001 P3 | MISSING **P2** [2/2; growth lens] |
| Storage corruption resilience, XSS negative, boundary inputs, double-click, rapid tabs, malformed hash, ordnance clamps, empty states | U3 OK ×22 | FUNCTIONAL |
