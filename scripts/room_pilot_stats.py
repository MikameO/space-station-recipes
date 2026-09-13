# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 MikameO
"""
scripts/room_pilot_stats.py — pilot numbers for Vision bet B3 from room exports
(the JSON a staff officer downloads with «Скачать журнал»).

Usage: python scripts/room_pilot_stats.py <export.json> [...] [--owner <client-id> ...] [--stage so-mortar|full]

Decision record 2026-09-13_tactical-tablet.md, Decision 7 (KT-B). Review fixes
recorded 2026-09-14 (controller decisions):
  - Stage 1 usefulness is about confirmed POSTS, not confirmed browsers: `so`
    and `mortar` both confirmed, plus a request done by someone other than
    its author, plus the ops/clients thresholds. `full` needs 3 distinct
    confirmed posts instead of a specific pair.
  - Every client id passed via --owner is one identity, "the owner". A room
    the owner created still counts as useful but never as a distinct creator.
  - A room is identified by (fork, createdAt, id of its first op), so a code
    rotation is not a second room; among duplicates the export with the
    larger last seq (the more complete download) wins.
  - Repeat officers are counted over useful rooms only.
  - Median wait counts the first accepted timestamp only, and an accepted or
    done patch written by the request's own author is ignored — it is not a
    crew answering.

Exit codes: 0 KT-B PASS, 1 KT-B NOT MET, 2 bad input (a file failed to load
or shape-check; the run stops there — nothing is ever skipped silently for
being unreadable, only exact-duplicate rooms are skipped, loudly).
"""
import argparse
import json
import statistics
import sys
from collections import defaultdict

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Stage 1 (default `so-mortar`): a staff officer sends the mortar crew strike
# and position requests; the crew answers with statuses. Thresholds are lower
# than the full-version KT-B bet until the room grows past two roles; pass
# `--stage full` to check the export against the original bet.
STAGES = {
    'so-mortar': {'posts': ['so', 'mortar'], 'ops': 4, 'clients': 2,
                  'rooms': 6, 'creators': 3, 'without_owner': 1, 'repeat': 3},
    'full': {'min_posts': 3, 'ops': 10, 'clients': 3,
             'rooms': 6, 'creators': 3, 'without_owner': 1, 'repeat': 5},
}


def fail(path, reason):
    print(f'{path}: {reason}', file=sys.stderr)
    sys.exit(2)


def load(path):
    """Read one room export: utf-8-sig (tolerates a BOM), shape-checked. Stops
    the whole run with exit code 2 on any problem — never skips silently."""
    try:
        with open(path, encoding='utf-8-sig') as f:
            doc = json.load(f)
    except OSError as e:
        fail(path, str(e))
    except UnicodeDecodeError as e:
        fail(path, f'not valid UTF-8 ({e})')
    except json.JSONDecodeError as e:
        fail(path, f'invalid JSON ({e})')
    meta = doc.get('meta') if isinstance(doc, dict) else None
    if not isinstance(meta, dict) or not isinstance(meta.get('createdAt'), (int, float)):
        fail(path, 'meta must be an object with a numeric createdAt')
    ops = doc.get('ops')
    if not isinstance(ops, list):
        fail(path, 'ops must be a list')
    for i, op in enumerate(ops):
        by = op.get('by') if isinstance(op, dict) else None
        shaped = (isinstance(op, dict) and 'kind' in op and 'op' in op and 'id' in op and 'at' in op
                  and isinstance(by, dict) and 'client' in by)
        if not shaped:
            fail(path, f'op #{i} is missing kind/op/id/at/by.client')
    if meta['createdAt'] < 1e12:
        fail(path, f"meta.createdAt looks like seconds, not milliseconds ({meta['createdAt']!r})")
    return doc


def room_key(doc):
    """Identity of a room across repeat downloads and a code rotation: the
    code is a mutable alias (see decision 2026-09-13_tactical-tablet.md,
    "Сменить код"), not the room's identity, so a rotation is not a second
    room. (fork, createdAt, id of the very first op) is stable across both."""
    ops = doc.get('ops') or []
    first_id = ops[0]['id'] if ops else None
    return (doc['meta'].get('fork'), doc['meta'].get('createdAt'), first_id)


def last_seq(doc):
    seqs = [op.get('seq', 0) for op in (doc.get('ops') or []) if isinstance(op.get('seq'), (int, float))]
    return max(seqs) if seqs else 0


