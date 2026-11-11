// Hồi quy đợt D: desktop 1440x900 (chuột) và iPad 1024x768 / 768x1024 (cảm ứng) - bản build đợt D (4174) vs bản base e290e2d (4175),
// CÙNG mock, CÙNG giờ cố định. Chờ ảnh tải xong (img.complete) + font sẵn sàng để giảm nhiễu WebKit.
// Chạy: BASE_DIST=<dist base e290e2d> npx playwright test e2e/desktop-regression-d.spec.ts ; CONTROL=1 -> so base với chính base (đo nhiễu).
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { installCrmMocks } from './helpers/mock-crm';
import { pixelDiff } from './helpers/pixel-diff';

const OUT = path.resolve(import.meta.dirname, '../../docs/mobile-upgrade/qa/D-shots', process.env.D_QA_RUN_ID ?? '.', 'desktop-regression');
const BASE = `http://localhost:${process.env.D_BASE_PORT ?? 4175}`;
const SHELL = process.env.CONTROL ? BASE : `http://localhost:${process.env.D_APP_PORT ?? 4174}`;
const ROUTES: Array<[string, string]> = [
  ['tongquan', '/'], ['khachhang', '/contacts'], ['hoso', '/contacts/qa-ct-1/profile'], ['lichhen', '/appointments'],
  ['caidat-tochuc', '/settings/org/profile'], ['caidat-canhan', '/settings/personal/profile'],
];
const SIZES = [
  { name: '1440x900', w: 1440, h: 900, touch: false },
  { name: '1024x768', w: 1024, h: 768, touch: true },
  { name: '768x1024', w: 768, h: 1024, touch: true },
];

async function settled(p: Page) {
  await p.waitForLoadState('load');
  await p.waitForTimeout(2500);
  await p.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).filter(i => !i.complete).map(i => new Promise(r => { i.addEventListener('load', r); i.addEventListener('error', r); })));
  });
  await p.waitForTimeout(500);
}

test.describe('Desktop/iPad không đổi so với base e290e2d (đợt D)', () => {
  test.skip(!process.env.BASE_DIST, 'Cần BASE_DIST');
  for (const s of SIZES) {
    for (const [name, route] of ROUTES) {
      test(`${s.name} ${name} (${route})`, async ({ browser, browserName }) => {
        fs.mkdirSync(OUT, { recursive: true });
        const shots: Record<string, Buffer> = {}; const info: Record<string, unknown> = {};
        for (const [label, origin] of [['base', BASE], ['dotD', SHELL]] as const) {
          const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, hasTouch: s.touch, isMobile: s.touch, deviceScaleFactor: 1, locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh' });
          const p = await ctx.newPage();
          await p.clock.setFixedTime(new Date('2026-11-07T10:00:00+07:00'));
          await installCrmMocks(p, {});
          await p.goto(`${origin}${route}`);
          await settled(p);
          info[label] = await p.evaluate(() => ({ desktopLayout: !!document.querySelector('.smax-topnav'), mobileShell: !!document.querySelector('.m-shell'), w: innerWidth }));
          shots[label] = await p.screenshot({ animations: 'disabled', caret: 'hide' });
          fs.writeFileSync(path.join(OUT, `${name}-${s.name}-${label}-${browserName}.png`), shots[label]);
          await ctx.close();
        }
        // Gate chủ dự án: pixel tuyệt đối bằng 0, không bỏ qua nhiễu bằng ngưỡng màu.
        const r = await pixelDiff(browser, shots.base, shots.dotD, 0);
        const { diffPngBase64, ...summary } = r;
        if (diffPngBase64) fs.writeFileSync(path.join(OUT, `${name}-${s.name}-diff-${browserName}.png`), Buffer.from(diffPngBase64, 'base64'));
        fs.writeFileSync(path.join(OUT, `${name}-${s.name}-${browserName}${process.env.CONTROL ? '-control' : ''}.json`), JSON.stringify({ route, control: !!process.env.CONTROL, ...summary, info }, null, 2));
        test.info().annotations.push({ type: 'pixel-diff', description: JSON.stringify({ ...summary, info }) });
        expect(r.sizeMatch, 'kích thước ảnh khác nhau').toBe(true);
        expect(r.exactDiffPixels, `exact=${r.exactDiffPixels} max=${r.maxChannelDelta}`).toBe(0);
      });
    }
  }
});
