// All non-battle screens, rendered as pages of the same document.

import { el, app } from './dom.js';
import { VERSION } from '../version.js';
import { TEMPLATES, ABILITIES, PASSIVES, VOICE, RELICS } from '../data.js';
import { state, BREED_WAVES, TOTAL_WAVES, PARTY_CAP, resetGame } from '../state.js';
import { sfx } from '../audio.js';
import { makeCreature, displayName } from '../creature.js';
import { generateEnemyParty, partyAvgLevel } from '../encounter.js';
import { creatureCardEl } from './cards.js';
import { beginBattle } from '../combat/battle.js';
import { makeChild, finalizeBreed } from '../breeding.js';
import { render, advanceWave, routeAfterAftermath, proceedFromDepth } from './render.js';
import { parseProse } from './textCorrupt.js';
import { acquireRelic, pickRecordsCandidates, tendCreature, generatePathChoices, applyOwnedPermanentsToCreature } from '../relics.js';

// Global header used between battles.
export function renderHeader() {
  const next = nextBreed();
  const cells = [
    docStripPart(`Descent ${pad2(state.wave)} of ${pad2(TOTAL_WAVES)}`),
    docStripPart(`With me · ${state.party.length}`),
    docStripPart(`In file · ${state.reserve.length}`),
  ];
  if ((state.relics || []).length) {
    cells.push(docStripPart(`Notes · ${state.relics.length}`));
  }
  cells.push(docStripPart(next ? `Next ritual · descent ${next}` : 'No ritual remains'));
  return el('div', { class: 'doc-strip header-strip' }, cells);
}

function nextBreed() {
  for (const w of [3, 6, 9]) if (w >= state.wave) return w;
  return null;
}

// ── start ────────────────────────────────────────────────────────────
export function renderStart() {
  app().appendChild(el('div', { class: 'doc-version' }, `v${VERSION}`));
  const page = docPage('// Admission · Patient 0413 · day one');

  const intro = el('div', { class: 'doc-prose' });
  intro.innerHTML = parseProse([
    'I found the address on a card I do not remember writing. The road ended at the building.',
    'The nurse opened the door before I knocked. She said they were expecting me. She handed me a file. She said it had been waiting.',
    'Ten descents. One room at a time. Some are patients. Some are paperwork. On the third, sixth, and ninth, the line ~~asks~~ requires a sacrifice — two written into one.',
    '!!The door at the top is locked from this side.!!',
  ].join('\n\n'));
  page.appendChild(intro);

  const help = el('div', { class: 'doc-prose dim' });
  help.innerHTML = parseProse(
    'How it works: each round you get **3 Energy**. Spend it on actions. Most cost 1-2. Build Charge with light hits, then Spend it on a finisher for burst damage. Type matters — fire>grass>water>fire, light↔dark. You carry **two patients** at a time. The bench can be swapped to.'
  );
  page.appendChild(help);

  page.appendChild(actionRow(
    docButton('Accept the file', () => {
      const protag = TEMPLATES.find(t => t.species === 'Lumenpup');
      if (protag) state.party.push(makeCreature(protag, 1));
      state.starterPool = TEMPLATES.filter(t => t.starter).map(t => makeCreature(t, 1));
      state.screen = 'starter_pick';
      render();
    })
  ));
  app().appendChild(page);
}

// ── starter pick ─────────────────────────────────────────────────────
export function renderStarterPick() {
  const idx = state.party.length;
  const page = docPage('// Admission · the file is ~~asked~~ required');

  const intro = el('div', { class: 'doc-prose' });
  intro.innerHTML = parseProse(
    idx === 0
      ? 'The nurse opens a file across the desk. She says it is mine to keep. For now.'
      : 'The nurse opens another file. She does not say whose it was. She says I will be its keeper.'
  );
  page.appendChild(intro);

  const grid = el('div', { class: 'doc-card-list' });
  for (const preview of state.starterPool) {
    if (state.party.find(c => c.species === preview.species)) continue;
    grid.appendChild(creatureCardEl(preview, {
      selectable: true,
      onclick: () => {
        sfx('select');
        state.party.push(preview);
        if (state.party.length < 2) render();
        else { state.screen = 'bloodline_ready'; render(); }
      },
    }));
  }
  page.appendChild(grid);
  app().appendChild(page);
}

