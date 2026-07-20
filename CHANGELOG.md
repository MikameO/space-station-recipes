# Changelog

`data.json` schema version is in `meta.schemaVersion`. Consumers reading this file
should pin on a compatible range (semver: breaking changes bump major).

## Maps schema 2 — 2026-07-12 (Series E — station map item finder)

A new artifact family, separate from `data.json` and carrying its own
`schemaVersion`: `maps/index.json` + `maps/<fork>/<Id>.{png,json}`, produced by
`ss14_map_extractor.py`.

**What ships:** the **Maps** tab — pick a station, search any item, and see every
place it spawns on a rendered schematic, grouped by nearest station beacon. This
release covers **14 vanilla stations plus 13 community forks** (88 maps; Bagel, Box, Elkridge, Exo, Fland,
Marathon, Oasis, Packed, Plasma, Reach, Relic, Saltern, Serpentcrest, Snowball).

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
