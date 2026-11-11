// Ghép ảnh TRƯỚC (baseline-shots đợt A, B-shots đợt B) | SAU (C-shots) cho chat. Chạy sau chat-shots.spec.ts, chỉ ở chromium.
import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const QA = path.resolve(import.meta.dirname, '../../docs/mobile-upgrade/qa');
const OUT = path.join(QA, 'C-shots', 'pairs');
const SIZES = [{ w: 375, h: 812 }, { w: 390, h: 844 }];
const b64 = (f: string) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;

test.describe('Ghép cặp chat trước/sau (đợt C)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium');
  test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

  for (const size of SIZES) {
    for (const subject of ['inbox', 'thread'] as const) {
      test(`${subject} ${size.w}`, async ({ page }) => {
        const C = (theme: string, eng: string) => path.join(QA, 'C-shots', `chat-${subject}-${size.w}-${theme}-${eng}.png`);
        const cols: Array<[string, string]> = [
          ['A: baseline (Chromium)', path.join(QA, 'baseline-shots', `chat-${size.w}x${size.h}.png`)],
          ['B: khung mobile, Sáng', path.join(QA, 'B-shots', `chat-${size.w}-light-chromium.png`)],
          ['C Sáng - Chromium', C('light', 'chromium')],
          ['C Tối - Chromium', C('dark', 'chromium')],
          ['C Sáng - WebKit', C('light', 'webkit')],
          ['C Tối - WebKit', C('dark', 'webkit')],
        ];
        const note = subject === 'thread' ? '<p style="color:#fff;margin:0 12px">Ghi chú: baseline/B chỉ có màn danh sách; cột A-B là danh sách hội thoại (không có thread tương ứng).</p>' : '';
        const html = `<body style="margin:0;background:#888;font:14px sans-serif">${note}<div style="display:flex;gap:12px;padding:12px;align-items:flex-start">${cols
          .map(([label, f]) => `<figure style="margin:0;width:${size.w}px"><figcaption style="color:#fff;margin-bottom:6px;font-weight:700">${label}</figcaption><img src="${b64(f)}" style="width:${size.w}px;height:${size.h}px;display:block;object-fit:fill"></figure>`)
          .join('')}</div></body>`;
        await page.setViewportSize({ width: cols.length * (size.w + 12) + 12, height: size.h + 80 });
        await page.setContent(html);
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(OUT, `chat-${subject}-${size.w}-truoc-sau.png`) });
      });
    }
  }
});
