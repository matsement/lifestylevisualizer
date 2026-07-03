// script.js - visualization and simple scenario engine
const qs = s => document.querySelector(s);
const get = id => qs('#'+id);

// inputs
const heightEl = get('height');
const weightEl = get('weight');
const genderEl = get('gender');
const activityEl = get('activity');
const ifastingEl = get('ifasting');
const ifastingIntensityEl = get('ifastingIntensity');
const sugarEl = get('sugar');
const sportDaysEl = get('sportDays');
const sportDaysVal = get('sportDaysVal');
const disciplineEl = get('discipline');
const disciplineVal = get('disciplineVal');

const scenarioButtons = document.querySelectorAll('.scenario');
const avatarNow = qs('#avatarNow');
const avatarFuture = qs('#avatarFuture');
const torsoNow = qs('#torsoNow');
const torsoFuture = qs('#torsoFuture');
const bmiNow = get('bmiNow');
const weightFutureEl = get('weightFuture');
const archetypeEl = get('archetype');
const futureLabel = get('futureLabel');

const compareBtn = get('compare');
const resetBtn = get('reset');
const randomizeBtn = get('randomize');
const exportBtn = get('export');

let currentWeeks = 0;
let compareMode = false;

function init(){
  attachEvents();
  updateAll();
}

function attachEvents(){
  [heightEl, weightEl, genderEl, activityEl, ifastingEl, ifastingIntensityEl, sugarEl, sportDaysEl, disciplineEl].forEach(el=>{
    el.addEventListener('input', ()=>{ updateAll(); });
    el.addEventListener('change', ()=>{ updateAll(); });
  });

  sportDaysEl.addEventListener('input', ()=>{ sportDaysVal.textContent = sportDaysEl.value });
  disciplineEl.addEventListener('input', ()=>{ disciplineVal.textContent = disciplineEl.value });

  scenarioButtons.forEach(btn=>btn.addEventListener('click', ()=>{
    scenarioButtons.forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentWeeks = parseInt(btn.dataset.weeks,10);
    futureLabel.textContent = `Week ${currentWeeks}`;
    animateToScenario();
  }));

  compareBtn.addEventListener('click', ()=>{ compareMode = !compareMode; compareBtn.textContent = compareMode? 'Hide Comparison' : 'Compare Now / Scenario'; toggleCompare(); });
  resetBtn.addEventListener('click', resetAll);
  randomizeBtn.addEventListener('click', randomize);
  exportBtn.addEventListener('click', exportPNG);
}

function updateAll(){
  const state = readInputs();
  renderNow(state);
  renderFuture(state, currentWeeks);
}

function readInputs(){
  return {
    height: Number(heightEl.value),
    weight: Number(weightEl.value),
    gender: genderEl.value,
    activity: activityEl.value,
    ifasting: ifastingEl.checked,
    ifastingIntensity: Number(ifastingIntensityEl.value)/100,
    sugar: sugarEl.value,
    sportDays: Number(sportDaysEl.value),
    discipline: Number(disciplineEl.value)/100
  }
}

// Simple scenario engine: computes weight change over weeks based on heuristics
function computeFutureWeight(state, weeks){
  // baseline metabolic factor by activity
  const activityFactor = state.activity === 'high' ? 1.05 : state.activity === 'low' ? 0.95 : 1.0;

  // discipline and sport effect: more discipline and sport helps create calorie deficit
  const disciplineEffect = (state.discipline - 0.5) * 0.4; // -0.2 .. +0.2
  const sportEffect = (state.sportDays / 7 - 0.25) * 0.25; // roughly -0.062..+0.25

  // fasting and sugar
  const fastingEffect = state.ifasting ? (0.05 * state.ifastingIntensity) : 0;
  const sugarEffect = state.sugar === 'strict' ? 0.06 : state.sugar === 'medium' ? 0.02 : state.sugar === 'low' ? 0.035 : 0;

  // total weekly percent change heuristic (positive means weight gain)
  // start with a mild tendency relative to discipline & activity
  let weeklyPct = -disciplineEffect - sportEffect - fastingEffect - sugarEffect;

  // activity slightly counteracts discipline if very high
  weeklyPct *= activityFactor;

  // cap extreme values
  weeklyPct = Math.max(-0.06, Math.min(0.06, weeklyPct));

  // weight progression exponential-ish: w_future = w_now * (1 + weeklyPct)^weeks
  const futureWeight = state.weight * Math.pow(1 + weeklyPct, weeks);
  return { futureWeight: Number(futureWeight.toFixed(1)), weeklyPct };
}

