# SS14 Chemistry Database

Interactive chemistry reference for [Space Station 14](https://spacestation14.com/) and 8 community forks.

Search reagents, plan reactions, explore craft trees, and calculate batch recipes — all in one tool.

## Features

- **Multi-fork support** — 683 reagents and 607 reactions across 8 SS14 forks
- **Search** — full-text search across names, effects, descriptions, and flavors
- **Calculator** — single recipe calculator, batch shift planner, and reverse lookup ("What can I make?")
- **Craft Trees** — visual dependency chains showing exactly what you need to synthesize any reagent
- **Graph** — interactive network visualization of all reagent relationships
- **Stats** — fork comparison, category distribution, most complex recipes, most used base chemicals
- **Antag Mode** — curated antagonist strategies with lethality scores and delivery mechanisms
- **Shareable links** — URL encodes your current filters and selection for easy sharing

## Supported Forks

| Fork | Reagents | Reactions |
|------|----------|-----------|
| Vanilla SS14 | 405 | 310 |
| RMC14 | 94 | 60 |
| Goob Station | 66 | 72 |
| Funky Station | 36 | 81 |
| Delta-V | 39 | 43 |
| Starlight | 21 | 9 |
| Frontier | 12 | 21 |
| Dead Space | 10 | 11 |

## Adding a New Fork

1. Open `config.py` and add an entry to `FORK_REGISTRY` with:
   - GitHub repo URL, branch, and raw file base URL
   - Custom content directories (e.g., `_MyFork/`)
   - Blocked/modified reactions (if any)
   - Dispenser chemicals
   - UI color

2. Run the extractor to regenerate data:
   ```bash
   pip install pyyaml openpyxl
   python ss14_chem_extractor.py
   ```

3. Open `index.html` locally to verify the new fork appears in the Source filter.

## Development

```bash
# Start local dev server
python -m http.server 8090

# Open in browser
# http://localhost:8090
```

No build step required — the site is pure HTML/CSS/JS served statically.

## License

[MIT](LICENSE) — compatible with the SS14 project license.
