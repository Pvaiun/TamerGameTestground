import { ABILITIES, STATUSES } from '../data.js';
import { sleep } from '../rng.js';
import { state, pushLog, TOTAL_WAVES } from '../state.js';
import { displayName, gainXp, freshFighter } from '../creature.js';
import { sfx } from '../audio.js';
import { applyBattleStartPassive, applySwapInPassives, winsTies } from './passives.js';
import { effectiveStat, calculateDamage } from './damage.js';
import { applyStatus, cleanseStatuses, applyHeal, tickStartOfTurn, tickFighterStatuses } from './status.js';
import { aiChoose } from './ai.js';
import {
  applyCursedOnSwap,
  processPostHit,
  runTimedEffects,
  runEachHitEffects,
  effParam,
} from './abilities.js';
import { spawnFloat, spawnCallout, shakeStage, playLunge, playRecoil } from '../ui/animations.js';
import { render } from '../ui/render.js';
import { drainLog, snapLog, useLine, hitLine, flavorLine, eventText } from './log.js';

const lower = (s) => String(s || '');

// Self-swap helper. Used by the `swap` effect when target=self.
// `swapEff` is the effect instance, which carries optional buffOnSwap/healOnSwap.
async function performSelfSwap(side, attacker, swapEff) {
  const benchFighter = side === 'player' ? state.bf : state.ebf;
  if (!benchFighter || benchFighter.hp <= 0) {
    pushLog(eventText('swap_none', { actor: lower(displayName(attacker.creature)) }), { cls: 'eff' });
    await drainLog();
    return;
  }
  applyCursedOnSwap(attacker, side);
  pushLog(eventText('swap_out', { actor: lower(displayName(attacker.creature)) }), {
    cls: 'eff',
    anim: () => sfx('select'),
  });
  await drainLog();
  if (side === 'player') {
    const out = state.pf;
    state.pf = state.bf;
    state.bf = out;
    state.activeIdx = 1 - state.activeIdx;
    if (state.pf) state.pf.queuedAbility = null;
  } else {
    const out = state.ef;
    state.ef = state.ebf;
    state.ebf = out;
    state.enemyActiveIdx = 1 - state.enemyActiveIdx;
    state.enemy = state.enemyParty[state.enemyActiveIdx];
    if (state.ef) state.ef.queuedAbility = null;
  }
  const incoming = benchFighter;
  const buffOnSwap = swapEff?.buffOnSwap;
  if (buffOnSwap) {
    let any = false;
    for (const [k, v] of Object.entries(buffOnSwap)) {
      if (typeof v === 'number' && v !== 0) { incoming.statMods[k] = (incoming.statMods[k] || 0) + v; any = true; }
    }
    if (any) pushLog(eventText('swap_arrives_buffed', { actor: lower(displayName(incoming.creature)) }), { cls: 'eff' });
  }
  const healOnSwap = swapEff?.healOnSwap || 0;
  if (healOnSwap > 0) {
    const amt = Math.round(incoming.creature.maxHp * healOnSwap);
    const healed = applyHeal(incoming, amt);
    if (healed > 0) {
      pushLog(eventText('swap_arrives_healed', { actor: lower(displayName(incoming.creature)) }), {
        heal: healed,
        anim: () => spawnFloat(side, `+${healed}`, 'heal'),
      });
    }
  }
  applySwapInPassives(incoming, attacker, side, { applyHeal, cleanseStatuses, spawnFloat, pushLog, displayName });
  incoming.onBench = false;
  attacker.onBench = true;
  await drainLog();
}

function applyBattleStartPassives(pf, ef) {
  const cbs = { applyStatus, applyHeal, spawnFloat, pushLog, displayName, cleanseStatuses };
  applyBattleStartPassive(pf, ef, cbs);
  applyBattleStartPassive(ef, pf, cbs);
}

export function beginBattle() {
  const playerActive = state.party[state.activeIdx];
  const playerBench = state.party[1 - state.activeIdx] || null;
  state.pf = freshFighter(playerActive);
  state.bf = playerBench ? freshFighter(playerBench) : null;
  state.enemyActiveIdx = 0;
  state.ef = freshFighter(state.enemyParty[0]);
  state.ebf = state.enemyParty.length > 1 ? freshFighter(state.enemyParty[1]) : null;
  state.enemy = state.enemyParty[0];
  applyBattleStartPassives(state.pf, state.ef);
  if (state.bf) applyBattleStartPassives(state.bf, state.ef);
  if (state.ebf) applyBattleStartPassives(state.ebf, state.pf);
  state.log = [];
  const enemiesDesc = state.enemyParty.map(e => lower(displayName(e))).join(' and ');
  pushLog(eventText('battle_open', { enemies: enemiesDesc }), { cls: 'eff' });
  snapLog();
  state.acting = false;
  state.screen = 'battle';
  render();
}

