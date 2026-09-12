# Home Menu & Feedback (Series H) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Sections" overlay that maps the platform and lights up sections updated since the visitor's last visit, a native idea form that files GitHub issues through a Cloudflare Worker, and a returning-visitor survey (3rd visit, mode B) — per [docs/design/2026-09-12-home-menu-and-feedback.md](../../design/2026-09-12-home-menu-and-feedback.md).

**Architecture:** Two new browser modules (`home.js` — overlay, badges, visit counter; `feedback.js` — form, survey scheduler, POST) driven by one manifest (`sections.json`), plus a Cloudflare Worker (`worker/`) that turns form POSTs into labelled GitHub issues. Zero edits to `app.js`: the modules hook `app:ready` / DOM and read globals (`DATA`, `I18N_LANG`) read-only. Pure logic in each module is exposed on `window.*Logic` and exercised by Node scripts under `scripts/`, the way `scripts/test_library_markup.js` drives `library.js`.

**Tech Stack:** Vanilla ES5-style browser JS (IIFE, `var`, no build step — match `library.js`), Node 24 for tests (`vm` for browser modules, native ESM for the Worker), Cloudflare Workers (`wrangler`), Python 3 + Pillow for the card screenshots and the manifest check, GitHub REST API for issues.

---

## Conventions the whole plan relies on

- **Parallel sessions edit this repo.** Before touching `index.html`, `library.html`, `style.css`, `i18n.js`, `sw.js`, `deploy.yml`, `ROADMAP.md`: run `git status --short` and re-read the exact lines you are about to change. Commit only the files named in the task. Never `git add -A`.
- **Cache-bust (ROADMAP §0.2):** whenever `home.js`, `feedback.js`, `style.css` or `i18n.js` change, bump their `?v=` in **both** `index.html` and `library.html` **and** in `PRECACHE` in `sw.js`, and bump `CACHE` in `sw.js`. Read the current numbers at that moment (another session may have bumped them) and add 1.
- **No `[hidden]` for elements with an author `display` rule** (style.css trap): overlays toggle a class (`.is-open`); the only `[hidden]` uses below are on elements whose CSS also says `[hidden]{display:none!important}`.
- **i18n:** `i18n.js` reloads the page on language switch, so modules read `window.I18N_LANG` once. Static markup strings go into the `T` dictionary in `i18n.js`; strings a module generates use the module's own `L10N` table (same approach as `roleLabel` in `library.js`). Never write an unchanged `nodeValue`.
- **Analytics:** every new `track()` id is added to `GOALS` in `scripts/create_metrika_goals.py` in the same task. The script itself is run only after the user's explicit go-ahead (Task 17).
- **Commits:** conventional, English, end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Commit after each task's verification.
- **Test runner:** `node scripts/<test>.js` prints `ok <name>` per case and exits 1 on any `FAIL`, like `scripts/test_library_markup.js`.

## File structure

| Path | Responsibility | Increment |
|---|---|---|
| `sections.json` | Manifest: what sections exist, what is inside, when each last changed (EN/RU) | H1 |
| `scripts/shoot_cards.mjs` | Puppeteer-core script: opens each section on the local preview, seeds the tutorial flag, shoots 1800×915 PNGs into `promo/cards-src/` | H1 |
| `scripts/build_cards.py` | Pillow: `promo/cards-src/*.png` → `promo/cards/*.webp` (720 px, ≤ 25 KB) | H1 |
| `promo/cards/*.webp` | Card backgrounds (tracked); `promo/cards-src/` is gitignored | H1 |
| `home.js` | Visit counter (`window.ChemDBVisits`), badge computation, auto-show decision, overlay UI, targets, tracking | H1 |
| `scripts/test_home_logic.js` | Node tests for `window.ChemDBHomeLogic` | H1 |
| `style.css` (append) | `.home-*` block; later `.fb-*` block | H1, H2 |
| `i18n.js` (T dictionary) | Static strings: `Sections`, button title, feedback aria-label | H1, H2 |
| `index.html`, `library.html` | `#homeBtn`, script tags, `?v=` bumps | H1, H2 |
| `sw.js` | PRECACHE entries + CACHE bump | H1, H2, H3 |
| `.github/workflows/deploy.yml` | cp-list + `check_sections.py` step | H1, H4 |
| `.github/ISSUE_TEMPLATE/idea.yml`, `survey.yml` | Manual fallback templates, prefilled from the form | H2 |
| `worker/index.js`, `worker/wrangler.toml`, `worker/package.json` | Cloudflare Worker → GitHub issue | H2 |
| `scripts/test_feedback_worker.mjs` | Node tests for the Worker (fake `fetch`, fake env) | H2 |
| `feedback.js` | Idea/survey form, validation, POST, toast, prefill link, survey scheduler | H2, H3 |
| `scripts/test_feedback_logic.js` | Node tests for `window.ChemDBFeedbackLogic` | H2, H3 |
| `scripts/check_sections.py` | Manifest validator for CI and local use | H4 |
| `scripts/create_metrika_goals.py`, `README.md`, `CHANGELOG.md`, `ROADMAP.md` | Registry + docs | H4 |

---

# Increment H1 — manifest, screenshots, overlay, badges

### Task 0: Series H in the ROADMAP (task graph first)

**Files:**
- Modify: `ROADMAP.md` (new `## Серия H` block after the Series G block, before the version-history table)

ROADMAP series entries are this project's task board (no task CLI here), so the graph exists before code does.

- [ ] **Step 1: Check the letter is free and find the insertion point**

```bash
grep -n "^## Серия" ROADMAP.md
```
Expected: no `## Серия H` line; note the line number of the last `## Серия` block (G or later) — insert after that block, before the `## … История версий`/table section that closes the file.

- [ ] **Step 2: Insert the block**

