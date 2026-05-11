// Intake — turn-based diagnostic card session. Player sits across the desk
// from one patient. Player plays approach cards within a per-turn page budget;
// patient executes one intent at end of turn. Handle intent → Insight + reveal;
// unhandled → Composure damage. Win = Insight to max → play Name. Lose =
// Composure to 0 → take a scar. Time up = patient plays closing intent.

import { state, pushLore, nextId } from './state.js';
import { APPROACHES, INTENTS, CATEGORIES, GLOBALS, SCARS, VOICE } from './data.js';
import { pick } from './rng.js';
import { resolveApproach, canPlay, effectiveCost } from './approaches.js';
import { intakeWon, intakeLost, rollScarForLoss } from './run.js';
import { sfx } from './audio.js';

export function beginIntake(patientTemplate) {
  const patient = freshPatient(patientTemplate);
  const isFinale = patient.species === 'Lumenpup' && state.wave === GLOBALS.totalDescents;
  state.intake = {
    patient,
    isFinale,
    turn: 1,
    log: [],
    ended: false,
    outcome: null,
    brokenBy: null,
    scar: null,
    _drainPagesNext: 0,
    _patientBleeding: 0,
    _diagnoseChoice: null,
    player: {
      pages: pagesPerTurnEffective(),
      pagesMax: pagesPerTurnEffective(),
      insight: insightStartEffective(),
      insightMax: insightTargetForTier(patient.tier),
      playedThisTurn: [],
      cleansedScars: new Set(),
      nextTurnPagesBonus: 0,
      stepBackReductionNext: 0,
      blocksClassesThisTurn: new Set(),
      _notedThisIntake: false,
      _toldProtagFile: 0,
      _leanInArmed: false,
      _endTurnRequested: false,
    },
  };
  state.screen = 'intake';
  if (isFinale) {
    pushLore(VOICE.finale?.open || 'The tenth desk. The file in front of me is mine.');
    pushLog(`Intake · the tenth · ${patient.name}.`, 'sys');
  } else {
    pushLoreEvent('intake_open', { patient: patient.name });
    pushLog(`Intake · ${patient.name}.`, 'sys');
  }
  pushLog(`Turn ${state.intake.turn}.`, 'sys');
  applyStartOfIntakeScarPenalties();
  pickNextIntent(patient, true);
}

function freshPatient(t) {
  const fragments = [...(t.fragments || [])];
  // For the protagonist's wave-10 finale, splice in the most recent
  // protagonist notes — their file fills in around them as you descended.
  if (t.species === 'Lumenpup' && state.wave === GLOBALS.totalDescents) {
    const notes = VOICE && VOICE.protagonistNotes;
    if (notes) {
      // Pick the last 3 waves' notes — the most recent state of the file.
      for (const k of [7, 8, 9]) {
        for (const line of (notes[String(k)] || [])) {
          if (!fragments.includes(line)) fragments.push(line);
        }
      }
    }
  }
  const revealedAtStart = fragments.length >= 4 ? 2 : 1;
  return {
    species: t.species,
    name: t.name,
    subtitle: t.subtitle,
    category: t.category,
    categoryRevealed: false,
    intentPool: [...t.intents],
    fragments,
    revealedFragments: revealedAtStart,
    nextIntent: null,
    nextIntentHidden: false,
    lastIntent: null,
    sedatedTurns: 0,
    refusedNext: false,
    forceRepeat: false,
    restrainedTurns: 0,
    tier: t.tier || 1,
  };
}

// Damage scaling by patient tier — tier 1 = 1.0×, tier 4 = 1.6×. Late patients
// punish you harder when an intent slips through.
function tierDamageMult(tier) {
  return 1 + Math.max(0, (tier || 1) - 1) * 0.2;
}

// Insight required to name them scales with tier — easier patients close in 3-4
// plays, harder ones demand sustained reading.
function insightTargetForTier(tier) {
  return Math.max(5, 5 + Math.max(0, (tier || 1) - 1));
}

function pagesPerTurnEffective() {
  let v = GLOBALS.pagesPerTurn || 3;
  for (const sk of state.scars || []) {
    const s = SCARS[sk];
    if (!s) continue;
    if (s.key === 'pagesPerTurnMod' && !state.intake?.player?.cleansedScars?.has(sk)) v += (s.value || 0);
  }
  return Math.max(1, v);
}

function insightStartEffective() {
  let v = 0;
  for (const sk of state.scars || []) {
    const s = SCARS[sk];
    if (s && s.key === 'insightStartMod') v += (s.value || 0);
  }
  return Math.max(0, v);
}

