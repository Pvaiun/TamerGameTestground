// AI for energy-based combat. Two entry points:
//   - aiPlanIntent(ef, pf): at round start, predict first move for intent UI.
//   - aiChoose(ef, pf): called repeatedly during the AI's turn, returns
//     ability key, '_swap', or null (= end turn).

import { TYPE_CHART, ABILITIES, ARCHETYPES } from '../data.js';
import { state } from '../state.js';
import { estimateDamage, abilityCost } from './damage.js';

const flatEff = (a) => (a && a.phases ? a.phases : []).flat();
const isAttack = (a) => flatEff(a).some(e => e.type === 'damage');
const hasSelfHeal = (a) => flatEff(a).some(e =>
  e.type === 'heal_self_pct' ||
  (e.type === 'heal_over_time' && (e.targets || ['self']).includes('self')) ||
  e.type === 'sig_consume_heal' || e.type === 'sig_consume_heal_party'
);
const isCleanseSelf = (a) => flatEff(a).some(e => e.type === 'cleanse' && (e.targets || ['self']).includes('self'));
const isStatusAttack = (a) => flatEff(a).some(e => e.type === 'apply_status' && !(e.targets || ['enemy']).includes('self'));
const isSelfBuff = (a) => flatEff(a).some(e => e.type === 'buff' && (e.targets || ['self']).includes('self'));
const isSelfSwap = (a) => flatEff(a).some(e => e.type === 'swap' && (e.targets || ['self']).includes('self'));
const isStackGain = (a) => flatEff(a).some(e => e.type === 'sig_gain');
const isStackConsumeDmg = (a) => flatEff(a).some(e => e.type === 'sig_consume_dmg');
const elementMult = (a, t) => a.element ? (TYPE_CHART[a.element]?.[t] || 1) : 1;

function fighterStack(f, key) {
  return (f.stacks && f.stacks[key]) || 0;
}

function consumeStackKey(a) {
  for (const e of flatEff(a)) {
    if (e.type === 'sig_consume_dmg' || e.type === 'sig_consume_heal' ||
        e.type === 'sig_consume_heal_party' || e.type === 'sig_consume_status_share') {
      return e.key;
    }
  }
  return null;
}

function gainStackKey(a) {
  for (const e of flatEff(a)) {
    if (e.type === 'sig_gain') return e.key;
  }
  return null;
}

function scoreAbility(ef, pf, a) {
  const cost = abilityCost(a, ef);
  if (cost > ef.energy) return -Infinity;
  let s = 0;
  const consumeKey = consumeStackKey(a);
  const consumeStacks = consumeKey ? fighterStack(ef, consumeKey) : 0;
  const gainKey = gainStackKey(a);

  if (isAttack(a)) {
    const est = estimateDamage(ef, pf, a);
    s = est * (3 / Math.max(1, cost));   // prefer high damage per energy
    const elemMult = elementMult(a, pf.creature.type);
    if (elemMult > 1) s *= 1.20;
    else if (elemMult < 1) s *= 0.80;
    // Bonus for consuming stacks we have
    if (consumeKey && consumeStacks > 0) s *= 1 + 0.20 * consumeStacks;
    // Penalty for consuming stacks we don't have
    if (consumeKey && consumeStacks === 0 && !isStackConsumeDmg(a)) s *= 0.4;
  } else if (isStatusAttack(a)) {
    const opFrac = pf.hp / pf.creature.maxHp;
    const statusEff = flatEff(a).find(e => e.type === 'apply_status');
    const statusKey = statusEff && statusEff.status;
    const alreadyApplied = pf.statuses && statusKey && pf.statuses[statusKey];
    if (!alreadyApplied) s = 18 + opFrac * 12;
    else s = 5;
    if (gainKey) s += 4;  // status moves that also stack are slightly preferred
  } else if (hasSelfHeal(a)) {
    const hpFrac = ef.hp / ef.creature.maxHp;
    if (hpFrac < 0.5) s = 30 + (1 - hpFrac) * 30;
    else if (consumeStacks >= 2) s = 18;
    else s = 4;
  } else if (isSelfBuff(a) && (ef.actionsThisTurn || 0) === 0 && (ef.hp / ef.creature.maxHp) > 0.6) {
    s = 15;
  } else if (isSelfSwap(a) && state.ebf && state.ebf.hp > 0 && (ef.hp / ef.creature.maxHp) < 0.35) {
    s = 25;
  } else {
    s = 2;
  }

  // Combo: prefer cheap actions once we've already acted this turn
  if ((ef.actionsThisTurn || 0) > 0 && cost === 1) s *= 1.2;

  // Cap stack-gainers when stacks are already maxed
  if (gainKey) {
    const stackMax = stackMaxFor(gainKey);
    if (fighterStack(ef, gainKey) >= stackMax) s *= 0.3;
  }

  return s + Math.random() * 0.8;
}

