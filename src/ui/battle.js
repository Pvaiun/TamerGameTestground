// Dossier battle screen.
//
// Layout: engagement strip → two columns of dossier → action box.
// New: a top-right speed/inspect strip for quick UX, damage estimates inline,
// clearer type-effectiveness tags, and clearer bench affordance.

import { el, attachLongPress, app } from './dom.js';
import { ABILITIES, PASSIVES, TYPE_CHART, VOICE } from '../data.js';
import { affName as voiceAffName } from '../combat/log.js';
import { state, TOTAL_WAVES } from '../state.js';
import { displayName, getDossierNotes } from '../creature.js';
import { renderGlyph } from './glyphs.js';
import { openInspectModal, openAbilityTooltip } from './cards.js';
import { playerAct, playerSwap } from '../combat/battle.js';
import { applyHpFill } from './hpTween.js';
import { parseProse } from './textCorrupt.js';
import { estimateDamage, effectiveStat } from '../combat/damage.js';

const STAT_BAR_MAX = 120;

export function renderBattle() {
  const screen = el('div', { class: 'dossier-screen' });
  screen.appendChild(engagementStripEl());

  const grid = el('div', { class: 'dossier-grid' });
  grid.appendChild(dossierColEl(state.pf, state.bf, 'player'));
  grid.appendChild(el('div', { class: 'dossier-divider' }));
  grid.appendChild(dossierColEl(state.ef, state.ebf, 'enemy'));
  screen.appendChild(grid);

  screen.appendChild(actionBoxEl());

  app().appendChild(screen);
}

// ── header ───────────────────────────────────────────────────────────
function engagementStripEl() {
  const left = el('div', { class: 'eng-left' });
  left.appendChild(el('span', {}, '// engagement'));
  left.appendChild(el('span', { class: 'eng-sep' }, ' · '));
  left.appendChild(el('span', {}, `depth ${roman(state.wave)}`));
  left.appendChild(el('span', { class: 'eng-sep' }, ' · '));
  left.appendChild(el('span', {}, `descent ${pad2(state.wave)} of ${pad2(TOTAL_WAVES)}`));

  const right = el('div', { class: 'eng-right' });
  // Combat speed toggle. Click cycles 1 → 2 → 1 (fast/normal). Default is fast.
  const speedBtn = el('button', { class: 'eng-btn' });
  const speedLabel = state.combatSpeed === 2 ? 'fast' : 'slow';
  speedBtn.textContent = `▸ pace · ${speedLabel}`;
  speedBtn.addEventListener('click', () => {
    state.combatSpeed = state.combatSpeed === 2 ? 1 : 2;
    speedBtn.textContent = `▸ pace · ${state.combatSpeed === 2 ? 'fast' : 'slow'}`;
  });
  right.appendChild(speedBtn);
  right.appendChild(el('span', { class: 'eng-sep' }, '  '));
  right.appendChild(el('span', { class: 'doc-blot' }, '●'));
  right.appendChild(el('span', {}, ' they are here'));

  return el('div', { class: 'engagement-strip' }, [left, right]);
}

// ── one column ───────────────────────────────────────────────────────
function dossierColEl(active, bench, side) {
  const col = el('div', { class: `dossier-col ${side}` });

  col.appendChild(benchInlineEl(bench, side));

  const c = active.creature;
  col.appendChild(el('div', { class: 'doc-title', html: parseProse(displayName(c)) }));
  col.appendChild(subtitleEl(c));
  col.appendChild(fieldNotesEl(c, side));
  col.appendChild(hpRowEl(active, side));
  col.appendChild(statBlockEl(active, side));
  col.appendChild(afflictionsEl(active));
  col.appendChild(passivesEl(c));

  return col;
}

