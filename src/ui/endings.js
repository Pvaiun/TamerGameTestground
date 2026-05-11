import { el, app } from './dom.js';
import { state, resetRun } from '../state.js';
import { VOICE, APPROACHES } from '../data.js';
import { parseProse } from './textCorrupt.js';
import { render } from './render.js';
import { loadMeta } from '../meta.js';

export function renderEnding() {
  const won = state.endReason === 'won';
  const meta = loadMeta();
  const page = docPage(won
    ? '// Admission · the door · ~~closed~~ open'
    : '// Admission · ~~ends~~ stops here');

  const intro = el('div', { class: 'doc-prose' });
  if (won) {
    intro.innerHTML = parseProse(VOICE.finale?.win || 'I close my own file.');
    page.appendChild(intro);
    const post = el('div', { class: 'doc-prose dim' });
    post.innerHTML = parseProse(VOICE.endings?.run_completed || 'The road is paved this time.');
    page.appendChild(post);
  } else {
    intro.innerHTML = parseProse(VOICE.finale?.lose || 'The pen will not stay in my hand.');
    page.appendChild(intro);
    const post = el('div', { class: 'doc-prose dim' });
    post.innerHTML = parseProse(VOICE.endings?.run_failed || 'The file closes. Another patient is signed in.');
    page.appendChild(post);
  }

  // Roster of what survived
  page.appendChild(el('div', { class: 'sec-label-doc' }, '─ What I file with me ─'));
  const summary = el('div', { class: 'ending-summary' });
  summary.appendChild(el('div', {}, `Descents reached · ${state.wave}`));
  summary.appendChild(el('div', {}, `Methods in file · ${state.deck.length}`));
  summary.appendChild(el('div', {}, `Scars carried · ${state.scars.length}`));
  page.appendChild(summary);

  if (won && (meta.carriedNotes || []).length) {
    page.appendChild(el('div', { class: 'sec-label-doc' }, '─ Notes the next intake will inherit ─'));
    const list = el('div', { class: 'inherit-list' });
    for (const k of meta.carriedNotes) {
      const a = APPROACHES[k];
      if (!a) continue;
      const r = el('div', { class: 'inherit-row' });
      r.appendChild(el('span', { class: 'inherit-marker' }, '· '));
      r.appendChild(el('span', { class: 'inherit-name' }, a.name));
      r.appendChild(el('span', { class: 'inherit-sep' }, ' · '));
      const v = el('span', { class: 'inherit-voice' });
      v.innerHTML = parseProse(a.voice || '');
      r.appendChild(v);
      list.appendChild(r);
    }
    page.appendChild(list);
  }

  if ((meta.runs || 0) >= 1) {
    const note = el('div', { class: 'doc-prose dim' });
    note.innerHTML = parseProse(VOICE.endings?.new_run || 'Another file is opened at the desk.');
    page.appendChild(note);
  }

  page.appendChild(actionRow(docButton('Begin another admission', () => {
    resetRun();
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
