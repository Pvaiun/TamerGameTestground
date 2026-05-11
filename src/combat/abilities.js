// Ability effect dispatcher. Each phase of an ability is a list of effect
// objects. Damage effects run during the damage phase; other effects run
// either 'before', 'after', or 'eachHit'.

import { ADDITIONAL_EFFECTS } from '../data.js';
import { state, pushGame } from '../state.js';
import { displayName } from '../creature.js';
import { applyPostHitPassives } from './passives.js';
import { applyStatus, cleanseStatuses, applyHeal } from './status.js';
import { spawnFloat } from '../ui/animations.js';

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
    case 'gain_charge': return 'after';
    case 'spend_charge': return 'after';   // damage uses it during calc; we zero stacks here
  }
  return null;
}

function isPureDamageMod(eff) {
  if (!eff || !eff.type) return false;
  if (eff.type === 'pierce' || eff.type === 'execute_scale') return true;
  return false;
}

export function processPostHit(side, oside, attacker, defender, ability, result) {
  applyPostHitPassives(side, oside, attacker, defender, result, {
    applyHeal, applyStatus, spawnFloat, pushGame, displayName,
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
      const chance   = eff.chance ?? 1;
      if (chance < 1 && Math.random() >= chance) {
        pushGame(`${cap(lower(displayName(attacker.creature)))} · ${prettyStatus(status)} missed.`, { cls: 'fade' });
        return;
      }
      const opts = {};
      if (turnsOv && turnsOv > 0) opts.turns = turnsOv;
      const fighters = targets.flatMap(tk => resolveTargets(tk, side, attacker, defender));
      const applied = [];
      for (const f of fighters) if (applyStatus(f, status, opts)) applied.push(f);
      if (applied.length) {
        const target = applied[0];
        pushGame(`${cap(lower(displayName(target.creature)))} · ${prettyStatus(status)}.`, { cls: 'eff', icon: status });
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
        pushGame(`${cap(lower(displayName(fighters[0].creature)))} · braces (−50% next hit).`, { cls: 'eff' });
      }
      return;
    }

    case 'cleanse': {
      const targets = effParam(eff, 'targets') || ['self'];
      const fighters = targets.flatMap(tk => resolveTargets(tk, side, attacker, defender));
      for (const f of fighters) {
        cleanseStatuses(f);
        for (const k of ['atk', 'def', 'spd']) {
          if (f.statMods[k] < 0) f.statMods[k] = 0;
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

    case 'swap': {
      const targets = effParam(eff, 'targets') || ['self'];
      if (targets.includes('self') && attacker.hp > 0) {
        if (helpers && helpers.performSelfSwap) await helpers.performSelfSwap(side, attacker, eff);
      }
      return;
    }

    case 'gain_charge': {
      const amount = eff.amount ?? 1;
      const before = attacker.charge || 0;
      attacker.charge = Math.min(3, before + amount);
      const gained = attacker.charge - before;
      if (gained > 0) {
        pushGame(`${cap(lower(displayName(attacker.creature)))} · +${gained} Charge (${attacker.charge}/3).`, { cls: 'eff' });
      }
      return;
    }

    case 'spend_charge': {
      // Damage was already calculated using charge at calc time.
      // We just need to zero out stacks now.
      if ((attacker.charge || 0) > 0) {
        pushGame(`${cap(lower(displayName(attacker.creature)))} · spent ${attacker.charge} Charge.`, { cls: 'fade' });
        attacker.charge = 0;
      }
      return;
    }
  }
}

export function applyCursedOnSwap(_f, _side) {
  // Legacy: cursed-on-swap was removed. Status 'cursed' no longer exists in
  // the simplified status set.
  return 0;
}

function prettyStatus(k) {
  return ({ burn: 'Fevering', brittle: 'Brittle', drained: 'Drained', stun: 'Stunned' })[k] || k;
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
