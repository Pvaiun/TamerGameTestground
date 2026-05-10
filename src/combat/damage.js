import { TYPE_CHART, ADDITIONAL_EFFECTS } from '../data.js';
import { rand } from '../rng.js';
import {
  applyStatMult, applyPowerMult, checkEvasion,
  getCritMult, getCritChance, applyFlatDmgReduction, bypassesTypeChart,
} from './passives.js';

// Resolves a fighter's effective stat after passive multipliers, status modifiers, and stat mods.
// Capped 0.25x..3.0x to prevent infinite Focus/Fury stacking.
export function effectiveStat(f, stat) {
  let m = 1 + f.statMods[stat];
  m = applyStatMult(f, stat, m);
  m = Math.max(0.25, Math.min(3.0, m));
  return Math.max(1, Math.round(f.creature.stats[stat] * m));
}

function findInPhase(phase, type) {
  return (phase || []).find(e => e.type === type) || null;
}

function modParam(eff, key) {
  if (!eff) return undefined;
  if (eff[key] !== undefined) return eff[key];
  return ADDITIONAL_EFFECTS[eff.type]?.params?.[key]?.default;
}

// Returns {dmg, mult, elem, crit, evaded?}
// `dmgEffect` is the specific damage effect being resolved (carries power/hits).
// `phase` is the array of effects in the current phase (modifiers consulted from here).
export function calculateDamage(attacker, defender, ability, dmgEffect, phase) {
  const atk = effectiveStat(attacker, 'atk');
  let def = effectiveStat(defender, 'def');
  const piercer = findInPhase(phase, 'pierce');
  if (piercer) {
    const dr = modParam(piercer, 'defReduction') ?? 0.5;
    def = Math.round(def * (1 - dr));
  }
  const attackerSpd = effectiveStat(attacker, 'spd');
  const defenderSpd = effectiveStat(defender, 'spd');
  let power = applyPowerMult(attacker, defender, ability, dmgEffect.power || 0, phase, { attackerSpd, defenderSpd });
  const elem = ability.element || null;
  let mult = bypassesTypeChart(attacker) ? 1 : (elem ? TYPE_CHART[elem][defender.creature.type] : 1);
  if (checkEvasion(defender)) {
    return { dmg: 0, mult, elem, crit: false, evaded: true };
  }
  let raw = atk * (power / 50) * (atk / (atk + def)) * 0.55;
  if (raw < 1) raw = 1;
  raw *= mult;
  if (defender.bracingThisTurn) raw *= 0.4;
  raw = applyFlatDmgReduction(defender, raw, elem);
  const crit = Math.random() < getCritChance(attacker);
  if (crit) raw *= getCritMult(attacker);
  raw *= rand(0.92, 1.08);
  raw = Math.max(1, Math.round(raw));
  return { dmg: raw, mult, elem, crit };
}

// Deterministic damage estimate for the move-button UI. Sums across all damage
// effects in the ability's first phase. No crit/random/evade.
export function estimateDamage(attacker, defender, ability) {
  const phase = (ability.phases && ability.phases[0]) || [];
  const dmgEffects = phase.filter(e => e.type === 'damage');
  if (dmgEffects.length === 0) return 0;
  const atk = effectiveStat(attacker, 'atk');
  let def = effectiveStat(defender, 'def');
  const piercer = findInPhase(phase, 'pierce');
  if (piercer) {
    const dr = modParam(piercer, 'defReduction') ?? 0.5;
    def = Math.round(def * (1 - dr));
  }
  const attackerSpd = effectiveStat(attacker, 'spd');
  const defenderSpd = effectiveStat(defender, 'spd');
  const elem = ability.element || null;
  const mult = bypassesTypeChart(attacker) ? 1 : (elem ? TYPE_CHART[elem][defender.creature.type] : 1);
  let total = 0;
  for (const dmgEff of dmgEffects) {
    const power = applyPowerMult(attacker, defender, ability, dmgEff.power || 0, phase, { attackerSpd, defenderSpd });
    let raw = atk * (power / 50) * (atk / (atk + def)) * 0.4;
    if (raw < 1) raw = 1;
    raw *= mult;
    raw = applyFlatDmgReduction(defender, raw, elem);
    raw = Math.max(1, Math.round(raw));
    total += raw * (dmgEff.hits || 1);
  }
  return total;
}
