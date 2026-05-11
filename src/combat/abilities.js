import { STATUSES, ADDITIONAL_EFFECTS, ARCHETYPES } from '../data.js';
import { state, pushGame, pushLore } from '../state.js';
import { displayName } from '../creature.js';
import { hasPassive, applyPostHitPassives, applySelfDmgMult, fireTrigger } from './passives.js';
import { applyStatus, cleanseStatuses, applyHeal } from './status.js';
import { spawnFloat } from '../ui/animations.js';
import { drainBeats } from './log.js';

const cap = (s) => String(s || '').replace(/^./, c => c.toUpperCase());

export function effParam(eff, paramKey) {
  if (eff[paramKey] !== undefined) return eff[paramKey];
  const schema = ADDITIONAL_EFFECTS[eff.type];
  return schema && schema.params && schema.params[paramKey] ? schema.params[paramKey].default : undefined;
}

export function abilityHasTag(ability, tag) {
  return ability && ability.tags && ability.tags.includes(tag);
}

function effectTiming(eff) {
  if (eff.timing) return eff.timing;
  if (isPureDamageMod(eff)) return null;
  if (eff.type === 'damage') return null;
  switch (eff.type) {
    case 'apply_status': return 'after';
    case 'buff': return 'before';
    case 'heal_over_time': return 'after';
    case 'heal_self_pct': return 'after';
    case 'heal_bench_pct': return 'after';
    case 'bracing': return 'after';
    case 'swap': return 'after';
    case 'cleanse': return 'after';
    case 'lifesteal': return 'eachHit';
    case 'hp_cost': return 'before';
    case 'sig_gain': return 'after';
    case 'sig_consume_dmg': return 'after';        // also zeros stacks after damage
    case 'sig_consume_heal': return 'after';
    case 'sig_consume_heal_party': return 'after';
    case 'sig_consume_status_share': return 'after';
  }
  return null;
}

function isPureDamageMod(eff) {
  if (!eff || !eff.type) return false;
  if (eff.type === 'pierce' || eff.type === 'execute_scale' || eff.type === 'status_synergy' || eff.type === 'status_synergy_per_status') return true;
  return false;
}

export function applyCursedOnSwap(f, side) {
  if (!f || !f.statuses || !f.statuses.cursed) return 0;
  let dmg = Math.max(1, Math.round(f.creature.maxHp * f.statuses.cursed.percentOnSwap));
  if (state.relics && state.relics.length) {
    for (const r of state.relics) if (r.reduceCursedSwap) dmg = Math.max(1, Math.round(dmg * (1 - r.reduceCursedSwap)));
  }
  f.hp = Math.max(0, f.hp - dmg);
  pushGame(`${cap(displayName(f.creature))} · Broken takes -${dmg} on swap.`, {
    cls: 'eff', damage: dmg,
    anim: () => spawnFloat(side, String(dmg), 'crit'),
  });
  return dmg;
}

export function processPostHit(side, oside, attacker, defender, ability, result) {
  applyPostHitPassives(side, oside, attacker, defender, result, {
    applyHeal, applyStatus, spawnFloat, pushGame, pushLore, displayName,
  });
}

export function resolveTargets(targetKey, side, attacker, defender) {
  const ownBench   = side === 'player' ? state.bf  : state.ebf;
  const enemyBench = side === 'player' ? state.ebf : state.bf;
  if (targetKey === 'self')        return attacker.hp > 0 ? [attacker] : [];
  if (targetKey === 'bench')       return ownBench && ownBench.hp > 0 ? [ownBench] : [];
  if (targetKey === 'enemy')       return defender && defender.hp > 0 ? [defender] : [];
  if (targetKey === 'enemy_bench') return enemyBench && enemyBench.hp > 0 ? [enemyBench] : [];
  return [];
}

function clampStack(stacks, key, max) {
  if (!stacks) return;
  stacks[key] = Math.max(0, Math.min(max, stacks[key] || 0));
}

function stackMax(key) {
  for (const arch of Object.values(ARCHETYPES)) {
    if (arch.stack && arch.stack.key === key) return arch.stack.max || 4;
  }
  return 4;
}

function stackLabel(key) {
  for (const arch of Object.values(ARCHETYPES)) {
    if (arch.stack && arch.stack.key === key) return arch.stack.label || key;
  }
  return key;
}

