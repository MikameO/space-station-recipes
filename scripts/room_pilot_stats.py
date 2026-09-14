# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 MikameO
# This file is part of Space Station Recipes.
# See LICENSE for details.
"""
scripts/room_pilot_stats.py — pilot numbers for Vision bet B3 from room exports
(the JSON a staff officer downloads with «Скачать журнал»).

Usage: python scripts/room_pilot_stats.py <export.json|dir> [...] [--owner <id> ...] [--stage so-mortar|full]

Decision record 2026-09-13_tactical-tablet.md, Decision 7 (KT-B). Review fixes
recorded 2026-09-14 (controller decisions), second round:
  - Stage 1 usefulness is about confirmed POSTS, not confirmed browsers: `so`
    and `mortar` both confirmed, plus a request DONE BY A MEMBER OF POST
    `mortar` specifically (a second staff officer doing the crew's job does
    not make the room useful), plus the ops/clients thresholds. `full` keeps
    the looser "done by any non-author" rule and needs 3 distinct confirmed
    posts instead of a specific pair.
  - Every client id passed via --owner is one identity, "the owner". A room
    the owner created still counts as useful but never as a distinct creator;
    repeat officers are counted over useful rooms only, owner ids excluded.
  - A room is identified by (fork, createdAt, id of its first op) — a code
    rotation is not a second room; among duplicates sharing that key, the
    export with the larger last op seq (the more complete download) wins.
  - A `put` resets a request's tracked state (a re-put starts a fresh
    lifecycle under the same id). Its first non-self `accepted` is the only
    point counted for A and for the median. A non-self `denied` counts as D
    only while the request has not yet been accepted — "accepted, then
    denied" still counts as A. An author denying (withdrawing) their own
    request is neither A nor D: it is counted as "cancelled" (C), and stays
    out of "unanswered" (U). Every request that ever had a `put` lands in
    exactly one of A/D/C/U, so N (requests) == A + D + C + U, asserted.
    An accepted/done patch written by the request's own author is ignored
    for A/"done" (self-service is not a crew answering it), and counted
    once per request lifecycle as "ignored ... handled by their author".
    A request patch with no matching prior `put` (id reused oddly, or a
    truncated export) is ignored with a warning line, never guessed at.
  - load() validates every field's *type*, not just its presence, and
    requires ops[0] to be the creator's member put (confirmedBy=='creator')
    as a guard against the export format silently drifting under us; any
    violation exits 2 with a message, never a traceback.
  - Journal `event` ops (radio silence on/off, close, unlock, the idle lock,
    the administration stop/start; review fix 2026-09-14) are type-checked —
    a `put` with a known `data.event` — and never count as work ops or clients.
  - A directory argument expands to its `*.json` files (noted on stdout); a
    non-`.json` file is skipped (noted); if nothing is left afterward, the
    run exits 2 rather than silently reporting on zero rooms.

Exit codes: 0 KT-B PASS, 1 KT-B NOT MET, 2 bad input (a file failed to load
or shape-check, or nothing was left to measure — the run stops there; only
exact-duplicate rooms are ever skipped, and always loudly).
"""
import argparse
import glob
import json
import os
import statistics
import sys
from collections import defaultdict

# Stage 1 (default `so-mortar`): a staff officer sends the mortar crew strike
# and position requests; the crew answers with statuses. Thresholds are lower
# than the full-version KT-B bet until the room grows past two roles; pass
# `--stage full` to check the export against the original bet. `done_by_posts`
# is the set of poster posts whose (non-self) `done` patch counts toward
# usefulness — `None` means "any non-author", as the full version still allows.
STAGES = {
    'so-mortar': {'posts': ['so', 'mortar'], 'done_by_posts': ['mortar'], 'ops': 4, 'clients': 2,
                  'rooms': 6, 'creators': 3, 'without_owner': 1, 'repeat': 3},
    'full': {'min_posts': 3, 'done_by_posts': None, 'ops': 10, 'clients': 3,
             'rooms': 6, 'creators': 3, 'without_owner': 1, 'repeat': 5},
}


# Journal events the Worker writes (worker/room/room.js eventOp): no object, no work.
EVENTS = ('silence_on', 'silence_off', 'close', 'unlock', 'lock', 'stop', 'start')


def fail(path, reason):
    print(f'{path}: {reason}', file=sys.stderr)
    sys.exit(2)


def _is_num(v):
    """int/float, but not bool — bool is a Python int subclass."""
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _is_str_or_none(v):
    return v is None or isinstance(v, str)


