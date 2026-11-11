// Baseline68edf81. Exact pixels, no CSS edits/masks/tolerance. Only composer input-row rect may differ in switch-draft scene.
import { expect, test as base, type Browser, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { installF2F3Mocks } from './helpers/mock-f2f3';
import { installCrmMocks } from './helpers/mock-crm';
import { routerPush } from './f2f3-helpers';
import { pixelDiff } from './helpers/pixel-diff';
const test = base.extend<{}, { browser: Browser }>({ browser: [async ({ playwright, browserName }, use) => {
  const browser = await playwright[browserName].launch(browserName === 'chromium' ? { args: ['--disable-gpu', '--disable-skia-runtime-opts', '--force-color-profile=srgb'] } : {});
  await use(browser); await browser.close();
}, { scope: 'worker' }] });
const APP = `http://localhost:${process.env.D_APP_PORT ?? 4218}`;
const BASE = `http://localhost:${process.env.D_BASE_PORT ?? 4219}`;
const CONTROL_BASE = process.env.F4_CONTROL_BASE ?? 'http://localhost:4220';
const OUT = process.env.F4F6_OUT ?? 'C:/Users/Public/f4f6-agent/evidence';
const ED = '.message-thread .input-editor [contenteditable="true"]';
const scenes = ['chat-empty', 'chat-switch-draft', 'profile-success', 'appointments'] as const;
async function shot(page: Page, origin: string, scene: typeof scenes[number]) {
  await page.bringToFront();
  await page.clock.setFixedTime(new Date('2026-11-07T10:00:00+07:00'));
  if (scene.startsWith('chat')) await installF2F3Mocks(page, { rasterImages: true });
  else await installCrmMocks(page);
  await page.route('**/api/v1/privacy/status', r => r.fulfill({ json: { hasPin: false, lockedUntil: null, activeSessionCount: 0, activeSessions: [] } }));
  await page.goto(origin + (scene.startsWith('chat') ? '/chat/qa-conv-1' : scene === 'profile-success' ? '/contacts/qa-ct-1/profile' : '/appointments'));
  await page.locator(scene.startsWith('chat') ? ED : scene === 'profile-success' ? '.cp-hero' : '.apt-hero').waitFor({ timeout: 20000 });
  await page.waitForTimeout(2200);
  if (scene === 'chat-switch-draft') {
    await page.locator(ED).fill('Nháp riêng của khách A');
    await routerPush(page, '/chat/qa-conv-2');
    await expect(page.locator(ED)).toBeVisible();
    await page.waitForTimeout(2200);
  }
  await page.evaluate(async () => { await document.fonts.ready; });
  // Compare a genuine, identical focus state. WebKit may restore editor focus after blur-to-BODY.
  // No class/style mutations: focus the actual editor, settle, then assert both DOM and TipTap state.
  if (scene.startsWith('chat')) await page.locator(ED).focus();
  else await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); });
  await page.waitForTimeout(1000);
  if (scene.startsWith('chat')) {
    await expect(page.locator(ED)).toBeFocused();
    await expect(page.locator('.message-thread .input-editor.focused')).toHaveCount(1);
  }
  const rect = scene === 'chat-switch-draft' ? await page.locator('.message-thread .input-row').boundingBox() : null;
  const text = scene.startsWith('chat') ? await page.locator(ED).innerText() : null;
  return { png: await page.screenshot({ animations: 'disabled', caret: 'hide', scale: 'css' }), rect, text };
}
for (const scene of scenes) for (let run = 1; run <= 3; run++) for (const control of [true, false]) {
  test(`${scene} ${control ? 'CONTROL' : 'REAL'} ${run}`, async ({ browser, browserName }) => {
    test.setTimeout(90000);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const a = await shot(page, BASE, scene);
    const b = await shot(page, control ? CONTROL_BASE : APP, scene);
    await ctx.close();
    const tag = `${browserName}-${scene}-${control ? 'control' : 'real'}-${run}`;
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, tag + '-before.png'), a.png); fs.writeFileSync(path.join(OUT, tag + '-after.png'), b.png);
    const full = await pixelDiff(browser, a.png, b.png, 0);
    if (full.diffPngBase64) fs.writeFileSync(path.join(OUT, tag + '-diff.png'), Buffer.from(full.diffPngBase64, 'base64'));
    const p = await browser.newPage();
    const details = await p.evaluate(async ({ a64, b64, rect }) => {
      async function load(b64: string) { const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob()); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; const g = c.getContext('2d')!; g.drawImage(bmp,0,0); return { w: c.width, data: g.getImageData(0,0,c.width,c.height).data }; }
      const a = await load(a64), b = await load(b64); const outside: number[] = []; let inside = 0, maxOutside = 0;
      for (let i = 0; i < a.data.length; i += 4) {
        let delta = 0; for (let k=0;k<4;k++) delta = Math.max(delta, Math.abs(a.data[i+k] - b.data[i+k]));
        if (!delta) continue; const n=i/4, x=n%a.w, y=Math.floor(n/a.w);
        if (rect && x >= rect.x && x < rect.x+rect.width && y >= rect.y && y < rect.y+rect.height) inside++;
        else { outside.push(n); maxOutside = Math.max(maxOutside, delta); }
      }
      return { outside, outsidePixels: outside.length, insidePixels: inside, maxOutside };
    }, { a64: a.png.toString('base64'), b64: b.png.toString('base64'), rect: !control && scene === 'chat-switch-draft' ? a.rect : null });
    await p.close();
    const { diffPngBase64, ...counts } = full;
    fs.writeFileSync(path.join(OUT, tag+'.json'), JSON.stringify({ browserName, scene, control, run, beforeText: a.text, afterText: b.text, rect: a.rect, ...counts, ...details },null,2));
    if (!control && scene === 'chat-switch-draft') {
      expect(a.text).toBe('Nháp riêng của khách A'); expect(b.text?.trim()).toBe(''); expect(details.insidePixels).toBeGreaterThan(0);
    }
    expect(full.sizeMatch).toBe(true);
    expect(details.outsidePixels, `exact outside=${details.outsidePixels} maxDelta=${details.maxOutside}`).toBe(0);
  });
}
