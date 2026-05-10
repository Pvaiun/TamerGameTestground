import { el, app } from './dom.js';
import { state, TOTAL_WAVES, BREED_WAVES } from '../state.js';
import {
  generateEnemyParty, generateBossParty, generateElitePair, partyAvgLevel,
} from '../encounter.js';
import { renderBattle } from './battle.js';
import {
  renderHeader, renderStart, renderStarterPick, renderBloodlineReady,
  renderPreBattle, renderAftermath, renderBreed, renderBreedOffer, renderPath,
  renderRecords, renderTend, renderVictory, renderGameover,
} from './screens.js';

// Main dispatcher.
export function render() {
  const root = app();
  root.innerHTML = '';
  if (state.screen !== 'battle') {
    root.appendChild(el('h1', {}, 'BLOODLINES'));
    root.appendChild(el('div', { class: 'subtitle' }, 'Ten descents · one file'));
  }
  if (state.screen !== 'start' && state.screen !== 'starter_pick' && state.screen !== 'bloodline_ready' && state.screen !== 'victory' && state.screen !== 'gameover' && state.screen !== 'battle') {
    root.appendChild(renderHeader());
  }
  switch (state.screen) {
    case 'start': renderStart(); break;
    case 'starter_pick': renderStarterPick(); break;
    case 'bloodline_ready': renderBloodlineReady(); break;
    case 'prebattle': renderPreBattle(); break;
    case 'battle': renderBattle(); break;
    case 'aftermath': renderAftermath(); break;
    case 'breed_offer': renderBreedOffer(); break;
    case 'breed': renderBreed(); break;
    case 'path': renderPath(); break;
    case 'records': renderRecords(); break;
    case 'tend': renderTend(); break;
    case 'victory': renderVictory(); break;
    case 'gameover': renderGameover(); break;
  }
}

// Wave-advance — used after path picker / breed ritual completes.
// Generates the appropriate enemy party for the room kind and routes to prebattle.
export function advanceWave() {
  state.wave++;
  if (state.wave > TOTAL_WAVES) { state.screen = 'victory'; render(); return; }
  const partyLvl = partyAvgLevel(state.party);
  if (state.wave === TOTAL_WAVES) {
    state.enemyParty = generateBossParty(partyLvl);
    state.isEliteBattle = true;
  } else if (state.pendingRoomKind === 'elite') {
    state.enemyParty = generateElitePair(state.wave, partyLvl);
    state.isEliteBattle = true;
  } else {
    state.enemyParty = generateEnemyParty(state.wave, partyLvl);
    state.isEliteBattle = false;
  }
  state.enemyActiveIdx = 0;
  state.enemy = state.enemyParty[0];
  for (const c of state.party) c.maxHp = c.stats.hp;
  state.prebattleSelection = null;
  state.prebattleLead = false;
  state.screen = 'prebattle';
  render();
}

// Routes from aftermath into the appropriate next screen:
//   - End of wave 10: victory (handled in finishBattleIfDone)
//   - Just finished a breed wave (3/6/9): offer the ritual
//   - Otherwise: path picker
export function routeAfterAftermath() {
  if (BREED_WAVES.has(state.wave) && (state.party.length + state.reserve.length) >= 2) {
    state.screen = 'breed_offer';
    render();
    return;
  }
  // Path screen if the next wave isn't the boss directly.
  if (state.wave + 1 >= TOTAL_WAVES) {
    state.pendingRoomKind = 'boss';
    advanceWave();
    return;
  }
  state.screen = 'path';
  render();
}
