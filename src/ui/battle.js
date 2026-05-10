// Dossier battle screen — energy + dual-log layout.
//
// Vertical layout:
//   1. engagement strip (depth, round, pace, intent badge)
//   2. dossier grid (player col | divider | enemy col)
//      - each col: bench bar, name+subtitle, glyph+notes, hp+stat bars,
//        afflictions, signature stack, passives
//   3. action bar (energy pips + ability buttons + end turn)
//   4. log panel (gameplay log on left, lore line on right)

import { el, attachLongPress, app } from './dom.js';
import { ABILITIES, PASSIVES, TYPE_CHART, VOICE } from '../data.js';
import { affName as voiceAffName } from '../combat/log.js';
import { state, TOTAL_WAVES } from '../state.js';
import { displayName, getDossierNotes } from '../creature.js';
import { renderGlyph } from './glyphs.js';
import { openInspectModal, openAbilityTooltip } from './cards.js';
import { playerAct, playerSwap, playerEndTurn } from '../combat/battle.js';
import { applyHpFill } from './hpTween.js';
import { parseProse } from './textCorrupt.js';
import { estimateDamage, effectiveStat, abilityCost } from '../combat/damage.js';

const STAT_BAR_MAX = 120;

export function renderBattle() {
  const screen = el('div', { class: 'battle-screen' });
  screen.appendChild(engagementStripEl());

  const grid = el('div', { class: 'dossier-grid' });
  grid.appendChild(dossierColEl(state.pf, state.bf, 'player'));
  grid.appendChild(el('div', { class: 'dossier-divider' }));
  grid.appendChild(dossierColEl(state.ef, state.ebf, 'enemy'));
  screen.appendChild(grid);

  screen.appendChild(actionBarEl());
  screen.appendChild(logPanelEl());

  app().appendChild(screen);
  // Auto-scroll game log to bottom
  const gl = document.querySelector('.gamelog-scroll');
  if (gl) gl.scrollTop = gl.scrollHeight;
}

// ── header ───────────────────────────────────────────────────────────
function engagementStripEl() {
  const strip = el('div', { class: 'engagement-strip' });

  const left = el('div', { class: 'eng-left' }, [
    el('span', {}, '// engagement'),
    el('span', { class: 'eng-sep' }, ' · '),
    el('span', {}, `descent ${pad2(state.wave)}/${pad2(TOTAL_WAVES)}`),
    el('span', { class: 'eng-sep' }, ' · '),
    el('span', {}, `round ${state.round || 0}`),
  ]);
  strip.appendChild(left);

  // Center: enemy intent badge
  const intent = state.enemyIntent;
  const center = el('div', { class: 'eng-center' });
  if (intent) {
    const badge = el('div', { class: 'intent-badge intent-' + intent.kind });
    badge.appendChild(el('span', { class: 'intent-icon' }, intent.icon || '·'));
    badge.appendChild(el('span', { class: 'intent-label' }, intent.label || '?'));
    if (intent.power) badge.appendChild(el('span', { class: 'intent-power' }, '~' + estimateIntentDamage(intent)));
    center.appendChild(el('span', { class: 'intent-prefix' }, 'they plan: '));
    center.appendChild(badge);
  }
  strip.appendChild(center);

  // Right: pace toggle
  const speedLabel = state.combatSpeed === 2 ? 'fast' : 'slow';
  const speedBtn = el('button', { class: 'eng-btn' });
  speedBtn.textContent = `pace · ${speedLabel}`;
  speedBtn.addEventListener('click', () => {
    state.combatSpeed = state.combatSpeed === 2 ? 1 : 2;
    speedBtn.textContent = `pace · ${state.combatSpeed === 2 ? 'fast' : 'slow'}`;
  });
  strip.appendChild(el('div', { class: 'eng-right' }, [speedBtn]));

  return strip;
}

function estimateIntentDamage(intent) {
  if (intent.kind !== 'attack' || !state.ef || !state.pf) return '?';
  // Look up the ability with that intent label
  for (const k of state.ef.creature.abilities) {
    const a = ABILITIES[k];
    if (a && (a.intent === intent.label || a.name === intent.label)) {
      return estimateDamage(state.ef, state.pf, a);
    }
  }
  return '?';
}

