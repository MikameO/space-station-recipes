# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 MikameO
# This file is part of Space Station Recipes.
# See LICENSE for details.

"""
Source Attribution Catalog (Increment G)

Each curated claim in config.py (ANTAG_DATA[id].tips, ANTAG_STRATEGIES[i].desc)
should cite its origin so readers can judge the authority of the claim themselves.
Without attribution, any free-text assertion is "curator says so" — which is
exactly the gap that forum critics (gobbygobbler, Testicular_Man) exposed.

Usage
-----
Curated entries reference catalog IDs as plain strings:

    "sources": ["code-pyro-thermite", "forum-testicular-thermite-walls-2024"]

Or inline ad-hoc objects for one-off notes:

    "sources": [
        {"type": "maintainer-test", "note": "Playtested 2025-11-01, confirmed pry",
         "date": "2025-11-01"}
    ]

Both forms are validated by `validate_source_refs` during extractor build.

Authority ladder
----------------
The `AUTHORITY_WEIGHTS` table is centralized (not per-entry) to prevent gaming
— a contributor cannot inflate their own forum post's weight by editing the
entry; weight is derived from `type`.

Aggregation rule is MAX (not sum): a single code reference outweighs ten weak
forum posts. Otherwise lazy speculation could drown out authoritative evidence.

Separate file from config.py because config.py is already 1059 lines and
catalog entries will grow (one per forum thread, one per YAML line cited).
Separation of concerns: config.py = "what to render", sources.py = "what backs
it up". Drive-by contributors can PR sources.py in isolation.
"""

# ─────────────────────────────────────────────
# Authority ladder (type → weight, 0-10)
# ─────────────────────────────────────────────
# Rationale for gaps:
#   code(10) vs maintainer-test(9): maintainer-test is reproducible but subjective;
#     code wins in conflict ("yaml says X, maintainer says Y" → X).
#   forum-consensus(7) vs wiki(5): three aligned forum posts outrank a single wiki
#     page that may be outdated. Wiki still beats single forum-post(4).
#   forum-post(4) = video(4): both single-author, both informal.
#   maintainer-knowledge(2): honest placeholder for "I know it from playtime but
#     can't cite a specific source" — better than silence, worse than anything
#     verifiable. UI shows it in amber/claim tier.
#   speculation(1): explicit "needs verification" marker. Rendered red in UI
#     with a prompt for community PRs.

AUTHORITY_WEIGHTS = {
    "code":                 10,
    "maintainer-test":       9,
    "forum-consensus":       7,
    "wiki":                  5,
    "forum-post":            4,
    "video":                 4,
    "maintainer-knowledge":  2,
    "speculation":           1,
}


def authority_weight(entry: dict) -> int:
    """Map a source entry to its numeric weight. Unknown types → 0."""
    return AUTHORITY_WEIGHTS.get(entry.get("type", ""), 0)


# ─────────────────────────────────────────────
# Domain whitelist
# ─────────────────────────────────────────────
# Validators check URL host against this list. Unknown domains emit a WARNING
# (non-fatal) so a maintainer must consciously expand the list via PR rather
# than having malicious or ephemeral links slip through.

ALLOWED_DOMAINS = (
    "forum.spacestation14.com",
    "github.com",
    "raw.githubusercontent.com",
    "youtube.com",
    "youtu.be",
    "twitch.tv",
    "reddit.com",
    "wiki.spacestation14.com",
    "web.archive.org",
)

# GitHub owners allowed for deep-links. Derived from FORK_REGISTRY at runtime
# in the extractor (see ss14_chem_extractor.py). Kept here as a baseline for
# offline validation and tests.
_BASELINE_GH_OWNERS = frozenset({
    "space-wizards",        # vanilla
    "Goob-Station",
    "DeltaV-Station",
    "new-frontiers-14",
    "RMC-14",
    "Simple-Station",
    "CorvaxGoob",
    "Space-Wizards-Starlight",
    "dead-space-14",
})


