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

FORK_REGISTRY = {
    # ── Vanilla SS14 (upstream) ──
    "vanilla": {
        "name": "Vanilla SS14",
        "repo": "space-wizards/space-station-14",
        "branch": "master",
        "raw_url": "https://raw.githubusercontent.com/space-wizards/space-station-14/master/{path}",
        "custom_dir": None,
        "color": "#22c55e",
        "reagent_files": [
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
        ],
        "reaction_files": [
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
        ],
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
            "Resources/Locale/en-US/ss14-entities/objects/specific/hydroponics/seeds.ftl",
        ],
        "blocked_reactions": set(),
        "modified_reactions": {},
        "dispenser_chemicals": {
            "Aluminium", "Carbon", "Chlorine", "Copper", "Ethanol", "Fluorine",
            "Hydrogen", "Iodine", "Iron", "Lithium", "Mercury", "Nitrogen",
            "Oxygen", "Phosphorus", "Plasma", "Potassium", "Radium", "Silicon",
            "Silver", "Sodium", "Sulfur", "Sugar", "Water", "WeldingFuel", "Oil",
        },
    },

    # ── RMC14 ──
    "rmc14": {
        "name": "RMC14",
        "repo": "RMC-14/RMC-14",
        "branch": "master",
        "raw_url": "https://raw.githubusercontent.com/RMC-14/RMC-14/master/{path}",
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
        "seed_files": [],
        "botany_locale_files": [],
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

    # ── Goob Station ──
    "goob": {
        "name": "Goob Station",
        "repo": "Goob-Station/Goob-Station",
        "branch": "master",
        "raw_url": "https://raw.githubusercontent.com/Goob-Station/Goob-Station/master/{path}",
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
        ],
        "reaction_files": [
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
        "seed_files": [],
        "botany_locale_files": [],
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
        "dispenser_chemicals": set(),
        "vanilla_override_reaction_files": VANILLA_REACTION_PATHS,
    },

    # ── Starlight ──
    "starlight": {
        "name": "Starlight",
        "repo": "fskx/starlight-ss14",
        "branch": "Starlight",
        "raw_url": "https://raw.githubusercontent.com/fskx/starlight-ss14/Starlight/{path}",
        "custom_dir": "_Starlight",
        "color": "#facc15",
        "reagent_files": [
            "Resources/Prototypes/_Starlight/Reagents/biological.yml",
            "Resources/Prototypes/_Starlight/Reagents/cantrips.yml",
            "Resources/Prototypes/_Starlight/Reagents/cleaning.yml",
            "Resources/Prototypes/_Starlight/Reagents/fun.yml",
            "Resources/Prototypes/_Starlight/Reagents/medicine.yml",
            "Resources/Prototypes/_Starlight/Reagents/xenobiology.yml",
        ],
        "reaction_files": [
            "Resources/Prototypes/_Starlight/Recipes/Reactions/cleaning.yml",
            "Resources/Prototypes/_Starlight/Recipes/Reactions/drinks.yml",
            "Resources/Prototypes/_Starlight/Recipes/Reactions/food.yml",
            "Resources/Prototypes/_Starlight/Recipes/Reactions/fun.yml",
            "Resources/Prototypes/_Starlight/Recipes/Reactions/medicine.yml",
            "Resources/Prototypes/_Starlight/Recipes/Reactions/xenobiology.yml",
        ],
        "locale_files": [],
        "seed_files": [],
        "botany_locale_files": [],
        "blocked_reactions": {
            "Heparin",  # Replaced by Warfarin in Starlight's vanilla medicine.yml override
        },
        "modified_reactions": {
            "Hemorrhinol": "Uses Warfarin instead of Heparin as reactant",
            # NOTE: Starlight adds Necrosol & Warfarin reactions in vanilla medicine.yml path
            # (not in _Starlight/) — parser limitation, these won't be auto-detected
        },
        "dispenser_chemicals": set(),
        "vanilla_override_reaction_files": VANILLA_REACTION_PATHS,
    },

    # ── Delta-V ──
    "deltav": {
        "name": "Delta-V",
        "repo": "DeltaV-Station/Delta-v",
        "branch": "master",
        "raw_url": "https://raw.githubusercontent.com/DeltaV-Station/Delta-v/master/{path}",
        "custom_dir": "_DV",
        "color": "#3b82f6",
        "reagent_files": [
            "Resources/Prototypes/_DV/Reagents/biological.yml",
            "Resources/Prototypes/_DV/Reagents/fun.yml",
            "Resources/Prototypes/_DV/Reagents/medicine.yml",
            "Resources/Prototypes/_DV/Reagents/Consumable/Drink/alcohol.yml",
            "Resources/Prototypes/_DV/Reagents/Consumable/Drink/drinks.yml",
            "Resources/Prototypes/_DV/Reagents/Consumable/Drink/powdered_drinks.yml",
            "Resources/Prototypes/_DV/Reagents/Consumable/Drink/soda.yml",
            "Resources/Prototypes/_DV/Reagents/Materials/materials.yml",
        ],
        "reaction_files": [
            "Resources/Prototypes/_DV/Recipes/Reactions/drinks.yml",
            "Resources/Prototypes/_DV/Recipes/Reactions/food.yml",
            "Resources/Prototypes/_DV/Recipes/Reactions/fun.yml",
            "Resources/Prototypes/_DV/Recipes/Reactions/medicine.yml",
            "Resources/Prototypes/_DV/Recipes/Reactions/powdered_drinks.yml",
            "Resources/Prototypes/_DV/Recipes/Reactions/psionic.yml",
        ],
        "locale_files": [],
        "seed_files": [],
        "botany_locale_files": [],
        "blocked_reactions": set(),
        "modified_reactions": {},
        "dispenser_chemicals": set(),
        "vanilla_override_reaction_files": VANILLA_REACTION_PATHS,
    },

    # ── Dead Space ──
    "deadspace": {
        "name": "Dead Space",
        "repo": "dead-space-server/dead-space-14",
        "branch": "master",
        "raw_url": "https://raw.githubusercontent.com/dead-space-server/dead-space-14/master/{path}",
        "custom_dir": "_DeadSpace",
        "color": "#94a3b8",
        "reagent_files": [
            "Resources/Prototypes/_DeadSpace/Reagents/biological.yml",
            "Resources/Prototypes/_DeadSpace/Reagents/elements.yml",
            "Resources/Prototypes/_DeadSpace/Reagents/narcotics.yml",
            "Resources/Prototypes/_DeadSpace/Reagents/toxins.yml",
        ],
        "reaction_files": [
            "Resources/Prototypes/_DeadSpace/Recipes/Reactions/chemicals.yml",
            "Resources/Prototypes/_DeadSpace/Recipes/Reactions/drinks.yml",
            "Resources/Prototypes/_DeadSpace/Recipes/Reactions/medicine.yml",
        ],
        "locale_files": [],
        "seed_files": [],
        "botany_locale_files": [],
        "blocked_reactions": set(),
        "modified_reactions": {},
        "dispenser_chemicals": set(),
        "vanilla_override_reaction_files": VANILLA_REACTION_PATHS,
    },

    # ── Frontier ──
    "frontier": {
        "name": "Frontier",
        "repo": "new-frontiers-14/frontier-station-14",
        "branch": "master",
        "raw_url": "https://raw.githubusercontent.com/new-frontiers-14/frontier-station-14/master/{path}",
        "custom_dir": "_NF",
        "color": "#fb923c",
        "reagent_files": [
            "Resources/Prototypes/_NF/Reagents/biological.yml",
            "Resources/Prototypes/_NF/Reagents/chemicals.yml",
            "Resources/Prototypes/_NF/Reagents/gases.yml",
            "Resources/Prototypes/_NF/Reagents/medicine.yml",
            "Resources/Prototypes/_NF/Reagents/narcotics.yml",
            "Resources/Prototypes/_NF/Reagents/toxins.yml",
        ],
        "reaction_files": [
            "Resources/Prototypes/_NF/Recipes/Reactions/chemicals.yml",
            "Resources/Prototypes/_NF/Recipes/Reactions/drinks.yml",
            "Resources/Prototypes/_NF/Recipes/Reactions/food.yml",
            "Resources/Prototypes/_NF/Recipes/Reactions/medicine.yml",
        ],
        "locale_files": [],
        "seed_files": [],
        "botany_locale_files": [],
        "blocked_reactions": {
            "Lye",  # Missing from Frontier's vanilla chemicals.yml
        },
        "modified_reactions": {},
        "dispenser_chemicals": set(),
        "vanilla_override_reaction_files": VANILLA_REACTION_PATHS,
    },

    # ── Funky Station (forks from Goob Station) ──
    "funky": {
        "name": "Funky Station",
        "repo": "funky-station/funky-station",
        "branch": "master",
        "raw_url": "https://raw.githubusercontent.com/funky-station/funky-station/master/{path}",
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
        ],
        "reaction_files": [
            "Resources/Prototypes/_Funkystation/Recipes/Reactions/alcohol.yml",
            "Resources/Prototypes/_Funkystation/Recipes/Reactions/drinks.yml",
            "Resources/Prototypes/_Funkystation/Recipes/Reactions/exotic.yml",
            "Resources/Prototypes/_Funkystation/Recipes/Reactions/food.yml",
            "Resources/Prototypes/_Funkystation/Recipes/Reactions/medicine.yml",
            "Resources/Prototypes/_Funkystation/Recipes/Reactions/pyrotechnic.yml",
            "Resources/Prototypes/_Funkystation/Recipes/Reactions/toxins.yml",
        ],
        "locale_files": [],
        "seed_files": [],
        "botany_locale_files": [],
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
        "dispenser_chemicals": set(),
        "vanilla_override_reaction_files": VANILLA_REACTION_PATHS,
    },
}

