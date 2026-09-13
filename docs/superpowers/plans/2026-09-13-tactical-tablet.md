# Командный планшет (серия V) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-round officers' room on top of `tactical.html`: policy-gated rooms on a Cloudflare Durable Object with an op log, one-time post codes confirmed by any live member, shared markers/lines/areas drawn in command-level signatures, strike requests with the Series T fire card inside, a manual asset board, a half-monitor layout, and a pilot on Space Stories only after the administration's written yes.

**Architecture:** New files only, plus one small seam commit in `tactical.html`/`tactical/tactical.js` (Task 7). Semantics live once in `tactical/room-logic.js` (an IIFE on `window`/`globalThis`, imported by both the page and the Worker); `tactical/room.js` owns transport, session and storage; `tactical/room-ui.js` owns the panel DOM in a slot outside `#tacPanel`; `worker/room/` holds a `Registry` Durable Object (counters, stop flag, health) and a `Room` Durable Object (SQLite op log, one-time codes, epoch, limits, export). Clients poll `GET /room/<code>/ops?since=<seq>` with adaptive `Retry-After`; no WebSocket, no repeating server timers, one alarm per room. Spec: `docs/design/2026-09-13-tactical-tablet.md` (section «Поправки по итогам war-room» wins on conflict); decisions: `docs/decisions/2026-09-13_tactical-tablet.md`.

**Tech Stack:** Plain ES5-style browser JS (no build step, `?v=` cache-busting), Node 24 tests via `new Function('window', src)` (pattern: `scripts/test_tactical_logic.js`), Cloudflare Workers + Durable Objects with SQLite storage (`wrangler`), ES modules in `worker/`, Web Crypto HMAC-SHA256, `python` for JSON checks.

---

## Conventions for every task

- **Parallel sessions:** before touching `tactical.html`, `tactical/tactical.js`, `ROADMAP.md`, `sections.json`, `sw.js`, `.github/workflows/deploy.yml` run `git status --short` and stage only your files. `tactical/logic.js`, `tactical/mapview.js`, `ss14_tactical.py`, `tactical/index.json` are never modified by this plan.
- **Commits:** conventional commits, one per task step that says "Commit", never `--amend`, never push. End every message with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Tests:** `node scripts/test_room_logic.js`, `node scripts/test_room_client.js`, `node scripts/test_room_worker.mjs`, `node scripts/test_room_seam.js` must print `OK` before a commit that touches their subject.
- **ROADMAP after every task (project DoD §0):** mark the matching increment of Series V in `ROADMAP.md` as `[x]` with the date, the commit hash and one line of what was verified; stage only that hunk (the parallel-session recipe in project memory) and commit `docs(tablet): Vn done`. Every fourth increment, run the short `/project-audit` the global rules require, unless the owner waives it as they did for Series T.
- **Encoding:** run Python with `PYTHONIOENCODING=utf-8`; never write files through a Bash heredoc longer than ~100 lines (write to the scratchpad and run the file).
- **Preview:** `.claude/launch.json` config `ss14-chem` serves the repo at `http://127.0.0.1:8090`; the Worker runs locally with `cd worker && npx wrangler dev --port 8787`; `ROOM_URL` in `tactical/room.js` stays empty in git (feature hidden) and is set to `http://127.0.0.1:8787` only in a local uncommitted edit while testing.
- **Rules gate (VISION §4 п.3, project CLAUDE.md):** nothing from this plan is used on a live server before the administration's written yes; the deployed `ROOM_URL` stays empty until the owner flips it.

## File structure

| File | Responsibility |
|---|---|
| `tactical/policy/stories_cm.json`, `tactical/policy/rmc14.json` | Per-fork policy: sanction list, posts, levels + signatures, squads, layers, rights, ttl, assets, limits (Task 1) |
| `tactical/room-logic.js` | Pure semantics: state, `applyOp` with tombstones and `expectedStatus`, rights, filters, expiry, clock offset, countdowns, codes, text limits, level styles, request transitions (Task 2) |
| `scripts/test_room_logic.js` | Node tests for room-logic (Task 2) |
| `worker/room/crypto.js` | HMAC token sign/verify, secret hashing, random codes (Task 3) |
| `worker/room/registry.js` | `Registry` DO: concurrent/daily counters, stop flag, health (Task 3) |
| `worker/room/room.js` | `Room` DO: SQLite schema, init/join/ops/admin/export/alarm (Task 3) |
| `worker/room/router.js` | Routes `/room*`, `/policy/<fork>`, `/health` (Task 3) |
| `worker/index.js` | Delegates room paths to the router (Task 3, 3 lines) |
| `worker/wrangler.toml` | DO bindings, migrations, vars (Task 3) |
| `scripts/test_room_worker.mjs` | Node tests with fake DO storage and fake env (Task 3) |
| `worker/room/policies.js` | Generated copy of `tactical/policy/*.json` for the Worker (Task 3, `check_room_policy.py --sync`) |
| `worker/room/words.js`, `worker/room/export.js` | Confirmation words; text chronology for moderators (Task 3) |
| `scripts/room_token.mjs` | Owner script: server token, `ROOM_KEYS` entry, stop/start links (Task 3) |
| `tactical/room.js` | `TacRoom`: `HttpTransport`, `RoomClient` (session, polling, pending queue, optimistic merge, storage), `attach`/`notify`/`consumePick` (Task 4) |
| `tactical/room-fixtures.js` | Fake Worker with a scripted LV-624 round for the demo and client tests; loaded on demand (Task 4) |
| `scripts/test_room_client.js` | Node tests of `RoomClient` against the fixture (Task 4) |
| `tactical.html`, `tactical/tactical.js` | Seam only: room elements, script tags, `TacRoom.attach`, five `roomNotify` calls, one `consumePick` (Task 5; script tags extended in Tasks 6, 7) |
| `tactical/room-ui.js` | Panel shell in `#tacRoom`: entry, knock, roster, staff controls, banners, chips/strip/shelf scaffolding, pick mode, module registry (Task 5) |
| `scripts/test_room_seam.js` | Guard test for the seam strings, script order and the `addLayer` survive-redraw contract (Task 5) |
| `tactical/room-draw.js` | Map objects in command-level signatures, tools (mark, enemy, line, area, freehand), Layers tab, room calibration (Task 6) |
| `tactical/room-requests.js` | Requests (form, cards, fire card inside the request), asset board, chips, strip, rings, sounds (Task 7) |
| `tactical/room.css` | Room styles (Task 5), tools and filters (Task 6), requests and assets (Task 7), half-monitor budget (Task 8) |
| `research/fork-outreach-2026-09-12/stories-tablet-admin.md` | Admin package and letter (Task 9) |
| `sections.json`, `scripts/create_metrika_goals.py`, `README.md`, `CHANGELOG.md`, `ROADMAP.md` | Release wiring (Task 10). `.github/workflows/deploy.yml` needs no change: `cp -r tactical` ships the new files and the asset check scans `tactical.html` |

**Tasks ↔ ROADMAP increments:**

| Task | Increments |
|---|---|
| 1 | V1 policy and sanction gate |
| 2 | V4 room logic |
| 3 | V5 Worker |
| 4 | V6 client core, V2 fixture |
| 5 | V7 seam, V6 entry UI, V2 demo page |
| 6 | V8 shared objects |
| 7 | V9 requests and assets |
| 8 | V10 half-monitor |
| 9 | V3 admin package |
| 10 | V11 pilot and release |

## Shared vocabulary (used by every task)

```js
// Object kinds and shapes (world tiles, as Series T):
// marker  {id, kind:'marker', cat, label, x, y, level, h, at, by:{post, squad}, layer, ttl?, confirmedAt?, relayed?}
// line/area {id, kind:'line'|'area', cat, label, points:[[x,y]...], smooth, level, h, at, by, layer}
// request {id, kind:'request', type, target:{x,y}, note, priority, status, by, acceptedBy?, firedAt?, doneAt?, deadlineAt?, reason?, markerId?, flags:[]}
//   status: requested → accepted → loaded → firing → done | denied   (loaded only for type 'ob')
// asset   {id, kind:'asset', type, label, tile?, owner:{post, client?}, state, until?, notes, shells?, shell?, radius?}
// calibration {kind:'calibration', id:'calibration', offset:[dx,dy], by, at}
// op      {cid, op:'put'|'patch'|'del', kind, id, data?, expectedStatus?}  — server adds seq, at, by
// Layers: 'shared' | 'staff' | 'squad:<id>' | 'service' | 'requests' | 'assets'
// Levels: 'staff' | 'squad' | 'service' | 'observer'
```

---

### Task 1: Policy files and loader (V1)

**Files:**
- Create: `tactical/policy/stories_cm.json`
- Create: `tactical/policy/rmc14.json`
- Create: `scripts/check_room_policy.py`
- Test: `scripts/check_room_policy.py` (self-checking script)

- [ ] **Step 1: Write the policy check script first (it fails until the files exist)**

```python
# scripts/check_room_policy.py — validates tactical/policy/*.json against the room contract.
# Run: python scripts/check_room_policy.py   (exit 1 on any problem)
import json, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
LEVELS = {'staff', 'squad', 'service', 'observer'}
MARKERS = {'square', 'diamond', 'circle', None}
LAYER_KEYS = {'shared', 'staff', 'squad:*', 'service', 'requests', 'assets'}
RIGHTS = {'confirmJoin', 'publishCalibration', 'acceptRequest', 'kick', 'assignLabel', 'radioSilence', 'extend'}
TTL = {'enemyMarkerSec', 'roomMaxSec', 'roomExtendSec', 'roomIdleLockSec', 'exportGraceSec', 'memberIdleSec', 'wordSec'}
LIMITS = {'objects', 'label', 'note', 'callsign', 'points', 'opsPerSec', 'opsPerMin', 'bytes', 'message'}
ASSET_TYPES = {'mortar', 'ob', 'dropship', 'supply', 'medevac'}

def fail(msg):
    print('FAIL', msg); sys.exit(1)

def check(path):
    p = json.loads(path.read_text(encoding='utf-8'))
    if p.get('v') != 1: fail(f'{path.name}: v must be 1')
    if p.get('fork') != path.stem: fail(f'{path.name}: fork must equal file stem')
    for s in p['sanction']:
        if s['status'] not in ('none', 'pilot', 'approved'): fail(f'{path.name}: sanction status {s["status"]}')
    if set(p['levels']) != LEVELS: fail(f'{path.name}: levels {set(p["levels"])}')
    for k, lv in p['levels'].items():
        if lv.get('marker') not in MARKERS: fail(f'{path.name}: level {k} marker')
    ids = [x['id'] for x in p['posts']]
    if len(ids) != len(set(ids)): fail(f'{path.name}: duplicate post ids')
    for post in p['posts']:
        if post['level'] not in LEVELS: fail(f'{path.name}: post {post["id"]} level')
        if post['level'] == 'squad' and not post.get('perSquad'): fail(f'{path.name}: squad post {post["id"]} needs perSquad')
    if set(p['layers']) != LAYER_KEYS: fail(f'{path.name}: layers {set(p["layers"])}')
    for k, layer in p['layers'].items():
        if not set(layer['write']) <= LEVELS: fail(f'{path.name}: layer {k} write')
    if set(p['rights']) != RIGHTS: fail(f'{path.name}: rights {set(p["rights"]) ^ RIGHTS}')
    if set(p['ttl']) != TTL: fail(f'{path.name}: ttl {set(p["ttl"]) ^ TTL}')
    if set(p['limits']) != LIMITS: fail(f'{path.name}: limits {set(p["limits"]) ^ LIMITS}')
    for a in p['assets']:
        if a['type'] not in ASSET_TYPES: fail(f'{path.name}: asset type {a["type"]}')
        if a['owner'] not in ids: fail(f'{path.name}: asset owner {a["owner"]} is not a post')
    for f in p['functions']:
        if not isinstance(f.get('id'), str) or not f.get('nameRu'): fail(f'{path.name}: function {f}')
    for sq in p['squads'].values():
        if not sq['color'].startswith('#') or len(sq['color']) != 7: fail(f'{path.name}: squad colour {sq}')
    print('ok', path.name, len(p['posts']), 'posts', len(p['assets']), 'assets')

files = sorted((ROOT / 'tactical' / 'policy').glob('*.json'))
if not files: fail('no policy files')
for f in files: check(f)
print('OK')
```

- [ ] **Step 2: Run it to see it fail**

Run: `python scripts/check_room_policy.py`
Expected: `FAIL no policy files` and exit code 1.

- [ ] **Step 3: Write `tactical/policy/stories_cm.json`**

Squad colours come from the fork's `SquadTeam` prototypes; until V8 fills them from the cache, use RMC14's canonical values (Alpha red, Bravo yellow, Charlie purple, Delta blue, Echo green) and mark the source in `squadsSource`.

```json
{
  "v": 1,
  "fork": "stories_cm",
  "sanction": [
    { "server": "Space Stories - Marine Corps Core", "status": "none", "since": null },
    { "server": "Space Stories - Marine Corps Flux", "status": "none", "since": null }
  ],
  "levels": {
    "staff":    { "nameRu": "Штаб",        "nameEn": "Staff",    "line": { "width": 4,   "dash": [] },     "marker": "square",  "color": "#f5f5f5" },
    "squad":    { "nameRu": "Отряд",       "nameEn": "Squad",    "line": { "width": 2.5, "dash": [] },     "marker": "diamond", "color": "squad" },
    "service":  { "nameRu": "Служба",      "nameEn": "Service",  "line": { "width": 2,   "dash": [6, 4] }, "marker": "circle",  "color": "#5ad1e6" },
    "observer": { "nameRu": "Наблюдатель", "nameEn": "Observer", "line": null, "marker": null, "color": "#8a99b3" }
  },
  "enemy": { "color": "#ff5a5a", "marker": "triangle" },
  "squadsSource": "RMC14 SquadTeam prototypes (colours to be re-read from cache_tactical in V8)",
  "squads": {
    "alpha":   { "nameRu": "Альфа",   "nameEn": "Alpha",   "color": "#e74c3c" },
    "bravo":   { "nameRu": "Браво",   "nameEn": "Bravo",   "color": "#f1c40f" },
    "charlie": { "nameRu": "Чарли",   "nameEn": "Charlie", "color": "#9b59b6" },
    "delta":   { "nameRu": "Дельта",  "nameEn": "Delta",   "color": "#3498db" },
    "echo":    { "nameRu": "Эхо",     "nameEn": "Echo",    "color": "#2ecc71" }
  },
  "posts": [
    { "id": "co",       "nameRu": "Командующий офицер", "nameEn": "Commanding Officer", "level": "staff",    "max": 1, "admin": true },
    { "id": "xo",       "nameRu": "Старший помощник",   "nameEn": "Executive Officer",  "level": "staff",    "max": 1 },
    { "id": "so",       "nameRu": "Офицер штаба",       "nameEn": "Staff Officer",      "level": "staff",    "max": 3 },
    { "id": "ot",       "nameRu": "Техник вооружения",  "nameEn": "Ordnance Technician","level": "service",  "max": 2 },
    { "id": "sl",       "nameRu": "Командир отряда",    "nameEn": "Squad Leader",       "level": "squad",    "perSquad": true, "max": 1 },
    { "id": "ftl",      "nameRu": "Командир звена",     "nameEn": "Fireteam Leader",    "level": "squad",    "perSquad": true, "max": 4 },
    { "id": "pilot",    "nameRu": "Пилот",              "nameEn": "Pilot",              "level": "service",  "max": 2 },
    { "id": "ro",       "nameRu": "Снабжение",          "nameEn": "Requisitions",       "level": "service",  "max": 2 },
    { "id": "cmo",      "nameRu": "Медицина",           "nameEn": "Medical",            "level": "service",  "max": 2 },
    { "id": "observer", "nameRu": "Наблюдатель",        "nameEn": "Observer",           "level": "observer", "max": 8 }
  ],
  "functions": [
    { "id": "jtac",   "nameRu": "Корректировщик" },
    { "id": "mortar", "nameRu": "Миномётный расчёт" },
    { "id": "asl",    "nameRu": "Заместитель командира отряда" },
    { "id": "dcc",    "nameRu": "Крю-чиф" },
    { "id": "synth",  "nameRu": "Синтетик" }
  ],
  "layers": {
    "shared":   { "write": ["staff"], "cadenceSec": 0 },
    "staff":    { "write": ["staff"] },
    "squad:*":  { "write": ["squad"] },
    "service":  { "write": ["service"] },
    "requests": { "write": ["staff", "squad", "service"] },
    "assets":   { "write": ["service", "staff"] }
  },
  "rights": {
    "confirmJoin":        ["staff", "squad", "service"],
    "publishCalibration": ["staff", "service"],
    "acceptRequest":      ["asset-owner", "staff"],
    "kick":               ["staff"],
    "assignLabel":        ["staff"],
    "radioSilence":       ["staff"],
    "extend":             ["staff"]
  },
  "ttl": {
    "enemyMarkerSec": 600,
    "roomMaxSec": 10800,
    "roomExtendSec": 3600,
    "roomIdleLockSec": 480,
    "exportGraceSec": 3600,
    "memberIdleSec": 600,
    "wordSec": 300
  },
  "assets": [
    { "type": "mortar",   "count": 4, "owner": "ot",    "claimable": true },
    { "type": "ob",       "count": 1, "owner": "so",    "loader": "ot", "cooldownSec": 500 },
    { "type": "dropship", "count": 1, "owner": "pilot", "flyBySec": 100 },
    { "type": "supply",   "count": 1, "owner": "so",    "cooldownSec": 500 },
    { "type": "medevac",  "count": 1, "owner": "pilot" }
  ],
  "limits": {
    "objects": 2000, "label": 40, "note": 80, "callsign": 20, "points": 64,
    "opsPerSec": 10, "opsPerMin": 60, "bytes": 2097152, "message": 4096
  }
}
```

- [ ] **Step 4: Write `tactical/policy/rmc14.json`**

Same document with `"fork": "rmc14"`, `nameEn` used as primary, and the sanction list:

```json
  "sanction": [
    { "server": "[EN][MRP] Rounys Marine Corps Alamo [US East]", "status": "none", "since": null }
  ],
```

Copy the rest of `stories_cm.json` verbatim (levels, squads, posts, functions, layers, rights, ttl, assets, limits).

- [ ] **Step 5: Run the check**

Run: `python scripts/check_room_policy.py`
Expected:
```
ok rmc14.json 10 posts 5 assets
ok stories_cm.json 10 posts 5 assets
OK
```

- [ ] **Step 6: Commit**

```bash
git add tactical/policy/stories_cm.json tactical/policy/rmc14.json scripts/check_room_policy.py
git commit -m "feat(tablet): per-fork room policy files and their checker (V1)"
```

The loader that reads the policy on the page is part of `tactical/room.js` (Task 4, `TacRoom.loadPolicy`); the Worker serves the same files through `GET /policy/<fork>` (Task 3).

### Task 2: Room logic module with Node tests (V4)

**Files:**
- Create: `tactical/room-logic.js`
- Create: `scripts/test_room_logic.js`

`room-logic.js` is the single carrier of semantics for the page and the Worker: it installs itself on `window` in the browser and on `globalThis` in Node/Workers, exactly like `tactical/logic.js`.

- [ ] **Step 1: Write the failing tests**

```js
// scripts/test_room_logic.js — exercises tactical/room-logic.js under Node.
// Run: node scripts/test_room_logic.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'tactical', 'room-logic.js'), 'utf8');
const window = {};
new Function('window', src)(window);
const R = window.TacticalRoomLogic;
const policy = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tactical', 'policy', 'stories_cm.json'), 'utf8'));

const staff = { client: 'c-so', post: 'so', confirmed: true };
const slB = { client: 'c-slb', post: 'sl', squad: 'bravo', confirmed: true };
const slA = { client: 'c-sla', post: 'sl', squad: 'alpha', confirmed: true };
const ot = { client: 'c-ot', post: 'ot', confirmed: true };
const obs = { client: 'c-obs', post: 'observer', confirmed: true };
const knocking = { client: 'c-new', post: 'ftl', squad: 'bravo', confirmed: false };
const op = (over) => Object.assign({ cid: 'x', op: 'put', kind: 'marker', id: 'm1',
  data: { cat: 'enemy', label: 'ксено', x: 10, y: 20, level: 0, h: 'h1', layer: 'squad:bravo' } }, over);

let n = 0;
function t(name, fn) { fn(); n++; console.log('ok', name); }

t('SL writes an enemy marker to its own squad layer', () => {
  assert.deepStrictEqual(R.canWrite(policy, slB, op()), { ok: true });
});
t('SL cannot write to another squad or the shared layer', () => {
  assert.strictEqual(R.canWrite(policy, slB, op({ data: { layer: 'squad:alpha', cat: 'enemy', x: 1, y: 1 } })).reason, 'layer');
  assert.strictEqual(R.canWrite(policy, slB, op({ data: { layer: 'shared', cat: 'plan', x: 1, y: 1 } })).reason, 'layer');
});
t('staff writes to shared; observer and unconfirmed members write nothing', () => {
  assert.strictEqual(R.canWrite(policy, staff, op({ data: { layer: 'shared', cat: 'plan', x: 1, y: 1 } })).ok, true);
  assert.strictEqual(R.canWrite(policy, obs, op()).reason, 'level');
  assert.strictEqual(R.canWrite(policy, knocking, op()).reason, 'unconfirmed');
});
t('requests: any confirmed post creates; asset owner or staff accepts; another squad cannot', () => {
  const req = { cid: 'r', op: 'put', kind: 'request', id: 'q1', data: { type: 'mortar', target: { x: 5, y: 6 }, layer: 'requests' } };
  assert.strictEqual(R.canWrite(policy, slB, req).ok, true);
  const accept = { cid: 'a', op: 'patch', kind: 'request', id: 'q1', expectedStatus: 'requested', data: { status: 'accepted' } };
  const existing = { id: 'q1', kind: 'request', type: 'mortar', status: 'requested', by: { post: 'sl', squad: 'bravo', client: 'c-slb' } };
  assert.strictEqual(R.canWrite(policy, ot, accept, existing).ok, true);
  assert.strictEqual(R.canWrite(policy, staff, accept, existing).ok, true);
  assert.strictEqual(R.canWrite(policy, slA, accept, existing).reason, 'right');
  const cancel = { cid: 'c', op: 'patch', kind: 'request', id: 'q1', expectedStatus: 'requested', data: { status: 'denied', reason: 'снято' } };
  assert.strictEqual(R.canWrite(policy, slB, cancel, existing).ok, true, 'author cancels own request while requested');
});
t('applyOp: put, patch, del, tombstone wins, expectedStatus and transitions', () => {
  const s = R.createState();
  assert.strictEqual(R.applyOp(s, Object.assign(op(), { seq: 1, at: 1000, by: slB })).ok, true);
  assert.strictEqual(s.objects.m1.label, 'ксено');
  const p = R.applyOp(s, { seq: 2, at: 1100, by: slB, op: 'patch', kind: 'marker', id: 'm1', data: { label: 'два ксено' } });
  assert.strictEqual(p.ok, true); assert.strictEqual(s.objects.m1.label, 'два ксено'); assert.strictEqual(s.objects.m1.x, 10);
  assert.strictEqual(R.applyOp(s, { seq: 3, at: 1200, by: slB, op: 'del', kind: 'marker', id: 'm1' }).ok, true);
  assert.strictEqual(s.objects.m1.deleted, true);
  assert.strictEqual(R.applyOp(s, { seq: 4, at: 1300, by: slB, op: 'patch', kind: 'marker', id: 'm1', data: { label: 'воскрес' } }).reason, 'deleted');
  assert.strictEqual(R.applyOp(s, { seq: 5, at: 1400, by: slB, op: 'put', kind: 'marker', id: 'm1', data: { x: 1, y: 1 } }).reason, 'deleted');
  R.applyOp(s, { seq: 6, at: 2000, by: slB, op: 'put', kind: 'request', id: 'q1', data: { type: 'ob', target: { x: 1, y: 2 }, status: 'requested', layer: 'requests' } });
  assert.strictEqual(R.applyOp(s, { seq: 7, at: 2100, by: staff, op: 'patch', kind: 'request', id: 'q1', expectedStatus: 'accepted', data: { status: 'firing' } }).reason, 'status');
  assert.strictEqual(R.applyOp(s, { seq: 8, at: 2200, by: staff, op: 'patch', kind: 'request', id: 'q1', expectedStatus: 'requested', data: { status: 'done' } }).reason, 'transition');
  assert.strictEqual(R.applyOp(s, { seq: 9, at: 2300, by: staff, op: 'patch', kind: 'request', id: 'q1', expectedStatus: 'requested', data: { status: 'accepted' } }).ok, true);
  assert.strictEqual(s.seq, 9);
});
t('visible objects: tombstones, enemy expiry with confirm refresh, filters', () => {
  const s = R.createState();
  R.applyOp(s, { seq: 1, at: 0, by: slB, op: 'put', kind: 'marker', id: 'old', data: { cat: 'enemy', x: 1, y: 1, layer: 'squad:bravo' } });
  R.applyOp(s, { seq: 2, at: 500000, by: slB, op: 'put', kind: 'marker', id: 'fresh', data: { cat: 'enemy', x: 2, y: 2, layer: 'squad:bravo' } });
  R.applyOp(s, { seq: 3, at: 0, by: slB, op: 'put', kind: 'marker', id: 'kept', data: { cat: 'enemy', x: 3, y: 3, layer: 'squad:bravo', confirmedAt: 550000 } });
  R.applyOp(s, { seq: 4, at: 0, by: staff, op: 'put', kind: 'line', id: 'plan', data: { cat: 'plan', points: [[0, 0], [5, 5]], layer: 'shared' } });
  const now = 700000; // 700 s
  const ids = R.visibleObjects(s, policy, now).map(o => o.id).sort();
  assert.deepStrictEqual(ids, ['fresh', 'kept', 'plan']);
  assert.deepStrictEqual(R.visibleObjects(s, policy, now, { layers: ['shared'] }).map(o => o.id), ['plan']);
  assert.deepStrictEqual(R.visibleObjects(s, policy, now, { posts: ['sl'] }).map(o => o.id).sort(), ['fresh', 'kept']);
  assert.strictEqual(R.enemyAlpha(300, 600), 0.5);
  assert.strictEqual(R.enemyAlpha(590, 600), 0.25);
});
t('clock: offset from hello and countdown never negative', () => {
  const off = R.clockOffset(1000, 1200, 51100); // sent at 1000, got reply at 1200, server said 51100 at midpoint 1100
  assert.strictEqual(off, 50000);
  assert.strictEqual(R.serverNowEst(off, 1300), 51300);
  assert.strictEqual(R.countdown(60000, 51300), 8.7);
  assert.strictEqual(R.countdown(1000, 51300), 0);
});
t('deadlines from fork constants', () => {
  const c = { mortar: { impactDelay: 4.5, travelDelay: 4.5 }, ob: { cooldown: 500, timeline: { impact: 24 } } };
  assert.deepStrictEqual(R.deadlines('mortar', 10000, c, policy), { impactAt: 19000, readyAt: null });
  assert.deepStrictEqual(R.deadlines('ob', 10000, c, policy), { impactAt: 34000, readyAt: 534000 });
  assert.deepStrictEqual(R.deadlines('supply', 10000, c, policy), { impactAt: null, readyAt: 510000 });
  assert.deepStrictEqual(R.deadlines('dropship', 10000, c, policy), { impactAt: null, readyAt: 110000 });
});
t('text limits and control characters', () => {
  assert.strictEqual(R.cleanText('  a\u0007b   c  ', 40), 'ab c');
  assert.strictEqual(R.validateData(policy, 'marker', { label: 'x'.repeat(41), x: 1, y: 1 }), 'label');
  assert.strictEqual(R.validateData(policy, 'line', { points: new Array(65).fill([0, 0]) }), 'points');
  assert.strictEqual(R.validateData(policy, 'request', { note: 'y'.repeat(81), target: { x: 1, y: 1 }, type: 'ob' }), 'note');
  assert.strictEqual(R.validateData(policy, 'request', { type: 'nuke', target: { x: 1, y: 1 } }), 'type');
  assert.strictEqual(R.validateData(policy, 'marker', { label: 'ok', x: 1, y: 1 }), null);
});
t('entry parsing and codes', () => {
  assert.deepStrictEqual(R.parseEntry(' k7m4q2 '), { code: 'K7M4Q2', postCode: null });
  assert.deepStrictEqual(R.parseEntry('K7M4Q2-SLB7'), { code: 'K7M4Q2', postCode: 'SLB7' });
  assert.strictEqual(R.parseEntry('K7M4Q2-SLB7-X'), null);
  assert.strictEqual(R.parseEntry('K70O1I'), null, 'O, 0, 1, I are not in the alphabet');
  const code = R.randomCode(6, () => 0.5);
  assert.strictEqual(code.length, 6);
  assert.ok(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(code));
});
t('level style resolves the squad colour and the enemy signature', () => {
  assert.deepStrictEqual(R.levelStyle(policy, slB), { width: 2.5, dash: [], marker: 'diamond', color: '#f1c40f', level: 'squad' });
  assert.deepStrictEqual(R.levelStyle(policy, staff), { width: 4, dash: [], marker: 'square', color: '#f5f5f5', level: 'staff' });
  assert.strictEqual(R.markerShape(policy, { cat: 'enemy' }, slB), 'triangle');
});
t('polling cadence and room clocks', () => {
  assert.strictEqual(R.retryAfter(1000, 30000), 2);
  assert.strictEqual(R.retryAfter(1000, 70000), 10);
  const d = R.roomDeadlines(policy, 0, false);
  assert.deepStrictEqual(d, { maxAt: 10800000, warnAt: 9600000 });
  assert.deepStrictEqual(R.roomDeadlines(policy, 0, true), { maxAt: 14400000, warnAt: 13200000 });
  assert.strictEqual(R.idleLocked(policy, 0, 480000), true);
  assert.strictEqual(R.idleLocked(policy, 0, 479999), false);
  assert.strictEqual(R.memberStale(policy, 0, 600000), true);
});
t('pending queue merge drops acknowledged ops', () => {
  const pending = [{ cid: 'a' }, { cid: 'b' }, { cid: 'c' }];
  assert.deepStrictEqual(R.mergePending(pending, ['a', 'c']).map(o => o.cid), ['b']);
});
t('ordnance loader, claimed crews, CAS pilot, anyone confirms an enemy mark', () => {
  const ob = { id: 'q9', kind: 'request', type: 'ob', status: 'accepted', by: { client: 'c-slb', post: 'sl', squad: 'bravo' } };
  const load = { cid: 'l', op: 'patch', kind: 'request', id: 'q9', expectedStatus: 'accepted', data: { status: 'loaded' } };
  assert.strictEqual(R.canWrite(policy, ot, load, ob).ok, true, 'OT loads the OB');
  assert.strictEqual(R.canWrite(policy, slB, load, ob).reason, 'right');
  const crew = { client: 'c-ftl', post: 'ftl', squad: 'alpha', confirmed: true, functions: ['mortar'] };
  const mortarReq = { id: 'q8', kind: 'request', type: 'mortar', status: 'requested', by: { client: 'c-slb', post: 'sl', squad: 'bravo' } };
  const accept = { cid: 'a', op: 'patch', kind: 'request', id: 'q8', expectedStatus: 'requested', data: { status: 'accepted' } };
  assert.strictEqual(R.canWrite(policy, crew, accept, mortarReq).reason, 'right');
  const objects = { m: { id: 'm', kind: 'asset', type: 'mortar', claimedBy: 'c-ftl' } };
  assert.deepStrictEqual(R.claimants(objects, mortarReq), ['c-ftl']);
  assert.strictEqual(R.canWrite(policy, crew, accept, mortarReq, { claimed: R.claimants(objects, mortarReq) }).ok, true);
  const claim = { cid: 'c', op: 'patch', kind: 'asset', id: 'm', data: { claimedBy: 'c-ftl' } };
  const asset = { id: 'm', kind: 'asset', type: 'mortar', owner: { post: 'ot' } };
  assert.strictEqual(R.canWrite(policy, crew, claim, asset).ok, true, 'a labelled crew member claims');
  assert.strictEqual(R.canWrite(policy, slB, claim, asset).reason, 'right', 'an unlabelled squad member does not');
  const pilot = { client: 'c-pilot', post: 'pilot', confirmed: true };
  const cas = { id: 'q7', kind: 'request', type: 'cas', status: 'requested', by: { client: 'c-slb', post: 'sl', squad: 'bravo' } };
  assert.strictEqual(R.canWrite(policy, pilot, { cid: 'p', op: 'patch', kind: 'request', id: 'q7', expectedStatus: 'requested', data: { status: 'accepted' } }, cas).ok, true);
  const enemy = { id: 'e', kind: 'marker', cat: 'enemy', layer: 'squad:bravo', by: { client: 'c-slb', post: 'sl', squad: 'bravo' } };
  assert.strictEqual(R.canWrite(policy, staff, { cid: 's', op: 'patch', kind: 'marker', id: 'e', data: { confirmedAt: 5 } }, enemy).ok, true);
  assert.strictEqual(R.canWrite(policy, staff, { cid: 's', op: 'patch', kind: 'marker', id: 'e', data: { label: 'x' } }, enemy).reason, 'layer');
});
t('request actions by post and state', () => {
  const by = { client: 'c-slb', post: 'sl', squad: 'bravo' };
  const req = (type, status) => ({ id: 'r', kind: 'request', type, status, by });
  const pilot = { client: 'c-pilot', post: 'pilot', confirmed: true };
  assert.deepStrictEqual(R.requestActions(policy, slB, req('mortar', 'requested')), ['cancel']);
  assert.deepStrictEqual(R.requestActions(policy, ot, req('mortar', 'requested')), ['accept', 'deny']);
  assert.deepStrictEqual(R.requestActions(policy, ot, req('mortar', 'accepted')), ['take', 'done', 'deny']);
  assert.deepStrictEqual(R.requestActions(policy, ot, req('ob', 'accepted')), ['load']);
  assert.deepStrictEqual(R.requestActions(policy, staff, req('ob', 'accepted')), ['load', 'done', 'deny']);
  assert.deepStrictEqual(R.requestActions(policy, staff, req('ob', 'loaded')), ['fire', 'deny']);
  assert.deepStrictEqual(R.requestActions(policy, pilot, req('cas', 'accepted')), ['fire', 'done', 'deny']);
  assert.deepStrictEqual(R.requestActions(policy, slB, req('supply', 'done')), ['repeat']);
  assert.deepStrictEqual(R.requestActions(policy, knocking, req('mortar', 'requested')), []);
});
t('geometry: simplify, smooth segments, snap', () => {
  assert.deepStrictEqual(R.simplify([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], 0.5, 64), [[0, 0], [4, 0]]);
  assert.deepStrictEqual(R.simplify([[0, 0], [2, 2], [4, 0]], 0.5, 64), [[0, 0], [2, 2], [4, 0]]);
  const noisy = Array.from({ length: 300 }, (_, i) => [i, Math.sin(i) * 3]);
  assert.ok(R.simplify(noisy, 0.2, 64).length <= 64);
  assert.deepStrictEqual(R.smoothSegments([[0, 0], [3, 0], [6, 0]]), [[0.5, 0, 2, 0, 3, 0], [4, 0, 5.5, 0, 6, 0]]);
  assert.deepStrictEqual(R.snapPoints([[0.2, 0.9], [0.7, 0.1], [1.5, -0.5]]), [[0, 0], [1, -1]]);
});
console.log('OK', n, 'groups');
```

- [ ] **Step 2: Run to verify failure**

Run: `node scripts/test_room_logic.js`
Expected: `Error: ENOENT ... tactical/room-logic.js`.

- [ ] **Step 3: Write `tactical/room-logic.js`**

```js
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// This file is part of Space Station Recipes.
// See LICENSE for details.
//
// Room semantics shared by tactical/room.js (browser) and worker/room/*.js
// (Cloudflare Worker): the op log, rights by policy, expiry, clocks and codes.
// No DOM, no fetch. Contract: docs/design/2026-09-13-tactical-tablet.md,
// section «Поправки по итогам war-room». Tests: scripts/test_room_logic.js.
(function (root) {
  'use strict';

  var CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  var CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/;
  var REQUEST_TYPES = ['mortar', 'ob', 'cas', 'supply', 'medevac', 'other'];
  var REQUEST_FLOW = {
    requested: ['accepted', 'denied'],
    accepted: ['loaded', 'firing', 'done', 'denied'],
    loaded: ['firing', 'denied'],
    firing: ['done', 'denied'],
    done: [],
    denied: []
  };
  var KIND_LAYER = { request: 'requests', asset: 'assets', calibration: 'shared' };
  // Which asset a request type is aimed at: CAS requests belong to the dropship pilot.
  var REQUEST_ASSET = { mortar: 'mortar', ob: 'ob', cas: 'dropship', supply: 'supply', medevac: 'medevac' };

  function createState(seq) {
    return { seq: seq || 0, objects: {}, members: {}, epoch: 0, locked: false, closed: false, frozenAt: null };
  }

  function postDef(policy, post) {
    for (var i = 0; i < policy.posts.length; i++) if (policy.posts[i].id === post) return policy.posts[i];
    return null;
  }
  function levelOf(policy, post) { var d = postDef(policy, post); return d ? d.level : null; }
  function isStaff(policy, member) { return levelOf(policy, member.post) === 'staff'; }

  function assetDef(policy, type) {
    for (var i = 0; i < policy.assets.length; i++) if (policy.assets[i].type === type) return policy.assets[i];
    return null;
  }
  function assetOwnerPost(policy, type) { var d = assetDef(policy, type); return d ? d.owner : null; }
  function assetTypeOf(obj) { return obj.kind === 'request' ? (REQUEST_ASSET[obj.type] || null) : obj.type; }

  // extra.claimed: clients holding a claim on an asset of obj's type (see claimants()).
  function hasRight(policy, member, right, obj, extra) {
    var who = policy.rights[right] || [];
    var level = levelOf(policy, member.post);
    if (who.indexOf(level) >= 0) return true;
    if (who.indexOf('asset-owner') >= 0 && obj) {
      var type = assetTypeOf(obj);
      if (type && assetOwnerPost(policy, type) === member.post) return true;
      if (extra && extra.claimed && extra.claimed.indexOf(member.client) >= 0) return true;
      if (obj.claimedBy && obj.claimedBy === member.client) return true;
    }
    return false;
  }

  function claimants(objects, obj) {
    var type = obj ? assetTypeOf(obj) : null, out = [];
    if (!type) return out;
    for (var id in objects) {
      var o = objects[id];
      if (o.kind === 'asset' && !o.deleted && o.type === type && o.claimedBy) out.push(o.claimedBy);
    }
    return out;
  }

  function layerWritable(policy, member, layer) {
    var level = levelOf(policy, member.post);
    var key = layer.indexOf('squad:') === 0 ? 'squad:*' : layer;
    var def = policy.layers[key];
    if (!def || def.write.indexOf(level) < 0) return false;
    if (key === 'squad:*' && layer !== 'squad:' + member.squad) return false;
    return true;
  }

  // {ok:true} or {ok:false, reason}. `existing` is the current object for patch/del;
  // `extra` is {claimed: claimants(objects, existing)} for request patches.
  function canWrite(policy, member, op, existing, extra) {
    if (!member || !member.confirmed) return { ok: false, reason: 'unconfirmed' };
    var level = levelOf(policy, member.post);
    if (!level || level === 'observer') return { ok: false, reason: 'level' };
    var kind = op.kind;
    if (kind === 'calibration') return hasRight(policy, member, 'publishCalibration') ? { ok: true } : { ok: false, reason: 'right' };
    if (op.op === 'del') {
      if (!existing) return { ok: false, reason: 'missing' };
      if (existing.by && existing.by.client === member.client) return { ok: true };
      return hasRight(policy, member, 'kick') ? { ok: true } : { ok: false, reason: 'right' };
    }
    if (kind === 'request') {
      if (op.op === 'put') return layerWritable(policy, member, 'requests') ? { ok: true } : { ok: false, reason: 'layer' };
      if (!existing) return { ok: false, reason: 'missing' };
      var d = op.data || {};
      var author = existing.by && existing.by.client === member.client;
      if (d.status === 'denied' && existing.status === 'requested' && author) return { ok: true };
      if (d.status === 'loaded') {
        var def = assetDef(policy, assetTypeOf(existing));
        return (def && def.loader === member.post) || isStaff(policy, member) ? { ok: true } : { ok: false, reason: 'right' };
      }
      if (d.status !== undefined) return hasRight(policy, member, 'acceptRequest', existing, extra) ? { ok: true } : { ok: false, reason: 'right' };
      if (d.flags !== undefined || d.note !== undefined || d.relayed !== undefined) return { ok: true };
      return author ? { ok: true } : { ok: false, reason: 'right' };
    }
    if (kind === 'asset') {
      // Claiming a crew seat: staff, services, or a squad member labelled «mortar crew».
      var claimOnly = op.op === 'patch' && op.data && Object.keys(op.data).join() === 'claimedBy';
      if (claimOnly) {
        var crew = (member.functions || []).indexOf('mortar') >= 0 || level !== 'squad';
        return crew ? { ok: true } : { ok: false, reason: 'right' };
      }
      if (!layerWritable(policy, member, 'assets')) return { ok: false, reason: 'layer' };
      if (op.op === 'put') return { ok: true };
      var owner = existing && ((existing.owner && existing.owner.post === member.post) || existing.claimedBy === member.client);
      return owner || isStaff(policy, member) ? { ok: true } : { ok: false, reason: 'right' };
    }
    // marker / line / area: anyone confirmed may mark an enemy still there or relayed
    if (op.op === 'patch' && existing) {
      var keys = Object.keys(op.data || {});
      if (keys.length && keys.every(function (k) { return k === 'confirmedAt' || k === 'relayed'; })) return { ok: true };
    }
    var layer = (op.data && op.data.layer) || (existing && existing.layer);
    if (!layer || !layerWritable(policy, member, layer)) return { ok: false, reason: 'layer' };
    if (op.op === 'patch' && existing && existing.by && existing.by.client !== member.client && !isStaff(policy, member)) {
      return { ok: false, reason: 'right' };
    }
    return { ok: true };
  }

  // Applies a server-stamped op {seq, at, by, op, kind, id, data, expectedStatus}.
  function applyOp(state, op) {
    if (state.closed) return { ok: false, reason: 'closed' };
    var cur = state.objects[op.id];
    if (op.op === 'put') {
      if (cur && cur.deleted) return { ok: false, reason: 'deleted' };
      var obj = {};
      var data = op.data || {};
      for (var k in data) if (Object.prototype.hasOwnProperty.call(data, k)) obj[k] = data[k];
      obj.id = op.id; obj.kind = op.kind; obj.seq = op.seq; obj.at = op.at; obj.by = op.by;
      if (op.kind === 'request' && !obj.status) obj.status = 'requested';
      if (!obj.layer) obj.layer = KIND_LAYER[op.kind] || obj.layer;
      state.objects[op.id] = obj;
    } else if (op.op === 'patch') {
      if (!cur) return { ok: false, reason: 'missing' };
      if (cur.deleted) return { ok: false, reason: 'deleted' };
      if (op.expectedStatus !== undefined && cur.status !== op.expectedStatus) return { ok: false, reason: 'status' };
      var d = op.data || {};
      if (d.status !== undefined && cur.kind === 'request') {
        var allowed = REQUEST_FLOW[cur.status] || [];
        if (allowed.indexOf(d.status) < 0) return { ok: false, reason: 'transition' };
      }
      for (var j in d) if (Object.prototype.hasOwnProperty.call(d, j)) cur[j] = d[j];
      cur.seq = op.seq;
    } else if (op.op === 'del') {
      if (!cur) return { ok: false, reason: 'missing' };
      cur.deleted = true; cur.seq = op.seq; cur.deletedAt = op.at;
    } else {
      return { ok: false, reason: 'op' };
    }
    if (op.seq > state.seq) state.seq = op.seq;
    return { ok: true };
  }

  function markerAge(obj, now) { return (now - (obj.confirmedAt || obj.at)) / 1000; }
  function expired(obj, policy, now) {
    return obj.kind === 'marker' && obj.cat === 'enemy' && markerAge(obj, now) > (obj.ttl || policy.ttl.enemyMarkerSec);
  }
  function enemyAlpha(ageSec, ttlSec) { var a = 1 - ageSec / ttlSec; return Math.max(0.25, Math.min(1, Math.round(a * 100) / 100)); }

  // filters: {layers:[...], posts:[...], kinds:[...], maxAgeSec}
  function visibleObjects(state, policy, now, filters) {
    var f = filters || {};
    var out = [];
    for (var id in state.objects) {
      var o = state.objects[id];
      if (o.deleted || expired(o, policy, now)) continue;
      if (f.layers && f.layers.indexOf(o.layer) < 0) continue;
      if (f.posts && !(o.by && f.posts.indexOf(o.by.post) >= 0)) continue;
      if (f.kinds && f.kinds.indexOf(o.kind) < 0) continue;
      if (f.maxAgeSec && (now - o.at) / 1000 > f.maxAgeSec) continue;
      out.push(o);
    }
    out.sort(function (a, b) { return a.seq - b.seq; });
    return out;
  }

  function clockOffset(sentAt, receivedAt, serverNow) { return serverNow - (sentAt + (receivedAt - sentAt) / 2); }
  function serverNowEst(offset, now) { return now + offset; }
  function countdown(deadlineAt, nowEst) { return Math.max(0, Math.round((deadlineAt - nowEst) / 100) / 10); }

  // Hints only: nothing switches state by itself. impactAt/readyAt in ms of server time.
  function deadlines(type, firedAt, constants, policy) {
    var c = constants || {};
    if (type === 'mortar') return { impactAt: firedAt + ((c.mortar.travelDelay + c.mortar.impactDelay) * 1000), readyAt: null };
    if (type === 'ob') return { impactAt: firedAt + c.ob.timeline.impact * 1000, readyAt: firedAt + (c.ob.timeline.impact + c.ob.cooldown) * 1000 };
    var asset = null;
    for (var i = 0; i < policy.assets.length; i++) if (policy.assets[i].type === type) asset = policy.assets[i];
    if (type === 'supply') return { impactAt: null, readyAt: firedAt + (asset.cooldownSec * 1000) };
    if (type === 'dropship') return { impactAt: null, readyAt: firedAt + (asset.flyBySec * 1000) };
    return { impactAt: null, readyAt: null };
  }

  function cleanText(s, max) {
    return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  }
  // null when acceptable, otherwise the failing field name.
  function validateData(policy, kind, data) {
    var L = policy.limits;
    if (!data || typeof data !== 'object') return 'data';
    if (data.label !== undefined && String(data.label).length > L.label) return 'label';
    if (data.note !== undefined && String(data.note).length > L.note) return 'note';
    if (data.callsign !== undefined && String(data.callsign).length > L.callsign) return 'callsign';
    if (kind === 'line' || kind === 'area') {
      if (!Array.isArray(data.points) || data.points.length > L.points) return 'points';
      if (data.points.length < (kind === 'area' ? 3 : 2)) return 'points';
    }
    if (kind === 'marker' && (typeof data.x !== 'number' || typeof data.y !== 'number')) return 'xy';
    if (kind === 'request') {
      if (REQUEST_TYPES.indexOf(data.type) < 0) return 'type';
      if (!data.target || typeof data.target.x !== 'number' || typeof data.target.y !== 'number') return 'target';
      if (data.flags !== undefined && !Array.isArray(data.flags)) return 'flags';
    }
    return null;
  }

  function parseEntry(str) {
    var s = String(str || '').trim().toUpperCase().replace(/\s+/g, '');
    var parts = s.split('-');
    if (parts.length > 2 || !parts[0]) return null;
    if (!CODE_RE.test(parts[0]) || (parts[1] !== undefined && !CODE_RE.test(parts[1]))) return null;
    return { code: parts[0], postCode: parts[1] || null };
  }
  function randomCode(len, rng) {
    var r = rng || Math.random, out = '';
    for (var i = 0; i < len; i++) out += CODE_ALPHABET.charAt(Math.floor(r() * CODE_ALPHABET.length));
    return out;
  }

  function levelStyle(policy, member) {
    var level = levelOf(policy, member.post) || 'observer';
    var lv = policy.levels[level];
    var color = lv.color === 'squad' ? ((policy.squads[member.squad] || {}).color || '#ffffff') : lv.color;
    return { width: lv.line ? lv.line.width : 0, dash: lv.line ? lv.line.dash.slice() : [], marker: lv.marker, color: color, level: level };
  }
  function markerShape(policy, obj, member) {
    if (obj.cat === 'enemy') return policy.enemy.marker;
    return levelStyle(policy, member).marker;
  }

  function retryAfter(lastOpAt, now) { return now - lastOpAt < 60000 ? 2 : 10; }
  function roomDeadlines(policy, createdAt, extended) {
    var maxAt = createdAt + (policy.ttl.roomMaxSec + (extended ? policy.ttl.roomExtendSec : 0)) * 1000;
    return { maxAt: maxAt, warnAt: maxAt - 20 * 60 * 1000 };
  }
  function idleLocked(policy, lastOpAt, now) { return now - lastOpAt >= policy.ttl.roomIdleLockSec * 1000; }
  function memberStale(policy, lastSeenAt, now) { return now - lastSeenAt >= policy.ttl.memberIdleSec * 1000; }
  function mergePending(pending, ackedCids) {
    return pending.filter(function (o) { return ackedCids.indexOf(o.cid) < 0; });
  }

  // Buttons a member gets on a request card, by state and rights. `extra` as in hasRight.
  function requestActions(policy, member, req, extra) {
    if (!member || !member.confirmed || req.deleted) return [];
    var owner = hasRight(policy, member, 'acceptRequest', req, extra);
    var author = !!(req.by && req.by.client === member.client);
    var def = assetDef(policy, assetTypeOf(req));
    var loader = !!(def && def.loader === member.post) || isStaff(policy, member);
    var out = [];
    if (req.status === 'requested') {
      if (owner) out.push('accept', 'deny');
      if (author) out.push('cancel');
    } else if (req.status === 'accepted') {
      if (req.type === 'mortar' && owner) out.push('take');
      if (req.type === 'ob' && loader) out.push('load');
      if (req.type !== 'mortar' && req.type !== 'ob' && owner) out.push('fire');
      if (owner) out.push('done', 'deny');
    } else if (req.status === 'loaded') {
      if (owner) out.push('fire', 'deny');
    } else if (req.status === 'firing') {
      if (owner) out.push('done');
    } else if (author) {
      out.push('repeat');
    }
    return out;
  }

  // ── geometry for lines, areas and freehand strokes ────────────────────

  function perpDist(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / Math.hypot(dx, dy);
  }
  function rdp(points, eps) {
    if (points.length < 3) return points.slice();
    var maxD = -1, idx = 0, last = points.length - 1;
    for (var i = 1; i < last; i++) {
      var d = perpDist(points[i], points[0], points[last]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD <= eps) return [points[0], points[last]];
    return rdp(points.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(points.slice(idx), eps));
  }
  // Ramer–Douglas–Peucker; widens epsilon until the stroke fits `max` points.
  function simplify(points, epsilon, max) {
    var eps = epsilon, out = rdp(points, eps);
    while (max && out.length > max) { eps *= 1.5; out = rdp(points, eps); }
    return out;
  }
  // Catmull-Rom through the points as cubic Bézier segments [c1x, c1y, c2x, c2y, x, y].
  function smoothSegments(pts) {
    var out = [];
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      out.push([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
        p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]]);
    }
    return out;
  }
  // Continuous world points to tiles, consecutive duplicates dropped.
  function snapPoints(points) {
    var out = [];
    points.forEach(function (p) {
      var q = [Math.floor(p[0]), Math.floor(p[1])], l = out[out.length - 1];
      if (!l || l[0] !== q[0] || l[1] !== q[1]) out.push(q);
    });
    return out;
  }

  root.TacticalRoomLogic = {
    CODE_ALPHABET: CODE_ALPHABET, REQUEST_TYPES: REQUEST_TYPES, REQUEST_FLOW: REQUEST_FLOW, REQUEST_ASSET: REQUEST_ASSET,
    assetDef: assetDef, assetTypeOf: assetTypeOf, claimants: claimants, requestActions: requestActions,
    simplify: simplify, smoothSegments: smoothSegments, snapPoints: snapPoints,
    createState: createState, postDef: postDef, levelOf: levelOf, isStaff: isStaff, hasRight: hasRight,
    assetOwnerPost: assetOwnerPost, layerWritable: layerWritable, canWrite: canWrite, applyOp: applyOp,
    markerAge: markerAge, expired: expired, enemyAlpha: enemyAlpha, visibleObjects: visibleObjects,
    clockOffset: clockOffset, serverNowEst: serverNowEst, countdown: countdown, deadlines: deadlines,
    cleanText: cleanText, validateData: validateData, parseEntry: parseEntry, randomCode: randomCode,
    levelStyle: levelStyle, markerShape: markerShape, retryAfter: retryAfter, roomDeadlines: roomDeadlines,
    idleLocked: idleLocked, memberStale: memberStale, mergePending: mergePending
  };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run the tests**

Run: `node scripts/test_room_logic.js`
Expected: fifteen `ok …` lines and `OK 15 groups`. If `canWrite` for the author's cancel fails, check that `existing.by.client` equals `member.client` in the test fixture (`c-slb`).

- [ ] **Step 5: Commit**

```bash
git add tactical/room-logic.js scripts/test_room_logic.js
git commit -m "feat(tablet): room logic module with op log, rights, expiry and clocks (V4)"
```

### Task 3: Worker — Registry and Room Durable Objects (V5)

**Files:**
- Modify: `scripts/check_room_policy.py` (append `--sync` that writes `worker/room/policies.js`)
- Create: `worker/room/policies.js` (generated)
- Create: `worker/room/crypto.js`
- Create: `worker/room/words.js`
- Create: `worker/room/export.js`
- Create: `worker/room/registry.js`
- Create: `worker/room/room.js`
- Create: `worker/room/router.js`
- Create: `scripts/room_token.mjs`
- Modify: `worker/index.js` (route room paths, export the two classes)
- Modify: `worker/wrangler.toml`
- Test: `scripts/test_room_worker.mjs`

Design notes the code below follows (from the decision record):
- Storage is the Durable Object KV API on the SQLite backend: `op:<seq9>` and `obj:<id>` per accepted op (exactly 2 rows), `meta` only on lifecycle changes, `sess:<client>` per session. `lastOpAt`, rate counters, presence and `lastRequestOpAt` live in memory and are rebuilt from the log on wake.
- No repeating timers: one alarm per room (max lifetime, or lock/close + export grace). The idle lock (8 min) and member auto-release (10 min) are evaluated lazily on each request.
- The room code is an alias kept by the Registry, so «Сменить код» changes the code without moving the object; `epoch` inside every session token revokes all sessions at once.
- The only sanction gate is an HMAC server token `{fork, server, keyId, iat}` signed with a secret from `ROOM_KEYS`; the client-declared server name is never used. Stop links are HMAC-signed per `keyId` and need a POST (a GET only shows a confirmation form, so link previews cannot trigger them).
- Members are objects of kind `member` in the same op log, so the roster syncs through polling like everything else.

- [ ] **Step 1: Add `--sync` to the policy checker**

Append to `scripts/check_room_policy.py` (replace the last three lines `files = …` to `print('OK')` with this block):

```python
files = sorted((ROOT / 'tactical' / 'policy').glob('*.json'))
if not files: fail('no policy files')
for f in files: check(f)

# worker/room/policies.js is generated from these files so the Worker and the
# page read one source. `--sync` writes it; the default run fails when stale.
bundle = {f.stem: json.loads(f.read_text(encoding='utf-8')) for f in files}
generated = ('// GENERATED by scripts/check_room_policy.py --sync from tactical/policy/*.json. Do not edit.\n'
             'export default ' + json.dumps(bundle, ensure_ascii=False, indent=1, sort_keys=True) + ';\n')
target = ROOT / 'worker' / 'room' / 'policies.js'
if '--sync' in sys.argv:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(generated, encoding='utf-8', newline='\n')
    print('wrote', target.relative_to(ROOT))
elif not target.exists() or target.read_text(encoding='utf-8') != generated:
    fail('worker/room/policies.js is stale: run python scripts/check_room_policy.py --sync')
print('OK')
```

Run: `python scripts/check_room_policy.py --sync && python scripts/check_room_policy.py`
Expected: `wrote worker/room/policies.js`, `OK`, then `OK` again.

- [ ] **Step 2: Write the failing Worker test**

```js
// scripts/test_room_worker.mjs — drives worker/room/* under Node with fake Durable Objects.
// Run: node scripts/test_room_worker.mjs
import assert from 'node:assert';
import { routeRoom } from '../worker/room/router.js';
import { Room } from '../worker/room/room.js';
import { Registry } from '../worker/room/registry.js';
import { signServerToken, stopSig } from '../worker/room/crypto.js';
import { chronology } from '../worker/room/export.js';
import POLICIES from '../worker/room/policies.js';

const ORIGIN = 'https://mikameo.github.io';
const SECRET = 'test-key-secret';
const STOP = 'test-stop-secret';
const clone = v => (v === undefined ? undefined : structuredClone(v));

class FakeStorage {
  constructor() { this.map = new Map(); this.writes = 0; this.alarmAt = null; }
  async get(k) {
    if (Array.isArray(k)) { const m = new Map(); for (const x of k) if (this.map.has(x)) m.set(x, clone(this.map.get(x))); return m; }
    return clone(this.map.get(k));
  }
  async put(k, v) {
    if (typeof k === 'object') { for (const [kk, vv] of Object.entries(k)) { this.map.set(kk, clone(vv)); this.writes++; } return; }
    this.map.set(k, clone(v)); this.writes++;
  }
  async delete(k) {
    const keys = Array.isArray(k) ? k : [k]; let n = 0;
    for (const x of keys) { if (this.map.delete(x)) n++; this.writes++; }
    return Array.isArray(k) ? n : n > 0;
  }
  async list(o = {}) {
    let keys = [...this.map.keys()].sort();
    if (o.prefix) keys = keys.filter(k => k.startsWith(o.prefix));
    if (o.start) keys = keys.filter(k => k >= o.start);
    if (o.startAfter) keys = keys.filter(k => k > o.startAfter);
    if (o.reverse) keys.reverse();
    if (o.limit) keys = keys.slice(0, o.limit);
    return new Map(keys.map(k => [k, clone(this.map.get(k))]));
  }
  async deleteAll() { this.map.clear(); }
  async setAlarm(t) { this.alarmAt = t; }
  async getAlarm() { return this.alarmAt; }
  async deleteAlarm() { this.alarmAt = null; }
}

function namespace(Klass, env) {
  const inst = new Map();
  return {
    instances: inst,
    idFromName: name => ({ name, toString: () => name }),
    get: id => ({
      fetch: (input, init) => {
        if (!inst.has(id.name)) inst.set(id.name, new Klass({ storage: new FakeStorage(), id }, env));
        return inst.get(id.name).fetch(input instanceof Request ? input : new Request(input, init));
      }
    })
  };
}

function makeEnv(over = {}) {
  const env = Object.assign({
    ALLOWED_ORIGINS: ORIGIN, ROOMS_ENABLED: '1', ROOMS_MAX_CONCURRENT: '6', ROOMS_MAX_DAILY: '30',
    ROOM_KEYS: JSON.stringify({ 'stories-k1': SECRET }), ROOM_STOP_SECRET: STOP,
    clock: Date.UTC(2026, 8, 13, 18, 0, 0)
  }, over);
  env.NOW = () => env.clock;
  env.ROOMS = namespace(Room, env);
  env.REGISTRY = namespace(Registry, env);
  return env;
}

function call(env, method, path, { body, session, observer, keyId, origin = ORIGIN } = {}) {
  const headers = { Origin: origin, 'Content-Type': 'application/json' };
  if (session) headers['X-Room-Session'] = session;
  if (observer) headers['X-Room-Observer'] = observer;
  if (keyId) headers['X-Room-Key-Id'] = keyId;
  return routeRoom(new Request('https://w.example' + path, { method, headers, body: body ? JSON.stringify(body) : undefined }), env);
}

const token = await signServerToken(SECRET, { fork: 'stories_cm', server: 'Space Stories - Marine Corps Core', keyId: 'stories-k1', iat: 1 });
const CO = { client: 'client-co-0001', post: 'co', callsign: 'Иванов' };
const create = (env, over = {}) => call(env, 'POST', '/room', { keyId: 'stories-k1', body: Object.assign({ token, planet: 'lv624', h: 'abc', creator: CO }, over) });

let passed = 0;
async function t(name, fn) { await fn(); passed++; console.log('ok', name); }

await t('policy route serves the generated policy', async () => {
  const env = makeEnv();
  const r = await call(env, 'GET', '/policy/stories_cm');
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await r.json()).fork, 'stories_cm');
  assert.strictEqual((await call(env, 'GET', '/policy/nope')).status, 404);
});

await t('origin and sanction gate', async () => {
  const env = makeEnv();
  assert.strictEqual((await call(env, 'GET', '/health', { origin: 'https://evil.example' })).status, 403);
  assert.strictEqual((await call(env, 'POST', '/room', { keyId: 'stories-k1', body: { planet: 'lv624', creator: CO } })).status, 403);
  assert.strictEqual((await create(env, { token: token.slice(0, -2) + 'xx' })).status, 403);
  assert.strictEqual((await call(env, 'POST', '/room', { keyId: 'other', body: { token, planet: 'lv624', creator: CO } })).status, 403);
  const bad = await create(env, { creator: { client: 'client-sl-0001', post: 'sl', squad: 'bravo' } });
  assert.strictEqual(bad.status, 400);
  assert.strictEqual((await bad.json()).error, 'creator');
});

await t('ceiling refuses new rooms with text, never an active one', async () => {
  const env = makeEnv({ ROOMS_MAX_CONCURRENT: '1' });
  assert.strictEqual((await create(env)).status, 200);
  const second = await create(env);
  assert.strictEqual(second.status, 429);
  assert.strictEqual((await second.json()).error, 'ceiling');
});

await t('stop link: GET shows a form, POST stops, start re-enables', async () => {
  const env = makeEnv();
  const sig = await stopSig(STOP, 'stop', 'stories-k1');
  const page = await routeRoom(new Request('https://w.example/stop/stories-k1/' + sig), env);
  assert.strictEqual(page.status, 200);
  assert.match(await page.text(), /<form method="post">/);
  assert.strictEqual((await create(env)).status, 200, 'GET alone does not stop');
  assert.strictEqual((await routeRoom(new Request('https://w.example/stop/stories-k1/wrong', { method: 'POST' }), env)).status, 403);
  assert.strictEqual((await routeRoom(new Request('https://w.example/stop/stories-k1/' + sig, { method: 'POST' }), env)).status, 200);
  const refused = await create(env);
  assert.strictEqual(refused.status, 403);
  assert.strictEqual((await refused.json()).error, 'stopped');
  const startSig = await stopSig(STOP, 'start', 'stories-k1');
  await routeRoom(new Request('https://w.example/start/stories-k1/' + startSig, { method: 'POST' }), env);
  assert.strictEqual((await create(env)).status, 200);
});

// One room, one evening: the rest of the cases share it in order.
const env = makeEnv();
const created = await (await create(env)).json();
const room = [...env.ROOMS.instances.values()][0];
const code = created.code;
const sheet = created.sheet;
let coSession = created.session;
const codeOf = (post, squad) => sheet.find(s => s.post === post && s.squad === (squad || null)).code;
let slSession, ftlSession;

await t('create returns a code, a session, an observer token and the briefing sheet', async () => {
  assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  assert.strictEqual(sheet.length, 1 + 1 + 3 + 2 + 5 + 20 + 2 + 2 + 2);
  assert.ok(created.observerToken.length >= 20);
  const r = await call(env, 'GET', `/room/${code}/ops?since=0`, { session: coSession });
  assert.strictEqual(r.status, 200);
  const body = await r.json();
  assert.strictEqual(body.ops[0].kind, 'member');
  assert.strictEqual(body.ops[0].data.confirmed, true);
});

await t('post code joins as knocking; knocking reads nothing and writes nothing', async () => {
  const j = await call(env, 'POST', `/room/${code}/join`, { body: { client: 'client-slb-001', postCode: codeOf('sl', 'bravo'), callsign: 'Петров' } });
  assert.strictEqual(j.status, 200);
  const jb = await j.json();
  assert.strictEqual(jb.status, 'knocking');
  assert.ok(jb.word);
  slSession = jb.session;
  const poll = await (await call(env, 'GET', `/room/${code}/ops?since=0`, { session: slSession })).json();
  assert.strictEqual(poll.knocking, true);
  assert.deepStrictEqual(poll.ops, []);
  const w = await call(env, 'POST', `/room/${code}/ops`, { session: slSession, body: { ops: [{ cid: 'a', op: 'put', kind: 'marker', id: 'm1', data: { cat: 'enemy', label: 'ксено', x: 10, y: 20, layer: 'squad:bravo' } }] } });
  assert.strictEqual(w.status, 403);
});

await t('a used post code refuses another client', async () => {
  const r = await call(env, 'POST', `/room/${code}/join`, { body: { client: 'client-xeno-01', postCode: codeOf('sl', 'bravo') } });
  assert.strictEqual(r.status, 409);
  assert.strictEqual((await r.json()).error, 'used');
});

await t('any confirmed member confirms one knock with a single click', async () => {
  const members = (await (await call(env, 'GET', `/room/${code}/ops?since=0`, { session: coSession })).json()).ops.filter(o => o.kind === 'member');
  const sl = members.find(o => o.data.post === 'sl');
  const r = await call(env, 'POST', `/room/${code}/admin`, { session: coSession, body: { action: 'confirm', client: sl.data.client } });
  assert.strictEqual(r.status, 200);
});

await t('two knocks require the spoken word', async () => {
  const f = await (await call(env, 'POST', `/room/${code}/join`, { body: { client: 'client-ftlb-01', postCode: codeOf('ftl', 'bravo') } })).json();
  ftlSession = f.session;
  await call(env, 'POST', `/room/${code}/join`, { body: { client: 'client-ftla-01', post: 'ftl', squad: 'alpha' } });
  const noWord = await call(env, 'POST', `/room/${code}/admin`, { session: slSession, body: { action: 'confirm', client: 'client-ftlb-01' } });
  assert.strictEqual(noWord.status, 409);
  assert.strictEqual((await noWord.json()).error, 'word');
  const ok = await call(env, 'POST', `/room/${code}/admin`, { session: slSession, body: { action: 'confirm', client: 'client-ftlb-01', word: f.word } });
  assert.strictEqual(ok.status, 200);
});

await t('an accepted op writes exactly two rows; a refused one writes none', async () => {
  const before = room.s.writes;
  const r = await (await call(env, 'POST', `/room/${code}/ops`, { session: slSession, body: { ops: [{ cid: 'm1', op: 'put', kind: 'marker', id: 'm1', data: { cat: 'enemy', label: 'ксено', x: 10, y: 20, layer: 'squad:bravo' } }] } })).json();
  assert.ok(r.acks[0].seq > 0);
  assert.strictEqual(room.s.writes - before, 2);
  const before2 = room.s.writes;
  const refused = await (await call(env, 'POST', `/room/${code}/ops`, { session: slSession, body: { ops: [{ cid: 'x', op: 'put', kind: 'marker', id: 'm2', data: { cat: 'plan', x: 1, y: 1, layer: 'shared' } }] } })).json();
  assert.strictEqual(refused.acks[0].error, 'layer');
  assert.strictEqual(room.s.writes, before2);
});

await t('expectedStatus: the second accept of the same request is refused', async () => {
  await call(env, 'POST', `/room/${code}/ops`, { session: slSession, body: { ops: [{ cid: 'q', op: 'put', kind: 'request', id: 'q1', data: { type: 'mortar', target: { x: 30, y: 40 }, note: 'гнездо' } }] } });
  const a1 = await (await call(env, 'POST', `/room/${code}/ops`, { session: coSession, body: { ops: [{ cid: 'a1', op: 'patch', kind: 'request', id: 'q1', expectedStatus: 'requested', data: { status: 'accepted' } }] } })).json();
  assert.ok(a1.acks[0].seq);
  const a2 = await (await call(env, 'POST', `/room/${code}/ops`, { session: coSession, body: { ops: [{ cid: 'a2', op: 'patch', kind: 'request', id: 'q1', expectedStatus: 'requested', data: { status: 'accepted' } }] } })).json();
  assert.strictEqual(a2.acks[0].error, 'status');
  const f = await (await call(env, 'POST', `/room/${code}/ops`, { session: coSession, body: { ops: [{ cid: 'f', op: 'patch', kind: 'request', id: 'q1', expectedStatus: 'accepted', data: { status: 'firing', firedAt: 1 } }] } })).json();
  assert.ok(f.acks[0].seq);
  assert.strictEqual(room.state.objects.q1.firedAt, env.clock, 'firedAt is stamped by the server');
});

await t('Retry-After: 2 s while a request is fresh, 10 s later', async () => {
  const r1 = await call(env, 'GET', `/room/${code}/ops?since=0`, { session: coSession });
  assert.strictEqual(r1.headers.get('Retry-After'), '2');
  env.clock += 61000;
  const r2 = await call(env, 'GET', `/room/${code}/ops?since=0`, { session: coSession });
  assert.strictEqual(r2.headers.get('Retry-After'), '10');
});

await t('rate limit per client: the eleventh op in one second is refused', async () => {
  env.clock += 5000;
  const ops = Array.from({ length: 11 }, (_, i) => ({ cid: 'r' + i, op: 'put', kind: 'marker', id: 'rate' + i, data: { cat: 'enemy', x: i, y: i, layer: 'squad:bravo' } }));
  const r = await (await call(env, 'POST', `/room/${code}/ops`, { session: slSession, body: { ops } })).json();
  assert.ok(r.acks[9].seq);
  assert.strictEqual(r.acks[10].error, 'rate');
});

await t('radio silence freezes writes and shows in meta', async () => {
  env.clock += 2000;
  await call(env, 'POST', `/room/${code}/admin`, { session: coSession, body: { action: 'silence', on: true } });
  const w = await call(env, 'POST', `/room/${code}/ops`, { session: slSession, body: { ops: [{ cid: 's', op: 'put', kind: 'marker', id: 's1', data: { cat: 'enemy', x: 1, y: 1, layer: 'squad:bravo' } }] } });
  assert.strictEqual(w.status, 423);
  assert.strictEqual((await w.json()).error, 'silence');
  const meta = (await (await call(env, 'GET', `/room/${code}/ops?since=0`, { session: slSession })).json()).meta;
  assert.strictEqual(meta.frozen.reason, 'silence');
  await call(env, 'POST', `/room/${code}/admin`, { session: coSession, body: { action: 'silence', on: false } });
});

await t('idle lock after 8 minutes; staff continues with one click', async () => {
  env.clock += 480000;
  const w = await call(env, 'POST', `/room/${code}/ops`, { session: slSession, body: { ops: [{ cid: 'l', op: 'put', kind: 'marker', id: 'l1', data: { cat: 'enemy', x: 2, y: 2, layer: 'squad:bravo' } }] } });
  assert.strictEqual(w.status, 423);
  assert.strictEqual((await w.json()).error, 'locked');
  assert.strictEqual((await call(env, 'POST', `/room/${code}/admin`, { session: coSession, body: { action: 'unlock' } })).status, 200);
  const ok = await (await call(env, 'POST', `/room/${code}/ops`, { session: slSession, body: { ops: [{ cid: 'l', op: 'put', kind: 'marker', id: 'l1', data: { cat: 'enemy', x: 2, y: 2, layer: 'squad:bravo' } }] } })).json();
  assert.ok(ok.acks[0].seq);
});

await t('reissue gives a dead SL slot a fresh post code', async () => {
  const r = await (await call(env, 'POST', `/room/${code}/admin`, { session: coSession, body: { action: 'reissue', client: 'client-slb-001' } })).json();
  assert.match(r.postCode, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
  assert.strictEqual((await call(env, 'GET', `/room/${code}/ops?since=0`, { session: slSession })).status, 401, 'the old holder is released');
  const j = await (await call(env, 'POST', `/room/${code}/join`, { body: { client: 'client-slb-002', postCode: r.postCode } })).json();
  assert.strictEqual(j.status, 'knocking');
  slSession = j.session;
  await call(env, 'POST', `/room/${code}/admin`, { session: coSession, body: { action: 'confirm', client: 'client-slb-002', word: j.word } });
});

await t('export: no sessions or words, chronology in game coordinates', async () => {
  await call(env, 'POST', `/room/${code}/ops`, { session: coSession, body: { ops: [{ cid: 'c', op: 'put', kind: 'calibration', id: 'calibration', data: { offset: [243, -218] } }] } });
  const r = await call(env, 'GET', `/room/${code}/export`, { session: coSession });
  assert.strictEqual(r.status, 200);
  const raw = await r.text();
  assert.ok(!/sess:|"hash"|"word":"[^"]/.test(raw));
  const body = JSON.parse(raw);
  assert.match(body.text, /метка «ксено» 253 -198/);
  const obs = await call(env, 'GET', `/room/${code}/export`, { observer: created.observerToken });
  assert.strictEqual(obs.status, 200);
  const obsWrite = await call(env, 'POST', `/room/${code}/ops`, { observer: created.observerToken, body: { ops: [] } });
  assert.strictEqual(obsWrite.status, 403);
});

await t('rotate: epoch revokes every session, only the rotating officer gets a new one', async () => {
  const r = await (await call(env, 'POST', `/room/${code}/admin`, { session: coSession, body: { action: 'rotate' } })).json();
  assert.notStrictEqual(r.code, code);
  const oldPath = await call(env, 'GET', `/room/${code}/ops?since=0`, { session: coSession });
  assert.ok([401, 404].includes(oldPath.status));
  assert.strictEqual((await call(env, 'GET', `/room/${r.code}/ops?since=0`, { session: slSession })).status, 401);
  assert.strictEqual((await call(env, 'GET', `/room/${r.code}/ops?since=0`, { session: r.session })).status, 200);
  coSession = r.session;
  created.code = r.code;
});

await t('lifetime: close at max, export during grace, delete after grace', async () => {
  env.clock += 3 * 3600 * 1000;
  await room.alarm();
  const w = await call(env, 'POST', `/room/${created.code}/ops`, { session: coSession, body: { ops: [{ cid: 'z', op: 'put', kind: 'marker', id: 'z1', data: { cat: 'plan', x: 1, y: 1, layer: 'shared' } }] } });
  assert.strictEqual(w.status, 423);
  assert.strictEqual((await w.json()).error, 'closed');
  assert.strictEqual((await call(env, 'GET', `/room/${created.code}/export`, { session: coSession })).status, 200);
  env.clock += 3600 * 1000;
  await room.alarm();
  assert.strictEqual(room.s.map.size, 0);
  const health = await (await call(env, 'GET', '/health')).json();
  assert.strictEqual(health.active, 0);
});

await t('chronology names posts and squads', () => {
  const text = chronology([{ seq: 1, at: Date.UTC(2026, 8, 13, 18, 5, 7), by: { client: 'c', post: 'sl', squad: 'bravo' }, op: 'put', kind: 'marker', id: 'm', data: { label: 'ксено', x: 1, y: 2 } }], POLICIES.stories_cm, [10, 20]);
  assert.strictEqual(text, '18:05:07  Командир отряда Браво  метка «ксено» 11 22');
});

console.log('OK', passed, 'cases');
```

- [ ] **Step 3: Run it to see it fail**

Run: `node scripts/test_room_worker.mjs`
Expected: `ERR_MODULE_NOT_FOUND` for `worker/room/router.js`.

- [ ] **Step 4: Write `worker/room/crypto.js`**

```js
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// Tokens and secrets for the officers' room: HMAC-SHA256 server tokens, stop
// links, session hashes. Web Crypto only, so the same file runs in Node tests.
const enc = new TextEncoder();

export function b64url(bytes) {
  let s = '';
  const b = new Uint8Array(bytes);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(str) {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

export async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}

export async function sha256(text) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function randomSecret(bytes = 18) {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function rng() {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function signServerToken(secret, payload) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  return body + '.' + await hmac(secret, body);
}

// Payload {fork, server, keyId, iat} when the signature matches ROOM_KEYS[keyId], else null.
export async function verifyServerToken(keysJson, token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  let payload, keys;
  try { payload = JSON.parse(fromB64url(parts[0])); } catch { return null; }
  try { keys = JSON.parse(keysJson || '{}'); } catch { return null; }
  const secret = payload && typeof payload.keyId === 'string' ? keys[payload.keyId] : null;
  if (!secret) return null;
  return safeEqual(await hmac(secret, parts[0]), parts[1]) ? payload : null;
}

export function stopSig(stopSecret, action, keyId) {
  return hmac(stopSecret, action + ':' + keyId);
}
```

- [ ] **Step 5: Write `worker/room/words.js`**

```js
// Confirmation words: short, no two alike by ear over a noisy radio, no squad
// names (Альфа…Эхо) and no NATO letters.
export const WORDS_RU = ['ФАЗАН', 'КЛЁН', 'РУБИН', 'ЯКОРЬ', 'ГРОМ', 'ЛИМОН', 'ТУМАН', 'КОМЕТА', 'САПФИР', 'ОРЁЛ',
  'БАРСУК', 'ПЕСОК', 'ЖУРАВЛЬ', 'ЧАЙКА', 'ЛЕДНИК', 'МАЯК', 'КЕДР', 'ШТОРМ', 'ИРИС', 'ЮПИТЕР',
  'КАНАТ', 'МОСТ', 'ЗУБР', 'ЛУНА', 'ПИОН', 'СОКОЛ', 'ТИГР', 'ХОЛМ', 'ЩИТ', 'АЛМАЗ', 'БЕРЁЗА', 'ПАРУС'];
export const WORDS_EN = ['FALCON', 'MAPLE', 'ANCHOR', 'THUNDER', 'LEMON', 'HARBOR', 'COMET', 'SAPPHIRE', 'BADGER', 'CRANE',
  'GLACIER', 'BEACON', 'CEDAR', 'STORM', 'IRIS', 'JUPITER', 'CANYON', 'BRIDGE', 'BISON', 'MOON',
  'PEONY', 'TIGER', 'HILL', 'SHIELD', 'DIAMOND', 'BIRCH', 'HEATHER', 'COBRA', 'SAIL', 'SIGNAL', 'POPLAR', 'SAGE'];
export function wordFor(fork, rnd) {
  const list = fork === 'stories_cm' ? WORDS_RU : WORDS_EN;
  return list[Math.floor(rnd() * list.length)];
}
```

- [ ] **Step 6: Write `worker/room/export.js`**

```js
// Text chronology for moderators: one line per op, posts by name, game coordinates.
export function chronology(ops, policy, offset) {
  const postName = post => { const d = policy.posts.find(p => p.id === post); return d ? d.nameRu : post; };
  const squadName = sq => (policy.squads[sq] || {}).nameRu || '';
  const coords = (x, y) => (offset ? `${x + offset[0]} ${y + offset[1]}` : `${x} ${y} (мир)`);
  return ops.map(op => {
    const t = new Date(op.at).toISOString().slice(11, 19);
    const who = op.by.post === 'system' ? 'Система' : postName(op.by.post) + (op.by.squad ? ' ' + squadName(op.by.squad) : '');
    const d = op.data || {};
    let what;
    if (op.kind === 'member') {
      what = op.op === 'del' ? 'снят с должности'
        : d.confirmed ? 'подтверждён'
        : d.presentAt ? 'на месте'
        : d.functions ? 'ярлыки: ' + (d.functions.join(', ') || 'нет')
        : 'вход: ' + postName(d.post);
    } else if (op.op === 'del') {
      what = 'удалил ' + op.id;
    } else if (op.kind === 'marker') {
      what = ('метка «' + (d.label || d.cat || '') + '» ' + (d.x !== undefined ? coords(d.x, d.y) : '')).trim();
    } else if (op.kind === 'request') {
      what = d.status ? `запрос ${op.id}: ${d.status}` : `запрос ${d.type} ${coords(d.target.x, d.target.y)}`;
    } else if (op.kind === 'asset') {
      what = `ресурс ${op.id}: ${d.state || 'изменён'}`;
    } else if (op.kind === 'calibration') {
      what = 'калибровка ' + (d.offset ? d.offset.join(' ') : '');
    } else {
      what = (op.kind === 'line' ? 'линия' : 'область') + ' «' + (d.label || '') + '»';
    }
    return `${t}  ${who}  ${what}`;
  }).join('\n');
}
```

- [ ] **Step 7: Write `worker/room/registry.js`**

```js
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// One Registry object ("main"): room code aliases, active/daily counters for
// the ceilings, stop flags per server key, and numbers-only health.
const day = t => new Date(t).toISOString().slice(0, 10);
const ok = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

export class Registry {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  now() { return this.env.NOW ? this.env.NOW() : Date.now(); }

  async stopped(keyId) {
    const s = this.ctx.storage;
    return !!((await s.get('stop:*')) || (await s.get('stop:' + keyId)));
  }

  async fetch(request) {
    const url = new URL(request.url);
    const s = this.ctx.storage;
    const now = this.now();
    const b = request.method === 'POST' ? await request.json() : null;
    switch (url.pathname) {
      case '/reserve': {
        if (await this.stopped(b.keyId)) return ok({ ok: false, reason: 'stopped' });
        const active = await s.list({ prefix: 'active:' });
        const stale = [];
        let live = 0;
        for (const [k, v] of active) { if (now - v.createdAt > b.horizonMs) stale.push(k); else live++; }
        if (stale.length) await s.delete(stale);
        if (live >= b.maxConcurrent) return ok({ ok: false, reason: 'ceiling' });
        const dayKey = 'day:' + day(now);
        const today = (await s.get(dayKey)) || 0;
        if (today >= b.maxDaily) return ok({ ok: false, reason: 'daily' });
        if (await s.get('code:' + b.code)) return ok({ ok: false, reason: 'collision' });
        await s.put({ [dayKey]: today + 1, ['active:' + b.name]: { createdAt: now, keyId: b.keyId }, ['code:' + b.code]: b.name });
        return ok({ ok: true });
      }
      case '/resolve':
        return ok({ name: (await s.get('code:' + url.searchParams.get('code'))) || null });
      case '/rotate': {
        if (await s.get('code:' + b.code)) return ok({ ok: false, reason: 'collision' });
        await s.delete('code:' + b.old);
        await s.put('code:' + b.code, b.name);
        return ok({ ok: true });
      }
      case '/release':
        await s.delete(['active:' + b.name, 'code:' + b.code]);
        return ok({ ok: true });
      case '/stopped':
        return ok({ stopped: await this.stopped(url.searchParams.get('keyId')) });
      case '/stop':
        if (b.on) await s.put('stop:' + b.keyId, now); else await s.delete('stop:' + b.keyId);
        return ok({ ok: true });
      case '/health': {
        const active = await s.list({ prefix: 'active:' });
        return ok({ active: active.size, today: (await s.get('day:' + day(now))) || 0 });
      }
    }
    return new Response('not found', { status: 404 });
  }
}
```

- [ ] **Step 8: Write `worker/room/room.js`**

```js
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// One Room object per officers' room. Op log in the SQLite-backed KV API
// (op:<seq> + obj:<id> per accepted op), lazy idle lock and member release,
// one alarm for lifetime and export grace. Semantics: tactical/room-logic.js.
import '../../tactical/room-logic.js';
import POLICIES from './policies.js';
import { wordFor } from './words.js';
import { sha256, randomSecret, rng, safeEqual } from './crypto.js';
import { chronology } from './export.js';

const R = globalThis.TacticalRoomLogic;
const SYSTEM = { client: 'room', post: 'system', squad: null };
const WRITE_KINDS = ['marker', 'line', 'area', 'request', 'asset', 'calibration', 'member'];
const pad = n => String(n).padStart(9, '0');
const json = (status, body, headers) =>
  new Response(JSON.stringify(body), { status, headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}) });
const byOf = m => ({ client: m.client, post: m.post, squad: m.squad || null });

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.s = ctx.storage;
    this.loaded = false;
    this.rate = new Map();
    this.seen = new Map();
    this.memberOpAt = new Map();
    this.lastRequestOpAt = 0;
    this.stopCheckedAt = 0;
  }

  now() { return this.env.NOW ? this.env.NOW() : Date.now(); }

  async load() {
    if (this.loaded) return;
    this.meta = (await this.s.get('meta')) || null;
    this.state = R.createState();
    this.sessions = new Map();
    this.bytes = 0;
    this.lastOpAt = 0;
    if (this.meta) {
      this.policy = POLICIES[this.meta.fork];
      for (const [, obj] of await this.s.list({ prefix: 'obj:' })) {
        this.state.objects[obj.id] = obj;
        this.bytes += JSON.stringify(obj).length;
      }
      for (const [k, v] of await this.s.list({ prefix: 'sess:' })) this.sessions.set(k.slice(5), v);
      for (const [, op] of await this.s.list({ prefix: 'op:', reverse: true, limit: 500 })) {
        if (op.seq > this.state.seq) { this.state.seq = op.seq; this.lastOpAt = op.at; }
        if (!this.memberOpAt.has(op.by.client)) this.memberOpAt.set(op.by.client, op.at);
      }
      this.lastOpAt = Math.max(this.lastOpAt || 0, this.meta.createdAt, this.meta.unlockedAt || 0);
    }
    this.loaded = true;
  }

  registry(path, body) {
    const ns = this.env.REGISTRY;
    return ns.get(ns.idFromName('main')).fetch('https://registry' + path, body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : undefined);
  }

  activeMembers() {
    return Object.values(this.state.objects).filter(o => o.kind === 'member' && !o.deleted);
  }
  memberOf(client) { return this.activeMembers().find(m => m.client === client) || null; }
  countObjects() { return Object.values(this.state.objects).filter(o => !o.deleted && o.kind !== 'member').length; }

  stamp(op, by) {
    return { seq: this.state.seq + 1, at: this.now(), by, op: op.op, kind: op.kind, id: op.id,
      data: op.data, expectedStatus: op.expectedStatus, cid: op.cid || '' };
  }

  // Applies and remembers ops one by one; persists them with `extra` rows in one put.
  async commit(ops, extra) {
    const entries = Object.assign({}, extra || {});
    for (const op of ops) {
      entries['op:' + pad(op.seq)] = op;
      entries['obj:' + op.id] = this.state.objects[op.id];
      this.bytes += JSON.stringify(op).length;
    }
    if (Object.keys(entries).length) await this.s.put(entries);
  }

  applyAll(ops) {
    const done = [];
    for (const op of ops) {
      const fresh = this.stamp(op, op.by);
      if (R.applyOp(this.state, fresh).ok) done.push(fresh);
    }
    return done;
  }

  async newSession(client) {
    const secret = randomSecret();
    const record = { hash: await sha256(secret), epoch: this.meta.epoch };
    this.sessions.set(client, record);
    return { token: client + '.' + this.meta.epoch + '.' + secret, row: { ['sess:' + client]: record } };
  }

  async authenticate(header) {
    const parts = String(header || '').split('.');
    if (parts.length !== 3) return null;
    const [client, epoch, secret] = parts;
    const rec = this.sessions.get(client);
    if (!rec || rec.epoch !== this.meta.epoch || Number(epoch) !== this.meta.epoch) return null;
    if (!safeEqual(await sha256(secret), rec.hash)) return null;
    return this.memberOf(client);
  }

  publicMeta() {
    const m = this.meta;
    const d = R.roomDeadlines(this.policy, m.createdAt, m.extended);
    return { fork: m.fork, server: m.server, planet: m.planet, h: m.h, createdAt: m.createdAt, epoch: m.epoch,
      locked: m.locked, closed: m.closed, frozen: m.frozen, extended: m.extended, maxAt: d.maxAt, warnAt: d.warnAt,
      lastOpAt: this.lastOpAt };
  }

  presence(now) {
    const out = {};
    for (const m of this.activeMembers()) out[m.client] = this.seen.has(m.client) ? now - this.seen.get(m.client) : null;
    return out;
  }

  async schedule() {
    const m = this.meta;
    const grace = this.policy.ttl.exportGraceSec * 1000;
    const maxAt = R.roomDeadlines(this.policy, m.createdAt, m.extended).maxAt;
    let at = maxAt;
    if (m.closed) at = m.closedAt + grace;
    else if (m.locked) at = Math.min(maxAt, m.lockedAt + grace);
    await this.s.setAlarm(at);
  }

  async checkStop(now) {
    this.stopCheckedAt = now;
    const r = await (await this.registry('/stopped?keyId=' + encodeURIComponent(this.meta.keyId))).json();
    if (r.stopped && !(this.meta.frozen && this.meta.frozen.reason === 'stopped')) {
      this.meta.frozen = { at: now, reason: 'stopped' };
      await this.s.put('meta', this.meta);
    }
  }

  async lifecycle(now) {
    const m = this.meta;
    if (m.closed) return;
    if (!m.locked && R.idleLocked(this.policy, this.lastOpAt, now)) {
      m.locked = true;
      m.lockedAt = now;
      await this.s.put('meta', m);
      await this.schedule();
      return;
    }
    if (m.locked) return;
    const stale = this.activeMembers().filter(o => o.confirmed &&
      R.memberStale(this.policy, Math.max(this.memberOpAt.get(o.client) || 0, o.presentAt || 0, o.confirmedAt || 0, o.at), now));
    if (!stale.length) return;
    const ops = this.applyAll(stale.map(o => ({ op: 'del', kind: 'member', id: o.id, by: SYSTEM, cid: 'auto' })));
    for (const o of stale) this.sessions.delete(o.client);
    await this.commit(ops);
    await this.s.delete(stale.map(o => 'sess:' + o.client));
  }

  async fetch(request) {
    await this.load();
    const url = new URL(request.url);
    const path = url.pathname;
    const now = this.now();
    if (path === '/init') return this.init(await request.json(), now);
    if (!this.meta) return json(404, { error: 'room' });
    if (url.searchParams.get('code') !== this.meta.code) return json(401, { error: 'code' });
    await this.lifecycle(now);
    if (path === '/join') return this.join(await request.json(), now);

    const observer = request.headers.get('X-Room-Observer');
    let actor = null;
    let isObserver = false;
    if (observer) {
      isObserver = safeEqual(await sha256(observer), this.meta.observerHash);
      if (!isObserver) return json(401, { error: 'observer' });
    } else {
      actor = await this.authenticate(request.headers.get('X-Room-Session'));
      if (!actor) return json(401, { error: 'session' });
    }
    if (now - this.stopCheckedAt > 60000 && !this.meta.closed) await this.checkStop(now);

    if (path === '/ops' && request.method === 'GET') return this.poll(actor, url, now);
    if (path === '/snapshot') return this.snapshot(actor, url, now);
    if (path === '/export') return (isObserver || actor.confirmed) ? this.exportRoom() : json(403, { error: 'unconfirmed' });
    if (isObserver) return json(403, { error: 'observer' });
    if (path === '/ops' && request.method === 'POST') return this.write(actor, await request.json(), now);
    if (path === '/admin') return this.admin(actor, await request.json(), now);
    return json(404, { error: 'path' });
  }

  async init(b, now) {
    if (this.meta) return json(409, { error: 'exists' });
    const policy = POLICIES[b.fork];
    if (!policy) return json(400, { error: 'fork' });
    this.policy = policy;
    const codes = {};
    const sheet = [];
    for (const p of policy.posts) {
      if (p.level === 'observer') continue;
      const squads = p.perSquad ? Object.keys(policy.squads) : [null];
      for (const sq of squads) {
        for (let i = 0; i < p.max; i++) {
          let c;
          do c = R.randomCode(4, rng); while (codes[c]);
          codes[c] = { slot: p.id + ':' + (sq || '') + ':' + i, post: p.id, squad: sq, usedAt: null, client: null };
          sheet.push({ post: p.id, squad: sq, code: c });
        }
      }
    }
    const observerToken = randomSecret();
    this.meta = { name: b.name, code: b.code, fork: b.fork, server: b.server, keyId: b.keyId, planet: b.planet, h: b.h,
      createdAt: now, extended: false, locked: false, lockedAt: null, unlockedAt: null, closed: false, closedAt: null,
      frozen: null, epoch: 1, codes, observerHash: await sha256(observerToken) };
    this.lastOpAt = now;
    const c = b.creator;
    const data = { client: c.client, post: c.post, squad: null, slot: c.post + '::creator',
      callsign: R.cleanText(c.callsign, policy.limits.callsign), confirmed: true, confirmedBy: 'creator', confirmedAt: now };
    // Assets exist from the start (state unknown), so crews can claim and owners patch them.
    const seed = [{ op: 'put', kind: 'member', id: 'mem-' + c.client + '-1', data, by: byOf(c) }];
    for (const def of policy.assets) {
      for (let n = 1; n <= (def.count || 1); n++) {
        seed.push({ op: 'put', kind: 'asset', id: 'asset-' + def.type + '-' + n, by: SYSTEM,
          data: { type: def.type, n, owner: { post: def.owner }, state: null, notes: '', claimedBy: null } });
      }
    }
    const ops = this.applyAll(seed);
    const session = await this.newSession(c.client);
    await this.commit(ops, Object.assign({ meta: this.meta }, session.row));
    await this.schedule();
    this.stopCheckedAt = now;
    return json(200, { session: session.token, sheet, observerToken, epoch: 1 });
  }

  async join(b, now) {
    const m = this.meta;
    if (m.closed) return json(423, { error: 'closed' });
    if (m.locked) return json(423, { error: 'locked' });
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(String(b.client || ''))) return json(400, { error: 'client' });
    let post, squad, slot;
    const existing = this.memberOf(b.client);
    if (b.postCode) {
      const c = m.codes[String(b.postCode).toUpperCase()];
      if (!c) return json(404, { error: 'postCode' });
      if (c.client && c.client !== b.client) return json(409, { error: 'used' });
      c.usedAt = c.usedAt || now;
      c.client = b.client;
      post = c.post; squad = c.squad; slot = c.slot;
    } else {
      const def = R.postDef(this.policy, b.post);
      if (!def || def.level === 'observer') return json(400, { error: 'post' });
      squad = def.perSquad ? b.squad : null;
      if (def.perSquad && !this.policy.squads[squad]) return json(400, { error: 'squad' });
      post = def.id;
      const taken = this.activeMembers().filter(x => x.post === post && (x.squad || null) === squad && x.client !== b.client).length;
      if (taken >= def.max) return json(409, { error: 'full' });
      slot = post + ':' + (squad || '') + ':word';
    }
    // The same browser re-entering its own slot keeps its confirmation: only the session changes.
    if (existing && existing.confirmed && existing.slot === slot) {
      const session = await this.newSession(b.client);
      await this.s.put(Object.assign({ meta: m }, session.row));
      return json(200, { session: session.token, status: 'confirmed', post, squad, epoch: m.epoch });
    }
    const word = wordFor(m.fork, rng);
    const ops = [];
    if (existing) ops.push({ op: 'del', kind: 'member', id: existing.id, by: SYSTEM, cid: 'rejoin' });
    ops.push({ op: 'put', kind: 'member', id: 'mem-' + b.client + '-' + (this.state.seq + 1), by: { client: b.client, post, squad },
      data: { client: b.client, post, squad, slot, callsign: R.cleanText(b.callsign, this.policy.limits.callsign),
        confirmed: false, word, knockAt: now } });
    const done = this.applyAll(ops);
    const session = await this.newSession(b.client);
    await this.commit(done, Object.assign({ meta: m }, session.row));
    this.lastOpAt = now;
    return json(200, { session: session.token, status: 'knocking', word, post, squad, epoch: m.epoch });
  }

  async poll(actor, url, now) {
    const since = Math.max(0, parseInt(url.searchParams.get('since') || '0', 10) || 0);
    const headers = { 'Retry-After': String(R.retryAfter(this.lastRequestOpAt, now)) };
    if (actor) this.seen.set(actor.client, now);
    const base = { serverNow: now, seq: this.state.seq, meta: this.publicMeta(), presence: this.presence(now) };
    if (actor && !actor.confirmed) return json(200, Object.assign(base, { knocking: true, word: actor.word, ops: [] }), headers);
    const ops = [];
    for (const [, op] of await this.s.list({ prefix: 'op:', startAfter: 'op:' + pad(since), limit: 500 })) ops.push(op);
    return json(200, Object.assign(base, { ops, more: ops.length === 500 }), headers);
  }

  async snapshot(actor, url, now) {
    if (actor && !actor.confirmed) return json(403, { error: 'unconfirmed' });
    const cursor = url.searchParams.get('cursor') || '';
    const ids = Object.keys(this.state.objects).filter(id => !this.state.objects[id].deleted && id > cursor).sort();
    const page = ids.slice(0, 200).map(id => this.state.objects[id]);
    return json(200, { serverNow: now, seq: this.state.seq, objects: page, cursor: ids.length > 200 ? ids[199] : null, meta: this.publicMeta() });
  }

  allow(client, now) {
    const L = this.policy.limits;
    let r = this.rate.get(client);
    if (!r) { r = { sec: now, secN: 0, min: now, minN: 0 }; this.rate.set(client, r); }
    if (now - r.sec >= 1000) { r.sec = now; r.secN = 0; }
    if (now - r.min >= 60000) { r.min = now; r.minN = 0; }
    if (r.secN >= L.opsPerSec || r.minN >= L.opsPerMin) return false;
    r.secN++; r.minN++;
    return true;
  }

  sanitize(raw, actor, now) {
    const L = this.policy.limits;
    const src = raw.data && typeof raw.data === 'object' ? raw.data : {};
    const data = {};
    for (const k of Object.keys(src)) {
      if (['id', 'kind', 'seq', 'at', 'by', 'deleted'].includes(k)) continue;
      data[k] = src[k];
    }
    if (data.label !== undefined) data.label = R.cleanText(data.label, L.label);
    if (data.note !== undefined) data.note = R.cleanText(data.note, L.note);
    if (raw.kind === 'request' && raw.op === 'put') data.status = 'requested';
    if (raw.kind === 'request' && raw.op === 'patch') {
      if (data.status === 'accepted') data.acceptedBy = byOf(actor);
      if (data.status === 'firing') data.firedAt = now;
      if (data.status === 'done') data.doneAt = now;
      if (data.status === 'denied') data.deniedBy = byOf(actor);
    }
    if (raw.kind === 'marker' && raw.op === 'put' && data.cat === 'enemy' && data.relayed === undefined) data.relayed = false;
    return data;
  }

  async write(actor, body, now) {
    const m = this.meta;
    if (!actor.confirmed) return json(403, { error: 'unconfirmed' });
    if (m.closed) return json(423, { error: 'closed' });
    if (m.locked) return json(423, { error: 'locked' });
    if (m.frozen) return json(423, { error: m.frozen.reason });
    const list = body && Array.isArray(body.ops) ? body.ops.slice(0, 64) : [];
    const acks = [];
    const accepted = [];
    let extra = null;
    for (const raw of list) {
      const cid = raw && typeof raw.cid === 'string' ? raw.cid.slice(0, 40) : '';
      if (!raw || typeof raw !== 'object' || !WRITE_KINDS.includes(raw.kind) || !['put', 'patch', 'del'].includes(raw.op) ||
          typeof raw.id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(raw.id)) { acks.push({ cid, error: 'shape' }); continue; }
      if (JSON.stringify(raw).length > this.policy.limits.message) { acks.push({ cid, error: 'size' }); continue; }
      if (!this.allow(actor.client, now)) { acks.push({ cid, error: 'rate' }); continue; }
      if (this.bytes > this.policy.limits.bytes) {
        m.frozen = { at: now, reason: 'budget' };
        extra = { meta: m };
        acks.push({ cid, error: 'budget' });
        break;
      }
      const existing = this.state.objects[raw.id];
      if (existing && existing.kind !== raw.kind) { acks.push({ cid, error: 'kind' }); continue; }
      const data = this.sanitize(raw, actor, now);
      if (raw.kind === 'member') {
        const self = existing && !existing.deleted && existing.client === actor.client;
        if (raw.op !== 'patch' || !self || Object.keys(data).join() !== 'presentAt') { acks.push({ cid, error: 'right' }); continue; }
        data.presentAt = now;
      } else {
        if (raw.op === 'put') {
          const bad = R.validateData(this.policy, raw.kind, data);
          if (bad) { acks.push({ cid, error: bad }); continue; }
          if (this.countObjects() >= this.policy.limits.objects) { acks.push({ cid, error: 'objects' }); continue; }
        }
        const check = R.canWrite(this.policy, actor, { op: raw.op, kind: raw.kind, id: raw.id, data, expectedStatus: raw.expectedStatus },
          existing, { claimed: R.claimants(this.state.objects, existing) });
        if (!check.ok) { acks.push({ cid, error: check.reason }); continue; }
      }
      const op = this.stamp({ op: raw.op, kind: raw.kind, id: raw.id, data, expectedStatus: raw.expectedStatus, cid }, byOf(actor));
      const res = R.applyOp(this.state, op);
      if (!res.ok) { acks.push({ cid, error: res.reason, status: existing ? existing.status : undefined }); continue; }
      accepted.push(op);
      acks.push({ cid, seq: op.seq });
      this.memberOpAt.set(actor.client, now);
      if (op.kind === 'request') this.lastRequestOpAt = now;
    }
    if (accepted.length || extra) await this.commit(accepted, extra);
    if (accepted.length) this.lastOpAt = now;
    return json(200, { acks, serverNow: now, seq: this.state.seq });
  }

  async admin(actor, b, now) {
    const m = this.meta;
    const P = this.policy;
    if (!actor.confirmed) return json(403, { error: 'unconfirmed' });
    const staff = R.isStaff(P, actor);
    const target = b && b.client ? this.memberOf(b.client) : null;
    const ops = [];
    let metaChanged = false;
    const reply = { ok: true };
    const sessionsToDrop = [];

    switch (b && b.action) {
      case 'confirm': {
        if (!R.hasRight(P, actor, 'confirmJoin')) return json(403, { error: 'right' });
        if (!target || target.confirmed) return json(404, { error: 'member' });
        if (now - target.knockAt > P.ttl.wordSec * 1000) return json(409, { error: 'expired' });
        const knocking = this.activeMembers().filter(x => !x.confirmed).length;
        if (knocking >= 2 && b.word !== target.word) return json(409, { error: 'word' });
        ops.push({ op: 'patch', kind: 'member', id: target.id, by: byOf(actor),
          data: { confirmed: true, confirmedBy: actor.post, confirmedAt: now, word: null } });
        break;
      }
      case 'release': {
        if (!target) return json(404, { error: 'member' });
        ops.push({ op: 'del', kind: 'member', id: target.id, by: byOf(actor) });
        sessionsToDrop.push(target.client);
        break;
      }
      case 'reissue': {
        if (!target) return json(404, { error: 'member' });
        const sameSquad = target.squad && actor.squad === target.squad;
        if (!staff && !sameSquad) return json(403, { error: 'right' });
        for (const k of Object.keys(m.codes)) if (m.codes[k].slot === target.slot) delete m.codes[k];
        let c;
        do c = R.randomCode(4, rng); while (m.codes[c]);
        m.codes[c] = { slot: target.slot, post: target.post, squad: target.squad || null, usedAt: null, client: null };
        metaChanged = true;
        ops.push({ op: 'del', kind: 'member', id: target.id, by: byOf(actor) });
        sessionsToDrop.push(target.client);
        reply.postCode = c;
        break;
      }
      case 'purge': {
        if (!staff) return json(403, { error: 'right' });
        for (const o of Object.values(this.state.objects)) {
          if (!o.deleted && o.kind !== 'member' && o.by && o.by.client === b.client) ops.push({ op: 'del', kind: o.kind, id: o.id, by: byOf(actor) });
        }
        break;
      }
      case 'label': {
        if (!R.hasRight(P, actor, 'assignLabel')) return json(403, { error: 'right' });
        if (!target || !target.confirmed) return json(404, { error: 'member' });
        if (!P.functions.some(f => f.id === b.fn)) return json(400, { error: 'fn' });
        const list = (target.functions || []).slice();
        const i = list.indexOf(b.fn);
        if (i >= 0) list.splice(i, 1); else list.push(b.fn);
        ops.push({ op: 'patch', kind: 'member', id: target.id, by: byOf(actor), data: { functions: list } });
        break;
      }
      case 'unlock':
        if (!staff) return json(403, { error: 'right' });
        if (!m.locked || m.closed) return json(409, { error: 'state' });
        m.locked = false; m.lockedAt = null; m.unlockedAt = now; this.lastOpAt = now; metaChanged = true;
        break;
      case 'extend':
        if (!R.hasRight(P, actor, 'extend')) return json(403, { error: 'right' });
        if (m.extended) return json(409, { error: 'extended' });
        m.extended = true; metaChanged = true;
        break;
      case 'silence':
        if (!R.hasRight(P, actor, 'radioSilence')) return json(403, { error: 'right' });
        m.frozen = b.on ? { at: now, reason: 'silence', by: actor.post } : null; metaChanged = true;
        break;
      case 'close':
        if (!staff) return json(403, { error: 'right' });
        m.closed = true; m.closedAt = now; metaChanged = true;
        break;
      case 'observer': {
        if (!staff) return json(403, { error: 'right' });
        const token = randomSecret();
        m.observerHash = await sha256(token); metaChanged = true;
        reply.observerToken = token;
        break;
      }
      case 'rotate': {
        if (!staff) return json(403, { error: 'right' });
        let code = null;
        for (let i = 0; i < 5 && !code; i++) {
          const candidate = R.randomCode(6, rng);
          const r = await (await this.registry('/rotate', { old: m.code, code: candidate, name: m.name })).json();
          if (r.ok) code = candidate;
        }
        if (!code) return json(503, { error: 'collision' });
        m.code = code; m.epoch += 1; metaChanged = true;
        for (const x of this.activeMembers()) {
          if (x.client === actor.client) continue;
          ops.push({ op: 'del', kind: 'member', id: x.id, by: byOf(actor) });
          sessionsToDrop.push(x.client);
        }
        reply.code = code;
        break;
      }
      default:
        return json(400, { error: 'action' });
    }

    const done = this.applyAll(ops);
    const extra = metaChanged ? { meta: m } : {};
    if (b.action === 'rotate') {
      this.sessions = new Map();
      const session = await this.newSession(actor.client);
      Object.assign(extra, session.row);
      reply.session = session.token;
      sessionsToDrop.push(...[...(await this.s.list({ prefix: 'sess:' })).keys()].map(k => k.slice(5)).filter(c => c !== actor.client));
    }
    for (const c of sessionsToDrop) this.sessions.delete(c);
    await this.commit(done, extra);
    if (sessionsToDrop.length) await this.s.delete([...new Set(sessionsToDrop)].map(c => 'sess:' + c));
    if (done.length) this.lastOpAt = now;
    if (metaChanged) await this.schedule();
    return json(200, Object.assign(reply, { seq: this.state.seq, serverNow: now }));
  }

  async exportRoom() {
    const ops = [];
    for (const [, op] of await this.s.list({ prefix: 'op:' })) {
      const copy = structuredClone(op);
      if (copy.kind === 'member' && copy.data) delete copy.data.word;
      ops.push(copy);
    }
    const members = this.activeMembers().map(x => { const c = structuredClone(x); delete c.word; return c; });
    const objects = Object.values(this.state.objects).filter(o => !o.deleted && o.kind !== 'member');
    const cal = this.state.objects.calibration;
    const offset = cal && !cal.deleted ? cal.offset : null;
    const m = this.meta;
    return json(200, {
      meta: { code: m.code, fork: m.fork, server: m.server, planet: m.planet, createdAt: m.createdAt, closedAt: m.closedAt, extended: m.extended, frozen: m.frozen },
      members, objects, ops, text: chronology(ops, this.policy, offset)
    });
  }

  async alarm() {
    await this.load();
    if (!this.meta) return;
    const now = this.now();
    const m = this.meta;
    const grace = this.policy.ttl.exportGraceSec * 1000;
    const maxAt = R.roomDeadlines(this.policy, m.createdAt, m.extended).maxAt;
    if ((m.closed && now >= m.closedAt + grace) || (!m.closed && m.locked && now >= m.lockedAt + grace)) {
      await this.registry('/release', { name: m.name, code: m.code });
      await this.s.deleteAlarm();
      await this.s.deleteAll();
      this.meta = null;
      this.loaded = false;
      return;
    }
    if (!m.closed && now >= maxAt) {
      m.closed = true;
      m.closedAt = now;
      await this.s.put('meta', m);
    }
    await this.checkStop(now);
    await this.schedule();
  }
}
```

- [ ] **Step 9: Write `worker/room/router.js`**

```js
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// HTTP entry for the officers' room: CORS, sanction token, ceilings, stop links,
// code → Room object resolution with a 60 s per-isolate cache.
import '../../tactical/room-logic.js';
import POLICIES from './policies.js';
import { verifyServerToken, stopSig, safeEqual, rng } from './crypto.js';

const R = globalThis.TacticalRoomLogic;
const cache = new Map();
const CODE = '[ABCDEFGHJKMNPQRSTUVWXYZ23456789]';
const ROOM_RE = new RegExp('^/room/(' + CODE + '{6})/(join|ops|snapshot|export|admin)$');
const PASS_HEADERS = ['Content-Type', 'X-Room-Session', 'X-Room-Observer'];

export function isRoomPath(p) {
  return p === '/room' || p.startsWith('/room/') || p.startsWith('/policy/') || p === '/health' ||
    p.startsWith('/stop/') || p.startsWith('/start/');
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Room-Session, X-Room-Observer, X-Room-Key-Id',
    'Access-Control-Expose-Headers': 'Retry-After',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function reply(status, body, origin, extra) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, origin ? corsHeaders(origin) : {}, extra || {});
  return new Response(JSON.stringify(body), { status, headers });
}

function registry(env, path, body) {
  return env.REGISTRY.get(env.REGISTRY.idFromName('main')).fetch('https://registry' + path, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : undefined);
}

async function cached(key, now, load) {
  const hit = cache.get(key);
  if (hit && now - hit.t < 60000) return hit.v;
  const v = await load();
  cache.set(key, { v, t: now });
  return v;
}

async function stopLink(request, env, path) {
  const [, action, keyId, sig] = path.split('/');
  if (!keyId || !sig || !env.ROOM_STOP_SECRET || !['stop', 'start'].includes(action)) return new Response('not found', { status: 404 });
  if (!safeEqual(await stopSig(env.ROOM_STOP_SECRET, action, keyId), sig)) return new Response('forbidden', { status: 403 });
  const html = { 'Content-Type': 'text/html; charset=utf-8' };
  const label = action === 'stop' ? 'Отключить командный планшет' : 'Включить командный планшет';
  if (request.method !== 'POST') {
    return new Response('<!doctype html><meta charset="utf-8"><title>' + label + '</title>' +
      '<p>Ключ сервера: <b>' + keyId.replace(/[^A-Za-z0-9_-]/g, '') + '</b></p>' +
      '<form method="post"><button type="submit">' + label + '</button></form>', { status: 200, headers: html });
  }
  await registry(env, '/stop', { keyId, on: action === 'stop' });
  const text = action === 'stop'
    ? 'Командный планшет отключён: новые комнаты не создаются, идущие переходят в «Радиомолчание» в течение минуты.'
    : 'Командный планшет снова включён.';
  return new Response('<!doctype html><meta charset="utf-8"><p>' + text + '</p>', { status: 200, headers: html });
}

async function createRoom(request, env, origin, now) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (env.ROOM_CREATE_RL) {
    const { success } = await env.ROOM_CREATE_RL.limit({ key: ip });
    if (!success) return reply(429, { error: 'rate' }, origin);
  }
  let b;
  try { b = await request.json(); } catch { return reply(400, { error: 'bad-json' }, origin); }
  const keyId = request.headers.get('X-Room-Key-Id') || '';
  const tok = await verifyServerToken(env.ROOM_KEYS, b && b.token);
  if (!tok || tok.keyId !== keyId || !POLICIES[tok.fork]) return reply(403, { error: 'sanction' }, origin);
  const policy = POLICIES[tok.fork];
  const creator = (b && b.creator) || {};
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(String(creator.client || ''))) return reply(400, { error: 'client' }, origin);
  if (R.levelOf(policy, creator.post) !== 'staff') return reply(400, { error: 'creator' }, origin);
  if (typeof b.planet !== 'string' || !/^[a-z0-9_.-]{1,40}$/i.test(b.planet)) return reply(400, { error: 'planet' }, origin);
  const horizonMs = (policy.ttl.roomMaxSec + policy.ttl.roomExtendSec + policy.ttl.exportGraceSec) * 1000;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = R.randomCode(6, rng);
    const name = 'r-' + code + '-' + now.toString(36) + '-' + attempt;
    const res = await (await registry(env, '/reserve', {
      code, name, keyId, horizonMs,
      maxConcurrent: Number(env.ROOMS_MAX_CONCURRENT) || 6, maxDaily: Number(env.ROOMS_MAX_DAILY) || 30
    })).json();
    if (!res.ok && res.reason === 'collision') continue;
    if (!res.ok) return reply(res.reason === 'stopped' ? 403 : 429, { error: res.reason }, origin);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(name));
    const init = await stub.fetch(new Request('https://room/init', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, code, fork: tok.fork, server: tok.server, keyId, planet: b.planet, h: String(b.h || ''), creator })
    }));
    const data = await init.json();
    if (!init.ok) return reply(init.status, data, origin);
    return reply(200, Object.assign({ code, fork: tok.fork, server: tok.server }, data), origin);
  }
  return reply(503, { error: 'collision' }, origin);
}

export async function routeRoom(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path.startsWith('/stop/') || path.startsWith('/start/')) return stopLink(request, env, path);
  const origin = request.headers.get('Origin') || '';
  const allowed = allowedOrigins(env).includes(origin);
  if (request.method === 'OPTIONS') return allowed ? new Response(null, { status: 204, headers: corsHeaders(origin) }) : new Response(null, { status: 403 });
  if (!allowed) return reply(403, { error: 'origin' });
  const now = env.NOW ? env.NOW() : Date.now();

  if (path.startsWith('/policy/')) {
    const policy = POLICIES[path.slice('/policy/'.length)];
    return policy ? reply(200, policy, origin, { 'Cache-Control': 'max-age=60' }) : reply(404, { error: 'fork' }, origin);
  }
  if (path === '/health') return reply(200, await (await registry(env, '/health')).json(), origin);
  if (env.ROOMS_ENABLED !== '1') return reply(503, { error: 'disabled' }, origin);
  if (path === '/room' && request.method === 'POST') return createRoom(request, env, origin, now);

  const m = path.match(ROOM_RE);
  if (!m) return reply(404, { error: 'path' }, origin);
  if (m[2] === 'join' && env.ROOM_JOIN_RL) {
    const { success } = await env.ROOM_JOIN_RL.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
    if (!success) return reply(429, { error: 'rate' }, origin);
  }
  const name = await cached('code:' + m[1], now, async () => (await (await registry(env, '/resolve?code=' + m[1])).json()).name);
  if (!name) return reply(404, { error: 'room' }, origin);
  const headers = {};
  for (const h of PASS_HEADERS) if (request.headers.get(h)) headers[h] = request.headers.get(h);
  const params = new URLSearchParams(url.search);
  params.set('code', m[1]);
  const inner = new Request('https://room/' + m[2] + '?' + params.toString(), {
    method: request.method, headers, body: request.method === 'POST' ? await request.text() : undefined
  });
  const res = await env.ROOMS.get(env.ROOMS.idFromName(name)).fetch(inner);
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(corsHeaders(origin))) out.headers.set(k, v);
  return out;
}
```

- [ ] **Step 10: Run the Worker test**

Run: `node scripts/test_room_worker.mjs`
Expected: twenty `ok …` lines and `OK 20 cases`. Two failure modes to check first if a case fails: a Registry list-order assumption (keys must be compared with `startAfter` on zero-padded `op:` keys) and the `rotate` case, where the old-path status is 401 when the router cache still holds the old alias and 404 otherwise.

- [ ] **Step 11: Wire the router into `worker/index.js`**

At the top of `worker/index.js`, after the header comment, add:

```js
import { routeRoom, isRoomPath } from './room/router.js';
export { Room } from './room/room.js';
export { Registry } from './room/registry.js';
```

As the first statement inside `async fetch(request, env) {`, add:

```js
    if (isRoomPath(new URL(request.url).pathname)) return routeRoom(request, env);
```

Run: `node scripts/test_feedback_worker.mjs && node scripts/test_room_worker.mjs`
Expected: the feedback test prints its existing success line and the room test prints `OK 20 cases`.

- [ ] **Step 12: Update `worker/wrangler.toml`**

Replace the file with (keeps every existing line of the feedback Worker, adds the room):

```toml
# chemdb-feedback — the site's idea form and survey → GitHub issues, and the
# officers' room (Series V, docs/design/2026-09-13-tactical-tablet.md).
#
# One-time setup by the repo owner (nothing in this file is a secret):
#   1. cd worker && npx wrangler login
#   2. npx wrangler secret put GITHUB_TOKEN
#        -> paste a fine-grained PAT: this repository only, permission "Issues: Read and write"
#   3. npx wrangler secret put ROOM_KEYS
#        -> paste JSON printed by `node scripts/room_token.mjs`, e.g. {"stories-k1":"<secret>"}
#   4. npx wrangler secret put ROOM_STOP_SECRET
#        -> any long random string; stop/start links are signed with it
#   5. Workers Paid plan (5 USD/month) in the Cloudflare dashboard: the room ceilings below
#      exceed the Free plan (decision record, Owner overrides 2).
#   6. npx wrangler deploy
#        -> prints https://chemdb-feedback.<account>.workers.dev
#   7. put that URL into FEEDBACK_URL in feedback.js and ROOM_URL in tactical/room.js, bump their ?v=, commit.
# Rotate GITHUB_TOKEN by repeating step 2. Stop abuse with `npx wrangler delete`,
# by blanking ALLOWED_ORIGINS, or rooms only by setting ROOMS_ENABLED to "0" in the dashboard.
# Local run: `npx wrangler dev --port 8787 --var ALLOWED_ORIGINS:http://127.0.0.1:8090` with
# GITHUB_TOKEN, ROOM_KEYS and ROOM_STOP_SECRET in worker/.dev.vars (gitignored).

name = "chemdb-feedback"
main = "index.js"
compatibility_date = "2026-09-01"

[vars]
ALLOWED_ORIGINS = "https://mikameo.github.io"
ROOMS_ENABLED = "1"
ROOMS_MAX_CONCURRENT = "6"
ROOMS_MAX_DAILY = "30"

# 5 submissions per minute per IP (Workers Rate Limiting binding).
[[ratelimits]]
name = "RL"
namespace_id = "1001"
simple = { limit = 5, period = 60 }

# Room joins: 20 per minute per IP; room creation: 3 per minute per IP (period must be 10 or 60).
[[ratelimits]]
name = "ROOM_JOIN_RL"
namespace_id = "1002"
simple = { limit = 20, period = 60 }

[[ratelimits]]
name = "ROOM_CREATE_RL"
namespace_id = "1003"
simple = { limit = 3, period = 60 }

[[durable_objects.bindings]]
name = "ROOMS"
class_name = "Room"

[[durable_objects.bindings]]
name = "REGISTRY"
class_name = "Registry"

[exports.Room]
type = "durable-object"
storage = "sqlite"

[exports.Registry]
type = "durable-object"
storage = "sqlite"
```

Run: `cd worker && npx wrangler deploy --dry-run --outdir ../.wrangler-dry && cd ..`
Expected: the bundle builds, the output lists the `ROOMS` and `REGISTRY` Durable Object bindings and the three rate limiters, and ends with `--dry-run: exiting now.` If wrangler rejects the `[exports.*]` tables, replace both of them with the legacy form below (a Worker may use only one of the two forms) and run the dry run again:

```toml
[[migrations]]
tag = "v1"
new_sqlite_classes = ["Room", "Registry"]
```

Delete `.wrangler-dry` after the check: `rm -rf .wrangler-dry`.

- [ ] **Step 13: Local smoke run against the real runtime**

Create `worker/.dev.vars` (gitignored) with:

```
GITHUB_TOKEN=unused-locally
ROOM_KEYS={"stories-k1":"local-secret"}
ROOM_STOP_SECRET=local-stop
```

Run in one terminal: `cd worker && npx wrangler dev --port 8787 --var ALLOWED_ORIGINS:http://127.0.0.1:8090`
Run in another: `node scripts/room_token.mjs stories-k1 stories_cm "Space Stories - Marine Corps Core"` with `ROOM_KEY_SECRET=local-secret` (Step 14 writes the script), then:

```bash
curl -s -X POST http://127.0.0.1:8787/room -H "Origin: http://127.0.0.1:8090" -H "Content-Type: application/json" -H "X-Room-Key-Id: stories-k1" -d "{\"token\":\"<TOKEN>\",\"planet\":\"lv624\",\"h\":\"x\",\"creator\":{\"client\":\"client-co-0001\",\"post\":\"co\"}}"
```

Expected: JSON with `code`, `session`, `sheet` (38 entries) and `observerToken`. A second call with the returned code: `curl -s "http://127.0.0.1:8787/room/<CODE>/ops?since=0" -H "Origin: http://127.0.0.1:8090" -H "X-Room-Session: <SESSION>" -i` returns `200` with a `Retry-After: 10` header and one `member` op.

- [ ] **Step 14: Write `scripts/room_token.mjs`**

```js
// Issues a server token for the officers' room and the administration's stop/start links.
// Usage: ROOM_KEY_SECRET=... ROOM_STOP_SECRET=... WORKER_URL=https://chemdb-feedback.<acc>.workers.dev \
//        node scripts/room_token.mjs <keyId> <fork> "<server name>"
import { randomBytes } from 'node:crypto';
import { signServerToken, stopSig } from '../worker/room/crypto.js';

const [keyId, fork, server] = process.argv.slice(2);
if (!keyId || !fork || !server) {
  console.error('usage: node scripts/room_token.mjs <keyId> <fork> "<server name>"');
  process.exit(2);
}
const secret = process.env.ROOM_KEY_SECRET || randomBytes(24).toString('base64url');
const token = await signServerToken(secret, { fork, server, keyId, iat: Math.floor(Date.now() / 1000) });
const base = process.env.WORKER_URL || 'https://<worker>';
console.log('ROOM_KEYS entry (merge into the JSON secret):');
console.log(JSON.stringify({ [keyId]: secret }));
console.log('\nServer token for room creators (paste into «Ключ сервера»):');
console.log(token);
if (process.env.ROOM_STOP_SECRET) {
  console.log('\nAdministration stop link:', base + '/stop/' + keyId + '/' + await stopSig(process.env.ROOM_STOP_SECRET, 'stop', keyId));
  console.log('Administration start link:', base + '/start/' + keyId + '/' + await stopSig(process.env.ROOM_STOP_SECRET, 'start', keyId));
}
```

Run: `ROOM_KEY_SECRET=local-secret ROOM_STOP_SECRET=local-stop node scripts/room_token.mjs stories-k1 stories_cm "Space Stories - Marine Corps Core"`
Expected: the `ROOM_KEYS` entry `{"stories-k1":"local-secret"}`, a token of two base64url parts joined by a dot, and two links ending in 43-character signatures.

- [ ] **Step 15: Commit**

```bash
git add scripts/check_room_policy.py worker/room/ worker/index.js worker/wrangler.toml scripts/test_room_worker.mjs scripts/room_token.mjs
git commit -m "feat(tablet): room and registry Durable Objects with polling, codes, epoch and limits (V5)"
```

### Task 4: Room client and fixture transport (V6 core, V2 fixture)

**Files:**
- Create: `tactical/room.js`
- Create: `tactical/room-fixtures.js`
- Test: `scripts/test_room_client.js`

`room.js` holds no DOM: transports, session, storage, polling, pending ops with optimistic apply, and the `window.TacRoom` hook object that `tactical.js` attaches to (Task 5). `room-fixtures.js` is an in-browser fake of the Worker with a scripted round; the clickable mock (`tactical.html#room=demo`) and the client tests both use it. It is loaded on demand, never on a normal page load.

- [ ] **Step 1: Write the failing client test**

```js
// scripts/test_room_client.js — RoomClient against the fixture transport under Node.
// Run: node scripts/test_room_client.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const read = f => fs.readFileSync(path.join(__dirname, '..', 'tactical', f), 'utf8');
const window = { setTimeout: (fn) => 0, clearTimeout: () => {} };
new Function('window', read('room-logic.js'))(window);
new Function('window', read('room-fixtures.js'))(window);
new Function('window', read('room.js'))(window);
const policy = JSON.parse(read('policy/stories_cm.json'));
const { RoomClient, makeStorage } = window.TacRoom;
const { FixtureTransport } = window.TacRoomFixture;

function fakeLocalStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}

let clock = 1_000_000;
const now = () => clock;
const transport = new FixtureTransport(policy, { now, skew: 5000 });
const lsCo = fakeLocalStorage();
const lsSl = fakeLocalStorage();
const co = new RoomClient({ transport, storage: makeStorage(lsCo), policy, fork: 'stories_cm', planet: 'lv624', h: 'h1', now });
const sl = new RoomClient({ transport, storage: makeStorage(lsSl), policy, fork: 'stories_cm', planet: 'lv624', h: 'h1', now });

let n = 0;
async function t(name, fn) { await fn(); n++; console.log('ok', name); }

(async () => {
  await t('create: status in, confirmed creator, briefing sheet, clock offset', async () => {
    await co.createRoom({ token: 'demo', keyId: 'demo', post: 'co', callsign: 'Иванов' });
    assert.strictEqual(co.status, 'in');
    assert.strictEqual(co.me.post, 'co');
    assert.strictEqual(co.me.confirmed, true);
    assert.strictEqual(co.sheet.length, 38);
    assert.strictEqual(co.offset, 5000);
    assert.strictEqual(co.serverNow(), clock + 5000);
  });

  await t('join by post code knocks; one click confirms; the joiner moves in on the next poll', async () => {
    const slCode = co.sheet.find(s => s.post === 'sl' && s.squad === 'bravo').code;
    await sl.join({ entry: co.code + '-' + slCode, callsign: 'Петров' });
    assert.strictEqual(sl.status, 'knocking');
    assert.ok(sl.word);
    await co.poll();
    const knock = co.members().find(m => !m.confirmed);
    await co.admin('confirm', { client: knock.client });
    await sl.poll();
    assert.strictEqual(sl.status, 'in');
    assert.strictEqual(sl.me.squad, 'bravo');
  });

  await t('queue shows the op at once, the ack clears pending, the server copy replaces it', async () => {
    const p = sl.queue({ op: 'put', kind: 'marker', id: 'm1', data: { cat: 'enemy', label: 'ксено', x: 60, y: -60, layer: 'squad:bravo' } });
    assert.strictEqual(sl.visible({ kinds: ['marker'] }).length, 1, 'optimistic');
    assert.strictEqual(sl.visible({ kinds: ['marker'] })[0].pending, true);
    await p;
    assert.strictEqual(sl.pending.length, 0);
    const m = sl.visible({ kinds: ['marker'] })[0];
    assert.ok(m.seq > 0);
    assert.ok(!m.pending);
    await co.poll();
    assert.strictEqual(co.visible({ kinds: ['marker'] })[0].label, 'ксено');
  });

  await t('a refused op leaves pending and lands in rejected with its reason', async () => {
    await sl.queue({ op: 'put', kind: 'line', id: 'l1', data: { cat: 'plan', points: [[0, 0], [5, 5]], layer: 'shared' } });
    assert.strictEqual(sl.pending.length, 0);
    assert.strictEqual(sl.rejected[0].error, 'layer');
  });

  await t('pending patches never mutate the confirmed state', async () => {
    sl.pending.push({ cid: 'x1', op: 'patch', kind: 'marker', id: 'm1', data: { label: 'два ксено' } });
    assert.strictEqual(sl.visible({ kinds: ['marker'] })[0].label, 'два ксено');
    assert.strictEqual(sl.room.objects.m1.label, 'ксено');
    sl.pending = [];
  });

  await t('requests sort open first, urgent first, then by age', async () => {
    clock += 1000;
    await sl.queue({ op: 'put', kind: 'request', id: 'q1', data: { type: 'mortar', target: { x: 62, y: -62 }, priority: 'normal' } });
    clock += 1000;
    await sl.queue({ op: 'put', kind: 'request', id: 'q2', data: { type: 'ob', target: { x: 70, y: -70 }, priority: 'urgent' } });
    assert.deepStrictEqual(sl.requests().map(r => r.id), ['q2', 'q1']);
  });

  await t('restore from storage brings back code, session, objects and seq', async () => {
    const again = new RoomClient({ transport, storage: makeStorage(lsSl), policy, fork: 'stories_cm', planet: 'lv624', h: 'h1', now });
    assert.strictEqual(again.restore(sl.code), true);
    assert.strictEqual(again.room.seq, sl.room.seq);
    await again.poll();
    assert.strictEqual(again.status, 'in');
    assert.strictEqual(again.visible({ kinds: ['request'] }).length, 2);
  });

  await t('a revoked session turns into expired', async () => {
    await transport.admin(co.code, { action: 'revoke', client: sl.client }, { session: co.session });
    await sl.poll();
    assert.strictEqual(sl.status, 'expired');
  });

  await t('observer reads but cannot write', async () => {
    const obs = new RoomClient({ transport, storage: makeStorage(fakeLocalStorage()), policy, fork: 'stories_cm', planet: 'lv624', h: 'h1', now });
    await obs.observe(co.code, co.observerToken);
    assert.strictEqual(obs.status, 'observer');
    assert.ok(obs.visible({ kinds: ['marker'] }).length >= 1);
    await obs.queue({ op: 'put', kind: 'marker', id: 'o1', data: { cat: 'plan', x: 1, y: 1, layer: 'shared' } });
    assert.strictEqual(obs.pending.length, 1, 'observer never sends');
  });

  await t('the demo script plays members, a request and an asset over time', async () => {
    const demo = new FixtureTransport(policy, { now, script: window.TacRoomFixture.demoScript(policy) });
    const c = new RoomClient({ transport: demo, storage: makeStorage(fakeLocalStorage()), policy, fork: 'stories_cm', planet: 'lv624', h: 'h1', now });
    await c.createRoom({ token: 'demo', keyId: 'demo', post: 'co' });
    clock += 30000;
    await c.poll();
    assert.ok(c.members().length >= 4);
    assert.ok(c.visible({ kinds: ['request'] }).length >= 2);
    assert.ok(c.visible({ kinds: ['asset'] }).length >= 1);
  });

  console.log('OK', n, 'cases');
})().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run to verify failure**

Run: `node scripts/test_room_client.js`
Expected: `ENOENT ... tactical/room-fixtures.js`.

- [ ] **Step 3: Write `tactical/room.js`**

```js
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// This file is part of Space Station Recipes.
// See LICENSE for details.
//
// Officers' room client: transports (the Worker over HTTP, or the fixture for
// the demo), session and storage, polling with Retry-After, pending ops with
// optimistic apply, and window.TacRoom — the hook tactical.js attaches to.
// No DOM: tactical/room-ui.js renders. Tests: scripts/test_room_client.js.
(function (root) {
  'use strict';

  var R = root.TacticalRoomLogic;
  var PREFIX = 'chemdb-tactical:';
  var CLIENT_KEY = PREFIX + 'room-client';
  var ROOM_URL = '';   // set by the owner after `wrangler deploy`; empty keeps the room hidden

  function makeStorage(ls) {
    var memory = {}, ok = false;
    try { ls.setItem(PREFIX + 'probe', '1'); ls.removeItem(PREFIX + 'probe'); ok = true; } catch (e) { ok = false; }
    return {
      ok: ok,
      read: function (k) {
        if (!ok) return memory[k] === undefined ? null : memory[k];
        try { return JSON.parse(ls.getItem(k)); } catch (e) { return null; }
      },
      write: function (k, v) {
        memory[k] = v;
        if (!ok) return;
        try { ls.setItem(k, JSON.stringify(v)); } catch (e) { /* quota: the memory copy stays */ }
      },
      remove: function (k) {
        delete memory[k];
        if (!ok) return;
        try { ls.removeItem(k); } catch (e) { /* ignore */ }
      }
    };
  }

  function copy(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function assign(a, b) { for (var k in b) if (Object.prototype.hasOwnProperty.call(b, k)) a[k] = b[k]; return a; }

  // ── HTTP transport ─────────────────────────────────────────

  function HttpTransport(base, fetchFn) {
    this.base = String(base || '').replace(/\/$/, '');
    this.fetchFn = fetchFn || (root.fetch ? root.fetch.bind(root) : null);
  }
  HttpTransport.prototype.request = function (method, path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    if (opts.session) headers['X-Room-Session'] = opts.session;
    if (opts.observer) headers['X-Room-Observer'] = opts.observer;
    if (opts.keyId) headers['X-Room-Key-Id'] = opts.keyId;
    return this.fetchFn(this.base + path, { method: method, headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (res) {
        var retry = parseInt(res.headers.get('Retry-After') || '', 10);
        return res.text().then(function (text) {
          var body;
          try { body = text ? JSON.parse(text) : null; } catch (e) { body = { error: 'bad-json' }; }
          return { status: res.status, body: body, retryAfter: isFinite(retry) ? retry : null };
        });
      }, function () { return { status: 0, body: { error: 'network' }, retryAfter: null }; });
  };
  HttpTransport.prototype.create = function (body, keyId) { return this.request('POST', '/room', { body: body, keyId: keyId }); };
  HttpTransport.prototype.join = function (code, body) { return this.request('POST', '/room/' + code + '/join', { body: body }); };
  HttpTransport.prototype.poll = function (code, since, auth) { return this.request('GET', '/room/' + code + '/ops?since=' + since, auth); };
  HttpTransport.prototype.snapshot = function (code, cursor, auth) {
    return this.request('GET', '/room/' + code + '/snapshot' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''), auth);
  };
  HttpTransport.prototype.send = function (code, ops, auth) { return this.request('POST', '/room/' + code + '/ops', assign({ body: { ops: ops } }, auth)); };
  HttpTransport.prototype.admin = function (code, body, auth) { return this.request('POST', '/room/' + code + '/admin', assign({ body: body }, auth)); };
  HttpTransport.prototype.exportRoom = function (code, auth) { return this.request('GET', '/room/' + code + '/export', auth); };
  HttpTransport.prototype.getPolicy = function (fork) { return this.request('GET', '/policy/' + fork); };

  // ── client ─────────────────────────────────────────────

  var cidSeq = 0;

  function RoomClient(opts) {
    this.transport = opts.transport;
    this.store = opts.storage;
    this.policy = opts.policy;
    this.fork = opts.fork;
    this.planet = opts.planet;
    this.h = opts.h || '';
    this.clock = opts.now || function () { return Date.now(); };
    this.onUpdate = opts.onUpdate || function () {};
    this.setTimer = opts.setTimeout || (root.setTimeout ? root.setTimeout.bind(root) : function () { return 0; });
    this.clearTimer = opts.clearTimeout || (root.clearTimeout ? root.clearTimeout.bind(root) : function () {});
    this.client = opts.clientId || this.store.read(CLIENT_KEY);
    if (!this.client) {
      this.client = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      this.store.write(CLIENT_KEY, this.client);
    }
    this.running = false;
    this.timer = null;
    this.reset();
  }

  RoomClient.prototype.reset = function () {
    this.code = null;
    this.session = null;
    this.observer = null;
    this.me = null;
    this.status = 'idle';     // idle | knocking | resuming | in | observer | closed | expired | gone
    this.error = null;
    this.word = null;
    this.sheet = null;
    this.observerToken = null;
    this.room = R.createState();
    this.meta = null;
    this.presence = {};
    this.offset = 0;
    this.pending = [];
    this.rejected = [];
    this.retryAfter = 10;
    this.lastOwnOpAt = 0;
    this.flushing = false;
  };

  // Per room and per client: two officers testing in one browser never share a session.
  RoomClient.prototype.key = function (code) { return PREFIX + 'room/' + (code || this.code) + ':' + this.client; };
  RoomClient.prototype.auth = function () { return this.observer ? { observer: this.observer } : { session: this.session }; };
  RoomClient.prototype.serverNow = function () { return R.serverNowEst(this.offset, this.clock()); };

  RoomClient.prototype.persist = function () {
    if (!this.code) return;
    this.store.write(this.key(), {
      code: this.code, fork: this.fork, planet: this.planet, session: this.session, observer: this.observer,
      word: this.word, sheet: this.sheet, observerToken: this.observerToken,
      seq: this.room.seq, objects: this.room.objects, pending: this.pending
    });
  };

  RoomClient.prototype.restore = function (code) {
    var saved = this.store.read(this.key(code));
    if (!saved || saved.fork !== this.fork) return false;
    this.reset();
    this.code = saved.code;
    this.session = saved.session;
    this.observer = saved.observer || null;
    this.word = saved.word || null;
    this.sheet = saved.sheet || null;
    this.observerToken = saved.observerToken || null;
    this.room = R.createState(saved.seq || 0);
    this.room.objects = saved.objects || {};
    this.pending = saved.pending || [];
    this.status = this.observer ? 'observer' : 'resuming';
    this.me = this.findMe();
    return true;
  };

  RoomClient.prototype.fail = function (r) {
    this.error = (r.body && r.body.error) || 'http-' + r.status;
    this.onUpdate(this);
    return this;
  };

  RoomClient.prototype.createRoom = function (p) {
    var self = this;
    var body = { token: p.token, planet: this.planet, h: this.h, creator: { client: this.client, post: p.post, callsign: p.callsign || '' } };
    return this.transport.create(body, p.keyId).then(function (r) {
      if (r.status !== 200) return self.fail(r);
      self.reset();
      self.code = r.body.code;
      self.session = r.body.session;
      self.sheet = r.body.sheet;
      self.observerToken = r.body.observerToken;
      self.status = 'in';
      self.persist();
      return self.poll();
    });
  };

  RoomClient.prototype.join = function (p) {
    var self = this;
    var e = R.parseEntry(p.entry);
    if (!e) { this.error = 'entry'; this.onUpdate(this); return Promise.resolve(this); }
    var body = { client: this.client, callsign: p.callsign || '' };
    if (e.postCode) body.postCode = e.postCode;
    else { body.post = p.post; body.squad = p.squad || null; }
    return this.transport.join(e.code, body).then(function (r) {
      if (r.status !== 200) return self.fail(r);
      self.reset();
      self.code = e.code;
      self.session = r.body.session;
      self.word = r.body.word || null;
      self.status = r.body.status === 'confirmed' ? 'in' : 'knocking';
      self.persist();
      return self.poll();
    });
  };

  RoomClient.prototype.observe = function (code, token) {
    this.reset();
    this.code = code;
    this.observer = token;
    this.status = 'observer';
    this.persist();
    return this.poll();
  };

  RoomClient.prototype.poll = function () {
    var self = this;
    if (!this.code) return Promise.resolve(this);
    var sent = this.clock();
    return this.transport.poll(this.code, this.room.seq, this.auth()).then(function (r) {
      var got = self.clock();
      if (r.status === 0) {
        self.error = 'network';
        self.retryAfter = Math.min(30, Math.max(2, self.retryAfter * 2));
        self.onUpdate(self);
        return self;
      }
      if (r.status === 401) { self.status = 'expired'; self.persist(); self.onUpdate(self); return self; }
      if (r.status === 404) { self.status = 'gone'; self.onUpdate(self); return self; }
      if (r.status !== 200) return self.fail(r);
      var b = r.body;
      self.error = null;
      self.offset = R.clockOffset(sent, got, b.serverNow);
      self.meta = b.meta;
      self.presence = b.presence || {};
      self.retryAfter = r.retryAfter || 10;
      if (b.knocking) {
        self.status = 'knocking';
        self.word = b.word;
      } else {
        b.ops.forEach(function (op) { if (op.seq > self.room.seq) R.applyOp(self.room, op); });
        if (self.status === 'knocking' || self.status === 'resuming') self.status = 'in';
        if (b.more) self.retryAfter = 0;
      }
      self.me = self.findMe();
      if (b.meta && b.meta.closed && self.status === 'in') self.status = 'closed';
      self.persist();
      self.onUpdate(self);
      return self;
    });
  };

  RoomClient.prototype.queue = function (op) {
    cidSeq += 1;
    op.cid = Date.now().toString(36) + '-' + cidSeq.toString(36);
    this.pending.push(op);
    this.lastOwnOpAt = this.clock();
    this.persist();
    this.onUpdate(this);
    return this.flush();
  };

  RoomClient.prototype.flush = function () {
    var self = this;
    if (this.flushing || !this.pending.length || !this.code || this.observer || this.status !== 'in') return Promise.resolve(this);
    this.flushing = true;
    var batch = this.pending.slice(0, 64);
    var cids = batch.map(function (o) { return o.cid; });
    return this.transport.send(this.code, batch, this.auth()).then(function (r) {
      self.flushing = false;
      if (r.status === 0) { self.error = 'network'; self.onUpdate(self); return self; }
      if (r.status === 401) { self.status = 'expired'; self.persist(); self.onUpdate(self); return self; }
      if (r.status !== 200) {
        var reason = (r.body && r.body.error) || 'http-' + r.status;
        batch.forEach(function (op) { self.rejected.push({ op: op, error: reason }); });
        self.pending = R.mergePending(self.pending, cids);
        self.persist();
        return self.poll();
      }
      r.body.acks.forEach(function (a) {
        if (!a.error) return;
        var op = batch.filter(function (o) { return o.cid === a.cid; })[0];
        self.rejected.push({ op: op, error: a.error, status: a.status });
      });
      self.pending = R.mergePending(self.pending, cids);
      self.persist();
      return self.poll();
    });
  };

  RoomClient.prototype.admin = function (action, payload) {
    var self = this;
    var body = assign({ action: action }, payload || {});
    return this.transport.admin(this.code, body, this.auth()).then(function (r) {
      if (r.status === 401) { self.status = 'expired'; self.onUpdate(self); return r; }
      if (r.status !== 200) { self.fail(r); return r; }
      if (action === 'rotate' && r.body.code) {
        self.store.remove(self.key());
        self.code = r.body.code;
        self.session = r.body.session;
        self.room = R.createState();
      }
      self.persist();
      return self.poll().then(function () { return r; });
    });
  };

  RoomClient.prototype.exportRoom = function () {
    return this.transport.exportRoom(this.code, this.auth());
  };

  RoomClient.prototype.leave = function () {
    this.stopLoop();
    if (this.code) this.store.remove(this.key());
    this.reset();
    this.onUpdate(this);
  };

  RoomClient.prototype.startLoop = function () {
    var self = this;
    if (this.running) return;
    this.running = true;
    function step() {
      if (!self.running) return;
      self.flush().then(function () { return self.poll(); }).then(function () {
        if (!self.running) return;
        if (self.status === 'expired' || self.status === 'gone') { self.running = false; return; }
        self.timer = self.setTimer(step, Math.max(1, self.retryAfter) * 1000);
      });
    }
    step();
  };

  RoomClient.prototype.stopLoop = function () {
    this.running = false;
    if (this.timer) this.clearTimer(this.timer);
    this.timer = null;
  };

  // Confirmed objects plus pending ops applied on copies: what the officer sees.
  RoomClient.prototype.merged = function () {
    var objects = {}, id;
    for (id in this.room.objects) objects[id] = this.room.objects[id];
    var s = R.createState(this.room.seq);
    s.objects = objects;
    var at = this.serverNow();
    var me = this.me ? { client: this.me.client, post: this.me.post, squad: this.me.squad || null } : { client: this.client, post: null, squad: null };
    this.pending.forEach(function (op) {
      if (objects[op.id]) objects[op.id] = copy(objects[op.id]);
      var res = R.applyOp(s, { seq: s.seq + 1, at: at, by: me, op: op.op, kind: op.kind, id: op.id, data: copy(op.data || {}), expectedStatus: op.expectedStatus });
      if (res.ok && objects[op.id]) objects[op.id].pending = true;
    });
    return s;
  };

  RoomClient.prototype.visible = function (filters) {
    var f = assign({}, filters || {});
    var kinds = f.kinds;
    delete f.kinds;
    var list = R.visibleObjects(this.merged(), this.policy, this.serverNow(), f);
    return kinds ? list.filter(function (o) { return kinds.indexOf(o.kind) >= 0; }) : list.filter(function (o) { return o.kind !== 'member'; });
  };

  RoomClient.prototype.members = function () {
    var out = [], P = this.policy, id, o;
    for (id in this.room.objects) {
      o = this.room.objects[id];
      if (o.kind === 'member' && !o.deleted) out.push(o);
    }
    var order = { staff: 0, squad: 1, service: 2, observer: 3 };
    out.sort(function (a, b) {
      return (order[R.levelOf(P, a.post)] - order[R.levelOf(P, b.post)]) ||
        String(a.squad || '').localeCompare(String(b.squad || '')) || String(a.post).localeCompare(String(b.post));
    });
    return out;
  };

  RoomClient.prototype.findMe = function () {
    var c = this.client;
    return this.members().filter(function (m) { return m.client === c; })[0] || null;
  };

  RoomClient.prototype.member = function (client) {
    return this.members().filter(function (m) { return m.client === client; })[0] || null;
  };

  RoomClient.prototype.requests = function () {
    var rank = { urgent: 0, normal: 1 };
    function closed(r) { return r.status === 'done' || r.status === 'denied' ? 1 : 0; }
    return this.visible({ kinds: ['request'] }).sort(function (a, b) {
      return closed(a) - closed(b) || (rank[a.priority] === undefined ? 1 : rank[a.priority]) - (rank[b.priority] === undefined ? 1 : rank[b.priority]) || a.at - b.at;
    });
  };

  RoomClient.prototype.calibration = function () {
    var c = this.merged().objects.calibration;
    return c && !c.deleted ? c : null;
  };

  // ── hook for tactical.js ─────────────────────────────────────

  root.TacRoom = {
    ROOM_URL: ROOM_URL,
    RoomClient: RoomClient,
    HttpTransport: HttpTransport,
    makeStorage: makeStorage,
    attach: function (hooks) { if (root.TacRoomUI) root.TacRoomUI.mount(hooks, root.TacRoom); },
    notify: function (event, payload) { if (root.TacRoomUI) root.TacRoomUI.notify(event, payload); },
    consumePick: function (tile) { return !!(root.TacRoomUI && root.TacRoomUI.consumePick(tile)); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Write `tactical/room-fixtures.js`**

World tiles in the demo script come from the Series T acceptance scenario on LV-624 (calibration world `31 −78` ↔ game `243 −226`, offset `212 −148`; mortar game `232 −246` → world `20 −98`; target game `274 −210` → world `62 −62`).

```js
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// This file is part of Space Station Recipes.
// See LICENSE for details.
//
// A fake Worker for the officers' room: same transport interface as
// HttpTransport, rules from tactical/room-logic.js, and a scripted LV-624
// round for the clickable demo (tactical.html#room=demo). Loaded on demand.
(function (root) {
  'use strict';

  var R = root.TacticalRoomLogic;
  function copy(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function ok(body, retryAfter) { return Promise.resolve({ status: 200, body: body, retryAfter: retryAfter || 2 }); }
  function fail(status, error) { return Promise.resolve({ status: status, body: { error: error }, retryAfter: null }); }
  function byOf(m) { return { client: m.client, post: m.post, squad: m.squad || null }; }

  function FixtureTransport(policy, opts) {
    opts = opts || {};
    this.policy = policy;
    this.now = opts.now || function () { return Date.now(); };
    this.skew = opts.skew || 0;
    this.script = (opts.script || []).slice();
    this.state = R.createState();
    this.log = [];
    this.sessions = {};
    this.codes = {};
    this.code = null;
    this.createdAt = null;
    this.planet = null;
    this.frozen = null;
    this.locked = false;
    this.closed = false;
  }

  FixtureTransport.prototype.serverNow = function () { return this.now() + this.skew; };

  FixtureTransport.prototype.apply = function (op, by) {
    var stamped = { seq: this.state.seq + 1, at: this.serverNow(), by: by, op: op.op, kind: op.kind, id: op.id,
      data: copy(op.data || {}), expectedStatus: op.expectedStatus, cid: op.cid || '' };
    var res = R.applyOp(this.state, stamped);
    if (res.ok) this.log.push(copy(stamped));
    return res;
  };

  FixtureTransport.prototype.member = function (client) {
    for (var id in this.state.objects) {
      var o = this.state.objects[id];
      if (o.kind === 'member' && !o.deleted && o.client === client) return o;
    }
    return null;
  };

  FixtureTransport.prototype.who = function (auth) {
    if (auth && auth.observer) return auth.observer === 'demo-observer' ? { observer: true } : null;
    var client = auth && auth.session ? String(auth.session).split('.')[0] : null;
    if (!client || this.sessions[client] !== auth.session) return null;
    return this.member(client);
  };

  FixtureTransport.prototype.play = function () {
    var elapsed = this.serverNow() - this.createdAt, self = this;
    this.script = this.script.filter(function (step) {
      if (step.afterMs > elapsed) return true;
      self.apply(step.op, step.by);
      return false;
    });
  };

  FixtureTransport.prototype.meta = function () {
    var d = R.roomDeadlines(this.policy, this.createdAt, false);
    return { fork: this.policy.fork, server: 'Demo', planet: this.planet, h: '', createdAt: this.createdAt, epoch: 1,
      locked: this.locked, closed: this.closed, frozen: this.frozen, extended: false, maxAt: d.maxAt, warnAt: d.warnAt,
      lastOpAt: this.serverNow() };
  };

  FixtureTransport.prototype.create = function (body) {
    var P = this.policy, sheet = [], self = this;
    this.code = 'DEMA42';   // room codes use no O, I, 0 or 1
    this.createdAt = this.serverNow();
    this.planet = body.planet;
    P.posts.forEach(function (p) {
      if (p.level === 'observer') return;
      (p.perSquad ? Object.keys(P.squads) : [null]).forEach(function (sq) {
        for (var i = 0; i < p.max; i++) {
          var c;
          do c = R.randomCode(4); while (self.codes[c]);
          self.codes[c] = { slot: p.id + ':' + (sq || '') + ':' + i, post: p.id, squad: sq, client: null };
          sheet.push({ post: p.id, squad: sq, code: c });
        }
      }
    });
    var c = body.creator;
    this.apply({ op: 'put', kind: 'member', id: 'mem-' + c.client,
      data: { client: c.client, post: c.post, squad: null, slot: c.post + '::creator', callsign: c.callsign || '', confirmed: true, confirmedAt: this.serverNow() } },
      { client: c.client, post: c.post, squad: null });
    P.assets.forEach(function (def) {
      for (var n = 1; n <= (def.count || 1); n++) {
        self.apply({ op: 'put', kind: 'asset', id: 'asset-' + def.type + '-' + n,
          data: { type: def.type, n: n, owner: { post: def.owner }, state: null, notes: '', claimedBy: null } },
          { client: 'room', post: 'system', squad: null });
      }
    });
    this.sessions[c.client] = c.client + '.1.demo';
    return ok({ code: this.code, session: this.sessions[c.client], sheet: sheet, observerToken: 'demo-observer', epoch: 1 });
  };

  FixtureTransport.prototype.join = function (code, body) {
    if (code !== this.code) return fail(404, 'room');
    var post, squad, slot;
    if (body.postCode) {
      var e = this.codes[body.postCode];
      if (!e) return fail(404, 'postCode');
      if (e.client && e.client !== body.client) return fail(409, 'used');
      e.client = body.client;
      post = e.post; squad = e.squad; slot = e.slot;
    } else {
      post = body.post; squad = body.squad || null; slot = post + ':' + (squad || '') + ':word';
    }
    var word = this.policy.fork === 'stories_cm' ? 'ФАЗАН' : 'FALCON';
    this.apply({ op: 'put', kind: 'member', id: 'mem-' + body.client + '-' + (this.state.seq + 1),
      data: { client: body.client, post: post, squad: squad, slot: slot, callsign: body.callsign || '', confirmed: false, word: word, knockAt: this.serverNow() } },
      { client: body.client, post: post, squad: squad });
    this.sessions[body.client] = body.client + '.1.demo';
    return ok({ session: this.sessions[body.client], status: 'knocking', word: word, post: post, squad: squad, epoch: 1 });
  };

  FixtureTransport.prototype.poll = function (code, since, auth) {
    if (code !== this.code) return fail(404, 'room');
    var who = this.who(auth);
    if (!who) return fail(401, 'session');
    this.play();
    var base = { serverNow: this.serverNow(), seq: this.state.seq, meta: this.meta(), presence: {} };
    if (who.kind === 'member' && !who.confirmed) { base.knocking = true; base.word = who.word; base.ops = []; return ok(base); }
    base.ops = this.log.filter(function (op) { return op.seq > since; });
    base.more = false;
    return ok(base);
  };

  FixtureTransport.prototype.snapshot = function (code, cursor, auth) {
    var who = this.who(auth);
    if (!who) return fail(401, 'session');
    var objs = [];
    for (var id in this.state.objects) if (!this.state.objects[id].deleted) objs.push(copy(this.state.objects[id]));
    return ok({ serverNow: this.serverNow(), seq: this.state.seq, objects: objs, cursor: null, meta: this.meta() });
  };

  FixtureTransport.prototype.send = function (code, ops, auth) {
    var who = this.who(auth), self = this;
    if (!who) return fail(401, 'session');
    if (who.observer) return fail(403, 'observer');
    if (!who.confirmed) return fail(403, 'unconfirmed');
    if (this.closed) return fail(423, 'closed');
    if (this.locked) return fail(423, 'locked');
    if (this.frozen) return fail(423, this.frozen.reason);
    var acks = [];
    ops.forEach(function (raw) {
      var existing = self.state.objects[raw.id];
      var data = copy(raw.data || {});
      if (raw.kind === 'member') {
        if (!(existing && existing.client === who.client)) { acks.push({ cid: raw.cid, error: 'right' }); return; }
        data = { presentAt: self.serverNow() };
      } else {
        if (raw.op === 'put') {
          var bad = R.validateData(self.policy, raw.kind, data);
          if (bad) { acks.push({ cid: raw.cid, error: bad }); return; }
        }
        if (raw.kind === 'request' && raw.op === 'put') data.status = 'requested';
        if (raw.kind === 'request' && data.status === 'firing') data.firedAt = self.serverNow();
        if (raw.kind === 'request' && data.status === 'accepted') data.acceptedBy = byOf(who);
        if (raw.kind === 'request' && data.status === 'denied') data.deniedBy = byOf(who);
        var check = R.canWrite(self.policy, who, { op: raw.op, kind: raw.kind, id: raw.id, data: data, expectedStatus: raw.expectedStatus },
          existing, { claimed: R.claimants(self.state.objects, existing) });
        if (!check.ok) { acks.push({ cid: raw.cid, error: check.reason }); return; }
      }
      var res = self.apply({ op: raw.op, kind: raw.kind, id: raw.id, data: data, expectedStatus: raw.expectedStatus, cid: raw.cid }, byOf(who));
      acks.push(res.ok ? { cid: raw.cid, seq: self.state.seq } : { cid: raw.cid, error: res.reason, status: existing && existing.status });
    });
    return ok({ acks: acks, serverNow: this.serverNow(), seq: this.state.seq });
  };

  FixtureTransport.prototype.admin = function (code, body, auth) {
    var who = this.who(auth);
    if (!who || who.observer) return fail(401, 'session');
    var target = body.client ? this.member(body.client) : null;
    switch (body.action) {
      case 'confirm':
        if (!target || target.confirmed) return fail(404, 'member');
        this.apply({ op: 'patch', kind: 'member', id: target.id, data: { confirmed: true, confirmedBy: who.post, confirmedAt: this.serverNow(), word: null } }, byOf(who));
        return ok({ ok: true });
      case 'release':
      case 'reissue':
        if (!target) return fail(404, 'member');
        this.apply({ op: 'del', kind: 'member', id: target.id }, byOf(who));
        delete this.sessions[target.client];
        return ok(body.action === 'reissue' ? { ok: true, postCode: 'NEW4' } : { ok: true });
      case 'revoke':
        delete this.sessions[body.client];
        return ok({ ok: true });
      case 'label':
        if (!target) return fail(404, 'member');
        var list = (target.functions || []).slice(), i = list.indexOf(body.fn);
        if (i >= 0) list.splice(i, 1); else list.push(body.fn);
        this.apply({ op: 'patch', kind: 'member', id: target.id, data: { functions: list } }, byOf(who));
        return ok({ ok: true });
      case 'silence': this.frozen = body.on ? { at: this.serverNow(), reason: 'silence' } : null; return ok({ ok: true });
      case 'unlock': this.locked = false; return ok({ ok: true });
      case 'close': this.closed = true; return ok({ ok: true });
      case 'observer': return ok({ ok: true, observerToken: 'demo-observer' });
      default: return ok({ ok: true });
    }
  };

  FixtureTransport.prototype.exportRoom = function () {
    var objects = [], id;
    for (id in this.state.objects) if (!this.state.objects[id].deleted) objects.push(copy(this.state.objects[id]));
    return ok({ meta: this.meta(), members: objects.filter(function (o) { return o.kind === 'member'; }),
      objects: objects.filter(function (o) { return o.kind !== 'member'; }), ops: copy(this.log), text: '' });
  };

  FixtureTransport.prototype.getPolicy = function () { return ok(this.policy); };

  // A short LV-624 evening: three officers join, the round calibration, an enemy
  // mark, a staff plan, two requests and the dropship on a fly-by.
  function demoScript(policy) {
    var ru = policy.fork === 'stories_cm';
    var so = { client: 'demo-so-000001', post: 'so', squad: null };
    var sl = { client: 'demo-slb-00001', post: 'sl', squad: 'bravo' };
    var ot = { client: 'demo-ot-000001', post: 'ot', squad: null };
    var pilot = { client: 'demo-pilot-001', post: 'pilot', squad: null };
    function member(m, extra) {
      return { afterMs: 0, by: m, op: { op: 'put', kind: 'member', id: 'mem-' + m.client,
        data: Object.assign({ client: m.client, post: m.post, squad: m.squad, slot: m.post + ':' + (m.squad || '') + ':0', confirmed: true, confirmedAt: 0 }, extra || {}) } };
    }
    return [
      member(so, { callsign: ru ? 'Орлов' : 'Orlov' }),
      member(sl, { callsign: ru ? 'Петров' : 'Petrov' }),
      member(ot, { callsign: ru ? 'Сидоров' : 'Sidorov', functions: ['mortar'] }),
      member(pilot, { callsign: ru ? 'Кузнецов' : 'Kuznetsov' }),
      { afterMs: 3000, by: so, op: { op: 'put', kind: 'calibration', id: 'calibration', data: { offset: [212, -148] } } },
      { afterMs: 3000, by: ot, op: { op: 'put', kind: 'asset', id: 'asset-mortar-1', data: { type: 'mortar', label: ru ? 'Миномёт 1' : 'Mortar 1', tile: [20, -98], owner: { post: 'ot' }, state: 'deployed', claimedBy: ot.client, notes: '' } } },
      { afterMs: 5000, by: sl, op: { op: 'put', kind: 'marker', id: 'demo-enemy-1', data: { cat: 'enemy', label: ru ? 'Ксено ×3' : 'Xenos ×3', x: 60, y: -60, layer: 'squad:bravo', relayed: false } } },
      { afterMs: 8000, by: so, op: { op: 'put', kind: 'line', id: 'demo-plan-1', data: { cat: 'plan', label: ru ? 'Наступление' : 'Advance', points: [[30, -90], [45, -75], [58, -64]], smooth: true, layer: 'shared' } } },
      { afterMs: 10000, by: sl, op: { op: 'put', kind: 'request', id: 'demo-req-1', data: { type: 'mortar', target: { x: 62, y: -62 }, note: ru ? 'Гнездо у Nexus' : 'Nest near Nexus', priority: 'urgent', status: 'requested', flags: [] } } },
      { afterMs: 14000, by: ot, op: { op: 'patch', kind: 'request', id: 'demo-req-1', expectedStatus: 'requested', data: { status: 'accepted', acceptedBy: ot } } },
      { afterMs: 20000, by: pilot, op: { op: 'put', kind: 'asset', id: 'asset-dropship-1', data: { type: 'dropship', label: ru ? 'Десантный корабль' : 'Dropship', owner: { post: 'pilot' }, state: 'flyby', notes: '' } } },
      { afterMs: 24000, by: sl, op: { op: 'put', kind: 'request', id: 'demo-req-2', data: { type: 'supply', target: { x: 40, y: -80 }, note: ru ? 'Патроны и мед' : 'Ammo and meds', priority: 'normal', status: 'requested', flags: ['beacon'] } } }
    ];
  }

  root.TacRoomFixture = { FixtureTransport: FixtureTransport, demoScript: demoScript };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 5: Run the client test**

Run: `node scripts/test_room_client.js`
Expected: ten `ok …` lines and `OK 10 cases`.

- [ ] **Step 6: Run the logic test again (room.js reuses it)**

Run: `node scripts/test_room_logic.js && node scripts/test_room_client.js`
Expected: `OK 15 groups` then `OK 10 cases`.

- [ ] **Step 7: Commit**

```bash
git add tactical/room.js tactical/room-fixtures.js scripts/test_room_client.js
git commit -m "feat(tablet): room client with polling, pending ops and the demo fixture (V6, V2)"
```

### Task 5: Seam with Series T, room panel shell, demo mock (V7, V6 UI, V2)

**Files:**
- Create: `scripts/test_room_seam.js`
- Modify: `tactical.html` (stylesheet, toolbar toggle, four room elements, three script tags, `tactical.js?v=13` → `?v=14`)
- Modify: `tactical/tactical.js` (one helper, five `roomNotify` calls, one `consumePick` line, one `attach` block)
- Create: `tactical/room-ui.js`
- Create: `tactical/room.css`

Run `git status --short tactical.html tactical/tactical.js` first. If the parallel session has uncommitted edits in either file, stop and ask the owner for a window; this task is the only one that edits Series T files.

The seam contract (decision record, Decision 5): the room draws through the public `view.addLayer`; `MapView` never reassigns `this.layers` after construction, so a layer survives level and zoom changes; the room panel lives outside `#tacPanel`, which `renderPanel()` rewrites wholesale; `tactical.js` gains exactly one `TacRoom.attach`, five `roomNotify` calls and one `TacRoom.consumePick` line, and nothing inside `renderPanel()`.

- [ ] **Step 1: Write the guard test**

```js
// scripts/test_room_seam.js — the seam between Series T and the officers' room stays small.
// Run: node scripts/test_room_seam.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('tactical.html');
const js = read('tactical/tactical.js');
const mv = read('tactical/mapview.js');
const count = (s, needle) => s.split(needle).length - 1;

// Scripts: logic before the client, the client before the panel, all before tactical.js.
const order = ['tactical/room-logic.js', 'tactical/room.js', 'tactical/room-ui.js', 'tactical/tactical.js'];
const at = order.map(src => html.indexOf('src="' + src));
at.forEach((i, k) => assert.ok(i > 0, order[k] + ' is loaded'));
for (let k = 1; k < at.length; k++) assert.ok(at[k - 1] < at[k], order[k - 1] + ' loads before ' + order[k]);
assert.ok(html.includes('href="tactical/room.css?v='), 'room.css is linked');

// Room elements exist, and the room panel is a sibling after the empty #tacPanel.
['tacRoom', 'tacRoomToggle', 'tacRoomChips', 'tacRoomStrip', 'tacRoomShelf', 'tacRoomDraw'].forEach(id =>
  assert.strictEqual(count(html, 'id="' + id + '"'), 1, id));
const panelTag = '<aside class="tac-panel" id="tacPanel" aria-label="Tactical panel"></aside>';
assert.ok(html.includes(panelTag), '#tacPanel is untouched and empty');
assert.ok(html.indexOf('id="tacRoom"') > html.indexOf(panelTag), '#tacRoom sits after #tacPanel');

// tactical.js: one attach, one consumePick, five notifications, nothing in renderPanel.
assert.strictEqual(count(js, 'window.TacRoom.attach('), 1);
assert.strictEqual(count(js, 'window.TacRoom.consumePick(tile)'), 1);
const events = [...js.matchAll(/roomNotify\('(\w+)'/g)].map(m => m[1]).sort();
assert.deepStrictEqual(events, ['delete', 'marker', 'shape', 'shot', 'target']);
const renderPanel = js.slice(js.indexOf('function renderPanel()'), js.indexOf('function renderAll()'));
assert.ok(renderPanel.length > 0 && !/TacRoom|roomNotify/.test(renderPanel), 'renderPanel knows nothing of the room');

// MapView: layers are created once and drawn every frame — the survive-redraw contract.
assert.strictEqual((mv.match(/this\.layers\s*=/g) || []).length, 1, 'layers assigned only in the constructor');
assert.ok(/for \(var i = 0; i < this\.layers\.length; i\+\+\)/.test(mv), 'draw() walks every layer each frame');
assert.ok(/MapView\.prototype\.addLayer = function \(fn\) \{ this\.layers\.push\(fn\)/.test(mv), 'addLayer only appends');

console.log('OK seam');
```

- [ ] **Step 2: Run it to see it fail**

Run: `node scripts/test_room_seam.js`
Expected: `AssertionError [ERR_ASSERTION]: tactical/room-logic.js is loaded`.

- [ ] **Step 3: Edit `tactical.html`**

After `<link rel="stylesheet" href="tactical/tactical.css?v=8">` add:

```html
<link rel="stylesheet" href="tactical/room.css?v=1">
```

Replace

```html
      <button type="button" class="btn-small" id="tacFit">Fit</button>
    </div>
```

with

```html
      <button type="button" class="btn-small" id="tacFit">Fit</button>
      <button type="button" class="btn-small tac-hide" id="tacRoomToggle" aria-pressed="false">Room</button>
    </div>
```

Replace

```html
      <div id="tacStatus" class="tac-status tac-hide" role="status" aria-live="polite"></div>
    </div>
  </section>
  <aside class="tac-panel" id="tacPanel" aria-label="Tactical panel"></aside>
</main>
```

with

```html
      <div id="tacStatus" class="tac-status tac-hide" role="status" aria-live="polite"></div>
      <canvas id="tacRoomDraw" class="tac-room-draw" aria-hidden="true"></canvas>
      <div id="tacRoomChips" class="tac-room-chips tac-hide"></div>
      <div id="tacRoomShelf" class="tac-room-shelf tac-hide"></div>
    </div>
    <div id="tacRoomStrip" class="tac-room-strip tac-hide" aria-label="Requests"></div>
  </section>
  <aside class="tac-panel" id="tacPanel" aria-label="Tactical panel"></aside>
  <aside class="tac-panel tac-room-panel tac-hide" id="tacRoom" aria-label="Officers' room"></aside>
</main>
```

Replace

```html
<script src="tactical/mapview.js?v=1" defer></script>
<script src="tactical/tactical.js?v=13" defer></script>
```

with

```html
<script src="tactical/mapview.js?v=1" defer></script>
<script src="tactical/room-logic.js?v=1" defer></script>
<script src="tactical/room.js?v=1" defer></script>
<script src="tactical/room-ui.js?v=1" defer></script>
<script src="tactical/tactical.js?v=14" defer></script>
```

- [ ] **Step 4: Edit `tactical/tactical.js`**

Each edit anchors on unique text; line numbers in comments are from HEAD `36bb6c5` and may drift.

(a) Before the line `  // Events carry the fork and planet only — never coordinates or marker text.` (after `function track`, ~line 480) insert:

```js
  // Officers' room (tactical/room*.js): tells the room what the officer did here.
  function roomNotify(event, payload) {
    if (window.TacRoom) window.TacRoom.notify(event, payload);
  }

```

(b) In `setTarget` replace

```js
    state.store.target = tile.slice();
    state.findMessage = null;
    saveStore();
```

with

```js
    state.store.target = tile.slice();
    state.findMessage = null;
    saveStore();
    roomNotify('target', tile.slice());
```

(c) In the `itemDelete` action replace

```js
    itemDelete: function (btn) {
      var id = btn.getAttribute('data-id');
```

with

```js
    itemDelete: function (btn) {
      var id = btn.getAttribute('data-id');
      roomNotify('delete', id);
```

(d) In `addMarker` replace

```js
    markers().push({ id: newId('m'), cat: d.cat, label: Logic.cleanLabel(d.label), x: tile[0], y: tile[1], h: state.meta.h, at: now() });
```

with

```js
    markers().push({ id: newId('m'), cat: d.cat, label: Logic.cleanLabel(d.label), x: tile[0], y: tile[1], h: state.meta.h, at: now() });
    roomNotify('marker', markers()[markers().length - 1]);
```

(e) In `finishShape` replace

```js
    shapes().push({ id: newId('s'), kind: s.kind, cat: s.cat, label: Logic.cleanLabel(s.label), points: s.points, h: state.meta.h, at: now() });
```

with

```js
    shapes().push({ id: newId('s'), kind: s.kind, cat: s.cat, label: Logic.cleanLabel(s.label), points: s.points, h: state.meta.h, at: now() });
    roomNotify('shape', shapes()[shapes().length - 1]);
```

(f) In `recordShot` replace

```js
    state.pickMode = null;
    saveStore();
    trackPlanet('tactical_shot');
```

with

```js
    state.pickMode = null;
    saveStore();
    roomNotify('shot', lastShot());
    trackPlanet('tactical_shot');
```

(g) In `pick` replace

```js
  function pick(tile, sx, sy, fromPointer) {
    if (!state.planet) return;
```

with

```js
  function pick(tile, sx, sy, fromPointer) {
    if (!state.planet) return;
    if (window.TacRoom && window.TacRoom.consumePick(tile)) return;
```

(h) Replace the last three lines of the file

```js
  applyStaticText();
  loadIndex();
})();
```

with

```js
  if (window.TacRoom) {
    window.TacRoom.attach({
      view: view,
      getContext: function () {
        return {
          fork: state.fork, meta: state.meta, level: state.level, planet: state.planet,
          calibration: calibration(), mortar: mortar(), shell: currentShell(), hitRadius: hitRadius(), lang: LANG
        };
      },
      takeTarget: function (tile) {
        if (weapon() !== 'mortar') { state.prefs.weapon = 'mortar'; savePrefs(); }
        setTarget(tile);
      },
      fire: function (targetGame, dial) { recordShot(targetGame, dial); return lastShot(); },
      redraw: function () { renderAll(); }
    });
  }

  applyStaticText();
  loadIndex();
})();
```

Run: `node scripts/test_room_seam.js`
Expected: `OK seam` (the guard reads strings only, so it passes before `room-ui.js` exists; the page itself needs Step 5). Then run the Series T suite to prove nothing moved: `node scripts/test_tactical_logic.js` — expected its existing success line.

- [ ] **Step 5: Write `tactical/room-ui.js`**

```js
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// This file is part of Space Station Recipes.
// See LICENSE for details.
//
// Officers' room panel shell: entry, knock, roster, staff controls, banners,
// chips, strip and shelf scaffolding, pick mode. Feature modules register
// themselves (tactical/room-draw.js, tactical/room-requests.js) with tabs,
// tools, chips, strip cards, map drawing and actions.
// Contract: docs/design/2026-09-13-tactical-tablet.md.
(function (root) {
  'use strict';

  var R = root.TacticalRoomLogic;
  var LANG = root.I18N_LANG === 'ru' ? 'ru' : 'en';
  var PREFIX = 'chemdb-tactical:';
  var CURRENT_KEY = PREFIX + 'room-current';
  var DEV_KEY = PREFIX + 'room-dev';
  var SITE = 'https://mikameo.github.io/space-station-recipes/tactical.html';
  var YM = 108585248;

  var L10N = {
    en: {
      toggleRoom: 'Room', toggleFire: 'Fire',
      entryTitle: 'Join a room', entryLabel: 'Code from the briefing sheet', entryHint: 'K7M4Q2 or K7M4Q2-SL4B',
      callsign: 'Callsign (optional)', post: 'Post', squad: 'Squad', join: 'Join',
      createTitle: 'Create a room (staff)', serverKey: 'Server key', createPost: 'Your post', create: 'Create',
      demoCreate: 'Create a demo room', demoNote: 'Demo: the room lives in this tab only; the other officers are scripted.',
      knockTitle: 'Waiting for confirmation',
      knockText: 'Say this word on the radio. Any officer already in the room confirms you. The word lasts 5 minutes.',
      cancel: 'Cancel', leave: 'Leave', leaveAsk: 'Leave for sure?', observerBadge: 'Observer',
      tabs: { roster: 'Roster' }, shelf: 'Roster {n}', knockBadge: 'knock {n}',
      confirm: 'Confirm', gone: 'Dropped', goneAsk: 'Drop for sure?', claim: 'Take over', knocking: 'waiting', wordsAsk: 'Word heard:',
      sheet: 'Briefing sheet', sheetAll: 'Whole sheet', sheetHead: 'Command tablet',
      sheetHint: 'Enter the post code as one line: ROOM-CODE.', roomCode: 'Room', copy: 'Copy', copied: 'Copied',
      observerLink: 'Moderator link', rotate: 'Change code', rotateAsk: 'Every session ends. Change?', rotated: 'New room code: {code}. Tell it on the radio.',
      silenceOn: 'Radio silence', silenceOff: 'End radio silence', extend: 'Extend by an hour',
      close: 'Close the room', closeAsk: 'Close for sure?', exportLog: 'Download log', continueRound: 'Continue this round',
      present: 'I am here', presentAsk: 'No actions from you for 8 minutes: the room drops you at 10.',
      newCode: 'New post code: {code}', pickHint: '{hint} · Esc cancels',
      levelNames: { staff: 'Staff', squad: 'Squads', service: 'Services', observer: 'Observers' },
      banners: {
        silence: 'Radio silence (staff). Data frozen since {t}.',
        stopped: 'The administration switched the tablet off. Data frozen since {t}.',
        budget: 'Room limit reached. Data frozen since {t}.',
        locked: 'Room locked after 8 minutes without actions. New round?',
        closed: 'The room is closed. The log is available for an hour.',
        expired: 'Your session ended: the code changed or you were dropped.',
        gone: 'This room no longer exists.', network: 'No connection, retrying…',
        warn: 'The room closes at {t}.', planet: 'The room is on {planet}. Pick that planet to see its objects.',
        storage: 'Browser storage is off: the room forgets you on reload.'
      },
      errors: {
        entry: 'Check the code: letters and digits from the sheet, one dash.', sanction: 'The server key does not fit this fork.',
        stopped: 'The administration switched the tablet off.', ceiling: 'Too many rooms right now. Try later.',
        daily: 'Daily room limit reached.', used: 'This post code is used. Ask for a new one.', full: 'All seats of this post are taken.',
        postCode: 'Unknown post code.', room: 'No room with this code.', locked: 'The room is locked.', closed: 'The room is closed.',
        silence: 'Radio silence.', budget: 'Room limit reached.', word: 'Wrong word.', expired: 'The word expired: they must join again.',
        rate: 'Too fast, wait a second.', layer: 'You cannot draw on that layer.', right: 'Your post cannot do that.',
        status: 'Someone changed it first.', transition: 'Not possible in this state.', network: 'No connection.',
        unconfirmed: 'Wait for confirmation.', creator: 'Only staff posts create rooms.', disabled: 'Rooms are switched off.',
        fallback: 'Error: {code}'
      }
    },
    ru: {
      toggleRoom: 'Комната', toggleFire: 'Огонь',
      entryTitle: 'Войти в комнату', entryLabel: 'Код с листа брифинга', entryHint: 'K7M4Q2 или K7M4Q2-SL4B',
      callsign: 'Позывной (необязательно)', post: 'Должность', squad: 'Отряд', join: 'Войти',
      createTitle: 'Создать комнату (штаб)', serverKey: 'Ключ сервера', createPost: 'Ваша должность', create: 'Создать',
      demoCreate: 'Создать демо-комнату', demoNote: 'Демо: комната живёт только в этой вкладке, остальные офицеры сыграны сценарием.',
      knockTitle: 'Ждём подтверждения',
      knockText: 'Назовите это слово по рации. Подтвердит любой офицер, который уже в комнате. Слово действует 5 минут.',
      cancel: 'Отменить', leave: 'Выйти', leaveAsk: 'Точно выйти?', observerBadge: 'Наблюдатель',
      tabs: { roster: 'Реестр' }, shelf: 'Реестр {n}', knockBadge: 'стук {n}',
      confirm: 'Подтвердить', gone: 'Выбыл', goneAsk: 'Точно выбыл?', claim: 'Занять', knocking: 'ждёт', wordsAsk: 'Услышанное слово:',
      sheet: 'Лист брифинга', sheetAll: 'Весь лист', sheetHead: 'Командный планшет',
      sheetHint: 'Код должности вводится одной строкой: КОМНАТА-КОД.', roomCode: 'Комната', copy: 'Копировать', copied: 'Скопировано',
      observerLink: 'Ссылка для модератора', rotate: 'Сменить код', rotateAsk: 'Все сессии закроются. Сменить?', rotated: 'Новый код комнаты: {code}. Передайте по рации.',
      silenceOn: 'Радиомолчание', silenceOff: 'Снять радиомолчание', extend: 'Продлить на час',
      close: 'Закрыть комнату', closeAsk: 'Точно закрыть?', exportLog: 'Скачать журнал', continueRound: 'Продолжить раунд',
      present: 'На месте', presentAsk: 'От вас 8 минут нет действий: через 10 комната снимет вас с должности.',
      newCode: 'Новый код должности: {code}', pickHint: '{hint} · Esc — отмена',
      levelNames: { staff: 'Штаб', squad: 'Отряды', service: 'Службы', observer: 'Наблюдатели' },
      banners: {
        silence: 'Радиомолчание (штаб). Данные заморожены с {t}.',
        stopped: 'Администрация отключила планшет. Данные заморожены с {t}.',
        budget: 'Лимит комнаты исчерпан. Данные заморожены с {t}.',
        locked: 'Комната заблокирована: 8 минут без действий. Новый раунд?',
        closed: 'Комната закрыта. Журнал доступен ещё час.',
        expired: 'Сессия закрыта: код сменили или вас сняли с должности.',
        gone: 'Этой комнаты больше нет.', network: 'Нет связи, повторяем…',
        warn: 'Комната закроется в {t}.', planet: 'Комната на планете {planet}. Выберите её, чтобы видеть объекты.',
        storage: 'Хранилище браузера выключено: после перезагрузки комната вас не узнает.'
      },
      errors: {
        entry: 'Проверьте код: буквы и цифры с листа, одно тире.', sanction: 'Ключ сервера не подходит к этому форку.',
        stopped: 'Администрация отключила планшет.', ceiling: 'Сейчас слишком много комнат. Попробуйте позже.',
        daily: 'Суточный лимит комнат исчерпан.', used: 'Этот код должности уже использован. Попросите новый.', full: 'Все места этой должности заняты.',
        postCode: 'Неизвестный код должности.', room: 'Комнаты с таким кодом нет.', locked: 'Комната заблокирована.', closed: 'Комната закрыта.',
        silence: 'Радиомолчание.', budget: 'Лимит комнаты исчерпан.', word: 'Не то слово.', expired: 'Слово истекло: пусть войдёт заново.',
        rate: 'Слишком быстро, подождите секунду.', layer: 'На этом слое вам рисовать нельзя.', right: 'Ваша должность этого не может.',
        status: 'Кто-то изменил это раньше вас.', transition: 'В этом состоянии так нельзя.', network: 'Нет связи.',
        unconfirmed: 'Дождитесь подтверждения.', creator: 'Комнату создаёт только штаб.', disabled: 'Комнаты выключены.',
        fallback: 'Ошибка: {code}'
      }
    }
  };
  var DECOYS = { ru: ['МАЯК', 'КЕДР', 'ШТОРМ', 'ИРИС'], en: ['BEACON', 'CEDAR', 'STORM', 'IRIS'] };

  var T = L10N[LANG];
  var modules = [];
  var ui = {
    hooks: null, root: null, els: {}, storage: null, policies: {}, policy: null, client: null,
    forkKey: null, planetId: null, on: false, tab: null, shelf: false, pick: null, demo: false,
    pendingHash: {}, drafts: {}, confirming: null, sheetSquad: '', renderQueued: false,
    prevStatus: null, lastError: null, narrow: false, fixtureReady: null, toastEl: null, toastTimer: 0
  };

  // ── helpers ─────────────────────────────────────────────

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmt(template, vars) {
    return String(template).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] !== undefined ? vars[k] : m; });
  }
  function attrs(data) {
    var out = '';
    for (var k in data) if (Object.prototype.hasOwnProperty.call(data, k)) out += ' data-' + k + '="' + esc(data[k]) + '"';
    return out;
  }
  function btn(action, label, data, cls) {
    return '<button type="button" class="btn-small tac-room-btn' + (cls ? ' ' + cls : '') + '" data-room-action="' + action + '"' + attrs(data || {}) + '>' + esc(label) + '</button>';
  }
  function banner(text, kind, actions) {
    return '<div class="tac-banner tac-room-banner' + (kind ? ' ' + kind : '') + '"><p>' + esc(text) + '</p>' + (actions || '') + '</div>';
  }
  function track(goal) {
    try { if (typeof root.ym === 'function') root.ym(YM, 'reachGoal', goal, { fork: ui.forkKey }); } catch (e) { /* never break */ }
  }
  function hhmm(serverMs) {
    var d = new Date(serverMs - (ui.client ? ui.client.offset : 0));
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  function mmss(seconds) {
    var s = Math.max(0, Math.ceil(seconds));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }
  function postName(id) {
    var d = ui.policy ? R.postDef(ui.policy, id) : null;
    return d ? (LANG === 'ru' ? d.nameRu : d.nameEn) : id;
  }
  function squadName(id) {
    var s = ui.policy && ui.policy.squads[id];
    return s ? (LANG === 'ru' ? s.nameRu : s.nameEn) : (id || '');
  }
  function fnName(id) {
    var f = ui.policy && ui.policy.functions.filter(function (x) { return x.id === id; })[0];
    return f ? f.nameRu : id;
  }
  function planetName(id) {
    var ctx = ui.hooks ? ui.hooks.getContext() : null;
    var p = ctx && ctx.fork ? ctx.fork.planets.filter(function (x) { return x.id === id; })[0] : null;
    return p ? p.name : (id || '');
  }
  function errorText(code) { return T.errors[code] || fmt(T.errors.fallback, { code: code }); }
  function offset() {
    var c = ui.client && ui.client.calibration();
    if (c) return c.offset;
    var ctx = ui.hooks.getContext();
    return ctx.calibration ? ctx.calibration.offset : null;
  }
  function gameText(x, y) {
    var o = offset();
    return o ? (x + o[0]) + ' ' + (y + o[1]) : x + ' ' + y + (LANG === 'ru' ? ' (мир)' : ' (world)');
  }
  function toWorld(gx, gy) {
    var o = offset();
    return o ? [gx - o[0], gy - o[1]] : null;
  }
  function me() { return ui.client ? ui.client.me : null; }
  function can(right, obj) { var m = me(); return !!(m && m.confirmed && ui.policy && R.hasRight(ui.policy, m, right, obj)); }
  function isStaff() { var m = me(); return !!(m && m.confirmed && R.isStaff(ui.policy, m)); }
  function myLayer() {
    var m = me();
    if (!m) return null;
    var level = R.levelOf(ui.policy, m.post);
    return level === 'staff' ? 'shared' : level === 'squad' ? 'squad:' + m.squad : level === 'service' ? 'service' : null;
  }
  function draft(form, name, fallback) {
    var k = form + '.' + name;
    return ui.drafts[k] === undefined ? fallback : ui.drafts[k];
  }
  function clearDrafts(form) {
    Object.keys(ui.drafts).forEach(function (k) { if (k.indexOf(form + '.') === 0) delete ui.drafts[k]; });
  }
  function copyText(text) {
    if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
      return root.navigator.clipboard.writeText(text).then(function () { toast(T.copied); }, function () { fallbackCopy(text); });
    }
    fallbackCopy(text);
    return Promise.resolve();
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast(T.copied); } catch (e) { /* the text stays selectable in the sheet */ }
    ta.remove();
  }
  function download(name, text, type) {
    var blob = new Blob([text], { type: type || 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }
  function toast(text) {
    if (!ui.toastEl) return;
    ui.toastEl.textContent = text;
    ui.toastEl.classList.remove('tac-hide');
    clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(function () { ui.toastEl.classList.add('tac-hide'); }, 3500);
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  function parseHash(hash) {
    var room = /[#&]room=([A-Za-z0-9]+)/.exec(hash || '');
    var observe = /[#&]observe=([A-Za-z0-9]+\.[A-Za-z0-9_-]+)/.exec(hash || '');
    var client = /[#&]client=([A-Za-z0-9_-]{8,40})/.exec(hash || '');   // dev only: a second officer in the same browser
    return { room: room ? room[1] : null, observe: observe ? observe[1] : null, client: client ? client[1] : null };
  }

  // ── pick mode ────────────────────────────────────────────

  function setPick(mode, handler, hint, keep, onCancel) {
    ui.pick = { mode: mode, handler: handler, keep: !!keep, onCancel: onCancel || null };
    document.body.classList.add('tac-room-picking');
    if (hint) toast(fmt(T.pickHint, { hint: hint }));
    queueRender();
  }
  function cancelPick() {
    if (!ui.pick) return;
    var p = ui.pick;
    ui.pick = null;
    document.body.classList.remove('tac-room-picking');
    if (p.onCancel) p.onCancel();
    queueRender();
  }
  function consumePick(tile) {
    if (!ui.on || !ui.pick) return false;
    var p = ui.pick;
    if (!p.keep) cancelPick();
    p.handler(tile);
    return true;
  }

  // ── availability and client ────────────────────────────────────

  function devFlags() { return ui.storage.read(DEV_KEY); }
  function roomUrl() {
    var d = devFlags();
    return (d && d.url) || (ui.root && ui.root.ROOM_URL) || '';
  }
  function available(policy) {
    if (ui.demo) return !!policy;
    if (!policy || !roomUrl()) return false;
    return !!devFlags() || policy.sanction.some(function (s) { return s.status !== 'none'; });
  }
  function loadPolicy(forkKey) {
    if (ui.policies[forkKey] !== undefined) return Promise.resolve(ui.policies[forkKey]);
    var url = ui.demo ? 'tactical/policy/' + forkKey + '.json?v=1' : roomUrl() ? roomUrl() + '/policy/' + forkKey : null;
    if (!url) { ui.policies[forkKey] = null; return Promise.resolve(null); }
    return root.fetch(url).then(function (r) { return r.ok ? r.json() : null; }, function () { return null; })
      .then(function (p) { ui.policies[forkKey] = p; return p; });
  }
  function ensureClient() {
    var ctx = ui.hooks.getContext();
    var transport = ui.demo
      ? new root.TacRoomFixture.FixtureTransport(ui.policy, { script: root.TacRoomFixture.demoScript(ui.policy) })
      : new ui.root.HttpTransport(roomUrl());
    ui.client = new ui.root.RoomClient({
      transport: transport, storage: ui.storage, policy: ui.policy, fork: ctx.fork.key,
      clientId: devFlags() && ui.clientHash ? ui.clientHash : undefined,
      planet: ctx.meta ? ctx.meta.id : null, h: ctx.meta ? ctx.meta.h : '', onUpdate: onClientUpdate
    });
  }
  function onClientUpdate(c) {
    if (c.status === 'in' && ui.prevStatus === 'knocking') track('room_confirm');
    ui.prevStatus = c.status;
    while (c.rejected.length) { var r = c.rejected.shift(); toast(errorText(r.error)); }
    if (c.error && c.error !== ui.lastError && c.error !== 'network') toast(errorText(c.error));
    ui.lastError = c.error;
    if (c.code && (c.status === 'in' || c.status === 'knocking' || c.status === 'observer')) {
      ui.storage.write(CURRENT_KEY + ':' + c.client, { fork: c.fork, code: c.code });
    }
    queueRender();
  }
  function switchFork(key) {
    ui.forkKey = key;
    if (ui.client) ui.client.stopLoop();
    ui.client = null;
    ui.policy = null;
    ui.fixtureReady.then(function () { return loadPolicy(key); }).then(function (policy) {
      if (ui.forkKey !== key) return;
      ui.policy = policy;
      var show = available(policy);
      ui.els.toggle.classList.toggle('tac-hide', !show);
      if (!show) { setOn(false); return; }
      ensureClient();
      var h = ui.pendingHash;
      ui.pendingHash = {};
      if (h.observe) {
        var parts = h.observe.split('.');
        ui.client.observe(parts[0], parts[1]).then(function () { ui.client.startLoop(); });
        setOn(true);
      } else {
        var cur = ui.storage.read(CURRENT_KEY + ':' + ui.client.client);
        if (!ui.demo && cur && cur.fork === key && ui.client.restore(cur.code)) ui.client.startLoop();
        if (h.room || ui.demo) { ui.drafts['join.entry'] = h.room && h.room !== 'demo' ? h.room : ''; setOn(true); }
      }
      queueRender();
    });
  }

  // ── rendering ────────────────────────────────────────────

  function queueRender() {
    if (ui.renderQueued) return;
    ui.renderQueued = true;
    (root.requestAnimationFrame || function (f) { return setTimeout(f, 16); })(render);
  }

  function collect(part) {
    return modules.map(function (m) { return m[part] ? m[part](api) : ''; }).join('');
  }

  function tabs() {
    var list = [{ id: 'roster', label: T.tabs.roster, narrow: false }];
    modules.forEach(function (m) { if (m.tabs) list = list.concat(m.tabs(api)); });
    var narrow = list.filter(function (t) { return t.narrow; });
    return ui.narrow && narrow.length ? narrow : list;
  }

  function tabPanel(id) {
    if (id === 'roster') return rosterHtml();
    for (var i = 0; i < modules.length; i++) {
      var m = modules[i];
      if (m.tabs && m.tabs(api).some(function (t) { return t.id === id; })) return m.panel(id, api);
    }
    return '';
  }

  function inRoom() {
    return !!(ui.client && ['in', 'observer', 'closed'].indexOf(ui.client.status) >= 0);
  }

  function render() {
    ui.renderQueued = false;
    if (!ui.els.panel) return;
    var room = ui.on && inRoom();
    ui.els.chips.classList.toggle('tac-hide', !room);
    ui.els.strip.classList.toggle('tac-hide', !room);
    ui.els.shelf.classList.toggle('tac-hide', !(room && ui.shelf && ui.narrow));
    if (!ui.on) return;
    var focus = captureFocus(ui.els.panel);
    ui.els.panel.innerHTML = panelHtml(room);
    restoreFocus(ui.els.panel, focus);
    if (room) {
      ui.els.chips.innerHTML = chipsHtml();
      ui.els.strip.innerHTML = collect('strip');
      if (ui.shelf && ui.narrow) ui.els.shelf.innerHTML = shelfHtml();
    }
    updateCountdowns();
    ui.hooks.view.requestDraw();
  }

  function panelHtml(room) {
    if (!ui.policy || !ui.client) return '';
    var c = ui.client;
    if (!room) {
      var top = '';
      if (c.status === 'expired') top = banner(T.banners.expired, 'warn');
      if (c.status === 'gone') top = banner(T.banners.gone, 'warn');
      if (!ui.storage.ok) top += banner(T.banners.storage);
      return top + (c.status === 'knocking' ? knockHtml() : homeHtml());
    }
    var list = tabs();
    if (!ui.tab || !list.some(function (t) { return t.id === ui.tab; })) {
      ui.tab = list.some(function (t) { return t.id === 'requests'; }) ? 'requests' : list[0].id;
    }
    return bannersHtml() + headHtml() +
      (c.status === 'in' ? '<div class="tac-room-tools">' + collect('tools') + '</div>' : '') +
      '<div class="tac-room-tabs" role="tablist">' + list.map(function (t) {
        return '<button type="button" role="tab" class="tac-seg' + (t.id === ui.tab ? ' on' : '') + '" aria-selected="' + (t.id === ui.tab) + '" data-room-action="tab" data-tab="' + t.id + '">' + esc(t.label) + '</button>';
      }).join('') + '</div>' +
      '<div class="tac-room-tab">' + tabPanel(ui.tab) + '</div>';
  }

  function selectHtml(form, name, label, options, value) {
    return '<label class="tac-input-label">' + esc(label) + '<select class="tac-select" name="' + name + '">' +
      options.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === value ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') +
      '</select></label>';
  }

  function homeHtml() {
    var P = ui.policy, c = ui.client;
    var entry = draft('join', 'entry', '');
    var posts = P.posts.filter(function (p) { return p.level !== 'observer'; }).map(function (p) { return [p.id, postName(p.id)]; });
    var staff = P.posts.filter(function (p) { return p.level === 'staff'; }).map(function (p) { return [p.id, postName(p.id)]; });
    var squads = Object.keys(P.squads).map(function (s) { return [s, squadName(s)]; });
    var withPost = entry.indexOf('-') >= 0;
    var error = c.error && c.error !== 'network' ? '<p class="tac-msg error">' + esc(errorText(c.error)) + '</p>' : '';
    return '<section class="tac-section"><h2>' + esc(T.entryTitle) + '</h2>' +
      '<form data-room-form="join" class="tac-room-form">' +
      '<label class="tac-input-label">' + esc(T.entryLabel) +
      '<input class="tac-input tac-room-code" name="entry" autocomplete="off" spellcheck="false" value="' + esc(entry) + '" placeholder="' + esc(T.entryHint) + '"></label>' +
      '<div class="tac-room-postpick' + (withPost ? ' tac-hide' : '') + '">' +
      selectHtml('join', 'post', T.post, posts, draft('join', 'post', 'sl')) +
      selectHtml('join', 'squad', T.squad, squads, draft('join', 'squad', squads[0][0])) + '</div>' +
      '<label class="tac-input-label">' + esc(T.callsign) + '<input class="tac-input" name="callsign" maxlength="' + P.limits.callsign + '" value="' + esc(draft('join', 'callsign', '')) + '"></label>' +
      '<button type="submit" class="btn-small tac-room-btn">' + esc(T.join) + '</button>' + error +
      '</form></section>' +
      '<section class="tac-section"><details' + (ui.demo ? ' open' : '') + '><summary>' + esc(T.createTitle) + '</summary>' +
      '<form data-room-form="create" class="tac-room-form">' +
      (ui.demo ? '<p class="tac-muted">' + esc(T.demoNote) + '</p>'
        : '<label class="tac-input-label">' + esc(T.serverKey) + '<input class="tac-input" name="token" autocomplete="off" spellcheck="false" value="' +
          esc(draft('create', 'token', ui.storage.read(PREFIX + 'room-key:' + ui.forkKey) || '')) + '"></label>') +
      selectHtml('create', 'post', T.createPost, staff, draft('create', 'post', 'co')) +
      '<label class="tac-input-label">' + esc(T.callsign) + '<input class="tac-input" name="callsign" maxlength="' + P.limits.callsign + '" value="' + esc(draft('create', 'callsign', '')) + '"></label>' +
      '<button type="submit" class="btn-small tac-room-btn">' + esc(ui.demo ? T.demoCreate : T.create) + '</button>' +
      '</form></details></section>';
  }

  function knockHtml() {
    return '<section class="tac-section"><h2>' + esc(T.knockTitle) + '</h2>' +
      '<div class="tac-room-word">' + esc(ui.client.word || '') + '</div>' +
      '<p>' + esc(T.knockText) + '</p>' + btn('leave', T.cancel) + '</section>';
  }

  function headHtml() {
    var c = ui.client, m = c.meta || {}, mine = c.me;
    var who = mine ? postName(mine.post) + (mine.squad ? ' · ' + squadName(mine.squad) : '') : (c.status === 'observer' ? T.observerBadge : '');
    return '<div class="tac-room-head"><span class="tac-room-code">' + esc(c.code) + '</span>' +
      '<span class="tac-muted">' + esc(planetName(m.planet)) + '</span>' +
      '<span class="tac-room-me">' + esc(who) + '</span>' +
      btn('leave', ui.confirming === 'leave' ? T.leaveAsk : T.leave) + '</div>';
  }

  function presenceDue(now) {
    var mine = me();
    if (!mine || !mine.confirmed) return false;
    var own = ui.client.lastOwnOpAt ? ui.client.lastOwnOpAt + ui.client.offset : 0;
    var last = Math.max(own, mine.presentAt || 0, mine.confirmedAt || 0, mine.at || 0);
    return now - last >= (ui.policy.ttl.memberIdleSec - 120) * 1000;
  }

  function canExtend() {
    var m = ui.client.meta;
    return !!(m && !m.extended && !m.closed && can('extend') && ui.client.serverNow() >= m.warnAt);
  }

  function bannersHtml() {
    var c = ui.client, m = c.meta || {}, now = c.serverNow(), out = [];
    var ctx = ui.hooks.getContext();
    if (!ui.storage.ok) out.push(banner(T.banners.storage));
    if (c.error === 'network') out.push(banner(T.banners.network, 'warn'));
    if (m.frozen) out.push(banner(fmt(T.banners[m.frozen.reason] || T.banners.silence, { t: hhmm(m.frozen.at) }), 'frozen'));
    if (m.locked && !m.closed) out.push(banner(T.banners.locked, 'warn', isStaff() ? btn('continueRound', T.continueRound) + btn('close', ui.confirming === 'close' ? T.closeAsk : T.close) : ''));
    if (m.closed) out.push(banner(T.banners.closed, 'warn', btn('exportLog', T.exportLog)));
    if (!m.closed && m.warnAt && now >= m.warnAt) out.push(banner(fmt(T.banners.warn, { t: hhmm(m.maxAt) }), 'warn', canExtend() ? btn('extend', T.extend) : ''));
    if (m.planet && ctx.meta && ctx.meta.id !== m.planet) out.push(banner(fmt(T.banners.planet, { planet: planetName(m.planet) })));
    if (c.status === 'in' && presenceDue(now)) out.push(banner(T.presentAsk, 'warn', btn('present', T.present)));
    return out.join('');
  }

  function rosterHtml() {
    var c = ui.client, P = ui.policy, now = c.serverNow();
    var members = c.members();
    var knocking = members.filter(function (m) { return !m.confirmed; });
    var groups = {};
    members.forEach(function (m) { var lv = R.levelOf(P, m.post) || 'observer'; (groups[lv] = groups[lv] || []).push(m); });
    var html = ['staff', 'squad', 'service'].map(function (lv) {
      if (!groups[lv]) return '';
      return '<h3>' + esc(T.levelNames[lv]) + '</h3>' + groups[lv].map(function (m) { return memberRow(m, knocking); }).join('');
    }).join('');
    if (isStaff()) html += staffHtml();
    return html;
  }

  function wordChoices(m, knocking) {
    var words = [m.word];
    knocking.forEach(function (k) { if (k.word && words.indexOf(k.word) < 0) words.push(k.word); });
    DECOYS[LANG].forEach(function (w) { if (words.length < 3 && words.indexOf(w) < 0) words.push(w); });
    words = words.slice(0, 3).sort();
    return '<span class="tac-muted">' + esc(T.wordsAsk) + '</span> ' + words.map(function (w) {
      return btn('confirm', w, { client: m.client, word: w }, 'big');
    }).join('');
  }

  function memberRow(m, knocking) {
    var c = ui.client, P = ui.policy, mine = me();
    var seen = c.presence[m.client];
    var faded = m.confirmed && !(typeof seen === 'number' && seen <= 90000);
    var name = postName(m.post) + (m.squad ? ' · ' + squadName(m.squad) : '') + (m.callsign ? ' «' + m.callsign + '»' : '');
    var tags = (m.functions || []).map(function (f) { return '<span class="tac-room-tag">' + esc(fnName(f)) + '</span>'; }).join('');
    var actions = '';
    var self = mine && mine.client === m.client;
    if (mine && mine.confirmed && !self) {
      if (!m.confirmed && can('confirmJoin')) actions += knocking.length >= 2 ? wordChoices(m, knocking) : btn('confirm', T.confirm, { client: m.client }, 'big');
      if (m.confirmed) {
        var ask = ui.confirming === 'release:' + m.client;
        actions += btn('release', ask ? T.goneAsk : T.gone, { client: m.client });
        if (isStaff() || (m.squad && mine.squad === m.squad)) actions += btn('reissue', T.claim, { client: m.client });
      }
    }
    if (can('assignLabel') && m.confirmed) {
      actions += P.functions.map(function (f) {
        var on = (m.functions || []).indexOf(f.id) >= 0;
        return btn('label', fnName(f.id), { client: m.client, fn: f.id }, on ? 'on' : '');
      }).join('');
    }
    var style = R.levelStyle(P, m);
    var waiting = m.confirmed ? '' : ' <em>' + esc(T.knocking) + (knocking.length < 2 && m.word ? ' · ' + esc(m.word) : '') + '</em>';
    return '<div class="tac-room-row' + (faded ? ' faded' : '') + (self ? ' me' : '') + '">' +
      '<span class="tac-room-sig tac-room-sig-' + style.level + '" style="--sig:' + esc(style.color) + '"></span>' +
      '<span class="tac-room-name">' + esc(name) + tags + waiting + '</span>' +
      '<span class="tac-room-actions">' + actions + '</span></div>';
  }

  function sheetMarkup(filter) {
    var c = ui.client, P = ui.policy;
    function lines(list) {
      var by = {};
      list.forEach(function (s) { (by[s.post] = by[s.post] || []).push(c.code + '-' + s.code); });
      return Object.keys(by).map(function (p) { return postName(p) + ': ' + by[p].join(', '); });
    }
    var out = ['[head=2]' + T.sheetHead + '[/head]', '[bold]' + T.roomCode + ':[/bold] ' + c.code, SITE.replace('https://', ''), T.sheetHint];
    if (!filter) {
      out.push('', '[head=3]' + T.levelNames.staff + ' / ' + T.levelNames.service + '[/head]');
      out = out.concat(lines(c.sheet.filter(function (s) { return !s.squad; })));
    }
    Object.keys(P.squads).forEach(function (sq) {
      if (filter && filter !== sq) return;
      out.push('', '[head=3]' + squadName(sq) + '[/head]');
      out = out.concat(lines(c.sheet.filter(function (s) { return s.squad === sq; })));
    });
    return out.join('\n');
  }

  function staffHtml() {
    var c = ui.client, m = c.meta || {};
    var silence = m.frozen && m.frozen.reason === 'silence';
    var sheet = c.sheet
      ? '<select class="tac-select" data-room-change="sheetSquad"><option value="">' + esc(T.sheetAll) + '</option>' +
        Object.keys(ui.policy.squads).map(function (s) { return '<option value="' + s + '"' + (s === ui.sheetSquad ? ' selected' : '') + '>' + esc(squadName(s)) + '</option>'; }).join('') +
        '</select> ' + btn('sheetCopy', T.copy) + '<pre class="tac-room-sheet">' + esc(sheetMarkup(ui.sheetSquad)) + '</pre>'
      : '';
    return '<section class="tac-section"><h2>' + esc(T.sheet) + '</h2>' + sheet +
      '<div class="tac-room-staff">' +
      btn('observerLink', T.observerLink) +
      btn('rotate', ui.confirming === 'rotate' ? T.rotateAsk : T.rotate) +
      btn('silence', silence ? T.silenceOff : T.silenceOn, null, silence ? 'on' : '') +
      (canExtend() ? btn('extend', T.extend) : '') +
      btn('exportLog', T.exportLog) +
      btn('close', ui.confirming === 'close' ? T.closeAsk : T.close) +
      '</div></section>';
  }

  function chipsHtml() {
    var members = ui.client.members();
    var confirmed = members.filter(function (m) { return m.confirmed; }).length;
    var knocking = members.length - confirmed;
    var roster = ui.narrow
      ? '<button type="button" class="tac-room-chip' + (knocking ? ' busy' : '') + '" data-room-action="shelf">' +
        esc(fmt(T.shelf, { n: confirmed })) + (knocking ? ' · ' + esc(fmt(T.knockBadge, { n: knocking })) : '') + '</button>'
      : '';
    return roster + collect('chips');
  }

  function shelfHtml() {
    var layers = modules.filter(function (m) { return m.tabs && m.tabs(api).some(function (t) { return t.id === 'layers'; }); })[0];
    return '<div class="tac-room-shelf-inner">' + btn('shelf', '×', null, 'tac-room-close') + rosterHtml() +
      (layers ? layers.panel('layers', api) : '') + '</div>';
  }

  function updateCountdowns() {
    if (!ui.client) return;
    var now = ui.client.serverNow();
    [ui.els.panel, ui.els.strip, ui.els.chips, ui.els.shelf].forEach(function (box) {
      if (!box) return;
      var list = box.querySelectorAll('[data-deadline]');
      for (var i = 0; i < list.length; i++) list[i].textContent = mmss(R.countdown(+list[i].getAttribute('data-deadline'), now));
    });
  }

  function captureFocus(box) {
    var el = document.activeElement;
    if (!el || !box.contains(el) || !el.name) return null;
    return { name: el.name, form: el.form ? el.form.getAttribute('data-room-form') : '', start: el.selectionStart, end: el.selectionEnd };
  }
  function restoreFocus(box, f) {
    if (!f) return;
    var el = box.querySelector((f.form ? '[data-room-form="' + f.form + '"] ' : '') + '[name="' + f.name + '"]');
    if (!el) return;
    el.focus({ preventScroll: true });
    try { if (typeof f.start === 'number') el.setSelectionRange(f.start, f.end); } catch (e) { /* select elements */ }
  }

  function setOn(on) {
    ui.on = !!on;
    document.body.classList.toggle('tac-room-on', ui.on);
    ui.els.panel.classList.toggle('tac-hide', !ui.on);
    ui.els.toggle.setAttribute('aria-pressed', ui.on ? 'true' : 'false');
    ui.els.toggle.textContent = ui.on ? T.toggleFire : T.toggleRoom;
    if (!ui.on) { cancelPick(); ui.shelf = false; }
    render();
    ui.hooks.redraw();
  }

  // ── actions ────────────────────────────────────────────

  function adminThen(action, payload, done) {
    return ui.client.admin(action, payload).then(function (r) {
      if (r.status === 200 && done) done(r.body);
      queueRender();
    });
  }

  function twoStep(key, run) {
    if (ui.confirming === key) { ui.confirming = null; run(); } else { ui.confirming = key; queueRender(); }
  }

  var actions = {
    tab: function (el) { ui.tab = el.getAttribute('data-tab'); ui.shelf = false; queueRender(); },
    shelf: function () { ui.shelf = !ui.shelf; queueRender(); },
    leave: function () {
      var run = function () { ui.storage.remove(CURRENT_KEY + ':' + ui.client.client); ui.client.leave(); cancelPick(); queueRender(); ui.hooks.redraw(); };
      if (ui.client.status === 'knocking') run(); else twoStep('leave', run);
    },
    confirm: function (el) {
      var payload = { client: el.getAttribute('data-client') };
      if (el.getAttribute('data-word')) payload.word = el.getAttribute('data-word');
      adminThen('confirm', payload, function () { track('room_confirm'); });
    },
    release: function (el) {
      var client = el.getAttribute('data-client');
      twoStep('release:' + client, function () { adminThen('release', { client: client }); });
    },
    reissue: function (el) {
      adminThen('reissue', { client: el.getAttribute('data-client') }, function (b) {
        if (b.postCode) toast(fmt(T.newCode, { code: ui.client.code + '-' + b.postCode }));
      });
    },
    label: function (el) { adminThen('label', { client: el.getAttribute('data-client'), fn: el.getAttribute('data-fn') }); },
    sheetCopy: function () { copyText(sheetMarkup(ui.sheetSquad)); },
    observerLink: function () {
      var c = ui.client;
      function link(token) {
        var ctx = ui.hooks.getContext();
        return SITE + '#map=' + ui.forkKey + '/' + ((c.meta && c.meta.planet) || (ctx.meta && ctx.meta.id)) + '&observe=' + c.code + '.' + token;
      }
      if (c.observerToken) { copyText(link(c.observerToken)); return; }
      adminThen('observer', null, function (b) { c.observerToken = b.observerToken; c.persist(); copyText(link(b.observerToken)); });
    },
    rotate: function () {
      twoStep('rotate', function () { adminThen('rotate', null, function (b) { toast(fmt(T.rotated, { code: b.code })); }); });
    },
    silence: function () {
      var m = ui.client.meta || {};
      adminThen('silence', { on: !(m.frozen && m.frozen.reason === 'silence') });
    },
    extend: function () { adminThen('extend'); },
    close: function () { twoStep('close', function () { adminThen('close'); }); },
    continueRound: function () { adminThen('unlock'); },
    exportLog: function () {
      var c = ui.client;
      c.exportRoom().then(function (r) {
        if (r.status !== 200) { toast(errorText((r.body && r.body.error) || 'http-' + r.status)); return; }
        var stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
        download('room-' + c.code + '-' + stamp + '.json', JSON.stringify(r.body, null, 1));
        if (r.body.text) download('room-' + c.code + '-' + stamp + '.txt', r.body.text, 'text/plain;charset=utf-8');
        track('room_export');
      });
    },
    present: function () {
      var mine = me();
      if (mine) ui.client.queue({ op: 'patch', kind: 'member', id: mine.id, data: { presentAt: 1 } });
    }
  };

  var changes = {
    sheetSquad: function (el) { ui.sheetSquad = el.value; queueRender(); }
  };

  function findHandler(table, name) {
    if (table === 'actions' && actions[name]) return actions[name];
    if (table === 'changes' && changes[name]) return changes[name];
    for (var i = 0; i < modules.length; i++) {
      var t = modules[i][table];
      if (t && t[name]) return t[name];
    }
    return null;
  }

  function onClick(e) {
    var el = e.target.closest ? e.target.closest('[data-room-action]') : null;
    if (!el) return;
    var fn = findHandler('actions', el.getAttribute('data-room-action'));
    if (!fn) return;
    e.preventDefault();
    if (el.getAttribute('data-room-action') !== 'leave' && ui.confirming && ui.confirming.indexOf(el.getAttribute('data-room-action')) !== 0) ui.confirming = null;
    fn(el, api, e);
  }

  function onChange(e) {
    var el = e.target;
    if (el.getAttribute && el.getAttribute('data-room-change')) {
      var fn = findHandler('changes', el.getAttribute('data-room-change'));
      if (fn) fn(el, api, e);
      return;
    }
    onInput(e);
  }

  function onInput(e) {
    var el = e.target;
    if (!el.name || !el.form) return;
    var form = el.form.getAttribute('data-room-form');
    ui.drafts[form + '.' + el.name] = el.type === 'checkbox' ? el.checked : el.value;
    if (form === 'join' && el.name === 'entry') {
      var pick = el.form.querySelector('.tac-room-postpick');
      if (pick) pick.classList.toggle('tac-hide', el.value.indexOf('-') >= 0);
    }
  }

  function tokenKeyId(token) {
    try {
      var part = String(token).split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
      part += '==='.slice((part.length + 3) % 4);
      var bin = atob(part), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return JSON.parse(new TextDecoder().decode(bytes)).keyId || '';
    } catch (e) { return ''; }
  }

  function onSubmit(e) {
    var form = e.target;
    var name = form.getAttribute && form.getAttribute('data-room-form');
    if (!name) return;
    e.preventDefault();
    var f = form.elements, c = ui.client, ctx = ui.hooks.getContext();
    c.error = null;
    c.planet = ctx.meta ? ctx.meta.id : c.planet;
    c.h = ctx.meta ? ctx.meta.h : c.h;
    if (name === 'join') {
      c.join({ entry: f.entry.value, post: f.post.value, squad: f.squad.value, callsign: f.callsign.value }).then(function () {
        if (c.status === 'knocking' || c.status === 'in') { clearDrafts('join'); c.startLoop(); }
        queueRender();
      });
    } else if (name === 'create') {
      var token = ui.demo ? 'demo' : f.token.value.trim();
      if (!ui.demo) ui.storage.write(PREFIX + 'room-key:' + ui.forkKey, token);
      c.createRoom({ token: token, keyId: ui.demo ? 'demo' : tokenKeyId(token), post: f.post.value, callsign: f.callsign.value }).then(function () {
        if (c.status === 'in') { clearDrafts('create'); track('room_create'); c.startLoop(); ui.tab = null; }
        queueRender();
      });
    } else {
      var fn = findHandler('submits', name);
      if (fn) fn(form, api, e);
    }
  }

  // ── lifecycle ────────────────────────────────────────────

  function tick() {
    var ctx = ui.hooks.getContext();
    if (ctx.fork && ui.forkKey !== ctx.fork.key) { switchFork(ctx.fork.key); return; }
    var planet = ctx.meta ? ctx.meta.id : null;
    if (planet !== ui.planetId) { ui.planetId = planet; if (ui.on) queueRender(); }
    updateCountdowns();
    modules.forEach(function (m) { if (m.tick) m.tick(api); });
  }

  function mount(hooks, apiRoot) {
    ui.hooks = hooks;
    ui.root = apiRoot;
    ui.storage = apiRoot.makeStorage(root.localStorage);
    ui.els = { toggle: $('tacRoomToggle'), panel: $('tacRoom'), chips: $('tacRoomChips'), strip: $('tacRoomStrip'), shelf: $('tacRoomShelf'), draw: $('tacRoomDraw') };
    if (!ui.els.panel || !ui.els.toggle) return;
    if (root.top !== root.self) return;   // never run inside a frame: a foreign page cannot click «Подтвердить» for staff
    ui.pendingHash = parseHash(root.location.hash);
    ui.clientHash = ui.pendingHash.client;
    ui.demo = ui.pendingHash.room === 'demo';
    ui.fixtureReady = ui.demo ? loadScript('tactical/room-fixtures.js?v=1') : Promise.resolve();
    ui.els.toggle.textContent = T.toggleRoom;
    ui.els.toggle.addEventListener('click', function () { setOn(!ui.on); });
    [ui.els.panel, ui.els.chips, ui.els.strip, ui.els.shelf].forEach(function (box) {
      box.addEventListener('click', onClick);
      box.addEventListener('change', onChange);
      box.addEventListener('input', onInput);
      box.addEventListener('submit', onSubmit);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && ui.pick) { cancelPick(); e.preventDefault(); e.stopPropagation(); }
    }, true);
    var mq = root.matchMedia ? root.matchMedia('(max-width: 1100px)') : null;
    ui.narrow = !!(mq && mq.matches);
    if (mq && mq.addEventListener) mq.addEventListener('change', function (e) { ui.narrow = e.matches; if (!ui.narrow) ui.shelf = false; queueRender(); });
    ui.toastEl = document.createElement('div');
    ui.toastEl.className = 'tac-room-toast tac-hide';
    ui.toastEl.setAttribute('role', 'status');
    document.body.appendChild(ui.toastEl);
    hooks.view.addLayer(function drawRoom(ctx, v) {
      if (!ui.on || !inRoom()) return;
      modules.forEach(function (m) { if (m.draw) m.draw(ctx, v, api); });
    });
    modules.forEach(function (m) { if (m.mount) m.mount(api); });
    root.setInterval(tick, 1000);
    tick();
  }

  function notify(event, payload) {
    if (!ui.on || !inRoom()) return;
    modules.forEach(function (m) { if (m.notify) m.notify(event, payload, api); });
  }

  var api = {
    R: R, LANG: LANG, ui: ui,
    T: function () { return T; },
    esc: esc, fmt: fmt, btn: btn, banner: banner, render: queueRender, toast: toast, errorText: errorText,
    setPick: setPick, cancelPick: cancelPick, hhmm: hhmm, mmss: mmss,
    postName: postName, squadName: squadName, fnName: fnName, planetName: planetName,
    offset: offset, gameText: gameText, toWorld: toWorld, me: me, can: can, isStaff: isStaff, myLayer: myLayer,
    draft: draft, clearDrafts: clearDrafts, track: track, copyText: copyText, download: download
  };

  root.TacRoomUI = {
    api: api,
    register: function (module) {
      modules.push(module);
      if (module.l10n) {
        ['en', 'ru'].forEach(function (lang) {
          var src = module.l10n[lang] || {};
          Object.keys(src).forEach(function (k) {
            if (k === 'tabs') { Object.keys(src.tabs).forEach(function (t) { L10N[lang].tabs[t] = src.tabs[t]; }); }
            else if (k === 'errors') { Object.keys(src.errors).forEach(function (t) { L10N[lang].errors[t] = src.errors[t]; }); }
            else { L10N[lang][k] = src[k]; }
          });
        });
      }
    },
    mount: mount,
    notify: notify,
    consumePick: consumePick
  };
})(window);
```

- [ ] **Step 6: Write `tactical/room.css`**

```css
/*
  SPDX-License-Identifier: GPL-3.0-only
  Copyright (C) 2026 MikameO
  This file is part of Space Station Recipes.
  See LICENSE for details.
*/
/* Officers' room on the tactical map. Scoped to .tac-room-* and body.tac-room-on;
   tactical.css is never overridden outside these selectors. */

.tac-room-panel { grid-column: 2; grid-row: 1; }
body.tac-room-on #tacPanel { display: none; }

.tac-room-draw {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}
.tac-room-draw.active { pointer-events: auto; cursor: crosshair; touch-action: none; }

.tac-room-chips {
  position: absolute;
  top: 8px;
  left: 8px;
  right: 8px;
  display: flex;
  gap: 6px;
  overflow-x: auto;
  flex-wrap: nowrap;
  pointer-events: none;
  z-index: 3;
  scrollbar-width: none;
}
.tac-room-chips > * { pointer-events: auto; }

.tac-room-chip {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 14px;
  border: 1px solid var(--border-active);
  background: rgba(6, 9, 15, 0.92);
  color: var(--text-bright);
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}
.tac-room-chip.ready { border-color: var(--phosphor); color: var(--phosphor); }
.tac-room-chip.busy { border-color: var(--amber); color: var(--amber); }
.tac-room-chip.cooldown { border-color: var(--border-subtle); color: var(--text-ghost); }
.tac-room-chip.down { border-color: var(--red-alert); color: var(--red-alert); }

.tac-room-strip {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 6px 8px;
  border-top: 1px solid var(--border-subtle);
  min-height: 64px;
  background: var(--panel);
}

.tac-room-shelf {
  position: absolute;
  top: 44px;
  right: 8px;
  bottom: 8px;
  width: min(360px, calc(100% - 16px));
  overflow-y: auto;
  z-index: 4;
  border: 1px solid var(--border-active);
  border-radius: 8px;
  background: var(--panel);
  padding: 10px;
}
.tac-room-close { float: right; }

.tac-room-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.tac-room-code {
  font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
  font-size: 18px;
  letter-spacing: 0.08em;
  color: var(--phosphor);
}
.tac-room-me { margin-left: auto; color: var(--text-bright); }

.tac-room-tools { display: flex; gap: 4px; flex-wrap: wrap; margin: 6px 0; }
.tac-room-tabs { display: flex; gap: 4px; margin: 8px 0; flex-wrap: wrap; }

.tac-room-form { display: flex; flex-direction: column; gap: 8px; }
.tac-room-form .tac-select, .tac-room-form .tac-input { width: 100%; }
.tac-room-postpick { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.tac-room-code.tac-input { text-transform: uppercase; font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; letter-spacing: 0.08em; }

.tac-room-word {
  font: 700 28px ui-monospace, "Cascadia Mono", Consolas, monospace;
  letter-spacing: 0.1em;
  color: var(--phosphor);
  text-align: center;
  padding: 14px;
  margin: 8px 0;
  border: 1px dashed var(--phosphor-dim);
  border-radius: 8px;
}

.tac-room-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border-subtle);
  flex-wrap: wrap;
}
.tac-room-row.faded { opacity: 0.5; }
.tac-room-row.me .tac-room-name { color: var(--text-bright); }
.tac-room-name { flex: 1; min-width: 140px; overflow-wrap: anywhere; }
.tac-room-actions { display: flex; gap: 4px; flex-wrap: wrap; }
.tac-room-tag {
  display: inline-block;
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 8px;
  border: 1px solid var(--border-active);
  font-size: 11px;
  color: var(--cyan);
}

.tac-room-sig { flex: none; width: 14px; height: 14px; border: 2px solid var(--sig, #fff); }
.tac-room-sig-staff { border-width: 3px; }
.tac-room-sig-squad { transform: rotate(45deg) scale(0.8); }
.tac-room-sig-service { border-radius: 50%; border-style: dashed; }

.tac-room-sheet {
  max-height: 180px;
  overflow: auto;
  padding: 8px;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background: var(--hull-plate);
  font-size: 12px;
  white-space: pre-wrap;
}
.tac-room-staff { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }

.tac-room-banner p { margin: 0 0 6px; }
.tac-room-banner.frozen { border-color: var(--cyan); background: var(--cyan-dim); }
.tac-room-banner.warn { border-color: var(--amber); }

.tac-room-btn.on { border-color: var(--cyan); color: var(--cyan); }

.tac-room-toast {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  max-width: calc(100% - 32px);
  padding: 10px 16px;
  border: 1px solid var(--border-active);
  border-radius: 8px;
  background: rgba(6, 9, 15, 0.96);
  color: var(--text-bright);
  font-size: 14px;
  z-index: 50;
}

body.tac-room-picking .tac-canvas { cursor: cell; }
```

- [ ] **Step 7: Run every room and Series T test**

Run: `node scripts/test_room_seam.js && node scripts/test_room_logic.js && node scripts/test_room_client.js && node scripts/test_tactical_logic.js`
Expected: `OK seam`, `OK 15 groups`, `OK 10 cases`, then the Series T suite's existing success line.

- [ ] **Step 8: Verify the demo mock in the preview**

Start the preview with `preview_start` config `ss14-chem`, then navigate to `http://127.0.0.1:<port>/tactical.html?nocache=v5#map=stories_cm/lv624&room=demo` (the `nocache` query keeps the service worker from serving the old `tactical.js`). The project memory records that preview clicks are unreliable here, so drive the page with `javascript_tool`:

```js
// 1. The toggle is visible and the room panel is on.
({ toggle: !document.getElementById('tacRoomToggle').classList.contains('tac-hide'),
   on: document.body.classList.contains('tac-room-on'),
   panelShown: getComputedStyle(document.getElementById('tacRoom')).display !== 'none',
   tPanelHidden: getComputedStyle(document.getElementById('tacPanel')).display === 'none' })
```
Expected: all four `true` (use `getComputedStyle`, not `el.hidden`: the `[hidden]` vs author display trap is in project memory).

```js
// 2. Create the demo room and wait for the script to seat three officers.
document.querySelector('[data-room-form="create"] button[type="submit"]').click();
await new Promise(r => setTimeout(r, 6000));
({ code: document.querySelector('.tac-room-code').textContent,
   rows: document.querySelectorAll('.tac-room-row').length,
   sheet: (document.querySelector('.tac-room-sheet') || {}).textContent || '' })
```
Expected: `code` is `DEMA42`, `rows` is at least 4 after switching to the roster tab — if the requests tab is default, first run `document.querySelector('[data-tab="roster"]').click()` and read again; `sheet` starts with `[head=2]Командный планшет[/head]` when the page language is Russian.

```js
// 3. Leave asks once, then returns to the entry form.
document.querySelector('[data-room-action="leave"]').click();
document.querySelector('[data-room-action="leave"]').click();
!!document.querySelector('[data-room-form="join"]')
```
Expected: `true`.

Take a `computer` screenshot of step 2 with the roster tab open and keep it for the owner. Check `read_console_messages` with `onlyErrors: true`: expected no errors.

- [ ] **Step 9: Commit**

```bash
git add tactical.html tactical/tactical.js tactical/room-ui.js tactical/room.css scripts/test_room_seam.js
git commit -m "feat(tablet): seam with the tactical map, room panel shell and the demo mock (V7, V6, V2)"
```

### Task 6: Shared map objects in command-level signatures (V8)

**Files:**
- Modify: `scripts/test_room_seam.js` (script order)
- Modify: `tactical.html` (one script tag)
- Create: `tactical/room-draw.js`
- Modify: `tactical/room.css` (append tools and filters)

Geometry (`simplify`, `smoothSegments`, `snapPoints`) and the confirm/relay right were added to `room-logic.js` in Task 2; this task only renders and edits.

- [ ] **Step 1: Extend the seam guard to the new module**

In `scripts/test_room_seam.js` replace

```js
const order = ['tactical/room-logic.js', 'tactical/room.js', 'tactical/room-ui.js', 'tactical/tactical.js'];
```

with

```js
const order = ['tactical/room-logic.js', 'tactical/room.js', 'tactical/room-ui.js', 'tactical/room-draw.js', 'tactical/tactical.js'];
```

Run: `node scripts/test_room_seam.js`
Expected: `AssertionError [ERR_ASSERTION]: tactical/room-draw.js is loaded`.

- [ ] **Step 2: Add the script tag**

In `tactical.html` replace

```html
<script src="tactical/room-ui.js?v=1" defer></script>
```

with

```html
<script src="tactical/room-ui.js?v=1" defer></script>
<script src="tactical/room-draw.js?v=1" defer></script>
```

Run: `node scripts/test_room_seam.js`
Expected: `OK seam`.

- [ ] **Step 3: Write `tactical/room-draw.js`**

```js
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// This file is part of Space Station Recipes.
// See LICENSE for details.
//
// Officers' room — shared map objects: marks, enemy marks, lines, areas and
// freehand strokes in the command-level signature (staff thick solid and
// squares, squads in squad colour and diamonds, services dashed and circles,
// enemy hollow red triangles fading with age), the Layers tab with filters,
// and the round calibration of the room. Registers into tactical/room-ui.js.
(function (root) {
  'use strict';

  var R = root.TacticalRoomLogic;
  var PREFS_KEY = 'chemdb-tactical:room-prefs';
  var CATS = ['plan', 'rally', 'danger', 'other'];
  var ENEMY = '#ff5a5a';
  var GREY = '#8a99b3';
  var st = { tool: null, points: [], stroke: null };

  var l10n = {
    en: {
      tabs: { layers: 'Layers' },
      toolMarker: 'Mark', toolEnemy: 'Enemy', toolLine: 'Line', toolArea: 'Area', toolFreehand: 'Freehand',
      smooth: 'Smooth', label: 'Label', done: 'Done', cancelTool: 'Cancel',
      cats: { enemy: 'Enemy', plan: 'Plan', rally: 'Rally point', danger: 'Danger', other: 'Mark' },
      layerNames: { shared: 'Shared', staff: 'Staff', service: 'Services', requests: 'Requests', assets: 'Assets', squad: 'Squad {name}' },
      show: 'Show', authors: 'Authors', age: 'Age', ageAll: 'any', age5: 'up to 5 min', age10: 'up to 10 min',
      publishOwn: 'Also send the marks and lines I place on the Fire panel', objects: 'Objects', none: 'Nothing yet',
      notRelayed: 'not relayed', relay: 'Relayed', still: 'Still there', remove: 'Delete', authorDropped: 'author dropped',
      calTitle: 'Round calibration', calNone: 'The room has no round calibration yet.', calRoom: 'Room: {offset} ({who}, {t})',
      calMismatch: 'Yours differs: {mine}. Room objects use the room calibration.', calPublish: 'Publish my calibration',
      pickMarker: 'Click a tile for the mark', pickLine: 'Click tiles; Enter or Done finishes', pickFree: 'Hold the mouse button and draw on the map'
    },
    ru: {
      tabs: { layers: 'Слои' },
      toolMarker: 'Метка', toolEnemy: 'Противник', toolLine: 'Линия', toolArea: 'Область', toolFreehand: 'От руки',
      smooth: 'Гладкая', label: 'Подпись', done: 'Готово', cancelTool: 'Отмена',
      cats: { enemy: 'Противник', plan: 'План', rally: 'Сбор', danger: 'Опасность', other: 'Метка' },
      layerNames: { shared: 'Общий', staff: 'Штаб', service: 'Службы', requests: 'Запросы', assets: 'Ресурсы', squad: 'Отряд {name}' },
      show: 'Показывать', authors: 'Авторы', age: 'Возраст', ageAll: 'любой', age5: 'до 5 мин', age10: 'до 10 мин',
      publishOwn: 'Отправлять в комнату и метки с линиями с панели «Огонь»', objects: 'Объекты', none: 'Пока пусто',
      notRelayed: 'не передано', relay: 'Передано', still: 'Ещё там', remove: 'Удалить', authorDropped: 'автор снят',
      calTitle: 'Калибровка раунда', calNone: 'В комнате ещё нет калибровки раунда.', calRoom: 'Комната: {offset} ({who}, {t})',
      calMismatch: 'Ваша отличается: {mine}. Объекты комнаты считаются по калибровке комнаты.', calPublish: 'Опубликовать мою калибровку',
      pickMarker: 'Кликните тайл для метки', pickLine: 'Кликайте тайлы; Enter или «Готово» — завершить', pickFree: 'Зажмите кнопку мыши и ведите по карте'
    }
  };

  // ── prefs, layers, objects ──────────────────────────────────────

  function prefs(api) {
    var p = api.ui.storage.read(PREFS_KEY) || {};
    return { hidden: p.hidden || {}, hiddenLevels: p.hiddenLevels || {}, maxAgeSec: p.maxAgeSec || 0, publishOwn: !!p.publishOwn };
  }
  function savePrefs(api, patch) {
    var p = api.ui.storage.read(PREFS_KEY) || {};
    Object.keys(patch).forEach(function (k) { p[k] = patch[k]; });
    api.ui.storage.write(PREFS_KEY, p);
  }
  function layerKeys(api) {
    return ['shared', 'staff'].concat(Object.keys(api.ui.policy.squads).map(function (s) { return 'squad:' + s; })).concat(['service']);
  }
  function layerName(api, key) {
    var T = api.T();
    return key.indexOf('squad:') === 0 ? api.fmt(T.layerNames.squad, { name: api.squadName(key.slice(6)) }) : T.layerNames[key];
  }
  function visibleObjects(api) {
    var p = prefs(api), P = api.ui.policy;
    var layers = layerKeys(api).filter(function (k) { return !p.hidden[k]; });
    var list = api.ui.client.visible({ kinds: ['marker', 'line', 'area'], layers: layers, maxAgeSec: p.maxAgeSec || undefined });
    return list.filter(function (o) { return !(o.by && p.hiddenLevels[R.levelOf(P, o.by.post)]); });
  }
  function newId(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function currentLayer(api) { return api.isStaff() ? api.draft('draw', 'layer', 'shared') : api.myLayer(); }
  function put(api, kind, data, id) {
    var ctx = api.ui.hooks.getContext();
    data.level = ctx.level || 0;
    data.h = ctx.meta ? ctx.meta.h : '';
    data.layer = data.layer || currentLayer(api);
    return api.ui.client.queue({ op: 'put', kind: kind, id: id || newId(kind.charAt(0)), data: data });
  }

  // ── drawing ─────────────────────────────────────────────

  function outlineText(ctx, text, x, y) {
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(6, 9, 15, 0.95)';
    ctx.fillStyle = '#e8ecf4';
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
  }
  function shapePath(ctx, shape, x, y, r) {
    ctx.beginPath();
    if (shape === 'square') ctx.rect(x - r, y - r, 2 * r, 2 * r);
    else if (shape === 'diamond') { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); }
    else if (shape === 'triangle') { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r * 0.8); ctx.lineTo(x - r, y + r * 0.8); ctx.closePath(); }
    else ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  function centre(points) {
    var sx = 0, sy = 0;
    points.forEach(function (p) { sx += p[0]; sy += p[1]; });
    return [sx / points.length, sy / points.length];
  }
  function styleFor(api, o, active) {
    if (!o.by || !active[o.by.client]) return { color: GREY, width: 2, dash: [3, 3], marker: 'circle', grey: true };
    var s = R.levelStyle(api.ui.policy, o.by);
    return { color: s.color, width: s.width || 2, dash: s.dash, marker: s.marker || 'circle', grey: false };
  }

  function drawShape(ctx, v, api, o, active) {
    var s = styleFor(api, o, active), T = api.T();
    var pts = o.points.map(function (p) { return v.worldToScreen(p[0] + 0.5, p[1] + 0.5); });
    if (pts.length < 2) return;
    var closed = o.kind === 'area';
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    if (o.smooth && pts.length > 2) {
      R.smoothSegments(closed ? pts.concat([pts[0]]) : pts).forEach(function (g) { ctx.bezierCurveTo(g[0], g[1], g[2], g[3], g[4], g[5]); });
    } else {
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      if (closed) ctx.closePath();
    }
    if (closed) { ctx.fillStyle = s.color; ctx.globalAlpha = o.pending ? 0.08 : 0.14; ctx.fill(); ctx.globalAlpha = 1; }
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.setLineDash(s.dash);
    ctx.lineWidth = s.width + 2.5;
    ctx.strokeStyle = 'rgba(6, 9, 15, 0.8)';
    ctx.stroke();
    ctx.lineWidth = s.width;
    ctx.strokeStyle = s.color;
    ctx.globalAlpha = o.pending ? 0.6 : 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    if (o.label || s.grey) {
      var c = centre(o.points), p = v.worldToScreen(c[0] + 0.5, c[1] + 0.5);
      outlineText(ctx, (o.label || '') + (s.grey ? (o.label ? ' · ' : '') + T.authorDropped : ''), p[0], p[1]);
    }
  }

  function drawMarker(ctx, v, api, o, active, now) {
    var T = api.T(), P = api.ui.policy;
    var p = v.worldToScreen(o.x + 0.5, o.y + 0.5), r = Math.max(6, Math.min(11, 4 + v.scale * 0.4));
    ctx.save();
    if (o.cat === 'enemy') {
      ctx.globalAlpha = R.enemyAlpha(R.markerAge(o, now), o.ttl || P.ttl.enemyMarkerSec);
      shapePath(ctx, 'triangle', p[0], p[1], r);
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(6, 9, 15, 0.9)';
      ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = ENEMY;
      ctx.stroke();
    } else {
      var s = styleFor(api, o, active);
      shapePath(ctx, s.marker, p[0], p[1], r);
      ctx.fillStyle = s.color;
      ctx.globalAlpha = o.pending ? 0.6 : 1;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.setLineDash(s.dash);
      ctx.strokeStyle = 'rgba(6, 9, 15, 0.9)';
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
    var label = (o.label || T.cats[o.cat] || '') + (o.cat === 'enemy' && o.relayed === false ? ' · ' + T.notRelayed : '');
    if (label) outlineText(ctx, label, p[0], p[1] - r - 9);
  }

  function drawAll(ctx, v, api) {
    var c = api.ui.client, level = api.ui.hooks.getContext().level || 0, now = c.serverNow();
    var active = {};
    c.members().forEach(function (m) { if (m.confirmed) active[m.client] = true; });
    var list = visibleObjects(api).filter(function (o) { return (o.level || 0) === level; });
    list.forEach(function (o) { if (o.kind === 'line' || o.kind === 'area') drawShape(ctx, v, api, o, active); });
    list.forEach(function (o) { if (o.kind === 'marker') drawMarker(ctx, v, api, o, active, now); });
    if (st.points.length) {
      var pts = st.points.map(function (p) { return v.worldToScreen(p[0] + 0.5, p[1] + 0.5); });
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#e8ecf4';
      ctx.beginPath();
      pts.forEach(function (q, i) { if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
      if (st.tool === 'area' && pts.length > 2) ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = '#e8ecf4';
      pts.forEach(function (q) { ctx.beginPath(); ctx.arc(q[0], q[1], 3, 0, Math.PI * 2); ctx.fill(); });
      ctx.restore();
    }
  }

  // ── tools ──────────────────────────────────────────────

  function placeMarker(api, tile, tool) {
    put(api, 'marker', { cat: tool === 'enemy' ? 'enemy' : api.draft('draw', 'cat', 'plan'), label: api.draft('draw', 'label', ''), x: tile[0], y: tile[1] });
    api.clearDrafts('draw');
  }

  function finishShape(api) {
    var need = st.tool === 'area' ? 3 : 2;
    if (st.points.length < need) return;
    put(api, st.tool, {
      cat: 'plan', label: api.draft('draw', 'label', ''),
      points: st.points.slice(0, api.ui.policy.limits.points), smooth: api.draft('draw', 'smooth', true) !== false
    });
    st.points = [];
    api.clearDrafts('draw');
    api.cancelPick();
  }

  function armFreehand(api) {
    var cv = api.ui.els.draw, v = api.ui.hooks.view;
    if (!cv) return;
    var box = cv.getBoundingClientRect(), dpr = root.devicePixelRatio || 1;
    cv.width = Math.round(box.width * dpr);
    cv.height = Math.round(box.height * dpr);
    var g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    cv.classList.add('active');
    st.stroke = { screen: [], down: false };
    function local(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    cv.onpointerdown = function (e) {
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* synthetic test events have no capturable pointer */ }
      st.stroke.down = true;
      st.stroke.screen = [local(e)];
    };
    cv.onpointermove = function (e) {
      if (!st.stroke || !st.stroke.down) return;
      var p = local(e), prev = st.stroke.screen[st.stroke.screen.length - 1];
      st.stroke.screen.push(p);
      g.strokeStyle = '#e8ecf4';
      g.lineWidth = 2;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(prev[0], prev[1]);
      g.lineTo(p[0], p[1]);
      g.stroke();
    };
    cv.onpointerup = function () {
      if (!st.stroke || !st.stroke.down) return;
      st.stroke.down = false;
      var world = st.stroke.screen.map(function (p) { return v.screenToWorld(p[0], p[1]); });
      var pts = R.simplify(R.snapPoints(world), 0.8, api.ui.policy.limits.points);
      g.clearRect(0, 0, cv.width, cv.height);
      if (pts.length >= 2) put(api, 'line', { cat: 'plan', label: api.draft('draw', 'label', ''), points: pts, smooth: true });
      api.clearDrafts('draw');
      api.cancelPick();
    };
  }

  function disarmFreehand(api) {
    var cv = api.ui.els.draw;
    if (!cv) return;
    cv.classList.remove('active');
    cv.onpointerdown = cv.onpointermove = cv.onpointerup = null;
    var g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    st.stroke = null;
  }

  function startTool(api, tool) {
    var T = api.T();
    api.cancelPick();
    st.tool = tool;
    st.points = [];
    if (tool === 'marker' || tool === 'enemy') {
      api.setPick(tool, function (tile) { placeMarker(api, tile, tool); api.render(); }, T.pickMarker, false, function () { st.tool = null; });
    } else if (tool === 'line' || tool === 'area') {
      api.setPick(tool, function (tile) {
        var l = st.points[st.points.length - 1];
        if (!l || l[0] !== tile[0] || l[1] !== tile[1]) st.points.push(tile.slice());
        api.render();
      }, T.pickLine, true, function () { st.tool = null; st.points = []; });
    } else if (tool === 'freehand') {
      armFreehand(api);
      api.setPick('freehand', function () {}, T.pickFree, true, function () { disarmFreehand(api); st.tool = null; });
    }
    api.render();
  }

  function toolsHtml(api) {
    var T = api.T(), me = api.me(), esc = api.esc;
    if (!me || !me.confirmed || !api.myLayer() || api.ui.client.status !== 'in') return '';
    function tb(tool, label) { return api.btn('drawTool', label, { tool: tool }, st.tool === tool ? 'on' : ''); }
    var html = tb('marker', T.toolMarker) + tb('enemy', T.toolEnemy) + tb('line', T.toolLine) + tb('area', T.toolArea) + tb('freehand', T.toolFreehand);
    if (!st.tool) return html;
    var shape = st.tool === 'line' || st.tool === 'area';
    return html + '<form data-room-form="draw" class="tac-room-drawform">' +
      '<input class="tac-input" name="label" maxlength="' + api.ui.policy.limits.label + '" placeholder="' + esc(T.label) + '" value="' + esc(api.draft('draw', 'label', '')) + '">' +
      (st.tool === 'marker' ? '<select class="tac-select" name="cat">' + CATS.map(function (c) {
        return '<option value="' + c + '"' + (api.draft('draw', 'cat', 'plan') === c ? ' selected' : '') + '>' + esc(T.cats[c]) + '</option>';
      }).join('') + '</select>' : '') +
      (api.isStaff() ? '<select class="tac-select" name="layer">' + ['shared', 'staff'].map(function (k) {
        return '<option value="' + k + '"' + (api.draft('draw', 'layer', 'shared') === k ? ' selected' : '') + '>' + esc(T.layerNames[k]) + '</option>';
      }).join('') + '</select>' : '') +
      (shape ? '<label class="tac-room-check"><input type="checkbox" name="smooth"' + (api.draft('draw', 'smooth', true) ? ' checked' : '') + '> ' + esc(T.smooth) + '</label>' +
        api.btn('drawDone', T.done + ' (' + st.points.length + ')') : '') +
      api.btn('drawCancel', T.cancelTool) + '</form>';
  }

  // ── Layers tab ────────────────────────────────────────────

  function check(api, kind, key, label, on) {
    return '<label class="tac-room-check"><input type="checkbox" data-room-change="drawFilter" data-kind="' + kind + '" data-key="' + key + '"' +
      (on ? ' checked' : '') + '> ' + api.esc(label) + '</label>';
  }

  function objectRow(api, o) {
    var T = api.T(), me = api.me(), c = api.ui.client, esc = api.esc;
    var last = o.kind === 'marker' ? null : o.points[o.points.length - 1];
    var where = o.kind === 'marker' ? api.gameText(o.x, o.y) : api.gameText(o.points[0][0], o.points[0][1]) + ' → ' + api.gameText(last[0], last[1]);
    var who = o.by ? api.postName(o.by.post) + (o.by.squad ? ' · ' + api.squadName(o.by.squad) : '') : '';
    var active = o.by && c.member(o.by.client);
    var actions = '';
    if (me && me.confirmed && c.status === 'in') {
      if (o.kind === 'marker' && o.cat === 'enemy') actions += api.btn('drawStill', T.still, { id: o.id });
      if (o.kind === 'marker' && o.cat === 'enemy' && o.relayed === false) actions += api.btn('drawRelay', T.relay, { id: o.id });
      if ((o.by && o.by.client === me.client) || api.isStaff()) actions += api.btn('drawDelete', T.remove, { id: o.id });
    }
    return '<div class="tac-room-row' + (o.pending ? ' faded' : '') + '"><span class="tac-room-name"><b>' + esc(o.label || T.cats[o.cat] || '') + '</b> ' +
      '<span class="tac-item-coords">' + esc(where) + '</span><br><span class="tac-muted">' + esc(who) +
      (active ? '' : ' · ' + esc(T.authorDropped)) + (o.cat === 'enemy' && o.relayed === false ? ' · ' + esc(T.notRelayed) : '') + '</span></span>' +
      '<span class="tac-room-actions">' + actions + '</span></div>';
  }

  function layersHtml(api) {
    var T = api.T(), c = api.ui.client, p = prefs(api), ctx = api.ui.hooks.getContext(), esc = api.esc;
    var cal = c.calibration(), mine = ctx.calibration;
    var differs = cal && mine && (mine.offset[0] !== cal.offset[0] || mine.offset[1] !== cal.offset[1]);
    var calHtml = '<section class="tac-section"><h2>' + esc(T.calTitle) + '</h2>' +
      (cal ? '<p>' + esc(api.fmt(T.calRoom, { offset: cal.offset.join(' '), who: cal.by ? api.postName(cal.by.post) : '', t: api.hhmm(cal.at) })) + '</p>'
        : '<p class="tac-muted">' + esc(T.calNone) + '</p>') +
      (differs ? '<p class="tac-msg warn">' + esc(api.fmt(T.calMismatch, { mine: mine.offset.join(' ') })) + '</p>' : '') +
      (mine && c.status === 'in' && api.can('publishCalibration') && (!cal || differs) ? api.btn('calPublish', T.calPublish) : '') +
      '</section>';
    var filters = '<section class="tac-section"><h2>' + esc(T.show) + '</h2><div class="tac-room-checks">' +
      layerKeys(api).map(function (k) { return check(api, 'layer', k, layerName(api, k), !p.hidden[k]); }).join('') + '</div>' +
      '<h3>' + esc(T.authors) + '</h3><div class="tac-room-checks">' +
      ['staff', 'squad', 'service'].map(function (lv) { return check(api, 'level', lv, T.levelNames[lv], !p.hiddenLevels[lv]); }).join('') + '</div>' +
      '<label class="tac-input-label">' + esc(T.age) + '<select class="tac-select" data-room-change="drawAge">' +
      [[0, T.ageAll], [300, T.age5], [600, T.age10]].map(function (o) {
        return '<option value="' + o[0] + '"' + (p.maxAgeSec === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
      }).join('') + '</select></label>' +
      '<label class="tac-room-check"><input type="checkbox" data-room-change="drawPublishOwn"' + (p.publishOwn ? ' checked' : '') + '> ' + esc(T.publishOwn) + '</label></section>';
    var list = visibleObjects(api);
    return calHtml + filters + '<section class="tac-section"><h2>' + esc(T.objects) + '</h2>' +
      (list.length ? list.map(function (o) { return objectRow(api, o); }).join('') : '<p class="tac-muted">' + esc(T.none) + '</p>') + '</section>';
  }

  // Marks and lines placed on the Fire panel of Series T, when the officer opts in.
  function notifyOwn(event, payload, api) {
    var c = api.ui.client;
    if (!prefs(api).publishOwn || c.status !== 'in' || !api.myLayer()) return;
    if (event === 'marker') {
      put(api, 'marker', { cat: payload.cat === 'custom' ? 'other' : 'plan', label: payload.label || '', x: payload.x, y: payload.y }, 'tm' + payload.id);
    } else if (event === 'shape') {
      put(api, payload.kind, { cat: 'plan', label: payload.label || '', points: payload.points.slice(0, api.ui.policy.limits.points), smooth: false }, 'ts' + payload.id);
    } else if (event === 'delete') {
      ['tm', 'ts'].forEach(function (prefix) {
        var o = c.room.objects[prefix + payload];
        if (o && !o.deleted) c.queue({ op: 'del', kind: o.kind, id: o.id });
      });
    }
  }

  root.TacRoomUI.register({
    id: 'draw',
    l10n: l10n,
    tabs: function (api) { return [{ id: 'layers', label: api.T().tabs.layers, narrow: false }]; },
    tools: toolsHtml,
    panel: function (id, api) { return layersHtml(api); },
    draw: drawAll,
    notify: notifyOwn,
    actions: {
      drawTool: function (el, api) {
        var tool = el.getAttribute('data-tool');
        if (st.tool === tool) { api.cancelPick(); st.tool = null; st.points = []; api.render(); return; }
        startTool(api, tool);
      },
      drawDone: function (el, api) { finishShape(api); },
      drawCancel: function (el, api) { api.cancelPick(); st.tool = null; st.points = []; api.render(); },
      drawStill: function (el, api) {
        api.ui.client.queue({ op: 'patch', kind: 'marker', id: el.getAttribute('data-id'), data: { confirmedAt: api.ui.client.serverNow() } });
      },
      drawRelay: function (el, api) {
        api.ui.client.queue({ op: 'patch', kind: 'marker', id: el.getAttribute('data-id'), data: { relayed: true } });
      },
      drawDelete: function (el, api) {
        var o = api.ui.client.merged().objects[el.getAttribute('data-id')];
        if (o) api.ui.client.queue({ op: 'del', kind: o.kind, id: o.id });
      },
      calPublish: function (el, api) {
        var ctx = api.ui.hooks.getContext();
        if (ctx.calibration) api.ui.client.queue({ op: 'put', kind: 'calibration', id: 'calibration', data: { offset: ctx.calibration.offset.slice() } });
      }
    },
    changes: {
      drawFilter: function (el, api) {
        var p = prefs(api), kind = el.getAttribute('data-kind'), key = el.getAttribute('data-key');
        var map = kind === 'layer' ? p.hidden : p.hiddenLevels;
        if (el.checked) delete map[key]; else map[key] = true;
        savePrefs(api, kind === 'layer' ? { hidden: map } : { hiddenLevels: map });
        api.render();
      },
      drawAge: function (el, api) { savePrefs(api, { maxAgeSec: parseInt(el.value, 10) || 0 }); api.render(); },
      drawPublishOwn: function (el, api) { savePrefs(api, { publishOwn: el.checked }); }
    },
    submits: {
      draw: function (form, api) { if (st.tool === 'line' || st.tool === 'area') finishShape(api); }
    },
    mount: function (api) {
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' || !(st.tool === 'line' || st.tool === 'area')) return;
        var tag = document.activeElement && document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
        finishShape(api);
        e.preventDefault();
      });
    }
  });
})(window);
```

- [ ] **Step 4: Append tool and filter styles to `tactical/room.css`**

```css
/* Task 6: drawing tools and filters */
.tac-room-drawform { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; width: 100%; margin-top: 6px; }
.tac-room-drawform .tac-input { flex: 1; min-width: 120px; }
.tac-room-checks { display: flex; flex-wrap: wrap; gap: 4px 12px; }
.tac-room-check { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; }
```

- [ ] **Step 5: Run the tests**

Run: `node scripts/test_room_seam.js && node scripts/test_room_logic.js && node scripts/test_room_client.js`
Expected: `OK seam`, `OK 15 groups`, `OK 10 cases`.

- [ ] **Step 6: Verify drawing in the demo**

Navigate the preview to `http://127.0.0.1:<port>/tactical.html?nocache=v6#map=stories_cm/lv624&room=demo`, create the demo room as in Task 5 Step 8, then with `javascript_tool`:

```js
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(12000);
const c = TacRoomUI.api.ui.client;
const before = { marks: c.visible({ kinds: ['marker'] }).length, lines: c.visible({ kinds: ['line'] }).length };
// A plan mark by tool.
document.querySelector('[data-room-action="drawTool"][data-tool="marker"]').click();
TacRoom.consumePick([62, -58]);
await wait(400);
// A two-point line by tool, finished with Done.
document.querySelector('[data-room-action="drawTool"][data-tool="line"]').click();
TacRoom.consumePick([40, -70]);
TacRoom.consumePick([50, -66]);
document.querySelector('[data-room-action="drawDone"]').click();
await wait(400);
// A freehand stroke across the middle of the map.
document.querySelector('[data-room-action="drawTool"][data-tool="freehand"]').click();
const cv = document.getElementById('tacRoomDraw'), r = cv.getBoundingClientRect();
const ev = (type, x) => cv.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, clientX: r.left + x, clientY: r.top + r.height / 2 + Math.sin(x / 30) * 20 }));
ev('pointerdown', r.width * 0.3);
for (let x = r.width * 0.3; x < r.width * 0.6; x += 6) ev('pointermove', x);
ev('pointerup', r.width * 0.6);
await wait(400);
({ before, marks: c.visible({ kinds: ['marker'] }).length, lines: c.visible({ kinds: ['line'] }).length, pending: c.pending.length })
```

Expected: `before.marks >= 1` and `before.lines >= 1` (the scripted enemy mark and staff plan), then `marks === before.marks + 1`, `lines === before.lines + 2`, `pending === 0`.

```js
document.querySelector('[data-room-action="tab"][data-tab="layers"]').click();
await new Promise(r => setTimeout(r, 300));
document.querySelector('[data-room-action="drawRelay"]').click();
await new Promise(r => setTimeout(r, 600));
TacRoomUI.api.ui.client.visible({ kinds: ['marker'] }).find(o => o.cat === 'enemy').relayed
```

Expected: `true`. Zoom the map to 12+ px per tile over LV-624's Nexus with the `+` button and take a `computer` screenshot: the scripted plan line is a smooth thick white curve, the tool line is thick and straight-segmented or smooth per the checkbox, the enemy mark is a hollow red triangle with «Противник · не передано» gone after relay.

- [ ] **Step 7: Commit**

```bash
git add tactical.html tactical/room-draw.js tactical/room.css scripts/test_room_seam.js
git commit -m "feat(tablet): shared marks, lines, areas and freehand in command-level signatures (V8)"
```

### Task 7: Requests with the fire card inside, and the asset board (V9)

**Files:**
- Modify: `scripts/test_room_seam.js` (script order)
- Modify: `tactical.html` (one script tag)
- Create: `tactical/room-requests.js`
- Modify: `tactical/room.css` (append requests and assets)

The fire card inside a request reuses Series T maths through `window.TacticalLogic.mortarFireChecks(planet, mortarTile, target, mortarConstants, mode)` → `{ok, reasons, warnings, distance, bounds}` and `worldToGame(offset, x, y)`; «Выстрел» calls the seam hook `fire(targetGame, dial)`, `tactical.js` records the shot and reports it back through `roomNotify('shot')`, which moves the taken request to `firing`.

- [ ] **Step 1: Extend the seam guard**

In `scripts/test_room_seam.js` replace

```js
const order = ['tactical/room-logic.js', 'tactical/room.js', 'tactical/room-ui.js', 'tactical/room-draw.js', 'tactical/tactical.js'];
```

with

```js
const order = ['tactical/room-logic.js', 'tactical/room.js', 'tactical/room-ui.js', 'tactical/room-draw.js', 'tactical/room-requests.js', 'tactical/tactical.js'];
```

Run: `node scripts/test_room_seam.js`
Expected: `AssertionError [ERR_ASSERTION]: tactical/room-requests.js is loaded`.

- [ ] **Step 2: Add the script tag**

In `tactical.html` replace

```html
<script src="tactical/room-draw.js?v=1" defer></script>
```

with

```html
<script src="tactical/room-draw.js?v=1" defer></script>
<script src="tactical/room-requests.js?v=1" defer></script>
```

Run: `node scripts/test_room_seam.js`
Expected: `OK seam`.

- [ ] **Step 3: Write `tactical/room-requests.js`**

```js
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// This file is part of Space Station Recipes.
// See LICENSE for details.
//
// Officers' room — strike and support requests (form, cards, the Series T fire
// card inside a taken mortar request), the manual asset board with cooldown
// hints, chips over the map, the request strip, target rings and a one-time
// sound for the asset owner. Registers into tactical/room-ui.js.
(function (root) {
  'use strict';

  var R = root.TacticalRoomLogic;
  var PREFS_KEY = 'chemdb-tactical:room-prefs';
  var TYPES = ['mortar', 'ob', 'cas', 'supply', 'medevac', 'other'];
  var ASSET_STATES = {
    mortar: ['deployed', 'moving', 'destroyed'], ob: ['ready', 'loading', 'cooldown'],
    dropship: ['offline', 'ship', 'toLz', 'onLz', 'flyby', 'cooldown'], supply: ['ready', 'cooldown'], medevac: ['available', 'unavailable']
  };
  var STATE_CLASS = { deployed: 'ready', ready: 'ready', available: 'ready', onLz: 'ready', ship: 'ready', moving: 'busy', loading: 'busy',
    toLz: 'busy', flyby: 'busy', cooldown: 'cooldown', offline: 'down', destroyed: 'down', unavailable: 'down' };
  var TYPE_COLOUR = { mortar: '#ffb627', ob: '#ff3d5a', cas: '#00e5ff', supply: '#39ff85', medevac: '#c17aff', other: '#e8ecf4' };
  var rq = { form: false, taken: null, target: null, denyAsk: null, seenMine: null, seenAll: null, flash: {}, audio: null };

  var l10n = {
    en: {
      tabs: { requests: 'Requests', assets: 'Assets' },
      toolRequest: 'Request', newRequest: 'New request', pickTarget: 'Pick on the map', coordsHint: 'or type X Y from the rangefinder',
      note: 'Note', urgent: 'Urgent', beacon: 'Beacon placed', send: 'Send', empty: 'No requests', min: 'min',
      needTarget: 'Pick a target first.', noCalibration: 'No calibration: pick the target on the map.',
      types: { mortar: 'Mortar', ob: 'OB', cas: 'CAS', supply: 'Supply drop', medevac: 'Medevac', other: 'Other' },
      statuses: { requested: 'requested', accepted: 'accepted', loaded: 'loaded', firing: 'firing', done: 'done', denied: 'denied' },
      firingBy: { mortar: 'shell in the air', ob: 'OB inbound', cas: 'fly-by', supply: 'crate inbound', medevac: 'en route', other: 'started' },
      actions: { accept: 'Accept', deny: 'Deny', cancel: 'Withdraw', take: 'Take target', load: 'Loaded', done: 'Done', repeat: 'Repeat',
        fire: { ob: 'Fire', cas: 'Fly-by', supply: 'Drop', medevac: 'En route', other: 'Started' } },
      denyReasons: ['no ammo', 'out of range', 'not allowed there', 'asset busy'], denyCancel: 'Back',
      withdrawn: 'withdrawn by the author', deniedByStaff: 'withdrawn by staff', impactIn: 'impact in', readyIn: 'ready in',
      fireCard: { distance: 'distance {d}', error: 'aim error ±{x} / ±{y}', noMortar: 'Place the mortar on the Fire panel first.',
        noCal: 'Calibrate the round on the Fire panel first.', shoot: 'Fire', calDiffers: 'The room calibration differs from yours: check the offset.',
        refused: { tooClose: 'too close', tooFar: 'too far', noArea: 'outside the map', landingZone: 'landing zone', covered: 'under a hive roof', noCas: 'no CAS in the area', noLasing: 'no lasing in the area' },
        warnings: { errorMayExceedMaxRange: 'the aim error may exceed the max range', errorMayUndercutMinRange: 'the aim error may undercut the min range', errorMayHitRefusedArea: 'the aim error box touches a refused area' } },
      assetNames: { mortar: 'Mortar {n}', ob: 'Orbital cannon', dropship: 'Dropship', supply: 'Supply drop', medevac: 'Medevac' },
      assetStates: {
        mortar: { deployed: 'deployed', moving: 'moving', destroyed: 'destroyed' }, ob: { ready: 'ready', loading: 'loading', cooldown: 'cooldown' },
        dropship: { offline: 'no pilot', ship: 'on the ship', toLz: 'to LZ', onLz: 'on LZ', flyby: 'fly-by', cooldown: 'cooldown' },
        supply: { ready: 'ready', cooldown: 'cooldown' }, medevac: { available: 'available', unavailable: 'unavailable' }
      },
      claim: 'Crew', unclaim: 'Release', shell: 'Shell', sounds: 'Sound for requests to my assets',
      chipMortar: 'Mortars', chipNames: { ob: 'OB', dropship: 'CAS', supply: 'Supply' }, chipRequests: 'Requests {n}'
    },
    ru: {
      tabs: { requests: 'Запросы', assets: 'Ресурсы' },
      toolRequest: 'Запрос', newRequest: 'Новый запрос', pickTarget: 'Указать на карте', coordsHint: 'или введите X Y с дальномера',
      note: 'Заметка', urgent: 'Срочно', beacon: 'Маяк поставлен', send: 'Отправить', empty: 'Запросов нет', min: 'мин',
      needTarget: 'Сначала укажите цель.', noCalibration: 'Нет калибровки: укажите цель на карте.',
      types: { mortar: 'Миномёт', ob: 'ОБ', cas: 'КАС', supply: 'Поставка', medevac: 'Эвакуация', other: 'Прочее' },
      statuses: { requested: 'запрошен', accepted: 'принят', loaded: 'заряжено', firing: 'огонь', done: 'выполнен', denied: 'отклонён' },
      firingBy: { mortar: 'снаряд в полёте', ob: 'ОБ летит', cas: 'облёт', supply: 'ящик летит', medevac: 'в пути', other: 'начато' },
      actions: { accept: 'Принять', deny: 'Отклонить', cancel: 'Снять', take: 'Взять цель', load: 'Заряжено', done: 'Выполнено', repeat: 'Повторить',
        fire: { ob: 'Выстрел', cas: 'Облёт', supply: 'Сброс', medevac: 'В пути', other: 'Начато' } },
      denyReasons: ['нет снарядов', 'вне дальности', 'там нельзя', 'ресурс занят'], denyCancel: 'Назад',
      withdrawn: 'снят автором', deniedByStaff: 'отозвано штабом', impactIn: 'удар через', readyIn: 'готово через',
      fireCard: { distance: 'дальность {d}', error: 'ошибка прицела ±{x} / ±{y}', noMortar: 'Сначала поставьте миномёт на панели «Огонь».',
        noCal: 'Сначала откалибруйте раунд на панели «Огонь».', shoot: 'Выстрел', calDiffers: 'Калибровка комнаты отличается от вашей: проверьте сдвиг.',
        refused: { tooClose: 'слишком близко', tooFar: 'слишком далеко', noArea: 'вне карты', landingZone: 'зона посадки', covered: 'под крышей улья', noCas: 'КАС в зоне нельзя', noLasing: 'лазер в зоне нельзя' },
        warnings: { errorMayExceedMaxRange: 'ошибка прицела может вывести за максимальную дальность', errorMayUndercutMinRange: 'ошибка прицела может дать недолёт до минимальной дальности', errorMayHitRefusedArea: 'коробка ошибки задевает запрещённую зону' } },
      assetNames: { mortar: 'Миномёт {n}', ob: 'Орудие ОБ', dropship: 'Десантный корабль', supply: 'Поставка', medevac: 'Эвакуация' },
      assetStates: {
        mortar: { deployed: 'развёрнут', moving: 'в пути', destroyed: 'уничтожен' }, ob: { ready: 'готов', loading: 'заряжается', cooldown: 'перезарядка' },
        dropship: { offline: 'нет пилота', ship: 'на корабле', toLz: 'летит к LZ', onLz: 'на LZ', flyby: 'облёт', cooldown: 'перезарядка' },
        supply: { ready: 'готова', cooldown: 'перезарядка' }, medevac: { available: 'доступна', unavailable: 'недоступна' }
      },
      claim: 'Расчёт', unclaim: 'Отпустить', shell: 'Снаряд', sounds: 'Звук на запросы к моим ресурсам',
      chipMortar: 'Миномёты', chipNames: { ob: 'ОБ', dropship: 'КАС', supply: 'Поставка' }, chipRequests: 'Запросы {n}'
    }
  };

  // ── data ─────────────────────────────────────────────

  function claimsFor(api, req) { return { claimed: R.claimants(api.ui.client.merged().objects, req) }; }
  function actionsFor(api, req) { return R.requestActions(api.ui.policy, api.me(), req, claimsFor(api, req)); }
  function constants(api) { var ctx = api.ui.hooks.getContext(); return ctx.fork ? ctx.fork.constants : null; }
  function getReq(api, el) { return api.ui.client.merged().objects[el.getAttribute('data-id')] || null; }
  function isOpen(r) { return r.status !== 'done' && r.status !== 'denied'; }

  function deadlineOf(api, req) {
    var c = constants(api);
    if (req.status !== 'firing' || !req.firedAt || !c) return null;
    if (req.type === 'mortar' || req.type === 'ob') return R.deadlines(req.type, req.firedAt, c, api.ui.policy).impactAt;
    if (req.type === 'cas') return R.deadlines('dropship', req.firedAt, c, api.ui.policy).readyAt;
    return null;
  }

  // The latest cooldown hint for an asset from its last fired request; hints never change states.
  function readyAt(api, assetType) {
    var c = constants(api), reqType = { ob: 'ob', supply: 'supply', dropship: 'cas' }[assetType], best = null;
    if (!reqType || !c) return null;
    api.ui.client.visible({ kinds: ['request'] }).forEach(function (r) {
      if (r.type !== reqType || !r.firedAt) return;
      var d = R.deadlines(assetType === 'dropship' ? 'dropship' : reqType, r.firedAt, c, api.ui.policy).readyAt;
      if (d && (!best || d > best)) best = d;
    });
    return best && best > api.ui.client.serverNow() ? best : null;
  }

  function assetRows(api) {
    var objs = api.ui.client.merged().objects, rows = [];
    api.ui.policy.assets.forEach(function (def) {
      for (var n = 1; n <= (def.count || 1); n++) {
        var id = 'asset-' + def.type + '-' + n, o = objs[id];
        rows.push({ id: id, def: def, n: n, obj: o && !o.deleted ? o : null });
      }
    });
    return rows;
  }

  function canEdit(api, row) {
    var me = api.me(), P = api.ui.policy, o = row.obj || {};
    if (!me || !me.confirmed || api.ui.client.status !== 'in' || !R.layerWritable(P, me, 'assets')) return false;
    return row.def.owner === me.post || R.isStaff(P, me) || o.claimedBy === me.client;
  }

  function mortarRadius(api) {
    var best = null;
    assetRows(api).forEach(function (row) {
      if (row.def.type === 'mortar' && row.obj && row.obj.radius && row.obj.state === 'deployed') best = Math.max(best || 0, row.obj.radius);
    });
    return best;
  }

  function patchStatus(api, req, status, data) {
    var d = { status: status };
    Object.keys(data || {}).forEach(function (k) { d[k] = data[k]; });
    return api.ui.client.queue({ op: 'patch', kind: 'request', id: req.id, expectedStatus: req.status, data: d });
  }

  function queueRequest(api, type, target, note, urgent, flags) {
    var ctx = api.ui.hooks.getContext();
    return api.ui.client.queue({
      op: 'put', kind: 'request', id: 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      data: { type: type, target: { x: target[0], y: target[1] }, note: note || '', priority: urgent ? 'urgent' : 'normal',
        flags: flags || [], level: ctx.level || 0, h: ctx.meta ? ctx.meta.h : '' }
    });
  }

  // ── HTML ─────────────────────────────────────────────

  function actionButton(api, action, req) {
    var T = api.T();
    var label = action === 'fire' ? (T.actions.fire[req.type] || T.actions.fire.other) : T.actions[action];
    var big = action === 'take' || action === 'accept' || action === 'fire' || action === 'load';
    return api.btn('req-' + action, label, { id: req.id }, big ? 'big' : '');
  }

  function fireCardHtml(api, req) {
    var F = api.T().fireCard, ctx = api.ui.hooks.getContext(), L = root.TacticalLogic, esc = api.esc;
    if (!ctx.calibration) return '<div class="tac-room-fire"><p class="tac-msg warn">' + esc(F.noCal) + '</p></div>';
    if (!ctx.mortar) return '<div class="tac-room-fire"><p class="tac-msg warn">' + esc(F.noMortar) + '</p></div>';
    var tile = [req.target.x, req.target.y];
    var checks = L.mortarFireChecks(ctx.planet, ctx.mortar.tile, tile, ctx.fork.constants.mortar, ctx.mortar.mode);
    var game = L.worldToGame(ctx.calibration.offset, tile[0], tile[1]);
    var room = api.offset();
    var html = '<div class="tac-room-fire-coords">' + game[0] + ' ' + game[1] + '</div>' +
      '<div class="tac-muted">' + esc(api.fmt(F.distance, { d: checks.distance.toFixed(1) })) + ' · ' +
      esc(api.fmt(F.error, { x: checks.bounds[0], y: checks.bounds[1] })) + '</div>' +
      checks.reasons.map(function (r) { return '<p class="tac-msg error">' + esc(F.refused[r] || r) + '</p>'; }).join('') +
      checks.warnings.map(function (w) { return '<p class="tac-msg warn">' + esc(F.warnings[w] || w) + '</p>'; }).join('') +
      (room && (room[0] !== ctx.calibration.offset[0] || room[1] !== ctx.calibration.offset[1]) ? '<p class="tac-msg warn">' + esc(F.calDiffers) + '</p>' : '');
    return '<div class="tac-room-fire">' + html + (checks.ok ? api.btn('reqShoot', F.shoot, { id: req.id }, 'big') : '') + '</div>';
  }

  function cardHtml(api, req, compact) {
    var T = api.T(), c = api.ui.client, esc = api.esc, P = api.ui.policy;
    var acts = c.status === 'in' ? actionsFor(api, req) : [];
    var who = req.by ? api.postName(req.by.post) + (req.by.squad ? ' · ' + api.squadName(req.by.squad) : '') : '';
    var age = Math.max(0, Math.round((c.serverNow() - req.at) / 60000));
    var dl = deadlineOf(api, req);
    var byStaff = req.status === 'denied' && req.deniedBy && req.by && req.deniedBy.client !== req.by.client &&
      R.levelOf(P, req.deniedBy.post) === 'staff';
    var status = req.status === 'firing' ? (T.firingBy[req.type] || T.statuses.firing) : (byStaff ? T.deniedByStaff : T.statuses[req.status]);
    var head = '<b>' + esc(T.types[req.type]) + '</b> <span class="tac-item-coords">' + esc(api.gameText(req.target.x, req.target.y)) + '</span> · ' +
      '<span class="tac-room-status">' + esc(status) + '</span>' +
      (dl ? ' · ' + esc(req.type === 'cas' ? T.readyIn : T.impactIn) + ' <span data-deadline="' + dl + '"></span>' : '');
    var flash = rq.flash[req.id] && rq.flash[req.id] > Date.now() ? ' flash' : '';
    if (compact) {
      return '<div class="tac-room-card' + (req.priority === 'urgent' ? ' urgent' : '') + flash + '" data-room-action="reqFocus" data-id="' + esc(req.id) + '">' +
        head + '<div class="tac-muted">' + esc(who) + ' · ' + age + ' ' + esc(T.min) + '</div>' + (acts[0] ? actionButton(api, acts[0], req) : '') + '</div>';
    }
    var details = esc(who) + ' · ' + age + ' ' + esc(T.min) + (req.note ? ' · ' + esc(req.note) : '') +
      ((req.flags || []).indexOf('beacon') >= 0 ? ' · ' + esc(T.beacon) : '') + (req.reason && !byStaff ? ' · ' + esc(req.reason) : '');
    var actionsHtml = rq.denyAsk === req.id
      ? '<div class="tac-room-actions">' + T.denyReasons.map(function (r) { return api.btn('reqDenyReason', r, { id: req.id, reason: r }); }).join('') +
        api.btn('reqDenyCancel', T.denyCancel) + '</div>'
      : '<div class="tac-room-actions">' + acts.map(function (a) { return actionButton(api, a, req); }).join('') + '</div>';
    return '<div class="tac-room-req st-' + req.status + (req.priority === 'urgent' ? ' urgent' : '') + (req.pending ? ' faded' : '') + '" style="--req:' + TYPE_COLOUR[req.type] + '">' +
      '<div>' + head + '</div><div class="tac-muted">' + details + '</div>' + actionsHtml +
      (rq.taken === req.id ? fireCardHtml(api, req) : '') + '</div>';
  }

  function formHtml(api) {
    var T = api.T(), esc = api.esc, type = api.draft('request', 'type', 'mortar'), t = rq.target;
    return '<section class="tac-section tac-room-reqform"><h2>' + esc(T.newRequest) + '</h2>' +
      '<div class="tac-room-types">' + TYPES.map(function (k, i) { return api.btn('reqType', (i + 1) + ' ' + T.types[k], { type: k }, k === type ? 'on' : ''); }).join('') + '</div>' +
      '<form data-room-form="request" class="tac-room-form">' +
      '<div class="tac-room-target">' + api.btn('reqPick', T.pickTarget, null, 'big') +
      '<span class="tac-item-coords">' + (t ? esc(api.gameText(t[0], t[1])) : '—') + '</span></div>' +
      '<label class="tac-input-label">' + esc(T.coordsHint) + '<input class="tac-input" name="coords" autocomplete="off" value="' + esc(api.draft('request', 'coords', '')) + '"></label>' +
      '<label class="tac-input-label">' + esc(T.note) + '<input class="tac-input" name="note" maxlength="' + api.ui.policy.limits.note + '" value="' + esc(api.draft('request', 'note', '')) + '"></label>' +
      '<label class="tac-room-check"><input type="checkbox" name="urgent"' + (api.draft('request', 'urgent', false) ? ' checked' : '') + '> ' + esc(T.urgent) + '</label>' +
      (type === 'supply' ? '<label class="tac-room-check"><input type="checkbox" name="beacon"' + (api.draft('request', 'beacon', false) ? ' checked' : '') + '> ' + esc(T.beacon) + '</label>' : '') +
      '<button type="submit" class="btn-small tac-room-btn big">' + esc(T.send) + '</button></form></section>';
  }

  function requestsHtml(api) {
    var list = api.ui.client.requests();
    return (rq.form && api.ui.client.status === 'in' ? formHtml(api) : '') +
      (list.length ? list.map(function (r) { return cardHtml(api, r, false); }).join('') : '<p class="tac-muted">' + api.esc(api.T().empty) + '</p>');
  }

  function assetsHtml(api) {
    var T = api.T(), ctx = api.ui.hooks.getContext(), me = api.me(), c = api.ui.client, P = api.ui.policy, esc = api.esc;
    var shells = (ctx.fork && ctx.fork.constants.shells) || [];
    var rows = assetRows(api).map(function (row) {
      var o = row.obj || {}, def = row.def, editable = canEdit(api, row), ready = readyAt(api, def.type);
      var stateButtons = editable ? (ASSET_STATES[def.type] || []).map(function (s) {
        return api.btn('assetState', T.assetStates[def.type][s], { id: row.id, state: s }, o.state === s ? 'on' : '');
      }).join('') : '';
      var claim = '';
      if (def.claimable && me && me.confirmed && c.status === 'in') {
        if (o.claimedBy === me.client) claim = api.btn('assetClaim', T.unclaim, { id: row.id, release: '1' });
        else if (!o.claimedBy && ((me.functions || []).indexOf('mortar') >= 0 || R.levelOf(P, me.post) !== 'squad')) claim = api.btn('assetClaim', T.claim, { id: row.id });
      }
      var crew = o.claimedBy ? c.member(o.claimedBy) : null;
      var shellSelect = def.type === 'mortar' && editable && shells.length
        ? '<select class="tac-select" data-room-change="assetShell" data-id="' + row.id + '"><option value="">' + esc(T.shell) + '</option>' +
          shells.map(function (s) { return '<option value="' + esc(s.id) + '"' + (o.shell === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('') + '</select>'
        : '';
      return '<div class="tac-room-row"><span class="tac-room-name"><b>' + esc(api.fmt(T.assetNames[def.type], { n: row.n })) + '</b> · ' +
        '<span class="tac-room-state ' + (STATE_CLASS[o.state] || '') + '">' + esc(o.state ? T.assetStates[def.type][o.state] : '—') + '</span>' +
        (ready ? ' · ' + esc(T.readyIn) + ' <span data-deadline="' + ready + '"></span>' : '') +
        (o.radius ? ' <span class="tac-muted">· r ' + o.radius + '</span>' : '') +
        (crew ? '<br><span class="tac-muted">' + esc(T.claim) + ': ' + esc(api.postName(crew.post) + (crew.callsign ? ' «' + crew.callsign + '»' : '')) + '</span>' : '') +
        '</span><span class="tac-room-actions">' + stateButtons + claim + shellSelect + '</span></div>';
    }).join('');
    var p = api.ui.storage.read(PREFS_KEY) || {};
    return rows + '<label class="tac-room-check"><input type="checkbox" data-room-change="reqSounds"' + (p.sounds !== false ? ' checked' : '') + '> ' + esc(T.sounds) + '</label>';
  }

  function chipsHtml(api) {
    var T = api.T(), esc = api.esc, rows = assetRows(api), out = '';
    var mortars = rows.filter(function (r) { return r.def.type === 'mortar'; });
    if (mortars.length) {
      var up = mortars.filter(function (r) { return r.obj && r.obj.state === 'deployed'; }).length;
      out += '<button type="button" class="tac-room-chip ' + (up ? 'ready' : 'cooldown') + '" data-room-action="assetsTab">' + esc(T.chipMortar + ' ' + up + '/' + mortars.length) + '</button>';
    }
    ['ob', 'dropship', 'supply'].forEach(function (type) {
      var row = rows.filter(function (r) { return r.def.type === type; })[0];
      if (!row) return;
      var o = row.obj || {}, ready = readyAt(api, type);
      out += '<button type="button" class="tac-room-chip ' + (STATE_CLASS[o.state] || '') + '" data-room-action="assetsTab">' +
        esc(T.chipNames[type] + ' ' + (o.state ? T.assetStates[type][o.state] : '—')) + (ready ? ' <span data-deadline="' + ready + '"></span>' : '') + '</button>';
    });
    var open = api.ui.client.requests().filter(isOpen).length;
    return out + '<button type="button" class="tac-room-chip' + (open ? ' busy' : '') + '" data-room-action="tab" data-tab="requests">' + esc(api.fmt(T.chipRequests, { n: open })) + '</button>';
  }

  function stripHtml(api) {
    var open = api.ui.client.requests().filter(isOpen).slice(0, 6);
    return open.length ? open.map(function (r) { return cardHtml(api, r, true); }).join('') : '<span class="tac-muted">' + api.esc(api.T().empty) + '</span>';
  }

  // ── map, sound, keyboard ────────────────────────────────────────

  function drawRings(ctx, v, api) {
    var level = api.ui.hooks.getContext().level || 0, radius = mortarRadius(api);
    api.ui.client.requests().forEach(function (r) {
      if (!isOpen(r) || (r.level || 0) !== level) return;
      var p = v.worldToScreen(r.target.x + 0.5, r.target.y + 0.5), rad = Math.max(9, v.scale * 0.9);
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = r.priority === 'urgent' ? 3 : 2;
      ctx.strokeStyle = TYPE_COLOUR[r.type];
      ctx.beginPath();
      ctx.arc(p[0], p[1], rad, 0, Math.PI * 2);
      ctx.stroke();
      if (r.type === 'mortar' && radius) {
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(p[0], p[1], radius * v.scale, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    });
    if (rq.target) {
      var q = v.worldToScreen(rq.target[0] + 0.5, rq.target[1] + 0.5);
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#e8ecf4';
      ctx.beginPath();
      ctx.arc(q[0], q[1], Math.max(9, v.scale * 0.9), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function beep(api) {
    var p = api.ui.storage.read(PREFS_KEY) || {};
    if (p.sounds === false) return;
    try {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      rq.audio = rq.audio || new AC();
      var o = rq.audio.createOscillator(), g = rq.audio.createGain();
      o.frequency.value = 660;
      g.gain.value = 0.06;
      o.connect(g);
      g.connect(rq.audio.destination);
      o.start();
      o.stop(rq.audio.currentTime + 0.15);
    } catch (e) { /* no audio device */ }
  }

  function tick(api) {
    var c = api.ui.client, me = api.me();
    if (!c || c.status !== 'in' || !me) { rq.seenMine = null; rq.seenAll = null; return; }
    var open = c.requests().filter(function (r) { return r.status === 'requested' && !(r.by && r.by.client === me.client); });
    var all = open.map(function (r) { return r.id; });
    var mine = open.filter(function (r) { return actionsFor(api, r).indexOf('accept') >= 0; }).map(function (r) { return r.id; });
    if (rq.seenAll) {
      var fresh = all.filter(function (id) { return rq.seenAll.indexOf(id) < 0; });
      fresh.forEach(function (id) { rq.flash[id] = Date.now() + 3000; });
      if (fresh.length) api.render();
    }
    if (rq.seenMine && mine.some(function (id) { return rq.seenMine.indexOf(id) < 0; })) beep(api);
    rq.seenAll = all;
    rq.seenMine = mine;
  }

  root.TacRoomUI.register({
    id: 'requests',
    l10n: l10n,
    tabs: function (api) {
      var T = api.T();
      return [{ id: 'requests', label: T.tabs.requests, narrow: true }, { id: 'assets', label: T.tabs.assets, narrow: true }];
    },
    tools: function (api) {
      var me = api.me();
      return me && me.confirmed && api.ui.client.status === 'in' ? api.btn('reqNew', api.T().toolRequest, null, rq.form ? 'on big' : 'big') : '';
    },
    panel: function (id, api) { return id === 'assets' ? assetsHtml(api) : requestsHtml(api); },
    chips: chipsHtml,
    strip: stripHtml,
    draw: drawRings,
    tick: tick,
    notify: function (event, payload, api) {
      if (event !== 'shot' || !rq.taken) return;
      var r = api.ui.client.merged().objects[rq.taken];
      if (r && (r.status === 'accepted' || r.status === 'loaded')) patchStatus(api, r, 'firing');
      rq.taken = null;
    },
    actions: {
      reqNew: function (el, api) { rq.form = !rq.form; api.ui.tab = 'requests'; api.ui.shelf = false; api.render(); },
      reqType: function (el, api) { api.ui.drafts['request.type'] = el.getAttribute('data-type'); api.render(); },
      reqPick: function (el, api) { api.setPick('request', function (tile) { rq.target = tile.slice(); api.render(); }, api.T().pickTarget); },
      'req-accept': function (el, api) { var r = getReq(api, el); if (r) patchStatus(api, r, 'accepted'); },
      'req-deny': function (el, api) { rq.denyAsk = el.getAttribute('data-id'); api.render(); },
      reqDenyReason: function (el, api) { var r = getReq(api, el); rq.denyAsk = null; if (r) patchStatus(api, r, 'denied', { reason: el.getAttribute('data-reason') }); },
      reqDenyCancel: function (el, api) { rq.denyAsk = null; api.render(); },
      'req-cancel': function (el, api) { var r = getReq(api, el); if (r) patchStatus(api, r, 'denied', { reason: api.T().withdrawn }); },
      'req-take': function (el, api) {
        var r = getReq(api, el);
        if (!r) return;
        rq.taken = r.id;
        api.ui.hooks.takeTarget([r.target.x, r.target.y]);
        api.render();
      },
      'req-load': function (el, api) { var r = getReq(api, el); if (r) patchStatus(api, r, 'loaded'); },
      'req-fire': function (el, api) { var r = getReq(api, el); if (r) patchStatus(api, r, 'firing'); },
      'req-done': function (el, api) {
        var r = getReq(api, el);
        if (!r) return;
        patchStatus(api, r, 'done');
        api.track('room_request_done');
        if (rq.taken === r.id) rq.taken = null;
      },
      'req-repeat': function (el, api) {
        var r = getReq(api, el);
        if (r) queueRequest(api, r.type, [r.target.x, r.target.y], r.note, r.priority === 'urgent', r.flags);
      },
      reqShoot: function (el, api) {
        var r = getReq(api, el), ctx = api.ui.hooks.getContext();
        if (!r || !ctx.calibration) return;
        var game = root.TacticalLogic.worldToGame(ctx.calibration.offset, r.target.x, r.target.y);
        api.ui.hooks.fire(game, [0, 0]);   // tactical.js records the shot and calls roomNotify('shot')
      },
      reqFocus: function (el, api) {
        var r = getReq(api, el), v = api.ui.hooks.view;
        if (!r) return;
        v.centerOn(r.target.x + 0.5, r.target.y + 0.5, Math.max(v.scale, 8));
        api.ui.tab = 'requests';
        api.render();
      },
      assetState: function (el, api) {
        api.ui.client.queue({ op: 'patch', kind: 'asset', id: el.getAttribute('data-id'), data: { state: el.getAttribute('data-state') } });
      },
      assetClaim: function (el, api) {
        var me = api.me();
        if (!me) return;
        api.ui.client.queue({ op: 'patch', kind: 'asset', id: el.getAttribute('data-id'), data: { claimedBy: el.getAttribute('data-release') ? null : me.client } });
      },
      assetsTab: function (el, api) { api.ui.tab = 'assets'; api.ui.shelf = false; api.render(); }
    },
    changes: {
      assetShell: function (el, api) {
        var ctx = api.ui.hooks.getContext();
        var s = ((ctx.fork && ctx.fork.constants.shells) || []).filter(function (x) { return x.id === el.value; })[0];
        api.ui.client.queue({ op: 'patch', kind: 'asset', id: el.getAttribute('data-id'),
          data: { shell: el.value || null, radius: s && typeof s.radius === 'number' ? s.radius : null } });
      },
      reqSounds: function (el, api) {
        var p = api.ui.storage.read(PREFS_KEY) || {};
        p.sounds = el.checked;
        api.ui.storage.write(PREFS_KEY, p);
      }
    },
    submits: {
      request: function (form, api) {
        var T = api.T(), f = form.elements, target = rq.target;
        var typed = String(f.coords.value || '').trim().match(/^(-?\d+)[\s,;]+(-?\d+)$/);
        if (typed) {
          var w = api.toWorld(+typed[1], +typed[2]);
          if (!w) { api.toast(T.noCalibration); return; }
          target = w;
        }
        if (!target) { api.toast(T.needTarget); return; }
        var type = api.draft('request', 'type', 'mortar');
        queueRequest(api, type, target, f.note.value, f.urgent.checked, type === 'supply' && f.beacon && f.beacon.checked ? ['beacon'] : []);
        rq.form = false;
        rq.target = null;
        api.clearDrafts('request');
        api.render();
      }
    },
    mount: function (api) {
      document.addEventListener('keydown', function (e) {
        if (!api.ui.on || !rq.form || !/^[1-6]$/.test(e.key)) return;
        var tag = document.activeElement && document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
        api.ui.drafts['request.type'] = TYPES[+e.key - 1];
        api.render();
        e.preventDefault();
      });
    }
  });
})(window);
```

- [ ] **Step 4: Append request and asset styles to `tactical/room.css`**

```css
/* Task 7: requests, cards, fire card, assets */
.tac-room-btn.big { min-height: 44px; min-width: 88px; font-size: 14px; }
.tac-room-req {
  border: 1px solid var(--border-subtle);
  border-left: 3px solid var(--req, var(--border-active));
  border-radius: 6px;
  padding: 8px;
  margin: 8px 0;
}
.tac-room-req.urgent { box-shadow: inset 0 0 0 1px var(--red-alert); }
.tac-room-req.st-done, .tac-room-req.st-denied, .tac-room-req.faded { opacity: 0.6; }
.tac-room-req .tac-room-actions { margin-top: 6px; }
.tac-room-status { color: var(--text-bright); }
.tac-room-card {
  flex: none;
  width: 280px;
  min-height: 52px;
  padding: 6px 8px;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background: var(--panel-raised);
  cursor: pointer;
  font-size: 13px;
}
.tac-room-card.urgent { border-color: var(--red-alert); }
.tac-room-card.flash { animation: tac-room-flash 1s ease-in-out 3; }
@keyframes tac-room-flash { 50% { border-color: var(--amber); box-shadow: 0 0 0 2px var(--amber-dim); } }
.tac-room-types { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px; }
.tac-room-target { display: flex; gap: 8px; align-items: center; }
.tac-room-fire { margin-top: 8px; padding: 8px; border: 1px dashed var(--amber); border-radius: 6px; }
.tac-room-fire-coords { font: 700 22px ui-monospace, "Cascadia Mono", Consolas, monospace; color: var(--text-bright); }
.tac-room-state.ready { color: var(--phosphor); }
.tac-room-state.busy { color: var(--amber); }
.tac-room-state.cooldown { color: var(--text-ghost); }
.tac-room-state.down { color: var(--red-alert); }
```

- [ ] **Step 5: Run the tests**

Run: `node scripts/test_room_seam.js && node scripts/test_room_logic.js && node scripts/test_room_client.js && node scripts/test_room_worker.mjs`
Expected: `OK seam`, `OK 15 groups`, `OK 10 cases`, `OK 20 cases`.

- [ ] **Step 6: Verify the request loop in the demo**

Navigate to `http://127.0.0.1:<port>/tactical.html?nocache=v7#map=stories_cm/lv624&room=demo`, create the demo room, wait 26 s for the script, then with `javascript_tool`:

```js
const wait = ms => new Promise(r => setTimeout(r, ms));
const c = TacRoomUI.api.ui.client;
document.querySelector('[data-room-action="tab"][data-tab="requests"]').click();
await wait(300);
const r1 = c.requests().find(r => r.id === 'demo-req-1');
// CO is staff: the accepted mortar request offers take, done, deny.
const offered = [...document.querySelectorAll('[data-room-action^="req-"][data-id="demo-req-1"]')].map(b => b.dataset.roomAction);
document.querySelector('[data-room-action="req-take"][data-id="demo-req-1"]').click();
await wait(300);
const fireCard = document.querySelector('.tac-room-fire').textContent;
// A new OB request through the form, target picked on the map.
document.querySelector('[data-room-action="reqNew"]').click();
await wait(200);
document.querySelector('[data-room-action="reqType"][data-type="ob"]').click();
await wait(200);
document.querySelector('[data-room-action="reqPick"]').click();
TacRoom.consumePick([70, -70]);
await wait(200);
document.querySelector('[data-room-form="request"] button[type="submit"]').click();
await wait(600);
const ob = c.requests().find(r => r.type === 'ob');
({ status1: r1.status, offered, fireCard, obStatus: ob && ob.status, strip: document.querySelectorAll('#tacRoomStrip .tac-room-card').length })
```

Expected: `status1` is `accepted`; `offered` equals `['req-take', 'req-done', 'req-deny']`; `fireCard` contains the «поставьте миномёт» or «откалибруйте» warning (no mortar is placed on the Fire panel in the demo); `obStatus` is `requested`; `strip` is at least 3.

```js
const wait = ms => new Promise(r => setTimeout(r, ms));
const c = TacRoomUI.api.ui.client;
const id = c.requests().find(r => r.type === 'ob').id;
for (const step of ['req-accept', 'req-load', 'req-fire']) {
  document.querySelector(`[data-room-action="${step}"][data-id="${id}"]`).click();
  await wait(600);
}
({ status: c.requests().find(r => r.id === id).status, countdown: !!document.querySelector('[data-deadline]') })
```

Expected: `{ status: 'firing', countdown: true }` — the staff CO accepts, loads (staff counts as loader) and fires; the card shows «удар через 0:2x». Take a screenshot with the strip and chips visible.

- [ ] **Step 7: End-to-end with the local Worker and two officers**

1. In a terminal with `worker/.dev.vars` from Task 3 Step 13: `cd worker && npx wrangler dev --port 8787 --var ALLOWED_ORIGINS:http://127.0.0.1:<preview-port>`.
2. Token: `ROOM_KEY_SECRET=local-secret node scripts/room_token.mjs stories-k1 stories_cm "Space Stories - Marine Corps Core"` — copy the token line.
3. Tab A (`tabs_create`, navigate): `http://127.0.0.1:<port>/tactical.html?nocache=e2e#map=stories_cm/lv624&client=officer-aaaa-01`; with `javascript_tool` run `localStorage.setItem('chemdb-tactical:room-dev', JSON.stringify({ url: 'http://127.0.0.1:8787' })); location.reload();`, then turn the room on (`document.getElementById('tacRoomToggle').click()`), open «Создать комнату», paste the token into `token`, submit. Read `TacRoomUI.api.ui.client.code` and the SL Bravo code from `TacRoomUI.api.ui.client.sheet`.
4. Tab B: `http://127.0.0.1:<port>/tactical.html?nocache=e2e2#map=stories_cm/lv624&client=officer-bbbb-02&room=<CODE>` (the dev flag is already in localStorage), turn the room on, set the `entry` input to `<CODE>-<SLCODE>`, submit. Expected in B: `.tac-room-word` shows a word.
5. Tab A: roster tab, click «Подтвердить». Expected within 3 s in B: `TacRoomUI.api.ui.client.status === 'in'`.
6. Tab B: request tab → «Новый запрос» → mortar → `TacRoom.consumePick([62, -62])` → send. Expected in A within 3 s: the request card appears with «Принять».
7. Tab A: «Принять». Expected in B: status `принят`. Tab A: «Радиомолчание». Expected in B: the frozen banner, and a new request attempt toasts «Радиомолчание.».
8. Tab A: «Скачать журнал» — expected two downloads; open the `.txt` and check a line `… Командир отряда Браво  запрос mortar …`.

Record the room code and a screenshot of both tabs in the task notes. Stop `wrangler dev` afterwards.

- [ ] **Step 8: Commit**

```bash
git add tactical.html tactical/room-requests.js tactical/room.css scripts/test_room_seam.js
git commit -m "feat(tablet): requests with the fire card inside, asset board, chips and strip (V9)"
```

### Task 8: Half-monitor layout (V10)

**Files:**
- Modify: `tactical/room.css` (append the narrow layout)

The decision record fixes the budget for a window about 900 px wide and 1000 px tall beside the game's pop-out windows: header 36, chips 28 over the map, map ≈500, request strip 64, panel 300 with its own scroll, no page scroll, footer hidden, only «Запросы» and «Ресурсы» tabs with the roster and layers on the chip shelf, 44 px targets for the main actions (`.tac-room-btn.big`, Task 7). `tactical.css`'s own `@media (max-width: 900px)` is not reused.

- [ ] **Step 1: Append the narrow layout to `tactical/room.css`**

```css
/* Task 8: half-monitor (≤1100 px). The page never scrolls; map, strip and panel scroll on their own. */
@media (max-width: 1100px) {
  body.tac-room-on { height: 100vh; overflow: hidden; }
  body.tac-room-on .lib-footer { display: none; }
  body.tac-room-on .tac-layout {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) 300px;
    padding: 0 8px 8px;
    min-height: 0;
    overflow: hidden;
  }
  body.tac-room-on .tac-map-wrap { min-height: 0; grid-column: 1; grid-row: 1; }
  body.tac-room-on .tac-canvas-box { min-height: 0; }
  body.tac-room-on .tac-room-strip { flex: none; height: 64px; min-height: 64px; overflow-y: hidden; }
  body.tac-room-on .tac-room-strip .tac-room-card { height: 52px; overflow: hidden; }
  body.tac-room-on .tac-room-panel {
    grid-column: 1;
    grid-row: 2;
    max-height: 300px;
    min-height: 0;
    overflow-y: auto;
  }
  body.tac-room-on .tac-toolbar { flex-wrap: nowrap; overflow-x: auto; }
}
```

- [ ] **Step 2: Verify at 900 × 1000 in the preview**

Navigate to `http://127.0.0.1:<port>/tactical.html?nocache=v8#map=stories_cm/lv624&room=demo`, `resize_window` to `{ width: 900, height: 1000 }`, reload, create the demo room, wait 26 s, then:

```js
const box = id => document.getElementById(id).getBoundingClientRect();
({
  pageScroll: document.documentElement.scrollHeight - innerHeight,
  map: Math.round(document.querySelector('.tac-canvas-box').getBoundingClientRect().height),
  strip: Math.round(box('tacRoomStrip').height),
  panel: Math.round(box('tacRoom').height),
  tabs: [...document.querySelectorAll('#tacRoom [data-room-action="tab"]')].map(b => b.dataset.tab),
  chipShelf: !!document.querySelector('#tacRoomChips [data-room-action="shelf"]'),
  bigButton: Math.round((document.querySelector('.tac-room-btn.big') || { getBoundingClientRect: () => ({ height: 0 }) }).getBoundingClientRect().height)
})
```

Expected: `pageScroll <= 0`, `map >= 450`, `strip === 64`, `panel <= 300`, `tabs` equals `['requests', 'assets']`, `chipShelf === true`, `bigButton >= 44`.

```js
document.querySelector('#tacRoomChips [data-room-action="shelf"]').click();
await new Promise(r => setTimeout(r, 300));
getComputedStyle(document.getElementById('tacRoomShelf')).display !== 'none' && document.querySelectorAll('#tacRoomShelf .tac-room-row').length >= 4
```

Expected: `true`. Screenshot the 900 × 1000 view, then `resize_window` with `preset: 'desktop'` and check the wide layout still shows the right-hand panel with four tabs (`roster`, `requests`, `assets`, `layers`).

- [ ] **Step 3: Commit**

```bash
git add tactical/room.css
git commit -m "feat(tablet): half-monitor layout with a fixed height budget (V10)"
```

### Task 9: Admin package for Space Stories (V3)

**Files:**
- Create: `research/fork-outreach-2026-09-12/stories-tablet-admin.md`

The decision record (Decision 6) fixes the shape: one letter carrying the request for a written «да» and the server key together, sent after the Series J wave to the same contact; the first thing the administration reads is what the tool does not do, then their own switch, then the observer link; architecture is not shown. This task writes the package; the owner sends it. It can run in parallel with Tasks 3–8.

- [ ] **Step 1: Write the package**

````markdown
# Командный планшет — пакет для администрации Space Stories

**Кто отправляет:** владелец проекта, лично, после размещения гайда (серия J) тем же контактом.
**Одно письмо:** просьба о письменном «да» на пилот и о держателе ключа сервера вместе.
**Решение:** [docs/decisions/2026-09-13_tactical-tablet.md](../../docs/decisions/2026-09-13_tactical-tablet.md) · **спека:** [docs/design/2026-09-13-tactical-tablet.md](../../docs/design/2026-09-13-tactical-tablet.md)

## 1. Что это, в трёх фразах

Страница «Тактическая карта» на нашем сайте уже считает координаты для миномёта, ОБ и поставки по коду Space Stories. Командный планшет добавляет к ней «комнату» на один раунд: офицеры записывают туда метки, план и запросы удара, которые уже прозвучали по рации. Комната умирает вместе с раундом.

## 2. Чего инструмент не делает

- Ничего не читает из игры: ни позиции, ни чат, ни память клиента. Всё, что есть в комнате, офицер ввёл руками.
- Не показывает, где свои или чужие: живых точек нет вообще.
- Не снимает ни одного ограничения игровой тактической карты: кулдаун публикации, навык Leadership и видимость остаются как есть в игре.
- Не заменяет рацию: под каждой новой меткой противника стоит «не передано», пока кто-то в комнате не подтвердит, что это сказано в эфире.
- Не работает без вашего разрешения: без ключа сервера комнату нельзя создать, а интерфейс комнаты на сайте скрыт.
- Не хранит ничего дольше раунда: комната живёт не больше трёх часов (одно продление на час), журнал доступен ещё час, затем удаляется.
- Не собирает персональные данные: аккаунтов нет, в комнате только должности и позывные персонажей.

## 3. Рубильник у администрации

- **Ключ сервера.** Для Space Stories выпускается отдельный ключ `stories-k1`. Держатель — глава администрации лично. Комнату можно создать, только вставив токен этого ключа.
- **Ссылка «отключить».** У администрации своя ссылка, подписанная ключом: она открывает страницу с одной кнопкой. После нажатия новые комнаты не создаются, а идущие переходят в «Радиомолчание» не позже чем через минуту. Наше участие не нужно.
- **Ссылка «включить».** Такая же, возвращает всё обратно.
- **Если администрация не хочет держать ключ:** ключ остаётся у нас, а ссылки «отключить» и «включить» всё равно у вас.

Ссылки и токен передаются отдельным личным сообщением, не в этом письме.

## 4. Ссылка наблюдателя и журнал

- Штаб любой комнаты одной кнопкой получает ссылку «для модератора»: она открывает комнату только на чтение и не видна другим участникам.
- Журнал комнаты скачивается файлом: полная хронология с временем, должностью и игровыми координатами, по строке на действие. Пример строки: `18:05:07  Командир отряда Браво  метка «ксено» 253 -198`.

## 5. Предлагаемый текст исключения к правилу 3

> «Разрешено использование внешнего командного планшета, внесённого администрацией в список разрешённых инструментов, при соблюдении условий: (а) инструмент ничего не читает из игры — всё вводится руками; (б) в него попадает только то, что уже было сказано по внутриигровой связи; (в) доступ есть только у живых игроков на командных должностях текущего раунда; (г) работа прекращается вместе с потерей связи — режим „Радиомолчание“ виден в экспорте; (д) администрация получает ссылку наблюдателя, полный экспорт и собственный ключ отключения, действующий без нашего деплоя.»

Обоснование одной фразой: игра уже даёт штабу тактическую карту, комната не снимает ни одного её ограничения, а заменяет второй монитор и блокнот офицера общим листом, который администрация может прочитать.

## 6. Три обещания

1. **Умирает вместе с рацией.** Штаб включает «Радиомолчание», и комната замирает с отметкой времени; это видно в журнале.
2. **Мёртвые молчат.** Инструмент не знает о смерти персонажа, поэтому говорим честно: офицер снимается сам по 10 минутам без действий, а любой офицер в комнате снимает его одним нажатием «Выбыл». Метки снятого сереют. «Сменить код» закрывает все сессии сразу.
3. **Рубильник у вас.** Раздел 3.

## 7. Что мы просим

- **Письменное «да» на пилот** на сервере Core на четыре недели, в админ-канале или письмом; скриншот ответа хранится в записи решения.
- **Держателя ключа** или отказ от ключа (тогда ключ у нас, ссылки у вас).
- **Три офицера** пилота, названные администрацией или сообществом; владелец проекта в эту тройку не входит.
- **Ваши условия, если они есть.** Например, такт публикации общего слоя как в игре (240 секунд) мы можем включить. Запрет записи на уровне отряда сделает пилот бессмысленным: командир отряда в игре рисовать не может, ради этого инструмент и сделан. Если такое условие обязательно, мы честно не запускаем пилот.

## 8. Как поймём, что пилот удался

- **Главное:** опубликованный текст исключения в правилах и ноль тикетов по правилу 3 за четыре недели.
- **Вспомогательное, по журналам:** не меньше шести полезных комнат (три и больше подтверждённых должности, хотя бы один запрос доведён до «выполнен», десять и больше действий от трёх и больше участников), из них три созданы разными людьми и хотя бы одна без владельца проекта; пять и больше офицеров в двух и больше раундах; медиана от запроса до «принят» меньше минуты.
- **Если нет:** планшет выключается, калькулятор координат остаётся.

## 9. Черновик письма

> Здравствуйте! Я автор тактической карты и калькуляторов для Space Stories на [сайте](https://mikameo.github.io/space-station-recipes/tactical.html). Сделал для офицеров «командный планшет» — общий лист на раунд для меток, плана и запросов удара, которые уже прозвучали по рации. Прежде чем кто-то им воспользуется, хочу получить ваше решение: без него инструмент на ваших серверах выключен. На одной странице ниже — чего он не делает, ваш рубильник, ссылка наблюдателя и предлагаемый текст исключения к правилу 3. Прошу: письменное «да» или «нет» на пилот на Core на четыре недели, кто у вас будет держать ключ отключения, и ваши условия, если они есть. Могу показать демо в любое удобное время.
````

- [ ] **Step 2: Check the links and the quoted texts**

Run: `python -c "import re,pathlib; t=pathlib.Path('research/fork-outreach-2026-09-12/stories-tablet-admin.md').read_text(encoding='utf-8'); [print('MISSING', p) for p in re.findall(r'\]\((\.\./[^)]+)\)', t) if not (pathlib.Path('research/fork-outreach-2026-09-12')/p).resolve().exists()]; print('links ok')"`
Expected: `links ok` with no `MISSING` lines. Compare section 5 character for character with Decision 6 of the decision record: expected identical.

- [ ] **Step 3: Commit**

```bash
git add research/fork-outreach-2026-09-12/stories-tablet-admin.md
git commit -m "docs(tablet): admin package and letter for Space Stories (V3)"
```

### Task 10: Pilot tooling, deploy and release (V11)

**Files:**
- Create: `scripts/room_pilot_stats.py`
- Modify: `scripts/create_metrika_goals.py` (four goal tuples)
- Modify: `README.md` (one row), `CHANGELOG.md` (one section)
- After the written «да» only: `tactical/policy/stories_cm.json` (sanction status), `worker/room/policies.js` (sync), `tactical/room.js` (`ROOM_URL`), `tactical.html` (`room.js?v=2`), `sections.json`, `promo/cards/tactical.webp`, `ROADMAP.md`

Steps 1–4 run now. Steps 5–9 wait for the administration's written «да»; until then the deployed page keeps `ROOM_URL` empty and every policy entry at `"status": "none"`, so nobody sees the room (VISION §4 п.3, project CLAUDE.md).

- [ ] **Step 1: Write the KT-B calculator for pilot exports**

```python
# scripts/room_pilot_stats.py — pilot numbers for Vision bet B3 from room exports
# (the JSON a staff officer downloads with «Скачать журнал»).
# Usage: python scripts/room_pilot_stats.py <export.json> [...] [--owner <client-id> ...]
# Decision record 2026-09-13_tactical-tablet.md, Decision 7 (KT-B).
import argparse, json, statistics, sys
from collections import defaultdict


def room_stats(doc, owners):
    ops = doc['ops']
    creator = None
    confirmed = set()
    members = set()
    for op in ops:
        if op['kind'] != 'member' or op['op'] == 'del':
            continue
        data = op.get('data') or {}
        client = data.get('client') or op['by']['client']
        if op['op'] == 'put':
            members.add(client)
            if data.get('confirmedBy') == 'creator':
                creator = client
            if data.get('confirmed'):
                confirmed.add(client)
        elif data.get('confirmed'):
            confirmed.add(op['by']['client'] if not data.get('client') else client)
    # A confirm patch is written by the confirmer; map it back through the member id.
    member_client = {}
    for op in ops:
        if op['kind'] == 'member' and op['op'] == 'put':
            member_client[op['id']] = (op.get('data') or {}).get('client')
    for op in ops:
        if op['kind'] == 'member' and op['op'] == 'patch' and (op.get('data') or {}).get('confirmed'):
            if member_client.get(op['id']):
                confirmed.add(member_client[op['id']])
    work = [op for op in ops if op['kind'] not in ('member', 'asset') or (op['kind'] == 'asset' and op['by']['post'] != 'system')]
    clients = {op['by']['client'] for op in work if op['by']['post'] != 'system'}
    requested, accepted, done = {}, {}, set()
    for op in ops:
        if op['kind'] != 'request':
            continue
        if op['op'] == 'put':
            requested[op['id']] = op['at']
        status = (op.get('data') or {}).get('status')
        if op['op'] == 'patch' and status == 'accepted' and op['id'] not in accepted:
            accepted[op['id']] = op['at']
        if op['op'] == 'patch' and status == 'done':
            done.add(op['id'])
    waits = [(accepted[i] - requested[i]) / 1000 for i in accepted if i in requested]
    useful = len(confirmed) >= 3 and len(done) >= 1 and len(work) >= 10 and len(clients) >= 3
    return {
        'code': doc['meta'].get('code'), 'creator': creator, 'confirmed': len(confirmed), 'requests_done': len(done),
        'ops': len(work), 'clients': len(clients), 'useful': useful,
        'owner_present': bool(owners & (members | confirmed)), 'officers': sorted(confirmed), 'accept_waits': waits,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('exports', nargs='+')
    ap.add_argument('--owner', action='append', default=[], help='client id(s) of the project owner')
    args = ap.parse_args()
    owners = set(args.owner)
    rooms = [room_stats(json.load(open(p, encoding='utf-8')), owners) for p in args.exports]
    useful = [r for r in rooms if r['useful']]
    creators = {r['creator'] for r in useful if r['creator']}
    without_owner = [r for r in useful if not r['owner_present']]
    seen = defaultdict(int)
    for r in rooms:
        for o in r['officers']:
            seen[o] += 1
    repeat_officers = [o for o, n in seen.items() if n >= 2 and o not in owners]
    waits = [w for r in rooms for w in r['accept_waits']]
    median_wait = statistics.median(waits) if waits else None
    for r in rooms:
        print(f"{r['code']}: useful={r['useful']} confirmed={r['confirmed']} done={r['requests_done']} ops={r['ops']} clients={r['clients']} owner={r['owner_present']}")
    passed = (len(useful) >= 6 and len(creators) >= 3 and len(without_owner) >= 1 and len(repeat_officers) >= 5
              and median_wait is not None and median_wait < 60)
    print(f"useful rooms: {len(useful)} (need 6)")
    print(f"distinct creators of useful rooms: {len(creators)} (need 3)")
    print(f"useful rooms without the owner: {len(without_owner)} (need 1)")
    print(f"officers in 2+ rooms, owner excluded: {len(repeat_officers)} (need 5)")
    print(f"median request→accept: {'—' if median_wait is None else round(median_wait, 1)} s (need < 60)")
    print('KT-B', 'PASS' if passed else 'NOT MET')
    return 0


if __name__ == '__main__':
    sys.exit(main())
```

Officers are counted by browser client id: the same person on two computers counts twice, and two people sharing one browser count once. The pilot log states this next to the numbers.

- [ ] **Step 2: Run it on the local end-to-end export**

Run: `PYTHONIOENCODING=utf-8 python scripts/room_pilot_stats.py <path-to-the-json-downloaded-in-Task-7-Step-7> --owner officer-aaaa-01`
Expected: one line `<CODE>: useful=False confirmed=2 done=0 ops=… clients=2 owner=True`, then the five KT-B lines and `KT-B NOT MET` (two officers, no request done).

- [ ] **Step 3: Register the four pilot goals in the Metrika registry (not on the counter)**

In `scripts/create_metrika_goals.py`, after the last line starting with `    ("tactical_`, add:

```python
    ("room_create",             "Командный планшет: комната создана"),
    ("room_confirm",            "Командный планшет: должность подтверждена"),
    ("room_request_done",       "Командный планшет: запрос выполнен"),
    ("room_export",             "Командный планшет: журнал скачан"),
```

Do not run the script: goals are created on the counter only after the owner's explicit «ок» in the session (project CLAUDE.md, memory «Metrika export needs go-ahead»).

- [ ] **Step 4: README row and CHANGELOG section, marked as not yet enabled**

In `README.md`, directly after the row starting with `| **Tactical** |`, add:

```markdown
| **Tablet** | Officers' room | A per-round room on the tactical map for marine officers: post codes from the briefing sheet, marks and plans in command-level line styles, strike requests with the fire card inside, a manual asset board. Off on every server until its administration sanctions it; nothing is read from the game |
```

In `CHANGELOG.md`, directly before `## Series T — 2026-09-13`, add:

```markdown
## Series V — 2026-09-13 (Officers' room on the tactical map; hidden until a server sanctions it)

A room for one round layered over `tactical.html`: a Cloudflare Worker with a
Registry and one Room Durable Object per room (op log in the SQLite-backed
storage, polling with `Retry-After`, no repeating timers), one-time post codes
confirmed by any live member, an admin-signed server token as the only gate,
marks, lines, areas and freehand strokes in command-level signatures, requests
with the Series T fire card inside, a manual asset board, a half-monitor
layout. Policy per fork in `tactical/policy/*.json`. Every server starts at
`"status": "none"` and the deployed page keeps `ROOM_URL` empty, so the room is
invisible until an administration says yes in writing. Design:
`docs/design/2026-09-13-tactical-tablet.md`; decisions:
`docs/decisions/2026-09-13_tactical-tablet.md`.
```

Commit:

```bash
git add scripts/room_pilot_stats.py scripts/create_metrika_goals.py README.md CHANGELOG.md
git commit -m "feat(tablet): pilot KT-B calculator, goal registry entries, README and changelog (V11 prep)"
```

- [ ] **Step 5: Owner deploys the Worker (room still hidden)**

Owner, in `worker/`:

```bash
npx wrangler login
npx wrangler secret put ROOM_KEYS
npx wrangler secret put ROOM_STOP_SECRET
npx wrangler deploy
```

Before `deploy`: switch the Cloudflare account to the Workers Paid plan (decision record, Owner overrides 2). `ROOM_KEYS` is the JSON printed by `node scripts/room_token.mjs stories-k1 stories_cm "Space Stories - Marine Corps Core"` with `ROOM_KEY_SECRET` set to a fresh random secret; `ROOM_STOP_SECRET` is another fresh random secret. Verify: `curl -s https://chemdb-feedback.<account>.workers.dev/policy/stories_cm -H "Origin: https://mikameo.github.io"` returns the policy JSON, and `curl -s .../health -H "Origin: https://mikameo.github.io"` returns `{"active":0,"today":0}`.

- [ ] **Step 6: After the written «да» — enable Space Stories Core**

Save the screenshot of the answer as `docs/decisions/assets/2026-09-stories-tablet-sanction.png` and add one line under «Owner overrides» of the decision record with the date and who answered. Then in `tactical/policy/stories_cm.json` set the Core entry to

```json
    { "server": "Space Stories - Marine Corps Core", "status": "pilot", "since": "2026-MM-DD" },
```

with the real date, run `python scripts/check_room_policy.py --sync && python scripts/check_room_policy.py`, and redeploy the Worker (`npx wrangler deploy`). In `tactical/room.js` set `var ROOM_URL = 'https://chemdb-feedback.<account>.workers.dev';` and in `tactical.html` change `tactical/room.js?v=1` to `tactical/room.js?v=2`. Run all four room tests and the Series T suite. Commit:

```bash
git add tactical/policy/stories_cm.json worker/room/policies.js tactical/room.js tactical.html docs/decisions/2026-09-13_tactical-tablet.md docs/decisions/assets/2026-09-stories-tablet-sanction.png
git commit -m "feat(tablet): enable the officers' room on Space Stories Core for the pilot"
```

Push only on the owner's explicit request.

- [ ] **Step 7: Control round on production**

After the owner's push and a green deploy: `curl -sI https://mikameo.github.io/space-station-recipes/tactical/room-requests.js` returns `200`. The owner creates a room in a real Stories round with the pilot officers, runs the briefing sheet, one request to «выполнен», one «Радиомолчание», downloads the log, and sends the log to the moderator through the observer link. Run `scripts/room_pilot_stats.py` on that export and paste the output into `research/tablet-pilot-2026-09/log.md` (create the directory) with a table header `| Дата | Комната | Создатель | Должности | Выполнено | Модератор открыл | Заметки |`.

- [ ] **Step 8: Release card and «what's new»**

In `sections.json`, for the entry with `"id": "tactical"`, set `"updated"` to the release date, append `{"en": "Officers' room", "ru": "Командный планшет"}` to `"inside"`, and set `"whatsNew"` to `{"en": "Officers' room on Space Stories Core: post codes, shared plans, strike requests", "ru": "Командный планшет на Space Stories Core: коды должностей, общий план, запросы удара"}`; bump `sections.json?v=` and `home.js?v=` references and the `sw.js` cache name together (memory «Asset versioning / cache-bust»). Re-shoot the card with a scratch puppeteer install: `npm i --prefix <scratchpad>/pup puppeteer-core`, copy `scripts/shoot_cards.mjs` into `<scratchpad>/pup/`, start the preview and run `node <scratchpad>/pup/shoot_cards.mjs http://localhost:<port> tactical`. Commit `feat(tablet): release card and what's new`.

- [ ] **Step 9: Close the series in ROADMAP after four weeks**

Run `scripts/room_pilot_stats.py` on all pilot exports with the owner's client ids. Mark V11 `[x]` with the KT-B output and the rule-3 ticket count from the administration; add a ROADMAP revision row. If KT-B is `NOT MET` or a rule-3 ticket exists, the owner decides between switching Core back to `"status": "none"` (redeploy) or a second pilot; record the decision in `docs/decisions/`. Update project memory `tactical-room-brainstorm.md` with the result.

---

## Self-review

**Spec coverage** (spec section → task):

| Spec / decision | Task |
|---|---|
| Policy per fork, sanction list, posts and function labels, levels and signatures, rights, ttl, assets with `loader`, limits | 1 |
| Op log semantics, tombstones, `expectedStatus`, rights incl. loader, claimed crews, CAS→pilot, enemy confirm/relay, filters, expiry, clocks, codes, geometry, request actions | 2 |
| Durable Objects, polling with `Retry-After`, no timers, one alarm, 3 h + 1 h lifetime, 8-min idle lock, member auto-release, one-time post codes, word fallback with choice, `epoch` rotate, reissue, observer, export chronology, HMAC server token, stop links via POST, per-source limits, byte budget, env ceilings on the paid plan, assets seeded at creation | 3 |
| Client transport, session, pending ops, optimistic merge, restore, observer, demo fixture | 4 |
| Seam (one attach, five notifications, one consumePick, slot outside `#tacPanel`, `addLayer` contract), entry, knock, roster, «Выбыл», «Занять», labels, staff controls, banners incl. radio silence and planet mismatch, presence prompt, briefing sheet in paper markup, refusal to run inside a frame | 5 |
| Marks, enemy fading, lines smooth/polyline, areas, freehand, layers and author filters, age filter, publish own T objects, room calibration and mismatch, «не передано» | 6 |
| Requests (types, urgent, beacon, pick or typed target), states with `loaded`, two OB lines, «Взять цель» + fire card inside, countdowns, «отозвано штабом», repeat, asset board with manual states and hints, crew claims, shells and radius, chips, strip, rings, owner sound, flash, digit keys | 7 |
| Half-monitor budget and 44 px targets | 8 |
| Exception text, three promises, first-page order, one letter, keyId holder, conditions | 9 |
| KT-B, cohort rule, goals registry, deploy, enable after yes, control round, release card | 10 |

**Gaps found and fixed inline:**

1. The decision's clickjacking mitigation («`room.js` не стартует в iframe») had no step; it is now the frame check at the top of `mount` in `tactical/room-ui.js` (Task 5 Step 5).
2. The 500 ms «element older than» click guard from the same mitigation is dropped: with the frame refusal it adds no protection on GitHub Pages, and it would slow the 44 px confirm flow the UX expert asked to keep under 15 s.
3. Found while writing Tasks 6–7 and fixed in Tasks 1–5: OB loading by the ordnance technician (`loader` in the policy), CAS requests owned by the pilot (`REQUEST_ASSET`), claimed mortar crews accepting requests (`claimants` passed as `extra`), anyone confirming or relaying an enemy mark on another layer, assets seeded at room creation so crews can claim them, `deniedBy` for «отозвано штабом», and storage keys that include the client so two officers can test in one browser.

**Placeholder scan:** no «TBD», «TODO», «implement later» or «similar to Task N». Values the executor must fill at run time are named and sourced: `<port>` from `preview_start`, `<CODE>`/`<SLCODE>` from the running room, `<account>` from `wrangler deploy`, the sanction date from the administration's answer.

**Type consistency:** `window.TacticalRoomLogic` (Task 2) is the only semantics object; `window.TacRoom` (`RoomClient`, `HttpTransport`, `makeStorage`, `attach`, `notify`, `consumePick`) is defined once in Task 4 and used by Tasks 5–7; `window.TacRoomFixture` (`FixtureTransport`, `demoScript`) in Task 4; `window.TacRoomUI` (`register`, `mount`, `notify`, `consumePick`, `api`) in Task 5 with module fields `tabs`, `tools`, `panel`, `chips`, `strip`, `draw`, `tick`, `notify`, `actions`, `changes`, `submits`, `mount`, `l10n` used identically in Tasks 6–7. `canWrite(policy, member, op, existing, extra)` and `requestActions(policy, member, req, extra)` take `extra = {claimed: claimants(objects, obj)}` in the Worker, the fixture and the UI alike. Storage keys: `chemdb-tactical:room-client`, `chemdb-tactical:room/<code>:<client>`, `chemdb-tactical:room-current:<client>`, `chemdb-tactical:room-prefs`, `chemdb-tactical:room-dev`, `chemdb-tactical:room-key:<fork>`.

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-09-13-tactical-tablet.md`. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task with review between tasks (`superpowers:subagent-driven-development`). Tasks 1–4 and 9 are independent of Series T files and can go first; Task 5 needs a quiet window in `tactical/*`.
2. **Inline Execution** — tasks in one session with checkpoints (`superpowers:executing-plans`).
