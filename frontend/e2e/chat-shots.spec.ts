// Ảnh SAU đợt C (chat mobile) -> docs/mobile-upgrade/qa/C-shots/. Dữ liệu giả; safe-bottom được MÔ PHỎNG (34px dọc, 21px ngang).
// Mức bằng chứng: Chromium / WebKit desktop emulation, KHÔNG phải Safari iPhone.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { EDITOR, installChatMocks, setNetwork, setTheme, settleSheet, simulateSafe, waitInbox, waitThread } from './helpers/mock-chat';

const OUT = path.resolve(import.meta.dirname, '../../docs/mobile-upgrade/qa/C-shots');
const SIZES = [{ w: 375, h: 812 }, { w: 390, h: 844 }];

async function prep(page: Page, w: number, h: number, theme: 'light' | 'dark', safe = 34) {
  const mock = await installChatMocks(page);
  await setTheme(page, theme);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.clock.setFixedTime(new Date('2026-11-07T10:00:00+07:00'));
  // Giả lập thanh cuộn nổi như iOS (WebKit desktop Windows có thanh cuộn cổ điển 10px chen vào ảnh)
  await page.addInitScript(() => {
    const add = () => { const st = document.createElement('style'); st.textContent = '*{scrollbar-width:none !important}'; (document.head || document.documentElement).appendChild(st); };
    if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
  });
  await page.setViewportSize({ width: w, height: h });
  return { mock, safe };
}
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`), animations: 'disabled', caret: 'hide' });

test.describe('Ảnh sau đợt C', () => {
  test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));
  test.setTimeout(120_000); // bộ ảnh nhiều bước, WebKit chậm khi chạy song song

  for (const size of SIZES) {
    for (const theme of ['light', 'dark'] as const) {
      test(`bộ ảnh ${size.w} ${theme}`, async ({ page, context, browserName }) => {
        const tag = `${size.w}-${theme}-${browserName}`;
        const { mock, safe } = await prep(page, size.w, size.h, theme);
        await page.goto('/chat');
        await waitInbox(page);
        await simulateSafe(page, safe);
        await page.waitForTimeout(2800); // badge tabbar
        await shot(page, `chat-inbox-${tag}`);

        await page.locator('.m-conv-row', { hasText: 'Khách Giả A' }).first().click();
        await waitThread(page);
        await shot(page, `chat-thread-${tag}`);

        // composer có nháp
        await page.locator(EDITOR).click();
        await page.keyboard.type('Dạ em gửi anh bảng giá ngay ạ, anh chờ em một chút nhé.');
        await page.waitForTimeout(300);
        await shot(page, `chat-composer-draft-${tag}`);

        // sheet +
        await page.locator('.is-mobile .attach-plus-btn').click();
        await page.locator('.m-sheet:visible .m-attach__item').first().waitFor();
        await settleSheet(page);
        await shot(page, `chat-sheet-plus-${tag}`);
        await page.keyboard.press('Escape');
        await page.locator('.m-sheet:visible').waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);

        // sheet AI
        await page.locator('.is-mobile .ai-btn').click();
        await page.locator('.m-sheet:visible .m-ai__text').waitFor({ timeout: 10_000 });
        await settleSheet(page);
        await shot(page, `chat-sheet-ai-${tag}`);
        await page.keyboard.press('Escape');
        await page.locator('.m-sheet:visible').waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);

        // pill "Tin mới"
        await page.locator('.is-mobile .messages').evaluate(el => { el.scrollTop = 150; });
        await page.waitForTimeout(300);
        await expect.poll(() => mock.ws.live.length, { timeout: 10_000 }).toBeGreaterThan(0);
        mock.inbound('qa-conv-1', 'Anh ơi bên em còn hàng không ạ? (dữ liệu giả)');
        await page.locator('.new-msg-pill').waitFor({ timeout: 8000 });
        await page.waitForTimeout(400);
        await shot(page, `chat-pill-${tag}`);
        await page.locator('.new-msg-pill').click();

        // hàng đợi offline
        await setNetwork(page, context, false);
        await page.locator(EDITOR).click();
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Delete');
        await page.keyboard.type('Tin gửi lúc mất mạng, sẽ tự gửi khi có mạng.');
        await page.locator('.is-mobile .send-btn').click();
        await page.locator('.m-pending__item').waitFor();
        await page.waitForTimeout(500);
        await shot(page, `chat-queue-offline-${tag}`);
        await setNetwork(page, context, true);
      });
    }
  }

  for (const theme of ['light', 'dark'] as const) {
    test(`landscape 667x375 ${theme}`, async ({ page, context, browserName }) => {
      const tag = `landscape-667x375-${theme}-${browserName}`;
      const { mock, safe } = await prep(page, 667, 375, theme, 21);
      await page.goto('/chat');
      await waitInbox(page);
      await simulateSafe(page, safe);
      await page.waitForTimeout(2800);
      await shot(page, `chat-inbox-${tag}`);
      await page.locator('.m-conv-row', { hasText: 'Khách Giả A' }).first().click();
      await waitThread(page);
      await page.locator(EDITOR).click();
      await page.keyboard.type('Nháp ở chế độ ngang.');
      await shot(page, `chat-thread-${tag}`);
      await page.locator('.is-mobile .attach-plus-btn').click();
      await page.locator('.m-sheet:visible .m-attach__item').first().waitFor();
      await settleSheet(page);
      await shot(page, `chat-sheet-plus-${tag}`);
      await page.keyboard.press('Escape');
      await page.locator('.m-sheet:visible').waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
      await page.locator('.is-mobile .messages').evaluate(el => { el.scrollTop = 100; });
      await expect.poll(() => mock.ws.live.length, { timeout: 10_000 }).toBeGreaterThan(0);
      mock.inbound('qa-conv-1', 'Tin đến khi đang đọc cũ (giả)');
      await page.locator('.new-msg-pill').waitFor({ timeout: 8000 });
      await shot(page, `chat-pill-${tag}`);
      void context;
    });
  }

  // Thanh tab mới: nút giữa 60px nổi 22px, nhãn "Hội thoại" không bị đè — chụp + đo ở 320/390/430
  for (const w of [320, 390, 430]) {
    for (const theme of ['light', 'dark'] as const) {
      test(`thanh tab ${w} ${theme}`, async ({ page, browserName }, info) => {
        const h = w === 320 ? 568 : w === 390 ? 844 : 932;
        await prep(page, w, h, theme);
        await page.goto('/chat');
        await waitInbox(page);
        await simulateSafe(page, 34);
        await page.waitForTimeout(2800);
        const m = await page.evaluate(() => {
          const bar = document.querySelector('.m-tabbar')!.getBoundingClientRect();
          const fab = document.querySelector('.m-tab__fab')!.getBoundingClientRect();
          const tabTop = document.querySelector('.m-tab--prominent')!.getBoundingClientRect().top;
          const label = document.querySelector('.m-tab--prominent .m-tab__label')!.getBoundingClientRect();
          const labels = [...document.querySelectorAll('.m-tab__label')].map(l => { const r = l.getBoundingClientRect(); return { t: l.textContent?.trim(), l: Math.round(r.left), r: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), sw: (l as HTMLElement).scrollWidth, cw: (l as HTMLElement).clientWidth }; });
          const lab = document.querySelector('.m-tab--prominent .m-tab__label') as HTMLElement;
          return { barTop: bar.top, fabW: fab.width, fabH: fab.height, fabTop: fab.top, fabBottom: fab.bottom, labelTop: label.top, labelBottom: label.bottom, labelLeft: label.left, labelRight: label.right, floatAbove: tabTop - fab.top, barBorderTop: tabTop - bar.top, labels, labelClipped: lab.scrollWidth > lab.clientWidth, vw: innerWidth };
        });
        info.annotations.push({ type: 'tabbar', description: JSON.stringify(m) });
        fs.mkdirSync(OUT, { recursive: true });
        await page.screenshot({ path: path.join(OUT, `tabbar-${w}-${theme}-${browserName}.png`), clip: { x: 0, y: h - 130, width: w, height: 130 }, animations: 'disabled' });
        expect.soft(Math.round(m.fabW), 'nút giữa rộng 60px (56px ở <=359px theo --m-fab-size)').toBe(w <= 359 ? 56 : 60);
        expect.soft(Math.round(m.floatAbove), 'nút nổi 22px so với mép trên mục tab (--m-fab-lift)').toBe(22);
        expect.soft(m.labelTop, 'nhãn Hội thoại phải nằm dưới nút nổi').toBeGreaterThanOrEqual(m.fabBottom - 1);
        expect.soft(m.labelClipped, 'nhãn "Hội thoại" bị cắt').toBe(false);
        for (const l of m.labels) { expect.soft(l.l, `nhãn ${l.t} lọt mép trái`).toBeGreaterThanOrEqual(0); expect.soft(l.r, `nhãn ${l.t} lọt mép phải`).toBeLessThanOrEqual(m.vw); expect.soft(l.sw, `nhãn ${l.t} bị cắt`).toBeLessThanOrEqual(l.cw + 1); }
        // Các nhãn không chồng lên nhau theo chiều ngang
        const sorted = [...m.labels].sort((a, b) => a.l - b.l);
        for (let i = 1; i < sorted.length; i++) expect.soft(sorted[i].l, `${sorted[i - 1].t} đè ${sorted[i].t}`).toBeGreaterThanOrEqual(sorted[i - 1].r - 1);
      });
    }
  }
});
