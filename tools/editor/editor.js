// Editor stays self-contained: it renders bitmap glyphs from data/glyphs.json
// directly (no dependency on src/ui/glyphs.js) so this tool can keep working
// independently of the game's UI layer.

// ─── State ───────────────────────────────────────────────────────────────────

const S = {
  abilities: {}, passives: {}, statuses: {}, additionalEffects: {}, templates: [], types: [], typeLabels: {}, typePalette: {},
  globals: { growthThresholds: [] },
  passiveSchema: { triggers: {}, conditions: {}, effects: {} },
  glyphs: {},  // keyed by species name, each value is 16-string array
  voice: {
    subtitles: {}, notes: {}, passives: {}, afflictions: {},
    actions: {}, actionDefaults: {}, effectDefaults: {}, events: {},
  },
  dirty: { abilities: false, passives: false, templates: false, statuses: false, globals: false, glyphs: false, voice: false, types: false },
  tab: 'monsters',
  monster: null,   // selected template index
  ability: null,   // selected ability key
  passive: null,   // selected passive key
  status: null,    // selected status key
  pat: '', branch: 'main',
  statusMsg: '', statusError: false,
  search: { monsters: '', abilities: '', passives: '', statuses: '', abilityElement: '', abilitySort: 'name' },
};

// ─── Boot ────────────────────────────────────────────────────────────────────

async function init() {
  try {
    const [types, passives, abilities, statuses, additionalEffects, templates, globals, passiveSchema, glyphs, voice] = await Promise.all([
      fetch('../../data/types.json').then(r => r.json()),
      fetch('../../data/passives.json').then(r => r.json()),
      fetch('../../data/abilities.json').then(r => r.json()),
      fetch('../../data/statuseffects.json').then(r => r.json()),
      fetch('../../data/additionaleffects.json').then(r => r.json()),
      fetch('../../data/templates.json').then(r => r.json()),
      fetch('../../data/globals.json').then(r => r.json()),
      fetch('../../data/passivetriggers.json').then(r => r.json()),
      fetch('../../data/glyphs.json').then(r => r.json()),
      fetch('../../data/voiceprose.json').then(r => r.json()),
    ]);
    S.types = types.TYPES;
    S.typeLabels = types.TYPE_LABELS || {};
    S.typePalette = types.TYPE_PALETTE;
    // Cached so the commit pipeline can round-trip the file unchanged for
    // fields the editor doesn't currently expose for editing.
    S._typeChartCache = types.TYPE_CHART;
    S.passives = passives;
    S.abilities = abilities;
    S.statuses = statuses;
    S.additionalEffects = additionalEffects;
    S.templates = templates;
    S.globals = globals;
    S.passiveSchema = passiveSchema;
    if (!Array.isArray(S.globals.growthThresholds)) S.globals.growthThresholds = [];
    // glyphs.json carries an _format key for human readers — strip it from state.
    for (const [k, v] of Object.entries(glyphs)) {
      if (k.startsWith('_')) continue;
      S.glyphs[k] = v;
    }
    // Load every voice table — including the four added since the dossier
    // rewrite (actions / actionDefaults / effectDefaults / events) so commits
    // round-trip without dropping data.
    Object.assign(S.voice.subtitles,      voice.subtitles      || {});
    Object.assign(S.voice.notes,          voice.notes          || {});
    Object.assign(S.voice.passives,       voice.passives       || {});
    Object.assign(S.voice.afflictions,    voice.afflictions    || {});
    Object.assign(S.voice.actions,        voice.actions        || {});
    Object.assign(S.voice.actionDefaults, voice.actionDefaults || {});
    Object.assign(S.voice.effectDefaults, voice.effectDefaults || {});
    Object.assign(S.voice.events,         voice.events         || {});
  } catch (e) {
    document.getElementById('content').innerHTML = `<p style="padding:20px;color:#d94a3a">Failed to load data: ${e.message}</p>`;
    return;
  }
  renderAll();
}

// Render a 16x16 glyph as inline SVG markup. 2x2 cells, intrinsic 32x32 viewbox.
// Author can pass either a species name (looks up S.glyphs) or rows directly.
function glyphSvg(speciesOrRows) {
  const rows = Array.isArray(speciesOrRows)
    ? speciesOrRows
    : (S.glyphs[speciesOrRows] || null);
  if (!rows) {
    return '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" fill="currentColor"><rect x="14" y="14" width="2" height="2"/></svg>';
  }
  let rects = '';
  for (let y = 0; y < 16; y++) {
    const row = rows[y] || '';
    for (let x = 0; x < 16; x++) {
      if (row[x] === '#') rects += `<rect x="${x*2}" y="${y*2}" width="2" height="2"/>`;
    }
  }
  return `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" fill="currentColor">${rects}</svg>`;
}

// Build a fresh empty-glyph row array. Useful when adding a species without one.
function emptyGlyphRows() {
  return new Array(16).fill('................');
}

// Toggle one pixel in a glyph rows array. Returns the new rows (mutates in place).
function toggleGlyphPixel(rows, x, y) {
  const r = rows[y];
  const ch = r[x] === '#' ? '.' : '#';
  rows[y] = r.substring(0, x) + ch + r.substring(x + 1);
  return rows;
}

// ─── Render ──────────────────────────────────────────────────────────────────

function renderAll() {
  renderHeader();
  renderTabs();
  renderContent();
}

function renderHeader() {
  const anyDirty = Object.values(S.dirty).some(Boolean);
  const el = document.getElementById('header');
  el.innerHTML = `
    <div class="header-title">TamerGame Designer</div>
    <div class="header-controls">
      <span class="status-msg" id="status-msg" style="color:${S.statusError ? '#d94a3a' : '#7acc88'}">${S.statusMsg}</span>
      <input type="password" id="pat-input" placeholder="GitHub PAT" value="${S.pat}">
      <input type="text" id="branch-input" value="${S.branch}" placeholder="branch">
      <button class="commit-btn ${anyDirty ? 'dirty' : ''}" id="commit-btn" ${anyDirty ? '' : 'disabled'}>
        ${anyDirty ? '● Commit changes' : 'No changes'}
      </button>
    </div>`;
  document.getElementById('pat-input').addEventListener('input', e => { S.pat = e.target.value; });
  document.getElementById('branch-input').addEventListener('input', e => { S.branch = e.target.value; });
  document.getElementById('commit-btn').addEventListener('click', openCommitModal);
}

function renderTabs() {
  const el = document.getElementById('tabs');
  const tabs = [
    { key: 'monsters',  label: 'Monsters',         dirty: S.dirty.templates || S.dirty.glyphs || S.dirty.voice },
    { key: 'abilities', label: 'Abilities',        dirty: S.dirty.abilities },
    { key: 'passives',  label: 'Passives',         dirty: S.dirty.passives },
    { key: 'statuses',  label: 'Status Effects',   dirty: S.dirty.statuses },
    { key: 'voice',     label: 'Voice Tables',     dirty: S.dirty.voice || S.dirty.types },
    { key: 'globals',   label: 'Global Variables', dirty: S.dirty.globals },
  ];
  el.innerHTML = tabs.map(t =>
    `<button class="tab ${S.tab === t.key ? 'active' : ''} ${t.dirty ? 'dirty' : ''}" data-tab="${t.key}">
      ${t.label}${t.dirty ? ' ●' : ''}
    </button>`
  ).join('');
  el.querySelectorAll('.tab').forEach(btn =>
    btn.addEventListener('click', () => { S.tab = btn.dataset.tab; renderAll(); })
  );
}

// Per-tab scroll positions for the list panel — preserved across re-renders
// triggered by selection, search, sort, etc. Tab switches still surface the
// last scroll position for the new tab.
const scrollPositions = { monsters: 0, abilities: 0, passives: 0, statuses: 0, voice: 0, globals: 0 };

function renderContent() {
  const el = document.getElementById('content');
  // Save current list scroll under whichever tab was last rendered.
  const lastTab = el.dataset.scrollTab;
  if (lastTab) {
    const cur = el.querySelector('.list-items');
    if (cur) scrollPositions[lastTab] = cur.scrollTop;
  }
  if (S.tab === 'monsters')  el.innerHTML = monstersTabHTML();
  if (S.tab === 'abilities') el.innerHTML = abilitiesTabHTML();
  if (S.tab === 'passives')  el.innerHTML = passivesTabHTML();
  if (S.tab === 'statuses')  el.innerHTML = statusEffectsTabHTML();
  if (S.tab === 'voice')     el.innerHTML = voiceTablesTabHTML();
  if (S.tab === 'globals')   el.innerHTML = globalsTabHTML();
  el.dataset.scrollTab = S.tab;
  const newList = el.querySelector('.list-items');
  if (newList) newList.scrollTop = scrollPositions[S.tab] || 0;
  bindContentEvents();
}

// ─── Monsters Tab ────────────────────────────────────────────────────────────

function monstersTabHTML() {
  const q = S.search.monsters.toLowerCase();
  const items = S.templates
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => !q || t.species.toLowerCase().includes(q));
  const listHTML = items.map(({ t, i }) => `
    <div class="list-item ${S.monster === i ? 'selected' : ''}" data-idx="${i}">
      <span class="type-badge type-${t.type}">${t.type[0].toUpperCase()}</span>
      <div>
        <div class="list-item-name">${t.species}</div>
        <div class="list-item-sub">${t.starter ? '★ Starter' : ''}</div>
      </div>
    </div>`).join('');

  const t = S.monster !== null ? S.templates[S.monster] : null;
  return `
    <div class="list-panel">
      <div class="list-search"><input id="search-monsters" placeholder="Search…" value="${S.search.monsters}"></div>
      <div class="list-items">${listHTML}</div>
    </div>
    <div class="detail-panel">${t ? monsterFormHTML(t) : '<div class="empty">Select a monster to edit.</div>'}</div>`;
}

// Letter grade thresholds come from data/globals.json (S.globals.growthThresholds).
// The numeric growth values on templates are the source of truth — these helpers
// only translate between value ↔ grade for display and the grade-snap shortcut.
function growthGradeList() {
  return S.globals.growthThresholds || [];
}
function growthGrade(v) {
  for (const g of growthGradeList()) if (v >= g.min) return g.grade;
  const last = growthGradeList().slice(-1)[0];
  return last ? last.grade : 'F';
}
// Midpoint of a grade band = halfway between this grade's min and the next higher
// grade's min. The top grade has no upper bound, so we extend by 0.2 above its min.
function growthMidpoint(grade) {
  const list = growthGradeList();
  const i = list.findIndex(g => g.grade === grade);
  if (i < 0) return 0;
  const cur = list[i];
  const above = i > 0 ? list[i - 1].min : cur.min + 0.2;
  return Math.round(((cur.min + above) / 2) * 100) / 100;
}

// Convert ASCII letters/digits to Unicode mathematical bold equivalents so that
// names render bold inside <option> elements (which don't support HTML markup).
function boldify(str) {
  let out = '';
  for (const ch of String(str)) {
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90)  out += String.fromCodePoint(0x1D400 + (c - 65));      // A-Z
    else if (c >= 97 && c <= 122) out += String.fromCodePoint(0x1D41A + (c - 97)); // a-z
    else if (c >= 48 && c <= 57)  out += String.fromCodePoint(0x1D7CE + (c - 48)); // 0-9
    else out += ch;
  }
  return out;
}

