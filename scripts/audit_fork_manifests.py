# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 MikameO
# This file is part of Space Station Recipes.

"""
Manifest-drift audit: compare config.py file manifests against the live
GitHub trees of every fork in FORK_REGISTRY.

The extractor's file lists are static and its cache is immortal, so two
kinds of drift accumulate silently:

  1. NEW files — a fork adds a reagent/reaction YAML the manifest never
     heard of. It will never be fetched, its recipes never appear.
  2. MISSING files — a fork renames/deletes a manifested path. fetch_file()
     returns "" on 404 (non-fatal), and the local cache keeps serving the
     stale copy, so the loss only manifests on a fresh machine.
  3. CHANGED files — tracked files whose blob SHA differs from the local
     cache copy (upstream moved since the last snapshot).

Uses the GitHub trees API (2 requests per fork: Prototypes + Locale
subtrees) with the `gh` CLI token. Blob SHAs are compared against the
cache without re-downloading; only untracked candidate files are fetched
(via raw.githubusercontent.com, not counted against the API limit) to
count how many reagent/reaction prototypes they contain.

Writes cache/fork_manifest_audit.json plus a human summary to stdout.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import yaml

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from config import FORK_REGISTRY  # noqa: E402

CACHE = _ROOT / "cache"
OUT_JSON = CACHE / "fork_manifest_audit.json"

API = "https://api.github.com"
FETCH_CAP_PER_FORK = 80          # max untracked files to content-probe per fork
RAW_PAUSE = 0.15                 # politeness delay between raw fetches

# Directories (lowercased substring match) that can plausibly hold chemistry
# content. Recipes/Reagents (RuCM economy), Medical/reagents (lowercase!) and
# Hydroponics seeds all appear across forks.
RELEVANT_PARTS = ("/reagents/", "/reactions/", "/hydroponics/")

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


# YAML loader tolerant of !type: engine tags — shared with audit_dead_reactions
from _ss14_yaml import IgnoreTagLoader as _IgnoreTag  # noqa: E402


def _count_prototypes(text: str) -> dict[str, int]:
    """Count prototype entries by type in a YAML document string."""
    counts: dict[str, int] = {}
    try:
        docs = list(yaml.load_all(text, Loader=_IgnoreTag))
    except Exception:
        return {"parse_error": 1}
    for doc in docs:
        if not isinstance(doc, list):
            continue
        for item in doc:
            if isinstance(item, dict) and "type" in item:
                t = str(item["type"])
                counts[t] = counts.get(t, 0) + 1
    return counts


# ─────────────────────────────────────────────
# GitHub API helpers
# ─────────────────────────────────────────────

def _gh_token() -> str:
    try:
        return subprocess.run(
            ["gh", "auth", "token"], capture_output=True, text=True, check=True
        ).stdout.strip()
    except Exception:
        return ""


_TOKEN = _gh_token()


def _api_get(path: str) -> dict | None:
    url = f"{API}{path}"
    headers = {
        "User-Agent": "SS14-Chem-Extractor-Audit/1.0",
        "Accept": "application/vnd.github+json",
    }
    if _TOKEN:
        headers["Authorization"] = f"Bearer {_TOKEN}"
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code in (404, 409, 422):
                return None
            if attempt < 2:
                time.sleep(2 * (attempt + 1))
                continue
            print(f"  ! API {e.code} for {path}", file=sys.stderr)
            return None
        except Exception as e:
            if attempt < 2:
                time.sleep(2 * (attempt + 1))
            else:
                print(f"  ! API failed: {e} for {path}", file=sys.stderr)
                return None
    return None


def _fetch_raw(raw_url_template: str, path: str) -> str:
    url = raw_url_template.format(path=path)
    headers = {"User-Agent": "SS14-Chem-Extractor-Audit/1.0"}
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except Exception:
        return ""


def _get_subtree(repo: str, branch: str, subpath: str) -> tuple[dict[str, str], bool]:
    """Return ({full_path: blob_sha}, truncated) for all blobs under
    Resources/<subpath> on the given branch. Empty dict if absent."""
    ref = f"{branch}:{subpath}".replace(" ", "%20")
    data = _api_get(f"/repos/{repo}/git/trees/{ref}?recursive=1")
    if data is None:
        return {}, False
    blobs = {
        f"{subpath}/{item['path']}": item["sha"]
        for item in data.get("tree", [])
        if item.get("type") == "blob"
    }
    return blobs, bool(data.get("truncated"))


def _head_commit(repo: str, branch: str) -> dict:
    data = _api_get(f"/repos/{repo}/commits/{branch}")
    if not data:
        return {}
    commit = data.get("commit", {})
    return {
        "sha": (data.get("sha") or "")[:9],
        "date": commit.get("committer", {}).get("date", ""),
        "message": (commit.get("message") or "").split("\n")[0][:90],
    }


# ─────────────────────────────────────────────
# Cache blob-SHA comparison
# ─────────────────────────────────────────────

def _git_blob_sha(data: bytes) -> str:
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


def _cache_shas(fork_key: str, path: str) -> set[str]:
    """Possible blob SHAs for the cached copy of `path` under any of the
    fork's cache subdirs. write_text() may have translated LF->CRLF on
    Windows, so hash both the raw bytes and the CRLF->LF normalization."""
    shas: set[str] = set()
    subdirs = [fork_key, f"{fork_key}_vanilla_overrides", f"{fork_key}_parent_overrides"]
    rel = path.replace("/", "\\") if "\\" in str(CACHE) else path
    for sub in subdirs:
        p = CACHE / sub / rel
        if not p.exists():
            p = CACHE / sub / path
            if not p.exists():
                continue
        raw = p.read_bytes()
        shas.add(_git_blob_sha(raw))
        shas.add(_git_blob_sha(raw.replace(b"\r\n", b"\n")))
    return shas


# ─────────────────────────────────────────────
# Main audit
# ─────────────────────────────────────────────

MANIFEST_KEYS = (
    ("reagent_files", "reagent"),
    ("reaction_files", "reaction"),
    ("seed_files", "seed"),
    ("locale_files", "locale"),
    ("botany_locale_files", "botany-locale"),
    ("vanilla_override_reaction_files", "vanilla-override-rxn"),
    ("vanilla_override_reagent_files", "vanilla-override-reagent"),
    ("parent_override_reaction_files", "parent-override-rxn"),
    ("parent_override_reagent_files", "parent-override-reagent"),
)


def audit_fork(key: str, cfg: dict) -> dict:
    repo, branch = cfg["repo"], cfg["branch"]
    print(f"\n== {key} ({cfg['name']}) — {repo}@{branch} ==")

    head = _head_commit(repo, branch)
    if head:
        print(f"  head {head['sha']} {head['date']}  {head['message']}")

    proto_tree, proto_trunc = _get_subtree(repo, branch, "Resources/Prototypes")
    locale_tree, locale_trunc = _get_subtree(repo, branch, "Resources/Locale")
    if proto_trunc or locale_trunc:
        print("  ! WARNING: tree listing truncated — results incomplete")
    if not proto_tree:
        print("  ! Could not list Resources/Prototypes — skipping fork")
        return {"error": "no-prototypes-tree", "head": head}

    repo_files = {**proto_tree, **locale_tree}

    # Manifest inventory: path -> category
    manifest: dict[str, str] = {}
    for cfg_key, label in MANIFEST_KEYS:
        for path in cfg.get(cfg_key) or []:
            manifest.setdefault(path, label)

    missing = sorted(
        (path, label) for path, label in manifest.items() if path not in repo_files
    )

    changed = []
    for path, label in sorted(manifest.items()):
        sha = repo_files.get(path)
        if not sha:
            continue
        local = _cache_shas(key, path)
        if local and sha not in local:
            changed.append((path, label))

    # Untracked candidates: relevant YAMLs in the repo not in ANY manifest.
    # Baseline is the union of every fork's manifest: derivative forks carry
    # unmanifested copies of parent layers (Monolith ships _NF, Trauma ships
    # _Goobstation) whose files are tracked under the parent fork — only
    # genuinely unknown paths should surface here.
    baseline = set(manifest)
    for other_cfg in FORK_REGISTRY.values():
        for cfg_key, _ in MANIFEST_KEYS:
            baseline.update(other_cfg.get(cfg_key) or [])

    untracked = []
    for path in sorted(proto_tree):
        if not path.endswith(".yml") or path in baseline:
            continue
        low = "/" + path.lower() + "/"
        if any(part in low for part in RELEVANT_PARTS):
            untracked.append(path)

    print(
        f"  tracked {len(manifest)} | missing {len(missing)} | "
        f"changed-since-cache {len(changed)} | untracked-relevant {len(untracked)}"
    )

    for path, label in missing:
        print(f"  MISSING  [{label}] {path}")
    for path, label in changed:
        print(f"  CHANGED  [{label}] {path}")

    # Content-probe untracked files: how many reagents/reactions inside?
    probed = []
    for i, path in enumerate(untracked):
        if i >= FETCH_CAP_PER_FORK:
            print(f"  ... {len(untracked) - i} more untracked files not probed (cap)")
            break
        text = _fetch_raw(cfg["raw_url"], path)
        time.sleep(RAW_PAUSE)
        counts = _count_prototypes(text)
        interesting = {
            t: n for t, n in counts.items()
            if t in ("reagent", "reaction", "seed") or t == "parse_error"
        }
        probed.append({"path": path, "counts": counts})
        if interesting:
            pretty = ", ".join(f"{n} {t}" for t, n in sorted(interesting.items()))
            print(f"  NEW      {path}  ({pretty})")
        else:
            other = sum(counts.values())
            print(f"  new?     {path}  (no chem prototypes; {other} other entries)")

    return {
        "head": head,
        "trackedCount": len(manifest),
        "missing": [{"path": p, "category": c} for p, c in missing],
        "changedSinceCache": [{"path": p, "category": c} for p, c in changed],
        "untracked": probed,
        "untrackedTotal": len(untracked),
    }


def main() -> None:
    if not _TOKEN:
        print("NOTE: no gh token — anonymous API limit is 60 req/h", file=sys.stderr)

    report: dict[str, dict] = {}
    for key, cfg in FORK_REGISTRY.items():
        report[key] = audit_fork(key, cfg)

    OUT_JSON.write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    total_missing = total_changed = total_new_chem = 0
    for key, r in report.items():
        if "error" in r:
            print(f"  {key:12s} ERROR: {r['error']}")
            continue
        new_chem = sum(
            1 for u in r["untracked"]
            if any(t in ("reagent", "reaction", "seed") for t in u["counts"])
        )
        total_missing += len(r["missing"])
        total_changed += len(r["changedSinceCache"])
        total_new_chem += new_chem
        flag = " <--" if (r["missing"] or new_chem or r["changedSinceCache"]) else ""
        print(
            f"  {key:12s} missing={len(r['missing'])} "
            f"changed={len(r['changedSinceCache'])} "
            f"new-chem-files={new_chem}/{r['untrackedTotal']}{flag}"
        )
    print(
        f"\n  TOTAL: {total_missing} missing, {total_changed} changed, "
        f"{total_new_chem} untracked files with chem prototypes"
    )
    print(f"  Full report: {OUT_JSON}")


if __name__ == "__main__":
    main()
