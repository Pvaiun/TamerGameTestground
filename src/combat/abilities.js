import { STATUSES, ADDITIONAL_EFFECTS } from '../data.js';
import { state, pushLog } from '../state.js';
import { displayName } from '../creature.js';
import { hasPassive, applyPostHitPassives, applySelfDmgMult } from './passives.js';
import { applyStatus, cleanseStatuses, applyHeal } from './status.js';
import { spawnFloat } from '../ui/animations.js';
import { drainLog, affApply, eventText } from './log.js';
import { VOICE } from '../data.js';

const lower = (s) => String(s || '');

function effectLine(kind, fallback, vars) {
  const v = VOICE.effectDefaults[kind];
  const tmpl = (v && (v.hit || v.use)) || fallback || '';
  if (!tmpl) return '';
  return tmpl.replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? String(vars[k]) : ''));
}

export function effParam(eff, paramKey) {
  if (eff[paramKey] !== undefined) return eff[paramKey];
  const schema = ADDITIONAL_EFFECTS[eff.type];
  return schema && schema.params && schema.params[paramKey] ? schema.params[paramKey].default : undefined;
}

export function allEffects(ability) {
  return (ability.phases || []).flat();
}

function phaseEffects(ability, phaseIdx) {
  const phases = ability.phases || [];
  return phases[phaseIdx] || [];
}

function effectTiming(eff) {
  if (eff.timing) return eff.timing;
  const schema = ADDITIONAL_EFFECTS[eff.type];
  return schema?.defaultTiming || null;
}

function isModifier(eff) {
  return ADDITIONAL_EFFECTS[eff.type]?.modifier === true;
}

// Apply the cursed-on-swap penalty if the swapping-out fighter has cursed status.
// Pivot Master halves this damage. Rust-on-pin relic stacks the reduction.
export function applyCursedOnSwap(f, side) {
  if (!f || !f.statuses || !f.statuses.cursed) return 0;
  let dmg = Math.max(1, Math.round(f.creature.maxHp * f.statuses.cursed.percentOnSwap));
  if (hasPassive(f, 'pivot_master')) dmg = Math.max(1, Math.round(dmg * 0.5));
  if (state.relics && state.relics.length) {
    for (const r of state.relics) if (r.reduceCursedSwap) dmg = Math.max(1, Math.round(dmg * (1 - r.reduceCursedSwap)));
  }
  f.hp = Math.max(0, f.hp - dmg);
  pushLog(eventText('swap_curse', { actor: lower(displayName(f.creature)) }), {
    cls: 'eff',
    damage: dmg,
    anim: () => spawnFloat(side, String(dmg), 'crit'),
  });
  return dmg;
}

