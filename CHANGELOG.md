# Changelog

`data.json` schema version is in `meta.schemaVersion`. Consumers reading this file
should pin on a compatible range (semver: breaking changes bump major).

## Series D7 — 2026-09-12 (what stops potency, and where)

**Frontend — two sections on the Botany tab.** "Random mutations" lists the
table of the fork on screen: what each roll changes, the range it moves in, its
step, whether rolling it again takes it back off, and the chance per 15-second
growth cycle at 1u, 5u and 25u of mutagen in the tray — sorted by chance, so
`Unviable` (11% at one unit) sits above `ChangePotency` (3.6%), which is the
whole point. Under it, "All forks" names what actually differs: Frontier has no
gas mutations, Misfits is down to 18, Carpmosia's Saltpetre and Trauma's Reaper
Delight raise potency with no ceiling at all (vanilla's only potency reagent,
Sedin, subtracts).

**Curated — "Mechanic limits" (schema 3.12.0, `botanyMechanics`).** The caps
the YAML cannot carry, read off upstream C# by hand and filed under
`mk-botany-mechanics` with the file list and the date: Robust Harvest adds 3 a
tick to a hard 50, makes the plant seedless past 30 and then trades yield at a
10% chance a dose; a tray tick is 3 seconds and consumes 1 unit of each reagent
whatever the amount poured, a growth cycle is 15, so the units sitting in the
tray are the severity of the next roll; produce saturates at (Max − Min) ×
PotencyDivisor potency, which is 70 for Ambrosia Deus; diethylamine is the only
uncapped way to raise the health ceiling. Each section carries the text of the
era the selected fork runs — the ladder's six rungs and its 1 − n/5 step, or the
±15 of the current model — and that era comes from extracted data, not from a
hardcoded list.

The rendering lives in its own `botany.js` rather than in `app.js`, which is
already 168 KB, and wires itself through `app:ready`, the tab button and the
Source filter, the way `maps.js` and `ordnance.js` do. Verified in the browser:
ADT flips the header and all three era notes to the ladder text and potency to
3.6/18/90%, Misfits and Frontier show their differences while Sunrise shows
none, RU translates section titles, headers, trait notes and the whole curated
block, no console errors, and at 375 px the table scrolls inside its own
wrapper with the page itself not scrolling sideways. Cache-bust
`style.css?v=64`, `i18n.js?v=39`, `botany.js?v=1`, service worker `chemdb-v85`.

## Series D6 — 2026-09-12 (the rolls behind the evolution chart)

**Data — the random mutation table, per fork.** The Botany tab knew which
species turns into which and nothing about the rolls that get you there:
`randomMutations.yml` was not extracted for any fork, so nothing on the site
said that `Unviable` (odds 0.109) is three times likelier than `ChangePotency`
(0.036) — that the mutagen ends a line more often than it improves one. The
file now ships with every fork's manifest and lands in `data.json` as
`plantMutations` (schema 3.11.0, 30 KB): 27 mutations with odds, target,
range, step semantics, whether the effect persists, whether it reaches the
produce, and whether it can be rolled back off.

