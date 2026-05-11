// Energy-based, multi-action turn combat.
//
// Round structure:
//   1. roundStart: tick statuses, fire round_start passives, refresh energy.
//   2. firstSide plays actions until energy=0 or end turn.
//   3. secondSide plays.
//   4. End-of-round bookkeeping (timed buffs decrement). Loop.

import { ABILITIES, STATUSES, RELICS } from '../data.js';
import { sleep } from '../rng.js';
import { state, pushGame, TOTAL_WAVES } from '../state.js';
import { displayName, gainXp, freshFighter } from '../creature.js';
import { sfx } from '../audio.js';
import { applyBattleStartPassive, applySwapInPassives, applyRoundStartPassives, winsTies } from './passives.js';
import { effectiveStat, abilityCost, calculateDamage } from './damage.js';
import { applyStatus, cleanseStatuses, applyHeal, tickStartOfRound, tickFighterStatuses } from './status.js';
import { aiChoose, aiPlanIntent } from './ai.js';
import { processPostHit, runTimedEffects, runEachHitEffects } from './abilities.js';
import { spawnFloat, shakeStage, playLunge, playRecoil } from '../ui/animations.js';
import { render } from '../ui/render.js';
import { drainBeats } from './log.js';

const lower = (s) => String(s || '');

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

  applyBattleStartCascade();
  applyRelicBattleStart();

  state.gameLog = [];
  state.loreLine = null;
  state.round = 0;
  state.acting = false;
  state.turnPhase = 'idle';
  state.enemyIntent = null;
  state.usedRevive = false;

  pushGame('— battle begins —', { cls: 'sys' });

  state.screen = 'battle';
  render();
  startRound();
}

function applyBattleStartCascade() {
  const cbs = { applyStatus, applyHeal, spawnFloat, pushGame, displayName, cleanseStatuses };
  applyBattleStartPassive(state.pf,  state.ef, cbs);
  applyBattleStartPassive(state.ef,  state.pf, cbs);
  if (state.bf)  applyBattleStartPassive(state.bf,  state.ef, cbs);
  if (state.ebf) applyBattleStartPassive(state.ebf, state.pf, cbs);
}

function applyRelicBattleStart() {
  if (!state.relics || !state.relics.length) return;
  for (const r of state.relics) {
    if (r.startStatusEnemy && state.ef && state.ef.hp > 0) {
      applyStatus(state.ef, r.startStatusEnemy, {});
      pushGame(`Note · ${r.name} → enemy ${prettyStatus(r.startStatusEnemy)}.`, { cls: 'sys' });
    }
    if (r.startCharge && state.pf) {
      state.pf.charge = Math.min(3, (state.pf.charge || 0) + r.startCharge);
    }
  }
}

function prettyStatus(k) {
  return ({ burn: 'Fevering', brittle: 'Brittle', drained: 'Drained', stun: 'Stunned' })[k] || k;
}

// ─── round flow ──────────────────────────────────────────────────────

async function startRound() {
  state.round++;
  state.acting = true;
  state.turnPhase = 'tick';
  state.turnsTakenThisRound = 0;

  await tickStartOfRound(state.pf, 'player');
  if (state.ef && state.ef.hp > 0) await tickStartOfRound(state.ef, 'enemy');
  if (state.bf  && state.bf.hp  > 0) await tickFighterStatuses(state.bf,  'player', true);
  if (state.ebf && state.ebf.hp > 0) await tickFighterStatuses(state.ebf, 'enemy', true);
  applyBenchTickRelics();

  const cbs = { applyHeal, applyStatus, cleanseStatuses, spawnFloat, pushGame, displayName };
  applyRoundStartPassives(state.pf, 'player', cbs);
  applyRoundStartPassives(state.ef, 'enemy', cbs);

  resetTurn(state.pf, true);
  resetTurn(state.ef, false);

  // Speed decides first.
  const pSpd = effectiveStat(state.pf, 'spd');
  const eSpd = effectiveStat(state.ef, 'spd');
  let pFirst;
  if (pSpd !== eSpd) pFirst = pSpd > eSpd;
  else if (winsTies(state.pf)) pFirst = true;
  else if (winsTies(state.ef)) pFirst = false;
  else pFirst = Math.random() < 0.5;
  state.firstThisRound = pFirst ? 'player' : 'enemy';

  state.enemyIntent = aiPlanIntent(state.ef, state.pf);

  pushGame(`Round ${state.round} · ${pFirst ? 'you act first' : 'they act first'}.`, { cls: 'sys' });
  await drainBeats();

  if (await handleFaintsIfAny()) {
    state.acting = false;
    if (state.firstThisRound === 'player') {
      state.turnPhase = 'player';
    } else {
      await runEnemyTurn();
      await afterEnemyOrPlayerTurn('enemy');
    }
    render();
  } else {
    render();
  }
}

