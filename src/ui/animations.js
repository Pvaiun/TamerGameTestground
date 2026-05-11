// DOM-based combat animations targeting the fighter panels.

import { el } from './dom.js';

function panelFor(side) {
  return document.querySelector(`.fighter-panel.${side}`);
}

export function spawnFloat(side, text, kind = 'dmg') {
  const panel = panelFor(side);
  const target = panel ? panel.querySelector('.fp-glyph') : null;
  if (!target) return;
  const r = target.getBoundingClientRect();
  const f = el('div', { class: 'floating ' + (kind === 'crit' ? 'crit' : kind === 'heal' ? 'heal' : '') }, text);
  f.style.position = 'fixed';
  f.style.textAlign = 'center';
  f.style.minWidth = '80px';
  f.style.left = `${r.left + r.width / 2 - 40}px`;
  f.style.top  = `${r.top + 4}px`;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 1000);
}

export function shakeStage() {
  for (const side of ['player', 'enemy']) pulsePanel(side, 'shake-pulse');
}

export function playLunge(side) {
  pulsePanel(side, 'lunge-anim');
}

export function playRecoil(side) {
  pulsePanel(side, 'recoil-anim');
}

function pulsePanel(side, cls) {
  const p = panelFor(side);
  if (!p) return;
  p.classList.remove(cls);
  void p.offsetWidth; // force reflow
  p.classList.add(cls);
  setTimeout(() => p.classList.remove(cls), 600);
}

// kept for compatibility — no callers in the new UI
export function spawnCallout() { /* noop */ }