It exists at the same path in all 21 registry repos, but in two incompatible
schemas — upstream rewrote botany on 2026-08-08 (#44576). The old one is a
thermometer ladder (`minValue`/`maxValue`/`steps: 5`) that snaps potency onto
30/44/58/72/86/100; the new one moves it by ±15 inside `applyRange`. Six forks
run the new model (vanilla, corvax, cmu, rucm, deadspace, trauma), fifteen
still run the old one, and which is which is read off the file's own shape, so
a fork migrating upstream needs no change here. Deltas are therefore keyed per
era, not against vanilla: a ladder fork diffed against the range-era base would
mark every stat mutation as overridden by construction.

Names drifted with the eras too — `ChangeIdealHeat` against
`ChangeLow`/`ChangeHighHeatTolerance`, `ChangeLigneous` against
`Lignification` — so the diff runs on families. Without that, thirteen forks
report differences they do not have and the two real ones are buried: frontier
dropped the gas mutations (25 entries), misfits is down to 18, having also
dropped `Sentient`, `Slippery`, kudzu, heat and both pressure tolerances.
Vanilla's second list (`EvilPlantMutations`, which no mutagen triggers) is
kept out of the count and carried separately. Regen ×2 byte-identical.

## Series Q2 — 2026-09-12 (the recipe the calculator means)

**Frontend fix — which reaction is "the recipe".** `getFilteredReactions`
ranks a reagent's producers and `rxns[0]` feeds the calculator, the batch
plan, the craft trees, "Fewest Steps" and now the detail panel (`pickRecipe`).
Under Source = All it used to return data order, i.e. alphabetical reaction
id, so Monolith's `FentanylSolidification` and ADT's `ADTOmnizineBreakdown`
were the default Tricordrazine and Diphenhydramine recipes: 30u
Diphenhydramine planned 62 steps and 1800u of mercury (Discord report
2026-07-31, audit 2026-09-11 D1/C2). The ranking is now: a reaction that
consumes as much of the target as it makes is dropped in every mode; a
reaction named after the target, or with the target as its only product,
beats byproducts and centrifuge breakdowns, ahead of lineage; then closest
lineage (the fork on screen, its parents, vanilla; under All the reagent's
own fork, then vanilla); then the extractor's `r.recipe`; then fewer
reactants. 30u Diphenhydramine is 4 steps, 120u Tricordrazine 3 steps on
Monolith as well, Siderlac 1. Mixing steps and the panel's Recipe heading
carry a fork badge when the reaction is not vanilla, and the "+N alt recipes"
count follows the Source filter. Regression suite: `node
scripts/test_recipe_ranking.js`, 23 cases on the real `data.json` (21 failed
on the previous code). `data.json` is unchanged; two reagents (Protein,
Ipecac) carry an extractor `recipe` that is a byproduct pick — the app now
shows the direct recipe, the data-side fix is filed under Q6. Same-day follow-up:
the reagent cards (main grid and Botany tab) print the same ranked recipe on
their chip line instead of the extractor's `r.recipe`, so under RMC14 the
Vodka card says Enzyme + Black Goo + Potato Juice like the panel does; base
chemicals keep their `r.recipe` chip. Cache-bust `app.js?v=41`, service
worker `chemdb-v86`.

## Series P — 2026-09-12 (Botany: plant-healing group, Botany as a second category, value ranges)

**Data fix — `plantEffects.group`.** `PlantAdjustHealth` used to land in the
`care` ("Growth & Care") bucket whatever its sign, so that filter was 145 plant
poisons to 26 healers — useless for "what do I feed a dying plant". The
extractor now splits it the way it already splits weeds and pests: a positive
adjust is the new `health` group, a negative one is `harm`. Across the 1387
reagents this touched exactly the 171 carrying `PlantAdjustHealth` and nothing
else; `care` 1182 → 1011, `harm` 78 → 223, `health` 0 → 26. `data.json`
schema is unchanged — `health` is a new value of an existing field, so a
consumer that does not know it simply sees an unfamiliar group string.

**Botany is now a second category, not a replacement.** A reagent's category
mirrors the game's own `group` field, which is why Unstable Mutagen is a Toxin
and Radium an Element — only 18 of the 221 plant-affecting chemicals sit in the
Botany category upstream. Rather than diverge from the game, the Categories
filter matches Botany a second way: any reagent the Botany tab would list. The
category shown on the card stays the game's own, with a secondary Botany badge
while that filter is active. Botany goes from 19 to 222 matches, and of the 649
reagents with no plant effect at all, none leak in.

**Botany tab — filters above the fold.** The effect chips and the chemical grid
now sit above the Plant Evolution forest instead of below it. The forest renders
expanded by default and is tall enough that every filter control was off-screen,
which is why the Mutation chip went unfound. New chip: Plant Healing.

**New — value ranges.** A collapsed panel under the chips carries one row per
plant effect kind that has a numeric amount (10 of the 18 kinds; the eight
flag-only kinds stay chip-only). Tick a row and set its bounds; several ticked
rows must all match, which is how you ask for a mutagen that does not poison the
plant. Because a plant effect is an *adjustment*, carrying none of a kind counts
as zero — one rule that keeps "mutation level ≥ 1" to real mutagens while
letting "plant health ≥ 0" admit chemicals that leave the plant alone. Bounds
are computed once over the whole dataset, so they do not shift while filtering.
Clearing a bound drops that side of the inequality and the field shows the data
bound as a placeholder with its glyph dimmed — `Number('')` is 0, not NaN, so
the obvious finite-check silently pinned a cleared maximum to "≤ 0".

**Ranges follow the Source filter.** The bounds are computed over the reagents
the fork filter lets through, so a vanilla view no longer offers a range only a
fork can reach: mutation level reads 0.6…1 on vanilla rather than −1…3 (the
−1 is funky's Mutadone, the +3 trauma's UnstableCompound). Six of the ten kinds
change between "all" and vanilla. A kind the selected fork has none of loses its
row, and its constraint is dropped with it — otherwise the grid would keep
filtering on a control that is no longer on screen. Fields are no longer
prefilled: the bound lives in the placeholder, so grey means "this side is open,
and it follows the fork" while black means "you typed this, and it survives the
switch".

**A ticked row requires its effect.** Treating "carries no effect of this kind"
as an implicit zero read elegantly and was wrong in use: any range spanning zero
— pests 0..2, weeds 0..10 — then matched every chemical that has no such effect
at all, so ticking those rows appeared to filter nothing. A ticked row now means
"this effect is present and inside the range", which also gives the tick alone a
meaning it lacked: has this effect, any amount. The old reading survives as an
explicit per-row "+ none" button, which is how you ask for a mutagen that leaves
the plant alone. Zero results with rows ticked now explains itself: the empty
state counts the active conditions and points at that button.

**RU — plant effect chips.** The chips are composed at extract time as
"<label> <signed amount>" (optionally a probability), so they could never be
exact dictionary keys and stayed English on an otherwise Russian tab. Two regex
rules now translate the label half and keep the number; all 101 distinct chips
render in Russian. The probability-only rule has to sit after the amount one —
a matching regex ends the lookup even when its handler declines, so the broader
pattern would otherwise capture "Pests -1" as a label and stop the chain.

## Series G — 2026-09-11 (Document library: new page, new data folder)

**New page:** `library.html` + `library.js` — in-game papers written by players
(doctrines, field manuals, role memos), stored verbatim as SS14 paper markup
under `library/` and rendered the way the game shows them (colour, bold,
italic, headings, bullets, mono). A Markup view with a copy button and a
`N / 10000` counter (`PaperComponent.ContentSize`, same in vanilla and RMC-14)
lets a player issue the paper again in-game.

**New data file:** `library/index.json` (schema 1) — one entry per document:
`id`, `title`, `role {en, ru}`, `fork`, `forkName`, `lang`, `kind`, `file`,
`author`, `provenance`, `received`, `notes`. First document:
`rucm-staff-officer-doctrine` (Russian Marine Corps, Staff Officer doctrine,
9549 chars). `data.json` schema is unchanged.

Design: `docs/design/2026-09-11-document-library.md`.

## Series O — 2026-09-10 (Ordnance: casing mixture calculator; new fork, new data file)

**Fork:** `MetalSage/space-stories-cm14` joins the registry as **fork #21**
(Space Stories — Marine Corps Core, parent `rmc14`). Its own contribution is the
explosives branch — cyclonite, octogen, ANFO, ammonium nitrate, hexamine,
paraformaldehyde — **+18 reagents, +12 reactions**, all carrying Russian names
from the fork's native ru-RU locale. The fork ships no en-US locale for its own
reagents, so English names fall back to the prettified id. `data.json` schema is
unchanged and the regen is purely additive (1369 → 1387 reagents, nothing lost).

**New data file:** `ordnance/<fork>.json` (schema 1, ~13 KB), built by
`ss14_ordnance.py`. It mirrors `OrdnanceExplosionSystem.CalculateExplosionStats`
and `GetEngineExplosionParams`, the five `IExplosionModifierEffect` classes, and
the `OrdnanceCasingComponent` defaults — 34 reagents with power / falloff / fire
modifiers and flame colour, plus 10 casings with their ceilings. It reads its own
manifest rather than the chem merge, because the explosion fields live in fork
copies of the `_RMC14` layer that first-wins dedup discards.

`ordnance_reference.py` locks 17 mixtures from the Marine Corps Core field guide;
every regen replays them and warns on drift. **16 reproduce exactly**; the one
outlier is welding fuel, whose effect potencies run at double the published
values on the live server — documented drift, not a parser bug.

**Frontend:** new **Ordnance** tab (`ordnance.js`), shown only on the fork that
has an ordnance layer. Mixture builder with live detonation stats (power,
falloff, blast radius, peak damage, shrapnel, fire, star, flame colour), a curve
chart, a two-reagent heatmap, and a Pareto search for the cheapest mixture
reaching a chosen share of the casing's best result. Cost is derived from the
reaction graph in `data.json`, not hand-entered.

**Why it matters:** falloff clamps at 25 before power reaches the casing ceiling,
so blast radius peaks on a *cheaper* mixture than the strongest one. An M15 at
90 % power reaches **7.92 tiles against the maximum mixture's 7.86** and costs
**55 % less phoron**; the mortar case is starker — 90 % power buys 22 % more
radius for 30 % less phoron. Spec:
`docs/design/2026-09-10-ordnance-calculator.md`.

## UI A1.1 — 2026-07-28 (Metrika-verdict removals; frontend only, no schema change)

Checkpoint-2 data (17 days of goal events, dev-noise days excluded) sentenced the
Advanced dropdown: **Stats 0%, Graph 1.4%, Reactions 1.4%** of organic tab opens
against the "<1–2% → remove" bar set in ROADMAP A1. Removed: the three tabs with
their render code (~500 lines), the `strategy_to_batch` bridge button (0 uses in
17 days; antag mode itself stays — 54 activations), and **vis-network** (libs/,
sw precache, deploy manifest — the last third-party JS dependency; NOTICES entry
dropped). Fork Diff moved from the retired dropdown into the main tab bar.
Old share links with `?tab=stats|graph|reactions` fall back to Reagents via the
`decodeURLState` whitelist. Analytics: goal registry trimmed to sent events
(counter goals kept for history); earlier the same day 18 missing goals were
created for post-07-12 features (maps_*, medbay, beaker sim, presets, PiP…),
whose conversions had been silently dropped. Full numbers:
`research/site-analytics-2026-07-28/`.

## 3.10.0 — 2026-07-26 (L10n-RU: Russian localization, phase 1)

**Data:** reagents gain optional `nameRu` / `descRu` / `physicalDescRu`, plants
gain `nameRu` — resolved from the **native ru-RU Fluent files** of the six
Russian-first forks (corvax = canonical vanilla-RU via ss14-ru; RuCM covers the
inherited RMC14/CMU layer). Fields exist only where a real translation does;
additive change, EN consumers unaffected. Coverage: **725/1369 reagents**
(vanilla 407/407, adt 100/100, sunrise 37/37, fish 10/10, corvax 8/8,
rmc14 100/113, cmu 20/22, deadspace 20/22 — the gaps have no upstream
translation at all), 88/152 plants. Side win: these forks ship no en-US locale,
so their reagents previously had prettified-ID names and empty descriptions —
now they have real content.

**Frontend:** RU/EN toggle in the header (`?lang=ru` deep links, localStorage
persistence). In RU mode the app swaps Russian strings into the primary fields
before indexing (all views + search pick them up), search matches both
languages, and a DOM translation layer (`i18n.js`) localizes the UI chrome with
proper Russian plurals. Untranslated strings gracefully stay English.

Phase 2 (not in this release): generated effect prose, antag curator texts,
maps item names. Decision record:
`docs/decisions/2026-07-26_russian-localization.md`.

## Maps prices 2 — 2026-07-27 (Series S — sell list: map price manifest)

New per-fork artifact `maps/<fork>/prices.json` (own `schemaVersion`, currently
2): sell price and class for every non-abstract prototype that can appear in a
map's item index. Produced by the same `ss14_map_extractor.py` (`--prices` =
registry-only run, no map baking; a regular fork bake refreshes it too).