def _check_op_shape(path, i, op):
    """Type-checks one op: kind/op present, id str, at a number, data an
    object or null, by.client a non-empty string, by.post a string or null,
    and — for a member op — data.client/post/squad each a string or null."""
    if not isinstance(op, dict):
        fail(path, f'op #{i} must be an object')
    if 'kind' not in op or 'op' not in op:
        fail(path, f'op #{i} is missing kind/op')
    if not isinstance(op.get('id'), str):
        fail(path, f'op #{i}.id must be a string')
    if not _is_num(op.get('at')):
        fail(path, f'op #{i}.at must be a number')
    data = op.get('data')
    if data is not None and not isinstance(data, dict):
        fail(path, f'op #{i}.data must be an object or null')
    by = op.get('by')
    if not isinstance(by, dict):
        fail(path, f'op #{i}.by must be an object')
    client = by.get('client')
    if not isinstance(client, str) or not client:
        fail(path, f'op #{i}.by.client must be a non-empty string')
    if not _is_str_or_none(by.get('post')):
        fail(path, f'op #{i}.by.post must be a string or null')
    if op.get('kind') == 'member' and isinstance(data, dict):
        for key in ('client', 'post', 'squad'):
            if not _is_str_or_none(data.get(key)):
                fail(path, f'op #{i}.data.{key} must be a string or null')
    if op.get('kind') == 'event':
        if op.get('op') != 'put':
            fail(path, f"op #{i} is an event, so it must be a put (got {op.get('op')!r})")
        event = data.get('event') if isinstance(data, dict) else None
        if not isinstance(event, str) or event not in EVENTS:
            fail(path, f"op #{i}.data.event must be one of {', '.join(EVENTS)} (got {event!r})")


def load(path):
    """Reads one room export: utf-8-sig (tolerates a BOM), fully type-checked.
    Stops the whole run with exit code 2 on any problem — never a traceback,
    never a silent skip."""
    try:
        with open(path, encoding='utf-8-sig') as f:
            doc = json.load(f)
    except OSError as e:
        fail(path, str(e))
    except UnicodeDecodeError as e:
        fail(path, f'not valid UTF-8 ({e})')
    except json.JSONDecodeError as e:
        fail(path, f'invalid JSON ({e})')
    except RecursionError:
        fail(path, 'JSON nesting too deep')

    if not isinstance(doc, dict):
        fail(path, 'top level must be an object')
    meta = doc.get('meta')
    if not isinstance(meta, dict):
        fail(path, 'meta must be an object')
    if not isinstance(meta.get('fork'), str):
        fail(path, 'meta.fork must be a string')
    if not _is_num(meta.get('createdAt')):
        fail(path, 'meta.createdAt must be a number')
    if meta['createdAt'] < 1e12:
        fail(path, f"meta.createdAt looks like seconds, not milliseconds ({meta['createdAt']!r})")

    ops = doc.get('ops')
    if not isinstance(ops, list):
        fail(path, 'ops must be a list')
    for i, op in enumerate(ops):
        _check_op_shape(path, i, op)

    first = ops[0] if ops else None
    first_data = first.get('data') if isinstance(first, dict) else None
    is_creator_put = (isinstance(first, dict) and first.get('kind') == 'member' and first.get('op') == 'put'
                       and isinstance(first_data, dict) and first_data.get('confirmedBy') == 'creator')
    if not is_creator_put:
        fail(path, "ops[0] must be the creator's member put (confirmedBy == 'creator')")
    return doc


def room_key(doc):
    """Identity of a room across repeat downloads and a code rotation: the
    code is a mutable alias (see decision 2026-09-13_tactical-tablet.md,
    "Сменить код"), not the room's identity, so a rotation is not a second
    room. (fork, createdAt, id of the very first op) is stable across both;
    two files with the same key are treated as duplicate downloads of one
    room, never as two rooms."""
    ops = doc.get('ops') or []
    first_id = ops[0]['id'] if ops else None
    return (doc['meta'].get('fork'), doc['meta'].get('createdAt'), first_id)


def last_seq(doc):
    seqs = [op.get('seq', 0) for op in (doc.get('ops') or []) if _is_num(op.get('seq'))]
    return max(seqs) if seqs else 0


