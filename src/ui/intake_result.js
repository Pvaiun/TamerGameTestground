import { el, app } from './dom.js';
import { state } from '../state.js';
import { VOICE, SCARS, CATEGORIES } from '../data.js';
import { continueAfterIntake } from '../intake.js';
import { sfx } from '../audio.js';
import { parseProse } from './textCorrupt.js';
import { renderGlyph } from './glyphs.js';
import { render } from './render.js';

export function renderIntakeResult() {
  const i = state.intake;
  if (!i) return;
  const won = i.outcome === 'won';

  const tag = won
    ? `// File · ${i.patient.name} · ~~closed~~ filed`
    : `// File · ${i.patient.name} · !!unfiled!!`;
  const page = docPage(tag);

  const intro = el('div', { class: 'doc-prose' });
  intro.innerHTML = parseProse(won
    ? `I close the file. ${i.patient.name} is recorded as ${CATEGORIES[i.patient.category]?.name || i.patient.category}.`
    : `${i.patient.name} finished the page in my hand. ~~I tried.~~ I took something with me.`);
  page.appendChild(intro);

  // Glyph + revealed fragments
  const reveal = el('div', { class: 'result-reveal' });
  const g = el('div', { class: 'result-glyph' });
  g.innerHTML = renderGlyph(i.patient.species);
  reveal.appendChild(g);
  const lines = el('div', { class: 'result-lines' });
  for (let idx = 0; idx < i.patient.fragments.length; idx++) {
    const line = el('div', { class: 'fn-line' + (idx >= i.patient.revealedFragments ? ' dim' : '') });
    line.innerHTML = parseProse(i.patient.fragments[idx]);
    lines.appendChild(line);
  }
  reveal.appendChild(lines);
  page.appendChild(reveal);

  if (!won && i.scar) {
    const s = SCARS[i.scar];
    page.appendChild(el('div', { class: 'sec-label-doc' }, '─ The scar I take ─'));
    const card = el('div', { class: 'scar-card' });
    card.appendChild(el('div', { class: 'scar-card-name' }, s.name));
    const v = el('div', { class: 'scar-card-voice' });
    v.innerHTML = parseProse(s.voice || '');
    card.appendChild(v);
    card.appendChild(el('div', { class: 'scar-card-effect' }, s.effect || ''));
    page.appendChild(card);
  }

  page.appendChild(actionRow(docButton(won ? 'Step out into the corridor' : 'Step out — favouring the wound', () => {
    sfx('select');
    continueAfterIntake();
    render();
  })));
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
