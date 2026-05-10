# Bloodlines — Codebase Map

A creature-breeding roguelite. Vanilla ES modules, no build step, no deps. Open `index.html` to run.

## Architecture in one paragraph
`src/main.js` awaits `loadData()` (fetches `data/*.json` into named exports on `src/data.js`), then calls `render()`. The whole app is **state mutation + re-render**: modules import `state` from `src/state.js`, mutate it, then call `render()` from `src/ui/render.js`. `render()` clears `#app` and dispatches on `state.screen` to a screen renderer in `src/ui/screens.js` (or `src/ui/battle.js` for the battle screen). There is no virtual DOM, no framework, no router. UI builds DOM via the `el(tag, props, children)` helper in `src/ui/dom.js`. The visual aesthetic is "document horror" — every screen is a page in a corrupted testimony; creatures are abstract pixel-bitmap glyphs with prose descriptions, not illustrated portraits.

## File map

### Data (JSON, drives behavior — prefer adding params here over hardcoding in JS)
- `data/types.json` — element list, type chart, palettes
- `data/templates.json` — species (baseStats, growth, abilityPool, primary/secondaryPassive, optional `starter: true`)
- `data/abilities.json` — ability dict keyed by ability id; see "Ability schema" below
- `data/passives.json` — passive dict keyed by passive id; each entry has params + a `codeRef` string naming the function in `passives.js` that consumes them
- `data/statuseffects.json` — burn/bloom/soaking/cursed/dazed canonical defaults
- `data/additionaleffects.json` — schema for the effect types that go in an ability's `phases[][]`. Each type has `label`, `desc`, optional `defaultTiming` (`before`/`eachHit`/`after`), optional `modifier: true` for damage-mod-only effects, optional `requires: [...]` for editor warnings, and a `params` map where each param has `type` (`percent`/`multiplier`/`int`/`bool`/`status`/`targets`/`swapTargets`/`statMods`), `default`, and `label`. Engine reads defaults from here when an instance omits a param; the editor uses it to render add/remove rows with editable inputs per type.
- `data/glyphs.json` — 16×16 hand-authored bitmap glyph per species. Format: each glyph is an array of 16 strings of 16 chars (`#` filled, `.` empty). Rendered as SVG by `src/ui/glyphs.js` (2×2 cells, `shape-rendering=crispEdges`).
- `data/voiceprose.json` — placeholder voice prose used by the dossier and screens. `subtitles[species|type]` (one-line voice tag), `notes[species|type]` (3-line field notes), `passives[passiveKey]` (single voice line per passive — the mechanical desc lives in `passives.json`), `afflictions[statusKey]` (lowercase prose name). Inline corruption markup: `~~strike~~`, `[[N]]` for an N-char redaction bar, `**gold**` for the gold accent.

### Core (`src/`)
- `state.js` — `state` singleton, `pushLog`, `resetGame`, `nextCreatureId`, constants (`TOTAL_WAVES=10`, `BREED_WAVES={3,6,9}`, `MAX_LEVEL=50`)
- `data.js` — `loadData()` + named exports (`TYPES`, `TYPE_CHART`, `TYPE_PALETTE`, `PASSIVES`, `ABILITIES`, `STATUSES`, `ADDITIONAL_EFFECTS`, `TEMPLATES`, `ALL_ENCOUNTER_SPECIES`, `GLYPHS`, `VOICE`)
- `creature.js` — `makeCreature`, `gainXp`, `xpToNext`, `growthRank`, `rankColor`, `displayName`, `freshFighter` (the in-battle wrapper)
- `breeding.js` — `makeChild`, `finalizeBreed` (called on breed waves)
- `encounter.js` — `generateEnemy(Party)`, `generateBoss(Party)`, `partyAvgLevel`
- `rng.js` — `rand`, `randi`, `pick`, `pickN`, `sleep`
- `audio.js` — `sfx(type)` WebAudio bleeps; types: `hit, crit, heal, select, faint, victory, capture, levelup`
- `art.js` — legacy procedural creature SVG generators. **Not used by the game UI** (the dossier renders bitmap glyphs from `data/glyphs.json` instead). Retained only so `tools/editor/` keeps working, plus `blendPalettes` is still called by `breeding.js` for the (currently unused) `creature.palette` field.
- `version.js` — single-line version string

