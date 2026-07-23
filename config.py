# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2025 MikameO
# This file is part of Space Station Recipes.
# See LICENSE for details.

"""Configuration for SS14 Chemistry Database Extractor."""

# ═══════════════════════════════════════════════════════════════════
# FORK REGISTRY — Central definition of all supported SS14 forks
# ═══════════════════════════════════════════════════════════════════
#
# Each fork entry defines: repo URL, branch, custom prototype directory,
# file manifests, known blocked/modified reactions, and UI color.
# The extractor iterates this registry to fetch & merge all forks.

# Vanilla reaction files — shared reference for auto-diff across forks
VANILLA_REACTION_PATHS = [
    "Resources/Prototypes/Recipes/Reactions/biological.yml",
    "Resources/Prototypes/Recipes/Reactions/botany.yml",
    "Resources/Prototypes/Recipes/Reactions/chemicals.yml",
    "Resources/Prototypes/Recipes/Reactions/cleaning.yml",
    "Resources/Prototypes/Recipes/Reactions/drinks.yml",
    "Resources/Prototypes/Recipes/Reactions/food.yml",
    "Resources/Prototypes/Recipes/Reactions/fun.yml",
    "Resources/Prototypes/Recipes/Reactions/gas.yml",
    "Resources/Prototypes/Recipes/Reactions/medicine.yml",
    "Resources/Prototypes/Recipes/Reactions/pyrotechnic.yml",
    "Resources/Prototypes/Recipes/Reactions/single_reagent.yml",
    "Resources/Prototypes/Recipes/Reactions/soap.yml",
]

# Vanilla reagent files — fetched from each fork's repo (vanilla-path copies)
# so the extractor can harvest reagents the fork ADDED inside those copies
# (Goob defines Warfarin/Necrosol/new cocktails in its patched vanilla files).
# Assigned to every non-vanilla fork after FORK_REGISTRY (see setdefault loop).
VANILLA_REAGENT_PATHS = [
    "Resources/Prototypes/Reagents/biological.yml",
    "Resources/Prototypes/Reagents/botany.yml",
    "Resources/Prototypes/Reagents/chemicals.yml",
    "Resources/Prototypes/Reagents/cleaning.yml",
    "Resources/Prototypes/Reagents/elements.yml",
    "Resources/Prototypes/Reagents/fun.yml",
    "Resources/Prototypes/Reagents/gases.yml",
    "Resources/Prototypes/Reagents/medicine.yml",
    "Resources/Prototypes/Reagents/narcotics.yml",
    "Resources/Prototypes/Reagents/pyrotechnic.yml",
    "Resources/Prototypes/Reagents/toxins.yml",
    "Resources/Prototypes/Reagents/Consumable/Drink/alcohol.yml",
    "Resources/Prototypes/Reagents/Consumable/Drink/base_drink.yml",
    "Resources/Prototypes/Reagents/Consumable/Drink/drinks.yml",
    "Resources/Prototypes/Reagents/Consumable/Drink/juice.yml",
    "Resources/Prototypes/Reagents/Consumable/Drink/soda.yml",
    "Resources/Prototypes/Reagents/Consumable/Food/condiments.yml",
    "Resources/Prototypes/Reagents/Consumable/Food/food.yml",
    "Resources/Prototypes/Reagents/Consumable/Food/ingredients.yml",
    "Resources/Prototypes/Reagents/Materials/glass.yml",
    "Resources/Prototypes/Reagents/Materials/materials.yml",
    "Resources/Prototypes/Reagents/Materials/metals.yml",
    "Resources/Prototypes/Reagents/Materials/ores.yml",
]