function passiveOption(p, k, selected) {
  const desc = (p.desc || '').replace(/"/g, '&quot;');
  const full = (p.desc || '').replace(/\s+/g, ' ').trim();
  return `<option value="${k}" title="${desc}" ${selected ? 'selected' : ''}>${boldify(p.name)}${full ? ' — ' + full : ''}</option>`;
}

function monsterFormHTML(t) {
  const passiveOpts  = Object.entries(S.passives).map(([k, p]) => passiveOption(p, k, t.primaryPassive === k)).join('');
  const passiveOpts2 = Object.entries(S.passives).map(([k, p]) => passiveOption(p, k, t.secondaryPassive === k)).join('');
  const typeOpts = S.types.map(ty =>
    `<option value="${ty}" ${t.type === ty ? 'selected' : ''}>${ty}</option>`).join('');

  const svgHTML = glyphSvg(t.species);
  const glyphRows = S.glyphs[t.species] || emptyGlyphRows();
  const hasGlyph = !!S.glyphs[t.species];

  // Ability pool — render each entry as a row with a select dropdown + remove button,
  // mirroring the +Add UX used for ability effects. Duplicates are filtered from
  // each row's options (except for the row's own current selection).
  const pool = t.abilityPool || [];
  const allAbilityKeys = Object.keys(S.abilities)
    .sort((a, b) => S.abilities[a].name.localeCompare(S.abilities[b].name));
  const poolRows = pool.map((k, i) => {
    const ab = S.abilities[k];
    const pipClass = `type-pip ${ab?.element || 'neutral'}`;
    const opts = allAbilityKeys
      .filter(ak => ak === k || !pool.includes(ak))
      .map(ak => {
        const a2 = S.abilities[ak];
        const full = (a2.desc || '').replace(/\s+/g, ' ').trim();
        const titleAttr = (a2.desc || '').replace(/"/g, '&quot;');
        return `<option value="${ak}" title="${titleAttr}" ${ak === k ? 'selected' : ''}>${boldify(a2.name)}${full ? ' — ' + full : ''}</option>`;
      }).join('');
    return `
      <div class="ae-row" data-pool-idx="${i}">
        <div class="ae-row-head">
          <span class="${pipClass}" data-pool-pip="${i}" style="flex-shrink:0"></span>
          <select data-pool-sel="${i}">${opts}</select>
          <button class="btn-icon" data-pool-remove="${i}" title="Remove from pool">✕</button>
        </div>
      </div>`;
  }).join('');
  const canAdd = allAbilityKeys.some(k => !pool.includes(k));

  // Glyph painter: 16x16 grid of clickable cells. Click toggles. Direct-DOM
  // updates via bindMonsterFormEvents — no full re-render per pixel.
  const painterCells = [];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const filled = glyphRows[y][x] === '#';
      painterCells.push(`<div class="gp-cell${filled ? ' filled' : ''}" data-gx="${x}" data-gy="${y}"></div>`);
    }
  }

  // Voice section: subtitle + 3 field-note lines. If absent, type-fallbacks
  // are shown as placeholders so the author sees what they'd be overriding.
  const subOverride = S.voice.subtitles[t.species] || '';
  const subFallback = S.voice.subtitles[t.type] || '';
  const notesOverride = S.voice.notes[t.species] || ['', '', ''];
  const notesFallback = S.voice.notes[t.type] || ['', '', ''];
  const noteRow = (i) => `
    <div class="form-row">
      <label>Note ${i + 1}</label>
      <input type="text" class="voice-note" data-voice-note="${i}" value="${escapeAttr(notesOverride[i] || '')}" placeholder="${escapeAttr(notesFallback[i] || 'fallback to type voice…')}">
    </div>`;

  // Growth rate cells: numeric input + grade select. Editing either updates the other.
  const growthCells = ['hp','atk','def','spd'].map(s => {
    const v = t.growth[s];
    const grade = growthGrade(v);
    const gradeOpts = growthGradeList().map(g => `<option value="${g.grade}" ${g.grade === grade ? 'selected' : ''}>${g.grade}</option>`).join('');
    return `
      <div class="stat-cell">
        <label>${s.toUpperCase()}</label>
        <div class="growth-cell">
          <input type="number" data-stat-growth="${s}" value="${v}" step="0.1" min="0" max="3.5">
          <select data-stat-grade="${s}" class="growth-grade grade-${grade}">${gradeOpts}</select>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="form-section">
      <div class="form-section-title">Identity</div>
      <div class="form-row"><label>Species key</label><input type="text" data-field="species" value="${t.species}"></div>
      <div class="form-row"><label>Narrative name</label><input type="text" data-field="name" class="voice-subtitle" value="${escapeAttr(t.name || '')}" placeholder="lowercase english-but-wrong phrase…"></div>
      <div class="form-row">
        <label>Type</label>
        <select data-field="type">${typeOpts}</select>
        <label style="min-width:auto">Starter</label>
        <input type="checkbox" data-field="starter" ${t.starter ? 'checked' : ''}>
        <div class="portrait-box">${svgHTML}</div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Base Stats</div>
      <div class="stat-grid stat-grid-narrow">
        ${['hp','atk','def','spd'].map(s => `
          <div class="stat-cell">
            <label>${s.toUpperCase()}</label>
            <input type="number" data-stat-base="${s}" value="${t.baseStats[s]}" min="1">
          </div>`).join('')}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Growth Rates
        <span style="color:var(--text-muted);font-size:10px;font-weight:400">(set the number or pick a grade)</span>
      </div>
      <div class="stat-grid stat-grid-narrow">${growthCells}</div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Passives</div>
      <div class="form-row"><label>Primary</label><select data-field="primaryPassive">${passiveOpts}</select></div>
      <div class="form-row"><label>Secondary</label><select data-field="secondaryPassive">${passiveOpts2}</select></div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Ability Pool</div>
      <div id="pool-list">${poolRows}</div>
      <button class="btn btn-secondary btn-sm" id="pool-add" ${canAdd ? '' : 'disabled'}>+ Add ability</button>
    </div>
    <div class="form-section">
      <div class="form-section-title">Glyph
        <span style="color:var(--text-muted);font-size:10px;font-weight:400">(click cells to toggle pixels — 16×16 hand-authored bitmap)</span>
      </div>
      <div class="glyph-edit-row">
        <div class="glyph-painter" id="glyph-painter">${painterCells.join('')}</div>
        <div class="glyph-painter-side">
          <div class="glyph-preview-large" id="glyph-preview-large">${glyphSvg(glyphRows)}</div>
          <div class="glyph-painter-actions">
            <button class="btn btn-secondary btn-sm" id="glyph-clear">Clear</button>
            <button class="btn btn-secondary btn-sm" id="glyph-invert">Invert</button>
          </div>
          <div class="glyph-painter-meta">
            <span>${hasGlyph ? 'authored' : 'no glyph yet'}</span>
            <span id="glyph-pixel-count">${countPixels(glyphRows)} / 256 px</span>
          </div>
        </div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Voice
        <span style="color:var(--text-muted);font-size:10px;font-weight:400">(blank = fall back to ${t.type} voice — placeholders show the fallback)</span>
      </div>
      <div class="form-row">
        <label>Subtitle</label>
        <input type="text" class="voice-subtitle" data-voice-subtitle value="${escapeAttr(subOverride)}" placeholder="${escapeAttr(subFallback || 'one-line voice tag…')}">
      </div>
      ${noteRow(0)}
      ${noteRow(1)}
      ${noteRow(2)}
      <div class="voice-help">
        Markup: <code>~~strike~~</code> · <code>[[6]]</code> redaction · <code>**gold**</code> · <code>!!red!!</code>
      </div>
    </div>`;
}

function countPixels(rows) {
  let n = 0;
  for (const r of rows) for (const c of r) if (c === '#') n++;
  return n;
}

function escapeAttr(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// ─── Abilities Tab ───────────────────────────────────────────────────────────

function abilitiesTabHTML() {
  const q   = S.search.abilities.toLowerCase();
  const ef  = S.search.abilityElement;
  const srt = S.search.abilitySort;
  const totalDamage = (a) => (a.phases || []).flat()
    .filter(e => e.type === 'damage')
    .reduce((s, e) => s + (e.power || 0) * (e.hits || 1), 0);
  const phaseCount  = (a) => (a.phases ? a.phases.length : 0);
  const hasDamage   = (a) => (a.phases || []).flat().some(e => e.type === 'damage');

  const entries = Object.entries(S.abilities)
    .filter(([k, a]) => (!ef || a.element === ef) && (!q || a.name.toLowerCase().includes(q) || k.includes(q)))
    .sort((a, b) => {
      if (srt === 'element') {
        const ea = a[1].element || '', eb = b[1].element || '';
        return ea.localeCompare(eb) || a[1].name.localeCompare(b[1].name);
      }
      if (srt === 'power') return totalDamage(b[1]) - totalDamage(a[1]);
      return a[1].name.localeCompare(b[1].name);
    });

  const listHTML = entries.map(([k, a]) => {
    const dmg = totalDamage(a);
    const subParts = [];
    if (phaseCount(a) > 1) subParts.push(`${phaseCount(a)} phases`);
    if (hasDamage(a)) subParts.push(`pow ${dmg}`);
    const pipClass = a.element ? `type-pip ${a.element}` : 'type-pip neutral';
    return `
      <div class="list-item ${S.ability === k ? 'selected' : ''}" data-ability="${k}">
        <span class="${pipClass}"></span>
        <div style="flex:1; min-width:0;">
          <div class="list-item-name">${a.name}</div>
          <div class="list-item-sub">${subParts.join(' · ') || k}</div>
        </div>
        <button class="btn-icon list-item-delete" data-delete-ability="${k}" title="Delete ability">✕</button>
      </div>`;
  }).join('');

  const elemFilters = [['', 'All'], ...S.types.map(t => [t, t])];
  const filterBtns = elemFilters.map(([key, label]) =>
    `<button class="kind-filter-btn ${ef === key ? 'active' : ''}" data-element="${key}">${label}</button>`
  ).join('');

  const sortOpts = [['name','Name'],['element','Element'],['power','Power']]
    .map(([v, l]) => `<option value="${v}" ${srt === v ? 'selected' : ''}>${l}</option>`).join('');

  const ab = S.ability ? S.abilities[S.ability] : null;
  return `
    <div class="list-panel">
      <div class="list-search">
        <input id="search-abilities" placeholder="Search…" value="${S.search.abilities}">
        <select id="sort-abilities">${sortOpts}</select>
      </div>
      <div class="kind-filter">${filterBtns}</div>
      <div class="list-items">${listHTML}</div>
      <button class="btn btn-secondary btn-sm" id="ability-new" style="margin: 6px 8px;">+ New ability</button>
    </div>
    <div class="detail-panel">${ab ? abilityFormHTML(S.ability, ab) : '<div class="empty">Select an ability to edit.</div>'}</div>`;
}

// ─── Additional Effects ──────────────────────────────────────────────────────
// Each instance on an ability is { type, ...params }. The schema in
// data/additionaleffects.json defines per-type params (label + type + default).
// Missing params fall back to defaults at runtime (mirroring effParam in abilities.js).

const AE_TARGET_LABELS = { self: 'Self', bench: 'Bench', enemy: 'Enemy', enemy_bench: 'Enemy Bench' };
const AE_TARGETS_ALL   = ['self', 'bench', 'enemy', 'enemy_bench'];
const AE_SWAP_TARGETS  = ['self', 'enemy'];

function aeParamCurrent(eff, paramKey, schema) {
  return eff[paramKey] !== undefined ? eff[paramKey] : (schema?.default);
}

function aeParamHTML(phaseIdx, effIdx, paramKey, schema, current) {
  const dataAttr = `data-ae-param="${paramKey}" data-ae-row="${effIdx}" data-ae-phase="${phaseIdx}"`;
  const label = schema.label || paramKey;
  if (schema.type === 'percent') {
    const v = Math.round((current ?? 0) * 1000) / 10;
    return `<label class="ae-param"><span>${label} %</span><input type="number" ${dataAttr} data-ae-ptype="percent" value="${v}" step="0.1" min="0" max="100"></label>`;
  }
  if (schema.type === 'multiplier') {
    return `<label class="ae-param"><span>${label}</span><input type="number" ${dataAttr} data-ae-ptype="multiplier" value="${current ?? 1}" step="0.05" min="0"></label>`;
  }
  if (schema.type === 'int') {
    return `<label class="ae-param"><span>${label}</span><input type="number" ${dataAttr} data-ae-ptype="int" value="${current ?? 0}" step="1" min="0"></label>`;
  }
  if (schema.type === 'bool') {
    return `<label class="ae-param ae-bool"><input type="checkbox" ${dataAttr} data-ae-ptype="bool" ${current ? 'checked' : ''}> ${label}</label>`;
  }
  if (schema.type === 'status') {
    const opts = Object.entries(S.statuses)
      .map(([k, s]) => `<option value="${k}" ${current === k ? 'selected' : ''}>${s.name}</option>`).join('');
    return `<label class="ae-param"><span>${label}</span><select ${dataAttr} data-ae-ptype="status">${opts}</select></label>`;
  }
  if (schema.type === 'targets' || schema.type === 'swapTargets') {
    const list = schema.type === 'swapTargets' ? AE_SWAP_TARGETS : AE_TARGETS_ALL;
    const arr = Array.isArray(current) ? current : [];
    const checks = list.map(t => `
      <label class="se-target-label">
        <input type="checkbox" ${dataAttr} data-ae-ptype="${schema.type}" data-ae-tgt="${t}" ${arr.includes(t) ? 'checked' : ''}>
        ${AE_TARGET_LABELS[t]}
      </label>`).join('');
    return `<div class="ae-param ae-targets"><span>${label}</span><div class="se-targets">${checks}</div></div>`;
  }
  if (schema.type === 'statMods') {
    const v = current || {};
    const cells = ['atk', 'def', 'spd'].map(s =>
      `<div class="stat-cell"><label>${s.toUpperCase()}</label>
        <input type="number" ${dataAttr} data-ae-ptype="statMods" data-ae-stat="${s}"
          value="${v[s] ?? 0}" step="0.05"></div>`).join('');
    return `<div class="ae-param ae-statmods"><span>${label}</span><div class="stat-grid">${cells}</div></div>`;
  }
  return '';
}

// Render a single effect row inside a phase. `phaseIdx` and `effIdx` are passed
// through to all data-* attributes so binders know which phase/effect to mutate.
function effectRowHTML(eff, phaseIdx, effIdx) {
  const typeKeys = Object.keys(S.additionalEffects);
  const schema = S.additionalEffects[eff.type] || { label: eff.type, params: {} };
  const params = schema.params || {};
  const paramRows = Object.entries(params)
    .map(([pk, ps]) => aeParamHTML(phaseIdx, effIdx, pk, ps, aeParamCurrent(eff, pk, ps)))
    .join('');
  const typeOpts = typeKeys.map(k => {
    const s = S.additionalEffects[k];
    const full = (s?.desc || '').replace(/\s+/g, ' ').trim();
    return `<option value="${k}" ${eff.type === k ? 'selected' : ''}>${boldify(s?.label || k)}${full ? ' — ' + full : ''}</option>`;
  }).join('');
  const desc = (schema.desc || '').replace(/"/g, '&quot;');

  // Timing override: only meaningful for non-modifier effects.
  let timingHTML = '';
  if (!schema.modifier && eff.type !== 'damage') {
    const def = schema.defaultTiming || 'after';
    const cur = eff.timing || def;
    const tOpts = ['before', 'eachHit', 'after'].map(t =>
      `<option value="${t}" ${cur === t ? 'selected' : ''}>${t}${t === def ? ' (default)' : ''}</option>`
    ).join('');
    timingHTML = `<label class="ae-param ae-timing"><span>Timing</span>
      <select data-ae-timing data-ae-row="${effIdx}" data-ae-phase="${phaseIdx}">${tOpts}</select></label>`;
  }

  // Dependency warning if `requires` is unmet within the current phase.
  let warning = '';
  const requires = schema.requires || [];
  if (requires.length) {
    const phaseTypes = new Set((S.abilities[S.ability].phases[phaseIdx] || []).map(e => e.type));
    const missing = requires.filter(r => !phaseTypes.has(r));
    if (missing.length) {
      warning = `<div class="ae-warn">⚠ needs ${missing.join(', ')} in this phase</div>`;
    }
  }

  return `
    <div class="ae-row" data-ae-idx="${effIdx}" data-ae-phase="${phaseIdx}">
      <div class="ae-row-head">
        <select data-ae-type-sel="${effIdx}" data-ae-phase="${phaseIdx}" title="${desc}">${typeOpts}</select>
        <button class="btn-icon" data-ae-remove="${effIdx}" data-ae-phase="${phaseIdx}">✕</button>
      </div>
      ${paramRows || timingHTML ? `<div class="ae-row-params">${paramRows}${timingHTML}</div>` : ''}
      ${warning}
    </div>`;
}

function phaseFormHTML(phase, phaseIdx, totalPhases) {
  const rows = phase.map((eff, i) => effectRowHTML(eff, phaseIdx, i)).join('');
  const phaseLabel = totalPhases > 1 ? `Phase ${phaseIdx + 1}` : 'Effects';
  const removeBtn = totalPhases > 1
    ? `<button class="btn-icon" data-phase-remove="${phaseIdx}" title="Remove this phase">✕</button>` : '';
  return `
    <div class="phase-block" data-phase-idx="${phaseIdx}">
      <div class="phase-head">
        <span class="phase-label">${phaseLabel}</span>
        ${removeBtn}
      </div>
      <div class="ae-list">${rows}</div>
      <button class="btn btn-secondary btn-sm" data-effect-add="${phaseIdx}">+ Add effect</button>
    </div>`;
}

function abilityFormHTML(key, ab) {
  const typeOpts = ['', ...S.types].map(t =>
    `<option value="${t}" ${(ab.element || '') === t ? 'selected' : ''}>${t || '(none)'}</option>`).join('');
  const phases = ab.phases && ab.phases.length ? ab.phases : [[]];
  const phaseHTML = phases.map((p, i) => phaseFormHTML(p, i, phases.length)).join('');

  // Per-ability action voice overrides — fall back to actionDefaults[element]
  // when blank. Show the fallback as the input placeholder so authors see
  // what they'd be overriding.
  const actVoice  = S.voice.actions[key] || {};
  const elemVoice = S.voice.actionDefaults[ab.element || 'neutral'] || S.voice.actionDefaults.neutral || {};

  return `
    <div class="form-section">
      <div class="form-section-title">Identity <span class="list-item-sub" style="font-size:10px">${key}</span></div>
      <div class="form-row"><label>Display name</label><input type="text" data-ab-field="name" value="${escapeAttr(ab.name)}" placeholder="short verb-led phrase…"></div>
      <div class="form-row"><label>Effect</label><textarea data-ab-field="effect" rows="2" placeholder="verbose lowercase mechanical text…">${escapeAttr(ab.effect || '')}</textarea></div>
      <div class="form-row"><label>Flavor</label><textarea data-ab-field="flavor" rows="2" placeholder="optional atmospheric beat (markup ok)…">${escapeAttr(ab.flavor || '')}</textarea></div>
      <div class="form-row"><label>Element</label><select data-ab-field="element">${typeOpts}</select></div>
      <div class="form-row"><label>Priority</label><input type="number" data-ab-field="priority" value="${ab.priority ?? 0}" min="-3" max="3"></div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Action voice
        <span style="color:var(--text-muted);font-size:10px;font-weight:400">
          (combat-log lines for this ability; blank = fall back to ${ab.element || 'neutral'} default)</span>
      </div>
      <div class="form-row"><label>Use line</label><input type="text" class="voice-subtitle" data-ab-voice="use" value="${escapeAttr(actVoice.use || '')}" placeholder="${escapeAttr(elemVoice.use || '{actor} uses {name}.')}"></div>
      <div class="form-row"><label>Hit line</label><input type="text" class="voice-subtitle" data-ab-voice="hit" value="${escapeAttr(actVoice.hit || '')}" placeholder="${escapeAttr(elemVoice.hit || 'they recoil.')}"></div>
      <div class="form-row"><label>Voice flavor</label><input type="text" class="voice-subtitle" data-ab-voice="flavor" value="${escapeAttr(actVoice.flavor || '')}" placeholder="optional in-combat flavor beat…"></div>
      <div class="voice-help">Templates: <code>{actor}</code> <code>{target}</code> <code>{name}</code>. Markup: <code>~~strike~~</code> <code>[[6]]</code> <code>**gold**</code> <code>!!red!!</code></div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Phases
        <span style="color:var(--text-muted);font-size:10px;font-weight:400">
          (multi-phase abilities resolve one phase per turn; subsequent phases queue up automatically)</span>
      </div>
      ${phaseHTML}
      <button class="btn btn-secondary btn-sm" id="phase-add">+ Add phase</button>
    </div>`;
}

// ─── Passives Tab ────────────────────────────────────────────────────────────

function passivesTabHTML() {
  const q = S.search.passives.toLowerCase();
  const entries = Object.entries(S.passives)
    .filter(([k, p]) => !q || p.name.toLowerCase().includes(q) || k.includes(q))
    .sort((a, b) => a[1].name.localeCompare(b[1].name));
  const listHTML = entries.map(([k, p]) => {
    const trigCount = (p.triggers || []).length;
    return `
    <div class="list-item ${S.passive === k ? 'selected' : ''}" data-passive="${k}">
      <div style="flex:1;min-width:0;">
        <div class="list-item-name">${p.name}</div>
        <div class="list-item-sub">${trigCount} trigger${trigCount === 1 ? '' : 's'}</div>
      </div>
      <button class="btn-icon list-item-delete" data-delete-passive="${k}" title="Delete passive">✕</button>
    </div>`;
  }).join('');

  const pv = S.passive ? S.passives[S.passive] : null;
  return `
    <div class="list-panel">
      <div class="list-search"><input id="search-passives" placeholder="Search…" value="${S.search.passives}"></div>
      <div class="list-items">${listHTML}</div>
      <button class="btn btn-secondary btn-sm" id="passive-new" style="margin: 6px 8px;">+ New passive</button>
    </div>
    <div class="detail-panel">${pv ? passiveFormHTML(S.passive, pv) : '<div class="empty">Select a passive to edit.</div>'}</div>`;
}

// ── Passive form ────────────────────────────────────────────────────────────
// Each passive has triggers: [{ on, if?, effect, consumesOn? }]. The form
// renders one block per trigger entry and lets the designer pick trigger,
// edit conditions, and edit the effect's params from the schema.

function passiveFormHTML(key, pv) {
  if (!pv.triggers) pv.triggers = [];
  const triggerRows = pv.triggers.map((t, i) => triggerEntryHTML(t, i)).join('');
  const voiceProse = S.voice.passives[key] || '';
  return `
    <div class="form-section">
      <div class="form-section-title">Identity <span class="list-item-sub" style="font-size:10px">${key}</span></div>
      <div class="form-row"><label>Display name</label><input type="text" data-pv-field="name" value="${escapeAttr(pv.name || '')}" placeholder="english-but-wrong phrase…"></div>
      <div class="form-row"><label>Mechanical desc</label><textarea data-pv-field="desc" rows="2">${escapeAttr(pv.desc || '')}</textarea></div>
      <div class="form-row"><label>Voice prose</label><input type="text" class="voice-subtitle" data-pv-voice value="${escapeAttr(voiceProse)}" placeholder="short evocative line shown above the mechanical desc…"></div>
      <div class="voice-help">Markup: <code>~~strike~~</code> <code>[[6]]</code> <code>**gold**</code> <code>!!red!!</code></div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Triggers
        <span style="color:var(--text-muted);font-size:10px;font-weight:400">
          (each trigger fires its effect when the matching combat event happens)</span>
      </div>
      ${triggerRows}
      <button class="btn btn-secondary btn-sm" id="trigger-add">+ Add trigger</button>
    </div>`;
}

function triggerEntryHTML(t, i) {
  const triggerDefs = S.passiveSchema.triggers || {};
  const trigOpts = Object.entries(triggerDefs).map(([k, def]) => {
    const short = (def.desc || '').replace(/"/g, '&quot;');
    return `<option value="${k}" ${t.on === k ? 'selected' : ''} title="${short}">${boldify(def.label || k)}${def.desc ? ' — ' + def.desc : ''}</option>`;
  }).join('');

  const consumesOpts = ['', 'battle'].map(v =>
    `<option value="${v}" ${(t.consumesOn || '') === v ? 'selected' : ''}>${v ? 'once per battle' : 'every fire'}</option>`).join('');

  // Conditions block: one row per active condition + an "add" dropdown.
  const condDefs = S.passiveSchema.conditions || {};
  const activeConds = t.if ? Object.keys(t.if) : [];
  const condRows = activeConds.map(ck => condRowHTML(ck, t.if[ck], i)).join('');
  const addableConds = Object.keys(condDefs).filter(c => !activeConds.includes(c));
  const condAddOpts = `<option value="">+ add condition</option>` +
    addableConds.map(c => `<option value="${c}">${condDefs[c].label || c}</option>`).join('');

  const effHTML = passiveEffectHTML(t.effect || { type: 'power_mult', value: 1 }, i);

  return `
    <div class="phase-block" data-tg-idx="${i}">
      <div class="phase-head">
        <span class="phase-label">Trigger ${i + 1}</span>
        <button class="btn-icon" data-tg-remove="${i}" title="Remove trigger">✕</button>
      </div>
      <div class="form-row">
        <label>On</label>
        <select data-tg-on="${i}">${trigOpts}</select>
      </div>
      <div class="form-row">
        <label>Consumes</label>
        <select data-tg-consumes="${i}">${consumesOpts}</select>
      </div>
      <div class="form-section-title" style="margin-top:6px;font-size:10px;">Conditions</div>
      ${condRows}
      <div class="form-row"><label></label><select data-tg-cond-add="${i}">${condAddOpts}</select></div>
      <div class="form-section-title" style="margin-top:6px;font-size:10px;">Effect</div>
      ${effHTML}
    </div>`;
}

function condRowHTML(condKey, condValue, trigIdx) {
  const def = (S.passiveSchema.conditions || {})[condKey] || { label: condKey, type: 'numCmp' };
  const label = def.label || condKey;
  let inputHTML = '';
  if (def.type === 'bool') {
    inputHTML = `<input type="checkbox" data-tg-cond="${condKey}" data-tg-cond-trig="${trigIdx}" data-tg-cond-type="bool" ${condValue ? 'checked' : ''}>`;
  } else if (def.type === 'numCmp') {
    inputHTML = `<input type="text" data-tg-cond="${condKey}" data-tg-cond-trig="${trigIdx}" data-tg-cond-type="numCmp" value="${condValue ?? ''}" placeholder="e.g. >=0.5" style="width:120px;">`;
  } else if (def.type === 'element') {
    const opts = ['fire','water','grass','light','dark']
      .map(e => `<option value="${e}" ${condValue === e ? 'selected' : ''}>${e}</option>`).join('');
    inputHTML = `<select data-tg-cond="${condKey}" data-tg-cond-trig="${trigIdx}" data-tg-cond-type="enum">${opts}</select>`;
  } else if (def.type === 'stat') {
    const opts = ['atk','def','spd']
      .map(s => `<option value="${s}" ${condValue === s ? 'selected' : ''}>${s.toUpperCase()}</option>`).join('');
    inputHTML = `<select data-tg-cond="${condKey}" data-tg-cond-trig="${trigIdx}" data-tg-cond-type="enum">${opts}</select>`;
  } else if (def.type === 'status') {
    const opts = Object.entries(S.statuses).map(([k, s]) =>
      `<option value="${k}" ${condValue === k ? 'selected' : ''}>${s.name}</option>`).join('');
    inputHTML = `<select data-tg-cond="${condKey}" data-tg-cond-trig="${trigIdx}" data-tg-cond-type="enum">${opts}</select>`;
  } else {
    inputHTML = `<input type="text" data-tg-cond="${condKey}" data-tg-cond-trig="${trigIdx}" data-tg-cond-type="string" value="${condValue ?? ''}">`;
  }
  return `
    <div class="form-row" data-tg-cond-row="${condKey}-${trigIdx}">
      <label style="font-size:11px;">${label}</label>
      ${inputHTML}
      <button class="btn-icon" data-tg-cond-remove="${condKey}" data-tg-cond-remove-trig="${trigIdx}" title="Remove">✕</button>
    </div>`;
}

function passiveEffectHTML(eff, trigIdx) {
  const effDefs = S.passiveSchema.effects || {};
  const opts = Object.entries(effDefs).map(([k, def]) => {
    return `<option value="${k}" ${eff.type === k ? 'selected' : ''}>${boldify(def.label || k)}</option>`;
  }).join('');
  const def = effDefs[eff.type] || { params: {} };
  const params = def.params || {};
  const paramRows = Object.entries(params)
    .map(([pk, ps]) => passiveParamHTML(pk, ps, eff[pk] !== undefined ? eff[pk] : ps.default, trigIdx))
    .join('');
  return `
    <div class="ae-row" data-tg-eff="${trigIdx}">
      <div class="ae-row-head">
        <select data-tg-eff-type="${trigIdx}">${opts}</select>
      </div>
      ${paramRows ? `<div class="ae-row-params">${paramRows}</div>` : ''}
    </div>`;
}

function passiveParamHTML(pk, ps, current, trigIdx) {
  const dataAttr = `data-tg-param="${pk}" data-tg-param-trig="${trigIdx}" data-tg-param-type="${ps.type}"`;
  const label = ps.label || pk;
  if (ps.type === 'percent') {
    const v = Math.round((current ?? 0) * 1000) / 10;
    return `<label class="ae-param"><span>${label} %</span><input type="number" ${dataAttr} value="${v}" step="0.1" min="0"></label>`;
  }
  if (ps.type === 'multiplier') {
    return `<label class="ae-param"><span>${label}</span><input type="number" ${dataAttr} value="${current ?? 1}" step="0.05"></label>`;
  }
  if (ps.type === 'int') {
    return `<label class="ae-param"><span>${label}</span><input type="number" ${dataAttr} value="${current ?? 0}" step="1"></label>`;
  }
  if (ps.type === 'string') {
    return `<label class="ae-param"><span>${label}</span><input type="text" ${dataAttr} value="${current ?? ''}"></label>`;
  }
  if (ps.type === 'stat') {
    const opts = ['atk','def','spd'].map(s =>
      `<option value="${s}" ${current === s ? 'selected' : ''}>${s.toUpperCase()}</option>`).join('');
    return `<label class="ae-param"><span>${label}</span><select ${dataAttr}>${opts}</select></label>`;
  }
  if (ps.type === 'side') {
    const opts = ['self','enemy'].map(s =>
      `<option value="${s}" ${current === s ? 'selected' : ''}>${s}</option>`).join('');
    return `<label class="ae-param"><span>${label}</span><select ${dataAttr}>${opts}</select></label>`;
  }
  if (ps.type === 'status') {
    const opts = Object.entries(S.statuses).map(([k, s]) =>
      `<option value="${k}" ${current === k ? 'selected' : ''}>${s.name}</option>`).join('');
    return `<label class="ae-param"><span>${label}</span><select ${dataAttr}>${opts}</select></label>`;
  }
  if (ps.type === 'statusList') {
    const arr = Array.isArray(current) ? current : [];
    const checks = Object.entries(S.statuses).map(([k, s]) =>
      `<label class="se-target-label"><input type="checkbox" ${dataAttr} data-tg-status-key="${k}" ${arr.includes(k) ? 'checked' : ''}>${s.name}</label>`).join('');
    return `<div class="ae-param ae-targets"><span>${label}</span><div class="se-targets">${checks}</div></div>`;
  }
  if (ps.type === 'statMods') {
    const v = current || {};
    const cells = ['atk','def','spd'].map(s =>
      `<div class="stat-cell"><label>${s.toUpperCase()}</label>
        <input type="number" ${dataAttr} data-tg-stat="${s}" value="${v[s] ?? 0}" step="0.05"></div>`).join('');
    return `<div class="ae-param ae-statmods"><span>${label}</span><div class="stat-grid">${cells}</div></div>`;
  }
  return '';
}

// ─── Status Effects Tab ──────────────────────────────────────────────────────

function statusEffectsTabHTML() {
  const q = S.search.statuses.toLowerCase();
  const entries = Object.entries(S.statuses)
    .filter(([k, s]) => !q || s.name.toLowerCase().includes(q) || k.includes(q))
    .sort((a, b) => a[1].name.localeCompare(b[1].name));
  const listHTML = entries.map(([k, s]) => `
    <div class="list-item ${S.status === k ? 'selected' : ''}" data-status="${k}">
      <div>
        <div class="list-item-name">${s.name}</div>
        <div class="list-item-sub">${k} · ${s.tickKind}</div>
      </div>
    </div>`).join('');

  const sv = S.status ? S.statuses[S.status] : null;
  return `
    <div class="list-panel">
      <div class="list-search"><input id="search-statuses" placeholder="Search…" value="${S.search.statuses}"></div>
      <div class="list-items">${listHTML}</div>
    </div>
    <div class="detail-panel">${sv ? statusFormHTML(S.status, sv) : '<div class="empty">Select a status to edit.</div>'}</div>`;
}

function statusFormHTML(key, sv) {
  const tickKinds = ['damage', 'heal', 'none'];
  const tickOpts = tickKinds.map(k => `<option ${sv.tickKind === k ? 'selected' : ''}>${k}</option>`).join('');
  const stackOpts = ['refresh', 'extend', 'stack'].map(k =>
    `<option ${sv.stacking === k ? 'selected' : ''}>${k}</option>`).join('');
  const showPpt   = sv.tickKind === 'damage' || sv.tickKind === 'heal';
  const showSwap  = sv.percentOnSwap !== undefined;
  const showStacks = sv.stacks !== undefined;
  const showAtkMult = sv.atkMult !== undefined;
  const showSkip   = sv.skipChance !== undefined;

  // Voice prose for this status — { name, apply, tick } from voiceprose.afflictions.
  const aff = S.voice.afflictions[key] || {};

  return `
    <div class="form-section">
      <div class="form-section-title">Identity <span class="list-item-sub" style="font-size:10px">${key}</span></div>
      <div class="form-row"><label>Display name</label><input type="text" data-sv-field="name" value="${escapeAttr(sv.name)}"></div>
      <div class="form-row"><label>Description</label><textarea data-sv-field="desc">${escapeAttr(sv.desc || '')}</textarea></div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Voice
        <span style="color:var(--text-muted);font-size:10px;font-weight:400">
          (in-combat prose for this status; <code>name</code> shows in the dossier afflictions list)</span>
      </div>
      <div class="form-row"><label>Voice name</label><input type="text" class="voice-subtitle" data-aff-field="name" value="${escapeAttr(aff.name || '')}" placeholder="${escapeAttr(sv.name || 'lowercase noun…')}"></div>
      <div class="form-row"><label>Apply line</label><input type="text" class="voice-subtitle" data-aff-field="apply" value="${escapeAttr(aff.apply || '')}" placeholder="line shown when the status takes hold…"></div>
      <div class="form-row"><label>Tick line</label><input type="text" class="voice-subtitle" data-aff-field="tick" value="${escapeAttr(aff.tick || '')}" placeholder="line shown each tick (with damage/heal numeral on the right)…"></div>
      <div class="voice-help">Markup: <code>~~strike~~</code> <code>[[6]]</code> <code>**gold**</code> <code>!!red!!</code></div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Mechanics</div>
      <div class="form-row"><label>Tick kind</label><select data-sv-field="tickKind">${tickOpts}</select></div>
      <div class="form-row"><label>Duration (turns)</label><input type="number" data-sv-num="turns" value="${sv.turns ?? 0}" min="0"></div>
      ${showPpt ? `<div class="form-row"><label>% per turn</label><input type="number" data-sv-pct="percentPerTurn" value="${Math.round((sv.percentPerTurn ?? 0) * 1000) / 10}" step="0.1" min="0" max="100"></div>` : ''}
      ${showSwap ? `<div class="form-row"><label>% on swap-out</label><input type="number" data-sv-pct="percentOnSwap" value="${Math.round((sv.percentOnSwap ?? 0) * 1000) / 10}" step="0.1" min="0" max="100"></div>` : ''}
      ${showAtkMult ? `<div class="form-row"><label>Attack multiplier</label><input type="number" data-sv-num="atkMult" value="${sv.atkMult ?? 1}" step="0.05" min="0"></div>` : ''}
      ${showSkip ? `<div class="form-row"><label>% chance to skip turn</label><input type="number" data-sv-pct="skipChance" value="${Math.round((sv.skipChance ?? 0) * 1000) / 10}" step="0.1" min="0" max="100"></div>` : ''}
      ${showStacks ? `<div class="form-row"><label>Default stacks</label><input type="number" data-sv-num="stacks" value="${sv.stacks ?? 1}" min="1"></div>` : ''}
      <div class="form-row"><label>Stacking rule</label><select data-sv-field="stacking">${stackOpts}</select></div>
    </div>`;
}

// ─── Globals Tab ─────────────────────────────────────────────────────────────
// Edits the cosmetic letter-grade thresholds. Numeric growth values on each
// monster template stay untouched — only the displayed grade letter follows
// the new boundaries. The grade dropdown on the monster form is a one-way
// shortcut for "snap value to grade midpoint"; nothing stores the grade.

// ─── Voice Tables Tab ────────────────────────────────────────────────────────
// Edits the global voice maps that don't fit per-entity forms:
//   · TYPE_LABELS — per-element display label (fire→ember, etc.)
//   · actionDefaults — per-element use/hit combat-log templates
//   · effectDefaults — per-non-damage-effect-kind use/hit templates
//   · events — short event templates (faint, swap_out, evade, …)
//
// All four are simple key→value maps. UI is a flat list of editable rows
// per section. Markup help line on each section. Empty inputs delete the
// entry from the source object.

function voiceTablesTabHTML() {
  // ── TYPE_LABELS ──────────────────────────────────────────────────
  const typeRows = (S.types || []).map(t => `
    <div class="form-row" data-tl-row="${t}">
      <label style="min-width:80px;">${t}</label>
      <input type="text" class="voice-subtitle" data-tl-key="${t}" value="${escapeAttr(S.typeLabels[t] || '')}" placeholder="display label…">
    </div>`).join('');

  // ── actionDefaults ───────────────────────────────────────────────
  // Per-element use/hit templates. Keys: fire / water / grass / light / dark / neutral.
  const actionElements = ['fire', 'water', 'grass', 'light', 'dark', 'neutral'];
  const actionRows = actionElements.map(elem => {
    const v = S.voice.actionDefaults[elem] || {};
    return `
      <div class="form-section" style="background:var(--bg2);padding:8px 10px;margin-bottom:6px;border:1px solid var(--border);">
        <div style="font-size:11px;letter-spacing:1.5px;color:var(--text-dim);margin-bottom:4px;">${elem}</div>
        <div class="form-row">
          <label>Use line</label>
          <input type="text" class="voice-subtitle" data-action-default="${elem}" data-action-field="use" value="${escapeAttr(v.use || '')}" placeholder="{actor} verbs with {name}.">
        </div>
        <div class="form-row">
          <label>Hit line</label>
          <input type="text" class="voice-subtitle" data-action-default="${elem}" data-action-field="hit" value="${escapeAttr(v.hit || '')}" placeholder="they recoil.">
        </div>
      </div>`;
  }).join('');

  // ── effectDefaults ───────────────────────────────────────────────
  // Per-effect-kind use/hit templates for non-damage effects.
  const effectKinds = ['heal', 'buff', 'debuff', 'swap', 'status', 'cleanse', 'brace', 'noop'];
  const effectRows = effectKinds.map(kind => {
    const v = S.voice.effectDefaults[kind] || {};
    return `
      <div class="form-section" style="background:var(--bg2);padding:8px 10px;margin-bottom:6px;border:1px solid var(--border);">
        <div style="font-size:11px;letter-spacing:1.5px;color:var(--text-dim);margin-bottom:4px;">${kind}</div>
        <div class="form-row">
          <label>Use line</label>
          <input type="text" class="voice-subtitle" data-effect-default="${kind}" data-effect-field="use" value="${escapeAttr(v.use || '')}" placeholder="{actor} steadies itself.">
        </div>
        <div class="form-row">
          <label>Hit line</label>
          <input type="text" class="voice-subtitle" data-effect-default="${kind}" data-effect-field="hit" value="${escapeAttr(v.hit || '')}" placeholder="(optional)">
        </div>
      </div>`;
  }).join('');

  // ── events ───────────────────────────────────────────────────────
  // Each entry is a short string keyed by event name.
  const knownEventOrder = [
    'battle_open', 'phase_prepare', 'phase_continue', 'phase_unleash',
    'super', 'resist', 'crit_tag',
    'evade', 'dazed_skip', 'ability_fizzle', 'faint', 'step_in',
    'swap_out', 'swap_in', 'swap_yanked', 'swap_none', 'swap_curse',
    'swap_arrives_buffed', 'swap_arrives_healed',
  ];
  const presentKeys = Object.keys(S.voice.events || {});
  const orderedKeys = [...new Set([...knownEventOrder, ...presentKeys])];
  const eventRows = orderedKeys.map(k => `
    <div class="form-row" data-event-row="${k}">
      <label style="min-width:160px;">${k}</label>
      <input type="text" class="voice-subtitle" data-event-key="${k}" value="${escapeAttr(S.voice.events[k] || '')}" placeholder="template…">
    </div>`).join('');

  return `
    <div class="detail-panel" style="flex:1;overflow:auto;">
      <div class="form-section">
        <div class="form-section-title">Type Labels
          <span style="color:var(--text-muted);font-size:10px;font-weight:400">
            (display label per element key — shown to the player wherever the type appears)</span>
        </div>
        ${typeRows}
      </div>

      <div class="form-section">
        <div class="form-section-title">Action Defaults
          <span style="color:var(--text-muted);font-size:10px;font-weight:400">
            (combat-log templates per element; consumed when an ability has no per-id voice override)</span>
        </div>
        ${actionRows}
        <div class="voice-help">Templates: <code>{actor}</code> <code>{target}</code> <code>{name}</code>. Markup: <code>~~strike~~</code> <code>[[6]]</code> <code>**gold**</code> <code>!!red!!</code></div>
      </div>

      <div class="form-section">
        <div class="form-section-title">Effect Defaults
          <span style="color:var(--text-muted);font-size:10px;font-weight:400">
            (combat-log templates for non-damage effects — heal / buff / swap / status / cleanse / brace)</span>
        </div>
        ${effectRows}
        <div class="voice-help">Templates: <code>{actor}</code> <code>{status}</code>. Markup: <code>~~strike~~</code> <code>[[6]]</code> <code>**gold**</code> <code>!!red!!</code></div>
      </div>

      <div class="form-section">
        <div class="form-section-title">Events
          <span style="color:var(--text-muted);font-size:10px;font-weight:400">
            (short atmospheric templates for swap / faint / evade / etc.)</span>
        </div>
        ${eventRows}
        <div class="voice-help">Templates: <code>{actor}</code> <code>{target}</code> <code>{name}</code> <code>{enemies}</code>. Markup: <code>~~strike~~</code> <code>[[6]]</code> <code>**gold**</code> <code>!!red!!</code></div>
      </div>
    </div>`;
}

function bindVoiceTablesEvents() {
  // Type labels — empty input deletes the key so the raw type name shows.
  document.querySelectorAll('[data-tl-key]').forEach(el => {
    el.addEventListener('change', () => {
      const k = el.dataset.tlKey;
      const v = el.value.trim();
      if (v) S.typeLabels[k] = v;
      else delete S.typeLabels[k];
      S.dirty.types = true;
      renderHeader(); renderTabs();
    });
  });

  // actionDefaults — per-element { use, hit }
  document.querySelectorAll('[data-action-default]').forEach(el => {
    el.addEventListener('change', () => {
      const elem = el.dataset.actionDefault;
      const field = el.dataset.actionField;
      const v = el.value.trim();
      const cur = S.voice.actionDefaults[elem] || {};
      if (v) cur[field] = v; else delete cur[field];
      if (Object.keys(cur).length === 0) delete S.voice.actionDefaults[elem];
      else S.voice.actionDefaults[elem] = cur;
      S.dirty.voice = true;
      renderHeader(); renderTabs();
    });
  });

  // effectDefaults — per-kind { use, hit }
  document.querySelectorAll('[data-effect-default]').forEach(el => {
    el.addEventListener('change', () => {
      const kind = el.dataset.effectDefault;
      const field = el.dataset.effectField;
      const v = el.value.trim();
      const cur = S.voice.effectDefaults[kind] || {};
      if (v) cur[field] = v; else delete cur[field];
      if (Object.keys(cur).length === 0) delete S.voice.effectDefaults[kind];
      else S.voice.effectDefaults[kind] = cur;
      S.dirty.voice = true;
      renderHeader(); renderTabs();
    });
  });

  // events — flat key→string map
  document.querySelectorAll('[data-event-key]').forEach(el => {
    el.addEventListener('change', () => {
      const k = el.dataset.eventKey;
      const v = el.value.trim();
      if (v) S.voice.events[k] = v;
      else delete S.voice.events[k];
      S.dirty.voice = true;
      renderHeader(); renderTabs();
    });
  });
}

function globalsTabHTML() {
  const list = growthGradeList();
  const warnings = [];
  for (let i = 1; i < list.length; i++) {
    if (list[i].min >= list[i - 1].min) {
      warnings.push(`${list[i].grade} (${list[i].min}) is not below ${list[i - 1].grade} (${list[i - 1].min}).`);
    }
  }

  // Distribution: how many growth-stat slots across all templates fall into each grade.
  const counts = Object.fromEntries(list.map(g => [g.grade, 0]));
  for (const t of S.templates) {
    for (const s of ['hp','atk','def','spd']) {
      const gr = growthGrade(t.growth[s]);
      counts[gr] = (counts[gr] || 0) + 1;
    }
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;

  const rows = list.map((g, i) => {
    const above = i > 0 ? list[i - 1].min : null;
    const mid = growthMidpoint(g.grade);
    const pct = Math.round((counts[g.grade] / total) * 100);
    return `
      <div class="form-row" data-grade-row="${g.grade}">
        <label class="growth-grade grade-${g.grade}" style="min-width:32px;text-align:center;">${g.grade}</label>
        <span style="font-size:11px;color:var(--text-muted);min-width:80px;">min growth</span>
        <input type="number" data-grade-min="${g.grade}" value="${g.min}" step="0.1" min="0" style="width:90px;flex:0 0 auto;">
        <span class="readonly" style="font-size:11px;">${above !== null ? `< ${above}` : '(no upper bound)'} · midpoint ${mid}</span>
        <span class="readonly" style="font-size:11px;margin-left:auto;">${counts[g.grade]} slots (${pct}%)</span>
      </div>`;
  }).join('');

  const warnHTML = warnings.length
    ? `<div class="ae-warn" style="margin-top:6px;">⚠ ${warnings.join(' ')}</div>`
    : '';

  return `
    <div class="detail-panel" style="flex:1;">
      <div class="form-section">
        <div class="form-section-title">Growth Rate Thresholds
          <span style="color:var(--text-muted);font-size:10px;font-weight:400">
            (relabels existing monsters; does not change their numeric growth values)</span>
        </div>
        ${rows}
        ${warnHTML}
      </div>
    </div>`;
}

// ─── Event Binding ───────────────────────────────────────────────────────────

function bindContentEvents() {
  const content = document.getElementById('content');

  // List item selection
  content.querySelectorAll('.list-item[data-idx]').forEach(el =>
    el.addEventListener('click', () => { S.monster = +el.dataset.idx; renderAll(); })
  );
  content.querySelectorAll('.list-item[data-ability]').forEach(el =>
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-delete-ability]')) return;
      S.ability = el.dataset.ability; renderAll();
    })
  );
  content.querySelectorAll('[data-delete-ability]').forEach(btn =>
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const k = btn.dataset.deleteAbility;
      const ab = S.abilities[k];
      if (!ab) return;
      // Find templates that reference this ability so we can warn the user.
      const referencing = (S.templates || [])
        .filter(t => (t.abilityPool || []).includes(k))
        .map(t => t.species);
      const refMsg = referencing.length
        ? `\n\nWill remove from ${referencing.length} monster pool${referencing.length > 1 ? 's' : ''}: ${referencing.join(', ')}.`
        : '';
      if (!confirm(`Delete ability "${ab.name}" (${k})?${refMsg}`)) return;
      delete S.abilities[k];
      for (const t of S.templates) {
        if (!t.abilityPool) continue;
        t.abilityPool = t.abilityPool.filter(x => x !== k);
      }
      if (S.ability === k) S.ability = null;
      S.dirty.abilities = true;
      S.dirty.templates = referencing.length > 0 || S.dirty.templates;
      renderAll();
    })
  );
  const newAbilityBtn = content.querySelector('#ability-new');
  if (newAbilityBtn) {
    newAbilityBtn.addEventListener('click', () => {
      const raw = prompt('New ability key (lowercase, snake_case):', '');
      if (raw === null) return;
      const key = raw.trim();
      if (!key) return;
      if (!/^[a-z][a-z0-9_]*$/.test(key)) {
        alert('Key must start with a lowercase letter and contain only lowercase letters, digits, or underscores.');
        return;
      }
      if (S.abilities[key]) { alert(`"${key}" already exists.`); return; }
      const niceName = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      S.abilities[key] = {
        name: niceName,
        desc: '',
        priority: 0,
        phases: [[ { type: 'damage', power: 50 } ]],
      };
      S.ability = key;
      S.dirty.abilities = true;
      renderAll();
    });
  }
  content.querySelectorAll('.list-item[data-passive]').forEach(el =>
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-delete-passive]')) return;
      S.passive = el.dataset.passive; renderAll();
    })
  );
  content.querySelectorAll('[data-delete-passive]').forEach(btn =>
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const k = btn.dataset.deletePassive;
      const pv = S.passives[k];
      if (!pv) return;
      const referencing = (S.templates || [])
        .filter(t => t.primaryPassive === k || t.secondaryPassive === k)
        .map(t => t.species);
      const refMsg = referencing.length
        ? `\n\nAlso clears it from ${referencing.length} monster${referencing.length > 1 ? 's' : ''}: ${referencing.join(', ')}.`
        : '';
      if (!confirm(`Delete passive "${pv.name}" (${k})?${refMsg}`)) return;
      delete S.passives[k];
      for (const t of S.templates) {
        if (t.primaryPassive === k) t.primaryPassive = '';
        if (t.secondaryPassive === k) t.secondaryPassive = '';
      }
      if (S.passive === k) S.passive = null;
      S.dirty.passives = true;
      if (referencing.length) S.dirty.templates = true;
      renderAll();
    })
  );
  const newPassiveBtn = content.querySelector('#passive-new');
  if (newPassiveBtn) {
    newPassiveBtn.addEventListener('click', () => {
      const raw = prompt('New passive key (lowercase, snake_case):', '');
      if (raw === null) return;
      const key = raw.trim();
      if (!key) return;
      if (!/^[a-z][a-z0-9_]*$/.test(key)) {
        alert('Key must start with a lowercase letter and contain only lowercase letters, digits, or underscores.');
        return;
      }
      if (S.passives[key]) { alert(`"${key}" already exists.`); return; }
      const niceName = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      S.passives[key] = { name: niceName, desc: '', triggers: [] };
      S.passive = key;
      S.dirty.passives = true;
      renderAll();
    });
  }
  content.querySelectorAll('.list-item[data-status]').forEach(el =>
    el.addEventListener('click', () => { S.status = el.dataset.status; renderAll(); })
  );

  // Search inputs
  ['monsters','abilities','passives','statuses'].forEach(t => {
    const inp = document.getElementById(`search-${t}`);
    if (inp) inp.addEventListener('input', e => { S.search[t] = e.target.value; renderContent(); });
  });

  // Ability sort dropdown
  const sortSel = document.getElementById('sort-abilities');
  if (sortSel) sortSel.addEventListener('change', e => { S.search.abilitySort = e.target.value; renderContent(); });

  // Element filter buttons (Abilities tab)
  content.querySelectorAll('.kind-filter-btn').forEach(btn =>
    btn.addEventListener('click', () => { S.search.abilityElement = btn.dataset.element || ''; renderContent(); })
  );

  if (S.tab === 'monsters' && S.monster !== null) bindMonsterFormEvents();
  if (S.tab === 'abilities' && S.ability) bindAbilityFormEvents();
  if (S.tab === 'passives' && S.passive) bindPassiveFormEvents();
  if (S.tab === 'statuses' && S.status) bindStatusFormEvents();
  if (S.tab === 'voice') bindVoiceTablesEvents();
  if (S.tab === 'globals') bindGlobalsFormEvents();
}