### Combat (`src/combat/`)
- `battle.js` — orchestrator. `beginBattle`, `playerAct(abilityKey)`, `playerSwap`, `resolveAction` (the phase runner: walks effects in the current phase by timing band — `before` → damage loop with `eachHit` interleaved → `after`), `handleFaintsIfAny`, `finishBattleIfDone`. Multi-phase abilities queue the next phase on `attacker.queuedAbility`.
- `damage.js` — `effectiveStat`, `calculateDamage(attacker, defender, ability, dmgEffect, phase)`, `estimateDamage` (UI preview, deterministic)
- `status.js` — `applyStatus`, `cleanseStatuses`, `applyHeal`, `tickStartOfTurn`, `tickFighterStatuses`
- `abilities.js` — effect dispatcher. `runTimedEffects(timing, phase, ctx)` and `runEachHitEffects(phase, ctx)` walk a phase's effects and run handlers (apply_status, buff, heal_over_time, bracing, cleanse, lifesteal, hp_cost, swap). Damage modifiers (pierce, execute_scale, status_synergy) are not handled here — `damage.js`/`passives.js` consult them during damage calc. Helpers: `effParam(eff, key)`, `applyCursedOnSwap`, `resolveTargets`.
- `passives.js` — every passive consumer. Functions match `codeRef` in `passives.json`: `applyStatMult`, `applyPowerMult`, `checkEvasion`, `getCritMult`, `applyFlatDmgReduction`, `blocksStatus`, `modifyHeal`, `applyBattleStartPassive`, `applySwapInPassives`, `applyPostHitPassives`, `applyTurnStartPassives`, `applyBenchPassives`. Helper `hasPassive(f, key)` and local `p(key)` reads `PASSIVES[key]`.
- `ai.js` — `aiChoose(ef, pf)` returns ability key or `'_swap'`

### UI (`src/ui/`)
- `render.js` — `render()` dispatcher; `advanceWave()`. Renders the title `// bloodlines` header on every non-battle screen.
- `screens.js` — every non-battle screen (`renderStart, renderStarterPick, renderBloodlineReady, renderHeader, renderPreBattle, renderAftermath, renderBreed, renderVictory, renderGameover`). Each screen is a `doc-page` opening with a `// page · subject` tag and ending with text-row `▸ doc-button` actions.
- `battle.js` — dossier battle screen. Two columns of testimony (engagement strip → bench sticker → name → subtitle → field notes inline-with-glyph → hp bar → stat bars → afflictions → passives) with a dual-state action box (action menu / narrative).
- `cards.js` — `creatureCardEl` (a creature as a doc-card paragraph: glyph + name + subtitle + stat-mini cells + voice/mechanical passive lines), `openInspectModal`, `openAbilityTooltip` (both render as `doc-modal`).
- `glyphs.js` — `renderGlyph(species)` returns SVG markup with 2×2 pixel cells and `shape-rendering=crispEdges`. Color is `currentColor`; size via CSS.
- `textCorrupt.js` — `parseProse(input)` consumes the `~~strike~~ / [[N]] / **gold**` markup and returns HTML. `strike()` / `redact()` / `gold()` element builders for direct DOM use.
- `animations.js` — `spawnFloat`, `spawnCallout`, `shakeStage`, `playLunge`, `playRecoil` (DOM/CSS only — float numbers spawn over the targeted dossier glyph; shake/lunge/recoil are CSS animations on the dossier column).
- `dom.js` — `el(tag, props, children)`, `attachLongPress`, `app()`, tooltip helpers
- `hpTween.js` — `applyHpFill(fillEl, fighter)` smoothly tweens a width fill between previous and current HP percentage

### Assets / tooling
- `index.html` — single page, `<div id="app">` + `<div id="modal-root">`, loads IBM Plex Mono and `src/main.js` as module. No canvas, no Phaser.
- `styles.css` — all styles (single file). Layered as: tokens (`:root`) → corruption text utilities → body/app shell → legacy float/callout + modal scrim → DOSSIER BATTLE SCREEN section → DOCUMENT PAGE LAYOUT section.
- `tools/editor/` — separate standalone data editor; not loaded by the game

## Key data schemas

### Ability (`data/abilities.json`)
Keyed by ability id. Fields:
- `name`, `desc` — display
- `element` — `fire|water|grass|light|dark` or absent (neutral). Ability-level metadata; the type chart applies at the ability level for all of its damage effects.
- `priority` — turn-order tiebreaker (default 0)
- `phases` — `[[effect, effect, ...], [...]]`. An array of phases; each phase is an array of effects. Single-turn abilities have one phase. Multi-phase abilities (formerly "charge attacks") resolve one phase per turn — phase 0 runs on first use, the next phase is queued via `attacker.queuedAbility`, and so on. Swaps / faints / forced swaps clear the queue (the ability fizzles).

