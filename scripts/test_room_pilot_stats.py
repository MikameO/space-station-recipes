# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 MikameO
"""
Tests for scripts/room_pilot_stats.py. Run: PYTHONIOENCODING=utf-8 python scripts/test_room_pilot_stats.py

Every fixture is built in code, in a temp directory — nothing here is a
committed JSON file. The room()/by() helpers mirror the shape
worker/room/room.js's exportRoom() writes (Task 3 of the Series V plan).
"""
import contextlib
import copy
import io
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import room_pilot_stats as rps  # noqa: E402

BASE_T = 1789400000000  # ms epoch, comfortably above the 1e12 seconds/ms guard


def by(client, post, squad=None):
    return {'client': client, 'post': post, 'squad': squad}


def room(code, so, mortar, t0=BASE_T, created=None, accept_after=15000, extra_ops=None,
         second_so=None, mortar_confirmed=True, request=True, done=True, self_accept=False):
    """One officers' room export: SO creator (+ optional second SO instead of
    a mortar crew), a system-seeded mortar asset, an optional mortar crew
    that knocks and gets confirmed, and one strike request that can be
    self-accepted/self-closed or left unanswered/undone."""
    ops = []
    seq = [0]

    def add(at, who, op, kind, id_, data=None, expected=None):
        seq[0] += 1
        o = {'seq': seq[0], 'at': at, 'by': who, 'op': op, 'kind': kind, 'id': id_, 'cid': '', 'data': data}
        if expected:
            o['expectedStatus'] = expected
        ops.append(o)

    add(t0, by(so, 'so'), 'put', 'member', f'mem-{so}-1',
        {'client': so, 'post': 'so', 'squad': None, 'slot': 'so::creator', 'callsign': 'A',
         'confirmed': True, 'confirmedBy': 'creator', 'confirmedAt': t0})
    add(t0, by('room', 'system'), 'put', 'asset', 'asset-mortar-1',
        {'type': 'mortar', 'n': 1, 'owner': {'post': 'mortar'}, 'state': None, 'notes': '', 'claimedBy': None})
    crew, crew_post = (second_so, 'so') if second_so else (mortar, 'mortar')
    if crew:
        add(t0 + 1000, by(crew, crew_post), 'put', 'member', f'mem-{crew}-{seq[0] + 1}',
            {'client': crew, 'post': crew_post, 'squad': None, 'slot': f'{crew_post}::word', 'callsign': 'B',
             'confirmed': False, 'knockAt': t0 + 1000})
        if mortar_confirmed:
            add(t0 + 2000, by(so, 'so'), 'patch', 'member', ops[-1]['id'],
                {'confirmed': True, 'confirmedBy': 'so', 'confirmedAt': t0 + 2000, 'word': None})
    if request:
        add(t0 + 3000, by(so, 'so'), 'put', 'request', f'req-{code}',
            {'type': 'mortar', 'target': {'x': 1, 'y': 2}, 'note': '', 'status': 'requested'})
        acc = by(so, 'so') if self_accept else by(crew, crew_post)
        add(t0 + 3000 + accept_after, acc, 'patch', 'request', f'req-{code}',
            {'status': 'accepted', 'acceptedBy': acc}, 'requested')
        add(t0 + 3000 + accept_after + 5000, acc, 'patch', 'request', f'req-{code}',
            {'status': 'firing', 'firedAt': 0}, 'accepted')
        if done:
            add(t0 + 3000 + accept_after + 9000, acc, 'patch', 'request', f'req-{code}',
                {'status': 'done', 'doneAt': 0}, 'firing')
    for e in extra_ops or []:
        add(*e)
    return {'meta': {'code': code, 'fork': 'stories_cm', 'server': 'Space Stories - Marine Corps Core',
                     'planet': 'lv624', 'createdAt': created or t0, 'closedAt': None,
                     'extended': False, 'frozen': None},
            'members': [], 'objects': [], 'ops': ops, 'text': ''}