// ── bloodline ready ──────────────────────────────────────────────────
export function renderBloodlineReady() {
  const page = docPage('// Admission · the line is set');
  const intro = el('div', { class: 'doc-prose' });
  intro.innerHTML = parseProse(
    'Two files at the desk. Mine, and the one she gave me. I hold each one long enough to ~~know~~ read it. The corridor is dark beyond the desk.'
  );
  page.appendChild(intro);

  const list = el('div', { class: 'doc-card-list' });
  for (const c of state.party) list.appendChild(creatureCardEl(c));
  page.appendChild(list);

  page.appendChild(actionRow(
    docButton('descend', () => {
      state.pendingRoomKind = 'battle';
      advanceWave();
    })
  ));
  app().appendChild(page);
}

// ── prebattle ────────────────────────────────────────────────────────
// Prebattle has two stages: roster (pick which 2 to bring if reserve is non-empty)
// and lead (pick which of those 2 leads). If the player has only 2 creatures total,
// roster is auto-skipped.
export function renderPreBattle() {
  const isBoss = state.wave === TOTAL_WAVES;
  const isElite = state.isEliteBattle && !isBoss;
  const tag = isBoss
    ? '// Engagement · the tenth · they are at the door'
    : isElite
      ? `// Engagement · descent ${pad2(state.wave)} · ~~deeper~~ a deeper room`
      : `// Engagement · descent ${pad2(state.wave)} · they approach`;
  const page = docPage(tag);

  const intro = el('div', { class: 'doc-prose' });
  intro.innerHTML = parseProse(
    isBoss
      ? 'They are at the door. All of them. I did not ~~choose~~ expect them this soon. !!The page thins where I am.!!'
      : isElite
        ? 'A door I had not noticed. Something heavier is on the other side.'
        : 'Another room. Another file across the desk. I count them. I write down what I can ~~hold~~ keep.'
  );
  page.appendChild(intro);

  page.appendChild(el('div', { class: 'sec-label-doc' }, '─ What I see ─'));
  const enemyList = el('div', { class: 'doc-card-list' });
  for (const e of state.enemyParty) enemyList.appendChild(creatureCardEl(e));
  page.appendChild(enemyList);

  // Roster picker: show when reserve has options AND user hasn't confirmed yet.
  if (state.reserve.length > 0 && !state.prebattleLead) {
    if (!state.prebattleSelection) {
      state.prebattleSelection = state.party.map(c => c.id);
    }
    const sel = state.prebattleSelection;
    page.appendChild(el('div', { class: 'sec-label-doc' }, `─ Who I take in · ${sel.length} of 2 ─`));
    const all = [...state.party, ...state.reserve];
    const list = el('div', { class: 'doc-card-list' });
    for (const c of all) {
      const isSel = sel.includes(c.id);
      list.appendChild(creatureCardEl(c, {
        selectable: true,
        selected: isSel,
        onclick: () => {
          if (isSel) state.prebattleSelection = sel.filter(id => id !== c.id);
          else if (sel.length < 2) state.prebattleSelection = [...sel, c.id];
          render();
        },
      }));
    }
    page.appendChild(list);
    if (sel.length < 1) {
      page.appendChild(actionRow(docButton('Pick at least one', () => {}, 'small')));
      app().appendChild(page);
      return;
    }
    page.appendChild(actionRow(docButton('Confirm — pick lead next', () => {
      // Re-compose party + reserve based on selection.
      const all2 = [...state.party, ...state.reserve];
      const newParty   = all2.filter(c => sel.includes(c.id));
      const newReserve = all2.filter(c => !sel.includes(c.id));
      state.party = newParty;
      state.reserve = newReserve;
      state.activeIdx = 0;
      state.prebattleSelection = null;
      state.prebattleLead = true;
      render();
    })));
    app().appendChild(page);
    return;
  }

  page.appendChild(el('div', { class: 'sec-label-doc' }, '─ Who goes first ─'));
  const leadList = el('div', { class: 'doc-card-list' });
  for (let i = 0; i < state.party.length; i++) {
    const c = state.party[i];
    leadList.appendChild(creatureCardEl(c, {
      selectable: true,
      onclick: () => {
        sfx('select');
        state.activeIdx = i;
        state.prebattleLead = false;
        beginBattle();
      },
    }));
  }
  page.appendChild(leadList);
  app().appendChild(page);
}

