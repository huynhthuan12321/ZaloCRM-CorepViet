// Chụp ảnh SAU nâng cấp (khung mobile đợt B) bằng mock rỗng (không có dữ liệu khách). Ghi vào docs/mobile-upgrade/qa/B-shots/.
// Mức bằng chứng: Chromium / WebKit desktop emulation, KHÔNG phải Safari iPhone (không có notch/safe-area/bàn phím).
import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ADMIN, installMocks, waitShell } from './helpers/mock-api';

const OUT = path.resolve(import.meta.dirname, '../../docs/mobile-upgrade/qa/B-shots');
const SCREENS: Array<[string, string]> = [['tongquan', '/'], ['khachhang', '/contacts'], ['chat', '/chat'], ['lichhen', '/appointments'], ['taikhoan', '/account']];
const SIZES = [{ w: 375, h: 812 }, { w: 390, h: 844 }];

test.describe('Ảnh sau đợt B', () => {
  test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

  for (const size of SIZES) {
    for (const theme of ['light', 'dark'] as const) {
      for (const [name, route] of SCREENS) {
        test(`${name} ${size.w} ${theme}`, async ({ page, browserName }) => {
          await installMocks(page, { user: ADMIN, waiting: 7 });
          await page.addInitScript((t) => { localStorage.setItem('crm.mobile.themePreference:qa-user-admin', t); }, theme);
          await page.emulateMedia({ colorScheme: 'light' });
          await page.clock.setFixedTime(new Date('2026-11-07T10:00:00+07:00'));
          await page.setViewportSize({ width: size.w, height: size.h });
          await page.goto(route);
          await waitShell(page);
          await page.waitForTimeout(2800); // badge (debounce 2s) + dữ liệu rỗng lắng
          await page.screenshot({ path: path.join(OUT, `${name}-${size.w}-${theme}-${browserName}.png`), animations: 'disabled', caret: 'hide' });
        });
      }
    }
  }

  for (const theme of ['light', 'dark'] as const) {
    test(`landscape tài khoản 667x375 ${theme}`, async ({ page, browserName }) => {
      await installMocks(page, { user: ADMIN, waiting: 7 });
      await page.addInitScript((t) => { localStorage.setItem('crm.mobile.themePreference:qa-user-admin', t); }, theme);
      await page.clock.setFixedTime(new Date('2026-11-07T10:00:00+07:00'));
      await page.setViewportSize({ width: 667, height: 375 });
      await page.goto('/account');
      await waitShell(page);
      await page.waitForTimeout(2800);
      await page.screenshot({ path: path.join(OUT, `taikhoan-landscape-667x375-${theme}-${browserName}.png`), animations: 'disabled', caret: 'hide' });
    });
  }
});