FORK_REGISTRY = {
    # ── Vanilla SS14 (upstream) ──
    "vanilla": {
        "name": "Vanilla SS14",
        "repo": "space-wizards/space-station-14",
        "branch": "master",
        "custom_dir": None,
        "color": "#22c55e",
        # T2c: these are the canonical lists (see constants above)
        "reagent_files": VANILLA_REAGENT_PATHS,
        "reaction_files": VANILLA_REACTION_PATHS,
        "locale_files": [
            "Resources/Locale/en-US/reagents/meta/biological.ftl",
            "Resources/Locale/en-US/reagents/meta/botany.ftl",
            "Resources/Locale/en-US/reagents/meta/chemicals.ftl",
            "Resources/Locale/en-US/reagents/meta/cleaning.ftl",
            "Resources/Locale/en-US/reagents/meta/elements.ftl",
            "Resources/Locale/en-US/reagents/meta/fun.ftl",
            "Resources/Locale/en-US/reagents/meta/gases.ftl",
            "Resources/Locale/en-US/reagents/meta/medicine.ftl",
            "Resources/Locale/en-US/reagents/meta/narcotics.ftl",
            "Resources/Locale/en-US/reagents/meta/physical-desc.ftl",
            "Resources/Locale/en-US/reagents/meta/pyrotechnic.ftl",
            "Resources/Locale/en-US/reagents/meta/toxins.ftl",
            "Resources/Locale/en-US/reagents/meta/consumable/drink/alcohol.ftl",
            "Resources/Locale/en-US/reagents/meta/consumable/drink/drinks.ftl",
            "Resources/Locale/en-US/reagents/meta/consumable/drink/juice.ftl",
            "Resources/Locale/en-US/reagents/meta/consumable/drink/soda.ftl",
            "Resources/Locale/en-US/reagents/meta/consumable/food/condiments.ftl",
            "Resources/Locale/en-US/reagents/meta/consumable/food/food.ftl",
            "Resources/Locale/en-US/reagents/meta/consumable/food/ingredients.ftl",
            "Resources/Locale/en-US/reagents/Capsaicin.ftl",
            "Resources/Locale/en-US/reagents/absinthe.ftl",
            "Resources/Locale/en-US/reagents/barozine.ftl",
            "Resources/Locale/en-US/reagents/buzzochloricbees.ftl",
            "Resources/Locale/en-US/reagents/carpetium.ftl",
            "Resources/Locale/en-US/reagents/clf3.ftl",
            "Resources/Locale/en-US/reagents/ephedrine.ftl",
            "Resources/Locale/en-US/reagents/ethyloxyephedrine.ftl",
            "Resources/Locale/en-US/reagents/fresium.ftl",
            "Resources/Locale/en-US/reagents/frezon.ftl",
            "Resources/Locale/en-US/reagents/frostoil.ftl",
            "Resources/Locale/en-US/reagents/generic.ftl",
            "Resources/Locale/en-US/reagents/histamine.ftl",
            "Resources/Locale/en-US/reagents/laughter.ftl",
            "Resources/Locale/en-US/reagents/leporazine.ftl",
            "Resources/Locale/en-US/reagents/mannitol.ftl",
            "Resources/Locale/en-US/reagents/norepinephricacid.ftl",
            "Resources/Locale/en-US/reagents/phlogiston.ftl",
            "Resources/Locale/en-US/reagents/psicodine.ftl",
        ],
        "seed_files": ["Resources/Prototypes/Hydroponics/seeds.yml"],
        "botany_locale_files": [
            # Upstream split the old ss14-entities/.../hydroponics/seeds.ftl
            # into two files (2026-07 reorganization)
            "Resources/Locale/en-US/botany/seeds.ftl",
            "Resources/Locale/en-US/seeds/seeds.ftl",
        ],
        "dispenser_chemicals": {
            "Aluminium", "Carbon", "Chlorine", "Copper", "Ethanol", "Fluorine",
            "Hydrogen", "Iodine", "Iron", "Lithium", "Mercury", "Nitrogen",
            "Oxygen", "Phosphorus", "Plasma", "Potassium", "Radium", "Silicon",
            "Silver", "Sodium", "Sulfur", "Sugar", "Water", "WeldingFuel", "Oil",
        },
        # ── D3: item-fill source channels ──
        # Entities that ship pre-filled with reagents (bottles/cans/pills) plus
        # the acquisition channels that hand them out (vending inventories,
        # bar/soda dispenser packs). Design: docs/design/2026-07-12-item-fill-sources.md
        # Other forks default to [] (extractor uses .get); populated per fork in D3c.
        "item_fill_files": [
            "Resources/Prototypes/Entities/Objects/Consumable/Drinks/drinks_base.yml",
            "Resources/Prototypes/Entities/Objects/Consumable/Drinks/drinks_base_materials.yml",
            "Resources/Prototypes/Entities/Objects/Consumable/Drinks/drinks_bottles_glass.yml",
            "Resources/Prototypes/Entities/Objects/Consumable/Drinks/drinks_bottles_plastic.yml",
            "Resources/Prototypes/Entities/Objects/Consumable/Drinks/drinks_cans.yml",
            "Resources/Prototypes/Entities/Objects/Consumable/Drinks/drinks-cartons.yml",
            "Resources/Prototypes/Entities/Objects/Consumable/Drinks/drinks_fun.yml",
            "Resources/Prototypes/Entities/Objects/Consumable/Drinks/drinks_special.yml",
            "Resources/Prototypes/Entities/Objects/Consumable/Food/Containers/condiments.yml",
            "Resources/Prototypes/Entities/Objects/Consumable/Food/ingredients.yml",
            "Resources/Prototypes/Entities/Objects/Specific/Hydroponics/sprays.yml",
            "Resources/Prototypes/Entities/Objects/Specific/Medical/healing.yml",
            "Resources/Prototypes/Entities/Objects/Specific/Chemistry/chemistry-bottles.yml",
        ],
        "vending_inventory_files": [
            "Resources/Prototypes/Catalog/VendingMachines/Inventories/boozeomat.yml",
            "Resources/Prototypes/Catalog/VendingMachines/Inventories/chang.yml",
            "Resources/Prototypes/Catalog/VendingMachines/Inventories/chapel.yml",
            "Resources/Prototypes/Catalog/VendingMachines/Inventories/chefvend.yml",
            "Resources/Prototypes/Catalog/VendingMachines/Inventories/chemvend.yml",
            "Resources/Prototypes/Catalog/VendingMachines/Inventories/coffee.yml",
            "Resources/Prototypes/Catalog/VendingMachines/Inventories/cola.yml",
            "Resources/Prototypes/Catalog/VendingMachines/Inventories/condiments.yml",
            "Resources/Prototypes/Catalog/VendingMachines/Inventories/discount.yml",
            "Resources/Prototypes/Catalog/VendingMachines/Inventories/donut.yml",
            "Resources/Prototypes/Catalog/VendingMachines/Inventories/medical.yml",
            "Resources/Prototypes/Catalog/VendingMachines/Inventories/nutri.yml",
            "Resources/Prototypes/Catalog/VendingMachines/Inventories/pwrgame.yml",
            "Resources/Prototypes/Catalog/VendingMachines/Inventories/shamblersjuice.yml",
            "Resources/Prototypes/Catalog/VendingMachines/Inventories/snack.yml",
            "Resources/Prototypes/Catalog/VendingMachines/Inventories/soda.yml",
            "Resources/Prototypes/Catalog/VendingMachines/Inventories/sovietsoda.yml",
            "Resources/Prototypes/Catalog/VendingMachines/Inventories/spaceup.yml",
            "Resources/Prototypes/Catalog/VendingMachines/Inventories/starkist.yml",
            "Resources/Prototypes/Catalog/VendingMachines/Inventories/sustenance.yml",
        ],
        "vending_machine_files": [
            "Resources/Prototypes/Entities/Structures/Machines/vending_machines.yml",
        ],
        "dispenser_files": [
            "Resources/Prototypes/Entities/Structures/Dispensers/booze.yml",
            "Resources/Prototypes/Entities/Structures/Dispensers/soda.yml",
        ],
        # D3b: produce entities with Extractable.juiceSolution (juicing channel)
        "produce_files": [
            "Resources/Prototypes/Entities/Objects/Consumable/Food/produce.yml",
        ],
    },

    # ── RMC14 ──
    "rmc14": {
        "name": "RMC14",
        "repo": "RMC-14/RMC-14",
        "branch": "master",
        "custom_dir": "_RMC14",
        "color": "#06b6d4",
        # RMC14 completely replaces these vanilla categories with its own CM system
        # Vanilla reactions producing reagents in these categories are blocked
        "blocked_categories": {"Medicine", "Narcotics", "Cleaning", "Fun", "Chemicals", "Botany"},
        "reagent_files": [
            "Resources/Prototypes/_RMC14/Reagents/base_reagent.yml",
            "Resources/Prototypes/_RMC14/Reagents/elements.yml",
            "Resources/Prototypes/_RMC14/Reagents/medicine.yml",
            "Resources/Prototypes/_RMC14/Reagents/narcotics.yml",
            "Resources/Prototypes/_RMC14/Reagents/other.yml",
            "Resources/Prototypes/_RMC14/Reagents/pyrotechnic.yml",
            "Resources/Prototypes/_RMC14/Reagents/synth_blood.yml",
            "Resources/Prototypes/_RMC14/Reagents/toxins.yml",
            "Resources/Prototypes/_RMC14/Reagents/Consumable/ingredients.yml",
            "Resources/Prototypes/_RMC14/Reagents/Consumable/Drink/alcohol.yml",
            "Resources/Prototypes/_RMC14/Reagents/Consumable/Drink/juice.yml",
            "Resources/Prototypes/_RMC14/Reagents/Consumable/Drink/other_drinks.yml",
            "Resources/Prototypes/_RMC14/Reagents/Consumable/Drink/soda.yml",
            # Drink files added upstream after the fork was registered
            # (manifest audit 2026-07-11). powdered_mixes defines the
            # RMCInstantJuice* reagents whose reactions already shipped —
            # they rendered as ghost products before this.
            "Resources/Prototypes/_RMC14/Reagents/Consumable/Drink/base.yml",
            "Resources/Prototypes/_RMC14/Reagents/Consumable/Drink/packaged_drinks.yml",
            "Resources/Prototypes/_RMC14/Reagents/Consumable/Drink/powdered_mixes.yml",
        ],
        "reaction_files": [
            "Resources/Prototypes/_RMC14/Recipes/Reactions/chemicals.yml",
            "Resources/Prototypes/_RMC14/Recipes/Reactions/elements.yml",
            "Resources/Prototypes/_RMC14/Recipes/Reactions/ingredients.yml",
            "Resources/Prototypes/_RMC14/Recipes/Reactions/medicine.yml",
            "Resources/Prototypes/_RMC14/Recipes/Reactions/narcotics.yml",
            "Resources/Prototypes/_RMC14/Recipes/Reactions/other.yml",
            "Resources/Prototypes/_RMC14/Recipes/Reactions/pyrotechnic.yml",
            "Resources/Prototypes/_RMC14/Recipes/Reactions/toxins.yml",
        ],
        "locale_files": [
            # Names for the packaged/powdered drink reagents (2026-07)
            "Resources/Locale/en-US/_RMC14/reagents/meta/consumable/drink/drinks.ftl",
            "Resources/Locale/en-US/_RMC14/reagents/flavors.ftl",
            "Resources/Locale/en-US/_RMC14/reagents/ingredients.ftl",
            "Resources/Locale/en-US/_RMC14/reagents/other.ftl",
            "Resources/Locale/en-US/_RMC14/reagents/pyrotechnic.ftl",
            "Resources/Locale/en-US/_RMC14/reagents/toxins.ftl",
            "Resources/Locale/en-US/_RMC14/reagents/meta/elements.ftl",
            "Resources/Locale/en-US/_RMC14/reagents/meta/consumable/drink/alcohol.ftl",
            "Resources/Locale/en-US/_RMC14/reagents/meta/consumable/drink/juice.ftl",
            "Resources/Locale/en-US/_RMC14/reagents/meta/consumable/drink/soda.ftl",
            "Resources/Locale/en-US/_RMC14/medical/medicine.ftl",
            "Resources/Locale/en-US/_RMC14/medical/narcotics.ftl",
            "Resources/Locale/en-US/_RMC14/medical/toxins.ftl",
            "Resources/Locale/en-US/_RMC14/medical/synth.ftl",
        ],
        "blocked_reactions": {
            # Commented out in medicine.yml
            "Synaptizine", "Cognizine", "Saline",
            # Missing from all reaction files
            "Arcryox", "Heparin", "Hemorrhinol", "Lye",
            # Commented out in chemicals.yml
            "Desoxyephedrine",
            # Commented out in food.yml
            "CookingMustard", "BananaBreakdown", "AllicinBreakdown", "NutrimentBreakdown",
            "FatBreakdown", "UncookedAnimalProteinBreakdown", "ProteinBreakdown", "VitaminBreakdown",
            # Commented out in drinks.yml
            "OrangeLimeSoda", "Neurotoxin", "Singulo",
            # Missing from cleaning.yml
            "CreateSoapRegular", "CreateSoapNT", "CreateSoapDeluxe",
            "CreateSoapBlood", "CreateSoapSyndie", "CreateSoapOmega",
            # Missing from fun.yml
            "Felinase", "Caninase", "CaninaseFelinaseReaction",
            # Missing from biological.yml
            "SulfurBloodBreakdown",
            # Cascade-blocked (reactant is blocked)
            "Pax",              # requires Synaptizine (blocked)
            "Opporozidone",     # requires Cognizine (blocked)
            "Ethyloxyephedrine",  # requires Desoxyephedrine (blocked)
            "Diphenylmethylamine",  # requires Ethyloxyephedrine (cascade)
            # User-confirmed blocked in-game (YAML active but C#-level block suspected)
            "ChloralHydrate",
            "DoctorsDelight",  # User-confirmed: doesn't work despite YAML being active
        },
        "modified_reactions": {
            "MuteToxin": "Added Uranium as extra reactant",
            "Smoke": "Priority changed from -10 to 10",
            "Foam": "Priority changed from -10 to 10",
            "IronMetalFoam": "Priority changed from -10 to 10",
            "AluminiumMetalFoam": "Priority changed from -10 to 10",
            "AmmoniaFromBlood": "Stir mixer requirement removed",
            "Laughter": "Reactants changed: added RMCBlackGoo(0.5) as extra reactant",
            "Arithrazine": "YAML active — verify in-game (may be C#-blocked like ChloralHydrate)",
        },
        "dispenser_chemicals": {
            "RMCAluminum", "RMCCarbon", "RMCChlorine", "RMCCopper", "RMCEthanol",
            "RMCFluorine", "RMCHydrogen", "RMCIodine", "RMCIron", "RMCLithium",
            "RMCMercury", "RMCNitrogen", "RMCOxygen", "RMCPhosphorus", "RMCPhoron",
            "RMCPotassium", "RMCRadium", "RMCSilicon", "RMCSilver", "RMCSodium",
            "RMCSulfur", "RMCSugar", "RMCGold", "RMCTungsten", "RMCWater",
            "RMCSulphuricAcid", "RMCHydrochloricAcid",
        },
        "vanilla_override_reaction_files": VANILLA_REACTION_PATHS,
    },

    # ── Colonial Marines Universe / CMU ──
    # AU-14/ColonialMarinesUniverse — the upstream origin of the _CMU14/_AU14
    # content that RuCM (below) mirrors. Registered as its own fork: parent_fork
    # "rmc14" supplies the CM base chem system, and CMU's own _CMU14 layer adds
    # drugs/toxins plus Yautja (Predator) and Abomination (Aliens) reagents.
    # Like RuCM, CMU carries its own copies of the _RMC14 layer files; first-wins
    # merge dedups identical IDs against the rmc14 parent so only CMU's additions
    # survive, and parent_override_* auto-diffs CMU's copy of the _RMC14 layer to
    # annotate recipes/reagents CMU changed or removed. Must be registered AFTER
    # "rmc14" so the parent builds first.
    "cmu": {
        "name": "Colonial Marines Universe",
        "repo": "AU-14/ColonialMarinesUniverse",
        "branch": "master",
        "custom_dir": "_CMU14",
        "color": "#7c3aed",
        "parent_fork": "rmc14",
        # Same vanilla-category replacement as parent RMC14 (CM chem system)
        "blocked_categories": {"Medicine", "Narcotics", "Cleaning", "Fun", "Chemicals", "Botany"},
        "reagent_files": [
            # CMU's copy of the parent-layer toxins — carries CM/XenoAlch toxin
            # additions; first-wins dedups the identical-ID copies vs rmc14.
            "Resources/Prototypes/_RMC14/Reagents/toxins.yml",
            # CMU-exclusive _CMU14 reagents
            "Resources/Prototypes/_CMU14/Economy/Recipes/Reagents/drugs.yml",
            "Resources/Prototypes/_CMU14/Economy/Recipes/Reagents/toxins.yml",
            "Resources/Prototypes/_CMU14/Economy/Recipes/Reagents/properties.yml",
            # Medical reagents (painkillers incl. CMUSleen, organ-repair) were
            # missing from the manifest, so CMUSleen showed a reaction but no
            # reagent and was invisible. Correct path is Treatment/Reagents.
            "Resources/Prototypes/_CMU14/Medical/Treatment/Reagents/painkillers.yml",
            "Resources/Prototypes/_CMU14/Medical/Treatment/Reagents/organ_repair.yml",
            "Resources/Prototypes/_CMU14/Threats/Abominations/reagents.yml",
            "Resources/Prototypes/_CMU14/Threats/Yautja/Species/reagents.yml",
        ],
        "reaction_files": [
            # CMU's copy of the parent-layer medicine reactions — new CM reactions
            # mixed in; first-wins dedups vs rmc14.
            "Resources/Prototypes/_RMC14/Recipes/Reactions/medicine.yml",
            "Resources/Prototypes/_CMU14/Economy/Recipes/Reactions/other.yml",
            "Resources/Prototypes/_CMU14/Economy/Recipes/Reactions/pyrotechnic.yml",
        ],
        "locale_files": [
            "Resources/Locale/en-US/_AU14/drugs.ftl",
            "Resources/Locale/en-US/_AU14/medicine.ftl",
            "Resources/Locale/en-US/_CMU14/yautja/yautja.ftl",
            "Resources/Locale/en-US/_CMU14/reagents/properties.ftl",
        ],
        "dispenser_chemicals": set(),  # CM dispenser chems already global via rmc14
        "vanilla_override_reaction_files": VANILLA_REACTION_PATHS,
        # Auto-diff CMU's copies of the _RMC14 parent layer against the rmc14
        # build to annotate parent recipes/reagents CMU changed or removed.
        "parent_override_reaction_files": [
            "Resources/Prototypes/_RMC14/Recipes/Reactions/chemicals.yml",
            "Resources/Prototypes/_RMC14/Recipes/Reactions/elements.yml",
            "Resources/Prototypes/_RMC14/Recipes/Reactions/ingredients.yml",
            "Resources/Prototypes/_RMC14/Recipes/Reactions/medicine.yml",
            "Resources/Prototypes/_RMC14/Recipes/Reactions/narcotics.yml",
            "Resources/Prototypes/_RMC14/Recipes/Reactions/other.yml",
            "Resources/Prototypes/_RMC14/Recipes/Reactions/pyrotechnic.yml",
            "Resources/Prototypes/_RMC14/Recipes/Reactions/toxins.yml",
        ],
        "parent_override_reagent_files": [
            "Resources/Prototypes/_RMC14/Reagents/base_reagent.yml",
            "Resources/Prototypes/_RMC14/Reagents/elements.yml",
            "Resources/Prototypes/_RMC14/Reagents/medicine.yml",
            "Resources/Prototypes/_RMC14/Reagents/narcotics.yml",
            "Resources/Prototypes/_RMC14/Reagents/other.yml",
            "Resources/Prototypes/_RMC14/Reagents/pyrotechnic.yml",
            "Resources/Prototypes/_RMC14/Reagents/synth_blood.yml",
            "Resources/Prototypes/_RMC14/Reagents/toxins.yml",
        ],
    },

    # ── Russian Marine Corps / RuCM (RU, downstream fork of CMU) ──
    # parent_fork "cmu": RussianCM forks from ColonialMarinesUniverse, so it
    # inherits CMU's _CMU14/_AU14 layer (and rmc14 beneath it) via ancestry and
    # adds RU translations plus a few local tweaks. Must be registered AFTER cmu
    # so the parent builds first; first-wins then credits the shared _CMU14/_AU14
    # IDs to CMU while RuCM still shows them through inheritance. parent_override_*
    # diffs RuCM's copies of the _RMC14 layer against the parent build.
    "rucm": {
        "name": "Russian Marine Corps",
        "repo": "flex5hybrid/RussianCM",
        "branch": "master",
        "custom_dir": "_CMU14",
        "color": "#9f1239",
        "parent_fork": "cmu",
        # Same vanilla-category replacement as parent RMC14 (CM chem system)
        "blocked_categories": {"Medicine", "Narcotics", "Cleaning", "Fun", "Chemicals", "Botany"},
        "reagent_files": [
            # RuCM's copy of the parent-layer file — carries 7 new XenoAlch toxins
            "Resources/Prototypes/_RMC14/Reagents/toxins.yml",
            "Resources/Prototypes/_CMU14/Economy/Recipes/Reagents/drugs.yml",
            "Resources/Prototypes/_CMU14/Economy/Recipes/Reagents/toxins.yml",
            # Path is Medical/Treatment/Reagents (the Medical/reagents form was a
            # typo — silently 404'd, so RuCM lost CMUSleen & the organ-repair set)
            "Resources/Prototypes/_CMU14/Medical/Treatment/Reagents/organ_repair.yml",
            "Resources/Prototypes/_CMU14/Medical/Treatment/Reagents/painkillers.yml",
            "Resources/Prototypes/_CMU14/Threats/Abominations/reagents.yml",
            "Resources/Prototypes/_CMU14/Threats/Yautja/Species/reagents.yml",
        ],
        "reaction_files": [
            # RuCM's copy of the parent-layer file — carries 9 new CMU medicine reactions
            "Resources/Prototypes/_RMC14/Recipes/Reactions/medicine.yml",
            "Resources/Prototypes/_CMU14/Economy/Recipes/Reactions/other.yml",
            "Resources/Prototypes/_CMU14/Economy/Recipes/Reactions/pyrotechnic.yml",
        ],
        "locale_files": [
            "Resources/Locale/en-US/_AU14/drugs.ftl",
            "Resources/Locale/en-US/_CMU14/medical/reagents.ftl",
            "Resources/Locale/en-US/_CMU14/yautja/yautja.ftl",
            # RuCM's copy of the parent locale — adds XenoAlch names (pure additions)
            "Resources/Locale/en-US/_RMC14/medical/toxins.ftl",
        ],
        "dispenser_chemicals": set(),  # CM dispenser chems already global via rmc14
        "vanilla_override_reaction_files": VANILLA_REACTION_PATHS,
        # RuCM's copies of parent RMC14 reaction files, auto-diffed against the
        # rmc14 build data to annotate parent recipes the server changed
        # (e.g. Mindbreaker without Black Goo, CLF3 yield nerf).
        "parent_override_reaction_files": [
            "Resources/Prototypes/_RMC14/Recipes/Reactions/chemicals.yml",
            "Resources/Prototypes/_RMC14/Recipes/Reactions/elements.yml",
            "Resources/Prototypes/_RMC14/Recipes/Reactions/ingredients.yml",
            "Resources/Prototypes/_RMC14/Recipes/Reactions/medicine.yml",
            "Resources/Prototypes/_RMC14/Recipes/Reactions/narcotics.yml",
            "Resources/Prototypes/_RMC14/Recipes/Reactions/other.yml",
            "Resources/Prototypes/_RMC14/Recipes/Reactions/pyrotechnic.yml",
            "Resources/Prototypes/_RMC14/Recipes/Reactions/toxins.yml",
        ],
        # Same idea for parent REAGENT files — detects reagents the server
        # removed from its copy of the parent layer (e.g. RMCUltrazine).
        # A parent reagent counts as blocked only if it is absent from the
        # child's copy AND not re-contributed by the child's own manifests.
        "parent_override_reagent_files": [
            "Resources/Prototypes/_RMC14/Reagents/base_reagent.yml",
            "Resources/Prototypes/_RMC14/Reagents/elements.yml",
            "Resources/Prototypes/_RMC14/Reagents/medicine.yml",
            "Resources/Prototypes/_RMC14/Reagents/narcotics.yml",
            "Resources/Prototypes/_RMC14/Reagents/other.yml",
            "Resources/Prototypes/_RMC14/Reagents/pyrotechnic.yml",
            "Resources/Prototypes/_RMC14/Reagents/synth_blood.yml",
            "Resources/Prototypes/_RMC14/Reagents/toxins.yml",
            "Resources/Prototypes/_RMC14/Reagents/Consumable/ingredients.yml",
            "Resources/Prototypes/_RMC14/Reagents/Consumable/Drink/alcohol.yml",
            "Resources/Prototypes/_RMC14/Reagents/Consumable/Drink/juice.yml",
            "Resources/Prototypes/_RMC14/Reagents/Consumable/Drink/other_drinks.yml",
            "Resources/Prototypes/_RMC14/Reagents/Consumable/Drink/soda.yml",
            # Parent drink files added upstream 2026-07 (404-safe: RuCM
            # carries base/packaged copies but not powdered_mixes)
            "Resources/Prototypes/_RMC14/Reagents/Consumable/Drink/base.yml",
            "Resources/Prototypes/_RMC14/Reagents/Consumable/Drink/packaged_drinks.yml",
            "Resources/Prototypes/_RMC14/Reagents/Consumable/Drink/powdered_mixes.yml",
        ],
    },

    # ── Goob Station ──
    "goob": {
        "name": "Goob Station",
        "repo": "Goob-Station/Goob-Station",
        "branch": "master",
        "custom_dir": "_Goobstation",
        "color": "#f472b6",
        "reagent_files": [
            "Resources/Prototypes/_Goobstation/Reagents/biological.yml",
            "Resources/Prototypes/_Goobstation/Reagents/botany.yml",
            "Resources/Prototypes/_Goobstation/Reagents/chemicals.yml",
            "Resources/Prototypes/_Goobstation/Reagents/drinks.yml",
            "Resources/Prototypes/_Goobstation/Reagents/fun.yml",
            "Resources/Prototypes/_Goobstation/Reagents/gases.yml",
            "Resources/Prototypes/_Goobstation/Reagents/medicine.yml",
            "Resources/Prototypes/_Goobstation/Reagents/narcotics.yml",
            "Resources/Prototypes/_Goobstation/Reagents/pyrotechnics.yml",
            "Resources/Prototypes/_Goobstation/Reagents/toxins.yml",
            # Materials layer (goob-specific material reagents). Note:
            # Saxoite is NOT here — Goob upstreamed it into its vanilla-path
            # fun.yml copy; the Phase 2b harvest picks it up (first-wins
            # attributes it to rmc14, whose repo synced the brief upstream
            # stint — see CHANGELOG 3.4.x).
            "Resources/Prototypes/_Goobstation/Reagents/Materials/materials.yml",
            # Antag/system reagent definitions. Included deliberately even
            # though most are ability-granted rather than craftable: the
            # changeling REACTIONS file above already references them, ADT
            # manifests its Heretic reagents (precedent), and define-only
            # entries render with honest unobtainable/antag accessibility.
            "Resources/Prototypes/_Goobstation/Changeling/Reagents/biological.yml",
            "Resources/Prototypes/_Goobstation/Heretic/Reagents/reagents.yml",
            "Resources/Prototypes/_Goobstation/Wizard/reagents.yml",
            "Resources/Prototypes/_Goobstation/Xenobiology/Reagents/reagents.yml",
            # Goob vendors the Einstein Engines layer; its own recipes
            # (Neurotoxin, Amasec2, BlackBloodBreakdown) reference reagents
            # defined there (Morphine, BlackBlood — audit 2026-07-11).
            # Registry order puts these ahead of Omu's copies of the same
            # vendor layer, so the whole Goob lineage sees them.
            "Resources/Prototypes/_EinsteinEngines/Reagents/biological.yml",
            "Resources/Prototypes/_EinsteinEngines/Reagents/medicine.yml",
            "Resources/Prototypes/_EinsteinEngines/Reagents/narcotics.yml",
            "Resources/Prototypes/_EinsteinEngines/Shadowling/Reagents/shadowling.yml",
            # Lavaland/Shitmed vendor layers (goob owns them for the whole
            # lineage — funky/trauma/omu see them via ancestry). NOTE:
            # _NF/Comsumables is deliberately NOT here: its ids are owned by
            # frontier (earlier real _NF layer) — manifesting the Goob copy
            # would steal them and hide the drinks from Frontier's view.
            "Resources/Prototypes/_Lavaland/Reagents/medicine.yml",
            "Resources/Prototypes/_Shitmed/Reagents/narcotics.yml",
        ],
        "reaction_files": [
            "Resources/Prototypes/_EinsteinEngines/Recipes/Reactions/chemicals.yml",
            "Resources/Prototypes/_EinsteinEngines/Recipes/Reactions/medicine.yml",
            "Resources/Prototypes/_Goobstation/Recipes/Reactions/biological.yml",
            "Resources/Prototypes/_Goobstation/Recipes/Reactions/botany.yml",
            "Resources/Prototypes/_Goobstation/Recipes/Reactions/changeling.yml",
            "Resources/Prototypes/_Goobstation/Recipes/Reactions/chemicals.yml",
            "Resources/Prototypes/_Goobstation/Recipes/Reactions/drinks.yml",
            "Resources/Prototypes/_Goobstation/Recipes/Reactions/fun.yml",
            "Resources/Prototypes/_Goobstation/Recipes/Reactions/medicine.yml",
            "Resources/Prototypes/_Goobstation/Recipes/Reactions/narcotics.yml",
            "Resources/Prototypes/_Goobstation/Recipes/Reactions/pyrotechnics.yml",
            "Resources/Prototypes/_Goobstation/Recipes/Reactions/single_reagent.yml",
            "Resources/Prototypes/_Goobstation/Recipes/Reactions/toxins.yml",
        ],
        "locale_files": [],
        "seed_files": ["Resources/Prototypes/_Goobstation/Hydroponics/seeds.yml"],
        "blocked_reactions": set(),  # Goob doesn't block vanilla reactions — modifies in-place
        "modified_reactions": {
            "Stimulants": "Product yield increased from 2 to 3",
            "MuteToxin": "Added Uranium(1) as extra reactant; yield doubled from 2 to 4",
            "Nocturine": "Product yield doubled from 1 to 2",
            "Tazinide": "Product yield doubled from 1 to 2",
            "Ethyloxyephedrine": "Added minTemp: 370 temperature requirement",
            "Opporozidone": "Removed Cognizine reactant, uses Phalanximine(2) instead; easier recipe",
            "InsectBloodBreakdown": "Products changed: Water 14→11, added Saline(6), removed Sodium(3)",
            "Licoxide": "Added Lead(1) as extra reactant; added maxTemp: 265",
            "PlasticSheet": "Reactant amounts doubled: Oil 5→10, Ash 3→6, SulfuricAcid 2→4",
        },
        "vanilla_override_reaction_files": VANILLA_REACTION_PATHS,
        # D3c: fork item-fill channels (custom layer only; patched vanilla-path
        # vendor copies are a follow-up — see design doc)
        "item_fill_files": [
            "Resources/Prototypes/_Goobstation/Entities/Objects/Consumable/Drinks/drinks.yml",
            "Resources/Prototypes/_Goobstation/Entities/Objects/Consumable/Drinks/drinks-cartons.yml",
        ],
        "vending_inventory_files": [
            "Resources/Prototypes/_Goobstation/Catalog/VendingMachines/Inventories/fitness.yml",
            "Resources/Prototypes/_Goobstation/Catalog/VendingMachines/Inventories/hotfood.yml",
            "Resources/Prototypes/_Goobstation/Catalog/VendingMachines/Inventories/solsnack.yml",
            "Resources/Prototypes/_Goobstation/Catalog/VendingMachines/Inventories/sweettoof.yml",
            "Resources/Prototypes/_Goobstation/Catalog/VendingMachines/Inventories/weebvend.yml",
        ],
        "vending_machine_files": [
            "Resources/Prototypes/_Goobstation/Entities/Structures/Machines/vending_machines.yml",
        ],
    },

    # ── Starlight ──
    "starlight": {
        "name": "Starlight",
        "repo": "fskx/starlight-ss14",
        "branch": "Starlight",
        "custom_dir": "_Starlight",
        "color": "#facc15",
        "reagent_files": [
            "Resources/Prototypes/_Starlight/Reagents/biological.yml",
            "Resources/Prototypes/_Starlight/Reagents/cantrips.yml",
            "Resources/Prototypes/_Starlight/Reagents/cleaning.yml",
            "Resources/Prototypes/_Starlight/Reagents/fun.yml",
            "Resources/Prototypes/_Starlight/Reagents/medicine.yml",
            "Resources/Prototypes/_Starlight/Reagents/xenobiology.yml",
            # Consumable layer (manifest audit 2026-07-11): alcohol defines
            # DraganSpecial, whose drinks.yml reaction was already tracked
            "Resources/Prototypes/_Starlight/Reagents/Consumable/Drink/alcohol.yml",
            "Resources/Prototypes/_Starlight/Reagents/Consumable/Drink/juice.yml",
            "Resources/Prototypes/_Starlight/Reagents/Consumable/Food/food.yml",
            # _Funkystation/gases.yml is deliberately NOT manifested: its
            # gas ids are owned by adt/frontier — the starlight copy would
            # steal them (collision check 2026-07-11).
        ],
        "reaction_files": [
            "Resources/Prototypes/_Starlight/Recipes/Reactions/cleaning.yml",
            "Resources/Prototypes/_Starlight/Recipes/Reactions/drinks.yml",
            "Resources/Prototypes/_Starlight/Recipes/Reactions/food.yml",
            "Resources/Prototypes/_Starlight/Recipes/Reactions/fun.yml",
            "Resources/Prototypes/_Starlight/Recipes/Reactions/medicine.yml",
            "Resources/Prototypes/_Starlight/Recipes/Reactions/xenobiology.yml",
        ],
        "locale_files": [
            "Resources/Locale/en-US/_Starlight/reagents/meta/consumable/drink/alcohol.ftl",
            "Resources/Locale/en-US/_Starlight/reagents/meta/consumable/drink/juice.ftl",
            "Resources/Locale/en-US/_Starlight/reagents/meta/consumable/food/food.ftl",
            "Resources/Locale/en-US/_Starlight/seeds/seeds.ftl",
        ],
        "seed_files": ["Resources/Prototypes/_Starlight/Hydroponics/seeds.yml"],
        "blocked_reactions": {
            "Heparin",  # Replaced by Warfarin in Starlight's vanilla medicine.yml override
        },
        "modified_reactions": {
            "Hemorrhinol": "Uses Warfarin instead of Heparin as reactant",
            # NOTE: Starlight adds Necrosol & Warfarin reactions in vanilla medicine.yml path
            # (not in _Starlight/) — parser limitation, these won't be auto-detected
        },
        "vanilla_override_reaction_files": VANILLA_REACTION_PATHS,
    },

    # ── Delta-V ──
    "deltav": {
        "name": "Delta-V",
        "repo": "DeltaV-Station/Delta-v",
        "branch": "master",
        "custom_dir": "_DV",
        "color": "#3b82f6",
        "reagent_files": [
            "Resources/Prototypes/_DV/Reagents/biological.yml",
            "Resources/Prototypes/_DV/Reagents/fun.yml",
            "Resources/Prototypes/_DV/Reagents/medicine.yml",
            # narcotics/psionic/toxins: manifest audit 2026-07-11 — the
            # psionic reaction file was already tracked but its reagents
            # (PureOil, Claridisol, LotophagoiOil) rendered as ghosts
            "Resources/Prototypes/_DV/Reagents/narcotics.yml",
            "Resources/Prototypes/_DV/Reagents/psionic.yml",
            "Resources/Prototypes/_DV/Reagents/toxins.yml",
            "Resources/Prototypes/_DV/Reagents/Consumable/Drink/alcohol.yml",
            "Resources/Prototypes/_DV/Reagents/Consumable/Drink/drinks.yml",
            # frozen_treats: new upstream file pair (ice cream line, 2026-07)
            "Resources/Prototypes/_DV/Reagents/Consumable/Drink/frozen_treats.yml",
            "Resources/Prototypes/_DV/Reagents/Consumable/Drink/powdered_drinks.yml",
            "Resources/Prototypes/_DV/Reagents/Consumable/Drink/soda.yml",
            "Resources/Prototypes/_DV/Reagents/Materials/materials.yml",
            # Delta-V vendors the Nyanotrasen and Cosmatic Drift (_CD)
            # layers; tracked DeltaV recipe files reference reagents defined
            # there (Bechamel/Pesto/TomatoSauce condiments, Ectoplasm,
            # Agonolexyne/Blissifylovene — orphan audit 2026-07-11)
            "Resources/Prototypes/Nyanotrasen/Reagents/psionic.yml",
            "Resources/Prototypes/Nyanotrasen/Reagents/Consumable/Food/condiments.yml",
            # Full Nyanotrasen drink layer + _DEN and _Impstation vendor
            # layers ("include everything" 2026-07-11). Files whose ids are
            # owned by frontier (_NF copies, _Impstation medicine
            # Caramexinin, _Floof medicine) are deliberately NOT here —
            # manifesting them would steal ownership from frontier.
            "Resources/Prototypes/Nyanotrasen/Reagents/Consumable/Drink/alcohol.yml",
            "Resources/Prototypes/Nyanotrasen/Reagents/Consumable/Drink/drinks.yml",
            "Resources/Prototypes/_DEN/Reagents/Consumable/Drink/alcohol.yml",
            "Resources/Prototypes/_Impstation/Reagents/biological.yml",
            "Resources/Prototypes/_Impstation/Reagents/toxins.yml",
            "Resources/Prototypes/_Impstation/reagents/pyrotechnic.yml",
            "Resources/Prototypes/_CD/Reagents/medicine.yml",
        ],
        "reaction_files": [
            "Resources/Prototypes/_DV/Recipes/Reactions/drinks.yml",
            "Resources/Prototypes/_DV/Recipes/Reactions/food.yml",
            "Resources/Prototypes/_DV/Recipes/Reactions/frozen_treats.yml",
            "Resources/Prototypes/_DV/Recipes/Reactions/fun.yml",
            "Resources/Prototypes/_DV/Recipes/Reactions/medicine.yml",
            "Resources/Prototypes/_DV/Recipes/Reactions/powdered_drinks.yml",
            "Resources/Prototypes/_DV/Recipes/Reactions/psionic.yml",
            "Resources/Prototypes/Nyanotrasen/Recipes/Reactions/drink.yml",
            "Resources/Prototypes/Nyanotrasen/Recipes/Reactions/food.yml",
            "Resources/Prototypes/Nyanotrasen/Recipes/Reactions/pyrotechnic.yml",
            "Resources/Prototypes/_DEN/Recipes/Reactions/drinks.yml",
            # CreateFrosting spawns an entity (no products) — orphan-safe
            "Resources/Prototypes/_Floof/Recipes/Reactions/food.yml",
            # Cosmatic Drift medicine pairs with _CD/Reagents/medicine.yml
            "Resources/Prototypes/_CD/Reactions/medicine.yml",
        ],
        "locale_files": [
            "Resources/Locale/en-US/nyanotrasen/reagents/meta/consumable/drink/alcohol.ftl",
            "Resources/Locale/en-US/nyanotrasen/reagents/meta/consumable/drink/drink.ftl",
            "Resources/Locale/en-US/_DEN/reagents/meta/consumable/drink/alcohol.ftl",
            "Resources/Locale/en-US/_CD/reagents/RPmeds.ftl",
            "Resources/Locale/en-US/_CD/reagents/meta/biological.ftl",
            "Resources/Locale/en-US/_CD/reagents/meta/medicine.ftl",
            "Resources/Locale/en-US/_DV/reagents/meta/consumable/drink/frozen_treats.ftl",
            "Resources/Locale/en-US/_DV/reagents/meta/narcotic.ftl",
            "Resources/Locale/en-US/_DV/reagents/meta/toxins.ftl",
            "Resources/Locale/en-US/_DV/seeds.ftl",
        ],
        "seed_files": ["Resources/Prototypes/_DV/Hydroponics/seeds.yml"],
        "vanilla_override_reaction_files": VANILLA_REACTION_PATHS,
        # D3c: fork item-fill channels
        "item_fill_files": [
            "Resources/Prototypes/_DV/Entities/Objects/Consumable/Drinks/drinks.yml",
            "Resources/Prototypes/_DV/Entities/Objects/Consumable/Drinks/drinks-cartons.yml",
            "Resources/Prototypes/_DV/Entities/Objects/Consumable/Drinks/drinks_bottles.yml",
            "Resources/Prototypes/_DV/Entities/Objects/Consumable/Drinks/drinks_cans.yml",
            "Resources/Prototypes/_DV/Entities/Objects/Consumable/Drinks/drinks_cups.yml",
            "Resources/Prototypes/_DV/Entities/Objects/Consumable/Drinks/frozen_treats.yml",
            "Resources/Prototypes/_DV/Entities/Objects/Consumable/Drinks/powdered_drinks.yml",
        ],
        "vending_inventory_files": [
            "Resources/Prototypes/_DV/Catalog/VendingMachines/Inventories/commandboozeomat.yml",
            "Resources/Prototypes/_DV/Catalog/VendingMachines/Inventories/crescentmoon.yml",
            "Resources/Prototypes/_DV/Catalog/VendingMachines/Inventories/nanoblood.yml",
            "Resources/Prototypes/_DV/Catalog/VendingMachines/Inventories/nanomedcivilian.yml",
            "Resources/Prototypes/_DV/Catalog/VendingMachines/Inventories/unlockedboozeomat.yml",
            "Resources/Prototypes/_DV/Catalog/VendingMachines/Inventories/unlockedchefvend.yml",
        ],
        "vending_machine_files": [
            "Resources/Prototypes/_DV/Entities/Structures/Machines/vending_machines.yml",
        ],
    },

    # ── Dead Space ──
    "deadspace": {
        "name": "Dead Space",
        "repo": "dead-space-server/dead-space-14",
        "branch": "master",
        "custom_dir": "_DeadSpace",
        "color": "#94a3b8",
        "reagent_files": [
            "Resources/Prototypes/_DeadSpace/Reagents/biological.yml",
            "Resources/Prototypes/_DeadSpace/Reagents/elements.yml",
            # medicine defines Derytracine (Pendrotoxine chain, added
            # upstream 2026-07-11); Consumable/drinks defines the 8 drink
            # reagents whose reactions were already tracked (orphan audit)
            "Resources/Prototypes/_DeadSpace/Reagents/medicine.yml",
            "Resources/Prototypes/_DeadSpace/Reagents/narcotics.yml",
            "Resources/Prototypes/_DeadSpace/Reagents/toxins.yml",
            "Resources/Prototypes/_DeadSpace/Reagents/Consumable/drinks.yml",
            # Dead Space's own addition inside its vendored ADT layer.
            # The _Corvax layer copies are deliberately NOT manifested:
            # their ids are owned by corvax (registered later) — the
            # deadspace copy would steal them from Corvax's view.
            "Resources/Prototypes/_ADT/Reagents/Consumable/Drink/vodka_antivirus.yml",
        ],
        "reaction_files": [
            "Resources/Prototypes/_DeadSpace/Recipes/Reactions/chemicals.yml",
            "Resources/Prototypes/_DeadSpace/Recipes/Reactions/drinks.yml",
            "Resources/Prototypes/_DeadSpace/Recipes/Reactions/medicine.yml",
        ],
        "locale_files": [],
        "seed_files": ["Resources/Prototypes/_DeadSpace/Hydroponics/seeds.yml"],
        "vanilla_override_reaction_files": VANILLA_REACTION_PATHS,
    },

    # ── Frontier ──
    "frontier": {
        "name": "Frontier",
        "repo": "new-frontiers-14/frontier-station-14",
        "branch": "master",
        "custom_dir": "_NF",
        "color": "#fb923c",
        "reagent_files": [
            "Resources/Prototypes/_NF/Reagents/biological.yml",
            "Resources/Prototypes/_NF/Reagents/chemicals.yml",
            "Resources/Prototypes/_NF/Reagents/gases.yml",
            "Resources/Prototypes/_NF/Reagents/medicine.yml",
            "Resources/Prototypes/_NF/Reagents/narcotics.yml",
            "Resources/Prototypes/_NF/Reagents/toxins.yml",
            # Consumables (note the spelling — Frontier's own layer uses
            # "Consumables", unlike the "Comsumables" typo in the copy Goob
            # descendants carry). Tracked _NF reaction files reference
            # Nanocaf/Gravy/Everyspice etc. — orphan audit 2026-07-11.
            "Resources/Prototypes/_NF/Reagents/Consumables/Drink/drinks.yml",
            "Resources/Prototypes/_NF/Reagents/Consumables/Food/food.yml",
            "Resources/Prototypes/_NF/Reagents/Consumables/Food/ingredients.yml",
            # audit_fork_manifests: untracked chem files
            "Resources/Prototypes/_NF/Reagents/Consumables/Drink/juice.yml",
        ],
        "reaction_files": [
            "Resources/Prototypes/_NF/Recipes/Reactions/chemicals.yml",
            "Resources/Prototypes/_NF/Recipes/Reactions/drinks.yml",
            "Resources/Prototypes/_NF/Recipes/Reactions/food.yml",
            "Resources/Prototypes/_NF/Recipes/Reactions/medicine.yml",
        ],
        "locale_files": [
            "Resources/Locale/en-US/_NF/reagents/caffeine.ftl",
            "Resources/Locale/en-US/_NF/reagents/drinks.ftl",
            "Resources/Locale/en-US/_NF/reagents/meta/consumable/drink/drinks.ftl",
            "Resources/Locale/en-US/_NF/reagents/meta/consumable/drink/juice.ftl",
            "Resources/Locale/en-US/_NF/reagents/meta/consumable/food/food.ftl",
            "Resources/Locale/en-US/_NF/reagents/meta/consumable/food/ingredients.ftl",
            "Resources/Locale/en-US/_NF/seeds/seeds.ftl",
        ],
        "seed_files": ["Resources/Prototypes/_NF/Hydroponics/seeds.yml"],
        "blocked_reactions": {
            "Lye",  # Missing from Frontier's vanilla chemicals.yml
        },
        "vanilla_override_reaction_files": VANILLA_REACTION_PATHS,
    },

    # ── Funky Station (forks from Goob Station) ──
    "funky": {
        "name": "Funky Station",
        "repo": "funky-station/funky-station",
        "branch": "master",
        "custom_dir": "_Funkystation",
        "color": "#c084fc",
        "parent_fork": "goob",  # inherits Goob's custom chemistry too
        "reagent_files": [
            "Resources/Prototypes/_Funkystation/Reagents/biological.yml",
            "Resources/Prototypes/_Funkystation/Reagents/bloodcult.yml",
            "Resources/Prototypes/_Funkystation/Reagents/exotic.yml",
            "Resources/Prototypes/_Funkystation/Reagents/fun.yml",
            "Resources/Prototypes/_Funkystation/Reagents/medicine.yml",
            "Resources/Prototypes/_Funkystation/Reagents/toxins.yml",
            # Consumable reagents backing the tracked alcohol/drinks/food
            # reaction files — 34 cocktail products (Admiralty, BlueBlazer,
            # ...) rendered as ghosts before (orphan audit 2026-07-11)
            "Resources/Prototypes/_Funkystation/Reagents/Consumable/Drink/alcohol.yml",
            "Resources/Prototypes/_Funkystation/Reagents/Consumable/Drink/drinks.yml",
            "Resources/Prototypes/_Funkystation/Reagents/Consumable/Food/condiments.yml",
            "Resources/Prototypes/_Funkystation/Reagents/Consumable/Food/ingredients.yml",
            # Funky's copy of the _DV layer defines Hemoxadone, referenced
            # by its patched vanilla medicine.yml (Ambuzol2 recipes)
            "Resources/Prototypes/_DV/Reagents/medicine.yml",
            # Impstation vendor layer ("include everything" 2026-07-11).
            # NB the "alchohol" typo is in the repo itself.
            # _CD/biological defines SynthBlood, referenced by the
            # Impstation drink reactions below.
            "Resources/Prototypes/_CD/Reagents/biological.yml",
            "Resources/Prototypes/_Impstation/Reagents/Consumable/Drink/alchohol.yml",
            "Resources/Prototypes/_Impstation/Reagents/Consumable/Drink/drinks.yml",
            "Resources/Prototypes/_Impstation/Reagents/biological.yml",
            "Resources/Prototypes/_Impstation/Reagents/pyrotechnic.yml",
        ],
        "reaction_files": [
            "Resources/Prototypes/_Funkystation/Recipes/Reactions/alcohol.yml",
            "Resources/Prototypes/_Funkystation/Recipes/Reactions/biological.yml",
            "Resources/Prototypes/_Funkystation/Recipes/Reactions/drinks.yml",
            "Resources/Prototypes/_Funkystation/Recipes/Reactions/exotic.yml",
            "Resources/Prototypes/_Funkystation/Recipes/Reactions/food.yml",
            "Resources/Prototypes/_Funkystation/Recipes/Reactions/medicine.yml",
            "Resources/Prototypes/_Funkystation/Recipes/Reactions/pyrotechnic.yml",
            "Resources/Prototypes/_Funkystation/Recipes/Reactions/toxins.yml",
            "Resources/Prototypes/_Impstation/Recipes/Reactions/biological.yml",
            "Resources/Prototypes/_Impstation/Recipes/Reactions/drinks.yml",
        ],
        "locale_files": [
            "Resources/Locale/en-US/_Funkystation/reagents/meta/consumable/drink/alcohol.ftl",
            "Resources/Locale/en-US/_Funkystation/reagents/meta/consumable/drink/drinks.ftl",
            "Resources/Locale/en-US/_Funkystation/reagents/meta/consumable/food/condiments.ftl",
            "Resources/Locale/en-US/_Funkystation/reagents/meta/consumable/food/ingredients.ftl",
            "Resources/Locale/en-US/_Funkystation/seeds/seeds.ftl",
        ],
        "seed_files": [
            "Resources/Prototypes/_Funkystation/Hydroponics/seeds.yml",
            "Resources/Prototypes/_Impstation/Hydroponics/seeds.yml",
        ],
        "blocked_reactions": {
            "Lye",           # Missing from Funky's vanilla chemicals.yml
            "ArtifactGlue",  # Missing from Funky's vanilla chemicals.yml
        },
        "modified_reactions": {
            # Funky uses a Multiver-based medicine system (DeltaV/TG lineage)
            "Acetone": "Product amount 2 → 3",
            "Oil": "Product amount 3 → 4",
            "ChloralHydrate": "Product amount 1 → 3 (DeltaV change)",
            "Ethylredoxrazine": "Recipe changed: uses Multiver instead of Diethylamine",
            "Tricordrazine": "Recipe changed: uses Multiver instead of Dylovene",
            "MindbreakerToxin": "Recipe changed: uses Multiver, minTemp added",
            "Ambuzol": "Recipe changed: uses Multiver instead of Dylovene",
            "Opporozidone": "Recipe changed: Cognizine as catalyst + Plasma(5) + Doxarubixadone",
        },
        "vanilla_override_reaction_files": VANILLA_REACTION_PATHS,
    },

    # ── Trauma Station (forks from Goob Station) ──
    # NOTE: repo also carries copied _Goobstation/_EinsteinEngines/_NF/_RMC14
    # layers. Only the fork's own _Trauma layer is manifested here — copied
    # layers would collide with their owner forks in detect_fork_source
    # (same pattern as Funky: parent_fork covers the Goob lineage).
    "trauma": {
        "name": "Trauma Station",
        "repo": "Trauma-Station/Trauma-Station",
        "branch": "master",
        "custom_dir": "_Trauma",
        "color": "#ef4444",
        "parent_fork": "goob",
        "reagent_files": [
            "Resources/Prototypes/_Trauma/Reagents/Consumable/Drinks/drinks.yml",
            "Resources/Prototypes/_Trauma/Reagents/Consumable/Drinks/juice.yml",
            "Resources/Prototypes/_Trauma/Reagents/Consumable/Food/food.yml",
            "Resources/Prototypes/_Trauma/Reagents/Consumable/Food/nutrislime.yml",
            "Resources/Prototypes/_Trauma/Reagents/botany.yml",
            "Resources/Prototypes/_Trauma/Reagents/chemicals.yml",
            "Resources/Prototypes/_Trauma/Reagents/fun.yml",
            "Resources/Prototypes/_Trauma/Reagents/genetics.yml",
            "Resources/Prototypes/_Trauma/Reagents/ghetto.yml",
            "Resources/Prototypes/_Trauma/Reagents/groups.yml",
            "Resources/Prototypes/_Trauma/Reagents/narcotics.yml",
            "Resources/Prototypes/_Trauma/Reagents/pyrotechnics.yml",
            "Resources/Prototypes/_Trauma/Reagents/toxins.yml",
            # audit_fork_manifests: untracked chem files
            "Resources/Prototypes/_Trauma/Reagents/medicine.yml",
        ],
        "reaction_files": [
            "Resources/Prototypes/_Trauma/Recipes/Reactions/botany.yml",
            "Resources/Prototypes/_Trauma/Recipes/Reactions/chemicals.yml",
            "Resources/Prototypes/_Trauma/Recipes/Reactions/drinks.yml",
            "Resources/Prototypes/_Trauma/Recipes/Reactions/fun.yml",
            "Resources/Prototypes/_Trauma/Recipes/Reactions/ghetto.yml",
            "Resources/Prototypes/_Trauma/Recipes/Reactions/pyrotechnics.yml",
            "Resources/Prototypes/_Trauma/Recipes/Reactions/single_reagent.yml",
            "Resources/Prototypes/_Trauma/Recipes/Reactions/toxins.yml",
            # audit_fork_manifests: untracked chem files
            "Resources/Prototypes/_Trauma/Recipes/Reactions/medicine.yml",
        ],
        "locale_files": [
            "Resources/Locale/en-US/_Trauma/botany/seeds.ftl",
        ],
        "seed_files": ["Resources/Prototypes/_Trauma/Hydroponics/seeds.yml"],
        "vanilla_override_reaction_files": VANILLA_REACTION_PATHS,
    },

    # ── Omu Station ("Goob, but more egg") ──
    # Repo aggregates many copied layers (_Goobstation, _Trauma, _StarLight,
    # _Mono, _Impstation, ...) — manifested is only the fork's own _Omu layer.
    "omu": {
        "name": "Omu Station",
        "repo": "ProjectOmu/OmuStation",
        "branch": "master",
        "custom_dir": "_Omu",
        "color": "#f59e0b",
        "parent_fork": "goob",
        "reagent_files": [
            "Resources/Prototypes/_Omu/Reagents/Consumable/Drink/drinks.yml",
            "Resources/Prototypes/_Omu/Reagents/chemicals.yml",
            "Resources/Prototypes/_Omu/Reagents/fun.yml",
            # Omu vendors Frontier (_NF) and Einstein Engines layers inside
            # its repo; its own recipes reference reagents defined there
            # (GoldenCat/PineappleBlast drinks, Morphine, BlackBlood —
            # audit findings 2026-07-11). _fork stamping attributes them to
            # omu unless an earlier-registered fork defines the same ID.
            "Resources/Prototypes/_NF/Reagents/Comsumables/Drink/drinks.yml",
            "Resources/Prototypes/_EinsteinEngines/Reagents/narcotics.yml",
            "Resources/Prototypes/_EinsteinEngines/Reagents/biological.yml",
            # AtomicPrecision reagent lives inside an entity file (flavor +
            # glass entity + reagent in one YAML) — manifest audit 2026-07-11
            "Resources/Prototypes/_Omu/Entities/Objects/Consumable/Drinks/atomicPrecision.yml",
            # Gardenstation vendor layer (kelp/Thaven drinks + medicine)
            "Resources/Prototypes/_Gardenstation/Reagents/Consumable/Drink/alcohol.yml",
            "Resources/Prototypes/_Gardenstation/Reagents/medicine.yml",
        ],
        "reaction_files": [
            "Resources/Prototypes/_Omu/Recipes/Reactions/drinks.yml",
            "Resources/Prototypes/_Omu/Recipes/Reactions/fun.yml",
            "Resources/Prototypes/_Omu/Recipes/Reactions/single_reagent.yml",
            "Resources/Prototypes/_Gardenstation/Recipes/Reactions/drinks.yml",
        ],
        "locale_files": [
            "Resources/Locale/en-US/_Gardenstation/reagents/medicine.ftl",
            "Resources/Locale/en-US/_Gardenstation/reagents/meta/Consumable/Drinks/alcohol.ftl",
            "Resources/Locale/en-US/_Gardenstation/reagents/reagents.ftl",
        ],
        "seed_files": ["Resources/Prototypes/_Gardenstation/Hydroponics/seeds.yml"],
        "vanilla_override_reaction_files": VANILLA_REACTION_PATHS,
    },

    # ── Carpmosia ──
    "carpmosia": {
        "name": "Carpmosia",
        "repo": "carpmosia/carpmosia",
        "branch": "dev",
        "custom_dir": "_Carpmosia",
        "color": "#14b8a6",
        "reagent_files": [
            "Resources/Prototypes/_Carpmosia/Reagents/Consumable/Drink/alcohol.yml",
            "Resources/Prototypes/_Carpmosia/Reagents/botany.yml",
            "Resources/Prototypes/_Carpmosia/Reagents/fun.yml",
            "Resources/Prototypes/_Carpmosia/Reagents/medicine.yml",
        ],
        "reaction_files": [
            "Resources/Prototypes/_Carpmosia/Recipes/Reactions/botany.yml",
            "Resources/Prototypes/_Carpmosia/Recipes/Reactions/drinks.yml",
            "Resources/Prototypes/_Carpmosia/Recipes/Reactions/medicine.yml",
            "Resources/Prototypes/_Carpmosia/Recipes/Reactions/toxins.yml",
        ],
        "locale_files": [],
        "seed_files": ["Resources/Prototypes/_Carpmosia/Hydroponics/seeds.yml"],
        "vanilla_override_reaction_files": VANILLA_REACTION_PATHS,
    },

    # ── Monolith (forks from Frontier) ──
    # Carries its own evolved copy of _NF; that copy is NOT manifested (would
    # shadow the real Frontier fork). parent_fork marks the Frontier lineage.
    "monolith": {
        "name": "Monolith",
        "repo": "Monolith-Station/Monolith",
        "branch": "main",
        "custom_dir": "_Mono",
        "color": "#78716c",
        "parent_fork": "frontier",
        "reagent_files": [
            "Resources/Prototypes/_Mono/Reagents/consumable/drink/drinks.yml",
            "Resources/Prototypes/_Mono/Reagents/consumable/food/ingredients.yml",
            "Resources/Prototypes/_Mono/Reagents/letoferol.yml",
            "Resources/Prototypes/_Mono/Reagents/medicine.yml",
            "Resources/Prototypes/_Mono/Reagents/narcotics.yml",
            "Resources/Prototypes/_Mono/Reagents/technological.yml",
            # Monolith's _NF copy adds OilVegetable (used by its
            # HotOilVegetableAndWater reaction); the three ids shared with
            # Frontier's copy are skipped by first-wins.
            "Resources/Prototypes/_NF/Reagents/Consumables/Food/ingredients.yml",
        ],
        "reaction_files": [
            "Resources/Prototypes/_Mono/Recipes/Reactions/drinks.yml",
            "Resources/Prototypes/_Mono/Recipes/Reactions/fentanyl.yml",
            "Resources/Prototypes/_Mono/Recipes/Reactions/medicine.yml",
            "Resources/Prototypes/_Mono/Recipes/Reactions/pyrotechnics.yml",
            "Resources/Prototypes/_Mono/Recipes/Reactions/technological.yml",
            # Monolith-only addition to its _NF layer copy (audit 2026-07-11)
            "Resources/Prototypes/_NF/Recipes/Reactions/pyrotechnic.yml",
        ],
        "locale_files": [
            "Resources/Locale/en-US/_NF/seeds/seeds.ftl",
        ],
        # Monolith keeps its _NF seeds at the pre-move Entities path
        "seed_files": ["Resources/Prototypes/_NF/Entities/Objects/Specific/Hydroponics/seeds.yml"],
        "vanilla_override_reaction_files": VANILLA_REACTION_PATHS,
    },

    # ── Harmony ──
    "harmony": {
        "name": "Harmony",
        "repo": "ss14-harmony/ss14-harmony",
        "branch": "master",
        "custom_dir": "_Harmony",
        "color": "#84cc16",
        "reagent_files": [
            "Resources/Prototypes/_Harmony/Reagents/Consumable/Drink/alcohol.yml",
            "Resources/Prototypes/_Harmony/Reagents/Consumable/Drink/soda.yml",
            "Resources/Prototypes/_Harmony/Reagents/Consumable/Food/ingredients.yml",
            "Resources/Prototypes/_Harmony/Reagents/medicine.yml",
            "Resources/Prototypes/_Harmony/Reagents/narcotics.yml",
        ],
        "reaction_files": [
            "Resources/Prototypes/_Harmony/Recipes/Reactions/drinks.yml",
            "Resources/Prototypes/_Harmony/Recipes/Reactions/food.yml",
            "Resources/Prototypes/_Harmony/Recipes/Reactions/medicine.yml",
        ],
        "locale_files": [],
        "seed_files": ["Resources/Prototypes/_Harmony/Hydroponics/seeds.yml"],
        "vanilla_override_reaction_files": VANILLA_REACTION_PATHS,
    },

    # ── Corvax (RU, Corvax Main build: Вега/Элизиум servers) ──
    # custom_dir has no underscore prefix upstream ("Corvax/").
    "corvax": {
        "name": "Corvax",
        "repo": "space-syndicate/space-station-14",
        "branch": "master",
        "custom_dir": "Corvax",
        "color": "#6366f1",
        "reagent_files": [
            "Resources/Prototypes/Corvax/Reagents/Consumable/Drink/alcohol.yml",
            "Resources/Prototypes/Corvax/Reagents/Consumable/Drink/drinks.yml",
            "Resources/Prototypes/Corvax/Reagents/Materials/materials.yml",
        ],
        "reaction_files": [
            "Resources/Prototypes/Corvax/Recipes/Reactions/drinks.yml",
        ],
        "locale_files": [],
        "vanilla_override_reaction_files": VANILLA_REACTION_PATHS,
    },

    # ── ADT / Время Приключений (RU, forks from Corvax) ──
    # Repo also carries the Corvax/ layer (not manifested — owned by corvax).
    "adt": {
        "name": "ADT (Время Приключений)",
        "repo": "AdventureTimeSS14/space_station_ADT",
        "branch": "master",
        "custom_dir": "ADT",
        "color": "#f43f5e",
        "parent_fork": "corvax",
        "reagent_files": [
            "Resources/Prototypes/ADT/Heretic/Reagents/reagents.yml",
            "Resources/Prototypes/ADT/Reagents/Consumable/Drink/alcohol.yml",
            "Resources/Prototypes/ADT/Reagents/Consumable/Drink/drinks.yml",
            "Resources/Prototypes/ADT/Reagents/Consumable/Food/food.yml",
            "Resources/Prototypes/ADT/Reagents/Materials/materials.yml",
            "Resources/Prototypes/ADT/Reagents/Materials/raw.yml",
            "Resources/Prototypes/ADT/Reagents/biological.yml",
            "Resources/Prototypes/ADT/Reagents/chemicals.yml",
            "Resources/Prototypes/ADT/Reagents/fun.yml",
            "Resources/Prototypes/ADT/Reagents/gases.yml",
            "Resources/Prototypes/ADT/Reagents/medicine.yml",
            "Resources/Prototypes/ADT/Reagents/narcotics.yml",
            "Resources/Prototypes/ADT/Reagents/pyrotechnic.yml",
            "Resources/Prototypes/ADT/Reagents/toxins.yml",
        ],
        "reaction_files": [
            "Resources/Prototypes/ADT/Recipes/Reactions/biological.yml",
            "Resources/Prototypes/ADT/Recipes/Reactions/chemicals.yml",
            "Resources/Prototypes/ADT/Recipes/Reactions/drinks.yml",
            "Resources/Prototypes/ADT/Recipes/Reactions/fun.yml",
            "Resources/Prototypes/ADT/Recipes/Reactions/medicine.yml",
            "Resources/Prototypes/ADT/Recipes/Reactions/pyrotechnic.yml",
            "Resources/Prototypes/ADT/Recipes/Reactions/toxins.yml",
            # ADT/Reactions/ (no Recipes/ segment) — separate dir the fork
            # started using for new content (manifest audit 2026-07-11)
            "Resources/Prototypes/ADT/Reactions/plastic.yml",
        ],
        "locale_files": [
            "Resources/Locale/en-US/ADT/reagents/meta/toxins.ftl",
        ],
        "seed_files": ["Resources/Prototypes/ADT/Hydroponics/seeds.yml"],
        "vanilla_override_reaction_files": VANILLA_REACTION_PATHS,
        # D3c: fork item-fill channels (pillomat = ADT pill vendor)
        "item_fill_files": [
            "Resources/Prototypes/ADT/Entities/Objects/Consumable/Drinks/drink_bottles.yml",
            "Resources/Prototypes/ADT/Entities/Objects/Consumable/Drinks/drink_cups.yml",
            "Resources/Prototypes/ADT/Entities/Objects/Consumable/Drinks/drinks.yml",
            "Resources/Prototypes/ADT/Entities/Objects/Consumable/Drinks/drinks_cans.yml",
            "Resources/Prototypes/ADT/Entities/Objects/Consumable/Drinks/drinks_flasks.yml",
            "Resources/Prototypes/ADT/Entities/Objects/Consumable/Drinks/yupi.yml",
            "Resources/Prototypes/ADT/Entities/Objects/Specific/Medical/healing.yml",
        ],
        "vending_inventory_files": [
            "Resources/Prototypes/ADT/Catalog/VendingMachines/Inventories/civimed.yml",
            "Resources/Prototypes/ADT/Catalog/VendingMachines/Inventories/icecream.yml",
            "Resources/Prototypes/ADT/Catalog/VendingMachines/Inventories/pillomat.yml",
        ],
        "vending_machine_files": [
            "Resources/Prototypes/ADT/Entities/Structures/Machines/vending_machines.yml",
        ],
    },

    # ── Sunrise (RU) ──
    # Base build for Fish Station; must stay BEFORE "fish" in this registry so
    # first-wins merge attributes shared content to the base fork.
    "sunrise": {
        "name": "Sunrise",
        "repo": "space-sunrise/sunrise-station",
        "branch": "master",
        "custom_dir": "_Sunrise",
        "color": "#d946ef",
        "reagent_files": [
            "Resources/Prototypes/_Sunrise/Reagents/Consumable/Drink/alcohol.yml",
            "Resources/Prototypes/_Sunrise/Reagents/Consumable/Drink/drinks.yml",
            "Resources/Prototypes/_Sunrise/Reagents/Consumable/Drink/soda.yml",
            "Resources/Prototypes/_Sunrise/Reagents/Consumable/Food/condiments.yml",
            "Resources/Prototypes/_Sunrise/Reagents/biological.yml",
            "Resources/Prototypes/_Sunrise/Reagents/botany.yml",
            "Resources/Prototypes/_Sunrise/Reagents/fun.yml",
            "Resources/Prototypes/_Sunrise/Reagents/gases.yml",
            "Resources/Prototypes/_Sunrise/Reagents/medicine.yml",
            "Resources/Prototypes/_Sunrise/Reagents/narcotics.yml",
            "Resources/Prototypes/_Sunrise/Reagents/pyrotechnic.yml",
            "Resources/Prototypes/_Sunrise/Reagents/special.yml",
            "Resources/Prototypes/_Sunrise/Reagents/toxins.yml",
        ],
        "reaction_files": [
            "Resources/Prototypes/_Sunrise/Recipes/Reactions/chemicals.yml",
            "Resources/Prototypes/_Sunrise/Recipes/Reactions/drinks.yml",
            "Resources/Prototypes/_Sunrise/Recipes/Reactions/fun.yml",
            "Resources/Prototypes/_Sunrise/Recipes/Reactions/gas.yml",
            "Resources/Prototypes/_Sunrise/Recipes/Reactions/gases.yml",
            "Resources/Prototypes/_Sunrise/Recipes/Reactions/medicine.yml",
            "Resources/Prototypes/_Sunrise/Recipes/Reactions/special.yml",
        ],
        "locale_files": [
            "Resources/Locale/en-US/_prototypes/_sunrise/entities/objects/specific/hydroponics/seeds.ftl",
        ],
        "seed_files": ["Resources/Prototypes/_Sunrise/Hydroponics/seeds.yml"],
        "vanilla_override_reaction_files": VANILLA_REACTION_PATHS,
    },

    # ── Fish Station / Рыбья станция (RU, forks from Sunrise) ──
    # Repo carries its own copy of the _Sunrise layer (not manifested — owned
    # by sunrise above); only the fork's own _Fish layer ships here.
    "fish": {
        "name": "Fish Station (Рыбья)",
        "repo": "space-sunrise/fish-station",
        "branch": "master",
        "custom_dir": "_Fish",
        "color": "#0ea5e9",
        "parent_fork": "sunrise",
        "reagent_files": [
            "Resources/Prototypes/_Fish/Reagents/Consumable/Drink/juice.yml",
            "Resources/Prototypes/_Fish/Reagents/medicine.yml",
            "Resources/Prototypes/_Fish/Reagents/unknown_pathogens.yml",
            # Vaccine system — Fish-only extension of the _Sunrise layer
            # (absent from the sunrise repo itself; audit 2026-07-11):
            # disease blood draws -> centrifuge -> vaccine crafting
            "Resources/Prototypes/_Sunrise/Vaccine/Reagents/blood.yml",
            "Resources/Prototypes/_Sunrise/Vaccine/Reagents/vaccine.yml",
            # audit_fork_manifests: untracked chem files
            "Resources/Prototypes/_Fish/Reagents/foxium.yml",
        ],
        "reaction_files": [
            "Resources/Prototypes/_Fish/Recipes/Reactions/medicine.yml",
            "Resources/Prototypes/_Sunrise/Vaccine/Reactions/BloodToVaccine.yml",
            "Resources/Prototypes/_Sunrise/Vaccine/Reactions/Centrifuge.yml",
            "Resources/Prototypes/_Sunrise/Vaccine/Reactions/VaccinatorInspect.yml",
            "Resources/Prototypes/_Sunrise/Vaccine/Reactions/VaccineCreate.yml",
        ],
        "locale_files": [
            "Resources/Locale/en-US/_fish/Reagents/unknown_pathogens.ftl",
            "Resources/Locale/en-US/_prototypes/_fish/entities/objects/specific/hydroponics/seeds.ftl",
        ],
        "seed_files": ["Resources/Prototypes/_Fish/Hydroponics/seeds.yml"],
        "vanilla_override_reaction_files": VANILLA_REACTION_PATHS,
    },

    # ── Misfits: Nuclear Wasteland (EN, Fallout total conversion) ──
    # play.misfitsystems.net — the English MRP Fallout server (game preset
    # "MFNW"); its repo is the Misfit-Sanctuary continuation of Peptide90's
    # Nuclear 14, built on Einstein Engines. Two own layers ship chemistry:
    #   _Nuclear14  — the Fallout chem system (chems, stimpaks, Nuka drinks,
    #                 wasteland extracts/food, ore-to-reagent grinding)
    #   _Misfits    — the server's own additions (Black Goo, Berserker mix,
    #                 promethine, salvaged chems, sterile wipes, uranium EMP)
    # Neither ancestor (Einstein Engines, Vault-Overseers/nuclear-14) is a
    # registered fork, so this entry OWNS the _Nuclear14 layer and gets no
    # parent_fork. The repo ALSO vendors _EE/_Goobstation/_NF/_Harmony/
    # Nyanotrasen/Corvax/DeltaV layers — deliberately NOT manifested: their
    # chem ids belong to goob/frontier/harmony/deltav/corvax (registered
    # earlier), and manifesting the copies would only move attribution.
    # The fork trims vanilla chemistry hard (biological 10->1, drinks
    # 128->97 reactions, soap.yml deleted); vanilla_override_reaction_files
    # auto-diffs those removals into the fork's blocked set.
    "misfits": {
        "name": "Misfits: Nuclear Wasteland",
        "repo": "Misfit-Sanctuary/nuclear-14",
        "branch": "master",
        "custom_dir": "_Misfits",
        "color": "#b45309",
        "reagent_files": [
            # _Nuclear14 layer (Fallout chem system)
            "Resources/Prototypes/_Nuclear14/Reagents/biological.yml",
            "Resources/Prototypes/_Nuclear14/Reagents/chems.yml",
            "Resources/Prototypes/_Nuclear14/Reagents/materials.yml",
            "Resources/Prototypes/_Nuclear14/Reagents/medicine.yml",
            "Resources/Prototypes/_Nuclear14/Reagents/products.yml",
            "Resources/Prototypes/_Nuclear14/Reagents/toxins.yml",
            "Resources/Prototypes/_Nuclear14/Reagents/Consumable/extracts.yml",
            "Resources/Prototypes/_Nuclear14/Reagents/Consumable/food.yml",
            "Resources/Prototypes/_Nuclear14/Reagents/Consumable/Drink/alcohol.yml",
            "Resources/Prototypes/_Nuclear14/Reagents/Consumable/Drink/drinks.yml",
            "Resources/Prototypes/_Nuclear14/Reagents/Consumable/Drink/liquids.yml",
            "Resources/Prototypes/_Nuclear14/Reagents/Consumable/Drink/soda.yml",
            # _Misfits layer (server-own additions; three files ship with a
            # UTF-8 BOM upstream — PyYAML strips it, verified 2026-07-23)
            "Resources/Prototypes/_Misfits/Reagents/Berserkermix.yml",
            "Resources/Prototypes/_Misfits/Reagents/BlackGoo.yml",
            "Resources/Prototypes/_Misfits/Reagents/bomb_cig.yml",
            "Resources/Prototypes/_Misfits/Reagents/coconut.yml",
            "Resources/Prototypes/_Misfits/Reagents/construction_materials.yml",
            "Resources/Prototypes/_Misfits/Reagents/genetics.yml",
            "Resources/Prototypes/_Misfits/Reagents/promethine.yml",
            "Resources/Prototypes/_Misfits/Reagents/yankelsteinium.yml",
            # Einstein-Engines psionic reagents at the vanilla path (not part
            # of VANILLA_REAGENT_PATHS, so the Phase 2b harvest never sees
            # them). Ids shared with Delta-V's psionic files are skipped by
            # first-wins — deltav is registered earlier.
            "Resources/Prototypes/Reagents/psionic.yml",
        ],
        "reaction_files": [
            "Resources/Prototypes/_Nuclear14/Recipes/Reactions/chems.yml",
            "Resources/Prototypes/_Nuclear14/Recipes/Reactions/drinks.yml",
            "Resources/Prototypes/_Nuclear14/Recipes/Reactions/food.yml",
            "Resources/Prototypes/_Nuclear14/Recipes/Reactions/materials.yml",
            "Resources/Prototypes/_Nuclear14/Recipes/Reactions/medicine.yml",
            "Resources/Prototypes/_Misfits/Recipes/Reactions/Berserkermix.yml",
            "Resources/Prototypes/_Misfits/Recipes/Reactions/BlackGoo.yml",
            "Resources/Prototypes/_Misfits/Recipes/Reactions/bomb_cig.yml",
            "Resources/Prototypes/_Misfits/Recipes/Reactions/promethine.yml",
            "Resources/Prototypes/_Misfits/Recipes/Reactions/salvaged_chemicals.yml",
            "Resources/Prototypes/_Misfits/Recipes/Reactions/sterilewipe.yml",
            "Resources/Prototypes/_Misfits/Recipes/Reactions/uranium_emp.yml",
        ],
        "locale_files": [
            "Resources/Locale/en-US/_Nuclear14/reagents.ftl",
            "Resources/Locale/en-US/_Nuclear14/seeds.ftl",
            "Resources/Locale/en-US/_Misfits/chems.ftl",
            "Resources/Locale/en-US/_Misfits/genetics/reagents.ftl",
            "Resources/Locale/en-US/_Misfits/medical/BlackGoo.ftl",
            # names for the vanilla-path psionic reagents above
            "Resources/Locale/en-US/reagents/psionic.ftl",
        ],
        "seed_files": [
            "Resources/Prototypes/_Nuclear14/Hydroponics/seeds.yml",
            "Resources/Prototypes/_Misfits/Hydroponics/seeds.yml",
        ],
        "vanilla_override_reaction_files": VANILLA_REACTION_PATHS,
        # D3c: fork item-fill channels (Nuka-Cola vendor, wasteland medkits)
        "item_fill_files": [
            "Resources/Prototypes/_Nuclear14/Entities/Objects/Consumable/Drinks/drinks.yml",
            "Resources/Prototypes/_Nuclear14/Entities/Objects/Consumable/Drinks/drinks_bottles.yml",
            "Resources/Prototypes/_Nuclear14/Entities/Objects/Specific/Medical/healing.yml",
        ],
        "vending_inventory_files": [
            "Resources/Prototypes/_Nuclear14/Catalog/VendingMachines/Inventories/nuka.yml",
        ],
        "vending_machine_files": [
            "Resources/Prototypes/_Nuclear14/Entities/Structures/Machines/vending_machines.yml",
        ],
        "produce_files": [
            "Resources/Prototypes/_Nuclear14/Entities/Objects/Consumable/Food/produce.yml",
            "Resources/Prototypes/_Misfits/Entities/Objects/Consumable/Food/produce.yml",
        ],
    },
}

