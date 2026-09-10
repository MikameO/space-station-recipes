#!/usr/bin/env python3
"""Golden set for the ordnance layer.

Seventeen mixtures taken from the Marine Corps Core field guide, each with the
numbers the guide reports. Regenerating ordnance/<fork>.json must keep
reproducing them; a balance patch upstream will show up here first.

The guide reports fire as intensity / reach / duration, where "reach" is the
fire radius for a diamond and the ray length for a star.

Run: python ss14_ordnance.py --verify
"""

FORK = "stories_cm"

M40 = "RMCM40GrenadeCasing"
M15 = "RMCM15GrenadeCasing"
MINE = "RMCM20MineCasing"
C4 = "RMCC4PlasticCasing"
ROCKET = "RMC88mmRocketWarhead"
MORTAR = "RMC80mmMortarWarhead"

A, C, O = "RMCANFO", "RMCCyclonite", "RMCOctogen"
FE, H, OX = "RMCIron", "RMCHydrogen", "RMCOxygen"
PH, CB, CLF = "RMCPhosphorus", "RMCCarbon", "RMCCLF3"
WF = "RMCWeldingFuel"

# name, casing, mix, expected
#   power, blastRadius, shards, fireIntensity, reach, fireDuration, star
CASES = [
    ("Пращник", M40, {A: 35, C: 85}, dict(power=162, blast=6.5)),
    ("Гексоген-соло", M40, {C: 120}, dict(power=180, blast=5.6)),
    ("Горячий гексоген", M40, {CLF: 14, C: 106},
     dict(power=159, blast=4.2, fi=25, reach=1, fd=3)),
    ("Дальнобой", M15, {A: 115, C: 65}, dict(power=212, blast=8.5)),
    ("Дальнобой-потолок", M15, {A: 100, C: 80}, dict(power=220, blast=7.9)),
    ("Осколочный максимум", M15, {FE: 80, O: 100},
     dict(power=200, blast=2.0, shards=20, fi=30, reach=1, fd=3)),
    ("Солнцепёк-МС", M15, {H: 60, PH: 30, CB: 60, OX: 30},
     dict(blast=None, fi=30, reach=5, fd=27)),
    ("Ёж-15", M15, {FE: 80, H: 50, OX: 50},
     dict(power=7.5, blast=None, shards=20, fi=30, reach=5, fd=3)),
    ("МАФИН", MINE, {A: 100}, dict(power=100, blast=4.0)),
    ("Пробойник", C4, {O: 180},
     dict(power=280, blast=3.3, fi=50, reach=3, fd=5, star=True)),
    ("Гексоген-пробойник", C4, {C: 180}, dict(power=270, blast=5.6)),
    ("Оптимум-84", ROCKET, {A: 100, C: 80}, dict(power=220, blast=3.2)),
    ("Чистый гексоген", MORTAR, {C: 240}, dict(power=360, blast=10.6)),
    ("Дальнобой-миномёт", MORTAR, {A: 45, C: 195}, dict(power=337.5, blast=13.5)),
    ("Дальнобой-эконом", MORTAR, {A: 170, C: 70}, dict(power=275, blast=11.0)),
    ("Шрапнельный дождь", MORTAR, {FE: 200, O: 40},
     dict(power=80, blast=None, shards=50, fi=16, reach=3, fd=5)),
    # Known drift: the live server runs welding-fuel potencies at twice the
    # published values, so the guide sees intensity 45 (clamped) where the
    # public code gives 24. Tracked, not fixed — see the design doc.
    ("Сварочный молот", MORTAR, {WF: 240},
     dict(power=28.8, blast=None, fi=45, reach=4, fd=48, star=True,
          known_drift="welding fuel potency doubled on the live build")),
]

TOL = {"power": 0.6, "blast": 0.06}


def verify(written: dict) -> bool:
    import json
    from ss14_ordnance import compute_stats

    path = written.get(FORK)
    if path is None:
        print(f"  FAIL: {FORK} was not built")
        return False
    payload = json.loads(path.read_text(encoding="utf-8"))
    reagents, casings = payload["reagents"], payload["casings"]
    iron = payload["formula"]["ironReagent"]

    passed = drifted = failed = 0
    for name, casing_id, mix, exp in CASES:
        casing = casings.get(casing_id)
        if casing is None:
            print(f"  FAIL {name}: casing {casing_id} missing")
            failed += 1
            continue
        try:
            got = compute_stats(mix, casing, reagents, iron=iron)
        except KeyError as e:
            print(f"  FAIL {name}: {e}")
            failed += 1
            continue

        problems = []
        if "power" in exp and abs(got["power"] - exp["power"]) > TOL["power"]:
            problems.append(f"power {got['power']:.1f} != {exp['power']}")
        if exp.get("blast") is None:
            if got["hasBlast"]:
                problems.append(f"expected no blast, got radius {got['blastRadius']:.2f}")
        elif "blast" in exp and abs(got["blastRadius"] - exp["blast"]) > TOL["blast"]:
            problems.append(f"blast {got['blastRadius']:.2f} != {exp['blast']}")
        for key, field in (("shards", "shards"), ("fi", "fireIntensity"),
                           ("fd", "fireDuration"), ("reach", "reach")):
            if key in exp and abs(got[field] - exp[key]) > 0.5:
                problems.append(f"{field} {got[field]} != {exp[key]}")
        if "star" in exp and got["star"] != exp["star"]:
            problems.append(f"star {got['star']} != {exp['star']}")

        if not problems:
            passed += 1
        elif exp.get("known_drift"):
            drifted += 1
            print(f"  DRIFT {name}: {'; '.join(problems)}  ({exp['known_drift']})")
        else:
            failed += 1
            print(f"  FAIL  {name}: {'; '.join(problems)}")

    print(f"  reference: {passed} passed, {drifted} known drift, {failed} failed "
          f"(of {len(CASES)})")
    return failed == 0
