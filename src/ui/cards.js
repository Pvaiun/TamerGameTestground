// Doc-card: a single creature rendered as a paragraph in the dossier document.

import { el, attachLongPress } from './dom.js';
import { PASSIVES, ABILITIES, VOICE, TYPE_LABELS } from '../data.js';

const typeLabel = (t) => (TYPE_LABELS && TYPE_LABELS[t]) || t;
import { displayName, growthRank, rankColor, xpToNext, getDossierNotes } from '../creature.js';
import { renderGlyph } from './glyphs.js';
import { parseProse } from './textCorrupt.js';

export function portraitEl(creature, sizePx) {
  const wrap = el('div', { class: 'doc-card-glyph', style: sizePx ? `width:${sizePx}px;height:${sizePx}px;` : '' });
  wrap.innerHTML = renderGlyph(creature.species);
  return wrap;
}

export function creatureCardEl(c, options = {}) {
  const isSelectable = !!options.selectable;
  let cls = 'doc-card';
  if (isSelectable)        cls += ' selectable';
  if (options.selected)    cls += ' selected';
  if (options.dimmed)      cls += ' dimmed';
  if (!options.noInspect)  cls += ' inspectable';
  const card = el('div', { class: cls });

  // Selection click goes on the card; inspection has its own affordance (info button + right-click).
  if (isSelectable && options.onclick) {
    card.addEventListener('click', (e) => {
      // Don't fire if click was on inspect button.
      if (e.target.closest && e.target.closest('.doc-card-inspect')) return;
      options.onclick(e);
    });
  }
  if (!options.noInspect) {
    attachLongPress(card, () => openInspectModal(c), null);
  }

  card.appendChild(el('span', { class: 'doc-card-marker' }, '▸ '));
  card.appendChild(portraitEl(c));

  const body = el('div', { class: 'doc-card-body' });
  const head = el('div', { class: 'doc-card-head' });
  head.appendChild(el('span', { class: 'doc-card-name', html: parseProse(displayName(c)) }));
  head.appendChild(el('span', { class: 'doc-card-meta' },
    `${typeLabel(c.type)} · l${c.level} · #${pad4(c.id)}`));

  if (!options.noInspect) {
    const insp = el('button', {
      class: 'doc-button small doc-card-inspect',
      onclick: (e) => { e.stopPropagation(); openInspectModal(c); },
    }, '▸ inspect');
    head.appendChild(insp);
  }
  body.appendChild(head);

  const subtitle = VOICE.subtitles[c.species] || VOICE.subtitles[c.type];
  if (subtitle) {
    const sub = el('div', { class: 'doc-card-subtitle' });
    sub.innerHTML = parseProse(subtitle);
    body.appendChild(sub);
  }

  const stats = el('div', { class: 'doc-card-stats' });
  const ranks = options.showGrowths ? c.growth : null;
  for (const k of ['hp', 'atk', 'def', 'spd']) {
    const cell = el('span', { class: 'stat-mini-cell' });
    cell.appendChild(el('span', { class: 'stat-mini-label' }, k));
    cell.appendChild(el('span', { class: 'stat-mini-num' }, pad2(c.stats[k])));
    if (ranks) {
      const r = growthRank(ranks[k]);
      cell.appendChild(el('span', {
        class: 'stat-mini-rank rank-' + r,
        style: `color:${rankColor(r)};border-color:${rankColor(r)};`,
      }, r));
    }
    stats.appendChild(cell);
  }
  body.appendChild(stats);

  body.appendChild(el('div', { class: 'doc-card-xp' },
    `xp ${c.xp}/${xpToNext(c.level)}`));

  if (c.passives && c.passives.length) {
    for (const k of c.passives) {
      const p = PASSIVES[k];
      const voice = VOICE.passives[k];
      const mech = (p && p.desc) ? p.desc : '';
      const prose = mech || voice || '—';
      const row = el('div', { class: 'doc-card-passive' });
      row.appendChild(el('span', { class: 'passive-bullet' }, '•'));
      row.appendChild(el('span', { class: 'passive-name-doc' }, ` ${p ? p.name : k}`));
      row.appendChild(el('span', { class: 'passive-sep' }, ' · '));
      const desc = el('span', { class: 'passive-desc-doc' });
      desc.innerHTML = parseProse(prose);
      row.appendChild(desc);
      body.appendChild(row);
    }
  }

  // Ability pills (compact)
  if (c.abilities && c.abilities.length) {
    const ab = el('div', { class: 'doc-card-abilities' });
    for (const k of c.abilities) {
      const a = ABILITIES[k];
      if (!a) continue;
      const cls = 'doc-card-ability' + (a.element ? ' elem-' + a.element : '');
      ab.appendChild(el('span', { class: cls, title: a.effect || '' }, a.name));
    }
    body.appendChild(ab);
  }

  card.appendChild(body);
  return card;
}

