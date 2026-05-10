// Relic acquisition + application. Some relics affect persistent state
// (party hp, etc.) at the moment of acquisition; most apply at runtime via
// hooks in damage.js, passives.js, battle.js.

import { state } from './state.js';
import { RELICS } from './data.js';
import { rand, pickN } from './rng.js';

// Pick N candidate relics for the records hall. Skips already-owned ones.
export function pickRecordsCandidates(n = 3) {
  const owned = new Set((state.relics || []).map(r => r.id));
  const pool = Object.values(RELICS).filter(r => !owned.has(r.id));
  return pickN(pool, Math.min(n, pool.length));
}

// Acquire a relic. Applies any one-time effects (perm hp flat etc.) immediately.
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

// Apply ALL currently-owned relics' permanent bonuses to a newly-acquired
// creature (capture, breed, starter pick on resume). Idempotent: callers
// should only invoke once per creature.
export function applyOwnedPermanentsToCreature(creature) {
  if (!creature || !state.relics || !state.relics.length) return;
  for (const r of state.relics) {
    if (r.permHpFlat) {
      creature.stats.hp += r.permHpFlat;
      creature.maxHp = creature.stats.hp;
    }
  }
}

// Apply a permanent stat bump to one creature (treatment-room reward).
export function tendCreature(creature, stat, amount) {
  if (!creature) return;
  creature.stats[stat] = Math.max(1, (creature.stats[stat] || 0) + amount);
  if (stat === 'hp') creature.maxHp = creature.stats.hp;
}

// Generate a 3-option path picker for the next descent.
// Each option leads to that wave's room kind.
export function generatePathChoices(wave) {
  // Wave 10 is always the boss room — no choice.
  if (wave >= 10) return [{ kind: 'boss', label: 'the door' }];

  // Pre-decided weights per wave depth — early waves see more rest options;
  // later waves more elites.
  const choices = [];
  // Always at least one path has combat as the next stop.
  choices.push({ kind: 'battle', label: 'another room' });
  // Second slot: weighted random.
  choices.push(rollPath(wave, 'mid'));
  // Third slot: weighted random.
  choices.push(rollPath(wave, 'wild'));
  return choices;
}

function rollPath(wave, slot) {
  const r = Math.random();
  // Earlier waves: tend (heal/buff) more common; later waves: elites more common.
  if (slot === 'mid') {
    if (r < 0.40) return { kind: 'records', label: 'records hall' };
    if (r < 0.75) return { kind: 'tend',    label: 'treatment room' };
    return { kind: 'battle', label: 'another room' };
  }
  // wild slot
  const eliteWeight = wave >= 5 ? 0.40 : 0.20;
  if (r < eliteWeight)        return { kind: 'elite',   label: 'a deeper room' };
  if (r < eliteWeight + 0.30) return { kind: 'records', label: 'records hall' };
  if (r < eliteWeight + 0.55) return { kind: 'tend',    label: 'treatment room' };
  return { kind: 'battle', label: 'another room' };
}
