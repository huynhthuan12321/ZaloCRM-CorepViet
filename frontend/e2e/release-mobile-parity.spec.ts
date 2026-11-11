// Release baseline: production c4a3e4e. Exact comparison, no CSS changes or tolerance.
// Every scene has three production/production controls and three production/release pairs.
import { expect, test as base, type Browser, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { installF2F3Mocks } from './helpers/mock-f2f3';
import { installF1Mocks, OWNER } from './helpers/mock-f1';
import { installCrmMocks } from './helpers/mock-crm';
import { pixelDiff } from './helpers/pixel-diff';
import { routerPush } from './f2f3-helpers';

const test = base.extend<{}, { browser: Browser }>({
  browser: [async ({ playwright, browserName }, use) => {
    const browser = await playwright[browserName].launch(browserName === 'chromium'
      ? { args: ['--disable-gpu', '--disable-skia-runtime-opts', '--force-color-profile=srgb', '--run-all-compositor-stages-before-draw', '--disable-new-content-rendering-timeout', '--disable-threaded-animation', '--disable-threaded-scrolling', '--font-render-hinting=none', '--disable-lcd-text', '--disable-partial-raster', '--disable-zero-copy'] } : {});
    await use(browser); await browser.close();
  }, { scope: 'worker' }],
});
const APP = `http://localhost:${process.env.D_APP_PORT ?? 4244}`;
const PROD = `http://localhost:${process.env.D_BASE_PORT ?? 4245}`;
const OUT = process.env.RELEASE_PIXEL_OUT!;
const RASTER_POINTS = [{ x: 768, y: 438 }, { x: 769, y: 438 }, { x: 768, y: 439 }];
test.skip(!process.env.RELEASE_PIXEL_OUT || !process.env.BASE_DIST, 'Requires isolated release output and production build');
const EDITOR = '.message-thread .input-editor [contenteditable="true"]';
const scenes = [
  { key: 'media-grid', url: '/media', ready: '.media-page .card' },
  { key: 'media-detail', url: '/media', ready: '.media-page .card' },
  { key: 'friends', url: '/friends?nick=qa-nick-1', ready: 'text=Nguyễn Văn Khách 01' },
  { key: 'marketing-lists', url: '/marketing/lists', ready: '.lists-view tbody tr' },
  { key: 'settings-profile', url: '/settings/personal/profile', ready: '.account-page' },
  { key: 'chat-empty', url: '/chat/qa-conv-1', ready: EDITOR },
  { key: 'chat-media', url: '/chat/qa-conv-1', ready: EDITOR },
  { key: 'chat-draft', url: '/chat/qa-conv-1', ready: EDITOR },
  { key: 'profile', url: '/contacts/qa-ct-1/profile', ready: '.cp-hero' },
  { key: 'appointments', url: '/appointments', ready: '.apt-hero' },
];

async function pinProfile(page: Page) {
  const toggle = page.locator('.info-expand-toggle');
  await expect(toggle).toBeVisible();
  if ((await toggle.innerText()).includes('Xem đầy đủ')) await toggle.click();
  if (!(await toggle.getAttribute('class'))?.includes('is-sticky')) await toggle.click();
  await expect(toggle).toHaveClass(/is-sticky/);
}

async function shot(page: Page, origin: string, scene: typeof scenes[number]) {
  await page.bringToFront();
  await page.clock.setFixedTime(new Date('2026-11-07T10:00:00+07:00'));
  if (scene.key === 'settings-profile') await installF1Mocks(page, { user: OWNER });
  else if (scene.key === 'profile' || scene.key === 'appointments') await installCrmMocks(page);
  else await installF2F3Mocks(page, { rasterImages: true });
  await page.addInitScript(() => localStorage.setItem('selected-zalo-account', 'qa-nick-1'));
  if (process.env.RELEASE_CHAT_CLOSED === '1') {
    // Match the original F5 closed-popover contract through the real saved setting.
    await page.addInitScript(() => localStorage.setItem('filter-sidebar-collapsed', '1'));
  }
  await page.route('**/api/v1/privacy/status', r => r.fulfill({ json: { hasPin: false, lockedUntil: null, activeSessionCount: 0, activeSessions: [] } }));
  await page.goto(origin + scene.url);
  await page.locator(scene.ready).first().waitFor({ timeout: 25000 });
  await page.waitForTimeout(1800);
  // Both builds use the real Pin action; do not capture across the 5-second auto-collapse.
  if (scene.key.startsWith('chat')) await pinProfile(page);
  if (scene.key === 'media-detail') await page.locator('.media-page .card').first().click();
  if (scene.key === 'chat-media') {
    await page.locator('button[title^="Media"]').first().click();
    await page.locator('.mtp img').first().waitFor();
  }
  if (scene.key === 'chat-draft') {
    await page.locator(EDITOR).fill('Nháp riêng của khách A');
    await routerPush(page, '/chat/qa-conv-2');
    await page.locator(EDITOR).waitFor();
    await expect(page.locator('.ip-name-line')).toHaveText('Khách Giả B');
    await pinProfile(page);
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].filter(i => !i.complete).map(i => new Promise(resolve => {
      i.addEventListener('load', resolve); i.addEventListener('error', resolve);
    })));
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await page.waitForTimeout(1200);
  // WebKit can restore editor focus after blur-to-BODY. Focus the real editor
  // identically on both builds and wait; no CSS/class changes or masks.
  if (scene.key.startsWith('chat')) {
    await page.locator(EDITOR).focus(); await page.waitForTimeout(500);
    await expect(page.locator(EDITOR)).toBeFocused();
  }
  // Flush a complete paint on WebKit before the measured frame. No style changes.
  if (page.context().browser()?.browserType().name() === 'webkit') {
    await page.screenshot({ animations: 'disabled', caret: 'hide', scale: 'css' });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  }
  const rect = scene.key === 'chat-draft' ? await page.locator('.message-thread .input-row').boundingBox() : null;
  const sale = scene.key.startsWith('chat') && process.env.RELEASE_CHAT_CLOSED !== '1'
    ? await page.locator('.filter-sidebar .section').filter({ has: page.locator('.section-header', { hasText: 'Sale phụ trách' }) }).boundingBox() : null;
  const sidebar = scene.key.startsWith('chat') && process.env.RELEASE_CHAT_CLOSED !== '1'
    ? await page.locator('.filter-sidebar').boundingBox() : null;
  const text = scene.key.startsWith('chat') ? await page.locator(EDITOR).innerText() : null;
  return { png: await page.screenshot({ animations: 'disabled', caret: 'hide', scale: 'css' }), rect, text, sale, sidebar };
}