function bindGlobalsFormEvents() {
  document.querySelectorAll('[data-grade-min]').forEach(el => {
    el.addEventListener('change', () => {
      const grade = el.dataset.gradeMin;
      const v = parseFloat(el.value);
      const entry = (S.globals.growthThresholds || []).find(g => g.grade === grade);
      if (!entry) return;
      entry.min = isNaN(v) ? 0 : v;
      S.dirty.globals = true;
      renderContent(); // refresh midpoints, distribution counts, warnings
      renderHeader();
      renderTabs();
    });
  });
}

function bindMonsterFormEvents() {
  const t = S.templates[S.monster];

  // Simple text/select/checkbox fields
  document.querySelectorAll('[data-field]').forEach(el => {
    el.addEventListener('change', () => {
      const field = el.dataset.field;
      const oldValue = t[field];
      if (el.type === 'checkbox') t[field] = el.checked;
      else t[field] = el.value;
      // Renaming the species needs to follow through to glyphs + voice keys
      // so the new species name keeps its existing artwork and prose.
      if (field === 'species' && oldValue !== t[field] && oldValue) {
        if (S.glyphs[oldValue]) {
          S.glyphs[t[field]] = S.glyphs[oldValue];
          delete S.glyphs[oldValue];
          S.dirty.glyphs = true;
        }
        for (const k of ['subtitles', 'notes']) {
          if (S.voice[k][oldValue] != null) {
            S.voice[k][t[field]] = S.voice[k][oldValue];
            delete S.voice[k][oldValue];
            S.dirty.voice = true;
          }
        }
      }
      // Type changes affect the portrait + voice fallback; passive changes
      // need to refresh the inline description block. All go through renderContent.
      if (field === 'type' || field === 'primaryPassive' || field === 'secondaryPassive') renderContent();
      S.dirty.templates = true; renderHeader(); renderTabs();
    });
  });

  // Glyph painter — direct DOM updates per pixel toggle. Refreshes the live
  // preview + count without re-rendering the whole form (which would lose
  // input focus elsewhere).
  const painter = document.getElementById('glyph-painter');
  if (painter) {
    if (!S.glyphs[t.species]) S.glyphs[t.species] = emptyGlyphRows();
    const previewBox = document.getElementById('glyph-preview-large');
    const countBox = document.getElementById('glyph-pixel-count');
    const refreshPreview = () => {
      if (previewBox) previewBox.innerHTML = glyphSvg(S.glyphs[t.species]);
      if (countBox) countBox.textContent = `${countPixels(S.glyphs[t.species])} / 256 px`;
    };
    painter.querySelectorAll('.gp-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const x = +cell.dataset.gx, y = +cell.dataset.gy;
        toggleGlyphPixel(S.glyphs[t.species], x, y);
        cell.classList.toggle('filled');
        refreshPreview();
        S.dirty.glyphs = true;
        renderHeader(); renderTabs();
      });
    });
    const clearBtn = document.getElementById('glyph-clear');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      S.glyphs[t.species] = emptyGlyphRows();
      renderContent();
      S.dirty.glyphs = true;
    });
    const invertBtn = document.getElementById('glyph-invert');
    if (invertBtn) invertBtn.addEventListener('click', () => {
      S.glyphs[t.species] = S.glyphs[t.species].map(r =>
        r.split('').map(c => c === '#' ? '.' : '#').join(''));
      renderContent();
      S.dirty.glyphs = true;
    });
  }

  // Voice — subtitle + notes overrides per species. Empty strings fall back
  // to the type-keyed voice at game-time, so we delete the per-species key
  // when cleared instead of writing an empty value.
  const subInput = document.querySelector('[data-voice-subtitle]');
  if (subInput) {
    subInput.addEventListener('change', () => {
      const v = subInput.value.trim();
      if (v) S.voice.subtitles[t.species] = v;
      else delete S.voice.subtitles[t.species];
      S.dirty.voice = true; renderHeader(); renderTabs();
    });
  }
  document.querySelectorAll('[data-voice-note]').forEach(input => {
    input.addEventListener('change', () => {
      const idx = +input.dataset.voiceNote;
      const arr = S.voice.notes[t.species] ? [...S.voice.notes[t.species]] : ['', '', ''];
      arr[idx] = input.value.trim();
      const allBlank = arr.every(x => !x);
      if (allBlank) delete S.voice.notes[t.species];
      else S.voice.notes[t.species] = arr;
      S.dirty.voice = true; renderHeader(); renderTabs();
    });
  });

  // Base stats
  document.querySelectorAll('[data-stat-base]').forEach(el => {
    el.addEventListener('change', () => {
      t.baseStats[el.dataset.statBase] = +el.value;
      S.dirty.templates = true; renderHeader(); renderTabs();
    });
  });

  // Growth rate (numeric) — also refresh the linked grade chip.
  document.querySelectorAll('[data-stat-growth]').forEach(el => {
    el.addEventListener('change', () => {
      const stat = el.dataset.statGrowth;
      t.growth[stat] = parseFloat(el.value) || 0;
      S.dirty.templates = true;
      renderContent();
    });
  });
  // Growth rate (letter grade) — snap value to the midpoint of the chosen grade.
  document.querySelectorAll('[data-stat-grade]').forEach(el => {
    el.addEventListener('change', () => {
      const stat = el.dataset.statGrade;
      t.growth[stat] = growthMidpoint(el.value);
      S.dirty.templates = true;
      renderContent();
    });
  });

  // Ability pool — add row (picks the first ability not already in pool).
  const poolAdd = document.getElementById('pool-add');
  if (poolAdd) {
    poolAdd.addEventListener('click', () => {
      if (!t.abilityPool) t.abilityPool = [];
      const next = Object.keys(S.abilities)
        .sort((a, b) => S.abilities[a].name.localeCompare(S.abilities[b].name))
        .find(k => !t.abilityPool.includes(k));
      if (!next) return;
      t.abilityPool.push(next);
      S.dirty.templates = true;
      renderContent();
    });
  }
  // Ability pool — change selection in a row.
  document.querySelectorAll('[data-pool-sel]').forEach(sel => {
    sel.addEventListener('change', () => {
      const i = +sel.dataset.poolSel;
      t.abilityPool[i] = sel.value;
      const pip = document.querySelector(`[data-pool-pip="${i}"]`);
      if (pip) pip.className = `type-pip ${S.abilities[sel.value]?.element || 'neutral'}`;
      S.dirty.templates = true;
      renderContent();
    });
    // Long-press jumps to the selected ability for editing.
    longPress(sel, () => {
      S.tab = 'abilities'; S.ability = sel.value; renderAll();
    });
  });
  // Ability pool — remove row.
  document.querySelectorAll('[data-pool-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.poolRemove;
      t.abilityPool.splice(i, 1);
      S.dirty.templates = true;
      renderContent();
    });
  });

  // Long-press on passive selects → navigate to that passive
  ['[data-field="primaryPassive"]', '[data-field="secondaryPassive"]'].forEach(sel => {
    const el = document.querySelector(sel);
    if (!el) return;
    longPress(el, () => {
      S.tab = 'passives'; S.passive = el.value; renderAll();
    });
  });
}

