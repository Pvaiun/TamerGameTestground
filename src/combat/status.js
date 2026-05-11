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
  if (type === 'burn') {
    f.statuses.burn = { turns, percentPerTurn: opts.pct ?? def.percentPerTurn };
    return true;
  }
  if (type === 'brittle') {
    f.statuses.brittle = { turns, vulnerability: opts.vulnerability ?? def.vulnerability ?? 0.30 };
    return true;
  }
  if (type === 'drained') {
    f.statuses.drained = {
      turns,
      atkMult: opts.atkMult ?? def.atkMult ?? 0.7,
      spdMult: opts.spdMult ?? def.spdMult ?? 0.7,
    };
    return true;
  }
  if (type === 'stun') {
    f.statuses.stun = { turns, skipChance: opts.skipChance ?? def.skipChance ?? 0.5 };
    return true;
  }
  return false;
}

export function cleanseStatuses(f) {
  f.statuses.burn = null;
  f.statuses.brittle = null;
  f.statuses.drained = null;
  f.statuses.stun = null;
}

export async function tickFighterStatuses(f, side, isBench) {
  applyBenchPassives(f, isBench, { applyHeal });
  if (f.statuses.burn && f.statuses.burn.turns > 0) {
    const dmg = Math.max(1, Math.round(f.creature.maxHp * f.statuses.burn.percentPerTurn));
    f.hp = Math.max(0, f.hp - dmg);
    if (!isBench) {
      pushGame(`${cap(displayName(f.creature))} · Fevering −${dmg}.`, {
        damage: dmg, cls: 'eff',
        anim: () => spawnFloat(side, String(dmg), 'dmg'),
      });
      await drainBeats();
    }
    f.statuses.burn.turns--;
    if (f.statuses.burn.turns <= 0) f.statuses.burn = null;
  }
  if (f.statuses.brittle && f.statuses.brittle.turns > 0) {
    f.statuses.brittle.turns--;
    if (f.statuses.brittle.turns <= 0) f.statuses.brittle = null;
  }
  if (f.statuses.drained && f.statuses.drained.turns > 0) {
    f.statuses.drained.turns--;
    if (f.statuses.drained.turns <= 0) f.statuses.drained = null;
  }
  if (f.statuses.stun && f.statuses.stun.turns > 0) {
    f.statuses.stun.turns--;
    if (f.statuses.stun.turns <= 0) f.statuses.stun = null;
  }
}

export async function tickStartOfRound(f, side) {
  if (!f) return;
  await tickFighterStatuses(f, side, false);
  f.bracingThisTurn = false;
}

export function applyHeal(f, baseAmount) {
  const { amount, cap: capHp } = modifyHeal(f, baseAmount);
  const before = f.hp;
  f.hp = Math.min(capHp, f.hp + amount);
  return f.hp - before;
}
