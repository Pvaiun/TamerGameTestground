// Passive engine. Handles all passive triggers + relic damage hooks.

import { PASSIVES, ADDITIONAL_EFFECTS } from '../data.js';
import { state } from '../state.js';

export function hasPassive(f, key) {
  return f && f.creature && f.creature.passives && f.creature.passives.includes(key);
}

function* triggerEntries(f, triggerName) {
  if (!f || !f.creature || !f.creature.passives) return;
  for (const passiveKey of f.creature.passives) {
    const pv = PASSIVES[passiveKey];
    if (!pv || !pv.triggers) continue;
    for (let i = 0; i < pv.triggers.length; i++) {
      if (pv.triggers[i].on === triggerName) {
        yield { entry: pv.triggers[i], passiveKey, idx: i, passive: pv };
      }
    }
  }
}

function consumedKey(passiveKey, idx) { return `${passiveKey}:${idx}`; }
function isConsumed(f, passiveKey, idx) {
  return f.consumedTriggers && f.consumedTriggers.has(consumedKey(passiveKey, idx));
}
function markConsumed(f, passiveKey, idx) {
  if (!f.consumedTriggers) f.consumedTriggers = new Set();
  f.consumedTriggers.add(consumedKey(passiveKey, idx));
}

function cmpNumber(actual, spec) {
  if (typeof spec === 'number') return actual >= spec;
  if (typeof spec !== 'string') return false;
  const m = spec.match(/^(<=|>=|<|>|==)\s*(-?\d*\.?\d+)$/);
  if (!m) return false;
  const v = parseFloat(m[2]);
  switch (m[1]) {
    case '<':  return actual <  v;
    case '<=': return actual <= v;
    case '>':  return actual >  v;
    case '>=': return actual >= v;
    case '==': return actual === v;
  }
  return false;
}

function evalCondition(key, spec, ctx) {
  switch (key) {
    case 'selfHpFrac':           return cmpNumber(ctx.self ? ctx.self.hp / ctx.self.creature.maxHp : 0, spec);
    case 'targetHpFrac':         return ctx.target ? cmpNumber(ctx.target.hp / ctx.target.creature.maxHp, spec) : false;
    case 'dmgFrac':              return cmpNumber((ctx.dmg || 0) / (ctx.dmgRefMaxHp || 1), spec);
    case 'firstAttack':          return Boolean((ctx.self && (ctx.self.attacksMade || 0) === 0)) === Boolean(spec);
    case 'firstAttackThisRound': return Boolean(ctx.self && (ctx.self.actionsThisTurn || 0) <= 1) === Boolean(spec);
    case 'isCrit':               return Boolean(ctx.isCrit) === Boolean(spec);
    case 'selfFasterThanTarget': return Boolean(ctx.selfFaster) === Boolean(spec);
    case 'bracing':              return Boolean(ctx.self && ctx.self.bracingThisTurn) === Boolean(spec);
    case 'onBench':              return Boolean(ctx.self && ctx.self.onBench) === Boolean(spec);
    case 'attackElement':        return ctx.attackElement === spec;
    case 'queryStat':            return ctx.queryStat === spec;
    case 'targetHasStatus':      return Boolean(ctx.target && ctx.target.statuses && ctx.target.statuses[spec]);
    case 'selfHasStatus':        return Boolean(ctx.self && ctx.self.statuses && ctx.self.statuses[spec]);
    case 'abilityHasTag':        return Boolean(ctx.ability && ctx.ability.tags && ctx.ability.tags.includes(spec));
  }
  return true;
}

function condsMet(ifMap, ctx) {
  if (!ifMap) return true;
  for (const [k, v] of Object.entries(ifMap)) if (!evalCondition(k, v, ctx)) return false;
  return true;
}

function* matching(f, triggerName, ctx) {
  for (const item of triggerEntries(f, triggerName)) {
    if (item.entry.consumesOn && isConsumed(f, item.passiveKey, item.idx)) continue;
    if (!condsMet(item.entry.if, ctx)) continue;
    yield item;
  }
}

function consumeIfNeeded(f, item) {
  if (item.entry.consumesOn === 'battle') markConsumed(f, item.passiveKey, item.idx);
}

const CUSTOM = {
  // Reserved for archetype-specific custom impls. Most behavior is now data-driven.
};

