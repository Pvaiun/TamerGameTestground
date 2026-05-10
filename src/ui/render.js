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

// Advance to the next descent. Generates content based on `state.pendingRoomKind`:
//   - 'battle' → enemy party, screen = 'prebattle'
//   - 'elite'  → elite enemy pair, screen = 'prebattle'
//   - 'records'→ relic candidates,  screen = 'records'
//   - 'tend'   → tend state,        screen = 'tend'
//   - 'boss'   → boss party,        screen = 'prebattle'
// Every path increments state.wave by 1.
export function advanceWave() {
  state.wave++;
  if (state.wave > TOTAL_WAVES) { state.screen = 'victory'; render(); return; }
  const partyLvl = partyAvgLevel(state.party);
  const kind = state.pendingRoomKind || 'battle';

  if (state.wave === TOTAL_WAVES) {
    state.enemyParty = generateBossParty(partyLvl);
    state.isEliteBattle = true;
    state.prebattleSelection = null;
    state.prebattleLead = false;
    state.screen = 'prebattle';
    for (const c of state.party) c.maxHp = c.stats.hp;
    render();
    return;
  }

  if (kind === 'records') {
    state.recordsCandidates = null;
    state.screen = 'records';
    render();
    return;
  }
  if (kind === 'tend') {
    state.tendState = null;
    state.screen = 'tend';
    render();
    return;
  }
  if (kind === 'elite') {
    state.enemyParty = generateElitePair(state.wave, partyLvl);
    state.isEliteBattle = true;
  } else {
    state.enemyParty = generateEnemyParty(state.wave, partyLvl);
    state.isEliteBattle = false;
  }
  state.enemyActiveIdx = 0;
  state.enemy = state.enemyParty[0];
  state.prebattleSelection = null;
  state.prebattleLead = false;
  state.screen = 'prebattle';
  for (const c of state.party) c.maxHp = c.stats.hp;
  render();
}

// Routes from aftermath into the appropriate next screen.
export function routeAfterAftermath() {
  return proceedFromDepth();
}

// Called from any "depth-completing" event (battle aftermath, records pick,
// tend pick). Decides whether breed_offer fires, the next path picker shows,
// or we go straight to the boss room.
export function proceedFromDepth() {
  if (BREED_WAVES.has(state.wave) && (state.party.length + state.reserve.length) >= 2) {
    state.screen = 'breed_offer';
    render();
    return;
  }
  if (state.wave >= TOTAL_WAVES - 1) {
    state.pendingRoomKind = 'boss';
    advanceWave();
    return;
  }
  state.pathChoices = null;
  state.screen = 'path';
  render();
}
