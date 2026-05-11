import { rand } from './rng.js';
import { TEMPLATES, ARCHETYPES } from './data.js';
import { state, nextCreatureId, PARTY_CAP, TOTAL_WAVES } from './state.js';
import { blendPalettes } from './art.js';
import { advanceWave, render } from './ui/render.js';

// Breed a child from two parents.
//   - Stats = max-of-parents + 10% bonus
//   - Level = max(parents) + 1
//   - Growth = weighted toward species-shape parent
//   - Archetype = species-shape parent's archetype
//   - Abilities + passives: union, chosen by player
//
// The child is a HYBRID if the two parents are different archetypes — the
// child can hold abilities from both archetypes and tracks stacks for both.
export function makeChild(pa, pb, abilities, passives, speciesFromB) {
  const speciesSource = speciesFromB ? pb : pa;
  const otherParent  = speciesFromB ? pa : pb;
  const template = TEMPLATES.find(t => t.species === speciesSource.species);
  const palette = blendPalettes(pa.palette, pb.palette);
  const growth = {
    hp:  speciesSource.growth.hp  * 0.70 + otherParent.growth.hp  * 0.30,
    atk: speciesSource.growth.atk * 0.70 + otherParent.growth.atk * 0.30,
    def: speciesSource.growth.def * 0.70 + otherParent.growth.def * 0.30,
    spd: speciesSource.growth.spd * 0.70 + otherParent.growth.spd * 0.30,
  };
  const bonus = (n) => Math.max(1, Math.round(n * 0.10 + rand(0, 1)));
  const stats = {
    hp:  Math.max(10, Math.max(pa.stats.hp,  pb.stats.hp)  + bonus(Math.max(pa.stats.hp,  pb.stats.hp))),
    atk: Math.max(3,  Math.max(pa.stats.atk, pb.stats.atk) + bonus(Math.max(pa.stats.atk, pb.stats.atk))),
    def: Math.max(2,  Math.max(pa.stats.def, pb.stats.def) + bonus(Math.max(pa.stats.def, pb.stats.def))),
    spd: Math.max(2,  Math.max(pa.stats.spd, pb.stats.spd) + bonus(Math.max(pa.stats.spd, pb.stats.spd))),
  };
  const level = Math.max(pa.level, pb.level) + 1;
  // Archetype: inherit from species-shape parent
  const archetype = speciesSource.archetype || template.archetype || 'striker';
  return {
    id: nextCreatureId(),
    species: template.species,
    type: speciesSource.type,
    archetype,
    growth,
    level,
    xp: 0,
    stats,
    maxHp: stats.hp,
    abilities,
    passives,
    palette,
    customName: null,
  };
}

export function finalizeBreed(pa, pb, child) {
  state.party   = state.party.filter(c => c.id !== pa.id && c.id !== pb.id);
  state.reserve = state.reserve.filter(c => c.id !== pa.id && c.id !== pb.id);
  if (state.party.length < PARTY_CAP) state.party.push(child);
  else state.reserve.push(child);
  if (state.activeIdx >= state.party.length) state.activeIdx = 0;
  state.breedState = null;
  if (state.party.length === 0) {
    state.screen = 'gameover';
    render();
    return;
  }
  if (state.wave + 1 >= TOTAL_WAVES) {
    state.pendingRoomKind = 'boss';
    advanceWave();
  } else {
    state.pathChoices = null;
    state.screen = 'path';
    render();
  }
}