function bindAbilityFormEvents() {
  const ab = S.abilities[S.ability];
  if (!ab.phases) ab.phases = [[]];

  // Identity fields (name, desc, element, priority)
  document.querySelectorAll('[data-ab-field]').forEach(el => {
    el.addEventListener('change', () => {
      const f = el.dataset.abField;
      if (f === 'priority') {
        const v = parseInt(el.value);
        if (v === 0) delete ab[f]; else ab[f] = v;
      } else if (f === 'element') {
        if (el.value === '') delete ab[f]; else ab[f] = el.value;
      } else {
        ab[f] = el.value;
      }
      S.dirty.abilities = true; renderHeader(); renderTabs();
    });
  });

  // Per-ability action voice overrides — write to S.voice.actions[abilityKey].
  // Empty fields delete the key so combat falls back to the element default.
  document.querySelectorAll('[data-ab-voice]').forEach(input => {
    input.addEventListener('change', () => {
      const f = input.dataset.abVoice;  // 'use' | 'hit' | 'flavor'
      const v = input.value.trim();
      const cur = S.voice.actions[S.ability] || {};
      if (v) cur[f] = v; else delete cur[f];
      if (Object.keys(cur).length === 0) delete S.voice.actions[S.ability];
      else S.voice.actions[S.ability] = cur;
      S.dirty.voice = true; renderHeader(); renderTabs();
    });
  });

  // ── Phase add / remove ─────────────────────────────────────────────────
  const phaseAdd = document.getElementById('phase-add');
  if (phaseAdd) {
    phaseAdd.addEventListener('click', () => {
      if (!ab.phases) ab.phases = [[]];
      ab.phases.push([]);
      S.dirty.abilities = true;
      renderContent();
    });
  }
  document.querySelectorAll('[data-phase-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.phaseRemove;
      ab.phases.splice(i, 1);
      if (ab.phases.length === 0) ab.phases = [[]];
      S.dirty.abilities = true;
      renderContent();
    });
  });

  // ── Effect add (per phase) ─────────────────────────────────────────────
  document.querySelectorAll('[data-effect-add]').forEach(btn => {
    btn.addEventListener('click', () => {
      const pi = +btn.dataset.effectAdd;
      const firstType = Object.keys(S.additionalEffects)[0];
      if (!firstType) return;
      ab.phases[pi].push(makeAeInst(firstType));
      S.dirty.abilities = true;
      renderContent();
    });
  });

  // ── Effect remove ──────────────────────────────────────────────────────
  document.querySelectorAll('[data-ae-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const pi = +btn.dataset.aePhase;
      const i  = +btn.dataset.aeRemove;
      ab.phases[pi].splice(i, 1);
      S.dirty.abilities = true;
      renderContent();
    });
  });

  // ── Effect type change (replaces the instance with fresh defaults) ──
  document.querySelectorAll('[data-ae-type-sel]').forEach(sel => {
    sel.addEventListener('change', () => {
      const pi = +sel.dataset.aePhase;
      const i  = +sel.dataset.aeTypeSel;
      ab.phases[pi][i] = makeAeInst(sel.value);
      S.dirty.abilities = true;
      renderContent();
    });
  });

  // ── Per-effect timing override ──────────────────────────────────────────
  document.querySelectorAll('[data-ae-timing]').forEach(sel => {
    sel.addEventListener('change', () => {
      const pi = +sel.dataset.aePhase;
      const i  = +sel.dataset.aeRow;
      const eff = ab.phases[pi][i];
      const schema = S.additionalEffects[eff.type] || {};
      if (sel.value === schema.defaultTiming) delete eff.timing;
      else eff.timing = sel.value;
      S.dirty.abilities = true; renderHeader(); renderTabs();
    });
  });

  // ── Per-param edits ────────────────────────────────────────────────────
  document.querySelectorAll('[data-ae-param]').forEach(el => {
    el.addEventListener('change', () => {
      const pi    = +el.dataset.aePhase;
      const i     = +el.dataset.aeRow;
      const paramK = el.dataset.aeParam;
      const ptype  = el.dataset.aePtype;
      const eff    = ab.phases[pi][i];
      if (!eff) return;
      if (ptype === 'percent') {
        eff[paramK] = parseFloat((parseFloat(el.value) / 100).toFixed(4));
      } else if (ptype === 'multiplier') {
        eff[paramK] = parseFloat(el.value);
      } else if (ptype === 'int') {
        eff[paramK] = parseInt(el.value) || 0;
      } else if (ptype === 'bool') {
        eff[paramK] = el.checked;
      } else if (ptype === 'status') {
        eff[paramK] = el.value;
      } else if (ptype === 'targets' || ptype === 'swapTargets') {
        const tgt = el.dataset.aeTgt;
        if (!Array.isArray(eff[paramK])) eff[paramK] = [];
        if (el.checked) { if (!eff[paramK].includes(tgt)) eff[paramK].push(tgt); }
        else { eff[paramK] = eff[paramK].filter(t => t !== tgt); }
      } else if (ptype === 'statMods') {
        const stat = el.dataset.aeStat;
        if (!eff[paramK] || typeof eff[paramK] !== 'object') eff[paramK] = {};
        const v = parseFloat(el.value);
        eff[paramK][stat] = v;
      }
      S.dirty.abilities = true; renderHeader(); renderTabs();
    });
  });
}