function benchInlineEl(f, side) {
  const wrap = el('div', { class: 'bench-inline ' + side });
  if (!f) {
    wrap.appendChild(el('span', { class: 'bench-empty-inline' },
      side === 'player' ? '— no companion benched —' : '— solitary —'));
    return wrap;
  }
  const c = f.creature;
  const g = el('span', { class: 'bench-glyph-inline' });
  g.innerHTML = renderGlyph(c.species);
  const name = displayName(c);
  const composure = composureWord(f);
  const hpPct = Math.max(0, f.hp / c.maxHp);

  const text = el('span', { class: 'bench-text' });
  text.appendChild(el('span', { class: 'bench-name-inline', html: parseProse(name) }));
  text.appendChild(el('span', { class: 'bench-sep' }, ' · '));
  text.appendChild(el('span', { class: 'bench-tag' }, 'benched'));

  const bar = el('span', { class: 'bench-bar-inline' });
  const fill = el('span', { class: 'bench-bar-inline-fill' });
  bar.appendChild(fill);
  applyHpFill(fill, f);

  const hp = el('span', { class: 'bench-hp-inline' });
  hp.appendChild(el('span', { class: 'bench-hp-num' }, side === 'player' ? `hp ${Math.max(0, f.hp)}/${c.maxHp}` : `${Math.round(hpPct * 100)}%`));

  // Status badges on bench (only player side, redacted on enemy as a single dot).
  const statuses = activeAfflictions(f);
  const stat = el('span', { class: 'bench-status-inline' });
  if (statuses.length) {
    if (side === 'player') {
      stat.textContent = statuses.map(a => `${a.label}`).join(' · ');
    } else {
      stat.textContent = statuses.length ? '●'.repeat(statuses.length) : '';
      stat.classList.add('redact-dots');
    }
  }

  wrap.appendChild(g);
  wrap.appendChild(text);
  wrap.appendChild(bar);
  wrap.appendChild(hp);
  if (statuses.length) wrap.appendChild(stat);
  wrap.appendChild(el('span', { class: 'bench-composure' }, composure));
  attachLongPress(wrap, () => openInspectModal(c), null);
  return wrap;
}

function subtitleEl(c) {
  const key = VOICE.subtitles[c.species] || VOICE.subtitles[c.type] || '—';
  const e = el('div', { class: 'doc-subtitle' });
  e.innerHTML = parseProse(key);
  return e;
}

function fieldNotesEl(c, side) {
  const wrap = el('div', { class: 'field-notes-block' });
  wrap.appendChild(el('div', { class: 'sec-label-doc' }, sectionLabel('Patient file')));

  const body = el('div', { class: 'field-notes-body ' + side });
  const glyph = el('div', { class: 'glyph-inline glyph-portrait' });
  glyph.innerHTML = renderGlyph(c.species);
  attachLongPress(glyph, () => openInspectModal(c), null);

  const lines = getDossierNotes(c);
  const prose = el('div', { class: 'field-notes-prose' });
  for (const line of lines) {
    const lineEl = el('div', { class: 'fn-line' });
    lineEl.innerHTML = parseProse(line);
    prose.appendChild(lineEl);
  }
  if (side === 'enemy') {
    body.appendChild(prose);
    body.appendChild(glyph);
  } else {
    body.appendChild(glyph);
    body.appendChild(prose);
  }
  wrap.appendChild(body);
  return wrap;
}

function hpRowEl(f, side) {
  const max = f.creature.maxHp;
  const cur = Math.max(0, f.hp);
  const row = el('div', { class: 'hp-row-doc ' + side });

  const label = el('span', { class: 'hp-label' }, 'hp');
  const bar = el('span', { class: 'hp-bar-doc' });
  const fill = el('span', { class: 'hp-bar-doc-fill' });
  bar.appendChild(fill);
  applyHpFill(fill, f);

  const num = el('span', { class: 'hp-num' });
  // Both sides show numbers now — readable enemy HP is much better UX than
  // blocked redactions, which made damage feel arbitrary.
  num.appendChild(el('span', { class: 'hp-cur' }, pad3(cur)));
  num.appendChild(el('span', { class: 'hp-slash' }, ' / '));
  num.appendChild(el('span', { class: 'hp-max' }, pad3(max)));

  if (side === 'player') {
    row.appendChild(label);
    row.appendChild(bar);
    row.appendChild(num);
  } else {
    row.appendChild(num);
    row.appendChild(bar);
    row.appendChild(label);
  }
  return row;
}

