// Battle screen — energy + charge layout.
//
// Vertical layout:
//   1. engagement strip (depth, round, pace)
//   2. enemy panel: name, HP, intent badge, stats, statuses, charge
//   3. player panel: name, HP, intent reminder, stats, statuses, charge, energy
//   4. action bar: ability cards + swap + end-turn
//   5. compact battle log + atmospheric lore line

import { el, app } from './dom.js';
import { ABILITIES, PASSIVES, TYPE_CHART } from '../data.js';
import { state, TOTAL_WAVES } from '../state.js';
import { displayName } from '../creature.js';
import { renderGlyph } from './glyphs.js';
import { openInspectModal, openAbilityTooltip } from './cards.js';
import { playerAct, playerSwap, playerEndTurn } from '../combat/battle.js';
import { applyHpFill } from './hpTween.js';
import { parseProse } from './textCorrupt.js';
import { estimateDamage, effectiveStat, abilityCost } from '../combat/damage.js';

export function renderBattle() {
  const screen = el('div', { class: 'battle-screen' });
  screen.appendChild(engagementStripEl());
  screen.appendChild(fighterPanelEl(state.ef, state.ebf, 'enemy'));
  screen.appendChild(fighterPanelEl(state.pf, state.bf, 'player'));
  screen.appendChild(actionBarEl());
  screen.appendChild(logPanelEl());
  app().appendChild(screen);
  const gl = document.querySelector('.gamelog-scroll');
  if (gl) gl.scrollTop = gl.scrollHeight;
}

