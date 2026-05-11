import { el, app } from './dom.js';
import { state } from '../state.js';
import { VOICE, APPROACHES } from '../data.js';
import { beginRun, pickAdmissionMethods } from '../run.js';
import { loadMeta } from '../meta.js';
import { parseProse } from './textCorrupt.js';
import { renderGlyph } from './glyphs.js';
import { sfx } from '../audio.js';
import { render } from './render.js';
import { VERSION } from '../version.js';

export function renderAdmission() {
  state.meta = state.meta || loadMeta();
  const meta = state.meta;
  app().appendChild(el('div', { class: 'doc-version' }, `v${VERSION}`));

  const page = docPage(`// Admission · Patient ${pad4(meta.patientId)} · day one`);

  if ((meta.runs || 0) > 0) {
    const head = el('div', { class: 'doc-prose dim' });
    head.innerHTML = parseProse(`Sign-in ${meta.runs + 1}. The desk knows my hand. !!The handwriting is not the same.!!`);
    page.appendChild(head);
  }

  const intro = el('div', { class: 'doc-prose' });
  const lines = (VOICE.admission?.intro || []).join('\n\n');
  intro.innerHTML = parseProse(lines);
  page.appendChild(intro);

  if ((meta.carriedNotes || []).length) {
    page.appendChild(el('div', { class: 'sec-label-doc' }, '─ I carry these in ─'));
    const carried = el('div', { class: 'method-grid' });
    for (const k of meta.carriedNotes) {
      const a = APPROACHES[k];
      if (!a) continue;
      const card = methodCardEl(a, false);
      card.classList.add('inherited');
      carried.appendChild(card);
    }
    page.appendChild(carried);
  }

  page.appendChild(el('div', { class: 'doc-prose dim' }, parseProse(VOICE.admission?.method_pick || 'Choose one method.')));
  page.appendChild(el('div', { class: 'sec-label-doc' }, '─ Choose one I already know ─'));

  const methodGrid = el('div', { class: 'method-grid' });
  const methods = pickAdmissionMethods();
  for (const a of methods) {
    const card = methodCardEl(a, true);
    card.addEventListener('click', () => {
      sfx('select');
      beginRun(a.key);
      render();
    });
    methodGrid.appendChild(card);
  }
  page.appendChild(methodGrid);

  app().appendChild(page);
}

function methodCardEl(a, selectable) {
  const card = el('div', { class: 'method-card' + (selectable ? ' selectable' : '') });
  const head = el('div', { class: 'method-head' });
  head.appendChild(el('span', { class: 'method-marker' }, selectable ? '▸ ' : '· '));
  head.appendChild(el('span', { class: 'method-name' }, a.name));
  head.appendChild(el('span', { class: 'method-cost' }, costPips(a.cost)));
  if (a.category) head.appendChild(el('span', { class: 'method-cat method-cat-' + a.category }, categoryShorthand(a.category)));
  card.appendChild(head);

  const desc = el('div', { class: 'method-desc' });
  desc.innerHTML = parseProse(a.desc || '');
  card.appendChild(desc);

  if (a.voice) {
    const v = el('div', { class: 'method-voice' });
    v.innerHTML = parseProse(a.voice);
    card.appendChild(v);
  }
  return card;
}

function categoryShorthand(cat) {
  return ({ mourner: 'mourner', visitor: 'visitor', tenant: 'tenant', witness: 'witness', stranger: 'stranger' })[cat] || cat;
}

function costPips(cost) {
  const c = Math.max(0, cost || 0);
  if (c === 0) return 'free';
  return '◆'.repeat(c);
}

function docPage(tag) {
  const wrap = el('div', { class: 'doc-page' });
  wrap.appendChild(el('div', { class: 'doc-page-tag' }, tag));
  return wrap;
}

function pad4(n) { return String(Math.max(0, n | 0)).padStart(4, '0'); }
