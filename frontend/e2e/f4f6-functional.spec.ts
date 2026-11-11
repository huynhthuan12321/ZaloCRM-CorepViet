// F4/F6: mock APIs only; no backend or customer data. Chromium/WebKit desktop engines.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { installCrmMocks } from './helpers/mock-crm';
import { routerPush } from './f2f3-helpers';
import { setTheme } from './helpers/mock-chat';
const ORIGIN = `http://localhost:${process.env.D_APP_PORT ?? 4218}`;
const EDITOR = '.message-thread .input-editor [contenteditable="true"]';
async function boot(browser: Browser, mobile = false, dark = false) {
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1, serviceWorkers: 'block', locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-11-07T10:00:00+07:00'));
  const mock = await installCrmMocks(page);
  await page.route('**/api/v1/privacy/status', r => r.fulfill({ json: { hasPin: false, lockedUntil: null, activeSessionCount: 0, activeSessions: [] } }));
  await setTheme(page, dark ? 'dark' : 'light');
  return { ctx, page, mock };
}
async function chat(page: Page, id: number) {
  await routerPush(page, `/chat/qa-conv-${id}`);
  await expect(page.locator(EDITOR)).toBeVisible();
  await expect(page.locator('.msg-bubble-wrap').first()).toBeVisible();
  await page.waitForTimeout(350);
}
// Compare document markup, excluding TipTap's focus-only placeholder decorations.
async function documentMarkup(page: Page) {
  return page.locator(EDITOR).evaluate(el => {
    const copy = el.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('[data-placeholder]').forEach(p => { p.removeAttribute('data-placeholder'); p.classList.remove('is-empty', 'is-editor-empty'); if (!p.className) p.removeAttribute('class'); });
    return copy.innerHTML;
  });
}

test('F4 desktop A→B→A; send B clears B only; reload loses RAM', async ({ browser }) => {
  const { ctx, page, mock } = await boot(browser);
  await page.goto(`${ORIGIN}/chat/qa-conv-1`);
  await expect(page.locator(EDITOR)).toBeVisible();
  await page.locator(EDITOR).fill('Nháp của A');
  await chat(page, 2);
  await expect(page.locator(EDITOR)).toHaveText('');
  await page.locator(EDITOR).fill('Tin gửi B');
  await page.locator(EDITOR).press('Enter');
  await expect.poll(() => mock.chat.requests.filter(r => r.method === 'POST' && r.path === '/conversations/qa-conv-2/messages').length).toBe(1);
  const body = mock.chat.requests.find(r => r.method === 'POST' && r.path === '/conversations/qa-conv-2/messages')!.body as Record<string, unknown>;
  expect(body.content).toBe('Tin gửi B');
  await expect(page.locator(EDITOR)).toHaveText('');
  await chat(page, 1);
  await expect(page.locator(EDITOR)).toHaveText('Nháp của A');
  await chat(page, 2); await expect(page.locator(EDITOR)).toHaveText('');
  await chat(page, 1);
  page.on('dialog', d => d.accept());
  await page.reload();
  await expect(page.locator(EDITOR)).toBeVisible();
  await expect(page.locator(EDITOR)).toHaveText('');
  await ctx.close();
});

test('F4 desktop rich text/mention/list restored; send payload retains styles and mentions', async ({ browser }) => {
  const { ctx, page, mock } = await boot(browser);
  await page.goto(`${ORIGIN}/chat/qa-conv-1`); await expect(page.locator(EDITOR)).toBeVisible();
  await page.locator(EDITOR).focus();
  await page.locator(EDITOR).evaluate(el => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/html', '<p><strong>Chào </strong><span data-type="mention" data-id="qa-peer" data-label="Khách Giả">@Khách Giả</span></p><ul><li><p><em>giá</em></p></li></ul>');
    el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
  });
  await expect(page.locator(`${EDITOR} [data-type="mention"]`)).toHaveCount(1);
  const originalHtml = await documentMarkup(page);
  const originalText = await page.locator(EDITOR).innerText();
  await chat(page, 2); await page.locator(EDITOR).fill(originalText);
  await page.waitForTimeout(100);
  const bMarkup = await documentMarkup(page);
  await chat(page, 1);
  expect(await documentMarkup(page)).toEqual(originalHtml);
  await page.locator('.message-thread .send-btn').click();
  await expect.poll(() => mock.chat.requests.filter(r => r.method === 'POST' && r.path === '/conversations/qa-conv-1/messages').length).toBe(1);
  const body = mock.chat.requests.find(r => r.method === 'POST' && r.path === '/conversations/qa-conv-1/messages')!.body as any;
  expect(body.content).toContain('Chào'); expect(body.content).toContain('giá');
  expect(body.styles.length).toBeGreaterThan(0); expect(body.mentions).toHaveLength(1);
  expect(body.mentions[0].uid ?? body.mentions[0].id).toBe('qa-peer');
  await chat(page, 2); expect(await documentMarkup(page)).toBe(bMarkup);
  await ctx.close();
});