function resetTurn(f, isPlayer) {
  if (!f) return;
  let bonus = 0;
  if (isPlayer && state.round === 1 && state.relics) {
    for (const r of state.relics) if (r.energyBonus) bonus += r.energyBonus;
  }
  f.energy = f.maxEnergy + bonus;
  f.actionsThisTurn = 0;
}

function applyBenchTickRelics() {
  if (!state.relics || !state.relics.length) return;
  if (state.bf && state.bf.hp > 0) {
    for (const r of state.relics) if (r.benchTickHeal) {
      const amt = Math.round(state.bf.creature.maxHp * r.benchTickHeal);
      const healed = applyHeal(state.bf, amt);
      if (healed > 0) {
        pushGame(`Bench · ${displayName(state.bf.creature)} +${healed} hp.`, { cls: 'fade' });
      }
    }
  }
}

async function afterEnemyOrPlayerTurn(side) {
  if (!await handleFaintsIfAny()) return;
  const otherSide = side === 'player' ? 'enemy' : 'player';
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
    state.turnsTakenThisRound = 0;
    await endRoundCleanup();
    if (await handleFaintsIfAny()) {
      if (state.screen === 'battle') startRound();
    }
  }
}

async function endRoundCleanup() {
  tickTimedBuffs(state.pf);
  if (state.ef)  tickTimedBuffs(state.ef);
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
  if (!await handleFaintsIfAny()) return;
  if (state.pf.energy <= 0) return playerEndTurn();
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

  const actorName = partyName(attacker);
  const cost = abilityCost(ability, attacker);
  pushGame(`${cap(actorName)} · ${ability.name} (${cost}E)`, {
    cls: 'act', actor: side,
    anim: () => playLunge(side),
  });
  if (ability.flavor) {
    const flav = String(ability.flavor).replace(/^\s+|\s+$/g, '');
    pushLore(flav);
  }
  await drainBeats();

  await runTimedEffects('before', phase, { side, oside, attacker, defender, helpers, lastDmg: 0 });
  await drainBeats();

  // Stun check on damage abilities.
  const hasDamage = phase.some(e => e.type === 'damage');
  if (hasDamage && attacker.statuses && attacker.statuses.stun && Math.random() < (attacker.statuses.stun.skipChance ?? 0.5)) {
    pushGame(`${cap(actorName)} can't act — Stunned.`, { cls: 'eff' });
    attacker.statuses.stun = null;
    await drainBeats();
    return;
  }

  // Damage phase.
  const dmgEffects = phase.filter(e => e.type === 'damage');
  for (const dmgEff of dmgEffects) {
    const targetKeys = dmgEff.targets || ['enemy'];
    const hits = dmgEff.hits || 1;
    for (const tk of targetKeys) {
      const fighters = resolveTargetsForDamage(tk, side, attacker, defender);
      const targetSide = (tk === 'self' || tk === 'bench') ? side : oside;
      for (const target of fighters) {
        for (let h = 0; h < hits; h++) {
          if (target.hp <= 0 || attacker.hp <= 0) break;
          const result = calculateDamage(attacker, target, ability, dmgEff, phase);
          if (result.evaded) {
            pushGame(`${cap(partyName(target))} evades.`, { cls: 'eff' });
            await drainBeats();
            continue;
          }
          target.hp = Math.max(0, target.hp - result.dmg);
          const tag = result.crit ? ' ✶ crit'
                    : result.mult > 1 ? ' ✶ effective'
                    : result.mult < 1 ? ' (resisted)'
                    : '';
          pushGame(`${cap(partyName(target))}${tag}`, {
            cls: result.crit ? 'crit' : (result.mult !== 1 ? 'eff' : 'hit'),
            damage: result.dmg, actor: side,
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

  await runTimedEffects('after', phase, { side, oside, attacker, defender, helpers, lastDmg: 0 });
  await drainBeats();
}

// Local import: pushLore (replaces only the single lore line).
function pushLore(text) {
  state.loreLine = { text: String(text || ''), cls: '', id: ++state.loreTypingId };
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
  applySwapInPassives(incoming, out, side, { applyHeal, cleanseStatuses, spawnFloat, pushGame, displayName });
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
  return true;
}

export async function handleFaintsIfAny() {
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
  const eliteMult = state.isEliteBattle ? 1.4 : 1.0;
  let xpGained = Math.round((totalEnemyLevel * 6 + 18) * eliteMult);
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