// ── dossier column ───────────────────────────────────────────────────
function dossierColEl(active, bench, side) {
  const col = el('div', { class: `dossier-col ${side}` });
  col.appendChild(benchBarEl(bench, side));

  const c = active.creature;
  col.appendChild(el('div', { class: 'doc-title', html: parseProse(displayName(c)) }));
  col.appendChild(subtitleEl(c));
  col.appendChild(fieldNotesEl(c, side, active));
  col.appendChild(hpRowEl(active, side));
  col.appendChild(statBlockEl(active, side));
  col.appendChild(sigStackEl(active, side));
  col.appendChild(afflictionsEl(active));
  col.appendChild(passivesEl(c));

  return col;
}

function benchBarEl(f, side) {
  const wrap = el('div', { class: 'bench-inline ' + side });
  if (!f) {
    wrap.appendChild(el('span', { class: 'bench-empty-inline' },
      side === 'player' ? '— no companion benched —' : '— solitary —'));
    return wrap;
  }
  const c = f.creature;
  const g = el('span', { class: 'bench-glyph-inline' });
  g.innerHTML = renderGlyph(c.species);

  const text = el('span', { class: 'bench-text' });
  text.appendChild(el('span', { class: 'bench-name-inline', html: parseProse(displayName(c)) }));
  text.appendChild(el('span', { class: 'bench-sep' }, ' · '));
  text.appendChild(el('span', { class: 'bench-tag' }, 'benched'));

  const bar = el('span', { class: 'bench-bar-inline' });
  const fill = el('span', { class: 'bench-bar-inline-fill' });
  bar.appendChild(fill);
  applyHpFill(fill, f);

  const hp = el('span', { class: 'bench-hp-inline' });
  hp.appendChild(el('span', { class: 'bench-hp-num' }, `${Math.max(0, f.hp)}/${c.maxHp}`));

  // Status badges on bench
  const statuses = activeAfflictions(f);
  const stat = el('span', { class: 'bench-status-inline' });
  if (statuses.length) {
    stat.textContent = statuses.map(a => a.short).join('·');
  }

  wrap.appendChild(g);
  wrap.appendChild(text);
  wrap.appendChild(bar);
  wrap.appendChild(hp);
  if (statuses.length) wrap.appendChild(stat);
  attachLongPress(wrap, () => openInspectModal(c), null);
  return wrap;
}

function subtitleEl(c) {
  const key = VOICE.subtitles[c.species] || VOICE.subtitles[c.type] || '—';
  const e = el('div', { class: 'doc-subtitle' });
  e.innerHTML = parseProse(key);
  return e;
}

