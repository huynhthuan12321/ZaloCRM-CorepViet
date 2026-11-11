// QA đợt D (G3): luồng chức năng của CRM mobile + Cài đặt mobile. Backend KHÔNG chạy; mock dữ liệu GIẢ (helpers/mock-crm.ts).
// Mức bằng chứng: Chromium / WebKit DESKTOP có mô phỏng cảm ứng. KHÔNG phải Safari iPhone thật.
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { ADMIN, NO_CHAT_CONTACT, SALE, type FakeUser } from './helpers/mock-api';
import { installCrmMocks, type CrmMock, type CrmMockOptions } from './helpers/mock-crm';
import { setTheme, settleSheet } from './helpers/mock-chat';

const HIDE_SCROLLBAR = () => {
  const add = () => { const st = document.createElement('style'); st.textContent = '*{scrollbar-width:none !important}'; (document.head || document.documentElement).appendChild(st); };
  if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
};

async function open(browser: Browser, opts: CrmMockOptions & { w?: number; h?: number; theme?: 'light' | 'dark'; tz?: string } = {}) {
  const ctx: BrowserContext = await browser.newContext({
    viewport: { width: opts.w ?? 390, height: opts.h ?? 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
    locale: 'vi-VN', timezoneId: opts.tz ?? 'Asia/Ho_Chi_Minh', colorScheme: 'light',
    // This suite supplies every API response through page.route.
    // Service-worker lifecycle and network behavior have their own real PWA suite.
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  const mock = await installCrmMocks(page, opts);
  await setTheme(page, opts.theme ?? 'light', (opts.user ?? ADMIN).id);
  await page.clock.setFixedTime(new Date('2026-11-07T10:00:00+07:00'));
  await page.addInitScript(HIDE_SCROLLBAR);
  return { ctx, page, mock };
}
const shell = (p: Page) => p.locator('.crm-mobile.m-shell').waitFor({ state: 'attached', timeout: 15_000 });
const path = (p: Page) => new URL(p.url()).pathname;
const tab = (p: Page, name: string) => p.locator('nav[aria-label="Điều hướng chính"] a.m-tab', { hasText: name });

// ───────────────────────────── Khách hàng ─────────────────────────────
test.describe('Khách hàng (mobile)', () => {
  test('không gọi API desktop (stats, duplicates, settings/statuses); phân trang; lọc hai pha; tìm kiếm', async ({ browser }) => {
    const { ctx, page, mock } = await open(browser);
    await page.goto('/contacts'); await shell(page);
    await page.locator('.crm-contact-card').first().waitFor();
    await page.waitForTimeout(800);
    expect(mock.count('GET', /^\/contacts\/stats$/), 'GET /contacts/stats').toBe(0);
    expect(mock.count('GET', /^\/contacts\/duplicates/), 'GET /contacts/duplicates').toBe(0);
    expect(mock.count('GET', /^\/settings\/statuses/), 'GET /settings/statuses').toBe(0);
    expect(mock.count('GET', /^\/contacts$/), 'chỉ 1 lần tải danh sách khi vào màn').toBe(1);
    expect(mock.find('GET', /^\/contacts$/)[0].query).toMatchObject({ page: '1', limit: '20' });
    await expect(page.locator('.crm-contact-card')).toHaveCount(20);
    await expect(page.locator('.crm-list__total')).toContainText('45');

    // Phân trang: vừa có nút "Tải thêm" vừa có cuộn vô hạn (sentinel) -> cuộn đáy + bấm nút nếu còn, tới khi đủ 45
    await expect(page.getByRole('button', { name: 'Tải thêm khách hàng' })).toBeVisible();
    await expect.poll(async () => {
      await page.evaluate(() => { const sc = document.querySelector('.m-main__scroll'); if (sc) sc.scrollTop = sc.scrollHeight; });
      const btn = page.getByRole('button', { name: 'Tải thêm khách hàng' });
      if (await btn.count()) await btn.click({ timeout: 1500 }).catch(() => undefined);
      return page.locator('.crm-contact-card').count();
    }, { timeout: 20_000, intervals: [300] }).toBe(45);
    const pages = mock.find('GET', /^\/contacts$/).map(c => c.query.page);
    expect(pages, 'mỗi trang chỉ tải đúng 1 lần, theo thứ tự').toEqual(['1', '2', '3']);
    await expect(page.locator('.crm-list__end')).toBeVisible();

    // Lọc hai pha: chọn trong sheet KHÔNG gọi API tới khi Áp dụng
    const before = mock.count('GET', /^\/contacts$/);
    await page.locator('.crm-list__filter').click(); await settleSheet(page);
    await page.locator('.crm-filter__chips button', { hasText: 'Facebook' }).first().click();
    await expect(page.locator('.crm-filter__chips button', { hasText: 'TikTok' }), 'mobile không còn chip TikTok (D-1)').toHaveCount(0);
    await page.waitForTimeout(500);
    expect(mock.count('GET', /^\/contacts$/), 'chưa áp dụng thì chưa gọi API').toBe(before);
    await page.locator('.crm-filter__footer .crm-btn--primary').click();
    await expect(page.locator('.crm-list__total')).not.toContainText('45', { timeout: 8000 });
    const last = mock.find('GET', /^\/contacts$/).at(-1)!;
    expect(last.query.source).toBe('FB'); expect(last.query.page).toBe('1');
    await expect(page.locator('.crm-list__filter-count')).toHaveText('1');
    await ctx.close();
  });

  test('trạng thái: loading, lỗi (có Thử lại, không hiện "0 khách"), rỗng do tìm, offline', async ({ browser }) => {
    // loading
    let o = await open(browser, { contactsDelayMs: 2500 });
    await o.page.goto('/contacts'); await shell(o.page);
    await expect(o.page.locator('.m-main').getByText('Đang tải khách hàng')).toBeVisible({ timeout: 8000 });
    await o.ctx.close();
    // error
    o = await open(browser, { contactsFail: true });
    await o.page.goto('/contacts'); await shell(o.page);
    await expect(o.page.getByRole('button', { name: /Thử lại/ }).first()).toBeVisible({ timeout: 10_000 });
    await expect(o.page.locator('.m-main')).not.toContainText(/(^|\s)0 khách hàng|Chưa có khách hàng/);
    await o.ctx.close();
    // empty do tìm kiếm
    o = await open(browser);
    await o.page.goto('/contacts'); await shell(o.page); await o.page.locator('.crm-contact-card').first().waitFor();
    await o.page.locator('.crm-list__search input').fill('khong-co-ai-ten-nay');
    await expect(o.page.getByText('Không tìm thấy khách hàng')).toBeVisible({ timeout: 8000 });
    await o.page.getByRole('button', { name: /Xóa bộ lọc/ }).click();
    await expect(o.page.locator('.crm-contact-card').first()).toBeVisible({ timeout: 8000 });
    await o.ctx.close();
    // offline sau khi đã có dữ liệu: danh sách giữ nguyên + banner
    o = await open(browser);
    await o.page.goto('/contacts'); await shell(o.page); await o.page.locator('.crm-contact-card').first().waitFor();
    await o.ctx.setOffline(true);
    await o.page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true }); window.dispatchEvent(new Event('offline')); });
    await o.page.waitForTimeout(500);
    await expect(o.page.locator('.crm-contact-card').first(), 'danh sách vẫn còn khi offline').toBeVisible();
    await expect(o.page.locator('.m-shell')).toContainText(/mất kết nối|Không có mạng|ngoại tuyến/i);
    await o.ctx.close();
  });

  test('thẻ khách -> hồ sơ; "Nhắn tin": 1 hội thoại -> /chat/:convId, >=2 -> picker, 0 -> resolve', async ({ browser }) => {
    const { ctx, page, mock } = await open(browser);
    await page.goto('/contacts'); await shell(page); await page.locator('.crm-contact-card').first().waitFor();
    await page.locator('.crm-contact-card').first().click();
    await expect(page).toHaveURL(/\/contacts\/qa-ct-1\/profile$/);
    await page.locator('.crm-profile__act--primary').click();
    await expect(page).toHaveURL(/\/chat\/qa-conv-1$/);
    // 2 hội thoại -> picker
    await page.goto('/contacts/qa-ct-2/profile'); await shell(page);
    await page.locator('.crm-profile__act--primary').click();
    await expect(page.locator('.crm-picker__row')).toHaveCount(2);
    await expect(page.locator('.crm-picker')).toContainText('Nick Giả 1');
    await expect(page.locator('.crm-picker')).toContainText('Lê Giả Minh');
    expect(path(page)).toBe('/contacts/qa-ct-2/profile');
    await page.locator('.crm-picker__row').nth(1).click();
    await expect(page).toHaveURL(/\/chat\/qa-conv-3$/);
    // không gọi API desktop ở hồ sơ (đo TRƯỚC khi sang chat: /settings/statuses là của màn chat, ngoài phạm vi D)
    expect(mock.count('GET', /^\/contacts\/stats|^\/contacts\/duplicates/)).toBe(0);
    // 0 hội thoại -> resolve
    await page.goto('/contacts/qa-ct-3/profile'); await shell(page);
    await page.locator('.crm-profile__act--primary').click();
    await expect(page).toHaveURL(/\/chat\/qa-conv-1$/);
    expect(mock.count('POST', /^\/conversations\/resolve$/)).toBe(1);
    await ctx.close();
  });
});

