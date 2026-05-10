import { rand } from './rng.js';
import { TEMPLATES } from './data.js';
import { state, nextCreatureId, PARTY_CAP, TOTAL_WAVES } from './state.js';
import { blendPalettes } from './art.js';
import { advanceWave, render } from './ui/render.js';

// Breed a child from two parents. The child takes the BEST stat of each parent
// (slight variance), so children are an upgrade — the ritual is supposed to be
// worth the cost of two creatures.
//   - Level = max(parents) + 1
//   - Stats = max of parents per stat + small variance
//   - Growth = species-shape parent's growth weighted 70%, other 30%
//   - Species/type follow speciesFromB
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
  // Child gets the best of each parent + 10% bonus + small variance, so the
  // ritual produces a creature stronger than either parent (the cost is two
  // creatures consumed).
  const bonus = (n) => Math.max(1, Math.round(n * 0.10 + rand(0, 1)));
  const stats = {
    hp:  Math.max(8, Math.max(pa.stats.hp,  pb.stats.hp)  + bonus(Math.max(pa.stats.hp,  pb.stats.hp))),
    atk: Math.max(2, Math.max(pa.stats.atk, pb.stats.atk) + bonus(Math.max(pa.stats.atk, pb.stats.atk))),
    def: Math.max(1, Math.max(pa.stats.def, pb.stats.def) + bonus(Math.max(pa.stats.def, pb.stats.def))),
    spd: Math.max(1, Math.max(pa.stats.spd, pb.stats.spd) + bonus(Math.max(pa.stats.spd, pb.stats.spd))),
  };
  const level = Math.max(pa.level, pb.level) + 1;
  return {
    id: nextCreatureId(),
    species: template.species,
    type: speciesSource.type,
    growth,
    level,
    xp: 0,
    stats,
    maxHp: stats.hp,
    abilities,
    passives,
    palette,
    customName: null,
    // Child inherits the species-shape parent's signature mechanic.
    signature: template.signature || null,
  };
}

// finalizeBreed removes the two parents from party/reserve and inserts the child.
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
    state.screen = 'path';
    render();
  }
}
