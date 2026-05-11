import { el, app } from './dom.js';
import { state } from '../state.js';
import { VOICE, SCARS } from '../data.js';
import { enterIntake } from '../run.js';
import { sfx } from '../audio.js';
import { parseProse } from './textCorrupt.js';
import { render } from './render.js';

export function renderHallway() {
  const page = docPage(`// Corridor · descent ${pad2(state.wave)} · ahead`);

  // Composure + scars summary (the heavy bits the player needs to read)
  const summary = el('div', { class: 'doc-prose dim' });
  summary.innerHTML = parseProse(
    `Composure ${state.composure}/${state.composureMax}. ${state.scars.length} scar${state.scars.length === 1 ? '' : 's'} on file.`
  );
  page.appendChild(summary);

  if (state.scars.length > 0) {
    page.appendChild(el('div', { class: 'sec-label-doc' }, '─ Scars I carry ─'));
    for (const sk of state.scars) {
      const s = SCARS[sk];
      if (!s) continue;
      const r = el('div', { class: 'scar-line' });
      r.appendChild(el('span', { class: 'scar-marker' }, '✕ '));
      r.appendChild(el('span', { class: 'scar-name' }, s.name));
      r.appendChild(el('span', { class: 'scar-sep' }, ' · '));
      const v = el('span', { class: 'scar-voice' });
      v.innerHTML = parseProse(s.voice || '');
      r.appendChild(v);
      const e = el('div', { class: 'scar-effect' }, s.effect || '');
      page.appendChild(r);
      page.appendChild(e);
    }
  }

  // Hallway prose
  const proseLines = state.hallway?.lines || [];
  for (const line of proseLines) {
    const p = el('div', { class: 'doc-prose' });
    p.innerHTML = parseProse(line);
    page.appendChild(p);
  }

  // Patient awareness — we don't reveal much. Just the bracketed name.
  if (state.hallway?.patientTemplate) {
    page.appendChild(el('div', { class: 'sec-label-doc' }, '─ Next intake ─'));
    const t = state.hallway.patientTemplate;
    const card = el('div', { class: 'hallway-patient-card' });
    card.appendChild(el('span', { class: 'hpc-marker' }, '▸ '));
    card.appendChild(el('span', { class: 'hpc-name', html: parseProse(t.name) }));
    if (t.subtitle) {
      card.appendChild(el('span', { class: 'hpc-sep' }, ' · '));
      const sub = el('span', { class: 'hpc-sub' });
      sub.innerHTML = parseProse(t.subtitle);
      card.appendChild(sub);
    }
    page.appendChild(card);
  }

  const isFinale = state.wave === 10;
  const proceedBtn = docButton(isFinale ? 'Open the door at the top' : 'Step into the room', () => {
    sfx('select');
    enterIntake();
    render();
  });
  page.appendChild(actionRow(proceedBtn));

  app().appendChild(page);
}

function docPage(tag) {
  const wrap = el('div', { class: 'doc-page' });
  wrap.appendChild(el('div', { class: 'doc-page-tag' }, tag));
  return wrap;
}
function docButton(label, onclick) {
  return el('button', { class: 'doc-button', onclick }, [
    el('span', { class: 'doc-button-marker' }, '▸ '),
    el('span', {}, label),
  ]);
}
function actionRow(...kids) {
  const row = el('div', { class: 'doc-action-row' });
  for (const k of kids) if (k) row.appendChild(k);
  return row;
}
function pad2(n) { return String(Math.max(0, n | 0)).padStart(2, '0'); }