```markdown
## Серия H — «Главная-меню и обратная связь» (оверлей «Разделы», форма идей, опрос)

Спека: [docs/design/2026-09-12-home-menu-and-feedback.md](docs/design/2026-09-12-home-menu-and-feedback.md) · план: [docs/superpowers/plans/2026-09-12-home-menu-and-feedback.md](docs/superpowers/plans/2026-09-12-home-menu-and-feedback.md). **Спрос:** запрос пользователя 2026-09-12 (карта платформы с индикаторами обновлений для старых посетителей; простая форма заявок без регистрации; опрос с 3-го визита); аналитика 07-28 — 78 % визитов возвращающиеся, туториал 127→27, feedback-кнопка недоступна на телефонах (B38, style.css:2714).

### H1. Манифест, скриншоты, оверлей «Разделы», бейджи `[ ]` — HAE 4h (frontend) + 0.5h (ops)
`sections.json` (11 записей EN/RU), `scripts/shoot_cards.mjs` + `build_cards.py` → `promo/cards/*.webp`, `home.js` (счётчик визитов, бейджи по `updated`/`added`, авто-показ: визит 2 — интро, далее при непросмотренном раз в день), кнопка в таб-баре и в шапке Библиотеки, Node-тест `scripts/test_home_logic.js`, PRECACHE/cp-list. **DoD:** чистый профиль → только туториал; визит 2 → интро; бамп `updated` → точка + янтарная рамка + авто-показ с счётчиком; 4 вида `target` с обеих страниц; 375 px без overflow; консоль чистая.

### H2. Форма идей, Cloudflare Worker, issue-шаблоны `[ ]` — HAE 4h (frontend + ops) — **зависит от H1**
`feedback.js` (режим `idea`, honeypot, 3 с, 1/мин, prefill-ссылка), `worker/` (origin, размер, лимит 5/мин/IP, issue `idea`+`from-site`), `.github/ISSUE_TEMPLATE/idea.yml`/`survey.yml`, метки, Node-тесты Worker'а и логики формы. Фича-флаг `FEEDBACK_URL` — пока пуст, все входы ведут на GitHub-шаблон. **Внешний шаг владельца:** аккаунт Cloudflare, PAT `Issues: Read and write`, `wrangler deploy`. **DoD:** отправка из превью через `wrangler dev` создаёт issue с метками; honeypot → 400, чужой origin → 403; офлайн-тост; телефон 375 px.

### H3. Счётчик визитов + опрос `[ ]` — HAE 2h (frontend) — **зависит от H2**
Планировщик: 60 с видимости, визит ≥ 3, не в одной загрузке с меню (`window.__chemdbPopup`), режим B (× → через 30 дней ещё раз, второй × — навсегда). Немодальная карточка / нижний лист. **DoD:** issue `[survey] визит 3 · …`; состояния `done`/`dismissed`/`skippedVisit` по сценарию спеки.

### H4. `check_sections.py`, цели Метрики, документация `[ ]` — HAE 1.5h (ops + docs) — **зависит от H1–H3**
Валидатор манифеста в `deploy.yml` (цели, скриншоты, даты; предупреждение об устаревшем скриншоте), 8 целей в `create_metrika_goals.py` (запуск — по «ок» владельца), README/CHANGELOG/ROADMAP. **DoD:** сломанный манифест → красный билд; `track()` ↔ реестр 8/8.
```

- [ ] **Step 3: Commit**

```bash
git add ROADMAP.md
git commit -m "docs(roadmap): series H — home menu, feedback Worker, survey (H1–H4)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 1: Card screenshots pipeline

**Files:**
- Create: `scripts/shoot_cards.mjs`
- Create: `scripts/build_cards.py`
- Create: `promo/cards/*.webp` (10 files, generated)
- Modify: `.gitignore` (add `promo/cards-src/`)

The shoot script needs the app served locally and reads the URL/prep table below. `restoreTreeSession`, `calcTarget`/`calcBtn`, auto-selected heal type / fork pair / initial map are existing behaviours (`app.js:2196`, `app.js:1829-1845`, `app.js:1572-1588`, `maps.js:68`), so only Trees and Calculator need a prep action.

- [ ] **Step 1: Start the preview server and note its URL**

Use `preview_start` with `{name: "ss14-chem"}` (`.claude/launch.json`, binds 127.0.0.1). Note the port it prints (default 8090). `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8090/data.json` → `200`.

- [ ] **Step 2: Write the shoot script**

```js
// scripts/shoot_cards.mjs — shoots the card backgrounds for sections.json.
// Usage: node scripts/shoot_cards.mjs http://127.0.0.1:8090
// Needs Chrome installed (path below) and puppeteer-core: npx -y puppeteer-core is
// resolved automatically by `npx`, or `npm i -g puppeteer-core`.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] || 'http://127.0.0.1:8090';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.resolve('promo/cards-src');
fs.mkdirSync(OUT, { recursive: true });

// id → [url, prep]. prep runs in the page after the app is ready.
const SHOTS = {
  reagents:   ['/', null],
  calculator: ['/#tab=calculator', () => { document.getElementById('calcTarget').value = 'Bicaridine'; document.getElementById('calcBtn').click(); }],
  medbay:     ['/#tab=medbay', null],
  trees:      ['/#tab=trees', () => { window.restoreTreeSession({ treeTarget: 'Bicaridine', treeAmount: '30' }); }],
  botany:     ['/#tab=botany', null],
  maps:       ['/#tab=maps', null],
  ordnance:   ['/#tab=ordnance&src=stories_cm', null],
  forkdiff:   ['/#tab=forkdiff', null],
  library:    ['/library.html', null],
  antag:      ['/#antag=1&tab=antag', null],
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: { width: 1800, height: 915 } });
try {
  for (const [id, [url, prep]] of Object.entries(SHOTS)) {
    const page = await browser.newPage();
    // Tutorial auto-starts on a fresh profile; the home menu must not auto-show either.
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('ss14_tutorial_seen', '1');
      localStorage.setItem('chemdb-home', JSON.stringify({ seen: {}, autoShow: false, lastAutoShown: null, introShown: true }));
    });
    await page.goto(BASE + url, { waitUntil: 'networkidle2', timeout: 60000 });
    if (url.startsWith('/library')) await page.waitForSelector('#libList');
    else await page.waitForSelector('#loadingOverlay.hidden', { timeout: 60000 });
    if (prep) { await page.evaluate(prep); }
    await new Promise(r => setTimeout(r, 1500)); // let the tab render / map paint
    const file = path.join(OUT, id + '.png');
    await page.screenshot({ path: file, type: 'png' });
    console.log('shot', id, '->', path.relative(process.cwd(), file));
    await page.close();
  }
} finally {
  await browser.close();
}
```

- [ ] **Step 3: Write the WebP builder**

```python
# scripts/build_cards.py — promo/cards-src/<id>.png -> promo/cards/<id>.webp (720 px wide).
# Run: python scripts/build_cards.py   (after scripts/shoot_cards.mjs)
import pathlib, sys
from PIL import Image

SRC = pathlib.Path('promo/cards-src')
DST = pathlib.Path('promo/cards')
WIDTH = 720
TARGET_KB = 25

def build(png: pathlib.Path) -> int:
    im = Image.open(png).convert('RGB')
    w, h = im.size
    im = im.resize((WIDTH, round(WIDTH * h / w)), Image.LANCZOS)
    out = DST / (png.stem + '.webp')
    for q in (72, 64, 56, 48):
        im.save(out, 'WEBP', quality=q, method=6)
        kb = out.stat().st_size // 1024
        if kb <= TARGET_KB:
            break
    print(f'{out} {im.size[0]}x{im.size[1]} q={q} {kb} KB')
    return kb

def main() -> int:
    DST.mkdir(parents=True, exist_ok=True)
    pngs = sorted(SRC.glob('*.png'))
    if not pngs:
        print('no sources in promo/cards-src — run node scripts/shoot_cards.mjs first'); return 1
    worst = max(build(p) for p in pngs)
    return 0 if worst <= TARGET_KB else 1

if __name__ == '__main__':
    sys.exit(main())
```

- [ ] **Step 4: Run both**

```bash
npx -y puppeteer-core@23 >/dev/null 2>&1; node scripts/shoot_cards.mjs http://127.0.0.1:8090 && python scripts/build_cards.py
```
Expected: ten `shot <id> -> promo/cards-src/<id>.png` lines, then ten `promo/cards/<id>.webp 720x366 q=… NN KB` lines with NN ≤ 25, exit 0. If `puppeteer-core` cannot be resolved by `npx`, run `npm i -g puppeteer-core@23` once and retry. Open two WebPs (Read tool) and confirm they show the right tab (trees shows a tree, antag shows strategies).

- [ ] **Step 5: Ignore the sources, commit the cards**

Append to `.gitignore`:
```
# Card screenshot sources (re-shot by scripts/shoot_cards.mjs); only promo/cards/*.webp ships
promo/cards-src/
```
```bash
git add .gitignore scripts/shoot_cards.mjs scripts/build_cards.py promo/cards
git commit -m "feat(home): card screenshot pipeline — ten section backgrounds as 720px WebP

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 2: `sections.json`

**Files:**
- Create: `sections.json`

- [ ] **Step 1: Write the manifest**

```json
{
  "schema": 1,
  "sections": [
    { "id": "reagents", "weight": "hero", "target": "tab:reagents", "icon": "⚗",
      "title": { "en": "Reagents", "ru": "Реагенты" },
      "desc": { "en": "Every reagent of 21 SS14 forks: recipe, effects, where to get it.", "ru": "Все реагенты 21 форка SS14: рецепт, эффекты, где взять." },
      "inside": [ { "en": "Search", "ru": "Поиск" }, { "en": "Fork filter", "ru": "Фильтр форков" }, { "en": "Fewest-steps sort", "ru": "Сортировка по шагам" }, { "en": "Reagent card", "ru": "Карточка реагента" } ],
      "shot": "promo/cards/reagents.webp", "added": "2026-04-19", "updated": "2026-07-26",
      "whatsNew": { "en": "Russian names and descriptions", "ru": "Русские названия и описания" } },
    { "id": "calculator", "weight": "hero", "target": "tab:calculator", "icon": "∑",
      "title": { "en": "Calculator", "ru": "Калькулятор" },
      "desc": { "en": "Four planners in one tab — from a single recipe to a whole shift.", "ru": "Четыре планировщика в одной вкладке — от одного рецепта до целой смены." },
      "inside": [ { "en": "Recipe math", "ru": "Расчёт рецепта" }, { "en": "Shift planner", "ru": "Планировщик смены" }, { "en": "Beaker simulator", "ru": "Симулятор стакана" }, { "en": "What can I make?", "ru": "Что могу сварить?" } ],
      "shot": "promo/cards/calculator.webp", "added": "2026-04-19", "updated": "2026-09-12",
      "whatsNew": { "en": "Default recipe is the one a chemist means", "ru": "Рецепт по умолчанию — тот, что имеет в виду химик" } },
    { "id": "medbay", "weight": "normal", "target": "tab:medbay", "icon": "✚",
      "title": { "en": "What Heals?", "ru": "Чем лечить?" },
      "desc": { "en": "Pick a damage type and species — medicines ranked by healing per unit.", "ru": "Тип урона и раса — препараты по лечению за юнит." },
      "inside": [ { "en": "Damage types", "ru": "Типы урона" }, { "en": "Species physiology", "ru": "Физиология рас" }, { "en": "Heal per second", "ru": "Лечение в секунду" } ],
      "shot": "promo/cards/medbay.webp", "added": "2026-07-12", "updated": "2026-07-12",
      "whatsNew": { "en": "Metabolism rate — heal per second", "ru": "Скорость метаболизма — лечение в секунду" } },
    { "id": "trees", "weight": "normal", "target": "tab:trees", "icon": "⌥",
      "title": { "en": "Craft Trees", "ru": "Деревья крафта" },
      "desc": { "en": "The whole synthesis chain with a gathering checklist.", "ru": "Вся цепочка синтеза с чеклистом сбора." },
      "inside": [ { "en": "Checklist", "ru": "Чеклист" }, { "en": "Amount scaling", "ru": "Пересчёт количества" }, { "en": "Loop markers", "ru": "Метки циклов" } ],
      "shot": "promo/cards/trees.webp", "added": "2026-04-19", "updated": "2026-07-12",
      "whatsNew": { "en": "Gathering checklist with progress", "ru": "Чеклист сбора с прогрессом" } },
    { "id": "botany", "weight": "normal", "target": "tab:botany", "icon": "❀",
      "title": { "en": "Botany", "ru": "Ботаника" },
      "desc": { "en": "What feeds, heals, mutates or kills plants.", "ru": "Что кормит, лечит, мутирует и убивает растения." },
      "inside": [ { "en": "Effect chips", "ru": "Чипы эффектов" }, { "en": "Mutation tree", "ru": "Дерево мутаций" }, { "en": "Value ranges", "ru": "Диапазоны значений" }, { "en": "Swab guide", "ru": "Гайд по мазкам" } ],
      "shot": "promo/cards/botany.webp", "added": "2026-07-11", "updated": "2026-09-12",
      "whatsNew": { "en": "Plant Healing chips and value ranges", "ru": "Чипы Plant Healing и диапазоны значений" } },
    { "id": "maps", "weight": "normal", "target": "tab:maps", "icon": "⌖",
      "title": { "en": "Maps", "ru": "Карты" },
      "desc": { "en": "Where an item spawns on the station, plus a sell list with prices.", "ru": "Где лежит предмет на станции, плюс прайс-лист «что продать»." },
      "inside": [ { "en": "Item search", "ru": "Поиск предмета" }, { "en": "Beacon groups", "ru": "Группы по маякам" }, { "en": "Sell list", "ru": "Список на продажу" }, { "en": "Size and price filters", "ru": "Фильтры размера и цены" } ],
      "shot": "promo/cards/maps.webp", "added": "2026-07-12", "updated": "2026-07-28",
      "whatsNew": { "en": "Size and price filters, multi-show on the map", "ru": "Фильтры размера и цены, мульти-показ на карте" } },
    { "id": "ordnance", "weight": "normal", "target": "tab:ordnance", "icon": "✸",
      "title": { "en": "Ordnance", "ru": "Боеприпасы" },
      "desc": { "en": "Space Stories: mix a casing — power, radius, fire, cheapest recipe.", "ru": "Space Stories: смесь в корпусе — мощность, радиус, огонь, дешёвый подбор." },
      "inside": [ { "en": "Casing mixer", "ru": "Сборщик смеси" }, { "en": "Heatmap", "ru": "Теплокарта" }, { "en": "Pareto search", "ru": "Парето-подбор" }, { "en": "Fire model", "ru": "Модель огня" } ],
      "shot": "promo/cards/ordnance.webp", "added": "2026-09-10", "updated": "2026-09-12",
      "whatsNew": { "en": "Max fire for the least mixture", "ru": "Максимум огня за минимум смеси" } },
    { "id": "forkdiff", "weight": "normal", "target": "tab:forkdiff", "icon": "⇄",
      "title": { "en": "Fork Diff", "ru": "Сравнение форков" },
      "desc": { "en": "Moved to another server? See what was added, removed or rebalanced.", "ru": "Переехал на другой сервер? Что добавили, убрали и перебалансировали." },
      "inside": [ { "en": "Added", "ru": "Добавлено" }, { "en": "Removed", "ru": "Удалено" }, { "en": "Rebalanced", "ru": "Перебалансировано" } ],
      "shot": "promo/cards/forkdiff.webp", "added": "2026-07-12", "updated": "2026-07-12",
      "whatsNew": { "en": "Deep link to a fork pair", "ru": "Ссылка на пару форков" } },
    { "id": "library", "weight": "normal", "target": "page:library.html", "icon": "▤",
      "title": { "en": "Library", "ru": "Библиотека" },
      "desc": { "en": "Player-written doctrines and role memos — as paper in game.", "ru": "Уставы и памятки ролей, написанные игроками — как бумага в игре." },
      "inside": [ { "en": "Rendered paper", "ru": "Лист как в игре" }, { "en": "Markup copy", "ru": "Копия разметки" }, { "en": "By role", "ru": "По ролям" } ],
      "shot": "promo/cards/library.webp", "added": "2026-09-11", "updated": "2026-09-11",
      "whatsNew": { "en": "Staff Officer doctrine (RuCM)", "ru": "Доктрина Офицера Штаба (RuCM)" } },
    { "id": "antag", "weight": "normal", "target": "mode:antag", "icon": "☠",
      "title": { "en": "Antag Strategies", "ru": "Стратегии антагониста" },
      "desc": { "en": "Hidden tab: poisons, delivery methods, difficulty. Turns antag mode on.", "ru": "Скрытая вкладка: яды, способы доставки, сложность. Включает режим антагониста." },
      "inside": [ { "en": "Lethality score", "ru": "Оценка летальности" }, { "en": "Delivery methods", "ru": "Способы доставки" }, { "en": "Difficulty filters", "ru": "Фильтры сложности" } ],
      "shot": "promo/cards/antag.webp", "added": "2026-04-19", "updated": "2026-07-28",
      "whatsNew": { "en": "Multi-select difficulty and method filters", "ru": "Мультивыбор сложности и способа" } },
    { "id": "feedback", "weight": "normal", "target": "action:feedback", "icon": "✎",
      "title": { "en": "Suggest an idea", "ru": "Предложить идею" },
      "desc": { "en": "What's missing? Two lines, no sign-up.", "ru": "Чего не хватает? Две строки, без регистрации." },
      "inside": [] }
  ]
}
```

- [ ] **Step 2: Validate JSON and every shot path**

```bash
python -c "import json,pathlib; d=json.load(open('sections.json',encoding='utf-8')); miss=[s['shot'] for s in d['sections'] if 'shot' in s and not pathlib.Path(s['shot']).exists()]; print(len(d['sections']),'sections; missing shots:',miss)"
```
Expected: `11 sections; missing shots: []`

- [ ] **Step 3: Commit**

```bash
git add sections.json
git commit -m "feat(home): sections.json — the platform map manifest (11 entries, EN/RU)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 3: Home logic — failing tests

**Files:**
- Create: `scripts/test_home_logic.js`

The tests load `home.js` into a `vm` context with only `window`, exactly like `scripts/test_library_markup.js` does for `library.js`, so the module must expose its pure functions on `window.ChemDBHomeLogic` before it touches `document`.

- [ ] **Step 1: Write the test file**

```js
// Exercises the pure half of home.js (visits, badges, auto-show decision) under Node.
// Run: node scripts/test_home_logic.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'home.js'), 'utf8');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(src, ctx);
const L = ctx.window.ChemDBHomeLogic;

const H = 3600 * 1000, D = 24 * H;
const T0 = Date.parse('2026-09-12T12:00:00Z');
const SECTIONS = [
  { id: 'a', added: '2026-04-19', updated: '2026-07-01', whatsNew: { en: 'x', ru: 'х' } },
  { id: 'b', added: '2026-07-12', updated: '2026-09-10', whatsNew: { en: 'y', ru: 'у' } },
  { id: 'c', added: '2026-09-11', updated: '2026-09-11', whatsNew: { en: 'z', ru: 'з' } },
  { id: 'feedback' },
];

const cases = [
  ['first load creates visit 1', () => {
    const r = L.bumpVisits(null, T0);
    assert.deepStrictEqual(r, { visits: { n: 1, first: T0, last: T0, prevLast: null, touched: T0 }, isNewVisit: true });
  }],
  ['reload within 6h is the same visit', () => {
    const v1 = L.bumpVisits(null, T0).visits;
    const r = L.bumpVisits(v1, T0 + 5 * H);
    assert.strictEqual(r.isNewVisit, false);
    assert.strictEqual(r.visits.n, 1);
    assert.strictEqual(r.visits.touched, T0 + 5 * H);
  }],
  ['6h after the last touch starts visit 2 and remembers the previous start', () => {
    const v1 = L.bumpVisits(null, T0).visits;
    const touched = L.bumpVisits(v1, T0 + 5 * H).visits;
    const r = L.bumpVisits(touched, T0 + 11 * H);
    assert.strictEqual(r.isNewVisit, true);
    assert.strictEqual(r.visits.n, 2);
    assert.strictEqual(r.visits.prevLast, T0);
    assert.strictEqual(r.visits.first, T0);
  }],
  ['garbage in storage restarts at visit 1', () => {
    assert.strictEqual(L.bumpVisits({ n: 'x' }, T0).visits.n, 1);
    assert.strictEqual(L.bumpVisits('[bad', T0).visits.n, 1);
  }],
  ['markAllSeen snapshots every dated section', () => {
    const s = L.markAllSeen(SECTIONS, { autoShow: true });
    assert.deepStrictEqual(s.seen, { a: '2026-07-01', b: '2026-09-10', c: '2026-09-11' });
    assert.strictEqual(s.autoShow, true);
  }],
  ['no badges right after first-visit snapshot', () => {
    const visits = { n: 1, first: T0 };
    const state = L.markAllSeen(SECTIONS, {});
    assert.strictEqual(L.computeBadges(SECTIONS, state, visits, T0).count, 0);
  }],
  ['updated after seen → updated badge; older than 60 days → none', () => {
    const visits = { n: 3, first: Date.parse('2026-06-01') };
    const state = { seen: { a: '2026-06-01', b: '2026-09-01', c: '2026-09-11' } };
    const b = L.computeBadges(SECTIONS, state, visits, T0);
    assert.deepStrictEqual(b.byId, { b: 'updated' });       // a: update is 73 days old
    assert.strictEqual(b.count, 1);
  }],
  ['section added after first visit and never seen → new badge', () => {
    const visits = { n: 3, first: Date.parse('2026-09-01') };
    const state = { seen: { a: '2026-07-01', b: '2026-09-10' } };
    const b = L.computeBadges(SECTIONS, state, visits, T0);
    assert.strictEqual(b.byId.c, 'new');
  }],
  ['undated feedback card never badges', () => {
    const b = L.computeBadges(SECTIONS, { seen: {} }, { n: 5, first: 0 }, T0);
    assert.strictEqual(b.byId.feedback, undefined);
  }],
  ['auto-show: blocked contexts win', () => {
    const ok = { storageOk: true, companion: false, deepLink: false, tutorialActive: false };
    const visits = { n: 4, first: 0 };
    const state = { autoShow: true, introShown: true, lastAutoShown: null };
    for (const k of ['companion', 'deepLink', 'tutorialActive']) {
      assert.strictEqual(L.decideAutoShow(Object.assign({}, ok, { [k]: true }), state, visits, 3, T0).mode, null);
    }
    assert.strictEqual(L.decideAutoShow(Object.assign({}, ok, { storageOk: false }), state, visits, 3, T0).mode, null);
  }],
  ['auto-show: first visit never, second visit intro once', () => {
    const ok = { storageOk: true, companion: false, deepLink: false, tutorialActive: false };
    assert.strictEqual(L.decideAutoShow(ok, { autoShow: true }, { n: 1 }, 0, T0).mode, null);
    assert.strictEqual(L.decideAutoShow(ok, { autoShow: true, introShown: false }, { n: 2 }, 0, T0).mode, 'intro');
    assert.strictEqual(L.decideAutoShow(ok, { autoShow: true, introShown: false }, { n: 3 }, 0, T0).mode, 'intro'); // blocked on visit 2 → shown at next chance
    assert.strictEqual(L.decideAutoShow(ok, { autoShow: true, introShown: true }, { n: 2 }, 0, T0).mode, null);
  }],
  ['auto-show: updates once a day, toggle off respected', () => {
    const ok = { storageOk: true, companion: false, deepLink: false, tutorialActive: false };
    const st = { autoShow: true, introShown: true, lastAutoShown: null };
    assert.strictEqual(L.decideAutoShow(ok, st, { n: 5 }, 2, T0).mode, 'updates');
    assert.strictEqual(L.decideAutoShow(ok, Object.assign({}, st, { lastAutoShown: T0 - H }), { n: 5 }, 2, T0).mode, null);
    assert.strictEqual(L.decideAutoShow(ok, Object.assign({}, st, { lastAutoShown: T0 - 2 * D }), { n: 5 }, 2, T0).mode, 'updates');
    assert.strictEqual(L.decideAutoShow(ok, Object.assign({}, st, { autoShow: false }), { n: 5 }, 2, T0).mode, null);
    assert.strictEqual(L.decideAutoShow(ok, st, { n: 5 }, 0, T0).mode, null);
  }],
  ['headline: count + date, or "recently" when the previous visit is too old', () => {
    const prev = Date.parse('2026-09-05T10:00:00Z');
    assert.strictEqual(L.headline('en', 2, prev, T0), '2 sections updated since your visit on 5 September');
    assert.strictEqual(L.headline('ru', 1, prev, T0), '1 раздел обновился с вашего визита 5 сентября');
    assert.strictEqual(L.headline('ru', 5, prev, T0), '5 разделов обновились с вашего визита 5 сентября');
    assert.strictEqual(L.headline('en', 2, null, T0), '2 sections updated recently');
    assert.strictEqual(L.headline('en', 2, T0 - 70 * D, T0), '2 sections updated recently');
  }],
  ['badge line: what is new + short date', () => {
    assert.strictEqual(L.badgeLine('en', SECTIONS[1], 'updated'), 'New: y · 10 Sep');
    assert.strictEqual(L.badgeLine('ru', SECTIONS[1], 'updated'), 'Новое: у · 10 сен');
    assert.strictEqual(L.badgeLine('en', SECTIONS[2], 'new'), 'New section · 11 Sep');
    assert.strictEqual(L.badgeLine('ru', SECTIONS[2], 'new'), 'Новый раздел · 11 сен');
  }],
];

let failed = 0;
for (const [name, fn] of cases) {
  try { fn(); console.log('ok   ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n  ' + (e.message || e)); }
}
console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/test_home_logic.js`
Expected: exits 1 with `ENOENT ... home.js` (file does not exist yet).

### Task 4: Home logic — implementation

**Files:**
- Create: `home.js` (pure half only; the DOM half is Task 5)

- [ ] **Step 1: Write the pure half of `home.js`**

```js
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// This file is part of Space Station Recipes.
// See LICENSE for details.
//
// Series H: the "Sections" overlay — a map of the platform with badges on
// sections that changed since the visitor's last look. Reads sections.json,
// keeps the visit counter (window.ChemDBVisits) and decides when to pop up.
// Design: docs/design/2026-09-12-home-menu-and-feedback.md.
//
// window.ChemDBHomeLogic is pure and is what scripts/test_home_logic.js drives
// under Node; everything below the "page" line needs a DOM.
(function () {
  'use strict';

  var YM_COUNTER_ID = 108585248;
  var VISIT_GAP_MS = 6 * 60 * 60 * 1000;   // a new visit starts after 6 quiet hours
  var BADGE_TTL_DAYS = 60;                 // older changes are history, not news
  var DAY_MS = 24 * 60 * 60 * 1000;
  var KEY_VISITS = 'chemdb-visits';
  var KEY_STATE = 'chemdb-home';
  var ISSUES_CHOOSE_URL = 'https://github.com/MikameO/space-station-recipes/issues/new/choose';

  function track(goal, params) {
    try {
      if (typeof ym === 'function') ym(YM_COUNTER_ID, 'reachGoal', goal, params);
    } catch (e) { /* analytics must never break the page */ }
  }

  // ── pure logic ───────────────────────────────────────────
  function parseDate(s) {
    var t = typeof s === 'string' ? Date.parse(s) : NaN;
    return isNaN(t) ? null : t;
  }

  // prev: stored {n, first, last, prevLast, touched} or anything corrupt.
  // `last` is when the current visit started, `touched` the latest page load.
  function bumpVisits(prev, now) {
    var valid = prev && typeof prev === 'object' && typeof prev.n === 'number' &&
                typeof prev.first === 'number' && typeof prev.last === 'number';
    if (!valid) {
      return { visits: { n: 1, first: now, last: now, prevLast: null, touched: now }, isNewVisit: true };
    }
    var touched = typeof prev.touched === 'number' ? prev.touched : prev.last;
    if (now - touched >= VISIT_GAP_MS) {
      return { visits: { n: prev.n + 1, first: prev.first, last: now, prevLast: prev.last, touched: now }, isNewVisit: true };
    }
    return { visits: { n: prev.n, first: prev.first, last: prev.last, prevLast: prev.prevLast || null, touched: now }, isNewVisit: false };
  }

  function markAllSeen(sections, state) {
    var seen = {};
    sections.forEach(function (s) { if (s.updated) seen[s.id] = s.updated; });
    var next = {};
    for (var k in state) if (Object.prototype.hasOwnProperty.call(state, k)) next[k] = state[k];
    next.seen = seen;
    return next;
  }

  // 'new' | 'updated' | null for one section.
  function badgeFor(section, state, visits, now) {
    var added = parseDate(section.added), updated = parseDate(section.updated);
    if (added === null && updated === null) return null;       // undated = action card
    var seen = (state && state.seen) || {};
    var seenStr = seen[section.id];
    var ttl = BADGE_TTL_DAYS * DAY_MS;
    if (added !== null && seenStr === undefined && visits && added > visits.first && now - added <= ttl) return 'new';
    if (updated !== null && now - updated <= ttl) {
      var seenT = seenStr === undefined ? null : parseDate(seenStr);
      if (seenT === null || updated > seenT) return 'updated';
    }
    return null;
  }

  function computeBadges(sections, state, visits, now) {
    var byId = {}, count = 0;
    sections.forEach(function (s) {
      var b = badgeFor(s, state, visits, now);
      if (b) { byId[s.id] = b; count++; }
    });
    return { byId: byId, count: count };
  }

  function sameDay(a, b) {
    var da = new Date(a), db = new Date(b);
    return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
  }

  // ctx: {storageOk, companion, deepLink, tutorialActive}. Rules in design §Авто-показ.
  function decideAutoShow(ctx, state, visits, badgeCount, now) {
    if (!ctx.storageOk || ctx.companion || ctx.deepLink || ctx.tutorialActive) return { mode: null, reason: 'blocked' };
    if (!visits || visits.n <= 1) return { mode: null, reason: 'first-visit' };
    if (!state.introShown) return { mode: 'intro', reason: 'second-visit' };
    if (badgeCount > 0 && state.autoShow !== false && !(state.lastAutoShown && sameDay(state.lastAutoShown, now))) {
      return { mode: 'updates', reason: 'unseen' };
    }
    return { mode: null, reason: 'nothing-new' };
  }

  // ── wording ──────────────────────────────────────────────
  var RU_MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var RU_MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  var EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function plural(n, one, few, many) {
    n = Math.abs(n) % 100;
    var n1 = n % 10;
    if (n > 10 && n < 20) return many;
    if (n1 > 1 && n1 < 5) return few;
    if (n1 === 1) return one;
    return many;
  }
  function longDate(lang, t) {
    var d = new Date(t);
    return lang === 'ru' ? d.getUTCDate() + ' ' + RU_MONTHS[d.getUTCMonth()] : d.getUTCDate() + ' ' + EN_MONTHS[d.getUTCMonth()];
  }
  function shortDate(lang, t) {
    var d = new Date(t);
    return lang === 'ru' ? d.getUTCDate() + ' ' + RU_MONTHS_SHORT[d.getUTCMonth()] : d.getUTCDate() + ' ' + EN_MONTHS[d.getUTCMonth()].slice(0, 3);
  }

  // "2 sections updated since your visit on 5 September" — or "recently" when
  // the previous visit is unknown or older than the badge window.
  function headline(lang, count, prevVisit, now) {
    var recent = typeof prevVisit === 'number' && now - prevVisit <= BADGE_TTL_DAYS * DAY_MS;
    if (lang === 'ru') {
      var noun = plural(count, 'раздел', 'раздела', 'разделов');
      var verb = plural(count, 'обновился', 'обновились', 'обновились');
      return count + ' ' + noun + ' ' + verb + (recent ? ' с вашего визита ' + longDate('ru', prevVisit) : ' за последнее время');
    }
    return count + ' section' + (count === 1 ? '' : 's') + ' updated' + (recent ? ' since your visit on ' + longDate('en', prevVisit) : ' recently');
  }

  function badgeLine(lang, section, badge) {
    if (badge === 'new') {
      return (lang === 'ru' ? 'Новый раздел' : 'New section') + ' · ' + shortDate(lang, parseDate(section.added));
    }
    var what = section.whatsNew ? (section.whatsNew[lang] || section.whatsNew.en || '') : '';
    return (lang === 'ru' ? 'Новое: ' : 'New: ') + what + ' · ' + shortDate(lang, parseDate(section.updated));
  }

  window.ChemDBHomeLogic = {
    bumpVisits: bumpVisits, markAllSeen: markAllSeen, computeBadges: computeBadges,
    decideAutoShow: decideAutoShow, headline: headline, badgeLine: badgeLine,
    VISIT_GAP_MS: VISIT_GAP_MS, BADGE_TTL_DAYS: BADGE_TTL_DAYS,
  };

  // ── page ─────────────────────────────────────────────────
  if (typeof document === 'undefined') return;
  // (Task 5 continues here)
})();
```

- [ ] **Step 2: Run the tests**

Run: `node scripts/test_home_logic.js`
Expected: 14 `ok` lines, `all passed`, exit 0.

- [ ] **Step 3: Commit**

```bash
git add home.js scripts/test_home_logic.js
git commit -m "feat(home): visit counter, badge and auto-show logic with Node tests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 5: Home overlay — DOM half and CSS