function applyStartOfIntakeScarPenalties() {
  for (const sk of state.scars || []) {
    const s = SCARS[sk];
    if (!s) continue;
    if (s.key === 'delayPages' && !state.intake.player.cleansedScars?.has(sk)) {
      state.intake.player.pages = Math.max(0, state.intake.player.pages - (s.value || 0));
    }
  }
}

export function effectiveComposureMax() {
  let v = GLOBALS.composureMax || 10;
  for (const sk of state.scars || []) {
    const s = SCARS[sk];
    if (s && s.key === 'composureMaxMod') v += (s.value || 0);
  }
  return Math.max(3, v);
}

export function effectiveScarCostMod(approachKey) {
  let v = 0;
  for (const sk of state.scars || []) {
    const s = SCARS[sk];
    if (s && s.key === 'costMod' && s.approach === approachKey) {
      if (!state.intake?.player?.cleansedScars?.has(sk)) v += s.value || 0;
    }
  }
  return v;
}

export function classDamageMod(intentClass) {
  let v = 0;
  for (const sk of state.scars || []) {
    const s = SCARS[sk];
    if (s && s.key === 'classDmg' && s.intentClass === intentClass) {
      if (!state.intake?.player?.cleansedScars?.has(sk)) v += s.value || 0;
    }
  }
  return v;
}

// ── public actions ──────────────────────────────────────────────────

export function playApproach(key) {
  if (!state.intake || state.intake.ended) return false;
  const a = APPROACHES[key];
  if (!a) return false;
  if (!canPlay(a, state.intake)) return false;
  const cost = effectiveCost(a);
  state.intake.player.pages -= cost;
  state.intake.player.playedThisTurn.push(key);
  pushLog(`${a.name}. (-${cost})`, 'play');
  pushLore(a.voice || '', { cls: 'play' });
  sfx('select');
  resolveApproach(a, state.intake, helpers());
  if (state.intake.ended) return true;
  // Honour requestEndTurn from approach
  if (state.intake.player._endTurnRequested) {
    state.intake.player._endTurnRequested = false;
    state.intake.player.pages = 0;
    endTurnNow();
  }
  return true;
}

export function endTurnNow() {
  if (!state.intake || state.intake.ended) return;
  resolveIntent();
  if (state.intake.ended) return;
  advanceTurn();
}

function helpers() {
  return {
    revealFragment,
    revealCategory,
    addInsight,
    addComposure,
    damageComposure,
    setRestrain,
    setSedate,
    setRefuseNext,
    setForceRepeat,
    blockClassThisTurn,
    addStepBackReduction,
    addPagesNextTurn,
    cleanseScar,
    endIntakeWin,
    endIntakeLose,
    diagnoseCategory,
    learnLastIntentMirror,
    requestEndTurn,
  };
}

// ── intent picker / resolver ─────────────────────────────────────────

function pickNextIntent(patient, isFirst = false) {
  if (state.intake.turn >= (GLOBALS.intakeTurnLimit || 8)) {
    patient.nextIntent = 'closing';
    patient.nextIntentHidden = false;
    return;
  }
  let pool = patient.intentPool.slice();
  if (pool.length > 2 && patient.lastIntent) pool = pool.filter(k => k !== patient.lastIntent);
  if (isFirst) {
    const domClass = CATEGORIES[patient.category]?.intentClass;
    const domClassed = pool.filter(k => INTENTS[k]?.class === domClass);
    if (domClassed.length) pool = domClassed;
  }
  if (patient.forceRepeat && patient.lastIntent) {
    patient.nextIntent = patient.lastIntent;
    patient.forceRepeat = false;
    return;
  }
  patient.nextIntent = pick(pool) || patient.intentPool[0];
}

