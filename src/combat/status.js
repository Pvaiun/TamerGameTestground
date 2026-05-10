import { pushLog } from '../state.js';
import { displayName } from '../creature.js';
import { blocksStatus, modifyHeal, applyBenchPassives, applyTurnStartPassives } from './passives.js';
import { spawnFloat } from '../ui/animations.js';
import { STATUSES } from '../data.js';
import { drainLog, affTick, eventText } from './log.js';

const lower = (s) => String(s || '');

// Apply or refresh a status. Params fall back to canonical defaults in statuseffects.json.
export function applyStatus(f, type, opts) {
  opts = opts || {};
  if (blocksStatus(f, type)) return false;
  const def = STATUSES[type];
  if (!def) return false;
  const turns = opts.turns ?? def.turns;
  if (type === 'burn' || type === 'bloom') {
    f.statuses[type] = { turns, percentPerTurn: opts.pct ?? def.percentPerTurn };
    return true;
  }
  if (type === 'soaking') {
    f.statuses.soaking = { turns, atkMult: opts.atkMult ?? def.atkMult ?? 0.5 };
    return true;
  }
  if (type === 'cursed') {
    f.statuses.cursed = { turns, percentOnSwap: opts.pct ?? def.percentOnSwap };
    return true;
  }
  if (type === 'dazed') {
    f.statuses.dazed = { turns };
    return true;
  }
  return false;
}

export function cleanseStatuses(f) {
  f.statuses.burn = null;
  f.statuses.bloom = null;
  f.statuses.soaking = null;
  f.statuses.cursed = null;
  f.statuses.dazed = null;
}

// Tick statuses (burn/bloom/soaking/dazed/cursed). Used for active and bench fighters.
// Each tick that affects HP becomes a separate log line so the narrative reads
// one beat at a time. Bench ticks are silent (no log line, no animation).
export async function tickFighterStatuses(f, side, isBench) {
  const spotterMult = applyBenchPassives(f, isBench, { applyHeal });
  if (f.statuses.burn && f.statuses.burn.turns > 0) {
    const dmg = Math.max(1, Math.round(f.creature.maxHp * f.statuses.burn.percentPerTurn * spotterMult));
    f.hp = Math.max(0, f.hp - dmg);
    if (!isBench) {
      pushLog(affTick('burn'), {
        damage: dmg,
        anim: () => spawnFloat(side, String(dmg), 'dmg'),
      });
      await drainLog();
    }
    f.statuses.burn.turns--;
    if (f.statuses.burn.turns <= 0) f.statuses.burn = null;
  }
  if (f.statuses.bloom && f.statuses.bloom.turns > 0) {
    const healed = applyHeal(f, Math.max(1, Math.round(f.creature.maxHp * f.statuses.bloom.percentPerTurn)));
    if (healed > 0 && !isBench) {
      pushLog(affTick('bloom'), {
        heal: healed,
        anim: () => spawnFloat(side, `+${healed}`, 'heal'),
      });
      await drainLog();
    }
    f.statuses.bloom.turns--;
    if (f.statuses.bloom.turns <= 0) f.statuses.bloom = null;
  }
  if (f.statuses.soaking && f.statuses.soaking.turns > 0) {
    f.statuses.soaking.turns--;
    if (f.statuses.soaking.turns <= 0) f.statuses.soaking = null;
  }
  if (f.statuses.dazed && f.statuses.dazed.turns > 0) {
    f.statuses.dazed.turns--;
    if (f.statuses.dazed.turns <= 0) f.statuses.dazed = null;
  }
  if (f.statuses.cursed && f.statuses.cursed.turns > 0) {
    f.statuses.cursed.turns--;
    if (f.statuses.cursed.turns <= 0) f.statuses.cursed = null;
  }
}

export async function tickStartOfTurn(f, side) {
  if (f.healing && f.healing.turnsLeft > 0) {
    const healed = applyHeal(f, f.healing.perTurn);
    f.healing.turnsLeft--;
    if (f.healing.turnsLeft <= 0) f.healing = null;
    if (healed > 0) {
      pushLog('The wound holds.', {
        heal: healed,
        anim: () => spawnFloat(side, `+${healed}`, 'heal'),
      });
      await drainLog();
    }
  }
  applyTurnStartPassives(f, side, { applyHeal, spawnFloat, pushLog, displayName });
  await drainLog();
  await tickFighterStatuses(f, side, false);
  if (f.pendingSwapBuff) {
    for (const [k, v] of Object.entries(f.pendingSwapBuff)) {
      f.statMods[k] += v;
    }
    pushLog(eventText('swap_arrives_buffed', { actor: lower(displayName(f.creature)) }), { cls: 'eff' });
    await drainLog();
    f.pendingSwapBuff = null;
  }
  if (f.pendingSwapHeal > 0) {
    const amt = Math.round(f.creature.maxHp * f.pendingSwapHeal);
    const healed = applyHeal(f, amt);
    if (healed > 0) {
      pushLog(eventText('swap_arrives_healed', { actor: lower(displayName(f.creature)) }), {
        heal: healed,
        anim: () => spawnFloat(side, `+${healed}`, 'heal'),
      });
      await drainLog();
    }
    f.pendingSwapHeal = 0;
  }
  f.bracingThisTurn = false;
}

// Apply healing respecting passive modifiers (berserker blocks, blooming/vampire_touch amplify).
export function applyHeal(f, baseAmount) {
  const { amount, cap } = modifyHeal(f, baseAmount);
  const before = f.hp;
  f.hp = Math.min(cap, f.hp + amount);
  return f.hp - before;
}