function bmi(weight, heightCm){
  const h = heightCm/100;
  return (weight/(h*h)).toFixed(1);
}

function archetypeFromBMIandSport(bmiVal, sportDays){
  // simple archetype mapping
  if(bmiVal < 20 && sportDays>=3) return 'Lean / Athletic';
  if(bmiVal >=20 && bmiVal < 24) return sportDays>=3? 'Athletic' : 'Average';
  if(bmiVal >=24 && bmiVal < 28) return 'Average';
  return 'Stocky';
}

function renderNow(state){
  // update BMI
  const b = bmi(state.weight, state.height);
  bmiNow.textContent = b;

  // map to torso size
  const torsoRx = mapRange(state.weight, 40, 140, 18, 46);
  const torsoRy = mapRange(state.weight, 40, 140, 36, 86);

  torsoNow.setAttribute('rx', torsoRx);
  torsoNow.setAttribute('ry', torsoRy);
}

function renderFuture(state, weeks){
  const res = computeFutureWeight(state, weeks);
  weightFutureEl.textContent = res.futureWeight;
  const b = bmi(res.futureWeight, state.height);
  archetypeEl.textContent = archetypeFromBMIandSport(Number(b), state.sportDays);

  // visual mapping: change future torso
  const torsoRx = mapRange(res.futureWeight, 40, 140, 18, 46);
  const torsoRy = mapRange(res.futureWeight, 40, 140, 36, 86);

  torsoFuture.setAttribute('rx', torsoRx);
  torsoFuture.setAttribute('ry', torsoRy);

  // color by archetype
  const arche = archetypeFromBMIandSport(Number(b), state.sportDays);
  let color = '#fbbf24';
  if(arche.includes('Lean')) color = '#9ae6b4';
  if(arche.includes('Athletic')) color = '#60a5fa';
  if(arche.includes('Stocky')) color = '#fda4af';
  torsoFuture.setAttribute('fill', color);
}

function animateToScenario(){
  // use current input values
  updateAll();
}

function toggleCompare(){
  if(compareMode){
    // highlight differences (simple approach: reduce opacity of now)
    avatarNow.style.opacity = 0.5;
    avatarFuture.style.boxShadow = '0 8px 30px rgba(0,0,0,0.6)';
  } else {
    avatarNow.style.opacity = 1;
    avatarFuture.style.boxShadow = 'none';
  }
}

function resetAll(){
  // reset to defaults
  heightEl.value = 175;
  weightEl.value = 80;
  genderEl.value = 'neutral';
  activityEl.value = 'medium';
  ifastingEl.checked = false; ifastingIntensityEl.value = 30;
  sugarEl.value = 'medium';
  sportDaysEl.value = 2; sportDaysVal.textContent = 2;
  disciplineEl.value = 50; disciplineVal.textContent = 50;
  scenarioButtons.forEach(b=>b.classList.remove('active'));
  scenarioButtons[0].classList.add('active');
  currentWeeks = 0;
  futureLabel.textContent = 'Scenario';
  compareMode = false; compareBtn.textContent = 'Compare Now / Scenario';
  updateAll();
}

function randomize(){
  // mild randomization
  heightEl.value = 150 + Math.round(Math.random()*60);
  weightEl.value = 50 + Math.round(Math.random()*70);
  activityEl.value = ['low','medium','high'][Math.floor(Math.random()*3)];
  ifastingEl.checked = Math.random()>0.6;
  ifastingIntensityEl.value = Math.floor(Math.random()*80);
  sugarEl.value = ['none','low','medium','strict'][Math.floor(Math.random()*4)];
  sportDaysEl.value = Math.floor(Math.random()*8);
  sportDaysVal.textContent = sportDaysEl.value;
  disciplineEl.value = Math.floor(Math.random()*101);
  disciplineVal.textContent = disciplineEl.value;
  updateAll();
}

function exportPNG(){
  // export SVG of future avatar as PNG
  const svg = qs('#avatarFuture');
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svg);
  const canvas = document.createElement('canvas');
  canvas.width = 900; canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  const img = new Image();
  const blob = new Blob([svgString], {type: 'image/svg+xml;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  img.onload = ()=>{
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    URL.revokeObjectURL(url);
    const a = document.createElement('a');
    a.download = `lifestyle-scenario-week${currentWeeks}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  };
  img.src = url;
}

// helpers
function mapRange(v, inMin, inMax, outMin, outMax){
  const t = Math.max(0, Math.min(1, (v - inMin)/(inMax - inMin)));
  return outMin + (outMax - outMin)*t;
}

init();
