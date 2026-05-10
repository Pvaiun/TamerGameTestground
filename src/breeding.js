import { rand } from './rng.js';
import { TEMPLATES } from './data.js';
import { state, nextCreatureId } from './state.js';
import { blendPalettes } from './art.js';
import { advanceWave } from './ui/render.js';

// Breed a child from two parents.
//   - Child starts at level 1.
//   - Stats = average of parents' CURRENT stats (so leveled parents make stronger newborns).
//   - Growth rates blended: shape-parent's growth weighted 65%, other parent 35%.
//   - Species/type follow speciesFromB (whichever parent owns the first picked passive).
//   - Palette blends.
export function makeChild(pa, pb, abilities, passives, speciesFromB) {
  const speciesSource = speciesFromB ? pb : pa;
  const otherParent  = speciesFromB ? pa : pb;
  const template = TEMPLATES.find(t => t.species === speciesSource.species);
  const palette = blendPalettes(pa.palette, pb.palette);
  const growth = {
    hp:  speciesSource.growth.hp  * 0.65 + otherParent.growth.hp  * 0.35,
    atk: speciesSource.growth.atk * 0.65 + otherParent.growth.atk * 0.35,
    def: speciesSource.growth.def * 0.65 + otherParent.growth.def * 0.35,
    spd: speciesSource.growth.spd * 0.65 + otherParent.growth.spd * 0.35,
  };
  const variance = (n) => Math.round(n * (rand(-0.05, 0.05)));
  const stats = {
    hp:  Math.max(8, Math.round((pa.stats.hp  + pb.stats.hp ) / 2) + variance(8)),
    atk: Math.max(2, Math.round((pa.stats.atk + pb.stats.atk) / 2) + variance(3)),
    def: Math.max(1, Math.round((pa.stats.def + pb.stats.def) / 2) + variance(3)),
    spd: Math.max(1, Math.round((pa.stats.spd + pb.stats.spd) / 2) + variance(3)),
  };
  return {
    id: nextCreatureId(),
    species: template.species,
    type: speciesSource.type,
    growth,
    level: 1,
    xp: 0,
    stats,
    maxHp: stats.hp,
    abilities,
    passives,
    palette,
    customName: null,
  };
}

export function finalizeBreed() {
  state.party = [];
  state.reserve = [];
  const newParty = state.breedState.picks.map(p => p[2]);
  state.party = newParty;
  state.breedState = null;
  advanceWave();
}
