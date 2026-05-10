// Energy-based, multi-action turn combat.
//
// Round structure:
//   1. roundStart: tick statuses+ticks, fire round_start passives, refresh
//      energy to maxEnergy on both sides, decide who goes first.
//   2. firstSide takes their turn: plays actions until energy=0 or end turn.
//   3. secondSide takes their turn.
//   4. End-of-round bookkeeping (timed buffs decrement, etc.). Loop.
//
// "Turn" within this file = one fighter's playing block (multiple actions).
// "Action" = one ability resolution.
//
// State machine:
//   state.turnPhase: 'idle' | 'player' | 'enemy' | 'tick' | 'done'
//   state.round: 1-indexed round number
//
// Public: beginBattle, playerAct, playerEndTurn, playerSwap, finishBattleIfDone,
//         handleFaintsIfAny.

import { ABILITIES, STATUSES, RELICS } from '../data.js';
import { sleep } from '../rng.js';
import { state, pushGame, pushLore, TOTAL_WAVES } from '../state.js';
import { displayName, gainXp, freshFighter } from '../creature.js';
import { sfx } from '../audio.js';
import { applyBattleStartPassive, applySwapInPassives, applyRoundStartPassives, winsTies } from './passives.js';
import { effectiveStat, calculateDamage, abilityCost } from './damage.js';
import { applyStatus, cleanseStatuses, applyHeal, tickStartOfRound, tickFighterStatuses } from './status.js';
import { aiChoose, aiPlanIntent } from './ai.js';
import {
  applyCursedOnSwap,
  processPostHit,
  runTimedEffects,
  runEachHitEffects,
  effParam,
  abilityHasTag,
} from './abilities.js';
import { spawnFloat, shakeStage, playLunge, playRecoil } from '../ui/animations.js';
import { render } from '../ui/render.js';
import { drainBeats, snapBeats, useLine, hitLine, flavorLine, eventText } from './log.js';

const lower = (s) => String(s || '');
const D = (...args) => {}; // debug noop

// ─── helpers ─────────────────────────────────────────────────────────

function relicAny(field) {
  return state.relics && state.relics.some(r => r && r[field]);
}

// Fighter-to-side resolver.
function sideOf(f) {
  if (f === state.pf) return 'player';
  if (f === state.ef) return 'enemy';
  if (f === state.bf) return 'player';
  if (f === state.ebf) return 'enemy';
  return null;
}
function activeOnSide(side) { return side === 'player' ? state.pf : state.ef; }
function benchOnSide(side)  { return side === 'player' ? state.bf : state.ebf; }

function partyName(f) { return lower(displayName(f.creature)); }

// ─── battle init ─────────────────────────────────────────────────────

export function beginBattle() {
  const playerActive = state.party[state.activeIdx];
  const playerBench  = state.party[1 - state.activeIdx] || null;
  state.pf = freshFighter(playerActive);
  state.bf = playerBench ? freshFighter(playerBench) : null;
  if (state.bf) state.bf.onBench = true;
  state.enemyActiveIdx = 0;
  state.ef  = freshFighter(state.enemyParty[0]);
  state.ebf = state.enemyParty.length > 1 ? freshFighter(state.enemyParty[1]) : null;
  if (state.ebf) state.ebf.onBench = true;
  state.enemy = state.enemyParty[0];

  applyBattleStartPassives(state.pf, state.ef);
  if (state.bf)  applyBattleStartPassives(state.bf,  state.ef);
  if (state.ebf) applyBattleStartPassives(state.ebf, state.pf);
  applyRelicBattleStart();

  state.gameLog = [];
  state.loreLine = null;
  state.round = 0;
  state.acting = false;
  state.turnPhase = 'idle';
  state.enemyIntent = null;

  pushGame('— battle begins —', { cls: 'sys' });
  pushLore(`They are at the door. ${state.enemyParty.map(e => lower(displayName(e))).join(' and ')}.`);

  state.screen = 'battle';
  render();
  // Kick off round 1.
  startRound();
}

function applyBattleStartPassives(pf, ef) {
  const cbs = { applyStatus, applyHeal, spawnFloat, pushGame, pushLore, displayName, cleanseStatuses };
  applyBattleStartPassive(pf, ef, cbs);
  applyBattleStartPassive(ef, pf, cbs);
}

function applyRelicBattleStart() {
  if (!state.relics || !state.relics.length) return;
  for (const r of state.relics) {
    if (r.startStatusEnemy && state.ef && state.ef.hp > 0) {
      applyStatus(state.ef, r.startStatusEnemy, {});
      pushGame(`Note · ${r.name} → enemy ${prettyStatus(r.startStatusEnemy)}.`, { cls: 'sys' });
    }
  }
}