**Prices** mirror the live upstream `PricingSystem.GetEstimatedPrice`:
material composition × stack count, then `StackPrice × count` XOR
`StaticPrice` (the engine never applies both). Stack size = explicit
`Stack.count` up the inheritance chain, else the C# default 30 clamped by the
stack type's `maxCount`. Out of scope (documented): solution contents,
`MobPrice`, `RandomPrice`, per-map-instance stack overrides.

**Classes** (schema v2: interned table + `items: {pid: [price, classIdx?]}`):
guns, melee, explosives, armor, clothing, food, drinks, medical, tools,
materials, storage. Hybrid classifier: components where they are reliable,
prototype-file path segments up the parent chain where they are not — the
2026-07-27 census found `Food`/`Drink`/`Sharp` components no longer exist in
vanilla (food and drinks share `Edible`, knives carry `Tool`), and `Clothing`
is gated on true body-wear slots (a crowbar equips to Belt yet stays a tool;
toolbelts and backpacks are storage).

**Frontend:** the `$ Sell list` button on the Maps tab opens a sortable
manifest of the selected map — Item | Count | Price | Total (default: total
descending), substring filter, class chips (multi-select), guaranteed-vs-chance
loot selector (probabilistic container slots count as expected value, ≈N.N),
vendor-stock toggle (off by default). Row click jumps into the regular marker
view. Fully localized (RU/EN).

