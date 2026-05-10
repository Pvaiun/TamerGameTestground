// AI for the energy-based combat. Two entry points:
//   - aiPlanIntent(ef, pf): at round start, predict what the AI will do (a
//     short label shown to the player as enemy intent).
//   - aiChoose(ef, pf): each call returns the next action key to play this
//     turn, or null/'_swap'. Called repeatedly until energy depleted.

import { TYPE_CHART, ABILITIES } from '../data.js';
import { state } from '../state.js';
import { estimateDamage, abilityCost } from './damage.js';

const flatEff = (a) => (a && a.phases ? a.phases : []).flat();
const isAttack = (a) => flatEff(a).some(e => e.type === 'damage');
const hasSelfHeal = (a) => flatEff(a).some(e => e.type === 'heal_self_pct' || (e.type === 'heal_over_time' && (e.targets || ['self']).includes('self')));
const isCleanseSelf = (a) => flatEff(a).some(e => e.type === 'cleanse' && (e.targets || ['self']).includes('self'));
const isStatusAttack = (a) => flatEff(a).some(e => e.type === 'apply_status' && !(e.targets || ['enemy']).includes('self'));
const isSelfBuff = (a) => flatEff(a).some(e => e.type === 'buff' && (e.targets || ['self']).includes('self'));
const isSelfSwap = (a) => flatEff(a).some(e => e.type === 'swap' && (e.targets || ['self']).includes('self'));
const elementMult = (a, t) => a.element ? (TYPE_CHART[a.element]?.[t] || 1) : 1;
const isSig = (a) => (a && a.tags || []).some(t => t.startsWith('sig_'));

function scoreAbility(ef, pf, a) {
  let s = 0;
  const cost = abilityCost(a, ef);
  if (cost > ef.energy) return -Infinity; // can't afford
  if (isAttack(a)) {
    const est = estimateDamage(ef, pf, a);
    s = est * (1 / Math.max(1, cost));
    const elemMult = elementMult(a, pf.creature.type);
    if (elemMult > 1) s *= 1.20;
    else if (elemMult < 1) s *= 0.80;
    // Signature damage attacks scale with stacks — boost score by stacks
    const sig = ef.creature.signature;
    if (sig && isSig(a)) {
      const stacks = ef.sigStacks || 0;
      if (stacks >= 1 && a.tags.some(t => t.startsWith('sig_') && t === `sig_${sig.key}`)) {
        s *= 1 + 0.15 * stacks;
      }
    }
  } else if (isStatusAttack(a)) {
    const opFrac = pf.hp / pf.creature.maxHp;
    const flat = flatEff(a);
    const statusEff = flat.find(e => e.type === 'apply_status');
    const statusKey = statusEff && statusEff.status;
    const alreadyApplied = pf.statuses && statusKey && pf.statuses[statusKey];
    if (!alreadyApplied) s = 18 + opFrac * 12;
    else s = 4;
  } else if (isSelfBuff(a) && (ef.actionsThisTurn || 0) === 0 && (ef.hp / ef.creature.maxHp) > 0.6) {
    s = 14;
  } else if (isSelfSwap(a) && state.ebf && state.ebf.hp > 0 && (ef.hp / ef.creature.maxHp) < 0.4) {
    s = 22;
  } else if (hasSelfHeal(a) && (ef.hp / ef.creature.maxHp) < 0.5) {
    s = 28;
  } else {
    s = 1;
  }
  // Combo: prefer cheap actions when prior actions exist
  if ((ef.actionsThisTurn || 0) > 0) s *= 1 + 0.06 * (ef.actionsThisTurn || 0);
  // Discourage AI from spending all energy on signature gain when stacks already maxed
  if (a.tags && a.tags.some(t => t.startsWith('sig_gain_'))) {
    const sig = ef.creature.signature;
    const max = sig?.max ?? 5;
    if ((ef.sigStacks || 0) >= max) s *= 0.4;
  }
  return s + Math.random() * 0.6;
}

export function aiChoose(ef, pf) {
  if (!ef || ef.hp <= 0) return null;
  // Swap heuristic
  if (state.ebf && state.ebf.hp > 0) {
    let swapWeight = 0;
    const benchFrac = state.ebf.hp / state.ebf.creature.maxHp;
    const hpFrac = ef.hp / ef.creature.maxHp;
    if (hpFrac < 0.18 && benchFrac > 0.55) swapWeight += 0.7;
    if (ef.statuses && ef.statuses.cursed && hpFrac < 0.45 && benchFrac > 0.55) swapWeight += 0.30;
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
    if (benchBest > activeBest && benchFrac > 0.65 && hpFrac < 0.6) swapWeight += 0.20;
    if (Math.random() < swapWeight && ef.energy >= 1) return '_swap';
  }
  // Pick best ability that fits
  let best = null, bestScore = -Infinity;
  for (const k of ef.creature.abilities) {
    const a = ABILITIES[k];
    if (!a) continue;
    const s = scoreAbility(ef, pf, a);
    if (s > bestScore) { bestScore = s; best = k; }
  }
  // Don't pick negative-scoring options
  if (bestScore <= 0) return null;
  return best;
}

// Predict the AI's first action this round (for intent display).
// Doesn't change state. Lookahead = 1 step.
export function aiPlanIntent(ef, pf) {
  if (!ef || ef.hp <= 0) return null;
  // Mock energy at full
  const saved = ef.energy;
  ef.energy = ef.maxEnergy ?? 3;
  let best = null, bestScore = -Infinity;
  for (const k of ef.creature.abilities) {
    const a = ABILITIES[k];
    if (!a) continue;
    const s = scoreAbility(ef, pf, a);
    if (s > bestScore) { bestScore = s; best = k; }
  }
  ef.energy = saved;
  if (!best) return { kind: 'unknown', label: '?', icon: '·' };
  const a = ABILITIES[best];
  return intentFor(a);
}

function intentFor(a) {
  if (!a) return { kind: 'unknown', label: '?', icon: '·' };
  const flat = flatEff(a);
  const damage = flat.find(e => e.type === 'damage');
  const buff = flat.find(e => e.type === 'buff' && (e.targets || ['self']).includes('self'));
  const status = flat.find(e => e.type === 'apply_status' && !(e.targets || ['enemy']).includes('self'));
  const swap = flat.find(e => e.type === 'swap');
  const heal = flat.find(e => e.type === 'heal_self_pct' || e.type === 'heal_over_time');
  if (damage) {
    let icon = '⚔';
    if (a.element === 'fire') icon = '🔥';
    if (a.element === 'water') icon = '💧';
    if (a.element === 'grass') icon = '🌿';
    if (a.element === 'light') icon = '☀';
    if (a.element === 'dark') icon = '⬣';
    const power = damage.power || 0;
    return { kind: 'attack', label: a.intent || a.name, icon, power };
  }
  if (heal) return { kind: 'heal', label: a.intent || a.name, icon: '❤' };
  if (buff) return { kind: 'buff', label: a.intent || a.name, icon: '↑' };
  if (status) return { kind: 'status', label: a.intent || a.name, icon: '◉' };
  if (swap) return { kind: 'swap', label: a.intent || a.name, icon: '↔' };
  return { kind: 'other', label: a.intent || a.name, icon: '·' };
}
