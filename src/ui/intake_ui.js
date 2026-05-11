// The intake screen. Two columns:
//   left — the patient: glyph, name, file fragments, current intent.
//   right — the protagonist: composure, insight, pages, current scars (compact).
// Below — your kit (the cards you can play). End-turn / Diagnose at the bottom.
// A scrollable log strip sits along the right edge.

import { el, app, attachLongPress } from './dom.js';
import { state } from '../state.js';
import { APPROACHES, INTENTS, CATEGORIES, SCARS } from '../data.js';
import { playApproach, endTurnNow, effectiveScarCostMod } from '../intake.js';
import { effectiveCost, canPlay } from '../approaches.js';
import { renderGlyph } from './glyphs.js';
import { parseProse } from './textCorrupt.js';
import { render } from './render.js';

export function renderIntake() {
  if (!state.intake) return;
  const screen = el('div', { class: 'intake-screen' });
  screen.appendChild(intakeHeader());
  const grid = el('div', { class: 'intake-grid' });
  grid.appendChild(patientColumn());
  grid.appendChild(playerColumn());
  screen.appendChild(grid);
  screen.appendChild(intentBanner());
  screen.appendChild(kitPanel());
  screen.appendChild(actionRow());
  screen.appendChild(logPanel());
  app().appendChild(screen);

  const ls = document.querySelector('.intake-log-scroll');
  if (ls) ls.scrollTop = ls.scrollHeight;
}

// ── header ──────────────────────────────────────────────────────────
function intakeHeader() {
  const t = state.intake;
  const head = el('div', { class: 'intake-header' });
  head.appendChild(el('span', {}, '// intake'));
  head.appendChild(sep());
  head.appendChild(el('span', {}, `descent ${pad2(state.wave)}`));
  head.appendChild(sep());
  head.appendChild(el('span', {}, `turn ${t.turn}/${maxTurns()}`));
  head.appendChild(sep());
  head.appendChild(el('span', {}, `scars ${state.scars.length}/3`));
  return head;
}

function maxTurns() {
  return 9;
}

// ── patient column ──────────────────────────────────────────────────
function patientColumn() {
  const p = state.intake.patient;
  const col = el('div', { class: 'intake-col patient' });
  const titleRow = el('div', { class: 'pt-title-row' });
  titleRow.appendChild(el('div', { class: 'pt-title', html: parseProse(p.name) }));
  if (p.categoryRevealed) {
    titleRow.appendChild(el('div', { class: 'pt-ward ward-' + p.category }, CATEGORIES[p.category]?.name || ''));
  } else {
    titleRow.appendChild(el('div', { class: 'pt-ward ward-unknown' }, 'ward — undecided'));
  }
  col.appendChild(titleRow);

  const sub = el('div', { class: 'pt-sub' });
  sub.innerHTML = parseProse(p.subtitle || '');
  col.appendChild(sub);

  const glyphRow = el('div', { class: 'pt-glyph-row' });
  const glyph = el('div', { class: 'pt-glyph' });
  glyph.innerHTML = renderGlyph(p.species);
  glyphRow.appendChild(glyph);
  col.appendChild(glyphRow);

  col.appendChild(el('div', { class: 'sec-label-doc' }, '─ Patient file ─'));
  const fileEl = el('div', { class: 'pt-file' });
  for (let i = 0; i < p.fragments.length; i++) {
    const line = el('div', { class: 'pt-file-line' + (i >= p.revealedFragments ? ' redacted' : '') });
    if (i < p.revealedFragments) {
      line.innerHTML = parseProse(p.fragments[i]);
    } else {
      line.innerHTML = `<span class="redact" style="width:${Math.max(12, Math.min(36, p.fragments[i].length / 3))}ch"> </span>`;
    }
    fileEl.appendChild(line);
  }
  col.appendChild(fileEl);

  // Patient state strip (sedated, restrained, bleeding, etc.)
  const tags = [];
  if (p.sedatedTurns > 0) tags.push(`Sedated · ${p.sedatedTurns}r`);
  if (p.restrainedTurns > 0) tags.push(`Restrained · ${p.restrainedTurns}r`);
  if (state.intake._patientBleeding > 0) tags.push(`Bleeding`);
  if (tags.length) {
    const t = el('div', { class: 'pt-tags' }, tags.join(' · '));
    col.appendChild(t);
  }
  return col;
}

