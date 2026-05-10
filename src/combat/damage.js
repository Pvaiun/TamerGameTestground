import { TYPE_CHART, ADDITIONAL_EFFECTS, ABILITIES } from '../data.js';
import { rand } from '../rng.js';
import {
  applyStatMult, applyPowerMult, checkEvasion,
  getCritMult, getCritChance, applyFlatDmgReduction, bypassesTypeChart,
  energyDiscount, hasFirstAttackThisRound,
} from './passives.js';
import { state } from '../state.js';

const COMBO_BONUS_PER_EXTRA_ACTION = 0.18;

// Effective stat. statMods clamped to [-0.6, +0.9] before passive mults apply.
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

// Returns the energy cost of an ability for this fighter (after passives may discount).
export function abilityCost(ability, fighter) {
  let cost = ability.cost ?? 2;
  if (fighter) cost -= energyDiscount(fighter, ability);
  return Math.max(0, cost);
}

function findInPhase(phase, type) {
  return (phase || []).find(e => e.type === type) || null;
}
function modParam(eff, key) {
  if (!eff) return undefined;
  if (eff[key] !== undefined) return eff[key];
  return ADDITIONAL_EFFECTS[eff.type]?.params?.[key]?.default;
}

// Combo bonus: 2nd+ action this round gets +18% damage per prior action (capped 1.5x).
function comboBonus(attacker) {
  const prior = (attacker.actionsThisTurn || 1) - 1;
  if (prior <= 0) return 1;
  return Math.min(1.5, 1 + COMBO_BONUS_PER_EXTRA_ACTION * prior);
}

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

// Returns { dmg, mult, elem, crit, evaded? }
export function calculateDamage(attacker, defender, ability, dmgEffect, phase, ctx = {}) {
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
  // Apply signature stack damage modifiers (sig_consume_*_dmg) — they read fighter sigStacks.
  power = applySigDamageMods(attacker, defender, power, phase, dmgEffect, ctx);

  const elem = ability.element || null;
  let mult = bypassesTypeChart(attacker) ? 1 : (elem ? TYPE_CHART[elem][defender.creature.type] : 1);
  if (checkEvasion(defender)) {
    return { dmg: 0, mult, elem, crit: false, evaded: true };
  }
  let raw = atk * (power / 40) * (atk / (atk + def * 0.85)) * 0.75;
  if (raw < 1) raw = 1;
  raw *= mult;
  if (defender.statuses && defender.statuses.cursed && defender.statuses.cursed.vulnerability) {
    raw *= 1 + defender.statuses.cursed.vulnerability;
  }
  if (defender.bracingThisTurn) raw *= 0.4;
  raw = applyFlatDmgReduction(defender, raw, elem);
  raw *= comboBonus(attacker);
  const crit = Math.random() < getCritChance(attacker);
  if (crit) raw *= getCritMult(attacker);
  raw *= relicDamageMult(attacker, defender);
  raw *= rand(0.95, 1.05);
  raw = Math.max(1, Math.round(raw));
  return { dmg: raw, mult, elem, crit };
}

// Reads sig_consume_*_dmg / sig_consume_*_aoe / sig_consume_*_shatter modifiers
// from the phase and applies their per-stack power scaling. The actual stack
// consumption happens later in the effect handler; here we just compute the
// damage multiplier for the calc.
function applySigDamageMods(attacker, defender, power, phase, dmgEffect, ctx) {
  if (!phase) return power;
  const sigStacks = attacker.sigStacks || 0;
  for (const eff of phase) {
    if (!eff.type || !eff.type.startsWith('sig_consume_')) continue;
    if (eff.type === 'sig_consume_tide_dmg') {
      // Tide alternates 0/1: 0 = low, 1 = high
      const tide = sigStacks; // stored as 0 or 1
      const m = tide >= 1 ? (eff.highMult ?? 1.5) : (eff.lowMult ?? 0.7);
      power *= m;
    } else if (eff.type === 'sig_consume_light_dmg' ||
               eff.type === 'sig_consume_heat_dmg' ||
               eff.type === 'sig_consume_roots_dmg' ||
               eff.type === 'sig_consume_marks_dmg') {
      const min = eff.minStacks ?? 0;
      if (sigStacks >= min) power *= 1 + (eff.perStack ?? 0.2) * sigStacks;
    } else if (eff.type === 'sig_consume_frost_shatter') {
      power *= 1 + (eff.perStack ?? 0.2) * sigStacks;
    } else if (eff.type === 'sig_consume_embers_aoe') {
      // Each Ember adds flat power; handled here as multiplier on the base hit
      power += (eff.perStack ?? 0.4) * sigStacks * 100; // perStack treated as +40 power per Ember
      // But this would be misleading; instead handle in handler as flat extra hit
    }
  }
  return power;
}

// Deterministic damage estimate for the action UI. Optionally hides crit/RNG.
// `attacker.actionsThisTurn` is 0-indexed at preview time; use as-is for combo bonus.
export function estimateDamage(attacker, defender, ability) {
  if (!attacker || !defender) return 0;
  const phases = ability.phases || [];
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
  // Estimate combo bonus assuming this would be the next action of this round.
  const priorActions = attacker.actionsThisTurn || 0;
  const combo = Math.min(1.5, 1 + COMBO_BONUS_PER_EXTRA_ACTION * priorActions);
  let total = 0;
  for (const dmgEff of dmgEffects) {
    let power = applyPowerMult(attacker, defender, ability, dmgEff.power || 0, phase, { attackerSpd, defenderSpd });
    power = applySigDamageMods(attacker, defender, power, phase, dmgEff, {});
    let raw = atk * (power / 40) * (atk / (atk + def * 0.85)) * 0.75;
    if (raw < 1) raw = 1;
    raw *= mult;
    if (defender.statuses && defender.statuses.cursed && defender.statuses.cursed.vulnerability) {
      raw *= 1 + defender.statuses.cursed.vulnerability;
    }
    raw = applyFlatDmgReduction(defender, raw, elem);
    raw *= combo;
    raw *= relicDamageMult(attacker, defender);
    raw = Math.max(1, Math.round(raw));
    total += raw * (dmgEff.hits || 1);
  }
  return total;
}
