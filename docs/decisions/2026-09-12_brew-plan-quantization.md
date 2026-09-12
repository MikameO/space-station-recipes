# Decision: Brew plan — whole units, container batches, honest ingredients

**Date:** 2026-09-12
**Tier:** 2 (planner semantics shared by the calculator, the batch planner and the craft trees; touches app.js, i18n.js, index.html, style.css and the curated container data in config.py)
**Status:** accepted — decided synchronously with the owner (global CLAUDE.md, Tier 2 fallback: «провести решение синхронно с пользователем, зафиксировать в docs/decisions/»). Implementation = ROADMAP «Серия R».
**Method:** owner answered three scoping questions in-session; every claim below was reproduced on HEAD `3c6896f` in the preview browser (RU mode) or verified against upstream YAML the same day.

## Context

Player feedback (Discord, Trapd3re || Ая Горо, 15.08.2026 and 15.08.2026 23:41 — seven points), handed over by the owner 2026-09-12. Reproduced on HEAD, RU mode, batch plan for Cryoxadone 500u + Tricordrazine 300u + Bicaridine 700u + Leporazine 300u:

| # | Report | Verified on HEAD | Root cause |
|---|---|---|---|
| 1 | No pin / language buttons in Firefox desktop, present in Firefox mobile | `.header-right` content needs **583 px in EN, 612 px in RU** inside a `max-width: 560px` box with `flex-shrink: 0` on every button. At 1280 px: EN clips 📌 by 2 px, RU pushes it **52 px outside the viewport** (`elementFromPoint` → null). Below ~1150 px the whole block wraps to a second row and spills 24 px past `header{height:56px}`, overlapping the disclaimer bar by 20 px. At ≤768 px the header becomes a column — hence «works on mobile» | style.css:164 — audit finding B38, previously filed inside Q4 |
| 2 | Language switch needs a manual reload (Edge, Firefox mobile) | `location.replace()` is called after `u.searchParams.delete('lang')`, so when `?lang` is absent and a hash is present (`#tab=…`, always written by the app) the target URL is byte-identical to the current one → fragment navigation, not a reload. Blink reloads anyway, Gecko does not | i18n.js:59 |
| 3 | Fractions and English names in the planned brew | Steps print `esc(r.id)` — the **prototype id**, not `DATA.reagents[id].name` (so «TableSalt» even in EN), and the amount is an unformatted float: `166.67000000000002u Oxygen`. The shopping list next to it *is* localized — exactly half the output speaks Russian | app.js:2355, app.js:2802 |
| 4 | Butter is counted as if the dispenser had it | `identify_base_chemicals` calls everything without a producing reaction «base» → 561 base chemicals of which **only 48 are dispenser chemicals**. `Butter` already carries `isDispenser: false`, `obtainSources: ["Vending: ChefVend — stick of butter (30u)"]`, `accessibility.tier: cross-service` — the front end never reads those fields. Same class of bug as welding fuel in O22 | ss14_chem_extractor.py:533 + app.js shopping lists |
| 5–7 | 183u + 183u + 183u will not fit a 100/200u beaker; split it, in multiples of 100 | Step volumes of 500u and 700u are printed with no warning and no split. Catalyst plasma (55.56u + 150u) is **missing from the shopping list** entirely (audit B8) | no capacity model existed |

Container capacities, verified against upstream `Resources/Prototypes/Entities/Objects/base_solution.yml` (master, 2026-09-12) — our curated numbers are stale:

| Container | `config.py` DELIVERY_MECHANISMS | Upstream parent → maxVol |
|---|---|---|
| Beaker | 50u | `SolutionSmall` → **60u** |
| Large beaker | 100u | `SolutionNormal` → **120u** |
| Jug | absent | `SolutionLarge` → **240u** |
| Bluespace beaker | 300u | `SolutionGinormous` → **960u** |
| Cryostasis beaker | absent | `SolutionSmall` → 60u |
| Syringe / Hypospray | 15u / 30u | `SolutionToolTiny` → 15u / `SolutionToolSmall` → 30u ✓ |

The owner's recollection («60, 120 и 300, бывают ещё») matches upstream for 60 and 120; 50/100/300 are hand-written legacy numbers that also leaked into card prose («Standard beaker (50u)»).

---

## Decisions

### Decision 1: quantize the order to whole reaction runs, snapped to a 5u pour step
**Chosen.** For a target `x` define `q(x)` = the smallest whole amount whose entire subtree resolves to whole numbers under whole reaction runs:

```
q(leaf) = 1
q(x)    = produced(x) · lcm_i( q(child_i) / gcd(a_i, q(child_i)) )     // a_i = per-run reactant amount
```

The ordered amount is `ceil(requested / L) · L` with `L = lcm(q(x), 5)`, so dispensed and poured amounts land on the 5u click the dispenser and the solution-transfer component actually use. If that overshoots by more than 25 % of the request (and by more than 5u) the ladder falls back to `L = q(x)` — whole numbers without the 5u snap — and, failing that, to exact values printed at 2 decimals. The UI states the substitution: «нужно 500u → варим 540u · 180 циклов».

