import { pushGame } from '../state.js';
import { displayName } from '../creature.js';
import { blocksStatus, modifyHeal, applyBenchPassives } from './passives.js';
import { spawnFloat } from '../ui/animations.js';
import { STATUSES } from '../data.js';
import { drainBeats } from './log.js';

const cap = (s) => String(s || '').replace(/^./, c => c.toUpperCase());

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
    f.statuses.soaking = {
      turns,
      atkMult: opts.atkMult ?? def.atkMult ?? 0.7,
      spdMult: opts.spdMult ?? def.spdMult ?? 0.7,
    };
    return true;
  }
  if (type === 'cursed') {
    f.statuses.cursed = {
      turns,
      percentOnSwap: opts.pct ?? def.percentOnSwap,
      vulnerability: opts.vulnerability ?? def.vulnerability ?? 0.25,
    };
    return true;
  }
  if (type === 'dazed') {
    f.statuses.dazed = { turns, skipChance: opts.skipChance ?? def.skipChance ?? 0.35 };
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

export async function tickFighterStatuses(f, side, isBench) {
  applyBenchPassives(f, isBench, { applyHeal });
  if (f.statuses.burn && f.statuses.burn.turns > 0) {
    const dmg = Math.max(1, Math.round(f.creature.maxHp * f.statuses.burn.percentPerTurn));
    f.hp = Math.max(0, f.hp - dmg);
    if (!isBench) {
      pushGame(`${cap(displayName(f.creature))} · Fevering -${dmg}.`, {
        damage: dmg, cls: 'eff',
        anim: () => spawnFloat(side, String(dmg), 'dmg'),
      });
      await drainBeats();
    }
    f.statuses.burn.turns--;
    if (f.statuses.burn.turns <= 0) f.statuses.burn = null;
  }
  if (f.statuses.bloom && f.statuses.bloom.turns > 0) {
    const healed = applyHeal(f, Math.max(1, Math.round(f.creature.maxHp * f.statuses.bloom.percentPerTurn)));
    if (healed > 0 && !isBench) {
      pushGame(`${cap(displayName(f.creature))} · Mending +${healed}.`, {
        heal: healed, cls: 'heal',
        anim: () => spawnFloat(side, `+${healed}`, 'heal'),
      });
      await drainBeats();
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

export async function tickStartOfRound(f, side) {
  if (!f) return;
  // healing-over-time tick
  if (f.healing && f.healing.turnsLeft > 0) {
    const healed = applyHeal(f, f.healing.perTurn);
    f.healing.turnsLeft--;
    if (f.healing.turnsLeft <= 0) f.healing = null;
    if (healed > 0) {
      pushGame(`${cap(displayName(f.creature))} · regen +${healed}.`, {
        heal: healed, cls: 'heal',
        anim: () => spawnFloat(side, `+${healed}`, 'heal'),
      });
      await drainBeats();
    }
  }
  await tickFighterStatuses(f, side, false);
  // Reset bracingThisTurn at start of each round
  f.bracingThisTurn = false;
}

export function applyHeal(f, baseAmount) {
  const { amount, cap: capHp } = modifyHeal(f, baseAmount);
  const before = f.hp;
  f.hp = Math.min(capHp, f.hp + amount);
  return f.hp - before;
}