function prettyStatus(k) {
  return ({ burn: 'Fevering', bloom: 'Mending', soaking: 'Drained', cursed: 'Broken', dazed: 'Sedated' })[k] || k;
}

// ─── round flow ──────────────────────────────────────────────────────

async function startRound() {
  state.round++;
  state.acting = true;
  state.turnPhase = 'tick';
  state.turnsTakenThisRound = 0;
  // Apply tick statuses (start-of-round): burn/bloom hp ticks, healing-over-time progress
  await tickStartOfRound(state.pf, 'player');
  if (state.ef && state.ef.hp > 0) await tickStartOfRound(state.ef, 'enemy');
  // Bench statuses (silent)
  if (state.bf  && state.bf.hp  > 0) await tickFighterStatuses(state.bf,  'player', true);
  if (state.ebf && state.ebf.hp > 0) await tickFighterStatuses(state.ebf, 'enemy', true);
  // Bench tick relics
  applyBenchTickRelics();
  // Round_start passives
  const cbs = { applyHeal, applyStatus, cleanseStatuses, spawnFloat, pushGame, pushLore, displayName };
  applyRoundStartPassives(state.pf, 'player', cbs);
  applyRoundStartPassives(state.ef, 'enemy', cbs);
  // Refresh energy + actions
  resetTurn(state.pf);
  resetTurn(state.ef);
  // Decide who goes first this round
  const pSpd = effectiveStat(state.pf, 'spd');
  const eSpd = effectiveStat(state.ef, 'spd');
  let pFirst;
  if (pSpd !== eSpd) pFirst = pSpd > eSpd;
  else if (winsTies(state.pf)) pFirst = true;
  else if (winsTies(state.ef)) pFirst = false;
  else pFirst = Math.random() < 0.5;
  state.firstThisRound = pFirst ? 'player' : 'enemy';
  // Plan enemy intent for this round
  state.enemyIntent = aiPlanIntent(state.ef, state.pf);

  pushGame(`Round ${state.round} · ${pFirst ? 'you go first' : 'they go first'}.`, { cls: 'sys' });
  await drainBeats();

  // Check for faints from start-of-round damage (e.g. burn lethal)
  if (await handleFaintsIfAny()) {
    // proceed to whoever's first
    state.acting = false;
    if (state.firstThisRound === 'player') state.turnPhase = 'player';
    else                                   { await runEnemyTurn(); await afterEnemyOrPlayerTurn('enemy'); }
    render();
  } else {
    render();
  }
}

function resetTurn(f) {
  if (!f) return;
  f.energy = f.maxEnergy;
  f.actionsThisTurn = 0;
}

function applyBenchTickRelics() {
  if (!state.relics || !state.relics.length) return;
  if (state.bf && state.bf.hp > 0) {
    for (const r of state.relics) if (r.benchTickHeal) {
      const amt = Math.round(state.bf.creature.maxHp * r.benchTickHeal);
      const healed = applyHeal(state.bf, amt);
      if (healed > 0) {
        pushGame(`Bench · ${displayName(state.bf.creature)} +${healed} hp from ${r.name}.`, { cls: 'fade' });
      }
    }
  }
}

// Called after either side ends their turn. Decides whether to kick off the
// other side's turn or end the round.
async function afterEnemyOrPlayerTurn(side) {
  if (!await handleFaintsIfAny()) return;
  // If the other side hasn't gone yet this round, run them.
  const otherSide = side === 'player' ? 'enemy' : 'player';
  const wentFirst = state.firstThisRound;
  if (otherSide === wentFirst) {
    // Other side hasn't gone yet this round (we're the 2nd player to go).
    // If we're second already, end round.
  }
  // Logic: if 'side' just finished and the other side hasn't gone yet, kick off other.
  // Track via tail: state.turnsTakenThisRound
  state.turnsTakenThisRound = (state.turnsTakenThisRound || 0) + 1;
  if (state.turnsTakenThisRound < 2) {
    if (otherSide === 'player') {
      state.turnPhase = 'player';
      state.acting = false;
      render();
    } else {
      await runEnemyTurn();
      await afterEnemyOrPlayerTurn('enemy');
    }
  } else {
    // Both sides went; end round, check victory, start next.
    state.turnsTakenThisRound = 0;
    await endRoundCleanup();
    if (await handleFaintsIfAny()) {
      // Continue next round
      if (state.screen === 'battle') startRound();
    }
  }
}

