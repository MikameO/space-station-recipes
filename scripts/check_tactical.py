#!/usr/bin/env python3
"""Offline checks for the tactical map data in tactical/ (Series T).

Runs in CI without network access or third-party packages: the index and every
planet file are validated against the schema, RLE rows must cover the map width,
area indices must exist, the PNG size (read from its IHDR chunk) must match the
bounds, and each planet hash `h` must be reproducible from the committed bytes.
When the data was built at the research commit, LV-624 is also compared with the
numbers recorded in docs/design/2026-09-13-tactical-map.md.

If ss14_tactical.py can be imported (PyYAML and Pillow installed), the constants in
the index are also compared with its MIRROR.

Run: python scripts/check_tactical.py
"""
import hashlib
import json
import re
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "tactical"

# LV-624 at the commits the research used (tiles that carry an area, per flag).
GOLDEN = {
    ("rmc14", "c82d001cc"): {"areas": 75, "labels": 21,
                              "flags": {"OB": 38850, "CAS": 19392, "mortarFire": 19381,
                                        "mortarPlacement": 15982, "supplyDrop": 19381},
                              "inserts": {"Corporate Dome": 0.1, "CLF ship": 0.0, "Nexus Barricaded": 0.3, "Hydro Destroyed": 0.3, "Medbay": 0.1, "Together Surv Spawn": 0.9}},
    ("stories_cm", "024d853a1"): {"areas": 75, "labels": 21,
                                   "flags": {"OB": 38850, "CAS": 19392, "mortarFire": 19381,
                                             "mortarPlacement": 15982, "supplyDrop": 19381},
                                   "inserts": {"Corporate Dome": 0.1, "CLF ship": 0.0, "Nexus Barricaded": 0.3, "Hydro Destroyed": 0.3, "Medbay": 0.1, "Together Surv Spawn": 0.9}},
}
FLAG_BITS = {"OB": 1, "CAS": 2, "mortarFire": 4, "mortarPlacement": 8, "supplyDrop": 16, "landingZone": 32, "lasing": 64}
MORTAR_KEYS = {"minRange", "maxRange", "maxDial", "maxTarget", "tilesPerOffset", "jitter", "targetDelay",
               "deployDelay", "loadDelay", "travelDelay", "impactWarningDelay", "impactDelay", "warnRange", "impactWarnRange"}
OB_KEYS = {"scatter", "cooldown", "timeline", "warnRanges"}

failures: list[str] = []


def fail(msg: str) -> None:
    failures.append(msg)
    print(f"FAIL {msg}")


def png_size(data: bytes) -> tuple[int, int]:
    if data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise ValueError("not a PNG")
    return struct.unpack(">II", data[16:24])


def rle_width(row) -> int:
    if not isinstance(row, list) or len(row) % 2:
        raise ValueError("RLE row must be a flat list of value/run pairs")
    return sum(row[1::2])


def check_rows(name: str, rows, width: int, height: int, max_value: int) -> None:
    if len(rows) != height:
        fail(f"{name}: {len(rows)} rows, expected {height}")
        return
    for i, row in enumerate(rows):
        try:
            covered = rle_width(row)
        except ValueError as e:
            fail(f"{name}: row {i}: {e}")
            return
        if covered != width:
            fail(f"{name}: row {i} covers {covered} of {width}")
            return
        if any(not isinstance(v, int) or v < 0 or v > max_value for v in row[0::2]):
            fail(f"{name}: row {i} has a value outside 0..{max_value}")
            return


def flag_counts(planet: dict) -> dict[str, int]:
    areas = planet["areas"]
    counts = {k: 0 for k in FLAG_BITS}
    for row in planet["grid"]:
        for value, run in zip(row[0::2], row[1::2]):
            if value:
                flags = areas[value - 1][3]
                for k, bit in FLAG_BITS.items():
                    if flags & bit:
                        counts[k] += run
    return counts


