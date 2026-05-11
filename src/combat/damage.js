import { TYPE_CHART, ADDITIONAL_EFFECTS, ABILITIES } from '../data.js';
import { rand } from '../rng.js';
import {
  applyStatMult, applyPowerMult, checkEvasion,
  getCritMult, getCritChance, applyFlatDmgReduction, bypassesTypeChart,
  energyDiscount,
} from './passives.js';
import { state } from '../state.js';

const COMBO_BONUS_PER_EXTRA_ACTION = 0.10;
const COMBO_BONUS_CAP = 1.3;

// Effective stat. Stat mods clamped tighter to make individual buffs matter
// less than archetype/passive identity.
export function effectiveStat(f, stat) {
  let mod = f.statMods[stat] || 0;
  mod = Math.max(-0.5, Math.min(0.8, mod));
  let m = 1 + mod;
  m = applyStatMult(f, stat, m);
  if ((stat === 'atk' || stat === 'spd') && f.statuses && f.statuses.soaking) {
    if (stat === 'atk') m *= f.statuses.soaking.atkMult ?? 0.7;
    if (stat === 'spd') m *= f.statuses.soaking.spdMult ?? 0.7;
  }
  m = Math.max(0.3, Math.min(2.4, m));
  return Math.max(1, Math.round(f.creature.stats[stat] * m));
}

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

function comboBonus(attacker) {
  const prior = (attacker.actionsThisTurn || 1) - 1;
  if (prior <= 0) return 1;
  return Math.min(COMBO_BONUS_CAP, 1 + COMBO_BONUS_PER_EXTRA_ACTION * prior);
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

// New damage formula:
//   raw = atk * (power / 25) * (atk / (atk + def)) * 0.95
// Calibrated so:
//   - L1 Striker (atk 10) vs L1 Warden (def 9): ~30% maxHP per cost-1 strike
//   - L1 Warden (atk 6) vs L1 Striker (def 5): ~22% maxHP per cost-1 strike
//   - 3-energy turn = ~1-2 attacks = ~25-50% maxHP per turn
//   - Both sides win-or-lose in 3-4 rounds typically
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
  power = applySigDamageMods(attacker, defender, power, phase);

  const elem = ability.element || null;
  let mult = bypassesTypeChart(attacker) ? 1 : (elem ? TYPE_CHART[elem][defender.creature.type] : 1);
  if (checkEvasion(defender)) {
    return { dmg: 0, mult, elem, crit: false, evaded: true };
  }
  let raw = atk * (power / 25) * (atk / (atk + def)) * 0.95;
  if (raw < 1) raw = 1;
  raw *= mult;
  if (defender.statuses && defender.statuses.cursed && defender.statuses.cursed.vulnerability) {
    raw *= 1 + defender.statuses.cursed.vulnerability;
  }
  if (defender.bracingThisTurn) raw *= 0.5;
  raw = applyFlatDmgReduction(defender, raw, elem);
  raw *= comboBonus(attacker);
  const crit = Math.random() < getCritChance(attacker);
  if (crit) raw *= getCritMult(attacker);
  raw *= relicDamageMult(attacker, defender);
  raw *= rand(0.95, 1.05);
  raw = Math.max(1, Math.round(raw));
  return { dmg: raw, mult, elem, crit };
}

// Reads any `sig_consume_dmg` modifiers from the phase and applies their
// per-stack power scaling using the attacker's current stack count for the
// keyed mechanic. Stacks themselves are zeroed in the timed handler after damage.
export function applySigDamageMods(attacker, defender, power, phase) {
  if (!phase) return power;
  const stacks = attacker.stacks || {};
  for (const eff of phase) {
    if (eff.type === 'sig_consume_dmg') {
      const key = eff.key || 'momentum';
      const s = stacks[key] || 0;
      if (s > 0) power *= 1 + (eff.perStack ?? 0.2) * s;
    }
    if (eff.type === 'status_synergy_per_status') {
      const count = ['burn','bloom','soaking','cursed','dazed'].filter(k => defender.statuses && defender.statuses[k]).length;
      if (count > 0) power *= 1 + (eff.powerMult ?? 0.2) * count;
    }
  }
  return power;
}

// Deterministic damage estimate for the action UI.
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
  const priorActions = attacker.actionsThisTurn || 0;
  const combo = Math.min(COMBO_BONUS_CAP, 1 + COMBO_BONUS_PER_EXTRA_ACTION * priorActions);
  let total = 0;
  for (const dmgEff of dmgEffects) {
    let power = applyPowerMult(attacker, defender, ability, dmgEff.power || 0, phase, { attackerSpd, defenderSpd });
    power = applySigDamageMods(attacker, defender, power, phase);
    let raw = atk * (power / 25) * (atk / (atk + def)) * 0.95;
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