// ── inspect modal ────────────────────────────────────────────────────
export function openInspectModal(c) {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
  const bg = el('div', { class: 'modal-bg', onclick: (e) => { if (e.target === bg) root.innerHTML = ''; } });
  const m = el('div', { class: 'modal doc-modal' });

  m.appendChild(el('div', { class: 'doc-modal-tag' }, '// subject · field record'));

  const head = el('div', { class: 'doc-modal-head' });
  const port = el('div', { class: 'doc-modal-glyph' });
  port.innerHTML = renderGlyph(c.species);
  head.appendChild(port);
  const headInfo = el('div', { class: 'doc-modal-headinfo' });
  headInfo.appendChild(el('div', { class: 'doc-modal-name', html: parseProse(displayName(c)) }));
  const subtitle = VOICE.subtitles[c.species] || VOICE.subtitles[c.type];
  if (subtitle) {
    const sub = el('div', { class: 'doc-modal-subtitle' });
    sub.innerHTML = parseProse(subtitle);
    headInfo.appendChild(sub);
  }
  headInfo.appendChild(el('div', { class: 'doc-modal-meta' },
    `${typeLabel(c.type)} · level ${c.level} · #${pad4(c.id)}`));
  head.appendChild(headInfo);
  m.appendChild(head);

  const noteLines = getDossierNotes(c);
  if (noteLines && noteLines.length) {
    m.appendChild(el('div', { class: 'sec-label-doc' }, '─ patient file ─'));
    const prose = el('div', { class: 'doc-modal-notes' });
    for (const line of noteLines) {
      const lineEl = el('div', { class: 'fn-line' });
      lineEl.innerHTML = parseProse(line);
      prose.appendChild(lineEl);
    }
    m.appendChild(prose);
  }

  m.appendChild(el('div', { class: 'sec-label-doc' }, '─ capability ─'));
  const sg = el('div', { class: 'doc-modal-stats' });
  for (const [label, val, growth] of [
    ['hp', c.stats.hp, c.growth.hp],
    ['atk', c.stats.atk, c.growth.atk],
    ['def', c.stats.def, c.growth.def],
    ['spd', c.stats.spd, c.growth.spd],
  ]) {
    const rank = growthRank(growth);
    const row = el('div', { class: 'doc-modal-stat-row' });
    row.appendChild(el('span', { class: 'stat-mini-label' }, label));
    row.appendChild(el('span', { class: 'stat-mini-num' }, pad2(val)));
    row.appendChild(el('span', {
      class: 'stat-mini-rank rank-' + rank,
      style: `color:${rankColor(rank)};border-color:${rankColor(rank)};`,
    }, `${rank} growth`));
    sg.appendChild(row);
  }
  m.appendChild(sg);

  m.appendChild(el('div', { class: 'sec-label-doc' }, '─ passives ─'));
  if (c.passives && c.passives.length) {
    for (const k of c.passives) {
      const p = PASSIVES[k];
      const voice = VOICE.passives[k];
      const mech = (p && p.desc) ? p.desc : '';
      const showMech = !!voice && !!mech;
      const row = el('div', { class: 'doc-modal-row passive-line-doc' });
      const top = el('div', { class: 'passive-prose' });
      top.appendChild(el('span', { class: 'passive-bullet' }, '• '));
      top.appendChild(el('span', { class: 'passive-name-doc' }, p ? p.name : k));
      top.appendChild(el('span', { class: 'passive-sep' }, ' · '));
      const desc = el('span', { class: 'passive-desc-doc' });
      desc.innerHTML = parseProse(showMech ? voice : (mech || '—'));
      top.appendChild(desc);
      row.appendChild(top);
      if (showMech) row.appendChild(el('div', { class: 'passive-mech' }, mech));
      m.appendChild(row);
    }
  } else {
    m.appendChild(el('div', { class: 'doc-modal-row' }, '— none observed —'));
  }

  m.appendChild(el('div', { class: 'sec-label-doc' }, '─ cataloged actions ─'));
  for (const k of c.abilities) {
    const a = ABILITIES[k];
    const row = el('div', { class: 'doc-modal-row ability-doc-row' });
    const top = el('div', { class: 'ability-doc-top' });
    top.appendChild(el('span', { class: 'ability-name-doc' }, a ? a.name : k));
    if (a) {
      const tail = el('span', { class: 'ability-doc-tail' });
      const flat = (a.phases || []).flat();
      const dmg = flat.find(e => e.type === 'damage');
      if (a.element) tail.appendChild(el('span', { class: 'ability-elem' }, a.element));
      if (dmg) {
        if (a.element) tail.appendChild(el('span', {}, ' · '));
        tail.appendChild(el('span', { class: 'pow-num' }, (dmg.hits || 1) > 1 ? `pow ${dmg.power}×${dmg.hits}` : `pow ${dmg.power}`));
      }
      tail.appendChild(el('span', {}, ` · ${a.cost ?? 2}E`));
      top.appendChild(tail);
    }
    row.appendChild(top);
    if (a && a.effect) {
      const eff = el('div', { class: 'ability-doc-desc' });
      eff.innerHTML = parseProse(String(a.effect));
      row.appendChild(eff);
    }
    if (a && a.flavor) {
      const fl = el('div', { class: 'ability-doc-flavor' });
      fl.innerHTML = parseProse(String(a.flavor));
      row.appendChild(fl);
    }
    m.appendChild(row);
  }

  m.appendChild(el('button', { class: 'doc-button doc-modal-close', onclick: () => { root.innerHTML = ''; } }, '▸ close'));

  bg.appendChild(m);
  root.appendChild(bg);
}