function fizzleQueued(f) {
  if (!f || !f.queuedAbility) return;
  const ab = ABILITIES[f.queuedAbility.key];
  if (ab) pushLog(eventText('ability_fizzle', { actor: lower(displayName(f.creature)), name: lower(ab.name) }), { cls: 'eff' });
  f.queuedAbility = null;
}

// High-priority swap; opponent still acts on the new active.
export async function playerSwap() {
  if (state.acting) return;
  if (!state.bf || state.bf.hp <= 0) return;
  state.acting = true;
  applyCursedOnSwap(state.pf, 'player');
  fizzleQueued(state.pf);
  pushLog(eventText('swap_out', { actor: lower(displayName(state.pf.creature)) }), {
    cls: 'eff',
    anim: () => sfx('select'),
  });
  await drainLog();
  const out = state.pf;
  state.pf = state.bf;
  state.bf = out;
  state.activeIdx = 1 - state.activeIdx;
  state.pf.onBench = false;
  state.bf.onBench = true;
  const swapCbs = { applyHeal, cleanseStatuses, spawnFloat, pushLog, displayName };
  applySwapInPassives(state.pf, out, 'player', swapCbs);
  pushLog(eventText('swap_in', { actor: lower(displayName(state.pf.creature)) }), { cls: 'eff' });
  await drainLog();
  if (state.ef.hp > 0 && state.pf.hp > 0) {
    let enemyAbility, enemyPhaseIdx = 0;
    if (state.ef.queuedAbility) {
      enemyAbility = ABILITIES[state.ef.queuedAbility.key];
      enemyPhaseIdx = state.ef.queuedAbility.phaseIdx;
    } else {
      enemyAbility = ABILITIES[aiChoose(state.ef, state.pf)];
    }
    await tickStartOfTurn(state.ef, 'enemy');
    if (state.ef.hp > 0) {
      await resolveAction('enemy', state.ef, state.pf, enemyAbility, enemyPhaseIdx);
    }
  }
  if (state.bf && state.bf.hp > 0) await tickFighterStatuses(state.bf, 'player', true);
  if (state.ebf && state.ebf.hp > 0) await tickFighterStatuses(state.ebf, 'enemy', true);
  await handleFaintsIfAny();
  state.acting = false;
  render();
}

export async function handleFaintsIfAny() {
  if (state.pf.hp <= 0) {
    pushLog(eventText('faint', { actor: lower(displayName(state.pf.creature)) }), {
      cls: 'eff',
      anim: () => sfx('faint'),
    });
    await drainLog();
    if (state.bf && state.bf.hp > 0) {
      const out = state.pf;
      state.pf = state.bf;
      state.bf = out;
      state.activeIdx = 1 - state.activeIdx;
      if (state.pf) state.pf.queuedAbility = null;
      pushLog(eventText('step_in', { actor: lower(displayName(state.pf.creature)) }), { cls: 'eff' });
      await drainLog();
    } else {
      state.screen = 'gameover';
      render();
      return false;
    }
  }
  if (state.ef.hp <= 0) {
    pushLog(eventText('faint', { actor: lower(displayName(state.ef.creature)) }), {
      cls: 'eff',
      anim: () => sfx('faint'),
    });
    await drainLog();
    if (state.ebf && state.ebf.hp > 0) {
      const out = state.ef;
      state.ef = state.ebf;
      state.ebf = out;
      state.enemyActiveIdx = 1 - state.enemyActiveIdx;
      state.enemy = state.enemyParty[state.enemyActiveIdx];
      if (state.ef) state.ef.queuedAbility = null;
      pushLog(eventText('step_in', { actor: lower(displayName(state.ef.creature)) }), { cls: 'eff' });
      await drainLog();
    } else {
      finishBattleIfDone();
      return false;
    }
  }
  return true;
}

