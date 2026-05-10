// Battle-log orchestration. Combat code pushes structured entries to
// state.log synchronously (via pushLog with { text, damage, anim, ... }),
// then awaits drainLog() at chunk boundaries. drainLog walks newly-pushed
// entries and reveals each with the typewriter pacing + sync'd animation.
//
// Voice helpers (actorLine / hitLine / eventText) compose log strings from
// data/voiceprose.json so combat code never builds prose inline. Templates:
//   {actor}, {target}, {name}, {status}, {enemies}

import { state } from '../state.js';
import { sleep } from '../rng.js';
import { VOICE } from '../data.js';
import { displayName } from '../creature.js';
import { render } from '../ui/render.js';

// ── log drainer ──────────────────────────────────────────────────────
let drainCursor = 0;

// Reset cursor — call at battle start so pre-battle entries are skipped.
export function snapLog() { drainCursor = state.log.length; }

// Walk new entries from drainCursor to the end, displaying each with
// typewriter pacing and firing its deferred animation at display time.
export async function drainLog() {
  while (drainCursor < state.log.length) {
    const idx = drainCursor++;
    const entry = state.log[idx];
    state.typingLogIdx = idx;
    if (entry.anim) { try { entry.anim(); } catch (e) { console.error(e); } }
    render();
    const charCount = (entry.text || '').length;
    const typeMs  = Math.max(380, Math.round(charCount * 28));
    const dwellMs = entry.pause != null
      ? entry.pause
      : (entry.cls === 'crit' ? 1200 : (entry.damage || entry.heal ? 900 : 700));
    await sleep(typeMs + dwellMs);
  }
  state.typingLogIdx = -1;
}

// ── voice composition ───────────────────────────────────────────────
function name(f) { return displayName(f.creature); }

function fillTemplate(tmpl, vars) {
  return String(tmpl || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
}

// Look up the appropriate use/hit voice for an ability.
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

// Look up effect-default voice for a non-damage effect kind (heal/buff/etc).
function effectVoice(kind) {
  return VOICE.effectDefaults[kind] || { use: '', hit: '' };
}

// Compose the actor's "use" line. attacker is the fighter; ability is the data object.
export function useLine(attacker, ability) {
  const v = abilityVoice(ability);
  return fillTemplate(v.use, { actor: name(attacker), name: ability.name || '' });
}

// Compose the defender's "hit" line.
export function hitLine(attacker, defender, ability) {
  const v = abilityVoice(ability);
  return fillTemplate(v.hit, { actor: name(attacker), target: name(defender), name: ability.name || '' });
}

// Optional flavor beat — present only when the ability has authored flavor
// text in voiceprose.actions[id].flavor (or actionDefaults[element].flavor,
// though the canonical schema leaves element-default flavor empty). Returns
// '' when there's no flavor — callers skip the beat in that case.
export function flavorLine(attacker, ability) {
  const v = abilityVoice(ability);
  const f = ability && ability.flavor;
  // Per-ability data field on the ability itself takes precedence over voice
  // overrides because flavor lives next to the gameplay data in abilities.json.
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

// Compose an event line by key from the events table. Falls back to a
// minimal template if the key is missing.
export function eventText(key, vars) {
  const tmpl = VOICE.events[key] || `[${key}]`;
  return fillTemplate(tmpl, vars || {});
}

// Affliction prose by status key.
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
