<div align="center">

<img src="sprites/beaker.png" width="64" height="64" style="image-rendering: pixelated;" alt="SS14 Chemistry Database">

# SS14 Chemistry Database

**Interactive chemistry reference for [Space Station 14](https://spacestation14.com/)**

Search reagents, plan reactions, explore craft trees, and calculate batch recipes across 8 community forks.

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-22c55e?style=flat-square)](LICENSE)
![Reagents](https://img.shields.io/badge/Reagents-683-39ff85?style=flat-square)
![Reactions](https://img.shields.io/badge/Reactions-607-00e5ff?style=flat-square)
![Forks](https://img.shields.io/badge/Forks-8-ffb627?style=flat-square)

</div>

---

## Features

| | Feature | Description |
|---|---------|-------------|
| **Search** | Full-text search | Search across names, effects, descriptions, and flavors |
| **Multi-fork** | 8 SS14 forks | Vanilla, RMC14, Goob, Funky, Delta-V, Starlight, Frontier, Dead Space |
| **Calculator** | Recipe planner | Single recipe calc, batch shift planner, and reverse lookup |
| **Trees** | Craft trees | Visual dependency chains for any reagent synthesis path |
| **Graph** | Network viz | Interactive graph of all reagent relationships |
| **Stats** | Database stats | Fork comparison, complexity rankings, base chemical usage |
| **Antag** | Antag Mode | Curated strategies with lethality scores and delivery methods |
| **Share** | Deep links | URL encodes filters and selection for easy sharing |

## Supported Forks

| Fork | Reagents | Reactions | |
|------|:--------:|:---------:|---|
| **Vanilla SS14** | 405 | 310 | `upstream` |
| **RMC14** | 94 | 60 | Colonial Marines |
| **Goob Station** | 66 | 72 | |
| **Funky Station** | 36 | 81 | Goob-based |
| **Delta-V** | 39 | 43 | |
| **Starlight** | 21 | 9 | |
| **Frontier** | 12 | 21 | |
| **Dead Space** | 10 | 11 | |

## Quick Start

```bash
# Start local dev server
python -m http.server 8090
```

Then open [localhost:8090](http://localhost:8090). No build step — pure HTML/CSS/JS.

## Adding a New Fork

1. Add an entry to `FORK_REGISTRY` in [`config.py`](config.py):
   - GitHub repo URL, branch, raw file base URL
   - Custom content directories (e.g. `_MyFork/`)
   - Blocked/modified reactions (if any)
   - Dispenser chemicals and UI color

2. Regenerate data:
   ```bash
   pip install pyyaml openpyxl
   python ss14_chem_extractor.py
   ```

3. Verify the new fork appears in the Source filter.

## Architecture

```
index.html          Static frontend shell
app.js              All interactive logic (search, calc, trees, graph, stats)
style.css           NanoTrasen terminal theme with CRT effects
data.json           Generated chemistry database (1.1MB, all forks merged)
config.py           Fork registry and extraction configuration
ss14_chem_extractor.py   Scrapes SS14 GitHub repos → data.json
sprites/            Reagent sprite assets (pixel art)
```

## Data Provenance & Disclaimers

**Where the data comes from**

| Source | What it covers | Trust level |
|---|---|---|
| Upstream YAML (vanilla + fork `custom_dir`) | Reagent definitions, reaction recipes, `tileReactions`, `reactiveEffects`, metabolisms, phase-change temps | **Authoritative** — auto-regenerated from GitHub. The `verifiedMechanics` field on each reagent is extracted straight from these files. |
| Curator fields in [`config.py`](config.py) (`ANTAG_DATA.tips`, `ANTAG_STRATEGIES.desc`/`method`/`difficulty`) | Antag playstyle tips, strategy combos, authored difficulty estimates | **Best-effort community knowledge.** These are a single curator's notes, written from playtime. They can drift from current code. The UI shows them in a dashed-amber **Community knowledge (unverified)** section, visually separate from the green **Verified in SS14 code** section. |
| Computed fields (`accessibility`, `computedDifficulty`, `verificationStatus`) | Derived metrics — who can obtain this reagent, how much effort a strategy takes, whether every claim is YAML-backed | **Mechanically derived** from the two sources above. The build logs warnings when curator's authored difficulty diverges from computed; both tiers ship in `data.json` for transparency. |

**What this project does NOT include**

SS13 legacy lore is **not accepted** unless independently confirmed in SS14 YAML. The classic "Thermite melts walls" claim (widely repeated from SS13) is the canonical example: in SS14, Thermite has only `FlammableTileReaction`, no wall-damage mechanic exists. Similar myths (chemistry-based EMP, pure poison auto-kill, etc.) are rejected without a github.com/space-wizards link or a verifiable forum/wiki source.

**Source attribution (schema 3.0.0+)**

Every curated claim in `data.json` — strategy `desc`, reagent `antagTips`, debunking `loreWarnings` — carries a `sources` list pointing at trackable evidence. The catalog lives in [`sources.py`](sources.py) and ships in `data.sources` for frontend consumption.

Each source entry has a `type` from the authority ladder (higher = more authoritative):

| Type | Weight | When to use |
|---|:---:|---|
| `code` | 10 | GitHub deep-link to YAML line (`…#L109`) — the source of truth |
| `maintainer-test` | 9 | Personally playtested by maintainer |
| `forum-consensus` | 7 | ≥3 aligned forum posts from distinct users |
| `wiki` | 5 | SS14 community wiki |
| `forum-post` | 4 | Single forum thread |
| `video` | 4 | YouTube / Twitch VOD (include `?t=` timestamp) |
| `maintainer-knowledge` | 2 | Honest placeholder: "I know this from playtime, undocumented" |
| `speculation` | 1 | Explicit "needs verification" marker, renders red |

Aggregation is **max**, not sum: a single `code` reference outweighs ten weak forum posts. Weight is centralized (derived from `type`, not per-entry editable) so a contributor cannot inflate their own post's authority by editing the catalog.

Domain whitelist (`ALLOWED_DOMAINS` in `sources.py`): `forum.spacestation14.com`, `github.com` (owners auto-derived from `FORK_REGISTRY` + `space-wizards`), `wiki.spacestation14.com`, `youtube.com` / `youtu.be`, `twitch.tv`, `reddit.com/r/SpaceStation14`, `web.archive.org`. Discord explicitly excluded (non-public, non-permalink).

A weekly [CI workflow](.github/workflows/check-links.yml) HEAD-pings every URL in the catalog and auto-files an issue if ≥10 % break — maintainer then adds an `archive_url` Wayback snapshot or fixes the link.

**How to report an inaccuracy**

On any strategy card in Antag mode there's a **⚠ Report inaccuracy** button that opens a pre-filled GitHub issue (template: [`strategy-inaccuracy.yml`](.github/ISSUE_TEMPLATE/strategy-inaccuracy.yml)). The template **requires** a verifiable source link — lazy reports without evidence get closed quickly, so citing makes your fix durable.

**How to contribute a source**

Reagents with `⚠ needs attribution` badges have a "Suggest a source" link that opens the [`attribution.yml`](.github/ISSUE_TEMPLATE/attribution.yml) template with the entry ID pre-filled. Fill in `source_type`, `source_url`, and a one-sentence `source_note`; maintainer adds the entry to `sources.py` and wires it into the relevant `sources` list.

See [CHANGELOG.md](CHANGELOG.md) for schema evolution.

## Privacy

This site uses [Yandex.Metrika](https://metrika.yandex.com/) for anonymous usage analytics (page views, click maps, and session recordings via Webvisor). No personal data is collected or sold. Analytics help prioritize features based on how the database is actually used across forks.

## License

[GPL-3.0-only](LICENSE) — see [NOTICES](NOTICES) for third-party attributions.