# ─────────────────────────────────────────────
# The catalog
# ─────────────────────────────────────────────
# Naming convention: "<type-prefix>-<scope>-<topic>[-<year>]"
# Examples:
#   code-pyro-thermite           YAML line for Thermite reagent definition
#   code-pyro-clf3-prytile       YAML line showing CLF3's PryTileReaction
#   forum-gobby-lead-unobt-2025  Forum thread where gobbygobbler flagged Lead
#   wiki-antag-chem-primer       Wiki page
#   mk-general-antag-playtime    Honest placeholder for undocumented maintainer knowledge
#
# Every entry MUST have: type, title, note.
# URL required except for maintainer-knowledge (by definition undocumented).
# author required for forum-post / video.
# date required except for maintainer-knowledge (ISO-8601 YYYY-MM-DD).
# archive_url optional (link-rot fallback, must start with web.archive.org).
# quote optional (≤200 char fragment, anti-context-stripping for forum cites).

SOURCES = {
    # ── Code references ──────────────────────────────────
    "code-pyro-thermite": {
        "type": "code",
        "url": "https://github.com/space-wizards/space-station-14/blob/master/Resources/Prototypes/Reagents/pyrotechnic.yml#L16-L37",
        "title": "Thermite reagent (pyrotechnic.yml:17-37)",
        "date": "2026-04-19",
        "note": "Thermite's only tileReactions entry is FlammableTileReaction (x2 temperature multiplier). No wall-damage or pry effect exists — confirms Thermite does NOT breach walls in SS14.",
    },
    "code-pyro-clf3-prytile": {
        "type": "code",
        "url": "https://github.com/space-wizards/space-station-14/blob/master/Resources/Prototypes/Reagents/pyrotechnic.yml#L100-L138",
        "title": "ChlorineTrifluoride PryTileReaction (pyrotechnic.yml:109)",
        "date": "2026-04-19",
        "note": "ChlorineTrifluoride has PryTileReaction — the ONLY structural-damage tile reaction in vanilla SS14 chemistry. Backs the floor-pry strategy.",
    },
    "code-reagents-lead": {
        "type": "code",
        "url": "https://github.com/space-wizards/space-station-14/blob/master/Resources/Prototypes/Reagents/toxins.yml",
        "title": "Lead reagent in toxins.yml (no recipe, no plant, no dispenser)",
        "date": "2026-04-19",
        "note": "Searching the vanilla Reactions/ and Hydroponics/ folders for 'Lead' as a reaction product or seed chemical returns zero hits; Lead is defined as a reagent but not produced anywhere — confirming gobbygobbler's unobtainable claim for vanilla.",
    },
    "code-goob-licoxide-lead": {
        "type": "code",
        "url": "https://github.com/Goob-Station/Goob-Station/blob/master/Resources/Prototypes/_Goobstation/Recipes/Reactions/toxins.yml",
        "title": "Goob Station's Licoxide recipe (Lead added as reactant)",
        "date": "2026-04-19",
        "note": "Per config.py FORK_REGISTRY[goob].modified_reactions: 'Licoxide: Added Lead(1) as extra reactant'. Note: Lead is an *input* even in Goob, so it remains unobtainable as a product — the Goob modification makes Licoxide HARDER, not Lead EASIER.",
    },
    "code-chemicals-chloral": {
        "type": "code",
        "url": "https://github.com/space-wizards/space-station-14/blob/master/Resources/Prototypes/Recipes/Reactions/chemicals.yml",
        "title": "Chloral Hydrate recipe (chemicals.yml)",
        "date": "2026-04-19",
        "note": "Chloral: Chlorine + Ethanol + Water (all three from Chemical Dispenser). Backs silent-kill and sedation-ambush strategies.",
    },
    "code-reagents-potassium-water": {
        "type": "code",
        "url": "https://github.com/space-wizards/space-station-14/blob/master/Resources/Prototypes/Recipes/Reactions/chemicals.yml",
        "title": "Potassium-Water exothermic explosion reaction",
        "date": "2026-04-19",
        "note": "K+H2O reaction in chemicals.yml produces an explosion via ChemExplosion with intensity 0.25 per unit, capped at 100. Backs mass-explosion strategy.",
    },

    # ── Forum posts (the three critics who started this pack) ─────
    "forum-gobby-killmix-2026": {
        "type": "forum-post",
        "url": "https://forum.spacestation14.com/",
        "title": "gobbygobbler: kill-mix feedback calling out Lead unobtainable in antag strategies",
        "author": "gobbygobbler",
        "date": "2026-04-18",
        "note": "Forum thread where gobbygobbler reports that 'easy' difficulty strategies use reagents that are 50% unobtainium or botany-coop. Confirmed true for slow-poison (Lead) in vanilla.",
        "quote": "This 'easy' mix is 50% literal unobtainium and 50% chemical that is only accessible (in pure form) through cargo-botany cooperation.",
    },
    "forum-testicular-thermite-walls-2026": {
        "type": "forum-post",
        "url": "https://forum.spacestation14.com/",
        "title": "Testicular_Man: thermite breaching is SS13-only, not present on any SS14 fork",
        "author": "Testicular_Man",
        "date": "2026-04-18",
        "note": "Forum post stating that thermite wall-breach mechanic does not exist in SS14 and never has. Corroborated by direct YAML inspection (see code-pyro-thermite).",
        "quote": "Pretty sure that thermite breaching is a 13 only thing, i've not seen it on any fork and god knows it would be the breaching meta for antags and crew alike if it did.",
    },
    "forum-steelclaw-thermite-forks-2026": {
        "type": "forum-post",
        "url": "https://forum.spacestation14.com/",
        "title": "Steelclaw: asks which fork actually supports thermite wall-breach (expected: none)",
        "author": "Steelclaw",
        "date": "2026-04-18",
        "note": "Forum post requesting per-fork clarification on thermite wall-breach — answer (confirmed by cross-fork YAML grep): no fork supports it. Motivated the per-fork filter UI in Increment D and the domain-whitelist design in Increment G.",
        "quote": "I would request clarification on which forks that works on — it's not something I've ever heard of being a thing on Wizden.",
    },

    # ── Maintainer knowledge (honest placeholders) ─────────────
    "mk-general-antag-playtime": {
        "type": "maintainer-knowledge",
        "title": "Documented from maintainer's SS14 playtime",
        "date": "2026-04-19",
        "note": "Original curator compiled these notes from personal playtime across multiple SS14 forks. Source is undocumented — community verification via PR is encouraged.",
    },
}


