// QA đợt D (G3): CRM mobile + khung Cài đặt mobile. Chạy trên bản build (vite preview, cổng 4174), backend KHÔNG chạy (mock hoàn toàn, dữ liệu giả).
// Mức bằng chứng: Chromium / WebKit DESKTOP có mô phỏng cảm ứng (hasTouch + isMobile). KHÔNG phải Safari iPhone thật.
// Ma trận: viewport (320, 375, 390, 430 dọc; 844x390, 932x430 ngang; 768 = iPad dọc phải là desktop) x Sáng/Tối x các màn D.
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { audit } from './helpers/audit';
import { bottomClearance, contrastIssues, safeOffenders } from './helpers/qa-checks';
import { ADMIN } from './helpers/mock-api';
import { installCrmMocks, type CrmMock } from './helpers/mock-crm';
import { setTheme, settle, settleSheet, waitThread } from './helpers/mock-chat';

const OUT = path.resolve(import.meta.dirname, '../../docs/mobile-upgrade/qa/D-shots', process.env.D_QA_RUN_ID ?? '.');
const RES = path.join(OUT, 'results');
const HIDE_SCROLLBAR = () => {
  const add = () => { const st = document.createElement('style'); st.textContent = '*{scrollbar-width:none !important}'; (document.head || document.documentElement).appendChild(st); };
  if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
};

interface Vp { name: string; w: number; h: number; kind: 'portrait' | 'landscape' | 'ipad'; safeL?: number; safeR?: number; safeB?: number; shots?: boolean }
const VPS: Vp[] = [
  { name: '320x568', w: 320, h: 568, kind: 'portrait', shots: true },
  { name: '375x812', w: 375, h: 812, kind: 'portrait' },
  { name: '390x844', w: 390, h: 844, kind: 'portrait', shots: true },
  { name: '430x932', w: 430, h: 932, kind: 'portrait' },
  { name: '844x390', w: 844, h: 390, kind: 'landscape', safeL: 47, safeR: 47, safeB: 21, shots: true },
  { name: '932x430', w: 932, h: 430, kind: 'landscape', safeL: 59, safeR: 59, safeB: 21 },
  { name: '768x1024', w: 768, h: 1024, kind: 'ipad' },
];