## Maps schema 2 — 2026-07-12 (Series E — station map item finder)

A new artifact family, separate from `data.json` and carrying its own
`schemaVersion`: `maps/index.json` + `maps/<fork>/<Id>.{png,json}`, produced by
`ss14_map_extractor.py`.

**What ships:** the **Maps** tab — pick a station, search any item, and see every
place it spawns on a rendered schematic, grouped by nearest station beacon. This
release covers **14 vanilla stations plus 14 community forks** (114 maps; Bagel, Box, Elkridge, Exo, Fland,
Marathon, Oasis, Packed, Plasma, Reach, Relic, Saltern, Serpentcrest, Snowball;
2026-07-21: + Omu Delta Station — the "NTTG Delta" rotation map ported from Corvax;
2026-07-23: + Misfits: Nuclear Wasteland — Wendover, Sunnyvale, Mercer Island,
Nukie Outpost, Wave 1, Saltern. Fallout maps place no NavMapBeacons, so their
locations list falls back to the single "no beacon" group).

**Item sources indexed** (marker colour = source kind):

| Kind | Marker | Meaning |
|---|---|---|
| 0 | green | lies on the floor |
| 1 | amber | inside a locker/crate — carries spawn probability (`in tool closet (~70%)`) |
| 2 | violet | stocked in a vending machine, with count |
| 4 | red | vending machine contraband slot |
| 3 | — | on a secondary grid: listed by grid name, not drawn |

**Data model:** a per-map PNG underlay (floors coloured by each tile texture's real
average colour, walls/windows/doors overlaid) plus a JSON item index. Position
tuples are `[x, y, kind, viaIdx?, extra?]`; `vias` is a per-map string table —
schema 2 deduped the heavily-repeated source names (`maintenance closet` …), cutting
~26% per map.