// ── ability tooltip modal ────────────────────────────────────────────
export function openAbilityTooltip(abilityKey) {
  const a = ABILITIES[abilityKey];
  if (!a) return;
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
  const bg = el('div', { class: 'modal-bg', onclick: (e) => { if (e.target === bg) root.innerHTML = ''; } });
  const m = el('div', { class: 'modal doc-modal narrow' });

  m.appendChild(el('div', { class: 'doc-modal-tag' }, '// action · catalog entry'));
  m.appendChild(el('div', { class: 'doc-modal-name' }, a.name));

  const flat = (a.phases || []).flat();
  const meta = el('div', { class: 'doc-modal-meta-grid' });
  metaRow(meta, 'cost', `${a.cost ?? 2}E`);
  if (a.element) metaRow(meta, 'element', a.element);
  if (a.tags && a.tags.length) metaRow(meta, 'tags', a.tags.join(', '));
  const dmg = flat.filter(e => e.type === 'damage');
  if (dmg.length === 1) {
    const d = dmg[0];
    metaRow(meta, 'power', (d.hits || 1) > 1 ? `${d.power} × ${d.hits}` : String(d.power));
  } else if (dmg.length > 1) {
    metaRow(meta, 'power', dmg.map(d => `${d.power}${(d.hits||1) > 1 ? '×' + (d.hits||1) : ''}`).join(' + '));
  }
  for (const eff of flat) {
    if (eff.type === 'buff' && eff.statMult) {
      const parts = Object.entries(eff.statMult).filter(([, v]) => v).map(([k, v]) => `${k} ${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`);
      if (parts.length) metaRow(meta, 'stat mod', parts.join(' '));
    } else if (eff.type === 'heal_self_pct') {
      metaRow(meta, 'heal', Math.round((eff.percent ?? 0.25) * 100) + '% max hp');
    } else if (eff.type === 'gain_charge') {
      metaRow(meta, 'charge', '+' + (eff.amount ?? 1));
    } else if (eff.type === 'spend_charge') {
      metaRow(meta, 'spend', `+${Math.round((eff.perStack ?? 0.5) * 100)}% per Charge`);
    }
  }
  m.appendChild(meta);
  if (a.effect) {
    const desc = el('div', { class: 'doc-modal-desc' });
    desc.innerHTML = parseProse(String(a.effect));
    m.appendChild(desc);
  }
  if (a.flavor) {
    const fl = el('div', { class: 'doc-modal-flavor' });
    fl.innerHTML = parseProse(String(a.flavor));
    m.appendChild(fl);
  }

  m.appendChild(el('button', { class: 'doc-button doc-modal-close', onclick: () => { root.innerHTML = ''; } }, '▸ close'));

  bg.appendChild(m);
  root.appendChild(bg);
}

function metaRow(parent, label, val) {
  const r = el('div', { class: 'meta-grid-row' });
  r.appendChild(el('span', { class: 'meta-grid-label' }, label));
  r.appendChild(el('span', { class: 'meta-grid-val' }, String(val)));
  parent.appendChild(r);
}

function pad2(n) { return String(Math.max(0, n | 0)).padStart(2, '0'); }
function pad4(n) { return String(Math.max(0, n | 0)).padStart(4, '0'); }