Worked example, Cryoxadone 500u: `q(Dexalin) = 3`, `q(Cryoxadone) = 3 · lcm(3, 1, 1) = 9`, `L = 45` → order 540u → 180 runs → 180 Dexalin + 180 Water + 180 Oxygen, and Dexalin's own 60 runs → 120 Oxygen + 60 Plasma (cat). Every number whole and divisible by 5, zero residue.

**Rationale.** The owner's own words: «Лучше делать округление и привязку к шагу в 5 единиц — так это легче делать при переливании с мензурок. Но в целом первый подход с квантованием по циклам реакции выглядит хорошо.» Rounding each printed number up independently (the literal request) breaks the ratio between levels — the parent step still asks for a fraction and the beaker keeps residue — so quantization has to happen once, at the order, and propagate down.
**Rejected.** (a) Per-number `Math.ceil` — leaves the tree inconsistent. (b) Printing exact fractions with better formatting only — the original complaint stands: you cannot dispense 170.36u. (c) Flooring to whole runs — a medic ordering 30u of a drug must not receive 27u.
**Conditions to revisit.** A fork whose reactions carry fractional per-run amounts would make `q` explode; the ladder's 25 % guard is the escape hatch, and the `quantized` field planned in Q2/B7 is where the extractor would record it.

### Decision 2: split each step into container batches by runs, and reuse the catalyst
**Chosen.** One capacity governs both planners. Per step, `volumePerRun` = Σ reactant amounts including the catalyst (it occupies volume); `runsPerBatch` = the largest multiple of 5 that fits `floor(capacity / volumePerRun)` runs, falling back to the plain floor when that would be zero. The step then prints as «×N порций по Vu» with the remainder as its own batch, and a step whose single run cannot fit the chosen vessel is called out as impossible there. A catalyst is required in proportion **per mix** but is not consumed, so the shopping list asks for `max` over batches and steps, not the sum, and says «катализатор — не расходуется».
**Rationale.** Closes points 5–7 and audit B8 in one model. Splitting by runs (not by volume) keeps every batch's numbers whole, which is the whole point of Decision 1; splitting by volume would reintroduce fractions at the batch boundary.
**Rejected.** Splitting by equal volumes (fractions return); asking the user for a batch count (they want the answer, not the arithmetic).

### Decision 3: capacity ladder from upstream, with a free numeric field
**Chosen.** The selector ships the verified vanilla ladder — beaker 60u, large beaker 120u, jug 240u, bluespace beaker 960u — plus «no limit» and a free number, because 21 forks may set their own `maxVol`. The stale `DELIVERY_MECHANISMS` capacities in `config.py` (and the prose that quotes them) are corrected separately, since that needs a data regen.
**Rationale.** Verify live samples before baking formats (the StorageFill→EntityTableContainerFill lesson); the numbers in our own data turned out to be wrong by 10–660 %.
**Rejected.** Reading capacities from `data.json` today — they are the wrong numbers. Hard-coding only 100/200 as the reporter remembered them — upstream says 60/120.

### Decision 4: leaf availability comes from the data we already extract
**Chosen.** Shopping-list rows are tagged from `isDispenser` / `obtainSources` / `accessibility.tier`: dispenser chemicals stay unmarked, everything else names its real route (vending machine, cooking, grinding, mob) and the list carries a warning when a leaf cannot be dispensed at all. No data change is required — only the front end reading three fields it already receives.
**Rationale.** «Масло как будто в раздатчике есть» is a display lie about data that is already correct; 513 of 561 «base» reagents are in that bucket, so the fix is systemic rather than a Butter special case.
**Rejected.** Splitting `baseChemicals` in the extractor — it feeds tree termination, «Fewest Steps» and the reverse lookup; changing its meaning is a schema change for a UI problem.

### Decision 5: localized names and formatted numbers at the source, never in the i18n dictionary
**Chosen.** Step and shopping-list renderers emit `capName(DATA.reagents[id].name)` and a shared `fmtU()` formatter. The RU layer is not extended to cover planner output.
**Rationale.** Measured on the live page: `window.__i18nMiss` collects every planner line («166.67u Dexalin», «Shopping List for 100u Oil Ghee») because the dictionary matches exact EN strings and each interpolated number makes a unique key. Any string with a number in it is permanently untranslatable there — so the numbers and names must be right before they reach the DOM.
**Rejected.** Growing the `T` dictionary (unbounded and always one number behind); translating in the MutationObserver (same problem, plus the observer-loop trap).

### Decision 6: the header stops dropping controls
**Chosen.** `.header-right` wraps and its buttons may shrink; the language toggle keeps a ≥44 px target at every width and is never the item that overflows. The language switch writes `?lang=<next>` instead of deleting the parameter, so the navigation is real on every engine.
**Rationale.** Point 1 is two one-line defects that cost a Firefox user two features; B38 stays in Q4 as the broader mobile/accessibility sweep.

## Follow-ups

- `config.py` DELIVERY_MECHANISMS capacities + the prose quoting them → ROADMAP R7 (data, needs regen).
- `quantized` per-reaction field from the extractor → already scoped in Q2/B7.
- The 60u/120u correction changes antag delivery-capacity text; the Steam guide and card prose must be re-read after the regen.
