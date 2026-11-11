// QA đợt C (G2) - chat mobile. Chạy trên BẢN BUILD qua `vite preview`; backend/socket được mock (helpers/mock-chat.ts).
// Mức bằng chứng: Chromium + WebKit DESKTOP với viewport mô phỏng. KHÔNG phải Safari iPhone.
import { expect, test, type Page } from '@playwright/test';
import { ADMIN } from './helpers/mock-api';
import {
  APP, EDITOR, PNG_1x1, installChatMocks, setNetwork, setTheme, simulateSafe, settleSheet, waitInbox, waitThread,
  type ChatMock,
} from './helpers/mock-chat';
import { audit, effectiveBackground, findLightBlocks, luminance } from './helpers/audit';

const MOBILE_SIZES = [
  { w: 320, h: 568, name: '320x568', safe: 34 },
  { w: 375, h: 812, name: '375x812', safe: 34 },
  { w: 390, h: 844, name: '390x844', safe: 34 },
  { w: 430, h: 932, name: '430x932', safe: 34 },
  { w: 667, h: 375, name: 'landscape-667x375', safe: 21 },
] as const;

async function boot(page: Page, opts: Parameters<typeof installChatMocks>[1] = {}, view = { width: 390, height: 844 }, theme: 'light' | 'dark' = 'light'): Promise<ChatMock> {
  const mock = await installChatMocks(page, opts);
  await setTheme(page, theme);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.clock.setFixedTime(new Date('2026-11-07T10:00:00+07:00'));
  // WebKit desktop (Windows) dùng thanh cuộn cổ điển 10px, iOS Safari dùng thanh cuộn nổi (0px). Triệt tiêu để mô phỏng iOS;
  // nếu không, hàng inbox bị bố cục lại khi thanh cuộn xuất hiện (cao 113 -> 132px) làm sai phép đo scrollTop (xem QA-C-G2.md, L-3).
  await page.addInitScript(() => {
    const add = () => { const st = document.createElement('style'); st.textContent = '*{scrollbar-width:none !important}'; (document.head || document.documentElement).appendChild(st); };
    if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
  });
  await page.setViewportSize(view);
  return mock;
}

async function openRow(page: Page, name: string) {
  await page.locator('.m-conv-row', { hasText: name }).first().click();
  await waitThread(page);
}

const SHEET = '.m-sheet:visible';
const noteList = (label: string, items: unknown[]) => (items.length ? `${label}: ${JSON.stringify(items)}` : '');

