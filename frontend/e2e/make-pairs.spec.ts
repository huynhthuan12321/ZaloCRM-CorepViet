// Ghép ảnh TRƯỚC (baseline-shots, đợt A) | SAU (B-shots) thành một ảnh để so mắt. Chạy sau shots.spec.ts. Chỉ chạy ở project chromium.
import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const QA = path.resolve(import.meta.dirname, '../../docs/mobile-upgrade/qa');
const OUT = path.join(QA, 'B-shots', 'pairs');
const SCREENS = ['tongquan', 'khachhang', 'chat', 'lichhen'];
const SIZES = [{ w: 375, h: 812 }, { w: 390, h: 844 }];

const b64 = (f: string) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;

test.describe('Ghép cặp trước/sau', () => {
  test.skip(({ browserName }) => browserName !== 'chromium');
  test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

  for (const size of SIZES) {
    for (const name of SCREENS) {
      test(`${name} ${size.w}`, async ({ page }) => {
        const cols: Array<[string, string]> = [
          ['TRƯỚC (baseline đợt A, Chromium)', path.join(QA, 'baseline-shots', `${name}-${size.w}x${size.h}.png`)],
          ['SAU - Sáng - Chromium', path.join(QA, 'B-shots', `${name}-${size.w}-light-chromium.png`)],
          ['SAU - Tối - Chromium', path.join(QA, 'B-shots', `${name}-${size.w}-dark-chromium.png`)],
          ['SAU - Sáng - WebKit', path.join(QA, 'B-shots', `${name}-${size.w}-light-webkit.png`)],
          ['SAU - Tối - WebKit', path.join(QA, 'B-shots', `${name}-${size.w}-dark-webkit.png`)],
        ];
        const html = `<body style="margin:0;background:#888;font:14px sans-serif;display:flex;gap:12px;padding:12px;align-items:flex-start">${cols
          .map(([label, f]) => `<figure style="margin:0;width:${size.w}px"><figcaption style="color:#fff;margin-bottom:6px;font-weight:700">${label}</figcaption><img src="${b64(f)}" style="width:${size.w}px;height:${size.h}px;display:block;object-fit:fill"></figure>`)
          .join('')}</body>`;
        await page.setViewportSize({ width: cols.length * (size.w + 12) + 12, height: size.h + 50 });
        await page.setContent(html);
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(OUT, `${name}-${size.w}-truoc-sau.png`) });
      });
    }
  }
});