# ── Backward-compatible aliases (used by extractor during transition) ──
VANILLA_RAW = FORK_REGISTRY["vanilla"]["raw_url"]
RMC14_RAW = FORK_REGISTRY["rmc14"]["raw_url"]
VANILLA_REAGENT_FILES = FORK_REGISTRY["vanilla"]["reagent_files"]
VANILLA_REACTION_FILES = FORK_REGISTRY["vanilla"]["reaction_files"]
VANILLA_LOCALE_FILES = FORK_REGISTRY["vanilla"]["locale_files"]
RMC14_REAGENT_FILES = FORK_REGISTRY["rmc14"]["reagent_files"]
RMC14_REACTION_FILES = FORK_REGISTRY["rmc14"]["reaction_files"]
RMC14_LOCALE_FILES = FORK_REGISTRY["rmc14"]["locale_files"]
VANILLA_SEED_FILES = FORK_REGISTRY["vanilla"]["seed_files"]
VANILLA_BOTANY_LOCALE_FILES = FORK_REGISTRY["vanilla"]["botany_locale_files"]
RMC14_SEED_FILES = FORK_REGISTRY["rmc14"]["seed_files"]
RMC14_BLOCKED_REACTIONS = FORK_REGISTRY["rmc14"]["blocked_reactions"]
RMC14_MODIFIED_REACTIONS = FORK_REGISTRY["rmc14"]["modified_reactions"]

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
}

