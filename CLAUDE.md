# Bloodlines — Codebase Map (intake)

A document-horror diagnostic deckbuilder. You are an intake nurse in a hospital
that admits patients other hospitals will not. Ten descents. Each one is a
patient sitting across the desk from you. You read them by playing approach
cards; when you have read them enough, you name them and close the file.

Vanilla ES modules, no build step, no deps. Open `index.html` to run.

## Core loop

1. **Admission** — pick your first method (Ask / Reflect / Hold / Witness /
   Match). This is the first card added to your kit on top of the universal
   six (Listen, Note, Steady, Press, Wait, Step Back).
2. **Hallway** — the corridor between intakes. Shows your composure, scars,
   and the bracketed name of the next patient. One click to enter.
3. **Intake** — turn-based card resolution against a single patient.
   - Player has **Composure** (HP, persistent across the run), **Insight**
     (per-intake; full = you can play Name), and **Pages** (per-turn budget).
   - Patient has a hidden **category** (one of five wards) and a visible
     **intent** for the current turn.
   - Play cards within Pages. End turn. Patient resolves intent.
4. **Result** — file closes (won), or file stays open (lost; take a scar).
5. **Boon** — between intakes, add one method to your file, or rest. Waves
   3/6/9 guarantee a missing fit card; other waves offer it on a coin-flip.
6. Repeat. Wave 10 is yourself.

## Combat (intake) state machine

Pages refresh each turn. Player plays cards until Pages = 0 or clicks End
Turn. Then `resolveIntent()`:
- If the patient's intent is `class`-blocked (by a played approach with
  matching `blocksClass` or by `restrained`), no damage.
- If a played approach is in the intent's `counteredBy` list AND that card is
  the patient's category-fit card, gain `intent.insightOnCounter` insight and
  reveal `intent.revealOnCounter` fragments. (Generic counter cards block
  damage but don't earn insight.)
- Otherwise full damage, scaled by patient tier and class-damage scars.
- Pick next intent. Turn limit = 9 forces `closing` intent.

Win = Insight to max + play `name_them`. Lose = Composure to 0 → take a
scar from the pool matching the intent class that broke you. Three scars
ends the run.

## File map

### Data (JSON)
- `data/globals.json` — composureMax, pagesPerTurn, intakeTurnLimit, etc.
- `data/categories.json` — the five wards (mourner / visitor / tenant /
  witness / stranger). Each has a dominant intent class and a fit approach.
- `data/intents.json` — what patients do per turn. Each has class, counteredBy,
  insightOnCounter (paid only if fit card was used), damage.
- `data/approaches.json` — player cards. Universal core + 5 category-fit
  cards + specialty cards (sedate, mirror, pry, mark, cleanse, lean_in,
  refuse, document, diagnose, name_them).
- `data/scars.json` — run-long penalties. Pools keyed by the intent class
  that broke you. Each scar has key + value applied at runtime.
- `data/patients.json` — patient species (the file's case files). Each has
  category, intent pool, fragments, name, subtitle, tier.
- `data/glyphs.json` — 16×16 hand-drawn glyphs (one per species). Repurposed
  from the earlier creature design but now anchors the patient's identity.
- `data/voiceprose.json` — narrative templates. events, finale, hallway,
  protagonistNotes (the protagonist's own file fills in each wave),
  endings, boon, admission.

### Core
- `state.js` — global `state`, `resetRun`, `pushLore`, `nextId`.
- `data.js` — `loadData()` populates named exports.
- `run.js` — `beginRun`, `advanceToNextIntake`, `intakeWon`, `intakeLost`,
  `applyBoon`, `rollScarForLoss`. Manages wave transitions.
- `intake.js` — `beginIntake`, `playApproach`, `endTurnNow`,
  `continueAfterIntake`. The turn engine. Resolves intents, picks next, etc.
- `approaches.js` — `resolveApproach` (card kind dispatcher), `canPlay`,
  `effectiveCost`. Pure dispatcher — does not write state directly, uses
  the `helpers` object passed from `intake.js`.
- `meta.js` — localStorage persistence. Saves carriedNotes (your file
  carries 2 cards forward into the next admission), discoveredApproaches,
  patientId (increments each run).

### UI
- `render.js` — screen dispatcher.
- `admission.js` — start screen + method picker.
- `hallway.js` — between-intakes prose + next-patient teaser.
- `intake_ui.js` — the intake screen: patient column (file + glyph) | me
  column (composure / insight / pages / scars) + intent banner + kit grid
  + end turn button + log panel.
- `intake_result.js` — file-closed or unfiled screen.
- `boon.js` — pick one method to file, or rest.
- `endings.js` — won / lost screens.
- `glyphs.js`, `textCorrupt.js`, `dom.js` — preserved utilities.

## Conventions
- **Data over code.** New numbers belong in JSON. Effect kinds dispatch
  through `resolveApproach`/`resolveIntent` switches.
- **`state` is global, mutated directly.** Don't pass it as a parameter.
- **Re-render after mutation.** Synchronous; no async beats.
- **No build step.**
- **Voice prose** uses inline corruption markup: `~~strike~~`, `[[N]]`
  (red bar), `**gold**`, `!!blood-red!!`. Parsed by `textCorrupt.js`.

## Adding things
- **New approach:** entry in `approaches.json` with `cost`, `kind`, `tags`,
  `desc`, `voice`. Add a `case '<kind>'` in `approaches.js`.
- **New intent:** entry in `intents.json` with `class`, `counteredBy`,
  `damage`, `insightOnCounter`, `desc`. Reference in patient `intents` pool.
- **New patient:** entry in `patients.json` with category, intent pool,
  fragments, name, subtitle, tier. Glyph in `glyphs.json` keyed by species.
- **New scar:** entry in `scars.json` (and add the key to a pool). The
  effect is dispatched by `key` in `intake.js`'s scar accumulators.
- **New screen:** module in `src/ui/`, registered in `render.js` switch.