# ─────────────────────────────────────────────
# Validation
# ─────────────────────────────────────────────

import re
from urllib.parse import urlparse

_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_REDDIT_SS14_RE = re.compile(r"^/r/SpaceStation14(/|$)", re.IGNORECASE)


def _validate_url(url: str, allowed_gh_owners: set[str]) -> list[str]:
    """Return list of warning strings for a URL. Empty list = clean."""
    warnings = []
    if not url:
        return ["url is empty"]
    try:
        parsed = urlparse(url)
    except Exception as exc:
        return [f"unparseable URL: {exc}"]
    host = (parsed.hostname or "").lower()

    domain_ok = any(host == d or host.endswith("." + d) for d in ALLOWED_DOMAINS)
    if not domain_ok:
        warnings.append(f"host '{host}' not in ALLOWED_DOMAINS — add to whitelist via PR if intentional")

    # github.com owner check
    if host in ("github.com", "raw.githubusercontent.com"):
        parts = [p for p in parsed.path.split("/") if p]
        owner = parts[0] if parts else ""
        if owner and owner not in allowed_gh_owners:
            warnings.append(f"github owner '{owner}' not in allowed set")
        # Branch-pinning hint
        if "/blob/master/" in parsed.path or "/blob/main/" in parsed.path:
            warnings.append("URL references a mutable branch (master/main); consider pinning to a commit SHA for link-rot resistance")

    # reddit /r/SpaceStation14 scope
    if host == "reddit.com" or host.endswith(".reddit.com"):
        if not _REDDIT_SS14_RE.match(parsed.path):
            warnings.append("reddit URL outside /r/SpaceStation14 scope")

    # youtube embed rejection (use watch?v= form)
    if host in ("youtube.com", "www.youtube.com") and "/embed/" in parsed.path:
        warnings.append("youtube.com/embed/ URLs not accepted; use the standard /watch?v= form")

    return warnings


