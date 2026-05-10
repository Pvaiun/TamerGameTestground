// Loads game data from data/*.json. Call await loadData() once at startup.
// All other modules import from this file (named exports populated at load time).

export let TYPES = [];
export let TYPE_CHART = {};
export let TYPE_PALETTE = {};
export const TYPE_LABELS = {};
export let PASSIVES = {};
export let ABILITIES = {};
export let STATUSES = {};
export let ADDITIONAL_EFFECTS = {};
export let TEMPLATES = [];
export let ALL_ENCOUNTER_SPECIES = [];
export const GLOBALS = { growthThresholds: [] };
export const PASSIVE_SCHEMA = { triggers: {}, conditions: {}, effects: {} };
export const GLYPHS = {};
export const VOICE = {
  subtitles: {},
  notes: {},
  noteAppends: {},
  passives: {},
  afflictions: {},
  actions: {},
  actionDefaults: {},
  effectDefaults: {},
  events: {},
};

async function fetchJson(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Failed to load ${path}: ${r.status}`);
  return r.json();
}

export async function loadData() {
  const [types, passives, abilities, statuses, addEffects, templates, globals, passiveSchema, glyphs, voice] = await Promise.all([
    fetchJson('data/types.json'),
    fetchJson('data/passives.json'),
    fetchJson('data/abilities.json'),
    fetchJson('data/statuseffects.json'),
    fetchJson('data/additionaleffects.json'),
    fetchJson('data/templates.json'),
    fetchJson('data/globals.json'),
    fetchJson('data/passivetriggers.json'),
    fetchJson('data/glyphs.json'),
    fetchJson('data/voiceprose.json'),
  ]);
  TYPES = types.TYPES;
  Object.assign(TYPE_CHART, types.TYPE_CHART);
  Object.assign(TYPE_PALETTE, types.TYPE_PALETTE);
  Object.assign(TYPE_LABELS, types.TYPE_LABELS || {});
  Object.assign(PASSIVES, passives);
  Object.assign(ABILITIES, abilities);
  // Stamp each ability with its own key so combat code can look up voice
  // prose by ability id without re-deriving the key from a reverse lookup.
  for (const [k, a] of Object.entries(ABILITIES)) a._key = k;
  Object.assign(STATUSES, statuses);
  Object.assign(ADDITIONAL_EFFECTS, addEffects);
  TEMPLATES.length = 0;
  TEMPLATES.push(...templates);
  ALL_ENCOUNTER_SPECIES.length = 0;
  ALL_ENCOUNTER_SPECIES.push(...TEMPLATES.filter(t => !t.starter).map(t => t.species));
  GLOBALS.growthThresholds = globals.growthThresholds || [];
  Object.assign(PASSIVE_SCHEMA.triggers,   passiveSchema.triggers   || {});
  Object.assign(PASSIVE_SCHEMA.conditions, passiveSchema.conditions || {});
  Object.assign(PASSIVE_SCHEMA.effects,    passiveSchema.effects    || {});
  for (const [k, v] of Object.entries(glyphs)) {
    if (k.startsWith('_')) continue;
    GLYPHS[k] = v;
  }
  Object.assign(VOICE.subtitles,      voice.subtitles      || {});
  Object.assign(VOICE.notes,          voice.notes          || {});
  Object.assign(VOICE.noteAppends,    voice.noteAppends    || {});
  Object.assign(VOICE.passives,       voice.passives       || {});
  Object.assign(VOICE.afflictions,    voice.afflictions    || {});
  Object.assign(VOICE.actions,        voice.actions        || {});
  Object.assign(VOICE.actionDefaults, voice.actionDefaults || {});
  Object.assign(VOICE.effectDefaults, voice.effectDefaults || {});
  Object.assign(VOICE.events,         voice.events         || {});
}