**Files:**
- Modify: `home.js` (replace the `// (Task 5 continues here)` line with the page half below)
- Modify: `style.css` (append a new block at the end of the file)

- [ ] **Step 1: Append the page half to `home.js`**

Replace the line `// (Task 5 continues here)` (keep the `if (typeof document === 'undefined') return;` guard above it and the closing `})();` below it) with:

```js
  var lang = window.I18N_LANG === 'ru' ? 'ru' : 'en';
  var L10N = {
    en: { title: 'What is on the platform',
          intro: 'Here is what the platform has. A card lights up when its section gets something new.',
          toggle: 'Show when sections update', close: 'Close', here: 'You are here',
          btnLabel: function (n) { return n ? 'Sections — ' + n + ' updated' : 'Sections'; } },
    ru: { title: 'Что есть на платформе',
          intro: 'Вот что есть на платформе. Карточка подсвечивается, когда в разделе появляется новое.',
          toggle: 'Показывать при обновлениях', close: 'Закрыть', here: 'Вы здесь',
          btnLabel: function (n) { return n ? 'Разделы — обновлений: ' + n : 'Разделы'; } },
  }[lang];

  // localStorage with a write probe: private mode => store.ok is false and
  // every auto-popup stays off (design §Состояние посетителя).
  var store = (function () {
    var ok = false;
    try { localStorage.setItem('chemdb-probe', '1'); localStorage.removeItem('chemdb-probe'); ok = true; } catch (e) { ok = false; }
    return {
      ok: ok,
      get: function (k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
      set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
    };
  })();

  var now = Date.now();
  var visits = bumpVisits(store.get(KEY_VISITS), now).visits;
  store.set(KEY_VISITS, visits);
  window.ChemDBVisits = visits;                   // feedback.js reads this

  var state = store.get(KEY_STATE);
  if (!state || typeof state !== 'object') state = { seen: {}, autoShow: true, lastAutoShown: null, introShown: false };
  if (!state.seen || typeof state.seen !== 'object') state.seen = {};

  var onIndex = !!document.getElementById('tab-reagents');
  var sections = [];
  var badges = { byId: {}, count: 0 };
  var root = null, lastFocus = null;

  function saveState() { store.set(KEY_STATE, state); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function tx(obj) { return obj ? (obj[lang] || obj.en || '') : ''; }
  function pageName() { return location.pathname.replace(/^.*\//, '') || 'index.html'; }

  function updateButton() {
    var btn = document.getElementById('homeBtn'), dot = document.getElementById('homeDot');
    if (!btn) return;
    btn.setAttribute('aria-label', L10N.btnLabel(badges.count));
    if (dot) dot.hidden = badges.count === 0;       // .home-dot-btn[hidden] has display:none !important
  }

  // ── overlay ──────────────────────────────────────────────
  function cardHtml(s) {
    var badge = badges.byId[s.id] || null;
    var kind = s.target.split(':')[0], arg = s.target.slice(kind.length + 1);
    var here = kind === 'page' && pageName() === arg;
    var cls = 'home-card' + (s.weight === 'hero' ? ' is-hero' : '') + (badge ? ' is-' + badge : '') +
              (kind === 'action' ? ' is-action' : '') + (s.id === 'antag' ? ' is-antag' : '') + (here ? ' is-here' : '');
    var chips = (s.inside || []).slice(0, s.weight === 'hero' ? 99 : 3)
      .map(function (c) { return '<span class="home-chip">' + esc(tx(c)) + '</span>'; }).join('');
    var line = badge ? '<span class="home-new">' + esc(badgeLine(lang, s, badge)) + '</span>' : '';
    var label = esc(tx(s.title)) + (badge ? ' — ' + esc(badgeLine(lang, s, badge)) : '. ' + esc(tx(s.desc)));
    var tag = kind === 'page' ? 'a' : 'button';
    var attrs = kind === 'page' ? ' href="' + esc(arg) + '"' : ' type="button"';
    return '<' + tag + attrs + ' class="' + cls + '" data-id="' + esc(s.id) + '" aria-label="' + label + '">' +
      (s.shot ? '<img class="home-shot" src="' + esc(s.shot) + '" alt="" loading="lazy">' : '') +
      '<span class="home-scrim" aria-hidden="true"></span><span class="home-dot" aria-hidden="true"></span>' +
      '<span class="home-body">' +
        '<span class="home-title"><span class="home-icon" aria-hidden="true">' + esc(s.icon || '') + '</span>' + esc(tx(s.title)) +
          (here ? ' <span class="home-here">' + esc(L10N.here) + '</span>' : '') + '</span>' +
        '<span class="home-desc">' + esc(tx(s.desc)) + '</span>' +
        (chips ? '<span class="home-chips">' + chips + '</span>' : '') + line +
      '</span></' + tag + '>';
  }

  function buildOverlay() {
    if (root) return root;
    root = document.createElement('div');
    root.className = 'home-root';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'homeTitle');
    document.body.appendChild(root);
    root.addEventListener('click', function (e) {
      if (e.target === root || e.target.closest('.home-close')) { close(); return; }
      var card = e.target.closest('.home-card');
      if (card) { e.preventDefault(); onCard(card.getAttribute('data-id')); }
    });
    root.addEventListener('change', function (e) {
      if (e.target.id !== 'homeAutoShow') return;
      state.autoShow = !!e.target.checked; saveState();
      if (!state.autoShow) track('home_autoshow_off');
    });
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      var f = root.querySelectorAll('button, a[href], input');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    return root;
  }

  function render(mode) {
    var heroes = sections.filter(function (s) { return s.weight === 'hero'; });
    var rest = sections.filter(function (s) { return s.weight !== 'hero'; });
    var sub = mode === 'intro' ? L10N.intro : (badges.count ? headline(lang, badges.count, visits.prevLast, now) : '');
    root.innerHTML =
      '<div class="home-panel">' +
        '<div class="home-head"><div><div class="home-title-main" id="homeTitle">' + esc(L10N.title) + '</div>' +
          (sub ? '<div class="home-sub">' + esc(sub) + '</div>' : '') + '</div>' +
          '<div class="home-head-right">' +
            '<label class="home-toggle"><input type="checkbox" id="homeAutoShow"' + (state.autoShow === false ? '' : ' checked') + '> <span>' + esc(L10N.toggle) + '</span></label>' +
            '<button type="button" class="home-close" aria-label="' + esc(L10N.close) + '">&#10005;</button>' +
          '</div></div>' +
        '<div class="home-grid home-grid-hero">' + heroes.map(cardHtml).join('') + '</div>' +
        '<div class="home-grid">' + rest.map(cardHtml).join('') + '</div>' +
      '</div>';
  }

  // mode: 'manual' | 'intro' | 'updates'
  function open(mode) {
    if (!sections.length) return;
    buildOverlay();
    render(mode);
    lastFocus = document.activeElement;
    root.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    var btn = document.getElementById('homeBtn');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    var closeBtn = root.querySelector('.home-close');
    if (closeBtn) closeBtn.focus();
    if (mode !== 'manual') {
      window.__chemdbPopup = 'home';                // one auto-popup per page load
      state.lastAutoShown = now;
      if (mode === 'intro') state.introShown = true;
      saveState();
    }
    track('home_open', { auto: mode === 'manual' ? 0 : (mode === 'intro' ? 'intro' : 1), unseen: badges.count });
  }

  function close() {
    if (!root || !root.classList.contains('is-open')) return;
    root.classList.remove('is-open');
    document.body.style.overflow = '';
    var btn = document.getElementById('homeBtn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    state = markAllSeen(sections, state); saveState();   // closing = "seen everything shown"
    badges = computeBadges(sections, state, visits, now);
    updateButton();
    if (lastFocus && typeof lastFocus.focus === 'function') { try { lastFocus.focus(); } catch (e) { /* gone */ } }
  }

  function onCard(id) {
    var s = null;
    for (var i = 0; i < sections.length; i++) if (sections[i].id === id) s = sections[i];
    if (!s) return;
    track('home_card', { id: id });
    close();
    runTarget(s);
  }

  function clickTab(tab) {
    var btn = document.querySelector('.tab-btn[data-tab="' + tab + '"]');
    if (!btn) return false;
    btn.click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return true;
  }

  function runTarget(s) {
    var kind = s.target.split(':')[0], arg = s.target.slice(kind.length + 1);
    if (kind === 'tab') {
      if (!onIndex || !clickTab(arg)) location.href = './#tab=' + encodeURIComponent(arg);
    } else if (kind === 'mode' && arg === 'antag') {
      if (!onIndex) { location.href = './#antag=1&tab=antag'; return; }
      if (!document.body.classList.contains('antag-active')) {
        var t = document.getElementById('antagToggle');
        if (t) t.click();
      }
      clickTab('antag');
    } else if (kind === 'page') {
      if (pageName() !== arg) location.href = arg;
    } else if (kind === 'action' && arg === 'feedback') {
      if (window.ChemDBFeedback && typeof window.ChemDBFeedback.open === 'function') window.ChemDBFeedback.open('idea', { source: 'home' });
      else window.open(ISSUES_CHOOSE_URL, '_blank', 'noopener');
    }
  }

  // ── boot ─────────────────────────────────────────────────
  function decide() {
    var ctx = {
      storageOk: store.ok,
      companion: document.body.classList.contains('companion'),
      deepLink: location.hash.replace(/^#/, '').length > 0,
      tutorialActive: !!document.querySelector('#tut-root.active'),
    };
    var d = decideAutoShow(ctx, state, visits, badges.count, now);
    if (d.mode && !window.__chemdbPopup) open(d.mode);
  }

  // index.html: wait for app.js (app:ready, or the overlay already hidden if it
  // fired before this module loaded). library.html has no bootstrap to wait for.
  function whenReady(fn) {
    var overlay = document.getElementById('loadingOverlay');
    if (!overlay || overlay.classList.contains('hidden')) { fn(); return; }
    document.addEventListener('app:ready', fn, { once: true });
  }

  function init() {
    var btn = document.getElementById('homeBtn');
    if (btn) btn.addEventListener('click', function () { open('manual'); });
    fetch('sections.json')
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (m) {
        sections = (m && m.sections) || [];
        // First visit: everything that exists now is "seen" — badges start from here.
        if (visits.n === 1 && !Object.keys(state.seen).length) { state = markAllSeen(sections, state); saveState(); }
        badges = computeBadges(sections, state, visits, now);
        updateButton();
        whenReady(function () { setTimeout(decide, 800); });
      })
      .catch(function () { /* offline without the manifest: the button stays inert */ });
  }

  window.ChemDBHome = {
    open: function () { open('manual'); },
    isOpen: function () { return !!(root && root.classList.contains('is-open')); },
    sections: function () { return sections.slice(); },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
```

- [ ] **Step 2: Syntax check and re-run the logic tests**

Run: `node --check home.js && node scripts/test_home_logic.js`
Expected: no syntax error, `all passed`.

- [ ] **Step 3: Append the CSS block to the end of `style.css`**

