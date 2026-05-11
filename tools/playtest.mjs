// Headless playthrough — walks several rooms to catch runtime errors.

import { chromium } from 'playwright';

const URL = 'http://localhost:8123/index.html';

const errors = [];
const warnings = [];

async function clickIfExists(page, selector, name) {
  const elt = await page.$(selector);
  if (!elt) return false;
  await elt.click();
  console.log(`  → clicked ${name}`);
  return true;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 920, height: 800 } });
  const page = await ctx.newPage();
  page.on('console', msg => {
    const t = msg.type();
    if (t === 'error') {
      const txt = msg.text();
      if (txt.includes('ERR_CERT') || txt.includes('Failed to load resource')) return;
      errors.push(`[console.error] ${txt}`);
    } else if (t === 'warning') warnings.push(`[console.warn] ${msg.text()}`);
  });
  page.on('pageerror', err => errors.push(`[pageerror] ${err.message}\n${err.stack || ''}`));

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  console.log('▸ start screen');
  await page.click('button:has-text("Accept the file")');
  await page.waitForTimeout(300);

  console.log('▸ pick 2nd starter');
  const starters = await page.$$('.doc-card.selectable');
  if (starters[0]) await starters[0].click();
  await page.waitForTimeout(300);

  console.log('▸ bloodline → descend');
  await page.click('button:has-text("descend")');
  await page.waitForTimeout(500);

  console.log('▸ prebattle → pick lead');
  const lead = await page.$$('.doc-card.selectable');
  if (lead[0]) await lead[0].click();
  await page.waitForTimeout(800);

  console.log('▸ battle');
  for (let round = 0; round < 30; round++) {
    await page.waitForTimeout(700);
    const screen = await page.$('.battle-screen');
    if (!screen) { console.log('  battle ended (screen gone)'); break; }
    try {
      const ab = await page.$('.ability-card:not([disabled])');
      if (ab) { await ab.click({ timeout: 1500 }); continue; }
      const end = await page.$('.opt-btn.end-turn:not([disabled])');
      if (end) { await end.click({ timeout: 1500 }); continue; }
    } catch (e) { /* element may have re-rendered, just retry next iteration */ }
  }

  // Aftermath?
  await page.waitForTimeout(800);
  console.log('▸ post-battle');
  // Try to capture or leave.
  if (await clickIfExists(page, 'button:has-text("Leave them")', 'leave them')) {}
  else if (await clickIfExists(page, 'button:has-text("Take them on")', 'take them')) {}
  await page.waitForTimeout(500);

  // Path picker?
  console.log('▸ path picker');
  const path = await page.$('.path-card');
  if (path) await path.click();
  await page.waitForTimeout(500);

  // Another battle/records/tend
  // If prebattle → click lead
  if (await page.$('.doc-card.selectable')) {
    const c = await page.$$('.doc-card.selectable');
    if (c[0]) { await c[0].click(); console.log('  → picked lead for 2nd fight'); }
  }
  await page.waitForTimeout(800);

  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(700);
    try {
      const ab = await page.$('.ability-card:not([disabled])');
      if (ab) { await ab.click({ timeout: 1500 }); continue; }
      const end = await page.$('.opt-btn.end-turn:not([disabled])');
      if (end) { await end.click({ timeout: 1500 }); continue; }
    } catch (e) {}
    if (await page.$('.doc-prose')) break;
  }

  console.log(`\n═══ ERRORS (${errors.length}) ═══`);
  for (const e of errors) console.log(e);
  console.log(`\n═══ WARNINGS (${warnings.length}) ═══`);
  for (const w of warnings) console.log(w);

  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(err => {
  console.error('PLAYTEST FAILED:', err);
  process.exit(2);
});
