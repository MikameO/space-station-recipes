// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 MikameO
// This file is part of Space Station Recipes.
// See LICENSE for details.
//
// L10n-RU: Russian UI layer. Design (docs/decisions/2026-07-26_russian-localization.md):
//  - Language state: ?lang= URL param wins, then localStorage, default EN.
//  - Reagent/plant DATA is swapped once at load (applyRussianData) — every
//    renderer and the search index pick the Russian strings up for free.
//  - UI chrome is translated by a DOM layer: one EN→RU dictionary applied to
//    text nodes + attributes, with a MutationObserver for dynamic renders.
//    Untranslated strings stay English (graceful degradation, never blank).
//  - EN mode costs nothing: no observer, no dictionary walk.
(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var urlLang = params.get('lang');
  var lang = 'en';
  try {
    lang = urlLang || localStorage.getItem('chemdb-lang') || 'en';
    if (urlLang) localStorage.setItem('chemdb-lang', urlLang);
  } catch (e) { lang = urlLang || 'en'; }
  if (lang !== 'ru') lang = lang === 'en' ? 'en' : 'en';
  window.I18N_LANG = lang;
  document.documentElement.lang = lang;

  // ── data swap ──────────────────────────────────────────
  // Called by app.js right after data.json lands, before buildSearchIndex().
  window.applyRussianData = function (DATA) {
    if (lang !== 'ru' || !DATA) return;
    var r, p, id;
    for (id in DATA.reagents) {
      r = DATA.reagents[id];
      r.nameEn = r.name;
      if (r.nameRu) r.name = r.nameRu;
      if (r.descRu) { r.descEn = r.desc; r.desc = r.descRu; }
      if (r.physicalDescRu) { r.physicalDescEn = r.physicalDesc; r.physicalDesc = r.physicalDescRu; }
    }
    for (id in (DATA.plants || {})) {
      p = DATA.plants[id];
      p.nameEn = p.name;
      if (p.nameRu) p.name = p.nameRu;
    }
  };

  // ── language toggle button ─────────────────────────────
  function setupToggle() {
    var btn = document.getElementById('langToggle');
    if (!btn) return;
    btn.textContent = lang === 'ru' ? 'EN' : 'RU';
    btn.title = lang === 'ru' ? 'Switch to English' : 'Переключить на русский';
    btn.addEventListener('click', function () {
      var next = lang === 'ru' ? 'en' : 'ru';
      try { localStorage.setItem('chemdb-lang', next); } catch (e) { /* private mode */ }
      // Drop ?lang from the URL so localStorage is the single source on reload
      var u = new URL(location.href);
      u.searchParams.delete('lang');
      location.replace(u.toString());
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupToggle);
  } else {
    setupToggle();
  }

  if (lang !== 'ru') return; // EN: nothing else to do

  // ── dictionary ─────────────────────────────────────────
  // Keys are whitespace-normalized EN strings exactly as they appear in a
  // text node or attribute. Missing key = string stays EN.
  var T = {
    // Header
    'Search reagents, reactions, effects...': 'Поиск реагентов, реакций, эффектов...',
    'Search reagents, effects...': 'Поиск реагентов, эффектов...',
    'ANTAG': 'АНТАГ',
    'Toggle Antag Mode': 'Режим антагониста',
    'Show tutorial': 'Показать обучение',
    'Feedback & Bug Reports': 'Обратная связь и баг-репорты',
    'Copy shareable link': 'Скопировать ссылку',
    'Pin over game — floating always-on-top companion (Chrome/Edge). Falls back to a compact popup.': 'Закрепить поверх игры — плавающее окно-компаньон (Chrome/Edge). Иначе — компактный попап.',
    'Go to Reagents home': 'На главную — Реагенты',
    'Home': 'Домой',
    'What is Antag mode?': 'Что такое режим антагониста?',
    'Reveals antagonist strategies tab: toxin synthesis routes, delivery methods, and difficulty ratings. Toggle off to return to the standard chemist view.': 'Открывает вкладку стратегий антагониста: синтез токсинов, способы доставки и рейтинг сложности. Выключите, чтобы вернуться к обычному виду химика.',
    'Loading...': 'Загрузка...',
    // Disclaimer
    'Space Station 14 fictional game data — not real-world chemistry': 'Игровые данные Space Station 14 — не реальная химия',
    // Sidebar
    'Filters': 'Фильтры',
    'Filters (source, category, effects)': 'Фильтры (источник, категория, эффекты)',
    'Collapse sidebar': 'Свернуть панель',
    'Source': 'Источник',
    'Type': 'Тип',
    'Taste': 'Вкус',
    'Effects': 'Эффекты',
    'Categories': 'Категории',
    'Stats': 'Статистика',
    'All': 'Все',
    'Base only': 'Только базовые',
    'Crafted only': 'Только крафтовые',
    'Has taste': 'Со вкусом',
    'Tasteless': 'Без вкуса',
    'Clear': 'Сброс',
    'Vanilla SS14': 'Ванилла SS14',
    // Tabs
    'Reagents': 'Реагенты',
    'Calculator': 'Калькулятор',
    'What Heals?': 'Чем лечить?',
    'Craft Trees': 'Деревья крафта',
    'Botany': 'Ботаника',
    'Maps': 'Карты',
    '⚙ Advanced': '⚙ Ещё',
    'Reactions': 'Реакции',
    'Graph': 'Граф',
    'Fork Diff': 'Сравнение форков',
    '☠ Antag Strategies': '☠ Стратегии антагониста',
    // Sort bar
    'Sort by': 'Сортировка',
    'Name A→Z': 'Имя А→Я',
    'Name Z→A': 'Имя Я→А',
    'Category': 'Категория',
    'Most Used': 'Самые используемые',
    'Fewest Steps': 'Меньше шагов',
    'Antag Score ↓': 'Антаг-рейтинг ↓',
    'Sort reagents': 'Сортировка реагентов',
    'Most Used = sorted by how many reactions reference the reagent. Antag Score = potency heuristic across damage, stealth, and method.': 'Самые используемые = сортировка по числу реакций с этим реагентом. Антаг-рейтинг = эвристика опасности по урону, скрытности и способу применения.',
    'Sort options explained': 'Пояснение сортировок',
    // Reactions table
    'Reaction': 'Реакция',
    'Reactants': 'Реагенты',
    'Products': 'Продукты',
    'Temp': 'Темп.',
    'Mixer': 'Смеситель',
    // Calculator
    'Target Reagent': 'Целевой реагент',
    'Amount (units)': 'Количество (юнитов)',
    'Type to search...': 'Начните вводить...',
    'Calculate': 'Рассчитать',
    'Batch / Shift Planner': 'Партия / план на смену',
    'Add multiple targets to compute one combined ingredient list. Useful when planning a full shift instead of a single recipe.': 'Добавьте несколько целей и получите один общий список ингредиентов. Удобно для планирования смены целиком.',
    'Batch planner explained': 'Пояснение планировщика',
    'Add multiple targets to get one optimized shopping list': 'Несколько целей — один оптимизированный список покупок',
    'Type reagent...': 'Введите реагент...',
    '+ Add': '+ Добавить',
    'Plan Batch': 'Спланировать партию',
    'Beaker Simulator': 'Симулятор стакана',
    "Simulates the actual reaction cascade: priority order, temperature windows, catalysts. 'What Can I Make?' answers what's craftable — this answers what physically happens, including the smoke you didn't want.": 'Симулирует реальный каскад реакций: приоритеты, температурные окна, катализаторы. «Что можно сделать?» отвечает, что скрафтить, а это — что физически произойдёт, включая дым, который вы не заказывали.',
    'Beaker simulator explained': 'Пояснение симулятора',
    'Enter beaker contents — watch the cascade, see the final mix': 'Введите содержимое стакана — смотрите каскад и итоговую смесь',
    'Simulate Mix': 'Смешать',
    'What Can I Make?': 'Что можно сделать?',
    'Select available ingredients and the app suggests recipes you can craft right now. Reverse search instead of looking up reagents.': 'Выберите доступные ингредиенты — приложение предложит рецепты, доступные прямо сейчас. Обратный поиск вместо перебора реагентов.',
    'Reverse lookup explained': 'Пояснение обратного поиска',
    'Select available ingredients to find craftable recipes': 'Выберите доступные ингредиенты, чтобы найти рецепты',
    'Type to add ingredient...': 'Введите ингредиент...',
    'Add ingredients above to find craftable recipes': 'Добавьте ингредиенты выше, чтобы найти рецепты',
    'No recipes found with these ingredients': 'С этими ингредиентами рецептов не найдено',
    'Target amount (units)': 'Целевое количество (юнитов)',
    // Fork diff
    'From': 'Из',
    'To': 'В',
    'Pick two different forks to compare.': 'Выберите два разных форка для сравнения.',
    'No differences — these forks share the same chemistry.': 'Различий нет — у этих форков одинаковая химия.',
    'Reagents you gain': 'Реагенты, которые вы получите',
    'Reagents you lose': 'Реагенты, которые вы потеряете',
    'Reactions you gain': 'Реакции, которые вы получите',
    'Reactions you lose': 'Реакции, которые вы потеряете',
    'Recipes that differ': 'Отличающиеся рецепты',
    'vanilla recipe': 'ванильный рецепт',
    // What Heals
    'All species': 'Все виды',
    'Species context': 'Контекст вида',
    'No healing data under the current fork filter.': 'Нет данных о лечении под текущим фильтром форка.',
    'Conditional healing — open details': 'Условное лечение — откройте детали',
    'per unit': 'за юнит',
    'Total healing one unit delivers before it fully metabolizes (per-tick effect ÷ metabolism rate)': 'Суммарное лечение с одного юнита до полного метаболизма (эффект за тик ÷ скорость метаболизма)',
    'Healing applied each ~1s metabolism tick while the reagent is in the body': 'Лечение за каждый ~1с тик метаболизма, пока реагент в организме',
    // Trees
    'Type reagent name...': 'Введите имя реагента...',
    'Craft tree reagent search': 'Поиск реагента для дерева крафта',
    'Reset': 'Сброс',
    'Uncheck all items': 'Снять все отметки',
    // Graph
    'Reset View': 'Сбросить вид',
    'Toggle Physics': 'Физика вкл/выкл',
    'Loading graph engine…': 'Загрузка движка графа…',
    'Graph engine failed to load — check connection and reopen the tab.': 'Движок графа не загрузился — проверьте соединение и откройте вкладку заново.',
    // Botany
    'Chemicals that affect plants when added to a hydroponics tray.': 'Химикаты, влияющие на растения при добавлении в гидропонику.',
    'green helps the plant': 'зелёное помогает растению',
    'red hurts it': 'красное вредит',
    'purple mutates': 'фиолетовое мутирует',
    '— the global search and Source filter apply here too.': '— глобальный поиск и фильтр «Источник» действуют и здесь.',
    '🌱 Plant Evolution': '🌱 Эволюция растений',
    "What grows into what. Arrows come from the game's seed data (mutation targets); raise mutation level with Unstable Mutagen to trigger jumps. The Source filter applies.": 'Что во что растёт. Стрелки — из игровых данных семян (цели мутаций); поднимайте уровень мутаций Нестабильным мутагеном. Фильтр «Источник» действует.',
    'Evolution chart explained': 'Пояснение схемы эволюции',
    'Growth & Care': 'Рост и уход',
    'Potency & Yield': 'Потенция и урожай',
    'Mutation': 'Мутации',
    'Weed & Pest Killers': 'Гербициды и пестициды',
    'Harmful': 'Вредные',
    'Special': 'Особые',
    'hide generic drink/food hydration': 'скрыть обычное увлажнение от еды/напитков',
    'Nearly every drink and food waters or feeds a plant a little (inherited from the base drink prototype). Hidden by default so real fertilizers and weedkillers stand out.': 'Почти каждый напиток и еда немного поливают или питают растение (наследие базового прототипа напитка). Скрыто по умолчанию, чтобы были видны настоящие удобрения и гербициды.',
    'No mutation chains under the current Source filter.': 'Нет цепочек мутаций под текущим фильтром «Источник».',
    'Filter by plant effect kind': 'Фильтр по типу эффекта на растения',
    // Antag filters
    'Difficulty': 'Сложность',
    'trivial': 'тривиально',
    'easy': 'легко',
    'medium': 'средне',
    'hard': 'сложно',
    'expert': 'эксперт',
    'impossible': 'невозможно',
    'Stealth': 'Скрытность',
    'Verification': 'Верификация',
    'all': 'все',
    'low': 'низкая',
    'high': 'высокая',
    '✓ all-verified': '✓ подтверждено',
    '◑ partial': '◑ частично',
    'ⓘ lore-only': 'ⓘ только лор',
    'Method': 'Метод',
    'inject': 'инъекция',
    'ingest': 'проглатывание',
    'drink': 'напиток',
    'food': 'еда',
    'area': 'по площади',
    'grenade': 'граната',
    'splash': 'обливание',
    'foam': 'пена',
    'smoke': 'дым',
    'Reset filters': 'Сбросить фильтры',
    'Antag strategy filters': 'Фильтры стратегий антагониста',
    'Filter by stealth level': 'Фильтр по скрытности',
    'Filter by YAML-verification status': 'Фильтр по статусу YAML-верификации',
    // Maps
    'Search an item on this map… (crowbar, plasma, defib)': 'Поиск предмета на карте… (лом, плазма, дефибриллятор)',
    'Station map': 'Карта станции',
    'on the floor': 'на полу',
    'inside a locker/crate': 'в шкафу/ящике',
    'vending machine': 'торговый автомат',
    'Zoom in': 'Приблизить',
    'Zoom out': 'Отдалить',
    'Fit map': 'Вся карта',
    'Loading map index…': 'Загрузка списка карт…',
    // Loading overlay
    'Initializing chemistry database...': 'Инициализация базы данных химии...',
    // Companion / PiP
    'Companion search': 'Поиск (компаньон)',
    'Collapse to a slim bar': 'Свернуть в узкую панель',
    'This button opens a floating always-on-top recipe window — keep ChemDB visible while you play.': 'Эта кнопка открывает плавающее окно с рецептами поверх игры — держите ChemDB на виду во время игры.',
    // Toasts / misc app.js
    'Link copied!': 'Ссылка скопирована!',
    'Copy failed — grab the URL from the address bar': 'Не скопировалось — возьмите URL из адресной строки',
    'the current filters': 'текущие фильтры',
    'Chemical Dispenser': 'Химический раздатчик',
    'Uncategorized': 'Без категории',
    'global (all forks)': 'глобально (все форки)',
    // Tutorial
    'FIND ANYTHING IN SECONDS': 'НАЙДИТЕ ЧТО УГОДНО ЗА СЕКУНДЫ',
    'Search by reagent, effect, or reaction. Results filter live as you type — no Enter needed.': 'Ищите по реагенту, эффекту или реакции. Результаты фильтруются на лету — Enter не нужен.',
    'NARROW THE LIST': 'СУЗЬТЕ СПИСОК',
    'Stack filters to zero in fast — like "medical reagents that heal burns". Categories, effects, taste, and source all combine.': 'Складывайте фильтры, чтобы быстро найти нужное — например «медицина, лечащая ожоги». Категории, эффекты, вкус и источник комбинируются.',
    'OPEN A FULL PROFILE': 'ОТКРОЙТЕ ПОЛНЫЙ ПРОФИЛЬ',
    'Click any card for the recipe, effects, metabolism rate, overdose threshold, and every reaction that uses it.': 'Кликните по карточке: рецепт, эффекты, скорость метаболизма, порог передозировки и все реакции с этим реагентом.',
    'EVERYTHING IN ONE PLACE': 'ВСЁ В ОДНОМ МЕСТЕ',
    'Jump between linked reagents without losing context. Back button, history stack, shareable URL — it all just works.': 'Переходите между связанными реагентами, не теряя контекст. Кнопка «назад», история, ссылка для шаринга — всё просто работает.',
    'PERFECT YIELDS, NO MATH': 'ТОЧНЫЙ ВЫХОД БЕЗ МАТЕМАТИКИ',
    'Tell the calculator how much you want — it gives you the exact parts list. No wasted chemicals, no miscounts.': 'Скажите калькулятору, сколько нужно — он выдаст точный список компонентов. Без перерасхода и просчётов.',
    'PLAN A WHOLE SHIFT': 'СПЛАНИРУЙТЕ ВСЮ СМЕНУ',
    'Queue multiple recipes and get one combined shopping list. Perfect for mass-producing medkits or prepping a code red.': 'Поставьте несколько рецептов в очередь и получите один общий список закупки. Идеально для массового производства аптечек и подготовки к коду красному.',
    'READY FOR DUTY': 'ГОТОВЫ К СМЕНЕ',
    'That is the core. Explore Craft Trees and Graph tabs whenever you want to see recipes visually. Good luck, chemist.': 'Это основа. Загляните во вкладки «Деревья крафта» и «Граф», чтобы увидеть рецепты наглядно. Удачи, химик.',
    'Skip': 'Пропустить',
    'Next': 'Далее',
    'Close': 'Закрыть',
    // Categories (fixed data vocabulary — labels only, filter values untouched)
    'Medicine': 'Медицина',
    'Toxins': 'Токсины',
    'Toxin': 'Токсин',
    'Chemicals': 'Химикаты',
    'Elements': 'Элементы',
    'Gases': 'Газы',
    'Narcotics': 'Наркотики',
    'Pyrotechnic': 'Пиротехника',
    'Cleaning': 'Чистящие',
    'Biological': 'Биологические',
    'Botanical': 'Ботанические',
    'Materials': 'Материалы',
    'Fun': 'Фан',
    'Other': 'Прочее',
    'Drinks (Alcoholic)': 'Напитки (алкоголь)',
    'Drinks (Non-Alc)': 'Напитки (безалк.)',
    'Food & Condiments': 'Еда и приправы',
    'Base Chemicals': 'Базовые химикаты',
    'Vanilla': 'Ванилла',
    // Damage / heal types (What Heals chips carry ❤/☠ prefixes as one node)
    'Brute': 'Физический', 'Blunt': 'Ушиб', 'Slash': 'Порез', 'Piercing': 'Прокол',
    'Heat': 'Жар', 'Cold': 'Холод', 'Shock': 'Электричество', 'Caustic': 'Кислота',
    'Poison': 'Яд', 'Radiation': 'Радиация', 'Airloss': 'Удушье',
    'Asphyxiation': 'Асфиксия', 'Bloodloss': 'Кровопотеря', 'Cellular': 'Клеточный',
    'Genetic': 'Генетический', 'Holy': 'Святой', 'Metaphysical': 'Метафизический',
    'Mangleness': 'Увечья',
    '❤ airloss': '❤ удушье', '❤ asphyxiation': '❤ асфиксия', '❤ bloodloss': '❤ кровопотеря',
    '❤ blunt': '❤ ушиб', '❤ brute': '❤ физический', '❤ burn': '❤ ожог', '❤ caustic': '❤ кислота',
    '❤ cellular': '❤ клеточный', '❤ cold': '❤ холод', '❤ genetic': '❤ генетический',
    '❤ heat': '❤ жар', '❤ holy': '❤ святой', '❤ mangleness': '❤ увечья',
    '❤ metaphysical': '❤ метафизический', '❤ piercing': '❤ прокол', '❤ poison': '❤ яд',
    '❤ radiation': '❤ радиация', '❤ shock': '❤ электричество', '❤ slash': '❤ порез', '❤ toxin': '❤ токсин',
    '☠ airloss': '☠ удушье', '☠ asphyxiation': '☠ асфиксия', '☠ bloodloss': '☠ кровопотеря',
    '☠ blunt': '☠ ушиб', '☠ brute': '☠ физический', '☠ burn': '☠ ожог', '☠ caustic': '☠ кислота',
    '☠ cellular': '☠ клеточный', '☠ cold': '☠ холод', '☠ genetic': '☠ генетический',
    '☠ heat': '☠ жар', '☠ holy': '☠ святой', '☠ mangleness': '☠ увечья',
    '☠ piercing': '☠ прокол', '☠ poison': '☠ яд', '☠ radiation': '☠ радиация',
    '☠ shock': '☠ электричество', '☠ slash': '☠ порез', '☠ toxin': '☠ токсин',
    'Burn': 'Ожог',
    // Species (curated physiology chips)
    'All species': 'Все виды',
    'Human': 'Человек', 'Dwarf': 'Дворф', 'Slime person': 'Слаймолюд',
    'Arachnid': 'Арахнид', 'Moth person': 'Ниан', 'Diona': 'Диона',
    'Reptilian': 'Унатх', 'Vox': 'Вокс', 'Animal': 'Животное',
    'Bloodsucker': 'Кровосос', 'Goblin': 'Гоблин', 'Rat': 'Крыса',
    'Sheleg': 'Шелег', 'SuperMutant': 'Супермутант', 'Thaven': 'Тейвен',
    'Yowie': 'Йови',
    'Access': 'Доступ',
    'newbie': 'новичку', 'meta': 'мета',
    '(SS14 gameplay)': '(геймплей SS14)',
    // Effect filter tags / collections
    'Healing': 'Лечение', 'Damage': 'Урон', 'Buffs': 'Баффы', 'Debuffs': 'Дебаффы',
    'Status effects': 'Статус-эффекты', 'Status fx': 'Статусы',
    'sleep': 'сон', 'stun': 'стан', 'stutter': 'заикание', 'drunk': 'опьянение',
    'jitter': 'дрожь', 'blind': 'слепота', 'mute': 'немота', 'vomit': 'рвота',
    'hallucinating': 'галлюцинации', 'unconscious': 'без сознания', 'drowsy': 'сонливость',
    'knockdown': 'нокдаун', 'pacified': 'пацифизм', 'numbness': 'онемение',
    'flammable': 'воспламенение', 'explosion': 'взрыв', 'emote': 'эмоции',
    'adrenaline': 'адреналин', 'speed': 'скорость', 'stamina': 'стамина',
    'temperature': 'температура', 'bleed': 'кровотечение', 'blood': 'кровь',
    'cure': 'исцеление', 'anesthesia': 'анестезия', 'dementia': 'деменция',
    'hunger': 'голод', 'thirst': 'жажда', 'slurredspeech': 'невнятная речь',
    'pressure-immune': 'иммунитет к давлению', 'shock-immune': 'иммунитет к току',
    'rad-protection': 'радиозащита', 'dna-scramble': 'скремблинг ДНК',
    'claw-suppression': 'подавление когтей', 'self-chem': 'самохимия',
    'unknown': 'неизвестно', 'unobtainable': 'недоступен', 'dispenser': 'раздатчик',
    'cross-botany': 'через ботанику', 'cross-service': 'через сервис',
    'mob-drop': 'дроп с мобов', 'uplink currency': 'валюта аплинка',
    'vanilla': 'ванилла', 'Smoke': 'Дым', 'Foam': 'Пена', 'Flash': 'Вспышка',
    'Drunk': 'Опьянение', 'Jitter': 'Дрожь', 'Oxygenate': 'Оксигенация',
    // Detail panel
    'Recipe': 'Рецепт',
    'Recipe math': 'Расчёт рецепта',
    'Overdose': 'Передозировка',
    'How to Obtain': 'Как получить',
    'Craft Tree': 'Дерево крафта',
    'Community knowledge': 'Знания сообщества',
    'Physical': 'Физически',
    'UNOBTAINABLE': 'НЕДОСТУПЕН',
    'DISPENSER': 'РАЗДАТЧИК',
    'CATALYST': 'КАТАЛИЗАТОР',
    'Heal / u': 'Лечение / ю',
    '/ sec': '/ сек',
    'Back': 'Назад',
    'Target': 'Цель',
    'Target reagent': 'Целевой реагент',
    'Dismiss': 'Скрыть',
    'Show Anyway': 'Всё равно показать',
    'Stir': 'Помешать',
    'Shake': 'Встряхнуть',
    'Mix in beaker — triggers automatically': 'Смешать в стакане — сработает автоматически',
    'No recipe, no plant, no dispenser source — unobtainable in vanilla play': 'Ни рецепта, ни растения, ни раздатчика — недоступен в ванильной игре',
    'No recipe, no plant, no dispenser source': 'Ни рецепта, ни растения, ни раздатчика',
    // aria-labels (composite widgets)
    'Search reagents, reactions, effects': 'Поиск реагентов, реакций, эффектов',
    'Amount in units': 'Количество в юнитах',
    'Add batch target reagent': 'Добавить целевой реагент партии',
    'Batch target amount': 'Количество для цели партии',
    'Add beaker reagent': 'Добавить реагент в стакан',
    'Beaker reagent amount': 'Количество реагента в стакане',
    'Beaker temperature in Kelvin': 'Температура стакана в кельвинах',
    'Add ingredient for reverse lookup': 'Добавить ингредиент для обратного поиска',
    'Calculate in Batch Planner': 'Рассчитать в планировщике партий',
    'Switch language / Переключить язык': 'Переключить язык / Switch language',
    'Switch to English': 'Switch to English',
    // Stats tab
    'Top Categories': 'Топ категорий',
    'Most Complex Recipes': 'Самые сложные рецепты',
    'Most Used Base Chemicals': 'Самые используемые базовые химикаты',
    'Graph Edges': 'Рёбра графа',
    'Forks': 'Форки',
    'Fork Comparison': 'Сравнение форков',
    // Presets
    '⚗ Med-Chem Starter': '⚗ Стартовая химия медика',
    '⚗ Advanced Meds': '⚗ Продвинутая медицина',
    '🌱 Botany Kit': '🌱 Набор ботаника',
    '🍸 Bar Prep': '🍸 Барная подготовка',
    // Antag tab
    '☠ In-game Delivery Mechanisms': '☠ Внутриигровые способы доставки',
    '☠ Syndicate Items': '☠ Предметы Синдиката',
    '⚠ Report inaccuracy': '⚠ Сообщить о неточности',
    'Report an inaccuracy in this strategy (opens GitHub issue)': 'Сообщить о неточности в этой стратегии (откроется GitHub issue)',
    '✓ verified': '✓ подтверждено',
    'Every ingredient has YAML-extracted mechanics; method matches a known delivery mechanism': 'У каждого ингредиента механика извлечена из YAML; метод соответствует известному способу доставки',
    "Some ingredients have verified mechanics; other details come from curator's notes": 'Часть ингредиентов с подтверждённой механикой; остальное — из заметок куратора',
    'No ingredient has YAML-verified mechanics — relies entirely on curator\'s community knowledge': 'Ни один ингредиент не подтверждён YAML — стратегия целиком на знаниях сообщества',
    '👁 low': '👁 низкая', '👁 medium': '👁 средняя', '👁 high': '👁 высокая',
    // Botany extras
    'De-ages plant': 'Омолаживает растение',
    'Destroys seeds': 'Уничтожает семена',
    'Mutates chemical contents': 'Мутирует химический состав',
    'Mutation level': 'Уровень мутаций',
    'Mutation modifier': 'Модификатор мутаций',
    'Plant health': 'Здоровье растения',
    'Plant toxins': 'Токсины растения',
    'Pests': 'Вредители',
    'Weeds': 'Сорняки',
    'Growth': 'Рост',
    'Nutrition': 'Питание',
    'Water': 'Вода',
    'Composting': 'Компостирование',
    'Potency': 'Потенция',
    'Potency (Robust Harvest)': 'Потенция (Robust Harvest)',
    'Lifespan & yield': 'Срок жизни и урожай',
    'Fertilizer': 'Удобрение',
    'Swabs & mutations — how the evolution chart works': 'Мазки и мутации — как работает схема эволюции',
    'Swabs (cross-pollination)': 'Мазки (перекрёстное опыление)',
    'Species mutations (the arrows in the chart)': 'Мутации видов (стрелки на схеме)',
    'Curated from playtime — the mechanics live in C# code, not extractable YAML. PRs welcome.': 'Собрано из игрового опыта — механика живёт в C#-коде, не в YAML. PR приветствуются.',
    // Maps extras
    'Pick an item to see where it lives.': 'Выберите предмет, чтобы увидеть, где он лежит.',
    // Maps sell list
    '$ Sell list': '$ Что продать',
    'Every item on this map, priced': 'Все предметы карты с ценами продажи',
    'Item': 'Предмет',
    'Count': 'Кол-во',
    'Price': 'Цена',
    'Total': 'Итого',
    'incl. vendors': 'с вендоматами',
    'Filter items…': 'Фильтр…',
    'Close list': 'Закрыть список',
    'No price data for this fork yet — sort by count still works': 'Для этого форка пока нет данных о ценах — сортировка по количеству работает',
    // Sell list: loot certainty + class chips ('All' and 'Materials' already exist above)
    'Loot certainty': 'Гарантированность лута',
    'All loot': 'Весь лут',
    'Guaranteed only': 'Только гарантированный',
    'Chance spawns only': 'Только случайный спавн',
    'Guns': 'Огнестрел',
    'Melee': 'Холодное',
    'Explosives': 'Взрывчатка',
    'Armor': 'Броня',
    'Clothing': 'Одежда',
    'Food': 'Еда',
    'Drinks': 'Напитки',
    'Medical': 'Медицина',
    'Tools': 'Инструменты',
    'Storage': 'Контейнеры',
    'Machinery': 'Механизмы',
    'Misc': 'Прочее',
    // Empty search state
    'Try a different spelling, clear filters, or open the tutorial for a quick orientation.': 'Попробуйте другое написание, сбросьте фильтры или откройте обучение.',
    'Clear search': 'Очистить поиск',
    'Open tutorial': 'Открыть обучение',
    'Did you mean:': 'Возможно, вы имели в виду:',
    // Pin callout
    '📌 Pin over your game': '📌 Закрепите поверх игры',
    // Loading-overlay disclaimer fragments (split by <strong>/<em>/<br>)
    'This is a reference database for': 'Это справочная база данных по',
    ', a fictional multiplayer game.': '— вымышленной многопользовательской игре.',
    'All reagent data, including toxicity values, synthesis routes, and “antag” strategies,': 'Все данные о реагентах, включая токсичность, пути синтеза и «антаг»-стратегии,',
    'describe': 'описывают',
    'in-game mechanics only': 'только внутриигровые механики',
    '. Nothing here is real-world chemistry guidance.': '. Здесь нет никаких руководств по реальной химии.',
    'is an unofficial community tool for': '— неофициальный инструмент сообщества для',
    'fictional in-game mechanics': 'вымышленные внутриигровые механики',
    // Metabolism paths / detail extras
    'Digestion': 'Пищеварение',
    'Bloodstream (when metabolized)': 'Кровоток (при метаболизме)',
    'Stomach (when ingested)': 'Желудок (при проглатывании)',
    'Lungs (when inhaled)': 'Лёгкие (при вдыхании)',
    'Skin contact': 'Контакт с кожей',
    'Spilled tile': 'Разлив на полу',
    'Reactive surface': 'Реактивная поверхность',
    'Injection site': 'Место инъекции',
    'Food metabolism': 'Пищевой метаболизм',
    'Drink metabolism': 'Метаболизм напитков',
    'Medicine metabolism': 'Метаболизм лекарств',
    'Plant metabolism': 'Метаболизм растений',
    'Plant Effects (Botany)': 'Эффекты на растения (ботаника)',
    'Chemistry reaction': 'Химическая реакция',
    'Chemistry reaction from dispenser base': 'Химическая реакция из базовых (раздатчик)',
    'BASE': 'БАЗА',
    'LOOP': 'ЦИКЛ',
    'MOD': 'МОД',
    // Calculator legend fragments (split by <strong> islands)
    'Three planners stacked here:': 'Здесь три планировщика:',
    'below,': 'ниже,',
    'for combined shopping lists, and': 'для общего списка закупки и',
    'for reverse search by ingredient. Click any heading to collapse.': 'для обратного поиска по ингредиентам. Клик по заголовку сворачивает секцию.',
    // What Heals legend fragments (split by the * span)
    'Pick a damage type — medicines ranked by healing per unit. Respects the fork filter;': 'Выберите тип урона — лекарства отсортированы по лечению за юнит. Фильтр форка учитывается;',
    'marks conditional healing (open details).': 'помечает условное лечение (откройте детали).',
    // Fork-diff legend (single node)
    "Moving between servers? Pick two forks — see what's added, removed or rebalanced. Notes come from the build-time comparator (verified against fork YAML).": 'Переезжаете между серверами? Выберите два форка — увидите, что добавлено, удалено или перебалансировано. Заметки — от сравнения при сборке (сверено с YAML форков).',
    'moved servers, what changed?': 'сменили сервер — что изменилось?',
  };

  // Regex rules for composite strings (numbers interpolated at runtime).
  var plural = function (n, one, few, many) {
    n = Math.abs(n) % 100;
    var n1 = n % 10;
    if (n > 10 && n < 20) return many;
    if (n1 > 1 && n1 < 5) return few;
    if (n1 === 1) return one;
    return many;
  };
  var RX = [
    [/^(\d+) reagents \| (\d+) reactions$/, function (m) {
      return m[1] + ' ' + plural(+m[1], 'реагент', 'реагента', 'реагентов') + ' | ' +
             m[2] + ' ' + plural(+m[2], 'реакция', 'реакции', 'реакций');
    }],
    [/^(\d+) results$/, function (m) { return m[1] + ' ' + plural(+m[1], 'результат', 'результата', 'результатов'); }],
    [/^(\d+) reactions$/, function (m) { return m[1] + ' ' + plural(+m[1], 'реакция', 'реакции', 'реакций'); }],
    [/^(\d+) reagents$/, function (m) { return m[1] + ' ' + plural(+m[1], 'реагент', 'реагента', 'реагентов'); }],
    [/^(\d+) botany chemicals$/, function (m) { return m[1] + ' ' + plural(+m[1], 'ботанический химикат', 'ботанических химиката', 'ботанических химикатов'); }],
    [/^Load More \((\d+) remaining\)$/, function (m) { return 'Показать ещё (осталось ' + m[1] + ')'; }],
    [/^No reagents match "(.+)"$/, function (m) { return 'Нет реагентов по запросу «' + m[1] + '»'; }],
    [/^No reagents match (.+)$/, function (m) { return 'Нет реагентов: ' + (T[m[1]] || m[1]); }],
    [/^Back to (.+)$/, function (m) { return 'Назад к ' + m[1]; }],
    [/^Loading (.+)…$/, function (m) { return 'Загрузка ' + m[1] + '…'; }],
    [/^(.+) \(off-rotation\)$/, function (m) { return m[1] + ' (вне ротации)'; }],
    [/^(\d+) recipes? found$/, function (m) { return 'Найдено ' + m[1] + ' ' + plural(+m[1], 'рецепт', 'рецепта', 'рецептов'); }],
    [/^Metabolizes ([\d.]+) u\/s — 1u lasts ~([\d.]+)s$/, function (m) { return 'Метаболизм ' + m[1] + ' ю/с — 1ю держится ~' + m[2] + 'с'; }],
    [/^Effect: (.+)$/, function (m) { return 'Эффект: ' + m[1]; }],
    [/^Mark (.+) as collected\/added$/, function (m) { return 'Отметить «' + m[1] + '» как собранное'; }],
    [/^Mixer: (.+)$/, function (m) { return 'Смеситель: ' + (T[m[1]] || m[1]); }],
    [/^Requires Botany: (.+) \(plant\)$/, function (m) { return 'Требуется ботаника: ' + m[1] + ' (растение)'; }],
    [/^(Juicing: )?(.+) \(plant\)$/, function (m) { return (m[1] ? 'Сок: ' : '') + m[2] + ' (растение)'; }],
    [/^Used [Ii]n \((\d+) recipes?\)$/, function (m) { return 'Используется в ' + m[1] + ' ' + plural(+m[1], 'рецепте', 'рецептах', 'рецептах'); }],
    [/^Used [Ii]n \((\d+)\)$/, function (m) { return 'Используется в (' + m[1] + ')'; }],
    [/^Produces: (.+)$/, function (m) { return 'Выход: ' + m[1]; }],
    [/^(.*) \| Flavor: (.+)$/, function (m) { return m[1] + ' | Вкус: ' + m[2]; }],
    // Detail sub-line "Id | Category | Fork" — translate the middle part
    [/^(\S+) \| ([^|]+) \| (.+)$/, function (m) {
      var mid = m[2].trim();
      return m[1] + ' | ' + (T[mid] || mid) + ' | ' + m[3];
    }],
    [/^(\d+) (?:spot|location)s?$/, function (m) { return m[1] + ' ' + plural(+m[1], 'место', 'места', 'мест'); }],
    [/^([\d.]+)\/s$/, function (m) { return m[1] + '/с'; }],
    [/^(\d+) \((\d+) rxn\)$/, function (m) { return m[1] + ' (' + m[2] + ' реакц.)'; }],
    [/^(\d+) strategies$/, function (m) { return m[1] + ' ' + plural(+m[1], 'стратегия', 'стратегии', 'стратегий'); }],
    [/^(\d+) chains, (\d+) plants with mutation targets \(of (\d+) in view\)$/, function (m) {
      return 'Цепочек: ' + m[1] + ', растений с целями мутаций: ' + m[2] + ' (из ' + m[3] + ' в выборке)';
    }],
  ];

  // Debug hook: collect untranslated UI strings per session so the dictionary
  // can be completed empirically (read window.__i18nMiss in the console).
  var MISS = window.__i18nMiss = new Set();

  function norm(s) { return s.replace(/\s+/g, ' ').trim(); }

  function translate(s) {
    var key = norm(s);
    if (!key || !/[A-Za-z]/.test(key)) return null;   // nothing latin → skip
    var hit = T[key];
    if (hit !== undefined) return hit;
    for (var i = 0; i < RX.length; i++) {
      var m = key.match(RX[i][0]);
      if (m) return RX[i][1](m);
    }
    // Only track plausible UI chrome (has a space or is a known-ish label)
    if (key.length > 2 && /[A-Za-z]{3}/.test(key)) MISS.add(key);
    return null;
  }

  var ATTRS = ['placeholder', 'title', 'aria-label', 'data-hint'];

  function translateElement(el) {
    if (!el || el.nodeType !== 1) return;
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      var v = el.getAttribute && el.getAttribute(a);
      if (v) {
        var tv = translate(v);
        if (tv !== null && tv !== v) el.setAttribute(a, tv);
      }
    }
  }

  function translateTextNode(node) {
    var raw = node.nodeValue || '';
    var tv = translate(raw);
    if (tv === null) return;
    // Preserve surrounding whitespace so inline layout doesn't collapse
    var lead = raw.match(/^\s*/)[0];
    var tail = raw.match(/\s*$/)[0];
    var out = lead + tv + tail;
    // CRITICAL: never assign an unchanged value — a same-value nodeValue
    // write still fires a characterData mutation, and an RX rule that
    // returns its input verbatim would loop the observer forever.
    if (out !== raw) node.nodeValue = out;
  }

  var translating = false;
  function translateTree(root) {
    if (!root) return;
    translating = true;
    try {
      if (root.nodeType === 3) { translateTextNode(root); return; }
      if (root.nodeType !== 1 && root.nodeType !== 11) return;
      if (root.nodeType === 1) {
        if (root.tagName === 'SCRIPT' || root.tagName === 'STYLE') return;
        translateElement(root);
      }
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null);
      var n;
      while ((n = walker.nextNode())) {
        if (n.nodeType === 3) translateTextNode(n);
        else if (n.tagName !== 'SCRIPT' && n.tagName !== 'STYLE') translateElement(n);
      }
    } finally {
      translating = false;
    }
  }
  window.__i18nTranslateTree = translateTree; // manual re-run hook

  function start() {
    translateTree(document.body);
    var mo = new MutationObserver(function (muts) {
      if (translating) return;
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'characterData') {
          translateTextNode(m.target);
        } else if (m.type === 'childList') {
          for (var j = 0; j < m.addedNodes.length; j++) translateTree(m.addedNodes[j]);
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