function makeAeInst(type) {
  const schema = S.additionalEffects[type] || { params: {} };
  const inst = { type };
  for (const [pk, ps] of Object.entries(schema.params || {})) {
    const d = ps.default;
    if (d === undefined) continue;
    if (Array.isArray(d))                          inst[pk] = [...d];
    else if (d !== null && typeof d === 'object')  inst[pk] = { ...d };
    else                                           inst[pk] = d;
  }
  return inst;
}

function bindStatusFormEvents() {
  const sv = S.statuses[S.status];

  document.querySelectorAll('[data-sv-field]').forEach(el => {
    el.addEventListener('change', () => {
      sv[el.dataset.svField] = el.value;
      if (el.dataset.svField === 'tickKind') renderContent(); // refresh % fields visibility
      else { S.dirty.statuses = true; renderHeader(); renderTabs(); }
      S.dirty.statuses = true; renderHeader(); renderTabs();
    });
  });

  document.querySelectorAll('[data-sv-num]').forEach(el => {
    el.addEventListener('change', () => {
      sv[el.dataset.svNum] = +el.value;
      S.dirty.statuses = true; renderHeader(); renderTabs();
    });
  });

  // pct fields are stored as 0.0–1.0 but displayed as 0–100
  document.querySelectorAll('[data-sv-pct]').forEach(el => {
    el.addEventListener('change', () => {
      sv[el.dataset.svPct] = parseFloat((parseFloat(el.value) / 100).toFixed(4));
      S.dirty.statuses = true; renderHeader(); renderTabs();
    });
  });

  // Voice prose for the affliction — { name, apply, tick } in voice.afflictions.
  document.querySelectorAll('[data-aff-field]').forEach(el => {
    el.addEventListener('change', () => {
      const f = el.dataset.affField;
      const v = el.value.trim();
      const cur = S.voice.afflictions[S.status] || {};
      if (v) cur[f] = v; else delete cur[f];
      if (Object.keys(cur).length === 0) delete S.voice.afflictions[S.status];
      else S.voice.afflictions[S.status] = cur;
      S.dirty.voice = true; renderHeader(); renderTabs();
    });
  });
}