function resolveIntent() {
  const intake = state.intake;
  const p = intake.patient;
  const player = intake.player;
  if (!p.nextIntent) return;
  const intent = INTENTS[p.nextIntent];
  if (!intent) return;

  if (p.sedatedTurns > 0) {
    pushLog(`${p.name} · sedated. They do not act.`, 'eff');
    pushLore(`The patient is breathing slowly. ~~The page does not fill.~~`);
    p.sedatedTurns--;
    p.lastIntent = p.nextIntent;
    return;
  }
  if (p.refusedNext) {
    pushLog(`${p.name} · their next intent is refused.`, 'eff');
    pushLore(`I close the page before they fill it.`);
    p.refusedNext = false;
    p.lastIntent = p.nextIntent;
    return;
  }

  pushLog(`${p.name} · ${intent.name}.`, 'pat');
  pushLore(intent.desc || '');

  const playedKeys = player.playedThisTurn;
  const handledByDirect = playedKeys.some(k => (intent.counteredBy || []).includes(k));
  const handledByClass = player.blocksClassesThisTurn.has(intent.class) || (p.restrainedTurns > 0 && intent.class === 'physical');
  const handled = handledByDirect || handledByClass;

  if (intent.key === 'closing') {
    p.lastIntent = p.nextIntent;
    if (player.insight >= player.insightMax) {
      pushLog('I close the file before they can. The name is in ink.', 'eff');
      endIntakeWin();
      return;
    }
    if (handled) {
      pushLog('I held off the closing. But the file is not yet full.', 'eff');
      pushLore('I keep the page open. The ink does not finish.');
      addInsight(1);
      // Slight composure damage even when handled — closing is brutal
      damageComposure(2);
      if (!intake.ended) {
        intake.brokenBy = intent;
        endIntakeLose();
      }
      return;
    }
    pushLog('They close the page themselves.', 'crit');
    pushLore(VOICE.events?.intake_timeup || 'The intake ran its hour.');
    damageComposure(intent.damage || 5);
    if (!intake.ended) {
      intake.brokenBy = intent;
      endIntakeLose();
    }
    return;
  }

  if (handled) {
    // Intent insight only fires when the FIT card for this patient's category
    // is what handled it. Generic counter cards just mitigate damage; the
    // category-fit card is what fills the page.
    const fit = CATEGORIES[p.category]?.fitApproach;
    if (fit && playedKeys.includes(fit)) {
      const intentBonus = intent.insightOnCounter || 1;
      addInsight(intentBonus);
      for (let i = 0; i < (intent.revealOnCounter || 0); i++) revealFragment();
      if (intent.revealCategory) revealCategory();
      pushLog(`Fit handle · +${intentBonus} insight.`, 'eff');
      pushLore(VOICE.events?.intent_handled || 'I had the page ready for it.');
    } else {
      pushLog(`Handled. The blow does not land.`, 'fade');
    }
  } else {
    let dmg = intent.damage || 0;
    dmg = Math.round(dmg * tierDamageMult(p.tier));
    dmg += classDamageMod(intent.class);
    dmg -= player.stepBackReductionNext || 0;
    if (player._leanInArmed) {
      dmg += 2;
      player._leanInArmed = false;
    }
    if (dmg < 0) dmg = 0;
    if (dmg > 0) damageComposure(dmg);
    pushLog(`Unhandled. -${dmg} composure.`, 'crit');
    if (intent.drainPages) intake._drainPagesNext = (intake._drainPagesNext || 0) + intent.drainPages;
    if (intent.hidesNextIntent) p.nextIntentHidden = true;
    if (intent.addsState === 'bleeding') intake._patientBleeding = (intake._patientBleeding || 0) + 1;
  }
  p.lastIntent = p.nextIntent;
}

function advanceTurn() {
  const intake = state.intake;
  if (intake.ended) return;
  intake.turn++;
  if (intake.patient.restrainedTurns > 0) intake.patient.restrainedTurns--;
  intake.player.playedThisTurn = [];
  intake.player.blocksClassesThisTurn = new Set();
  intake.player.stepBackReductionNext = 0;
  intake.player.pagesMax = pagesPerTurnEffective() + (intake.player.nextTurnPagesBonus || 0);
  intake.player.pages = intake.player.pagesMax;
  if (intake._drainPagesNext) {
    intake.player.pages = Math.max(0, intake.player.pages - intake._drainPagesNext);
    intake._drainPagesNext = 0;
  }
  intake.player.nextTurnPagesBonus = 0;
  pushLog(`Turn ${intake.turn}.`, 'sys');
  pickNextIntent(intake.patient);
}

// ── effect helpers (exposed via helpers()) ──────────────────────────

function revealFragment() {
  const p = state.intake.patient;
  if (!p) return;
  if (p.revealedFragments < p.fragments.length) {
    p.revealedFragments++;
    pushLog(VOICE.events?.fragment_revealed || 'New file line.', 'fade');
  }
}

