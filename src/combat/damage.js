import { TYPE_CHART, ADDITIONAL_EFFECTS } from '../data.js';
import { rand } from '../rng.js';
import {
  applyStatMult, applyPowerMult, checkEvasion,
  getCritMult, getCritChance, applyFlatDmgReduction, bypassesTypeChart,
} from './passives.js';
import { state } from '../state.js';

// Resolves a fighter's effective stat after passive multipliers, status modifiers, and stat mods.
// Stat mods are clamped to [-0.6, +0.9] before passives apply, so a single ability can't
// turn the math sideways and "stack three buffs" is no longer a one-button win.
export function effectiveStat(f, stat) {
  let mod = (f.statMods[stat] || 0);
  mod = Math.max(-0.6, Math.min(0.9, mod));
  let m = 1 + mod;
  m = applyStatMult(f, stat, m);
  if ((stat === 'atk' || stat === 'spd') && f.statuses && f.statuses.soaking) {
    if (stat === 'atk') m *= f.statuses.soaking.atkMult ?? 0.7;
    if (stat === 'spd') m *= f.statuses.soaking.spdMult ?? 0.7;
  }
  m = Math.max(0.25, Math.min(2.5, m));
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

// Sum of all run-relics' onDamage hooks. Lazy-imported to avoid a cycle.
function relicDamageMult(attacker, defender) {
  if (!state.relics || !state.relics.length) return 1;
  let m = 1;
  for (const r of state.relics) {
    if (r.dealMult) m *= r.dealMult;
    if (r.firstHitMult && (attacker.attacksMade || 0) === 0) m *= r.firstHitMult;
    if (r.lowHpDealMult && (attacker.hp / attacker.creature.maxHp) <= 0.4) m *= r.lowHpDealMult;
    if (r.benchAlive && state.bf && state.bf.hp > 0) m *= r.benchAlive;
  }
  return m;
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
  // Sharper damage curve: less HP-sponge feel; fights resolve in 3-5 turns instead of 8-10.
  let raw = atk * (power / 40) * (atk / (atk + def * 0.85)) * 0.75;
  if (raw < 1) raw = 1;
  raw *= mult;
  // Broken status: target takes vulnerability% extra from all damage.
  if (defender.statuses && defender.statuses.cursed && defender.statuses.cursed.vulnerability) {
    raw *= 1 + defender.statuses.cursed.vulnerability;
  }
  if (defender.bracingThisTurn) raw *= 0.4;
  raw = applyFlatDmgReduction(defender, raw, elem);
  const crit = Math.random() < getCritChance(attacker);
  if (crit) raw *= getCritMult(attacker);
  raw *= relicDamageMult(attacker, defender);
  raw *= rand(0.94, 1.06);
  raw = Math.max(1, Math.round(raw));
  return { dmg: raw, mult, elem, crit };
}

// Deterministic damage estimate for the move-button UI. Sums across all damage
// effects in the ability's first phase. No crit/random/evade.
export function estimateDamage(attacker, defender, ability) {
  if (!attacker || !defender) return 0;
  const phases = ability.phases || [];
  // For multi-phase abilities, estimate the LAST phase (the payoff).
  const phase = phases[phases.length - 1] || [];
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
    let raw = atk * (power / 40) * (atk / (atk + def * 0.85)) * 0.75;
    if (raw < 1) raw = 1;
    raw *= mult;
    if (defender.statuses && defender.statuses.cursed && defender.statuses.cursed.vulnerability) {
      raw *= 1 + defender.statuses.cursed.vulnerability;
    }
    raw = applyFlatDmgReduction(defender, raw, elem);
    raw *= relicDamageMult(attacker, defender);
    raw = Math.max(1, Math.round(raw));
    total += raw * (dmgEff.hits || 1);
  }
  return total;
}