function bindPassiveFormEvents() {
  const pv = S.passives[S.passive];
  if (!pv.triggers) pv.triggers = [];

  // Identity (name, desc).
  document.querySelectorAll('[data-pv-field]').forEach(el => {
    el.addEventListener('change', () => {
      pv[el.dataset.pvField] = el.value;
      S.dirty.passives = true; renderHeader(); renderTabs();
    });
  });

  // Voice prose — voiceprose.passives[passiveKey], single-string lookup.
  const voiceInput = document.querySelector('[data-pv-voice]');
  if (voiceInput) {
    voiceInput.addEventListener('change', () => {
      const v = voiceInput.value.trim();
      if (v) S.voice.passives[S.passive] = v;
      else delete S.voice.passives[S.passive];
      S.dirty.voice = true; renderHeader(); renderTabs();
    });
  }

  // Add trigger.
  const tgAdd = document.getElementById('trigger-add');
  if (tgAdd) {
    tgAdd.addEventListener('click', () => {
      const trigKeys = Object.keys(S.passiveSchema.triggers || {});
      const effKeys  = Object.keys(S.passiveSchema.effects   || {});
      pv.triggers.push({
        on: trigKeys[0] || 'turn_start',
        effect: makePvEffect(effKeys[0] || 'power_mult'),
      });
      S.dirty.passives = true; renderContent();
    });
  }

  // Remove trigger.
  document.querySelectorAll('[data-tg-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.tgRemove;
      pv.triggers.splice(i, 1);
      S.dirty.passives = true; renderContent();
    });
  });

  // Trigger "on" change.
  document.querySelectorAll('[data-tg-on]').forEach(sel => {
    sel.addEventListener('change', () => {
      const i = +sel.dataset.tgOn;
      pv.triggers[i].on = sel.value;
      S.dirty.passives = true; renderContent();
    });
  });

  // consumesOn.
  document.querySelectorAll('[data-tg-consumes]').forEach(sel => {
    sel.addEventListener('change', () => {
      const i = +sel.dataset.tgConsumes;
      if (sel.value) pv.triggers[i].consumesOn = sel.value;
      else delete pv.triggers[i].consumesOn;
      S.dirty.passives = true; renderHeader(); renderTabs();
    });
  });

  // Add condition.
  document.querySelectorAll('[data-tg-cond-add]').forEach(sel => {
    sel.addEventListener('change', () => {
      if (!sel.value) return;
      const i = +sel.dataset.tgCondAdd;
      const t = pv.triggers[i];
      if (!t.if) t.if = {};
      const def = (S.passiveSchema.conditions || {})[sel.value] || { type: 'string' };
      t.if[sel.value] = condDefaultValue(def.type);
      S.dirty.passives = true; renderContent();
    });
  });

  // Remove condition.
  document.querySelectorAll('[data-tg-cond-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.tgCondRemoveTrig;
      const k = btn.dataset.tgCondRemove;
      const t = pv.triggers[i];
      if (t.if) {
        delete t.if[k];
        if (!Object.keys(t.if).length) delete t.if;
      }
      S.dirty.passives = true; renderContent();
    });
  });

  // Edit condition value.
  document.querySelectorAll('[data-tg-cond]').forEach(el => {
    el.addEventListener('change', () => {
      const i = +el.dataset.tgCondTrig;
      const k = el.dataset.tgCond;
      const ct = el.dataset.tgCondType;
      const t = pv.triggers[i];
      if (!t.if) t.if = {};
      if (ct === 'bool') t.if[k] = el.checked;
      else t.if[k] = el.value;
      S.dirty.passives = true; renderHeader(); renderTabs();
    });
  });

  // Effect type change.
  document.querySelectorAll('[data-tg-eff-type]').forEach(sel => {
    sel.addEventListener('change', () => {
      const i = +sel.dataset.tgEffType;
      pv.triggers[i].effect = makePvEffect(sel.value);
      S.dirty.passives = true; renderContent();
    });
  });

  // Effect param edits.
  document.querySelectorAll('[data-tg-param]').forEach(el => {
    el.addEventListener('change', () => {
      const i = +el.dataset.tgParamTrig;
      const pk = el.dataset.tgParam;
      const pt = el.dataset.tgParamType;
      const eff = pv.triggers[i].effect;
      if (!eff) return;
      if (pt === 'percent') {
        eff[pk] = parseFloat((parseFloat(el.value) / 100).toFixed(4));
      } else if (pt === 'multiplier') {
        eff[pk] = parseFloat(el.value);
      } else if (pt === 'int') {
        eff[pk] = parseInt(el.value) || 0;
      } else if (pt === 'string' || pt === 'stat' || pt === 'side' || pt === 'status') {
        eff[pk] = el.value;
      } else if (pt === 'statusList') {
        const k = el.dataset.tgStatusKey;
        if (!Array.isArray(eff[pk])) eff[pk] = [];
        if (el.checked) { if (!eff[pk].includes(k)) eff[pk].push(k); }
        else            { eff[pk] = eff[pk].filter(s => s !== k); }
      } else if (pt === 'statMods') {
        const stat = el.dataset.tgStat;
        if (!eff[pk] || typeof eff[pk] !== 'object') eff[pk] = {};
        eff[pk][stat] = parseFloat(el.value);
      }
      S.dirty.passives = true; renderHeader(); renderTabs();
    });
  });
}

