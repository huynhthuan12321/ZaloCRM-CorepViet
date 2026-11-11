// QA đợt C - realtime: tin chưa đọc, reconnect. Mock Socket.IO giả (helpers/mock-chat.ts). Chromium + WebKit desktop.
import { expect, test, type Page } from '@playwright/test';
import { installChatMocks, setTheme, waitInbox, waitThread, type ChatMock } from './helpers/mock-chat';

async function boot(page: Page): Promise<ChatMock> {
  const mock = await installChatMocks(page);
  await setTheme(page, 'light');
  await page.addInitScript(() => {
    const add = () => { const st = document.createElement('style'); st.textContent = '*{scrollbar-width:none !important}'; (document.head || document.documentElement).appendChild(st); };
    if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  return mock;
}

test.describe('Chưa đọc và realtime', () => {
  test('tin đến hội thoại khác: hàng nhảy lên đầu, +1 chưa đọc; mở hội thoại → mark-read, hết chưa đọc', async ({ page }) => {
    const mock = await boot(page);
    await page.goto('/chat');
    await waitInbox(page);
    await expect.poll(() => mock.ws.live.length).toBe(1);
    const row = () => page.locator('.m-conv-row', { hasText: 'Khách Giả B' }).first();
    await expect(row().locator('.m-conv-row__unread')).toHaveCount(0);
    mock.inbound('qa-conv-2', 'Anh ơi cho em hỏi thêm (dữ liệu giả)');
    await expect(row().locator('.m-conv-row__unread')).toHaveText('1');
    await expect(page.locator('.m-conv-row').first()).toContainText('Khách Giả B');
    await expect(row()).toContainText('Anh ơi cho em hỏi thêm');
    await row().click();
    await waitThread(page);
    await expect.poll(() => mock.count('POST', /^\/conversations\/qa-conv-2\/mark-read$/)).toBe(1);
    await page.locator('.m-thread-back').click();
    await expect(row().locator('.m-conv-row__unread')).toHaveCount(0);
  });

  test('mất realtime >4s → banner; có lại → banner biến mất và danh sách được tải bù', async ({ page }) => {
    const mock = await boot(page);
    await page.goto('/chat');
    await waitInbox(page);
    await expect.poll(() => mock.ws.live.length).toBe(1);
    await expect(page.getByText('Mất kết nối realtime')).toHaveCount(0);
    const listCalls = mock.count('GET', /^\/conversations$/);
    mock.ws.refuse = true;
    for (const w of [...mock.ws.live]) await w.close();
    await expect(page.getByText('Mất kết nối realtime, đang thử kết nối lại…')).toBeVisible({ timeout: 15_000 });
    // banner không che nút nào của inbox: nằm trong luồng, không đè ô tìm kiếm
    const banner = await page.locator('.mobile-chat__realtime').boundingBox();
    const search = await page.locator('.m-inbox__tools').boundingBox();
    expect(banner!.y + banner!.height).toBeLessThanOrEqual(search!.y + 1);
    mock.ws.refuse = false;
    await expect(page.getByText('Mất kết nối realtime')).toHaveCount(0, { timeout: 30_000 });
    await expect.poll(() => mock.count('GET', /^\/conversations$/), { timeout: 10_000 }).toBeGreaterThan(listCalls);
    // sau khi nối lại tin đến vẫn hiện, không nhân đôi
    await page.locator('.m-conv-row', { hasText: 'Khách Giả A' }).first().click();
    await waitThread(page);
    const before = await page.locator('.msg-bubble-wrap').count();
    mock.inbound('qa-conv-1', 'Tin sau khi nối lại');
    await expect(page.locator('.msg-bubble-wrap')).toHaveCount(before + 1);
    await page.waitForTimeout(600);
    expect(await page.locator('.msg-bubble-wrap').count()).toBe(before + 1);
  });
});