```css

/* ── Series H: «Sections» overlay (home.js) ─────────────────────────────── */
.home-btn { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
body.companion .home-btn { display: none; }
.home-dot-btn { width: 8px; height: 8px; border-radius: 50%; background: var(--amber); box-shadow: 0 0 6px var(--amber); animation: home-pulse 1.6s ease-in-out infinite; }
.home-dot-btn[hidden] { display: none !important; }
.home-root { position: fixed; inset: 0; z-index: 10000; display: none; align-items: flex-start; justify-content: center; background: rgba(6, 9, 15, 0.84); padding: 24px 12px; overflow-y: auto; }
.home-root.is-open { display: flex; }
.home-panel { width: 100%; max-width: 1100px; background: var(--panel); border: 1px solid var(--border-subtle); border-radius: 4px; padding: 18px 20px 22px; }
.home-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
.home-title-main { color: var(--phosphor); font-size: 1.05rem; letter-spacing: 0.04em; text-transform: uppercase; }
.home-sub { color: var(--text-sub); font-size: 0.78rem; margin-top: 3px; }
.home-head-right { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
.home-toggle { font-size: 0.7rem; color: var(--text-ghost); display: flex; align-items: center; gap: 6px; cursor: pointer; }
.home-close { background: none; border: 1px solid var(--border-subtle); color: var(--text-sub); width: 32px; height: 32px; border-radius: 2px; cursor: pointer; font: inherit; }
.home-close:hover, .home-close:focus-visible { color: var(--phosphor); border-color: var(--phosphor-dim); outline: none; }
.home-grid { display: grid; gap: 12px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.home-grid-hero { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-bottom: 12px; }
.home-card { position: relative; display: block; width: 100%; text-align: left; overflow: hidden; min-height: 118px; background: var(--panel-raised); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 0; color: inherit; text-decoration: none; cursor: pointer; font: inherit; }
.home-card.is-hero { min-height: 150px; }
.home-card:hover { border-color: var(--border-active); }
.home-card:focus-visible { outline: none; border-color: var(--phosphor-dim); box-shadow: 0 0 0 2px var(--phosphor-glow); }
.home-card.is-updated { border-color: var(--amber); }
.home-card.is-new { border-color: var(--phosphor); }
.home-card.is-action { border-style: dashed; border-color: #2c4458; background: var(--hull-plate); }
.home-card.is-here { cursor: default; }
.home-shot { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: right top; }
.home-scrim { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(12, 16, 24, 0.96) 0%, rgba(12, 16, 24, 0.86) 45%, rgba(12, 16, 24, 0.42) 100%); transition: opacity 0.2s; }
.home-card:hover .home-scrim, .home-card:focus-visible .home-scrim { opacity: 0.75; }
.home-dot { position: absolute; top: 10px; right: 10px; width: 9px; height: 9px; border-radius: 50%; display: none; }
.home-card.is-updated .home-dot { display: block; background: var(--amber); animation: home-pulse 1.6s ease-in-out infinite; }
.home-card.is-new .home-dot { display: block; background: var(--phosphor); animation: home-pulse 1.6s ease-in-out infinite; }
@keyframes home-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
.home-body { position: relative; display: block; padding: 12px 14px; }
.home-title { display: flex; align-items: center; gap: 8px; color: var(--text-bright); font-size: 0.92rem; margin-bottom: 4px; }
.home-icon { color: var(--phosphor); font-size: 1.05rem; line-height: 1; }
.home-card.is-antag .home-icon { color: var(--red-alert); }
.home-card.is-action .home-icon { color: var(--cyan); }
.home-here { font-size: 0.62rem; color: var(--text-ghost); border: 1px solid var(--border-subtle); border-radius: 3px; padding: 0 5px; text-transform: uppercase; }
.home-desc { display: block; color: var(--text-sub); font-size: 0.76rem; line-height: 1.4; }
.home-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
.home-chip { border: 1px solid var(--border-subtle); border-radius: 3px; padding: 1px 6px; font-size: 0.64rem; color: var(--text-sub); }
.home-new { display: block; margin-top: 8px; font-size: 0.72rem; color: var(--amber); }
.home-card.is-new .home-new { color: var(--phosphor); }
@media (max-width: 900px) { .home-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 480px) {
  .home-root { padding: 12px 8px; }
  .home-grid, .home-grid-hero { grid-template-columns: minmax(0, 1fr); }
  .home-panel { padding: 14px 12px 18px; }
  .home-head { flex-wrap: wrap; }
  .home-toggle span { display: none; }
}
@media (prefers-reduced-motion: reduce) { .home-dot, .home-dot-btn { animation: none !important; } }
```

- [ ] **Step 4: Commit**

```bash
git add home.js style.css
git commit -m "feat(home): sections overlay — cards, badges, focus trap, targets; .home-* styles

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
(If `git diff --stat style.css` shows hunks that are not yours — another session is mid-edit — stop and tell the user before committing.)

### Task 6: Wire the overlay into both pages, SW and deploy; verify H1

**Files:**
- Modify: `index.html` (tab bar ~line 188, script tags ~line 826-831, `style.css?v=`, `i18n.js?v=`)
- Modify: `library.html` (`.lib-header-right` ~line 48, script tags ~line 80-81, `style.css?v=`, `i18n.js?v=`)
- Modify: `i18n.js` (T dictionary, `// Header` block)
- Modify: `sw.js` (PRECACHE, CACHE)
- Modify: `.github/workflows/deploy.yml` (cp-list)

- [ ] **Step 1: `index.html` — button first in the tab bar**

Insert directly after `<div class="tab-bar" role="tablist">`:
```html
      <button type="button" class="tab-link home-btn" id="homeBtn" aria-haspopup="dialog" aria-expanded="false" title="What is on the platform">&#8862; <span class="home-btn-label">Sections</span><span class="home-dot-btn" id="homeDot" aria-hidden="true" hidden></span></button>
```
`.tab-link`, not `.tab-btn`: `setupTabs()` (`app.js:507`) binds only `.tab-btn` and reads `dataset.tab`. The label sits in its own span so the i18n text-node key is exactly `Sections`.

- [ ] **Step 2: `index.html` — script and cache-bust**

After `<script src="botany.js?v=1" defer></script>` add:
```html
<script src="home.js?v=1" defer></script>
```
Read the current `style.css?v=N` and `i18n.js?v=N` in `index.html` and bump each by 1 (at the time of writing 64→65 and 39→40; re-check). Use the same new numbers in Step 3 and Step 5.

- [ ] **Step 3: `library.html` — button in the header, script, cache-bust**

Insert as the first child of `<div class="header-right lib-header-right">`:
```html
    <button type="button" class="share-btn home-btn" id="homeBtn" aria-haspopup="dialog" aria-expanded="false" title="What is on the platform">&#8862; <span class="home-btn-label">Sections</span><span class="home-dot-btn" id="homeDot" aria-hidden="true" hidden></span></button>
```
After `<script src="library.js?v=1" defer></script>` add `<script src="home.js?v=1" defer></script>`. Set `style.css?v=` and `i18n.js?v=` to the same new numbers as `index.html` (library.html lags behind — it still said `?v=60` / `?v=30`; bringing it level is part of this task).

- [ ] **Step 4: `i18n.js` — two dictionary keys**

In the `T` dictionary, `// Header` block, after `'Home': 'Домой',` add:
```js
    'Sections': 'Разделы',
    'What is on the platform': 'Что есть на платформе',
```

- [ ] **Step 5: `sw.js`**

In `PRECACHE`: update `'./style.css?v=…'` and `'./i18n.js?v=…'` to the new numbers; add `'./home.js?v=1',` after the `botany.js` line and `'./sections.json',` after `'./library/index.json',`. Bump `const CACHE = 'chemdb-vNN'` by 1.

- [ ] **Step 6: `deploy.yml` cp-list**

In the `Collect static files` step: add `home.js sections.json` to the first `cp` line (after `botany.js`), and add after the `cp -r library _site/library` line:
```yaml
          mkdir -p _site/promo && cp -r promo/cards _site/promo/cards
```

- [ ] **Step 7: Local deploy-check dry run**

```bash
rm -rf /tmp/_site && mkdir /tmp/_site && cp index.html library.html home.js sections.json style.css i18n.js /tmp/_site/ && mkdir -p /tmp/_site/promo && cp -r promo/cards /tmp/_site/promo/cards && python - <<'PY'
import re, pathlib
for page in ['index.html', 'library.html']:
    html = pathlib.Path(page).read_text(encoding='utf-8')
    for ref in set(re.findall(r'(?:src|href)="([^"]+)"', html)):
        if re.match(r'(?:https?:)?//|data:|mailto:|#', ref): continue
        p = ref.split('?')[0].split('#')[0].lstrip('./')
        if p and p.endswith(('home.js', 'sections.json')) and not (pathlib.Path('/tmp/_site') / p).exists(): print('MISSING', page, ref)
print('home refs ok')
PY
```
Expected: `home refs ok`, no `MISSING` lines.

- [ ] **Step 8: Browser verification (DoD H1)**

Preview is running (Task 1). Open `http://127.0.0.1:8090/?nocache=1` in the Browser pane. For each check use `javascript_tool` for storage and `read_page`/screenshot for the result:

1. Clean profile: `localStorage.clear(); location.reload()` → tutorial appears, **no** overlay; after skipping the tutorial, `#homeDot` is hidden, `localStorage['chemdb-home']` has `seen` with 10 dates.
2. Visit 2: `v=JSON.parse(localStorage['chemdb-visits']); v.touched-=7*3600e3; v.last-=7*3600e3; localStorage['chemdb-visits']=JSON.stringify(v); location.reload()` → overlay opens by itself ~1 s after the grid, subtitle is the intro text, no badges. Close with Esc → focus returns to `#homeBtn`. Reload → no overlay (`introShown: true`).
3. Updates: `s=JSON.parse(localStorage['chemdb-home']); s.seen.botany='2026-09-01'; s.seen.calculator='2026-09-01'; s.lastAutoShown=null; localStorage['chemdb-home']=JSON.stringify(s); location.reload()` → dot on the button, overlay opens with "2 sections updated since your visit on …", Botany and Calculator cards have amber borders, dots and `New: …` lines. Take a screenshot at 1366 px. Close → dot gone. Reload → no overlay (same day).
4. New section: `s=JSON.parse(localStorage['chemdb-home']); delete s.seen.library; v=JSON.parse(localStorage['chemdb-visits']); v.first=Date.parse('2026-09-01'); localStorage['chemdb-visits']=JSON.stringify(v); s.lastAutoShown=null; localStorage['chemdb-home']=JSON.stringify(s); location.reload()` → Library card green with `New section · 11 Sep`.
5. Toggle: open manually, untick "Show when sections update", close; repeat step 3's storage edit; reload → no overlay, dot on.
6. Targets: click Botany → Botany tab active; Antag → antag mode on and Antag tab active; Library → `library.html` loads with the button in the header; on `library.html` open the overlay → Library card shows "You are here"; click Maps → index loads on the Maps tab; click "Suggest an idea" → GitHub `issues/new/choose` opens in a new tab (H2 replaces this).
7. Deep link: open `/#r=Bicaridine` with `lastAutoShown=null` and badges present → no overlay, dot on.
8. RU: switch language → button says «Разделы», overlay texts Russian, headline «N раздела обновились …».
9. `resize_window` mobile (375) → one column, no horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`), screenshot; `desktop` afterwards.
10. `read_console_messages onlyErrors` → empty on both pages.

- [ ] **Step 9: Commit H1**

```bash
git status --short   # only the files below may be staged; abort if a shared file carries foreign hunks
git add index.html library.html i18n.js sw.js .github/workflows/deploy.yml
git commit -m "feat(home): wire the Sections overlay into both pages, precache and deploy

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

# Increment H2 — idea form, Worker, issue templates

### Task 7: Labels and issue templates

**Files:**
- Create: `.github/ISSUE_TEMPLATE/idea.yml`
- Create: `.github/ISSUE_TEMPLATE/survey.yml`

- [ ] **Step 1: Create the labels the Worker will attach**

```bash
gh label create idea --color 00e5ff --description "Idea or suggestion from a player" && gh label create survey --color ffb627 --description "Returning-visitor survey answer" && gh label create from-site --color 39ff85 --description "Filed through the site form (Cloudflare Worker)" && gh label list | grep -E "^(idea|survey|from-site)"
```
Expected: three lines listing the new labels. (If a label exists already, `gh` says so — fine.)

- [ ] **Step 2: `idea.yml`**

Field ids (`idea`, `contact`, `context`) are what `feedback.js` prefills through `?template=idea.yml&idea=…`.
```yaml
name: Idea or suggestion
description: Something missing, confusing, or worth adding — the same channel as the in-app "Suggest an idea" form.
title: "[idea] "
labels: ["idea"]
body:
  - type: textarea
    id: idea
    attributes:
      label: What is missing, or what got in the way?
      description: One paragraph is plenty. Russian or English.
    validations:
      required: true
  - type: input
    id: context
    attributes:
      label: Where were you? (section, fork, device)
      placeholder: "Calculator · rucm · phone"
  - type: input
    id: contact
    attributes:
      label: How to reach you (optional, public)
      placeholder: "Discord nick"
```

- [ ] **Step 3: `survey.yml`**

```yaml
name: Returning-visitor survey
description: The two questions the site asks on your third visit — answer here if you closed the popup.
title: "[survey] "
labels: ["survey"]
body:
  - type: textarea
    id: hardest
    attributes:
      label: What was the hardest part?
  - type: textarea
    id: wanted
    attributes:
      label: What is missing on the platform?
  - type: input
    id: contact
    attributes:
      label: How to reach you (optional, public)
      placeholder: "Discord nick"
```

- [ ] **Step 4: Commit**

```bash
git add .github/ISSUE_TEMPLATE/idea.yml .github/ISSUE_TEMPLATE/survey.yml
git commit -m "chore(issues): idea and survey templates for the manual feedback fallback

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 8: Worker — failing tests

**Files:**
- Create: `scripts/test_feedback_worker.mjs`

Node 24 runs the Worker's ESM directly (`worker/package.json` declares `"type": "module"`, Task 9). The GitHub call goes through `globalThis.fetch`, which the test replaces.

- [ ] **Step 1: Write the test**

```js
// Drives worker/index.js under Node with a fake env and a fake GitHub.
// Run: node scripts/test_feedback_worker.mjs
import assert from 'node:assert';
import worker, { validate, buildIssue } from '../worker/index.js';

const ORIGIN = 'https://mikameo.github.io';
let ghCalls = [];
let ghStatus = 201;
globalThis.fetch = async (url, init) => {
  ghCalls.push({ url, init, body: JSON.parse(init.body) });
  return new Response(JSON.stringify({ number: 42, html_url: 'https://github.com/MikameO/space-station-recipes/issues/42' }), { status: ghStatus });
};
const env = (over = {}) => ({ ALLOWED_ORIGINS: ORIGIN, GITHUB_TOKEN: 'ghp_test', RL: { limit: async () => ({ success: true }) }, ...over });
const post = (body, { origin = ORIGIN, ct = 'application/json', raw } = {}) =>
  new Request('https://w.example/submit', { method: 'POST', headers: { Origin: origin, 'Content-Type': ct }, body: raw ?? JSON.stringify(body) });
const idea = (over = {}) => ({ kind: 'idea', text: 'Add a dark-roast coffee recipe list', contact: '', meta: { page: 'index', lang: 'ru', fork: 'rucm', tab: 'calculator', visits: 5, device: 'desktop', data: '3.10.0' }, hp: '', t: 4200, ...over });
const survey = (over = {}) => ({ kind: 'survey', answers: { hardest: 'Finding the beaker simulator', wanted: '' }, chips: ['calculator'], contact: 'nick#1', meta: { page: 'index', lang: 'en', fork: 'vanilla', visits: 3, device: 'mobile', data: '3.10.0' }, hp: '', t: 9000, ...over });

