import { el, app } from './dom.js';
import { state } from '../state.js';
import { VOICE, APPROACHES } from '../data.js';
import { applyBoon, skipBoon } from '../run.js';
import { parseProse } from './textCorrupt.js';
import { render } from './render.js';
import { sfx } from '../audio.js';

export function renderBoon() {
  const page = docPage(`// Between rooms · descent ${pad2(state.wave)} · I write what I learned`);

  const intro = el('div', { class: 'doc-prose' });
  intro.innerHTML = parseProse(VOICE.boon?.intro || 'I write what I learned between intakes.');
  page.appendChild(intro);

  // Protagonist file accumulating
  const protag = el('div', { class: 'doc-prose dim' });
  const notes = (VOICE.protagonistNotes && VOICE.protagonistNotes[String(state.wave)]) || null;
  if (notes && notes.length) {
    protag.innerHTML = '— filed on me —\n' + notes.map(n => '· ' + n).join('\n');
    protag.innerHTML = parseProse(protag.innerHTML);
    page.appendChild(protag);
  }

  page.appendChild(el('div', { class: 'sec-label-doc' }, '─ I add one to my file ─'));
  const grid = el('div', { class: 'boon-grid' });
  for (const choice of (state.boonChoices || [])) {
    const card = el('div', { class: 'boon-card selectable' });
    if (choice.kind === 'method') {
      const a = APPROACHES[choice.key];
      if (!a) continue;
      card.appendChild(el('div', { class: 'boon-card-name' }, a.name));
      const cost = el('div', { class: 'boon-card-cost' });
      cost.textContent = (a.cost > 0 ? '◆'.repeat(a.cost) : 'free');
      card.appendChild(cost);
      if (a.category) card.appendChild(el('div', { class: 'boon-card-cat cat-' + a.category }, a.category));
      const desc = el('div', { class: 'boon-card-desc' });
      desc.innerHTML = parseProse(a.desc || '');
      card.appendChild(desc);
      const v = el('div', { class: 'boon-card-voice' });
      v.innerHTML = parseProse(a.voice || '');
      card.appendChild(v);
    } else if (choice.kind === 'rest') {
      card.appendChild(el('div', { class: 'boon-card-name' }, 'Sit with the file'));
      card.appendChild(el('div', { class: 'boon-card-desc' }, '+3 Composure.'));
      const v = el('div', { class: 'boon-card-voice' });
      v.innerHTML = parseProse('I do not write. I read what is already there.');
      card.appendChild(v);
    }
    card.addEventListener('click', () => {
      sfx('select');
      applyBoon(choice);
      render();
    });
    grid.appendChild(card);
  }
  page.appendChild(grid);

  page.appendChild(actionRow(
    docButton('Take nothing in — keep walking', () => {
      skipBoon();
      render();
    }, 'small')
  ));
  app().appendChild(page);
}

function docPage(tag) {
  const wrap = el('div', { class: 'doc-page' });
  wrap.appendChild(el('div', { class: 'doc-page-tag' }, tag));
  return wrap;
}
function docButton(label, onclick, variant) {
  return el('button', { class: 'doc-button' + (variant ? ' ' + variant : ''), onclick }, [
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
