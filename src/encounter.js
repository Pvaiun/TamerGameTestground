import { pick, randi } from './rng.js';
import { TEMPLATES, ALL_ENCOUNTER_SPECIES } from './data.js';
import { MAX_LEVEL } from './state.js';
import { makeCreature } from './creature.js';

export function partyAvgLevel(roster) {
  if (!roster.length) return 1;
  return Math.round(roster.reduce((a, c) => a + c.level, 0) / roster.length);
}

export function generateEnemy(wave, partyLevel) {
  const speciesName = pick(ALL_ENCOUNTER_SPECIES);
  const t = TEMPLATES.find(x => x.species === speciesName) || TEMPLATES[0];
  const baseLvl = partyLevel + Math.floor((wave - 1) / 2) + randi(0, 1);
  const lvl = Math.max(1, Math.min(MAX_LEVEL, baseLvl));
  const c = makeCreature(t, lvl);
  c.stats.hp  = Math.round(c.stats.hp  * 1.05);
  c.stats.atk = Math.round(c.stats.atk * 1.05);
  c.stats.def = Math.round(c.stats.def * 1.05);
  c.maxHp = c.stats.hp;
  return c;
}

export function generateEnemyParty(wave, partyLevel) {
  const a = generateEnemy(wave, partyLevel);
  let b;
  let tries = 0;
  do {
    b = generateEnemy(wave, partyLevel);
    tries++;
  } while (b.species === a.species && tries < 10);
  return [a, b];
}

export function generateBoss(partyLevel) {
  const speciesName = pick(ALL_ENCOUNTER_SPECIES);
  const t = TEMPLATES.find(x => x.species === speciesName) || TEMPLATES[0];
  const lvl = Math.max(8, Math.min(MAX_LEVEL, partyLevel + 5));
  const c = makeCreature(t, lvl);
  c.stats.hp  = Math.round(c.stats.hp  * 1.5);
  c.stats.atk = Math.round(c.stats.atk * 1.4);
  c.stats.def = Math.round(c.stats.def * 1.3);
  c.maxHp = c.stats.hp;
  c.customName = `Apex ${c.species}`;
  return c;
}

export function generateBossParty(partyLevel) {
  const boss1 = generateBoss(partyLevel);
  let boss2;
  let tries = 0;
  do {
    boss2 = generateBoss(partyLevel);
    tries++;
  } while (boss2.species === boss1.species && tries < 10);
  return [boss1, boss2];
}