**Upstream drift handled:** `StorageFill` is dead in current SS14. Container
contents now come from `EntityTableContainerFill` + `entityTable` selector trees
(`AllSelector`/`GroupSelector`/`NestedSelector`), flattened with probability
multiplication; `amount` may be a `!type:…NumberSelector` and is coerced.

**Known limits this release:**
- **Fork maps are capped at 8 rotation-first per fork** (`MAX_MAPS_PER_FORK`;
  vanilla uncapped). Forks copy upstream `Resources` wholesale, so their pools
  re-list vanilla's own stations — an uncapped bake re-bakes the same station once
  per fork (72 MB at 11 forks). 14 forks / 88 maps ship at ~44 MB. Five forks
  (harmony, corvax, adt, sunrise, fish) missed this bake and are a follow-up.
- **Random spawners are not resolved** — an item that *may* appear from a random
  pool is not indexed as being there.
- **Secondary grids** (AI sat, outposts) contribute items to the list, labelled by
  grid name, but are not drawn on the schematic.
- **Search is English** proto/display-name only (no RU terms).
- Maps whose chunks use the older 6-byte tile stride warn and skip those chunks
  (PNG gaps, items unaffected) rather than emitting garbage.
## 3.9.0 — 2026-07-13 (Increment D5 — renamed-reagent dead recipes on total-conversion forks)

Bug fix (user report: Fluorosurfactant/Space Mirage show a recipe on Russian
Marine Corps but don't craft in-game). Root cause: RMC-14 is a **total
conversion** that renames 20 base reagents (`Fluorine→RMCFluorine`, `Carbon`,
`Oxygen`, `Ethanol`, …) keeping the vanilla locale name; its repo still ships
vanilla-path copies, so the merged data showed vanilla recipes that reference
reagents the fork's game doesn't actually provide.

- Extractor Phase 4e: per-fork **rename map** (fork reagent sharing a vanilla
  BASE reagent's locale name under a prefixed id → the vanilla twin is
  shadowed), gated on a ≥5-rename threshold so a lone coincidental collision
  can't mass-block an additive fork. A forward-reachability fixpoint marks
  reactions that (transitively) need a shadowed reagent as `forkStatus=blocked`.
  RMC-14 / RuCM: 20 renames → ~275 dead vanilla reactions blocked. All 16
  additive forks unaffected (Fluorosurfactant still makeable there and on
  vanilla).
- New `meta.forks[fork].totalConversion` + `renamedReagents` → the source
  filter shows a red warning banner on RMC-family forks.
- Decision record: docs/decisions/2026-07-12_rmc-renamed-reagents.md.

## 3.8.0 — 2026-07-12 (Increment D4 — metabolism rate → heal/sec + true per-unit)

New per-reagent field `metabolismRate` (units consumed per ~1s metabolism
tick), serialized ONLY when the reagent overrides the engine default of 0.5
— 210 reagents carry a non-default rate (dist: 0.1 ×47, 0.25 ×26, 0.2 ×26,
0.05 ×20, 1.0 ×19, … up to a 250.0 fast-purge outlier). Frontend consumers
default absent values to 0.5.

Enables the "What Heals?" mode to distinguish per-second healing from
per-unit efficiency: the reagent's effect amount is applied PER TICK, so the
total healing one unit delivers before it fully metabolizes = effect ÷ rate.
The mode's "Heal / u" column now shows that true per-unit total (and re-ranks
by it); a new "/ sec" column shows the instantaneous per-tick amount, with an
`@Xu/s` chip when the rate is non-default. Corrects the v1 mislabel where the
per-tick amount was shown as "per unit".

## 3.7.0 — 2026-07-12 (Increment D3 — item-fill sources: vending/dispenser/juicing)

Re-applied onto 3.6.1 after the D3 branch diverged (it was cut from
3.4.3-era 3a2f55e while main advanced through D1/D2); D1 plants{} and
D2 species{}/speciesEffects are retained, item-fill adds on top.

Reagents that ship pre-mixed inside spawnable items are no longer blind
spots. New extractor Phase 5c intersects two indexes — entity solution
fills (both schemas: new `Solution` component and legacy
`SolutionContainerManager`) and acquisition channels:

- **Vending inventories** (`startingInventory`; `contrabandInventory`
  tagged "(hacked)" — unlocked by the contraband wire per
  `ContrabandWireKey`, crew-accessible; `emaggedInventory` tagged
  "(EMAG)"; Syndicate/Nukie-id machines tagged "(Syndicate)").
- **Dispenser bottle packs** (`EntityTableContainerFill` on booze/soda
  dispensers) — auto-derives what the manual Booze/Soda Dispenser lists
  tracked by hand (and catches upstream drift: Mead and Coffee Liqueur
  had been added to the booze dispenser unnoticed).
- **Juicing** (D3b): seed `productPrototypes` -> produce
  `Extractable.juiceSolution` -> "Juicing: <plant> (plant)" labels.