# Every non-vanilla fork gets vanilla-path reagent copies fetched for the
# Phase 2b harvest (fork-added content inside patched vanilla files). Explicit
# per-fork override still possible by setting the key in the entry above.
for _fork_id, _fconf in FORK_REGISTRY.items():
    # T2c: raw_url is mechanically repo+branch — derive it instead of
    # repeating the same GitHub-raw URL in every entry.
    _fconf.setdefault(
        "raw_url",
        f"https://raw.githubusercontent.com/{_fconf['repo']}/{_fconf['branch']}/{{path}}",
    )
    if _fork_id != "vanilla":
        _fconf.setdefault("vanilla_override_reagent_files", VANILLA_REAGENT_PATHS)

# Combined dispenser chemicals (all forks)
BASE_DISPENSER_CHEMICALS = set()
for _fork in FORK_REGISTRY.values():
    BASE_DISPENSER_CHEMICALS |= _fork.get("dispenser_chemicals", set())

# Non-chemistry sources for reagents (vending machines, dispensers, mobs, etc.)
# Format: reagent_id -> list of source descriptions
OTHER_REAGENT_SOURCES = {
    # Booze Dispenser
    "Ale": ["Booze Dispenser"],
    "Beer": ["Booze Dispenser"],
    "Cognac": ["Booze Dispenser"],
    "Gin": ["Booze Dispenser"],
    "Rum": ["Booze Dispenser"],
    "Tequila": ["Booze Dispenser"],
    "Vermouth": ["Booze Dispenser"],
    "Vodka": ["Booze Dispenser"],
    "Whiskey": ["Booze Dispenser"],
    "Wine": ["Booze Dispenser"],
    # Soda Dispenser
    "Coffee": ["Soda Dispenser"],
    "Cola": ["Soda Dispenser"],
    "Cream": ["Soda Dispenser"],
    "Ice": ["Soda Dispenser"],
    "JuiceLemon": ["Soda Dispenser (Lime Juice)"],
    "JuiceOrange": ["Soda Dispenser"],
    "JuiceWatermelon": ["Soda Dispenser"],
    "Sugar": ["Soda Dispenser", "Sugarcane (plant)"],
    "Tea": ["Soda Dispenser"],
    "Water": ["Soda Dispenser", "Sink"],
    "SodaWater": ["Soda Dispenser"],
    "TonicWater": ["Soda Dispenser"],
    # NanoMed vending
    "Epinephrine": ["NanoMed (bottle)"],
    "Tricordrazine": ["NanoMed (pills)", "NanoMed Civilian (pills)"],
    "Inaprovaline": ["NanoMed Civilian (bottle)"],
    # ChemVend
    "Ethanol": ["ChemVend", "Booze Dispenser"],
    # Mob drops
    "Blood": ["Blood draw (syringe)", "Blood Tomato (plant)"],
    "Slime": ["Slime (butcher/grind)"],
    "CarpoToxin": ["Space Carp (butcher meat)", "Koibean (plant)"],
    # RuCM (Russian Marine Corps) — non-craftable fork content.
    # Speed Demon ships only as pills: antag drug dealer loadout
    # (_CMU14/Roles/antags.yml) and the WeyU experiments crate.
    "AU14DrugSpeedDemon": [
        "Antag drug dealer bottle, 5x15u pills (RuCM)",
        "Weyland-Yutani experiments crate (RuCM)",
    ],
    # XenoAlch toxins are injected by the xeno Alchemist strain; the only
    # marine-side source is drawing blood from a poisoned victim.
    "RMCXenoAlchBrute": ["Xeno Alchemist strain (blood draw from victim, RuCM)"],
    "RMCXenoAlchBurn": ["Xeno Alchemist strain (blood draw from victim, RuCM)"],
    "RMCXenoAlchPain": ["Xeno Alchemist strain (blood draw from victim, RuCM)"],
    "RMCXenoAlchFire": ["Xeno Alchemist strain (blood draw from victim, RuCM)"],
    "RMCXenoAlchBloodloss": ["Xeno Alchemist strain (blood draw from victim, RuCM)"],
    "RMCXenoAlchFreeze": ["Xeno Alchemist strain (blood draw from victim, RuCM)"],
    "RMCXenoAlchPurge": ["Xeno Alchemist strain (blood draw from victim, RuCM)"],
    "AbominationVenom": ["Abomination mob venom / clotted syringe (RuCM)"],
    "CMUYautjaBlood": ["Blood draw from Yautja (RuCM)"],
    # Other
    "Nicotine": ["Tobacco (plant)"],
    "THC": ["Cannabis (plant)"],
    "SpaceDrugs": ["Ambrosia Deus (plant)", "Rainbow Cannabis (plant)"],
    "Artifexium": ["Anomaly Berry (plant)"],
    "Egg": ["Eggy (plant)", "Chickens"],
    "Milk": ["Cows", "Lemoon (plant mutation)"],
    "UncookedAnimalProteins": ["Butchered meat"],
    # Non-chemistry sources (Chaplain, special mechanics)
    "Holywater": ["Chaplain's Bible (bless water)","Holy Melon (plant)"],
    "Wine": ["Booze Dispenser", "Chaplain can bless grape juice"],
    "ZombieBlood": ["Zombie mob (blood draw)"],
    "Omnizine": ["Ambrosia Deus (plant)", "Medipen (emergency)"],
    "Enzyme": ["Universal Enzyme bottle (kitchen)"],
    "Fiber": ["Cotton (plant)", "Towercap (plant)"],
    "Oil": ["Chemical Dispenser", "Corn (plant, grind)"],
    "Cream": ["Soda Dispenser", "Milk processing"],
    "Ice": ["Soda Dispenser", "Freezer"],
    # EMAG-only sources (antagonist tools required)
    "Nothing": ["EMAG Solar's Best Hot Drink vending machine"],
    "ChangelingSting": ["EMAG Shambler's Juice vending machine"],
    "NukieCola": ["EMAG Robust Softdrinks vending machine"],
    # D3a honest labels — non-item channels the parser can't see.
    # Species bloods verified against Body/Species/*.yml bloodReferenceSolution
    # (2026-07-12): vox=AmmoniaBlood, moth=InsectBlood, arachnid=CopperBlood.
    "AmmoniaBlood": ["Blood draw: Vox crew (syringe)"],
    "CopperBlood": ["Blood draw: Arachnid crew (syringe)"],
    "InsectBlood": ["Blood draw: Moth crew (syringe)"],
    "Frezon": ["Atmospherics (gas mixing)"],
    "Tritium": ["Atmospherics (plasma burn chamber)"],
    "NitrousOxide": ["Atmospherics (gas mixing)"],
    "MilkGoat": ["Milking goats (mob interaction)"],
    "MilkSheep": ["Milking sheep (mob interaction)"],
}