export async function playerAct(abilityKey) {
  if (state.acting) return;
  state.acting = true;

  let playerAbility, playerPhaseIdx = 0;
  if (state.pf.queuedAbility) {
    playerAbility = ABILITIES[state.pf.queuedAbility.key];
    playerPhaseIdx = state.pf.queuedAbility.phaseIdx;
  } else {
    playerAbility = ABILITIES[abilityKey];
  }

  let enemyAbility, enemyPhaseIdx = 0;
  let enemySwapping = false;
  if (state.ef.queuedAbility) {
    enemyAbility = ABILITIES[state.ef.queuedAbility.key];
    enemyPhaseIdx = state.ef.queuedAbility.phaseIdx;
  } else {
    const enemyKey = aiChoose(state.ef, state.pf);
    if (enemyKey === '_swap') {
      enemySwapping = true;
      enemyAbility = { name: 'Swap', priority: 3, phases: [[]] };
    } else {
      enemyAbility = ABILITIES[enemyKey];
    }
  }

  const pPrio = playerAbility.priority || 0;
  const ePrio = enemyAbility.priority || 0;
  const pSpd = effectiveStat(state.pf, 'spd');
  const eSpd = effectiveStat(state.ef, 'spd');
  let pFirst;
  if (pPrio !== ePrio) pFirst = pPrio > ePrio;
  else if (pSpd !== eSpd) pFirst = pSpd > eSpd;
  else {
    if (winsTies(state.pf)) pFirst = true;
    else if (winsTies(state.ef)) pFirst = false;
    else pFirst = Math.random() < 0.5;
  }

  const playerTurn = ['player', false, playerAbility, playerPhaseIdx];
  const enemyTurn  = ['enemy',  enemySwapping, enemyAbility, enemyPhaseIdx];
  const order = pFirst ? [playerTurn, enemyTurn] : [enemyTurn, playerTurn];

  for (const [side, swapping, ability, phaseIdx] of order) {
    if (state.pf.hp <= 0 || state.ef.hp <= 0) break;
    const attacker = side === 'player' ? state.pf : state.ef;
    const defender = side === 'player' ? state.ef : state.pf;
    await tickStartOfTurn(attacker, side);
    if (attacker.hp <= 0) break;
    if (swapping) {
      applyCursedOnSwap(state.ef, 'enemy');
      fizzleQueued(state.ef);
      pushLog(eventText('swap_out', { actor: lower(displayName(state.ef.creature)) }), {
        cls: 'eff',
        anim: () => sfx('select'),
      });
      await drainLog();
      const out = state.ef;
      state.ef = state.ebf;
      state.ebf = out;
      state.enemyActiveIdx = 1 - state.enemyActiveIdx;
      state.enemy = state.enemyParty[state.enemyActiveIdx];
    } else {
      await resolveAction(side, attacker, defender, ability, phaseIdx);
    }
  }

  if (state.bf && state.bf.hp > 0) await tickFighterStatuses(state.bf, 'player', true);
  if (state.ebf && state.ebf.hp > 0) await tickFighterStatuses(state.ebf, 'enemy', true);

  const cont = await handleFaintsIfAny();
  if (!cont) return;

  state.acting = false;
  render();
}