const cases = [
  ['OPTIONS from the site → 204 with CORS', async () => {
    const r = await worker.fetch(new Request('https://w.example/submit', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), env());
    assert.strictEqual(r.status, 204);
    assert.strictEqual(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  }],
  ['OPTIONS from elsewhere → 403', async () => {
    const r = await worker.fetch(new Request('https://w.example/submit', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), env());
    assert.strictEqual(r.status, 403);
  }],
  ['POST from elsewhere → 403', async () => {
    const r = await worker.fetch(post(idea(), { origin: 'https://evil.example' }), env());
    assert.strictEqual(r.status, 403);
  }],
  ['GET → 404', async () => {
    const r = await worker.fetch(new Request('https://w.example/submit', { headers: { Origin: ORIGIN } }), env());
    assert.strictEqual(r.status, 404);
  }],
  ['wrong content type → 400', async () => {
    const r = await worker.fetch(post(idea(), { ct: 'text/plain' }), env());
    assert.strictEqual(r.status, 400);
  }],
  ['body over 8 KB → 413', async () => {
    const r = await worker.fetch(post(null, { raw: JSON.stringify(idea({ text: 'x'.repeat(9000) })) }), env());
    assert.strictEqual(r.status, 413);
  }],
  ['bad JSON → 400 bad-json', async () => {
    const r = await worker.fetch(post(null, { raw: '{nope' }), env());
    assert.strictEqual(r.status, 400);
    assert.strictEqual((await r.json()).error, 'bad-json');
  }],
  ['validate: honeypot, speed, kind, lengths, empty survey', () => {
    assert.strictEqual(validate(idea({ hp: 'http://spam' })), 'honeypot');
    assert.strictEqual(validate(idea({ t: 900 })), 'too-fast');
    assert.strictEqual(validate(idea({ kind: 'bug' })), 'bad-kind');
    assert.strictEqual(validate(idea({ text: 'short' })), 'text-length');
    assert.strictEqual(validate(idea({ text: 'x'.repeat(2001) })), 'text-length');
    assert.strictEqual(validate(idea({ contact: 'c'.repeat(81) })), 'contact-long');
    assert.strictEqual(validate(survey({ answers: { hardest: '  ', wanted: '' } })), 'empty');
    assert.strictEqual(validate(survey({ chips: new Array(11).fill('x') })), 'chips');
    assert.strictEqual(validate(idea()), null);
    assert.strictEqual(validate(survey()), null);
  }],
  ['valid idea → GitHub issue with labels, 200 with number and url', async () => {
    ghCalls = [];
    const r = await worker.fetch(post(idea()), env());
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(await r.json(), { ok: true, number: 42, url: 'https://github.com/MikameO/space-station-recipes/issues/42' });
    assert.strictEqual(ghCalls.length, 1);
    assert.strictEqual(ghCalls[0].url, 'https://api.github.com/repos/MikameO/space-station-recipes/issues');
    assert.strictEqual(ghCalls[0].init.headers.Authorization, 'Bearer ghp_test');
    assert.deepStrictEqual(ghCalls[0].body.labels, ['idea', 'from-site']);
    assert.strictEqual(ghCalls[0].body.title, '[idea] Add a dark-roast coffee recipe list');
    assert.ok(ghCalls[0].body.body.includes('| Fork | rucm |'));
    assert.ok(!ghCalls[0].body.body.includes('Contact'));             // empty contact is omitted
  }],
  ['valid survey → survey labels, both answers, chips, contact', async () => {
    ghCalls = [];
    const r = await worker.fetch(post(survey()), env());
    assert.strictEqual(r.status, 200);
    const b = ghCalls[0].body;
    assert.deepStrictEqual(b.labels, ['survey', 'from-site']);
    assert.strictEqual(b.title, '[survey] visit 3 · en · vanilla');
    assert.ok(b.body.includes('Finding the beaker simulator'));
    assert.ok(b.body.includes('Sections: calculator'));
    assert.ok(b.body.includes('| Contact | nick#1 |'));
  }],
  ['rate limit exceeded → 429, GitHub not called', async () => {
    ghCalls = [];
    const r = await worker.fetch(post(idea()), env({ RL: { limit: async () => ({ success: false }) } }));
    assert.strictEqual(r.status, 429);
    assert.strictEqual(ghCalls.length, 0);
  }],
  ['GitHub failure → 502', async () => {
    ghStatus = 500;
    const r = await worker.fetch(post(idea()), env());
    ghStatus = 201;
    assert.strictEqual(r.status, 502);
    assert.strictEqual((await r.json()).error, 'github-500');
  }],
  ['buildIssue: title is one line, cut at 60; pipes and newlines escaped in meta', () => {
    const long = buildIssue(idea({ text: 'line one\nline two ' + 'z'.repeat(80) }));
    assert.ok(!long.title.includes('\n'));
    assert.ok(long.title.length <= 60 + '[idea] '.length + 1);
    assert.ok(long.title.endsWith('…'));
    const tricky = buildIssue(idea({ meta: { page: 'a|b\nc', lang: 'en' } }));
    assert.ok(tricky.body.includes('| Page | a\\|b c |'));
  }],
];

let failed = 0;
for (const [name, fn] of cases) {
  try { await fn(); console.log('ok   ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n  ' + (e.message || e)); }
}
console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/test_feedback_worker.mjs`
Expected: `ERR_MODULE_NOT_FOUND` for `../worker/index.js`.

### Task 9: Worker — implementation

**Files:**
- Create: `worker/index.js`
- Create: `worker/wrangler.toml`
- Create: `worker/package.json`
- Modify: `.gitignore`

- [ ] **Step 1: `worker/index.js`**

```js
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// This file is part of Space Station Recipes.
// See LICENSE for details.
//
// Cloudflare Worker: the site's idea form and returning-visitor survey POST
// here; the Worker files a labelled GitHub issue with the owner's token so the
// public repo never carries a secret. Design: docs/design/2026-09-12-home-menu-and-feedback.md.
// Tests: scripts/test_feedback_worker.mjs. Setup: header of wrangler.toml.

const REPO = 'MikameO/space-station-recipes';
const LABELS = { idea: ['idea', 'from-site'], survey: ['survey', 'from-site'] };
const MAX_BODY_BYTES = 8 * 1024;
const MIN_OPEN_MS = 3000;
const LIMITS = { text: [10, 2000], answer: [0, 2000], contact: [0, 80], chips: 10 };

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(status, body, origin) {
  const headers = { 'Content-Type': 'application/json' };
  if (origin) Object.assign(headers, corsHeaders(origin));
  return new Response(JSON.stringify(body), { status, headers });
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
}

function within(s, [min, max]) {
  return typeof s === 'string' && s.trim().length >= min && s.length <= max;
}

// One line, at most `max` characters, "…" when cut.
function oneLine(s, max) {
  const t = String(s).replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

// Markdown table cell: no pipes, no newlines, bounded.
function cell(v) {
  return String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').slice(0, 120);
}

// null when acceptable, otherwise a short error code (mirrors feedback.js validate()).
export function validate(body) {
  if (!body || typeof body !== 'object') return 'bad-json';
  if (body.hp) return 'honeypot';
  if (!(typeof body.t === 'number' && body.t >= MIN_OPEN_MS)) return 'too-fast';
  if (body.kind !== 'idea' && body.kind !== 'survey') return 'bad-kind';
  if (body.contact !== undefined && !within(String(body.contact), LIMITS.contact)) return 'contact-long';
  if (body.kind === 'idea') {
    if (!within(body.text, LIMITS.text)) return 'text-length';
    return null;
  }
  const a = body.answers && typeof body.answers === 'object' ? body.answers : {};
  const hardest = typeof a.hardest === 'string' ? a.hardest : '';
  const wanted = typeof a.wanted === 'string' ? a.wanted : '';
  if (!within(hardest, LIMITS.answer) || !within(wanted, LIMITS.answer)) return 'answer-length';
  if (!hardest.trim() && !wanted.trim()) return 'empty';
  if (body.chips !== undefined && (!Array.isArray(body.chips) || body.chips.length > LIMITS.chips)) return 'chips';
  return null;
}

export function buildIssue(body) {
  const m = body.meta && typeof body.meta === 'object' ? body.meta : {};
  const rows = [
    ['Page', cell(m.page) + (m.tab ? ' · tab ' + cell(m.tab) : '')],
    ['Lang', cell(m.lang)], ['Fork', cell(m.fork)], ['Visits', cell(m.visits)],
    ['Device', cell(m.device)], ['Data', cell(m.data)],
  ];
  if (body.contact && String(body.contact).trim()) rows.push(['Contact', cell(body.contact)]);
  const table = '| | |\n|---|---|\n' + rows.map(([k, v]) => `| ${k} | ${v || '—'} |`).join('\n');

  let title, text;
  if (body.kind === 'idea') {
    title = '[idea] ' + oneLine(body.text, 60);
    text = '**Idea / Идея**\n\n' + body.text.trim();
  } else {
    const a = body.answers;
    title = `[survey] visit ${m.visits ?? '?'} · ${m.lang || '?'} · ${m.fork || '?'}`;
    text = '**What was the hardest part? / Что было сложнее всего?**\n\n' + (a.hardest.trim() || '—') +
           '\n\n**What is missing? / Чего не хватает?**\n\n' + (a.wanted.trim() || '—');
    if (Array.isArray(body.chips) && body.chips.length) text += '\n\nSections: ' + body.chips.map(c => cell(c)).join(', ');
  }
  return { title, body: text + '\n\n---\n' + table + '\n\n_Sent from the site feedback form._', labels: LABELS[body.kind] };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = allowedOrigins(env).includes(origin);

    if (request.method === 'OPTIONS') {
      return allowed ? new Response(null, { status: 204, headers: corsHeaders(origin) }) : new Response(null, { status: 403 });
    }
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/submit') return json(404, { ok: false, error: 'not-found' });
    if (!allowed) return json(403, { ok: false, error: 'origin' });
    if (!/^application\/json\b/i.test(request.headers.get('Content-Type') || '')) return json(400, { ok: false, error: 'content-type' }, origin);

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json(413, { ok: false, error: 'too-large' }, origin);
    let body;
    try { body = JSON.parse(raw); } catch { return json(400, { ok: false, error: 'bad-json' }, origin); }
    const err = validate(body);
    if (err) return json(400, { ok: false, error: err }, origin);

    if (env.RL) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const { success } = await env.RL.limit({ key: ip });
      if (!success) return json(429, { ok: false, error: 'rate-limited' }, origin);
    }

    const issue = buildIssue(body);
    const gh = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'chemdb-feedback-worker',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify(issue),
    });
    if (!gh.ok) return json(502, { ok: false, error: 'github-' + gh.status }, origin);
    const data = await gh.json();
    return json(200, { ok: true, number: data.number, url: data.html_url }, origin);
  },
};
```

- [ ] **Step 2: `worker/wrangler.toml`**

```toml
# chemdb-feedback — turns the site's idea form and survey into GitHub issues.
#
# One-time setup by the repo owner (nothing here is a secret):
#   1. cd worker && npx wrangler login
#   2. npx wrangler secret put GITHUB_TOKEN
#        -> paste a fine-grained PAT: this repository only, permission "Issues: Read and write"
#   3. npx wrangler deploy
#        -> prints https://chemdb-feedback.<account>.workers.dev
#   4. put that URL into FEEDBACK_URL in feedback.js, bump ?v=, commit.
# Rotate the token by repeating step 2. Stop abuse with `npx wrangler delete`
# or by blanking ALLOWED_ORIGINS in the Cloudflare dashboard.
# Local run: `npx wrangler dev --var ALLOWED_ORIGINS:http://127.0.0.1:8090` with the
# token in worker/.dev.vars (GITHUB_TOKEN=...; gitignored).

name = "chemdb-feedback"
main = "index.js"
compatibility_date = "2026-09-01"

[vars]
ALLOWED_ORIGINS = "https://mikameo.github.io"

# 5 submissions per minute per IP (Workers Rate Limiting binding, free plan).
[[ratelimits]]
name = "RL"
namespace_id = "1001"
simple = { limit = 5, period = 60 }
```

- [ ] **Step 3: `worker/package.json` and `.gitignore`**

```json
{ "name": "chemdb-feedback-worker", "private": true, "type": "module" }
```
Append to `.gitignore`:
```
# Cloudflare Worker local state and secrets
worker/.wrangler/
worker/.dev.vars
worker/node_modules/
```

- [ ] **Step 4: Run the Worker tests**

Run: `node scripts/test_feedback_worker.mjs`
Expected: 13 `ok` lines, `all passed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add worker/index.js worker/wrangler.toml worker/package.json .gitignore scripts/test_feedback_worker.mjs
git commit -m "feat(feedback): Cloudflare Worker files form posts as labelled GitHub issues, with Node tests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 10: Feedback logic — failing tests

**Files:**
- Create: `scripts/test_feedback_logic.js`

- [ ] **Step 1: Write the test**

```js
// Exercises the pure half of feedback.js (validation, payload, prefill URL, survey decision).
// Run: node scripts/test_feedback_logic.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'feedback.js'), 'utf8');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(src, ctx);
const L = ctx.window.ChemDBFeedbackLogic;

const D = 86400000;
const T0 = Date.parse('2026-09-12T12:00:00Z');
const okCtx = { enabled: true, storageOk: true, companion: false, deepLink: false, tutorialActive: false, visits: { n: 3 }, homeOpen: false, popupTaken: false };

const cases = [
  ['idea: short / long / fine', () => {
    assert.deepStrictEqual(L.validate('idea', { text: 'too short' }), { text: 'short' });
    assert.deepStrictEqual(L.validate('idea', { text: 'x'.repeat(2001) }), { text: 'long' });
    assert.deepStrictEqual(L.validate('idea', { text: 'ten chars!', contact: 'c'.repeat(81) }), { contact: 'long' });
    assert.deepStrictEqual(L.validate('idea', { text: 'Add a coffee recipe list please' }), {});
  }],
  ['survey: at least one answer', () => {
    assert.deepStrictEqual(L.validate('survey', { hardest: '  ', wanted: '' }), { form: 'empty' });
    assert.deepStrictEqual(L.validate('survey', { hardest: '', wanted: 'More maps' }), {});
    assert.deepStrictEqual(L.validate('survey', { hardest: 'x'.repeat(2001), wanted: 'y' }), { hardest: 'long' });
  }],
  ['payload carries trimmed fields, meta, honeypot and open time', () => {
    const meta = { page: 'index', lang: 'ru' };
    const p = L.buildPayload('idea', { text: '  hello world  ', contact: ' me ', hp: '' }, meta, T0 - 5000, T0);
    assert.deepStrictEqual(p, { kind: 'idea', contact: 'me', meta, hp: '', t: 5000, text: 'hello world' });
    const s = L.buildPayload('survey', { hardest: 'a', wanted: '', chips: ['maps', 'trees'] }, meta, T0 - 9000, T0);
    assert.deepStrictEqual(s.answers, { hardest: 'a', wanted: '' });
    assert.deepStrictEqual(s.chips, ['maps', 'trees']);
    assert.strictEqual(s.t, 9000);
  }],
  ['prefill URL targets the right template and encodes fields', () => {
    assert.strictEqual(L.prefillUrl('idea', { text: 'a b&c', contact: '' }),
      'https://github.com/MikameO/space-station-recipes/issues/new?template=idea.yml&idea=a%20b%26c');
    assert.strictEqual(L.prefillUrl('survey', { hardest: 'h', wanted: '', contact: 'nick' }),
      'https://github.com/MikameO/space-station-recipes/issues/new?template=survey.yml&hardest=h&contact=nick');
    assert.strictEqual(L.prefillUrl('idea', {}), 'https://github.com/MikameO/space-station-recipes/issues/new?template=idea.yml');
  }],
  ['survey decision: disabled / no storage / blocked contexts', () => {
    assert.strictEqual(L.surveyDecision({}, Object.assign({}, okCtx, { enabled: false }), T0).reason, 'disabled');
    assert.strictEqual(L.surveyDecision({}, Object.assign({}, okCtx, { storageOk: false }), T0).reason, 'no-storage');
    for (const k of ['companion', 'deepLink', 'tutorialActive']) {
      assert.strictEqual(L.surveyDecision({}, Object.assign({}, okCtx, { [k]: true }), T0).show, false);
    }
  }],
  ['survey decision: needs 3 visits, shows when eligible', () => {
    assert.strictEqual(L.surveyDecision({}, Object.assign({}, okCtx, { visits: { n: 2 } }), T0).reason, 'too-few-visits');
    assert.deepStrictEqual(L.surveyDecision({}, okCtx, T0), { show: true, reason: 'eligible' });
    assert.deepStrictEqual(L.surveyDecision(null, okCtx, T0), { show: true, reason: 'eligible' });
  }],
  ['survey decision: mode B — one retry after 30 days, never after the second dismiss', () => {
    const once = L.applyDismiss({}, T0);
    assert.deepStrictEqual(once, { dismissed: 1, dismissedAt: T0 });
    assert.strictEqual(L.surveyDecision(once, okCtx, T0 + 10 * D).reason, 'cooling');
    assert.strictEqual(L.surveyDecision(once, okCtx, T0 + 31 * D).show, true);
    const twice = L.applyDismiss(once, T0 + 31 * D);
    assert.strictEqual(L.surveyDecision(twice, okCtx, T0 + 400 * D).reason, 'dismissed-twice');
  }],
  ['survey decision: submitted → done forever; home took this visit → skip once', () => {
    assert.strictEqual(L.surveyDecision(L.applySubmit({}), okCtx, T0).reason, 'done');
    const r = L.surveyDecision({}, Object.assign({}, okCtx, { homeOpen: true }), T0);
    assert.deepStrictEqual(r, { show: false, reason: 'home-took-it', skipVisit: true });
    const skipped = L.applySkip({}, 3);
    assert.strictEqual(L.surveyDecision(skipped, okCtx, T0).reason, 'skipped-this-visit');
    assert.strictEqual(L.surveyDecision(skipped, Object.assign({}, okCtx, { visits: { n: 4 } }), T0).show, true);
  }],
];

let failed = 0;
for (const [name, fn] of cases) {
  try { fn(); console.log('ok   ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n  ' + (e.message || e)); }
}
console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/test_feedback_logic.js`
Expected: exits 1 with `ENOENT ... feedback.js`.