function stackMaxFor(key) {
  for (const arch of Object.values(ARCHETYPES)) {
    if (arch.stack && arch.stack.key === key) return arch.stack.max || 4;
  }
  return 4;
}

export function aiChoose(ef, pf) {
  if (!ef || ef.hp <= 0) return null;
  // Swap heuristic
  if (state.ebf && state.ebf.hp > 0 && ef.energy >= 1) {
    let swapWeight = 0;
    const benchFrac = state.ebf.hp / state.ebf.creature.maxHp;
    const hpFrac = ef.hp / ef.creature.maxHp;
    if (hpFrac < 0.15 && benchFrac > 0.55) swapWeight += 0.7;
    if (ef.statuses && ef.statuses.cursed && hpFrac < 0.40 && benchFrac > 0.55) swapWeight += 0.25;
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
    if (benchBest > activeBest && benchFrac > 0.65 && hpFrac < 0.55) swapWeight += 0.20;
    if (Math.random() < swapWeight) return '_swap';
  }
  // Score and pick
  let best = null, bestScore = -Infinity;
  for (const k of ef.creature.abilities) {
    const a = ABILITIES[k];
    if (!a) continue;
    const s = scoreAbility(ef, pf, a);
    if (s > bestScore) { bestScore = s; best = k; }
  }
  if (bestScore <= 0) return null;
  return best;
}

// Predict the AI's first move this round (for intent UI). Doesn't mutate state.
export function aiPlanIntent(ef, pf) {
  if (!ef || ef.hp <= 0) return null;
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
  return intentFor(ABILITIES[best]);
}

function intentFor(a) {
  if (!a) return { kind: 'unknown', label: '?', icon: '·' };
  const flat = flatEff(a);
  const damage = flat.find(e => e.type === 'damage');
  const buff = flat.find(e => e.type === 'buff' && (e.targets || ['self']).includes('self'));
  const status = flat.find(e => e.type === 'apply_status' && !(e.targets || ['enemy']).includes('self'));
  const swap = flat.find(e => e.type === 'swap');
  const heal = flat.find(e => e.type === 'heal_self_pct' || e.type === 'heal_over_time' || e.type === 'sig_consume_heal');
  if (damage) {
    let icon = '⚔';
    if (a.element === 'fire') icon = '◍';
    if (a.element === 'water') icon = '◑';
    if (a.element === 'grass') icon = '◐';
    if (a.element === 'light') icon = '◇';
    if (a.element === 'dark') icon = '◆';
    return { kind: 'attack', label: a.intent || a.name, icon, power: damage.power };
  }
  if (heal) return { kind: 'heal', label: a.intent || a.name, icon: '+' };
  if (buff) return { kind: 'buff', label: a.intent || a.name, icon: '↑' };
  if (status) return { kind: 'status', label: a.intent || a.name, icon: '●' };
  if (swap) return { kind: 'swap', label: a.intent || a.name, icon: '↔' };
  return { kind: 'other', label: a.intent || a.name, icon: '·' };
}