def room_stats(doc, owners, thresholds):
    ops = doc['ops']
    creator = None
    member_info = {}        # member op id -> {client, post, squad}, from its 'put'
    member_clients = set()  # every client that ever got a member 'put' (knocking or confirmed)
    confirmed_clients = set()
    confirmed_slots = set()  # (post, squad) of members that reached confirmed

    for op in ops:
        if op.get('kind') != 'member' or op.get('op') == 'del':
            continue
        data = op.get('data') or {}
        by_client = (op.get('by') or {}).get('client')
        if op['op'] == 'put':
            client = data.get('client') or by_client
            post, squad = data.get('post'), data.get('squad')
            member_info[op['id']] = {'client': client, 'post': post, 'squad': squad}
            member_clients.add(client)
            if data.get('confirmedBy') == 'creator':
                creator = client
            if data.get('confirmed'):
                confirmed_clients.add(client)
                confirmed_slots.add((post, squad))
        elif op['op'] == 'patch' and data.get('confirmed'):
            # A confirm patch is written by the confirmer, not the confirmed member —
            # map it back to the member's own client/post/squad through its member id.
            info = member_info.get(op['id'])
            if info and info['client']:
                confirmed_clients.add(info['client'])
                confirmed_slots.add((info['post'], info['squad']))

    confirmed_posts = {post for post, squad in confirmed_slots if post}
    if 'posts' in thresholds:
        posts_ok = set(thresholds['posts']) <= confirmed_posts
    else:
        posts_ok = len(confirmed_posts) >= thresholds['min_posts']

    work = [op for op in ops if op.get('kind') not in ('member', 'asset')
            or (op.get('kind') == 'asset' and (op.get('by') or {}).get('post') != 'system')]
    clients = {(op.get('by') or {}).get('client') for op in work if (op.get('by') or {}).get('post') != 'system'}

    author_of, requested_at, accepted_at = {}, {}, {}
    denied_ids, done_ids, self_handled = set(), set(), set()
    for op in ops:
        if op.get('kind') != 'request':
            continue
        rid = op['id']
        by_client = (op.get('by') or {}).get('client')
        data = op.get('data') or {}
        status = data.get('status')
        if op['op'] == 'put':
            author_of[rid] = by_client
            requested_at[rid] = op['at']
            continue
        if op['op'] != 'patch':
            continue
        is_self = rid in author_of and by_client == author_of[rid]
        if is_self and status in ('accepted', 'done'):
            # The room shows requests answered by someone else; the author
            # closing their own ticket is not that, so it is ignored here.
            self_handled.add(rid)
            continue
        if status == 'accepted' and rid not in accepted_at:
            accepted_at[rid] = op['at']
        if status == 'denied':
            denied_ids.add(rid)
        if status == 'done':
            done_ids.add(rid)

    waits = [(accepted_at[i] - requested_at[i]) / 1000 for i in accepted_at if i in requested_at]
    n_requests = len(author_of)
    n_denied = len(denied_ids)
    n_accepted = len([r for r in accepted_at if r not in denied_ids])
    n_unanswered = n_requests - n_denied - n_accepted

    useful = posts_ok and len(done_ids) >= 1 and len(work) >= thresholds['ops'] and len(clients) >= thresholds['clients']
    return {
        'code': doc['meta'].get('code'), 'creator': creator, 'confirmed_posts': sorted(confirmed_posts),
        'requests_done': len(done_ids), 'ops': len(work), 'clients': len(clients), 'useful': useful,
        'owner_present': bool(owners & (member_clients | confirmed_clients)),
        'officers': sorted(confirmed_clients), 'accept_waits': waits, 'self_handled': len(self_handled),
        'requests': n_requests, 'accepted': n_accepted, 'denied': n_denied, 'unanswered': n_unanswered,
    }


def load_and_dedupe(paths):
    """Loads every .json export (a .txt sibling — the downloaded chronology —
    is ignored by extension, with a printed note, rather than treated as bad
    input: a shell glob like `export-*` easily catches it alongside the real
    downloads). Among files that resolve to the same room_key, keeps the one
    with the larger last op seq and prints a line for every file it drops."""
    docs = []
    for p in paths:
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
    return [kept[k][1] for k in order]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('exports', nargs='+')
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
    n_unanswered = sum(r['unanswered'] for r in rooms)

    for r in rooms:
        print(f"{r['code']}: useful={r['useful']} posts={','.join(r['confirmed_posts']) or '-'} "
              f"done={r['requests_done']} ops={r['ops']} clients={r['clients']} owner={r['owner_present']}")
    print(f'ignored {ignored} requests handled by their author')

    passed = (len(useful) >= thresholds['rooms'] and len(creators) >= thresholds['creators']
              and len(without_owner) >= thresholds['without_owner'] and len(repeat_officers) >= thresholds['repeat']
              and median_wait is not None and median_wait < 60)
    print(f"useful rooms: {len(useful)} (need {thresholds['rooms']})")
    print(f"distinct creators of useful rooms: {len(creators)} (need {thresholds['creators']})")
    print(f"useful rooms without the owner: {len(without_owner)} (need {thresholds['without_owner']})")
    print(f"officers in 2+ useful rooms, owner excluded: {len(repeat_officers)} (need {thresholds['repeat']})")
    wait_text = '—' if median_wait is None else str(round(median_wait, 1))
    print(f'median request→accept: {wait_text} s (need < 60)  '
          f'requests {n_requests} / accepted {n_accepted} / denied {n_denied} / unanswered {n_unanswered}')
    print('caveat: counts are by browser client id, a room stands in for one round, '
          'repeaters are counted over useful rooms only')
    print('KT-B', 'PASS' if passed else 'NOT MET')
    return 0 if passed else 1


if __name__ == '__main__':
    sys.exit(main())