# Dangerous chemical interactions database
# Key: frozenset of reagent IDs; Value: {type, severity, desc}
DANGEROUS_INTERACTIONS = [
    # === EXPLOSIONS ===
    {"reagents": ["Potassium", "Water"], "type": "explosion", "severity": "lethal",
     "desc": "Instant detonation on contact (0.25 intensity/unit, max 100)"},
    {"reagents": ["JuiceThatMakesYouWeh", "JuiceThatMakesYouHew"], "type": "explosion", "severity": "lethal",
     "desc": "Radioactive explosion (intensity 200, ~3000 dmg)"},
    {"reagents": ["Iron", "Uranium", "Aluminium"], "type": "emp", "severity": "dangerous",
     "desc": "EMP blast (radius 6, 15s duration) — disables electronics"},
    # === RAZORIUM (brute med conflicts) ===
    {"reagents": ["Bicaridine", "Bruizine"], "type": "razorium", "severity": "dangerous",
     "desc": "Creates Razorium — deals brute damage instead of healing"},
    {"reagents": ["Bicaridine", "Lacerinol"], "type": "razorium", "severity": "dangerous",
     "desc": "Creates Razorium — deals brute damage instead of healing"},
    {"reagents": ["Bicaridine", "Puncturase"], "type": "razorium", "severity": "dangerous",
     "desc": "Creates Razorium — deals brute damage instead of healing"},
    {"reagents": ["Bruizine", "Lacerinol"], "type": "razorium", "severity": "dangerous",
     "desc": "Creates Razorium — deals brute damage instead of healing"},
    {"reagents": ["Bruizine", "Puncturase"], "type": "razorium", "severity": "dangerous",
     "desc": "Creates Razorium — deals brute damage instead of healing"},
    {"reagents": ["Puncturase", "Lacerinol"], "type": "razorium", "severity": "dangerous",
     "desc": "Creates Razorium — deals brute damage instead of healing"},
    # === PYROTECHNIC / INCENDIARY ===
    {"reagents": ["Phosphorus", "Potassium", "Sugar"], "type": "smoke", "severity": "depends",
     "desc": "Creates smoke cloud — disperses ALL chemicals in beaker across area"},
    {"reagents": ["Fluorosurfactant", "Water"], "type": "foam", "severity": "depends",
     "desc": "Creates foam — spreads all chemicals on floor, makes surfaces slippery"},
    {"reagents": ["Oil", "WeldingFuel", "Ethanol"], "type": "fire", "severity": "lethal",
     "desc": "Creates Napalm — sticky fire, Heat(2)+Poison(1)+Caustic(0.5)/tick"},
    {"reagents": ["Iron", "Aluminium", "Oxygen", "Hydrogen"], "type": "fire", "severity": "dangerous",
     "desc": "Creates Thermite — FlammableTileReaction (x2 temp) ignites spilled reagent. Deals Heat(2)+Poison(1) on metabolism. Does NOT melt walls in SS14 (that's SS13 folklore)."},
    {"reagents": ["Aluminium", "Potassium", "Sulfur"], "type": "flash", "severity": "dangerous",
     "desc": "Flash Powder — blinds everyone in area"},
    # === TOXIC COMBOS ===
    {"reagents": ["Chlorine", "Phosphorus", "Radium"], "type": "radiation", "severity": "dangerous",
     "desc": "Creates Unstable Mutagen — Radiation(3)/tick, kills plants, irradiates people"},
    {"reagents": ["Fresium", "Water"], "type": "freeze", "severity": "dangerous",
     "desc": "Flash freeze — creates Frezon gas + ice, freezes the area"},
    # === TEMPERATURE WARNINGS ===
    {"reagents": ["Chlorine", "Fluorine"], "type": "explosion", "severity": "lethal",
     "desc": "CLF3 synthesis at >370K — explosion intensity 200. Use shatterproof container only!"},
]