// ── aftermath ────────────────────────────────────────────────────────
export function renderAftermath() {
  const page = docPage(`// Engagement · descent ${pad2(state.wave)} · ended`);
  const ev = state.postBattleEvents;

  const intro = el('div', { class: 'doc-prose' });
  intro.innerHTML = parseProse(
    `The room is empty now. Each of them takes ${ev.xpGained} from what was ~~killed~~ left here.`
  );
  page.appendChild(intro);

  page.appendChild(el('div', { class: 'sec-label-doc' }, '─ What they took ─'));
  for (const rep of ev.xpReports) {
    const c = rep.creature;
    if (rep.levelEvents.length) {
      for (const lev of rep.levelEvents) {
        const lc = el('div', { class: 'doc-levelup' });
        lc.appendChild(el('div', { class: 'doc-levelup-line' },
          `${displayName(c)} — Level up · L${lev.level}`));
        const dl = el('div', { class: 'doc-levelup-deltas' });
        for (const [k, v] of Object.entries(lev.deltas)) {
          dl.appendChild(el('span', { class: 'doc-delta' }, `+${v} ${k}`));
        }
        lc.appendChild(dl);
        page.appendChild(lc);
      }
    }
    page.appendChild(creatureCardEl(c));
  }

  page.appendChild(el('div', { class: 'sec-label-doc' }, '─ One of them follows ─'));
  const chooseProse = el('div', { class: 'doc-prose dim' });
  chooseProse.innerHTML = parseProse('I write one of them into the line behind me, or I let the room close.');
  page.appendChild(chooseProse);
  const captureList = el('div', { class: 'doc-card-list' });
  for (const candidate of ev.capturedChoices) {
    captureList.appendChild(creatureCardEl(candidate, {
      selectable: true,
      selected: ev.capturedSelected && ev.capturedSelected.id === candidate.id,
      onclick: () => {
        ev.capturedSelected = ev.capturedSelected === candidate ? null : candidate;
        render();
      },
    }));
  }
  page.appendChild(captureList);

  const continueBtn = docButton(ev.capturedSelected ? 'Take them on' : 'Leave them', () => {
    if (ev.capturedSelected) {
      sfx('capture');
      applyOwnedPermanentsToCreature(ev.capturedSelected);
      state.reserve.push(ev.capturedSelected);
    }
    routeAfterAftermath();
  });
  page.appendChild(actionRow(continueBtn));
  app().appendChild(page);
}

// ── breed offer (optional ritual at waves 3, 6, 9) ───────────────────
export function renderBreedOffer() {
  const page = docPage(`// Ritual · descent ${pad2(state.wave)} · the line asks`);
  const intro = el('div', { class: 'doc-prose' });
  intro.innerHTML = parseProse(
    'The line ~~asks~~ requires. I may write two into one. The two I choose will not be on the next page.'
  );
  page.appendChild(intro);

  const note = el('div', { class: 'doc-prose dim' });
  note.innerHTML = parseProse(
    'I may also let the line wait. **Once the line waits, it does not ask again.**'
  );
  page.appendChild(note);

  page.appendChild(actionRow(
    docButton('Perform the ritual', () => {
      state.breedState = {
        stage: 'pick_pair',
        pool: [...state.party, ...state.reserve],
        currentPair: [],
        chosenAbilities: [],
        chosenPassives: [],
        chosenShape: null,
        passiveOptions: [],
        abilityOptions: [],
      };
      state.screen = 'breed';
      render();
    }),
    docButton('Decline. Walk on.', () => {
      // Skip ritual for this wave; proceed to path picker.
      if (state.wave + 1 >= TOTAL_WAVES) {
        state.pendingRoomKind = 'boss';
        advanceWave();
      } else {
        state.screen = 'path';
        render();
      }
    }, 'small'),
  ));
  app().appendChild(page);
}