### Task 11: Feedback logic — implementation (pure half of `feedback.js`)

**Files:**
- Create: `feedback.js`

- [ ] **Step 1: Write the pure half**

```js
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// This file is part of Space Station Recipes.
// See LICENSE for details.
//
// Series H: the idea form and the returning-visitor survey. One form component
// in two modes, posted to the Cloudflare Worker in worker/ which files a GitHub
// issue; while FEEDBACK_URL is empty every entry point falls back to the
// prefilled GitHub issue template instead. Design:
// docs/design/2026-09-12-home-menu-and-feedback.md.
//
// window.ChemDBFeedbackLogic is pure and is what scripts/test_feedback_logic.js
// drives under Node; everything below the "page" line needs a DOM.
(function () {
  'use strict';

  var YM_COUNTER_ID = 108585248;
  var REPO_URL = 'https://github.com/MikameO/space-station-recipes';
  // Worker endpoint (origin only, no trailing slash). Empty = feature off.
  var FEEDBACK_URL = '';
  var LIMITS = { text: [10, 2000], answer: [0, 2000], contact: [0, 80] };
  var MIN_OPEN_MS = 3000;                   // faster than this is a bot
  var COOLDOWN_MS = 60 * 1000;              // one submission per minute per mode
  var SURVEY_MIN_VISITS = 3;
  var SURVEY_DELAY_MS = 60 * 1000;          // visible time before the survey may appear
  var SURVEY_RETRY_MS = 30 * 24 * 60 * 60 * 1000;
  var KEY_SURVEY = 'chemdb-survey';
  var KEY_LAST = 'chemdb-feedback-last';

  function track(goal, params) {
    try {
      if (typeof ym === 'function') ym(YM_COUNTER_ID, 'reachGoal', goal, params);
    } catch (e) { /* analytics must never break the page */ }
  }

  // ── pure logic ───────────────────────────────────────────
  function str(v) { return v == null ? '' : String(v); }

  // {} when fine; otherwise field → 'short' | 'long', or form → 'empty'.
  function validate(kind, f) {
    f = f || {};
    var errors = {};
    if (str(f.contact).length > LIMITS.contact[1]) errors.contact = 'long';
    if (kind === 'idea') {
      var t = str(f.text);
      if (t.trim().length < LIMITS.text[0]) errors.text = 'short';
      else if (t.length > LIMITS.text[1]) errors.text = 'long';
      return errors;
    }
    var h = str(f.hardest), w = str(f.wanted);
    if (h.length > LIMITS.answer[1]) errors.hardest = 'long';
    if (w.length > LIMITS.answer[1]) errors.wanted = 'long';
    if (!h.trim() && !w.trim()) errors.form = 'empty';
    return errors;
  }

  function buildPayload(kind, f, meta, openedAt, now) {
    f = f || {};
    var p = { kind: kind, contact: str(f.contact).trim(), meta: meta, hp: str(f.hp), t: now - openedAt };
    if (kind === 'idea') {
      p.text = str(f.text).trim();
    } else {
      p.answers = { hardest: str(f.hardest).trim(), wanted: str(f.wanted).trim() };
      p.chips = (f.chips || []).slice(0, 10);
    }
    return p;
  }

  // GitHub issue forms prefill fields by id: ?template=idea.yml&idea=…&contact=…
  function prefillUrl(kind, f) {
    f = f || {};
    var parts = ['template=' + (kind === 'idea' ? 'idea.yml' : 'survey.yml')];
    function add(k, v) { v = str(v).trim(); if (v) parts.push(k + '=' + encodeURIComponent(v)); }
    if (kind === 'idea') add('idea', f.text);
    else { add('hardest', f.hardest); add('wanted', f.wanted); }
    add('contact', f.contact);
    return REPO_URL + '/issues/new?' + parts.join('&');
  }

  function copy(o) { var c = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) c[k] = o[k]; return c; }

  // state: {done, dismissed, dismissedAt, skippedVisit}
  // ctx: {enabled, storageOk, companion, deepLink, tutorialActive, visits:{n}, homeOpen, popupTaken}
  function surveyDecision(state, ctx, now) {
    state = state || {};
    if (!ctx.enabled) return { show: false, reason: 'disabled' };
    if (!ctx.storageOk) return { show: false, reason: 'no-storage' };
    if (ctx.companion || ctx.deepLink || ctx.tutorialActive) return { show: false, reason: 'blocked' };
    if (!ctx.visits || ctx.visits.n < SURVEY_MIN_VISITS) return { show: false, reason: 'too-few-visits' };
    if (state.done) return { show: false, reason: 'done' };
    var d = state.dismissed || 0;
    if (d >= 2) return { show: false, reason: 'dismissed-twice' };
    if (d === 1 && typeof state.dismissedAt === 'number' && now - state.dismissedAt < SURVEY_RETRY_MS) return { show: false, reason: 'cooling' };
    if (state.skippedVisit === ctx.visits.n) return { show: false, reason: 'skipped-this-visit' };
    if (ctx.homeOpen || ctx.popupTaken) return { show: false, reason: 'home-took-it', skipVisit: true };
    return { show: true, reason: 'eligible' };
  }
  function applyDismiss(state, now) { var s = copy(state || {}); s.dismissed = (s.dismissed || 0) + 1; s.dismissedAt = now; return s; }
  function applySubmit(state) { var s = copy(state || {}); s.done = true; return s; }
  function applySkip(state, n) { var s = copy(state || {}); s.skippedVisit = n; return s; }

  window.ChemDBFeedbackLogic = {
    validate: validate, buildPayload: buildPayload, prefillUrl: prefillUrl,
    surveyDecision: surveyDecision, applyDismiss: applyDismiss, applySubmit: applySubmit, applySkip: applySkip,
    LIMITS: LIMITS, MIN_OPEN_MS: MIN_OPEN_MS, SURVEY_DELAY_MS: SURVEY_DELAY_MS,
  };

  // ── page ─────────────────────────────────────────────────
  if (typeof document === 'undefined') return;
  // (Task 12 continues here)
})();
```

- [ ] **Step 2: Run the tests**

Run: `node scripts/test_feedback_logic.js`
Expected: 8 `ok` lines, `all passed`.

- [ ] **Step 3: Commit**

```bash
git add feedback.js scripts/test_feedback_logic.js
git commit -m "feat(feedback): validation, payload, prefill and survey-decision logic with Node tests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 12: Feedback form — DOM half, CSS, wiring; verify H2 against `wrangler dev`

**Files:**
- Modify: `feedback.js` (replace `// (Task 12 continues here)`)
- Modify: `style.css` (append `.fb-*` block)
- Modify: `index.html`, `library.html` (script tag, `style.css?v=` bump)
- Modify: `sw.js` (PRECACHE + CACHE), `.github/workflows/deploy.yml` (cp-list)

- [ ] **Step 1: Append the page half to `feedback.js`**

Replace `// (Task 12 continues here)` with:

```js
  var lang = window.I18N_LANG === 'ru' ? 'ru' : 'en';
  var L10N = {
    en: {
      ideaTitle: 'Suggest an idea', ideaLabel: 'What is missing, or what got in the way?',
      surveyTitle: 'A minute of your opinion?', q1: 'What was the hardest part?', q2: 'What is missing on the platform?',
      chipsHint: 'Tap a section to start with it',
      contactLabel: 'How to reach you (optional, public)', contactPh: 'Discord nick',
      note: 'Posted publicly as a GitHub issue. No personal data, please — a Discord nick is enough.',
      send: 'Send', sending: 'Sending…', alt: 'or open an issue yourself', close: 'Close',
      doneTitle: 'Thanks!', doneBody: 'Filed as issue', doneOpen: 'Open it', thanks: 'Thanks — filed!',
      headerLabel: 'Feedback and bug reports',
      err: { short: 'At least 10 characters', long: 'Too long', empty: 'Fill in at least one answer',
             offline: 'No connection — try again later', cooldown: 'One message per minute — give it a moment',
             fast: 'Take a second to read it over, then send', fail: 'Could not send. Use the GitHub link below.' },
    },
    ru: {
      ideaTitle: 'Предложить идею', ideaLabel: 'Чего не хватает или что мешало?',
      surveyTitle: 'Минута на ваше мнение?', q1: 'Что было сложнее всего?', q2: 'Чего не хватает на платформе?',
      chipsHint: 'Тапните раздел, чтобы начать с него',
      contactLabel: 'Как с вами связаться (необязательно, публично)', contactPh: 'Ник в Discord',
      note: 'Публикуется как issue на GitHub — публично. Без личных данных; для связи достаточно ника в Discord.',
      send: 'Отправить', sending: 'Отправляю…', alt: 'или откройте issue сами', close: 'Закрыть',
      doneTitle: 'Спасибо!', doneBody: 'Заявка', doneOpen: 'Открыть', thanks: 'Спасибо — заявка создана!',
      headerLabel: 'Обратная связь и баг-репорты',
      err: { short: 'Минимум 10 символов', long: 'Слишком длинно', empty: 'Заполните хотя бы один ответ',
             offline: 'Нет сети — попробуйте позже', cooldown: 'Одно сообщение в минуту — подождите немного',
             fast: 'Перечитайте секунду — и отправляйте', fail: 'Не отправилось. Воспользуйтесь ссылкой на GitHub ниже.' },
    },
  }[lang];

  var store = (function () {
    var ok = false;
    try { localStorage.setItem('chemdb-probe', '1'); localStorage.removeItem('chemdb-probe'); ok = true; } catch (e) { ok = false; }
    return {
      ok: ok,
      get: function (k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
      set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
    };
  })();

  var onIndex = !!document.getElementById('tab-reagents');
  var root = null, mode = null, openedAt = 0, lastFocus = null, chips = [], source = '';
  var surveyState = store.get(KEY_SURVEY) || {};

  function endpoint() { return String(window.CHEMDB_FEEDBACK_URL || FEEDBACK_URL || '').replace(/\/$/, ''); }
  function enabled() { return !!endpoint(); }
  function esc(s) {
    return str(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function $(sel) { return root ? root.querySelector(sel) : null; }

  // Hidden context the Worker puts in the issue's meta table.
  function meta() {
    var src = document.querySelector('input[name="source"]:checked');
    var tab = document.querySelector('.tab-btn.active');
    var data = '';
    try { if (typeof DATA !== 'undefined' && DATA && DATA.meta) data = str(DATA.meta.schemaVersion); } catch (e) { /* not on this page */ }
    return {
      page: onIndex ? 'index' : 'library', lang: lang,
      fork: src ? src.value : '', tab: tab ? tab.dataset.tab : '',
      visits: window.ChemDBVisits ? window.ChemDBVisits.n : null,
      device: window.matchMedia && window.matchMedia('(max-width: 700px)').matches ? 'mobile' : 'desktop',
      data: data,
    };
  }

  // library.html has no #toast; make one on demand, reusing .toast from style.css.
  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; el.id = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { el.classList.remove('show'); }, 2500);
  }

  // ── markup ───────────────────────────────────────────────
  function field(id, label, tag, extra) {
    return '<label class="fb-label" for="' + id + '">' + esc(label) + '</label>' +
      (tag === 'textarea'
        ? '<textarea id="' + id + '" class="fb-textarea" rows="4" maxlength="2000"' + (extra || '') + '></textarea>'
        : '<input id="' + id + '" class="fb-input" maxlength="80"' + (extra || '') + '>') +
      '<div class="fb-err" id="' + id + 'Err" aria-live="polite"></div>';
  }

  function formHtml(kind) {
    var body = kind === 'idea'
      ? field('fbText', L10N.ideaLabel, 'textarea')
      : '<div class="fb-chips" id="fbChips" aria-label="' + esc(L10N.chipsHint) + '"></div>' +
        field('fbHardest', L10N.q1, 'textarea', ' rows="3"') + field('fbWanted', L10N.q2, 'textarea', ' rows="3"');
    return '<div class="fb-panel">' +
      '<div class="fb-head"><h2 class="fb-title" id="fbTitle">' + esc(kind === 'idea' ? L10N.ideaTitle : L10N.surveyTitle) + '</h2>' +
        '<button type="button" class="fb-close" aria-label="' + esc(L10N.close) + '">&#10005;</button></div>' +
      '<form class="fb-form" novalidate>' + body +
        field('fbContact', L10N.contactLabel, 'input', ' placeholder="' + esc(L10N.contactPh) + '"') +
        '<input class="fb-hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">' +
        '<p class="fb-note">' + esc(L10N.note) + '</p>' +
        '<div class="fb-actions"><button type="submit" class="btn-primary fb-send">' + esc(L10N.send) + '</button>' +
          '<a class="fb-alt" target="_blank" rel="noopener noreferrer" href="' + esc(prefillUrl(kind, {})) + '">' + esc(L10N.alt) + '</a></div>' +
        '<div class="fb-err fb-err-form" id="fbFormErr" aria-live="polite"></div>' +
      '</form>' +
      '<div class="fb-done" id="fbDone" hidden></div>' +
    '</div>';
  }

  function renderChips() {
    var box = $('#fbChips');
    if (!box) return;
    var list = window.ChemDBHome && typeof window.ChemDBHome.sections === 'function' ? window.ChemDBHome.sections() : [];
    box.innerHTML = list.filter(function (s) { return s.title && s.id !== 'feedback'; }).map(function (s) {
      var t = s.title[lang] || s.title.en;
      return '<button type="button" class="fb-chip" data-id="' + esc(s.id) + '" data-title="' + esc(t) + '" aria-pressed="false">' + esc(t) + '</button>';
    }).join('');
  }

  // ── behaviour ────────────────────────────────────────────
  function readFields() {
    var v = function (sel) { var el = $(sel); return el ? el.value : ''; };
    return { text: v('#fbText'), hardest: v('#fbHardest'), wanted: v('#fbWanted'), contact: v('#fbContact'), hp: v('.fb-hp'), chips: chips.slice() };
  }

  function showErrors(errors) {
    var map = { text: '#fbTextErr', hardest: '#fbHardestErr', wanted: '#fbWantedErr', contact: '#fbContactErr', form: '#fbFormErr' };
    Object.keys(map).forEach(function (k) { var el = $(map[k]); if (el) el.textContent = errors[k] ? L10N.err[errors[k]] : ''; });
  }
  function formError(code) { var el = $('#fbFormErr'); if (el) el.textContent = code ? L10N.err[code] : ''; }
  function setBusy(b) { var btn = $('.fb-send'); if (btn) { btn.disabled = b; btn.textContent = b ? L10N.sending : L10N.send; } }

  function showDone(number, url) {
    var form = $('.fb-form'), done = $('#fbDone');
    if (form) form.hidden = true;
    if (done) {
      done.innerHTML = '<p class="fb-done-title">' + esc(L10N.doneTitle) + '</p><p>' + esc(L10N.doneBody) + ' <a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">#' + esc(number) + '</a></p>' +
        '<button type="button" class="btn-small fb-done-close">' + esc(L10N.close) + '</button>';
      done.hidden = false;
      var b = done.querySelector('.fb-done-close'); if (b) b.focus();
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    var f = readFields();
    var errors = validate(mode, f);
    showErrors(errors);
    if (Object.keys(errors).length) return;
    var now = Date.now();
    if (now - openedAt < MIN_OPEN_MS) { formError('fast'); return; }
    var last = store.get(KEY_LAST) || {};
    if (last[mode] && now - last[mode] < COOLDOWN_MS) { formError('cooldown'); return; }
    if (navigator.onLine === false) { formError('offline'); return; }
    var payload = buildPayload(mode, f, meta(), openedAt, now);
    var kind = mode;
    setBusy(true);
    fetch(endpoint() + '/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }, function () { return { status: r.status, body: null }; }); })
      .then(function (res) {
        if (!res.body || !res.body.ok) throw new Error(res.body && res.body.error ? res.body.error : 'http-' + res.status);
        last[kind] = now; store.set(KEY_LAST, last);
        if (kind === 'survey') { surveyState = applySubmit(surveyState); store.set(KEY_SURVEY, surveyState); }
        track('feedback_submit', { mode: kind });
        showDone(res.body.number, res.body.url);
        toast(L10N.thanks);
      })
      .catch(function (err) {
        track('feedback_fail', { mode: kind, code: str(err && err.message).slice(0, 40) });
        formError('fail');
        setBusy(false);
      });
  }

  function build() {
    if (root) return root;
    root = document.createElement('div');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-labelledby', 'fbTitle');
    document.body.appendChild(root);
    root.addEventListener('submit', function (e) { if (e.target.classList.contains('fb-form')) onSubmit(e); });
    root.addEventListener('click', function (e) {
      if (e.target.closest('.fb-close') || e.target.closest('.fb-done-close')) { close('dismiss'); return; }
      if (mode === 'idea' && e.target === root) { close('dismiss'); return; }
      var chip = e.target.closest('.fb-chip');
      if (chip) {
        var id = chip.getAttribute('data-id'), title = chip.getAttribute('data-title');
        var on = chip.getAttribute('aria-pressed') !== 'true';
        chip.setAttribute('aria-pressed', on ? 'true' : 'false');
        chips = on ? chips.concat([id]) : chips.filter(function (c) { return c !== id; });
        var ta = $('#fbHardest');
        if (on && ta && ta.value.indexOf(title) === -1) { ta.value = (title + ': ' + ta.value).replace(/:\s*$/, ': '); ta.focus(); }
      }
    });
    root.addEventListener('input', function (e) {
      var err = e.target.id ? $('#' + e.target.id + 'Err') : null;
      if (err) err.textContent = '';
      formError('');
    });
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close('dismiss'); return; }
      if (e.key !== 'Tab' || mode !== 'idea') return;          // trap only the modal
      var f = root.querySelectorAll('button:not([disabled]), a[href], input:not(.fb-hp), textarea');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    return root;
  }

  // opts: {source: 'home' | 'header' | 'survey'}
  function open(kind, opts) {
    opts = opts || {};
    kind = kind === 'survey' ? 'survey' : 'idea';
    if (!enabled()) {                                  // feature flag off: GitHub template instead
      track('feedback_open', { mode: kind, source: opts.source || '', fallback: 1 });
      window.open(prefillUrl(kind, {}), '_blank', 'noopener');
      return;
    }
    build();
    mode = kind; source = opts.source || ''; chips = []; openedAt = Date.now();
    root.className = 'fb-root' + (kind === 'survey' ? ' fb-survey' : '');
    root.setAttribute('aria-modal', kind === 'idea' ? 'true' : 'false');
    root.innerHTML = formHtml(kind);
    if (kind === 'survey') renderChips();
    lastFocus = document.activeElement;
    root.classList.add('is-open');
    if (kind === 'idea') {
      document.body.style.overflow = 'hidden';
      var first = $('#fbText'); if (first) first.focus();
    }
    track('feedback_open', { mode: kind, source: source });
  }

  // reason: 'dismiss' (×, Esc, backdrop, or Close after success) | 'silent'
  function close(reason) {
    if (!root || !root.classList.contains('is-open')) return;
    var wasSurvey = mode === 'survey', submitted = !!($('#fbDone') && !$('#fbDone').hidden);
    root.classList.remove('is-open');
    document.body.style.overflow = '';
    if (wasSurvey && reason === 'dismiss' && !submitted) {
      surveyState = applyDismiss(surveyState, Date.now());
      store.set(KEY_SURVEY, surveyState);
      track('survey_dismiss', { n: window.ChemDBVisits ? window.ChemDBVisits.n : null });
    }
    mode = null;
    if (lastFocus && typeof lastFocus.focus === 'function') { try { lastFocus.focus(); } catch (e) { /* gone */ } }
  }

  // Header feedback button: keep the <a> (no-JS fallback to GitHub), intercept the click.
  function wireHeader() {
    var links = document.querySelectorAll('.feedback-btn');
    for (var i = 0; i < links.length; i++) {
      links[i].setAttribute('aria-label', L10N.headerLabel);
      links[i].addEventListener('click', function (e) { e.preventDefault(); open('idea', { source: 'header' }); });
    }
  }

  window.ChemDBFeedback = { open: open, close: function () { close('silent'); }, enabled: enabled };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireHeader);
  else wireHeader();
  // (Task 15 continues here)
```