# ═══════════════════════════════════════════════════════════════════
# ANTAG MODE — Curated antagonist utility data
# ═══════════════════════════════════════════════════════════════════

# Curated antag scores + tactical tips for key reagents
# score: 1-10 lethality/utility; tags: vocabulary below; tips: 1-2 sentence advice
# Tag vocabulary: lethal, incapacitating, stealth-poison, area-denial,
#                 explosive, delivery-mechanism, debilitating, utility
ANTAG_DATA = {
    # === LETHAL TOXINS ===
    "Lexorin": {
        "score": 9, "tags": ["lethal", "stealth-poison"],
        "tips": "Rapidly blocks oxygen absorption. 20u in a syringe or drink is lethal. Tasteless in small doses — ideal for covert assassination.",
    },
    "PolytrinicAcid": {
        "score": 9, "tags": ["lethal", "area-denial"],
        "tips": "Extremely corrosive, severe burn damage. Combine with foam for area denial. Visible on contact — not stealthy.",
    },
    "FluorosulfuricAcid": {
        "score": 8, "tags": ["lethal", "area-denial"],
        "tips": "Highly corrosive acid. Similar to Polytrinic but slightly weaker. Good in foam grenades for corridor denial.",
    },
    "SulfuricAcid": {
        "score": 5, "tags": ["lethal"],
        "tips": "Moderate acid damage. Weaker than Polytrinic/Fluorosulfuric but easier to craft (just Hydrogen+Sulfur+Oxygen).",
    },
    "ChlorineTrifluoride": {
        "score": 10, "tags": ["lethal", "area-denial", "explosive"],
        "tips": "The most dangerous chemical. Extreme fire+toxic damage, ignites on contact, melts almost anything. Synthesis requires >370K — WILL EXPLODE if container breaks. Handle with extreme care.",
    },
    "Hemorrhinol": {
        "score": 7, "tags": ["lethal", "stealth-poison"],
        "tips": "Causes internal bleeding. Slow but deadly — victim may not realize they're poisoned until too late. Pairs well with anticoagulants.",
    },
    "Amatoxin": {
        "score": 7, "tags": ["lethal", "stealth-poison"],
        "tips": "Deadly mushroom toxin. No recipe — must obtain from Destroying Angel mushrooms (botany). Very potent in small doses.",
    },
    "Lead": {
        "score": 6, "tags": ["lethal", "stealth-poison"],
        "tips": "(Unobtainable in vanilla SS14 \u2014 no reaction, no plant, no dispenser. Only appears as Licoxide ingredient in Goob/Frontier/Funky forks.) Slow-acting heavy metal poison. Hard to detect, accumulates over time.",
    },
    "CarpoToxin": {
        "score": 6, "tags": ["lethal"],
        "tips": "Space Carp venom. No recipe — obtain from butchered carp meat or Koibeans. Strong poison damage.",
    },
    "Mold": {
        "score": 4, "tags": ["lethal"],
        "tips": "Toxic mold spores. Moderate damage over time. Can be grown in botany and ground.",
    },
    "Romerol": {
        "score": 8, "tags": ["lethal", "area-denial"],
        "tips": "Zombie virus reagent. Injecting into a corpse reanimates it as a hostile zombie. Maximum chaos potential.",
    },

    # === INCAPACITATING ===
    "ChloralHydrate": {
        "score": 9, "tags": ["incapacitating", "stealth-poison"],
        "tips": "Puts target to sleep almost instantly. 15-20u is enough. Combine with a lethal toxin for guaranteed silent kill. The #1 antag chemical.",
    },
    "Nocturine": {
        "score": 8, "tags": ["incapacitating", "stealth-poison"],
        "tips": "Forces target to sleep and stay asleep. Longer duration than Chloral Hydrate. Good for kidnapping or extended incapacitation.",
    },
    "MuteToxin": {
        "score": 6, "tags": ["incapacitating", "utility"],
        "tips": "Silences the victim — they cannot speak or call for help on radio. Combine with other toxins to prevent the target from alerting security.",
    },
    "Impedrezene": {
        "score": 5, "tags": ["debilitating"],
        "tips": "Causes brain damage and confusion. Target becomes disoriented and may wander randomly. Non-lethal disruption.",
    },
    "TearGas": {
        "score": 6, "tags": ["incapacitating", "area-denial"],
        "tips": "Causes eye irritation, blurred vision, and slowing. Excellent in smoke grenades for area denial and crowd control.",
    },
    "Pax": {
        "score": 5, "tags": ["incapacitating", "utility"],
        "tips": "Pacification drug — target cannot attack anyone. Inject into security officers to neutralize them non-lethally.",
    },
    "Tazinide": {
        "score": 7, "tags": ["incapacitating", "lethal"],
        "tips": "Electrifying mixture that disrupts movement and causes shock damage. Target is slowed and stunned periodically. Also toxic.",
    },
    "Mechanotoxin": {
        "score": 5, "tags": ["debilitating"],
        "tips": "Causes progressive paralysis. Target loses limb function gradually. Non-lethal but very disabling.",
    },

    # === AREA DENIAL / PYROTECHNIC ===
    "Napalm": {
        "score": 8, "tags": ["lethal", "area-denial"],
        "tips": "Sticky fire that persists. Combines heat, poison, and caustic damage. Use with foam for fire corridors. Recipe: Oil+WeldingFuel+Ethanol.",
    },
    "Phlogiston": {
        "score": 7, "tags": ["area-denial"],
        "tips": "Sets targets on fire. Use in smoke grenades to ignite everyone in the area. Does not do direct damage — the fire does.",
    },
    "Thermite": {
        "score": 4, "tags": ["area-denial"],
        "tips": "Tile: Ignites spilled reagent via FlammableTileReaction (x2 temperature). Metabolism (Bloodstream): Heat 2 + Poison 1. Does NOT melt walls in SS14 \u2014 the wall-breach use is SS13 legacy folklore, not present in any SS14 fork YAML.",
    },
    "Fluorosurfactant": {
        "score": 7, "tags": ["delivery-mechanism", "area-denial"],
        "tips": "Creates foam when mixed with water. The foam carries ALL other chemicals in the beaker. Key ingredient for chemical foam grenades.",
    },
    "FoamingAgent": {
        "score": 5, "tags": ["delivery-mechanism"],
        "tips": "Creates metal foam with iron/aluminium. Used in metal foam grenades to seal corridors or trap people.",
    },

    # === HALLUCINOGENS / PSYCHOLOGICAL ===
    "MindbreakerToxin": {
        "score": 5, "tags": ["debilitating"],
        "tips": "Potent hallucinogen. Target sees fake entities and events. Causes confusion and paranoia. Non-lethal psychological warfare.",
    },
    "HeartbreakerToxin": {
        "score": 7, "tags": ["lethal", "debilitating"],
        "tips": "Hallucinogen that also blocks respiratory signals, causing asphyxiation. More dangerous than MindbreakerToxin — can kill.",
    },
    "SpaceDrugs": {
        "score": 3, "tags": ["debilitating"],
        "tips": "Causes hallucinations and stumbling. Low threat but good for distraction. Available from Ambrosia plants.",
    },

    # === SUBTLE / SLOW POISONS ===
    "Histamine": {
        "score": 6, "tags": ["lethal", "stealth-poison"],
        "tips": "Causes allergic reaction. Low doses: itching and rashes. High doses (overdose): lethal anaphylaxis. Hard to trace as a cause of death.",
    },
    "Licoxide": {
        "score": 6, "tags": ["lethal", "stealth-poison"],
        "tips": "Slow-acting toxic compound. Accumulates damage over time. Good for long-term covert poisoning operations.",
    },
    "GastroToxin": {
        "score": 5, "tags": ["debilitating", "stealth-poison"],
        "tips": "Causes severe nausea and vomiting. Target drops items and can't eat/drink. Good for disruption without killing.",
    },
    "Lipolicide": {
        "score": 4, "tags": ["debilitating"],
        "tips": "Breaks down fat tissue, causing hunger and weakness. Slow-acting. More of a nuisance than a threat.",
    },
    "Fresium": {
        "score": 6, "tags": ["area-denial"],
        "tips": "Creates extreme cold. Mixed with water causes flash-freeze. Can freeze pipes and create ice hazards.",
    },

    # === DELIVERY ENABLERS ===
    "WeldingFuel": {
        "score": 4, "tags": ["utility"],
        "tips": "Flammable base chemical. Component of Napalm. Also used in Acetone synthesis. Available from dispensers.",
    },
    "UnstableMutagen": {
        "score": 6, "tags": ["area-denial"],
        "tips": "Irradiates everything nearby. Use in smoke for area radiation contamination. Also mutates plants in botany.",
    },
    "Ephedrine": {
        "score": 4, "tags": ["utility"],
        "tips": "Stimulant — gives speed boost and reduces stun time. Self-buff before combat. Component of meth.",
    },
    "Desoxyephedrine": {
        "score": 5, "tags": ["utility"],
        "tips": "Space Meth — extreme speed boost but causes jitteriness and brain damage at high doses. High risk, high reward self-buff.",
    },
    "AU14DrugSpeedDemon": {
        "score": 5, "tags": ["utility"],
        "tips": "RuCM street drug: +30% walk / +34% sprint speed and purges Chloral Hydrate 10u/tick while metabolizing. NOT craftable — comes only as 15u pills (antag drug dealer bottle, WeyU experiments crate). Overdose at 15u, poison damage stacks past 40u: one pill at a time.",
        "sources": ["code-rucm-speed-demon", "code-rucm-speed-demon-sources"],
    },
    "Nothing": {
        "score": 3, "tags": ["utility"],
        "tips": "A mysterious reagent. Only obtainable from EMAG'd Solar's Best vending machine. Effects unknown — experimental.",
    },
    "ChangelingSting": {
        "score": 4, "tags": ["utility"],
        "tips": "Only from EMAG'd Shambler's Juice machine. Changeling-themed reagent with unique effects.",
    },

    # === EXPLOSIVES (reagent components) ===
    "Potassium": {
        "score": 8, "tags": ["explosive"],
        "tips": "Explodes on contact with Water. Classic antag weapon: put both in a grenade or throw a beaker. 0.25 intensity per unit, max 100.",
    },
    "Plasma": {
        "score": 3, "tags": ["utility"],
        "tips": "Flammable gas. Can be released to cause fires. Component in many recipes. Available from dispensers.",
    },
}