// ── player column ───────────────────────────────────────────────────
function playerColumn() {
  const player = state.intake.player;
  const col = el('div', { class: 'intake-col me' });
  col.appendChild(el('div', { class: 'me-title' }, '— me, across the desk —'));

  // Composure bar
  col.appendChild(barRow('composure', state.composure, state.composureMax, 'comp'));
  // Insight bar
  col.appendChild(barRow('insight', player.insight, player.insightMax, 'ins'));
  // Pages pips
  col.appendChild(pagesRow(player.pages, player.pagesMax));

  if (state.scars.length) {
    col.appendChild(el('div', { class: 'sec-label-doc me-scars-lab' }, '─ Scars on me ─'));
    for (const sk of state.scars) {
      const s = SCARS[sk];
      if (!s) continue;
      const r = el('div', { class: 'me-scar-line' });
      r.appendChild(el('span', { class: 'me-scar-marker' }, '✕ '));
      r.appendChild(el('span', { class: 'me-scar-name' }, s.name));
      if (player.cleansedScars && player.cleansedScars.has(sk)) {
        r.appendChild(el('span', { class: 'me-scar-suspended' }, ' · suspended'));
      }
      col.appendChild(r);
    }
  }

  return col;
}

function barRow(label, cur, max, cls) {
  const row = el('div', { class: 'bar-row ' + cls });
  row.appendChild(el('span', { class: 'bar-label' }, label));
  const bar = el('span', { class: 'bar' });
  const pct = Math.max(0, Math.min(100, (cur / max) * 100));
  bar.appendChild(el('span', { class: 'bar-fill ' + cls, style: `width:${pct}%` }));
  row.appendChild(bar);
  row.appendChild(el('span', { class: 'bar-num' }, `${cur}/${max}`));
  return row;
}

function pagesRow(cur, max) {
  const row = el('div', { class: 'pages-row' });
  row.appendChild(el('span', { class: 'bar-label' }, 'pages'));
  const pips = el('span', { class: 'page-pips' });
  for (let i = 0; i < max; i++) {
    pips.appendChild(el('span', { class: 'page-pip ' + (i < cur ? 'on' : 'off') }, '◆'));
  }
  row.appendChild(pips);
  return row;
}

// ── intent banner (what the patient plans this turn) ────────────────
function intentBanner() {
  const p = state.intake.patient;
  const banner = el('div', { class: 'intent-banner' });
  if (p.sedatedTurns > 0) {
    banner.appendChild(el('span', { class: 'ib-prefix' }, 'they will: '));
    banner.appendChild(el('span', { class: 'ib-name' }, 'be still'));
    banner.appendChild(el('span', { class: 'ib-sep' }, ' · '));
    banner.appendChild(el('span', { class: 'ib-meta' }, 'sedated'));
    return banner;
  }
  const intent = INTENTS[p.nextIntent];
  if (!intent || p.nextIntentHidden) {
    banner.appendChild(el('span', { class: 'ib-prefix' }, 'they will: '));
    banner.appendChild(el('span', { class: 'ib-name redacted' }, '— hidden —'));
    return banner;
  }
  banner.appendChild(el('span', { class: 'ib-prefix' }, 'they will: '));
  banner.appendChild(el('span', { class: 'ib-icon' }, intent.icon || '·'));
  banner.appendChild(el('span', { class: 'ib-name' }, intent.name));
  banner.appendChild(el('span', { class: 'ib-sep' }, ' · '));
  const classLabel = el('span', { class: 'ib-class ' + (intent.class || '') }, intent.class || '');
  banner.appendChild(classLabel);
  if (intent.damage > 0) {
    banner.appendChild(el('span', { class: 'ib-sep' }, ' · '));
    banner.appendChild(el('span', { class: 'ib-dmg' }, `-${intent.damage} composure`));
  }
  // hints — "use X to handle"
  const useHints = (intent.counteredBy || []).filter(k => state.deck.includes(k)).slice(0, 3);
  if (useHints.length) {
    banner.appendChild(el('span', { class: 'ib-sep' }, ' · '));
    banner.appendChild(el('span', { class: 'ib-hint' }, `handle with ${useHints.map(k => APPROACHES[k]?.name || k).join(' / ')}`));
  }
  return banner;
}

// ── kit (cards) ─────────────────────────────────────────────────────
function kitPanel() {
  const wrap = el('div', { class: 'kit-panel' });
  wrap.appendChild(el('div', { class: 'sec-label-doc kit-lab' }, '─ My methods ─'));
  const grid = el('div', { class: 'kit-grid' });
  const deck = state.deck.slice().sort((a, b) => {
    const ka = APPROACHES[a]; const kb = APPROACHES[b];
    if (!ka || !kb) return 0;
    return (ka.cost ?? 99) - (kb.cost ?? 99);
  });
  // Name card pinned right when available
  const nameCard = state.intake.player.insight >= state.intake.player.insightMax;
  if (nameCard && !deck.includes('name_them')) deck.push('name_them');
  for (const k of deck) {
    const a = APPROACHES[k];
    if (!a) continue;
    grid.appendChild(cardBtn(a));
  }
  wrap.appendChild(grid);
  return wrap;
}