function statBlockEl(f, side) {
  const wrap = el('div', { class: 'stat-block-doc ' + side });
  for (const [k, lbl] of [['atk', 'atk'], ['def', 'def'], ['spd', 'spd']]) {
    const baseVal = f.creature.stats[k];
    const effective = effectiveStat(f, k);
    const m = (effective / baseVal) - 1;
    const pct = Math.min(100, (effective / STAT_BAR_MAX) * 100);

    const row = el('div', { class: 'stat-row-bar ' + side });
    const label = el('span', { class: 'stat-bar-label' }, lbl);
    const bar = el('span', { class: 'stat-bar' });
    bar.appendChild(el('span', { class: 'stat-bar-fill', style: `width:${pct}%;` }));
    const num = el('span', { class: 'stat-bar-num' }, pad2(effective));
    if (Math.abs(m) > 0.04) {
      const tag = el('span', { class: 'stat-mod-tag ' + (m > 0 ? 'pos' : 'neg') },
        ` ${m > 0 ? '+' : ''}${Math.round(m * 100)}%`);
      num.appendChild(tag);
    }
    if (side === 'player') {
      row.appendChild(label); row.appendChild(bar); row.appendChild(num);
    } else {
      row.appendChild(num); row.appendChild(bar); row.appendChild(label);
    }
    wrap.appendChild(row);
  }
  return wrap;
}

function afflictionsEl(f) {
  const wrap = el('div', { class: 'afflictions-block' });
  wrap.appendChild(el('div', { class: 'sec-label-doc' }, sectionLabel('Afflictions')));

  const items = activeAfflictions(f);
  const inner = el('div', { class: 'afflictions-list' });
  if (items.length === 0) {
    inner.appendChild(el('span', { class: 'aff-empty' }, '— none observed —'));
  } else {
    items.forEach((a, i) => {
      if (i > 0) inner.appendChild(el('span', { class: 'aff-sep' }, ' · '));
      inner.appendChild(el('span', { class: 'doc-blot aff-blot' }, '●'));
      inner.appendChild(el('span', { class: 'aff-name' }, ` ${a.label}`));
      if (a.suffix) inner.appendChild(el('span', { class: 'aff-suffix' }, ` ${a.suffix}`));
    });
  }
  wrap.appendChild(inner);
  return wrap;
}

function activeAfflictions(f) {
  const out = [];
  const s = f.statuses || {};
  if (s.burn)    out.push({ label: voiceAffName('burn'),    suffix: `${s.burn.turns}t` });
  if (s.bloom)   out.push({ label: voiceAffName('bloom'),   suffix: `${s.bloom.turns}t` });
  if (s.soaking) out.push({ label: voiceAffName('soaking'), suffix: `${s.soaking.turns}t` });
  if (s.cursed)  out.push({ label: voiceAffName('cursed'),  suffix: `${s.cursed.turns}t` });
  if (s.dazed)   out.push({ label: voiceAffName('dazed'),   suffix: `${s.dazed.turns}t` });
  if (f.healing && f.healing.turnsLeft > 0) {
    out.push({ label: 'healing', suffix: `${f.healing.turnsLeft}t` });
  }
  return out;
}

function passivesEl(c) {
  const wrap = el('div', { class: 'passives-block' });
  wrap.appendChild(el('div', { class: 'sec-label-doc' }, sectionLabel('Passives')));

  const list = (c.passives && c.passives.length) ? c.passives : [];
  if (list.length === 0) {
    wrap.appendChild(el('div', { class: 'passive-empty' }, '— none observed —'));
    return wrap;
  }
  for (const k of list) {
    const p = PASSIVES[k];
    const voice = VOICE.passives[k];
    const mech = (p && p.desc) ? p.desc : '';
    const prose = voice || mech || '—';
    const showMech = !!voice && !!mech;

    const row = el('div', { class: 'passive-line-doc' });
    const top = el('div', { class: 'passive-prose' });
    top.appendChild(el('span', { class: 'passive-bullet' }, '•'));
    top.appendChild(el('span', { class: 'passive-name-doc' }, p ? p.name : k));
    top.appendChild(el('span', { class: 'passive-sep' }, ' · '));
    const desc = el('span', { class: 'passive-desc-doc' });
    desc.innerHTML = parseProse(prose);
    top.appendChild(desc);
    row.appendChild(top);
    if (showMech) {
      row.appendChild(el('div', { class: 'passive-mech' }, mech));
    }
    wrap.appendChild(row);
  }
  return wrap;
}

