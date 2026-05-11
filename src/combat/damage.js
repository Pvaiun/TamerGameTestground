// Combat math — kept simple and predictable.
//
// Damage formula:
//   base = round(power * 0.18 + atk * 0.5 - def * 0.35)
//   final = max(1, base) * combo * relic * type * vulnerability * crit
//
// This linear formula scales predictably with power/atk/def. The minimum 1
// damage means even very-resisted hits still chip. Players can estimate
// damage in their head: "a power-40 ability with atk=10 hits a def=8 target
// for about 40*0.18 + 10*0.5 - 8*0.35 = 7 + 5 - 2.8 = ~9 damage."

import { TYPE_CHART, ADDITIONAL_EFFECTS } from '../data.js';
import { rand } from '../rng.js';
import {
  applyStatMult, applyPowerMult, checkEvasion,
  getCritMult, getCritChance, applyDefenseModifiers, bypassesTypeChart,
  energyDiscount,
} from './passives.js';
import { state } from '../state.js';

// Combo bonus: each chained action in a turn adds 12% damage (cap +36%).
const COMBO_BONUS_PER_EXTRA_ACTION = 0.12;
const COMBO_BONUS_CAP = 1.36;

// Stat clamp: statMods (additive percentage) clamped to [-0.6, +0.9] before
// multiplicative passives apply.
export function effectiveStat(f, stat) {
  let mod = (f.statMods[stat] || 0);
  mod = Math.max(-0.6, Math.min(0.9, mod));
  let m = 1 + mod;
  m = applyStatMult(f, stat, m);
  // Drained reduces atk/spd
  if ((stat === 'atk' || stat === 'spd') && f.statuses && f.statuses.drained) {
    if (stat === 'atk') m *= f.statuses.drained.atkMult ?? 0.7;
    if (stat === 'spd') m *= f.statuses.drained.spdMult ?? 0.7;
  }
  m = Math.max(0.25, Math.min(2.5, m));
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

function relicDamageMult(attacker, _defender) {
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

// Compute the damage of a single hit. Returns { dmg, mult, elem, crit, evaded? }.
export function calculateDamage(attacker, defender, ability, dmgEffect, phase, _ctx = {}) {
  const atk = effectiveStat(attacker, 'atk');
  let def = effectiveStat(defender, 'def');

  // Pierce reduces effective defense before calc.
  const piercer = findInPhase(phase, 'pierce');
  if (piercer) {
    const dr = modParam(piercer, 'defReduction') ?? 0.5;
    def = Math.round(def * (1 - dr));
  }

  // Power can be modified by passives/phase modifiers (execute_scale, charge spend).
  const attackerSpd = effectiveStat(attacker, 'spd');
  const defenderSpd = effectiveStat(defender, 'spd');
  let power = applyPowerMult(attacker, defender, ability, dmgEffect.power || 0, phase, { attackerSpd, defenderSpd });
  power = applyChargeSpendMult(attacker, power, phase);

  // Type multiplier.
  const elem = ability.element || null;
  const mult = bypassesTypeChart(attacker) ? 1 : (elem ? TYPE_CHART[elem][defender.creature.type] : 1);

  // Evasion check.
  if (checkEvasion(defender)) return { dmg: 0, mult, elem, crit: false, evaded: true };

  // Core linear formula: 18% of power + half attack - 35% of defense.
  let base = power * 0.18 + atk * 0.5 - def * 0.35;
  base = Math.max(1, base);

  // Type chart and vulnerability stacking.
  let raw = base * mult;
  if (defender.statuses && defender.statuses.brittle) {
    raw *= 1 + (defender.statuses.brittle.vulnerability ?? 0.30);
  }

  // Bracing halves the hit for this round.
  if (defender.bracingThisTurn) raw *= 0.5;

  // Defense passives (flat reduction, incoming mults) + relic takeMult.
  raw = applyDefenseModifiers(defender, raw, elem, state.round);

  // Combo bonus (multi-action turn).
  raw *= comboBonus(attacker);

  // Critical hit roll.
  const crit = Math.random() < getCritChance(attacker);
  if (crit) raw *= getCritMult(attacker);

  // Relic outgoing damage mults.
  raw *= relicDamageMult(attacker, defender);

  // Tiny variance so equal stats don't always tie damage.
  raw *= rand(0.96, 1.04);

  raw = Math.max(1, Math.round(raw));
  return { dmg: raw, mult, elem, crit };
}

// Charge-spend abilities multiply power by (1 + perStack * stacks). Stacks are
// zeroed elsewhere in the resolution. Marks (legacy) is unused.
function applyChargeSpendMult(attacker, power, phase) {
  if (!phase) return power;
  const spend = phase.find(e => e.type === 'spend_charge');
  if (!spend) return power;
  const stacks = attacker.charge || 0;
  if (stacks <= 0) return power; // no charge → no bonus, just base
  const perStack = spend.perStack ?? 0.5;
  return power * (1 + perStack * stacks);
}

// Damage estimator for the UI (same math, but without random variance and crit
// chance). actionsThisTurn is used as-is — preview reflects "if I cast this next."
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
    power = applyChargeSpendMult(attacker, power, phase);
    let base = power * 0.18 + atk * 0.5 - def * 0.35;
    base = Math.max(1, base);
    let raw = base * mult;
    if (defender.statuses && defender.statuses.brittle) {
      raw *= 1 + (defender.statuses.brittle.vulnerability ?? 0.30);
    }
    raw = applyDefenseModifiers(defender, raw, elem, state.round);
    raw *= combo;
    raw *= relicDamageMult(attacker, defender);
    raw = Math.max(1, Math.round(raw));
    total += raw * (dmgEff.hits || 1);
  }
  return total;
}