async function handleEffect(eff, ctx) {
  const { side, oside, attacker, defender, lastDmg, helpers } = ctx;
  switch (eff.type) {
    case 'apply_status': {
      const status   = effParam(eff, 'status');
      const targets  = effParam(eff, 'targets') || ['enemy'];
      const turnsOv  = effParam(eff, 'turnsOverride');
      const opts     = {};
      if (turnsOv && turnsOv > 0) opts.turns = turnsOv;
      const fighters = targets.flatMap(tk => resolveTargets(tk, side, attacker, defender));
      const applied = [];
      for (const f of fighters) if (applyStatus(f, status, opts)) applied.push(f);
      if (applied.length) {
        const target = applied[0];
        const sName = ({ burn: 'Fevering', bloom: 'Mending', soaking: 'Drained', cursed: 'Broken', dazed: 'Sedated' })[status] || status;
        pushGame(`${cap(displayName(target.creature))} · ${sName}.`, { cls: 'eff' });
      }
      return;
    }
    case 'buff': {
      const targets = effParam(eff, 'targets') || ['self'];
      const sm = eff.statMult || {};
      const turns = eff.turns || 0;
      const fighters = targets.flatMap(tk => resolveTargets(tk, side, attacker, defender));
      for (const f of fighters) {
        for (const [k, v] of Object.entries(sm)) {
          if (typeof v === 'number' && v !== 0) f.statMods[k] = (f.statMods[k] || 0) + v;
        }
        if (turns > 0) {
          if (!f.timedBuffs) f.timedBuffs = [];
          f.timedBuffs.push({ statMods: { ...sm }, turnsLeft: turns });
        }
      }
      const parts = Object.entries(sm)
        .filter(([, v]) => typeof v === 'number' && v !== 0)
        .map(([k, v]) => `${k} ${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`);
      if (fighters.length && parts.length) {
        pushGame(`${cap(displayName(fighters[0].creature))} · ${parts.join(', ')}${turns ? ` (${turns}r)` : ''}.`, { cls: 'eff' });
      }
      return;
    }
    case 'heal_over_time': {
      const percent = effParam(eff, 'percent');
      const turns   = effParam(eff, 'turns');
      const targets = effParam(eff, 'targets') || ['self'];
      const fighters = targets.flatMap(tk => resolveTargets(tk, side, attacker, defender));
      for (const f of fighters) {
        const perTurn = Math.max(1, Math.round(f.creature.maxHp * percent));
        f.healing = { perTurn, turnsLeft: turns };
        pushGame(`${cap(displayName(f.creature))} · regen ${perTurn}/r for ${turns}r.`, { cls: 'eff' });
      }
      return;
    }
    case 'heal_self_pct': {
      const pct = effParam(eff, 'percent') || 0.18;
      const amt = Math.round(attacker.creature.maxHp * pct);
      const healed = applyHeal(attacker, amt);
      if (healed > 0) {
        pushGame(`${cap(displayName(attacker.creature))} +${healed} hp.`, {
          heal: healed, cls: 'heal',
          anim: () => spawnFloat(side, `+${healed}`, 'heal'),
        });
      }
      return;
    }
    case 'heal_bench_pct': {
      const pct = effParam(eff, 'percent') || 0.20;
      const bench = side === 'player' ? state.bf : state.ebf;
      if (bench && bench.hp > 0) {
        const amt = Math.round(bench.creature.maxHp * pct);
        const healed = applyHeal(bench, amt);
        if (healed > 0) {
          pushGame(`${cap(displayName(bench.creature))} (bench) +${healed} hp.`, {
            heal: healed, cls: 'heal',
          });
        }
      }
      return;
    }
    case 'bracing': {
      const targets = effParam(eff, 'targets') || ['self'];
      const fighters = targets.flatMap(tk => resolveTargets(tk, side, attacker, defender));
      for (const f of fighters) f.bracingThisTurn = true;
      if (fighters.length) {
        pushGame(`${cap(displayName(fighters[0].creature))} · braces (-50% next hit).`, { cls: 'eff' });
      }
      return;
    }
    case 'cleanse': {
      const targets    = effParam(eff, 'targets') || ['self'];
      const doStatuses = effParam(eff, 'cleanseStatuses') ?? true;
      const doBuffs    = effParam(eff, 'cleanseBuffs') ?? false;
      const doDebuffs  = effParam(eff, 'cleanseDebuffs') ?? true;
      const fighters = targets.flatMap(tk => resolveTargets(tk, side, attacker, defender));
      for (const f of fighters) {
        if (doStatuses) cleanseStatuses(f);
        if (doBuffs || doDebuffs) {
          for (const k of ['atk', 'def', 'spd']) {
            if (doBuffs   && f.statMods[k] > 0) f.statMods[k] = 0;
            if (doDebuffs && f.statMods[k] < 0) f.statMods[k] = 0;
          }
        }
        pushGame(`${cap(displayName(f.creature))} · cleansed.`, { cls: 'eff' });
      }
      return;
    }
    case 'lifesteal': {
      const pct = effParam(eff, 'percentOfDamage') || 0;
      const healed = applyHeal(attacker, Math.round((lastDmg || 0) * pct));
      if (healed > 0) {
        pushGame(`${cap(displayName(attacker.creature))} drinks +${healed}.`, {
          heal: healed, cls: 'heal',
          anim: () => spawnFloat(side, `+${healed}`, 'heal'),
        });
      }
      return;
    }
    case 'hp_cost': {
      const pct = effParam(eff, 'percent') || 0;
      let cost = Math.round(attacker.creature.maxHp * pct);
      cost = Math.max(0, Math.round(applySelfDmgMult(attacker, cost)));
      attacker.hp = Math.max(1, attacker.hp - cost);
      if (cost > 0) {
        pushGame(`${cap(displayName(attacker.creature))} pays -${cost}.`, {
          damage: cost, cls: 'eff',
          anim: () => spawnFloat(side, String(cost), 'dmg'),
        });
      }
      return;
    }
    case 'swap': {
      const targets = effParam(eff, 'targets') || ['self'];
      if (targets.includes('self') && attacker.hp > 0) {
        if (helpers && helpers.performSelfSwap) await helpers.performSelfSwap(side, attacker, eff);
      }
      return;
    }

    // ── signature stack mechanics ────────────────────────────────────
    case 'sig_gain': {
      const key = eff.key;
      if (!key) return;
      const amount = eff.amount ?? 1;
      const max = stackMax(key);
      if (!attacker.stacks) attacker.stacks = {};
      const before = attacker.stacks[key] || 0;
      attacker.stacks[key] = Math.min(max, before + amount);
      const gained = attacker.stacks[key] - before;
      if (gained > 0) {
        pushGame(`${cap(displayName(attacker.creature))} · +${gained} ${stackLabel(key)} (${attacker.stacks[key]}/${max}).`, { cls: 'fade' });
      }
      return;
    }
    case 'sig_consume_dmg': {
      // Damage scaling was already applied in damage.js. Just zero the stacks.
      const key = eff.key;
      if (!key || !attacker.stacks) return;
      const had = attacker.stacks[key] || 0;
      if (had > 0) {
        attacker.stacks[key] = 0;
        pushGame(`${cap(displayName(attacker.creature))} · spent ${had} ${stackLabel(key)}.`, { cls: 'fade' });
        // Fire 'tend_spent' (etc) for passive hooks like lightbearer_pulse
        fireTrigger(attacker, `${key}_spent`, { self: attacker, side, amount: had });
      }
      return;
    }
    case 'sig_consume_heal': {
      const key = eff.key;
      if (!key || !attacker.stacks) return;
      const had = attacker.stacks[key] || 0;
      if (had <= 0) {
        pushGame(`No ${stackLabel(key)} to spend.`, { cls: 'fade' });
        return;
      }
      const pct = (eff.perStack ?? 0.15) * had;
      const amt = Math.round(attacker.creature.maxHp * pct);
      const healed = applyHeal(attacker, amt);
      attacker.stacks[key] = 0;
      pushGame(`${cap(displayName(attacker.creature))} +${healed} (spent ${had} ${stackLabel(key)}).`, {
        heal: healed, cls: 'heal',
        anim: () => spawnFloat(side, `+${healed}`, 'heal'),
      });
      fireTrigger(attacker, `${key}_spent`, { self: attacker, side, amount: had });
      return;
    }
    case 'sig_consume_heal_party': {
      const key = eff.key;
      if (!key || !attacker.stacks) return;
      const had = attacker.stacks[key] || 0;
      if (had <= 0) {
        pushGame(`No ${stackLabel(key)} to spend.`, { cls: 'fade' });
        return;
      }
      const pct = (eff.perStack ?? 0.15) * had;
      const selfAmt = Math.round(attacker.creature.maxHp * pct);
      applyHeal(attacker, selfAmt);
      const bench = side === 'player' ? state.bf : state.ebf;
      if (bench && bench.hp > 0) {
        const benchAmt = Math.round(bench.creature.maxHp * pct);
        applyHeal(bench, benchAmt);
      }
      attacker.stacks[key] = 0;
      pushGame(`${cap(displayName(attacker.creature))} · party healed (spent ${had} ${stackLabel(key)}).`, { cls: 'heal' });
      fireTrigger(attacker, `${key}_spent`, { self: attacker, side, amount: had });
      return;
    }
    case 'sig_consume_status_share': {
      const key = eff.key;
      if (!key || !attacker.stacks) return;
      const had = attacker.stacks[key] || 0;
      if (had < (eff.minStacks || 1)) {
        pushGame(`Not enough ${stackLabel(key)}.`, { cls: 'fade' });
        return;
      }
      // Find the worst status on the defender, apply to enemy bench
      const order = ['cursed', 'soaking', 'burn', 'dazed'];
      const worst = order.find(s => defender.statuses && defender.statuses[s]);
      const benchTarget = side === 'player' ? state.ebf : state.bf;
      if (worst && benchTarget && benchTarget.hp > 0) {
        applyStatus(benchTarget, worst, {});
        const sName = ({ burn: 'Fevering', soaking: 'Drained', cursed: 'Broken', dazed: 'Sedated' })[worst] || worst;
        pushGame(`${cap(displayName(benchTarget.creature))} · ${sName} (shared).`, { cls: 'eff' });
      }
      attacker.stacks[key] = 0;
      return;
    }
  }
}

export async function runTimedEffects(timing, phase, ctx) {
  for (const eff of phase) {
    if (eff.type === 'damage') continue;
    if (isPureDamageMod(eff)) continue;
    if (effectTiming(eff) !== timing) continue;
    await handleEffect(eff, ctx);
  }
}

export async function runEachHitEffects(phase, ctx) {
  for (const eff of phase) {
    if (eff.type === 'damage') continue;
    if (isPureDamageMod(eff)) continue;
    if (effectTiming(eff) !== 'eachHit') continue;
    await handleEffect(eff, ctx);
  }
}
