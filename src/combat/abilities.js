import { STATUSES, ADDITIONAL_EFFECTS } from '../data.js';
import { state, pushGame, pushLore } from '../state.js';
import { displayName } from '../creature.js';
import { hasPassive, applyPostHitPassives, applySelfDmgMult } from './passives.js';
import { applyStatus, cleanseStatuses, applyHeal } from './status.js';
import { spawnFloat } from '../ui/animations.js';
import { drainBeats } from './log.js';

const lower = (s) => String(s || '');
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
    case 'bracing': return 'after';
    case 'swap': return 'after';
    case 'cleanse': return 'after';
    case 'lifesteal': return 'eachHit';
    case 'hp_cost': return 'before';
    case 'sig_gain_light':
    case 'sig_gain_heat':
    case 'sig_gain_roots':
    case 'sig_gain_frost':
    case 'sig_gain_embers':
    case 'sig_gain_hollow': return 'after';
    case 'sig_gain_marks': return 'eachHit';
    case 'sig_consume_hollow_curse': return 'after';
    case 'sig_consume_embers_aoe': return 'after';
    case 'sig_consume_frost_shatter': return 'after';
    // sig_consume_*_dmg run BOTH at damage calc time AND in the handler
    // (which zeros stacks). The timed handler runs at 'after'.
    case 'sig_consume_light_dmg':
    case 'sig_consume_heat_dmg':
    case 'sig_consume_roots_dmg':
    case 'sig_consume_marks_dmg':
    case 'sig_consume_tide_dmg': return 'after';
  }
  return null;
}

// True for effects that ONLY modify damage during calc (and have no other
// runtime side-effect via the timed handler). These are skipped by the
// dispatcher entirely.
function isPureDamageMod(eff) {
  if (!eff || !eff.type) return false;
  if (eff.type === 'pierce' || eff.type === 'execute_scale' || eff.type === 'status_synergy') return true;
  return false;
}