function fieldNotesEl(c, side, fighter) {
  const wrap = el('div', { class: 'field-notes-block' });
  wrap.appendChild(el('div', { class: 'sec-label-doc' }, '─ Patient file ─'));

  const body = el('div', { class: 'field-notes-body ' + side });
  const glyph = el('div', { class: 'glyph-inline glyph-portrait' });
  glyph.innerHTML = renderGlyph(c.species);
  attachLongPress(glyph, () => openInspectModal(c), null);

  const lines = getDossierNotes(c);
  const prose = el('div', { class: 'field-notes-prose' });
  for (const line of lines.slice(0, 3)) {
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
  num.appendChild(el('span', { class: 'hp-cur' }, pad3(cur)));
  num.appendChild(el('span', { class: 'hp-slash' }, '/'));
  num.appendChild(el('span', { class: 'hp-max' }, pad3(max)));

  if (side === 'player') {
    row.appendChild(label); row.appendChild(bar); row.appendChild(num);
  } else {
    row.appendChild(num); row.appendChild(bar); row.appendChild(label);
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

function sigStackEl(f, side) {
  const sig = f.creature.signature;
  if (!sig) return el('div', { style: 'display:none' });
  const max = sig.max ?? 5;
  const stacks = f.sigStacks || 0;
  const wrap = el('div', { class: 'sig-row ' + side });
  wrap.appendChild(el('span', { class: 'sig-label' }, sig.label.toLowerCase()));
  const pips = el('span', { class: 'sig-pips' });
  for (let i = 0; i < max; i++) {
    pips.appendChild(el('span', { class: 'sig-pip ' + (i < stacks ? 'on' : 'off') }, '◆'));
  }
  wrap.appendChild(pips);
  // Marks (lives on defender, separate from sigStacks)
  if (f.marks > 0) {
    const m = el('span', { class: 'sig-marks' });
    m.appendChild(el('span', { class: 'sig-label' }, 'marks'));
    for (let i = 0; i < f.marks; i++) m.appendChild(el('span', { class: 'sig-pip on mark' }, '✕'));
    wrap.appendChild(m);
  }
  return wrap;
}

function afflictionsEl(f) {
  const wrap = el('div', { class: 'afflictions-block' });
  wrap.appendChild(el('div', { class: 'sec-label-doc' }, '─ Afflictions ─'));
  const items = activeAfflictions(f);
  const inner = el('div', { class: 'afflictions-list' });
  if (items.length === 0) {
    inner.appendChild(el('span', { class: 'aff-empty' }, '— none observed —'));
  } else {
    items.forEach((a, i) => {
      if (i > 0) inner.appendChild(el('span', { class: 'aff-sep' }, ' · '));
      inner.appendChild(el('span', { class: 'aff-blot' }, '●'));
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
  if (s.burn)    out.push({ label: 'Fevering', short: 'F', suffix: `${s.burn.turns}r` });
  if (s.bloom)   out.push({ label: 'Mending',  short: 'M', suffix: `${s.bloom.turns}r` });
  if (s.soaking) out.push({ label: 'Drained',  short: 'D', suffix: `${s.soaking.turns}r` });
  if (s.cursed)  out.push({ label: 'Broken',   short: 'B', suffix: `${s.cursed.turns}r` });
  if (s.dazed)   out.push({ label: 'Sedated',  short: 'S', suffix: `${s.dazed.turns}r` });
  if (f.healing && f.healing.turnsLeft > 0) {
    out.push({ label: 'regen', short: 'R', suffix: `${f.healing.turnsLeft}r` });
  }
  return out;
}

function passivesEl(c) {
  const wrap = el('div', { class: 'passives-block' });
  wrap.appendChild(el('div', { class: 'sec-label-doc' }, '─ Passives ─'));
  const list = (c.passives && c.passives.length) ? c.passives : [];
  if (list.length === 0) {
    wrap.appendChild(el('div', { class: 'passive-empty' }, '— none observed —'));
    return wrap;
  }
  for (const k of list) {
    const p = PASSIVES[k];
    const row = el('div', { class: 'passive-line-doc' });
    const top = el('div', { class: 'passive-prose' });
    top.appendChild(el('span', { class: 'passive-bullet' }, '•'));
    top.appendChild(el('span', { class: 'passive-name-doc' }, ` ${p ? p.name : k}`));
    top.appendChild(el('span', { class: 'passive-sep' }, ' · '));
    const desc = el('span', { class: 'passive-desc-doc' });
    desc.textContent = (p && p.desc) || '—';
    top.appendChild(desc);
    row.appendChild(top);
    wrap.appendChild(row);
  }
  return wrap;
}

// ── action bar (energy + abilities + end turn) ───────────────────────
function actionBarEl() {
  const bar = el('div', { class: 'action-bar' });
  const isYour = state.turnPhase === 'player' && !state.acting;
  bar.appendChild(actionHeaderEl(isYour));

  if (state.turnPhase === 'enemy') {
    bar.appendChild(el('div', { class: 'action-wait' }, '— they act —'));
    return bar;
  }
  if (state.turnPhase === 'done') {
    bar.appendChild(el('div', { class: 'action-wait' }, '— battle ended —'));
    return bar;
  }
  if (state.turnPhase === 'tick') {
    bar.appendChild(el('div', { class: 'action-wait' }, '— round opens —'));
    return bar;
  }
  if (state.turnPhase !== 'player') {
    bar.appendChild(el('div', { class: 'action-wait' }, '— ... —'));
    return bar;
  }
  if (state.acting) {
    bar.appendChild(el('div', { class: 'action-wait' }, '— resolving —'));
    return bar;
  }

  // Ability grid
  const grid = el('div', { class: 'ability-grid' });
  for (const k of state.pf.creature.abilities) {
    const a = ABILITIES[k];
    if (!a) continue;
    const cost = abilityCost(a, state.pf);
    const affordable = cost <= state.pf.energy;
    const btn = el('button', {
      class: 'ability-card ' + (affordable ? '' : 'unafford'),
      title: a.effect || '',
    });
    if (!affordable) btn.disabled = true;
    btn.appendChild(abilityCardContent(a, cost));
    btn.addEventListener('click', () => playerAct(k));
    attachLongPress(btn, () => openAbilityTooltip(k), affordable ? () => playerAct(k) : null);
    grid.appendChild(btn);
  }
  bar.appendChild(grid);

  // Action options row: Swap, Inspect, End Turn
  const row = el('div', { class: 'action-options' });
  const canSwap = state.bf && state.bf.hp > 0 && state.pf.energy >= 1;
  const swapBtn = el('button', { class: 'opt-btn ' + (canSwap ? '' : 'unafford') });
  if (!canSwap) swapBtn.disabled = true;
  swapBtn.appendChild(el('span', { class: 'opt-icon' }, '↔'));
  swapBtn.appendChild(el('span', {}, ` Swap · ${state.bf ? displayName(state.bf.creature) : '—'}`));
  swapBtn.appendChild(el('span', { class: 'opt-cost' }, ' 1E'));
  swapBtn.addEventListener('click', () => playerSwap());
  row.appendChild(swapBtn);

  const inspectBtn = el('button', { class: 'opt-btn' });
  inspectBtn.appendChild(el('span', { class: 'opt-icon' }, '◇'));
  inspectBtn.appendChild(el('span', {}, ' Read enemy file'));
  inspectBtn.addEventListener('click', () => openInspectModal(state.ef.creature));
  row.appendChild(inspectBtn);

  const endBtn = el('button', { class: 'opt-btn end-turn' });
  endBtn.appendChild(el('span', { class: 'opt-icon' }, '▶'));
  endBtn.appendChild(el('span', {}, ' End turn'));
  endBtn.addEventListener('click', () => playerEndTurn());
  row.appendChild(endBtn);
  bar.appendChild(row);

  return bar;
}

function actionHeaderEl(isYour) {
  const head = el('div', { class: 'action-header' });
  head.appendChild(el('span', { class: 'action-prompt' }, isYour ? '▸ your turn — ' : '— '));

  // Energy display
  const energy = state.pf.energy ?? 0;
  const max = state.pf.maxEnergy ?? 3;
  const pips = el('span', { class: 'energy-pips' });
  for (let i = 0; i < max; i++) {
    pips.appendChild(el('span', { class: 'energy-pip ' + (i < energy ? 'on' : 'off') }, '◆'));
  }
  head.appendChild(pips);
  head.appendChild(el('span', { class: 'energy-num' }, ` ${energy}/${max} energy`));
  // Combo display
  const acts = state.pf.actionsThisTurn || 0;
  if (acts > 0) {
    const combo = Math.min(50, Math.round(18 * acts));
    head.appendChild(el('span', { class: 'combo-tag' }, ` · combo +${combo}%`));
  }
  return head;
}

function abilityCardContent(a, cost) {
  const wrap = el('div', { class: 'ability-card-inner' });
  // Top row: name + cost
  const top = el('div', { class: 'ability-card-top' });
  top.appendChild(el('span', { class: 'ability-card-name' }, a.name || ''));
  const costEl = el('span', { class: 'ability-card-cost' });
  for (let i = 0; i < (cost || 0); i++) costEl.appendChild(el('span', { class: 'cost-pip' }, '◆'));
  top.appendChild(costEl);
  wrap.appendChild(top);

  // Tags row: damage estimate, element, type matchup
  const tags = el('div', { class: 'ability-card-tags' });
  const dmg = estimateDamage(state.pf, state.ef, a);
  if (dmg > 0) tags.appendChild(el('span', { class: 'tag dmg' }, `~${dmg}`));
  const kind = abilityKind(a);
  if (!dmg && kind) tags.appendChild(el('span', { class: 'tag kind' }, kind));
  if (a.element) tags.appendChild(el('span', { class: 'tag elem ' + a.element }, a.element));
  const matchup = matchupChipFor(a);
  if (matchup) tags.appendChild(matchup);
  wrap.appendChild(tags);

  // Effect description (one-liner)
  if (a.effect) {
    const desc = el('div', { class: 'ability-card-desc' }, a.effect);
    wrap.appendChild(desc);
  }
  return wrap;
}

function abilityKind(a) {
  if (!a) return null;
  const flat = (a.phases || []).flat();
  if (flat.some(e => e.type === 'damage')) return null;
  if (flat.some(e => e.type === 'heal_self_pct' || e.type === 'heal_over_time')) return 'heal';
  if (flat.some(e => e.type === 'apply_status')) return 'status';
  if (flat.some(e => e.type === 'buff')) return 'buff';
  if (flat.some(e => e.type === 'swap')) return 'swap';
  if (flat.some(e => e.type === 'cleanse')) return 'cleanse';
  if (flat.some(e => e.type === 'bracing')) return 'brace';
  return null;
}

function matchupChipFor(a) {
  if (!a.element || !state.ef || !state.ef.creature) return null;
  const flat = (a.phases || []).flat();
  if (!flat.some(e => e.type === 'damage')) return null;
  const m = TYPE_CHART[a.element]?.[state.ef.creature.type];
  if (m == null || m === 1) return null;
  const cls = m > 1 ? 'good' : 'bad';
  const text = m > 1 ? 'eff' : 'res';
  return el('span', { class: 'tag matchup ' + cls }, text);
}

// Module-level: track which lore IDs we've already typed out, so we don't
// retrigger the typewriter on every render() while a battle is unfolding.
const _typedLoreIds = new Set();

// ── log panel (dual stream) ──────────────────────────────────────────
function logPanelEl() {
  const wrap = el('div', { class: 'log-panel' });

  // Left: gameplay log (scrollable, persistent)
  const game = el('div', { class: 'gamelog-block' });
  game.appendChild(el('div', { class: 'log-header' }, '— battle log —'));
  const scroll = el('div', { class: 'gamelog-scroll' });
  for (const entry of state.gameLog) {
    const line = el('div', { class: 'gamelog-line ' + (entry.cls || '') + (entry.actor ? ' ' + entry.actor : '') });
    if (entry.actor) {
      line.appendChild(el('span', { class: 'gl-arrow' }, entry.actor === 'player' ? '▸ ' : '◂ '));
    }
    line.appendChild(el('span', { class: 'gl-text' }, entry.text));
    if (entry.damage > 0) line.appendChild(el('span', { class: 'gl-dmg' }, ` -${entry.damage}`));
    if (entry.heal > 0)   line.appendChild(el('span', { class: 'gl-heal' }, ` +${entry.heal}`));
    scroll.appendChild(line);
  }
  game.appendChild(scroll);
  wrap.appendChild(game);

  // Right: lore line (typewriter, atmospheric)
  const lore = el('div', { class: 'lore-block' });
  lore.appendChild(el('div', { class: 'log-header' }, '— what they wrote down —'));
  const loreInner = el('div', { class: 'lore-inner' });
  if (state.loreLine && state.loreLine.text) {
    const line = el('div', { class: 'lore-line ' + (state.loreLine.cls || '') });
    line.innerHTML = parseProse(state.loreLine.text);
    // Tag the line with its id so CSS can fade-in newly-arrived lore lines.
    if (!_typedLoreIds.has(state.loreLine.id)) {
      _typedLoreIds.add(state.loreLine.id);
      line.classList.add('lore-fade-in');
    }
    loreInner.appendChild(line);
  } else {
    loreInner.appendChild(el('div', { class: 'lore-line dim' }, '·'));
  }
  lore.appendChild(loreInner);
  wrap.appendChild(lore);

  return wrap;
}

function typewriterizeHTML(html, msPerChar, id) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  let charIdx = 0;
  function walk(node) {
    if (node.nodeType === 3) {
      const text = node.textContent;
      const frag = document.createDocumentFragment();
      for (const ch of text) {
        const span = document.createElement('span');
        span.className = 'tw-char tw-id-' + id;
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

// ── helpers ──────────────────────────────────────────────────────────
function pad2(n) { return String(Math.max(0, n | 0)).padStart(2, '0'); }
function pad3(n) { return String(Math.max(0, n | 0)).padStart(3, '0'); }
