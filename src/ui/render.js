import { el, app } from './dom.js';
import { state, TOTAL_WAVES } from '../state.js';
import { generateEnemyParty, generateBossParty, partyAvgLevel } from '../encounter.js';
import { renderBattle } from './battle.js';
import {
  renderHeader, renderStart, renderStarterPick, renderBloodlineReady,
  renderPreBattle, renderAftermath, renderBreed, renderVictory, renderGameover,
} from './screens.js';

// Main dispatcher. Clears the app root, draws title + optional header, then dispatches
// to the screen renderer for state.screen. Called after every state mutation.
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
    case 'breed': renderBreed(); break;
    case 'victory': renderVictory(); break;
    case 'gameover': renderGameover(); break;
  }
}

// Shared wave-advance helper. Lives here (not in state.js) so it can call render()
// and use encounter generators without creating circular imports through state.
export function advanceWave() {
  state.wave++;
  if (state.wave > TOTAL_WAVES) { state.screen = 'victory'; render(); return; }
  state.enemyParty = state.wave === TOTAL_WAVES
    ? generateBossParty(partyAvgLevel(state.party))
    : generateEnemyParty(state.wave, partyAvgLevel(state.party));
  state.enemyActiveIdx = 0;
  state.enemy = state.enemyParty[0];
  for (const c of state.party) c.maxHp = c.stats.hp;
  state.screen = 'prebattle';
  render();
}
