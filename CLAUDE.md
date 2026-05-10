# Bloodlines — Codebase Map (v3)

A creature-tamer roguelite, document-horror tone. Vanilla ES modules, no build step, no deps. Open `index.html` to run.

## What's new in v3

- **Energy-based combat.** Each round, both fighters get 3 energy. Abilities cost 1-3. Multi-action turns (combo bonus +18% per extra action). Player ends turn manually or auto-ends at 0 energy.
- **Signature mechanics.** Each species has a unique resource (Light, Heat, Tide, Roots, Marks, Frost, Embers, Hollow). Signature abilities build/spend stacks for distinct playstyles.
- **Dual log streams.** A scrollable mechanical "battle log" (compact, persistent) sits beside an atmospheric "lore line" panel. Both visible during combat.
- **Enemy intent preview.** At the top of each round, the AI commits to its first move; the player sees a tag ("they plan: Furnace ~24") and plans accordingly.
- **Path picker with real tradeoffs.** All paths consume one descent. Choose between battle (xp+capture), elite (harder + relic), records (relic, no fight), or treatment (permanent stat, no fight). Fewer fights = fewer xp/captures but more relics; more fights = stronger creatures but no relics.

## Architecture
`src/main.js` awaits `loadData()` (fetches `data/*.json` into named exports on `src/data.js`), then calls `render()`. The whole app is **state mutation + re-render**: modules import `state` from `src/state.js`, mutate it, then call `render()`. UI builds DOM via `el(tag, props, children)` from `src/ui/dom.js`.

## Combat state machine
- `state.turnPhase`: `'idle' | 'player' | 'enemy' | 'tick' | 'done'`
- `state.round`: 1-indexed; `startRound()` increments it
- Each round: tick statuses → fire round_start passives → reset energy → first side plays (multi-action) → second side plays → end-of-round bookkeeping → loop
- Within a side's turn: player clicks abilities (they cost energy). When energy = 0 or End Turn is clicked, control passes.

## File map

### Data (JSON)
- `data/types.json` — 5 elements, type chart 1.5×/0.7×/1×, palettes
- `data/templates.json` — species. New: `signature: { key, label, max, gainPerTurn? }` and `signatureAbilities: [keys]`
- `data/abilities.json` — abilities. New: `cost` (1-3 energy), `tags` (`attack`/`status`/`buff`/`swap`/`sig_*`), `intent` (label shown in enemy-intent badge)
- `data/passives.json` — passives. New triggers: `round_start`, `energy_cost`. New conditions: `firstAttackThisRound`, `abilityHasTag`. New custom impls for signature interactions
- `data/relics.json` — run-long passives
- `data/statuseffects.json` — Fevering / Mending / Drained / Broken / Sedated
- `data/additionaleffects.json` — schemas for ability effect types

### Core
- `state.js` — `state`, `pushGame`, `pushLore`, `resetGame`, constants
- `data.js` — `loadData`
- `creature.js` — `makeCreature`, `freshFighter` (now with energy + sigStacks)
- `breeding.js` — child inherits species-shape parent's `signature`
- `encounter.js` — generators
- `relics.js` — acquire, applyOwnedPermanentsToCreature, generatePathChoices

### Combat
- `battle.js` — `beginBattle`, `startRound`, `playerAct`, `playerEndTurn`, `playerSwap`, `runEnemyTurn`, `runAction`, `handleFaintsIfAny`, `finishBattleIfDone`
- `damage.js` — `effectiveStat` (clamps statMods), `calculateDamage`, `estimateDamage`, `abilityCost` (with passive discount), `applySigDamageMods`, combo bonus
- `status.js` — `applyStatus`, `tickStartOfRound`, `tickFighterStatuses`, `applyHeal`
- `abilities.js` — effect dispatcher. Handles `sig_gain_*`, `sig_consume_*`, generic effects. `isPureDamageMod` for things skipped by dispatcher
- `passives.js` — trigger walker + dispatcher. Handles `round_start`, `energy_cost`, all sig custom impls
- `ai.js` — `aiChoose` (per-turn) + `aiPlanIntent` (round-start lookahead)
- `log.js` — `drainBeats` (paced render of new gameLog entries), voice composers

### UI
- `render.js` — dispatcher, `advanceWave` (handles all room kinds: battle/elite/records/tend/boss), `routeAfterAftermath`, `proceedFromDepth`
- `screens.js` — non-battle screens
- `battle.js` — engagement strip (intent badge, pace toggle), dossier columns (with sig-stack pip row), action bar (energy pips + ability cards + swap/inspect/end), dual log panel
- `cards.js`, `glyphs.js`, `textCorrupt.js`, `animations.js`, `dom.js`, `hpTween.js`

## Conventions
- **Data over code.** New numbers belong in JSON.
- **`state` is global, mutated directly.** Don't pass it as a parameter.
- **Re-render after mutation.** Async combat flows interleave `await drainBeats()` and `render()`.
- **No build step.**
- **PARTY_CAP=2.** prebattle re-composes if reserve has options.
- **Side string `'player' | 'enemy'`** is threaded through combat.

## Adding things
- **New signature mechanic:** add `signature` + `signatureAbilities` to a species in `templates.json`. Add `sig_gain_*` / `sig_consume_*` effect types as needed; wire into `abilities.js`'s `handleEffect` and (for damage modifiers) `damage.js`'s `applySigDamageMods`.
- **New ability:** add entry with `cost`, `tags`, `phases`, `intent`, `effect` text. Reference in templates.
- **New passive:** add entry with `triggers`. Either generic effect types or `type: custom` with `impl` in `passives.js`'s `CUSTOM` table.
- **New relic:** add entry to `relics.json`. Wire effect key into the appropriate hook (`damage.js`, `passives.js`, `battle.js`, or `relics.js`).
- **New screen:** renderer in `screens.js`, register in `render.js` switch.