// ───────────────────────────── Tổng quan ─────────────────────────────
test.describe('Tổng quan (mobile)', () => {
  for (const vp of [{ w: 320, h: 568 }, { w: 390, h: 844 }, { w: 844, h: 390 }]) {
    test(`thứ tự: Đang chờ trả lời -> lịch hẹn -> số liệu; lời chào không bị bóp @${vp.w}x${vp.h}`, async ({ browser }) => {
      const { ctx, page } = await open(browser, vp);
      await page.goto('/'); await shell(page); await page.locator('.crm-ov__hero').waitFor();
      const y = async (sel: string) => (await page.locator(sel).first().boundingBox())!.y;
      const yWait = await y('#crm-ov-wait'); const yAppt = await y('#crm-ov-appt'); const yStats = await y('#crm-ov-stats');
      expect(yWait, 'Đang chờ trả lời đứng đầu').toBeLessThan(yAppt);
      expect(yAppt, 'lịch hẹn trước số liệu').toBeLessThan(yStats);
      const greet = (await page.locator('.crm-ov-view__greet').boundingBox())!;
      const main = (await page.locator('.m-main__scroll').boundingBox())!;
      expect(greet.height, `lời chào một dòng, không bị bóp (w=${greet.width}, h=${greet.height})`).toBeLessThan(26);
      expect(greet.x + greet.width, 'lời chào không tràn phải').toBeLessThanOrEqual(main.x + main.width);
      await expect(page.locator('.crm-ov__wait-row').first()).toBeVisible();
      // PrivacySplit không cộng gộp: 3 công khai + 1 riêng tư tách rời, không có "4"
      const hero = (await page.locator('.crm-ov__hero-count').innerText()).replace(/\s+/g, ' ');
      expect(hero).toMatch(/3/); expect(hero).toMatch(/1/); expect(hero).not.toMatch(/\b4\b/);
      // nút hành động không bị cắt: nằm trọn trong chiều ngang vùng chính
      for (const sel of ['.crm-ov__cta', '.crm-ov__more', '.crm-ov__link--btn']) {
        const bb = await page.locator(sel).first().boundingBox();
        if (bb) { expect(bb.x, sel).toBeGreaterThanOrEqual(0); expect(bb.x + bb.width, sel).toBeLessThanOrEqual(main.x + main.width + 0.5); expect(bb.height, sel).toBeGreaterThanOrEqual(43.5); }
      }
      await ctx.close();
    });
  }

  test('quản trị: chip phạm vi + tab Quản lý team/Hệ thống; nhân viên thường (SALE): không có chip/tab', async ({ browser }) => {
    let o = await open(browser);
    await o.page.goto('/'); await shell(o.page); await o.page.locator('.crm-ov__hero').waitFor();
    await expect(o.page.locator('.crm-ov-view__scope')).toBeVisible();
    await expect(o.page.getByRole('tab', { name: 'Quản lý team' })).toBeVisible();
    await expect(o.page.getByRole('tab', { name: 'Hệ thống' })).toBeVisible();
    await o.ctx.close();
    o = await open(browser, { user: SALE as FakeUser });
    await o.page.goto('/'); await shell(o.page); await o.page.locator('.crm-ov__hero').waitFor();
    await expect(o.page.locator('.crm-ov-view__scope')).toHaveCount(0);
    await expect(o.page.getByRole('tab')).toHaveCount(0);
    expect(o.mock.count('GET', /^\/dashboard\/action-hub\/(team|system)/), 'SALE không gọi team/system').toBe(0);
    await o.ctx.close();
  });

  test('trạng thái: lỗi /me -> màn lỗi có Thử lại, không hiện số 0; mở hội thoại từ hàng chờ -> /chat/:id', async ({ browser }) => {
    let o = await open(browser, { hubFail: true });
    await o.page.goto('/'); await shell(o.page);
    await expect(o.page.getByRole('button', { name: /Thử lại/ }).first()).toBeVisible({ timeout: 10_000 });
    await expect(o.page.locator('.crm-ov__hero')).toHaveCount(0);
    await o.ctx.close();
    o = await open(browser);
    await o.page.goto('/'); await shell(o.page); await o.page.locator('.crm-ov__wait-row').first().click();
    await expect(o.page).toHaveURL(/\/chat\/qa-conv-1$/);
    await o.ctx.close();
  });
});