// ── engagement strip ─────────────────────────────────────────────────
function engagementStripEl() {
  const strip = el('div', { class: 'engagement-strip' });

  const left = el('div', { class: 'eng-left' }, [
    el('span', {}, '// engagement'),
    el('span', { class: 'eng-sep' }, ' · '),
    el('span', {}, `descent ${pad2(state.wave)}/${pad2(TOTAL_WAVES)}`),
    el('span', { class: 'eng-sep' }, ' · '),
    el('span', {}, `round ${state.round || 0}`),
    state.isEliteBattle ? el('span', { class: 'eng-tag elite' }, ' · ELITE') : null,
  ].filter(Boolean));
  strip.appendChild(left);

  // Center is intentionally empty (intent moved into enemy panel).
  strip.appendChild(el('div', { class: 'eng-center' }));

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

// ── fighter panel ────────────────────────────────────────────────────
function fighterPanelEl(active, bench, side) {
  const panel = el('div', { class: `fighter-panel ${side}` });
  if (!active) return panel;
  const c = active.creature;

  // Header row: glyph + name + tags
  const head = el('div', { class: 'fp-head' });
  const glyph = el('div', { class: 'fp-glyph glyph-portrait', title: 'click for full file' });
  glyph.innerHTML = renderGlyph(c.species);
  glyph.addEventListener('click', () => openInspectModal(c));
  head.appendChild(glyph);

  const headRight = el('div', { class: 'fp-head-right' });
  const nameRow = el('div', { class: 'fp-name-row' });
  const nameSpan = el('span', { class: 'fp-name', html: parseProse(displayName(c)) });
  nameRow.appendChild(nameSpan);
  nameRow.appendChild(el('span', { class: 'fp-meta' }, ` · ${c.type} · l${c.level}`));
  headRight.appendChild(nameRow);

  // Intent badge (enemy only). Player gets a small reminder of their charge usage hint.
  if (side === 'enemy' && state.enemyIntent) {
    headRight.appendChild(intentRowEl(state.enemyIntent));
  } else if (side === 'player') {
    headRight.appendChild(playerHintEl(active));
  }
  head.appendChild(headRight);
  panel.appendChild(head);

  // HP bar (big and prominent).
  panel.appendChild(hpBarBigEl(active));

  // Stat + status row (compact: atk/def/spd + statuses inline).
  panel.appendChild(statRowCompactEl(active, side));

  // Charge pips row.
  panel.appendChild(chargeRowEl(active, side));

  // Bench preview row (small).
  if (bench) panel.appendChild(benchRowEl(bench, side));

  return panel;
}

function intentRowEl(intent) {
  const wrap = el('div', { class: 'fp-intent' });
  wrap.appendChild(el('span', { class: 'intent-prefix' }, 'they plan: '));
  const badge = el('span', { class: 'intent-badge intent-' + intent.kind });
  badge.appendChild(el('span', { class: 'intent-icon' }, intent.icon || '·'));
  badge.appendChild(el('span', { class: 'intent-label' }, intent.label || '?'));
  if (intent.kind === 'attack' && intent.estDmg > 0) {
    badge.appendChild(el('span', { class: 'intent-dmg' }, `~${intent.estDmg}`));
  }
  wrap.appendChild(badge);
  return wrap;
}

function playerHintEl(f) {
  const wrap = el('div', { class: 'fp-intent player' });
  const charge = f.charge || 0;
  if (charge >= 2) {
    wrap.appendChild(el('span', { class: 'intent-prefix' }, 'ready: '));
    wrap.appendChild(el('span', { class: 'intent-badge intent-buff' }, [
      el('span', { class: 'intent-icon' }, '◆'),
      el('span', { class: 'intent-label' }, `${charge} Charge — Spend boosted`),
    ]));
  } else {
    wrap.appendChild(el('span', { class: 'intent-prefix' }, 'tip: '));
    wrap.appendChild(el('span', { class: 'fp-tip' }, 'Build Charge then Spend for burst.'));
  }
  return wrap;
}

function hpBarBigEl(f) {
  const max = f.creature.maxHp;
  const cur = Math.max(0, f.hp);
  const wrap = el('div', { class: 'hp-big' });
  const labelLeft = el('span', { class: 'hp-big-num' }, `${pad3(cur)} / ${pad3(max)}`);
  const bar = el('div', { class: 'hp-big-bar' });
  const fill = el('span', { class: 'hp-big-fill' });
  bar.appendChild(fill);
  applyHpFill(fill, f);
  wrap.appendChild(labelLeft);
  wrap.appendChild(bar);
  return wrap;
}

function statRowCompactEl(f, _side) {
  const wrap = el('div', { class: 'fp-stat-row' });
  for (const [k, lbl] of [['atk', 'atk'], ['def', 'def'], ['spd', 'spd']]) {
    const baseVal = f.creature.stats[k];
    const effective = effectiveStat(f, k);
    const m = (effective / baseVal) - 1;
    const cell = el('span', { class: 'fp-stat-cell' });
    cell.appendChild(el('span', { class: 'fp-stat-label' }, lbl));
    cell.appendChild(el('span', { class: 'fp-stat-num' }, pad2(effective)));
    if (Math.abs(m) > 0.04) {
      cell.appendChild(el('span', { class: 'fp-stat-mod ' + (m > 0 ? 'pos' : 'neg') },
        ` ${m > 0 ? '+' : ''}${Math.round(m * 100)}%`));
    }
    wrap.appendChild(cell);
  }
  // Statuses
  const statuses = activeAfflictions(f);
  if (statuses.length) {
    wrap.appendChild(el('span', { class: 'fp-status-sep' }, '·'));
    for (const a of statuses) {
      wrap.appendChild(el('span', { class: 'fp-status-pill status-' + a.key }, [
        el('span', { class: 'fp-status-name' }, a.label),
        el('span', { class: 'fp-status-turns' }, ` ${a.suffix}`),
      ]));
    }
  }
  return wrap;
}

function chargeRowEl(f, _side) {
  const wrap = el('div', { class: 'fp-charge-row' });
  wrap.appendChild(el('span', { class: 'fp-charge-label' }, 'charge'));
  const pips = el('span', { class: 'fp-charge-pips' });
  const charge = f.charge || 0;
  for (let i = 0; i < 3; i++) {
    pips.appendChild(el('span', { class: 'charge-pip ' + (i < charge ? 'on' : 'off') }, '◆'));
  }
  wrap.appendChild(pips);
  // Passive callout (compact, single line).
  const list = (f.creature.passives && f.creature.passives.length) ? f.creature.passives : [];
  if (list.length) {
    const p = PASSIVES[list[0]];
    if (p) {
      wrap.appendChild(el('span', { class: 'fp-passive-inline', title: p.desc }, [
        el('span', { class: 'fp-passive-sep' }, ' · '),
        el('span', { class: 'fp-passive-bullet' }, '•'),
        el('span', { class: 'fp-passive-name' }, ` ${p.name}`),
      ]));
    }
  }
  return wrap;
}

function benchRowEl(f, side) {
  const wrap = el('div', { class: 'fp-bench' });
  const c = f.creature;
  const g = el('span', { class: 'fp-bench-glyph' });
  g.innerHTML = renderGlyph(c.species);
  wrap.appendChild(g);
  wrap.appendChild(el('span', { class: 'fp-bench-label' }, 'bench'));
  wrap.appendChild(el('span', { class: 'fp-bench-name' }, displayName(c)));
  // HP bar mini
  const bar = el('span', { class: 'fp-bench-bar' });
  const fill = el('span', { class: 'fp-bench-fill' });
  bar.appendChild(fill);
  applyHpFill(fill, f);
  wrap.appendChild(bar);
  wrap.appendChild(el('span', { class: 'fp-bench-hp' }, `${Math.max(0, f.hp)}/${c.maxHp}`));
  wrap.addEventListener('click', () => openInspectModal(c));
  return wrap;
}

function activeAfflictions(f) {
  const out = [];
  const s = f.statuses || {};
  if (s.burn)    out.push({ key: 'burn',    label: 'Fevering', suffix: `${s.burn.turns}r` });
  if (s.brittle) out.push({ key: 'brittle', label: 'Brittle',  suffix: `${s.brittle.turns}r` });
  if (s.drained) out.push({ key: 'drained', label: 'Drained',  suffix: `${s.drained.turns}r` });
  if (s.stun)    out.push({ key: 'stun',    label: 'Stunned',  suffix: `${s.stun.turns}r` });
  return out;
}

// ── action bar ───────────────────────────────────────────────────────
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

  // Ability grid (4 cards in a row on wide screens, 2x2 on narrow).
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
    btn.addEventListener('contextmenu', (e) => { e.preventDefault(); openAbilityTooltip(k); });
    grid.appendChild(btn);
  }
  bar.appendChild(grid);

  // Action options row
  const row = el('div', { class: 'action-options' });
  const canSwap = state.bf && state.bf.hp > 0 && state.pf.energy >= 1;
  const swapBtn = el('button', { class: 'opt-btn ' + (canSwap ? '' : 'unafford') });
  if (!canSwap) swapBtn.disabled = true;
  swapBtn.appendChild(el('span', { class: 'opt-icon' }, '⇆'));
  swapBtn.appendChild(el('span', {}, ` Swap${state.bf ? ' · ' + displayName(state.bf.creature) : ''}`));
  swapBtn.appendChild(el('span', { class: 'opt-cost' }, ' 1E'));
  swapBtn.addEventListener('click', () => playerSwap());
  row.appendChild(swapBtn);

  const inspectBtn = el('button', { class: 'opt-btn' });
  inspectBtn.appendChild(el('span', { class: 'opt-icon' }, '◇'));
  inspectBtn.appendChild(el('span', {}, ' Inspect enemy'));
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
  const energy = state.pf.energy ?? 0;
  const max = state.pf.maxEnergy ?? 3;
  const pips = el('span', { class: 'energy-pips' });
  for (let i = 0; i < Math.max(max, energy); i++) {
    pips.appendChild(el('span', { class: 'energy-pip ' + (i < energy ? 'on' : 'off') }, '◆'));
  }
  head.appendChild(pips);
  head.appendChild(el('span', { class: 'energy-num' }, ` ${energy}/${max} energy`));
  const acts = state.pf.actionsThisTurn || 0;
  if (acts > 0) {
    const combo = Math.min(36, Math.round(12 * acts));
    head.appendChild(el('span', { class: 'combo-tag' }, ` · combo +${combo}%`));
  }
  return head;
}

