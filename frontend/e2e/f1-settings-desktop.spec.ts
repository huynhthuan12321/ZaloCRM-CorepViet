// F1 — hồi quy DESKTOP: bản build ứng dụng (D_APP_PORT, mặc định 4188) so với bản base bcd220d (D_BASE_PORT, mặc định 4189), cùng viewport/payload mock/giờ cố định.
// Gate bắt buộc của chủ dự án: desktop 1440x900 exactDiffPixels === 0 (ngưỡng 0, không bỏ qua nhiễu). Cùng kiểm iPad 768x1024 / 1024x768 (cảm ứng, vẫn là bố cục desktop).
// CONTROL=1: so base với chính base (đo nhiễu của môi trường). Chạy: BASE_DIST=<dist base> D_APP_PORT=4188 D_BASE_PORT=4189 npx playwright test e2e/f1-settings-desktop.spec.ts
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pixelDiff } from './helpers/pixel-diff';
import { installF1Mocks, ADMIN_F1, OWNER } from './helpers/mock-f1';
import type { FakeUser } from './helpers/mock-api';
import { APP, BASE, DESKTOP, FIXED_NOW, SHOTS, TABLETS, ensureDir, newCtx, RES, type Vp } from './helpers/f1-env';

test.use({ serviceWorkers: 'block' });
test.skip(!process.env.BASE_DIST, 'Cần BASE_DIST (dist base bcd220d) để so điểm ảnh');

interface Case { key: string; url: string; user?: FakeUser; ready: string; act?: (p: Page) => Promise<void>; settleMs?: number }
const CASES: Case[] = [
  { key: 'profile', url: '/settings/personal/profile', ready: '.account-page' },
  { key: 'notifications-feed', url: '/settings/personal/notifications', ready: '.sl-sidebar' },
  { key: 'internal-contact', url: '/settings/channels/zalo?tab=internal-contact', ready: '.za-tabs' },
  { key: 'org-owner', url: '/settings/org/profile', ready: '.org-settings-layout' },
  { key: 'org-admin-readonly', url: '/settings/org/profile', user: ADMIN_F1, ready: '.org-settings-layout' },
  { key: 'users', url: '/settings/rbac/users', ready: '.dept-page' },
  { key: 'users-edit-panel', url: '/settings/rbac/users', ready: '.dept-page', act: async (p) => { await p.locator('button.at-btn-icon[title="Mở chi tiết"]').first().click(); await p.locator('.panel').first().waitFor(); await p.waitForTimeout(700); } },
  { key: 'users-create-modal', url: '/settings/rbac/users', ready: '.dept-page', act: async (p) => { await p.getByRole('button', { name: /Thêm nhân viên/ }).first().click(); await p.locator('.cuwz-modal').waitFor(); await p.waitForTimeout(500); } },
  { key: 'users-create-step2', url: '/settings/rbac/users', ready: '.dept-page', act: async (p) => {
    await p.getByRole('button', { name: /Thêm nhân viên/ }).first().click(); await p.locator('.cuwz-modal').waitFor();
    await p.locator('.cuwz-modal input[type=text]').first().fill('Người Mới Giả'); await p.locator('.cuwz-modal input[type=tel]').fill('0900000777');
    await p.getByRole('button', { name: /Kiểm tra Zalo/ }).click(); await p.getByText('Xác nhận thông tin Zalo').waitFor(); await p.waitForTimeout(500);
  } },
  { key: 'permission-groups', url: '/settings/rbac/permission-groups', ready: '.dept-page, .pg-page, main' },
  { key: 'departments', url: '/settings/rbac/departments', ready: '.dept-page, main' },
  { key: 'statuses', url: '/settings/crm/statuses', ready: '.sl-sidebar' },
  { key: 'tags-v2', url: '/settings/crm/tags-v2', ready: '.sl-sidebar' },
  { key: 'scoring', url: '/settings/crm/scoring', ready: '.sl-sidebar' },
  { key: 'integrations', url: '/settings/channels/integrations', ready: '.sl-sidebar' },
  { key: 'audit', url: '/settings/org/audit', ready: '.sl-sidebar' },
];
const TABLET_KEYS = new Set(['profile', 'org-owner', 'users', 'users-edit-panel', 'statuses', 'tags-v2', 'permission-groups', 'audit']);

async function shot(browser: import('@playwright/test').Browser, vp: Vp, c: Case, origin: string): Promise<Buffer> {
  const ctx = await newCtx(browser, vp, 'light');
  try {
    const p = await ctx.newPage();
    await p.clock.setFixedTime(new Date(FIXED_NOW));
    await installF1Mocks(p, { user: c.user ?? OWNER });
    await p.goto(`${origin}${c.url}`);
    await p.locator(c.ready).first().waitFor({ timeout: 25_000 });
    await p.waitForLoadState('load');
    await p.waitForTimeout(c.settleMs ?? 2200);
    await p.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images).filter(i => !i.complete).map(i => new Promise(r => { i.addEventListener('load', r); i.addEventListener('error', r); })));
    });
    if (c.act) await c.act(p);
    await p.waitForTimeout(600);
    return await p.screenshot({ animations: 'disabled', caret: 'hide', scale: 'css' });
  } finally { await ctx.close(); }
}

function suite(vp: Vp, cases: Case[]) {
  test.describe(`Desktop không đổi — ${vp.name}`, () => {
    for (const c of cases) {
      test(`${vp.name} ${c.key} (${c.url})`, async ({ browser, browserName }) => {
        test.setTimeout(120_000);
        const out = ensureDir(path.join(SHOTS, 'desktop', browserName));
        const control = !!process.env.CONTROL;
        const before = await shot(browser, vp, c, BASE);
        const after = await shot(browser, vp, c, control ? BASE : APP);
        const tag = `${vp.name}-${c.key}`;
        fs.writeFileSync(path.join(out, `${tag}-before.png`), before);
        fs.writeFileSync(path.join(out, `${tag}-after${control ? '-control' : ''}.png`), after);
        const r = await pixelDiff(browser, before, after, 0);
        const { diffPngBase64, ...summary } = r;
        if (diffPngBase64) fs.writeFileSync(path.join(out, `${tag}-diff.png`), Buffer.from(diffPngBase64, 'base64'));
        ensureDir(RES);
        fs.writeFileSync(path.join(RES, `desktop-${tag}-${browserName}${control ? '-control' : ''}.json`), JSON.stringify({ vp: vp.name, key: c.key, url: c.url, browserName, control, ...summary }, null, 2));
        test.info().annotations.push({ type: 'pixel-diff', description: JSON.stringify(summary) });
        expect(r.sizeMatch, 'kích thước ảnh khác nhau').toBe(true);
        expect(r.exactDiffPixels, `exactDiffPixels=${r.exactDiffPixels} maxChannelDelta=${r.maxChannelDelta}`).toBe(0);
      });
    }
  });
}

suite(DESKTOP, CASES);
for (const t of TABLETS) suite(t, CASES.filter(c => TABLET_KEYS.has(c.key)));
