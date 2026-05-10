// Generic passive engine. Passives in data/passives.json are
// `{ name, desc, triggers: [{ on, if?, effect, consumesOn? }] }`.
// Trigger names + condition predicates + effect schemas live in
// data/passivetriggers.json (loaded as PASSIVE_SCHEMA).
//
// Each call site exports a thin wrapper that fires one trigger and reduces
// the matched effects into the return value the call site needs.

import { PASSIVES, ADDITIONAL_EFFECTS } from '../data.js';

export function hasPassive(f, key) {
  return f && f.creature && f.creature.passives && f.creature.passives.includes(key);
}

// ─── Trigger walking ─────────────────────────────────────────────────────────

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

// ─── Conditions ──────────────────────────────────────────────────────────────

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
    case 'isCrit':               return Boolean(ctx.isCrit) === Boolean(spec);
    case 'selfFasterThanTarget': return Boolean(ctx.selfFaster) === Boolean(spec);
    case 'bracing':              return Boolean(ctx.self && ctx.self.bracingThisTurn) === Boolean(spec);
    case 'onBench':              return Boolean(ctx.self && ctx.self.onBench) === Boolean(spec);
    case 'attackElement':        return ctx.attackElement === spec;
    case 'queryStat':            return ctx.queryStat === spec;
    case 'targetHasStatus':      return Boolean(ctx.target && ctx.target.statuses && ctx.target.statuses[spec]);
    case 'selfHasStatus':        return Boolean(ctx.self && ctx.self.statuses && ctx.self.statuses[spec]);
  }
  return true;
}

function condsMet(ifMap, ctx) {
  if (!ifMap) return true;
  for (const [k, v] of Object.entries(ifMap)) if (!evalCondition(k, v, ctx)) return false;
  return true;
}

// Matching trigger entries with conditions met and not yet consumed.
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

// ─── Custom effect implementations (the few mechanics that don't fit pure data) ──

const CUSTOM = {
  // Slow Burn: stack each turn; ATK bonus per stack.
  slowBurnTick(_eff, ctx) {
    const f = ctx.self;
    f.slowBurnStacks = Math.min(5, (f.slowBurnStacks || 0) + 1);
  },
  slowBurnAtkBonus(_eff, ctx) {
    if (ctx.queryStat !== 'atk') return;
    ctx.outMult *= 1 + 0.1 * Math.min(5, ctx.self.slowBurnStacks || 0);
  },
  // Patient Hunter: +0.5 power per turn skipped, max 3 stacks; consume on attack.
  patientHunterTick(_eff, ctx) {
    const f = ctx.self;
    if (!f.attackedThisTurn) f.patientStacks = Math.min(3, (f.patientStacks || 0) + 1);
    f.attackedThisTurn = false;
  },
  patientHunterConsume(_eff, ctx) {
    const f = ctx.self;
    f.attackedThisTurn = true;
    if (f.patientStacks && f.patientStacks > 0) {
      ctx.outPower *= 1 + 0.5 * Math.min(3, f.patientStacks);
      f.patientStacks = 0;
    }
  },
  // Zealot: would need a hook into "buff effect resolved on attacker." Not yet
  // wired; declared so the trigger entry doesn't error.
  zealotConsume(_eff, ctx) {
    if (ctx.self.zealotPrimed) {
      ctx.outPower *= 1.5;
      ctx.self.zealotPrimed = false;
    }
  },
  // Pivot Master: cursed-on-swap damage halved. abilities.applyCursedOnSwap
  // checks the passive directly; this stub keeps the trigger listed cleanly.
  pivotMasterReduceCursedSwap() {},
  // Spotter: bench tick mult. status.tickFighterStatuses checks the passive
  // directly; stub trigger keeps the data side intact.
  spotterTickMult() {},
  // Twin Soul / Scavenger: TODO (require new hooks); stubs.
  twinSoul() {},
  scavengerCopyBuff() {},
};

function runCustom(impl, ctx) {
  const fn = CUSTOM[impl];
  if (fn) fn(ctx.entry?.effect || {}, ctx);
}