- **Fork channels** (D3c): Goob (weebvend/solsnack/sweettoof/fitness/
  hotfood + drinks), Delta-V (command/unlocked boozeomat, crescentmoon,
  nanoblood/nanomedcivilian + 7 drink files), ADT (pillomat/civimed/
  icecream + drinks/yupi/healing). Channels are ancestry-filtered in
  per-fork views; total-conversion forks (blocked_categories: RMC14/
  RuCM) do not inherit vanilla vendors. Known limits: ADT pill packs
  are StorageFill boxes (container unpacking is a follow-up channel);
  most fork drinks ride patched vanilla-path vendor copies (follow-up);
  Sunrise/Corvax custom vendor layers hold no consumables — skipped.

Classifier: auto `Vending*` labels are a bonus channel — antag-only only
when a manual antag label exists or no other path does (Mayo/Pax/salt
stay normal). `_SERVICE_KEYWORDS` += "Vending", "Atmospherics";
cross-service reason prefix is now "Cross-department:". Honest manual
labels for non-item channels: species bloods (verified against
`Body/Species/*.yml` bloodReferenceSolution: Vox=Ammonia, Moth=Insect,
Arachnid=Copper), atmos gases (Frezon/Tritium/N2O), goat/sheep milking.

**Headline fixes:** Absinthe — "unobtainable" -> cross-service
(Booze-O-Mat, Jailbreaker Verte 120u; the user report that started this
increment). Lead — the forum-famous unobtainium — antag-only via the
SyndieJuice Syndicate chem vendor's hacked bucket (ChemistryBottleLead
x2 30u; `code-reagents-lead` note updated). PoisonWine (hacked
Booze-O-Mat), EnergyDrink, Butter, olive oil, PestKiller/WeedKiller
(NutriMax sprays), JuiceBungo/JuiceBluePumpkin/MilkOat (juicing), Gold
(Gildlager bottle), Saline (CiviMedVend syringe, ADT).

**Unobtainable: 332 -> 297 (vanilla 63 -> 29).** 114 reagents carry
auto item-source labels (699 entities indexed, 281 stocked items, 27
juiceable produce). Same 1213 reagents / 1003 reactions, 128 plants.
Determinism: regen x2 byte-identical after `generated` timestamp strip.
M1 sweep: clean — no upstream rename signals; 404s are the usual
fork-lacks-file manifest probes.

## 3.6.1 — 2026-07-12 (Increment D2 — species physiology)

(Backfilled entry — the D2 bump shipped without its own CHANGELOG note.)
Curated `species{}` physiology (8 hand-written playable species: breathing
gas, toxic gas, quirks) plus auto-discovered fork races from organ-gated
effect clauses (~15 chips: Goblin/Thaven/Sheleg/...). Per-reagent
`speciesEffects` lifted from `if organ: X` effect conditions (15 reagents).
Frontend: physiology cards + ☠/ℹ danger badges in "What Heals?".

## 3.6.0 — 2026-07-12 (Increment D1 — plant entities + mutation graph)

(Backfilled entry — the D1 bump shipped without its own CHANGELOG note.)
`plants{}` — seed prototypes as first-class entities (128 plants, 37 with
mutation targets / 47 mutation edges): id, name, source fork, product
prototypes, mutation targets, potency-scaled chemicals, growth params.
Frontend: Plant Evolution chart (30 chains) + swab/cross-pollination guide
(amber maintainer-knowledge tier).

## 3.4.3 — 2026-07-12 (Increment C1 — serialize reaction priority)

Reactions now carry the engine's cascade **`priority`** when the upstream
YAML defines it — omitted otherwise (engine default is 0; values can be
negative: Smoke/Foam are -10 so real recipes win the reagents first).
37 of 1003 reactions have one: vanilla 13 (PotassiumExplosion/Flash/
Fresium 20, Hydroxide/CreateSoapRegular -1, Smoke/Foam/metal foams -10),
RMC14 10, Trauma 4, Goob 3, RuCM 3, Starlight 2, Sunrise 1, Omu 1.
Prerequisite for the beaker simulator (C2).

Data refresh drift vs 3.4.2: none — same 1213 reagents / 1003 reactions,
identical ids and per-fork counts; the only textual churn is clause
reordering inside 14 `forkNotes` strings (unsorted set iteration in
`compare_reaction`). M1 warning sweep: clean — no upstream rename signals
(Solution→entity, EdibleComponent, EntityEffects conditions,
ExudeGasses/ConsumeGasses); 404s are the usual fork-lacks-vanilla-file
manifest probes (soap.yml on rmc14/rucm/funky/omu/monolith).

## 3.4.2 — 2026-07-11 (Increment O — full curation list: fork seeds, Vaccine, vendor layers, locales)

Follow-up to 3.4.1: the maintainer approved including everything the manifest
audit surfaced ("Включай всё"). **1156 → 1213 reagents, 942 → 1003 reactions,
plant sources 55 → 96.**

### Fork botany (seed_files for 14 forks)

