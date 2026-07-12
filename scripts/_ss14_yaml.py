# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 MikameO
# This file is part of Space Station Recipes.

"""Shared YAML loader for the audit scripts.

Tolerant of SS14's `!type:` and `!` engine tags — returns the underlying
scalar/mapping/sequence and drops the tag, instead of erroring. Factored
out of audit_dead_reactions.py / audit_fork_manifests.py (T2c), which each
carried a byte-identical copy.
"""

import yaml


class IgnoreTagLoader(yaml.SafeLoader):
    """SafeLoader that ignores `!type:` / `!` tags instead of raising."""


def _tag_ignore(loader, tag_suffix, node):
    if isinstance(node, yaml.ScalarNode):
        return loader.construct_scalar(node)
    if isinstance(node, yaml.MappingNode):
        return loader.construct_mapping(node, deep=True)
    if isinstance(node, yaml.SequenceNode):
        return loader.construct_sequence(node, deep=True)
    return None


IgnoreTagLoader.add_multi_constructor("!type:", _tag_ignore)
IgnoreTagLoader.add_multi_constructor("!", _tag_ignore)