// ── action box ───────────────────────────────────────────────────────
function actionBoxEl() {
  const box = el('div', { class: 'action-box' });
  if (state.acting) {
    box.classList.add('state-narrative');
    box.appendChild(narrativeEl());
  } else {
    box.classList.add('state-action');
    box.appendChild(actionMenuEl());
  }
  return box;
}

function narrativeEl() {
  const wrap = el('div', { class: 'narrative-block' });
  const entry = state.log.length ? state.log[state.log.length - 1] : null;
  const typingIdx = state.typingLogIdx;
  if (!entry) {
    wrap.appendChild(el('div', { class: 'narr-line primary' }, '—'));
    return wrap;
  }
  const isTyping = (state.log.length - 1) === typingIdx;
  const line = el('div', { class: 'narr-line primary ' + (entry.cls || '') });
  const text = el('span', { class: 'narr-text' });
  const html = parseProse(String(entry.text || ''));
  if (isTyping) text.innerHTML = typewriterizeHTML(html, state.combatSpeed === 2 ? 14 : 22);
  else          text.innerHTML = html;
  line.appendChild(text);
  if (entry.damage > 0)    line.appendChild(el('span', { class: 'narr-dmg' },  `−${entry.damage}`));
  else if (entry.heal > 0) line.appendChild(el('span', { class: 'narr-heal' }, `+${entry.heal}`));
  wrap.appendChild(line);

  // Skip-narrative footer: hint that combatSpeed can be toggled mid-fight
  // (button lives in the engagement strip).
  const hint = el('div', { class: 'narr-footer' }, 'pace · top right');
  wrap.appendChild(hint);
  return wrap;
}

function typewriterizeHTML(html, msPerChar) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  let charIdx = 0;
  function walk(node) {
    if (node.nodeType === 3) {
      const text = node.textContent;
      const frag = document.createDocumentFragment();
      for (const ch of text) {
        const span = document.createElement('span');
        span.className = 'tw-char';
        span.style.animationDelay = (charIdx++ * msPerChar) + 'ms';
        span.textContent = ch;
        frag.appendChild(span);
      }
      node.parentNode.replaceChild(frag, node);
    } else if (node.nodeType === 1) {
      const children = Array.from(node.childNodes);
      for (const c of children) walk(c);
    }
  }
  walk(tmp);
  return tmp.innerHTML;
}