# Vanilla reactions BLOCKED/REMOVED in RMC14 fork
# These reactions exist in vanilla SS14 but are commented out or deleted in RMC14
RMC14_BLOCKED_REACTIONS = {
    # Medicine (commented or removed)
    "Synaptizine", "Cognizine", "Saline", "Arcryox", "Heparin", "Hemorrhinol",
    # Chemicals (commented or removed)
    "Desoxyephedrine", "Lye",
    # Drinks (replaced or commented)
    "OrangeLimeSoda", "Neurotoxin", "Singulo",
    # Food breakdowns (removed)
    "CookingMustard", "BananaBreakdown", "AllicinBreakdown", "NutrimentBreakdown",
    "FatBreakdown", "UncookedAnimalProteinBreakdown", "ProteinBreakdown", "VitaminBreakdown",
    # Soap (entire file removed)
    "CreateSoapRegular", "CreateSoapNT", "CreateSoapDeluxe",
    "CreateSoapBlood", "CreateSoapSyndie", "CreateSoapOmega",
    # Fun (removed)
    "Felinase", "Caninase", "CaninaseFelinaseReaction",
    # Biological (removed)
    "SulfurBloodBreakdown",
    # Cascade-blocked (reaction exists but a required reactant can't be crafted)
    "Pax",                  # needs Synaptizine (commented out)
    "Opporozidone",         # needs Cognizine (commented out)
    "Ethyloxyephedrine",    # needs Desoxyephedrine (commented out)
    "Diphenylmethylamine",  # needs Ethyloxyephedrine (cascade)
    # Likely blocked by C# code (present in YAML but confirmed unavailable in-game)
    "Arithrazine",          # user-confirmed unavailable on RMC14
    "DoctorsDelight",       # user-confirmed unavailable on RMC14
}

# Vanilla reactions MODIFIED in RMC14 (different from vanilla version)
RMC14_MODIFIED_REACTIONS = {
    "MuteToxin": "Added Uranium as extra reactant",
    "Smoke": "Priority changed from -10 to 10",
    "Foam": "Priority changed from -10 to 10",
    "IronMetalFoam": "Priority changed from -10 to 10",
    "AluminiumMetalFoam": "Priority changed from -10 to 10",
    "AmmoniaFromBlood": "Stir mixer requirement removed",
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
        "difficulty": "easy",
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

# Reagent columns
REAGENT_COLUMNS = [
    "Name", "ID", "Group", "Color", "Recipe", "Produces",
    "Temp Req", "Mixer", "Effects", "Metabolism", "Overdose",
    "Craft Chain", "Physical Desc", "Flavor", "Source", "Notes",
]

# Reaction columns
REACTION_COLUMNS = [
    "Reaction Name", "Reactants", "Products", "Min Temp", "Max Temp",
    "Mixer Required", "Effects", "Priority", "Impact",
    "Full Craft Chain", "Source",
]