// ── breed ────────────────────────────────────────────────────────────
export function renderBreed() {
  const bs = state.breedState;
  const page = docPage('// Ritual · two written into one');

  if (bs.stage === 'pick_pair') {
    const intro = el('div', { class: 'doc-prose' });
    intro.innerHTML = parseProse(
      `I pick the two. (${bs.currentPair.length}/2). The chosen will be ~~killed~~ written into one. The unchosen are filed elsewhere.`
    );
    page.appendChild(intro);

    page.appendChild(el('div', { class: 'doc-action-row left' }, [
      docButton('〈 cancel ritual', () => {
        // Return to the breed-offer screen so the player can decline instead.
        state.breedState = null;
        state.screen = 'breed_offer';
        render();
      }, 'small'),
    ]));

    const list = el('div', { class: 'doc-card-list' });
    for (const c of bs.pool) {
      const pickedNow = bs.currentPair.find(p => p.id === c.id);
      list.appendChild(creatureCardEl(c, {
        selectable: true,
        selected: !!pickedNow,
        onclick: () => {
          if (pickedNow) bs.currentPair = bs.currentPair.filter(p => p.id !== c.id);
          else if (bs.currentPair.length < 2) bs.currentPair = [...bs.currentPair, c];
          if (bs.currentPair.length === 2) {
            const [pa, pb] = bs.currentPair;
            bs.abilityOptions = Array.from(new Set([...pa.abilities, ...pb.abilities]));
            const pmap = {};
            for (const k of pa.passives || []) if (k) pmap[k] = pmap[k] === 'b' ? 'both' : 'a';
            for (const k of pb.passives || []) if (k) pmap[k] = pmap[k] === 'a' ? 'both' : 'b';
            bs.passiveOptions = Object.entries(pmap).map(([key, owner]) => ({ key, owner }));
            bs.chosenAbilities = [];
            bs.chosenPassives = [];
            bs.stage = 'config';
          }
          render();
        },
      }));
    }
    page.appendChild(list);
    app().appendChild(page);
    return;
  }

  if (bs.stage === 'config') {
    const [pa, pb] = bs.currentPair;
    const intro = el('div', { class: 'doc-prose' });
    intro.innerHTML = parseProse(
      'I write the offspring. Four ~~things it can do~~ actions, one quality, and a ~~body~~ shape it takes from one of them.'
    );
    page.appendChild(intro);

    page.appendChild(el('div', { class: 'doc-action-row left' }, [
      docButton('〈 ~~Undo~~ Pick different offerings', () => {
        bs.stage = 'pick_pair';
        bs.currentPair = [];
        bs.chosenAbilities = [];
        bs.chosenPassives = [];
        bs.chosenShape = null;
        render();
      }, 'small'),
    ]));

    const parents = el('div', { class: 'doc-card-list two-up' });
    parents.appendChild(creatureCardEl(pa, { showGrowths: true, noInspect: true }));
    parents.appendChild(creatureCardEl(pb, { showGrowths: true, noInspect: true }));
    page.appendChild(parents);

    // Shape picker: which parent's body the child takes.
    page.appendChild(el('div', { class: 'sec-label-doc' },
      `─ Shape · whose body it takes ─`));
    const shapeRow = el('div', { class: 'pick-row' });
    for (const [parent, key] of [[pa, 'a'], [pb, 'b']]) {
      const picked = bs.chosenShape === key;
      shapeRow.appendChild(el('button', {
        class: 'pick-btn' + (picked ? ' picked' : ''),
        onclick: () => { bs.chosenShape = picked ? null : key; render(); },
      }, [
        el('span', { class: 'pick-marker' }, picked ? '▸ ' : '  '),
        el('span', { class: 'pick-name' }, parent.species),
        el('span', { class: 'pick-tag' }, ` · ${parent.type}`),
      ]));
    }
    page.appendChild(shapeRow);

    // Ability picker: 4 from combined pool.
    page.appendChild(el('div', { class: 'sec-label-doc' },
      `─ Actions · ${bs.chosenAbilities.length} of 4 ─`));
    const aRow = el('div', { class: 'pick-row' });
    for (const k of bs.abilityOptions) {
      const a = ABILITIES[k];
      const picked = bs.chosenAbilities.includes(k);
      aRow.appendChild(el('button', {
        class: 'pick-btn' + (picked ? ' picked' : ''),
        title: a ? a.effect : '',
        onclick: () => {
          if (picked) bs.chosenAbilities = bs.chosenAbilities.filter(x => x !== k);
          else if (bs.chosenAbilities.length < 4) bs.chosenAbilities.push(k);
          render();
        },
      }, [
        el('span', { class: 'pick-marker' }, picked ? '▸ ' : '  '),
        el('span', { class: 'pick-name' }, a ? a.name : k),
        a && a.element ? el('span', { class: 'pick-tag' }, ` · ${a.element}`) : null,
      ].filter(Boolean)));
    }
    page.appendChild(aRow);

    // Passive picker: 1 from combined pool.
    page.appendChild(el('div', { class: 'sec-label-doc' },
      `─ Quality · ${bs.chosenPassives.length} of 1 ─`));
    const pRow = el('div', { class: 'pick-row' });
    for (const opt of bs.passiveOptions) {
      const k = opt.key;
      const picked = bs.chosenPassives.includes(k);
      const p = PASSIVES[k];
      const ownerLabel = opt.owner === 'a' ? pa.species
                       : opt.owner === 'b' ? pb.species
                       : `${pa.species}/${pb.species}`;
      const btn = el('button', {
        class: 'pick-btn' + (picked ? ' picked' : ''),
        title: (p ? p.desc : '') + ` (from ${ownerLabel})`,
        onclick: () => {
          if (picked) bs.chosenPassives = [];
          else bs.chosenPassives = [k];
          render();
        },
      }, [
        el('span', { class: 'pick-marker' }, picked ? '▸ ' : '  '),
        el('span', { class: 'pick-name' }, p ? p.name : k),
      ]);
      pRow.appendChild(btn);
    }
    page.appendChild(pRow);

    if (bs.chosenAbilities.length === 4 && bs.chosenPassives.length === 1 && bs.chosenShape) {
      const speciesFromB = bs.chosenShape === 'b';
      const child = makeChild(pa, pb, bs.chosenAbilities, bs.chosenPassives, speciesFromB);
      page.appendChild(el('div', { class: 'sec-label-doc' }, '─ Offspring · preview ─'));
      page.appendChild(creatureCardEl(child, { showGrowths: true }));
      page.appendChild(actionRow(
        docButton('Confirm the writing', () => {
          sfx('victory');
          finalizeBreed(pa, pb, child);
        })
      ));
    }
    app().appendChild(page);
    return;
  }

  app().appendChild(page);
}

