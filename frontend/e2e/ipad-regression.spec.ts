// Hồi quy iPad: 1024x768 và 768x1024 (cảm ứng, isMobile) - bản hotfix (4174) vs bản mobile/base (4175), CÙNG mock, CÙNG giờ.
// Chạy: BASE_DIST=<dist mobile/base> npx playwright test e2e/ipad-regression.spec.ts. Ảnh ghi vào docs/mobile-upgrade/qa/hotfix-landscape-shots/ipad/.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { installChatMocks } from './helpers/mock-chat';
import { pixelDiff } from './helpers/pixel-diff';

const OUT = path.resolve(import.meta.dirname, '../../docs/mobile-upgrade/qa/hotfix-landscape-shots/ipad');
const ROUTES: Array<[string, string]> = [['tongquan', '/'], ['khachhang', '/contacts'], ['chat', '/chat'], ['lichhen', '/appointments'], ['baocao-tongquan', '/reports/tong-quan']];
const SIZES = [{ w: 1024, h: 768 }, { w: 768, h: 1024 }];

test.describe('iPad không đổi so với mobile/base', () => {
  test.skip(!process.env.BASE_DIST, 'Cần BASE_DIST');
  for (const s of SIZES) {
    for (const [name, route] of ROUTES) {
      test(`${s.w}x${s.h} ${name} (${route})`, async ({ browser, browserName }) => {
        fs.mkdirSync(OUT, { recursive: true });
        const shots: Record<string, Buffer> = {};
        const info: Record<string, unknown> = {};
        for (const [label, origin] of [['base', 'http://localhost:4175'], ['hotfix', 'http://localhost:4174']] as const) {
          const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh' });
          const p = await ctx.newPage();
          await p.clock.setFixedTime(new Date('2026-11-07T10:00:00+07:00'));
          await installChatMocks(p, { waiting: 7 });
          await p.goto(`${origin}${route}`);
          await p.waitForLoadState('load');
          await p.waitForTimeout(2500);
          info[label] = await p.evaluate(() => ({ coarse: matchMedia('(pointer: coarse)').matches, hoverNone: matchMedia('(hover: none)').matches, desktopLayout: !!document.querySelector('.smax-topnav'), mobileLayout: !!document.querySelector('.m-shell'), w: innerWidth }));
          shots[label] = await p.screenshot({ animations: 'disabled', caret: 'hide' });
          fs.writeFileSync(path.join(OUT, `${name}-${s.w}x${s.h}-${label}-${browserName}.png`), shots[label]);
          await ctx.close();
        }
        const r = await pixelDiff(browser, shots.base, shots.hotfix);
        const { diffPngBase64, ...summary } = r;
        if (diffPngBase64) fs.writeFileSync(path.join(OUT, `${name}-${s.w}x${s.h}-diff-${browserName}.png`), Buffer.from(diffPngBase64, 'base64'));
        fs.writeFileSync(path.join(OUT, `${name}-${s.w}x${s.h}-${browserName}.json`), JSON.stringify({ route, ...summary, info }, null, 2));
        test.info().annotations.push({ type: 'pixel-diff', description: JSON.stringify({ ...summary, info }) });
        expect(r.sizeMatch).toBe(true);
        expect(r.diffPixels, `exact=${r.exactDiffPixels} max=${r.maxChannelDelta}`).toBe(0);
      });
    }
  }
});
