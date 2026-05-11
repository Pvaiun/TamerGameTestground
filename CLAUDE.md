# Bloodlines — Codebase Map (v4)

A creature-tamer roguelite, document-horror tone. Vanilla ES modules, no build step, no deps. Open `index.html` to run.

## What's new in v4 (the readability pass)

- **One universal resource: Charge.** Every creature has a 0-3 Charge gauge. `build` abilities give +1 Charge; `spend` abilities consume all Charge for a flat per-stack power bonus (typically +50% per stack). Replaced the v3 system of 8 different per-species signature mechanics with one shared one.
- **Cleaner damage formula.** `dmg = round(power*0.18 + atk*0.5 - def*0.35) * type * combo * crit * relic`. Linear and easy to predict. The first fight is now winnable and bursts feel decisive.
- **3 statuses, not 5.** Burn (DoT), Brittle (+30% incoming dmg), Drained (−30% atk/spd), Stun (50% to skip next ability). Each does one clear thing.
- **12 distinct passives** instead of 30+. Each defines a clear archetype (Vanguard = front-load, Sentinel = tanky tank, Brutal = first-attack burst, etc).
- **Per-species fixed ability list.** 4 abilities per species, hand-tuned for their archetype, no rolling.
- **Bigger HP bars.** The battle screen is stacked top-to-bottom (enemy → player) with big HP bars, charge pips, and a single intent badge per fighter. Less visual partitioning.
- **Click-only input.** Long-press is gone. Selection clicks the card; a small "inspect" button opens the full file. Right-click also inspects on desktop.
- **Enemy intent estimates are cached.** The "they plan: X ~12" damage estimate is computed at round start and cached so it doesn't go stale if the enemy spends charge during their turn.
- **Snappier pacing.** Default fast mode is faster; combat resolves in seconds, not tens of seconds.

## Architecture
`src/main.js` awaits `loadData()` (fetches `data/*.json` into named exports on `src/data.js`), then calls `render()`. State mutation + re-render: modules import `state` from `src/state.js`, mutate it, then call `render()`. UI builds DOM via `el(tag, props, children)` from `src/ui/dom.js`.

## Combat state machine
- `state.turnPhase`: `'idle' | 'player' | 'enemy' | 'tick' | 'done'`
- `state.round`: 1-indexed; `startRound()` increments it
- Each round: tick statuses → fire round_start passives → reset energy + actions → first side plays (multi-action) → second side plays → end-of-round bookkeeping → loop
- Within a side's turn: player clicks abilities (they cost energy). When energy = 0 or End Turn is clicked, control passes.

## Charge (universal resource)
- Each fighter has `f.charge` (0-3), initialized to 0 (or 1 with Lightbearer passive / Borrowed Name relic).
- `gain_charge` effects (on `build`-tagged abilities) add 1 Charge.
- `spend_charge` effects (on `spend`-tagged abilities) consume ALL Charge to multiply that ability's power by `1 + perStack * stacks`. At 3 charge with perStack=0.5, that's 2.5× power.
- Charge persists across rounds (until spent).

## File map

### Data (JSON)
- `data/types.json` — 5 elements, type chart 1.5×/0.7×/1×, palettes
- `data/templates.json` — 24 species. `primaryPassive`/`secondaryPassive` (70/30 roll), fixed 4-ability `abilityPool`.
- `data/abilities.json` — ~25 abilities. `cost` (1-3 energy), `tags` (`attack`/`build`/`spend`/`status`/`buff`/`heal`/`cleanse`/`swap`/`defense`), `intent` (label for enemy plan), `phases`.
- `data/passives.json` — 12 passives. Each has clear triggers and uses the simple effect dispatcher.
- `data/relics.json` — 16 run-long passives.
- `data/statuseffects.json` — Burn / Brittle / Drained / Stun
- `data/additionaleffects.json` — schemas for effect types (used by the data editor)

### Core
- `state.js` — `state`, `pushGame`, `pushLore`, `resetGame`, constants
- `data.js` — `loadData`
- `creature.js` — `makeCreature`, `freshFighter` (with energy + charge)
- `breeding.js` — child inherits chosen "shape" parent's species/type/glyph
- `encounter.js` — enemy generation (wave 1 strict, later waves ± variance)
- `relics.js` — acquire, applyOwnedPermanentsToCreature, generatePathChoices

### Combat
- `battle.js` — `beginBattle`, `startRound`, `playerAct`, `playerEndTurn`, `playerSwap`, `runEnemyTurn`, `runAction`, `handleFaintsIfAny`, `finishBattleIfDone`
- `damage.js` — `effectiveStat`, `calculateDamage` (linear formula), `estimateDamage`, `abilityCost`, charge spend multiplier
- `status.js` — `applyStatus`, `tickStartOfRound`, `tickFighterStatuses`, `applyHeal`
- `abilities.js` — effect dispatcher: `gain_charge`, `spend_charge`, `apply_status`, `buff`, `heal_self_pct`, `bracing`, `cleanse`, `lifesteal`, `swap`
- `passives.js` — trigger walker + dispatcher. `applyDefenseModifiers` consolidates flat reduction + incoming mults + relic takeMult in one pass.
- `ai.js` — `aiChoose`, `aiPlanIntent` (caches estimated damage on intent object for stable badge display)
- `log.js` — `drainBeats` (paced render of new gameLog entries)

### UI
- `render.js` — dispatcher, `advanceWave`, `routeAfterAftermath`, `proceedFromDepth`
- `screens.js` — non-battle screens (start, prebattle, aftermath, breed, path, records, tend, victory, gameover)
- `battle.js` — engagement strip, two stacked fighter panels (enemy on top, player below), action bar, dual log panel
- `cards.js` — creature dossier card with element-colored ability pills; inspect modal
- `glyphs.js`, `textCorrupt.js`, `animations.js`, `dom.js`, `hpTween.js`

## Conventions
- **Data over code.** New numbers belong in JSON.
- **`state` is global, mutated directly.** Don't pass it as a parameter.
- **Re-render after mutation.** Async combat flows interleave `await drainBeats()` and `render()`.
- **No build step.**
- **PARTY_CAP=2.** prebattle re-composes if reserve has options.
- **Side string `'player' | 'enemy'`** is threaded through combat.
- **No long-press.** Selection is single-click. Inspect is a separate small button or right-click.

## Adding things
- **New ability:** add entry with `cost`, `tags` (use `build`/`spend` for the Charge dance), `phases`, `intent`, `effect` text. Reference in templates.
- **New passive:** add entry with `triggers`. Use generic effect types or extend the dispatcher in `passives.js` `runEffect`.
- **New relic:** add entry to `relics.json`. Wire effect key into the appropriate hook (`damage.js`, `passives.js`, `battle.js`, or `relics.js`).
- **New species:** add to `templates.json` with `baseStats`, `growth`, `primaryPassive`, `secondaryPassive`, and a 4-ability `abilityPool`.
- **New screen:** renderer in `screens.js`, register in `render.js` switch.

## Tools

- `tools/sanity.mjs` — prints damage estimates for canonical matchups at L1 and L5. Run `node tools/sanity.mjs`.
- `tools/playtest.mjs` — headless playthrough (Playwright) that walks start → starter pick → battle → aftermath → path picker. Catches runtime errors. Run `python3 -m http.server 8123` first, then `node tools/playtest.mjs`.
- `tools/screenshot.mjs` — captures screenshots of key screens.
