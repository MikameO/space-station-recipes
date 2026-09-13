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