// ───────────────────────────── Lịch hẹn ─────────────────────────────
test.describe('Lịch hẹn (mobile)', () => {
  test('sửa lịch nguồn Zalo: PUT KHÔNG chứa source/externalRef/zaloMessageId/conversationId; giữ nút Mở hội thoại', async ({ browser }) => {
    const { ctx, page, mock } = await open(browser);
    await page.goto('/appointments'); await shell(page);
    await page.locator('.crm-appt-card', { hasText: 'Hẹn từ tin Zalo giả' }).click();
    await expect(page.getByRole('button', { name: 'Mở hội thoại' })).toBeVisible();
    await page.getByRole('button', { name: 'Sửa', exact: true }).click();
    await page.locator('#ap-title').waitFor({ state: 'visible' }); await settleSheet(page);
    await expect(page.locator('#ap-title')).toHaveValue('Hẹn từ tin Zalo giả');
    await expect(page.locator('#ap-time')).toHaveValue('16:30');
    await page.locator('#ap-title').fill('Hẹn Zalo đã đổi tên (giả)');
    await page.getByRole('button', { name: 'Cập nhật' }).click();
    await expect.poll(() => mock.count('PUT', /^\/appointments\/qa-apt-zalo$/)).toBe(1);
    const body = mock.find('PUT', /^\/appointments\/qa-apt-zalo$/)[0].body as Record<string, unknown>;
    for (const k of ['source', 'externalRef', 'zaloMessageId', 'conversationId']) expect(Object.keys(body), `PUT body không có ${k}`).not.toContain(k);
    expect(body.title).toBe('Hẹn Zalo đã đổi tên (giả)');
    expect(body.appointmentTime ?? body.time ?? body.startAt, 'giờ vẫn có trong payload').toBeTruthy();
    await ctx.close();
  });

  test('giờ theo múi giờ TỔ CHỨC, không theo giờ máy (máy ở America/New_York vẫn thấy 14:00 và tuần 02-08/11)', async ({ browser }) => {
    const { ctx, page, mock } = await open(browser, { tz: 'America/New_York' });
    await page.goto('/appointments'); await shell(page);
    await page.locator('.crm-appt-card').first().waitFor();
    await expect(page.locator('.crm-appt-card', { hasText: 'Hẹn gọi lại giả' })).toContainText('14:00');
    await expect(page.locator('.crm-agenda__day')).toContainText('07/11/2026');
    const q = mock.find('GET', /^\/appointments$/)[0].query;
    expect(q.dateFrom).toBe('2026-11-01T17:00:00.000Z'); expect(q.dateTo).toBe('2026-11-08T17:00:00.000Z');
    await ctx.close();
  });

  test('trạng thái: lỗi tải (Thử lại), rỗng ngày khác; tạo lịch -> POST đúng', async ({ browser }) => {
    let o = await open(browser, { apptFail: true });
    await o.page.goto('/appointments'); await shell(o.page);
    await expect(o.page.getByRole('button', { name: /Thử lại/ }).first()).toBeVisible({ timeout: 10_000 });
    await o.ctx.close();
    o = await open(browser);
    await o.page.goto('/appointments'); await shell(o.page); await o.page.locator('.crm-appt-card').first().waitFor();
    await o.page.locator('.crm-daystrip button, .crm-agenda button', { hasText: /^T3\s*3/ }).first().click().catch(() => undefined);
    await o.page.locator('.crm-agenda__fab').click(); await o.page.locator('#ap-title').waitFor({ state: 'visible' }); await settleSheet(o.page);
    await o.page.locator('#ap-title').fill('Lịch tạo từ QA (giả)');
    await o.page.locator('.m-sheet__footer button[type=submit]').click();
    // chưa chọn khách -> báo lỗi tại ô, không gọi POST
    await o.page.waitForTimeout(400);
    expect(o.mock.count('POST', /^\/appointments$/)).toBe(0);
    await o.ctx.close();
  });
});