# ─────────────────────────────────────────────
# Shift-start presets (ROADMAP A2)
# One-click starter batches for the Batch Planner — peaceful counterpart to
# ANTAG_STRATEGIES, same provenance model (every entry carries sources).
# tier: "newbie" (safe shift-opening set) | "meta" (experienced second wave).
# Reagent ids are validated against extracted reagents at build time; invalid
# ids are dropped with a warning so a typo can't ship a broken preset.
# ─────────────────────────────────────────────
SHIFT_PRESETS = [
    {
        "id": "med-chem-starter",
        "name": "Med-Chem Starter",
        "role": "chemist",
        "tier": "newbie",
        "desc": "Classic shift-opening batch: brute/burn/tox coverage plus a crit stabilizer.",
        "reagents": [
            {"id": "Bicaridine", "amount": 90},
            {"id": "Kelotane", "amount": 90},
            {"id": "Dylovene", "amount": 90},
            {"id": "Epinephrine", "amount": 30},
        ],
        "sources": ["mk-shift-presets"],
    },
    {
        "id": "med-chem-advanced",
        "name": "Advanced Meds",
        "role": "chemist",
        "tier": "meta",
        "desc": "Second wave once basics are stocked: stronger burn care, airloss, radiation, cellular damage and body-temp stabilization.",
        "reagents": [
            {"id": "Dermaline", "amount": 60},
            {"id": "DexalinPlus", "amount": 60},
            {"id": "Hyronalin", "amount": 30},
            {"id": "Leporazine", "amount": 30},
            {"id": "Phalanximine", "amount": 30},
        ],
        "sources": ["mk-shift-presets"],
    },
    {
        "id": "botany-kit",
        "name": "Botany Kit",
        "role": "botanist",
        "tier": "newbie",
        "desc": "Grow-room chemistry: nutrients, yield booster, controlled mutations and weed control.",
        "reagents": [
            {"id": "EZNutrient", "amount": 60},
            {"id": "RobustHarvest", "amount": 60},
            {"id": "UnstableMutagen", "amount": 30},
            {"id": "Left4Zed", "amount": 30},
            {"id": "PlantBGone", "amount": 30},
        ],
        "sources": ["mk-shift-presets"],
    },
    {
        "id": "bar-prep",
        "name": "Bar Prep",
        "role": "bartender",
        "tier": "newbie",
        "desc": "Mixable bases to open the bar: soft-drink stock, ice and house vodka.",
        "reagents": [
            {"id": "Cola", "amount": 60},
            {"id": "SodaWater", "amount": 60},
            {"id": "Ice", "amount": 30},
            {"id": "Vodka", "amount": 30},
        ],
        "sources": ["mk-shift-presets"],
    },
]

