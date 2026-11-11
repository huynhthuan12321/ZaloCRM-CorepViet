// Main QA bổ sung: so đúng commit F1 (BASE_DIST), ngưỡng pixel tuyệt đối 0.
// Mọi API giả; output nằm ngoài repo. Không thay CSS hay che/mask vùng ảnh.
import { test as base, expect, type Browser, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { installF2F3Mocks } from './helpers/mock-f2f3';
import { ADMIN } from './helpers/mock-api';
import { APP, BASE, DESKTOP, TABLETS, FIXED_NOW, newCtx, ensureDir, RES, SHOTS, type Vp } from './helpers/f2f3-env';
import { pixelDiff } from './helpers/pixel-diff';

// Cùng cấu hình cho F1/candidate; tắt tối ưu raster CPU để so tuyệt đối không có nhiễu làm tròn kênh màu.
const test = base.extend<{}, { browser: Browser }>({
  browser: [async ({ playwright, browserName }, use) => {
    const browser = await playwright[browserName].launch(browserName === 'chromium'
      ? { args: ['--disable-gpu', '--disable-skia-runtime-opts', '--force-color-profile=srgb'] } : {});
    await use(browser);
    await browser.close();
  }, { scope: 'worker' }],
});
interface Scene { key: string; url: string; ready: string; data?: string; act?: (p: Page) => Promise<void> }
const scenes: Scene[] = [
  { key: 'media', url: '/media', ready: '.media-page .card', data: '.media-page .card' },
  { key: 'media-detail', url: '/media', ready: '.media-page .card', act: async p => {
    await p.locator('.media-page .card').first().click();
    await expect(p.locator('.m-panel')).toBeVisible();
  } },
  { key: 'friends', url: '/friends', ready: '.friends-page', data: 'Bạn Zalo' },
  { key: 'groups', url: '/groups', ready: 'h1', act: async p => {
    const select = p.getByRole('combobox').first();
    await select.click();
    await p.getByRole('option', { name: /Nick Giả 2/ }).click();
    await select.click();
    await p.getByRole('option', { name: /Nick Giả 1/ }).click();
    await expect(p.getByText('Nhóm khách hàng 01', { exact: true }).first()).toBeVisible();
  } },
  { key: 'marketing-lists', url: '/marketing/lists', ready: '.lists-view', data: 'Khách hội chợ tháng 10' },
  { key: 'marketing-scan', url: '/marketing/group-scan', ready: 'h1', act: async p => {
    await p.getByRole('combobox').first().click();
    await p.getByRole('option', { name: /Nick Giả 2/ }).click();
    await p.getByRole('combobox').first().click();
    await p.getByRole('option', { name: /Nick Giả 1/ }).click();
    await expect(p.getByText('Nhóm khách hàng 01', { exact: true }).first()).toBeVisible();
  } },
  { key: 'marketing-broadcast', url: '/marketing/broadcasts', ready: '.bc-view', data: 'Thông báo khuyến mãi tháng 11' },
  { key: 'chat', url: '/chat/qa-conv-2', ready: '.smax-chat-shell', data: 'Khách Giả B' },
  { key: 'settings-control', url: '/settings/personal/profile', ready: '.account-page' },
];

async function shot(browser: Browser, vp: Vp, scene: Scene, origin: string, sharedPage?: Page) {
  const ctx = sharedPage?.context() ?? await newCtx(browser, vp);
  try {
    const p = sharedPage ?? await ctx.newPage();
    await p.clock.setFixedTime(new Date(FIXED_NOW));
    const mock = await installF2F3Mocks(p, { user: ADMIN, rasterImages: true });
    // Các trường desktop bắt buộc (mobile reader chỉ đọc một phần của cùng response).
    mock.addRule({ match: /^GET \/customer-lists$/, body: { lists: [{
      id: 'list-1', name: 'Khách hội chợ tháng 10', iconEmoji: '🎯', sourceType: 'paste', status: 'done',
      archivedAt: null, startedAt: FIXED_NOW, endedAt: FIXED_NOW, createdAt: FIXED_NOW,
      createdById: ADMIN.id, createdBy: { id: ADMIN.id, fullName: 'Trần Giả Lan', email: 'qa@example.test' },
      totalEntries: 120, validEntries: 117, invalidEntries: 3, dupInListEntries: 0, dupCrossListEntries: 0,
      dupWithContactEntries: 0, hasZaloEntries: 80, noZaloEntries: 37, pendingLookupEntries: 0,
    }], total: 1 } });
    mock.addRule({ match: /^GET \/broadcast-jobs$/, body: { jobs: [{
      id: 'bj-1', name: 'Thông báo khuyến mãi tháng 11', status: 'active', messageText: 'Thông tin sản phẩm giả',
      sourceType: 'customer_list', scheduleType: 'weekly', scheduledAt: null, timeOfDay: '09:00', daysOfWeek: [1, 3],
      nextRunAt: '2026-11-14T02:00:00.000Z', list: { id: 'list-1', name: 'Khách hội chợ tháng 10', hasZaloEntries: 80 },
      nick: { id: 'qa-nick-1', displayName: 'Nick Giả 1', phone: null, status: 'connected' }, latestRun: null,
    }] } });
    await p.goto(`${origin}${scene.url}`);
    await expect(p.locator(scene.ready).first()).toBeVisible();
    if (scene.data) {
      if (scene.data.startsWith('.')) await expect(p.locator(scene.data).first()).toBeVisible();
      else await expect(p.locator('body')).toContainText(scene.data);
    }
    if (scene.act) await scene.act(p);
    await p.evaluate(async () => { await document.fonts.ready; });
    await p.waitForTimeout(1800);
    return await p.screenshot({ animations: 'disabled', caret: 'hide', scale: 'css' });
  } finally { if (!sharedPage) await ctx.close(); }
}

test.skip(!process.env.BASE_DIST, 'Cần bản build F1 50db984 tại BASE_DIST.');
for (const vp of [DESKTOP, ...TABLETS]) for (const scene of scenes) {
  test(`F1 exact0 ${vp.name} ${scene.key}`, async ({ browser, browserName }) => {
    test.setTimeout(100_000);
    const control = process.env.CONTROL === '1';
    // Cùng renderer cho mỗi cặp để tránh nhiễu raster giữa các process; không đổi nội dung/CSS.
    const ctx = await newCtx(browser, vp);
    const p = await ctx.newPage();
    let before: Buffer, after: Buffer;
    try {
      before = await shot(browser, vp, scene, BASE, p);
      after = await shot(browser, vp, scene, control ? BASE : APP, p);
    } finally { await ctx.close(); }
    const dir = ensureDir(path.join(SHOTS, 'main-parity', browserName));
    const key = `${vp.name}-${scene.key}${control ? '-control' : ''}`;
    fs.writeFileSync(path.join(dir, `${key}-before.png`), before);
    fs.writeFileSync(path.join(dir, `${key}-after.png`), after);
    const { diffPngBase64, ...result } = await pixelDiff(browser, before, after, 0);
    if (diffPngBase64) fs.writeFileSync(path.join(dir, `${key}-diff.png`), Buffer.from(diffPngBase64, 'base64'));
    ensureDir(RES);
    fs.writeFileSync(path.join(RES, `main-parity-${browserName}-${key}.json`), JSON.stringify({ browserName, vp: vp.name, scene: scene.key, baseline: '50db984', ...result }, null, 2));
    expect(result.sizeMatch).toBe(true);
    expect(result.exactDiffPixels).toBe(0);
  });
}
