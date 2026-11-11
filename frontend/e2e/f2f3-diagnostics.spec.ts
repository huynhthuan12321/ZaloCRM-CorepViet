// Chẩn đoán có đối chứng F1: ghi số đo thô ngoài repository, không nới gate.
import { test, expect } from '@playwright/test';
import { installF2F3Mocks } from './helpers/mock-f2f3';
import { APP, BASE, PHONE_390, newCtx, FIXED_NOW, RES, ensureDir } from './helpers/f2f3-env';
import fs from 'node:fs';
import path from 'node:path';
test.skip(!process.env.BASE_DIST, 'Chẩn đoán đối chứng cần bản build F1 tại BASE_DIST.');
test('scrollbar F1 và candidate', async ({ browser, browserName }) => {
  for (const origin of [BASE, APP]) {
    const ctx = await newCtx(browser, PHONE_390);
    const p = await ctx.newPage();
    await p.clock.setFixedTime(new Date(FIXED_NOW));
    await installF2F3Mocks(p, {});
    await p.goto(`${origin}/account`);
    await expect(p.locator('[data-menu-id]')).not.toHaveCount(0);
    const result = await p.evaluate(() => {
      const el = document.querySelector('.m-main__scroll') as HTMLElement;
      const before = el.scrollLeft;
      el.scrollLeft = 100;
      const moved = el.scrollLeft;
      el.scrollLeft = before;
      return {
        main: { client: el.clientWidth, scroll: el.scrollWidth, offset: el.offsetWidth,
          rect: el.getBoundingClientRect().toJSON(), moved, overflowX: getComputedStyle(el).overflowX },
        children: Array.from(el.children).map(e => ({ cls: e.className, client: e.clientWidth, scroll: e.scrollWidth, rect: e.getBoundingClientRect().toJSON() })),
        docX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    ensureDir(RES);
    fs.writeFileSync(path.join(RES, `scrollbar-${browserName}-${origin === BASE ? 'F1' : 'candidate'}.json`), JSON.stringify(result, null, 2));
    await ctx.close();
  }
});

test('đồng hồ đóng băng trước mount vẫn dựng được desktop có dữ liệu', async ({ browser, browserName }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date(FIXED_NOW) });
  await p.clock.pauseAt(new Date(FIXED_NOW));
  await installF2F3Mocks(p, { rasterImages: true });
  await p.goto(`${APP}/chat/qa-conv-2`);
  await p.clock.runFor(1500);
  await expect(p.locator('.msg-bubble-wrap').first()).toBeVisible();
  await p.clock.runFor(1500);
  const before = await p.locator('.smax-info-col').innerText();
  await p.waitForTimeout(1500);
  const after = await p.locator('.smax-info-col').innerText();
  expect(before).toBe(after);
  console.log(browserName, 'frozen mounted countdown stable');
  await ctx.close();
});
