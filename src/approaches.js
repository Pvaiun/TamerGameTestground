// Approach dispatchers. Called from intake.js when the player plays a card.
// helpers exposes the legal mutations on intake state — no direct state writes
// from this file so that engine and effects stay decoupled.

import { APPROACHES, INTENTS, CATEGORIES } from './data.js';
import { state } from './state.js';
import { effectiveScarCostMod } from './intake.js';

export function effectiveCost(a) {
  if (!a) return 0;
  let cost = a.cost ?? 1;
  cost += effectiveScarCostMod(a.key);
  return Math.max(0, cost);
}

export function canPlay(a, intake) {
  if (!a || !intake || intake.ended) return false;
  if (a.kind === 'name_them') return intake.player.insight >= intake.player.insightMax;
  if (a.kind === 'cleanse') return state.scars && state.scars.length > 0;
  return effectiveCost(a) <= intake.player.pages;
}

export function resolveApproach(a, intake, h) {
  const p = intake.patient;
  const player = intake.player;
  switch (a.kind) {
    case 'listen': {
      h.blockClassThisTurn('speech');
      return;
    }
    case 'note': {
      const wasRevealed = p.revealedFragments;
      h.revealFragment();
      if (p.revealedFragments > wasRevealed && !player._notedThisIntake) {
        player._notedThisIntake = true;
        h.addInsight(1);
      }
      return;
    }
    case 'press': {
      h.setForceRepeat();
      h.blockClassThisTurn('speech');
      return;
    }
    case 'step_back': {
      h.addStepBackReduction(2);
      return;
    }
    case 'wait': {
      if (p.category === 'witness') h.addInsight(1);
      h.blockClassThisTurn('psychic');
      h.requestEndTurn();
      return;
    }
    case 'category_pull': {
      const params = a.params || {};
      const isMatch = p.category === a.category;
      if (isMatch) {
        h.addInsight(params.matchInsight || 3);
        for (let i = 0; i < (params.matchReveal || 1); i++) h.revealFragment();
        if (!p.categoryRevealed) h.revealCategory();
      } else {
        if (params.missDamage) h.damageComposure(params.missDamage);
        if (params.missComposure) h.addComposure(params.missComposure);
      }
      if (params.blocksClass) h.blockClassThisTurn(params.blocksClass);
      return;
    }
    case 'match': {
      h.revealCategory();
      if (p.category === 'stranger') h.addInsight(3);
      else h.addInsight(1);
      return;
    }
    case 'tell': {
      player._toldProtagFile = (player._toldProtagFile || 0) + 1;
      h.addInsight(p.category === 'visitor' ? 2 : 1);
      h.blockClassThisTurn('intimacy');
      return;
    }
    case 'restrain': {
      h.setRestrain(2);
      h.blockClassThisTurn('physical');
      return;
    }
    case 'sedate': {
      h.setSedate(2);
      if (player.insight > 0) player.insight -= 1;
      return;
    }
    case 'mirror': {
      h.learnLastIntentMirror();
      return;
    }
    case 'pry': {
      h.revealFragment();
      h.revealFragment();
      if (p.intentPool.includes('lash_out')) p.nextIntent = 'lash_out';
      return;
    }
    case 'linger': {
      h.addPagesNextTurn(2);
      h.requestEndTurn();
      return;
    }
    case 'mark': {
      h.addInsight(2);
      h.damageComposure(1);
      return;
    }
    case 'cleanse': {
      h.cleanseScar();
      return;
    }
    case 'lean_in': {
      player._leanInArmed = true;
      h.addInsight(4);
      return;
    }
    case 'refuse': {
      h.setRefuseNext();
      if (player.insight > 0) player.insight -= 1;
      return;
    }
    case 'document': {
      const before = p.revealedFragments;
      h.revealFragment();
      if (p.revealedFragments === before) h.addInsight(1);
      return;
    }
    case 'diagnose': {
      const guess = intake._diagnoseChoice;
      if (guess) {
        h.diagnoseCategory(guess);
        intake._diagnoseChoice = null;
      }
      return;
    }
    case 'name_them': {
      if (player.insight >= player.insightMax) h.endIntakeWin();
      return;
    }
    default:
      return;
  }
}