function abilityCardContent(a, cost) {
  const wrap = el('div', { class: 'ability-card-inner' });
  const top = el('div', { class: 'ability-card-top' });
  top.appendChild(el('span', { class: 'ability-card-name' }, a.name || ''));
  const costEl = el('span', { class: 'ability-card-cost' });
  for (let i = 0; i < (cost || 0); i++) costEl.appendChild(el('span', { class: 'cost-pip' }, '◆'));
  top.appendChild(costEl);
  wrap.appendChild(top);

  const tags = el('div', { class: 'ability-card-tags' });
  const dmg = estimateDamage(state.pf, state.ef, a);
  if (dmg > 0) tags.appendChild(el('span', { class: 'tag dmg' }, `~${dmg}`));
  const kind = abilityKind(a);
  if (!dmg && kind) tags.appendChild(el('span', { class: 'tag kind' }, kind));
  if (a.element) tags.appendChild(el('span', { class: 'tag elem ' + a.element }, a.element));
  const matchup = matchupChipFor(a);
  if (matchup) tags.appendChild(matchup);
  // Build / Spend role marker.
  if (a.tags && a.tags.includes('build')) tags.appendChild(el('span', { class: 'tag role build' }, 'build'));
  if (a.tags && a.tags.includes('spend')) tags.appendChild(el('span', { class: 'tag role spend' }, 'spend'));
  wrap.appendChild(tags);

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
  if (flat.some(e => e.type === 'heal_self_pct')) return 'heal';
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

const _typedLoreIds = new Set();

// ── log panel ────────────────────────────────────────────────────────
function logPanelEl() {
  const wrap = el('div', { class: 'log-panel' });

  const game = el('div', { class: 'gamelog-block' });
  game.appendChild(el('div', { class: 'log-header' }, '— battle log —'));
  const scroll = el('div', { class: 'gamelog-scroll' });
  for (const entry of state.gameLog) {
    const line = el('div', { class: 'gamelog-line ' + (entry.cls || '') + (entry.actor ? ' ' + entry.actor : '') });
    if (entry.actor) {
      line.appendChild(el('span', { class: 'gl-arrow' }, entry.actor === 'player' ? '▸ ' : '◂ '));
    }
    line.appendChild(el('span', { class: 'gl-text' }, entry.text));
    if (entry.damage > 0) line.appendChild(el('span', { class: 'gl-dmg' }, ` −${entry.damage}`));
    if (entry.heal > 0)   line.appendChild(el('span', { class: 'gl-heal' }, ` +${entry.heal}`));
    scroll.appendChild(line);
  }
  game.appendChild(scroll);
  wrap.appendChild(game);

  const lore = el('div', { class: 'lore-block' });
  lore.appendChild(el('div', { class: 'log-header' }, '— what they wrote down —'));
  const loreInner = el('div', { class: 'lore-inner' });
  if (state.loreLine && state.loreLine.text) {
    const line = el('div', { class: 'lore-line ' + (state.loreLine.cls || '') });
    line.innerHTML = parseProse(state.loreLine.text);
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

function pad2(n) { return String(Math.max(0, n | 0)).padStart(2, '0'); }
function pad3(n) { return String(Math.max(0, n | 0)).padStart(3, '0'); }