for (const scene of scenes) for (let run = 1; run <= 3; run++) for (const control of [true, false]) {
  test(`${scene.key} ${control ? 'CONTROL' : 'REAL'} ${run}`, async ({ browser, browserName }) => {
    test.setTimeout(120000);
    fs.mkdirSync(OUT, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1,
      locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const a = await shot(page, PROD, scene);
    const b = await shot(page, control ? PROD : APP, scene);
    await ctx.close();
    const tag = `${browserName}-${scene.key}-${control ? 'control' : 'real'}-${run}`;
    fs.writeFileSync(path.join(OUT, tag + '-before.png'), a.png);
    fs.writeFileSync(path.join(OUT, tag + '-after.png'), b.png);
    const r = await pixelDiff(browser, a.png, b.png, 0);
    const { diffPngBase64, ...counts } = r;
    if (diffPngBase64) fs.writeFileSync(path.join(OUT, tag + '-diff.png'), Buffer.from(diffPngBase64, 'base64'));
    // The approved F4 behavior may change only the composer row when switching A→B.
    // Count outside differences directly; do not paint over or mask the screenshots.
    const p = await browser.newPage();
    const details = await p.evaluate(async ({ a64, b64, rect, sale, sidebar, points }) => {
      async function pixels(b64: string) {
        const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
        const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
        const g = c.getContext('2d')!; g.drawImage(bmp, 0, 0);
        return { width: c.width, data: g.getImageData(0, 0, c.width, c.height).data };
      }
      const a = await pixels(a64), b = await pixels(b64);
      const outside: number[] = []; let inside = 0, salePixels = 0, sidebarOutsideSalePixels = 0;
      const contains = (r: typeof rect, x: number, y: number) => r && x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
      for (let i = 0; i < a.data.length; i += 4) {
        if (![0, 1, 2, 3].some(k => a.data[i + k] !== b.data[i + k])) continue;
        const n = i / 4, x = n % a.width, y = Math.floor(n / a.width);
        if (contains(sale, x, y)) salePixels++;
        else if (contains(rect, x, y)) inside++;
        else { outside.push(n); if (contains(sidebar, x, y)) sidebarOutsideSalePixels++; }
      }
      return { outside, outsidePixels: outside.length, insidePixels: inside, salePixels, sidebarOutsideSalePixels, rasterPoints: points.map(({ x, y }) => {
        const i = (y * a.width + x) * 4;
        return { x, y, before: [...a.data.slice(i, i + 4)], after: [...b.data.slice(i, i + 4)], differs: [0, 1, 2, 3].some(k => a.data[i + k] !== b.data[i + k]) };
      }) };
    }, { a64: a.png.toString('base64'), b64: b.png.toString('base64'), rect: !control ? a.rect : null, sale: !control ? a.sale : null, sidebar: a.sidebar, points: RASTER_POINTS });
    await p.close();
    fs.writeFileSync(path.join(OUT, tag + '.json'), JSON.stringify({ scene: scene.key, browserName, control, run,
      beforeText: a.text, afterText: b.text, rect: a.rect, sale: a.sale, afterSale: b.sale, sidebar: a.sidebar, ...counts, ...details }, null, 2));
    if (!control && scene.key === 'chat-draft') {
      expect(a.text).toBe('Nháp riêng của khách A'); expect(b.text?.trim()).toBe('');
      expect(details.insidePixels).toBeGreaterThan(0);
    }
    expect(b.sale).toEqual(a.sale);
    expect(r.sizeMatch).toBe(true);
    expect(details.sidebarOutsideSalePixels).toBe(0);
    expect(details.outsidePixels).toBe(0);
  });
}
