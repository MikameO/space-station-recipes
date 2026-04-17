// ─────────────────────────────────────────────
// Interactive Tutorial
// ─────────────────────────────────────────────
// Self-contained onboarding module. Auto-starts on first visit,
// re-openable via #helpBtn. No dependency on app.js internals —
// communicates only through DOM + the 'app:ready' custom event.

(function () {
  'use strict';

  var STORAGE_KEY = 'ss14_tutorial_seen';
  var PAD = 8;              // spotlight padding around target rect
  var CARD_GAP = 14;        // gap between spotlight and card
  var CARD_MAX_W = 380;

  var STEPS = [
    {
      id: 'search',
      title: 'FIND ANYTHING IN SECONDS',
      body: 'Search by reagent, effect, or reaction. Results filter live as you type — no Enter needed.',
      target: function () { return document.getElementById('searchInput'); }
    },
    {
      id: 'filters',
      title: 'NARROW THE LIST',
      body: 'Stack filters to zero in fast — like "medical reagents that heal burns". Categories, effects, taste, and source all combine.',
      onBefore: function () {
        var sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.remove('collapsed');
        var layout = document.querySelector('.layout');
        if (layout) layout.classList.remove('sidebar-collapsed');
      },
      target: function () { return document.getElementById('sidebar'); }
    },
    {
      id: 'cards',
      title: 'OPEN A FULL PROFILE',
      body: 'Click any card for the recipe, effects, metabolism rate, overdose threshold, and every reaction that uses it.',
      onBefore: function () {
        var btn = document.getElementById('btn-reagents');
        if (btn && !btn.classList.contains('active')) btn.click();
      },
      target: function () {
        return document.querySelector('#reagentGrid .reagent-card') ||
               document.getElementById('reagentGrid');
      }
    },
    {
      id: 'detail',
      title: 'EVERYTHING IN ONE PLACE',
      body: 'Jump between linked reagents without losing context. Back button, history stack, shareable URL — it all just works.',
      onBefore: function () {
        var panel = document.getElementById('detailPanel');
        if (panel && !panel.classList.contains('open')) {
          var card = document.querySelector('#reagentGrid .reagent-card');
          if (card) card.click();
        }
      },
      target: function () {
        var panel = document.getElementById('detailPanel');
        return panel && panel.classList.contains('open') ? panel : null;
      }
    },
    {
      id: 'calc',
      title: 'PERFECT YIELDS, NO MATH',
      body: 'Tell the calculator how much you want — it gives you the exact parts list. No wasted chemicals, no miscounts.',
      onBefore: function () {
        // Close detail panel if still open so calculator is visible
        var panel = document.getElementById('detailPanel');
        if (panel && panel.classList.contains('open')) {
          var close = document.getElementById('detailClose');
          if (close) close.click();
        }
        var btn = document.getElementById('btn-calculator');
        if (btn) btn.click();
      },
      target: function () {
        return document.querySelector('#tab-calculator .calc-controls') ||
               document.getElementById('btn-calculator');
      }
    },
    {
      id: 'batch',
      title: 'PLAN A WHOLE SHIFT',
      body: 'Queue multiple recipes and get one combined shopping list. Perfect for mass-producing medkits or prepping a code red.',
      target: function () { return document.querySelector('.batch-section'); }
    },
    {
      id: 'done',
      title: 'READY FOR DUTY',
      body: 'That is the core. Explore Craft Trees and Graph tabs whenever you want to see recipes visually. Good luck, chemist.',
      target: function () { return document.getElementById('helpBtn'); },
      isFinal: true
    }
  ];

  var rootEl = null;
  var currentIdx = 0;
  var lastFocus = null;
  var rafId = 0;
  var boundReflow = null;
  var boundKey = null;

  function safeLSGet() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }
  function safeLSSet(v) {
    try { localStorage.setItem(STORAGE_KEY, v); } catch (e) { /* private mode */ }
  }

  function buildOverlay() {
    if (rootEl) return rootEl;
    rootEl = document.createElement('div');
    rootEl.id = 'tut-root';
    rootEl.className = 'tut-root';
    rootEl.setAttribute('role', 'dialog');
    rootEl.setAttribute('aria-modal', 'true');
    rootEl.setAttribute('aria-labelledby', 'tut-title');
    rootEl.innerHTML =
      '<div class="tut-mask tut-mask-top"></div>' +
      '<div class="tut-mask tut-mask-right"></div>' +
      '<div class="tut-mask tut-mask-bottom"></div>' +
      '<div class="tut-mask tut-mask-left"></div>' +
      '<div class="tut-spotlight" aria-hidden="true"></div>' +
      '<div class="tut-card" role="document">' +
        '<div class="tut-progress"><span id="tut-step-n">1</span> / <span id="tut-step-total">' + STEPS.length + '</span></div>' +
        '<h3 class="tut-title" id="tut-title"></h3>' +
        '<p class="tut-body" id="tut-body"></p>' +
        '<div class="tut-actions">' +
          '<button type="button" class="tut-btn tut-btn-skip" id="tut-skip">Skip</button>' +
          '<span class="tut-spacer"></span>' +
          '<button type="button" class="tut-btn" id="tut-back">Back</button>' +
          '<button type="button" class="tut-btn tut-btn-primary" id="tut-next">Next</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(rootEl);

    rootEl.querySelector('#tut-next').addEventListener('click', nextStep);
    rootEl.querySelector('#tut-back').addEventListener('click', prevStep);
    rootEl.querySelector('#tut-skip').addEventListener('click', function () {
      endTutorial(true);
    });
    // Backdrop clicks intentionally do nothing.
    Array.prototype.forEach.call(rootEl.querySelectorAll('.tut-mask'), function (m) {
      m.addEventListener('click', function (e) { e.stopPropagation(); });
    });
    return rootEl;
  }

  function startTutorial() {
    buildOverlay();
    lastFocus = document.activeElement;
    currentIdx = 0;
    rootEl.classList.add('active');
    document.body.style.overflow = 'hidden';
    attachGlobalListeners();
    goToStep(0, 'forward');
  }

  function endTutorial(markSeen) {
    if (!rootEl) return;
    rootEl.classList.remove('active');
    document.body.style.overflow = '';
    detachGlobalListeners();
    if (markSeen) safeLSSet('1');
    if (lastFocus && typeof lastFocus.focus === 'function') {
      try { lastFocus.focus(); } catch (e) { /* ignore */ }
    }
  }

  function nextStep() { goToStep(currentIdx + 1, 'forward'); }
  function prevStep() { goToStep(currentIdx - 1, 'backward'); }

  function goToStep(i, dir) {
    if (i < 0) { i = 0; dir = 'forward'; }
    if (i >= STEPS.length) { endTutorial(true); return; }

    var step = STEPS[i];
    if (step.onBefore) {
      try { step.onBefore(); } catch (e) { /* keep going */ }
    }

    // Wait a tick so any tab/panel transitions render before we measure.
    // setTimeout (not rAF) — works even if the tab is not focused.
    setTimeout(function () {
      var el = null;
      try { el = step.target(); } catch (e) { el = null; }
      if (!el) {
        // Skip missing targets in movement direction.
        if (dir === 'backward') {
          if (i === 0) { endTutorial(true); return; }
          goToStep(i - 1, 'backward');
        } else {
          goToStep(i + 1, 'forward');
        }
        return;
      }

      currentIdx = i;
      scrollIntoViewIfNeeded(el);
      // Let scroll settle briefly, then paint.
      setTimeout(function () {
        renderStep(step, el);
      }, 50);
    }, 30);
  }

  function scrollIntoViewIfNeeded(el) {
    var rect = el.getBoundingClientRect();
    var vh = window.innerHeight || document.documentElement.clientHeight;
    if (rect.top < 60 || rect.bottom > vh - 60) {
      try {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch (e) {
        el.scrollIntoView();
      }
    }
  }

  function renderStep(step, el) {
    var stepNum = rootEl.querySelector('#tut-step-n');
    var stepTotal = rootEl.querySelector('#tut-step-total');
    var titleEl = rootEl.querySelector('#tut-title');
    var bodyEl = rootEl.querySelector('#tut-body');
    var nextBtn = rootEl.querySelector('#tut-next');
    var backBtn = rootEl.querySelector('#tut-back');
    var skipBtn = rootEl.querySelector('#tut-skip');

    stepNum.textContent = String(currentIdx + 1);
    stepTotal.textContent = String(STEPS.length);
    titleEl.textContent = step.title;
    bodyEl.textContent = step.body;

    backBtn.disabled = currentIdx === 0;
    if (step.isFinal) {
      nextBtn.textContent = 'Close';
      skipBtn.style.visibility = 'hidden';
    } else {
      nextBtn.textContent = 'Next';
      skipBtn.style.visibility = '';
    }

    positionSpotlightAndCard(el);

    // Focus next button so keyboard users can just press Enter.
    try { nextBtn.focus(); } catch (e) { /* ignore */ }
  }

  function positionSpotlightAndCard(el) {
    var rect = el.getBoundingClientRect();
    var vw = window.innerWidth || document.documentElement.clientWidth;
    var vh = window.innerHeight || document.documentElement.clientHeight;

    var holeTop = Math.max(0, rect.top - PAD);
    var holeLeft = Math.max(0, rect.left - PAD);
    var holeRight = Math.min(vw, rect.right + PAD);
    var holeBottom = Math.min(vh, rect.bottom + PAD);
    var holeW = holeRight - holeLeft;
    var holeH = holeBottom - holeTop;

    var top = rootEl.querySelector('.tut-mask-top');
    var right = rootEl.querySelector('.tut-mask-right');
    var bottom = rootEl.querySelector('.tut-mask-bottom');
    var left = rootEl.querySelector('.tut-mask-left');
    var spot = rootEl.querySelector('.tut-spotlight');

    top.style.cssText = 'left:0;top:0;width:100%;height:' + holeTop + 'px;';
    bottom.style.cssText = 'left:0;top:' + holeBottom + 'px;width:100%;height:' + Math.max(0, vh - holeBottom) + 'px;';
    left.style.cssText = 'left:0;top:' + holeTop + 'px;width:' + holeLeft + 'px;height:' + holeH + 'px;';
    right.style.cssText = 'left:' + holeRight + 'px;top:' + holeTop + 'px;width:' + Math.max(0, vw - holeRight) + 'px;height:' + holeH + 'px;';

    spot.style.cssText = 'left:' + holeLeft + 'px;top:' + holeTop + 'px;width:' + holeW + 'px;height:' + holeH + 'px;';

    positionCard(holeTop, holeLeft, holeW, holeH, vw, vh);
  }

  function positionCard(holeTop, holeLeft, holeW, holeH, vw, vh) {
    var card = rootEl.querySelector('.tut-card');
    // Ensure card has a measured size
    card.style.maxWidth = CARD_MAX_W + 'px';
    card.style.visibility = 'hidden';
    card.style.left = '0px';
    card.style.top = '0px';
    var ch = card.offsetHeight;
    var cw = Math.min(CARD_MAX_W, card.offsetWidth || CARD_MAX_W);

    var spaceBelow = vh - (holeTop + holeH) - CARD_GAP;
    var spaceAbove = holeTop - CARD_GAP;
    var placeBelow = spaceBelow >= ch || spaceBelow >= spaceAbove;

    var top;
    if (placeBelow) {
      top = holeTop + holeH + CARD_GAP;
      if (top + ch > vh - 8) top = Math.max(8, vh - ch - 8);
    } else {
      top = holeTop - CARD_GAP - ch;
      if (top < 8) top = 8;
    }

    // Horizontal: center on hole, then clamp.
    var left = holeLeft + holeW / 2 - cw / 2;
    if (left < 8) left = 8;
    if (left + cw > vw - 8) left = vw - cw - 8;

    card.style.left = left + 'px';
    card.style.top = top + 'px';
    card.style.visibility = 'visible';
  }

  function reflow() {
    if (rafId) clearTimeout(rafId);
    rafId = setTimeout(function () {
      rafId = 0;
      if (!rootEl || !rootEl.classList.contains('active')) return;
      var step = STEPS[currentIdx];
      var el = null;
      try { el = step && step.target(); } catch (e) { el = null; }
      if (el) positionSpotlightAndCard(el);
    }, 16);
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      endTutorial(true);
    } else if (e.key === 'ArrowRight') {
      nextStep();
    } else if (e.key === 'ArrowLeft') {
      prevStep();
    }
  }

  function attachGlobalListeners() {
    boundReflow = reflow;
    boundKey = onKey;
    window.addEventListener('resize', boundReflow);
    window.addEventListener('scroll', boundReflow, true);
    document.addEventListener('keydown', boundKey);
  }

  function detachGlobalListeners() {
    if (boundReflow) {
      window.removeEventListener('resize', boundReflow);
      window.removeEventListener('scroll', boundReflow, true);
      boundReflow = null;
    }
    if (boundKey) {
      document.removeEventListener('keydown', boundKey);
      boundKey = null;
    }
  }

  // Help button handler — attach as soon as the DOM is parsed.
  // Intentionally independent of 'app:ready' so the button keeps working
  // even if app.js fails to load data or throws during init.
  function attachHelpBtn() {
    var helpBtn = document.getElementById('helpBtn');
    if (helpBtn) {
      helpBtn.addEventListener('click', function () {
        // Always allow re-opening, ignoring the seen flag.
        startTutorial();
      });
    }
  }

  // Auto-start on first visit — waits for the app to finish loading
  // data so the tutorial never draws on top of the loading overlay.
  function maybeAutoStart() {
    if (!safeLSGet()) {
      setTimeout(startTutorial, 400);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachHelpBtn);
  } else {
    attachHelpBtn();
  }
  document.addEventListener('app:ready', maybeAutoStart, { once: true });
})();