// ──────────────────────────────────────────────────────────────────────────────────────────────
// 1. Bố cục: overflow ngang, composer sát đáy, ô nhập >=16px, nút >=44px — inbox/thread/sheet × viewport × Sáng/Tối
// ──────────────────────────────────────────────────────────────────────────────────────────────
test.describe('Bố cục chat mobile', () => {
  for (const size of MOBILE_SIZES) {
    for (const theme of ['light', 'dark'] as const) {
      test(`bố cục ${size.name} ${theme}`, async ({ page, browserName }, info) => {
        const mock = await boot(page, {}, { width: size.w, height: size.h }, theme);
        await page.goto('/chat');
        await waitInbox(page);
        await simulateSafe(page, size.safe);

        // --- Inbox
        const inbox = await audit(page, '.m-inbox', ['.m-inbox', '.m-tabbar']);
        for (const [k, v] of Object.entries(inbox.scroll)) expect.soft(v.sw, `inbox: ${k} scrollWidth>clientWidth`).toBeLessThanOrEqual(v.cw);
        expect.soft(inbox.offenders, `inbox offenders ${noteList('', inbox.offenders)}`).toEqual([]);
        expect.soft(inbox.smallInputs, 'inbox input <16px').toEqual([]);
        expect.soft(inbox.smallTargets, `inbox target <44px ${noteList('', inbox.smallTargets)}`).toEqual([]);

        // --- Sheet bộ lọc
        await page.getByRole('button', { name: /Mở bộ lọc|Bộ lọc, đang bật/ }).click();
        await page.locator(SHEET).waitFor({ state: 'visible' });
        await settleSheet(page);
        const filter = await audit(page, '.m-sheet', ['.m-sheet']);
        expect.soft(filter.offenders, `filter sheet offenders ${noteList('', filter.offenders)}`).toEqual([]);
        expect.soft(filter.smallTargets, `filter sheet target<44 ${noteList('', filter.smallTargets)}`).toEqual([]);
        expect.soft(filter.scroll.html.sw).toBeLessThanOrEqual(filter.scroll.html.cw);
        if (theme === 'dark') {
          const bg = await effectiveBackground(page, '.m-sheet');
          expect.soft(bg && luminance(bg), `nền sheet lọc (Tối) ${bg}`).toBeLessThan(0.35);
        }
        await page.getByRole('button', { name: 'Đóng' }).first().click();
        await page.locator(SHEET).waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);

        if (theme === 'dark') {
          const dark = { inbox: await effectiveBackground(page, '.m-inbox'), list: await effectiveBackground(page, '.m-inbox__list'), row: await effectiveBackground(page, '.m-conv-row'), search: await effectiveBackground(page, '.m-inbox__search') };
          for (const [k, bg] of Object.entries(dark)) expect.soft(bg && luminance(bg), `nền inbox:${k} (Tối) ${bg}`).toBeLessThan(0.35);
          expect.soft(await findLightBlocks(page, '.m-inbox'), 'khối sáng lớn trong inbox Tối').toEqual([]);
        }
        await info.attach(`inbox-${browserName}`, { body: JSON.stringify(inbox), contentType: 'application/json' });

        // --- Thread
        await openRow(page, 'Khách Giả A');
        const thread = await audit(page, '.mobile-chat__thread', ['.mobile-chat__thread .chat-header', '.mobile-chat__thread .input-area']);
        for (const [k, v] of Object.entries(thread.scroll)) expect.soft(v.sw, `thread: ${k} scrollWidth>clientWidth`).toBeLessThanOrEqual(v.cw);
        expect.soft(thread.offenders, `thread offenders ${noteList('', thread.offenders)}`).toEqual([]);
        expect.soft(thread.smallTargets, `thread target<44 ${noteList('', thread.smallTargets)}`).toEqual([]);
        expect.soft(thread.smallInputs, 'thread input <16px').toEqual([]);

        // Composer: trong màn hình, sát đáy (đáy composer ↔ đáy viewport ≈ safe-bottom mô phỏng)
        const comp = await page.locator('.is-mobile .input-area').boundingBox();
        expect(comp).not.toBeNull();
        const gap = size.h - (comp!.y + comp!.height);
        info.annotations.push({ type: 'composer-gap', description: `viewport=${size.h} composerBottom=${Math.round(comp!.y + comp!.height)} gap=${Math.round(gap)} safe=${size.safe}` });
        expect.soft(comp!.y + comp!.height, 'composer vượt đáy viewport').toBeLessThanOrEqual(size.h + 1);
        expect.soft(gap, `khoảng cách đáy composer ↔ viewport (${gap}) phải ≈ safe-bottom ${size.safe}`).toBeGreaterThanOrEqual(size.safe - 1);
        expect.soft(gap, `khoảng trống dưới composer quá lớn (${gap}) so với safe ${size.safe}`).toBeLessThanOrEqual(size.safe + 8);
        // Không còn khoảng trống ~120px: vùng tin nhắn phải chiếm phần còn lại
        const msgs = await page.locator('.is-mobile .messages').boundingBox();
        expect.soft(Math.abs((msgs!.y + msgs!.height) - comp!.y), 'khe giữa vùng tin và composer').toBeLessThanOrEqual(80);

        // Ô nhập >= 16px; gửi và + >= 44px
        const editorFs = await page.locator(EDITOR).evaluate(el => parseFloat(getComputedStyle(el).fontSize));
        expect.soft(editorFs, 'font ô soạn').toBeGreaterThanOrEqual(16);
        const send = await page.locator('.is-mobile .send-btn').boundingBox();
        const plus = await page.locator('.is-mobile .attach-plus-btn').boundingBox();
        expect.soft(Math.min(send!.width, send!.height), 'nút gửi').toBeGreaterThanOrEqual(44);
        expect.soft(Math.min(plus!.width, plus!.height), 'nút +').toBeGreaterThanOrEqual(44);
        expect.soft(send!.x + send!.width, 'nút gửi trong màn').toBeLessThanOrEqual(size.w + 1);
        // Composer không bị tabbar che: tabbar không hiện khi thread
        await expect(page.locator('.m-tabbar')).toHaveCount(0);

        if (theme === 'dark') {
          for (const sel of ['.mobile-chat', '.message-thread.is-mobile', '.is-mobile .messages', '.is-mobile .input-area', '.is-mobile .chat-header', '.is-mobile .editor-wrap']) {
            const bg = await effectiveBackground(page, sel);
            expect.soft(bg && luminance(bg), `nền ${sel} (Tối) ${bg}`).toBeLessThan(0.35);
          }
          expect.soft(await findLightBlocks(page, '.mobile-chat__thread'), 'khối sáng lớn trong thread Tối').toEqual([]);
        }

        // --- Sheet "+" và sheet AI
        await page.locator('.is-mobile .attach-plus-btn').click();
        await page.locator('.m-sheet:visible .m-attach__item').first().waitFor();
        await settleSheet(page);
        const att = await audit(page, '.m-sheet', ['.m-sheet']);
        expect.soft(att.offenders, `sheet + offenders ${noteList('', att.offenders)}`).toEqual([]);
        expect.soft(att.smallTargets, `sheet + target<44 ${noteList('', att.smallTargets)}`).toEqual([]);
        expect.soft(att.scroll.html.sw).toBeLessThanOrEqual(att.scroll.html.cw);
        const sheetBox = await page.locator(SHEET).boundingBox();
        expect.soft(sheetBox!.y + sheetBox!.height, `sheet + vượt đáy viewport box=${JSON.stringify(sheetBox)}`).toBeLessThanOrEqual(size.h + 1);
        expect.soft(sheetBox!.y, 'sheet + vượt đỉnh viewport').toBeGreaterThanOrEqual(-1);
        if (theme === 'dark') {
          const bg = await effectiveBackground(page, '.m-sheet');
          expect.soft(bg && luminance(bg), `nền sheet + (Tối) ${bg}`).toBeLessThan(0.35);
          expect.soft(await findLightBlocks(page, '.m-sheet', 3000), 'khối sáng trong sheet + Tối').toEqual([]);
        }
        await page.keyboard.press('Escape');
        await page.locator(SHEET).waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);

        await page.locator('.is-mobile .ai-btn').click();
        await page.locator('.m-sheet:visible .m-ai__text').waitFor({ timeout: 10_000 });
        await settleSheet(page);
        const ai = await audit(page, '.m-sheet', ['.m-sheet']);
        expect.soft(ai.offenders, `sheet AI offenders ${noteList('', ai.offenders)}`).toEqual([]);
        expect.soft(ai.smallTargets, `sheet AI target<44 ${noteList('', ai.smallTargets)}`).toEqual([]);
        expect.soft(ai.scroll.html.sw).toBeLessThanOrEqual(ai.scroll.html.cw);
        const aiBox = await page.locator(SHEET).boundingBox();
        expect.soft(aiBox!.y + aiBox!.height, 'sheet AI vượt đáy viewport').toBeLessThanOrEqual(size.h + 1);
        // nút "Áp vào nháp" phải nằm trong màn hình và bấm được
        const applyBox = await page.locator('.m-sheet:visible [data-action="apply"]').boundingBox();
        expect.soft(applyBox && applyBox.y + applyBox.height, 'nút Áp vào nháp trong màn hình').toBeLessThanOrEqual(size.h + 1);
        if (theme === 'dark') {
          const bg = await effectiveBackground(page, '.m-sheet');
          expect.soft(bg && luminance(bg), `nền sheet AI (Tối) ${bg}`).toBeLessThan(0.35);
        }
        expect(mock.consoleErrors.filter(e => !/Failed to load resource|net::ERR|socket/i.test(e)), 'lỗi console/pageerror').toEqual([]);
      });
    }
  }
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// 2. Điều hướng: chọn → /chat/:id, back, bộ lọc + scrollTop giữ nguyên, deep link cold
// ──────────────────────────────────────────────────────────────────────────────────────────────
test.describe('Điều hướng chat', () => {
  test('chọn hội thoại → /chat/:id; back → /chat; bộ lọc + scrollTop inbox giữ nguyên', async ({ page }) => {
    const mock = await boot(page);
    await page.goto('/chat');
    await waitInbox(page);
    // Bật bộ lọc "Chưa trả lời"
    await page.getByRole('button', { name: 'Mở bộ lọc' }).click();
    await page.locator('.m-sheet:visible label', { hasText: 'Chưa trả lời' }).click();
    await page.locator('.m-sheet:visible [data-action="apply"]').click();
    await expect(page.locator('.m-inbox__chip', { hasText: 'Chưa trả lời' })).toBeVisible();
    await expect.poll(() => mock.find('GET', /^\/conversations$/).some(r => r.query.unreplied === 'true')).toBe(true);
    await page.waitForTimeout(500);
    // Khi lọc "Chưa trả lời" mọi hàng đều có cờ "Chưa trả lời" (cao thêm 19px): đợi đủ 15 cờ rồi mới đo (WebKit render muộn hơn Chromium)
    await expect(page.locator('.m-conv-row__flag--wait')).toHaveCount(15, { timeout: 10_000 });
    // Đợi font + bố cục lắng (font tải muộn làm hàng cao thêm 19px -> WebKit tự neo lại scrollTop, không liên quan điều hướng)
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(async () => { const a = await page.locator('.m-inbox__list').evaluate(el => el.scrollHeight); await page.waitForTimeout(250); return a === (await page.locator('.m-inbox__list').evaluate(el => el.scrollHeight)); }).toBe(true);
    const rowsBefore = await page.locator('.m-conv-row').count();
    expect(rowsBefore).toBe(15);

    const scroller = page.locator('.m-inbox__list');
    await scroller.evaluate(el => { el.scrollTop = 520; });
    await page.waitForTimeout(200);
    const topBefore = await scroller.evaluate(el => el.scrollTop);
    expect(topBefore).toBeGreaterThan(300);
    // Hàng thứ 5 đang trong khung nhìn -> mở nó
    const target = page.locator('.m-conv-row').nth(6);
    const targetName = (await target.locator('.m-conv-row__name').innerText()).trim();
    await target.scrollIntoViewIfNeeded();
    const topBeforeClick = await scroller.evaluate(el => el.scrollTop);
    const heightsBefore = await page.locator('.m-conv-row').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().height)));
    const listBefore = await scroller.evaluate(el => ({ sh: el.scrollHeight, ch: el.clientHeight }));
    await target.click();
    await waitThread(page);
    const convId = new URL(page.url()).pathname.split('/').pop();
    expect(new URL(page.url()).pathname).toMatch(/^\/chat\/qa-conv-\d+$/);
    expect(convId).toBeTruthy();
    // Inbox còn mounted (ẩn + inert), không nhân đôi request danh sách chỉ vì mở thread
    await expect(page.locator('.m-inbox')).toHaveAttribute('inert', '');
    expect(await page.getByText(targetName, { exact: false }).count()).toBeGreaterThan(0);

    await page.locator('.m-thread-back').click();
    // Đợt D: bộ lọc "Chưa trả lời" được giữ trên URL (?filter=unreplied) nên quay lại từ thread về /chat?filter=unreplied (trước đây /chat).
    await expect(page).toHaveURL(/\/chat(\?filter=unreplied)?$/);
    await expect(page.locator('.m-inbox')).not.toHaveAttribute('inert', '');
    await expect(page.locator('.m-inbox__chip', { hasText: 'Chưa trả lời' })).toBeVisible();
    expect(await page.locator('.m-conv-row').count()).toBe(rowsBefore);
    await page.waitForTimeout(300);
    const topAfter = await scroller.evaluate(el => el.scrollTop);
    const heightsAfter = await page.locator('.m-conv-row').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().height)));
    const listAfter = await scroller.evaluate(el => ({ sh: el.scrollHeight, ch: el.clientHeight }));
    const diffIdx = heightsBefore.map((h, i) => (h !== heightsAfter[i] ? `#${i}:${h}->${heightsAfter[i]}` : '')).filter(Boolean);
    expect(Math.abs(topAfter - topBeforeClick), `scrollTop trước ${topBeforeClick} sau ${topAfter}; list ${JSON.stringify(listBefore)}->${JSON.stringify(listAfter)}; hàng đổi cao: ${diffIdx.join(',') || 'không'}`).toBeLessThanOrEqual(2);
  });

  test('deep link /chat/X (cold) mở đúng thread; GET messages của X đúng 1 lần', async ({ page }) => {
    const mock = await boot(page);
    await page.goto('/chat/qa-conv-2');
    await waitThread(page);
    await expect(page.locator('.mobile-chat .chat-header')).toContainText('Khách Giả B');
    await page.waitForTimeout(1500);
    expect(mock.count('GET', /^\/conversations\/qa-conv-2\/messages$/), 'GET messages X').toBe(1);
    expect(mock.count('GET', /^\/conversations\/qa-conv-2$/), 'GET detail X').toBe(1);
    expect(mock.count('POST', /^\/conversations\/qa-conv-2\/mark-read$/), 'mark-read X').toBe(1);
    // Không tải thread của hội thoại khác
    expect(mock.count('GET', /^\/conversations\/qa-conv-(?!2\/|2$)\d+\/messages$/)).toBe(0);
    // Tabbar ẩn ở thread
    await expect(page.locator('.m-tabbar')).toHaveCount(0);
  });

  test('back khi không có lịch sử nội bộ (deep link) → /chat (replace, không rời app)', async ({ page }) => {
    await boot(page);
    await page.goto('/chat/qa-conv-3');
    await waitThread(page);
    await page.locator('.m-thread-back').click();
    await expect(page).toHaveURL(/\/chat$/);
    await expect(page.locator('.m-inbox')).not.toHaveAttribute('inert', '');
    expect(page.url()).not.toContain('about:blank');
  });

  test('deep link tới id không tồn tại → trạng thái lỗi + nút Thử lại + quay lại', async ({ page }) => {
    await boot(page);
    await page.goto('/chat/qa-conv-khong-co');
    await expect(page.getByText('Không mở được hội thoại')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Thử lại/ })).toBeVisible();
    await page.locator('.m-thread-back').click();
    await expect(page).toHaveURL(/\/chat$/);
  });

  test('link cũ /chat?conv=X chuẩn hóa sang /chat/X', async ({ page }) => {
    await boot(page);
    await page.goto('/chat?conv=qa-conv-4');
    await waitThread(page);
    await expect(page).toHaveURL(/\/chat\/qa-conv-4$/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// 3. Loading / error / empty / offline của inbox
// ──────────────────────────────────────────────────────────────────────────────────────────────
test.describe('Trạng thái inbox', () => {
  test('loading → ready', async ({ page }) => {
    await boot(page, { convDelayMs: 1500 });
    await page.goto('/chat');
    await expect(page.getByText('Đang tải hội thoại…')).toBeVisible({ timeout: 10_000 });
    await waitInbox(page);
  });
  test('rỗng', async ({ page }) => {
    await boot(page, { convEmpty: true });
    await page.goto('/chat');
    await expect(page.getByText('Chưa có hội thoại nào')).toBeVisible({ timeout: 15_000 });
  });
  test('lỗi máy chủ: không hiện "rỗng" giả', async ({ page }) => {
    await boot(page, { convFail: true });
    await page.goto('/chat');
    await page.waitForTimeout(2500);
    // Ghi nhận hành vi thực tế: trạng thái nào được hiển thị khi API 500?
    const text = await page.locator('.m-inbox__list').innerText();
    test.info().annotations.push({ type: 'inbox-500', description: text.replace(/\s+/g, ' ').slice(0, 160) });
    expect(text, 'API 500 không được báo là "Chưa có hội thoại nào"').not.toContain('Chưa có hội thoại nào');
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// 4. Nháp theo hội thoại + gửi (payload)
// ──────────────────────────────────────────────────────────────────────────────────────────────
test.describe('Nháp và gửi', () => {
  test('nháp A không sang B; quay lại A nháp còn; gửi ở B → POST đúng conv + payload', async ({ page }) => {
    const mock = await boot(page);
    await page.goto('/chat');
    await waitInbox(page);
    await openRow(page, 'Khách Giả A');
    await page.locator(EDITOR).click();
    await page.keyboard.type('Nháp dành cho khách A');
    await expect(page.locator(EDITOR)).toContainText('Nháp dành cho khách A');
    await page.locator('.m-thread-back').click();
    await expect(page).toHaveURL(/\/chat$/);
    await openRow(page, 'Khách Giả B');
    await expect(page).toHaveURL(/qa-conv-2$/);
    expect((await page.locator(EDITOR).innerText()).trim(), 'ô soạn của B phải rỗng').toBe('');
    // quay lại A
    await page.locator('.m-thread-back').click();
    await openRow(page, 'Khách Giả A');
    await expect(page.locator(EDITOR)).toContainText('Nháp dành cho khách A');
    // gửi ở B
    await page.locator('.m-thread-back').click();
    await openRow(page, 'Khách Giả B');
    await page.locator(EDITOR).click();
    await page.keyboard.type('Xin chào B, đây là tin thử');
    await page.locator('.is-mobile .send-btn').click();
    await expect.poll(() => mock.find('POST', /^\/conversations\/qa-conv-2\/messages$/).length).toBe(1);
    const posts = mock.find('POST', /\/messages$/);
    expect(posts).toHaveLength(1);
    expect(posts[0].path).toBe('/conversations/qa-conv-2/messages');
    expect(posts[0].body).toEqual({ content: 'Xin chào B, đây là tin thử' });
    expect(mock.count('POST', /^\/conversations\/qa-conv-1\/messages$/), 'nháp A không bị gửi').toBe(0);
    await expect(page.locator('.mobile-chat .msg-bubble-wrap', { hasText: 'Xin chào B' })).toHaveCount(1);
    // nháp B được xóa sau khi gửi
    await expect.poll(async () => (await page.locator(EDITOR).innerText()).trim()).toBe('');
  });

  test('payload gửi mobile = payload gửi desktop (cùng mock, cùng nội dung)', async ({ page, browser }) => {
    const text = 'Nội dung so sánh payload';
    // mobile
    const mobile = await boot(page);
    await page.goto('/chat/qa-conv-2');
    await waitThread(page);
    await page.locator(EDITOR).click();
    await page.keyboard.type(text);
    await page.locator('.is-mobile .send-btn').click();
    await expect.poll(() => mobile.find('POST', /\/messages$/).length).toBe(1);
    // desktop 1440
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh' });
    const dp = await ctx.newPage();
    const desktop = await installChatMocks(dp);
    await dp.goto('/chat/qa-conv-2');
    const desktopEditor = dp.locator('.message-thread:not(.is-mobile) [contenteditable="true"]').first();
    await desktopEditor.waitFor({ state: 'visible', timeout: 20_000 });
    await desktopEditor.click();
    await dp.keyboard.type(text);
    await dp.keyboard.press('Enter');
    await expect.poll(() => desktop.find('POST', /\/messages$/).length, { timeout: 10_000 }).toBe(1);
    expect(mobile.find('POST', /\/messages$/)[0].body).toEqual(desktop.find('POST', /\/messages$/)[0].body);
    expect(mobile.find('POST', /\/messages$/)[0].path).toBe(desktop.find('POST', /\/messages$/)[0].path);
    await ctx.close();
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// 5. "Tin mới ↓" + một socket handler + scroll anchor
// ──────────────────────────────────────────────────────────────────────────────────────────────
test.describe('Cuộn và realtime', () => {
  test('đang đọc tin cũ: tin đến KHÔNG kéo đáy, hiện pill; bấm pill → về đáy', async ({ page }) => {
    const mock = await boot(page);
    await page.goto('/chat/qa-conv-1');
    await waitThread(page);
    await expect.poll(() => mock.ws.opened).toBeGreaterThan(0);
    const msgs = page.locator('.is-mobile .messages');
    // Đang ở đáy khi mở
    const atBottom = await msgs.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop);
    expect(atBottom).toBeLessThan(8);
    await msgs.evaluate(el => { el.scrollTop = 200; });
    await page.waitForTimeout(300);
    const topBefore = await msgs.evaluate(el => el.scrollTop);
    const before = await page.locator('.msg-bubble-wrap').count();
    mock.inbound('qa-conv-1', 'Tin đến khi đang đọc cũ');
    await expect(page.locator('.msg-bubble-wrap')).toHaveCount(before + 1);
    await expect(page.locator('.new-msg-pill')).toBeVisible();
    await expect(page.locator('.new-msg-pill')).toContainText('Tin mới (1)');
    const topAfter = await msgs.evaluate(el => el.scrollTop);
    expect(Math.abs(topAfter - topBefore), 'không kéo đáy').toBeLessThanOrEqual(2);
    // pill nằm ngay trên composer và trong màn hình, đủ lớn để bấm
    const pill = await page.locator('.new-msg-pill').boundingBox();
    const comp = await page.locator('.is-mobile .input-area').boundingBox();
    expect(pill!.y + pill!.height).toBeLessThanOrEqual(comp!.y + 4);
    expect(pill!.height).toBeGreaterThanOrEqual(36);
    await page.locator('.new-msg-pill').click();
    await expect(page.locator('.new-msg-pill')).toHaveCount(0);
    await expect.poll(() => msgs.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(8);
    await expect(page.locator('.msg-bubble-wrap').last()).toContainText('Tin đến khi đang đọc cũ');
  });

  test('đang ở đáy: tin đến tự cuộn, không pill', async ({ page }) => {
    const mock = await boot(page);
    await page.goto('/chat/qa-conv-1');
    await waitThread(page);
    await expect.poll(() => mock.ws.opened).toBeGreaterThan(0);
    const before = await page.locator('.msg-bubble-wrap').count();
    mock.inbound('qa-conv-1', 'Tin đến khi đang ở đáy');
    await expect(page.locator('.msg-bubble-wrap')).toHaveCount(before + 1);
    await page.waitForTimeout(600);
    await expect(page.locator('.new-msg-pill')).toHaveCount(0);
    const msgs = page.locator('.is-mobile .messages');
    expect(await msgs.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(8);
  });

  test('tin của chính mình vừa gửi khi đang đọc cũ → kéo đáy (không pill)', async ({ page }) => {
    await boot(page);
    await page.goto('/chat/qa-conv-1');
    await waitThread(page);
    const msgs = page.locator('.is-mobile .messages');
    await msgs.evaluate(el => { el.scrollTop = 100; });
    await page.waitForTimeout(200);
    await page.locator(EDITOR).click();
    await page.keyboard.type('Tin tôi gửi khi đang đọc cũ');
    await page.locator('.is-mobile .send-btn').click();
    await expect(page.locator('.msg-bubble-wrap', { hasText: 'Tin tôi gửi khi đang đọc cũ' })).toHaveCount(1);
    await expect.poll(() => msgs.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(8);
  });

  test('không nhân socket handler: mount/unmount nhiều lần → mỗi tin đến chỉ thêm 1 bong bóng; WS mở = đóng + 1', async ({ page }) => {
    const mock = await boot(page);
    await page.goto('/chat');
    await waitInbox(page);
    for (let i = 0; i < 3; i++) {
      await page.locator('.m-tabbar a[href="/account"]').click();
      await expect(page).toHaveURL(/\/account$/);
      await page.waitForTimeout(400);
      await page.locator('.m-tabbar a[href="/chat"]').click();
      await waitInbox(page);
    }
    await expect.poll(() => mock.ws.live.length, { timeout: 8000 }).toBe(1);
    const opened = mock.ws.opened;
    const closed = mock.ws.closed;
    test.info().annotations.push({ type: 'ws', description: `opened=${opened} closed=${closed} live=${mock.ws.live.length}` });
    expect(opened - closed, 'số socket còn sống').toBe(1);
    await openRow(page, 'Khách Giả A');
    const before = await page.locator('.msg-bubble-wrap').count();
    mock.inbound('qa-conv-1', 'Một tin duy nhất');
    await expect(page.locator('.msg-bubble-wrap')).toHaveCount(before + 1);
    await page.waitForTimeout(800);
    expect(await page.locator('.msg-bubble-wrap').count()).toBe(before + 1);
    expect(await page.locator('.msg-bubble-wrap', { hasText: 'Một tin duy nhất' }).count()).toBe(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// 6. AI
// ──────────────────────────────────────────────────────────────────────────────────────────────
test.describe('Gợi ý AI', () => {
  test('gợi ý về KHÔNG tự điền; "Áp vào nháp" điền chữ; KHÔNG POST messages', async ({ page }) => {
    const mock = await boot(page);
    await page.goto('/chat/qa-conv-2');
    await waitThread(page);
    await page.locator('.is-mobile .ai-btn').click();
    await expect(page.locator('.m-sheet:visible .m-ai__text')).toBeVisible({ timeout: 10_000 });
    expect(mock.count('POST', /^\/ai\/suggest$/)).toBe(1);
    expect(mock.find('POST', /^\/ai\/suggest$/)[0].body).toEqual({ conversationId: 'qa-conv-2' });
    // Gợi ý đã về nhưng ô soạn vẫn rỗng
    expect((await page.locator(EDITOR).innerText()).trim()).toBe('');
    await page.waitForTimeout(800);
    expect((await page.locator(EDITOR).innerText()).trim(), 'không tự điền khi gợi ý về').toBe('');
    // Đóng sheet: vẫn rỗng, nháp không đổi
    await page.keyboard.press('Escape');
    await page.locator(SHEET).waitFor({ state: 'detached', timeout: 5000 });
    expect((await page.locator(EDITOR).innerText()).trim()).toBe('');
    // Mở lại, áp vào nháp
    await page.locator('.is-mobile .ai-btn').click();
    await expect(page.locator('.m-sheet:visible [data-action="apply"]')).toBeVisible();
    await page.locator('.m-sheet:visible [data-action="apply"]').click();
    await expect(page.locator(EDITOR)).toContainText('Dạ em gửi anh/chị bảng giá mẫu');
    await expect(page.locator(SHEET)).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(mock.count('POST', /\/messages$/), 'áp gợi ý không được gửi tin').toBe(0);
  });

  test('đã có nháp: hỏi xác nhận "Thay nháp hiện tại?"; Giữ nháp → không đổi; vẫn 0 POST messages', async ({ page }) => {
    const mock = await boot(page);
    await page.goto('/chat/qa-conv-2');
    await waitThread(page);
    await page.locator(EDITOR).click();
    await page.keyboard.type('Nháp đang soạn dở');
    await page.locator('.is-mobile .ai-btn').click();
    await expect(page.locator('.m-sheet:visible [data-action="apply"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.m-sheet:visible [data-action="append"]')).toBeVisible();
    await page.locator('.m-sheet:visible [data-action="apply"]').click();
    await expect(page.getByText('Thay nháp hiện tại?').first()).toBeVisible();
    await page.waitForTimeout(900);
    // Hộp xác nhận phải bấm được: phần tử trên cùng tại tâm nút "Giữ nháp" không được là sheet AI (LỖI H-1 đợt C nếu sheet che).
    const topAtKeep = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => x.textContent?.trim() === 'Giữ nháp');
      if (!b) return 'không-thấy-nút';
      const r = b.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return top?.closest('.m-sheet') ? 'sheet-AI-che-hộp-xác-nhận' : (top === b || b.contains(top) ? 'ok' : `khác:${top?.className}`);
    });
    expect.soft(topAtKeep, 'nút "Giữ nháp" của hộp xác nhận có bị sheet AI che không').toBe('ok');
    await page.getByRole('button', { name: 'Giữ nháp' }).click({ force: true });
    await expect(page.locator(EDITOR)).toContainText('Nháp đang soạn dở');
    await expect(page.locator(EDITOR)).not.toContainText('bảng giá mẫu');
    expect(mock.count('POST', /\/messages$/)).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// 7. Nút + : 5 lựa chọn, accept/capture, upload, lỗi, offline
// ──────────────────────────────────────────────────────────────────────────────────────────────
test.describe('Nút + / đính kèm', () => {
  test('5 lựa chọn đúng nhãn; input đúng accept/capture/multiple', async ({ page }) => {
    await boot(page);
    await page.goto('/chat/qa-conv-2');
    await waitThread(page);
    await page.locator('.is-mobile .attach-plus-btn').click();
    const labels = await page.locator('.m-sheet:visible .m-attach__label').allInnerTexts();
    expect(labels).toEqual(['Ảnh', 'Chụp ảnh', 'Video', 'Tài liệu', 'Kho media']);
    const attrs = await page.locator('.m-sheet input.m-attach__input').evaluateAll(els => els.map(e => ({
      kind: e.getAttribute('data-kind'), accept: e.getAttribute('accept'), capture: e.getAttribute('capture'), multiple: (e as HTMLInputElement).multiple, type: (e as HTMLInputElement).type,
    })));
    expect(attrs).toEqual([
      { kind: 'image', accept: 'image/*', capture: null, multiple: true, type: 'file' },
      { kind: 'camera', accept: 'image/*', capture: 'environment', multiple: false, type: 'file' },
      { kind: 'video', accept: 'video/mp4,video/quicktime,video/webm', capture: null, multiple: false, type: 'file' },
      { kind: 'document', accept: '.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.zip,.gz,.rar,.tar', capture: null, multiple: true, type: 'file' },
    ]);
    await expect(page.locator('.m-sheet:visible .m-attach__target')).toContainText('Nick Giả');
  });

  test('chọn ảnh → POST /conversations/:id/attachments, field "files", rồi tải lại tin', async ({ page }) => {
    const mock = await boot(page);
    await page.goto('/chat/qa-conv-2');
    await waitThread(page);
    await page.locator('.is-mobile .attach-plus-btn').click();
    const beforeGet = mock.count('GET', /^\/conversations\/qa-conv-2\/messages$/);
    await page.locator('.m-sheet input[data-kind="image"]').setInputFiles({ name: 'anh-gia.png', mimeType: 'image/png', buffer: PNG_1x1 });
    await expect.poll(() => mock.count('POST', /^\/conversations\/qa-conv-2\/attachments$/)).toBe(1);
    const req = mock.find('POST', /attachments$/)[0];
    expect(req.contentType).toContain('multipart/form-data');
    expect(req.rawText).toContain('name="files"');
    expect(req.rawText).toContain('filename="anh-gia.png"');
    await expect(page.getByText('Đã gửi 1 tệp').first()).toBeVisible({ timeout: 8000 });
    await expect.poll(() => mock.count('GET', /^\/conversations\/qa-conv-2\/messages$/)).toBeGreaterThan(beforeGet);
    expect(mock.count('POST', /\/messages$/), 'upload không đi qua /messages').toBe(0);
  });

  test('HEIC / sai loại bị từ chối bằng tiếng Việt, KHÔNG gọi API', async ({ page }) => {
    const mock = await boot(page);
    await page.goto('/chat/qa-conv-2');
    await waitThread(page);
    await page.locator('.is-mobile .attach-plus-btn').click();
    await page.locator('.m-sheet input[data-kind="image"]').setInputFiles({ name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: PNG_1x1 });
    await expect(page.locator('.toast.error').first()).toBeVisible({ timeout: 5000 });
    const msg = await page.locator('.toast.error .toast-msg').first().innerText();
    test.info().annotations.push({ type: 'heic-message', description: msg });
    expect(msg).toMatch(/[ạăâêôơưđáàảãéèíìóòúùý]/i);
    await page.waitForTimeout(500);
    expect(mock.count('POST', /attachments$/)).toBe(0);
  });

  const ERRORS: Array<[number, string | undefined, RegExp]> = [
    [413, undefined, /Tệp quá lớn/],
    [415, undefined, /Định dạng tệp chưa được hỗ trợ/],
    [429, undefined, /Gửi quá nhanh/],
    [403, 'PRIVACY_LOCKED', /Riêng tư/],
    [409, undefined, /Nick Zalo này đã bị xóa/],
  ];
  for (const [status, code, re] of ERRORS) {
    test(`mock ${status}${code ? ' ' + code : ''} → thông báo tiếng Việt`, async ({ page }) => {
      const mock = await boot(page, { attachmentStatus: { status, code } });
      await page.goto('/chat/qa-conv-2');
      await waitThread(page);
      await page.locator('.is-mobile .attach-plus-btn').click();
      await page.locator('.m-sheet input[data-kind="image"]').setInputFiles({ name: 'anh-gia.png', mimeType: 'image/png', buffer: PNG_1x1 });
      await expect.poll(() => mock.count('POST', /attachments$/)).toBe(1);
      await expect(page.locator('.toast.error .toast-msg', { hasText: re }).first()).toBeVisible({ timeout: 8000 });
    });
  }

  test('offline (context.setOffline) → sheet khóa có lý do; nút không bấm được', async ({ page, context }) => {
    const mock = await boot(page);
    await page.goto('/chat/qa-conv-2');
    await waitThread(page);
    const manual = await setNetwork(page, context, false);
    test.info().annotations.push({ type: 'offline-mode', description: manual ? 'setOffline + bổ sung thủ công navigator.onLine/sự kiện' : 'setOffline đủ (onLine=false + sự kiện offline)' });
    await page.locator('.is-mobile .attach-plus-btn').click();
    await expect(page.locator('.m-sheet:visible .m-attach__lock')).toContainText('Đang mất kết nối');
    for (const b of await page.locator('.m-sheet:visible .m-attach__item').all()) await expect(b).toBeDisabled();
    await setNetwork(page, context, true);
    expect(mock.count('POST', /attachments$/)).toBe(0);
  });

  test('Kho media mở sheet riêng', async ({ page }) => {
    await boot(page);
    await page.goto('/chat/qa-conv-2');
    await waitThread(page);
    await page.locator('.is-mobile .attach-plus-btn').click();
    await page.locator('.m-sheet:visible .m-attach__item[data-kind="library"]').click();
    await page.waitForTimeout(800);
    expect(await page.locator(SHEET).count()).toBeGreaterThan(0);
    await expect(page.locator('.m-attach__item')).toHaveCount(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// 8. Offline: gửi văn bản xếp hàng, tự gửi lại đúng hội thoại
// ──────────────────────────────────────────────────────────────────────────────────────────────
test.describe('Hàng đợi offline', () => {
  test('offline gửi văn bản → "Đang chờ gửi" + Hủy; Hủy → không gửi', async ({ page, context }) => {
    const mock = await boot(page);
    await page.goto('/chat/qa-conv-2');
    await waitThread(page);
    const manual = await setNetwork(page, context, false);
    test.info().annotations.push({ type: 'offline-mode', description: manual ? 'bổ sung thủ công' : 'setOffline đủ' });
    await expect(page.getByText('Mất kết nối — tin đang chờ sẽ tự gửi khi có mạng')).toBeVisible();
    await page.locator(EDITOR).click();
    await page.keyboard.type('Tin gửi lúc mất mạng');
    await page.locator('.is-mobile .send-btn').click();
    const strip = page.locator('.m-pending__item');
    await expect(strip).toHaveCount(1);
    await expect(strip).toContainText('Tin gửi lúc mất mạng');
    await expect(strip).toContainText('Đang chờ gửi');
    await expect(strip.locator('[data-action="cancel"]')).toBeVisible();
    const cancel = await strip.locator('[data-action="cancel"]').boundingBox();
    expect(Math.min(cancel!.width, cancel!.height), 'nút Hủy >=44px').toBeGreaterThanOrEqual(44);
    await strip.locator('[data-action="cancel"]').click();
    await expect(page.locator('.m-pending__item')).toHaveCount(0);
    await setNetwork(page, context, true);
    await page.waitForTimeout(1500);
    expect(mock.count('POST', /\/messages$/), 'đã hủy thì không gửi').toBe(0);
  });

  test('online lại → POST đúng convId lúc bấm dù đang mở hội thoại khác; không gửi trùng; banner câu chữ mới', async ({ page, context }) => {
    const mock = await boot(page);
    await page.goto('/chat');
    await waitInbox(page);
    // Mở B trước để có cache tin, rồi vào A
    await openRow(page, 'Khách Giả B');
    await page.locator('.m-thread-back').click();
    await openRow(page, 'Khách Giả A');
    const manual = await setNetwork(page, context, false);
    test.info().annotations.push({ type: 'offline-mode', description: manual ? 'bổ sung thủ công' : 'setOffline đủ' });
    await expect(page.getByText('Mất kết nối — tin đang chờ sẽ tự gửi khi có mạng')).toBeVisible();
    await page.locator(EDITOR).click();
    await page.keyboard.type('Tin chờ của khách A');
    await page.locator('.is-mobile .send-btn').click();
    await expect(page.locator('.m-pending__item')).toHaveCount(1);
    expect(mock.count('POST', /\/messages$/)).toBe(0);
    // Sang hội thoại B trong lúc offline
    await page.locator('.m-thread-back').click();
    await openRow(page, 'Khách Giả B');
    await expect(page).toHaveURL(/qa-conv-2$/);
    await expect(page.locator('.m-pending__item'), 'tin chờ của A không hiện ở B').toHaveCount(0);
    // Online lại
    const manualOn = await setNetwork(page, context, true);
    test.info().annotations.push({ type: 'online-mode', description: manualOn ? 'bổ sung thủ công' : 'setOffline(false) đủ' });
    await expect.poll(() => mock.find('POST', /\/messages$/).length, { timeout: 10_000 }).toBe(1);
    const sent = mock.find('POST', /\/messages$/)[0];
    expect(sent.path).toBe('/conversations/qa-conv-1/messages');
    expect(sent.body).toEqual({ content: 'Tin chờ của khách A' });
    await page.waitForTimeout(1500);
    expect(mock.count('POST', /\/messages$/), 'không gửi trùng').toBe(1);
    expect(mock.count('POST', /^\/conversations\/qa-conv-2\/messages$/)).toBe(0);
    await expect(page.getByText('Mất kết nối — tin đang chờ sẽ tự gửi khi có mạng')).toHaveCount(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// 8b. Privacy
// ──────────────────────────────────────────────────────────────────────────────────────────────
test.describe('Privacy (nick Riêng tư của người khác)', () => {
  test('inbox ẩn xem trước; thread khóa composer, không lộ nội dung', async ({ page }) => {
    const mock = await boot(page, { privateConvs: ['qa-conv-3'] });
    await page.goto('/chat');
    await waitInbox(page);
    const row = page.locator('.m-conv-row', { hasText: 'Khách Giả 3' }).first();
    await expect(row).toContainText('Nội dung riêng tư');
    await expect(row).not.toContainText('Tin nhắn mẫu số 3');
    await row.click();
    await page.locator('.mobile-chat .message-thread.is-mobile').waitFor({ state: 'visible' });
    await page.waitForTimeout(800);
    await expect(page.locator('.is-mobile .editor-lock-overlay')).toBeVisible();
    await expect(page.locator('.is-mobile .editor-lock-pill')).toContainText('Riêng tư');
    expect(await page.locator('.mobile-chat').innerText()).not.toContain('Khách hỏi câu số');
    // Không gửi được: bấm vào vùng khóa không tạo POST
    await page.locator('.is-mobile .editor-lock-overlay').click({ force: true });
    await page.waitForTimeout(600);
    expect(mock.count('POST', /\/messages$/)).toBe(0);
    // Bấm vào vùng khóa mở hộp thoại mở khóa (desktop y như vậy) -> ghi lại nội dung, rồi đóng
    const dlg = (await page.locator('.v-overlay--active .v-overlay__content').allInnerTexts()).join(' | ').replace(/\s+/g, ' ').slice(0, 140);
    test.info().annotations.push({ type: 'privacy-lock-click', description: dlg || '(không có hộp thoại)' });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    // Ghi nhận: sheet + có bị khóa vì Riêng tư không (backend chặn 403 PRIVACY_LOCKED, mock 403 đã test ở nhóm đính kèm)
    await page.locator('.is-mobile .attach-plus-btn').click();
    const disabled = await page.locator('.m-sheet:visible .m-attach__item').first().isDisabled();
    test.info().annotations.push({ type: 'privacy-attach-sheet', description: `sheet + với nick Riêng tư của người khác: ${disabled ? 'bị khóa' : 'KHÔNG khóa phía client (chỉ dựa vào backend 403)'}` });
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// 9. 768+: không dựng mobile
// ──────────────────────────────────────────────────────────────────────────────────────────────
test.describe('768 và lớn hơn không dựng mobile', () => {
  for (const [w, h] of [[768, 1024], [1024, 768], [1440, 900]] as const) {
    test(`${w}x${h}: chat desktop`, async ({ page }) => {
      await boot(page, {}, { width: w, height: h });
      await page.goto('/chat');
      await page.waitForTimeout(2500);
      expect(await page.locator(APP).count(), 'không có .m-shell').toBe(0);
      expect(await page.locator('.m-tabbar').count()).toBe(0);
      expect(await page.locator('.mobile-chat').count()).toBe(0);
      const sw = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      test.info().annotations.push({ type: 'scroll', description: `${w}: sw=${sw[0]} cw=${sw[1]}` });
    });
  }
});

export { ADMIN };
