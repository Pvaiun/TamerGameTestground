import { TYPE_CHART, ABILITIES, STATUSES } from '../data.js';
import { state } from '../state.js';
import { estimateDamage } from './damage.js';

function flatEffects(a) {
  return (a && a.phases ? a.phases : []).flat();
}

function isAttack(a) {
  return flatEffects(a).some(e => e.type === 'damage');
}

function hasSelfHeal(a) {
  return flatEffects(a).some(e => e.type === 'heal_over_time' && (e.targets || ['self']).includes('self'));
}

function isCleanseSelf(a) {
  return flatEffects(a).some(e => e.type === 'cleanse' && (e.targets || ['self']).includes('self'));
}

function isStatusAttack(a) {
  return flatEffects(a).some(e => e.type === 'apply_status' && !(e.targets || ['enemy']).includes('self'));
}

function isSelfBuff(a) {
  return flatEffects(a).some(e => e.type === 'buff' && (e.targets || ['self']).includes('self'));
}

function isSelfSwap(a) {
  return flatEffects(a).some(e => e.type === 'swap' && (e.targets || ['self']).includes('self'));
}

function elementMult(a, defType) {
  if (!a.element) return 1;
  return TYPE_CHART[a.element]?.[defType] || 1;
}

// Returns ability key or '_swap' meaning "swap to bench this turn".
//
// Improved heuristic:
//  1. If low hp & bench healthy & active matchup is bad, swap.
//  2. If low hp & we have a self-heal-over-time we aren't yet running, use it.
//  3. If we're cursed/burning and have a self-cleanse, use it.
//  4. Score remaining abilities by:
//      - estimated damage (× type chart, × status synergy bonus)
//      - status moves get a flat boost when target lacks the status
//      - self-buff moves get a boost on turn 1 when opposed by a high-HP enemy
//      - charge attacks (multi-phase) deprioritized when bench can come out
//      - self-swap moves only chosen if opp threatens lethal AND bench is alive.
//  5. Pick highest score with a small random tiebreak.
export function aiChoose(ef, pf) {
  const abilities = ef.creature.abilities;
  const hpFrac = ef.hp / ef.creature.maxHp;
  const lowHp = hpFrac < 0.30;
  const veryLowHp = hpFrac < 0.18;
  const benchAlive = state.ebf && state.ebf.hp > 0;
  const benchFrac = benchAlive ? state.ebf.hp / state.ebf.creature.maxHp : 0;

  // 1. swap heuristic
  if (benchAlive) {
    let swapWeight = 0;
    if (veryLowHp && benchFrac > 0.50) swapWeight += 0.65;
    if (ef.statuses && ef.statuses.cursed && hpFrac < 0.55 && benchFrac > 0.50) swapWeight += 0.30;
    if (ef.statuses && ef.statuses.soaking && benchFrac > 0.55) swapWeight += 0.20;
    // type advantage check: if bench has better matchup, consider swap.
    const pType = pf.creature.type;
    let activeBest = 1, benchBest = 1;
    for (const k of ef.creature.abilities) {
      const a = ABILITIES[k];
      if (a && a.element && isAttack(a)) activeBest = Math.max(activeBest, elementMult(a, pType));
    }
    for (const k of state.ebf.creature.abilities) {
      const a = ABILITIES[k];
      if (a && a.element && isAttack(a)) benchBest = Math.max(benchBest, elementMult(a, pType));
    }
    if (benchBest > activeBest && benchFrac > 0.6 && hpFrac < 0.7) swapWeight += 0.25;
    if (Math.random() < swapWeight) return '_swap';
  }

  // 2. heal when low and not already healing
  if (lowHp && (!ef.healing || ef.healing.turnsLeft <= 1)) {
    for (const k of abilities) {
      const a = ABILITIES[k];
      if (a && hasSelfHeal(a)) return k;
    }
  }

  // 3. cleanse if afflicted with worst statuses and we have a cleanse
  const debuffed = ef.statuses && (ef.statuses.cursed || ef.statuses.soaking || ef.statuses.dazed);
  if (debuffed) {
    for (const k of abilities) {
      const a = ABILITIES[k];
      if (a && isCleanseSelf(a) && Math.random() < 0.55) return k;
    }
  }

  // 4. score abilities
  let best = null, bestScore = -Infinity;
  const turn = ef.attacksMade || 0;
  for (const k of abilities) {
    const a = ABILITIES[k];
    if (!a) continue;
    let s = 0;
    if (isAttack(a)) {
      const est = estimateDamage(ef, pf, a);
      s = est;
      // small bonus to type advantage so the AI prefers super-effective hits
      const elemMult = elementMult(a, pf.creature.type);
      if (elemMult > 1) s *= 1.15;
      else if (elemMult < 1) s *= 0.85;
    } else if (isStatusAttack(a)) {
      // value status moves more on healthier opponents (less wasted ticks)
      const opFrac = pf.hp / pf.creature.maxHp;
      const flat = flatEffects(a);
      const statusEff = flat.find(e => e.type === 'apply_status');
      const statusKey = statusEff && statusEff.status;
      const alreadyApplied = pf.statuses && statusKey && pf.statuses[statusKey];
      if (!alreadyApplied) s = 18 + opFrac * 12;
      else s = 4;
    } else if (isSelfBuff(a) && turn === 0 && hpFrac > 0.6) {
      // Setup turn — but only worth it once.
      s = 14;
    } else if (isSelfSwap(a) && benchAlive && benchFrac > 0.6 && hpFrac < 0.5) {
      s = 22;
    } else {
      s = 1;
    }
    // Charge moves (2 phases) — slightly devalued when player has fast/swap options.
    if (a.phases && a.phases.length > 1) s *= 0.85;
    s += Math.random() * 1.5;
    if (s > bestScore) { bestScore = s; best = k; }
  }
  return best || abilities[0];
}
