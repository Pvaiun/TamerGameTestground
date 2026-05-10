// Battle-log orchestration. Combat code pushes structured entries to
// state.log synchronously (via pushLog with { text, damage, anim, ... }),
// then awaits drainLog() at chunk boundaries. drainLog walks newly-pushed
// entries and reveals each with the typewriter pacing + sync'd animation.

import { state } from '../state.js';
import { sleep } from '../rng.js';
import { VOICE } from '../data.js';
import { displayName } from '../creature.js';
import { render } from '../ui/render.js';

let drainCursor = 0;

export function snapLog() { drainCursor = state.log.length; }

// Walk new entries from drainCursor to the end, displaying each with
// typewriter pacing and firing its deferred animation at display time.
// `combatSpeed`: 1 = normal, 2 = fast, 3 = instant (rare; reserved for skip).
export async function drainLog() {
  const speed = state.combatSpeed || 1;
  while (drainCursor < state.log.length) {
    const idx = drainCursor++;
    const entry = state.log[idx];
    state.typingLogIdx = idx;
    if (entry.anim) { try { entry.anim(); } catch (e) { console.error(e); } }
    render();
    if (speed >= 3) {
      // Skip mode: just render, no waiting.
      await sleep(8);
      continue;
    }
    const charCount = (entry.text || '').length;
    // Faster typewriter: 14ms/char on speed=2, 22 on speed=1.
    const charMs = speed === 2 ? 14 : 22;
    const minMs = speed === 2 ? 220 : 320;
    const typeMs  = Math.max(minMs, Math.round(charCount * charMs));
    let dwellMs = entry.pause != null
      ? entry.pause
      : (entry.cls === 'crit' ? 600 : (entry.damage || entry.heal ? 380 : 280));
    if (speed === 2) dwellMs = Math.round(dwellMs * 0.6);
    await sleep(typeMs + dwellMs);
  }
  state.typingLogIdx = -1;
}

function name(f) { return displayName(f.creature); }

function fillTemplate(tmpl, vars) {
  return String(tmpl || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
}

function abilityVoice(ability) {
  const id = ability && ability._key;
  const av = (id && VOICE.actions[id]) || {};
  const dv = VOICE.actionDefaults[ability.element || 'neutral'] || VOICE.actionDefaults.neutral || {};
  return {
    use:    av.use    || dv.use    || '{actor} uses {name}.',
    hit:    av.hit    || dv.hit    || 'they recoil.',
    flavor: av.flavor || dv.flavor || null,
  };
}

function effectVoice(kind) {
  return VOICE.effectDefaults[kind] || { use: '', hit: '' };
}

export function useLine(attacker, ability) {
  const v = abilityVoice(ability);
  return fillTemplate(v.use, { actor: name(attacker), name: ability.name || '' });
}

export function hitLine(attacker, defender, ability) {
  const v = abilityVoice(ability);
  return fillTemplate(v.hit, { actor: name(attacker), target: name(defender), name: ability.name || '' });
}

export function flavorLine(attacker, ability) {
  const v = abilityVoice(ability);
  const f = ability && ability.flavor;
  if (f) return fillTemplate(f, { actor: name(attacker), name: ability.name || '' });
  if (v.flavor) return fillTemplate(v.flavor, { actor: name(attacker), name: ability.name || '' });
  return '';
}

export function effectLine(kind, attacker, defender, extras) {
  const v = effectVoice(kind);
  const vars = { actor: attacker ? name(attacker) : '', target: defender ? name(defender) : '', ...(extras || {}) };
  return {
    use: fillTemplate(v.use, vars),
    hit: fillTemplate(v.hit, vars),
  };
}

export function eventText(key, vars) {
  const tmpl = VOICE.events[key] || `[${key}]`;
  return fillTemplate(tmpl, vars || {});
}

export function affName(statusKey) {
  const a = VOICE.afflictions[statusKey];
  if (!a) return statusKey;
  return (typeof a === 'object' ? a.name : a) || statusKey;
}
export function affApply(statusKey) {
  const a = VOICE.afflictions[statusKey];
  return (a && typeof a === 'object' && a.apply) || `the ${affName(statusKey)} takes.`;
}
export function affTick(statusKey) {
  const a = VOICE.afflictions[statusKey];
  return (a && typeof a === 'object' && a.tick) || `${affName(statusKey)}.`;
}