function makePvEffect(type) {
  const def = (S.passiveSchema.effects || {})[type] || { params: {} };
  const inst = { type };
  for (const [pk, ps] of Object.entries(def.params || {})) {
    const d = ps.default;
    if (d === undefined) continue;
    if (Array.isArray(d))                          inst[pk] = [...d];
    else if (d !== null && typeof d === 'object')  inst[pk] = { ...d };
    else                                           inst[pk] = d;
  }
  return inst;
}

function condDefaultValue(type) {
  if (type === 'bool') return true;
  if (type === 'numCmp') return '>=0';
  if (type === 'element') return 'fire';
  if (type === 'stat') return 'atk';
  if (type === 'status') return 'burn';
  return '';
}

// ─── Long-press ──────────────────────────────────────────────────────────────

function longPress(el, cb) {
  let timer;
  el.addEventListener('pointerdown', () => { timer = setTimeout(() => { cb(); timer = null; }, 500); });
  el.addEventListener('pointerup',   () => clearTimeout(timer));
  el.addEventListener('pointermove', () => clearTimeout(timer));
  el.addEventListener('pointerleave',() => clearTimeout(timer));
}

// ─── GitHub Commit ───────────────────────────────────────────────────────────

function openCommitModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');
  const dirtyNames = Object.entries(S.dirty).filter(([, v]) => v).map(([k]) => k).join(', ');
  overlay.innerHTML = `
    <div class="modal">
      <h3>Commit to GitHub</h3>
      <p style="font-size:12px;color:var(--text-dim);margin-bottom:10px">Files to commit: ${dirtyNames}</p>
      <textarea id="commit-msg" rows="2" placeholder="Commit message">chore: designer edits via editor tool</textarea>
      <div class="modal-buttons">
        <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="modal-confirm">Commit</button>
      </div>
    </div>`;
  document.getElementById('modal-cancel').addEventListener('click', () => overlay.classList.add('hidden'));
  document.getElementById('modal-confirm').addEventListener('click', () => doCommit(document.getElementById('commit-msg').value));
}