def check_sprites(fork: dict) -> None:
    """The fork's landmark atlas: the files exist, the hash matches, every box lies
    inside the image, and every landmark prototype of the fork has a box or is
    known to draw nothing (a prototype without a Sprite component)."""
    key, sp = fork.get("key"), fork.get("sprites")
    if not (isinstance(sp, dict) and isinstance(sp.get("file"), str) and re.fullmatch(r"[0-9a-f]{12}", str(sp.get("h", "")))):
        fail(f"{key}: sprites entry missing or malformed")
        return
    jp, pp = DATA / f"{sp['file']}.json", DATA / f"{sp['file']}.png"
    if not jp.is_file() or not pp.is_file():
        fail(f"{key}: {sp['file']}.json/.png missing")
        return
    data = json.loads(jp.read_text(encoding="utf-8"))
    png = pp.read_bytes()
    stored_h = data.pop("h", None)
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if stored_h != sp["h"] or hashlib.sha1(body + png).hexdigest()[:12] != stored_h:
        fail(f"{key}: sprites hash mismatch")
    w, h = png_size(png)
    protos = data.get("protos") or {}
    for proto, box in protos.items():
        if not (isinstance(box, list) and len(box) == 4 and all(isinstance(v, int) and v >= 0 for v in box)
                and box[2] > 0 and box[3] > 0 and box[0] + box[2] <= w and box[1] + box[3] <= h):
            fail(f"{key}: sprite box of {proto} outside the atlas")
            break
    for src in data.get("rsi") or []:
        if not (isinstance(src, dict) and src.get("path") and isinstance(src.get("license"), str)):
            fail(f"{key}: malformed RSI source {src!r}")
            break
        if not src["license"]:
            fail(f"{key}: RSI {src['path']} states no license")
    used = set()
    for meta in fork.get("planets") or []:
        for lv in meta.get("levels") or []:
            stem = meta["file"] if lv["depth"] == 0 else f"{meta['file']}.{lv['depth']}"
            planet = json.loads((DATA / f"{stem}.json").read_text(encoding="utf-8"))
            used |= {row[0] for row in (planet.get("landmarks") or {}).get("protos") or []}
    without = sorted(used - set(protos))
    if len(without) > max(3, len(used) // 20):
        fail(f"{key}: {len(without)} of {len(used)} landmark prototypes have no sprite, e.g. {without[:5]}")
    print(f"ok   {key}: sprites for {len(protos)} prototypes, {len(data.get('rsi') or [])} RSI"
          + (f", none for {without}" if without else ""))


def check_planet(fork: dict, meta: dict) -> None:
    where = f"{fork['key']}/{meta['id']}"
    if meta.get("file") != f"{fork['key']}/{meta['id']}":
        fail(f"{where}: file {meta.get('file')!r} must point at its own fork")
        return
    levels = meta.get("levels") or [{"depth": 0, "h": meta.get("h")}]
    levels = [lv if isinstance(lv, dict) else {"depth": lv, "h": meta.get("h")} for lv in levels]
    if not any(lv.get("depth") == 0 for lv in levels):
        fail(f"{where}: no surface level (depth 0)")
        return
    multi = fork.get("family") == "cmu"
    for lv in levels:
        depth = lv.get("depth")
        stem = meta["file"] if depth == 0 else f"{meta['file']}.{depth}"
        where_lv = f"{where}[{depth:+d}]" if depth else where
        jpath, ppath = DATA / f"{stem}.json", DATA / f"{stem}.png"
        if not jpath.is_file() or not ppath.is_file():
            fail(f"{where_lv}: missing {jpath.name if not jpath.is_file() else ppath.name}")
            continue
        raw_png = ppath.read_bytes()
        planet = json.loads(jpath.read_text(encoding="utf-8"))
        for key, want in (("schemaVersion", 1), ("fork", fork["key"]), ("planet", meta["id"]), ("level", depth)):
            if planet.get(key) != want:
                fail(f"{where_lv}: {key} = {planet.get(key)!r}, expected {want!r}")
        b = planet["bounds"]
        width, height = b["maxX"] - b["minX"] + 1, b["maxY"] - b["minY"] + 1
        try:
            if png_size(raw_png) != (width, height):
                fail(f"{where_lv}: PNG {png_size(raw_png)} does not match bounds {width}x{height}")
        except ValueError as e:
            fail(f"{where_lv}: {e}")
        areas = planet["areas"]
        for a in areas:
            if not (isinstance(a, list) and len(a) == 4 and isinstance(a[0], str) and isinstance(a[1], str)
                    and (a[2] is None or re.fullmatch(r"#[0-9a-f]{8}", a[2])) and isinstance(a[3], int)):
                fail(f"{where_lv}: malformed area {a!r}")
                break
        check_rows(f"{where_lv} grid", planet["grid"], width, height, len(areas))
        masks = planet["masks"]
        required = ["blocked", "hardWall"] + (["columnMortar", "columnOb", "openSky"] if multi else [])
        for mask in required:
            if mask not in masks:
                fail(f"{where_lv}: mask {mask} missing")
        for mask in masks:
            check_rows(f"{where_lv} mask {mask}", masks[mask], width, height, 1)
        for label in planet["labels"]:
            if not (isinstance(label, list) and len(label) == 3 and isinstance(label[0], str)
                    and all(isinstance(v, (int, float)) for v in label[1:])):
                fail(f"{where_lv}: malformed label {label!r}")
                break
        for ins in planet.get("inserts") or []:
            ok = (isinstance(ins, dict) and isinstance(ins.get("name"), str)
                  and all(isinstance(ins.get(k), (int, float)) for k in ("x", "y", "p")) and 0 <= ins["p"] <= 1
                  and isinstance(ins.get("zones"), list) and ins["zones"])
            if ok:
                for z in ins["zones"]:
                    bnd = z.get("bounds") if isinstance(z, dict) else None
                    if not (isinstance(bnd, dict) and all(isinstance(bnd.get(k), int) for k in ("minX", "minY", "maxX", "maxY"))
                            and bnd["minX"] <= bnd["maxX"] and bnd["minY"] <= bnd["maxY"]
                            and isinstance(z.get("p"), (int, float)) and 0 <= z["p"] <= 1
                            and isinstance(z.get("tiles"), int) and z["tiles"] > 0):
                        ok = False
                        break
            if not ok:
                fail(f"{where_lv}: malformed insert {str(ins)[:80]!r}")
                break
        lm = planet.get("landmarks")
        extractor = sys.modules.get("ss14_tactical")
        cats = set(extractor.LANDMARK_CATEGORIES) if extractor is not None else None
        ok = isinstance(lm, dict) and isinstance(lm.get("protos"), list) and isinstance(lm.get("items"), list)
        if ok:
            for row in lm["protos"]:
                if not (isinstance(row, list) and len(row) == 4 and isinstance(row[0], str) and isinstance(row[1], str)
                        and isinstance(row[2], str) and (cats is None or row[2] in cats) and isinstance(row[3], bool)):
                    ok = False
                    break
            bnd = planet["bounds"]
            for it in lm["items"]:
                if not (isinstance(it, list) and len(it) == 4 and all(isinstance(v, int) for v in it)
                        and bnd["minX"] <= it[0] <= bnd["maxX"] and bnd["minY"] <= it[1] <= bnd["maxY"]
                        and 0 <= it[2] < len(lm["protos"]) and 0 <= it[3] <= 3):
                    ok = False
                    break
        if not ok:
            fail(f"{where_lv}: malformed landmarks")
        stored_h = planet.pop("h", None)
        body = json.dumps(planet, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        h = hashlib.sha1(body + raw_png).hexdigest()[:12]
        if stored_h != h or lv.get("h") != h or (depth == 0 and meta.get("h") != h):
            fail(f"{where_lv}: hash file={stored_h} index={lv.get('h')} recomputed={h}")
        golden = GOLDEN.get((fork["key"], fork["source"]["sha"][:9]))
        if golden and meta["id"] == "lv624" and depth == 0:
            planet["h"] = stored_h
            counts = flag_counts(planet)
            odds = {i["name"]: i["p"] for i in planet.get("inserts") or []}
            got = {"areas": len(areas), "labels": len(planet["labels"]),
                   "flags": {k: counts[k] for k in golden["flags"]},
                   "inserts": {k: odds.get(k) for k in golden["inserts"]}}
            if got != golden:
                fail(f"{where}: golden mismatch {got} vs {golden}")
            else:
                print(f"ok   {where} matches the research numbers")


def check_variation_odds(odds) -> None:
    """Synthetic replays of MapInsertSystem with mixed scenario tags (T10 DoD)."""
    v = lambda p, scenario=None: {"p": p, "scenario": scenario}  # noqa: E731
    cases = [
        # two survivor spawns without tags: each keeps its own probability
        ([v(0.45), v(0.45)], [], [0.45, 0.45]),
        # scenario-only variation: never without the scenario, its share with it
        ([v(1.0, "clf_ship")], [], [0.0]),
        ([v(1.0, "clf_ship")], [{"name": "clf_ship", "p": 0.25}], [0.25]),
        # tagged variation in the middle: skipped without the scenario, its mass
        # falls to the next eligible variation (cumulative still advances)
        ([v(0.3), v(0.3, "x"), v(0.4)], [{"name": "x", "p": 0.5}], [0.3, 0.15, 0.55]),
        # probabilities past 1.0 are clipped, the tail can never be reached
        ([v(0.7), v(0.5), v(0.2)], [], [0.7, 0.3, 0.0]),
        # scenario weights are clipped at 1.0 in registration order; with "b" active the
        # skipped "a" variation still moves the cumulative, so "b" collects its mass too
        ([v(0.5, "a"), v(0.5, "b")], [{"name": "a", "p": 0.8}, {"name": "b", "p": 0.8}], [0.4, 0.2]),
    ]
    for variations, scenarios, expected in cases:
        got = odds(variations, scenarios)
        if any(abs(g - e) > 1e-9 for g, e in zip(got, expected)) or len(got) != len(expected):
            fail(f"variation_odds({variations}, {scenarios}) = {got}, expected {expected}")
    print("ok   variation_odds: synthetic scenarios")


def main() -> int:
    index_path = DATA / "index.json"
    if not index_path.is_file():
        fail("tactical/index.json is missing")
        return 1
    index = json.loads(index_path.read_text(encoding="utf-8"))
    if index.get("schemaVersion") != 1:
        fail(f"index schemaVersion {index.get('schemaVersion')!r}")
    forks = index.get("forks") or []
    if not forks:
        fail("index has no forks")
    mirror = None
    try:
        sys.path.insert(0, str(ROOT))
        import ss14_tactical  # noqa: E402  (needs PyYAML and Pillow)
        mirror = ss14_tactical.MIRROR
    except Exception as e:  # pragma: no cover - CI without the extractor's packages
        print(f"note mirror comparison skipped ({type(e).__name__}: {e})")
    if mirror is not None:
        check_variation_odds(ss14_tactical.variation_odds)
    for fork in forks:
        key = fork.get("key")
        if not re.fullmatch(r"[0-9a-f]{40}", (fork.get("source") or {}).get("sha", "")):
            fail(f"{key}: source.sha must be a full commit SHA")
        constants = fork.get("constants") or {}
        if not MORTAR_KEYS <= set(constants.get("mortar") or {}):
            fail(f"{key}: mortar constants missing {sorted(MORTAR_KEYS - set(constants.get('mortar') or {}))}")
        if not OB_KEYS <= set(constants.get("ob") or {}):
            fail(f"{key}: OB constants missing {sorted(OB_KEYS - set(constants.get('ob') or {}))}")
        shells = constants.get("shells") or []
        if not any(s.get("kind") == "he" and (s.get("radius") or 0) > 0 for s in shells):
            fail(f"{key}: constants.shells has no high-explosive shell with a blast radius")
        for s in shells:
            if s.get("kind") not in ("he", "incendiary", "flare", "other") or not s.get("id"):
                fail(f"{key}: malformed shell entry {s!r}")
        warheads = constants.get("obWarheads") or []
        if not any((w.get("radius") or 0) > 0 for w in warheads):
            fail(f"{key}: constants.obWarheads has no warhead with a blast radius")
        if mirror is not None:
            family_mirror = mirror.get(fork.get("family"))
            for part in ("offsetVariance", "mortar", "ob"):
                if family_mirror is None or constants.get(part) != family_mirror.get(part):
                    fail(f"{key}: constants.{part} differs from ss14_tactical.MIRROR")
        if not isinstance(fork.get("terms"), dict) or not fork["terms"]:
            fail(f"{key}: terms missing")
        if not isinstance(fork.get("review"), list):
            fail(f"{key}: review must be a list")
        planets = fork.get("planets") or []
        if fork.get("family") in ("rmc", "cmu") and len(planets) < 10:
            fail(f"{key}: {len(planets)} planets, expected at least 10 rotation planets")
        ids = [p.get("id") for p in planets]
        if len(set(ids)) != len(ids):
            fail(f"{key}: duplicate planet ids")
        for meta in planets:
            check_planet(fork, meta)
        check_sprites(fork)
        print(f"ok   {key}: {len(planets)} planets checked")
    if failures:
        print(f"\n{len(failures)} problem(s)")
        return 1
    print("\ntactical data OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