def write(tmpdir, name, doc=None, raw=None, enc='utf-8'):
    p = os.path.join(tmpdir, name)
    with open(p, 'wb') as f:
        f.write(raw if raw is not None else json.dumps(doc, ensure_ascii=False).encode(enc))
    return p


def run_main(argv):
    """Runs main() with argv, capturing stdout. Returns (exit_code, printed_text)."""
    old_argv = sys.argv
    sys.argv = ['room_pilot_stats.py'] + argv
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf):
            code = rps.main()
    except SystemExit as e:
        code = e.code
    finally:
        sys.argv = old_argv
    return code, buf.getvalue()


passed = 0


def t(name, fn):
    global passed
    fn()
    passed += 1
    print('ok', name)


with tempfile.TemporaryDirectory() as tmp:

    def t_duplicates_and_rotate():
        d = room('RMA0AA', 'so-aaaaaaaa', 'mo-11111111')
        p_so = write(tmp, 'dup_so.json', d)
        p_mortar = write(tmp, 'dup_mortar.json', d)  # same download, two officers
        rotated = copy.deepcopy(d)
        rotated['meta']['code'] = 'ROTATE'  # same room, code changed
        p_rot = write(tmp, 'dup_rotate.json', rotated)
        other = write(tmp, 'dup_other.json', room('RMA1AA', 'so-bbbbbbbb', 'mo-22222222', t0=BASE_T + 3600_000))
        code, out = run_main([p_so, p_mortar, p_rot, other])
        assert out.count('skipped duplicate') == 2, out
        assert out.count('RMA0AA:') + out.count('ROTATE:') == 1, out  # exactly one line for the merged room
        assert 'useful rooms: 2 (need 6)' in out, out

    t('duplicate exports, including across a rotate, count once', t_duplicates_and_rotate)

    def t_staff_only_not_useful():
        d = room('STAFF1', 'so-hhhhhhhh', None, second_so='so-iiiiiiii')
        p = write(tmp, 'staff_only.json', d)
        code, out = run_main([p])
        assert 'STAFF1: useful=False' in out, out

    t('a staff-only room (no mortar post confirmed) is not useful', t_staff_only_not_useful)

    def t_so_mortar_done_useful():
        d = room('OKROOM', 'so-p0', 'mo-r0')
        p = write(tmp, 'ok.json', d)
        code, out = run_main([p])
        assert 'OKROOM: useful=True' in out, out
        assert 'done=1 ops=4 clients=2' in out, out

    t('SO plus mortar with a done request is useful', t_so_mortar_done_useful)

    def t_owner_three_browsers():
        owners = ['owner-pc-0001', 'owner-laptop-02', 'owner-phone-003']
        paths = []
        for i, oid in enumerate(owners):
            d = room(f'OWN{i}AA', oid, f'mo-friend-00{i}', t0=BASE_T + i * 7200_000)
            paths.append(write(tmp, f'owner_room_{i}.json', d))
        argv = paths + [a for oid in owners for a in ('--owner', oid)]
        code, out = run_main(argv)
        assert 'useful rooms: 3 (need 6)' in out, out
        # all three rooms are owner-created: none of them count as a distinct creator
        assert 'distinct creators of useful rooms: 0 (need 3)' in out, out
        # but the owner is present in all three, so none count as "useful without the owner"
        assert 'useful rooms without the owner: 0 (need 1)' in out, out

    t('the owner on three browsers creating rooms is one identity, not three creators', t_owner_three_browsers)

    def t_self_accept_ignored():
        d = room('SELF01', 'so-jjjjjjjj', 'mo-88888888', accept_after=1000, self_accept=True)
        p = write(tmp, 'self_accept.json', d)
        code, out = run_main([p])
        assert 'SELF01: useful=False' in out, out
        assert 'done=0' in out, out
        assert 'ignored 1 requests handled by their author' in out, out

    t('a self-accepted, self-closed request is ignored, not counted as done', t_self_accept_ignored)

    def t_malformed_exits_2():
        p = write(tmp, 'malformed.json', raw=b'{"meta": {"code": "BAD"')
        try:
            rps.load(p)
            assert False, 'should have exited'
        except SystemExit as e:
            assert e.code == 2, e.code

    t('a malformed (truncated) JSON file exits 2', t_malformed_exits_2)

    def t_bom_loads_fine():
        d = room('BOMBOM', 'so-gggggggg', 'mo-77777777')
        p = os.path.join(tmp, 'bom.json')
        with open(p, 'wb') as f:
            f.write(b'\xef\xbb\xbf' + json.dumps(d).encode('utf-8'))
        doc = rps.load(p)  # must not raise
        assert doc['meta']['code'] == 'BOMBOM'

    t('a UTF-8 file with a BOM loads fine', t_bom_loads_fine)

    def t_seconds_guard():
        d = room('SECS01', 'so-kkkkkkkk', 'mo-99999999', t0=1789400000, accept_after=300)  # seconds, not ms
        p = write(tmp, 'seconds.json', d)
        try:
            rps.load(p)
            assert False, 'should have exited'
        except SystemExit as e:
            assert e.code == 2, e.code

    t('meta.createdAt in seconds (< 1e12) exits 2', t_seconds_guard)

    def t_unanswered_counts():
        extra = [(BASE_T + 100000 + k, by('so-oooooooo', 'so'), 'put', 'request', f'ign-{k}',
                  {'type': 'mortar', 'target': {'x': 1, 'y': 1}, 'status': 'requested'}) for k in range(5)]
        d = room('IGNR01', 'so-oooooooo', 'mo-14141414', accept_after=10000, extra_ops=extra)
        p = write(tmp, 'unanswered.json', d)
        code, out = run_main([p])
        assert 'requests 6 / accepted 1 / denied 0 / unanswered 5' in out, out

    t('the median line reports requests/accepted/denied/unanswered counts', t_unanswered_counts)

    def t_not_met_exit_1():
        d = room('SOLO01', 'so-solo', 'mo-solo')
        p = write(tmp, 'solo.json', d)
        code, out = run_main([p])
        assert code == 1, code
        assert 'KT-B NOT MET' in out, out

    t('KT-B NOT MET exits with code 1', t_not_met_exit_1)

    def t_pass_exit_0():
        # 6 useful rooms, none touching the owner: 6 distinct SO creators and 3
        # mortar crews each repeated across two rooms (the so-mortar stage needs
        # rooms>=6, creators>=3, without_owner>=1, repeat>=3, median<60s).
        paths = []
        for i in range(6):
            so = f'so-pass-{i}'
            mortar = f'mo-pass-{i % 3}'  # mo-pass-0/1/2 each appear in two rooms
            d = room(f'PASS{i}AA', so, mortar, t0=BASE_T + i * 3600_000)
            paths.append(write(tmp, f'pass_{i}.json', d))
        code, out = run_main(paths)
        assert 'useful rooms: 6 (need 6)' in out, out
        assert 'distinct creators of useful rooms: 6 (need 3)' in out, out
        assert 'useful rooms without the owner: 6 (need 1)' in out, out
        assert 'officers in 2+ useful rooms, owner excluded: 3 (need 3)' in out, out
        assert 'KT-B PASS' in out, out
        assert code == 0, code

    t('KT-B PASS exits with code 0', t_pass_exit_0)

    def t_bad_shapes_exit_2():
        for name, doc, raw in [
            ('no_meta.json', {'ops': []}, None),
            ('ops_null.json', {'meta': {'code': 'X', 'createdAt': BASE_T}, 'ops': None}, None),
            ('no_by.json', {'meta': {'code': 'X', 'createdAt': BASE_T},
                             'ops': [{'seq': 1, 'at': BASE_T, 'op': 'put', 'kind': 'member', 'id': 'm1', 'data': {}}]},
             None),
        ]:
            p = write(tmp, name, doc=doc, raw=raw)
            try:
                rps.load(p)
                assert False, f'{name} should have exited'
            except SystemExit as e:
                assert e.code == 2, (name, e.code)

    t('missing meta/createdAt, non-list ops, and an op without by.client all exit 2', t_bad_shapes_exit_2)

print('OK', passed, 'cases')
