#!/usr/bin/env python3
"""Named recipes from the players who build ordnance, baked into the catalogue.

The rest of the catalogue is found by search, and a search only answers the
question it is asked. These mixtures answer the questions players actually have
on a shift -- a grenade that sets everything alight at every ceiling at once, a
flame that is gone before the assault moves through it, a mortar shell that
costs a quarter of the phoron -- and several of them sit exactly on an optimum
the search also finds, which is worth showing on its own.

Only the mixture is curated here. Every number shown next to one is computed by
the same formula as everything else, so a recipe that stops working after a
balance patch shows it rather than keeping a stale claim. The notes say only
what the formula confirms: the Discord thread these came from also credited the
incendiary rocket with killing any T3 in a second, and it kills a boiler.

Source: the ordnance technicians' recipe thread on the Space Stories Discord,
2026-06-30 to 2026-09-03, plus the site owner's mortar shell, 2026-09-13.
"""

RECIPES = {
    "stories_cm": [
        {"casing": "RMCM15GrenadeCasing", "mix": {"RMCANFO": 120, "RMCCyclonite": 60},
         "name": {"en": "Maxcap", "ru": "Макскап"},
         "note": {"en": "Players' favourite; lands on the octogen-free peak",
                  "ru": "Любимая у игроков; стоит на пике без октогена"}},
        {"casing": "RMCM15GrenadeCasing",
         "mix": {"RMCPhosphorus": 10, "RMCEthanol": 90, "RMCWeldingFuel": 20, "RMCCarbon": 60},
         "name": {"en": "Sunscorch", "ru": "Солнцепёк"},
         "note": {"en": "Every M15 fire ceiling at once", "ru": "Все потолки огня M15 разом"}},
        {"casing": "RMCM15GrenadeCasing", "mix": {"RMCHydrogen": 60, "RMCPhosphorus": 60},
         "name": {"en": "Assault incendiary", "ru": "Штурм жига"},
         "note": {"en": "The flame is gone in seconds, so the assault can follow",
                  "ru": "Огонь гаснет за секунды, можно сразу идти в атаку"}},
        {"casing": "RMCM40GrenadeCasing",
         "mix": {"RMCPhosphorus": 10, "RMCEthanol": 85, "RMCWeldingFuel": 25},
         "name": {"en": "Incendiary", "ru": "Зажигательная"},
         "note": {"en": "Every M40 fire ceiling at once", "ru": "Все потолки огня M40 разом"}},
        {"casing": "RMCM40GrenadeCasing", "mix": {"RMCHydrogen": 60, "RMCPhosphorus": 60},
         "name": {"en": "Assault incendiary", "ru": "Штурм жига"},
         "note": {"en": "The flame is gone in seconds, so the assault can follow",
                  "ru": "Огонь гаснет за секунды, можно сразу идти в атаку"}},
        {"casing": "RMCM40GrenadeCasing",
         "mix": {"RMCANFO": 60, "RMCCyclonite": 15, "RMCOctogen": 35, "RMCPhosphorus": 10},
         "name": {"en": "F.I.G.S.", "ru": "Ф.И.Г.С."},
         "note": {"en": "Octogen blast with a phosphorus flame",
                  "ru": "Октогеновая волна с фосфорным огнём"}},
        {"casing": "RMCM40GrenadeCasing",
         "mix": {"RMCCLF3": 15, "RMCOctogen": 30, "RMCEthanol": 12, "RMCHydrogen": 28,
                 "RMCCyclonite": 35},
         "name": {"en": "Phosphorus 2.0", "ru": "Фосфорная 2.0"},
         "note": {"en": "Falloff 60 and the flame at the M40 ceiling",
                  "ru": "Спад 60 и огонь на потолке M40"}},
        {"casing": "RMCM20MineCasing", "mix": {"RMCANFO": 100, "RMCPhosphorus": 20},
         "name": {"en": "M.A.F.I.N.", "ru": "М.А.Ф.И.Н."},
         "note": {"en": "Blast at the mine's ceiling with a flame on top",
                  "ru": "Волна на потолке мины и огонь сверху"}},
        {"casing": "RMCC4PlasticCasing", "mix": {"RMCANFO": 130, "RMCCyclonite": 50},
         "name": {"en": "Maxcap C4", "ru": "Макскап C4"},
         "note": {"en": "Players' pick against fortifications",
                  "ru": "Выбор игроков против застройки"}},
        {"casing": "RMC80mmMortarWarhead", "mix": {"RMCANFO": 190, "RMCCyclonite": 50},
         "name": {"en": "Cheap and strong", "ru": "Дёшево и мощно"},
         "note": {"en": "A quarter of the phoron of a peak shell",
                  "ru": "Четверть форона от пикового снаряда"}},
        {"casing": "RMC80mmMortarWarhead", "mix": {"RMCPhosphorus": 10, "RMCEthanol": 100},
         "name": {"en": "Sun", "ru": "Солнце"},
         "note": {"en": "Fire radius at the mortar's ceiling, no blast",
                  "ru": "Радиус огня на потолке миномёта, без волны"}},
        {"casing": "RMC80mmMortarWarhead", "mix": {"RMCANFO": 140, "RMCOctogen": 100},
         "name": {"en": "Fire cross", "ru": "Взрывной крест"},
         "note": {"en": "A full blast plus a fire star", "ru": "Полная волна плюс огненная звезда"}},
        {"casing": "RMC88mmRocketWarhead",
         "mix": {"RMCHydrogen": 31, "RMCEthanol": 32, "RMCCLF3": 7, "RMCOctogen": 110},
         "name": {"en": "Incendiary rocket", "ru": "Зажигательная ракета"},
         "note": {"en": "Kills a boiler; every other T3 survives it",
                  "ru": "Убивает бойлера; остальные T3 выживают"}},
    ],
}
