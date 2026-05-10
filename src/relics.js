// Relic acquisition + path generation.

import { state } from './state.js';
import { RELICS } from './data.js';
import { pickN } from './rng.js';

export function pickRecordsCandidates(n = 3) {
  const owned = new Set((state.relics || []).map(r => r.id));
  const pool = Object.values(RELICS).filter(r => !owned.has(r.id));
  return pickN(pool, Math.min(n, pool.length));
}

export function acquireRelic(relic) {
  if (!relic) return;
  if (!state.relics) state.relics = [];
  if (state.relics.some(r => r.id === relic.id)) return;
  state.relics.push(relic);
  if (relic.permHpFlat) {
    for (const c of [...state.party, ...state.reserve]) {
      c.stats.hp += relic.permHpFlat;
      c.maxHp = c.stats.hp;
    }
  }
}

export function applyOwnedPermanentsToCreature(creature) {
  if (!creature || !state.relics || !state.relics.length) return;
  for (const r of state.relics) {
    if (r.permHpFlat) {
      creature.stats.hp += r.permHpFlat;
      creature.maxHp = creature.stats.hp;
    }
  }
}

export function tendCreature(creature, stat, amount) {
  if (!creature) return;
  creature.stats[stat] = Math.max(1, (creature.stats[stat] || 0) + amount);
  if (stat === 'hp') creature.maxHp = creature.stats.hp;
}

// Path picker generates 3 options for the next descent.
// EVERY path advances the wave (consuming 1 depth). Different paths give
// different spoils:
//   - battle: a fight (xp + capture opportunity)
//   - elite:  a tougher fight (more xp + a guaranteed relic drop)
//   - records: a relic but no fight
//   - tend:   a permanent stat bump but no fight
// Boss is wave 10, no path choice.
export function generatePathChoices(wave) {
  if (wave >= 10) return [{ kind: 'boss', label: 'the door' }];

  // Always include a battle option (the "default" descent).
  const battle = { kind: 'battle', label: 'another patient' };
  // Pick 2 more from the alternative pool, weighted by depth.
  const alts = ['elite', 'records', 'tend'];
  // Weights — tend more common early, elite later, records steady.
  const weights = wave <= 3 ? { records: 3, tend: 4, elite: 1 }
                : wave <= 6 ? { records: 4, tend: 3, elite: 2 }
                            : { records: 3, tend: 2, elite: 4 };
  const pool = [];
  for (const k of alts) for (let i = 0; i < (weights[k] || 1); i++) pool.push(k);

  function drawUnique(taken) {
    let tries = 0;
    while (tries++ < 10) {
      const k = pool[Math.floor(Math.random() * pool.length)];
      if (!taken.has(k)) return k;
    }
    return alts.find(a => !taken.has(a)) || alts[0];
  }
  const picked = new Set();
  const a = drawUnique(picked); picked.add(a);
  const b = drawUnique(picked); picked.add(b);
  return [battle, kindOption(a), kindOption(b)];
}

function kindOption(kind) {
  return ({
    battle:  { kind: 'battle',  label: 'another patient' },
    elite:   { kind: 'elite',   label: 'a deeper room' },
    records: { kind: 'records', label: 'records hall' },
    tend:    { kind: 'tend',    label: 'treatment room' },
  })[kind];
}
