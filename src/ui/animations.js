// DOM-based combat animations targeting the dossier columns.
// Floats spawn over the relevant glyph portrait; shake/lunge/recoil are
// CSS animations applied to the dossier column for the affected side.

import { el } from './dom.js';

function colFor(side) {
  return document.querySelector(`.dossier-col.${side}`);
}

export function spawnFloat(side, text, kind = 'dmg') {
  const col = colFor(side);
  const target = col ? col.querySelector('.glyph-portrait') : null;
  if (!target) return;
  const r = target.getBoundingClientRect();
  const f = el('div', { class: 'floating ' + (kind === 'crit' ? 'crit' : kind === 'heal' ? 'heal' : '') }, text);
  f.style.position = 'fixed';
  f.style.textAlign = 'center';
  f.style.minWidth = '80px';
  f.style.left = `${r.left + r.width / 2 - 40}px`;
  f.style.top  = `${r.top + 8}px`;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 1000);
}

export function spawnCallout(text) {
  const screen = document.querySelector('.dossier-screen');
  if (!screen) return;
  const r = screen.getBoundingClientRect();
  const c = el('div', { class: 'callout' }, text);
  c.style.position = 'fixed';
  c.style.left = `${r.left + r.width / 2}px`;
  c.style.top  = `${r.top + 60}px`;
  document.body.appendChild(c);
  setTimeout(() => c.remove(), 950);
}

export function shakeStage() {
  for (const side of ['player', 'enemy']) pulseCol(side, 'shake-pulse');
}

export function playLunge(side) {
  pulseCol(side, 'lunge-anim');
}

export function playRecoil(side) {
  pulseCol(side, 'recoil-anim');
}

function pulseCol(side, cls) {
  const col = colFor(side);
  if (!col) return;
  col.classList.remove(cls);
  // force reflow so the class can re-apply if already present
  void col.offsetWidth;
  col.classList.add(cls);
  setTimeout(() => col.classList.remove(cls), 600);
}
