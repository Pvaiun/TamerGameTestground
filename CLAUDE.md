# Bloodlines — Codebase Map (v4)

A creature-tamer roguelite, document-horror tone. Vanilla ES modules, no build step, no deps. Open `index.html` to run.

## What's new in v4

- **Four archetypes** drive creature design (categories, not closed loops):
  - **Striker** builds **Momentum** by attacking, spends it for crushing payoffs.
  - **Warden** builds **Guard** from defensive plays, spends it as shields/reflection.
  - **Weaver** builds **Threads** by applying statuses, spends them to spread.
  - **Keeper** builds **Tend** by healing, spends it for bigger heals or shared healing.
- Each species belongs to one archetype, but has its own element + 1-2 species-specific passive twists.
- **Hybrid creatures from breeding** carry stacks from MULTIPLE archetypes. A bred Striker × Keeper offspring can build both Momentum and Tend in the same battle. This is where build-crafting lives.
- **Rebalanced damage** so the player can actually win. New formula: `atk * (power/25) * (atk/(atk+def)) * 0.95`. Most attacks cost 2E now (1 attack per turn norm), so multi-action turns are setup → payoff plays rather than triple-attack burst.
- Combo bonus reduced to +10% per extra action (cap 1.3x). Crit chance/mult: 10% / 1.6x baseline.

## Older changes (v3, kept)

- **Energy-based combat.** Each round, both fighters get 3 energy. Abilities cost 1-3. Player ends turn manually or auto-ends at 0 energy.
- **Dual log streams.** A scrollable mechanical "battle log" sits beside an atmospheric "lore line" panel.
- **Enemy intent preview** above the dossier shows what the AI plans this round.
- **Path picker with real tradeoffs.** All paths consume one descent.

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
