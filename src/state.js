import { GLOBALS } from './data.js';

export const state = {
  screen: 'admission',
  wave: 0,
  composure: 10,
  composureMax: 10,
  scars: [],
  deck: [],
  notes: {
    revealed: 0,
    line: null
  },
  intake: null,
  hallway: null,
  boonChoices: null,
  startedRun: false,
  endReason: null,
  flash: null,
  meta: null
};

export function resetRun() {
  state.screen = 'admission';
  state.wave = 0;
  state.composure = GLOBALS.composureInitial || 10;
  state.composureMax = GLOBALS.composureMax || 10;
  state.scars = [];
  state.deck = [];
  state.notes = { revealed: 0, line: null };
  state.intake = null;
  state.hallway = null;
  state.boonChoices = null;
  state.startedRun = false;
  state.endReason = null;
  state.flash = null;
}

export function pushLore(text, opts = {}) {
  state.notes = {
    revealed: (state.notes.revealed || 0) + 1,
    line: { text: String(text || ''), cls: opts.cls || '', id: Date.now() + Math.random() }
  };
}

let idCounter = 1;
export function nextId() { return idCounter++; }