- [ ] **Step 2: Syntax check and tests**

Run: `node --check feedback.js && node scripts/test_feedback_logic.js`
Expected: no error, `all passed`.

- [ ] **Step 3: Append the CSS block to the end of `style.css`**

```css

/* ── Series H: feedback form and survey (feedback.js) ───────────────────── */
.fb-root { position: fixed; inset: 0; z-index: 10000; display: none; align-items: center; justify-content: center; background: rgba(6, 9, 15, 0.84); padding: 16px; }
.fb-root.is-open { display: flex; }
.fb-panel { position: relative; width: 100%; max-width: 520px; background: var(--panel); border: 1px solid var(--border-subtle); border-radius: 4px; padding: 16px 18px 18px; }
.fb-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 6px; }
.fb-title { color: var(--phosphor); font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.04em; font-weight: normal; margin: 0; }
.fb-close { background: none; border: 1px solid var(--border-subtle); color: var(--text-sub); width: 30px; height: 30px; border-radius: 2px; cursor: pointer; font: inherit; flex-shrink: 0; }
.fb-close:hover, .fb-close:focus-visible { color: var(--phosphor); border-color: var(--phosphor-dim); outline: none; }
.fb-label { display: block; color: var(--text-main); font-size: 0.78rem; margin: 10px 0 4px; }
.fb-textarea, .fb-input { width: 100%; background: var(--hull-plate); color: var(--text-bright); border: 1px solid var(--border-subtle); border-radius: 2px; padding: 8px 10px; font: inherit; font-size: 0.84rem; }
.fb-textarea { resize: vertical; min-height: 72px; }
.fb-textarea:focus, .fb-input:focus { outline: none; border-color: var(--phosphor-dim); }
.fb-hp { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
.fb-note { color: var(--text-ghost); font-size: 0.68rem; margin-top: 10px; line-height: 1.4; }
.fb-actions { display: flex; align-items: center; gap: 14px; margin-top: 12px; flex-wrap: wrap; }
.fb-alt { color: var(--text-ghost); font-size: 0.7rem; }
.fb-alt:hover { color: var(--phosphor); }
.fb-err { color: var(--red-alert); font-size: 0.7rem; min-height: 1em; margin-top: 3px; }
.fb-done { text-align: center; padding: 12px 0 4px; color: var(--text-main); font-size: 0.85rem; }
.fb-done-title { color: var(--phosphor); font-size: 1rem; margin-bottom: 6px; }
.fb-done a { color: var(--phosphor); }
.fb-done .btn-small { margin-top: 12px; }
.fb-chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 8px 0 2px; }
.fb-chip { border: 1px solid var(--border-subtle); background: none; color: var(--text-sub); border-radius: 3px; padding: 2px 8px; font: inherit; font-size: 0.66rem; cursor: pointer; }
.fb-chip:hover, .fb-chip[aria-pressed="true"] { color: var(--phosphor); border-color: var(--phosphor-dim); }
/* Survey: a non-modal card in the corner; a bottom sheet on phones. */
.fb-root.fb-survey { inset: auto 16px 16px auto; background: none; padding: 0; z-index: 9000; }
.fb-root.fb-survey.is-open { display: block; }
.fb-root.fb-survey .fb-panel { max-width: 380px; box-shadow: 0 8px 30px rgba(0, 0, 0, 0.55); }
@media (max-width: 700px) {
  .fb-root.fb-survey { inset: auto 0 0 0; }
  .fb-root.fb-survey .fb-panel { max-width: none; border-radius: 8px 8px 0 0; max-height: 85vh; overflow-y: auto; }
}
```

- [ ] **Step 4: Wire the script, bump, precache, deploy**

- `index.html`: after `<script src="home.js?v=1" defer></script>` add `<script src="feedback.js?v=1" defer></script>`; bump `style.css?v=` by 1.
- `library.html`: same script line after `home.js`; same `style.css?v=`.
- `sw.js`: PRECACHE `'./feedback.js?v=1',` after `home.js`; update `style.css?v=`; bump `CACHE`.
- `deploy.yml`: add `feedback.js` to the first `cp` line.

- [ ] **Step 5: Local Worker for the end-to-end check**

The owner provides a fine-grained PAT (this repo, `Issues: Read and write`). Put it in `worker/.dev.vars` (gitignored): `GITHUB_TOKEN=github_pat_…`. Then, in a background shell:
```bash
cd worker && npx -y wrangler@4 dev --port 8787 --var ALLOWED_ORIGINS:http://127.0.0.1:8090
```
Expected: `Ready on http://127.0.0.1:8787`. Without a token the POST will return `502 github-401` — every other check still works.

- [ ] **Step 6: Browser verification (DoD H2)**

On `http://127.0.0.1:8090/?nocache=1`:
1. `javascript_tool`: `window.CHEMDB_FEEDBACK_URL = 'http://127.0.0.1:8787'` (dev override; production reads `FEEDBACK_URL`).
2. Click the header feedback icon → modal with the idea form, focus in the textarea, Esc closes, focus back on the icon. Open the Sections overlay → "Suggest an idea" card → the same modal (`source: home`).
3. Type 5 characters, Send → inline "At least 10 characters", no network request (`read_network_requests urlPattern 8787` is empty).
4. Type a real sentence, Send within 3 s → "Take a second…" message; wait, Send → success panel with `#N` link; `gh issue view N` shows labels `idea, from-site` and the meta table; then `gh issue close N -c "test submission"`.
5. Send again immediately → cooldown message.
6. `curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:8787/submit -H "Origin: http://127.0.0.1:8090" -H "Content-Type: application/json" -d '{"kind":"idea","text":"spam spam spam spam","hp":"x","t":5000}'` → `400`; same with `-H "Origin: https://evil.example"` → `403`.
7. DevTools offline (Browser pane → `javascript_tool`: `Object.defineProperty(navigator,'onLine',{get:()=>false})`), Send → "No connection" message.
8. "or open an issue yourself" → GitHub issue form with the `idea.yml` template.
9. `resize_window` mobile → the modal fits, the Send button is reachable with the keyboard open (screenshot); back to desktop.
10. RU: all strings Russian. Console: no errors on both pages.

- [ ] **Step 7: Commit H2 frontend**

```bash
git add feedback.js style.css index.html library.html sw.js .github/workflows/deploy.yml
git commit -m "feat(feedback): native idea form wired to header, overlay card and the Worker; .fb-* styles

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 13: Owner step — deploy the Worker, switch the flag on

**Files:**
- Modify: `feedback.js` (`FEEDBACK_URL`), `index.html`, `library.html`, `sw.js` (`feedback.js?v=` bump, CACHE)

This task needs the owner at the keyboard (Cloudflare account, PAT). The agent prepares and verifies; the owner runs steps 1–3.

- [ ] **Step 1 (owner): login and secret**

```bash
cd worker && npx -y wrangler@4 login && npx -y wrangler@4 secret put GITHUB_TOKEN
```
Paste a fine-grained PAT restricted to `MikameO/space-station-recipes`, permission **Issues: Read and write**, expiry ≤ 1 year.

- [ ] **Step 2 (owner): deploy**

```bash
cd worker && npx -y wrangler@4 deploy
```
Expected: `Published chemdb-feedback … https://chemdb-feedback.<account>.workers.dev`.

- [ ] **Step 3: Preflight the live Worker**

```bash
curl -s -i -X OPTIONS https://chemdb-feedback.<account>.workers.dev/submit -H "Origin: https://mikameo.github.io" | head -5
```
Expected: `HTTP/2 204` and `access-control-allow-origin: https://mikameo.github.io`.

- [ ] **Step 4: Turn the flag on**

In `feedback.js` set `var FEEDBACK_URL = 'https://chemdb-feedback.<account>.workers.dev';`. Bump `feedback.js?v=` to 2 in `index.html`, `library.html`, `sw.js` PRECACHE; bump `CACHE`.

```bash
node --check feedback.js && git add feedback.js index.html library.html sw.js && git commit -m "feat(feedback): point the form at the deployed Worker

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 5: After the owner pushes — production check**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://mikameo.github.io/space-station-recipes/feedback.js?v=2
```
Expected: `200`. In a real browser on the production URL: submit one idea → issue appears with `idea, from-site`; close it with `gh issue close N -c "production smoke test"`.

# Increment H3 — returning-visitor survey

### Task 14: Visible-time clock — failing tests

**Files:**
- Modify: `scripts/test_feedback_logic.js` (add cases)

The survey waits for 60 s of *visible* time. That accumulator is pure; the DOM scheduler in Task 15 just feeds it `visibilitychange` events.

- [ ] **Step 1: Add the cases before `let failed = 0;`**

```js
  ['visibleClock counts only visible time and is due after 60 s of it', () => {
    const c = L.visibleClock(60000);
    c.set(true, T0);                         // tab visible at load
    assert.strictEqual(c.due(T0 + 59000), false);
    c.set(false, T0 + 20000);                // user switches away after 20 s
    assert.strictEqual(c.elapsed(T0 + 100000), 20000);
    c.set(true, T0 + 100000);                // back after 80 s away
    assert.strictEqual(c.due(T0 + 130000), false);   // 20 + 30 = 50 s
    assert.strictEqual(c.due(T0 + 140000), true);    // 20 + 40 = 60 s
  }],
  ['visibleClock ignores repeated same-state events', () => {
    const c = L.visibleClock(1000);
    c.set(true, T0); c.set(true, T0 + 500);
    assert.strictEqual(c.elapsed(T0 + 700), 700);
    c.set(false, T0 + 700); c.set(false, T0 + 900);
    assert.strictEqual(c.elapsed(T0 + 5000), 700);
  }],
```

- [ ] **Step 2: Run to verify the new cases fail**

Run: `node scripts/test_feedback_logic.js`
Expected: the two new cases `FAIL` with `L.visibleClock is not a function`; exit 1.

### Task 15: Survey scheduler and popup; verify H3

**Files:**
- Modify: `feedback.js` (pure half: `visibleClock`; page half: replace `// (Task 15 continues here)`)
- Modify: `index.html`, `library.html`, `sw.js` (`feedback.js?v=` bump, CACHE)

- [ ] **Step 1: Add `visibleClock` to the pure half**

Insert before `window.ChemDBFeedbackLogic = {`:
```js
  // Accumulates time while the tab is visible; `due` once needMs of it has passed.
  function visibleClock(needMs) {
    var acc = 0, since = null;
    return {
      set: function (visible, now) {
        if (visible && since === null) since = now;
        else if (!visible && since !== null) { acc += now - since; since = null; }
      },
      elapsed: function (now) { return acc + (since === null ? 0 : now - since); },
      due: function (now) { return this.elapsed(now) >= needMs; },
    };
  }
```
and add `visibleClock: visibleClock,` to the exported object.

- [ ] **Step 2: Replace `// (Task 15 continues here)` with the scheduler**

```js
  // ── survey scheduler ─────────────────────────────────────
  // 60 s of visible time, then one decision (design §Опрос). A deep link is
  // judged at load: Share writes the hash later and must not block the survey.
  var loadDeepLink = location.hash.replace(/^#/, '').length > 0;

  function scheduleSurvey() {
    var clock = visibleClock(SURVEY_DELAY_MS);
    var timer = null;
    clock.set(document.visibilityState === 'visible', Date.now());

    function ctxNow() {
      return {
        enabled: enabled(), storageOk: store.ok,
        companion: document.body.classList.contains('companion'),
        deepLink: loadDeepLink,
        tutorialActive: !!document.querySelector('#tut-root.active'),
        visits: window.ChemDBVisits || null,
        homeOpen: !!(window.ChemDBHome && window.ChemDBHome.isOpen && window.ChemDBHome.isOpen()) || !!(root && root.classList.contains('is-open')),
        popupTaken: !!window.__chemdbPopup,
      };
    }
    function fire() {
      var now = Date.now();
      if (!clock.due(now)) { arm(); return; }
      document.removeEventListener('visibilitychange', onVis);
      var ctx = ctxNow();
      var d = surveyDecision(surveyState, ctx, now);
      if (d.skipVisit && ctx.visits) { surveyState = applySkip(surveyState, ctx.visits.n); store.set(KEY_SURVEY, surveyState); }
      if (!d.show) return;
      window.__chemdbPopup = 'survey';
      open('survey', { source: 'survey' });
      track('survey_shown', { n: ctx.visits.n });
    }
    function arm() {
      clearTimeout(timer);
      if (document.visibilityState !== 'visible') return;
      timer = setTimeout(fire, Math.max(0, SURVEY_DELAY_MS - clock.elapsed(Date.now())));
    }
    function onVis() { clock.set(document.visibilityState === 'visible', Date.now()); arm(); }
    document.addEventListener('visibilitychange', onVis);
    arm();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleSurvey);
  else scheduleSurvey();
```

- [ ] **Step 3: Tests, syntax, bump**

Run: `node --check feedback.js && node scripts/test_feedback_logic.js` → `all passed` (10 cases).
Bump `feedback.js?v=` in `index.html`, `library.html`, `sw.js` PRECACHE; bump `CACHE`.

- [ ] **Step 4: Browser verification (DoD H3)**