async function endRoundCleanup() {
  // Tick timed buffs (decrement) and any other end-of-round bookkeeping
  tickTimedBuffs(state.pf);
  if (state.ef) tickTimedBuffs(state.ef);
  if (state.bf)  tickTimedBuffs(state.bf);
  if (state.ebf) tickTimedBuffs(state.ebf);
}

function tickTimedBuffs(f) {
  if (!f || !f.timedBuffs || !f.timedBuffs.length) return;
  const remaining = [];
  for (const b of f.timedBuffs) {
    b.turnsLeft--;
    if (b.turnsLeft <= 0) {
      for (const [k, v] of Object.entries(b.statMods)) f.statMods[k] = (f.statMods[k] || 0) - v;
    } else remaining.push(b);
  }
  f.timedBuffs = remaining;
}

// ─── player input ────────────────────────────────────────────────────

export async function playerAct(abilityKey) {
  if (state.turnPhase !== 'player' || state.acting) return;
  const a = ABILITIES[abilityKey];
  if (!a) return;
  const cost = abilityCost(a, state.pf);
  if (cost > state.pf.energy) return;
  state.acting = true;
  state.pf.energy -= cost;
  await runAction('player', state.pf, state.ef, a);
  state.acting = false;
  // If fainted, handled by handleFaintsIfAny inside runAction's chain.
  if (!await handleFaintsIfAny()) return;
  // Auto-end turn if energy drained
  if (state.pf.energy <= 0) {
    return playerEndTurn();
  }
  render();
}

export async function playerEndTurn() {
  if (state.turnPhase !== 'player') return;
  state.turnPhase = 'idle';
  pushGame('— you end your turn —', { cls: 'sys' });
  await drainBeats();
  await afterEnemyOrPlayerTurn('player');
}

export async function playerSwap() {
  if (state.turnPhase !== 'player' || state.acting) return;
  if (!state.bf || state.bf.hp <= 0) return;
  // Swap is treated as a 1-cost action.
  if (state.pf.energy < 1) return;
  state.acting = true;
  state.pf.energy -= 1;
  await doSwap('player');
  state.acting = false;
  if (!await handleFaintsIfAny()) return;
  if (state.pf.energy <= 0) return playerEndTurn();
  render();
}

// ─── enemy turn ──────────────────────────────────────────────────────

async function runEnemyTurn() {
  state.turnPhase = 'enemy';
  state.acting = true;
  render();
  // Loop: AI picks an action that fits in remaining energy, plays it.
  // If AI returns null, end turn.
  let safety = 8;
  while (state.ef && state.ef.hp > 0 && state.ef.energy > 0 && safety-- > 0) {
    const choice = aiChoose(state.ef, state.pf);
    if (!choice) break;
    if (choice === '_swap') {
      if (state.ebf && state.ebf.hp > 0 && state.ef.energy >= 1) {
        state.ef.energy -= 1;
        await doSwap('enemy');
        if (state.pf.hp <= 0 || state.ef.hp <= 0) break;
        continue;
      } else break;
    }
    const a = ABILITIES[choice];
    if (!a) break;
    const cost = abilityCost(a, state.ef);
    if (cost > state.ef.energy) break;
    state.ef.energy -= cost;
    await runAction('enemy', state.ef, state.pf, a);
    if (state.pf.hp <= 0 || state.ef.hp <= 0) break;
  }
  pushGame('— they end their turn —', { cls: 'sys' });
  await drainBeats();
  state.turnPhase = 'idle';
  state.acting = false;
}

// ─── action resolution ───────────────────────────────────────────────