export function applyCursedOnSwap(f, side) {
  if (!f || !f.statuses || !f.statuses.cursed) return 0;
  let dmg = Math.max(1, Math.round(f.creature.maxHp * f.statuses.cursed.percentOnSwap));
  if (state.relics && state.relics.length) {
    for (const r of state.relics) if (r.reduceCursedSwap) dmg = Math.max(1, Math.round(dmg * (1 - r.reduceCursedSwap)));
  }
  f.hp = Math.max(0, f.hp - dmg);
  pushGame(`${cap(lower(displayName(f.creature)))} · Broken takes -${dmg} on swap.`, {
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
  if (targetKey === 'all_enemies') {
    const out = [];
    if (defender && defender.hp > 0) out.push(defender);
    if (enemyBench && enemyBench.hp > 0) out.push(enemyBench);
    return out;
  }
  return [];
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
        pushGame(`${cap(lower(displayName(target.creature)))} · ${sName}.`, { cls: 'eff', icon: status });
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
        pushGame(`${cap(lower(displayName(fighters[0].creature)))} · ${parts.join(', ')}${turns ? ` (${turns}r)` : ''}.`, { cls: 'eff' });
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
        pushGame(`${cap(lower(displayName(f.creature)))} · regen ${perTurn}/r for ${turns}r.`, { cls: 'eff' });
      }
      return;
    }
    case 'heal_self_pct': {
      const pct = effParam(eff, 'percent') || 0.2;
      const amt = Math.round(attacker.creature.maxHp * pct);
      const healed = applyHeal(attacker, amt);
      if (healed > 0) {
        pushGame(`${cap(lower(displayName(attacker.creature)))} +${healed} hp.`, {
          heal: healed, cls: 'heal',
          anim: () => spawnFloat(side, `+${healed}`, 'heal'),
        });
      }
      return;
    }
    case 'bracing': {
      const targets = effParam(eff, 'targets') || ['self'];
      const fighters = targets.flatMap(tk => resolveTargets(tk, side, attacker, defender));
      for (const f of fighters) f.bracingThisTurn = true;
      if (fighters.length) {
        pushGame(`${cap(lower(displayName(fighters[0].creature)))} · braces (-60% next hit).`, { cls: 'eff' });
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
        pushGame(`${cap(lower(displayName(f.creature)))} · cleansed.`, { cls: 'eff' });
      }
      return;
    }
    case 'lifesteal': {
      const pct = effParam(eff, 'percentOfDamage') || 0;
      const healed = applyHeal(attacker, Math.round((lastDmg || 0) * pct));
      if (healed > 0) {
        pushGame(`${cap(lower(displayName(attacker.creature)))} drinks +${healed}.`, {
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
        pushGame(`${cap(lower(displayName(attacker.creature)))} pays -${cost}.`, {
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

    // ── signature mechanics ──────────────────────────────────────────
    case 'sig_gain_light':
    case 'sig_gain_heat':
    case 'sig_gain_roots':
    case 'sig_gain_frost':
    case 'sig_gain_embers':
    case 'sig_gain_hollow': {
      const amount = eff.amount ?? 1;
      const max = (attacker.creature.signature && attacker.creature.signature.max) || 5;
      const before = attacker.sigStacks || 0;
      attacker.sigStacks = Math.min(max, before + amount);
      const gained = attacker.sigStacks - before;
      if (gained > 0) {
        const label = (attacker.creature.signature && attacker.creature.signature.label) || 'Stacks';
        pushGame(`${cap(lower(displayName(attacker.creature)))} · +${gained} ${label} (${attacker.sigStacks}/${max}).`, { cls: 'eff' });
      }
      return;
    }
    case 'sig_gain_marks': {
      // Marks attach to the TARGET (not the attacker).
      if (!defender || defender.hp <= 0) return;
      const amount = eff.amount ?? 1;
      const max = 4;
      defender.marks = Math.min(max, (defender.marks || 0) + amount);
      pushGame(`${cap(lower(displayName(defender.creature)))} · +${amount} Mark (${defender.marks}/${max}).`, { cls: 'eff' });
      return;
    }
    case 'sig_consume_hollow_curse': {
      const stacks = attacker.sigStacks || 0;
      if (stacks <= 0) {
        pushGame('No Hollow to spend.', { cls: 'fade' });
        return;
      }
      // Apply Broken with extended turns scaling
      const turns = Math.max(2, 2 + stacks);
      applyStatus(defender, 'cursed', { turns });
      pushGame(`${cap(lower(displayName(defender.creature)))} · Broken (${turns}r).`, { cls: 'eff' });
      attacker.sigStacks = 0;
      return;
    }
    case 'sig_consume_embers_aoe': {
      const stacks = attacker.sigStacks || 0;
      if (stacks <= 0) return;
      // Damage to enemy bench too (already hit active in damage phase)
      const benchTarget = side === 'player' ? state.ebf : state.bf;
      if (benchTarget && benchTarget.hp > 0) {
        const flat = Math.max(1, Math.round(benchTarget.creature.maxHp * 0.10 * stacks));
        benchTarget.hp = Math.max(0, benchTarget.hp - flat);
        const targetSide = side === 'player' ? 'enemy' : 'player';
        pushGame(`${cap(lower(displayName(benchTarget.creature)))} · burst -${flat}.`, {
          cls: 'eff', damage: flat,
          anim: () => spawnFloat(targetSide, String(flat), 'dmg'),
        });
      }
      attacker.sigStacks = 0;
      return;
    }
    case 'sig_consume_frost_shatter': {
      const stacks = attacker.sigStacks || 0;
      if (stacks >= 3 && defender && defender.hp > 0) {
        applyStatus(defender, 'dazed', {});
        pushGame(`${cap(lower(displayName(defender.creature)))} · Sedated.`, { cls: 'eff' });
      }
      attacker.sigStacks = 0;
      return;
    }
    case 'sig_consume_light_dmg':
    case 'sig_consume_heat_dmg':
    case 'sig_consume_roots_dmg':
    case 'sig_consume_marks_dmg':
    case 'sig_consume_tide_dmg': {
      // These are damage modifiers consumed in damage.js. We just zero out stacks here (after damage already calculated).
      // For Marks (which lives on defender), zero out defender's marks instead of attacker's.
      if (eff.type === 'sig_consume_marks_dmg') {
        if (defender) defender.marks = 0;
      } else if (eff.type !== 'sig_consume_tide_dmg') {
        attacker.sigStacks = 0;
      }
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
