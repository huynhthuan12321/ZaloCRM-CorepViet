// QA F2+F3 — ma trận bố cục: 6 viewport điện thoại (320/375/390/430 dọc + 844x390/932x430 ngang) x Sáng/Tối x trang F2/F3 (dữ liệu giả có thật).
// Mỗi ca đo: không tràn ngang, không phần tử lọt ra ngoài mép, điều khiển chạm >= 44x44, ô nhập >= 16px, Tối không khối nền sáng, tương phản >= 3.
// Chạy 2 engine (Chromium + WebKit desktop). WebKit desktop KHÔNG phải Safari iPhone. Ảnh chụp + JSON ghi ra F2F3_OUT (ngoài repo).
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { APP, PHONES, RES, SHOTS, ensureDir, lightBlocks, markQaIgnores, measureScope, offscreenElements, overflowInfo, settle, smallTouchTargets, textSizes, toastMetrics } from './helpers/f2f3-env';
import { contrastIssues } from './helpers/qa-checks';
import { boot, cell, chooseTarget, imgName, pick, routerPush, CELLS, SEND } from './f2f3-helpers';
import type { F2F3Mock } from './helpers/mock-f2f3';

test.use({ serviceWorkers: 'block' });

interface Case {
  key: string;
  url: string;
  ready: string;
  nick?: string;
  prep?: (mock: F2F3Mock) => void;
  act?: (page: Page, mock: F2F3Mock) => Promise<void>;
}
const ROW = '[data-row]';
const CASES: Case[] = [
  { key: 'media-grid', url: '/media', ready: CELLS },
  { key: 'media-selected-bar', url: '/media', ready: CELLS, act: async (p) => { await chooseTarget(p, 'Khách Giả A'); for (const n of [1, 2, 3]) await pick(p, imgName(n)).click(); await p.locator(SEND).waitFor(); } },
  { key: 'media-folder-search', url: '/media', ready: CELLS, act: async (p) => { await p.locator('.m-ml__chip', { hasText: 'Sản phẩm mới' }).click(); await p.locator('.m-ml__search input').fill('ảnh sản phẩm 00'); await p.waitForTimeout(900); } },
  { key: 'media-video-tab', url: '/media', ready: CELLS, act: async (p) => { await p.getByRole('tab', { name: 'Video' }).click(); await p.waitForTimeout(500); } },
  { key: 'media-docs-tab', url: '/media', ready: CELLS, act: async (p) => { await p.getByRole('tab', { name: 'Tài liệu' }).click(); await p.locator('.m-mg__name').first().waitFor(); } },
  { key: 'media-viewer-image', url: '/media', ready: CELLS, act: async (p) => { await cell(p, imgName(2)).click(); await p.locator('.m-viewer').waitFor(); await p.waitForTimeout(500); } },
  { key: 'media-viewer-doc', url: '/media', ready: CELLS, act: async (p) => { await p.getByRole('tab', { name: 'Tài liệu' }).click(); await cell(p, 'Bảng giá và chính sách bảo hành sản phẩm năm 2026 bản đầy đủ.pdf').click(); await p.locator('.m-viewer').waitFor(); await p.waitForTimeout(400); } },
  { key: 'media-target-sheet', url: '/media', ready: CELLS, act: async (p) => { await p.getByRole('button', { name: 'Chọn khách' }).click(); await p.locator('.m-mts__row').first().waitFor(); await p.waitForTimeout(700); } },
  { key: 'media-send-error', url: '/media', ready: CELLS, act: async (p, m) => {
    await chooseTarget(p, 'Khách Giả A'); await pick(p, imgName(1)).click();
    m.addRule({ match: /^POST \/media\/[^/]+\/send$/, status: 413, body: { error: 'x' } });
    await p.locator(SEND).click(); await p.locator('[role="dialog"][aria-modal="true"]').getByRole('button', { name: 'Gửi', exact: true }).click(); await p.locator('.m-ml__err').waitFor();
  } },
  { key: 'media-album-partial-status', url: '/media', ready: CELLS, act: async (p, m) => {
    m.albumSent.value = 2; await chooseTarget(p, 'Khách Giả A'); for (const n of [1, 2, 3]) await pick(p, imgName(n)).click();
    await p.locator(SEND).click(); await p.locator('[role="dialog"][aria-modal="true"]').getByRole('button', { name: 'Gửi', exact: true }).click(); await p.locator('[data-testid="send-status"]').waitFor();
  } },
  { key: 'media-error-state', url: '/media', ready: '.m-feedback--error, .m-feedback', prep: m => { m.addRule({ match: /^GET \/media$/, status: 500 }); } },
  { key: 'media-empty-state', url: '/media', ready: '.m-feedback', prep: m => { m.addRule({ match: /^GET \/media$/, body: { items: [], total: 0 } }); } },
  { key: 'thread-media-sheet', url: '/chat/qa-conv-2', ready: '.mobile-chat .message-thread.is-mobile', act: async (p) => {
    await p.locator('.is-mobile .attach-plus-btn').click(); await p.locator('.m-sheet:visible .m-attach__item', { hasText: 'Kho media' }).click(); await p.locator('.m-sheet:visible .m-mg__cell').first().waitFor(); await p.waitForTimeout(700);
  } },
  { key: 'thread-media-sheet-selected', url: '/chat/qa-conv-2', ready: '.mobile-chat .message-thread.is-mobile', act: async (p) => {
    await p.locator('.is-mobile .attach-plus-btn').click(); await p.locator('.m-sheet:visible .m-attach__item', { hasText: 'Kho media' }).click(); await p.locator('.m-sheet:visible .m-mg__cell').first().waitFor();
    await p.locator(`.m-sheet:visible .m-mg__pick`).nth(0).click(); await p.locator(`.m-sheet:visible .m-mg__pick`).nth(1).click(); await p.waitForTimeout(600);
  } },
  { key: 'account-menu', url: '/account', ready: '[data-menu-id="friends"]' },
  { key: 'friends', url: '/friends', ready: ROW },
  { key: 'friends-error', url: '/friends', ready: '.m-feedback', prep: m => { m.addRule({ match: /friends-db/, status: 500 }); } },
  { key: 'groups', url: '/groups', ready: ROW, nick: 'qa-nick-1' },
  { key: 'groups-members-sheet', url: '/groups', ready: ROW, nick: 'qa-nick-1', act: async (p) => { await p.locator(ROW).nth(2).click(); await p.locator('.m-sheet:visible [data-row]').first().waitFor(); await p.waitForTimeout(700); } },
  { key: 'groups-empty', url: '/groups', ready: '.m-feedback', nick: 'qa-nick-2' },
  { key: 'scan', url: '/marketing/group-scan', ready: ROW, nick: 'qa-nick-1' },
  { key: 'scan-members-sheet', url: '/marketing/group-scan', ready: ROW, nick: 'qa-nick-1', act: async (p) => { await p.locator(ROW).first().click(); await p.locator('.m-sheet:visible [data-row]').first().waitFor(); await p.waitForTimeout(700); } },
  { key: 'lists', url: '/marketing/lists', ready: ROW },
  { key: 'list-detail', url: '/marketing/lists/list-1', ready: ROW },
  { key: 'targets', url: '/marketing/targets', ready: ROW },
  { key: 'broadcasts', url: '/marketing/broadcasts', ready: ROW },
  { key: 'care-sessions', url: '/marketing/care-sessions', ready: ROW },
  { key: 'lists-error', url: '/marketing/lists', ready: '.m-feedback--error, .m-feedback', prep: m => { m.addRule({ match: /^GET \/customer-lists$/, status: 500 }); } },
];