// ── path picker ──────────────────────────────────────────────────────
export function renderPath() {
  const page = docPage(`// Corridor · descent ${pad2(state.wave + 1)} · ahead`);
  const intro = el('div', { class: 'doc-prose' });
  intro.innerHTML = parseProse(
    'Three doors in front of me. I have walked past them before. They have not all been there.'
  );
  page.appendChild(intro);

  if (!state.pathChoices) state.pathChoices = generatePathChoices(state.wave + 1);
  const choices = state.pathChoices;

  const list = el('div', { class: 'doc-card-list' });
  for (const ch of choices) {
    const card = el('div', { class: 'doc-card selectable inspectable path-card' });
    card.appendChild(el('span', { class: 'doc-card-marker' }, '▸ '));
    const glyph = el('div', { class: 'doc-card-glyph path-glyph' });
    glyph.appendChild(el('span', { class: 'path-icon' }, pathIcon(ch.kind)));
    card.appendChild(glyph);
    const body = el('div', { class: 'doc-card-body' });
    const head = el('div', { class: 'doc-card-head' });
    head.appendChild(el('span', { class: 'doc-card-name' }, ch.label));
    head.appendChild(el('span', { class: 'doc-card-meta' }, pathKindMeta(ch.kind)));
    body.appendChild(head);
    const desc = el('div', { class: 'doc-card-subtitle' });
    desc.innerHTML = parseProse(pathDescriptions(ch.kind));
    body.appendChild(desc);
    card.appendChild(body);
    card.addEventListener('click', () => {
      sfx('select');
      enterPath(ch.kind);
    });
    list.appendChild(card);
  }
  page.appendChild(list);
  app().appendChild(page);
}

function pathIcon(kind) {
  return ({
    battle: '◇',
    elite: '◆',
    records: '✕',
    tend: '⊕',
    boss: '●',
  })[kind] || '·';
}

function pathKindMeta(kind) {
  return ({
    battle:  'patient · fight + capture',
    elite:   'deeper room · fight + relic',
    records: 'records hall · relic, no fight',
    tend:    'treatment · permanent stat, no fight',
    boss:    'the door',
  })[kind] || '';
}

function pathDescriptions(kind) {
  switch (kind) {
    case 'battle':  return 'A patient. Two more files. The line continues. **xp + capture.**';
    case 'elite':   return 'A heavier file. Larger reward — **a relic** plus xp. !!And worse waiting.!!';
    case 'records': return 'A wall of paper. I take ~~one~~ a single page with me. **No fight.**';
    case 'tend':    return 'Quiet room. One of mine grows steadier here. **+permanent stat. No fight.**';
    case 'boss':    return 'Open the door.';
    default:        return '';
  }
}

