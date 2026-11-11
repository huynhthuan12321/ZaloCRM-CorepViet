// Hồi quy desktop 1440x900: bản build worktree shell (cổng 4174) vs bản build mobile/base (cổng 4175), CÙNG mock, CÙNG giờ cố định.
// Chạy: BASE_DIST=<thư mục dist của mobile/base> npx playwright test e2e/desktop-regression.spec.ts
// Ảnh + diff ghi vào docs/mobile-upgrade/qa/C-shots/desktop-regression/. Kết quả tổng hợp ghi ra desktop-regression-result.json.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ADMIN, installMocks } from './helpers/mock-api';
import { installChatMocks } from './helpers/mock-chat';
import { pixelDiff } from './helpers/pixel-diff';

const OUT = path.resolve(import.meta.dirname, '../../docs/mobile-upgrade/qa/C-shots/desktop-regression');
const BASE_URL = 'http://localhost:4175';
const SHELL_URL = 'http://localhost:4174';
// Mục thứ 3 = true -> dùng mock chat đầy đủ (conversations/messages) để so cả thread desktop có dữ liệu (đợt C).
const ROUTES: Array<[string, string, boolean?]> = [['tongquan', '/'], ['khachhang', '/contacts'], ['chat', '/chat'], ['lichhen', '/appointments'], ['chat-hoithoai', '/chat', true], ['chat-thread', '/chat/qa-conv-2', true]];
/** Ngưỡng chấp nhận: dưới 0.1% pixel khác (nhiễu antialias/animation). Mọi giá trị > 0 đều được ghi lại. */
const MAX_RATIO = 0.001;

test.describe('Desktop 1440x900 không đổi so với mobile/base', () => {
  test.skip(!process.env.BASE_DIST, 'Cần BASE_DIST (dist của mobile/base).');
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

  for (const [name, route, withChat] of ROUTES) {
    test(`${name} (${route})`, async ({ page, browser, browserName }) => {
      fs.mkdirSync(OUT, { recursive: true });
      const shots: Record<'base' | 'shell', Buffer> = {} as never;
      for (const [label, origin] of [['base', BASE_URL], ['shell', SHELL_URL]] as const) {
        const p = await page.context().newPage();
        await p.clock.setFixedTime(new Date('2026-11-07T10:00:00+07:00'));
        if (withChat) await installChatMocks(p, { user: ADMIN, waiting: 7 });
        else await installMocks(p, { user: ADMIN, waiting: 7 });
        await p.goto(`${origin}${route}`);
        await p.waitForLoadState('load');
        await p.waitForTimeout(2500);
        shots[label] = await p.screenshot({ animations: 'disabled', caret: 'hide' });
        fs.writeFileSync(path.join(OUT, `${name}-1440-${label}-${browserName}.png`), shots[label]);
        await p.close();
      }
      const r = await pixelDiff(browser, shots.base, shots.shell);
      if (r.diffPngBase64) fs.writeFileSync(path.join(OUT, `${name}-1440-diff-${browserName}.png`), Buffer.from(r.diffPngBase64, 'base64'));
      const { diffPngBase64: _omit, ...summary } = r;
      void _omit;
      fs.writeFileSync(path.join(OUT, `${name}-1440-${browserName}.json`), JSON.stringify({ route, browser: browserName, ...summary }, null, 2));
      test.info().annotations.push({ type: 'pixel-diff', description: JSON.stringify(summary) });
      expect(r.sizeMatch, 'kích thước ảnh khác nhau').toBe(true);
      expect(r.diffRatio, `diffRatio=${r.diffRatio} (${r.diffPixels}/${r.totalPixels})`).toBeLessThanOrEqual(MAX_RATIO);
    });
  }
});
