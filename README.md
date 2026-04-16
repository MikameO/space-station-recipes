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

## License

[GPL-3.0-only](LICENSE) — see [NOTICES](NOTICES) for third-party attributions.
