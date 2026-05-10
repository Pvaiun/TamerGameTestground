// Beat-driven log orchestration for the dual-log system.
//
// "Beat" = one drain step. drainBeats walks new gameLog entries since the
// previous drain and shows them with a short pace, firing each entry's
// deferred animation when revealed. Lore lines update independently and
// type out in their own panel — the game log is fast and cumulative; the
// lore line is slow and singular.

import { state } from '../state.js';
import { sleep } from '../rng.js';
import { VOICE } from '../data.js';
import { displayName } from '../creature.js';
import { render } from '../ui/render.js';

let drainCursor = 0;

export function snapBeats() { drainCursor = state.gameLog.length; }

// Walk newly-pushed gameLog entries; fire each entry's anim once, briefly hold.
// Speed: 1 = slow (~280ms/beat), 2 = fast (~140ms/beat).
export async function drainBeats() {
  const speed = state.combatSpeed || 2;
  while (drainCursor < state.gameLog.length) {
    const idx = drainCursor++;
    const entry = state.gameLog[idx];
    if (entry && !entry.fired) {
      entry.fired = true;
      if (entry.anim) { try { entry.anim(); } catch (e) { console.error(e); } }
    }
    render();
    // Beat dwell tuned to be readable but quick.
    let dwell = entry.cls === 'crit' ? 380
              : (entry.damage || entry.heal) ? 240
              : entry.cls === 'sys' ? 300
              : entry.cls === 'fade' ? 180
              : 220;
    if (speed === 2) dwell = Math.round(dwell * 0.55);
    await sleep(dwell);
  }
}

// ─── voice composition (lore lines) ──────────────────────────────────

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