async function newCtx(browser: Browser, v: Vp): Promise<BrowserContext> {
  return browser.newContext({ viewport: { width: v.w, height: v.h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', colorScheme: 'light' });
}
async function boot(page: Page, theme: 'light' | 'dark'): Promise<CrmMock> {
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(15000);
  // Chủ sở hữu (role=owner, quyền như admin): trang Hồ sơ tổ chức cho sửa -> đo được ô nhập thật (admin thường bị khóa ô)
  const mock = await installCrmMocks(page, { user: { ...ADMIN, role: 'owner' } });
  await setTheme(page, theme);
  await page.clock.setFixedTime(new Date('2026-11-07T10:00:00+07:00'));
  await page.addInitScript(HIDE_SCROLLBAR);
  return mock;
}
async function setSafe(page: Page, l: number, r: number, b: number) {
  await page.evaluate(([l, r, b]) => {
    const el = document.querySelector('.crm-mobile.m-shell') as HTMLElement | null;
    el?.style.setProperty('--m-safe-left', `${l}px`); el?.style.setProperty('--m-safe-right', `${r}px`); el?.style.setProperty('--m-safe-bottom', `${b}px`);
  }, [l, r, b] as const);
}

interface Screen {
  key: string; label: string; scope: string; targets: string[];
  go(page: Page): Promise<void>;
  /** sheet/dialog: không đo tabbar, không đo cuộn của shell */
  overlay?: boolean;
  /** nội dung là "đảo sáng" có chủ đích khi Tối (Cài đặt cấp 2): không đánh lỗi contrast, chỉ kiểm khung quanh */
  darkIsland?: boolean;
  /** bỏ đo khoảng cách tabbar (màn không có tabbar) */
  noTabbar?: boolean;
}

const shellReady = (page: Page) => page.locator('.crm-mobile.m-shell').waitFor({ state: 'attached', timeout: 15_000 });
const pause = (page: Page, ms = 500) => page.waitForTimeout(ms);

const SCREENS: Screen[] = [
  { key: 'tongquan', label: 'Tổng quan', scope: '.m-main', targets: ['.m-main', '.m-tabbar'], async go(p) { await p.goto('/'); await shellReady(p); await p.locator('.crm-ov__hero').waitFor({ timeout: 15_000 }); await pause(p); } },
  { key: 'khachhang', label: 'Khách hàng (danh sách)', scope: '.m-main', targets: ['.m-main', '.m-tabbar'], async go(p) { await p.goto('/contacts'); await shellReady(p); await p.locator('.crm-contact-card').first().waitFor({ timeout: 15_000 }); await pause(p); } },
  {
    key: 'khachhang-loc', label: 'Khách hàng: sheet lọc', scope: '.m-sheet', targets: ['.m-sheet'], overlay: true,
    async go(p) { await p.goto('/contacts'); await shellReady(p); await p.locator('.crm-contact-card').first().waitFor({ timeout: 15_000 }); await p.locator('.crm-list__filter').click(); await settleSheet(p); },
  },
  { key: 'hoso', label: 'Hồ sơ khách', scope: '.m-main', targets: ['.m-main', '.m-tabbar'], async go(p) { await p.goto('/contacts/qa-ct-1/profile'); await shellReady(p); await p.locator('.crm-profile__act').first().waitFor({ timeout: 15_000 }); await pause(p); } },
  { key: 'lichhen', label: 'Lịch hẹn (agenda)', scope: '.m-main', targets: ['.m-main', '.m-tabbar'], async go(p) { await p.goto('/appointments'); await shellReady(p); await p.locator('.crm-appt-card').first().waitFor({ timeout: 15_000 }); await pause(p); } },
  {
    key: 'lichhen-tao', label: 'Lịch hẹn: sheet tạo', scope: '.m-sheet', targets: ['.m-sheet'], overlay: true,
    async go(p) { await p.goto('/appointments'); await shellReady(p); await p.locator('.crm-appt-card').first().waitFor({ timeout: 15_000 }); await p.locator('.crm-agenda__fab').click(); await p.locator('#ap-title').waitFor({ state: 'visible' }); await settleSheet(p); },
  },
  {
    key: 'lichhen-sua', label: 'Lịch hẹn: sheet sửa (nguồn Zalo)', scope: '.m-sheet', targets: ['.m-sheet'], overlay: true,
    async go(p) {
      await p.goto('/appointments'); await shellReady(p);
      await p.locator('.crm-appt-card', { hasText: 'Hẹn từ tin Zalo giả' }).first().click();
      await p.getByRole('button', { name: 'Sửa', exact: true }).click();
      await p.locator('#ap-title').waitFor({ state: 'visible' }); await settleSheet(p);
    },
  },
  {
    key: 'nhachen-editor', label: 'Dialog "Tạo nhắc hẹn" (AppointmentEditor từ chat)', scope: '.editor', targets: ['.editor'], overlay: true,
    async go(p) {
      await p.goto('/chat/qa-conv-1'); await waitThread(p);
      await p.locator('button[title="Tạo nhắc hẹn cho KH này"]').click();
      await p.locator('.editor').waitFor({ state: 'visible' }); await pause(p, 700);
    },
  },
  {
    key: 'doimatkhau', label: 'Tài khoản → Đổi mật khẩu', scope: '.modal-overlay', targets: ['.modal-overlay'], overlay: true,
    async go(p) { await p.goto('/account'); await shellReady(p); await p.getByRole('button', { name: /Đổi mật khẩu/ }).first().click(); await p.locator('.modal-overlay .modal').waitFor({ state: 'visible' }); await pause(p, 400); },
  },
  {
    key: 'khachhang-tao', label: 'Khách hàng: sheet thêm khách', scope: '.m-sheet', targets: ['.m-sheet'], overlay: true,
    async go(p) { await p.goto('/contacts'); await shellReady(p); await p.locator('.crm-contact-card').first().waitFor({ timeout: 15_000 }); await p.locator('.crm-list__fab').click(); await settleSheet(p); await pause(p, 300); },
  },
  {
    key: 'hoso-sua', label: 'Hồ sơ khách: sheet sửa', scope: '.m-sheet', targets: ['.m-sheet'], overlay: true,
    async go(p) { await p.goto('/contacts/qa-ct-1/profile'); await shellReady(p); await p.locator('.crm-profile__act').first().waitFor({ timeout: 15_000 }); await p.locator('.crm-profile__act', { hasText: 'Sửa' }).click(); await settleSheet(p); await pause(p, 300); },
  },
  {
    key: 'hoso-chon-nick', label: 'Hồ sơ khách: chọn nick để nhắn (2 hội thoại)', scope: '.m-sheet', targets: ['.m-sheet'], overlay: true,
    async go(p) { await p.goto('/contacts/qa-ct-2/profile'); await shellReady(p); await p.locator('.crm-profile__act--primary').click(); await p.locator('.crm-picker__row').first().waitFor({ timeout: 10_000 }); await settleSheet(p); },
  },
  {
    key: 'lichhen-chitiet', label: 'Lịch hẹn: sheet chi tiết/thao tác', scope: '.m-sheet', targets: ['.m-sheet'], overlay: true,
    async go(p) { await p.goto('/appointments'); await shellReady(p); await p.locator('.crm-appt-card').first().waitFor({ timeout: 15_000 }); await p.locator('.crm-appt-card', { hasText: 'Hẹn từ tin Zalo giả' }).first().click(); await p.locator('.crm-ad__btn').first().waitFor(); await settleSheet(p); },
  },
  {
    key: 'lichhen-loc', label: 'Lịch hẹn: sheet lọc', scope: '.m-sheet', targets: ['.m-sheet'], overlay: true,
    async go(p) { await p.goto('/appointments'); await shellReady(p); await p.locator('.crm-appt-card').first().waitFor({ timeout: 15_000 }); await p.locator('.crm-agenda__filter').click(); await settleSheet(p); await pause(p, 300); },
  },
  { key: 'tongquan-team', label: 'Tổng quan: tab Quản lý team', scope: '.m-main', targets: ['.m-main', '.m-tabbar'], async go(p) { await p.goto('/'); await shellReady(p); await p.locator('.crm-ov__hero').waitFor({ timeout: 15_000 }); await p.getByRole('tab', { name: 'Quản lý team' }).click(); await pause(p, 900); } },
  {
    key: 'tongquan-pham-vi', label: 'Tổng quan: sheet phạm vi', scope: '.m-sheet', targets: ['.m-sheet'], overlay: true,
    async go(p) { await p.goto('/'); await shellReady(p); await p.locator('.crm-ov__hero').waitFor({ timeout: 15_000 }); await p.locator('.crm-ov-view__scope').click(); await settleSheet(p); await pause(p, 300); },
  },
  { key: 'caidat-1', label: 'Cài đặt cấp 1', scope: '.m-main', targets: ['.m-main', '.m-tabbar'], async go(p) { await p.goto('/settings'); await shellReady(p); await p.locator('.crm-sm').waitFor({ timeout: 15_000 }); await pause(p); } },
  { key: 'caidat-2-taikhoan', label: 'Cài đặt cấp 2: Tài khoản của tôi', scope: '.m-main', targets: ['.m-main', '.m-tabbar'], darkIsland: true, async go(p) { await p.goto('/settings/personal/profile'); await shellReady(p); await p.locator('.crm-settings__head').waitFor({ timeout: 15_000 }); await p.locator('.account-page').waitFor({ timeout: 15_000 }); await pause(p, 700); } },
  { key: 'caidat-2-tochuc', label: 'Cài đặt cấp 2: Hồ sơ tổ chức', scope: '.m-main', targets: ['.m-main', '.m-tabbar'], darkIsland: true, async go(p) { await p.goto('/settings/org/profile'); await shellReady(p); await p.locator('.crm-settings__head').waitFor({ timeout: 15_000 }); await pause(p, 900);
      const field = p.locator('.org-form-col .v-text-field .v-field').first();
      await field.scrollIntoViewIfNeeded();
      const box = (await field.boundingBox())!;
      const input = field.locator('input').first();
      const native = (await input.boundingBox())!;
      console.log(`[G3 VTextField hit area] ${JSON.stringify({ field: box, native })}`);
      if (native.height >= 44 && native.width >= 44) {
        await input.click();
        await expect(input, 'native input itself meets44 and receives focus').toBeFocused();
      } else {
        expect(box.height, `VTextField delegated hit area >=44, actual=${box.height}`).toBeGreaterThanOrEqual(44);
        const above = native.y - box.y >= 2;
        const below = box.y + box.height - native.y - native.height >= 2;
        expect(above || below, 'there is padding outside the native input for the delegated hit probe').toBe(true);
        await p.mouse.click(box.x + 3, above ? box.y + 1 : box.y + box.height - 1);
        await expect(input, 'click in VField padding delegates focus to native input').toBeFocused();
      }
    } },
];

interface Issue { screen: string; kind: string; detail: unknown }

async function inspect(page: Page, s: Screen, v: Vp, theme: string, browserName: string, issues: Issue[]) {
  const add = (kind: string, detail: unknown) => issues.push({ screen: s.key, kind, detail });
  await s.go(page);
  if (v.kind === 'landscape' && !s.overlay) await setSafe(page, v.safeL!, v.safeR!, v.safeB!);
  if (v.kind === 'landscape' && s.overlay) { /* sheet teleport ra ngoài .m-shell: biến safe mô phỏng không áp dụng, chỉ đo tràn ngang */ }

  const a = await audit(page, s.scope, s.targets);
  for (const [k, sc] of Object.entries(a.scroll)) if (['html', 'body', 'shell', 'main', 'sheet'].includes(k) && sc.sw > sc.cw) add('overflow-ngang', { [k]: sc });
  if (a.offenders.length) add('tràn-khỏi-viewport', a.offenders.slice(0, 6));
  if (a.smallTargets.length) add('touch<44', a.smallTargets.slice(0, 8));
  if (a.smallInputs.length) add('input<16px', a.smallInputs.slice(0, 6));

  if (!s.overlay) {
    const b = await bottomClearance(page);
    if (b.docOverflowY) add('document-cuộn-dọc (100vh?)', b);
    if (b.docOverflowX) add('document-cuộn-ngang', b);
    const limit = Math.min(b.tabbarTop ?? 1e9, b.fabTop ?? 1e9);
    if (b.scrollable && b.lastBottom > limit + 1) add('dòng-cuối-bị-tabbar-che', { lastBottom: Math.round(b.lastBottom), tabbarTop: b.tabbarTop, fabTop: b.fabTop });
    if (!b.scrollable && b.lastBottom > (b.tabbarTop ?? 1e9) + 1) add('nội-dung-đè-tabbar', { lastBottom: Math.round(b.lastBottom), tabbarTop: b.tabbarTop });
    if (v.kind === 'landscape') {
      const so = await safeOffenders(page, '.m-main, .m-tabbar', v.safeL!, v.safeR!);
      if (so.length) add('dưới-tai-thỏ', so.slice(0, 6));
    }
  }

  if (theme === 'dark') {
    if (s.darkIsland) {
      // Đảo sáng có chủ đích: chỉ kiểm khung quanh (header cấp 2 + tabbar) đúng Tối.
      const c = await contrastIssues(page, '.crm-settings__head, .m-tabbar');
      if (c.length) add('contrast-khung-quanh-tối', c.slice(0, 6));
      const bg = await page.evaluate(() => {
        const h = document.querySelector('.crm-settings__head'); const t = document.querySelector('.m-tabbar');
        const l = (e: Element | null) => { if (!e) return null; const m = getComputedStyle(e).backgroundColor.match(/[\d.]+/g)!.map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
        return { head: l(h), tabbar: l(t) };
      });
      if ((bg.head ?? 0) > 0.5) add('header-cấp-2-không-tối', bg);
      if ((bg.tabbar ?? 0) > 0.5) add('tabbar-không-tối', bg);
    } else {
      const c = await contrastIssues(page, s.scope + (s.overlay ? '' : ', .m-tabbar'));
      if (c.length) add('contrast-thấp', c.slice(0, 8));
    }
  }

  if (v.shots) {
    await page.evaluate(() => { const sc = document.querySelector('.m-main__scroll'); if (sc) sc.scrollTop = 0; });
    await page.waitForTimeout(150);
    fs.mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: path.join(OUT, `${s.key}-${v.name}-${theme}-${browserName}.jpg`), type: 'jpeg', quality: 70, animations: 'disabled', caret: 'hide' });
  }
}

for (const v of VPS) {
  for (const theme of ['light', 'dark'] as const) {
    test.describe(`${v.name} ${theme}`, () => {
      test.setTimeout(300_000);
      if (v.kind === 'ipad') {
        test('768 dọc = desktop (không dựng .m-shell)', async ({ browser, browserName }) => {
          const ctx = await newCtx(browser, v); const page = await ctx.newPage(); await boot(page, theme);
          const result: Record<string, unknown> = {};
          for (const r of ['/', '/contacts', '/contacts/qa-ct-1/profile', '/appointments', '/settings/org/profile']) {
            await page.goto(r); await page.locator('.smax-topnav').first().waitFor({ state: 'attached', timeout: 15_000 });
            result[r] = await page.evaluate(() => ({ desktop: !!document.querySelector('.smax-topnav'), shell: !!document.querySelector('.m-shell'), settingsShell: !!document.querySelector('.crm-settings'), ov: !!document.querySelector('.crm-ov'), minW: getComputedStyle(document.getElementById('app')!).minWidth }));
            expect.soft(result[r], `${r}: phải là desktop`).toMatchObject({ desktop: true, shell: false, settingsShell: false, ov: false });
          }
          test.info().annotations.push({ type: 'ipad768', description: JSON.stringify(result) });
          await ctx.close();
        });
        return;
      }
      test('các màn D (ma trận)', async ({ browser, browserName }, info) => {
        const ctx = await newCtx(browser, v); const page = await ctx.newPage(); const mock = await boot(page, theme);
        const issues: Issue[] = [];
        const t = await page.evaluate(() => ({ coarse: matchMedia('(pointer: coarse)').matches, hoverNone: matchMedia('(hover: none)').matches }));
        for (const s of SCREENS) {
          try { await inspect(page, s, v, theme, browserName, issues); console.log(`[G3 ${v.name} ${theme} ${browserName}] ${s.key}: ${issues.filter(issue => issue.screen === s.key).length} issues`); } catch (e) { issues.push({ screen: s.key, kind: 'không-dựng-được', detail: String((e as Error).message).split('\n')[0] }); }
        }
        fs.mkdirSync(RES, { recursive: true });
        fs.writeFileSync(path.join(RES, `matrix-${v.name}-${theme}-${browserName}.json`), JSON.stringify({ viewport: v.name, theme, browserName, touch: t, issues, pageErrors: mock.chat.consoleErrors.slice(0, 10) }, null, 2));
        info.annotations.push({ type: 'issues', description: JSON.stringify(issues) });
        expect(issues, JSON.stringify(issues, null, 1)).toEqual([]);
        expect(mock.chat.consoleErrors, 'No runtime errors while rendering D matrix').toEqual([]);
        await ctx.close();
      });
    });
  }
}

void settle;
