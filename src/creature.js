import { rand, pickN } from './rng.js';
import { TYPE_PALETTE, TEMPLATES, GLOBALS, VOICE, ARCHETYPES } from './data.js';
import { MAX_LEVEL, nextCreatureId, state, DEFAULT_ENERGY } from './state.js';

// Universal abilities available to every creature regardless of archetype.
const UNIVERSAL_POOL = ['strike', 'focus', 'step_back'];

// Roll an ability loadout for a creature of the given archetype.
// Pulls 4 abilities total: 2 from the archetype's pool + 1 universal + 1 more random
// from archetype pool. This ensures every creature has at least 1 universal slot
// and 3 archetype-specific abilities (where their identity comes from).
function rollAbilities(template, archetypeKey) {
  const arche = ARCHETYPES[archetypeKey];
  const archePool = (arche && arche.abilityPool) || [];
  const chosen = [];
  const archeShuffled = pickN(archePool, archePool.length);
  // Always include the archetype's signature-defining first ability if present
  // (e.g. swing for striker, stoic for warden) so the player gets the mechanic
  // builder.
  if (archePool.length) {
    chosen.push(archePool[0]);
  }
  // Add 2 more archetype-distinct abilities
  for (const k of archeShuffled) {
    if (chosen.length >= 3) break;
    if (!chosen.includes(k)) chosen.push(k);
  }
  // Add 1 universal
  const universal = pickN(UNIVERSAL_POOL.filter(k => !chosen.includes(k)), 1);
  for (const k of universal) chosen.push(k);
  return chosen.slice(0, 4);
}

export function makeCreature(template, level = 1, options = {}) {
  const stats = { ...template.baseStats };
  for (let l = 2; l <= level; l++) {
    stats.hp  += Math.max(2, Math.round(template.growth.hp  * 4 + rand(-0.4, 0.8)));
    stats.atk += Math.max(1, Math.round(template.growth.atk * 1.6 + rand(-0.2, 0.6)));
    stats.def += Math.max(0, Math.round(template.growth.def * 1.4 + rand(-0.2, 0.6)));
    stats.spd += Math.max(0, Math.round(template.growth.spd * 1.4 + rand(-0.2, 0.6)));
  }
  stats.hp  = Math.max(10, stats.hp);
  stats.atk = Math.max(3, stats.atk);
  stats.def = Math.max(2, stats.def);
  stats.spd = Math.max(2, stats.spd);

  const archetype = options.archetype || template.archetype || 'striker';
  const abilities = options.abilities || rollAbilities(template, archetype);

  let passives;
  if (options.passives) {
    passives = options.passives;
  } else {
    const rolledPassive = Math.random() < 0.30
      ? template.secondaryPassive
      : template.primaryPassive;
    passives = [rolledPassive];
  }
  const palette = options.palette || TYPE_PALETTE[template.type];
  const growth = options.growth || template.growth;
  return {
    id: nextCreatureId(),
    species: template.species,
    type: options.type || template.type,
    archetype,
    growth,
    level,
    xp: 0,
    stats,
    maxHp: stats.hp,
    abilities,
    passives,
    palette,
    customName: options.customName || null,
  };
}

export function xpToNext(level) { return 14 + level * 9; }

export function gainXp(creature, amount) {
  const events = [];
  if (creature.level >= MAX_LEVEL) return events;
  creature.xp += amount;
  while (creature.xp >= xpToNext(creature.level) && creature.level < MAX_LEVEL) {
    creature.xp -= xpToNext(creature.level);
    creature.level++;
    const dHp  = Math.max(2, Math.round(creature.growth.hp  * 4 + rand(-0.3, 1.0)));
    const dAtk = Math.max(1, Math.round(creature.growth.atk * 1.6 + rand(-0.2, 0.8)));
    const dDef = Math.max(0, Math.round(creature.growth.def * 1.4 + rand(-0.2, 0.8)));
    const dSpd = Math.max(0, Math.round(creature.growth.spd * 1.4 + rand(-0.2, 0.8)));
    creature.stats.hp += dHp;
    creature.stats.atk += dAtk;
    creature.stats.def += dDef;
    creature.stats.spd += dSpd;
    creature.maxHp = creature.stats.hp;
    events.push({ level: creature.level, deltas: { hp: dHp, atk: dAtk, def: dDef, spd: dSpd } });
  }
  if (creature.level >= MAX_LEVEL) creature.xp = 0;
  return events;
}

export function growthRank(g) {
  for (const t of GLOBALS.growthThresholds) if (g >= t.min) return t.grade;
  return 'F';
}

export function rankColor(r) {
  return ({
    'S': '#ffcc44', 'A': '#66cc66', 'B': '#88cc55',
    'C': '#cccc55', 'D': '#cc9955', 'E': '#cc7755', 'F': '#cc5555',
  })[r] || '#888';
}

export function displayName(c) {
  if (c.customName) return c.customName;
  const t = TEMPLATES.find(x => x.species === c.species);
  return (t && t.name) || c.species;
}

export function archetypeOf(c) { return c && c.archetype ? ARCHETYPES[c.archetype] : null; }

export function getDossierNotes(c) {
  const base = (VOICE.notes[c.species] || VOICE.notes[c.type] || ['—', '—', '—']).slice();
  const appends = VOICE.noteAppends && VOICE.noteAppends[c.species];
  if (appends) {
    const wave = (state && state.wave) || 0;
    const keys = Object.keys(appends).map(k => +k).sort((a, b) => a - b);
    for (const w of keys) if (wave >= w) base.push(appends[String(w)]);
  }
  return base;
}

// In-battle fighter. Now carries a multi-stack object — a hybrid creature
// (bred between archetypes) can hold all four mechanic stacks at once.
export function freshFighter(c) {
  return {
    creature: c,
    hp: c.maxHp,
    statMods: { atk: 0, def: 0, spd: 0 },
    bracingThisTurn: false,
    healing: null,
    statuses: { burn: null, bloom: null, soaking: null, cursed: null, dazed: null },
    queuedAbility: null,
    pendingSwapBuff: null,
    pendingSwapHeal: 0,
    onBench: false,
    attacksMade: 0,
    actionsThisTurn: 0,
    energy: DEFAULT_ENERGY,
    maxEnergy: DEFAULT_ENERGY,
    // Multi-stack signature mechanics. Each archetype owns one key.
    // A hybrid creature can carry stacks across multiple keys simultaneously.
    stacks: { momentum: 0, guard: 0, threads: 0, tend: 0 },
    consumedTriggers: new Set(),
    timedBuffs: [],
  };
}

// Helper: figure out which stack categories this creature CAN build/use,
// based on the tags of their abilities. The UI uses this to decide which
// stack rows to display per fighter.
export function activeStackKeys(c) {
  if (!c || !c.abilities) return [];
  const keys = new Set();
  // Always include the creature's own archetype stack
  const arche = c.archetype && ARCHETYPES[c.archetype];
  if (arche && arche.stack) keys.add(arche.stack.key);
  // Plus any stack key referenced by their abilities (for hybrids)
  // This requires looking at ABILITIES (avoiding circular import — done lazily)
  return Array.from(keys);
}