def room_stats(doc, owners, thresholds):
    ops = doc['ops']
    code = doc['meta'].get('code')
    creator = None
    member_info = {}        # member op id -> {client, post}, from its 'put'
    member_clients = set()  # every client that ever got a member 'put' (knocking or confirmed)
    confirmed_clients = set()
    confirmed_posts = set()  # post ids of members that reached confirmed

    for op in ops:
        if op.get('kind') != 'member' or op.get('op') == 'del':
            continue
        data = op.get('data') or {}
        by_client = (op.get('by') or {}).get('client')
        if op['op'] == 'put':
            client = data.get('client') or by_client
            post = data.get('post')
            member_info[op['id']] = {'client': client, 'post': post}
            member_clients.add(client)
            if data.get('confirmedBy') == 'creator':
                creator = client
            if data.get('confirmed'):
                confirmed_clients.add(client)
                if post:
                    confirmed_posts.add(post)
        elif op['op'] == 'patch' and data.get('confirmed'):
            # A confirm patch is written by the confirmer, not the confirmed member —
            # map it back to the member's own client/post through its member id.
            info = member_info.get(op['id'])
            if info and info['client']:
                confirmed_clients.add(info['client'])
                if info['post']:
                    confirmed_posts.add(info['post'])

    if 'posts' in thresholds:
        posts_ok = set(thresholds['posts']) <= confirmed_posts
    else:
        posts_ok = len(confirmed_posts) >= thresholds['min_posts']

    work = [op for op in ops if op.get('kind') not in ('member', 'asset', 'event')
            or (op.get('kind') == 'asset' and (op.get('by') or {}).get('post') != 'system')]
    clients = {(op.get('by') or {}).get('client') for op in work
               if (op.get('by') or {}).get('post') != 'system'}

    # One record per request id, alive between a `put` and the next `put` of
    # the same id (a re-put throws the old record away — fresh lifecycle).
    records = {}
    done_by_posts = thresholds['done_by_posts']
    self_handled_total = 0
    for op in ops:
        if op.get('kind') != 'request':
            continue
        rid = op['id']
        by_client = (op.get('by') or {}).get('client')
        by_post = (op.get('by') or {}).get('post')
        data = op.get('data') or {}
        status = data.get('status')

        if op['op'] == 'put':
            records[rid] = {'author': by_client, 'requested_at': op['at'], 'first_accept_at': None,
                             'cancelled': False, 'denied_before_accept': False,
                             'done_any': False, 'done_ok': False, 'self_counted': False}
            continue
        if op['op'] != 'patch':
            continue
        rec = records.get(rid)
        if rec is None:
            print(f'warning: room {code}: request patch for {rid!r} with no prior put, ignored',
                  file=sys.stderr)
            continue

        is_self = by_client == rec['author']
        if status == 'accepted':
            if is_self:
                if not rec['self_counted']:
                    self_handled_total += 1
                    rec['self_counted'] = True
            elif rec['first_accept_at'] is None:
                rec['first_accept_at'] = op['at']
        elif status == 'denied':
            if is_self:
                rec['cancelled'] = True
            elif rec['first_accept_at'] is None:
                rec['denied_before_accept'] = True
            # a denial after a valid (non-self) acceptance does not change the bucket
        elif status == 'done':
            if is_self:
                if not rec['self_counted']:
                    self_handled_total += 1
                    rec['self_counted'] = True
            else:
                rec['done_any'] = True
                if done_by_posts is None or by_post in done_by_posts:
                    rec['done_ok'] = True

    n_accepted = n_denied = n_cancelled = n_unanswered = done_any_count = 0
    done_ok_any = False
    waits = []
    for rec in records.values():
        if rec['first_accept_at'] is not None:
            n_accepted += 1
            waits.append((rec['first_accept_at'] - rec['requested_at']) / 1000)
        elif rec['cancelled']:
            n_cancelled += 1
        elif rec['denied_before_accept']:
            n_denied += 1
        else:
            n_unanswered += 1
        if rec['done_any']:
            done_any_count += 1
        if rec['done_ok']:
            done_ok_any = True
    n_requests = len(records)
    assert n_requests == n_accepted + n_denied + n_cancelled + n_unanswered, (
        f'accounting mismatch in room {code}: {n_requests} requests but '
        f'{n_accepted}+{n_denied}+{n_cancelled}+{n_unanswered} counted')

    useful = (posts_ok and done_ok_any and len(work) >= thresholds['ops']
              and len(clients) >= thresholds['clients'])
    return {
        'code': code, 'creator': creator, 'confirmed_posts': sorted(confirmed_posts),
        'requests_done': done_any_count, 'ops': len(work), 'clients': len(clients), 'useful': useful,
        'owner_present': bool(owners & member_clients),
        'officers': sorted(confirmed_clients), 'accept_waits': waits, 'self_handled': self_handled_total,
        'requests': n_requests, 'accepted': n_accepted, 'denied': n_denied,
        'cancelled': n_cancelled, 'unanswered': n_unanswered,
    }


