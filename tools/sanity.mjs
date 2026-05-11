// Sanity-check combat math at different levels.
//
// Not a real test — just prints expected damage for a few canonical matchups
// so we can eyeball whether things feel right.

import fs from 'fs';
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const TYPES = read('data/types.json');
const ABILITIES = read('data/abilities.json');
const TEMPLATES = read('data/templates.json');

const TYPE_CHART = TYPES.TYPE_CHART;

function makeLevel(template, level) {
  const stats = { ...template.baseStats };
  for (let l = 2; l <= level; l++) {
    stats.hp  += Math.max(3, Math.round(template.growth.hp  * 4));
    stats.atk += Math.max(1, Math.round(template.growth.atk * 2.0));
    stats.def += Math.max(1, Math.round(template.growth.def * 1.6));
    stats.spd += Math.max(1, Math.round(template.growth.spd * 1.4));
  }
  return { ...template, level, stats, maxHp: stats.hp };
}

function calc(attacker, defender, ability, charge = 0, combo = 0) {
  const phase = ability.phases?.[0] || [];
  const dmgEff = phase.find(e => e.type === 'damage');
  if (!dmgEff) return 0;
  let power = dmgEff.power || 0;
  const spend = phase.find(e => e.type === 'spend_charge');
  if (spend && charge > 0) power *= 1 + (spend.perStack || 0.5) * charge;
  const atk = attacker.stats.atk;
  const def = defender.stats.def;
  const elem = ability.element;
  const mult = elem ? (TYPE_CHART[elem][defender.type] || 1) : 1;
  let base = power * 0.18 + atk * 0.5 - def * 0.35;
  base = Math.max(1, base);
  let raw = base * mult;
  raw *= 1 + Math.min(0.36, 0.12 * combo);
  return Math.round(raw);
}

console.log('═══ EARLY GAME (L1 vs L1) ═══\n');
const tests = [
  ['Lumenpup', 'Pyrelord', 'halo'],
  ['Lumenpup', 'Pyrelord', 'sunburst'],
  ['Pyrelord', 'Lumenpup', 'ember'],
  ['Pyrelord', 'Lumenpup', 'pyre'],
  ['Pyrelord', 'Loamback', 'pyre'],     // fire vs grass: super
  ['Tidewhelp', 'Pyrelord', 'surge'],   // water vs fire: super
  ['Tidewhelp', 'Loamback', 'drown'],   // water vs grass: weak
];

for (const [aName, dName, abKey] of tests) {
  const ta = TEMPLATES.find(t => t.species === aName);
  const td = TEMPLATES.find(t => t.species === dName);
  const a = makeLevel(ta, 1);
  const d = makeLevel(td, 1);
  const ab = ABILITIES[abKey];
  const noCharge = calc(a, d, ab, 0, 0);
  const c2 = calc(a, d, ab, 2, 0);
  const c3 = calc(a, d, ab, 3, 0);
  const c3combo = calc(a, d, ab, 3, 2);
  const tag = ab.tags?.includes('spend') ? ' (spend)' : '';
  console.log(`${aName}(atk${a.stats.atk}) → ${ab.name}${tag} → ${dName}(hp${d.maxHp} def${d.stats.def}): ${noCharge} dmg | +2c: ${c2} | +3c: ${c3} | combo*2: ${c3combo}`);
}

console.log('\n═══ MID GAME (L5 vs L5) ═══\n');
for (const [aName, dName, abKey] of tests) {
  const ta = TEMPLATES.find(t => t.species === aName);
  const td = TEMPLATES.find(t => t.species === dName);
  const a = makeLevel(ta, 5);
  const d = makeLevel(td, 5);
  const ab = ABILITIES[abKey];
  const noCharge = calc(a, d, ab, 0, 0);
  const c3 = calc(a, d, ab, 3, 0);
  console.log(`L5 ${aName}(atk${a.stats.atk}) → ${ab.name} → ${dName}(hp${d.maxHp} def${d.stats.def}): ${noCharge} | +3c: ${c3}`);
}

console.log('\n═══ FULL TURN ANALYSIS (L1 Lumenpup vs L1 Pyrelord) ═══\n');
const lumen = makeLevel(TEMPLATES.find(t => t.species === 'Lumenpup'), 1);
const pyre = makeLevel(TEMPLATES.find(t => t.species === 'Pyrelord'), 1);
const halo = ABILITIES.halo, sunburst = ABILITIES.sunburst;
console.log(`Lumenpup HP: ${lumen.maxHp}, Pyrelord HP: ${pyre.maxHp}`);
console.log(`Turn 1, just halos (3 energy = 3 halos, gain 3 charge):`);
const h1 = calc(lumen, pyre, halo, 0, 0);
const h2 = calc(lumen, pyre, halo, 0, 1);
const h3 = calc(lumen, pyre, halo, 0, 2);
console.log(`  Halo 1: ${h1}, 2: ${h2}, 3: ${h3} = ${h1+h2+h3} total. Charge 0→3.`);
console.log(`Turn 2, sunburst @ 3 charge + halo (3 energy = sunburst+halo):`);
const s1 = calc(lumen, pyre, sunburst, 3, 0);
console.log(`  Sunburst @3c: ${s1}, then Halo: ${calc(lumen, pyre, halo, 0, 1)} = ${s1 + calc(lumen, pyre, halo, 0, 1)} total.`);
console.log(`Combined 2-turn damage vs Pyrelord HP ${pyre.maxHp}: ${h1+h2+h3 + s1 + calc(lumen, pyre, halo, 0, 1)}`);

console.log('\n═══ STRIKE SPAM COMPARISON ═══\n');
const strike = ABILITIES.strike;
const st1 = calc(lumen, pyre, strike, 0, 0);
const st2 = calc(lumen, pyre, strike, 0, 1);
const st3 = calc(lumen, pyre, strike, 0, 2);
console.log(`3 Strikes: ${st1} + ${st2} + ${st3} = ${st1+st2+st3} damage per turn.`);
console.log(`So burst (build-then-spend) vs sustain (strike) over 2 turns:`);
console.log(`  Burst: ${h1+h2+h3 + s1 + calc(lumen, pyre, halo, 0, 1)} | Sustain: ${(st1+st2+st3)*2}`);
