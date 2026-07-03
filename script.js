// script.js - enhanced visualization and scenario engine
const qs = s => document.querySelector(s);
const get = id => qs('#'+id);

// inputs
const nameEl = get('name');
const heightEl = get('height');
const weightEl = get('weight');
const genderEl = get('gender');
const stepsEl = get('steps');
const sleepEl = get('sleep');
const waterEl = get('water');
const sportDaysEl = get('sportDays');
const sportDaysVal = get('sportDaysVal');
const dietPlanEl = get('dietPlan');
const sugarEl = get('sugar');

const scenarioButtons = document.querySelectorAll('.scenario');
const avatarNowImg = get('avatarNowImg');
const avatarFutureImg = get('avatarFutureImg');
const avatarNowSVG = qs('#avatarNowSVG');
const avatarFutureSVG = qs('#avatarFutureSVG');
const torsoNow = qs('#torsoNow');
const torsoFuture = qs('#torsoFuture');
const bmiNow = get('bmiNow');
const bmiInterpret = get('bmiInterpret');
const weightNowEl = get('weightNow');
const weightFutureEl = get('weightFuture');
const weeklyPctEl = get('weeklyPct');
const greetName = get('greetName');
const futureLabel = get('futureLabel');

const compareBtn = get('compare');
const resetBtn = get('reset');
const randomizeBtn = get('randomize');
const exportBtn = get('export');

let currentWeeks = 0;
let compareMode = false;
const IMAGE_COUNT = 20; // expects up to 20 per gender

function init(){
  attachEvents();
  loadAvatarImages();
  updateAll();
}

function attachEvents(){
  [nameEl, heightEl, weightEl, genderEl, stepsEl, sleepEl, waterEl, sportDaysEl, dietPlanEl, sugarEl].forEach(el=>{
    el.addEventListener('input', ()=>{ updateAll(); });
    el.addEventListener('change', ()=>{ updateAll(); });
  });

  sportDaysEl.addEventListener('input', ()=>{ sportDaysVal.textContent = sportDaysEl.value });

  scenarioButtons.forEach(btn=>btn.addEventListener('click', ()=>{
    scenarioButtons.forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentWeeks = parseInt(btn.dataset.weeks,10);
    futureLabel.textContent = btn.textContent;
    animateToScenario();
  }));

  compareBtn.addEventListener('click', ()=>{ compareMode = !compareMode; compareBtn.textContent = compareMode? 'Hide Comparison' : 'Compare Now / Scenario'; toggleCompare(); });
  resetBtn.addEventListener('click', resetAll);
  randomizeBtn.addEventListener('click', randomize);
  exportBtn.addEventListener('click', exportPNG);
}

function readInputs(){
  return {
    name: nameEl.value || '',
    height: Number(heightEl.value),
    weight: Number(weightEl.value),
    gender: genderEl.value,
    steps: Number(stepsEl.value),
    sleep: Number(sleepEl.value),
    water: Number(waterEl.value),
    sportDays: Number(sportDaysEl.value),
    dietPlan: dietPlanEl.value,
    sugar: sugarEl.value
  }
}

// A compact, science-inspired heuristic to estimate weekly weight change (very approximate)
function computeFutureWeight(state, weeks){
  // Baseline: assume maintenance when dietPlan=maintain and average activity
  // Convert steps to extra calories: roughly 0.04 kcal per step for average person (very rough)
  const stepCals = state.steps * 0.04; // e.g., 5000 steps -> 200 kcal/day
  const weeklyStepCals = stepCals * 7;

  // Sleep: poor sleep reduces metabolic efficiency; treat 7-9h as optimal
  const sleepFactor = (state.sleep >=7 && state.sleep <=9) ? 1 : (state.sleep < 5 ? 0.95 : 0.98);

  // Water: more water slightly helps satiety; small effect
  const waterFactor = Math.max(0.95, Math.min(1.02, 1 + (state.water - 2) * 0.01));

  // Diet plan baseline weekly calorie delta
  const dietMap = {
    'maintain': 0,
    'moderate_loss': -350, // ~0.35 kg/week (3500 kcal per 0.45kg is typical rule-of-thumb)
    'aggressive_loss': -700, // ~0.7 kg/week
    'build_muscle': +250,
    'balanced_wellness': -150
  };
  let dailyDietDelta = (dietMap[state.dietPlan] || 0) / 7; // daily kcal

  // Sugar reduction: modest calorie improvements
  const sugarMap = {
    'nochange': 0,
    'less_drinks': -100,
    'cut_sweets': -200,
    'lowadded': -300
  };
  dailyDietDelta += (sugarMap[state.sugar] || 0) / 7;

  // Sport days: add extra burn
  const sportBurnPerSession = 300; // rough average
  const sportWeeklyBurn = state.sportDays * sportBurnPerSession;

  // Combine daily effects into weekly kcal delta
  const weeklyDelta = (dailyDietDelta * 7) + weeklyStepCals + sportWeeklyBurn + ( (sleepFactor - 1) * 100 * 7 );
  // waterFactor slightly scales effect
  const adjustedWeeklyDelta = weeklyDelta * waterFactor;

  // Convert kcal to kg: 7700 kcal ~ 1 kg (approx)
  const weeklyKg = adjustedWeeklyDelta / 7700;
  const futureWeight = state.weight + weeklyKg * weeks;

  // small safety caps
  const cappedFuture = Math.max(35, Math.min(220, Number(futureWeight.toFixed(1))));
  return { futureWeight: cappedFuture, weeklyKg: Number((weeklyKg).toFixed(3)), weeklyKcal: Math.round(adjustedWeeklyDelta) };
}

