// Light meta-progression. Persisted to localStorage so a run leaves something
// behind for the next admission. Not save-the-current-run — only across runs.

const KEY = 'bloodlines.intake.meta.v1';

function defaultMeta() {
  return {
    runs: 0,
    runsCompleted: 0,
    patientsNamed: [],
    patientsLost: [],
    discoveredApproaches: [],
    carriedNotes: [],
    patientId: 413,
  };
}

export function loadMeta() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultMeta();
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return defaultMeta();
    return { ...defaultMeta(), ...data };
  } catch (e) {
    return defaultMeta();
  }
}

export function saveMeta(meta) {
  try {
    localStorage.setItem(KEY, JSON.stringify(meta));
  } catch (e) {
    /* swallow */
  }
}

export function clearMeta() {
  try { localStorage.removeItem(KEY); } catch (e) {}
}

export function saveMetaOnRunEnd(outcome, runState) {
  const meta = loadMeta();
  meta.runs = (meta.runs || 0) + 1;
  if (outcome === 'won') meta.runsCompleted = (meta.runsCompleted || 0) + 1;
  // Discover all approaches the player saw in their deck this run
  for (const k of runState.deck || []) {
    if (!meta.discoveredApproaches.includes(k)) meta.discoveredApproaches.push(k);
  }
  // On loss: nothing carried forward (the run failed).
  // On win: carry 1-2 notes forward (chosen randomly from the deck).
  if (outcome === 'won') {
    const eligible = (runState.deck || []).filter(k => !defaultStart().includes(k));
    eligible.sort(() => Math.random() - 0.5);
    meta.carriedNotes = eligible.slice(0, Math.min(2, eligible.length));
  } else {
    meta.carriedNotes = [];
  }
  meta.patientId = (meta.patientId || 413) + 1;
  saveMeta(meta);
}

function defaultStart() {
  return ['listen', 'note', 'steady', 'press', 'wait', 'step_back'];
}