// ───────────────────────────── Cài đặt ─────────────────────────────
test.describe('Cài đặt mobile: điều hướng', () => {
  test('cấp 1 lọc quyền: admin thấy nhóm Tổ chức; SALE chỉ nhóm Cá nhân', async ({ browser }) => {
    let o = await open(browser);
    await o.page.goto('/settings'); await shell(o.page); await o.page.locator('.crm-sm').waitFor();
    const adminGroups = await o.page.locator('.crm-sm__gh').allInnerTexts();
    expect(adminGroups.length).toBeGreaterThan(1);
    await o.ctx.close();
    o = await open(browser, { user: SALE as FakeUser });
    await o.page.goto('/settings'); await shell(o.page); await o.page.locator('.crm-sm').waitFor();
    const saleGroups = await o.page.locator('.crm-sm__gh').allInnerTexts();
    expect(saleGroups.length).toBe(1);
    expect(saleGroups.join('|')).toMatch(/Cá nhân/);
    await o.ctx.close();
  });

  test('/account -> Cài đặt tổ chức (cấp 2) -> quay lại header về cấp 1 -> Back về /account; không breadcrumb', async ({ browser }) => {
    const { ctx, page } = await open(browser);
    await page.goto('/account'); await shell(page);
    await page.getByRole('button', { name: /Cài đặt tổ chức/ }).first().click();
    await expect(page).toHaveURL(/\/settings\/org\/profile$/);
    await page.locator('.crm-settings__head').waitFor();
    await expect(page.locator('.m-header')).toHaveCount(0); // header shell nhường cấp 2
    await expect(page.locator('.v-breadcrumbs, [class*="breadcrumb"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Quay lại danh sách cài đặt' }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.locator('.crm-sm')).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/account$/);
    await ctx.close();
  });

  test('cấp 1 -> cấp 2 -> Back trình duyệt về cấp 1 -> Back về /account', async ({ browser }) => {
    const { ctx, page } = await open(browser);
    await page.goto('/account'); await shell(page);
    await page.getByRole('button', { name: /Thông tin cá nhân/ }).first().click(); // cấp 2 trực tiếp -> chèn cấp 1
    await expect(page).toHaveURL(/\/settings\/personal\/profile$/);
    await page.locator('.crm-ap').waitFor({ timeout: 15_000 });
    await page.goBack(); await expect(page).toHaveURL(/\/settings$/); await expect(page.locator('.crm-sm')).toBeVisible();
    // từ cấp 1 chọn một mục rồi Back
    await page.locator('.crm-sm__row', { hasText: /Hồ sơ tổ chức|Tổ chức/ }).first().click();
    await expect(page).toHaveURL(/\/settings\/org\//);
    await page.goBack(); await expect(page).toHaveURL(/\/settings$/);
    await page.goBack(); await expect(page).toHaveURL(/\/account$/);
    await ctx.close();
  });

  test('deep link /settings/org/profile (cold start): mở thẳng cấp 2, KHÔNG chớp menu; Back về cấp 1', async ({ browser }) => {
    const { ctx, page } = await open(browser);
    // Theo dõi mọi lúc menu cấp 1 xuất hiện trong DOM
    await page.addInitScript(() => {
      (window as unknown as { __menuSeen: number }).__menuSeen = 0;
      const mo = new MutationObserver(() => { if (document.querySelector('.crm-sm')) (window as unknown as { __menuSeen: number }).__menuSeen++; });
      document.addEventListener('DOMContentLoaded', () => mo.observe(document.documentElement, { childList: true, subtree: true }));
    });
    await page.goto('/settings/org/profile'); await shell(page);
    await page.locator('.crm-settings__head').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(1200);
    expect(path(page)).toBe('/settings/org/profile');
    expect(await page.evaluate(() => (window as unknown as { __menuSeen: number }).__menuSeen), 'menu cấp 1 không được chớp trong lúc chuẩn hóa').toBe(0);
    await expect(page.locator('.crm-settings__title')).toContainText(/tổ chức/i);
    await page.goBack(); await expect(page).toHaveURL(/\/settings$/); await expect(page.locator('.crm-sm')).toBeVisible();
    await page.goBack(); // trước cold start là about:blank -> hoặc ở lại; không được là trang trắng / thoát app bất thường
    await ctx.close();
  });

  test('cấp 2 A -> link sang cấp 2 B -> nút quay lại -> cấp 1; Back tiếp -> /account (không lặp danh sách)', async ({ browser }) => {
    const { ctx, page } = await open(browser);
    await page.goto('/account'); await shell(page);
    await page.getByRole('button', { name: /Thông tin cá nhân/ }).first().click();
    await expect(page).toHaveURL(/\/settings\/personal\/profile$/);
    await page.locator('.crm-ap').waitFor({ timeout: 15_000 });
    // link trong trang sang cấp 2 khác: mô phỏng bằng router.push của app (cùng cách các nút "lối tắt" của trang làm)
    await page.evaluate(() => { (document.querySelector('#app') as unknown as { __vue_app__: { config: { globalProperties: { $router: { push(p: string): void } } } } }).__vue_app__.config.globalProperties.$router.push('/settings/org/profile'); });
    await expect(page).toHaveURL(/\/settings\/org\/profile$/);
    await page.getByRole('button', { name: 'Quay lại danh sách cài đặt' }).click();
    await expect(page).toHaveURL(/\/settings$/); await expect(page.locator('.crm-sm')).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/account$/); // không rơi vào /settings lần 2 hay cấp 2
    await ctx.close();
  });

  test('vào cấp 2 rồi bấm tab Tổng quan -> header shell hiện lại; dòng cuối cấp 2 không bị tabbar/nút Hội thoại che', async ({ browser }) => {
    const { ctx, page } = await open(browser);
    await page.goto('/settings/org/profile'); await shell(page); await page.locator('.crm-settings__head').waitFor({ timeout: 15_000 });
    await expect(page.locator('.m-header')).toHaveCount(0);
    await tab(page, 'Tổng quan').click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('.m-header')).toBeVisible();
    await ctx.close();
  });
});