def _validate_entry(entry: dict, allowed_gh_owners: set[str]) -> list[str]:
    """Validate a single source-entry dict. Returns warning strings."""
    warnings = []
    etype = entry.get("type", "")
    if etype not in AUTHORITY_WEIGHTS:
        warnings.append(f"type '{etype}' not in AUTHORITY_WEIGHTS")
    if not entry.get("note"):
        warnings.append("missing required field 'note'")
    if not entry.get("title") and etype != "maintainer-knowledge":
        warnings.append("missing required field 'title'")

    url_required = etype not in ("maintainer-knowledge",)
    if url_required and not entry.get("url"):
        warnings.append(f"type '{etype}' requires field 'url'")
    elif entry.get("url"):
        warnings.extend(_validate_url(entry["url"], allowed_gh_owners))

    if etype in ("forum-post", "video") and not entry.get("author"):
        warnings.append(f"type '{etype}' requires field 'author'")

    date = entry.get("date")
    if date and not _ISO_DATE_RE.match(date):
        warnings.append(f"date '{date}' not ISO-8601 YYYY-MM-DD")
    if not date and etype != "maintainer-knowledge":
        warnings.append(f"type '{etype}' requires field 'date' (ISO-8601)")

    archive = entry.get("archive_url")
    if archive and not archive.startswith("https://web.archive.org/web/"):
        warnings.append(f"archive_url must start with https://web.archive.org/web/")

    quote = entry.get("quote")
    if quote and len(quote) > 200:
        warnings.append(f"quote too long ({len(quote)} chars); fair-use limit is 200")

    return warnings


def resolve_source(ref, catalog: dict | None = None) -> dict | None:
    """Resolve a source reference (catalog ID string or inline dict) to an entry."""
    cat = catalog or SOURCES
    if isinstance(ref, str):
        return cat.get(ref)
    if isinstance(ref, dict):
        return ref
    return None


def validate_source_refs(
    refs_owners: list[tuple[str, list]],
    allowed_gh_owners: set[str] | None = None,
    catalog: dict | None = None,
) -> tuple[dict, list[str], list[str]]:
    """Validate a list of (owner_label, source_refs_list) tuples.

    Returns (coverage_summary, fatal_errors, warnings).
    - owner_label: e.g. "ANTAG_DATA:Thermite" or "ANTAG_STRATEGIES:slow-poison"
    - fatal_errors: unresolved string IDs (refer to missing catalog entries)
    - warnings: domain mismatches, missing fields, date format, etc.
    """
    cat = catalog or SOURCES
    owners_gh = allowed_gh_owners or set(_BASELINE_GH_OWNERS)

    fatal = []
    warn = []
    attributed = 0
    mk_only = 0
    speculation_only = 0
    needs_attribution = []
    authority_sum = 0
    authority_count = 0

    for owner_label, refs in refs_owners:
        if not refs:
            needs_attribution.append(owner_label)
            continue

        resolved_entries = []
        for ref in refs:
            if isinstance(ref, str):
                entry = cat.get(ref)
                if entry is None:
                    fatal.append(f"{owner_label}: unresolved source ID '{ref}'")
                    continue
                resolved_entries.append(entry)
            elif isinstance(ref, dict):
                resolved_entries.append(ref)
            else:
                warn.append(f"{owner_label}: unsupported ref type {type(ref).__name__}")

        # Validate each resolved entry
        for entry in resolved_entries:
            for w in _validate_entry(entry, owners_gh):
                warn.append(f"{owner_label}: {w}")

        # Coverage classification
        types = [e.get("type") for e in resolved_entries]
        weights = [AUTHORITY_WEIGHTS.get(t, 0) for t in types]
        if resolved_entries:
            max_w = max(weights) if weights else 0
            authority_sum += max_w
            authority_count += 1
            if all(t == "maintainer-knowledge" for t in types):
                mk_only += 1
            elif all(t == "speculation" for t in types):
                speculation_only += 1
            else:
                attributed += 1

    total = len(refs_owners)
    coverage_pct = (100 * attributed // total) if total else 0
    avg_authority = (authority_sum / authority_count) if authority_count else 0.0

    summary = {
        "total": total,
        "attributed": attributed,
        "maintainerKnowledgeOnly": mk_only,
        "speculationOnly": speculation_only,
        "needsAttribution": needs_attribution,
        "coveragePercent": coverage_pct,
        "avgAuthority": round(avg_authority, 2),
    }
    return summary, fatal, warn
