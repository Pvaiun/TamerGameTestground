import { chromium } from 'playwright';

async function snap(page, file) {
  await page.screenshot({ path: file, fullPage: true });
  console.log(`saved ${file}`);
}

async function playRound(page, max=10) {
  for (let i = 0; i < max; i++) {
    await page.waitForTimeout(700);
    try {
      const ab = await page.$('.ability-card:not([disabled])');
      if (ab) { await ab.click({ timeout: 1500 }); continue; }
      const end = await page.$('.opt-btn.end-turn:not([disabled])');
      if (end) { await end.click({ timeout: 1500 }); break; }
    } catch (e) {}
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 920, height: 1100 } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:8123/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await snap(page, 'tools/sc-1-start.png');

  await page.click('button:has-text("Accept the file")');
  await page.waitForTimeout(300);
  await snap(page, 'tools/sc-2-starter.png');

  const c = await page.$$('.doc-card.selectable');
  await c[0].click();
  await page.waitForTimeout(300);

  await page.click('button:has-text("descend")');
  await page.waitForTimeout(500);
  await snap(page, 'tools/sc-4-prebattle.png');

  const lead = await page.$$('.doc-card.selectable');
  await lead[0].click();
  await page.waitForTimeout(800);
  await snap(page, 'tools/sc-5-battle-r1-start.png');

  // Play 5 rounds
  for (let r = 0; r < 5; r++) {
    await playRound(page);
    await page.waitForTimeout(1000);
    if (!await page.$('.battle-screen')) break;
  }

  await page.waitForTimeout(800);
  await snap(page, 'tools/sc-7-aftermath.png');

  // Leave capture, go to path picker
  if (await page.$('button:has-text("Leave them")')) {
    await page.click('button:has-text("Leave them")');
  }
  await page.waitForTimeout(500);
  await snap(page, 'tools/sc-8-path.png');

  // Pick records hall if available, else battle
  const recordsBtn = await page.$('.path-card:has-text("records")');
  if (recordsBtn) await recordsBtn.click();
  else {
    const cards = await page.$$('.path-card');
    if (cards.length > 1) await cards[1].click();
  }
  await page.waitForTimeout(500);
  await snap(page, 'tools/sc-9-records-or-next.png');

  await browser.close();
  console.log('screenshots done');
})();
