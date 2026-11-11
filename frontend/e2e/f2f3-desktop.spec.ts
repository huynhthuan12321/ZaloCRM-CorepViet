// QA F2+F3 — hồi quy DESKTOP/TABLET bằng so điểm ảnh: bản build ứng dụng (D_APP_PORT, mặc định 4198) so với bản dựng từ commit 50db984 (D_BASE_PORT, mặc định 4199,
// BASE_DIST = C:/Users/Public/f2f3-baseline-50db984/frontend/dist). Cùng viewport / cùng payload mock có dữ liệu thật / cùng giờ cố định / SW bị chặn.
// Gate: exactDiffPixels === 0 (ngưỡng 0) ở 1440x900, 768x1024, 1024x768, Chromium + WebKit desktop. CONTROL=1: so base với chính base (đo nhiễu môi trường).
// Ảnh + JSON ghi ra F2F3_OUT (ngoài repo), KHÔNG ghi đè bằng chứng F1.
import { expect, test as base, type Page, type Browser } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pixelDiff } from './helpers/pixel-diff';
import { installF2F3Mocks } from './helpers/mock-f2f3';
import { installF1Mocks, OWNER } from './helpers/mock-f1';
import { APP, BASE, DESKTOP, FIXED_NOW, RES, SHOTS, TABLETS, ensureDir, newCtx, type Vp } from './helpers/f2f3-env';

const test = base.extend<{}, { browser: Browser }>({
  browser: [async ({ playwright, browserName }, use) => {
    const browser = await playwright[browserName].launch(browserName === 'chromium'
      ? { args: ['--disable-gpu', '--disable-skia-runtime-opts', '--force-color-profile=srgb'] } : {});
    await use(browser);
    await browser.close();
  }, { scope: 'worker' }],
});
test.use({ serviceWorkers: 'block' });
test.skip(!process.env.BASE_DIST, 'Cần BASE_DIST (dist dựng từ 50db984) để so điểm ảnh');
const CONTROL = process.env.CONTROL === '1';

interface Case { key: string; url: string; ready: string; nick?: string; f1?: boolean; act?: (p: Page) => Promise<void>; settleMs?: number }
const clickCard = async (p: Page) => { await p.locator('.media-page .card').first().click(); await p.waitForTimeout(900); };
const CASES: Case[] = [
  { key: 'media-grid', url: '/media', ready: '.media-page .card' },
  { key: 'media-detail', url: '/media', ready: '.media-page .card', act: clickCard },
  { key: 'media-docs-tab', url: '/media', ready: '.media-page .card', act: async (p) => { await p.getByText('Tệp', { exact: true }).first().click(); await p.waitForTimeout(900); } },
  { key: 'friends', url: '/friends?nick=qa-nick-1', ready: 'text=Nguyễn Văn Khách 01', nick: 'qa-nick-1' },
  { key: 'groups', url: '/groups', ready: 'h1:has-text("Nhóm Zalo")', nick: 'qa-nick-2', act: async (p) => {
    // desktop chỉ tải nhóm khi đổi tài khoản: chọn Nick Giả 1 (có 12 nhóm) rồi mở nhóm đầu để có dữ liệu thật thay vì 'Không có nhóm nào'
    await p.locator('.v-select').first().click(); await p.locator('.v-overlay-container .v-list-item').first().click();
    await p.getByText('Nhóm khách hàng 01').first().waitFor({ timeout: 8000 }); await p.getByText('Nhóm khách hàng 01').first().click(); await p.waitForTimeout(1200);
  } },
  { key: 'marketing-group-scan', url: '/marketing/group-scan', ready: 'text=Quét nhóm', nick: 'qa-nick-1' },
  { key: 'marketing-lists', url: '/marketing/lists', ready: '.lists-view tbody tr:has-text("Khách hội chợ tháng 10")' },
  { key: 'marketing-list-detail', url: '/marketing/lists/list-1', ready: 'text=Khách hội chợ tháng 10' },
  { key: 'marketing-targets', url: '/marketing/targets', ready: 'text=Marketing' },
  { key: 'chat-media-tab', url: '/chat/qa-conv-2', ready: '.msg-bubble-wrap', act: async (p) => {
    await p.locator('button[title^="Media"]').first().click();
    await expect(p.locator('.mtp')).toBeVisible();
    await expect(p.locator('.mtp img').first()).toBeVisible();
    await p.waitForTimeout(1400);
  } },
  { key: 'chat-default', url: '/chat/qa-conv-2', ready: '.msg-bubble-wrap' },
  // control F1 (giữ nguyên các trang Cài đặt của đợt trước)
  { key: 'f1-settings-profile', url: '/settings/personal/profile', ready: '.account-page', f1: true },
  { key: 'f1-settings-tags', url: '/settings/crm/tags-v2', ready: '.sl-sidebar', f1: true },
];
// <=1024px desktop gốc ẩn cột Media bằng CSS; tablet so thread gốc, không click nút bị ẩn.
const TABLET_KEYS = new Set(['media-grid', 'media-detail', 'friends', 'groups', 'marketing-lists', 'marketing-group-scan', 'marketing-targets', 'chat-default', 'f1-settings-profile']);

