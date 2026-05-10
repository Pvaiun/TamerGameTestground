# Bloodlines — Codebase Map

A creature-tamer roguelite, document-horror tone. Vanilla ES modules, no build step, no deps. Open `index.html` to run.

## Architecture in one paragraph
`src/main.js` awaits `loadData()` (fetches `data/*.json` into named exports on `src/data.js`), then calls `render()`. The whole app is **state mutation + re-render**: modules import `state` from `src/state.js`, mutate it, then call `render()` from `src/ui/render.js`. `render()` clears `#app` and dispatches on `state.screen` to a screen renderer in `src/ui/screens.js` (or `src/ui/battle.js` for the battle screen). There is no virtual DOM, no framework, no router. UI builds DOM via the `el(tag, props, children)` helper in `src/ui/dom.js`. The visual aesthetic is "document horror" — every screen is a page in a corrupted testimony; creatures are abstract pixel-bitmap glyphs with prose descriptions, not illustrated portraits.

## Run flow
A run is **10 descents**. After each non-boss descent, the player chooses a **path** (3 options) leading to the next descent. Paths are: `battle` (standard), `elite` (one tougher fight, +50% xp), `records` (pick 1 of 3 relics, then a normal fight), `tend` (treatment room — permanent stat bump for one creature, then a normal fight). Waves 3, 6, 9 offer an **optional ritual**: pick 2 creatures, fuse into 1 (stronger child, parents are lost). Wave 10 is the boss (forced, no path choice).

## File map

### Data (JSON, drives behavior — prefer adding params here over hardcoding in JS)
- `data/types.json` — element list (5 types), type chart (1.5×/0.7×/1×), palettes
- `data/templates.json` — species (baseStats, growth, abilityPool, primary/secondaryPassive, optional `starter: true`)
- `data/abilities.json` — ability dict keyed by ability id; see "Ability schema"
- `data/passives.json` — passive dict keyed by passive id; trigger entries with `if`/`effect`/`consumesOn`
- `data/passivetriggers.json` — passive trigger names + condition predicates + effect type schemas (informational, used by editor)
- `data/statuseffects.json` — Fevering / Mending / Drained / Broken / Sedated canonical defaults
- `data/additionaleffects.json` — schema for ability-effect types (damage, apply_status, buff, heal_over_time, bracing, swap, lifesteal, hp_cost, cleanse, plus modifier-only execute_scale / pierce / status_synergy)
- `data/relics.json` — run-long passive items the protagonist accumulates between rooms; each entry has `name`, `voice`, `desc`, plus effect keys (`dealMult`, `takeMult`, `firstHitMult`, `lowHpDealMult`, `benchAlive`, `critChanceBonus`, `critMultBonus`, `healMult`, `evadeBonus`, `selfDmgMult`, `reviveOnce`, `benchTickHeal`, `startStatusEnemy`, `priorityFirstTurn`, `reduceCursedSwap`, `capturedBonusXp`, `permHpFlat`)
- `data/glyphs.json` — 16×16 hand-authored bitmap glyph per species
- `data/voiceprose.json` — placeholder voice prose used by the dossier and screens

### Core (`src/`)
- `state.js` — `state` singleton, `pushLog`, `resetGame`, constants (`TOTAL_WAVES=10`, `BREED_WAVES={3,6,9}`, `MAX_LEVEL=50`, `PARTY_CAP=2`)
- `data.js` — `loadData()` + named exports
- `creature.js` — `makeCreature`, `gainXp`, `xpToNext`, `growthRank`, `displayName`, `freshFighter`
- `breeding.js` — `makeChild`, `finalizeBreed` (consumes two parents, adds the child)
- `encounter.js` — `generateEnemyParty`, `generateElitePair`, `generateBossParty`, `partyAvgLevel`
- `relics.js` — `acquireRelic` (applies one-time bonuses like permHpFlat), `applyOwnedPermanentsToCreature`, `tendCreature`, `pickRecordsCandidates`, `generatePathChoices`
- `rng.js` — `rand`, `randi`, `pick`, `pickN`, `sleep`
- `audio.js` — `sfx(type)` WebAudio bleeps
- `art.js` — legacy procedural creature SVG (only `blendPalettes` is still called; rest unused)
- `version.js` — single-line version string

### Combat (`src/combat/`)
- `battle.js` — orchestrator. `beginBattle`, `playerAct`, `playerSwap`, `resolveAction` (phase runner), `handleFaintsIfAny` (with relic-revive support), `finishBattleIfDone`. Multi-phase abilities queue the next phase on `attacker.queuedAbility`.
- `damage.js` — `effectiveStat` (clamps statMods to [-0.6, +0.9]), `calculateDamage`, `estimateDamage`. Damage formula: `atk * (power/40) * (atk/(atk + def*0.85)) * 0.75 * elementMult * vulnerability * brace * dmgReduction * crit * relicMults`.
- `status.js` — `applyStatus`, `cleanseStatuses`, `applyHeal`, `tickStartOfTurn`, `tickFighterStatuses`. Drained reduces atk + spd; Broken adds a damage-taken vulnerability.
- `abilities.js` — effect dispatcher. `runTimedEffects(timing, phase, ctx)` and `runEachHitEffects(phase, ctx)`. Helpers: `applyCursedOnSwap` (consults pivot_master passive + reduceCursedSwap relic), `processPostHit`, `resolveTargets`, `effParam`.
- `passives.js` — every passive consumer + relic damage hooks. Functions: `applyStatMult`, `applyPowerMult`, `checkEvasion` (+ relic evadeBonus), `getCritProfile` (+ relic crit bonuses), `applyFlatDmgReduction` (+ relic takeMult), `modifyHeal` (+ relic healMult), `applyBattleStartPassive`, `applySwapInPassives`, `applyPostHitPassives`, `applyTurnStartPassives`, `applyBenchPassives`. Helper `hasPassive(f, key)`.
- `ai.js` — `aiChoose(ef, pf)` returns ability key or `'_swap'`. Improved heuristic: swap on type disadvantage, prefer status moves on healthy targets, set up on turn 1, value damage estimates for all attacks.
- `log.js` — `drainLog` (typewriter pacing, respects `state.combatSpeed`: 1=slow, 2=fast), voice composition helpers (`useLine`, `hitLine`, `eventText`, `affName/Apply/Tick`).