function enterPath(kind) {
  state.pathChoices = null;
  state.pendingRoomKind = kind;
  advanceWave();
}

// ── records hall ─────────────────────────────────────────────────────
export function renderRecords() {
  const page = docPage(`// Records · descent ${pad2(state.wave)} · paperwork`);
  const intro = el('div', { class: 'doc-prose' });
  intro.innerHTML = parseProse(
    'The hall is wider than the building. Three files have been left where I will see them.'
  );
  page.appendChild(intro);

  if (!state.recordsCandidates) {
    state.recordsCandidates = pickRecordsCandidates(3);
  }
  const candidates = state.recordsCandidates;
  if (!candidates.length) {
    page.appendChild(el('div', { class: 'doc-prose dim' }, 'The room is empty. I have read everything here.'));
    page.appendChild(actionRow(docButton('Continue', () => {
      state.recordsCandidates = null;
      advanceWave();
    })));
    app().appendChild(page);
    return;
  }

  const list = el('div', { class: 'doc-card-list' });
  for (const r of candidates) {
    const card = el('div', { class: 'doc-card selectable inspectable relic-card' });
    card.appendChild(el('span', { class: 'doc-card-marker' }, '▸ '));
    const glyph = el('div', { class: 'doc-card-glyph relic-glyph' });
    glyph.appendChild(el('span', { class: 'relic-icon' }, '✕'));
    card.appendChild(glyph);
    const body = el('div', { class: 'doc-card-body' });
    const head = el('div', { class: 'doc-card-head' });
    head.appendChild(el('span', { class: 'doc-card-name' }, r.name));
    head.appendChild(el('span', { class: 'doc-card-meta' }, 'note'));
    body.appendChild(head);
    const sub = el('div', { class: 'doc-card-subtitle' });
    sub.innerHTML = parseProse(r.voice || '');
    body.appendChild(sub);
    body.appendChild(el('div', { class: 'relic-desc' }, r.desc));
    card.appendChild(body);
    card.addEventListener('click', () => {
      sfx('capture');
      acquireRelic(r);
      state.recordsCandidates = null;
      proceedFromDepth();
    });
    list.appendChild(card);
  }
  page.appendChild(list);
  page.appendChild(actionRow(docButton('Take nothing', () => {
    state.recordsCandidates = null;
    proceedFromDepth();
  }, 'small')));
  app().appendChild(page);
}

// ── tend (treatment room) ────────────────────────────────────────────
export function renderTend() {
  const page = docPage(`// Treatment · descent ${pad2(state.wave)} · the quiet room`);
  const intro = el('div', { class: 'doc-prose' });
  intro.innerHTML = parseProse(
    'The room is quieter than the others. One of mine grows steadier here. !!The cost is the room.!!'
  );
  page.appendChild(intro);

  if (!state.tendState) {
    state.tendState = { selectedCreature: null, selectedStat: null };
  }
  const ts = state.tendState;

  page.appendChild(el('div', { class: 'sec-label-doc' }, '─ Who steps in ─'));
  const list = el('div', { class: 'doc-card-list' });
  const candidates = [...state.party, ...state.reserve];
  for (const c of candidates) {
    list.appendChild(creatureCardEl(c, {
      selectable: true,
      selected: ts.selectedCreature && ts.selectedCreature.id === c.id,
      onclick: () => {
        ts.selectedCreature = ts.selectedCreature === c ? null : c;
        render();
      },
    }));
  }
  page.appendChild(list);

  if (ts.selectedCreature) {
    page.appendChild(el('div', { class: 'sec-label-doc' }, '─ What is tended ─'));
    const tendChoices = [
      { stat: 'hp',  delta: 8, label: '+8 max hp' },
      { stat: 'atk', delta: 2, label: '+2 attack' },
      { stat: 'def', delta: 2, label: '+2 defense' },
      { stat: 'spd', delta: 2, label: '+2 speed' },
    ];
    const choiceRow = el('div', { class: 'pick-row' });
    for (const ch of tendChoices) {
      const isSel = ts.selectedStat === ch.stat;
      choiceRow.appendChild(el('button', {
        class: 'pick-btn' + (isSel ? ' picked' : ''),
        onclick: () => { ts.selectedStat = isSel ? null : ch.stat; render(); },
      }, [
        el('span', { class: 'pick-marker' }, isSel ? '▸ ' : '  '),
        el('span', { class: 'pick-name' }, ch.label),
      ]));
    }
    page.appendChild(choiceRow);
  }

  const ready = ts.selectedCreature && ts.selectedStat;
  const goBtn = docButton(ready ? 'Tend them' : 'Pick one to tend', () => {
    if (!ready) return;
    const tendChoices = { hp: 8, atk: 2, def: 2, spd: 2 };
    tendCreature(ts.selectedCreature, ts.selectedStat, tendChoices[ts.selectedStat]);
    state.tendState = null;
    sfx('heal');
    proceedFromDepth();
  });
  if (!ready) goBtn.disabled = true;
  page.appendChild(actionRow(goBtn));
  app().appendChild(page);
}