On `http://127.0.0.1:8090/?nocache=1` with `wrangler dev` running (Task 12 Step 5) and `window.CHEMDB_FEEDBACK_URL` set via `javascript_tool` right after load:
1. `v=JSON.parse(localStorage['chemdb-visits']); v.n=3; localStorage['chemdb-visits']=JSON.stringify(v); localStorage.removeItem('chemdb-survey'); s=JSON.parse(localStorage['chemdb-home']); s.lastAutoShown=Date.now(); localStorage['chemdb-home']=JSON.stringify(s); location.reload()` then set the dev URL again → after 60 s (use `computer wait` in 10 s steps) the survey card appears bottom-right, the page behind stays usable (click a reagent card — it opens).
2. Chip "Maps" → `#fbHardest` starts with `Maps: `, chip pressed. Send with both fields empty → "Fill in at least one answer". Type an answer, Send → success panel; `gh issue view N` → title `[survey] visit 3 · en · …`, labels `survey, from-site`, body lists `Sections: maps`; close the issue. `localStorage['chemdb-survey']` → `{"done":true}`. Reload, wait 60 s → nothing.
3. `localStorage.removeItem('chemdb-survey'); location.reload()` (+dev URL) → wait → × → `chemdb-survey` = `{dismissed:1, dismissedAt:…}`; reload, wait → nothing (cooling). `s=JSON.parse(localStorage['chemdb-survey']); s.dismissedAt-=31*86400e3; localStorage['chemdb-survey']=JSON.stringify(s); location.reload()` → wait → shows again; × → `dismissed:2`; reload, wait → nothing.
4. Home collision: reset `chemdb-survey`, set `chemdb-home.lastAutoShown=null` with badges present (Task 6 Step 8.3 recipe) → reload → the overlay auto-opens; leave it open 60 s → no survey, `chemdb-survey.skippedVisit === 3`; close the overlay, reload within the same visit → wait → still nothing (same visit skipped).
5. `resize_window` mobile → bottom sheet spans the width, both textareas and Send reachable; screenshot; back to desktop.
6. Console clean on both pages; RU strings when switched.

- [ ] **Step 5: Commit H3**

```bash
git add feedback.js scripts/test_feedback_logic.js index.html library.html sw.js
git commit -m "feat(feedback): returning-visitor survey — 60 s visible, 3rd visit, one retry after 30 days

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

# Increment H4 — manifest check, Metrika goals, documentation

### Task 16: `scripts/check_sections.py` in CI

**Files:**
- Create: `scripts/check_sections.py`
- Modify: `.github/workflows/deploy.yml` (new step before `Collect static files`)

- [ ] **Step 1: Write the validator**

```python
# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 MikameO
# This file is part of Space Station Recipes.
# See LICENSE for details.
"""Validate sections.json against the pages and assets it points to.

Errors (exit 1): bad schema, duplicate ids, missing bilingual text, unknown or
unresolvable target, missing screenshot, bad or inverted dates. Warnings only:
a screenshot older than the section's `updated` date (needs full git history —
skipped on shallow CI clones and with --no-git).

    python scripts/check_sections.py               # repo root
    python scripts/check_sections.py --manifest path/to/other.json --no-git
"""
from __future__ import annotations

import argparse
import datetime
import json
import pathlib
import re
import subprocess
import sys

DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
LANGS = ('en', 'ru')
REQUIRED = ('id', 'weight', 'target', 'title', 'desc')
DATED = ('shot', 'added', 'updated', 'whatsNew')


def bilingual(obj) -> bool:
    return isinstance(obj, dict) and all(isinstance(obj.get(l), str) and obj[l].strip() for l in LANGS)


def git_date(root: pathlib.Path, path: str) -> str | None:
    try:
        shallow = subprocess.run(['git', 'rev-parse', '--is-shallow-repository'], cwd=root,
                                 capture_output=True, text=True).stdout.strip()
        if shallow == 'true':
            return None
        out = subprocess.run(['git', 'log', '-1', '--format=%cs', '--', path], cwd=root,
                             capture_output=True, text=True).stdout.strip()
        return out or None
    except Exception:  # git missing: staleness check is best-effort
        return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--manifest', default='sections.json')
    ap.add_argument('--root', default='.')
    ap.add_argument('--no-git', action='store_true', help='skip the screenshot-age warning')
    args = ap.parse_args()
    root = pathlib.Path(args.root)
    errors: list[str] = []
    warnings: list[str] = []

    try:
        data = json.loads(pathlib.Path(args.manifest).read_text(encoding='utf-8'))
    except Exception as e:  # noqa: BLE001 — any parse failure is the same verdict
        print(f'ERROR {args.manifest}: cannot parse: {e}')
        return 1
    if data.get('schema') != 1:
        errors.append('schema must be 1')
    sections = data.get('sections') or []
    ids = [s.get('id') for s in sections]
    for dup in sorted({i for i in ids if ids.count(i) > 1}):
        errors.append(f'duplicate id {dup!r}')

    index_html = (root / 'index.html').read_text(encoding='utf-8')
    tabs = set(re.findall(r'class="tab-btn[^"]*"[^>]*data-tab="([^"]+)"', index_html))
    today = datetime.date.today().isoformat()

    for s in sections:
        sid = s.get('id') or '?'
        for k in REQUIRED:
            if k not in s:
                errors.append(f'{sid}: missing {k}')
        for k in ('title', 'desc'):
            if k in s and not bilingual(s[k]):
                errors.append(f'{sid}: {k} needs non-empty en and ru')
        for chip in s.get('inside', []):
            if not bilingual(chip):
                errors.append(f'{sid}: inside chip needs en and ru')
        if s.get('weight') not in ('hero', 'normal'):
            errors.append(f'{sid}: weight must be hero or normal')

        kind, _, arg = str(s.get('target', '')).partition(':')
        if kind == 'tab':
            if arg not in tabs:
                errors.append(f'{sid}: target tab {arg!r} has no .tab-btn[data-tab] in index.html')
        elif kind == 'page':
            if not (root / arg).is_file():
                errors.append(f'{sid}: target page {arg!r} not found')
        elif kind == 'mode':
            if arg != 'antag':
                errors.append(f'{sid}: unknown mode {arg!r}')
        elif kind == 'action':
            if arg != 'feedback':
                errors.append(f'{sid}: unknown action {arg!r}')
        else:
            errors.append(f'{sid}: unknown target kind {kind!r}')

        if kind == 'action':
            continue
        for k in DATED:
            if k not in s:
                errors.append(f'{sid}: missing {k}')
        if 'whatsNew' in s and not bilingual(s['whatsNew']):
            errors.append(f'{sid}: whatsNew needs non-empty en and ru')
        shot = s.get('shot')
        if shot and not (root / shot).is_file():
            errors.append(f'{sid}: shot {shot!r} not found')
        added, updated = s.get('added', ''), s.get('updated', '')
        if added and updated:
            if not (DATE_RE.match(added) and DATE_RE.match(updated)):
                errors.append(f'{sid}: dates must be YYYY-MM-DD')
            elif updated < added:
                errors.append(f'{sid}: updated {updated} is before added {added}')
            elif updated > today:
                errors.append(f'{sid}: updated {updated} is in the future')
        if shot and updated and not args.no_git and (root / shot).is_file():
            shot_date = git_date(root, shot)
            if shot_date and shot_date < updated:
                warnings.append(f'{sid}: screenshot last committed {shot_date}, section updated {updated} — re-shoot it')

    for w in warnings:
        print('WARN ', w)
    for e in errors:
        print('ERROR', e)
    print(f'sections.json: {len(sections)} sections, {len(errors)} errors, {len(warnings)} warnings')
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
```

- [ ] **Step 2: Positive run**

Run: `python scripts/check_sections.py`
Expected: last line `sections.json: 11 sections, 0 errors, N warnings` (N may be > 0 for sections whose `updated` is newer than the card commit — that is the intended nudge), exit 0.

- [ ] **Step 3: Negative run against a broken copy**

```bash
python - <<'PY'
import json, pathlib
d = json.load(open('sections.json', encoding='utf-8'))
d['sections'][4]['target'] = 'tab:nope'          # botany → unknown tab
d['sections'][5]['shot'] = 'promo/cards/missing.webp'
d['sections'][6]['updated'] = '2026-01-01'       # before added
pathlib.Path('/tmp/broken_sections.json').write_text(json.dumps(d), encoding='utf-8')
PY
python scripts/check_sections.py --manifest /tmp/broken_sections.json --no-git; echo "exit=$?"
```
Expected: three `ERROR` lines (`botany: target tab 'nope' …`, `maps: shot … not found`, `ordnance: updated 2026-01-01 is before added 2026-09-10`), `exit=1`.

- [ ] **Step 4: Add the CI step**

In `.github/workflows/deploy.yml`, before `- name: Collect static files`:
```yaml
      - name: Validate sections.json
        run: python scripts/check_sections.py --no-git
```

- [ ] **Step 5: Commit**

```bash
git add scripts/check_sections.py .github/workflows/deploy.yml
git commit -m "ci: validate sections.json — targets, screenshots, dates — before every deploy

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 17: Metrika goals registry

**Files:**
- Modify: `scripts/create_metrika_goals.py` (`GOALS` list)

- [ ] **Step 1: Register the eight ids**

Append to `GOALS` after the `library_copy_markup` entry:
```python
    # Series H (2026-09-12): sections overlay + feedback form + survey
    ("home_open",            "Разделы: оверлей открыт (auto/intro/manual)"),
    ("home_card",            "Разделы: клик по карточке"),
    ("home_autoshow_off",    "Разделы: авто-показ выключен"),
    ("feedback_open",        "Обратная связь: форма открыта"),
    ("feedback_submit",      "Обратная связь: заявка отправлена"),
    ("feedback_fail",        "Обратная связь: отправка не удалась"),
    ("survey_shown",         "Опрос: показан"),
    ("survey_dismiss",       "Опрос: закрыт крестиком"),
```

- [ ] **Step 2: Cross-check ids against the code**

```bash
grep -ohE "track\('(home_|feedback_|survey_)[a-z_]+'" home.js feedback.js | sort -u
```
Expected: exactly the eight ids above, each present in the registry.

- [ ] **Step 3: Commit; run only with the owner's go-ahead**

```bash
git add scripts/create_metrika_goals.py
git commit -m "chore(metrika): register series H goals (home, feedback, survey)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
Ask the user before `python scripts/create_metrika_goals.py` (needs `METRIKA_TOKEN` with `metrika:read` + `metrika:write`). Until it runs, these events are dropped by Metrika — say so in the handoff.

### Task 18: Documentation — README, CHANGELOG, ROADMAP

**Files:**
- Modify: `README.md` (Features table; new subsection after "How to contribute a source")
- Modify: `CHANGELOG.md` (new top entry)
- Modify: `ROADMAP.md` (Series H statuses, version-history row)

- [ ] **Step 1: README — two feature rows**

After the `| **Library** | …` row add:
```markdown
| **Sections** | Platform map | ⊞ Sections — every section as a card with what is inside; cards light up (amber border, dot, one "what's new" line) when a section changed since your last visit. Auto-opens on your second visit and whenever something is new; switch that off in the overlay |
| **Feedback** | Idea form & survey | Two-line idea form, no sign-up: filed as a public GitHub issue through a Cloudflare Worker (`worker/`). Third-visit survey asks what was hardest and what is missing |
```

- [ ] **Step 2: README — Worker setup subsection**

After the "How to contribute a source" block add:
```markdown
**Feedback Worker**

The in-app idea form and survey POST to a Cloudflare Worker (`worker/index.js`) that files a GitHub issue labelled `idea` or `survey` + `from-site` with the repo owner's token, so the public repo never carries a secret. Setup (once): `cd worker && npx wrangler login && npx wrangler secret put GITHUB_TOKEN && npx wrangler deploy`, then paste the printed URL into `FEEDBACK_URL` in `feedback.js`. While `FEEDBACK_URL` is empty, every entry point opens the prefilled GitHub issue template instead. The token is a fine-grained PAT limited to this repository with `Issues: Read and write`; rotate it with `wrangler secret put` again. Tests: `node scripts/test_feedback_worker.mjs`.
```

- [ ] **Step 3: CHANGELOG — new top entry (after the intro paragraph)**

```markdown
## Series H — 2026-09-12 (Sections overlay, feedback form, survey; no schema change)

**New — `sections.json` and the «⊞ Sections» overlay.** One manifest lists every
section with a bilingual description, the features inside it, a screenshot and
two dates: `added` and `updated`. `home.js` compares them with what the visitor
has already seen (`localStorage['chemdb-home']`) and badges a card amber
("updated", one line of what changed) or green ("new section"); changes older
than 60 days are history and never badge. The overlay opens itself on the second
visit and on any visit that finds unseen updates (once a day, never over a deep
link, the tutorial, or a companion window), and never in private browsing where
nothing can be remembered. Closing it marks everything seen. A visit is a page
load at least six hours after the previous one (`chemdb-visits`).

**New — idea form and Worker.** `feedback.js` replaces the GitHub-only feedback
link with a native two-field form; `worker/` (Cloudflare) validates the post —
origin, size, honeypot, 3 s minimum, 5/min per IP — and files a public issue
labelled `idea` + `from-site`. With `FEEDBACK_URL` empty the form falls back to
the prefilled issue template (`.github/ISSUE_TEMPLATE/idea.yml`).

**New — returning-visitor survey.** From the third visit, after 60 s of visible
time and only when no other popup ran in that load: two questions, section chips,
issue labelled `survey`. Dismissed once → asked again after 30 days; dismissed
twice or answered → never.

**CI.** `scripts/check_sections.py` validates the manifest (targets exist,
screenshots exist, dates sane) before every deploy. Eight Metrika goals added to
the registry. Data schema unchanged.
```

- [ ] **Step 4: ROADMAP — mark statuses and add the history row**

Series H was created in Task 0; set each of H1–H4 to `[x]` with its commit hash and the verification summary, the way Series G reads. Append to the version-history table at the end of the file:
```markdown
| 2026-09-12 | 2.5 | Серия H («Главная-меню и обратная связь») закрыта: H1 `sections.json` (11 записей) + оверлей «Разделы» с бейджами по датам `updated`/`added` и авто-показом (визит 2 — интро; дальше — при непросмотренных обновлениях, раз в день); H2 форма идей → Cloudflare Worker → GitHub Issue `idea`/`from-site`, фича-флаг `FEEDBACK_URL`; H3 опрос с 3-го визита после 60 с видимости, режим B; H4 `check_sections.py` в деплое, 8 целей Метрики, доки. Спека docs/design/2026-09-12-home-menu-and-feedback.md |
```

- [ ] **Step 5: Verify links and commit**

```bash
grep -c "sections.json" README.md CHANGELOG.md ROADMAP.md   # each ≥ 1
git add README.md CHANGELOG.md ROADMAP.md
git commit -m "docs: series H — sections overlay, feedback Worker and survey in README, CHANGELOG, ROADMAP

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Plan self-review

**Spec coverage** (design section → task): manifest schema and initial content → Task 2; visitor state, 60-day rule, private-mode rule → Tasks 3–5; entry button on both pages, tab-bar `.tab-link` rationale → Task 6; auto-show rules 1–5 → `decideAutoShow` (Tasks 3–5) with rule 3 read as "once, at the first eligible visit from the second on" — see test `auto-show: first visit never, second visit intro once`; overlay markup, card anatomy, grid breakpoints, a11y → Task 5; screenshots 720 px WebP ≤ 25 KB, lazy, not precached, re-shoot rule → Tasks 1 and 16 (warning); targets incl. `validTabs` caveat → Task 5 `runTarget` (falls back to `./#tab=…`; Q1 makes Botany resolve from the Library page); form fields, limits, meta, privacy line, prefill link, honeypot, 3 s, cooldown, offline, success/failure → Tasks 10–12; Worker checks, codes, issue format, secrets, setup → Tasks 8, 9, 13, 18; survey trigger, mode B, coordination flag → Tasks 10, 14, 15; i18n → module `L10N` tables + two `T` keys (Task 6); Metrika goals → Task 17; deploy cp-list, PRECACHE, cache-bust → Tasks 6, 12, 13, 15; `check_sections.py` → Task 16; docs → Task 18; labels/templates → Task 7. Backlog items (static `home.html`, Turnstile, CI deploy of the Worker) are intentionally absent.

**Known deviations from the spec, all small:** module-generated strings are localised in-module rather than through `i18n.js` (the observer would race with dynamic rendering; `library.js` already does it this way); the "ready" signal is `#loadingOverlay.hidden` + `app:ready` rather than `window.DATA` (top-level `let DATA` is not a `window` property); `worker/README.md` replaced by the `wrangler.toml` header + README subsection (project rule: no new `.md` files).

**Type consistency checked:** `bumpVisits → {visits:{n,first,last,prevLast,touched}, isNewVisit}` is what Task 5 and the tests read; `computeBadges → {byId, count}`; `decideAutoShow → {mode, reason}`; `surveyDecision → {show, reason, skipVisit?}`; `validate` returns `{}` / `{field: code}` with codes `short|long|empty` mapped to `L10N.err`; Worker response `{ok, number, url}` is what `onSubmit` and the Worker tests expect; storage keys `chemdb-visits`, `chemdb-home`, `chemdb-survey`, `chemdb-feedback-last` appear with the same spelling everywhere.