function runCustom(impl, ctx) {
  const fn = CUSTOM[impl];
  if (fn) fn(ctx.entry?.effect || {}, ctx);
}

function runEffect(eff, ctx) {
  const cbs = ctx.cbs || {};
  switch (eff.type) {
    case 'stat_mult':
      if (eff.stat === ctx.queryStat) ctx.outMult *= (eff.value ?? 1);
      return;
    case 'all_stat_mult':
      ctx.outMult *= (eff.value ?? 1);
      return;
    case 'power_mult':
      ctx.outPower *= (eff.value ?? 1);
      return;
    case 'power_mult_per_status': {
      if (!ctx.target || !ctx.target.statuses) return;
      const count = ['burn','bloom','soaking','cursed','dazed'].filter(s => ctx.target.statuses[s]).length;
      if (count > 0) ctx.outPower *= 1 + (eff.perStatus || 0) * count;
      return;
    }
    case 'flat_dmg_reduction':
      ctx.outRaw -= (eff.value || 0);
      return;
    case 'non_elem_dmg_mult':
      if (!ctx.attackElement) ctx.outRaw *= (eff.value ?? 1);
      return;
    case 'crit_chance_set':
      ctx.outCritChance = eff.value ?? ctx.outCritChance;
      return;
    case 'crit_mult':
      ctx.outCritMult = eff.value ?? ctx.outCritMult;
      return;
    case 'evasion_chance':
      ctx.outEvadeChance = Math.max(ctx.outEvadeChance || 0, eff.value || 0);
      return;
    case 'heal_mult':
      ctx.outHealMult *= (eff.value ?? 1);
      return;
    case 'overheal_cap':
      ctx.outHealCapMult = Math.max(ctx.outHealCapMult || 1, eff.value || 1);
      return;
    case 'block_heal':
      ctx.outBlockHeal = true;
      return;
    case 'block_statuses':
      if ((eff.statuses || []).includes(ctx.statusType)) ctx.outBlocked = true;
      return;
    case 'tie_break_win':
      ctx.outWin = true;
      return;
    case 'energy_discount':
      ctx.outDiscount = Math.max(ctx.outDiscount || 0, eff.value || 0);
      return;

    case 'heal_self': {
      const f = ctx.self;
      const amt = Math.max(1, Math.round(f.creature.maxHp * (eff.percent || 0)));
      const healed = cbs.applyHeal ? cbs.applyHeal(f, amt) : 0;
      if (healed > 0 && cbs.pushGame) {
        cbs.pushGame(`${cap(name(f))} · ${ctx.passive ? ctx.passive.name : 'heal'} +${healed} hp.`, { heal: healed, cls: 'heal' });
      }
      return;
    }
    case 'heal_self_pct_dmg': {
      const f = ctx.self;
      const healed = cbs.applyHeal ? cbs.applyHeal(f, Math.round((ctx.dmg || 0) * (eff.percent || 0))) : 0;
      if (healed > 0 && cbs.pushGame) {
        cbs.pushGame(`${cap(name(f))} drinks +${healed}.`, { heal: healed, cls: 'heal' });
      }
      return;
    }
    case 'reflect_damage': {
      if (!ctx.target || ctx.target.hp <= 0) return;
      const back = Math.round((ctx.dmg || 0) * (eff.percent || 0));
      if (back <= 0) return;
      ctx.target.hp = Math.max(0, ctx.target.hp - back);
      if (cbs.pushGame) cbs.pushGame(`${cap(name(ctx.target))} · ${ctx.passive ? ctx.passive.name : 'reflect'} -${back}.`, { damage: back, cls: 'eff' });
      return;
    }
    case 'apply_status': {
      const target = eff.target === 'self' ? ctx.self : ctx.target;
      if (!target || target.hp <= 0) return;
      const chance = eff.chance ?? 1;
      if (chance < 1 && Math.random() >= chance) return;
      if (cbs.applyStatus && cbs.applyStatus(target, eff.status, {})) {
        if (cbs.pushGame) {
          const sName = ({ burn: 'Fevering', bloom: 'Mending', soaking: 'Drained', cursed: 'Broken', dazed: 'Sedated' })[eff.status] || eff.status;
          cbs.pushGame(`${cap(name(target))} · ${sName} (from ${ctx.passive ? ctx.passive.name : 'passive'}).`, { cls: 'eff' });
        }
      }
      return;
    }
    case 'buff_self': {
      const f = ctx.self;
      const sm = eff.statMods || {};
      for (const [k, v] of Object.entries(sm)) f.statMods[k] = (f.statMods[k] || 0) + v;
      if (eff.turns && eff.turns > 0) {
        if (!f.timedBuffs) f.timedBuffs = [];
        f.timedBuffs.push({ statMods: { ...sm }, turnsLeft: eff.turns });
      }
      if (cbs.pushGame && ctx.passive) {
        const parts = Object.entries(sm).filter(([, v]) => typeof v === 'number' && v !== 0)
          .map(([k, v]) => `${k} ${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`);
        if (parts.length) cbs.pushGame(`${cap(name(f))} · ${ctx.passive.name}: ${parts.join(', ')}.`, { cls: 'eff' });
      }
      return;
    }
    case 'buff_target': {
      if (!ctx.target || ctx.target.hp <= 0) return;
      const sm = eff.statMods || {};
      for (const [k, v] of Object.entries(sm)) ctx.target.statMods[k] = (ctx.target.statMods[k] || 0) + v;
      return;
    }
    case 'cleanse_target': {
      if (!ctx.incoming) return;
      if (cbs.cleanseStatuses) cbs.cleanseStatuses(ctx.incoming);
      if (cbs.pushGame) cbs.pushGame(`${cap(name(ctx.incoming))} · cleansed (${ctx.passive ? ctx.passive.name : 'tag-out'}).`, { cls: 'eff' });
      return;
    }
    case 'cleanse_self_step': {
      const f = ctx.self;
      const step = eff.step || 0.15;
      if (f.statuses && f.statuses.soaking)      f.statuses.soaking = null;
      else if (f.statuses && f.statuses.burn)    f.statuses.burn = null;
      else if (f.statuses && f.statuses.dazed)   f.statuses.dazed = null;
      else if (f.statuses && f.statuses.cursed)  f.statuses.cursed = null;
      else if (f.statMods.atk < 0)               f.statMods.atk = Math.min(0, f.statMods.atk + step);
      else if (f.statMods.def < 0)               f.statMods.def = Math.min(0, f.statMods.def + step);
      else if (f.statMods.spd < 0)               f.statMods.spd = Math.min(0, f.statMods.spd + step);
      return;
    }
    case 'custom':
      runCustom(eff.impl, ctx);
      return;
  }
}