// ── victory ──────────────────────────────────────────────────────────
export function renderVictory() {
  const page = docPage('// Admission · the door · ~~closed~~ open');
  const all = [...state.party, ...state.reserve];
  const maxLvl = all.reduce((a, c) => Math.max(a, c.level), 0);

  const intro = el('div', { class: 'doc-prose' });
  intro.innerHTML = parseProse(
    `I wrote my way to the tenth. There are ${all.length} of them with me. The deepest is at L${maxLvl}. The door at the top is open.`
  );
  page.appendChild(intro);

  const note = el('div', { class: 'doc-prose dim' });
  note.innerHTML = parseProse('!!Someone is signing me out.!! The hand is not the one I came in with. ~~The page ends~~ The page does not.');
  page.appendChild(note);

  if (state.relics && state.relics.length) {
    page.appendChild(el('div', { class: 'sec-label-doc' }, '─ Notes I kept ─'));
    const rl = el('div', { class: 'doc-card-list' });
    for (const r of state.relics) {
      const row = el('div', { class: 'doc-card relic-card' });
      row.appendChild(el('span', { class: 'doc-card-marker' }, '▸ '));
      const g = el('div', { class: 'doc-card-glyph relic-glyph' });
      g.appendChild(el('span', { class: 'relic-icon' }, '✕'));
      row.appendChild(g);
      const body = el('div', { class: 'doc-card-body' });
      body.appendChild(el('div', { class: 'doc-card-name' }, r.name));
      body.appendChild(el('div', { class: 'relic-desc' }, r.desc));
      row.appendChild(body);
      rl.appendChild(row);
    }
    page.appendChild(rl);
  }

  page.appendChild(el('div', { class: 'sec-label-doc' }, '─ What came back with me ─'));
  const list = el('div', { class: 'doc-card-list' });
  for (const c of state.party) list.appendChild(creatureCardEl(c));
  page.appendChild(list);

  page.appendChild(actionRow(docButton('Begin another admission', () => { resetGame(); render(); })));
  app().appendChild(page);
}

// ── gameover ─────────────────────────────────────────────────────────
export function renderGameover() {
  const page = docPage('// Admission · ~~ends~~ stops here');

  const intro = el('div', { class: 'doc-prose' });
  intro.innerHTML = parseProse(
    `I fell at descent ${state.wave}. The line is ~~broken~~ unfinished. The room is ~~empty~~ quiet now.`
  );
  page.appendChild(intro);

  const note = el('div', { class: 'doc-prose dim' });
  note.innerHTML = parseProse('Another file has been opened. !!0413 was already taken.!! Someone else will take what I could not.');
  page.appendChild(note);

  page.appendChild(actionRow(docButton('Begin another admission', () => { resetGame(); render(); })));
  app().appendChild(page);
}

// ── helpers ──────────────────────────────────────────────────────────
function docPage(tag) {
  const wrap = el('div', { class: 'doc-page' });
  wrap.appendChild(el('div', { class: 'doc-page-tag' }, tag));
  return wrap;
}

function docStripPart(text) {
  return el('span', { class: 'doc-strip-cell' }, text);
}

function actionRow(...children) {
  const row = el('div', { class: 'doc-action-row' });
  for (const c of children) if (c) row.appendChild(c);
  return row;
}

function docButton(label, onclick, variant) {
  const cls = 'doc-button' + (variant ? ' ' + variant : '');
  return el('button', { class: cls, onclick }, [
    el('span', { class: 'doc-button-marker' }, '▸ '),
    el('span', {}, label),
  ]);
}

function pad2(n) { return String(Math.max(0, n | 0)).padStart(2, '0'); }
