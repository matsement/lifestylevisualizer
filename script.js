/* ==========================================================================
   Lifestyle Visualizer — script.js
   ==========================================================================
   IMPORTANT: nothing in this file is medical logic. Every formula below is a
   deliberately simplified heuristic, loosely inspired by commonly cited
   general guidelines (step counts, sleep duration, hydration, exercise
   frequency), built only to drive a playful, bounded visualization.
   Real bodies depend on genetics, hormones, medical history and far more
   than can ever fit in a client-side slider.
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------------
     Tunable constants
  ------------------------------------------------------------------ */
  const WEEKS = [0, 4, 8, 12];
  const IMAGE_COUNT = 20;
  const IMAGE_EXT = 'jpg';        // change to 'png' here if your images are PNGs
  const TARGET_BMI = 22;          // general "healthy midpoint" reference (roughly the center of the commonly-cited 18.5-25 healthy BMI band)
  const MAX_WEEKLY_KG = 0.5;      // hard safety cap: never simulate faster than the commonly cited safe pace for intentional weight change (~0.5-1 kg/week)
  const HOMEOSTATIC_RATE_K = 0.03; // gentle secondary pull toward the healthy midpoint, mainly there to keep extreme starting points bounded/plausible

  const FACTOR_INFO = {
    steps: { title: 'Daily steps', text: 'More daily walking supports calorie balance and heart health. Around 8,000\u201310,000 steps a day is a commonly used target, but any increase over your current habit helps.' },
    exercise: { title: 'Exercise sessions', text: 'Regular structured movement, roughly 3\u20135 sessions a week, builds strength, fitness and a healthier body composition over time. More isn\u2019t automatically better \u2014 recovery matters too.' },
    sugar: { title: 'Sugary drinks or snacks', text: 'Frequent sugary drinks and snacks add quick calories with little nutrition and can make energy levels less stable. Cutting back gradually tends to stick better than cutting it all at once.' },
    wholefoods: { title: 'Whole, unprocessed food', text: 'Diets built more around vegetables, fruit, whole grains and lean proteins tend to be more filling per calorie, which can make other habits easier to sustain.' },
    water: { title: 'Water intake', text: 'Staying hydrated supports metabolism, digestion and energy levels. Roughly 2\u20133 liters a day is a reasonable general target for most adults.' },
    if: { title: 'Intermittent fasting', text: 'Time-restricted eating can help some people naturally land on fewer calories by shrinking the window in which they eat. It works through calorie balance, not a special metabolic effect, and it isn\u2019t required for progress.' },
    sleep: { title: 'Sleep', text: 'Consistent 7\u20139 hours of sleep supports the hormones that regulate appetite and recovery. Too little \u2014 or too much \u2014 sleep is linked with worse outcomes on average.' },
    stress: { title: 'Stress level', text: 'Ongoing high stress raises cortisol, which can affect appetite, sleep and fat storage patterns. Managing stress tends to make every other habit on this list easier.' },
    alcohol: { title: 'Alcohol', text: 'Alcohol adds calories and can quietly reduce sleep quality and recovery. Cutting back, especially on heavier drinking, tends to support most body composition goals.' },
    discipline: { title: 'Consistency', text: 'This represents how realistically you\u2019d stick with everything above. Modest habits kept for a full 12 weeks usually beat ambitious ones abandoned after 10 days.' }
  };

  const WEIGHTS = { steps: 14, exercise: 18, sugar: 14, wholefoods: 14, water: 8, sleep: 14, stress: 6, alcohol: 6, if: 6 };

  const DEFAULTS = {
    avatarSet: 'female',
    heightCm: 170,
    weightKg: 75,
    activityLevel: 'light',
    steps: 6000,
    exerciseDays: 2,
    sugarServings: 3,
    wholeFoodsPct: 50,
    waterLiters: 1.5,
    ifEnabled: false,
    ifWindowHours: 8,
    sleepHours: 7,
    stressLevel: 'medium',
    alcoholDrinks: 2,
    discipline: 50,
    // True once the person has interacted with any lifestyle/habit input.
    // Until then, those sliders just hold arbitrary placeholder values, so
    // the snapshot shouldn't present a confident-sounding 12-week trend
    // based on them.
    habitsTouched: false
  };

  const STORAGE_KEY = 'lv-state-v1';
  const THEME_KEY = 'lv-theme';

  /* ------------------------------------------------------------------
     DOM references
  ------------------------------------------------------------------ */
  const $ = (id) => document.getElementById(id);

  const dom = {
    body: document.body,
    themeToggle: $('themeToggle'),
    themeIcon: $('themeIcon'),

    heightRange: $('heightRange'), heightInput: $('heightInput'),
    weightRange: $('weightRange'), weightInput: $('weightInput'),
    activityLevel: $('activityLevel'),
    avatarButtons: Array.from(document.querySelectorAll('.segmented-btn[data-avatar]')),

    stepsRange: $('stepsRange'), stepsValue: $('stepsValue'),
    exerciseRange: $('exerciseRange'), exerciseValue: $('exerciseValue'),

    sugarRange: $('sugarRange'), sugarValue: $('sugarValue'),
    wholeFoodsRange: $('wholeFoodsRange'), wholeFoodsValue: $('wholeFoodsValue'),
    waterRange: $('waterRange'), waterValue: $('waterValue'),
    ifToggle: $('ifToggle'), ifWindowWrap: $('ifWindowWrap'), ifWindowRange: $('ifWindowRange'), ifWindowValue: $('ifWindowValue'),

    sleepRange: $('sleepRange'), sleepValue: $('sleepValue'),
    stressSelect: $('stressSelect'),

    alcoholRange: $('alcoholRange'), alcoholValue: $('alcoholValue'),
    disciplineRange: $('disciplineRange'), disciplineValue: $('disciplineValue'),

    randomizeBtn: $('randomizeBtn'), resetBtn: $('resetBtn'),
    learnMoreBody: $('learnMoreBody'),

    simContent: $('simContent'),
    compareToggleBtn: $('compareToggleBtn'),
    compareToggleBtnFull: $('compareToggleBtnFull'), compareToggleBtnShort: $('compareToggleBtnShort'),

    avatarStage: $('avatarStage'),
    avatarImgBase: $('avatarImgBase'), avatarImgBlend: $('avatarImgBlend'),
    avatarFallback: $('avatarFallback'), fallbackFilename: $('fallbackFilename'),
    hudReadout: $('hudReadout'),

    compareStage: $('compareStage'),
    compareBeforeImg: $('compareBeforeImg'), compareAfterImg: $('compareAfterImg'),
    compareAfterClip: $('compareAfterClip'), compareHandle: $('compareHandle'),
    compareWeekLabel: $('compareWeekLabel'),

    weekScrubber: $('weekScrubber'),
    timelineLabels: Array.from(document.querySelectorAll('[data-week-label]')),

    bmiValue: $('bmiValue'), bmiMarker: $('bmiMarker'),

    insightGreeting: $('insightGreeting'), insightSummary: $('insightSummary'), insightTip: $('insightTip')
  };

  /* ------------------------------------------------------------------
     State
  ------------------------------------------------------------------ */
  let state = Object.assign({}, DEFAULTS);
  let currentWeekIndex = 0;
  let compareMode = false;

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* private mode etc: ignore */ }
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) state = Object.assign({}, DEFAULTS, JSON.parse(raw));
    } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------------
     Core math
  ------------------------------------------------------------------ */
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function calcBMI(weightKg, heightCm) {
    const h = heightCm / 100;
    return weightKg / (h * h);
  }

  function bmiCategory(bmi) {
    if (bmi < 18.5) return { label: 'Underweight', key: 'under' };
    if (bmi < 25) return { label: 'Healthy range', key: 'healthy' };
    if (bmi < 30) return { label: 'Overweight', key: 'over' };
    return { label: 'Obese range', key: 'obese' };
  }

  function bmiToPercent(bmi) {
    const min = 15, max = 40;
    const c = clamp(bmi, min, max);
    return ((c - min) / (max - min)) * 100;
  }

  function scoreSteps(v) { return Math.round(clamp((v / 9000) * 100, 0, 100)); }
  function scoreExercise(v) { return Math.round(clamp((v / 5) * 100, 0, 100)); }
  function scoreSugar(v) { return Math.round(clamp(100 - (v / 8) * 100, 0, 100)); }
  function scoreWholeFoods(v) { return Math.round(clamp(v, 0, 100)); }
  function scoreWater(v) {
    if (v >= 2 && v <= 3) return 100;
    if (v < 2) return Math.round(clamp((v / 2) * 100, 0, 100));
    return Math.round(clamp(100 - (v - 3) * 20, 0, 100));
  }
  function scoreSleep(v) {
    if (v >= 7 && v <= 9) return 100;
    if (v < 7) return Math.round(clamp(100 - (7 - v) * 25, 0, 100));
    return Math.round(clamp(100 - (v - 9) * 20, 0, 100));
  }
  function scoreStress(v) { return { low: 100, medium: 60, high: 25 }[v]; }
  function scoreAlcohol(v) { return Math.round(clamp(100 - (v / 14) * 100, 0, 100)); }
  function scoreIF(enabled, windowHrs) {
    if (!enabled) return 50;
    if (windowHrs >= 6 && windowHrs <= 10) return 75;
    if (windowHrs < 6) return 60;
    return 55;
  }

  function computeScores(s) {
    return {
      steps: scoreSteps(s.steps),
      exercise: scoreExercise(s.exerciseDays),
      sugar: scoreSugar(s.sugarServings),
      wholefoods: scoreWholeFoods(s.wholeFoodsPct),
      water: scoreWater(s.waterLiters),
      sleep: scoreSleep(s.sleepHours),
      stress: scoreStress(s.stressLevel),
      alcohol: scoreAlcohol(s.alcoholDrinks),
      if: scoreIF(s.ifEnabled, s.ifWindowHours)
    };
  }

  function overallScore(scores) {
    let sum = 0, total = 0;
    Object.keys(WEIGHTS).forEach((k) => { sum += scores[k] * WEIGHTS[k]; total += WEIGHTS[k]; });
    return sum / total;
  }

  function weakestFactor(scores) {
    let minKey = null, minVal = 101;
    Object.keys(scores).forEach((k) => { if (scores[k] < minVal) { minVal = scores[k]; minKey = k; } });
    return minKey;
  }

  // Simulates weight week by week. The primary driver is sustained habit
  // quality — a rough stand-in for calorie balance, since that's what
  // actually drives weight change over weeks, regardless of where someone
  // is starting from. A gentler secondary term nudges things toward a
  // healthy BMI midpoint, mainly to keep extreme starting points bounded
  // and plausible rather than drifting indefinitely. Both are capped at
  // MAX_WEEKLY_KG, a commonly cited safe pace. Deliberately simplified and
  // bounded — not a clinical model.
  function simulateWeeks(s) {
    const scores = computeScores(s);
    const quality = (overallScore(scores) - 50) / 50; // -1 (poor habits) .. 1 (excellent habits)
    const disciplineFactor = s.discipline / 100;

    let simWeight = s.weightKg;
    const results = { 0: simWeight };
    for (let week = 1; week <= 12; week++) {
      const bmiNow = calcBMI(simWeight, s.heightCm);
      const habitDrive = -quality * disciplineFactor * MAX_WEEKLY_KG;
      const gap = clamp(bmiNow - TARGET_BMI, -8, 8);
      const homeostaticPull = -gap * HOMEOSTATIC_RATE_K;
      let delta = clamp(habitDrive + homeostaticPull, -MAX_WEEKLY_KG, MAX_WEEKLY_KG);
      simWeight = Math.max(35, simWeight + delta);
      if (WEEKS.includes(week)) results[week] = simWeight;
    }
    return { results, scores, quality, disciplineFactor };
  }

  // Float image index (1..IMAGE_COUNT), driven purely by BMI so the mapping
  // is fully predictable: BMI 15 (very underweight) -> index 1 (skinniest
  // photo), BMI 40+ (very obese) -> index IMAGE_COUNT (heaviest photo), with
  // every BMI in between landing on a proportional point along that range.
  function imageIndexFor(weightKg, heightCm) {
    const bmi = calcBMI(weightKg, heightCm);
    const pos = bmiToPercent(bmi);
    return 1 + (pos / 100) * (IMAGE_COUNT - 1);
  }

  function imagePath(set, index) {
    const n = String(clamp(Math.round(index), 1, IMAGE_COUNT)).padStart(2, '0');
    return `images/${set}_${n}.${IMAGE_EXT}`;
  }

  function formatLiters(v) { return `${Number(v).toFixed(2).replace(/\.?0+$/, '')} L`; }

  /* ------------------------------------------------------------------
     Rendering
  ------------------------------------------------------------------ */
  function syncPair(rangeEl, numberEl, value) {
    if (rangeEl) rangeEl.value = value;
    if (numberEl) numberEl.value = value;
  }

  function updateAvatarStage(set, floatIndex) {
    const floor = clamp(Math.floor(floatIndex), 1, IMAGE_COUNT);
    const ceil = clamp(floor + 1, 1, IMAGE_COUNT);
    const fraction = floatIndex - floor;

    dom.fallbackFilename.textContent = `${set}_${String(floor).padStart(2, '0')}.${IMAGE_EXT}`;

    dom.avatarImgBase.onload = () => { dom.avatarFallback.hidden = true; dom.avatarImgBase.style.opacity = '1'; };
    dom.avatarImgBase.onerror = () => { dom.avatarFallback.hidden = false; dom.avatarImgBase.style.opacity = '0'; dom.avatarImgBlend.style.opacity = '0'; };
    dom.avatarImgBase.alt = `${set} body reference ${floor} of ${IMAGE_COUNT}`;
    dom.avatarImgBase.src = imagePath(set, floor);

    dom.avatarImgBlend.onerror = () => { dom.avatarImgBlend.style.opacity = '0'; };
    dom.avatarImgBlend.alt = '';
    dom.avatarImgBlend.src = imagePath(set, ceil);
    dom.avatarImgBlend.style.opacity = String(fraction);
  }

  function renderHud(s, scores) {
    const lines = [
      `STEPS   ${String(s.steps).padStart(6, ' ')}`,
      `SLEEP   ${s.sleepHours.toFixed(1)} h`,
      `WATER   ${Number(s.waterLiters).toFixed(2)} L`,
      `TRAIN   ${s.exerciseDays}x / wk`,
      `SCORE   ${Math.round(overallScore(scores))} / 100`
    ];
    dom.hudReadout.textContent = lines.join('\n');
  }

  function renderBmiBar(bmi) {
    const pct = bmiToPercent(bmi);
    dom.bmiMarker.style.left = `${pct}%`;
    const cat = bmiCategory(bmi);
    dom.bmiValue.textContent = `${bmi.toFixed(1)} \u2014 ${cat.label}`;
  }

  function renderInsight(s, sim) {
    if (!s.habitsTouched) {
      dom.insightSummary.textContent = 'Fill in your habits below and this will turn into a personalized 12-week trend.';
      dom.insightTip.textContent = '';
      return;
    }

    const week12Weight = sim.results[12];
    const week12Bmi = calcBMI(week12Weight, s.heightCm);
    const week12Cat = bmiCategory(week12Bmi);
    const diff = week12Weight - s.weightKg;
    const diffAbs = Math.abs(diff).toFixed(1);

    let trendSentence;
    if (Math.abs(diff) < 0.3) {
      trendSentence = 'Keeping this exact scenario up for 12 weeks barely moves the needle \u2014 your simulated weight stays close to where it is now.';
    } else if (diff < 0) {
      trendSentence = `Keeping this scenario up for 12 weeks trends toward roughly ${diffAbs} kg lighter, landing around the ${week12Cat.label.toLowerCase()}.`;
    } else {
      trendSentence = `Keeping this scenario up for 12 weeks trends toward roughly ${diffAbs} kg heavier, landing around the ${week12Cat.label.toLowerCase()}.`;
    }
    dom.insightSummary.textContent = trendSentence;

    const weak = weakestFactor(sim.scores);
    const info = FACTOR_INFO[weak];
    dom.insightTip.textContent = info ? `Your biggest lever right now looks like \u201c${info.title}\u201d \u2014 small, steady improvement there would likely move the simulation the most.` : '';
  }

  function currentWeek() { return WEEKS[currentWeekIndex]; }

  function render() {
    const sim = simulateWeeks(state);
    const week = currentWeek();
    const weightAtWeek = sim.results[week];
    const bmiAtWeek = calcBMI(weightAtWeek, state.heightCm);
    const floatIndex = imageIndexFor(weightAtWeek, state.heightCm);

    updateAvatarStage(state.avatarSet, floatIndex);
    renderHud(state, sim.scores);
    renderBmiBar(bmiAtWeek);
    renderInsight(state, sim);

    dom.timelineLabels.forEach((el) => {
      el.classList.toggle('is-active', Number(el.dataset.weekLabel) === week);
    });

    if (compareMode) {
      const nowIndex = imageIndexFor(sim.results[0], state.heightCm);
      dom.compareBeforeImg.src = imagePath(state.avatarSet, Math.round(nowIndex));
      dom.compareAfterImg.src = imagePath(state.avatarSet, Math.round(floatIndex));
      dom.compareWeekLabel.textContent = String(week);
    }

    saveState();
  }

  /* ------------------------------------------------------------------
     Wiring: basics
  ------------------------------------------------------------------ */
  dom.heightRange.addEventListener('input', () => { state.heightCm = Number(dom.heightRange.value); syncPair(dom.heightRange, dom.heightInput, state.heightCm); render(); });
  dom.heightInput.addEventListener('input', () => {
    // Don't rewrite the field's own value while the person is still typing —
    // doing so on every keystroke was stomping on digits as soon as an
    // in-progress number (e.g. the "1" in "165") fell outside the min/max,
    // making it impossible to type a new value at all. Live-update the
    // slider + preview, but only clamp and resync the text field on blur.
    if (dom.heightInput.value === '') return;
    const raw = Number(dom.heightInput.value);
    if (Number.isNaN(raw)) return;
    state.heightCm = clamp(raw, 120, 220);
    dom.heightRange.value = state.heightCm;
    render();
  });
  dom.heightInput.addEventListener('blur', () => {
    const v = clamp(Number(dom.heightInput.value) || DEFAULTS.heightCm, 120, 220);
    state.heightCm = v; syncPair(dom.heightRange, dom.heightInput, v); render();
  });
  dom.weightRange.addEventListener('input', () => { state.weightKg = Number(dom.weightRange.value); syncPair(dom.weightRange, dom.weightInput, state.weightKg); render(); });
  dom.weightInput.addEventListener('input', () => {
    if (dom.weightInput.value === '') return;
    const raw = Number(dom.weightInput.value);
    if (Number.isNaN(raw)) return;
    state.weightKg = clamp(raw, 35, 180);
    dom.weightRange.value = state.weightKg;
    render();
  });
  dom.weightInput.addEventListener('blur', () => {
    const v = clamp(Number(dom.weightInput.value) || DEFAULTS.weightKg, 35, 180);
    state.weightKg = v; syncPair(dom.weightRange, dom.weightInput, v); render();
  });

  dom.activityLevel.addEventListener('change', () => { state.activityLevel = dom.activityLevel.value; render(); });

  dom.avatarButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      dom.avatarButtons.forEach((b) => { b.classList.remove('is-active'); b.setAttribute('aria-checked', 'false'); });
      btn.classList.add('is-active'); btn.setAttribute('aria-checked', 'true');
      state.avatarSet = btn.dataset.avatar;
      render();
    });
  });

  /* ------------------------------------------------------------------
     Wiring: lifestyle sliders
  ------------------------------------------------------------------ */
  dom.stepsRange.addEventListener('input', () => { state.steps = Number(dom.stepsRange.value); dom.stepsValue.textContent = state.steps.toLocaleString('en-US'); render(); });
  dom.exerciseRange.addEventListener('input', () => { state.exerciseDays = Number(dom.exerciseRange.value); dom.exerciseValue.textContent = state.exerciseDays; render(); });

  dom.sugarRange.addEventListener('input', () => { state.sugarServings = Number(dom.sugarRange.value); dom.sugarValue.textContent = state.sugarServings; render(); });
  dom.wholeFoodsRange.addEventListener('input', () => { state.wholeFoodsPct = Number(dom.wholeFoodsRange.value); dom.wholeFoodsValue.textContent = `${state.wholeFoodsPct}%`; render(); });
  dom.waterRange.addEventListener('input', () => { state.waterLiters = Number(dom.waterRange.value); dom.waterValue.textContent = formatLiters(state.waterLiters); render(); });

  dom.ifToggle.addEventListener('change', () => {
    state.ifEnabled = dom.ifToggle.checked;
    dom.ifWindowWrap.hidden = !state.ifEnabled;
    render();
  });
  dom.ifWindowRange.addEventListener('input', () => { state.ifWindowHours = Number(dom.ifWindowRange.value); dom.ifWindowValue.textContent = `${state.ifWindowHours} hours`; render(); });

  dom.sleepRange.addEventListener('input', () => { state.sleepHours = Number(dom.sleepRange.value); dom.sleepValue.textContent = `${state.sleepHours} hours`; render(); });
  dom.stressSelect.addEventListener('change', () => { state.stressLevel = dom.stressSelect.value; render(); });

  dom.alcoholRange.addEventListener('input', () => { state.alcoholDrinks = Number(dom.alcoholRange.value); dom.alcoholValue.textContent = state.alcoholDrinks; render(); });
  dom.disciplineRange.addEventListener('input', () => { state.discipline = Number(dom.disciplineRange.value); dom.disciplineValue.textContent = `${state.discipline}%`; render(); });

  // Any interaction with a lifestyle/habit input counts as "filling in a
  // scenario" -- from that point on the snapshot can speak with confidence.
  document.querySelectorAll('[data-track="lifestyle"]').forEach((el) => {
    el.addEventListener('input', () => { state.habitsTouched = true; });
    el.addEventListener('change', () => { state.habitsTouched = true; });
  });

  /* ------------------------------------------------------------------
     Timeline & compare
  ------------------------------------------------------------------ */
  dom.weekScrubber.addEventListener('input', () => { currentWeekIndex = Number(dom.weekScrubber.value); render(); });

  function setCompareButtonLabel(isCompareMode) {
    dom.compareToggleBtnFull.textContent = isCompareMode ? 'Back to single view' : 'Compare now vs. later';
    dom.compareToggleBtnShort.textContent = isCompareMode ? 'Back' : 'Compare';
  }

  dom.compareToggleBtn.addEventListener('click', () => {
    compareMode = !compareMode;
    dom.compareStage.hidden = !compareMode;
    dom.avatarStage.hidden = compareMode;
    setCompareButtonLabel(compareMode);
    render();
  });

  function setCompareSplit(pct) {
    const c = clamp(pct, 0, 100);
    dom.compareAfterClip.style.clipPath = `inset(0 0 0 ${c}%)`;
    dom.compareHandle.style.left = `${c}%`;
    dom.compareHandle.setAttribute('aria-valuenow', String(Math.round(c)));
  }

  (function wireCompareDrag() {
    let dragging = false;
    let activePointerId = null;

    function posToPct(clientX) {
      const rect = dom.compareStage.getBoundingClientRect();
      return ((clientX - rect.left) / rect.width) * 100;
    }

    function endDrag() {
      if (activePointerId !== null && dom.compareHandle.hasPointerCapture && dom.compareHandle.hasPointerCapture(activePointerId)) {
        dom.compareHandle.releasePointerCapture(activePointerId);
      }
      dragging = false;
      activePointerId = null;
    }

    dom.compareHandle.addEventListener('pointerdown', (e) => {
      dragging = true;
      activePointerId = e.pointerId;
      // Pointer capture keeps every subsequent move routed to the handle
      // itself (even once the finger drifts off it), and combined with
      // touch-action: none in the CSS, stops the browser from ever
      // starting its own vertical-scroll gesture on this element.
      if (dom.compareHandle.setPointerCapture) dom.compareHandle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    dom.compareHandle.addEventListener('pointermove', (e) => {
      if (!dragging || e.pointerId !== activePointerId) return;
      setCompareSplit(posToPct(e.clientX));
      e.preventDefault();
    });
    dom.compareHandle.addEventListener('pointerup', endDrag);
    dom.compareHandle.addEventListener('pointercancel', endDrag);
    dom.compareHandle.addEventListener('keydown', (e) => {
      const current = Number(dom.compareHandle.getAttribute('aria-valuenow')) || 50;
      if (e.key === 'ArrowLeft') setCompareSplit(current - 5);
      if (e.key === 'ArrowRight') setCompareSplit(current + 5);
    });
  })();
  setCompareSplit(50);

  /* ------------------------------------------------------------------
     Reset / randomize / export
  ------------------------------------------------------------------ */
  function applyStateToInputs() {
    syncPair(dom.heightRange, dom.heightInput, state.heightCm);
    syncPair(dom.weightRange, dom.weightInput, state.weightKg);
    dom.activityLevel.value = state.activityLevel;

    dom.avatarButtons.forEach((b) => {
      const isActive = b.dataset.avatar === state.avatarSet;
      b.classList.toggle('is-active', isActive);
      b.setAttribute('aria-checked', String(isActive));
    });

    dom.stepsRange.value = state.steps; dom.stepsValue.textContent = state.steps.toLocaleString('en-US');
    dom.exerciseRange.value = state.exerciseDays; dom.exerciseValue.textContent = state.exerciseDays;
    dom.sugarRange.value = state.sugarServings; dom.sugarValue.textContent = state.sugarServings;
    dom.wholeFoodsRange.value = state.wholeFoodsPct; dom.wholeFoodsValue.textContent = `${state.wholeFoodsPct}%`;
    dom.waterRange.value = state.waterLiters; dom.waterValue.textContent = formatLiters(state.waterLiters);
    dom.ifToggle.checked = state.ifEnabled; dom.ifWindowWrap.hidden = !state.ifEnabled;
    dom.ifWindowRange.value = state.ifWindowHours; dom.ifWindowValue.textContent = `${state.ifWindowHours} hours`;
    dom.sleepRange.value = state.sleepHours; dom.sleepValue.textContent = `${state.sleepHours} hours`;
    dom.stressSelect.value = state.stressLevel;
    dom.alcoholRange.value = state.alcoholDrinks; dom.alcoholValue.textContent = state.alcoholDrinks;
    dom.disciplineRange.value = state.discipline; dom.disciplineValue.textContent = `${state.discipline}%`;
  }

  dom.resetBtn.addEventListener('click', () => {
    state = Object.assign({}, DEFAULTS);
    currentWeekIndex = 0;
    dom.weekScrubber.value = 0;
    compareMode = false;
    dom.compareStage.hidden = true;
    dom.avatarStage.hidden = false;
    setCompareButtonLabel(false);
    applyStateToInputs();
    render();
  });

  dom.randomizeBtn.addEventListener('click', () => {
    state.steps = Math.round((Math.random() * 16000 + 2000) / 500) * 500;
    state.exerciseDays = Math.round(Math.random() * 7);
    state.sugarServings = Math.round(Math.random() * 8);
    state.wholeFoodsPct = Math.round((Math.random() * 100) / 5) * 5;
    state.waterLiters = Math.round((Math.random() * 3.5 + 0.25) / 0.25) * 0.25;
    state.ifEnabled = Math.random() > 0.6;
    state.ifWindowHours = Math.round((Math.random() * 8 + 4) / 0.5) * 0.5;
    state.sleepHours = Math.round((Math.random() * 5 + 4.5) / 0.5) * 0.5;
    state.stressLevel = ['low', 'medium', 'high'][Math.floor(Math.random() * 3)];
    state.alcoholDrinks = Math.round(Math.random() * 16);
    state.discipline = Math.round((Math.random() * 100) / 5) * 5;
    state.habitsTouched = true;
    applyStateToInputs();
    render();
  });

  /* ------------------------------------------------------------------
     Theme
  ------------------------------------------------------------------ */
  function applyTheme(theme) {
    dom.body.setAttribute('data-theme', theme);
    dom.themeIcon.textContent = theme === 'dark' ? '\u2600' : '\u263E';
    dom.themeToggle.setAttribute('aria-pressed', String(theme === 'dark'));
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* ignore */ }
  }
  dom.themeToggle.addEventListener('click', () => {
    const current = dom.body.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

  /* ------------------------------------------------------------------
     "Learn more" content
  ------------------------------------------------------------------ */
  function buildLearnMore() {
    const frag = document.createDocumentFragment();
    Object.keys(FACTOR_INFO).forEach((key) => {
      const info = FACTOR_INFO[key];
      const h4 = document.createElement('h4'); h4.textContent = info.title;
      const p = document.createElement('p'); p.textContent = info.text;
      frag.appendChild(h4); frag.appendChild(p);
    });
    dom.learnMoreBody.appendChild(frag);
  }

  /* ------------------------------------------------------------------
     Init
  ------------------------------------------------------------------ */
  function init() {
    let savedTheme = 'light';
    try { savedTheme = localStorage.getItem(THEME_KEY) || 'light'; } catch (e) { /* ignore */ }
    applyTheme(savedTheme);

    loadState();
    applyStateToInputs();
    buildLearnMore();
    setCompareButtonLabel(false);

    render();
  }

  init();
})();