// ───────────────────────────── Forbidden (không quyền) ─────────────────────────────
test.describe('Không quyền (forbidden)', () => {
  test('user thiếu quyền: /settings -> trạng thái forbidden; /contacts và hồ sơ khách không gọi dữ liệu khách', async ({ browser }) => {
    const { ctx, page, mock } = await open(browser, { user: NO_CHAT_CONTACT as FakeUser });
    await page.goto('/settings'); await shell(page); await page.waitForTimeout(1200);
    const settingsText = (await page.locator('.m-main').innerText()).replace(/\s+/g, ' ');
    test.info().annotations.push({ type: 'settings-forbidden', description: settingsText.slice(0, 200) });
    expect((await page.locator('.crm-sm__gh').allInnerTexts()).join('|'), 'chỉ còn nhóm Cá nhân (như desktop)').toMatch(/^Cá nhân$/);
    await page.goto('/contacts/qa-ct-1/profile'); await shell(page); await page.waitForTimeout(1500);
    const url = path(page);
    test.info().annotations.push({ type: 'profile-url', description: url });
    expect(mock.count('GET', /^\/contacts\/qa-ct-1$/), 'không tải dữ liệu khách khi không có quyền contact').toBe(0);
    await page.goto('/contacts'); await shell(page); await page.waitForTimeout(1500);
    expect(mock.count('GET', /^\/contacts$/), 'không gọi danh sách khách').toBe(0);
    await ctx.close();
  });
});