function name(f) { return f && f.creature ? (f.creature.customName || f.creature.species) : '?'; }
function cap(s) { return String(s || '').replace(/^./, c => c.toUpperCase()); }

function fire(f, triggerName, ctx) {
  ctx.self = ctx.self || f;
  for (const item of matching(f, triggerName, ctx)) {
    ctx.passive = item.passive;
    ctx.entry = item.entry;
    runEffect(item.entry.effect, ctx);
    consumeIfNeeded(f, item);
  }
  return ctx;
}

// Public: fire any trigger by name (used by abilities.js for sig-spent hooks).
export function fireTrigger(f, triggerName, ctx) {
  ctx = ctx || { self: f };
  ctx.cbs = ctx.cbs || {};
  return fire(f, triggerName, ctx);
}

// ─── Public API ──────────────────────────────────────────────────────

export function applyStatMult(f, stat, m) {
  const ctx = { self: f, queryStat: stat, outMult: m };
  fire(f, 'stat_query', ctx);
  return ctx.outMult;
}

export function applyPowerMult(attacker, defender, ability, power, phase, { attackerSpd = 0, defenderSpd = 0 } = {}) {
  const ctx = {
    self: attacker, target: defender,
    attackElement: ability.element || null,
    selfFaster: attackerSpd > defenderSpd,
    outPower: power,
  };
  fire(attacker, 'power_query', ctx);
  const exec = (phase || []).find(e => e.type === 'execute_scale');
  if (exec) {
    const sa = exec.scaleAmount ?? 0.5;
    ctx.outPower *= 1 + sa * (1 - (defender.hp / defender.creature.maxHp));
  }
  const syn = (phase || []).find(e => e.type === 'status_synergy');
  if (syn && defender.statuses) {
    const status = syn.status ?? 'cursed';
    const mult   = syn.powerMult ?? 1.5;
    if (defender.statuses[status]) ctx.outPower *= mult;
  }
  return ctx.outPower;
}