function actionMenuEl() {
  const wrap = el('div', { class: 'action-menu-doc' });
  wrap.appendChild(el('div', { class: 'menu-prompt' }, '▸ what i may do'));

  if (state.pf.queuedAbility) {
    wrap.appendChild(queuedActionRow());
    return wrap;
  }

  const split = el('div', { class: 'action-split' });
  const list = el('div', { class: 'action-list' });
  const detail = el('div', { class: 'action-detail' });
  let initialKey = null;

  const abilities = state.pf.creature.abilities;
  abilities.forEach((k, i) => {
    const a = ABILITIES[k];
    if (!a) return;
    const row = el('button', { class: 'action-row' + (i === 0 ? ' is-default' : '') });
    if (state.acting) row.disabled = true;
    row.appendChild(el('span', { class: 'action-marker' }, '▸ '));
    row.appendChild(el('span', { class: 'action-name' }, a.name || ''));

    // Tail: damage estimate or kind tag, plus type-effectiveness chip.
    const tail = el('span', { class: 'action-tail' });
    const dmgEst = estimateDamage(state.pf, state.ef, a);
    if (dmgEst > 0) {
      tail.appendChild(el('span', { class: 'action-dmg-est' }, `~${dmgEst}`));
    } else {
      const kind = abilityKindTag(a);
      if (kind) tail.appendChild(el('span', { class: 'action-kind' }, kind));
    }
    if (a.element) {
      tail.appendChild(el('span', { class: 'action-elem' }, ' ' + a.element));
    }
    const matchup = matchupChipEl(a);
    if (matchup) tail.appendChild(matchup);
    row.appendChild(tail);

    row.addEventListener('mouseenter', () => fillDetail(detail, k));
    row.addEventListener('focus',      () => fillDetail(detail, k));
    attachLongPress(row,
      () => openAbilityTooltip(k),
      state.acting ? null : () => playerAct(k));
    list.appendChild(row);
    if (i === 0) initialKey = k;
  });

  // swap row
  const canSwap = state.bf && state.bf.hp > 0 && !state.acting;
  const swap = el('button', { class: 'action-row swap' + (canSwap ? '' : ' disabled') });
  swap.appendChild(el('span', { class: 'action-marker' }, '▸ '));
  swap.appendChild(el('span', { class: 'action-name' },
    state.bf ? `Step back · ${displayName(state.bf.creature)} forward` : 'Step back'));
  const swapTail = el('span', { class: 'action-tail' });
  swapTail.appendChild(el('span', { class: 'action-tag swap' }, 'swap +3'));
  swap.appendChild(swapTail);
  if (canSwap) swap.addEventListener('click', () => playerSwap());
  else swap.disabled = true;
  swap.addEventListener('mouseenter', () => fillSwapDetail(detail));
  swap.addEventListener('focus',      () => fillSwapDetail(detail));
  list.appendChild(swap);

  // inspect row (replaces the cryptic long-press)
  const inspect = el('button', { class: 'action-row inspect' });
  inspect.appendChild(el('span', { class: 'action-marker' }, '▸ '));
  inspect.appendChild(el('span', { class: 'action-name' }, 'Read the file · inspect'));
  const inspectTail = el('span', { class: 'action-tail' });
  inspectTail.appendChild(el('span', { class: 'action-tag' }, 'study'));
  inspect.appendChild(inspectTail);
  inspect.addEventListener('click', () => openInspectModal(state.ef.creature));
  inspect.addEventListener('mouseenter', () => fillInspectDetail(detail));
  inspect.addEventListener('focus',      () => fillInspectDetail(detail));
  list.appendChild(inspect);

  if (initialKey) fillDetail(detail, initialKey);

  split.appendChild(list);
  split.appendChild(el('div', { class: 'action-split-rule' }));
  split.appendChild(detail);
  wrap.appendChild(split);
  return wrap;
}

function fillDetail(node, key) {
  const a = ABILITIES[key];
  if (!a) return;
  node.innerHTML = '';
  if (a.effect) {
    const eff = el('div', { class: 'detail-effect' });
    eff.innerHTML = parseProse(String(a.effect));
    node.appendChild(eff);
  }
  if (a.flavor) {
    const fl = el('div', { class: 'detail-flavor' });
    fl.innerHTML = parseProse(String(a.flavor));
    node.appendChild(fl);
  }
  if (a.phases && a.phases.length > 1) {
    node.appendChild(el('div', { class: 'detail-phase' },
      `${a.phases.length} phases · resolves over consecutive turns.`));
  }
}

function fillSwapDetail(node) {
  node.innerHTML = '';
  if (!state.bf) {
    node.appendChild(el('div', { class: 'detail-effect' }, 'No companion is ready.'));
    return;
  }
  const c = state.bf.creature;
  const eff = el('div', { class: 'detail-effect' });
  eff.innerHTML = parseProse(`Pass the turn. ${displayName(c)} steps forward to take the next blow.`);
  node.appendChild(eff);
  const fl = el('div', { class: 'detail-flavor' });
  fl.innerHTML = parseProse('Priority +3 — the swap goes first. Cursed creatures take Broken damage on the way out.');
  node.appendChild(fl);
}

function fillInspectDetail(node) {
  node.innerHTML = '';
  const eff = el('div', { class: 'detail-effect' });
  eff.innerHTML = parseProse(`Open the patient's file. Read what staff have written.`);
  node.appendChild(eff);
  const fl = el('div', { class: 'detail-flavor' });
  fl.innerHTML = parseProse('Reveals abilities, passives, growths. The page does not become you.');
  node.appendChild(fl);
}

