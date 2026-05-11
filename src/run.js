import { state, resetRun, pushLore } from './state.js';
import { GLOBALS, PATIENTS, APPROACHES, VOICE, SCARS, SCAR_POOLS, CATEGORIES } from './data.js';
import { pick, pickN, randi } from './rng.js';
import { beginIntake } from './intake.js';
import { loadMeta, saveMetaOnRunEnd } from './meta.js';

const STARTING_DECK_CORE = ['listen', 'note', 'steady', 'press', 'wait', 'step_back'];

const ADMISSION_METHOD_CHOICES = ['ask', 'reflect', 'hold', 'witness', 'match'];

export function pickAdmissionMethods() {
  return ADMISSION_METHOD_CHOICES.map(k => APPROACHES[k]).filter(Boolean);
}

export function beginRun(initialMethod) {
  resetRun();
  state.meta = loadMeta();
  state.deck = [...STARTING_DECK_CORE, initialMethod];
  if (state.meta && state.meta.carriedNotes) {
    for (const k of state.meta.carriedNotes) {
      if (APPROACHES[k] && !state.deck.includes(k)) state.deck.push(k);
    }
  }
  state.startedRun = true;
  state.wave = 0;
  state.composureMax = GLOBALS.composureMax;
  state.composure = GLOBALS.composureInitial;
  state.scars = [];
  advanceToNextIntake();
}

export function advanceToNextIntake() {
  state.wave++;
  if (state.wave > GLOBALS.totalDescents) {
    finishRun('won');
    return;
  }
  const tierBand = tierBandForWave(state.wave);
  const isFinale = state.wave === GLOBALS.totalDescents;
  let patientTemplate;
  if (isFinale) {
    patientTemplate = PATIENTS.find(p => p.species === 'Lumenpup') || PATIENTS[0];
  } else if (state.wave === 1) {
    // Wave 1 always matches the player's chosen method's category, so the
    // first intake is a guided lesson in what their starter card does.
    const fitCat = chosenMethodCategory();
    let pool = PATIENTS.filter(p => p.species !== 'Lumenpup' && tierBand.includes(p.tier) && p.category === fitCat);
    if (!pool.length) pool = PATIENTS.filter(p => p.species !== 'Lumenpup' && tierBand.includes(p.tier));
    patientTemplate = pool.length ? pick(pool) : pick(PATIENTS.filter(p => p.species !== 'Lumenpup'));
  } else {
    let pool = PATIENTS.filter(p => p.species !== 'Lumenpup' && tierBand.includes(p.tier));
    // Avoid repeats: filter out patients seen recently
    const seen = state.meta?.recentSpecies || [];
    const filtered = pool.filter(p => !seen.includes(p.species));
    if (filtered.length) pool = filtered;
    patientTemplate = pool.length ? pick(pool) : pick(PATIENTS.filter(p => p.species !== 'Lumenpup'));
  }
  state.intake = null;
  state.screen = 'hallway';
  state.hallway = makeHallway(patientTemplate);
}

function chosenMethodCategory() {
  // The deck includes the universal core + the chosen admission method.
  // Find the first approach in the deck that has a category — that's the method.
  for (const k of state.deck) {
    const a = APPROACHES[k];
    if (a && a.category) return a.category;
  }
  return 'stranger';
}

function tierBandForWave(wave) {
  if (wave <= 2) return [1];
  if (wave <= 4) return [1, 2];
  if (wave <= 6) return [2, 3];
  if (wave <= 8) return [3];
  if (wave === 9) return [3, 4];
  return [4];
}

function makeHallway(patientTemplate) {
  const lines = pickHallwayLines();
  return { patientTemplate, lines };
}

function pickHallwayLines() {
  const last = state.lastIntakeResult;
  let pool = VOICE.hallway?.default || [];
  if (last === 'lost') pool = (VOICE.hallway?.after_loss || []).concat(pool);
  else if (last === 'won') pool = (VOICE.hallway?.after_win || []).concat(pool);
  return pickN(pool, 2);
}

export function enterIntake() {
  if (!state.hallway) return;
  const p = state.hallway.patientTemplate;
  state.hallway = null;
  beginIntake(p);
}

export function intakeWon(patient) {
  state.lastIntakeResult = 'won';
  const healed = Math.min(state.composure + (GLOBALS.composureHealBetweenIntakes || 0), state.composureMax);
  state.composure = healed;
  if (state.wave >= GLOBALS.totalDescents) {
    finishRun('won', { lastPatient: patient });
    return;
  }
  state.screen = 'boon';
  state.boonChoices = rollBoonChoices(patient);
}

export function intakeLost(patient, scar) {
  state.lastIntakeResult = 'lost';
  if (scar && !state.scars.includes(scar)) state.scars.push(scar);
  state.composure = Math.max(2, Math.round(state.composureMax * 0.4));
  if (state.scars.length >= (GLOBALS.scarLimit || 3)) {
    finishRun('lost', { lastPatient: patient });
    return;
  }
  state.screen = 'boon';
  state.boonChoices = rollBoonChoices(patient, true);
}

export function rollScarForLoss(intentBrokeYou) {
  const cls = (intentBrokeYou && intentBrokeYou.class) || 'speech';
  const pool = (SCAR_POOLS && SCAR_POOLS[cls]) || Object.keys(SCARS);
  const available = pool.filter(k => SCARS[k] && !state.scars.includes(k));
  const chosen = available.length ? pick(available) : pool[0];
  return chosen;
}

function rollBoonChoices(patient, afterLoss) {
  const learnedSet = new Set(state.deck);
  const allKeys = Object.keys(APPROACHES).filter(k => k !== 'name_them');
  const learnable = allKeys.filter(k => !learnedSet.has(k) && !APPROACHES[k].hideFromBoon);
  const n = GLOBALS.boonChoicesPerIntake || 3;
  const boons = [];

  // Identify missing fit cards
  const missingFits = [];
  for (const [, cat] of Object.entries(CATEGORIES)) {
    if (cat.fitApproach && !learnedSet.has(cat.fitApproach)) missingFits.push(cat.fitApproach);
  }
  // At waves 3, 6, 9 guarantee a missing-fit card; on other waves there's a
  // 50% chance one of the boons is a missing fit. So the player will usually
  // diversify if they want to, but the boon can also miss them.
  const guaranteeFit = [3, 6, 9].includes(state.wave);
  if ((guaranteeFit || Math.random() < 0.5) && missingFits.length) {
    boons.push({ kind: 'method', key: pick(missingFits) });
  }
  // Fill remaining slots with random learnables (excluding what we already added)
  const rest = learnable.filter(k => !boons.some(b => b.key === k));
  for (const k of pickN(rest, n - 1 - boons.length)) {
    boons.push({ kind: 'method', key: k });
  }
  // Always offer at least one "rest" option for composure recovery
  boons.push({ kind: 'rest', key: 'rest_' + boons.length });
  return boons;
}

export function applyBoon(choice) {
  if (!choice) return;
  if (choice.kind === 'method') {
    if (!state.deck.includes(choice.key)) state.deck.push(choice.key);
  } else if (choice.kind === 'rest') {
    state.composure = Math.min(state.composureMax, state.composure + 3);
  } else if (choice.kind === 'cleanse_scar') {
    if (state.scars.length) state.scars.shift();
  }
  state.boonChoices = null;
  advanceToNextIntake();
}

export function skipBoon() {
  state.boonChoices = null;
  advanceToNextIntake();
}

export function finishRun(outcome, ctx) {
  state.endReason = outcome;
  saveMetaOnRunEnd(outcome, state);
  state.screen = outcome === 'won' ? 'won' : 'lost';
}