for (const theme of ['light', 'dark'] as const) {
  for (const vp of PHONES) {
    test.describe(`${vp.name} ${theme}`, () => {
      for (const c of CASES) {
        test(c.key, async ({ browser, browserName }, info) => {
          const { ctx, page, mock, errors } = await boot(browser, vp, { theme, nick: c.nick });
          c.prep?.(mock);
          await page.goto(`${APP}${c.url}`);
          await page.locator(c.ready).first().waitFor({ state: 'visible', timeout: 25_000 });
          await settle(page, 400);
          if (c.act) await c.act(page, mock);
          await settle(page, 500);

          const scope = await measureScope(page);
          const toast = await toastMetrics(page);
          await markQaIgnores(page);
          const over = await overflowInfo(page);
          const off = await offscreenElements(page, scope);
          const small = await smallTouchTargets(page, 44, scope);
          const ts = await textSizes(page, scope);
          const light = theme === 'dark' ? await lightBlocks(page, 6000, scope) : [];
          const contrast = await contrastIssues(page, scope, 3);

          const dir = ensureDir(path.join(SHOTS, browserName));
          const file = `${vp.name}-${theme}-${c.key}`;
          await page.screenshot({ path: path.join(dir, `${file}.png`), animations: 'disabled', caret: 'hide' });
          const result = { scope, toast, browserName, vp: vp.name, theme, key: c.key, over, off, small, ts, light, contrast: contrast.slice(0, 8), errors, unhandled: mock.unhandled };
          ensureDir(path.join(RES, 'matrix', browserName));
          fs.writeFileSync(path.join(RES, 'matrix', browserName, `${file}.json`), JSON.stringify(result, null, 1));
          info.annotations.push({ type: 'metrics', description: JSON.stringify({ over: over.docX, small: small.length, minText: ts.minText }) });

          expect.soft(over.docX, `docX ${JSON.stringify(over)}`).toBeLessThanOrEqual(1);
          expect.soft(over.bodyX, 'bodyX').toBeLessThanOrEqual(1);
          expect.soft(over.mainX, 'mainX').toBeLessThanOrEqual(1);
          expect.soft(over.rootX, `rootX ${JSON.stringify(over.rootX)}`).toEqual([]);
          expect.soft(off, `phần tử ngoài mép: ${off.join(' | ')}`).toEqual([]);
          expect.soft(small, `điều khiển <44: ${small.join(' | ')}`).toEqual([]);
          expect.soft(ts.smallInputs, 'ô nhập < 16px').toEqual([]);
          expect.soft(ts.minText, `chữ nhỏ nhất ${ts.minTextSel}`).toBeGreaterThanOrEqual(11);
          expect.soft(light, `khối nền sáng khi Tối: ${light.join(' | ')}`).toEqual([]);
          expect.soft(contrast.map(i => `${i.sel} "${i.text}" ${i.ratio}`), 'tương phản < 3').toEqual([]);
          expect.soft(errors, 'pageerror').toEqual([]);
          void routerPush;
          await ctx.close();
        });
      }
    });
  }
}
