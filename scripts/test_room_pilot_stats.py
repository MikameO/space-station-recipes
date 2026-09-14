# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 MikameO
# This file is part of Space Station Recipes.
# See LICENSE for details.
"""
Tests for scripts/room_pilot_stats.py. Run: PYTHONIOENCODING=utf-8 python scripts/test_room_pilot_stats.py

Every fixture is built in code, in a temp directory — nothing here is a
committed JSON file. The Room/std/by helpers mirror the shape
worker/room/room.js's exportRoom() writes (Task 3 of the Series V plan) and
the shape scratch/review-p3/adv.py's helpers use, including ops[0] always
being the creator's member put (room_pilot_stats.load() now requires this).

Checks use a plain `check(cond, msg)` helper, not bare `assert` — asserts are
compiled out under `python -O`, and these tests must still catch a broken
script in that mode. `run_main` and `call_load` capture both stdout and
stderr so a deliberately-triggered failure's printed message never leaks
into the test run's own console output.
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


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)


def by(client, post, squad=None):
    return {'client': client, 'post': post, 'squad': squad}


class Room:
    """A room's op log, built one op at a time. ops[0] is always the
    creator's member put, as the real Worker guarantees and load() requires."""

    def __init__(self, code, creator, t0=BASE_T, fork='stories_cm'):
        self.code, self.t0, self.fork, self.ops = code, t0, fork, []
        self.put_member(creator, 'so', t0, creator_flag=True)
        self.op(t0, by('room', 'system'), 'put', 'asset', 'asset-mortar-1',
                {'type': 'mortar', 'n': 1, 'owner': {'post': 'mortar'}, 'state': None,
                 'notes': '', 'claimedBy': None})

    def op(self, at, who, action, kind, id_, data=None):
        o = {'seq': len(self.ops) + 1, 'at': at, 'by': who, 'op': action, 'kind': kind, 'id': id_, 'cid': ''}
        if data is not None:
            o['data'] = data
        self.ops.append(o)
        return o

    def put_member(self, client, post, at, creator_flag=False):
        mid = f'mem-{client}-{len(self.ops) + 1}'
        data = {'client': client, 'post': post, 'squad': None, 'callsign': 'X',
                'slot': f'{post}::creator' if creator_flag else f'{post}::word'}
        if creator_flag:
            data.update(confirmed=True, confirmedBy='creator', confirmedAt=at)
        else:
            data.update(confirmed=False, knockAt=at)
        self.op(at, by(client, post), 'put', 'member', mid, data)
        return mid

    def confirm(self, mid, who, post, at):
        self.op(at, by(who, post), 'patch', 'member', mid,
                {'confirmed': True, 'confirmedBy': post, 'confirmedAt': at, 'word': None})

    def req(self, rid, who, post, at):
        self.op(at, by(who, post), 'put', 'request', rid,
                {'type': 'mortar', 'target': {'x': 1, 'y': 2}, 'note': '', 'status': 'requested'})

    def status(self, rid, who, post, at, status):
        extra = {'accepted': {'acceptedBy': by(who, post)}, 'denied': {'deniedBy': by(who, post)},
                 'done': {'doneAt': at}, 'firing': {'firedAt': at}}.get(status, {})
        self.op(at, by(who, post), 'patch', 'request', rid, dict(status=status, **extra))

    def doc(self):
        return {'meta': {'code': self.code, 'fork': self.fork, 'server': 'S', 'planet': 'lv624',
                          'createdAt': self.t0, 'closedAt': None, 'extended': False, 'frozen': None},
                'members': [], 'objects': [], 'ops': self.ops, 'text': ''}


def std(code, so, mortar, t0=BASE_T, accept_after=15000, done=True):
    """A standard useful Stage-1 room: SO creator, mortar crew confirmed,
    one request that mortar (non-author) accepts, fires, and (usually) closes."""
    r = Room(code, so, t0)
    mid = r.put_member(mortar, 'mortar', t0 + 1000)
    r.confirm(mid, so, 'so', t0 + 2000)
    rid = f'req-{code}'
    r.req(rid, so, 'so', t0 + 3000)
    r.status(rid, mortar, 'mortar', t0 + 3000 + accept_after, 'accepted')
    r.status(rid, mortar, 'mortar', t0 + 8000 + accept_after, 'firing')
    if done:
        r.status(rid, mortar, 'mortar', t0 + 12000 + accept_after, 'done')
    return r


def write(tmpdir, name, doc=None, raw=None, enc='utf-8'):
    p = os.path.join(tmpdir, name)
    with open(p, 'wb') as f:
        f.write(raw if raw is not None else json.dumps(doc, ensure_ascii=False).encode(enc))
    return p


def run_main(argv):
    """Runs main() with argv, capturing stdout AND stderr. Returns (exit_code, stdout, stderr)."""
    old_argv = sys.argv
    sys.argv = ['room_pilot_stats.py'] + argv
    out, err = io.StringIO(), io.StringIO()
    try:
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = rps.main()
    except SystemExit as e:
        code = e.code
    finally:
        sys.argv = old_argv
    return code, out.getvalue(), err.getvalue()


