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
    ("rmc14", "57112b967"): {"areas": 75, "labels": 21,
                              "flags": {"OB": 38850, "CAS": 19392, "mortarFire": 19381,
                                        "mortarPlacement": 15982, "supplyDrop": 19381}},
    ("stories_cm", "024d853a1"): {"areas": 75, "labels": 21,
                                   "flags": {"OB": 38850, "CAS": 19392, "mortarFire": 19381,
                                             "mortarPlacement": 15982, "supplyDrop": 19381}},
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


def check_planet(fork: dict, meta: dict) -> None:
    where = f"{fork['key']}/{meta['id']}"
    if meta.get("file") != f"{fork['key']}/{meta['id']}":
        fail(f"{where}: file {meta.get('file')!r} must point at its own fork")
        return
    jpath, ppath = DATA / f"{meta['file']}.json", DATA / f"{meta['file']}.png"
    if not jpath.is_file() or not ppath.is_file():
        fail(f"{where}: missing {jpath.name if not jpath.is_file() else ppath.name}")
        return
    raw_png = ppath.read_bytes()
    planet = json.loads(jpath.read_text(encoding="utf-8"))
    for key, want in (("schemaVersion", 1), ("fork", fork["key"]), ("planet", meta["id"]), ("level", 0)):
        if planet.get(key) != want:
            fail(f"{where}: {key} = {planet.get(key)!r}, expected {want!r}")
    b = planet["bounds"]
    width, height = b["maxX"] - b["minX"] + 1, b["maxY"] - b["minY"] + 1
    try:
        if png_size(raw_png) != (width, height):
            fail(f"{where}: PNG {png_size(raw_png)} does not match bounds {width}x{height}")
    except ValueError as e:
        fail(f"{where}: {e}")
    areas = planet["areas"]
    for a in areas:
        if not (isinstance(a, list) and len(a) == 4 and isinstance(a[0], str) and isinstance(a[1], str)
                and (a[2] is None or re.fullmatch(r"#[0-9a-f]{8}", a[2])) and isinstance(a[3], int)):
            fail(f"{where}: malformed area {a!r}")
            break
    check_rows(f"{where} grid", planet["grid"], width, height, len(areas))
    for mask in ("blocked", "hardWall"):
        check_rows(f"{where} mask {mask}", planet["masks"][mask], width, height, 1)
    for label in planet["labels"]:
        if not (isinstance(label, list) and len(label) == 3 and isinstance(label[0], str)
                and all(isinstance(v, (int, float)) for v in label[1:])):
            fail(f"{where}: malformed label {label!r}")
            break
    stored_h = planet.pop("h", None)
    body = json.dumps(planet, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    h = hashlib.sha1(body + raw_png).hexdigest()[:12]
    if stored_h != h or meta.get("h") != h:
        fail(f"{where}: hash file={stored_h} index={meta.get('h')} recomputed={h}")
    golden = GOLDEN.get((fork["key"], fork["source"]["sha"][:9]))
    if golden and meta["id"] == "lv624":
        planet["h"] = stored_h
        counts = flag_counts(planet)
        got = {"areas": len(areas), "labels": len(planet["labels"]),
               "flags": {k: counts[k] for k in golden["flags"]}}
        if got != golden:
            fail(f"{where}: golden mismatch {got} vs {golden}")
        else:
            print(f"ok   {where} matches the research numbers")


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
    for fork in forks:
        key = fork.get("key")
        if not re.fullmatch(r"[0-9a-f]{40}", (fork.get("source") or {}).get("sha", "")):
            fail(f"{key}: source.sha must be a full commit SHA")
        constants = fork.get("constants") or {}
        if not MORTAR_KEYS <= set(constants.get("mortar") or {}):
            fail(f"{key}: mortar constants missing {sorted(MORTAR_KEYS - set(constants.get('mortar') or {}))}")
        if not OB_KEYS <= set(constants.get("ob") or {}):
            fail(f"{key}: OB constants missing {sorted(OB_KEYS - set(constants.get('ob') or {}))}")
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
        if fork.get("family") == "rmc" and len(planets) < 10:
            fail(f"{key}: {len(planets)} planets, expected 10 rotation planets")
        ids = [p.get("id") for p in planets]
        if len(set(ids)) != len(ids):
            fail(f"{key}: duplicate planet ids")
        for meta in planets:
            check_planet(fork, meta)
        print(f"ok   {key}: {len(planets)} planets checked")
    if failures:
        print(f"\n{len(failures)} problem(s)")
        return 1
    print("\ntactical data OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
