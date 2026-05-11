// AI for energy-based combat.
//   - aiPlanIntent(ef, pf): at round start, predict first action for intent UI.
//   - aiChoose(ef, pf): returns next action key (or '_swap', or null).

import { TYPE_CHART, ABILITIES } from '../data.js';
import { state } from '../state.js';
import { estimateDamage, abilityCost } from './damage.js';

const flatEff = (a) => (a && a.phases ? a.phases : []).flat();
const isAttack = (a) => flatEff(a).some(e => e.type === 'damage');
const hasSelfHeal = (a) => flatEff(a).some(e => e.type === 'heal_self_pct');
const isStatusAttack = (a) => flatEff(a).some(e => e.type === 'apply_status' && !(e.targets || ['enemy']).includes('self'));
const isSelfBuff = (a) => flatEff(a).some(e => e.type === 'buff' && (e.targets || ['self']).includes('self'));
const isSelfSwap = (a) => flatEff(a).some(e => e.type === 'swap' && (e.targets || ['self']).includes('self'));
const isCharge = (a) => flatEff(a).some(e => e.type === 'gain_charge');
const isSpend = (a) => flatEff(a).some(e => e.type === 'spend_charge');
const elementMult = (a, t) => a.element ? (TYPE_CHART[a.element]?.[t] || 1) : 1;

function scoreAbility(ef, pf, a) {
  let s = 0;
  const cost = abilityCost(a, ef);
  if (cost > ef.energy) return -Infinity;

  const charge = ef.charge || 0;

  if (isAttack(a)) {
    const est = estimateDamage(ef, pf, a);
    s = est * (1.5 / Math.max(1, cost));
    const elemMult = elementMult(a, pf.creature.type);
    if (elemMult > 1) s *= 1.20;
    else if (elemMult < 1) s *= 0.75;

    // Spend with no charge is wasteful — discourage.
    if (isSpend(a) && charge === 0) s *= 0.6;
    // Spend at max charge is a no-brainer — encourage.
    if (isSpend(a) && charge >= 2) s *= 1 + 0.15 * charge;
  } else if (isStatusAttack(a)) {
    const flat = flatEff(a);
    const statusEff = flat.find(e => e.type === 'apply_status');
    const statusKey = statusEff && statusEff.status;
    const already = pf.statuses && statusKey && pf.statuses[statusKey];
    if (!already) s = 18;
    else s = 3;
  } else if (isSelfBuff(a) && (ef.actionsThisTurn || 0) === 0 && (ef.hp / ef.creature.maxHp) > 0.6) {
    s = 14;
  } else if (isSelfSwap(a) && state.ebf && state.ebf.hp > 0 && (ef.hp / ef.creature.maxHp) < 0.4) {
    s = 22;
  } else if (hasSelfHeal(a) && (ef.hp / ef.creature.maxHp) < 0.5) {
    s = 28 * (1 - ef.hp / ef.creature.maxHp);
  } else {
    s = 1;
  }

  // Slight combo preference for cheap chain abilities later in the turn.
  if ((ef.actionsThisTurn || 0) > 0) s *= 1 + 0.06 * (ef.actionsThisTurn || 0);
  // Charge builders are slightly preferred when energy still allows a Spend.
  if (isCharge(a) && ef.energy >= cost + 2 && charge < 3) s *= 1.10;

  return s + Math.random() * 0.5;
}

export function aiChoose(ef, pf) {
  if (!ef || ef.hp <= 0) return null;

  // Swap heuristic: low hp + healthy bench.
  if (state.ebf && state.ebf.hp > 0) {
    let swapWeight = 0;
    const benchFrac = state.ebf.hp / state.ebf.creature.maxHp;
    const hpFrac = ef.hp / ef.creature.maxHp;
    if (hpFrac < 0.18 && benchFrac > 0.55) swapWeight += 0.7;
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
    if (benchBest > activeBest && benchFrac > 0.65 && hpFrac < 0.5) swapWeight += 0.22;
    if (Math.random() < swapWeight && ef.energy >= 1) return '_swap';
  }

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
  const ability = ABILITIES[best];
  const intent = intentFor(ability);
  // Cache the estimated damage at plan time so the badge stays accurate even
  // after the enemy acts and modifies its state (e.g., charges spent).
  if (intent.kind === 'attack') {
    intent.estDmg = estimateDamage(ef, pf, ability);
  }
  return intent;
}

function intentFor(a) {
  if (!a) return { kind: 'unknown', label: '?', icon: '·' };
  const flat = flatEff(a);
  const damage = flat.find(e => e.type === 'damage');
  const buff = flat.find(e => e.type === 'buff' && (e.targets || ['self']).includes('self'));
  const status = flat.find(e => e.type === 'apply_status' && !(e.targets || ['enemy']).includes('self'));
  const swap = flat.find(e => e.type === 'swap');
  const heal = flat.find(e => e.type === 'heal_self_pct');
  if (damage) {
    let icon = '⚔';
    if (a.element === 'fire')  icon = '✦';
    if (a.element === 'water') icon = '◊';
    if (a.element === 'grass') icon = '✿';
    if (a.element === 'light') icon = '☉';
    if (a.element === 'dark')  icon = '◉';
    return { kind: 'attack', label: a.intent || a.name, icon, power: damage.power || 0 };
  }
  if (heal)   return { kind: 'heal',   label: a.intent || a.name, icon: '✚' };
  if (buff)   return { kind: 'buff',   label: a.intent || a.name, icon: '↑' };
  if (status) return { kind: 'status', label: a.intent || a.name, icon: '◐' };
  if (swap)   return { kind: 'swap',   label: a.intent || a.name, icon: '⇆' };
  return { kind: 'other', label: a.intent || a.name, icon: '·' };
}