export function processPostHit(side, oside, attacker, defender, ability, result) {
  applyPostHitPassives(side, oside, attacker, defender, result, {
    applyHeal, applyStatus, spawnFloat, pushLog, displayName,
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

function statusOptsFor(_attacker, _statusName) {
  return {};
}

async function handleEffect(eff, ctx) {
  const { side, oside, attacker, defender, lastDmg, helpers } = ctx;
  switch (eff.type) {
    case 'apply_status': {
      const status   = effParam(eff, 'status');
      const targets  = effParam(eff, 'targets') || ['enemy'];
      const turnsOv  = effParam(eff, 'turnsOverride');
      const pctOv    = effParam(eff, 'percentOverride');
      const opts     = { ...statusOptsFor(attacker, status) };
      if (turnsOv && turnsOv > 0) opts.turns = turnsOv;
      if (pctOv && pctOv > 0)     opts.pct   = pctOv;
      const fighters = targets.flatMap(tk => resolveTargets(tk, side, attacker, defender));
      const applied = [];
      for (const f of fighters) if (applyStatus(f, status, opts)) applied.push(f);
      if (applied.length) {
        // Use the actual target's name for prose templating.
        const target = applied[0];
        const prose = affApply(status).replace('{target}', lower(displayName(target.creature)));
        pushLog(prose, { cls: 'eff' });
      }
      return;
    }
    case 'buff': {
      const targets = effParam(eff, 'targets') || ['self'];
      const sm = eff.statMult || {};
      const fighters = targets.flatMap(tk => resolveTargets(tk, side, attacker, defender));
      for (const f of fighters) {
        for (const [k, v] of Object.entries(sm)) {
          if (typeof v === 'number' && v !== 0) f.statMods[k] = (f.statMods[k] || 0) + v;
        }
      }
      const parts = Object.entries(sm)
        .filter(([, v]) => typeof v === 'number' && v !== 0)
        .map(([k, v]) => `${k} ${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`);
      if (fighters.length && parts.length) {
        const isBuff = parts.some(p => p.includes('+'));
        const base = effectLine(isBuff ? 'buff' : 'debuff', isBuff ? 'Their grip ~~tightens~~ holds.' : 'They slip.');
        pushLog(`${base} ${parts.join(', ')}.`, { cls: 'eff' });
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
        pushLog(effectLine('heal', 'The wound holds.', { actor: lower(displayName(f.creature)) }));
      }
      return;
    }
    case 'bracing': {
      const targets = effParam(eff, 'targets') || ['self'];
      const fighters = targets.flatMap(tk => resolveTargets(tk, side, attacker, defender));
      for (const f of fighters) f.bracingThisTurn = true;
      if (fighters.length) {
        pushLog(effectLine('brace', 'They brace against the next blow.', { actor: lower(displayName(fighters[0].creature)) }));
      }
      return;
    }
    case 'cleanse': {
      const targets    = effParam(eff, 'targets') || ['self'];
      const doStatuses = effParam(eff, 'cleanseStatuses');
      const doBuffs    = effParam(eff, 'cleanseBuffs');
      const doDebuffs  = effParam(eff, 'cleanseDebuffs');
      const fighters = targets.flatMap(tk => resolveTargets(tk, side, attacker, defender));
      for (const f of fighters) {
        if (doStatuses) cleanseStatuses(f);
        if (doBuffs || doDebuffs) {
          for (const k of ['atk', 'def', 'spd']) {
            if (doBuffs   && f.statMods[k] > 0) f.statMods[k] = 0;
            if (doDebuffs && f.statMods[k] < 0) f.statMods[k] = 0;
          }
        }
        pushLog(effectLine('cleanse', `What was on ${lower(displayName(f.creature))} lifts.`, { actor: lower(displayName(f.creature)) }));
      }
      return;
    }
    case 'lifesteal': {
      const pct = effParam(eff, 'percentOfDamage') || 0;
      const healed = applyHeal(attacker, Math.round((lastDmg || 0) * pct));
      if (healed > 0) {
        pushLog(`${displayName(attacker.creature)} ~~feeds~~ drinks.`, {
          heal: healed,
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
        pushLog(`${displayName(attacker.creature)} pays in themselves.`, {
          damage: cost,
          anim: () => spawnFloat(side, String(cost), 'dmg'),
        });
      }
      return;
    }
    case 'swap': {
      const targets = effParam(eff, 'targets') || ['self'];
      if (targets.includes('enemy')) await doEnemySwap(side, oside, defender);
      if (targets.includes('self') && attacker.hp > 0) {
        await helpers.performSelfSwap(side, attacker, eff);
      }
      return;
    }
  }
}

async function doEnemySwap(side, oside, defender) {
  const oppBench = side === 'player' ? state.ebf : state.bf;
  if (!oppBench || oppBench.hp <= 0) {
    pushLog(eventText('swap_none', { actor: lower(displayName(defender.creature)) }), { cls: 'eff' });
    await drainLog();
    return;
  }
  applyCursedOnSwap(defender, oside);
  pushLog(eventText('swap_yanked', { actor: lower(displayName(defender.creature)) }), { cls: 'eff' });
  await drainLog();
  if (side === 'player') {
    const out = state.ef;
    state.ef = state.ebf;
    state.ebf = out;
    state.enemyActiveIdx = 1 - state.enemyActiveIdx;
    state.enemy = state.enemyParty[state.enemyActiveIdx];
    if (state.ef) state.ef.queuedAbility = null;
  } else {
    const out = state.pf;
    state.pf = state.bf;
    state.bf = out;
    state.activeIdx = 1 - state.activeIdx;
    if (state.pf) state.pf.queuedAbility = null;
  }
}

export async function runTimedEffects(timing, phase, ctx) {
  for (const eff of phase) {
    if (isModifier(eff) || eff.type === 'damage') continue;
    if (effectTiming(eff) !== timing) continue;
    await handleEffect(eff, ctx);
  }
}

export async function runEachHitEffects(phase, ctx) {
  for (const eff of phase) {
    if (isModifier(eff) || eff.type === 'damage') continue;
    if (effectTiming(eff) !== 'eachHit') continue;
    await handleEffect(eff, ctx);
  }
}

export function findModifier(phase, type) {
  return phase.find(e => e.type === type) || null;
}