def call_load(path):
    """Calls rps.load(path), capturing stderr. Returns (doc_or_None, exit_code_or_None, stderr)."""
    err = io.StringIO()
    try:
        with contextlib.redirect_stderr(err):
            doc = rps.load(path)
        return doc, None, err.getvalue()
    except SystemExit as e:
        return None, e.code, err.getvalue()


passed = 0


def t(name, fn):
    global passed
    fn()
    passed += 1
    print('ok', name)


with tempfile.TemporaryDirectory() as tmp:
    n = [0]

    def uniq(prefix):
        n[0] += 1
        return f'{prefix}{n[0]}.json'

    # ---- baseline behaviour (dedupe, posts-based usefulness, owner identity) ----

    def t_duplicates_and_rotate():
        d = std('RMA0AA', 'so-aaaaaaaa', 'mo-11111111').doc()
        p_so = write(tmp, uniq('dup_so'), d)
        p_mortar = write(tmp, uniq('dup_mortar'), d)  # same download, two officers
        rotated = copy.deepcopy(d)
        rotated['meta']['code'] = 'ROTATE'  # same room, code changed
        p_rot = write(tmp, uniq('dup_rotate'), rotated)
        other_doc = std('RMA1AA', 'so-bbbbbbbb', 'mo-22222222', t0=BASE_T + 3600_000).doc()
        other = write(tmp, uniq('dup_other'), other_doc)
        code, out, err = run_main([p_so, p_mortar, p_rot, other])
        check(out.count('skipped duplicate') == 2, out)
        check(out.count('RMA0AA:') + out.count('ROTATE:') == 1, out)  # one line for the merged room
        check('useful rooms: 2 (need 6)' in out, out)
        check(err == '', err)

    t('duplicate exports, including across a rotate, count once', t_duplicates_and_rotate)

    def t_partial_full_both_orders():
        full = std('AFULL1', 'so-a-000001', 'mo-a-000001').doc()
        partial = copy.deepcopy(full)
        partial['ops'] = partial['ops'][:5]  # no accept/firing/done yet
        p_partial = write(tmp, uniq('a_partial'), partial)
        p_full = write(tmp, uniq('a_full'), full)
        for order, args in [('partial-first', [p_partial, p_full]), ('full-first', [p_full, p_partial])]:
            code, out, err = run_main(args)
            check('AFULL1: useful=True' in out, (order, out))
            check('done=1 ops=4 clients=2' in out, (order, out))
            check(out.count('skipped duplicate') == 1, (order, out))

    t('the fuller export wins regardless of file order', t_partial_full_both_orders)

    def t_staff_only_not_useful():
        r = Room('STAFF1', 'so-hhhhhhhh')
        s2 = r.put_member('so-iiiiiiii', 'so', BASE_T + 1000)
        r.confirm(s2, 'so-hhhhhhhh', 'so', BASE_T + 1500)
        r.req('req-STAFF1', 'so-hhhhhhhh', 'so', BASE_T + 3000)
        r.status('req-STAFF1', 'so-iiiiiiii', 'so', BASE_T + 9000, 'accepted')
        r.status('req-STAFF1', 'so-iiiiiiii', 'so', BASE_T + 14000, 'firing')
        r.status('req-STAFF1', 'so-iiiiiiii', 'so', BASE_T + 19000, 'done')
        p = write(tmp, uniq('staff_only'), r.doc())
        code, out, err = run_main([p])
        check('STAFF1: useful=False' in out, out)

    t('a staff-only answer on so-mortar is not useful (no mortar post confirmed)', t_staff_only_not_useful)

    def t_so_mortar_done_useful():
        d = std('OKROOM', 'so-p0', 'mo-r0').doc()
        p = write(tmp, uniq('ok'), d)
        code, out, err = run_main([p])
        check('OKROOM: useful=True' in out, out)
        check('done=1 ops=4 clients=2' in out, out)

    t('SO plus mortar with a request DONE BY MORTAR is useful', t_so_mortar_done_useful)

    def t_second_so_done_not_useful():
        # New controller decision: on so-mortar, only a `mortar`-post done counts.
        # A second staff officer (not the author) accepting and finishing does not.
        d = Room('DSECSO', 'so-d-000001')
        m_mo = d.put_member('mo-d-000001', 'mortar', BASE_T + 1000)
        d.confirm(m_mo, 'so-d-000001', 'so', BASE_T + 2000)
        m_so2 = d.put_member('so-d-000002', 'so', BASE_T + 2500)
        d.confirm(m_so2, 'so-d-000001', 'so', BASE_T + 2600)
        d.req('req-D', 'so-d-000001', 'so', BASE_T + 3000)
        d.status('req-D', 'so-d-000002', 'so', BASE_T + 13000, 'accepted')
        d.status('req-D', 'so-d-000002', 'so', BASE_T + 18000, 'firing')
        d.status('req-D', 'so-d-000002', 'so', BASE_T + 22000, 'done')
        p = write(tmp, uniq('d_second_so'), d.doc())
        code, out, err = run_main([p])
        check('DSECSO: useful=False' in out, out)
        check('done=1' in out, out)  # done_any is true; done_ok (mortar-only) is not

    t('a second staff officer finishing the request does not make the room useful',
      t_second_so_done_not_useful)

    def t_accepted_firing_never_done_not_useful():
        q = Room('QNODON', 'so-q-000001')
        m = q.put_member('mo-q-000001', 'mortar', BASE_T + 1000)
        q.confirm(m, 'so-q-000001', 'so', BASE_T + 2000)
        q.req('req-Q', 'so-q-000001', 'so', BASE_T + 3000)
        q.status('req-Q', 'mo-q-000001', 'mortar', BASE_T + 9000, 'accepted')
        q.status('req-Q', 'mo-q-000001', 'mortar', BASE_T + 14000, 'firing')
        q.op(BASE_T + 20000, by('mo-q-000001', 'mortar'), 'patch', 'asset', 'asset-mortar-1', {'notes': 'HE'})
        p = write(tmp, uniq('q_nodone'), q.doc())
        code, out, err = run_main([p])
        check('QNODON: useful=False' in out, out)
        check('done=0 ops=4 clients=2' in out, out)  # thresholds met, but nothing is ever done

    t('posts+ops+clients satisfied, accepted and firing but never done: not useful',
      t_accepted_firing_never_done_not_useful)

    def t_owner_three_browsers():
        owners = ['owner-pc-0001', 'owner-laptop-02', 'owner-phone-003']
        paths = []
        for i, oid in enumerate(owners):
            d = std(f'OWN{i}AA', oid, f'mo-friend-00{i}', t0=BASE_T + i * 7200_000).doc()
            paths.append(write(tmp, uniq(f'owner_room_{i}_'), d))
        argv = paths + [a for oid in owners for a in ('--owner', oid)]
        code, out, err = run_main(argv)
        check('useful rooms: 3 (need 6)' in out, out)
        check('distinct creators of useful rooms: 0 (need 3)' in out, out)
        check('useful rooms without the owner: 0 (need 1)' in out, out)

    t('the owner on three browsers creating rooms is one identity, not three creators',
      t_owner_three_browsers)

    def t_self_accept_ignored():
        r = Room('SELF01', 'so-jjjjjjjj')
        m = r.put_member('mo-88888888', 'mortar', BASE_T + 1000)
        r.confirm(m, 'so-jjjjjjjj', 'so', BASE_T + 2000)
        r.req('req-SELF01', 'so-jjjjjjjj', 'so', BASE_T + 3000)
        r.status('req-SELF01', 'so-jjjjjjjj', 'so', BASE_T + 4000, 'accepted')  # self
        r.status('req-SELF01', 'so-jjjjjjjj', 'so', BASE_T + 9000, 'firing')
        r.status('req-SELF01', 'so-jjjjjjjj', 'so', BASE_T + 13000, 'done')  # self
        p = write(tmp, uniq('self_accept'), r.doc())
        code, out, err = run_main([p])
        check('SELF01: useful=False' in out, out)
        check('done=0' in out, out)
        check('ignored 1 requests handled by their author' in out, out)

    t('a self-accepted, self-closed request is ignored, not counted as done', t_self_accept_ignored)

    # ---- --stage full ----

    def t_stage_full_useful_and_not():
        # 3 posts (so, mortar, ot), exactly 10 work ops, 3 clients -> useful.
        full = std('LFULL3', 'so-l-000003', 'mo-l-000003')
        ot = full.put_member('ot-l-000003', 'ot', BASE_T + 30000)
        full.confirm(ot, 'so-l-000003', 'so', BASE_T + 31000)
        for k in range(6):
            full.op(BASE_T + 40000 + k, by('ot-l-000003', 'ot'), 'put', 'marker', f'mk-{k}', {'cat': 'enemy'})
        p_full = write(tmp, uniq('l3_full'), full.doc())
        code, out, err = run_main([p_full, '--stage', 'full'])
        check('LFULL3: useful=True' in out, out)
        check('posts=mortar,ot,so' in out, out)
        check('ops=10 clients=3' in out, out)

        # a plain so-mortar room only has 2 confirmed posts: not useful under full.
        plain = std('AFULL9', 'so-a-000009', 'mo-a-000009').doc()
        p_plain = write(tmp, uniq('a_full9'), plain)
        code2, out2, err2 = run_main([p_plain, '--stage', 'full'])
        check('AFULL9: useful=False' in out2, out2)

    t('--stage full: useful with 3 posts/10 ops/3 clients, not useful with 2 posts',
      t_stage_full_useful_and_not)

    def t_posts_gate_isolated():
        # mortar KNOCKS but is never confirmed; the op-level `by.post` on its
        # accept/done patches is still 'mortar' regardless, so this isolates
        # the posts_ok gate from the done_by_posts gate: ops/clients/done_ok
        # are all satisfied, only "mortar confirmed" is not.
        r = Room('PGATE1', 'so-pg-000001')
        r.put_member('mo-pg-000001', 'mortar', BASE_T + 1000)  # never confirmed
        r.req('req-PGATE1', 'so-pg-000001', 'so', BASE_T + 2000)
        r.status('req-PGATE1', 'mo-pg-000001', 'mortar', BASE_T + 9000, 'accepted')
        r.status('req-PGATE1', 'mo-pg-000001', 'mortar', BASE_T + 14000, 'firing')
        r.status('req-PGATE1', 'mo-pg-000001', 'mortar', BASE_T + 19000, 'done')
        p = write(tmp, uniq('posts_gate'), r.doc())
        code, out, err = run_main([p])
        check('PGATE1: useful=False' in out, out)
        check('posts=so ' in out or out.count('posts=so'), out)  # only 'so' ever confirmed
        check('ops=4 clients=2' in out, out)

    t('so-mortar: mortar never confirmed (posts gate alone) keeps the room not useful',
      t_posts_gate_isolated)

    def t_min_posts_gate_isolated():
        # 2 confirmed posts (so, mortar) but ops=10 and clients=3 are both already
        # satisfied by padding with a third, unconfirmed client's ops: isolates
        # the full-stage min_posts gate from the ops/clients gates.
        r = std('MPGATE1', 'so-mp-000001', 'mo-mp-000001')
        for k in range(6):
            r.op(BASE_T + 40000 + k, by('ghost-mp-000001', 'ghost'), 'put', 'marker',
                 f'mk-{k}', {'cat': 'enemy'})
        p = write(tmp, uniq('min_posts_gate'), r.doc())
        code, out, err = run_main([p, '--stage', 'full'])
        check('MPGATE1: useful=False' in out, out)
        check('ops=10 clients=3' in out, out)  # ops/clients satisfied; only min_posts (2<3) is not

    t('--stage full: 2 confirmed posts alone (ops/clients satisfied) keeps it not useful',
      t_min_posts_gate_isolated)

    def t_clients_gate_isolated():
        # 3 confirmed posts (so, mortar, ot) but 'ot' is held by the SAME client
        # as the author, so only 2 distinct clients ever do any work: isolates
        # the full-stage clients gate from the posts/ops/done gates.
        r = std('CGATE1', 'so-cg-000001', 'mo-cg-000001')
        ot = r.put_member('so-cg-000001', 'ot', BASE_T + 30000)  # same client, a second post
        r.confirm(ot, 'so-cg-000001', 'so', BASE_T + 31000)
        for k in range(6):
            r.op(BASE_T + 40000 + k, by('so-cg-000001', 'ot'), 'put', 'marker', f'mk-{k}', {'cat': 'enemy'})
        p = write(tmp, uniq('clients_gate'), r.doc())
        code, out, err = run_main([p, '--stage', 'full'])
        check('CGATE1: useful=False' in out, out)
        check('posts=mortar,ot,so' in out, out)  # 3 posts confirmed
        check('ops=10 clients=2' in out, out)  # only 2 distinct clients ever act

    t('--stage full: 3 confirmed posts held by only 2 clients keeps it not useful',
      t_clients_gate_isolated)

    def t_first_accept_wins_no_reput():
        # Two 'accepted' patches on the SAME lifecycle (no re-put): the median
        # must use the first one, not the second.
        r = Room('FIRSTACC', 'so-fa-000001')
        m = r.put_member('mo-fa-000001', 'mortar', BASE_T + 1000)
        r.confirm(m, 'so-fa-000001', 'so', BASE_T + 2000)
        r.req('req-FIRSTACC', 'so-fa-000001', 'so', BASE_T + 3000)
        r.status('req-FIRSTACC', 'mo-fa-000001', 'mortar', BASE_T + 9000, 'accepted')  # first: 6.0 s
        r.status('req-FIRSTACC', 'mo-fa-000001', 'mortar', BASE_T + 50000, 'accepted')  # ignored
        r.status('req-FIRSTACC', 'mo-fa-000001', 'mortar', BASE_T + 55000, 'done')
        p = write(tmp, uniq('first_accept'), r.doc())
        code, out, err = run_main([p])
        check('6.0 s' in out, out)
        check('47.0 s' not in out, out)

    t('median uses the first accepted timestamp, not a later duplicate one',
      t_first_accept_wins_no_reput)

    def t_ops_threshold_isolated():
        # posts_ok, done_ok and clients are all satisfied; only ops (3 < 4,
        # 'firing' skipped) is not — isolates the ops-count gate.
        r = Room('OPSGATE1', 'so-og-000001')
        m = r.put_member('mo-og-000001', 'mortar', BASE_T + 1000)
        r.confirm(m, 'so-og-000001', 'so', BASE_T + 2000)
        r.req('req-OPSGATE1', 'so-og-000001', 'so', BASE_T + 3000)
        r.status('req-OPSGATE1', 'mo-og-000001', 'mortar', BASE_T + 9000, 'accepted')
        r.status('req-OPSGATE1', 'mo-og-000001', 'mortar', BASE_T + 14000, 'done')  # no 'firing'
        p = write(tmp, uniq('ops_gate'), r.doc())
        code, out, err = run_main([p])
        check('OPSGATE1: useful=False' in out, out)
        check('ops=3 clients=2' in out, out)

    t('so-mortar: 3 work ops (below the 4 threshold) alone keeps it not useful',
      t_ops_threshold_isolated)

    def t_owner_present_via_knock_only():
        r = std('KNCK01', 'so-kn-000001', 'mo-kn-000001')
        r.put_member('owner-client-01', 'so', BASE_T + 90000)  # knocks, never confirmed
        p = write(tmp, uniq('owner_knocked'), r.doc())
        code, out, err = run_main([p, '--owner', 'owner-client-01'])
        check('KNCK01: useful=True' in out, out)
        check('owner=True' in out, out)  # present as a knocker, though never confirmed

    t('the owner is "present" from knocking alone, even if never confirmed',
      t_owner_present_via_knock_only)

    # ---- item 1: A/D/C/U counters ----

    def t_reput_resets_state():
        e = Room('EREPUT', 'so-e-000001')
        m = e.put_member('mo-e-000001', 'mortar', BASE_T + 1000)
        e.confirm(m, 'so-e-000001', 'so', BASE_T + 2000)
        e.req('req-E', 'so-e-000001', 'so', BASE_T + 3000)
        e.status('req-E', 'mo-e-000001', 'mortar', BASE_T + 8000, 'denied')  # first lifecycle: denied
        e.req('req-E', 'so-e-000001', 'so', BASE_T + 100000)  # re-put, same id: fresh lifecycle
        e.status('req-E', 'mo-e-000001', 'mortar', BASE_T + 110000, 'accepted')
        e.status('req-E', 'mo-e-000001', 'mortar', BASE_T + 115000, 'done')
        p = write(tmp, uniq('e_reput'), e.doc())
        code, out, err = run_main([p])
        check('EREPUT: useful=True' in out, out)
        check('requests 1 / accepted 1 / denied 0 / cancelled 0 / unanswered 0' in out, out)
        check('10.0 s' in out, out)  # wait measured from the SECOND put, not the first

    t('a put resets a request\'s state: the earlier denial is forgotten', t_reput_resets_state)

    def t_accepted_then_denied_counts_as_accepted():
        e2 = Room('EACCDN', 'so-e-000002')
        m = e2.put_member('mo-e-000002', 'mortar', BASE_T + 1000)
        e2.confirm(m, 'so-e-000002', 'so', BASE_T + 2000)
        e2.req('req-E2', 'so-e-000002', 'so', BASE_T + 3000)
        e2.status('req-E2', 'mo-e-000002', 'mortar', BASE_T + 8000, 'accepted')
        e2.status('req-E2', 'mo-e-000002', 'mortar', BASE_T + 20000, 'denied')  # after acceptance
        p = write(tmp, uniq('e_acc_denied'), e2.doc())
        code, out, err = run_main([p])
        check('requests 1 / accepted 1 / denied 0 / cancelled 0 / unanswered 0' in out, out)
        check('5.0 s' in out, out)

    t('accepted then denied still counts as accepted (A), not denied (D)',
      t_accepted_then_denied_counts_as_accepted)

    def t_self_denial_is_cancelled():
        mm = Room('MAUTHD', 'so-m-000001')
        m = mm.put_member('mo-m-000001', 'mortar', BASE_T + 1000)
        mm.confirm(m, 'so-m-000001', 'so', BASE_T + 2000)
        mm.req('req-M', 'so-m-000001', 'so', BASE_T + 3000)
        mm.status('req-M', 'mo-m-000001', 'mortar', BASE_T + 9000, 'accepted')  # crew answers
        mm.status('req-M', 'so-m-000001', 'so', BASE_T + 19000, 'done')  # author self-closes: ignored
        mm.req('req-N', 'so-m-000001', 'so', BASE_T + 30000)
        mm.status('req-N', 'so-m-000001', 'so', BASE_T + 31000, 'denied')  # author withdraws own request
        p = write(tmp, uniq('m_author'), mm.doc())
        code, out, err = run_main([p])
        check('ignored 1 requests handled by their author' in out, out)
        check('requests 2 / accepted 1 / denied 0 / cancelled 1 / unanswered 0' in out, out)

    t('an author denying (withdrawing) their own request is "cancelled", not D, A or unanswered',
      t_self_denial_is_cancelled)

    def t_orphan_patch_warning():
        i2 = std('INOPUT', 'so-i-000002', 'mo-i-000002').doc()
        put_index = next(k for k, o in enumerate(i2['ops']) if o['kind'] == 'request' and o['op'] == 'put')
        del i2['ops'][put_index]  # patches survive with no matching put
        for k, o in enumerate(i2['ops']):
            o['seq'] = k + 1
        p = write(tmp, uniq('i2'), i2)
        code, out, err = run_main([p])
        check('INOPUT: useful=False' in out, out)
        check('requests 0 / accepted 0 / denied 0 / cancelled 0 / unanswered 0' in out, out)
        check(err.count('with no prior put, ignored') == 3, err)  # accepted, firing, done all orphaned

    t('a request patch with no prior put is ignored, with a warning, never guessed at',
      t_orphan_patch_warning)

    def t_unanswered_counts():
        r = std('IGNR01', 'so-oooooooo', 'mo-14141414', accept_after=10000)
        for k in range(5):
            r.req(f'ign-{k}', 'so-oooooooo', 'so', BASE_T + 100000 + k)
        p = write(tmp, uniq('unanswered'), r.doc())
        code, out, err = run_main([p])
        check('requests 6 / accepted 1 / denied 0 / cancelled 0 / unanswered 5' in out, out)

    t('the median line reports requests/accepted/denied/cancelled/unanswered, N = A+D+C+U',
      t_unanswered_counts)

    # ---- item 2: typed validation ----

    def t_typed_validation_catches_every_kind():
        base = std('HBAD01', 'so-h-000001', 'mo-h-000001').doc()
        req_patch_i = next(k for k, o in enumerate(base['ops'])
                            if o['kind'] == 'request' and o['op'] == 'patch')
        member_put_i = next(k for k, o in enumerate(base['ops'])
                             if o['kind'] == 'member' and o['data'].get('post') == 'mortar')
        mutations = {
            'data not object or null': lambda x: x['ops'][req_patch_i].__setitem__('data', 'oops'),
            'at not a number': lambda x: x['ops'][req_patch_i].__setitem__('at', '12:00'),
            'at is a bool': lambda x: x['ops'][req_patch_i].__setitem__('at', True),
            'by.client not a string': lambda x: x['ops'][req_patch_i]['by'].__setitem__('client', ['mo']),
            'by.client empty': lambda x: x['ops'][req_patch_i]['by'].__setitem__('client', ''),
            'by.client null': lambda x: x['ops'][req_patch_i]['by'].__setitem__('client', None),
            'by.post not str/null': lambda x: x['ops'][req_patch_i]['by'].__setitem__('post', 3),
            'id not a string': lambda x: x['ops'][member_put_i].__setitem__('id', {'x': 1}),
            'meta.fork not a string': lambda x: x['meta'].__setitem__('fork', ['stories']),
            'meta.fork missing': lambda x: x['meta'].pop('fork'),
            'meta.createdAt is a bool': lambda x: x['meta'].__setitem__('createdAt', True),
            'member data.post not str/null': lambda x: x['ops'][member_put_i]['data'].__setitem__(
                'post', ['mortar']),
        }
        for label, fn in mutations.items():
            x = copy.deepcopy(base)
            fn(x)
            p = write(tmp, uniq('h_'), x)
            doc, code, err = call_load(p)
            check(code == 2, (label, code, err))
            check(doc is None, label)
            check(err.strip() != '', (label, 'expected a message on stderr'))

    t('load() type-checks every field and exits 2 with a message, never a traceback',
      t_typed_validation_catches_every_kind)

    def t_ops0_must_be_creator_put():
        # A system asset first (format drift / a hand-edited export): rejected.
        r = Room('GASSET', 'so-g-000001')
        r.ops[0], r.ops[1] = r.ops[1], r.ops[0]
        for k, o in enumerate(r.ops):
            o['seq'] = k + 1
        p = write(tmp, uniq('g_asset_first'), r.doc())
        doc, code, err = call_load(p)
        check(code == 2, (code, err))
        check('ops[0]' in err, err)

        # Genuinely empty ops: also rejected (a real room always logs the creator's put).
        p2 = write(tmp, uniq('empty_ops'), {'meta': {'code': 'E', 'fork': 'stories_cm', 'createdAt': BASE_T},
                                             'ops': []})
        doc2, code2, err2 = call_load(p2)
        check(code2 == 2, (code2, err2))

    t("ops[0] must be the creator's member put; format drift exits 2, not a wrong dedupe",
      t_ops0_must_be_creator_put)

    def t_recursion_and_top_level_array():
        deep = write(tmp, uniq('deep'), raw=b'{"meta": ' + b'[' * 20000 + b']' * 20000 + b'}')
        doc, code, err = call_load(deep)
        check(code == 2, (code, err))

        arr = write(tmp, uniq('arr'), raw=b'[1, 2, 3]')
        doc2, code2, err2 = call_load(arr)
        check(code2 == 2, (code2, err2))

    t('deeply nested JSON and a top-level array both exit 2, not a traceback',
      t_recursion_and_top_level_array)

    def t_malformed_exits_2():
        p = write(tmp, uniq('malformed'), raw=b'{"meta": {"code": "BAD"')
        doc, code, err = call_load(p)
        check(code == 2, (code, err))

    t('a malformed (truncated) JSON file exits 2', t_malformed_exits_2)

    def t_bom_loads_fine():
        d = std('BOMBOM', 'so-gggggggg', 'mo-77777777').doc()
        p = os.path.join(tmp, uniq('bom'))
        with open(p, 'wb') as f:
            f.write(b'\xef\xbb\xbf' + json.dumps(d).encode('utf-8'))
        doc, code, err = call_load(p)
        check(code is None, (code, err))
        check(doc['meta']['code'] == 'BOMBOM', doc)

    t('a UTF-8 file with a BOM loads fine', t_bom_loads_fine)

    def t_seconds_guard():
        d = std('SECS01', 'so-kkkkkkkk', 'mo-99999999', t0=1789400000, accept_after=300).doc()
        p = write(tmp, uniq('seconds'), d)
        doc, code, err = call_load(p)
        check(code == 2, (code, err))
        check('milliseconds' in err, err)

    t("meta.createdAt in seconds (< 1e12) exits 2", t_seconds_guard)

    # ---- item 3: no exports / directory expansion ----

    def t_txt_only_exits_2():
        txt = os.path.join(tmp, uniq('room-X').replace('.json', '.txt'))
        with open(txt, 'w', encoding='utf-8') as f:
            f.write('00:00:01 so\n')
        code, out, err = run_main([txt])
        check(code == 2, (code, out, err))
        check('no .json exports among the arguments' in err, err)
        check('not a .json export' in out, out)

    t('only a .txt chronology: skipped, then exit 2 (no exports)', t_txt_only_exits_2)

    def t_directory_argument_expands():
        sub = os.path.join(tmp, 'roomdir')
        os.makedirs(sub, exist_ok=True)
        write(sub, 'r1.json', std('DIRA01', 'so-dir-01', 'mo-dir-01').doc())
        write(sub, 'r2.json', std('DIRA02', 'so-dir-02', 'mo-dir-02', t0=BASE_T + 3600_000).doc())
        code, out, err = run_main([sub])
        check('expanding directory' in out, out)
        check('DIRA01:' in out and 'DIRA02:' in out, out)
        check(code in (0, 1), (code, out))

    t('a directory argument expands to its .json files, with a note', t_directory_argument_expands)

    def t_empty_directory_exits_2():
        empty = os.path.join(tmp, 'empty_dir')
        os.makedirs(empty, exist_ok=True)
        code, out, err = run_main([empty])
        check(code == 2, (code, out, err))
        check('no .json exports among the arguments' in err, err)

    t('an empty directory (nothing to measure) exits 2', t_empty_directory_exits_2)

    # ---- exit codes ----

    def t_not_met_exit_1():
        d = std('SOLO01', 'so-solo', 'mo-solo').doc()
        p = write(tmp, uniq('solo'), d)
        code, out, err = run_main([p])
        check(code == 1, code)
        check('KT-B NOT MET' in out, out)

    t('KT-B NOT MET exits with code 1', t_not_met_exit_1)

    def make_pass_suite(n_rooms=6, so_prefix='so-pass', mortar_prefix='mo-pass', repeats=3,
                         accept_after=15000, owners_in_rooms=()):
        """n_rooms useful rooms; mortar crews mo-<prefix>-{i%repeats} repeat across
        rooms so `repeats` distinct officers each appear in >=2 useful rooms.
        owners_in_rooms adds an extra confirmed owner member (post 'ot') to each
        listed room index, making the owner "present" there."""
        paths = []
        for i in range(n_rooms):
            so = f'{so_prefix}-{i}'
            mortar = f'{mortar_prefix}-{i % repeats}' if repeats else f'{mortar_prefix}-solo-{i}'
            r = std(f'PASS{i}AA', so, mortar, t0=BASE_T + i * 3600_000, accept_after=accept_after)
            if i in owners_in_rooms:
                mid = r.put_member('owner-client-01', 'ot', BASE_T + i * 3600_000 + 40000)
                r.confirm(mid, so, 'so', BASE_T + i * 3600_000 + 41000)
            paths.append(write(tmp, uniq(f'pass_{i}_'), r.doc()))
        return paths

    def t_all_good_suite_passes():
        paths = make_pass_suite()
        code, out, err = run_main(paths)
        check('useful rooms: 6 (need 6)' in out, out)
        check('distinct creators of useful rooms: 6 (need 3)' in out, out)
        check('useful rooms without the owner: 6 (need 1)' in out, out)
        check('officers in 2+ useful rooms, owner excluded: 3 (need 3)' in out, out)
        check('KT-B PASS' in out, out)
        check(code == 0, code)

    t('the all-good 6-room suite is KT-B PASS (exit 0)', t_all_good_suite_passes)

    def t_near_pass_median_too_slow():
        paths = make_pass_suite(accept_after=70000)
        code, out, err = run_main(paths)
        check('useful rooms: 6 (need 6)' in out, out)
        check('officers in 2+ useful rooms, owner excluded: 3 (need 3)' in out, out)
        check('70.0 s' in out, out)
        check('KT-B NOT MET' in out, out)
        check(code == 1, code)

    t('near-PASS suite breaking only the median (70 s): NOT MET', t_near_pass_median_too_slow)

    def t_near_pass_repeaters_only_via_non_useful_room():
        paths = make_pass_suite(repeats=0)  # 6 useful rooms, no repeats among them
        # a 7th, non-useful room reuses room 0's mortar crew: must not count.
        extra = Room('REPEATBAD', 'so-repeat-extra', BASE_T + 7 * 3600_000)
        mid = extra.put_member('mo-pass-solo-0', 'mortar', BASE_T + 7 * 3600_000 + 1000)
        extra.confirm(mid, 'so-repeat-extra', 'so', BASE_T + 7 * 3600_000 + 2000)
        paths.append(write(tmp, uniq('repeat_extra'), extra.doc()))
        code, out, err = run_main(paths)
        check('useful rooms: 6 (need 6)' in out, out)
        check('officers in 2+ useful rooms, owner excluded: 0 (need 3)' in out, out)
        check('KT-B NOT MET' in out, out)
        check(code == 1, code)

    t('near-PASS suite: a repeat only through a non-useful room does not count',
      t_near_pass_repeaters_only_via_non_useful_room)

    def t_near_pass_repeaters_are_owner_ids():
        owner_ids = ['owner-mortar-0', 'owner-mortar-1', 'owner-mortar-2']
        paths = []
        for i in range(6):
            mortar = owner_ids[i % 3]
            r = std(f'OWREP{i}AA', f'so-owrep-{i}', mortar, t0=BASE_T + i * 3600_000)
            paths.append(write(tmp, uniq(f'owrep_{i}_'), r.doc()))
        argv = paths + [a for oid in owner_ids for a in ('--owner', oid)]
        code, out, err = run_main(argv)
        check('useful rooms: 6 (need 6)' in out, out)
        check('distinct creators of useful rooms: 6 (need 3)' in out, out)
        check('officers in 2+ useful rooms, owner excluded: 0 (need 3)' in out, out)
        check('KT-B NOT MET' in out, out)
        check(code == 1, code)

    t('near-PASS suite: repeating officers who are owner ids do not count',
      t_near_pass_repeaters_are_owner_ids)

    def t_near_pass_no_room_without_owner():
        paths = make_pass_suite(owners_in_rooms=range(6))
        argv = paths + ['--owner', 'owner-client-01']
        code, out, err = run_main(argv)
        check('useful rooms: 6 (need 6)' in out, out)
        check('distinct creators of useful rooms: 6 (need 3)' in out, out)
        check('officers in 2+ useful rooms, owner excluded: 3 (need 3)' in out, out)
        check('useful rooms without the owner: 0 (need 1)' in out, out)
        check('KT-B NOT MET' in out, out)
        check(code == 1, code)

    t('near-PASS suite: the owner present in every room leaves none "without the owner"',
      t_near_pass_no_room_without_owner)

    def t_near_pass_creators_below_3():
        paths = []
        for i in range(6):
            so = f'so-fewcreators-{i % 2}'  # only 2 distinct creators across 6 rooms
            mortar = f'mo-fewcreators-{i % 3}'
            r = std(f'FEWC{i}AA', so, mortar, t0=BASE_T + i * 3600_000)
            paths.append(write(tmp, uniq(f'fewc_{i}_'), r.doc()))
        code, out, err = run_main(paths)
        check('useful rooms: 6 (need 6)' in out, out)
        check('distinct creators of useful rooms: 2 (need 3)' in out, out)
        # the 2 repeated SO creators plus the 3 repeated mortar crews all satisfy repeat>=3
        check('officers in 2+ useful rooms, owner excluded: 5 (need 3)' in out, out)
        check('KT-B NOT MET' in out, out)
        check(code == 1, code)

    t('near-PASS suite: only 2 distinct creators (need 3): NOT MET', t_near_pass_creators_below_3)

    # ---- final review 2026-09-14: journal events ----

    def t_events_are_not_work():
        r = std('EVTOK1', 'so-e-000001', 'mo-e-000001')
        so2 = 'so-e-000002'  # a staff officer who only switches radio silence: no work op, no client
        system = by('room', 'system')
        for at, who, name in [(BASE_T + 40000, by(so2, 'so'), 'silence_on'), (BASE_T + 41000, by(so2, 'so'), 'silence_off'),
                              (BASE_T + 50000, system, 'stop'), (BASE_T + 60000, system, 'start'),
                              (BASE_T + 600000, system, 'lock'), (BASE_T + 601000, by('so-e-000001', 'so'), 'unlock'),
                              (BASE_T + 602000, by('so-e-000001', 'so'), 'close')]:
            r.op(at, who, 'put', 'event', f'evt-{len(r.ops) + 1}', {'event': name})
        code, out, err = run_main([write(tmp, uniq('events_ok'), r.doc())])
        check('EVTOK1: useful=True' in out, out)
        check('done=1 ops=4 clients=2' in out, out)
        check(err == '', err)
        for bad_op, bad_data, needle in [('patch', {'event': 'lock'}, 'must be a put'),
                                         ('put', {'event': 'party'}, 'data.event must be one of'),
                                         ('put', None, 'data.event must be one of')]:
            b = std('EVTBAD', 'so-f-000001', 'mo-f-000001')
            b.op(BASE_T + 40000, system, bad_op, 'event', 'evt-9', bad_data)
            code, out, err = run_main([write(tmp, uniq('events_bad'), b.doc())])
            check(code == 2 and needle in err, (bad_op, bad_data, code, err))

    t('journal events: type-checked, never work ops or clients; a malformed event exits 2', t_events_are_not_work)

print('OK', passed, 'cases')
