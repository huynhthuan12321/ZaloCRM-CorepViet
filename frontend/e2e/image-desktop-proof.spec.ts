import { test, expect } from '@playwright/test';
import { installF2F3Mocks } from './helpers/mock-f2f3';
import fs from 'node:fs';

const out = process.env.IMAGE_DESKTOP_OUT ?? '';
test.skip(!out, 'Requires extracted production and approved-mobile builds; use the image-audit runner.');
const cases = [
  ['production-image-dropdown', process.env.IMAGE_DESKTOP_PROD_ORIGIN ?? 'http://localhost:4246'],
  ['approved-mobile-rail', process.env.IMAGE_DESKTOP_RAIL_ORIGIN ?? 'http://localhost:4247'],
  ['release-dropdown', process.env.IMAGE_DESKTOP_RELEASE_ORIGIN ?? 'http://localhost:4244'],
];
for (const [style, origin] of cases) {
  test(style, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.clock.setFixedTime(new Date('2026-11-07T03:00:00Z'));
    await installF2F3Mocks(page, { rasterImages: true });
    await page.route('**/api/v1/channel-accounts', route => route.fulfill({
      json: { available: true, accounts: [] },
    }));
    await page.addInitScript(() => localStorage.setItem('selected-zalo-account', 'qa-nick-1'));
    await page.goto(origin + '/chat/qa-conv-1');
    await page.locator('.input-editor [contenteditable=true]').waitFor();
    await page.waitForTimeout(2000);
    await page.evaluate(() => document.fonts.ready);
    const rail = await page.locator('.smax-channel-rail').count();
    expect(rail).toBe(style === 'approved-mobile-rail' ? 1 : 0);
    if (style === 'approved-mobile-rail') {
      await expect(page.locator('.smax-channel-rail')).toBeVisible();
      await expect(page.getByRole('combobox', { name: 'Chọn hộp thư', exact: true })).toHaveCount(0);
    } else {
      await expect(page.getByRole('combobox', { name: 'Chọn hộp thư', exact: true })).toBeVisible();
    }
    fs.mkdirSync(out, { recursive: true });
    await page.screenshot({ path: out + '/' + style + '.png', animations: 'disabled', caret: 'hide' });
    fs.writeFileSync(out + '/' + style + '.json', JSON.stringify({
      origin, style, rail, width: 1440, height: 900, fixture: 'entirely fake installF2F3Mocks',
    }));
  });
}