function revealCategory() {
  const p = state.intake.patient;
  if (!p || p.categoryRevealed) return;
  p.categoryRevealed = true;
  const cat = CATEGORIES[p.category];
  pushLog(`Ward · ${cat ? cat.name : p.category}.`, 'sys');
  pushLore((VOICE.categoryRevealed && VOICE.categoryRevealed[p.category]) || `The ward is ${cat?.name || p.category}.`);
}

function addInsight(n) {
  if (!state.intake) return;
  const before = state.intake.player.insight;
  state.intake.player.insight = Math.min(state.intake.player.insightMax, before + n);
  const gained = state.intake.player.insight - before;
  if (gained > 0) sfx('select');
}

function addComposure(n) {
  state.composure = Math.min(effectiveComposureMax(), state.composure + n);
  if (n > 0) sfx('heal');
}

function damageComposure(n) {
  state.composure = Math.max(0, state.composure - n);
  sfx('hit');
  if (state.composure <= 0) {
    if (state.intake) state.intake.brokenBy = INTENTS[state.intake.patient.nextIntent] || INTENTS[state.intake.patient.lastIntent] || null;
    endIntakeLose();
  }
}

function setRestrain(turns) { state.intake.patient.restrainedTurns = Math.max(state.intake.patient.restrainedTurns, turns); }
function setSedate(turns) { state.intake.patient.sedatedTurns = Math.max(state.intake.patient.sedatedTurns, turns); }
function setRefuseNext() { state.intake.patient.refusedNext = true; }
function setForceRepeat() { state.intake.patient.forceRepeat = true; }
function blockClassThisTurn(cls) { state.intake.player.blocksClassesThisTurn.add(cls); }
function addStepBackReduction(n) { state.intake.player.stepBackReductionNext = (state.intake.player.stepBackReductionNext || 0) + n; }
function addPagesNextTurn(n) { state.intake.player.nextTurnPagesBonus = (state.intake.player.nextTurnPagesBonus || 0) + n; }
function cleanseScar() {
  if (!state.scars.length) return;
  const sk = state.scars[0];
  state.intake.player.cleansedScars.add(sk);
  pushLog(`Scar suspended · ${SCARS[sk]?.name || sk}.`, 'eff');
}
function requestEndTurn() {
  if (state.intake && state.intake.player) state.intake.player._endTurnRequested = true;
}

function endIntakeWin() {
  if (state.intake.ended) return;
  state.intake.ended = true;
  state.intake.outcome = 'won';
  pushLog(VOICE.events?.patient_named || 'I close the file.', 'sys');
  sfx('victory');
  state.screen = 'intake_result';
}

function endIntakeLose() {
  if (state.intake.ended) return;
  state.intake.ended = true;
  state.intake.outcome = 'lost';
  pushLog(VOICE.events?.patient_lost || 'The patient finishes the page in my hand.', 'crit');
  sfx('faint');
  state.intake.scar = rollScarForLoss(state.intake.brokenBy || INTENTS[state.intake.patient.lastIntent] || null);
  state.screen = 'intake_result';
}

function diagnoseCategory(guessed) {
  const p = state.intake.patient;
  if (!p) return;
  if (guessed === p.category) {
    addInsight(3);
    revealCategory();
    revealFragment();
    pushLog(`Diagnosed · correct. +3 insight.`, 'eff');
  } else {
    damageComposure(4);
    pushLog(`Diagnosed · wrong. -4 composure.`, 'crit');
  }
}

function learnLastIntentMirror() {
  const p = state.intake.patient;
  if (!p || !p.lastIntent) return;
  const intent = INTENTS[p.lastIntent];
  if (!intent) return;
  pushLog(`Mirror · ${intent.name} back.`, 'eff');
  if (intent.class === 'speech') addInsight(2);
  else if (intent.class === 'physical') damageComposure(1);
  else addInsight(1);
}

export function continueAfterIntake() {
  if (!state.intake) return;
  const outcome = state.intake.outcome;
  const patient = state.intake.patient;
  const scar = state.intake.scar;
  state.intake = null;
  if (outcome === 'won') intakeWon(patient);
  else intakeLost(patient, scar);
}

// ── log helpers ──────────────────────────────────────────────────────

export function pushLog(text, cls) {
  if (!state.intake) return;
  state.intake.log.push({ id: nextId(), text: String(text || ''), cls: cls || '' });
  if (state.intake.log.length > 60) state.intake.log.shift();
}

function pushLoreEvent(key, params) {
  const tpl = VOICE.events?.[key];
  if (!tpl) return;
  let out = tpl;
  if (params) for (const [k, v] of Object.entries(params)) out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
  pushLore(out);
}
