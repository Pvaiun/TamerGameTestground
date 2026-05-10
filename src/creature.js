import { rand, pickN } from './rng.js';
import { TYPE_PALETTE, TEMPLATES, GLOBALS, VOICE } from './data.js';
import { MAX_LEVEL, nextCreatureId, state, DEFAULT_ENERGY } from './state.js';

export function makeCreature(template, level = 1, options = {}) {
  const stats = { ...template.baseStats };
  for (let l = 2; l <= level; l++) {
    stats.hp  += Math.max(2, Math.round(template.growth.hp  * 4 + rand(-0.5, 1)));
    stats.atk += Math.max(1, Math.round(template.growth.atk * 1.8 + rand(-0.3, 0.8)));
    stats.def += Math.max(0, Math.round(template.growth.def * 1.6 + rand(-0.3, 0.8)));
    stats.spd += Math.max(0, Math.round(template.growth.spd * 1.6 + rand(-0.3, 0.8)));
  }
  stats.hp  = Math.max(8, stats.hp);
  stats.atk = Math.max(2, stats.atk);
  stats.def = Math.max(1, stats.def);
  stats.spd = Math.max(1, stats.spd);

  // The species "pool" contains shared abilities + signature abilities.
  // Signature abilities (template.signatureAbilities) are guaranteed to roll
  // into the creature's loadout if present; the rest of the slots fill from
  // the shared pool.
  let abilities;
  if (options.abilities) {
    abilities = options.abilities;
  } else {
    const sigs = template.signatureAbilities || [];
    const shared = (template.abilityPool || []).filter(k => !sigs.includes(k));
    abilities = [...sigs];
    while (abilities.length < 4 && shared.length) {
      const i = Math.floor(Math.random() * shared.length);
      abilities.push(shared.splice(i, 1)[0]);
    }
    abilities = abilities.slice(0, 4);
  }

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
    growth,
    level,
    xp: 0,
    stats,
    maxHp: stats.hp,
    abilities,
    passives,
    palette,
    customName: options.customName || null,
    // Signature mechanic (set by template). The species-specific stack tracker
    // resets at battle start. See data/templates.json — `signature: { key, label, max, gainPerTurn? }`.
    signature: template.signature || null,
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
    const dHp  = Math.max(2, Math.round(creature.growth.hp  * 4 + rand(-0.3, 1.2)));
    const dAtk = Math.max(1, Math.round(creature.growth.atk * 1.8 + rand(-0.2, 1.0)));
    const dDef = Math.max(0, Math.round(creature.growth.def * 1.6 + rand(-0.2, 1.0)));
    const dSpd = Math.max(0, Math.round(creature.growth.spd * 1.6 + rand(-0.2, 1.0)));
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

// In-battle wrapper around a creature. Adds the energy + signature mechanic.
export function freshFighter(c) {
  return {
    creature: c,
    hp: c.maxHp,
    statMods: { atk: 0, def: 0, spd: 0 },
    bracingThisTurn: false,
    healing: null,
    statuses: {
      burn: null,
      bloom: null,
      soaking: null,
      cursed: null,
      dazed: null,
    },
    queuedAbility: null,
    pendingSwapBuff: null,
    pendingSwapHeal: 0,
    onBench: false,
    attacksMade: 0,
    actionsThisTurn: 0,        // resets each round; drives combo bonus
    energy: DEFAULT_ENERGY,    // current energy this round
    maxEnergy: DEFAULT_ENERGY, // base energy per round (some passives may modify)
    sigStacks: 0,              // signature mechanic stack count
    consumedTriggers: new Set(),
    timedBuffs: [],
  };
}
