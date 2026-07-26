# Decision: Russian localization — native fork translations first, DOM-layer UI

**Date:** 2026-07-26
**Tier:** 2 (data schema minor bump + new frontend layer, prod-facing)
**Status:** accepted, shipped

## Context

Goal (user): «Русская локализация всего продукта. Пользоваться готовыми
алгоритмами; сначала — только форки, где русские переводы есть с самого
начала». The audience research (SS14 demand notes) already flagged the Russian
community (Corvax/Sunrise/ADT server clusters) as a major user segment.

Two independent localization surfaces exist:

1. **Game data** (reagent/plant names + descriptions). Six registered forks are
   Russian-first and natively ship `Resources/Locale/ru-RU/**.ftl`:
   corvax, adt, sunrise, fish, rucm, deadspace. Corvax vendors the de-facto
   standard translation of ALL upstream content (ss14-ru), and RuCM vendors
   translations of the whole inherited RMC14/CMU colonial layer.
   Bonus finding: these forks' own content has **no en-US locale at all**, so
   pre-L10n their reagents sat in data.json with prettified-ID names and empty
   descriptions — the RU pass is the first time they have real content.
2. **UI chrome** (~350 strings across index.html / app.js / tutorial.js /
   maps.js) — no ready translations exist; hand-written once.

## Decision

**Data:** mirror the existing FTL pipeline — per-fork `locale_files_ru`
manifests in `config.py`, one merged `locale_ru` dictionary (same shape as the
EN one), strict resolvers (`resolve_name_strict`): *no translation → no field*,
never a fake prettified name. Corvax merges **last** so vanilla keys stay
canonical ss14-ru even where Sunrise/RuCM vendor lagging copies. Emitted as
optional `nameRu`/`descRu`/`physicalDescRu` on reagents and `nameRu` on plants
(schema **3.10.0**, additive — old consumers unaffected).

**Frontend:** language state = `?lang=` URL param > `localStorage` > EN.
In RU mode `applyRussianData()` swaps RU strings into the primary fields once,
*before* the search index builds — every renderer and search picks Russian up
for free (zero changes in ~40 render functions); `nameEn` stays in the search
index so both languages match. UI chrome is translated by a DOM layer
(`i18n.js`): one EN→RU dictionary applied to text nodes + attributes via
TreeWalker + MutationObserver, RX rules handle composite strings with proper
Russian plural forms. Untranslated strings degrade gracefully to English.
EN mode: no observer, no dictionary — zero overhead.

## Alternatives rejected

- **t()-wrapping every render string** — hundreds of edit sites across a
  164KB app.js; the DOM layer achieves the same coverage with zero render
  edits and one empirically-completed dictionary.
- **Separate data.ru.json** — second fetch + merge complexity; gzip makes the
  +0.3MB in-file cost negligible on Pages.
- **Machine-translating non-Russian forks' content** — explicitly out of
  scope by user directive (ready translations only). Phase 2 candidates:
  generated effect prose (needs template i18n in the extractor), antag
  curator texts, maps item names, machine-assisted fills for EN-only forks.

## Hard-won implementation notes

- RuCM `.ftl` files start with a UTF-8 BOM — the FTL key regex anchors on
  `[\w]`, so an un-stripped BOM silently drops the first key of every file
  (fixed in `parse_ftl_content` for all languages).
- MutationObserver + translator = infinite-loop risk: an RX rule returning
  its input verbatim still fires a `characterData` mutation on a same-value
  `nodeValue` write and hangs the renderer. Guard: never assign unchanged
  values (`if (out !== raw)`).
- Coverage after completion: **725/1369 reagents** carry `nameRu` — all six
  RU forks at 100% of what their upstreams actually translate (vanilla
  407/407, adt 100/100, sunrise 37/37, fish 10/10, corvax 8/8, rmc14 100/113;
  the remainder physically has no translation upstream), 88/152 plants.
