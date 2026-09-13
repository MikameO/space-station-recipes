# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 MikameO
# scripts/room_pilot_stats.py — pilot numbers for Vision bet B3 from room exports
# (the JSON a staff officer downloads with «Скачать журнал»).
# Usage: python scripts/room_pilot_stats.py <export.json> [...] [--owner <client-id> ...] [--stage so-mortar|full]
# Decision record 2026-09-13_tactical-tablet.md, Decision 7 (KT-B).
#
# Stage 1 (default `so-mortar`): a staff officer sends the mortar crew strike
# and position requests; the crew answers with statuses. Thresholds are lower
# than the full-version KT-B bet until the room grows past two roles; pass
# `--stage full` to check the export against the original bet.
import argparse, json, statistics, sys
from collections import defaultdict


def room_stats(doc, owners, T):
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
    useful = len(confirmed) >= T['confirmed'] and len(done) >= 1 and len(work) >= T['ops'] and len(clients) >= T['clients']
    return {
        'code': doc['meta'].get('code'), 'creator': creator, 'confirmed': len(confirmed), 'requests_done': len(done),
        'ops': len(work), 'clients': len(clients), 'useful': useful,
        'owner_present': bool(owners & (members | confirmed)), 'officers': sorted(confirmed), 'accept_waits': waits,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('exports', nargs='+')
    ap.add_argument('--owner', action='append', default=[], help='client id(s) of the project owner')
    STAGES = {
        'so-mortar': {'confirmed': 2, 'ops': 4, 'clients': 2, 'rooms': 6, 'creators': 3, 'without_owner': 1, 'repeat': 3},
        'full': {'confirmed': 3, 'ops': 10, 'clients': 3, 'rooms': 6, 'creators': 3, 'without_owner': 1, 'repeat': 5},
    }
    ap.add_argument('--stage', choices=sorted(STAGES), default='so-mortar')
    args = ap.parse_args()
    owners = set(args.owner)
    T = STAGES[args.stage]
    rooms = [room_stats(json.load(open(p, encoding='utf-8')), owners, T) for p in args.exports]
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
    passed = (len(useful) >= T['rooms'] and len(creators) >= T['creators'] and len(without_owner) >= T['without_owner']
              and len(repeat_officers) >= T['repeat'] and median_wait is not None and median_wait < 60)
    print(f"useful rooms: {len(useful)} (need {T['rooms']})")
    print(f"distinct creators of useful rooms: {len(creators)} (need {T['creators']})")
    print(f"useful rooms without the owner: {len(without_owner)} (need {T['without_owner']})")
    print(f"officers in 2+ rooms, owner excluded: {len(repeat_officers)} (need {T['repeat']})")
    print(f"median request→accept: {'—' if median_wait is None else round(median_wait, 1)} s (need < 60)")
    print('KT-B', 'PASS' if passed else 'NOT MET')
    return 0


if __name__ == '__main__':
    sys.exit(main())