test('F4 reply remains in A; B has no reply; restoring A sends its replyMessageId', async ({ browser }) => {
  const { ctx, page, mock } = await boot(browser);
  await page.goto(`${ORIGIN}/chat/qa-conv-1`); await expect(page.locator(EDITOR)).toBeVisible();
  await page.locator('.message-bubble').last().click({ button: 'right' });
  await page.getByText('Trả lời', { exact: true }).last().click();
  await page.locator(EDITOR).fill('Trả lời cho A');
  await expect(page.locator('.reply-preview-bar').first()).toBeVisible();
  await chat(page, 2);
  await expect(page.locator('.reply-preview-bar')).toHaveCount(0);
  await chat(page, 1);
  await expect(page.locator(EDITOR)).toHaveText('Trả lời cho A');
  await page.locator(EDITOR).press('Enter');
  await expect.poll(() => mock.chat.requests.filter(r => r.method === 'POST' && r.path === '/conversations/qa-conv-1/messages').length).toBe(1);
  expect((mock.chat.requests.find(r => r.method === 'POST' && r.path === '/conversations/qa-conv-1/messages')!.body as any).replyMessageId).toBeTruthy();
  await ctx.close();
});

for (const mobile of [false, true]) for (const dark of [false, true]) {
  test(`F6 ${mobile ? 'mobile' : 'desktop'} ${dark ? 'dark' : 'light'} profile403/404/500`, async ({ browser }) => {
    const { ctx, page } = await boot(browser, mobile, dark);
    for (const [status, message] of [[403, 'Bạn không có quyền xem khách này'], [404, 'Khách không tồn tại hoặc đã xóa'], [500, 'Không tải được hồ sơ khách']] as const) {
      await page.route(`**/api/v1/contacts/qa-denied-${status}**`, r => r.fulfill({ status, json: { error: 'qa-error' } }));
      await page.goto(`${ORIGIN}/contacts/qa-denied-${status}/profile`);
      await expect(page.getByText(message, { exact: false }).first()).toBeVisible();
      await expect(page.locator('.crm-profile__hero, .cp-hero')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    }
    await ctx.close();
  });
  test(`F6 ${mobile ? 'mobile' : 'desktop'} ${dark ? 'dark' : 'light'} conflict message and code-only; form stays`, async ({ browser }) => {
    const { ctx, page } = await boot(browser, mobile, dark);
    let codeOnly = false;
    const message = 'Khách giả đã có lịch "Gọi lại" lúc 11:30 ngày 07/11/2026 · phụ trách Sale giả. Chọn GIỜ khác hoặc xử lý lịch cũ trước.';
    await page.route('**/api/v1/appointments', async r => {
      if (r.request().method() !== 'POST') return r.fallback();
      return r.fulfill({ status: 409, json: { error: 'appointment_conflict', ...(codeOnly ? {} : { message }) } });
    });
    await page.goto(`${ORIGIN}/appointments`);
    if (mobile) {
      await page.locator('.crm-agenda__fab').click();
      await page.locator('.crm-appt input[type=search]').fill('Giả A');
      await page.locator('.crm-appt__result').first().click();
      await page.locator('#ap-title').fill('Lịch QA');
      await page.locator('#ap-date').fill('2026-11-07'); await page.locator('#ap-time').fill('11:30');
      await page.locator('.m-sheet__footer button[type=submit]').click();
      await expect(page.locator('.crm-appt__error')).toHaveText(message);
      codeOnly = true;
      await page.locator('.m-sheet__footer button[type=submit]').click();
      await expect(page.locator('.crm-appt__error')).toContainText('trùng giờ');
      await expect(page.locator('#ap-title')).toHaveValue('Lịch QA');
    } else {
      await page.getByRole('button', { name: 'Tạo nhắc hẹn', exact: false }).first().click();
      await page.locator('.editor .title-input').fill('Lịch QA');
      await page.locator('.editor').press('Control+Enter');
      await expect(page.locator('.editor .error-banner')).toHaveText(message);
      codeOnly = true;
      await page.locator('.editor').press('Control+Enter');
      await expect(page.locator('.editor .error-banner')).toContainText('trùng giờ');
      await expect(page.locator('.editor .title-input')).toHaveValue('Lịch QA');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await ctx.close();
  });
}


test('F4 edit context stays with A; switching B restores its draft', async ({ browser }) => {
  const { ctx, page } = await boot(browser);
  await page.goto(`${ORIGIN}/chat/qa-conv-1`); await expect(page.locator(EDITOR)).toBeVisible();
  await page.locator('.message-bubble.is-self').last().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Chỉnh sửa', exact: true }).click();
  await expect(page.locator('.reply-preview-bar.bar--edit')).toBeVisible();
  await page.locator(EDITOR).fill('Nội dung sửa riêng của A');
  await chat(page, 2);
  await expect(page.locator('.reply-preview-bar')).toHaveCount(0);
  await expect(page.locator(EDITOR)).toHaveText('');
  await page.locator(EDITOR).fill('Nháp B khi A đang sửa');
  await chat(page, 1);
  await expect(page.locator('.reply-preview-bar.bar--edit')).toBeVisible();
  await expect(page.locator(EDITOR)).toHaveText('Nội dung sửa riêng của A');
  await chat(page, 2);
  await expect(page.locator(EDITOR)).toHaveText('Nháp B khi A đang sửa');
  await ctx.close();
});

test('F4 mobile existing conversation RAM drafts stay isolated', async ({ browser }) => {
  const { ctx, page } = await boot(browser, true);
  await page.goto(`${ORIGIN}/chat/qa-conv-1`); await expect(page.locator(EDITOR)).toBeVisible();
  await page.locator(EDITOR).fill('Nháp mobile A');
  await chat(page, 2); await expect(page.locator(EDITOR)).toHaveText('');
  await page.locator(EDITOR).fill('Nháp mobile B');
  await chat(page, 1); await expect(page.locator(EDITOR)).toHaveText('Nháp mobile A');
  await chat(page, 2); await expect(page.locator(EDITOR)).toHaveText('Nháp mobile B');
  await ctx.close();
});