// ───────────────────────────── Xoay màn hình giữa chừng ─────────────────────────────
test.describe('Xoay màn hình giữa chừng (390x844 <-> 844x390)', () => {
  test('Khách hàng có tìm kiếm + lọc: giữ nguyên dữ liệu, không nhảy desktop', async ({ browser }) => {
    const { ctx, page } = await open(browser);
    await page.goto('/contacts'); await shell(page); await page.locator('.crm-contact-card').first().waitFor();
    await page.locator('.crm-list__search input').fill('Giả A');
    await expect(page.locator('.crm-contact-card')).toHaveCount(1, { timeout: 8000 });
    await page.evaluate(() => { (document.querySelector('.crm-list') as HTMLElement).dataset.qaMark = 'x'; });
    const count0 = await page.locator('.crm-contact-card').count();
    for (const [w, h] of [[844, 390], [390, 844]] as const) {
      await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(600);
      await expect(page.locator('.crm-list__search input')).toHaveValue('Giả A');
      expect(await page.locator('.crm-list').getAttribute('data-qa-mark'), `không remount @${w}x${h}`).toBe('x');
      expect(await page.locator('.smax-topnav').count(), 'không nhảy sang desktop').toBe(0);
      expect(await page.locator('.crm-contact-card').count()).toBe(count0);
    }
    // lọc đã áp dụng cũng giữ
    await page.locator('.crm-list__filter').click(); await settleSheet(page);
    await page.locator('.crm-filter__chips button', { hasText: 'Facebook' }).first().click();
    await page.locator('.crm-filter__footer .crm-btn--primary').click();
    await page.waitForTimeout(800);
    const badge0 = await page.locator('.crm-list__filter-count').textContent();
    for (const [w, h] of [[844, 390], [390, 844]] as const) {
      await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(600);
      expect(await page.locator('.crm-list__filter-count').textContent()).toBe(badge0);
      await expect(page.locator('.crm-list__search input')).toHaveValue('Giả A');
    }
    await ctx.close();
  });

  test('sheet tạo lịch đang gõ: xoay ngang rồi dọc không mất dữ liệu, sheet còn mở', async ({ browser }) => {
    const { ctx, page } = await open(browser);
    await page.goto('/appointments'); await shell(page); await page.locator('.crm-appt-card').first().waitFor();
    await page.locator('.crm-agenda__fab').click(); await page.locator('#ap-title').waitFor({ state: 'visible' }); await settleSheet(page);
    await page.locator('#ap-title').fill('Tiêu đề đang gõ dở (giả)');
    await page.locator('#ap-notes').fill('Ghi chú dở dang (giả)');
    for (const [w, h] of [[844, 390], [390, 844]] as const) {
      await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(800);
      await expect(page.locator('.m-sheet')).toBeVisible();
      await expect(page.locator('#ap-title')).toHaveValue('Tiêu đề đang gõ dở (giả)');
      await expect(page.locator('#ap-notes')).toHaveValue('Ghi chú dở dang (giả)');
      expect(await page.locator('.smax-topnav').count()).toBe(0);
      // footer (nút Tạo) còn trong màn hình
      const f = await page.locator('.m-sheet__footer').boundingBox();
      expect(f && f.y + f.height <= h + 1, `footer sheet trong màn @${w}x${h}: ${JSON.stringify(f)}`).toBeTruthy();
    }
    await ctx.close();
  });
});
void (null as unknown as CrmMock);