# ─────────────────────────────────────────────
# Species physiology (ROADMAP D2)
# Curated layer (amber tier): breathing + quirks per playable species.
# The per-reagent organ conditions ("if organ: Moth") are YAML-extracted
# separately (green tier) — this dict only covers what body prototypes
# would tell us if they were in the extraction manifest.
# ─────────────────────────────────────────────
SPECIES_DATA = {
    "Human": {
        "name": "Human", "breathes": "oxygen", "toxicGas": None,
        "note": "Baseline physiology — all standard medicine applies.",
    },
    "Dwarf": {
        "name": "Dwarf", "breathes": "oxygen", "toxicGas": None,
        "note": "Human-like; notably resistant to alcohol.",
    },
    "Slime": {
        "name": "Slime person", "breathes": "oxygen", "toxicGas": None,
        "note": "Slime metabolism — several reagents behave differently (see per-reagent organ notes).",
    },
    "Vox": {
        "name": "Vox", "breathes": "nitrogen", "toxicGas": "oxygen",
        "note": "Breathes NITROGEN; oxygen is toxic to them — avoid oxygen-based breathing meds; internals with N2 required off-station.",
    },
    "Diona": {
        "name": "Diona", "breathes": "oxygen", "toxicGas": None,
        "note": "Plant-based multi-organ physiology; regenerates in light, several meds metabolize oddly.",
    },
    "Moth": {
        "name": "Moth person", "breathes": "oxygen", "toxicGas": None,
        "note": "Insectoid — pesticides (e.g. Bug Spray) poison them; can eat cloth.",
    },
    "Arachnid": {
        "name": "Arachnid", "breathes": "oxygen", "toxicGas": None,
        "note": "Insectoid physiology; web-related interactions.",
    },
    "Reptilian": {
        "name": "Reptilian", "breathes": "oxygen", "toxicGas": None,
        "note": "Cold-sensitive; temperature meds matter more.",
    },
}
SPECIES_GUIDE_SOURCES = ["mk-species-guide"]

# ─────────────────────────────────────────────
# Botany swab / mutation guide (ROADMAP D1)
# The HOW of cross-pollination lives in C# code, so this layer is curated
# (amber "community knowledge" tier), while the mutation graph itself is
# YAML-extracted (green tier). Same provenance model as everything curated.
# ─────────────────────────────────────────────
BOTANY_GUIDE = {
    "title": "Swabs & mutations — how the evolution chart works",
    "tier": "community",
    "sources": ["mk-botany-guide"],
    "sections": [
        {
            "h": "Species mutations (the arrows in the chart)",
            "body": "Raise a plant's mutation level — most reliably by dosing the tray with Unstable Mutagen (~1-5u; more risks killing the plant) — and on the next growth ticks the plant may jump to one of its listed mutation targets. Only species with arrows here can jump; the targets come straight from the game's seed data.",
        },
        {
            "h": "Swabs (cross-pollination)",
            "body": "Use a gauze swab on flowering plant A to collect its pollen, then swab plant B: B's next generation mixes STATS (potency, yield, lifespan, harvest type, chemicals) between the two. Swabs shuffle traits — they do NOT trigger the species jumps shown in the chart.",
        },
        {
            "h": "Practical loop",
            "body": "1) Mutagen small doses until the species you want appears. 2) Stabilize: harvest, replant the mutated seeds. 3) Swab-breed your best specimens to stack potency/yield onto the new species. 4) Robust Harvest boosts potency; seedless traits need the clippers workaround.",
        },
    ],
}

