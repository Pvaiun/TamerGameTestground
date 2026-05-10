// Global game state and lifecycle helpers. Most modules import `state` and mutate
// it directly. The renderer reads `state.screen` to dispatch to a screen renderer.

export const TOTAL_WAVES = 10;
export const BREED_WAVES = new Set([3, 6, 9]);
export const MAX_LEVEL = 50;

export const state = {
  screen: 'start',
  wave: 0,
  party: [],
  reserve: [],
  activeIdx: 0,
  enemy: null,
  enemyParty: [],
  enemyActiveIdx: 0,
  pf: null,
  bf: null,
  ef: null,
  ebf: null,
  log: [],
  breedState: null,
  postBattleEvents: null,
  acting: false,
  pCharge: null,
  eCharge: null,
  // Index of the log entry currently typewriting in the narrative box. Set
  // by the log drainer; -1 when nothing is animating. Drives the typewriter
  // styling on the latest narrative line.
  typingLogIdx: -1,
};

// pushLog accepts a string (legacy plain-text entry) or a structured object
// of the form { text, damage?, heal?, cls?, anim?, pause? }. Animations on
// .anim are deferred — they fire when the log drainer reaches the entry, so
// each event's animation lines up with the line appearing in the UI.
export function pushLog(text, opts) {
  let entry;
  if (text && typeof text === 'object' && !Array.isArray(text)) {
    entry = { text: text.text || '', cls: '', damage: 0, heal: 0, ...text };
  } else {
    const o = (opts && typeof opts === 'object') ? opts : (opts ? { cls: opts } : {});
    entry = { text: String(text || ''), cls: '', damage: 0, heal: 0, ...o };
  }
  state.log.push(entry);
  if (state.log.length > 60) state.log.shift();
}

// Compatibility helper for callers that still wrote `entry.msg` to access the
// log line text. New code should use entry.text.
export function logText(entry) { return entry ? (entry.text || entry.msg || '') : ''; }

export function resetGame() {
  state.wave = 0;
  state.party = [];
  state.reserve = [];
  state.activeIdx = 0;
  state.enemy = null;
  state.enemyParty = [];
  state.enemyActiveIdx = 0;
  state.pf = null; state.bf = null; state.ef = null; state.ebf = null;
  state.pCharge = null; state.eCharge = null;
  state.log = [];
  state.breedState = null;
  state.postBattleEvents = null;
  state.starterPool = null;
  state.acting = false;
  state.typingLogIdx = -1;
  state.screen = 'start';
}

// Allocates monotonically increasing creature IDs. Used by makeCreature() and
// makeChild() — they share one counter so IDs are unique across both.
let creatureIdCounter = 1;
export function nextCreatureId() { return creatureIdCounter++; }