async function doCommit(message) {
  const overlay = document.getElementById('modal-overlay');
  overlay.innerHTML = `<div class="modal"><p style="padding:10px">Committing…</p></div>`;
  S.statusMsg = ''; S.statusError = false;

  if (!S.pat) { showStatus('Enter a GitHub PAT first.', true); overlay.classList.add('hidden'); return; }

  // Glyphs and voiceprose carry an _format header row that the game ignores
  // but readers find helpful. We re-attach those at write time so the file
  // round-trips cleanly.
  const glyphsOut = {
    _format: {
      size: '16x16', filled: '#', empty: '.',
      note: 'Each glyph is a 16-element array of 16-char strings. Hand-authored, freehand pixel placement.',
    },
    ...S.glyphs,
  };
  const voiceOut = {
    _format: {
      note: 'Voice-style placeholder prose for the dossier and battle log. Inline markup: ~~strike~~ for double-strike, [[N]] for an N-char redaction bar, **gold** for the gold accent. All prose is lowercase.',
      lookup: 'Dossier reads: subtitles[species] || subtitles[type]; notes[species] || notes[type]. Battle log reads: actions[abilityKey].use || actionDefaults[element].use; same for hit/flavor. effectDefaults[kind] is consulted when an ability has no damage. afflictions[statusKey].apply / .tick are read on apply / per-turn-tick.',
      templates: '{actor} = lowercased name of the doer. {target} = lowercased name of the receiver. {name} = ability display name (lowercased). {status} = lowercased affliction name.',
    },
    subtitles:      S.voice.subtitles,
    notes:          S.voice.notes,
    passives:       S.voice.passives,
    afflictions:    S.voice.afflictions,
    actionDefaults: S.voice.actionDefaults,
    effectDefaults: S.voice.effectDefaults,
    actions:        S.voice.actions,
    events:         S.voice.events,
  };
  // types.json — preserve TYPES + TYPE_CHART + TYPE_PALETTE; sync TYPE_LABELS
  // from the editable map.
  const typesOut = {
    TYPES:        S.types,
    TYPE_LABELS:  S.typeLabels,
    TYPE_CHART:   undefined,   // filled below from the existing file shape
    TYPE_PALETTE: S.typePalette,
  };
  // Read the existing file's TYPE_CHART without round-tripping it through the
  // editor — the editor doesn't expose it for editing, so we need the original.
  // Stored at load time in a side-cache.
  if (S._typeChartCache) typesOut.TYPE_CHART = S._typeChartCache;

  const toCommit = [
    S.dirty.templates  && { file: 'templates.json',      data: S.templates },
    S.dirty.abilities  && { file: 'abilities.json',       data: S.abilities },
    S.dirty.passives   && { file: 'passives.json',        data: S.passives },
    S.dirty.statuses   && { file: 'statuseffects.json',   data: S.statuses },
    S.dirty.globals    && { file: 'globals.json',         data: S.globals },
    S.dirty.glyphs     && { file: 'glyphs.json',          data: glyphsOut },
    S.dirty.voice      && { file: 'voiceprose.json',      data: voiceOut },
    S.dirty.types      && { file: 'types.json',           data: typesOut },
  ].filter(Boolean);

  try {
    for (const { file, data } of toCommit) {
      const sha = await getFileSha(file);
      await putFile(file, data, sha, message);
    }
    S.dirty = { abilities: false, passives: false, templates: false, statuses: false, globals: false, glyphs: false, voice: false, types: false };
    showStatus('Committed! Pages will rebuild shortly.', false);
  } catch (e) {
    showStatus(`Commit failed: ${e.message}`, true);
  }
  overlay.classList.add('hidden');
  renderAll();
}

async function getFileSha(filename) {
  const url = `https://api.github.com/repos/pvaiun/TamerGame/contents/data/${filename}?ref=${encodeURIComponent(S.branch)}`;
  const res = await fetch(url, { headers: { Authorization: `token ${S.pat}`, Accept: 'application/vnd.github.v3+json' } });
  if (!res.ok) throw new Error(`Can't read ${filename}: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.sha;
}

async function putFile(filename, data, sha, message) {
  const content = toBase64(JSON.stringify(data, null, 2) + '\n');
  const url = `https://api.github.com/repos/pvaiun/TamerGame/contents/data/${filename}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `token ${S.pat}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content, sha, branch: S.branch }),
  });
  if (!res.ok) throw new Error(`Failed to write ${filename}: ${res.status} ${await res.text()}`);
}

function toBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function showStatus(msg, isError) {
  S.statusMsg = msg;
  S.statusError = isError;
  renderHeader();
  if (!isError) setTimeout(() => { S.statusMsg = ''; renderHeader(); }, 5000);
}

// ─── Start ───────────────────────────────────────────────────────────────────

init();