### UI (`src/ui/`)
- `render.js` — `render()` dispatcher + `advanceWave()` (increments wave, generates enemies based on `state.pendingRoomKind`) + `routeAfterAftermath()` (decides if next is breed_offer / path / boss).
- `screens.js` — every non-battle screen (`renderStart, renderStarterPick, renderBloodlineReady, renderPreBattle, renderAftermath, renderBreedOffer, renderBreed, renderPath, renderRecords, renderTend, renderVictory, renderGameover`). Prebattle has a roster step (re-compose 2 from full collection) when reserve is non-empty.
- `battle.js` — dossier battle screen. Engagement strip (with speed toggle button), two columns of dossier, action box. Action rows show damage estimate or kind-tag, element label, and an EFF/RES type-effectiveness chip.
- `cards.js` — `creatureCardEl`, `openInspectModal`, `openAbilityTooltip`.
- `glyphs.js` — `renderGlyph(species)` returns SVG markup.
- `textCorrupt.js` — `parseProse(input)` consumes the `~~strike~~ / [[N]] / **gold** / !!red!!` markup.
- `animations.js` — `spawnFloat`, `spawnCallout`, `shakeStage`, `playLunge`, `playRecoil`.
- `dom.js` — `el(tag, props, children)`, `attachLongPress`, `app()`, tooltip helpers.
- `hpTween.js` — smooth HP-bar interpolation.

### Assets / tooling
- `index.html` — single page, `<div id="app">` + `<div id="modal-root">`, loads IBM Plex Mono and `src/main.js` as module.
- `styles.css` — all styles (single file).
- `tools/editor/` — separate standalone data editor; not loaded by the game.

## Key data schemas

### Ability (`data/abilities.json`)
`phases: [[effect, effect, ...], [...]]`. Effect types: `damage` (with `power` and `hits`), `apply_status`, `buff` (with statMult, clamped via `effectiveStat`), `heal_over_time`, `bracing`, `swap` (with `buffOnSwap`/`healOnSwap`), `lifesteal`, `hp_cost`, `cleanse`, plus modifiers `execute_scale`, `pierce`, `status_synergy`.

### Passive (`data/passives.json`)
Each entry has `triggers[]` of `{ on, if?, effect, consumesOn? }`. The engine dispatches by trigger name and the `effect.type` (e.g. `stat_mult`, `power_mult`, `heal_self`, `apply_status`, etc.). A few use `type: custom` with `impl:` naming a handler in `passives.js`'s `CUSTOM` table.

### Relic (`data/relics.json`)
Each entry has `name`, `voice` (the protagonist's first-person line), `desc`, plus effect keys consumed by the engine. Relic effect lookup is direct — `state.relics` is iterated at the relevant hook (damage, defense, crit query, etc.).

### Status (`data/statuseffects.json`)
- Fevering: -8% hp / turn for 3 turns.
- Mending: +8% hp / turn for 3 turns.
- Drained: -30% atk and -30% spd for 3 turns.
- Broken: +25% damage taken for 3 turns; -25% hp on swap-out.
- Sedated: 35% chance to skip turn for 2 turns.

### Fighter (in-battle, built by `freshFighter`)
`{ creature, hp, statMods:{atk,def,spd}, bracingThisTurn, healing, statuses:{burn,bloom,soaking,cursed,dazed}, queuedAbility, pendingSwapBuff, pendingSwapHeal, onBench, attacksMade, consumedTriggers, timedBuffs }`. statMods are clamped to [-0.6, +0.9] inside `effectiveStat`.

## Conventions
- **Data over code.** New numbers belong in JSON.
- **`state` is global and mutated directly.** Don't pass it as a parameter; import it.
- **Re-render after mutation.** Any user-visible change ends with `render()`. Async flows in `battle.js` interleave `render()` and `await sleep(ms)` for animation pacing.
- **No build step.** ES modules, browser-native.
- **Two-creature party** + arbitrary reserve. PARTY_CAP=2.
- **Side string `'player'|'enemy'`** is threaded through combat for log/animation routing.

## Adding things — checklists

**New ability:** add an entry in `abilities.json` with `phases: [[...]]`. Compose effects from existing types. Reference the ability key in one or more `abilityPool`s in `templates.json`.

**New passive:** add entry with triggers in `passives.json`. Either use existing effect types or add a `type: custom` with an `impl` registered in `passives.js`'s `CUSTOM` table.

**New relic:** add entry to `relics.json` with effect keys read at runtime by `damage.js`, `passives.js`, `battle.js`, or `relics.js` (acquireRelic for one-time effects). Document any new effect key.

**New status effect:** add to `statuseffects.json`; extend the `applyStatus` switch in `combat/status.js`; add a tick branch in `tickFighterStatuses` if it ticks; decide whether `cleanseStatuses` should clear it.

**New screen:** add a renderer to `src/ui/screens.js`, register in the `switch` in `render.js`, set `state.screen = 'name'` somewhere to enter it.

**New species:** add entry in `templates.json` (set `starter: true` if it should appear in starter selection).

## Test / verify
No automated tests. Manual: open `index.html` in a browser, play through the relevant flow. Combat changes verified via the in-battle log.