#### Effect (entry in `phases[i][j]`)
`{ type, ...params, timing? }`. The `type` keys into `data/additionaleffects.json` for the schema. `timing` is one of `before` / `eachHit` / `after` (default per type). Modifier-only effects (pierce, execute_scale, status_synergy) ignore timing.

Built-in effect types:
- `damage` — power × hits, targets (default `["enemy"]`). Damage modifiers in the same phase apply.
- `apply_status` — status, targets, optional turns / percentPerTurn override
- `buff` — statMult `{atk?, def?, spd?}` (battle-long), targets (default `["self"]`). Negative values for debuffs.
- `heal_over_time` — percent / turns, targets (default `["self"]`)
- `bracing` — current-turn damage reduction on targets
- `swap` — targets `self` / `enemy` (or both), optional `buffOnSwap` / `healOnSwap` for incoming on self-swap
- `lifesteal` — percentOfDamage; default timing `eachHit`
- `hp_cost` — percent of user max HP at phase start; default timing `before`
- `cleanse` — targets, plus three booleans (`cleanseStatuses` / `cleanseBuffs` / `cleanseDebuffs`)
- Modifiers (no timing, consulted by `calculateDamage` / `applyPowerMult`):
  - `execute_scale` (scaleAmount), `pierce` (defReduction), `status_synergy` (status, powerMult)

### Passive (`data/passives.json`)
Each entry has params + a `codeRef` string that names the function in `passives.js` reading them. Add a passive: add JSON entry, then either extend the named function or wire up a new one. `codeRef: "TODO"` means params exist but no implementation yet.

### Status (`data/statuseffects.json`)
Canonical defaults (`turns`, `percentPerTurn`, etc.) read by `applyStatus` when call sites omit overrides.

### Fighter (in-battle, built by `freshFighter` in `creature.js`)
`{ creature, hp, statMods:{atk,def,spd}, bracingThisTurn, healing, statuses:{burn,bloom,soaking,cursed,dazed}, queuedAbility:{key, phaseIdx}|null, pendingSwapBuff, pendingSwapHeal, ... }`. The underlying `creature` object is never mutated during a fight. `queuedAbility` is set when a multi-phase ability has remaining phases; cleared on swap or faint.

## Conventions
- **Data over code.** New numbers belong in JSON. The pattern across the codebase: JSON entry → named function in `passives.js`/`abilities.js` reads `eff.type` or `passive.codeRef` and applies params. Avoid hardcoding magic numbers in JS — prefer adding a field to the JSON.
- **`state` is global and mutated directly.** Don't pass it as a parameter; import it.
- **Re-render after mutation.** Any user-visible change ends with `render()`. Async flows in `battle.js` interleave `render()` and `await sleep(ms)` for animation pacing.
- **No build step.** ES modules, browser-native. Don't introduce npm/bundlers without asking.
- **No comments unless non-obvious.** Existing code follows this; match it. Identifiers carry intent.
- **Two-creature party + two-creature bench.** `state.pf` (player active fighter), `state.bf` (player bench), `state.ef`, `state.ebf`. Swaps mutate these references in pairs; many bugs come from forgetting to update `state.activeIdx` / `state.enemyActiveIdx` / `state.enemy` alongside.
- **Side string `'player'|'enemy'`** is threaded through combat for log/animation routing.

## Adding things — checklists

**New ability:** add an entry in `abilities.json` with `phases: [[...]]`. Compose effects from the existing types (see Effect schema). For brand-new behavior, add a type to `additionaleffects.json` and a case to `handleEffect` in `combat/abilities.js` (or, for damage-mod-only behavior, consult it in `damage.js`/`passives.js`). Reference the ability key in one or more `abilityPool`s in `templates.json`.

**New passive:** add entry with params in `passives.json` (include `codeRef`); implement the consumer in `combat/passives.js` (use `hasPassive(f, key)` + `p(key)`); reference in a species' `primaryPassive` / `secondaryPassive`.

**New status effect:** add to `statuseffects.json`; extend the `applyStatus` switch in `combat/status.js`; add a tick branch in `tickFighterStatuses` if it ticks; add a slot in the `statuses` object of `freshFighter` (`creature.js`); decide whether `cleanseStatuses` should clear it.

**New screen:** add a renderer to `src/ui/screens.js`, register in the `switch` in `render.js`, set `state.screen = 'name'` somewhere to enter it.

**New species:** add entry in `templates.json` (set `starter: true` if it should appear in starter selection).

## Test / verify
No automated tests. Manual: open `index.html` in a browser, play through the relevant flow. For combat changes, the in-battle log (`state.log`, rendered on the battle screen) is the primary signal.
