// Passive engine. Handles all passive triggers + relic damage hooks.

import { PASSIVES } from '../data.js';
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
    case 'firstAttack':          return Boolean((ctx.self && (ctx.self.attacksMade || 0) === 0)) === Boolean(spec);
    case 'firstAttackThisRound': return Boolean(ctx.self && (ctx.self.actionsThisTurn || 0) <= 1) === Boolean(spec);
    case 'isCrit':               return Boolean(ctx.isCrit) === Boolean(spec);
    case 'selfFasterThanTarget': return Boolean(ctx.selfFaster) === Boolean(spec);
    case 'onBench':              return Boolean(ctx.self && ctx.self.onBench) === Boolean(spec);
    case 'attackElement':        return ctx.attackElement === spec;
    case 'queryStat':            return ctx.queryStat === spec;
    case 'targetHasStatus':      return Boolean(ctx.target && ctx.target.statuses && ctx.target.statuses[spec]);
    case 'selfHasStatus':        return Boolean(ctx.self && ctx.self.statuses && ctx.self.statuses[spec]);
    case 'abilityHasTag':        return Boolean(ctx.ability && ctx.ability.tags && ctx.ability.tags.includes(spec));
    case 'round':                return cmpNumber(ctx.round || 0, spec);
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

// ─── Effect dispatcher ───────────────────────────────────────────────

function runEffect(eff, ctx) {
  const cbs = ctx.cbs || {};
  switch (eff.type) {
    case 'stat_mult':
      if (eff.stat === ctx.queryStat) ctx.outMult *= (eff.value ?? 1);
      return;
    case 'power_mult':
      ctx.outPower *= (eff.value ?? 1);
      return;
    case 'flat_dmg_reduction':
      ctx.outRaw -= (eff.value || 0);
      return;
    case 'incoming_mult':
      ctx.outRaw *= (eff.value ?? 1);
      return;
    case 'crit_chance_set':
      ctx.outCritChance = Math.max(ctx.outCritChance || 0, eff.value ?? ctx.outCritChance);
      return;
    case 'crit_mult_add':
      ctx.outCritMult = (ctx.outCritMult || 1.7) + (eff.value || 0);
      return;
    case 'heal_mult':
      ctx.outHealMult *= (eff.value ?? 1);
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
    case 'apply_status': {
      const target = eff.target === 'self' ? ctx.self : ctx.target;
      if (!target || target.hp <= 0) return;
      const chance = eff.chance ?? 1;
      if (chance < 1 && Math.random() >= chance) return;
      if (cbs.applyStatus && cbs.applyStatus(target, eff.status, {})) {
        if (cbs.pushGame) {
          const sName = ({ burn: 'Fevering', brittle: 'Brittle', drained: 'Drained', stun: 'Stunned' })[eff.status] || eff.status;
          cbs.pushGame(`${cap(name(target))} · ${sName} (${ctx.passive ? ctx.passive.name : 'passive'}).`, { cls: 'eff' });
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
    case 'grant_charge': {
      const f = ctx.self;
      const amount = eff.amount ?? 1;
      const before = f.charge || 0;
      f.charge = Math.min(3, before + amount);
      if (cbs.pushGame && f.charge > before) {
        cbs.pushGame(`${cap(name(f))} · +${f.charge - before} Charge (${ctx.passive ? ctx.passive.name : ''}).`, { cls: 'eff' });
      }
      return;
    }
    case 'cleanse_self_step': {
      const f = ctx.self;
      if (f.statuses) {
        if      (f.statuses.brittle) f.statuses.brittle = null;
        else if (f.statuses.drained) f.statuses.drained = null;
        else if (f.statuses.burn)    f.statuses.burn = null;
        else if (f.statuses.stun)    f.statuses.stun = null;
      }
      return;
    }
    case 'cleanse_target': {
      if (!ctx.incoming || !cbs.cleanseStatuses) return;
      cbs.cleanseStatuses(ctx.incoming);
      if (cbs.pushGame) cbs.pushGame(`${cap(name(ctx.incoming))} · cleansed.`, { cls: 'eff' });
      return;
    }
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

// ─── Public API ──────────────────────────────────────────────────────

export function applyStatMult(f, stat, m) {
  const ctx = { self: f, queryStat: stat, outMult: m };
  fire(f, 'stat_query', ctx);
  return ctx.outMult;
}

export function applyPowerMult(attacker, defender, ability, power, phase, { attackerSpd = 0, defenderSpd = 0 } = {}) {
  const ctx = {
    self: attacker, target: defender, ability,
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
  return ctx.outPower;
}

// Apply all defense_query passives (flat reduction, incoming multipliers)
// AND relic takeMult in one pass. Called once per damage calculation.
export function applyDefenseModifiers(defender, raw, attackElement, round) {
  const ctx = { self: defender, attackElement, outRaw: raw, round };
  fire(defender, 'defense_query', ctx);
  if (state.relics && state.relics.length) {
    for (const r of state.relics) if (r.takeMult) ctx.outRaw *= r.takeMult;
  }
  return ctx.outRaw;
}

export function getCritProfile(attacker) {
  let chance = 0.08;
  let mult = 1.7;
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
  return baseEvade > 0 && Math.random() < baseEvade;
}

export function modifyHeal(f, baseAmount) {
  const ctx = { self: f, outHealMult: 1, outBlockHeal: false };
  fire(f, 'heal_query', ctx);
  if (state.relics && state.relics.length) {
    for (const r of state.relics) if (r.healMult) ctx.outHealMult *= r.healMult;
  }
  if (ctx.outBlockHeal) return { amount: 0, cap: f.creature.maxHp };
  return { amount: Math.round(baseAmount * ctx.outHealMult), cap: f.creature.maxHp };
}

export function blocksStatus(f, statusType) {
  const ctx = { self: f, statusType, outBlocked: false };
  fire(f, 'status_block', ctx);
  return ctx.outBlocked;
}

export function bypassesTypeChart(_attacker) { return false; }

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