function bmi(weight, heightCm){
  const h = heightCm/100;
  if(!h || h<=0) return null;
  return Number((weight/(h*h)).toFixed(1));
}

function bmiCategory(bmiVal){
  if(bmiVal === null) return {cat:'Unknown', color:'gray'};
  if(bmiVal < 18.5) return {cat:'Underweight', color:'var(--under)'};
  if(bmiVal < 25) return {cat:'Normal', color:'var(--normal)'};
  if(bmiVal < 30) return {cat:'Overweight', color:'var(--over)'};
  return {cat:'Obese', color:'var(--obese)'};
}

function renderNow(state){
  const b = bmi(state.weight, state.height);
  bmiNow.textContent = b !== null ? b : '—';
  weightNowEl.textContent = state.weight || '—';
  greetName.textContent = state.name ? state.name : 'there';

  // show avatar image if available
  setAvatarImage(avatarNowImg, state.gender, 'now');

  // map to torso size on fallback SVG
  const torsoRx = mapRange(state.weight, 40, 140, 18, 46);
  const torsoRy = mapRange(state.weight, 40, 140, 36, 86);
  if(torsoNow) { torsoNow.setAttribute('rx', torsoRx); torsoNow.setAttribute('ry', torsoRy); }

  // BMI panel interpretation
  const cat = bmiCategory(b);
  bmiInterpret.textContent = b ? `${cat.cat} — ${interpretationText(cat.cat)}` : 'Fill in height and weight for personalized guidance.';
  positionBMImarker(b);
}

function renderFuture(state, weeks){
  const res = computeFutureWeight(state, weeks);
  weightFutureEl.textContent = res.futureWeight;
  weeklyPctEl.textContent = res.weeklyKg !== undefined ? `${res.weeklyKg.toFixed(3)} kg/week (~${res.weeklyKcal} kcal/week)` : '—';

  // update avatar: choose image that roughly matches gender and BMI
  setAvatarImage(avatarFutureImg, state.gender, 'future', res.futureWeight);

  const b = bmi(res.futureWeight, state.height);

  // visual mapping for fallback
  const torsoRx = mapRange(res.futureWeight, 40, 140, 18, 46);
  const torsoRy = mapRange(res.futureWeight, 40, 140, 36, 86);
  if(torsoFuture) { torsoFuture.setAttribute('rx', torsoRx); torsoFuture.setAttribute('ry', torsoRy); }
}

function interpretationText(cat){
  switch(cat){
    case 'Underweight': return 'Consider consulting a professional to assess healthy weight gain.';
    case 'Normal': return 'Your BMI sits in the typical healthy range for most adults.';
    case 'Overweight': return 'A moderate, sustainable plan can move you toward the normal range.';
    case 'Obese': return 'Consider seeking medical guidance; gradual changes are safer and effective.';
    default: return '';
  }
}

function positionBMImarker(bmiVal){
  const marker = get('bmiMarker');
  if(!marker) return;
  if(!bmiVal){ marker.style.left = '2%'; marker.style.opacity = 0.4; return; }
  // Map BMI 12..40 to 2%..98%
  const t = (Math.max(12, Math.min(40, bmiVal)) - 12) / (40-12);
  marker.style.left = (2 + t*96) + '%';
  marker.style.opacity = 1;
}

function animateToScenario(){ updateAll(); }

function toggleCompare(){
  if(compareMode){
    avatarNowImg.style.opacity = 0.5; avatarNowSVG.style.opacity = 0.5;
    avatarFutureImg.style.boxShadow = '0 12px 40px rgba(20,40,80,0.15)';
  } else {
    avatarNowImg.style.opacity = 1; avatarNowSVG.style.opacity = 1;
    avatarFutureImg.style.boxShadow = 'none';
  }
}

