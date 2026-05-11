export let GLOBALS = {};
export let CATEGORIES = {};
export let APPROACHES = {};
export let INTENTS = {};
export let SCARS = {};
export let SCAR_POOLS = {};
export let PATIENTS = [];
export let PATIENTS_BY_SPECIES = {};
export const GLYPHS = {};
export let VOICE = {};

async function fetchJson(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Failed to load ${path}: ${r.status}`);
  return r.json();
}

function strip(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (!k.startsWith('_')) out[k] = v;
  return out;
}

export async function loadData() {
  const [globals, categories, approaches, intents, scars, patients, glyphs, voice] = await Promise.all([
    fetchJson('data/globals.json'),
    fetchJson('data/categories.json'),
    fetchJson('data/approaches.json'),
    fetchJson('data/intents.json'),
    fetchJson('data/scars.json'),
    fetchJson('data/patients.json'),
    fetchJson('data/glyphs.json'),
    fetchJson('data/voiceprose.json'),
  ]);
  GLOBALS = strip(globals);
  Object.assign(CATEGORIES, strip(categories));
  Object.assign(APPROACHES, strip(approaches));
  for (const [k, v] of Object.entries(APPROACHES)) v.key = k;
  Object.assign(INTENTS, strip(intents));
  for (const [k, v] of Object.entries(INTENTS)) v.key = k;
  // scars: top-level keys minus _pools become SCARS; _pools becomes SCAR_POOLS
  for (const [k, v] of Object.entries(scars)) {
    if (k === '_format') continue;
    if (k === '_pools') { SCAR_POOLS = v; continue; }
    SCARS[k] = { key: k, ...v };
  }
  PATIENTS.length = 0;
  for (const p of patients) {
    PATIENTS.push(p);
    PATIENTS_BY_SPECIES[p.species] = p;
  }
  for (const [k, v] of Object.entries(glyphs)) if (!k.startsWith('_')) GLYPHS[k] = v;
  VOICE = strip(voice);
}