// ─── Effect dispatcher ───────────────────────────────────────────────────────
// Many triggers reduce matched effects into a number (mult, raw, count, etc.).
// Others run side-effecting actions (heal, damage, apply status). The dispatcher
// returns void; per-trigger wrappers below collect what they need from `ctx`.

function runEffect(eff, ctx) {
  const cbs = ctx.cbs || {};
  switch (eff.type) {
    // ── Reducers (write to ctx.outMult / outPower / outRaw / outFlag) ──
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
    case 'crit_mult':
      ctx.outCritMult = eff.value ?? ctx.outCritMult;
      return;
    case 'crit_chance_set':
      ctx.outCritChance = eff.value ?? ctx.outCritChance;
      return;
    case 'crit_bonus_mult':
      ctx.outCritMult *= (eff.value ?? 1);
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
    case 'self_dmg_mult':
      ctx.outMult *= (eff.value ?? 1);
      return;
    case 'type_chart_bypass':
      ctx.outBypass = true;
      return;
    case 'tie_break_win':
      ctx.outWin = true;
      return;

    // ── Side-effecting actions ──
    case 'heal_self': {
      const f = ctx.self;
      const amt = Math.max(1, Math.round(f.creature.maxHp * (eff.percent || 0)));
      const healed = cbs.applyHeal ? cbs.applyHeal(f, amt) : 0;
      if (healed > 0 && cbs.spawnFloat && ctx.side) cbs.spawnFloat(ctx.side, `+${healed}`, 'heal');
      if (healed > 0 && cbs.pushLog && cbs.displayName && ctx.passive) {
        cbs.pushLog(`${cbs.displayName(f.creature)}'s ${ctx.passive.name} heals ${healed}.`);
      }
      return;
    }
    case 'heal_self_pct_dmg': {
      const f = ctx.self;
      const healed = cbs.applyHeal ? cbs.applyHeal(f, Math.round((ctx.dmg || 0) * (eff.percent || 0))) : 0;
      if (healed > 0 && cbs.spawnFloat && ctx.side) cbs.spawnFloat(ctx.side, `+${healed}`, 'heal');
      return;
    }
    case 'damage_target': {
      if (!ctx.target) return;
      const dmg = Math.max(1, Math.round(ctx.target.creature.maxHp * (eff.percent || 0)));
      ctx.target.hp = Math.max(1, ctx.target.hp - dmg);
      if (cbs.spawnFloat && ctx.oside) cbs.spawnFloat(ctx.oside, String(dmg), 'dmg');
      return;
    }
    case 'reflect_damage': {
      if (!ctx.target || ctx.target.hp <= 0) return;
      const back = Math.round((ctx.dmg || 0) * (eff.percent || 0));
      if (back <= 0) return;
      ctx.target.hp = Math.max(0, ctx.target.hp - back);
      if (cbs.spawnFloat && ctx.oside) cbs.spawnFloat(ctx.oside, String(back), 'dmg');
      if (cbs.pushLog && cbs.displayName && ctx.passive) {
        cbs.pushLog(`${cbs.displayName(ctx.self.creature)}'s ${ctx.passive.name} reflects ${back}.`, 'eff');
      }
      return;
    }
    case 'apply_status': {
      const target = eff.target === 'self' ? ctx.self : ctx.target;
      if (!target || target.hp <= 0) return;
      const chance = eff.chance ?? 1;
      if (chance < 1 && Math.random() >= chance) return;
      if (cbs.applyStatus) cbs.applyStatus(target, eff.status, {});
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
      if (cbs.pushLog && cbs.displayName && ctx.passive) {
        const parts = Object.entries(sm)
          .filter(([, v]) => typeof v === 'number' && v !== 0)
          .map(([k, v]) => `${k.toUpperCase()} ${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`);
        if (parts.length) cbs.pushLog(`${cbs.displayName(f.creature)}'s ${ctx.passive.name}: ${parts.join(', ')}.`, 'eff');
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
      if (cbs.pushLog && cbs.displayName) cbs.pushLog(`Tag Out cleanses ${cbs.displayName(ctx.incoming.creature)}.`, 'eff');
      return;
    }
    case 'cleanse_self_step': {
      const f = ctx.self;
      const step = eff.step || 0.15;
      if (f.statuses && f.statuses.soaking)      f.statuses.soaking = null;
      else if (f.statuses && f.statuses.burn)    f.statuses.burn = null;
      else if (f.statuses && f.statuses.dazed)   f.statuses.dazed = null;
      else if (f.statMods.atk < 0)               f.statMods.atk = Math.min(0, f.statMods.atk + step);
      else if (f.statMods.def < 0)               f.statMods.def = Math.min(0, f.statMods.def + step);
      else if (f.statMods.spd < 0)               f.statMods.spd = Math.min(0, f.statMods.spd + step);
      return;
    }
    case 'hp_cost_self': {
      const f = ctx.self;
      const cost = Math.round(f.creature.maxHp * (eff.percent || 0));
      f.hp = Math.max(1, f.hp - cost);
      return;
    }
    case 'restore_hp_to': {
      const f = ctx.self;
      const target = Math.round(f.creature.maxHp * (eff.percent ?? 0.5));
      if (f.hp < target && f.hp > 0) {
        f.hp = target;
        if (cbs.spawnFloat && ctx.side) cbs.spawnFloat(ctx.side, `+${target}`, 'heal');
        if (cbs.pushLog && cbs.displayName && ctx.passive) {
          cbs.pushLog(`${cbs.displayName(f.creature)}'s ${ctx.passive.name} triggers!`, 'eff');
        }
      }
      return;
    }
    case 'custom':
      runCustom(eff.impl, ctx);
      return;
  }
}

// Drives matched entries through the dispatcher.
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

// ─── Public API used by the rest of combat ──────────────────────────────────

// Stat query — multiplies through a base mult.
export function applyStatMult(f, stat, m) {
  const ctx = { self: f, queryStat: stat, outMult: m };
  fire(f, 'stat_query', ctx);
  if (stat === 'atk' && f.statuses && f.statuses.soaking) {
    ctx.outMult *= f.statuses.soaking.atkMult ?? 0.5;
  }
  return ctx.outMult;
}

// Power query — passive multipliers + phase-level damage modifiers (kept here
// because they used to live in this function).
export function applyPowerMult(attacker, defender, ability, power, phase, { attackerSpd = 0, defenderSpd = 0 } = {}) {
  const ctx = {
    self: attacker, target: defender,
    attackElement: ability.element || null,
    selfFaster: attackerSpd > defenderSpd,
    outPower: power,
  };
  fire(attacker, 'power_query', ctx);

  // Phase-level damage modifiers (read from the ability, not from passives).
  const exec = (phase || []).find(e => e.type === 'execute_scale');
  if (exec) {
    const sa = exec.scaleAmount ?? ADDITIONAL_EFFECTS.execute_scale?.params?.scaleAmount?.default ?? 0.5;
    ctx.outPower *= 1 + sa * (1 - (defender.hp / defender.creature.maxHp));
  }
  const syn = (phase || []).find(e => e.type === 'status_synergy');
  if (syn && defender.statuses) {
    const status = syn.status ?? ADDITIONAL_EFFECTS.status_synergy?.params?.status?.default ?? 'cursed';
    const mult   = syn.powerMult ?? ADDITIONAL_EFFECTS.status_synergy?.params?.powerMult?.default ?? 1.5;
    if (defender.statuses[status]) ctx.outPower *= mult;
  }
  return ctx.outPower;
}

// Defense — flat reduction or non-element multiplier.
export function applyFlatDmgReduction(defender, raw, attackElement = null) {
  const ctx = { self: defender, attackElement, outRaw: raw };
  fire(defender, 'defense_query', ctx);
  return ctx.outRaw;
}

// Crit query — passives may override mult, set chance, or add bonus mult.
export function getCritProfile(attacker) {
  const ctx = { self: attacker, outCritMult: 1.6, outCritChance: 0.1 };
  fire(attacker, 'crit_query', ctx);
  return { mult: ctx.outCritMult, chance: ctx.outCritChance };
}

// Back-compat wrappers used by damage.js (single mult-only API).
export function getCritMult(attacker) { return getCritProfile(attacker).mult; }
export function getCritChance(attacker) { return getCritProfile(attacker).chance; }

// Evasion query.
export function checkEvasion(defender) {
  const ctx = { self: defender, outEvadeChance: 0 };
  fire(defender, 'evasion_query', ctx);
  return ctx.outEvadeChance > 0 && Math.random() < ctx.outEvadeChance;
}

// Heal query — modifies a base heal amount and cap.
export function modifyHeal(f, baseAmount) {
  const ctx = { self: f, outHealMult: 1, outHealCapMult: 1, outBlockHeal: false };
  fire(f, 'heal_query', ctx);
  if (ctx.outBlockHeal) return { amount: 0, cap: f.creature.maxHp };
  return {
    amount: Math.round(baseAmount * ctx.outHealMult),
    cap: Math.round(f.creature.maxHp * ctx.outHealCapMult),
  };
}

// Status block — runs status_block trigger and returns true if any matched.
export function blocksStatus(f, statusType) {
  const ctx = { self: f, statusType, outBlocked: false };
  fire(f, 'status_block', ctx);
  return ctx.outBlocked;
}

// Type-chart bypass (used by damage.js to short-circuit element mults).
export function bypassesTypeChart(attacker) {
  const ctx = { self: attacker, outBypass: false };
  fire(attacker, 'type_chart_query', ctx);
  return ctx.outBypass;
}

// Self-damage modifier (used by hp_cost effect).
export function applySelfDmgMult(f, raw) {
  const ctx = { self: f, outMult: 1 };
  fire(f, 'self_damage_query', ctx);
  return raw * ctx.outMult;
}

// Tie break — returns true if this fighter wins ties.
export function winsTies(f) {
  const ctx = { self: f, outWin: false };
  fire(f, 'tie_break', ctx);
  return ctx.outWin;
}

// Battle start — fires for each living fighter against its current opponent.
export function applyBattleStartPassive(f, opponent, cbs) {
  fire(f, 'battle_start', { self: f, target: opponent, cbs, side: null, oside: null });
}

// Swap in/out. `incoming` is the new active; `outgoing` is the bench-bound creature.
export function applySwapInPassives(incoming, outgoing, side, cbs) {
  fire(incoming, 'swap_in', { self: incoming, target: null, cbs, side });
  fire(outgoing, 'swap_out', { self: outgoing, incoming, cbs, side });
}

// Post-hit: run hit_dealt on attacker and hit_taken on defender.
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

// Turn start — fires for the active fighter; also ticks timed buffs.
export function applyTurnStartPassives(f, side, cbs) {
  fire(f, 'turn_start', { self: f, side, cbs });
  tickTimedBuffs(f);
}

// Bench tick — heals and similar; returns the spotter mult for the burn-tick caller.
export function applyBenchPassives(f, isBench, cbs) {
  if (isBench) fire(f, 'bench_tick', { self: f, side: null, cbs });
  // Spotter still queried directly: it modifies tick damage on the bench ally,
  // which is structurally a bench_tick with a custom-impl effect that we
  // surface as a multiplier here for the existing call site.
  return (isBench && hasPassive(f, 'spotter')) ? 0.7 : 1.0;
}

// ─── Timed buffs (countdown on turn_start) ──────────────────────────────────

function tickTimedBuffs(f) {
  if (!f.timedBuffs || !f.timedBuffs.length) return;
  const remaining = [];
  for (const b of f.timedBuffs) {
    b.turnsLeft--;
    if (b.turnsLeft <= 0) {
      for (const [k, v] of Object.entries(b.statMods)) f.statMods[k] = (f.statMods[k] || 0) - v;
    } else {
      remaining.push(b);
    }
  }
  f.timedBuffs = remaining;
}