function resetAll(){
  nameEl.value = '';
  heightEl.value = 175; weightEl.value = 80; genderEl.value = 'neutral';
  stepsEl.value = 4000; sleepEl.value = 7; waterEl.value = 2; sportDaysEl.value = 2; sportDaysVal.textContent = 2;
  dietPlanEl.value = 'maintain'; sugarEl.value = 'nochange';
  scenarioButtons.forEach(b=>b.classList.remove('active')); scenarioButtons[0].classList.add('active'); currentWeeks = 0; futureLabel.textContent = 'Scenario'; compareMode = false; compareBtn.textContent = 'Compare Now / Scenario';
  updateAll();
}

function randomize(){
  heightEl.value = 150 + Math.floor(Math.random()*60);
  weightEl.value = 50 + Math.floor(Math.random()*70);
  genderEl.value = ['neutral','male','female'][Math.floor(Math.random()*3)];
  stepsEl.value = Math.floor(Math.random()*12000);
  sleepEl.value = (6 + Math.floor(Math.random()*4));
  waterEl.value = (1 + Math.floor(Math.random()*5));
  sportDaysEl.value = Math.floor(Math.random()*8); sportDaysVal.textContent = sportDaysEl.value;
  dietPlanEl.value = ['maintain','moderate_loss','aggressive_loss','build_muscle','balanced_wellness'][Math.floor(Math.random()*5)];
  sugarEl.value = ['nochange','less_drinks','cut_sweets','lowadded'][Math.floor(Math.random()*4)];
  updateAll();
}

// Avatar image helpers
function setAvatarImage(imgEl, gender, when='now', weightOverride){
  // pick index based on gender and (optionally) weight/BMI to provide variety
  let idx = 1;
  if(weightOverride){
    // map weight to 1..IMAGE_COUNT
    idx = Math.round(mapRange(weightOverride, 40, 120, 1, IMAGE_COUNT));
    idx = Math.max(1, Math.min(IMAGE_COUNT, idx));
  } else {
    idx = Math.floor(1 + Math.random()*IMAGE_COUNT);
  }
  const g = (gender==='male' || gender==='female') ? gender : 'neutral';
  const path = g === 'neutral' ? `images/neutral/${idx}.jpg` : `images/${g}/${idx}.jpg`;

  // Try to load image; if it fails we'll keep the fallback SVG visible
  imgEl.onload = ()=>{
    imgEl.style.display = 'block';
    if(when==='now'){ avatarNowSVG.style.display = 'none'; } else { avatarFutureSVG.style.display = 'none'; }
  };
  imgEl.onerror = ()=>{
    imgEl.style.display = 'none';
    if(when==='now'){ avatarNowSVG.style.display = 'block'; } else { avatarFutureSVG.style.display = 'block'; }
  };
  imgEl.src = path;
}

function loadAvatarImages(){
  // pre-seed img tags with conservative defaults; actual images will be set on render
  avatarNowImg.style.display = 'none'; avatarFutureImg.style.display = 'none';
}

function exportPNG(){
  // export the future avatar (image or fallback SVG) as PNG
  const img = avatarFutureImg;
  const svg = avatarFutureSVG;
  const canvas = document.createElement('canvas');
  canvas.width = 900; canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height);

  if(img && img.src && img.style.display !== 'none'){
    const tmp = new Image();
    tmp.crossOrigin = 'anonymous';
    tmp.onload = ()=>{
      ctx.drawImage(tmp,0,0,canvas.width,canvas.height);
      downloadCanvas(canvas);
    };
    tmp.onerror = ()=>{ // fallback to svg
      drawSVGToCanvas(svg, canvas, ctx);
    };
    tmp.src = img.src;
  } else {
    drawSVGToCanvas(svg, canvas, ctx);
  }
}

function drawSVGToCanvas(svgEl, canvas, ctx){
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgEl);
  const blob = new Blob([svgString], {type: 'image/svg+xml;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const tmp = new Image();
  tmp.onload = ()=>{
    ctx.drawImage(tmp,0,0,canvas.width,canvas.height);
    URL.revokeObjectURL(url);
    downloadCanvas(canvas);
  };
  tmp.onerror = ()=>{ alert('Export failed: could not render image.'); };
  tmp.src = url;
}

function downloadCanvas(canvas){
  const a = document.createElement('a');
  a.download = `lifestyle-scenario-week${currentWeeks}.png`;
  a.href = canvas.toDataURL('image/png');
  a.click();
}

// helpers
function mapRange(v, inMin, inMax, outMin, outMax){
  const t = isNaN(v) ? 0.5 : Math.max(0, Math.min(1, (v - inMin)/(inMax - inMin)));
  return outMin + (outMax - outMin)*t;
}

function updateAll(){
  const state = readInputs();
  renderNow(state);
  renderFuture(state, currentWeeks);
}

init();