// Element-matchup chip — a clear EFF/RES pill rather than a tiny ±.
function matchupChipEl(a) {
  if (!a.element || !state.ef || !state.ef.creature) return null;
  if (!abilityHasDamage(a)) return null;
  const m = TYPE_CHART[a.element]?.[state.ef.creature.type];
  if (m == null || m === 1) return null;
  const cls = m > 1 ? 'good' : 'bad';
  const text = m > 1 ? 'eff' : 'res';
  return el('span', { class: 'action-row-matchup ' + cls }, text);
}

function queuedActionRow() {
  const q = state.pf.queuedAbility;
  const a = ABILITIES[q.key];
  const total = (a && a.phases ? a.phases.length : 1);
  const isLast = q.phaseIdx === total - 1;
  const split = el('div', { class: 'action-split' });
  const list = el('div', { class: 'action-list' });

  const row = el('button', { class: 'action-row queued is-default' });
  if (state.acting) row.disabled = true;
  row.appendChild(el('span', { class: 'action-marker' }, '▸ '));
  row.appendChild(el('span', { class: 'action-name' },
    isLast ? `Release · ${a ? a.name : '?'}`
           : `Continue · ${a ? a.name : '?'} (${q.phaseIdx + 1}/${total})`));
  attachLongPress(row,
    () => openAbilityTooltip(q.key),
    state.acting ? null : () => playerAct(null));
  list.appendChild(row);

  const detail = el('div', { class: 'action-detail' });
  if (a && a.effect) {
    const eff = el('div', { class: 'detail-effect' });
    eff.innerHTML = parseProse(String(a.effect));
    detail.appendChild(eff);
  }
  if (a && a.flavor) {
    const fl = el('div', { class: 'detail-flavor' });
    fl.innerHTML = parseProse(String(a.flavor));
    detail.appendChild(fl);
  }
  detail.appendChild(el('div', { class: 'detail-phase' },
    `Phase ${q.phaseIdx + 1} of ${total}.`));

  split.appendChild(list);
  split.appendChild(el('div', { class: 'action-split-rule' }));
  split.appendChild(detail);
  return split;
}

// ── helpers ──────────────────────────────────────────────────────────
function sectionLabel(text) { return `─ ${text} ─`; }
function pad2(n) { return String(Math.max(0, n | 0)).padStart(2, '0'); }
function pad3(n) { return String(Math.max(0, n | 0)).padStart(3, '0'); }

function roman(n) {
  const map = [[1000,'m'],[900,'cm'],[500,'d'],[400,'cd'],[100,'c'],[90,'xc'],
               [50,'l'],[40,'xl'],[10,'x'],[9,'ix'],[5,'v'],[4,'iv'],[1,'i']];
  let s = ''; let v = Math.max(1, n | 0);
  for (const [k, sym] of map) { while (v >= k) { s += sym; v -= k; } }
  return s;
}

function composureWord(f) {
  const pct = f.hp / f.creature.maxHp;
  if (pct >= 0.85) return 'composed';
  if (pct >= 0.55) return 'steady';
  if (pct >= 0.30) return 'fraying';
  if (pct >  0.00) return 'unmade';
  return 'still';
}

function abilityFlatEffects(a) { return (a && a.phases ? a.phases : []).flat(); }
function abilityHasDamage(a) { return abilityFlatEffects(a).some(e => e.type === 'damage'); }
function abilityKindTag(a) {
  const flat = abilityFlatEffects(a);
  if (flat.some(e => e.type === 'damage'))         return null;
  if (flat.some(e => e.type === 'heal_over_time')) return 'heal';
  if (flat.some(e => e.type === 'swap'))           return 'swap';
  if (flat.some(e => e.type === 'buff'))           return 'shore';
  if (flat.some(e => e.type === 'apply_status'))   return 'mark';
  if (flat.some(e => e.type === 'cleanse'))        return 'cleanse';
  if (flat.some(e => e.type === 'bracing'))        return 'brace';
  return null;
}
