// Global game state and lifecycle helpers. Most modules import `state` and mutate
// it directly. The renderer reads `state.screen` to dispatch to a screen renderer.
//
// v3: combat is now an energy/multi-action system. Each round, both fighters get
// `maxEnergy` energy and play actions until they end their turn or run out. The
// log is split into a mechanical `gameLog` (persistent, scrollable) and a single
// ephemeral `loreLine` (atmospheric beat).

export const TOTAL_WAVES = 10;
export const BREED_WAVES = new Set([3, 6, 9]);
export const MAX_LEVEL = 50;
export const PARTY_CAP = 2;
export const MAX_RELICS = 12;
export const DEFAULT_ENERGY = 3;

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

  // ── Battle: dual log system ──
  // gameLog: persistent compact mechanical entries (up to MAX_GAME_LOG)
  // loreLine: a single atmospheric line that lingers in its own panel
  gameLog: [],
  loreLine: null,
  loreTypingId: 0,

  // ── Battle: turn structure ──
  // turnPhase: 'player' (waiting for player input), 'enemy' (AI playing),
  //            'tick' (status ticks running), 'done' (battle over)
  // round: which round we're in (1-indexed, increments each full round)
  // firstThisRound: which side acts first this round
  // enemyIntent: what the enemy plans to do this round (revealed at start of round)
  turnPhase: 'idle',
  round: 0,
  firstThisRound: 'player',
  enemyIntent: null,

  breedState: null,
  postBattleEvents: null,
  acting: false,
  combatSpeed: 2,

  pathChoices: null,
  pendingRoomKind: 'battle',
  recordsCandidates: null,
  tendState: null,

  relics: [],
  isEliteBattle: false,

  prebattleSelection: null,
  prebattleLead: false,

  usedRevive: false,
};

// Bounded log so memory doesn't grow unbounded.
const MAX_GAME_LOG = 80;

// pushGame: append a compact mechanical entry to the persistent log.
//   text: short string (mechanical). damage/heal: optional numbers shown inline.
//   anim: deferred animation function fired when the line first appears.
//   cls: CSS class hint ('crit'|'eff'|'fade'|'sys').
//   actor: 'player'|'enemy' (for color-coding the line).
export function pushGame(text, opts) {
  const o = (opts && typeof opts === 'object') ? opts : (opts ? { cls: opts } : {});
  const entry = {
    text: String(text || ''),
    cls: o.cls || '',
    damage: o.damage || 0,
    heal: o.heal || 0,
    actor: o.actor || null,
    icon: o.icon || null,
    anim: o.anim || null,
    fired: false,
  };
  state.gameLog.push(entry);
  if (state.gameLog.length > MAX_GAME_LOG) state.gameLog.shift();
  return entry;
}

// pushLore: replace the single lore line. Triggers a typewriter on the lore panel.
export function pushLore(text, opts) {
  const o = (opts && typeof opts === 'object') ? opts : {};
  state.loreLine = {
    text: String(text || ''),
    cls: o.cls || '',
    id: ++state.loreTypingId,
  };
}

// Legacy compat for code that still calls pushLog. Routes to gameLog by default.
export function pushLog(text, opts) {
  // Detect prose-ish strings (have ~~strike~~ or longer than 60 chars) and route to lore.
  const str = typeof text === 'object' ? (text.text || '') : String(text || '');
  const looksLore = str.includes('~~') || str.includes('!!') || str.includes('**') || str.length > 56;
  if (looksLore && typeof text !== 'object') {
    pushLore(str);
    return null;
  }
  return pushGame(text, opts);
}

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
  state.gameLog = [];
  state.loreLine = null;
  state.loreTypingId = 0;
  state.turnPhase = 'idle';
  state.round = 0;
  state.firstThisRound = 'player';
  state.enemyIntent = null;
  state.breedState = null;
  state.postBattleEvents = null;
  state.starterPool = null;
  state.acting = false;
  state.pathChoices = null;
  state.pendingRoomKind = 'battle';
  state.relics = [];
  state.isEliteBattle = false;
  state.prebattleSelection = null;
  state.prebattleLead = false;
  state.recordsCandidates = null;
  state.tendState = null;
  state.usedRevive = false;
  state.screen = 'start';
}

let creatureIdCounter = 1;
export function nextCreatureId() { return creatureIdCounter++; }