`seed_files` was vanilla-only; now every fork with its own Hydroponics
seeds ships them: Sunrise (14), Frontier (11), Dead Space (7), Monolith's
pre-move Entities copy (6), Delta-V (4), Trauma (4), ADT (4), Impstation
via Funky (3), Goob (2), Gardenstation via Omu (2), Fish (2), Carpmosia,
Harmony, Starlight, Funkystation (1 each). Plant-source lookups (the
Botany tab and "grow it" accessibility paths) now cover 96 reagents, up
from 55. Note: the plant-source pool is global (not fork-filtered) — a
Sunrise-only plant lists as a source for everyone; per-fork plant views
are a known model limitation.

### Fish Station: Vaccine system

Fish-only extension of its _Sunrise layer (absent upstream): disease
blood draws -> centrifuge separation -> NotReadyVaccine -> Vaccine /
VaccinePlus (7 reagents + 11 reactions). Fish grows 2/0 -> 9/11.

### Vendor layers included

- **Delta-V**: full Nyanotrasen drink layer (12 reagents + 19 reactions:
  Soju, Brainbomb, cheese-curdling chain, hot-oil pyro), _DEN cocktails
  (17 + 16, Jaeger line), _Impstation uniques (Ethanotoxin, Echion,
  BloodAllulalo), _Floof CreateFrosting (spawns an entity — no products).
  Delta-V now 124/125, second only to vanilla.
- **Funky**: _Impstation layer (SynthBlood chain via its _CD biological
  copy, BatteryAcid/AngelsKiss/FeverDream) + NaniteSlurryBreakdown.
- **Goob**: Einstein Engines reactions (Morphine synthesis!, Artiplates),
  ShadowlingToxin, _Lavaland medicine (MinersSalve, Luxurium...),
  _Shitmed NocturineWonderprod — whole Goob lineage sees them via
  ancestry.
- **Omu**: Gardenstation kelp/Thaven drinks + medicine (9 prototypes).
- **Monolith**: its _NF-copy additions (OilVegetable + vegetable-oil
  pyro reaction).
- **Dead Space**: ADTVodkaAntivirus from its vendored ADT layer.
- **RMC14**: drink names locale for the packaged/powdered lines.

### Ownership-steal guards (files deliberately NOT manifested)

Collision check before inclusion: a file is skipped when its ids are
owned by a later-registered fork whose view would silently lose them —
deadspace's _Corvax copies (10 corvax cocktails), deltav's _NF /
_Impstation-medicine / _Floof-medicine copies (frontier ids), starlight's
_Funkystation gases (6 adt/frontier gas ids), goob's _NF Comsumables
copy (5 frontier ids). Documented inline in config.py.

### Locales

23 .ftl files wired for the new content (Funky cocktail names, Nyano/_DEN
drinks, _CD meds, frozen treats, Gardenstation, Fish pathogens, seed
names for 8 forks). Reagents without locale entries fall back to
readable id-derived names.

Leftover known issues: BeastBloodLing / MilkChoco (upstream Goob bugs, no
prototypes exist); per-fork visibility of shared vendor layers follows
first-wins ownership (frontier's Nyanotrasen copy invisible in frontier's
own view — model limitation, candidate for a future shared-layer feature).

## 3.4.1 — 2026-07-11 (Increment N — manifest-drift audit, orphan fix, vanilla-copy harvest)

### Manifest-drift audit (`scripts/audit_fork_manifests.py`)

The extractor's file manifests are static and its cache is immortal, so drift
accumulates silently: forks add new YAML files the manifests never heard of,
and renamed files 404 without failing the build. The new audit tool compares
every fork's live GitHub tree (2 `git/trees` requests per fork) against
`FORK_REGISTRY`, verifies tracked files via git blob-SHA against the local
cache (no re-download), and content-probes untracked reagent/reaction YAMLs.
First run found: **146 untracked files with chem prototypes**, 5 missing
manifest paths (`soap.yml` × 5 forks — correctly auto-blocked), and a
same-day Dead Space update. Report: `cache/fork_manifest_audit.json`.

### Orphan fix — 26 files added to 10 fork manifests