export function applyFlatDmgReduction(defender, raw, attackElement = null) {
  const ctx = { self: defender, attackElement, outRaw: raw };
  fire(defender, 'defense_query', ctx);
  if (state.relics && state.relics.length) {
    let m = 1;
    for (const r of state.relics) if (r.takeMult) m *= r.takeMult;
    ctx.outRaw *= m;
  }
  return ctx.outRaw;
}

export function getCritProfile(attacker) {
  let chance = 0.10;
  let mult = 1.6;
  if (state.relics && state.relics.length) {
    for (const r of state.relics) {
      if (r.critChanceBonus) chance += r.critChanceBonus;
      if (r.critMultBonus)   mult   += r.critMultBonus;
    }
  }
  const ctx = { self: attacker, outCritMult: mult, outCritChance: chance };
  fire(attacker, 'crit_query', ctx);
  return { mult: ctx.outCritMult, chance: ctx.outCritChance };
}

export function getCritMult(attacker)  { return getCritProfile(attacker).mult; }
export function getCritChance(attacker){ return getCritProfile(attacker).chance; }

export function checkEvasion(defender) {
  let baseEvade = 0;
  if (state.relics && state.relics.length) {
    for (const r of state.relics) if (r.evadeBonus) baseEvade = Math.max(baseEvade, r.evadeBonus);
  }
  const ctx = { self: defender, outEvadeChance: baseEvade };
  fire(defender, 'evasion_query', ctx);
  return ctx.outEvadeChance > 0 && Math.random() < ctx.outEvadeChance;
}

export function modifyHeal(f, baseAmount) {
  const ctx = { self: f, outHealMult: 1, outHealCapMult: 1, outBlockHeal: false };
  fire(f, 'heal_query', ctx);
  if (state.relics && state.relics.length) {
    for (const r of state.relics) if (r.healMult) ctx.outHealMult *= r.healMult;
  }
  if (ctx.outBlockHeal) return { amount: 0, cap: f.creature.maxHp };
  return {
    amount: Math.round(baseAmount * ctx.outHealMult),
    cap: Math.round(f.creature.maxHp * ctx.outHealCapMult),
  };
}

export function blocksStatus(f, statusType) {
  const ctx = { self: f, statusType, outBlocked: false };
  fire(f, 'status_block', ctx);
  return ctx.outBlocked;
}

export function bypassesTypeChart(_attacker) { return false; }

export function applySelfDmgMult(f, raw) {
  const ctx = { self: f, outMult: 1 };
  fire(f, 'self_damage_query', ctx);
  if (state.relics && state.relics.length) {
    for (const r of state.relics) if (r.selfDmgMult) ctx.outMult *= r.selfDmgMult;
  }
  return raw * ctx.outMult;
}

export function winsTies(f) {
  const ctx = { self: f, outWin: false };
  fire(f, 'tie_break', ctx);
  return ctx.outWin;
}

export function energyDiscount(f, ability) {
  const ctx = { self: f, ability, outDiscount: 0 };
  fire(f, 'energy_cost', ctx);
  return ctx.outDiscount;
}

export function applyBattleStartPassive(f, opponent, cbs) {
  fire(f, 'battle_start', { self: f, target: opponent, cbs, side: null, oside: null });
}

export function applyRoundStartPassives(f, side, cbs) {
  fire(f, 'round_start', { self: f, side, cbs });
}

export function applySwapInPassives(incoming, outgoing, side, cbs) {
  fire(incoming, 'swap_in', { self: incoming, target: null, cbs, side });
  fire(outgoing, 'swap_out', { self: outgoing, incoming, cbs, side });
}

export function applyPostHitPassives(side, oside, attacker, defender, result, cbs) {
  fire(attacker, 'hit_dealt', {
    self: attacker, target: defender, dmg: result.dmg, isCrit: !!result.crit,
    side, oside, cbs,
  });
  if (defender.hp > 0) {
    fire(defender, 'hit_taken', {
      self: defender, target: attacker, dmg: result.dmg, isCrit: !!result.crit,
      dmgRefMaxHp: defender.creature.maxHp,
      side: oside, oside: side, cbs,
    });
  }
}

export function applyBenchPassives(f, isBench, cbs) {
  if (isBench) fire(f, 'bench_tick', { self: f, side: null, cbs });
}