async function shot(browser: Browser, vp: Vp, c: Case, origin: string, sharedPage?: Page): Promise<Buffer> {
  const ctx = sharedPage?.context() ?? await newCtx(browser, vp, 'light');
  try {
    const p = sharedPage ?? await ctx.newPage();
    await p.clock.setFixedTime(new Date(FIXED_NOW));
    if (c.f1) await installF1Mocks(p, { user: OWNER });
    else await installF2F3Mocks(p, { rasterImages: true });
    if (c.nick) await p.addInitScript((n) => localStorage.setItem('selected-zalo-account', n), c.nick);
    await p.goto(`${origin}${c.url}`);
    await p.locator(c.ready).first().waitFor({ timeout: 30_000 });
    await p.waitForLoadState('load');
    await p.waitForTimeout(c.settleMs ?? 2200);
    await p.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images).filter(i => !i.complete).map(i => new Promise(r => { i.addEventListener('load', r); i.addEventListener('error', r); })));
    });
    if (c.act) await c.act(p);
    await p.waitForTimeout(700);
    return await p.screenshot({ animations: 'disabled', caret: 'hide', scale: 'css' });
  } finally { if (!sharedPage) await ctx.close(); }
}

function suite(vp: Vp, cases: Case[]) {
  test.describe(`desktop-regression ${vp.name}${CONTROL ? ' CONTROL(base vs base)' : ''}`, () => {
    for (const c of cases) {
      test(`${c.key} @${vp.name}`, async ({ browser, browserName }) => {
        test.setTimeout(150_000);
        const ctx = await newCtx(browser, vp, 'light');
        const p = await ctx.newPage();
        let before: Buffer, after: Buffer;
        try {
          before = await shot(browser, vp, c, BASE, p);
          after = await shot(browser, vp, c, CONTROL ? BASE : APP, p);
        } finally { await ctx.close(); }
        const out = ensureDir(path.join(SHOTS, 'desktop', browserName));
        const tag = `${vp.name}-${c.key}`;
        fs.writeFileSync(path.join(out, `${tag}-base50db984.png`), before);
        fs.writeFileSync(path.join(out, `${tag}-${CONTROL ? 'control' : 'app'}.png`), after);
        const r = await pixelDiff(browser, before, after, 0);
        const { diffPngBase64, ...summary } = r;
        if (diffPngBase64) fs.writeFileSync(path.join(out, `${tag}-diff${CONTROL ? '-control' : ''}.png`), Buffer.from(diffPngBase64, 'base64'));
        ensureDir(path.join(RES, 'desktop'));
        fs.writeFileSync(path.join(RES, 'desktop', `${tag}-${browserName}${CONTROL ? '-control' : ''}.json`), JSON.stringify({ vp: vp.name, key: c.key, url: c.url, browserName, control: CONTROL, ...summary }, null, 2));
        test.info().annotations.push({ type: 'pixel-diff', description: JSON.stringify(summary) });
        expect(r.sizeMatch, 'kích thước ảnh khác nhau').toBe(true);
        expect(r.exactDiffPixels, `exactDiffPixels=${r.exactDiffPixels} maxChannelDelta=${r.maxChannelDelta}`).toBe(0);
      });
    }
  });
}

suite(DESKTOP, CASES);
for (const t of TABLETS) suite(t, CASES.filter(c => TABLET_KEYS.has(c.key)));
