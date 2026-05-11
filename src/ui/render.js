import { app, el } from './dom.js';
import { state } from '../state.js';
import { renderAdmission } from './admission.js';
import { renderHallway } from './hallway.js';
import { renderIntake } from './intake_ui.js';
import { renderIntakeResult } from './intake_result.js';
import { renderBoon } from './boon.js';
import { renderEnding } from './endings.js';

export function render() {
  const root = app();
  if (!root) return;
  root.innerHTML = '';
  if (state.screen !== 'intake') {
    root.appendChild(el('h1', {}, 'BLOODLINES'));
    root.appendChild(el('div', { class: 'subtitle' }, 'Ten descents · one file'));
  }
  if (shouldShowRunStrip()) root.appendChild(renderRunStrip());
  switch (state.screen) {
    case 'admission':    renderAdmission(); break;
    case 'hallway':      renderHallway(); break;
    case 'intake':       renderIntake(); break;
    case 'intake_result':renderIntakeResult(); break;
    case 'boon':         renderBoon(); break;
    case 'won':
    case 'lost':         renderEnding(); break;
    default:             renderAdmission();
  }
}

function shouldShowRunStrip() {
  return state.startedRun &&
    state.screen !== 'admission' &&
    state.screen !== 'intake' &&
    state.screen !== 'won' &&
    state.screen !== 'lost';
}

function renderRunStrip() {
  const cells = [
    cell(`Descent ${pad2(state.wave)} of ${pad2((state.meta?.runs ? 10 : 10))}`),
    cell(`Composure · ${state.composure}/${state.composureMax}`),
    cell(`Methods · ${state.deck.length}`),
    cell(`Scars · ${state.scars.length}/3`),
  ];
  return el('div', { class: 'doc-strip header-strip' }, cells);
}

function cell(text) { return el('span', { class: 'doc-strip-cell' }, text); }
function pad2(n) { return String(Math.max(0, n | 0)).padStart(2, '0'); }