async function runAction(side, attacker, defender, ability) {
  const oside = side === 'player' ? 'enemy' : 'player';
  const phases = ability.phases || [[]];
  const phase = phases[0] || [];
  const helpers = { performSelfSwap, doSwap };
  attacker.actionsThisTurn = (attacker.actionsThisTurn || 0) + 1;

  // Compose the use line for game log + lore.
  const actorName = partyName(attacker);
  const cost = abilityCost(ability, attacker);
  pushGame(`${cap(actorName)} · ${ability.name} (${cost}E)`, {
    cls: 'act',
    actor: side,
    anim: () => playLunge(side),
  });
  // Lore line for this action
  const flavor = flavorLine(attacker, ability);
  if (flavor) pushLore(flavor);
  await drainBeats();

  // Run before-timed effects
  await runTimedEffects('before', phase, { side, oside, attacker, defender, helpers, lastDmg: 0 });
  await drainBeats();

  // Dazed check (only on damage abilities)
  const hasDamage = phase.some(e => e.type === 'damage');
  if (hasDamage && attacker.statuses && attacker.statuses.dazed && Math.random() < (attacker.statuses.dazed.skipChance ?? 0.35)) {
    pushGame(`${cap(actorName)} can't focus — Sedated.`, { cls: 'eff' });
    await drainBeats();
    return;
  }

  // Damage effects
  const dmgEffects = phase.filter(e => e.type === 'damage');
  for (const dmgEff of dmgEffects) {
    const targetKeys = effParam(dmgEff, 'targets') || ['enemy'];
    const hits = effParam(dmgEff, 'hits') || 1;
    for (const tk of targetKeys) {
      const fighters = resolveTargetsForDamage(tk, side, attacker, defender);
      const targetSide = (tk === 'self' || tk === 'bench') ? side : oside;
      for (const target of fighters) {
        for (let h = 0; h < hits; h++) {
          if (target.hp <= 0 || attacker.hp <= 0) break;
          const result = calculateDamage(attacker, target, ability, dmgEff, phase);
          if (result.evaded) {
            pushGame(`${cap(partyName(target))} evades.`, { cls: 'eff', anim: () => spawnFloat(targetSide, 'evade', 'heal') });
            await drainBeats();
            continue;
          }
          target.hp = Math.max(0, target.hp - result.dmg);
          const tag = result.crit ? ' ✶ crit'
                    : result.mult > 1 ? ' ✶ super'
                    : result.mult < 1 ? ' (resisted)'
                    : '';
          pushGame(`${cap(partyName(target))}${tag}`, {
            cls: result.crit ? 'crit' : (result.mult !== 1 ? 'eff' : 'hit'),
            damage: result.dmg,
            actor: side,
            anim: () => {
              spawnFloat(targetSide, String(result.dmg), result.crit ? 'crit' : 'dmg');
              if (result.crit) sfx('crit'); else sfx('hit');
              shakeStage();
              playRecoil(targetSide);
            },
          });
          await drainBeats();
          processPostHit(side, oside, attacker, target, ability, result);
          await runEachHitEffects(phase, { side, oside, attacker, defender: target, helpers, lastDmg: result.dmg });
          attacker.attacksMade = (attacker.attacksMade || 0) + 1;
          await drainBeats();
        }
      }
    }
  }

  // After-timed effects (apply_status, swap, etc.)
  await runTimedEffects('after', phase, { side, oside, attacker, defender, helpers, lastDmg: 0 });
  await drainBeats();
}

function resolveTargetsForDamage(targetKey, side, attacker, defender) {
  const ownBench   = side === 'player' ? state.bf  : state.ebf;
  const enemyBench = side === 'player' ? state.ebf : state.bf;
  if (targetKey === 'self')        return attacker.hp > 0 ? [attacker] : [];
  if (targetKey === 'bench')       return ownBench && ownBench.hp > 0 ? [ownBench] : [];
  if (targetKey === 'enemy')       return defender && defender.hp > 0 ? [defender] : [];
  if (targetKey === 'enemy_bench') return enemyBench && enemyBench.hp > 0 ? [enemyBench] : [];
  if (targetKey === 'all_enemies') {
    const out = [];
    if (defender && defender.hp > 0) out.push(defender);
    if (enemyBench && enemyBench.hp > 0) out.push(enemyBench);
    return out;
  }
  return [];
}

// ─── swap helpers ────────────────────────────────────────────────────

async function performSelfSwap(side, attacker, swapEff) {
  await doSwap(side, swapEff);
}

async function doSwap(side, swapEff) {
  const benchFighter = side === 'player' ? state.bf : state.ebf;
  if (!benchFighter || benchFighter.hp <= 0) {
    pushGame(`${cap(side === 'player' ? partyName(state.pf) : partyName(state.ef))} has no bench.`, { cls: 'eff' });
    await drainBeats();
    return;
  }
  const out = side === 'player' ? state.pf : state.ef;
  applyCursedOnSwap(out, side);
  pushGame(`${cap(partyName(out))} steps back. ${cap(partyName(benchFighter))} forward.`, { cls: 'eff', anim: () => sfx('select') });
  await drainBeats();
  if (side === 'player') {
    state.pf = state.bf; state.bf = out;
    state.activeIdx = 1 - state.activeIdx;
  } else {
    state.ef = state.ebf; state.ebf = out;
    state.enemyActiveIdx = 1 - state.enemyActiveIdx;
    state.enemy = state.enemyParty[state.enemyActiveIdx];
  }
  out.onBench = true;
  const incoming = side === 'player' ? state.pf : state.ef;
  incoming.onBench = false;
  // Apply swap effect modifiers (buffOnSwap, healOnSwap)
  if (swapEff) {
    if (swapEff.buffOnSwap) {
      for (const [k, v] of Object.entries(swapEff.buffOnSwap)) {
        if (typeof v === 'number' && v !== 0) incoming.statMods[k] = (incoming.statMods[k] || 0) + v;
      }
    }
    if (swapEff.healOnSwap > 0) {
      const amt = Math.round(incoming.creature.maxHp * swapEff.healOnSwap);
      const healed = applyHeal(incoming, amt);
      if (healed > 0) pushGame(`${cap(partyName(incoming))} +${healed}`, { heal: healed, cls: 'heal' });
    }
  }
  applySwapInPassives(incoming, out, side, { applyHeal, cleanseStatuses, spawnFloat, pushGame, pushLore, displayName });
  await drainBeats();
}