# Pre-built antagonist strategies/combos
ANTAG_STRATEGIES = [
    {
        "id": "silent-kill",
        "name": "Silent Kill",
        "desc": "Classic assassination. Chloral Hydrate puts target to sleep, Lexorin finishes them via asphyxiation. No noise, no evidence.",
        "reagents": [{"id": "ChloralHydrate", "amount": 15}, {"id": "Lexorin", "amount": 15}],
        "method": "Syringe or hypospray injection",
        "difficulty": "easy",
        "stealth": "high",
        "sources": ["code-chemicals-chloral", "mk-general-antag-playtime"],
    },
    {
        "id": "area-denial-acid",
        "name": "Acid Foam",
        "desc": "Fluorosurfactant + Water creates foam that carries Polytrinic Acid across a wide area. Devastating corridor denial.",
        "reagents": [{"id": "PolytrinicAcid", "amount": 20}, {"id": "Fluorosurfactant", "amount": 10}, {"id": "Water", "amount": 10}],
        "method": "Foam grenade or beaker mix",
        "difficulty": "medium",
        "stealth": "low",
        "sources": ["mk-general-antag-playtime"],
    },
    {
        "id": "mass-explosion",
        "name": "Mass Chaos",
        "desc": "Potassium + Water = instant detonation. Put maximum amounts in a two-chamber grenade for a devastating explosion.",
        "reagents": [{"id": "Potassium", "amount": 50}, {"id": "Water", "amount": 50}],
        "method": "Grenade (two-chamber)",
        "difficulty": "easy",
        "stealth": "low",
        "sources": ["code-reagents-potassium-water"],
    },
    {
        "id": "smoke-toxin",
        "name": "Toxic Smoke",
        "desc": "Smoke reaction (P+K+Sugar) disperses ALL beaker contents as gas. Add any lethal toxin for area-of-effect killing.",
        "reagents": [{"id": "Phosphorus", "amount": 5}, {"id": "Potassium", "amount": 5}, {"id": "Sugar", "amount": 5}, {"id": "Lexorin", "amount": 15}],
        "method": "Mix in beaker — triggers automatically",
        "difficulty": "medium",
        "stealth": "medium",
        "sources": ["mk-general-antag-playtime"],
    },
    {
        "id": "fire-foam",
        "name": "Fire & Forget",
        "desc": "Napalm carried by foam creates persistent fire corridors. Targets are set on fire with sticky napalm that's hard to extinguish.",
        "reagents": [{"id": "Napalm", "amount": 20}, {"id": "Fluorosurfactant", "amount": 10}, {"id": "Water", "amount": 10}],
        "method": "Foam grenade",
        "difficulty": "hard",
        "stealth": "low",
        "sources": ["mk-general-antag-playtime"],
    },
    {
        "id": "slow-poison",
        "name": "Slow Poisoning",
        "desc": "Histamine overdose hidden in food/drink. Derived from Nettle plant (Botany cooperation). Allergic reaction deaths look natural — hard to trace. Lead would also work but is unobtainable in vanilla SS14.",
        "reagents": [{"id": "Histamine", "amount": 25}],
        "method": "Food or drink contamination",
        "difficulty": "expert",
        "stealth": "high",
        "sources": ["forum-gobby-killmix-2026", "code-reagents-lead", "mk-general-antag-playtime"],
    },
    {
        "id": "sedation-ambush",
        "name": "Sedation Ambush",
        "desc": "Double sedative combo. Chloral Hydrate for fast sleep + Nocturine to keep them down. Ideal for kidnapping.",
        "reagents": [{"id": "ChloralHydrate", "amount": 15}, {"id": "Nocturine", "amount": 15}],
        "method": "Syringe injection, then restrain",
        "difficulty": "easy",
        "stealth": "medium",
        "sources": ["code-chemicals-chloral", "mk-general-antag-playtime"],
    },
    {
        "id": "flash-grab",
        "name": "Flash & Grab",
        "desc": "Flash Powder (Al+K+S) blinds everyone in an area. Use for smash-and-grab operations or escape cover.",
        "reagents": [{"id": "Aluminium", "amount": 10}, {"id": "Potassium", "amount": 10}, {"id": "Sulfur", "amount": 10}],
        "method": "Mix in thrown beaker",
        "difficulty": "easy",
        "stealth": "low",
        "sources": ["mk-general-antag-playtime"],
    },
    {
        "id": "floor-pry",
        "name": "Floor Breach (CLF3)",
        "desc": "Myth-buster: SS14 chemistry has NO wall-melting mechanic \u2014 the classic Thermite wall-breach is SS13 folklore. The only structural-damage tile reaction in SS14 chemistry is CLF3's PryTileReaction (pyrotechnic.yml:109). Spilling Chlorine Trifluoride pries floor tiles open \u2014 useful for breaching into subfloor pipes or lower decks. Extremely dangerous to the user.",
        "reagents": [{"id": "ChlorineTrifluoride", "amount": 20}],
        "method": "Splash or foam-deploy on target floor tile",
        "difficulty": "hard",
        "stealth": "low",
        "sources": ["code-pyro-clf3-prytile", "forum-testicular-thermite-walls-2026", "forum-steelclaw-thermite-forks-2026", "code-pyro-thermite"],
    },
    {
        "id": "radiation-zone",
        "name": "Radiation Zone",
        "desc": "Unstable Mutagen in smoke creates a radiation contamination zone. Everyone in the area takes radiation damage over time.",
        "reagents": [{"id": "Phosphorus", "amount": 5}, {"id": "Potassium", "amount": 5}, {"id": "Sugar", "amount": 5}, {"id": "UnstableMutagen", "amount": 15}],
        "method": "Smoke bomb (auto-triggers)",
        "difficulty": "medium",
        "stealth": "medium",
        "sources": ["mk-general-antag-playtime"],
    },
    {
        "id": "clf3-armageddon",
        "name": "CLF3 Armageddon",
        "desc": "Chlorine Trifluoride — the ultimate SS14 destruction chemical. Unique PryTileReaction pries floor tiles when spilled (pyrotechnic.yml:109). Bloodstream deals Heat(2)+Poison(1)+Caustic(0.5); Flammable on touch with scream/popup reactions. Does NOT melt walls. Synthesize above 370K in a shatterproof container or it WILL explode in your hands.",
        "reagents": [{"id": "ChlorineTrifluoride", "amount": 30}],
        "method": "Splash, foam, or suicide bomb",
        "difficulty": "hard",
        "stealth": "low",
        "sources": ["code-pyro-clf3-prytile", "mk-general-antag-playtime"],
    },
    {
        "id": "silence-and-kill",
        "name": "Silence & Kill",
        "desc": "Mute Toxin prevents target from calling for help on radio. Combined with Lexorin for a kill they can't report.",
        "reagents": [{"id": "MuteToxin", "amount": 10}, {"id": "Lexorin", "amount": 20}],
        "method": "Syringe injection",
        "difficulty": "medium",
        "stealth": "high",
        "sources": ["mk-general-antag-playtime"],
    },
    # ── Increment J: 8 new strategies (2026-04-21) ───────────────────
    # Each one introduces a mechanic absent from the first 12. Sources are
    # dual-verified: researcher agent cited line ranges, independent agent
    # refetched raw.githubusercontent.com and confirmed IDs/effects/recipes.
    {
        "id": "zombie-outbreak",
        "name": "Zombie Outbreak",
        "desc": "Romerol injection (min 5u) triggers CauseZombieInfection — the target turns and attacks others, snowballing the infection station-wide. Works on corpses too. Romerol is Syndicate-uplink-only; no chem recipe exists in any reaction YAML.",
        "reagents": [{"id": "Romerol", "amount": 5}],
        "method": "Syringe injection (uplink-acquired)",
        "difficulty": "hard",
        "stealth": "high",
        "sources": ["code-toxins-romerol", "mk-general-antag-playtime"],
    },
    {
        "id": "bleed-drip",
        "name": "Bleed Drip",
        "desc": "Hemorrhinol inflicts StatusEffectHemorrhage (7 bleed ticks, 21s) plus ModifyBleed 0.5 — the target drops a visible trail of blood and slowly exsanguinates. Recipe needs Razorium from the Caninase-Felinase reaction, so Botany cooperation for banana/lime juice is required.",
        "reagents": [{"id": "Hemorrhinol", "amount": 10}],
        "method": "Syringe injection or drink spike",
        "difficulty": "medium",
        "stealth": "medium",
        "sources": ["code-toxins-hemorrhinol", "code-medicine-hemorrhinol-recipe"],
    },
    {
        "id": "tazinide-tase",
        "name": "Tazinide Tase",
        "desc": "Tazinide electrocutes the target every metabolism tick (50% probability) — effectively chain-stuns through armor that would block a stun baton. Recipe is Licoxide + Vestine. Licoxide in vanilla is Lithium + Zinc (NOT Lead-dependent despite the name); Vestine requires Ambrosia/Nettle plant mutation chains.",
        "reagents": [{"id": "Tazinide", "amount": 5}],
        "method": "Syringe injection or soak a melee weapon",
        "difficulty": "expert",
        "stealth": "low",
        "sources": ["code-toxins-tazinide"],
    },
    {
        "id": "stim-super-soldier",
        "name": "Stim Super-Soldier",
        "desc": "Self-buff stack for the antag. Stimulants grant 1.25x speed, purge ChloralHydrate/Knockdown/Sleep, and adrenaline-ignores slow-on-damage; Dexalin prevents asphyxiation during the sprint; Tricordrazine heals Brute+Burn. Turns a fragile traitor into a 30-second rampage threat. Requires Stimulants synthesis at 370K (heater setup).",
        "reagents": [{"id": "Stimulants", "amount": 5}, {"id": "Dexalin", "amount": 5}, {"id": "Tricordrazine", "amount": 10}],
        "method": "Self-pill or pre-mixed syringe",
        "difficulty": "medium",
        "stealth": "high",
        "sources": ["code-narcotics-stimulants", "code-chemicals-stimulants-recipe"],
    },
    {
        "id": "tear-gas-smoke",
        "name": "Tear Gas Cloud",
        "desc": "Smoke carrier (P+K+Sugar) disperses TearGas across a wide area — TemporaryBlindness (min 4u), Cough emote spam, 0.65x movement slow. Non-lethal crowd control ideal for disrupting a Sec response or breaking line of sight during extraction. TearGas is Security-department access in vanilla.",
        "reagents": [{"id": "Phosphorus", "amount": 5}, {"id": "Potassium", "amount": 5}, {"id": "Sugar", "amount": 5}, {"id": "TearGas", "amount": 10}],
        "method": "Smoke grenade (auto-triggers in beaker)",
        "difficulty": "medium",
        "stealth": "low",
        "sources": ["code-narcotics-teargas", "mk-general-antag-playtime"],
    },
    {
        "id": "happy-honk-chaos",
        "name": "Happy Honk Chaos",
        "desc": "Spike a bar cocktail with Happiness + Honk. Target is forced to Laugh/Whistle/Honk uncontrollably with force: true, spamming global chat and jamming radio channels. Pax-style popups prevent combat. A non-damaging social disruption weapon — perfect distraction while the actual crime unfolds elsewhere.",
        "reagents": [{"id": "Happiness", "amount": 20}, {"id": "Honk", "amount": 10}],
        "method": "Food or drink contamination",
        "difficulty": "easy",
        "stealth": "high",
        "sources": ["code-narcotics-happiness", "code-toxins-honk"],
    },
    {
        "id": "feline-canine-rad-bomb",
        "name": "Felinase/Caninase Rad Bomb",
        "desc": "Two-chamber grenade with Felinase + Caninase triggers CaninaseFelinaseReaction — a Radioactive explosion (maxIntensity 5) AND produces Razorium 2 as byproduct, which can be used in a Hemorrhinol follow-up. Deeply nested recipe chain (Haloperidol, Psicodine, CarpoToxin/Happiness, Enzyme) — cross-dept with Kitchen (enzyme), Mobs (carp), and Botany.",
        "reagents": [{"id": "Felinase", "amount": 10}, {"id": "Caninase", "amount": 10}],
        "method": "Grenade (two-chamber)",
        "difficulty": "expert",
        "stealth": "low",
        "sources": ["code-fun-feline-canine"],
    },
    {
        "id": "thermite-breach",
        "name": "Thermite Door Breach",
        "desc": "Contrary to SS13 folklore, Thermite in SS14 does NOT melt walls — but its FlammableTileReaction with x2 temperature multiplier can burn through airlock doors over time. Recipe is pure dispenser: Iron 1 + Aluminium 1 + Oxygen 1 → Thermite 3. Safer infiltration alternative to ChlorineTrifluoride (see floor-pry / clf3-armageddon).",
        "reagents": [{"id": "Thermite", "amount": 30}],
        "method": "Spray bottle or splash on target door",
        "difficulty": "easy",
        "stealth": "medium",
        "sources": ["code-pyro-thermite", "code-chemicals-thermite-recipe", "forum-testicular-thermite-walls-2026"],
    },
    {
        "id": "speed-demon-pills",
        "name": "Speed Demon Pills (RuCM)",
        "desc": "Russian Marine Corps exclusive self-buff. The Speed Demon street drug gives +30% walk / +34% sprint speed while it metabolizes (0.4u/tick, ~37s per 15u pill) and strips Chloral Hydrate 10u/tick — a walking sedation counter. It CANNOT be synthesized: no reaction exists in the fork's chemistry. Known sources are the antag drug dealer's labeled bottle (5x15u pills) and the Weyland-Yutani experiments crate. Overdose at 15u and poison damage past 40u in the bloodstream — swallow one pill at a time, never stack.",
        "reagents": [{"id": "AU14DrugSpeedDemon", "amount": 15}],
        "method": "Pill (acquired, not crafted)",
        "difficulty": "easy",
        "stealth": "high",
        "sources": ["code-rucm-speed-demon", "code-rucm-speed-demon-sources", "code-rucm-weyu-crate"],
    },
]

# Delivery mechanisms — containers and methods for deploying chemicals
DELIVERY_MECHANISMS = {
    "Syringe": {
        "capacity": 15, "method": "inject", "stealth": "low",
        "sprite": "syringe",
        "desc": "Direct injection — target sees attacker and gets a combat log message. 15u capacity.",
    },
    "Hypospray": {
        "capacity": 30, "method": "inject", "stealth": "medium",
        "sprite": "hypospray",
        "desc": "Silent injection, no combat message to bystanders. 30u capacity. Requires CMO/medical access.",
    },
    "SmokeBomb": {
        "capacity": None, "method": "area", "stealth": "medium",
        "sprite": "smoke-grenade",
        "desc": "Phosphorus+Potassium+Sugar reaction disperses ALL beaker chemicals as smoke cloud covering a wide area.",
    },
    "FoamGrenade": {
        "capacity": None, "method": "area", "stealth": "low",
        "sprite": "grenade",
        "desc": "Fluorosurfactant+Water creates foam carrying all other chemicals. Spreads on floor, makes surfaces slippery.",
    },
    "Food": {
        "capacity": None, "method": "ingest", "stealth": "high",
        "sprite": None,
        "desc": "Inject reagents into food items. Target consumes voluntarily — zero suspicion if undetected.",
    },
    "Drink": {
        "capacity": None, "method": "ingest", "stealth": "high",
        "sprite": None,
        "desc": "Slip reagents into existing drinks. Flavor may give it away — use tasteless chemicals for best results.",
    },
    "Pill": {
        "capacity": 50, "method": "ingest", "stealth": "medium",
        "sprite": "pill",
        "desc": "Pill capsule holding up to 50u. Can be color-matched to look like medicine. Victim must swallow.",
    },
    "Beaker": {
        "capacity": 50, "method": "splash", "stealth": "low",
        "sprite": "beaker",
        "desc": "Standard beaker (50u). Throw at target to splash contents. Visible and obvious attack.",
    },
    "LargeBeaker": {
        "capacity": 100, "method": "splash", "stealth": "low",
        "sprite": "large-beaker",
        "desc": "Large beaker (100u). More capacity for bigger splash area.",
    },
    "BluespaceBeaker": {
        "capacity": 300, "method": "splash", "stealth": "low",
        "sprite": "bluespace-beaker",
        "desc": "Bluespace beaker (300u). Enormous capacity — enough chemicals for a devastating attack.",
    },
}

# Syndicate/antagonist-specific items from the traitor uplink
SYNDICATE_ITEMS = {
    "SyndicateHypospray": {
        "cost": "2 TC", "capacity": 25,
        "sprite": "syndihypo",
        "desc": "Looks like a normal hypospray but is a Syndicate tool. Silent injection, 25u capacity. Available from traitor uplink.",
    },
    "Telecrystal": {
        "cost": "uplink currency", "capacity": None,
        "sprite": "telecrystal",
        "desc": "Currency for the traitor uplink. Spend on tools, weapons, and equipment. Not a chemical delivery device.",
    },
}

# Sprite manifest — RSI assets to extract from SS14 repo
# rsi: path relative to Resources/Textures/ on GitHub
# state: sprite state name from meta.json
SPRITE_MANIFEST = [
    {"id": "beaker",           "rsi": "Objects/Specific/Chemistry/beaker.rsi",       "state": "beaker"},
    {"id": "large-beaker",     "rsi": "Objects/Specific/Chemistry/beaker_large.rsi", "state": "beakerlarge"},
    {"id": "bluespace-beaker", "rsi": "Objects/Specific/Chemistry/beaker_bluespace.rsi", "state": "beakerbluespace"},
    {"id": "syringe",          "rsi": "Objects/Specific/Chemistry/syringe.rsi",      "state": "syringe_base0"},
    {"id": "pill",             "rsi": "Objects/Specific/Chemistry/pills.rsi",        "state": "pill"},
    {"id": "bottle",           "rsi": "Objects/Specific/Chemistry/bottle.rsi",       "state": "bottle"},
    {"id": "dropper",          "rsi": "Objects/Specific/Chemistry/dropper.rsi",      "state": "dropper"},
    {"id": "jug",              "rsi": "Objects/Specific/Chemistry/jug.rsi",          "state": "icon_empty"},
    {"id": "hypospray",        "rsi": "Objects/Specific/Medical/hypospray.rsi",      "state": "hypo"},
    {"id": "syndihypo",        "rsi": "Objects/Specific/Medical/syndihypo.rsi",      "state": "hypo"},
    {"id": "medipen",          "rsi": "Objects/Specific/Medical/medipen.rsi",        "state": "medipen"},
    {"id": "grenade",          "rsi": "Objects/Weapons/Grenades/grenade.rsi",        "state": "icon"},
    {"id": "smoke-grenade",    "rsi": "Objects/Weapons/Grenades/smoke.rsi",          "state": "icon"},
    {"id": "flashbang",        "rsi": "Objects/Weapons/Grenades/flashbang.rsi",      "state": "icon"},
    {"id": "telecrystal",      "rsi": "Objects/Specific/Syndicate/telecrystal.rsi",  "state": "telecrystal"},
]

# Category -> Excel sheet name mapping
CATEGORY_SHEET_MAP = {
    "Elements": "Elements",
    "Medicine": "Medicine",
    "Chemicals": "Chemicals",
    "Toxins": "Toxins",
    "Narcotics": "Narcotics",
    "Cleaning": "Cleaning",
    "Pyrotechnic": "Pyrotechnic",
    "Gases": "Gases",
    "Botany": "Botany",
    "Biological": "Biological",
    "Fun": "Fun",
    "Alcohol": "Drinks (Alcoholic)",
    "Drinks": "Drinks (Non-Alc)",
    "Juice": "Drinks (Non-Alc)",
    "Soda": "Drinks (Non-Alc)",
    "Food": "Food & Condiments",
    "Condiments": "Food & Condiments",
    "Ingredients": "Food & Condiments",
    "Materials": "Materials",
    "Glass": "Materials",
    "Metals": "Materials",
    "Ores": "Materials",
}

# ── Maps tab (ss14_map_extractor.py) ──
# gameMap ids to hide even though they pass MIN_MAP_ITEMS: admin/debug maps
# that are full stations but not player-spawnable. (Junk/empty maps are dropped
# data-drivenly by MIN_MAP_ITEMS, so this is only the semantic exceptions.)
MAP_BLOCKLIST: dict[str, list[str]] = {
    "vanilla": ["CentComm", "Dev"],   # central command + debug map
}