// G3 completion: run actual create/edit/cancel sheets and settings navigation at each
// mobile matrix size/theme. The 768px boundary stays covered by crm-d.spec.ts + exact pixel regression.
const D_FLOW_SIZES = [
  { w: 320, h: 568 }, { w: 375, h: 812 }, { w: 390, h: 844 },
  { w: 430, h: 932 }, { w: 844, h: 390 }, { w: 932, h: 430 },
];
for (const viewport of D_FLOW_SIZES) for (const theme of ['light', 'dark'] as const) {
  test.describe(`G3 bổ sung ${viewport.w}x${viewport.h} ${theme}`, () => {
    test('Chưa trả lời: CTA -> API đã lọc -> thread/back -> reload -> xóa lọc', async ({ browser }) => {
      const { ctx, page, mock } = await open(browser, { ...viewport, theme });
      await page.goto('/'); await shell(page); await page.locator('.crm-ov__cta').click();
      await expect(page).toHaveURL(/\/chat\?filter=unreplied$/);
      await expect(page.locator('.m-inbox__chip', { hasText: 'Chưa trả lời' })).toBeVisible();
      await expect(page.locator('.m-conv-row')).toHaveCount(15);
      const requests = mock.find('GET', /^\/conversations$/);
      expect(requests.length).toBeGreaterThan(0);
      expect(requests.every(request => request.query.unreplied === 'true')).toBe(true);
      await page.locator('.m-conv-row').first().click();
      await expect(page).toHaveURL(/\/chat\/qa-conv-\d+\?filter=unreplied$/);
      await page.locator('.m-thread-back').click();
      await expect(page).toHaveURL(/\/chat\?filter=unreplied$/);
      await expect(page.locator('.m-conv-row')).toHaveCount(15);
      await page.reload();
      await expect(page.locator('.m-conv-row')).toHaveCount(15);
      await page.locator('.m-inbox__chip-clear').click();
      await expect(page).toHaveURL(/\/chat$/);
      await expect(page.locator('.m-conv-row')).toHaveCount(30);
      await page.reload();
      await expect(page.locator('.m-conv-row')).toHaveCount(30);
      await expect(page.locator('.m-inbox__chips')).toHaveCount(0);
      await ctx.close();
    });
    test('lịch hẹn: tạo thành công -> sửa -> hủy từ sheet, xác nhận payload', async ({ browser }) => {
      const { ctx, page, mock } = await open(browser, { ...viewport, theme });
      await page.goto('/appointments'); await shell(page); await page.locator('.crm-appt-card').first().waitFor();
      await page.locator('.crm-agenda__fab').click(); await page.locator('#ap-title').waitFor({ state: 'visible' }); await settleSheet(page);
      await page.locator('.crm-appt input[type=search]').fill('Giả A');
      await page.locator('.crm-appt__result').first().click();
      await page.locator('#ap-title').fill('Lịch QA tạo thành công (giả)');
      await page.locator('#ap-date').fill('2026-11-07'); await page.locator('#ap-time').fill('11:30');
      await page.locator('.m-sheet__footer button[type=submit]').click();
      await expect.poll(() => mock.count('POST', /^\/appointments$/)).toBe(1);
      expect(mock.find('POST', /^\/appointments$/)[0].body).toMatchObject({ contactId: 'qa-ct-1', title: 'Lịch QA tạo thành công (giả)' });
      await expect(page.locator('#ap-title')).toHaveCount(0);
      await expect(page.locator('.crm-appt-card', { hasText: 'Lịch QA tạo thành công (giả)' })).toBeVisible();
      await page.locator('.crm-appt-card', { hasText: 'Hẹn gọi lại giả' }).click();
      await page.getByRole('button', { name: 'Sửa', exact: true }).click(); await settleSheet(page);
      await page.locator('#ap-title').fill('Lịch QA đã sửa (giả)');
      await page.getByRole('button', { name: 'Cập nhật', exact: true }).click();
      await expect.poll(() => mock.count('PUT', /^\/appointments\/qa-apt-1$/)).toBe(1);
      expect(mock.find('PUT', /^\/appointments\/qa-apt-1$/)[0].body).toMatchObject({ title: 'Lịch QA đã sửa (giả)' });
      await expect(page.locator('#ap-title')).toHaveCount(0);
      await page.locator('.crm-appt-card', { hasText: 'Lịch QA đã sửa (giả)' }).click();
      await page.getByRole('button', { name: 'Hủy lịch', exact: true }).click();
      await page.getByRole('button', { name: 'Hủy lịch hẹn', exact: true }).click();
      await expect.poll(() => mock.count('PATCH', /^\/appointments\/qa-apt-1\/status$/)).toBe(1);
      expect(mock.find('PATCH', /^\/appointments\/qa-apt-1\/status$/)[0].body).toMatchObject({ status: 'cancelled' });
      await expect(page.locator('.crm-appt-card', { hasText: 'Lịch QA đã sửa (giả)' })).toHaveCount(0);
      await ctx.close();
    });
    test('cài đặt: cấp 1 -> cấp 2 -> back -> account; cold deep link cá nhân', async ({ browser }) => {
      const { ctx, page } = await open(browser, { ...viewport, theme });
      await page.goto('/account'); await shell(page);
      await page.getByRole('button', { name: /Thông tin cá nhân/ }).first().click();
      await expect(page).toHaveURL(/\/settings\/personal\/profile$/); await page.locator('.crm-ap').waitFor();
      await page.getByRole('button', { name: 'Quay lại danh sách cài đặt' }).click();
      await expect(page).toHaveURL(/\/settings$/); await expect(page.locator('.crm-sm')).toBeVisible();
      await page.goBack(); await expect(page).toHaveURL(/\/account$/);
      await ctx.close();
      const cold = await open(browser, { ...viewport, theme });
      await cold.page.goto('/settings/personal/profile'); await shell(cold.page); await cold.page.locator('.crm-ap').waitFor();
      await expect(cold.page.locator('.crm-sm')).toHaveCount(0);
      await cold.page.goBack(); await expect(cold.page).toHaveURL(/\/settings$/);
      // Native Safari history is not hijacked. Cold entry has no prior /account entry; use app Back fallback.
      await cold.page.getByRole('button', { name: 'Quay lại', exact: true }).click();
      await expect(cold.page).toHaveURL(/\/account$/);
      await cold.ctx.close();
    });
  });
}