93 reactions referenced reagent ids that didn't exist in the database
(tracked reaction files whose reagent-definition files weren't tracked):
36 Funky cocktails, 15 Frontier drinks, 14 Delta-V entries, 10 RMC14
instant juices, 8 Dead Space drinks... Added the defining files to
`reagent_files` across rmc14, rucm (parent overrides), deltav, deadspace,
frontier, funky, starlight, omu (AtomicPrecision lives inside an entity
file), adt, and goob (`_EinsteinEngines` vendor layer). **Orphans: 93 → 2**;
both leftovers are upstream Goob bugs (BeastBloodLing / MilkChoco reactions
have no reagent prototype anywhere in the Goob repo).

### Same-day upstream pickups

- **Dead Space** (commit 15:53Z, after the 3.4.0 snapshot): new toxin
  **Pendrotoxine** (Blunt 5/tick, slip hazard, forced screams) + chain
  Puncturase + Dermaline → **Derytracine**; Celestin + Derytracine →
  Pendrotoxine. Derytracine lives in `_DeadSpace/Reagents/medicine.yml` —
  a file the manifest didn't track until now.
- **Delta-V frozen treats**: new upstream file pair — 28 ice-cream/slush
  reagents + 27 reactions (IceCreamTower, SlushCola, sherbet line, ...).
- **RMC14 drink files** (base/packaged/powdered): 15 reagents incl. the
  RMCInstantJuice* powders whose reactions already shipped in 3.4.0.

### Vanilla-copy harvest (extractor Phase 2b)

Forks patch vanilla files in place — Goob defines Warfarin/Necrosol inside
its copy of `Reagents/medicine.yml`, Funky adds 12 Ambuzol recipes to its
vanilla `medicine.yml`, RMC14 moved soap crafting into its `fun.yml` copy.
Those copies were already fetched for the auto-diff; Phase 2b now also
harvests fork-added prototypes from them. Merge is two-pass: explicit
custom-layer manifests (registry order) always outrank harvested copies.
Parent-diff guards keep harvested content from reading as "blocked".

### Ownership moves (first-wins, registry order)

Alexander (corvax → funky), Honey (sunrise → frontier),
AdvancedMutationToxin (starlight → goob), Morphine/BlackBlood (omu → goob),
Saxoite (goob → rmc14). Same ids, earlier-registered fork now defines them.

Totals: **965 → 1156 reagents, 872 → 942 reactions** (schema unchanged —
patch bump).

## 3.4.0 — 2026-07-11 (Increment M — cache refresh, blocked reagents, Botany tab)

### Fresh upstream snapshots (all 18 forks)

Local caches were fully re-fetched (they only download missing files, so data
had drifted). Totals: 965 reagents / 872 reactions (was 953/850). Notable
drift picked up: vanilla 407/316, RMC14 96/65 (gains **RMCUltrazine**),
Delta-V 45/53, Dead Space 12/14, Funky 30/73. Vanilla's seeds locale moved
upstream — `botany_locale_files` now points at the split
`Locale/en-US/botany/seeds.ftl` + `Locale/en-US/seeds/seeds.ftl` pair.
With fresh parent data, RuCM's parent auto-diff now reports **5 blocked**
(RMCInstantJuice× 5) and **9 modified** (Mindbreaker chain × 5 without Black
Goo, CLF3 yield 3→1, both napalm yields 2→1, RMCSmoke +BlackGoo) — all
rendered as MOD badges / hidden recipes in the RuCM source view.

### Reagent-level blocking (`blocked_reagents`, Phase 4d)

Reactions have had a blocked/modified channel since 3.0; reagents get one now
because RuCM is the first fork that REMOVES a parent reagent rather than only
adding. New `parent_override_reagent_files` manifest + auto-diff: a parent
reagent is blocked for the child when it exists in a parent file the child
also carries, is absent from the child's copy, and is not re-contributed by
the child's own manifests (404-safe: only successfully fetched files are
judged). Ships as `forkStatus: {fork: "blocked"}` on the reagent; the UI
source filter hides it, per-fork views exclude it from accessibility and drop
reactions whose every product is blocked. Manual channel:
`FORK_REGISTRY[fork]["blocked_reagents"]`. First real case: **RMCUltrazine**
(upstream RMC14 speed stimulant) hidden on Russian Marine Corps.

### Botany tab (`plantEffects`)

`plantMetabolism` was parsed but discarded; it now ships on each reagent as
structured chips `{kind, label, text, group, tone}` — 18 effect kinds mapped
to filter groups (care / yield / mutation / weedpest / harm / special) and a
tone (good for the plant / bad / mutagenic), sign-aware: `Weeds -8` is a
green weedkiller, `Weeds +2` is red. New **Botany** tab lists all 469
plant-affecting chemicals with group filter chips; generic drink/food
hydration (inherited water/nutrition from the base drink prototype) is
hidden by default behind a toggle so real fertilizers stand out. Reagent
detail panels gain a "Plant Effects (Botany)" section.

### Usage analytics — Metrika goal events

`app.js` gains a `track()` wrapper (adblock-safe no-op) sending 21 JS-event
goals to the existing Yandex.Metrika counter: tab opens, `reagent_open`,
`fork_select`, settled search queries (`search_used` / `search_zero` with
query + result count as visit params), calculator / batch / reverse /
craft-tree runs, `antag_on`, `strategy_to_batch`, `share_click`;
`tutorial.js` reports start / done / skip. Metrika silently drops
`reachGoal` hits until a matching goal exists on the counter —
`scripts/create_metrika_goals.py` creates all 21 through the Management API
(idempotent, `--dry-run` supported). Cache-busts `app.js?v=5`,
`tutorial.js?v=2`; README Privacy section updated to mention interaction
events.

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
