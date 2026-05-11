// Beat-driven log orchestration.
//
// "Beat" = one drain step. drainBeats walks new gameLog entries since the
// previous drain and shows them with a short pace, firing each entry's
// deferred animation when revealed.

import { state } from '../state.js';
import { sleep } from '../rng.js';
import { render } from '../ui/render.js';

let drainCursor = 0;

export function snapBeats() { drainCursor = state.gameLog.length; }

export async function drainBeats() {
  const speed = state.combatSpeed || 2;
  while (drainCursor < state.gameLog.length) {
    const idx = drainCursor++;
    const entry = state.gameLog[idx];
    if (entry && !entry.fired) {
      entry.fired = true;
      if (entry.anim) { try { entry.anim(); } catch (e) { console.error(e); } }
    }
    render();
    // Faster, snappier dwell times. Speed 2 (fast) is ~80-180ms.
    let dwell = entry.cls === 'crit' ? 320
              : (entry.damage || entry.heal) ? 200
              : entry.cls === 'sys' ? 220
              : entry.cls === 'fade' ? 120
              : 160;
    if (speed === 2) dwell = Math.round(dwell * 0.50);
    await sleep(dwell);
  }
}