// ─── faint handling ──────────────────────────────────────────────────

function tryRevive() {
  if (!state.relics || state.usedRevive) return false;
  const reviver = state.relics.find(r => r && r.reviveOnce);
  if (!reviver) return false;
  const candidates = [state.pf, state.bf].filter(f => f && f.hp <= 0);
  if (!candidates.length) return false;
  candidates.sort((a, b) => b.creature.maxHp - a.creature.maxHp);
  const target = candidates[0];
  target.hp = Math.max(1, Math.round(target.creature.maxHp * reviver.reviveOnce));
  state.usedRevive = true;
  pushGame(`${reviver.name} · ${cap(partyName(target))} stands again.`, { cls: 'sys', heal: target.hp });
  pushLore('The letter is opened. ~~A signature I do not recognize.~~');
  return true;
}

export async function handleFaintsIfAny() {
  // Player active fainted
  if (state.pf.hp <= 0) {
    pushGame(`${cap(partyName(state.pf))} falls.`, { cls: 'eff', anim: () => sfx('faint') });
    await drainBeats();
    if (state.bf && state.bf.hp > 0) {
      const out = state.pf;
      state.pf = state.bf; state.bf = out;
      state.activeIdx = 1 - state.activeIdx;
      state.pf.onBench = false;
      pushGame(`${cap(partyName(state.pf))} steps in.`, { cls: 'eff' });
      await drainBeats();
    } else if (tryRevive()) {
      await drainBeats();
    } else {
      state.screen = 'gameover';
      state.turnPhase = 'done';
      render();
      return false;
    }
  }
  // Enemy active fainted
  if (state.ef.hp <= 0) {
    pushGame(`${cap(partyName(state.ef))} falls.`, { cls: 'eff', anim: () => sfx('faint') });
    await drainBeats();
    if (state.ebf && state.ebf.hp > 0) {
      const out = state.ef;
      state.ef = state.ebf; state.ebf = out;
      state.enemyActiveIdx = 1 - state.enemyActiveIdx;
      state.enemy = state.enemyParty[state.enemyActiveIdx];
      state.ef.onBench = false;
      pushGame(`${cap(partyName(state.ef))} steps in.`, { cls: 'eff' });
      await drainBeats();
    } else {
      finishBattleIfDone();
      return false;
    }
  }
  return true;
}

// ─── battle end ──────────────────────────────────────────────────────

export function finishBattleIfDone() {
  state.turnPhase = 'done';
  if (state.wave === TOTAL_WAVES) {
    state.screen = 'victory';
    sfx('victory');
    render();
    return;
  }
  const totalEnemyLevel = state.enemyParty.reduce((sum, e) => sum + e.level, 0);
  const eliteMult = state.isEliteBattle ? 1.5 : 1.0;
  let xpGained = Math.round((totalEnemyLevel * 5 + 18) * eliteMult);
  if (state.relics && state.relics.length) {
    for (const r of state.relics) if (r.capturedBonusXp) xpGained = Math.round(xpGained * (1 + r.capturedBonusXp));
  }
  const xpReports = [];
  let anyLeveled = false;
  const allCreatures = [...state.party, ...state.reserve];
  for (const c of allCreatures) {
    const events = gainXp(c, xpGained);
    if (events.length) anyLeveled = true;
    xpReports.push({ creature: c, levelEvents: events, isReserve: !state.party.includes(c) });
  }
  if (anyLeveled) sfx('levelup');
  state.postBattleEvents = {
    xpGained,
    xpReports,
    capturedChoices: [...state.enemyParty],
    capturedSelected: null,
    isElite: state.isEliteBattle,
  };
  state.screen = 'aftermath';
  for (const c of state.party) c.maxHp = c.stats.hp;
  state.isEliteBattle = false;
  render();
}

function cap(s) { return String(s || '').replace(/^./, c => c.toUpperCase()); }