// Run a single phase of an ability. Effects are grouped by timing:
//   1. "before" effects (hp_cost, buff, etc.)
//   2. dazed check (50% skip)
//   3. damage effects, in declaration order; "eachHit" effects fire after each landed hit
//   4. "after" effects (apply_status, swap, etc.)
// Multi-phase abilities queue the next phase on the attacker via attacker.queuedAbility.
export async function resolveAction(side, attacker, defender, ability, phaseIdx = 0) {
  const oside = side === 'player' ? 'enemy' : 'player';
  const phases = ability.phases || [[]];
  const phase = phases[phaseIdx] || [];
  const helpers = { performSelfSwap };
  const baseCtx = { side, oside, attacker, defender, helpers, lastDmg: 0 };

  // Phase log line — for multi-phase abilities, the prepare/continue/unleash
  // beat takes the place of the regular use line. For single-phase, the
  // attacker's voice "use" line plays with their lunge animation.
  if (phases.length > 1) {
    const evt = phaseIdx === 0 ? 'phase_prepare'
              : phaseIdx === phases.length - 1 ? 'phase_unleash'
              : 'phase_continue';
    pushLog(eventText(evt, { actor: lower(displayName(attacker.creature)), name: lower(ability.name) }), {
      cls: 'eff',
      anim: () => playLunge(side),
    });
    await drainLog();
  } else {
    pushLog(useLine(attacker, ability), { anim: () => playLunge(side) });
    await drainLog();
    const flavor = flavorLine(attacker, ability);
    if (flavor) {
      pushLog(flavor, { cls: 'flavor' });
      await drainLog();
    }
  }

  // 1. Before-timed effects.
  await runTimedEffects('before', phase, baseCtx);
  await drainLog();

  // 2. Dazed check.
  if (attacker.statuses && attacker.statuses.dazed && Math.random() < (STATUSES.dazed?.skipChance ?? 0.5)) {
    pushLog(eventText('dazed_skip', { actor: lower(displayName(attacker.creature)) }), { cls: 'eff' });
    await drainLog();
    advanceQueue(attacker, ability, phaseIdx);
    return;
  }

  // 3. Damage effects (and eachHit-timed effects per landed hit).
  const dmgEffects = phase.filter(e => e.type === 'damage');
  for (const dmgEff of dmgEffects) {
    const targetKeys = effParam(dmgEff, 'targets') || ['enemy'];
    const hits = effParam(dmgEff, 'hits') || 1;
    for (const tk of targetKeys) {
      const targetSide = (tk === 'self' || tk === 'bench') ? side : oside;
      const fighters = resolveTargetsForDamage(tk, side, attacker, defender);
      for (const target of fighters) {
        for (let h = 0; h < hits; h++) {
          if (target.hp <= 0 || attacker.hp <= 0) break;
          const result = calculateDamage(attacker, target, ability, dmgEff, phase);
          if (result.evaded) {
            pushLog(eventText('evade', { target: lower(displayName(target.creature)) }), {
              cls: 'eff',
              anim: () => { spawnFloat(targetSide, 'evade', 'heal'); sfx('select'); },
            });
            await drainLog();
            continue;
          }
          target.hp = Math.max(0, target.hp - result.dmg);
          const hitText = hitLine(attacker, target, ability);
          const cls = result.crit ? 'crit' : (result.mult !== 1 ? 'eff' : '');
          pushLog(hitText, {
            text: hitText,
            damage: result.dmg,
            cls,
            anim: () => {
              spawnFloat(targetSide, String(result.dmg), result.crit ? 'crit' : 'dmg');
              if (result.crit) sfx('crit'); else sfx('hit');
              shakeStage();
              playRecoil(targetSide);
            },
          });
          await drainLog();
          if (h === 0 && result.mult !== 1) {
            const evt = result.mult > 1 ? 'super' : 'resist';
            pushLog(eventText(evt), { cls: result.mult > 1 ? '' : '' });
            await drainLog();
          }
          processPostHit(side, oside, attacker, target, ability, result);
          await runEachHitEffects(phase, { ...baseCtx, defender: target, lastDmg: result.dmg });
          await drainLog();
        }
      }
    }
  }

  // 4. After-timed effects.
  await runTimedEffects('after', phase, baseCtx);
  await drainLog();

  // Advance phase queue.
  advanceQueue(attacker, ability, phaseIdx);
}

// Resolve a target key into the corresponding fighter list for damage. Mirrors
// resolveTargets in abilities.js but is duplicated here to avoid a circular dep
// while keeping damage routing local.
function resolveTargetsForDamage(targetKey, side, attacker, defender) {
  const ownBench   = side === 'player' ? state.bf  : state.ebf;
  const enemyBench = side === 'player' ? state.ebf : state.bf;
  if (targetKey === 'self')        return attacker.hp > 0 ? [attacker] : [];
  if (targetKey === 'bench')       return ownBench && ownBench.hp > 0 ? [ownBench] : [];
  if (targetKey === 'enemy')       return defender && defender.hp > 0 ? [defender] : [];
  if (targetKey === 'enemy_bench') return enemyBench && enemyBench.hp > 0 ? [enemyBench] : [];
  return [];
}

function advanceQueue(attacker, ability, phaseIdx) {
  const phases = ability.phases || [];
  if (phaseIdx + 1 < phases.length && attacker.hp > 0) {
    const key = Object.keys(ABILITIES).find(k => ABILITIES[k] === ability);
    attacker.queuedAbility = { key, phaseIdx: phaseIdx + 1 };
  } else {
    attacker.queuedAbility = null;
  }
}

export function finishBattleIfDone() {
  if (state.wave === TOTAL_WAVES) {
    state.screen = 'victory';
    sfx('victory');
    render();
    return;
  }
  const totalEnemyLevel = state.enemyParty.reduce((sum, e) => sum + e.level, 0);
  const xpGained = Math.round(totalEnemyLevel * 6 + 20);
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
  };
  state.screen = 'aftermath';
  for (const c of state.party) c.maxHp = c.stats.hp;
  render();
}