function cardBtn(a) {
  const cost = effectiveCost(a);
  const playable = canPlay(a, state.intake);
  const btn = el('button', {
    class: 'kit-card ' + (playable ? '' : 'unafford') + (a.category ? ' has-cat cat-' + a.category : '') + (a.key === 'name_them' ? ' name-card' : ''),
    title: a.desc || '',
  });
  if (!playable) btn.disabled = true;
  const top = el('div', { class: 'kit-card-top' });
  top.appendChild(el('span', { class: 'kit-card-name' }, a.name || ''));
  const c = el('span', { class: 'kit-card-cost' });
  if (cost === 0) c.textContent = 'free';
  else for (let i = 0; i < cost; i++) c.appendChild(el('span', { class: 'cost-pip' }, '◆'));
  top.appendChild(c);
  btn.appendChild(top);

  // Category tag
  if (a.category) {
    const tag = el('div', { class: 'kit-card-cat' }, a.category);
    btn.appendChild(tag);
  }

  // desc
  if (a.desc) {
    const desc = el('div', { class: 'kit-card-desc' });
    desc.innerHTML = parseProse(a.desc);
    btn.appendChild(desc);
  }

  btn.addEventListener('click', () => {
    if (a.kind === 'diagnose') {
      openDiagnosePicker();
      return;
    }
    if (playApproach(a.key)) render();
  });
  return btn;
}

// ── action row (end turn, etc.) ─────────────────────────────────────
function actionRow() {
  const row = el('div', { class: 'intake-actions' });
  const endBtn = el('button', { class: 'doc-button end-intake-btn' });
  endBtn.appendChild(el('span', { class: 'doc-button-marker' }, '▶ '));
  endBtn.appendChild(el('span', {}, ' End turn — let them act'));
  endBtn.addEventListener('click', () => {
    endTurnNow();
    render();
  });
  row.appendChild(endBtn);
  return row;
}

function openDiagnosePicker() {
  const root = document.getElementById('modal-root');
  if (!root) return;
  const bg = el('div', { class: 'modal-bg' });
  bg.addEventListener('click', (e) => { if (e.target === bg) bg.remove(); });
  const modal = el('div', { class: 'diagnose-modal' });
  modal.appendChild(el('div', { class: 'diag-title' }, 'I write the ward across the page.'));
  modal.appendChild(el('div', { class: 'diag-sub' }, 'Choose. Right → +3 Insight. Wrong → -4 Composure.'));
  const grid = el('div', { class: 'diag-grid' });
  for (const [k, c] of Object.entries(CATEGORIES)) {
    const opt = el('button', { class: 'diag-opt' }, [
      el('div', { class: 'diag-name' }, c.name),
      el('div', { class: 'diag-label' }, c.label || ''),
    ]);
    opt.addEventListener('click', () => {
      state.intake._diagnoseChoice = k;
      bg.remove();
      playApproach('diagnose');
      render();
    });
    grid.appendChild(opt);
  }
  modal.appendChild(grid);
  modal.appendChild(el('button', { class: 'diag-cancel doc-button small', onclick: () => bg.remove() }, [
    el('span', {}, '〈 cancel — I will not commit yet'),
  ]));
  bg.appendChild(modal);
  root.appendChild(bg);
}

// ── log panel ───────────────────────────────────────────────────────
function logPanel() {
  const wrap = el('div', { class: 'intake-log-panel' });
  wrap.appendChild(el('div', { class: 'log-header' }, '— what is written down —'));
  const scroll = el('div', { class: 'intake-log-scroll' });
  for (const entry of state.intake.log) {
    const line = el('div', { class: 'log-line ' + (entry.cls || '') });
    line.textContent = entry.text;
    scroll.appendChild(line);
  }
  wrap.appendChild(scroll);

  if (state.notes && state.notes.line) {
    const lore = el('div', { class: 'lore-strip' });
    lore.innerHTML = parseProse(state.notes.line.text);
    wrap.appendChild(lore);
  }
  return wrap;
}

function sep() { return el('span', { class: 'h-sep' }, ' · '); }
function pad2(n) { return String(Math.max(0, n | 0)).padStart(2, '0'); }