def load_and_dedupe(paths):
    """Expands any directory argument to its `*.json` files (noted); skips
    any remaining argument not ending in `.json` (noted) — a shell glob like
    `export-*` easily catches the downloaded chronology .txt alongside the
    real exports. Loads and type-checks what is left, then de-duplicates by
    room_key: among files sharing a key, the one with the larger last op seq
    (the more complete download) wins and every other one prints a line
    saying so. Exits 2 if no room is left standing at the end."""
    expanded = []
    for p in paths:
        if os.path.isdir(p):
            found = sorted(glob.glob(os.path.join(p, '*.json')))
            print(f'expanding directory {p} to {len(found)} .json file(s)')
            expanded.extend(found)
        else:
            expanded.append(p)

    docs = []
    for p in expanded:
        if not p.lower().endswith('.json'):
            print(f'ignoring {p} (not a .json export)')
            continue
        docs.append((p, load(p)))

    kept = {}
    order = []
    for p, doc in docs:
        key = room_key(doc)
        if key not in kept:
            kept[key] = (p, doc)
            order.append(key)
            continue
        old_p, old_doc = kept[key]
        if last_seq(doc) > last_seq(old_doc):
            print(f'skipped duplicate {old_p} (same room as {p})')
            kept[key] = (p, doc)
        else:
            print(f'skipped duplicate {p} (same room as {old_p})')

    result = [kept[k][1] for k in order]
    if not result:
        print('no .json exports among the arguments', file=sys.stderr)
        sys.exit(2)
    return result


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')

    ap = argparse.ArgumentParser()
    ap.add_argument('exports', nargs='+', help='export .json files, or directories of them')
    ap.add_argument('--owner', action='append', default=[],
                     help='client id(s) of the project owner; every id passed here is one identity')
    ap.add_argument('--stage', choices=sorted(STAGES), default='so-mortar')
    args = ap.parse_args()
    owners = set(args.owner)
    thresholds = STAGES[args.stage]

    docs = load_and_dedupe(args.exports)
    rooms = [room_stats(doc, owners, thresholds) for doc in docs]

    useful = [r for r in rooms if r['useful']]
    creators = {r['creator'] for r in useful if r['creator'] and r['creator'] not in owners}
    without_owner = [r for r in useful if not r['owner_present']]
    seen = defaultdict(int)
    for r in useful:  # repeaters are counted over useful rooms only
        for o in r['officers']:
            seen[o] += 1
    repeat_officers = [o for o, n in seen.items() if n >= 2 and o not in owners]
    waits = [w for r in rooms for w in r['accept_waits']]
    median_wait = statistics.median(waits) if waits else None
    ignored = sum(r['self_handled'] for r in rooms)
    n_requests = sum(r['requests'] for r in rooms)
    n_accepted = sum(r['accepted'] for r in rooms)
    n_denied = sum(r['denied'] for r in rooms)
    n_cancelled = sum(r['cancelled'] for r in rooms)
    n_unanswered = sum(r['unanswered'] for r in rooms)
    assert n_requests == n_accepted + n_denied + n_cancelled + n_unanswered

    for r in rooms:
        print(f"{r['code']}: useful={r['useful']} posts={','.join(r['confirmed_posts']) or '-'} "
              f"done={r['requests_done']} ops={r['ops']} clients={r['clients']} owner={r['owner_present']}")
    print(f'ignored {ignored} requests handled by their author')

    passed = (len(useful) >= thresholds['rooms'] and len(creators) >= thresholds['creators']
              and len(without_owner) >= thresholds['without_owner']
              and len(repeat_officers) >= thresholds['repeat']
              and median_wait is not None and median_wait < 60)
    print(f"useful rooms: {len(useful)} (need {thresholds['rooms']})")
    print(f"distinct creators of useful rooms: {len(creators)} (need {thresholds['creators']})")
    print(f"useful rooms without the owner: {len(without_owner)} (need {thresholds['without_owner']})")
    print(f"officers in 2+ useful rooms, owner excluded: "
          f"{len(repeat_officers)} (need {thresholds['repeat']})")
    wait_text = '—' if median_wait is None else str(round(median_wait, 1))
    print(f'median request→accept: {wait_text} s (need < 60)  requests {n_requests} / '
          f'accepted {n_accepted} / denied {n_denied} / cancelled {n_cancelled} / unanswered {n_unanswered}')
    print('caveat: counts are by browser client id, a room stands in for one round, '
          'repeaters are counted over useful rooms only')
    dbp = thresholds['done_by_posts']
    done_rule = f"post {'/'.join(dbp)}" if dbp else 'any non-author'
    print(f"caveat: stage {args.stage} counts a request as usefully done only when closed by {done_rule}")
    print('KT-B', 'PASS' if passed else 'NOT MET')
    return 0 if passed else 1


if __name__ == '__main__':
    sys.exit(main())
